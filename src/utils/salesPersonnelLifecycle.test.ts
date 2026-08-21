import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSalespersonTransferRequest, reviewSalespersonTransferRequest, executeSalespersonTransfer,
  executeDueSalespersonTransfers, deactivateSalesUser, correctUnusedSalesAssignment, emergencyCorrectSalesAssignment
} from './salesPersonnelLifecycle';
import { getSingleActiveSalesAssignmentStrict, resolveInvoiceApprover } from './salesOrgStructure';
import { drainLeadsToPool } from './leadAssignment';
import { storage, DEFAULT_ROLES } from './storage';
import { formatIsoAsJalaliDisplay } from './persianDate';
import type { User, SalesBranch, SalesChain, SalesOrgAssignment, SystemRole, Lead, SalesHierarchySnapshot, SalespersonTransferRequest } from '../types';

// نقش‌های واقعی «مؤثر» (بعد از Migration) استفاده می‌شوند، نه آرایهٔ خام DEFAULT_ROLES — چون
// طبق قرارداد همین پروژه (همان الگویی که V2..V8 دنبال می‌کنند)، پرمیشن‌های تازه هرگز مستقیم در
// تعریف پایهٔ role_super_admin نوشته نمی‌شوند، فقط از طریق نقشهٔ Migration اضافه می‌شوند.
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

// ============================================================
// پوشش سناریوهای الزامی مأموریت چرخهٔ عمر نیروی فروش (بند ۲۱ AGENTS.md). شمارهٔ هر describe
// دقیقاً همان شمارهٔ فهرست ۲۴تایی مأموریت است. سناریوهای ۲۴ (Responsive موبایل واقعی) و بخش‌های
// Handler-level سناریوهای ۳/۷/۸ (که واقعاً چک Permission در Handler را می‌خواهند، نه فقط تابع
// خالص) در گزارش نهایی به‌عنوان بدهی باقی‌مانده (نیازمند jsdom/@testing-library/react یا تست
// مرورگر واقعی) صریحاً ذکر شده‌اند.
// ============================================================

const branches: SalesBranch[] = [
  { id: 'b1', code: 'B1', name: 'شعبه یک', companyId: 'comp_sales', isActive: true },
  { id: 'b2', code: 'B2', name: 'شعبه دو', companyId: 'comp_sales', isActive: true }
];
const chains: SalesChain[] = [
  { id: 'c1a', code: 'C1A', name: 'شعبه یک - تیم الف', salesBranchId: 'b1', isActive: true, createdAt: 't0', createdByUserId: 'system' },
  { id: 'c1b', code: 'C1B', name: 'شعبه یک - تیم ب', salesBranchId: 'b1', isActive: true, createdAt: 't0', createdByUserId: 'system' },
  { id: 'c2a', code: 'C2A', name: 'شعبه دو - تیم الف', salesBranchId: 'b2', isActive: true, createdAt: 't0', createdByUserId: 'system' }
];
const roles: SystemRole[] = getMigratedRoles();

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'sp1', username: 'sp1', password: 'x', fullName: 'فروشنده تست', phone: '', email: '', role: 'member', roleTitle: 'فروشنده', isActive: true, ...overrides };
}

function baseUsers(): User[] {
  return [
    makeUser({ id: 'sp1', fullName: 'فروشنده یک' }),
    makeUser({ id: 'sup_old', fullName: 'سرپرست قدیم' }),
    makeUser({ id: 'sup_new', fullName: 'سرپرست جدید' }),
    makeUser({ id: 'sup_b2', fullName: 'سرپرست شعبه دو' })
  ];
}

function baseAssignments(): SalesOrgAssignment[] {
  return [
    { id: 'a_sp1', userId: 'sp1', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], salesChainIds: ['c1a'], directManagerUserId: 'sup_old', validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a_sup_old', userId: 'sup_old', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], salesChainIds: ['c1a'], validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a_sup_new', userId: 'sup_new', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], salesChainIds: ['c1b'], validFrom: 't0', isActive: true, changedAt: 't0' },
    // پوشش شعبهٔ b2/زنجیرهٔ c2a — مقصد سناریوهای اجرای انتقال (بند ۹/۱۰/۱۱) به این سرپرست نیاز دارد.
    { id: 'a_sup_b2', userId: 'sup_b2', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b2'], salesChainIds: ['c2a'], validFrom: 't0', isActive: true, changedAt: 't0' }
  ];
}

const leads: Lead[] = [
  { id: 'lead1', trackingCode: 'LD-0001', source: 'دستی', priority: 'normal', currentOwnerUserId: 'sp1', currentOwnerUserName: 'فروشنده یک', createdAt: 't0', createdByUserId: 'sup_old', createdByUserName: 'سرپرست قدیم', status: 'callback_scheduled', hadFirstContact: true, lastCallOutcome: 'callback_requested', actionDeadline: '1403/05/20', timeline: [{ id: 'lead1_t0', type: 'created', title: 'ساخته شد', timestamp: 't0' }] },
  { id: 'lead2', trackingCode: 'LD-0002', source: 'دستی', priority: 'normal', currentOwnerUserId: 'sp1', currentOwnerUserName: 'فروشنده یک', createdAt: 't0', createdByUserId: 'sup_old', createdByUserName: 'سرپرست قدیم', status: 'closed_won', hadFirstContact: true, timeline: [] }
];

describe('mandated 1/2 — a salesperson has exactly one active branch/chain; two active assignments fail explicitly', () => {
  it('getSingleActiveSalesAssignmentStrict returns the single active assignment normally', () => {
    const result = getSingleActiveSalesAssignmentStrict('sp1', baseAssignments());
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.assignment?.salesChainIds).toEqual(['c1a']);
  });

  it('fails explicitly (not silently picking the first) when a user has two concurrent active assignments', () => {
    const broken: SalesOrgAssignment[] = [
      ...baseAssignments(),
      { id: 'a_sp1_dup', userId: 'sp1', salesRoleId: 'role_salesperson', salesBranchIds: ['b2'], salesChainIds: ['c2a'], validFrom: 't0', isActive: true, changedAt: 't0' }
    ];
    const result = getSingleActiveSalesAssignmentStrict('sp1', broken);
    expect(result.ok).toBe(false);
  });
});

describe('mandated 3/4 — only the current direct supervisor can request a transfer', () => {
  it('rejects a transfer request from anyone who is not the salesperson\'s current direct manager', () => {
    const result = createSalespersonTransferRequest(
      { salespersonUserId: 'sp1', reason: 'عدم تناسب', fullDescription: 'شرح کامل دلیل انتقال' },
      { id: 'sup_new', fullName: 'سرپرست جدید' }, // سرپرست جدید مدیر مستقیم فعلی نیست
      baseUsers(), baseAssignments(), branches, chains, [], '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a transfer request initiated as if by the salesperson themselves', () => {
    const result = createSalespersonTransferRequest(
      { salespersonUserId: 'sp1', reason: 'x', fullDescription: 'y' },
      { id: 'sp1', fullName: 'فروشنده یک' },
      baseUsers(), baseAssignments(), branches, chains, [], '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });

  it('allows the actual current direct supervisor to create a transfer request, without them choosing the destination', () => {
    const result = createSalespersonTransferRequest(
      { salespersonUserId: 'sp1', reason: 'عدم تناسب', fullDescription: 'شرح کامل دلیل انتقال فروشنده به شعبهٔ دیگر' },
      { id: 'sup_old', fullName: 'سرپرست قدیم' },
      baseUsers(), baseAssignments(), branches, chains, [], '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.request.status).toBe('pending');
    expect(result.request.currentAssignmentSnapshot.salesChainId).toBe('c1a');
    // مقصد را سرپرست تعیین نمی‌کند — طبق سند مرجع فقط مدیر کاربران فروش در لحظهٔ تأیید تعیین می‌کند.
    expect(result.request.targetBranchId).toBeUndefined();
    expect(result.request.targetSalesChainId).toBeUndefined();
  });
});

describe('mandated 5 — empty reason/fullDescription are rejected', () => {
  it('rejects an empty reason', () => {
    const result = createSalespersonTransferRequest(
      { salespersonUserId: 'sp1', reason: '', fullDescription: 'شرح کامل' },
      { id: 'sup_old', fullName: 'سرپرست قدیم' }, baseUsers(), baseAssignments(), branches, chains, [], '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });
  it('rejects an empty fullDescription', () => {
    const result = createSalespersonTransferRequest(
      { salespersonUserId: 'sp1', reason: 'دلیل', fullDescription: '' },
      { id: 'sup_old', fullName: 'سرپرست قدیم' }, baseUsers(), baseAssignments(), branches, chains, [], '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });
});

function pendingRequest(): SalespersonTransferRequest {
  return {
    id: 'r1', code: 'TRF-0001', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
    currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک', salesChainId: 'c1a', salesChainName: 'شعبه یک - تیم الف' },
    requestedBySupervisorUserId: 'sup_old', requestedBySupervisorName: 'سرپرست قدیم',
    reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'pending'
  };
}

describe('mandated 6 — incomplete destination or backdating are rejected at the review/approval step', () => {
  it('rejects approving with a target chain that does not belong to the target branch', () => {
    const result = reviewSalespersonTransferRequest(
      pendingRequest(), { type: 'approve', targetBranchId: 'b2', targetSalesChainId: 'c1a' /* متعلق به b1 */, effectiveAtIso: '2026-08-10T00:00:00.000Z' },
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, branches, chains, '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });
  it('rejects approving with an effectiveAtIso in the past (backdate)', () => {
    const result = reviewSalespersonTransferRequest(
      pendingRequest(), { type: 'approve', targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: '2026-07-01T00:00:00.000Z' },
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, branches, chains, '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });
  it('rejects approving with a non-existent/inactive target branch', () => {
    const result = reviewSalespersonTransferRequest(
      pendingRequest(), { type: 'approve', targetBranchId: 'does_not_exist', targetSalesChainId: 'c2a', effectiveAtIso: '2026-08-10T00:00:00.000Z' },
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, branches, chains, '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });
});

describe('mandated 7/8 — review is a sales-user-manager action; the data manager is never an approver', () => {
  it('reviewSalespersonTransferRequest transitions pending -> approved, recording the destination chosen at review time', () => {
    const result = reviewSalespersonTransferRequest(
      pendingRequest(), { type: 'approve', targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: '2026-08-10T00:00:00.000Z' },
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, branches, chains, '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.request.status).toBe('approved');
    expect(result.request.reviewedByUserId).toBe('hr1');
    expect(result.request.targetBranchId).toBe('b2');
    expect(result.request.targetSalesChainId).toBe('c2a');
  });

  it('rejects a reject-decision without a reviewNote explaining it', () => {
    const result = reviewSalespersonTransferRequest(
      pendingRequest(), { type: 'reject', reviewNote: '' }, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, branches, chains, '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });

  it('role_data_manager never has review_salesperson_transfer, no matter what — the data manager is never an approver', () => {
    const dataManagerRole = roles.find((r) => r.id === 'role_data_manager')!;
    expect(dataManagerRole.permissions).not.toContain('review_salesperson_transfer');
  });

  it('only role_sales_user_manager and role_super_admin carry review_salesperson_transfer among default roles', () => {
    const holders = roles.filter((r) => r.permissions.includes('review_salesperson_transfer')).map((r) => r.id);
    expect(new Set(holders)).toEqual(new Set(['role_sales_user_manager', 'role_super_admin']));
  });
});

describe('mandated 9/11 — an immediate transfer executes atomically; a duplicate retry has no second effect', () => {
  function approvedRequest(): SalespersonTransferRequest {
    return {
      id: 'r1', code: 'TRF-0001', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
      currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک', salesChainId: 'c1a', salesChainName: 'شعبه یک - تیم الف' },
      requestedBySupervisorUserId: 'sup_old', requestedBySupervisorName: 'سرپرست قدیم',
      reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'approved',
      reviewedByUserId: 'hr1', reviewedByUserName: 'مدیر کاربران فروش', reviewedAt: 't2',
      targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: 't3'
    };
  }

  const execNowIso = '2026-08-03T00:00:00.000Z';
  const retryNowIso = '2026-08-04T00:00:00.000Z';

  it('executes the transfer: closes the old assignment, opens exactly one new active one, drains the queue, mirrors salesSupervisorId', () => {
    const result = executeSalespersonTransfer(approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, execNowIso);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;

    const { updatedAssignments, updatedUsers, updatedLeads, updatedRequest, events } = result.bundle;
    const active = updatedAssignments.filter((a) => a.userId === 'sp1' && a.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].salesBranchIds).toEqual(['b2']);
    expect(active[0].salesChainIds).toEqual(['c2a']);
    expect(active[0].directManagerUserId).toBe('sup_b2');

    const closedOld = updatedAssignments.find((a) => a.id === 'a_sp1')!;
    expect(closedOld.isActive).toBe(false);
    expect(closedOld.validTo).toBe(formatIsoAsJalaliDisplay(execNowIso));
    expect(closedOld.closeReason).toBe('transfer');

    const updatedSp = updatedUsers.find((u) => u.id === 'sp1')!;
    expect(updatedSp.salesSupervisorId).toBe('sup_b2');

    expect(updatedRequest.status).toBe('executed');
    expect(updatedRequest.oldAssignmentId).toBe('a_sp1');
    expect(updatedRequest.newAssignmentId).toBeDefined();
    expect(updatedRequest.drainedLeadCount).toBe(1); // فقط lead1 باز است، lead2 بسته (closed_won) دست‌نخورده می‌ماند

    expect(events.some((e) => e.type === 'assignment_closed')).toBe(true);
    expect(events.some((e) => e.type === 'assignment_started')).toBe(true);
    expect(events.some((e) => e.type === 'queue_drained')).toBe(true);

    // بدهی #B مأموریت تکمیل چرخهٔ عمر — Event جدید باید Timestamp ISO مرتب‌شدنی + نمایش شمسی
    // تا ثانیه + هویت واقعی/مؤثر + Correlation یکسان بین Eventهای همان انتقال داشته باشد.
    for (const e of events) {
      expect(e.occurredAtIso).toBe(execNowIso);
      expect(e.jalaliDate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
      expect(e.timeWithSeconds).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(e.realActorUserId).toBe('hr1');
      expect(e.effectiveUserId).toBe('hr1');
      expect(e.correlationId).toBe(events[0].correlationId);
    }
    const startedEvent = events.find((e) => e.type === 'assignment_started')!;
    expect(startedEvent.oldAssignmentId).toBe('a_sp1');
    expect(startedEvent.newAssignmentId).toBe(updatedRequest.newAssignmentId);
    expect(startedEvent.oldBranchId).toBe('b1');
    expect(startedEvent.newBranchId).toBe('b2');

    expect(updatedLeads.find((l) => l.id === 'lead1')?.distributionState).toBe('drained');
    expect(updatedLeads.find((l) => l.id === 'lead2')?.distributionState).toBeUndefined();
  });

  it('idempotency: retrying an already-executed request produces no second effect', () => {
    const first = executeSalespersonTransfer(approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, execNowIso);
    if (first.ok === false) throw new Error('setup failed');
    const retry = executeSalespersonTransfer(first.bundle.updatedRequest, first.bundle.updatedUsers, first.bundle.updatedAssignments, first.bundle.updatedLeads, branches, chains, roles, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, retryNowIso);
    expect(retry.ok).toBe(false);
    if (retry.ok === true) return;
    // درخواست همچنان دقیقاً همان نتیجهٔ اجرای اول را دارد — تلاش دوم چیزی عوض نکرد؛ status
    // 'executed' قبلی هرگز با 'failed' بازنویسی نمی‌شود (Retry هیچ اثر دومی نمی‌سازد).
    expect(retry.failedRequest.status).toBe('executed');
    expect(retry.failedRequest.newAssignmentId).toBe(first.bundle.updatedRequest.newAssignmentId);
  });

  it('Refresh recovery: re-running executeDueSalespersonTransfers against the already-persisted (executed) state creates no duplicate assignment, no duplicate drain, and no duplicate event', () => {
    const first = executeSalespersonTransfer(approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, execNowIso);
    if (first.ok === false) throw new Error('setup failed');
    // شبیه‌سازی Refresh/Restart: فقط با خروجی از‌قبل‌ذخیره‌شده (نه هیچ متغیر حافظه‌ای از اجرای اول) دوباره صدا زده می‌شود — دقیقاً همان چیزی که App.tsx بعد از هر Reload انجام می‌دهد.
    const rerun = executeDueSalespersonTransfers(
      [first.bundle.updatedRequest], first.bundle.updatedUsers, first.bundle.updatedAssignments, first.bundle.updatedLeads,
      branches, chains, roles, { id: 'system_scheduler', fullName: 'اجرای خودکار' }, retryNowIso
    );
    expect(rerun.executedCount).toBe(0);
    expect(rerun.events).toHaveLength(0);
    expect(rerun.updatedAssignments).toEqual(first.bundle.updatedAssignments);
    expect(rerun.updatedLeads).toEqual(first.bundle.updatedLeads);
    expect(rerun.updatedRequests).toEqual([first.bundle.updatedRequest]);
  });
});

describe('mandated 10 — a future-scheduled transfer does not execute early', () => {
  it('executeDueSalespersonTransfers skips a request whose effectiveAtIso is still in the future', () => {
    const futureRequest: SalespersonTransferRequest = {
      id: 'r1', code: 'TRF-0001', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
      currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک' },
      requestedBySupervisorUserId: 'sup_old', requestedBySupervisorName: 'سرپرست قدیم',
      reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'scheduled',
      targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: '2026-12-31T00:00:00.000Z'
    };
    const result = executeDueSalespersonTransfers([futureRequest], baseUsers(), baseAssignments(), leads, branches, chains, roles, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-01T00:00:00.000Z');
    expect(result.executedCount).toBe(0);
    expect(result.updatedRequests[0].status).toBe('scheduled');
  });

  it('executeDueSalespersonTransfers executes a request whose effectiveAtIso has already passed', () => {
    const dueRequest: SalespersonTransferRequest = {
      id: 'r1', code: 'TRF-0001', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
      currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک' },
      requestedBySupervisorUserId: 'sup_old', requestedBySupervisorName: 'سرپرست قدیم',
      reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'scheduled',
      targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: '2026-07-01T00:00:00.000Z'
    };
    const result = executeDueSalespersonTransfers([dueRequest], baseUsers(), baseAssignments(), leads, branches, chains, roles, { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-01T00:00:00.000Z');
    expect(result.executedCount).toBe(1);
    expect(result.updatedRequests[0].status).toBe('executed');
  });
});

describe('mandated 12/13 — leads/callbacks go to drained (never directly to another salesperson), Timeline preserved', () => {
  it('drainLeadsToPool clears ownership without assigning to a replacement salesperson, preserving status/outcome/deadline/timeline', () => {
    const { updatedLeads, drainedLeadIds } = drainLeadsToPool(leads, 'sp1', 'فروشنده یک', 'انتقال', { id: 'hr1', fullName: 'مدیر کاربران فروش' }, 't3', 'r1');
    expect(drainedLeadIds).toEqual(['lead1']);
    const drained = updatedLeads.find((l) => l.id === 'lead1')!;
    expect(drained.currentOwnerUserId).toBeUndefined();
    expect(drained.distributionState).toBe('drained');
    expect(drained.status).toBe('callback_scheduled'); // وضعیت اصلی دست‌نخورده
    expect(drained.lastCallOutcome).toBe('callback_requested'); // نتیجهٔ تماس دست‌نخورده
    expect(drained.actionDeadline).toBe('1403/05/20'); // موعد پیگیری دست‌نخورده
    expect(drained.timeline.length).toBe(2); // تایم‌لاین قبلی حفظ و یک ورودی جدید اضافه شد

    // ترمینال (closed_won) اصلاً لمس نمی‌شود
    const untouched = updatedLeads.find((l) => l.id === 'lead2')!;
    expect(untouched.currentOwnerUserId).toBe('sp1');
    expect(untouched.distributionState).toBeUndefined();
  });
});

describe('mandated 16 — deactivation blocks login and never deletes data', () => {
  it('sets isActive false, closes the active assignment, drains leads, and returns no deletions', () => {
    const target = baseUsers().find((u) => u.id === 'sp1')!;
    const result = deactivateSalesUser(target, baseAssignments(), leads, 'ترک کار', { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-05T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.updatedUser.isActive).toBe(false);
    const closed = result.updatedAssignments.find((a) => a.id === 'a_sp1')!;
    expect(closed.isActive).toBe(false);
    expect(closed.closeReason).toBe('deactivation');
    // هیچ رکورد Lead حذف نشد — فقط drained شد
    expect(result.updatedLeads).toHaveLength(leads.length);
    expect(result.updatedLeads.find((l) => l.id === 'lead1')?.distributionState).toBe('drained');
  });

  it('rejects deactivating an already-inactive user', () => {
    const target = { ...baseUsers().find((u) => u.id === 'sp1')!, isActive: false };
    const result = deactivateSalesUser(target, baseAssignments(), leads, 'ترک کار', { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-05T00:00:00.000Z');
    expect(result.ok).toBe(false);
  });
});

describe('mandated 17/18 — pre-use correction is allowed in place; a used assignment cannot be edited directly', () => {
  it('correctUnusedSalesAssignment updates in place with an audit trail when not yet locked', () => {
    const assignment = baseAssignments()[0];
    const result = correctUnusedSalesAssignment(assignment, { salesBranchIds: ['b2'] }, 'اشتباه اولیهٔ ثبت شعبه', { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-01T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.updatedAssignment.id).toBe(assignment.id); // همان id — درجا اصلاح شد
    expect(result.updatedAssignment.salesBranchIds).toEqual(['b2']);
    expect(result.event.type).toBe('correct_before_use');
    expect(result.event.before).toEqual(assignment);
  });

  it('rejects direct correction once the assignment is locked after first business use', () => {
    const usedAssignment: SalesOrgAssignment = { ...baseAssignments()[0], immutableAfterFirstBusinessUse: true, firstBusinessEventAt: 't0', firstBusinessEventType: 'lead_action', firstBusinessEventId: 'lead1' };
    const result = correctUnusedSalesAssignment(usedAssignment, { salesBranchIds: ['b2'] }, 'تلاش ویرایش پس از استفاده', { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
  });
});

describe('mandated 19 — emergency correction requires Super Admin and mandatory documentation', () => {
  const usedAssignment: SalesOrgAssignment = { ...baseAssignments()[0], immutableAfterFirstBusinessUse: true };

  it('rejects when the caller is not Super Admin', () => {
    const result = emergencyCorrectSalesAssignment(
      usedAssignment, { salesBranchIds: ['b2'], salesChainIds: ['c2a'] },
      { letterReference: 'LTR-01', reason: 'اشتباه فاحش', fullDescription: 'شرح کامل', requestedByUserId: 'hr1' },
      false, { id: 'admin1', fullName: 'ادمین' }, '2026-08-09T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects when mandatory documentation (letter/reason/fullDescription/requestedBy) is missing', () => {
    const result = emergencyCorrectSalesAssignment(
      usedAssignment, { salesBranchIds: ['b2'], salesChainIds: ['c2a'] },
      { letterReference: '', reason: 'اشتباه فاحش', fullDescription: 'شرح کامل', requestedByUserId: 'hr1' },
      true, { id: 'admin1', fullName: 'ادمین' }, '2026-08-09T00:00:00.000Z'
    );
    expect(result.ok).toBe(false);
  });

  it('succeeds for Super Admin with full documentation, closing the old record and creating a new one (never overwriting)', () => {
    const result = emergencyCorrectSalesAssignment(
      usedAssignment, { salesBranchIds: ['b2'], salesChainIds: ['c2a'] },
      { letterReference: 'LTR-01', reason: 'اشتباه فاحش در ثبت اولیه', fullDescription: 'شرح کامل اصلاح اضطراری', requestedByUserId: 'hr1' },
      true, { id: 'admin1', fullName: 'ادمین' }, '2026-08-09T00:00:00.000Z'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.closedAssignment.id).toBe(usedAssignment.id);
    expect(result.closedAssignment.isActive).toBe(false);
    expect(result.closedAssignment.closeReason).toBe('emergency_correction');
    expect(result.newAssignment.id).not.toBe(usedAssignment.id); // رکورد قدیمی بازنویسی نشد
    expect(result.newAssignment.salesBranchIds).toEqual(['b2']);
    expect(result.event.type).toBe('emergency_correction');
  });
});

describe('mandated 21 — a successor with the same salesChainId can approve an open invoice', () => {
  const snapshot: SalesHierarchySnapshot = {
    salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک', salesBranchId: 'b1', salesBranchName: 'شعبه یک',
    salesChainId: 'c1a', salesChainName: 'شعبه یک - تیم الف',
    supervisorUserId: 'sup_old', supervisorUserName: 'سرپرست قدیم',
    seniorSupervisorUserId: 'senior1', seniorSupervisorUserName: 'سرپرست ارشد',
    salesManagerUserId: 'mgr1', salesManagerUserName: 'مدیر فروش',
    salesDeputyUserId: 'dep1', salesDeputyUserName: 'معاونت فروش',
    capturedAt: 't0'
  };

  it('resolves the original snapshot supervisor when they are still active', () => {
    const result = resolveInvoiceApprover(snapshot, baseUsers(), baseAssignments());
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.approverUserId).toBe('sup_old');
    expect(result.isSuccessor).toBe(false);
  });

  it('falls back to the active holder of the same salesChainId when the snapshot supervisor is inactive', () => {
    const inactiveSupervisorUsers = baseUsers().map((u) => (u.id === 'sup_old' ? { ...u, isActive: false } : u));
    const successorAssignments: SalesOrgAssignment[] = [
      ...baseAssignments(),
      { id: 'a_successor', userId: 'sp_successor', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], salesChainIds: ['c1a'], validFrom: 't1', isActive: true, changedAt: 't1' }
    ];
    const usersWithSuccessor = [...inactiveSupervisorUsers, makeUser({ id: 'sp_successor', fullName: 'جانشین سرپرست' })];
    const result = resolveInvoiceApprover(snapshot, usersWithSuccessor, successorAssignments);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.approverUserId).toBe('sp_successor');
    expect(result.isSuccessor).toBe(true);
  });

  it('falls back to the next active higher level of the same snapshot when no chain holder exists either', () => {
    const inactiveSupervisorUsers = baseUsers()
      .map((u) => (u.id === 'sup_old' ? { ...u, isActive: false } : u))
      .concat(makeUser({ id: 'senior1', fullName: 'سرپرست ارشد' }));
    const result = resolveInvoiceApprover(snapshot, inactiveSupervisorUsers, baseAssignments().filter((a) => a.userId !== 'sup_old'));
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.approverUserId).toBe('senior1');
    expect(result.isSuccessor).toBe(true);
  });

  it('fails explicitly when no active approver exists anywhere in the chain', () => {
    const allInactive = baseUsers().map((u) => ({ ...u, isActive: false }));
    const result = resolveInvoiceApprover(snapshot, allInactive, []);
    expect(result.ok).toBe(false);
  });
});

describe('mandated 22 — sales roles never gain unintended financial/vendor access', () => {
  const FORBIDDEN_FOR_SALES_HR: string[] = [
    'create_request', 'view_all_requests', 'view_branch_requests', 'approve_branch_request',
    'approve_treasury', 'execute_payment', 'refer_for_payment', 'refer_for_emergency_payment',
    'execute_emergency_payment', 'manage_vendors', 'financial_approve_support', 'manage_support_cases',
    'view_customer_complaint_details'
  ];
  it('role_sales_user_manager carries none of the forbidden financial/treasury/vendor/complaint permissions', () => {
    const role = roles.find((r) => r.id === 'role_sales_user_manager')!;
    for (const forbidden of FORBIDDEN_FOR_SALES_HR) {
      expect(role.permissions).not.toContain(forbidden);
    }
  });
  it('emergency_correct_sales_assignment is granted only to role_super_admin among default roles', () => {
    const holders = roles.filter((r) => r.permissions.includes('emergency_correct_sales_assignment')).map((r) => r.id);
    expect(holders).toEqual(['role_super_admin']);
  });
});

describe('mandated 23 — the role/permission migration is idempotent on pre-existing localStorage', () => {
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
  let mock: ReturnType<typeof createMockLocalStorage>;
  beforeEach(() => { mock = createMockLocalStorage(); vi.stubGlobal('localStorage', mock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('running getRoles() twice never duplicates role_sales_user_manager or its permissions', () => {
    const first = storage.getRoles();
    const salesHrFirst = first.find((r) => r.id === 'role_sales_user_manager');
    expect(salesHrFirst).toBeDefined();
    const second = storage.getRoles();
    const salesHrSecond = second.find((r) => r.id === 'role_sales_user_manager');
    expect(second.filter((r) => r.id === 'role_sales_user_manager')).toHaveLength(1);
    expect(new Set(salesHrSecond!.permissions)).toEqual(new Set(salesHrFirst!.permissions));
  });

  it('an older install with a pre-existing role_super_admin (no new permissions yet) gets the new permissions unioned in, without losing any custom ones', () => {
    const legacyRoles = DEFAULT_ROLES.map((r) => (r.id === 'role_super_admin' ? { ...r, permissions: [...r.permissions.filter((p) => p !== 'manage_sales_users'), 'some_custom_legacy_permission'] } : r));
    mock.setItem('shavaz_treasury_roles_v2', JSON.stringify(legacyRoles));
    mock.setItem('shavaz_treasury_roles_migration_version_v1', '1');

    const migrated = storage.getRoles();
    const superAdmin = migrated.find((r) => r.id === 'role_super_admin')!;
    expect(superAdmin.permissions).toContain('manage_sales_users');
    expect(superAdmin.permissions).toContain('some_custom_legacy_permission' as never);
  });

  it('running the sales-org-structure seed twice never duplicates sales chains or assignments', () => {
    storage.getSalesChains();
    const firstIds = storage.getSalesChains().map((c) => c.id);
    storage.getSalesChains();
    const secondIds = storage.getSalesChains().map((c) => c.id);
    expect(secondIds).toEqual(firstIds);
    expect(new Set(secondIds).size).toBe(secondIds.length);
  });
});
