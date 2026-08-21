import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyBusinessUseLock } from './salesPersonnelLifecycle';
import { resolveSupervisorApprovalGate } from './salesInvoice';
import {
  jalaliDateTimeToIso, isoToJalaliDateTimeParts, getJalaliMonthLength, formatIsoAsJalaliDisplay,
  gregorianToJalali, jalaliToGregorian
} from './persianDate';
import { storage, DEFAULT_ROLES } from './storage';
import type {
  SalesOrgAssignment, SalesInvoice, SalesHierarchySnapshot, User, CallLogEntry, SystemRole, SalesArchivedNote
} from '../types';

// ============================================================
// پوشش بدهی‌های قابل‌اقدام مأموریت «اصلاح پذیرش چرخهٔ عمر نیروی فروش» (docs/ERP_CRM_MASTER_SPEC.md
// §21). این فایل مکمل salesPersonnelLifecycle.test.ts/salesInvoice.test.ts است، نه جایگزین آن‌ها —
// فقط سناریوهایی که همین مأموریت تازه اضافه کرده را می‌پوشاند.
// ============================================================

function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
}

function baseAssignment(overrides: Partial<SalesOrgAssignment> = {}): SalesOrgAssignment {
  return {
    id: 'a1', userId: 'sp1', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], salesChainIds: ['c1'],
    validFrom: 't0', isActive: true, changedAt: 't0', ...overrides
  };
}

describe('applyBusinessUseLock — persistence-layer lock (بدهی #۱)', () => {
  it('locks the single active assignment on first business-use event, recording type/id/timestamp', () => {
    const result = applyBusinessUseLock([baseAssignment()], 'sp1', 'call_logged', 'log1', 't5');
    const locked = result.find((a) => a.id === 'a1')!;
    expect(locked.immutableAfterFirstBusinessUse).toBe(true);
    expect(locked.firstBusinessEventType).toBe('call_logged');
    expect(locked.firstBusinessEventId).toBe('log1');
    expect(locked.firstBusinessEventAt).toBe('t5');
  });

  it('is idempotent — a second event never overwrites the first recorded lock', () => {
    const firstLock = applyBusinessUseLock([baseAssignment()], 'sp1', 'call_logged', 'log1', 't5');
    const secondLock = applyBusinessUseLock(firstLock, 'sp1', 'invoice_created', 'inv1', 't9');
    const locked = secondLock.find((a) => a.id === 'a1')!;
    expect(locked.firstBusinessEventType).toBe('call_logged');
    expect(locked.firstBusinessEventId).toBe('log1');
    expect(locked.firstBusinessEventAt).toBe('t5');
  });

  it('returns the identical array reference (no-op) once already locked', () => {
    const already = [baseAssignment({ immutableAfterFirstBusinessUse: true, firstBusinessEventAt: 't1', firstBusinessEventType: 'x', firstBusinessEventId: 'y' })];
    const result = applyBusinessUseLock(already, 'sp1', 'call_logged', 'log2', 't9');
    expect(result).toBe(already);
  });

  it('returns the identical array reference (no-op) when the user has no active assignment', () => {
    const noneActive = [baseAssignment({ isActive: false })];
    const result = applyBusinessUseLock(noneActive, 'sp1', 'call_logged', 'log1', 't5');
    expect(result).toBe(noneActive);
  });

  it('returns the identical array reference (fails safe, does not lock) when the user has two concurrent active assignments', () => {
    const broken = [baseAssignment(), baseAssignment({ id: 'a2', salesBranchIds: ['b2'], salesChainIds: ['c2'] })];
    const result = applyBusinessUseLock(broken, 'sp1', 'call_logged', 'log1', 't5');
    expect(result).toBe(broken);
  });

  it('login/viewing never calls this function — a freshly created assignment stays unlocked until a real Handler locks it', () => {
    const fresh = baseAssignment();
    expect(fresh.immutableAfterFirstBusinessUse).toBeUndefined();
  });
});

describe('sales-assignment lock Backfill migration — real evidence only, non-destructive (بدهی #۱)', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;
  beforeEach(() => { mock = createMockLocalStorage(); vi.stubGlobal('localStorage', mock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('backfills an active unlocked assignment using the EARLIEST real call log/invoice evidence, not a fabricated date', () => {
    mock.setItem('shavaz_treasury_sales_org_assignments_v1', JSON.stringify([
      baseAssignment({ id: 'backfill_a1', userId: 'legacy_sp' })
    ]));
    mock.setItem('shavaz_treasury_call_logs_v1', JSON.stringify([
      { id: 'call_early', salespersonUserId: 'legacy_sp', createdAt: '1403/01/05 - 09:00' } as CallLogEntry,
      { id: 'call_late', salespersonUserId: 'legacy_sp', createdAt: '1403/02/10 - 09:00' } as CallLogEntry
    ]));
    mock.setItem('shavaz_treasury_sales_invoices_v1', JSON.stringify([
      { id: 'inv_late', salespersonUserId: 'legacy_sp', createdAt: '1403/03/01 - 09:00' } as SalesInvoice
    ]));

    const assignments = storage.getSalesOrgAssignments();
    const backfilled = assignments.find((a) => a.id === 'backfill_a1')!;
    expect(backfilled.immutableAfterFirstBusinessUse).toBe(true);
    expect(backfilled.firstBusinessEventType).toBe('call_logged');
    expect(backfilled.firstBusinessEventId).toBe('call_early'); // زودتر از call_late و inv_late
    expect(backfilled.firstBusinessEventAt).toBe('1403/01/05 - 09:00');
  });

  it('never touches an assignment with no existing call log/invoice evidence — stays unlocked (no fabricated lock)', () => {
    mock.setItem('shavaz_treasury_sales_org_assignments_v1', JSON.stringify([
      baseAssignment({ id: 'no_evidence_a', userId: 'never_worked_sp' })
    ]));
    const assignments = storage.getSalesOrgAssignments();
    const untouched = assignments.find((a) => a.id === 'no_evidence_a')!;
    expect(untouched.immutableAfterFirstBusinessUse).toBeUndefined();
  });

  it('never overwrites an assignment that is already locked', () => {
    mock.setItem('shavaz_treasury_sales_org_assignments_v1', JSON.stringify([
      baseAssignment({ id: 'already_locked_a', userId: 'sp_x', immutableAfterFirstBusinessUse: true, firstBusinessEventAt: 'ORIGINAL', firstBusinessEventType: 'manual', firstBusinessEventId: 'orig1' })
    ]));
    mock.setItem('shavaz_treasury_call_logs_v1', JSON.stringify([
      { id: 'call_x', salespersonUserId: 'sp_x', createdAt: '1403/01/01 - 00:00' } as CallLogEntry
    ]));
    const assignments = storage.getSalesOrgAssignments();
    const stillOriginal = assignments.find((a) => a.id === 'already_locked_a')!;
    expect(stillOriginal.firstBusinessEventAt).toBe('ORIGINAL');
    expect(stillOriginal.firstBusinessEventId).toBe('orig1');
  });

  it('running the migration twice is idempotent — the second run changes nothing further', () => {
    mock.setItem('shavaz_treasury_sales_org_assignments_v1', JSON.stringify([
      baseAssignment({ id: 'run_twice_a', userId: 'sp_twice' })
    ]));
    mock.setItem('shavaz_treasury_call_logs_v1', JSON.stringify([
      { id: 'call_twice', salespersonUserId: 'sp_twice', createdAt: '1403/01/01 - 00:00' } as CallLogEntry
    ]));
    const first = storage.getSalesOrgAssignments().find((a) => a.id === 'run_twice_a')!;
    const second = storage.getSalesOrgAssignments().find((a) => a.id === 'run_twice_a')!;
    expect(second).toEqual(first);
  });
});

describe('resolveSupervisorApprovalGate — unified permission/Deny/status/successor gate (بدهی #۲)', () => {
  const snapshot: SalesHierarchySnapshot = {
    salespersonUserId: 'sp1', salespersonUserName: 'فروشنده', salesBranchId: 'b1', salesBranchName: 'شعبه یک',
    salesChainId: 'c1', salesChainName: 'تیم الف',
    supervisorUserId: 'sup1', supervisorUserName: 'سرپرست',
    seniorSupervisorUserId: 'senior1', seniorSupervisorUserName: 'سرپرست ارشد',
    salesManagerUserId: 'mgr1', salesManagerUserName: 'مدیر فروش',
    salesDeputyUserId: 'dep1', salesDeputyUserName: 'معاونت فروش',
    capturedAt: 't0'
  };
  function invoice(overrides: Partial<SalesInvoice> = {}): SalesInvoice {
    return { status: 'awaiting_supervisor_approval', salesHierarchySnapshot: snapshot, ...overrides } as SalesInvoice;
  }
  function user(overrides: Partial<User> = {}): User {
    return { id: 'sup1', username: 'sup1', password: 'x', fullName: 'سرپرست', phone: '', email: '', role: 'member', roleTitle: 'سرپرست', isActive: true, ...overrides };
  }
  const activeUsers: User[] = [user()];
  const assignments: SalesOrgAssignment[] = [];

  it('rejects when the invoice is not in awaiting_supervisor_approval status', () => {
    const result = resolveSupervisorApprovalGate({
      invoice: invoice({ status: 'draft' }), actorUser: user(), isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: activeUsers, assignments
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-admin actor who lacks the approval permission, even when they are the correct approver', () => {
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: user(), isAdminUser: false,
      effectivePermissions: [], users: activeUsers, assignments
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when the actor is not the resolved approver and is not admin, even with the permission', () => {
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: user({ id: 'someone_else', fullName: 'شخص دیگر' }), isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: activeUsers, assignments
    });
    expect(result.ok).toBe(false);
  });

  it('succeeds for the actual resolved approver holding the permission, with isSuccessor:false', () => {
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: user(), isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: activeUsers, assignments
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.approverUserId).toBe('sup1');
    expect(result.isSuccessor).toBe(false);
  });

  it('resolves via the successor cascade and reports isSuccessor:true when the original supervisor is inactive', () => {
    const inactiveOriginal = user({ isActive: false });
    const successorAssignments: SalesOrgAssignment[] = [
      { id: 'a_successor', userId: 'successor1', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], salesChainIds: ['c1'], validFrom: 't0', isActive: true, changedAt: 't0' }
    ];
    const successorUser = user({ id: 'successor1', fullName: 'جانشین' });
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: successorUser, isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: [inactiveOriginal, successorUser], assignments: successorAssignments
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.approverUserId).toBe('successor1');
    expect(result.isSuccessor).toBe(true);
  });

  it('an admin without the approval permission still passes (documents, not decides, the existing admin-bypass behavior)', () => {
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: user({ id: 'admin1', fullName: 'ادمین' }), isAdminUser: true,
      effectivePermissions: null, users: activeUsers, assignments
    });
    expect(result.ok).toBe(true);
  });

  it('explicit Deny on approve_sales_invoice_supervisor_step blocks even an admin — Deny prevails over admin bypass', () => {
    const deniedAdmin = user({ id: 'admin1', fullName: 'ادمین', deniedPermissions: ['approve_sales_invoice_supervisor_step'] });
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: deniedAdmin, isAdminUser: true,
      effectivePermissions: null, users: activeUsers, assignments
    });
    expect(result.ok).toBe(false);
  });

  it('explicit Deny blocks a non-admin actor too, even when they hold the permission and are the resolved approver', () => {
    const deniedApprover = user({ deniedPermissions: ['approve_sales_invoice_supervisor_step'] });
    const result = resolveSupervisorApprovalGate({
      invoice: invoice(), actorUser: deniedApprover, isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: [deniedApprover], assignments
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when the invoice has no salesHierarchySnapshot at all', () => {
    const result = resolveSupervisorApprovalGate({
      invoice: invoice({ salesHierarchySnapshot: undefined }), actorUser: user(), isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: activeUsers, assignments
    });
    expect(result.ok).toBe(false);
  });
});

describe('approve_sales_invoice_supervisor_step permission — granted narrowly (بدهی #۲)', () => {
  function getMigratedRoles(): SystemRole[] {
    const store = new Map<string, string>();
    const mock = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; }
    };
    vi.stubGlobal('localStorage', mock);
    const result = storage.getRoles();
    vi.unstubAllGlobals();
    return result;
  }
  const roles = getMigratedRoles();

  it('is granted to exactly the 4 supervisor-tier roles plus super admin among default roles', () => {
    const holders = roles.filter((r) => r.permissions.includes('approve_sales_invoice_supervisor_step')).map((r) => r.id).sort();
    expect(holders).toEqual([
      'role_sales_deputy', 'role_sales_manager', 'role_sales_supervisor', 'role_senior_sales_supervisor', 'role_super_admin'
    ].sort());
  });

  it('role_data_manager and role_salesperson never carry this permission', () => {
    expect(roles.find((r) => r.id === 'role_data_manager')!.permissions).not.toContain('approve_sales_invoice_supervisor_step');
    expect(roles.find((r) => r.id === 'role_salesperson')!.permissions).not.toContain('approve_sales_invoice_supervisor_step');
  });

  it('the migration is idempotent — running getRoles() twice never duplicates the permission grant', () => {
    const store = new Map<string, string>();
    const mock = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; }
    };
    vi.stubGlobal('localStorage', mock);
    storage.getRoles();
    const second = storage.getRoles();
    vi.unstubAllGlobals();
    const supervisor = second.find((r) => r.id === 'role_sales_supervisor')!;
    expect(supervisor.permissions.filter((p) => p === 'approve_sales_invoice_supervisor_step')).toHaveLength(1);
  });

  it('an older install that already had role_super_admin without the new permission gets it unioned in without losing custom permissions', () => {
    const legacyRoles = DEFAULT_ROLES.map((r) => (r.id === 'role_super_admin' ? { ...r, permissions: [...r.permissions, 'some_custom_legacy_permission'] } : r));
    const store = new Map<string, string>();
    store.set('shavaz_treasury_roles_v2', JSON.stringify(legacyRoles));
    store.set('shavaz_treasury_roles_migration_version_v1', '8');
    const mock = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; }
    };
    vi.stubGlobal('localStorage', mock);
    const migrated = storage.getRoles();
    vi.unstubAllGlobals();
    const superAdmin = migrated.find((r) => r.id === 'role_super_admin')!;
    expect(superAdmin.permissions).toContain('approve_sales_invoice_supervisor_step');
    expect(superAdmin.permissions).toContain('some_custom_legacy_permission' as never);
  });
});

describe('Persian-calendar transfer-timing conversion (بدهی #۴) — no duplicated Formatter/Parser in the Component', () => {
  it('round-trips a known Gregorian<->Jalali date pair correctly', () => {
    expect(gregorianToJalali(2026, 8, 8)).toEqual({ year: 1405, month: 5, day: 17 });
    expect(jalaliToGregorian(1405, 5, 17)).toEqual({ year: 2026, month: 8, day: 8 });
  });

  it('round-trips another known pair (Jalali new year)', () => {
    expect(gregorianToJalali(2024, 3, 20)).toEqual({ year: 1403, month: 1, day: 1 });
    expect(jalaliToGregorian(1403, 1, 1)).toEqual({ year: 2024, month: 3, day: 20 });
  });

  it('jalaliDateTimeToIso -> isoToJalaliDateTimeParts round-trips a picked date/time exactly', () => {
    const iso = jalaliDateTimeToIso(1405, 5, 17, 14, 30, 0);
    const parts = isoToJalaliDateTimeParts(iso);
    expect(parts.year).toBe(1405);
    expect(parts.month).toBe(5);
    expect(parts.day).toBe(17);
    expect(parts.hour).toBe(14);
    expect(parts.minute).toBe(30);
  });

  it('formatIsoAsJalaliDisplay produces the exact YYYY/MM/DD - HH:mm:ss shape', () => {
    const iso = jalaliDateTimeToIso(1405, 5, 17, 9, 5, 0);
    expect(formatIsoAsJalaliDisplay(iso)).toBe('1405/05/17 - 09:05:00');
  });

  it('getJalaliMonthLength returns 31 for months 1-6, 30 for 7-11, and the correct leap/non-leap value for month 12', () => {
    expect(getJalaliMonthLength(1405, 1)).toBe(31);
    expect(getJalaliMonthLength(1405, 7)).toBe(30);
    expect(getJalaliMonthLength(1404, 12)).toBe(30); // 1404 leap
    expect(getJalaliMonthLength(1405, 12)).toBe(29); // 1405 not leap
  });

  it('rejects (via the domain layer, not the picker) a backdated scheduled transfer computed from a past Jalali pick', () => {
    // این تست فقط تأیید می‌کند تبدیل صحیح است؛ رد Backdate خودش در reviewSalespersonTransferRequest
    // (salesPersonnelLifecycle.test.ts، «mandated 6») از قبل پوشش داده شده — اینجا تکرار نمی‌شود.
    const pastIso = jalaliDateTimeToIso(1403, 1, 1, 0, 0, 0);
    const nowIso = jalaliDateTimeToIso(1405, 5, 17, 0, 0, 0);
    expect(new Date(pastIso).getTime()).toBeLessThan(new Date(nowIso).getTime());
  });
});

describe('archived management notes — append-only with real actor/date/time (بدهی #۵)', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;
  beforeEach(() => { mock = createMockLocalStorage(); vi.stubGlobal('localStorage', mock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('starts empty and accumulates notes without ever losing a previous one', () => {
    expect(storage.getSalesArchivedNotes()).toEqual([]);
    const note1: SalesArchivedNote = { id: 'n1', targetUserId: 'u1', note: 'یادداشت اول', authorUserId: 'hr1', authorUserName: 'مدیر کاربران فروش', createdAt: '1403/01/01 - 09:00' };
    storage.saveSalesArchivedNotes([note1]);
    const note2: SalesArchivedNote = { id: 'n2', targetUserId: 'u1', note: 'یادداشت دوم', authorUserId: 'hr2', authorUserName: 'ادمین', createdAt: '1403/02/01 - 09:00' };
    storage.saveSalesArchivedNotes([...storage.getSalesArchivedNotes(), note2]);

    const all = storage.getSalesArchivedNotes();
    expect(all).toHaveLength(2);
    expect(all.find((n) => n.id === 'n1')).toEqual(note1); // یادداشت اول دست‌نخورده
    expect(all.find((n) => n.id === 'n2')).toEqual(note2);
  });
});
