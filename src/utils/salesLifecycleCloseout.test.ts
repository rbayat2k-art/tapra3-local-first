import { describe, it, expect, vi } from 'vitest';
import {
  createSalespersonTransferRequest, reviewSalespersonTransferRequest, executeSalespersonTransfer
} from './salesPersonnelLifecycle';
import { resolveSupervisorApprovalGate } from './salesInvoice';
import { getSingleActiveSalesAssignmentStrict } from './salesOrgStructure';
import { storage } from './storage';
import type {
  User, SalesBranch, SalesChain, SalesOrgAssignment, SystemRole, Lead, SalesHierarchySnapshot,
  SalespersonTransferRequest, SalesInvoice
} from '../types';

// نقش‌های واقعی «مؤثر» بعد از Migration — validateSalesAssignment به allowedParentRoleIds واقعی
// نیاز دارد؛ آرایهٔ خام یا خالی باعث رد نادرست انتصاب سرپرست می‌شود (همان الگوی
// salesPersonnelLifecycle.test.ts's getMigratedRoles).
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
// مأموریت «تکمیل چرخهٔ عمر، انتقال و تغییر سلسله‌مراتب فروشنده» — این فایل فقط سناریوهای واقعاً
// تازهٔ همین مأموریت را می‌پوشاند (بندهای A/B/D)؛ سناریوهای قبلاً پوشش‌داده‌شده در
// salesPersonnelLifecycle.test.ts / salesInvoice.test.ts / salesLifecycleAcceptanceFix.test.ts
// تکرار نمی‌شوند.
// ============================================================

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'u', username: 'u', password: 'x', fullName: 'کاربر', phone: '', email: '', role: 'member', roleTitle: 'کاربر', isActive: true, ...overrides };
}

const branches: SalesBranch[] = [
  { id: 'b1', code: 'B1', name: 'شعبه یک', companyId: 'comp_sales', isActive: true },
  { id: 'b2', code: 'B2', name: 'شعبه دو', companyId: 'comp_sales', isActive: true }
];
const chains: SalesChain[] = [
  { id: 'c1a', code: 'C1A', name: 'شعبه یک - تیم الف', salesBranchId: 'b1', isActive: true, createdAt: 't0', createdByUserId: 'system' },
  { id: 'c2a', code: 'C2A', name: 'شعبه دو - تیم الف', salesBranchId: 'b2', isActive: true, createdAt: 't0', createdByUserId: 'system' }
];

function baseUsers(): User[] {
  return [
    makeUser({ id: 'sp1', fullName: 'فروشنده یک' }),
    makeUser({ id: 'sup_a', fullName: 'سرپرست زنجیرهٔ الف' }),
    makeUser({ id: 'sup_b', fullName: 'سرپرست زنجیرهٔ ب' }),
    makeUser({ id: 'admin1', fullName: 'ادمین واقعی' })
  ];
}
function baseAssignments(): SalesOrgAssignment[] {
  return [
    { id: 'a_sp1', userId: 'sp1', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], salesChainIds: ['c1a'], directManagerUserId: 'sup_a', validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a_sup_a', userId: 'sup_a', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], salesChainIds: ['c1a'], validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a_sup_b', userId: 'sup_b', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b2'], salesChainIds: ['c2a'], validFrom: 't0', isActive: true, changedAt: 't0' }
  ];
}
const roles: SystemRole[] = getMigratedRoles();
const leads: Lead[] = [];

function approvedRequest(): SalespersonTransferRequest {
  return {
    id: 'r1', code: 'TRF-0001', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
    currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک', salesChainId: 'c1a', salesChainName: 'شعبه یک - تیم الف' },
    requestedBySupervisorUserId: 'sup_a', requestedBySupervisorName: 'سرپرست زنجیرهٔ الف',
    reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'approved',
    reviewedByUserId: 'hr1', reviewedByUserName: 'مدیر کاربران فروش', reviewedAt: 't2',
    targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: '2026-08-03T00:00:00.000Z'
  };
}

describe('بدهی #B — هویت واقعی زیر Impersonation در Eventهای چرخهٔ عمر ثبت می‌شود', () => {
  it('executeSalespersonTransfer: وقتی ادمین به‌جای مدیر کاربران فروش Impersonate کرده، realActorUserId همان ادمین واقعی است، نه effectiveUserId', () => {
    const effective = { id: 'hr1', fullName: 'مدیر کاربران فروش (نیابتی)' };
    const real = { id: 'admin1', fullName: 'ادمین واقعی' };
    const result = executeSalespersonTransfer(approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles, effective, '2026-08-03T00:00:00.000Z', real);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    for (const e of result.bundle.events) {
      expect(e.effectiveUserId).toBe('hr1');
      expect(e.realActorUserId).toBe('admin1');
      expect(e.actorUserId).toBe('hr1'); // فیلد قدیمی actorUserId همچنان هویت مؤثر را نگه می‌دارد
    }
  });

  it('بدون Impersonation (realActor=null)، realActorUserId و effectiveUserId یکسان‌اند', () => {
    const effective = { id: 'hr1', fullName: 'مدیر کاربران فروش' };
    const result = executeSalespersonTransfer(approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles, effective, '2026-08-03T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    for (const e of result.bundle.events) {
      expect(e.realActorUserId).toBe(e.effectiveUserId);
    }
  });
});

describe('بدهی #B — ثبت درخواست و بررسی هم اکنون Event تولید می‌کنند (نه فقط اجرای نهایی)', () => {
  it('createSalespersonTransferRequest یک Event از نوع transfer_requested با correlationId مشترک با شناسهٔ درخواست برمی‌گرداند', () => {
    const result = createSalespersonTransferRequest(
      { salespersonUserId: 'sp1', reason: 'دلیل', fullDescription: 'شرح کامل' },
      { id: 'sup_a', fullName: 'سرپرست زنجیرهٔ الف' },
      baseUsers(), baseAssignments(), branches, chains, [], '2026-08-01T00:00:00.000Z'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.event.type).toBe('transfer_requested');
    expect(result.event.relatedRequestId).toBe(result.request.id);
    expect(result.event.occurredAtIso).toBe('2026-08-01T00:00:00.000Z');
    expect(result.event.jalaliDate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  it('reviewSalespersonTransferRequest (رد) یک Event از نوع transfer_rejected برمی‌گرداند', () => {
    const request: SalespersonTransferRequest = {
      id: 'r2', code: 'TRF-0002', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
      currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک' },
      requestedBySupervisorUserId: 'sup_a', requestedBySupervisorName: 'سرپرست زنجیرهٔ الف',
      reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'pending'
    };
    const result = reviewSalespersonTransferRequest(
      request, { type: 'reject', reviewNote: 'دلیل رد' }, { id: 'hr1', fullName: 'مدیر کاربران فروش' },
      branches, chains, '2026-08-02T00:00:00.000Z'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.event.type).toBe('transfer_rejected');
    expect(result.event.reason).toBe('دلیل رد');
  });

  it('reviewSalespersonTransferRequest (تأیید) یک Event از نوع transfer_scheduled برمی‌گرداند — هرگز assignment_started زودتر از موعد نمی‌سازد', () => {
    const request: SalespersonTransferRequest = {
      id: 'r3', code: 'TRF-0003', salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک',
      currentAssignmentSnapshot: { salesBranchId: 'b1', salesBranchName: 'شعبه یک' },
      requestedBySupervisorUserId: 'sup_a', requestedBySupervisorName: 'سرپرست زنجیرهٔ الف',
      reason: 'x', fullDescription: 'y', requestedAt: 't1', status: 'pending'
    };
    const result = reviewSalespersonTransferRequest(
      request, { type: 'approve', targetBranchId: 'b2', targetSalesChainId: 'c2a', effectiveAtIso: '2026-08-05T00:00:00.000Z' },
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, branches, chains, '2026-08-02T00:00:00.000Z'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.event.type).toBe('transfer_scheduled');
    expect(result.event.newBranchId).toBe('b2');
  });
});

describe('بدهی #D — بعد از انتقال، مدیر جدید بدون مجوز نمی‌تواند فاکتور تاریخی زنجیرهٔ قبل را تأیید کند', () => {
  const oldSnapshot: SalesHierarchySnapshot = {
    salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک', salesBranchId: 'b1', salesBranchName: 'شعبه یک',
    salesChainId: 'c1a', salesChainName: 'شعبه یک - تیم الف',
    supervisorUserId: 'sup_a', supervisorUserName: 'سرپرست زنجیرهٔ الف',
    seniorSupervisorUserId: 'senior1', seniorSupervisorUserName: 'سرپرست ارشد',
    salesManagerUserId: 'mgr1', salesManagerUserName: 'مدیر فروش',
    salesDeputyUserId: 'dep1', salesDeputyUserName: 'معاونت فروش',
    capturedAt: 't0'
  };
  function oldInvoice(): SalesInvoice {
    return { status: 'awaiting_supervisor_approval', salesHierarchySnapshot: oldSnapshot } as SalesInvoice;
  }

  it('فاکتور با Snapshot زنجیرهٔ قبل، حتی بعد از اجرای واقعی انتقال فروشنده به زنجیرهٔ جدید، دست‌نخورده می‌ماند', () => {
    const invoiceBefore = oldInvoice();
    const snapshotBefore = JSON.stringify(invoiceBefore.salesHierarchySnapshot);

    const execResult = executeSalespersonTransfer(
      approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles,
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-03T00:00:00.000Z'
    );
    expect(execResult.ok).toBe(true);

    // فاکتور در حافظه کاملاً مستقل بود — این خط فقط برای تأکید صریح روی عدم تغییر است.
    expect(JSON.stringify(invoiceBefore.salesHierarchySnapshot)).toBe(snapshotBefore);

    // فروشنده اکنون واقعاً در زنجیرهٔ جدید (b2/c2a) با سرپرست جدید (sup_b) است.
    if (execResult.ok === false) return;
    const newActive = getSingleActiveSalesAssignmentStrict('sp1', execResult.bundle.updatedAssignments);
    expect(newActive.ok).toBe(true);
    if (newActive.ok === false) return;
    expect(newActive.assignment?.directManagerUserId).toBe('sup_b');

    // با این حال، سرپرست جدید (sup_b) — حتی با مجوز مستقل و حتی به‌عنوان مدیر مستقیم فعلی
    // فروشنده — نباید بتواند این فاکتور تاریخی (Snapshot زنجیرهٔ قبل) را تأیید کند، چون او در
    // هیچ‌جای Snapshot اصلی حضور ندارد و دارندهٔ فعال همان salesChainId قدیم (c1a) هم نیست.
    const gateForNewSupervisor = resolveSupervisorApprovalGate({
      invoice: invoiceBefore, actorUser: baseUsers().find((u) => u.id === 'sup_b')!, isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: execResult.bundle.updatedUsers,
      assignments: execResult.bundle.updatedAssignments
    });
    expect(gateForNewSupervisor.ok).toBe(false);
  });

  it('همان فاکتور را سرپرست اصلیِ Snapshot (sup_a) — که هنوز فعال است و هنوز دارندهٔ زنجیرهٔ c1a — همچنان می‌تواند تأیید کند', () => {
    const execResult = executeSalespersonTransfer(
      approvedRequest(), baseUsers(), baseAssignments(), leads, branches, chains, roles,
      { id: 'hr1', fullName: 'مدیر کاربران فروش' }, '2026-08-03T00:00:00.000Z'
    );
    expect(execResult.ok).toBe(true);
    if (execResult.ok === false) return;

    const gateForOriginalSupervisor = resolveSupervisorApprovalGate({
      invoice: oldInvoice(), actorUser: baseUsers().find((u) => u.id === 'sup_a')!, isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: execResult.bundle.updatedUsers,
      assignments: execResult.bundle.updatedAssignments
    });
    expect(gateForOriginalSupervisor.ok).toBe(true);
    if (gateForOriginalSupervisor.ok === false) return;
    expect(gateForOriginalSupervisor.approverUserId).toBe('sup_a');
    expect(gateForOriginalSupervisor.isSuccessor).toBe(false);
  });
});

describe('بدهی #D — صف استثنا: وقتی هیچ سرپرست/جانشین فعالی برای Snapshot یافت نمی‌شود، Gate هرگز خودکار تأیید نمی‌کند', () => {
  it('resolveSupervisorApprovalGate با Snapshot کاملاً بدون جانشین فعال، ok:false برمی‌گرداند (نه Silent Success)', () => {
    const orphanSnapshot: SalesHierarchySnapshot = {
      salespersonUserId: 'sp1', salespersonUserName: 'فروشنده یک', salesBranchId: 'b1', salesBranchName: 'شعبه یک',
      salesChainId: 'c_no_holder', salesChainName: 'زنجیرهٔ بدون سرپرست',
      supervisorUserId: 'gone1', supervisorUserName: 'سرپرست حذف‌شده',
      seniorSupervisorUserId: 'gone2', seniorSupervisorUserName: 'سرپرست ارشد حذف‌شده',
      salesManagerUserId: 'gone3', salesManagerUserName: 'مدیر فروش حذف‌شده',
      salesDeputyUserId: 'gone4', salesDeputyUserName: 'معاونت حذف‌شده',
      capturedAt: 't0'
    };
    const invoice = { status: 'awaiting_supervisor_approval', salesHierarchySnapshot: orphanSnapshot } as SalesInvoice;
    const result = resolveSupervisorApprovalGate({
      invoice, actorUser: makeUser({ id: 'anyone' }), isAdminUser: false,
      effectivePermissions: ['approve_sales_invoice_supervisor_step'], users: baseUsers(), assignments: baseAssignments()
    });
    expect(result.ok).toBe(false);
  });
});
