import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storage, DEFAULT_SALES_INVOICES, DEFAULT_PRODUCT_FULFILLMENT_CASES, DEFAULT_SERVICE_FULFILLMENT_CASES, DEFAULT_USERS } from './storage';
import type { CustomerMergeRequest, CustomerMergeEvent, CustomerSplitEvent, CustomerEntryConflict, SalesInvoice, ServiceFulfillmentCase } from '../types';

// Vitest در این پروژه با environment پیش‌فرض Node اجرا می‌شود (بدون jsdom/happy-dom)، پس
// localStorage به‌صورت سراسری وجود ندارد — یک Mock کنترل‌شده و قابل‌اعتماد می‌سازیم که می‌تواند
// دقیقاً در فراخوانی Nام setItem عمداً خطا بدهد، تا سناریوی واقعی Rollback تست شود.
function createMockLocalStorage() {
  const store = new Map<string, string>();
  let failOnCallNumber: number | null = null;
  let callCount = 0;
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      callCount++;
      if (failOnCallNumber !== null && callCount === failOnCallNumber) {
        throw new Error('Simulated localStorage quota-exceeded failure');
      }
      store.set(key, value);
    },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
    setFailOnCall(n: number | null) { failOnCallNumber = n; },
    resetCallCount() { callCount = 0; }
  };
}

describe('saveCustomerIdentityTransaction — atomic Rollback', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path: writes every provided collection and returns ok:true', () => {
    const mergeRequests: CustomerMergeRequest[] = [{ id: 'r1' } as CustomerMergeRequest];
    const entryConflicts: CustomerEntryConflict[] = [{ id: 'c1' } as CustomerEntryConflict];
    const result = storage.saveCustomerIdentityTransaction({ mergeRequests, entryConflicts });
    expect(result.ok).toBe(true);
    expect(storage.getCustomerMergeRequests()).toEqual(mergeRequests);
    expect(storage.getCustomerEntryConflicts()).toEqual(entryConflicts);
  });

  it('rolls back every already-written key (not just the one that failed) when a later write throws mid-transaction', () => {
    // مقدار پیش از تراکنش
    storage.saveCustomerMergeRequests([{ id: 'existing_req' } as CustomerMergeRequest]);
    storage.saveCustomerMergeEvents([{ id: 'existing_event' } as CustomerMergeEvent]);
    mock.resetCallCount();

    mock.setFailOnCall(2); // دومین نوشتن (mergeEvents) عمداً شکست بخورد
    const result = storage.saveCustomerIdentityTransaction({
      mergeRequests: [{ id: 'NEW_should_not_persist' } as CustomerMergeRequest],
      mergeEvents: [{ id: 'NEW_should_not_persist' } as CustomerMergeEvent]
    });

    expect(result.ok).toBe(false);
    // هر دو کلید — نه فقط کلیدی که شکست خورد — باید دقیقاً به مقدار قبل از تراکنش برگردند
    expect(storage.getCustomerMergeRequests()).toEqual([{ id: 'existing_req' }]);
    expect(storage.getCustomerMergeEvents()).toEqual([{ id: 'existing_event' }]);
  });

  it('rolls back to fully absent (removeItem), not an empty-array stub, when a key had no prior value', () => {
    mock.setFailOnCall(2);
    const result = storage.saveCustomerIdentityTransaction({
      mergeRequests: [{ id: 'NEW1' } as CustomerMergeRequest],
      splitEvents: [{ id: 'NEW2' } as CustomerSplitEvent]
    });
    expect(result.ok).toBe(false);
    expect(mock.getItem('shavaz_treasury_customer_merge_requests_v1')).toBeNull();
  });

  it('leaves no half-finished state across all four collections when the fourth write fails', () => {
    mock.setFailOnCall(4); // سه کلید اول موفق نوشته می‌شوند، چهارمی شکست می‌خورد
    const result = storage.saveCustomerIdentityTransaction({
      mergeRequests: [{ id: 'a' } as CustomerMergeRequest],
      mergeEvents: [{ id: 'b' } as CustomerMergeEvent],
      splitEvents: [{ id: 'c' } as CustomerSplitEvent],
      entryConflicts: [{ id: 'd' } as CustomerEntryConflict]
    });
    expect(result.ok).toBe(false);
    expect(storage.getCustomerMergeRequests()).toEqual([]);
    expect(storage.getCustomerMergeEvents()).toEqual([]);
    expect(storage.getCustomerSplitEvents()).toEqual([]);
    expect(storage.getCustomerEntryConflicts()).toEqual([]);
  });

  it('returns ok:true and persists correctly on a normal successful run after a prior rollback (no lingering broken state)', () => {
    mock.setFailOnCall(1);
    const failed = storage.saveCustomerIdentityTransaction({ mergeRequests: [{ id: 'x' } as CustomerMergeRequest] });
    expect(failed.ok).toBe(false);

    mock.setFailOnCall(null);
    const succeeded = storage.saveCustomerIdentityTransaction({ mergeRequests: [{ id: 'y' } as CustomerMergeRequest] });
    expect(succeeded.ok).toBe(true);
    expect(storage.getCustomerMergeRequests()).toEqual([{ id: 'y' }]);
  });
});

describe('service fulfillment migration — additive and idempotent', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('adds an empty evidence collection without reopening or overwriting a legacy completed case', () => {
    const legacy: ServiceFulfillmentCase = {
      id: 'legacy_service_case', invoiceId: DEFAULT_SALES_INVOICES[0].id, invoiceCode: DEFAULT_SALES_INVOICES[0].invoiceCode, lineItemId: 'legacy_line',
      serviceName: 'خدمت قدیمی', customerId: 'legacy_customer', quantity: 1, status: 'completed',
      projectManagerUserId: 'pm_old', assignedEmployeeUserId: 'employee_old',
      timeline: [{ id: 'event_old', type: 'completed', title: 'تکمیل قدیمی', timestamp: '۱۴۰۴/۰۱/۰۱ - ۱۰:۰۰' }],
      createdAt: '۱۴۰۴/۰۱/۰۱ - ۰۹:۰۰', updatedAt: '۱۴۰۴/۰۱/۰۱ - ۱۰:۰۰'
    };
    mock.setItem('shavaz_treasury_service_fulfillment_cases_v1', JSON.stringify([legacy]));

    const first = storage.getServiceFulfillmentCases().find((item) => item.id === legacy.id)!;
    const second = storage.getServiceFulfillmentCases().find((item) => item.id === legacy.id)!;

    expect(first.status).toBe('completed');
    expect(first.projectManagerUserId).toBe('pm_old');
    expect(first.timeline).toEqual(legacy.timeline);
    expect(first.completionEvidence).toEqual([]);
    expect(second).toEqual(first);
  });
});

describe('role migration — retired direct-to-finance permission', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes retired finance/registration gates and grants direct supervisor submission', () => {
    mock.setItem('shavaz_treasury_roles_v2', JSON.stringify([{
      id: 'role_salesperson', code: 'SALESPERSON', name: 'فروشنده', description: '',
      isSystemRole: true, permissions: ['submit_invoice_for_financial_review', 'submit_invoice_for_registration_review']
    }]));
    mock.setItem('shavaz_treasury_roles_migration_version_v1', '11');

    const salespersonRole = storage.getRoles().find((role) => role.id === 'role_salesperson');
    expect(salespersonRole?.permissions).toContain('submit_sales_invoice_to_supervisor');
    expect(salespersonRole?.permissions.map(String)).not.toContain('submit_invoice_for_financial_review');
    expect(salespersonRole?.permissions.map(String)).not.toContain('submit_invoice_for_registration_review');
  });
});

describe('catalog governance migrations', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('backfills version metadata without changing existing catalog business values and is idempotent', () => {
    mock.setItem('shavaz_treasury_products_v1', JSON.stringify([{
      id: 'legacy_product', code: 'LEG-1', name: 'کالای قدیمی', category: 'قدیمی', unit: 'عدد', quantity: 7,
      purchasePrice: 120, salePrice: 180, isActive: true
    }]));

    const first = storage.getProducts();
    const second = storage.getProducts();
    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({ id: 'legacy_product', quantity: 7, purchasePrice: 120, salePrice: 180, version: 1, revisionHistory: [] });
    expect(mock.getItem('shavaz_treasury_catalog_metadata_migration_version_v1')).toBe('1');
  });

  it('splits the legacy aggregate catalog role into independent system roles', () => {
    mock.setItem('shavaz_treasury_roles_v2', JSON.stringify([{
      id: 'role_promotion_manager', code: 'PROMOTION_MANAGER', name: 'مدیر پروموشن', description: '',
      isSystemRole: true, permissions: ['manage_products', 'manage_services', 'manage_promotions', 'view_promotions']
    }]));
    mock.setItem('shavaz_treasury_roles_migration_version_v1', '13');

    const roles = storage.getRoles();
    const promotionManager = roles.find((role) => role.id === 'role_promotion_manager');
    expect(promotionManager?.permissions).toEqual(['manage_promotions', 'view_promotions']);
    expect(roles.find((role) => role.id === 'role_product_manager')?.permissions).toEqual(['manage_products']);
    expect(roles.find((role) => role.id === 'role_service_catalog_manager')?.permissions).toEqual(['manage_services']);
  });
});

describe('sales invoice registration-gate migration', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
    mock.setItem('shavaz_treasury_golden_mixed_invoice_seed_version_v1', '9');
  });

  afterEach(() => vi.unstubAllGlobals());

  const legacyInvoice = (paidAmount: number): SalesInvoice => ({
    id: `legacy_${paidAmount}`, invoiceCode: `INV-${paidAmount}`, revision: 1, customerId: 'cust_1',
    salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', registeredByUserId: 'entry_1', registeredByUserName: 'ثبات',
    lineItems: [{ id: 'li_1', itemType: 'goods', name: 'کالا', quantity: 1, unitPrice: 1000, discount: 0, lineTotal: 1000, sourceType: 'manual_addition' }],
    subtotal: 1000, totalDiscount: 0, finalAmount: 1000, paidAmount, remainingAmount: 1000 - paidAmount,
    status: 'awaiting_registration_review',
    declaredPayments: paidAmount > 0 ? [{ id: 'pay_1', amount: paidAmount, date: '1405/05/18', method: 'cash', recordedByUserId: 'entry_1', recordedByUserName: 'ثبات', recordedAt: '1405/05/18 - 10:00:00', status: 'declared' }] : [],
    history: [{ id: 'h1', action: 'submitted_for_registration_review', byUserId: 'entry_1', byUserName: 'ثبات', at: '1405/05/18 - 10:00:00' }],
    createdAt: '1405/05/18 - 09:00:00', updatedAt: '1405/05/18 - 10:00:00', registrationMode: 'on_behalf', saleOrigin: 'paper_offline'
  });

  it('sends complete legacy records to supervisor and returns incomplete ones to open draft, idempotently', () => {
    mock.setItem('shavaz_treasury_sales_invoices_v1', JSON.stringify([legacyInvoice(1000), legacyInvoice(200)]));
    const first = storage.getSalesInvoices();
    expect(first.find((invoice) => invoice.id === 'legacy_1000')?.status).toBe('awaiting_supervisor_approval');
    expect(first.find((invoice) => invoice.id === 'legacy_200')?.status).toBe('draft');
    expect(first.find((invoice) => invoice.id === 'legacy_200')?.history.at(-1)?.action).toBe('legacy_registration_gate_removed');
    expect(storage.getSalesInvoices()).toEqual(first);
    expect(mock.getItem('shavaz_treasury_sales_invoices_v1_backup_registration_flow_v1')).not.toBeNull();
  });
});

describe('golden mixed-invoice demo scenario — reproduces the mandated figures exactly', () => {
  function findGolden() {
    return DEFAULT_SALES_INVOICES.find((inv) => inv.customerId === 'cust_golden_mixed_invoice')!;
  }

  it('exists, is built by sales_hosseini, reaches the exact 658,400,000 total, and moves to fulfillment_in_progress once cases exist', () => {
    const invoice = findGolden();
    expect(invoice).toBeTruthy();
    expect(invoice.salespersonUserId).toBe('user_sales_person_1');
    expect(invoice.registeredByUserId).toBe('user_data_entry_unit_1');
    expect(invoice.finalAmount).toBe(658400000);
    expect(invoice.status).toBe('fulfillment_in_progress');
  });

  it('has exactly 2 goods rows and 3 service rows', () => {
    const invoice = findGolden();
    const goods = invoice.lineItems.filter((li) => li.itemType === 'goods');
    const services = invoice.lineItems.filter((li) => li.itemType === 'service');
    expect(goods).toHaveLength(2);
    expect(services).toHaveLength(3);
  });

  it('excludes the rejected 150,000,000 payment and confirms exactly the two approved payments', () => {
    const invoice = findGolden();
    const approved = invoice.declaredPayments.filter((p) => p.status === 'approved');
    const rejected = invoice.declaredPayments.filter((p) => p.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].amount).toBe(150000000);
    const approvedTotal = approved.reduce((sum, p) => sum + (p.approvedAmount ?? 0), 0);
    expect(approvedTotal).toBe(658400000);
    expect(invoice.remainingAmount).toBe(0);
  });

  it('creates exactly 2 product fulfillment cases and 3 service fulfillment cases for the golden invoice', () => {
    const invoice = findGolden();
    const productCases = DEFAULT_PRODUCT_FULFILLMENT_CASES.filter((c) => c.invoiceId === invoice.id);
    const serviceCases = DEFAULT_SERVICE_FULFILLMENT_CASES.filter((c) => c.invoiceId === invoice.id);
    expect(productCases).toHaveLength(2);
    expect(serviceCases).toHaveLength(3);
    expect(productCases.every((c) => c.status === 'pending_coordination')).toBe(true);
    expect(serviceCases.every((c) => c.status === 'pending_assignment')).toBe(true);
  });
});

describe('storage.getUsers() migrations — test 12: running twice produces the exact same result', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a fresh install (no prior localStorage) returns byte-identical user arrays across two consecutive getUsers() calls', () => {
    const first = storage.getUsers();
    const second = storage.getUsers();
    expect(second).toEqual(first);
  });

  it('an old install with a pre-existing real purchaser (role:"requestor", no explicit roleId) converges to the same array on the second call, with no duplicate ids', () => {
    const realPurchaser = DEFAULT_USERS.find((u) => u.id === 'user_requestor_poonak')!;
    // شبیه‌سازی نصب قدیمی: فقط همین یک کاربر در localStorage موجود است، بدون roleId صریح
    mock.setItem('shavaz_treasury_users_v2', JSON.stringify([{ ...realPurchaser, roleId: undefined }]));

    const first = storage.getUsers();
    const second = storage.getUsers();
    expect(second).toEqual(first);

    const ids = first.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    // خریدار واقعی باید role:'requestor' باقی بماند، نه 'member'
    expect(first.find((u) => u.id === 'user_requestor_poonak')?.role).toBe('requestor');
  });
});

describe('storage.getUsers() migrations — test 13: manual admin edits on an existing user survive migration', () => {
  let mock: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mock = createMockLocalStorage();
    vi.stubGlobal('localStorage', mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves a manually-changed roleTitle/password/deniedPermissions on a known default user id', () => {
    const base = DEFAULT_USERS.find((u) => u.id === 'user_requestor_poonak')!;
    const manuallyEdited = {
      ...base,
      roleTitle: 'عنوان دستی تغییریافته توسط ادمین',
      password: 'CUSTOM_PASSWORD_123',
      deniedPermissions: ['manage_vendors' as const]
    };
    mock.setItem('shavaz_treasury_users_v2', JSON.stringify([manuallyEdited]));

    const result = storage.getUsers();
    const found = result.find((u) => u.id === 'user_requestor_poonak');
    expect(found?.roleTitle).toBe('عنوان دستی تغییریافته توسط ادمین');
    expect(found?.password).toBe('CUSTOM_PASSWORD_123');
    expect(found?.deniedPermissions).toEqual(['manage_vendors']);
    // role همچنان 'requestor' باقی می‌ماند — خریدار واقعی هرگز به 'member' تبدیل نمی‌شود
    expect(found?.role).toBe('requestor');
  });
});
