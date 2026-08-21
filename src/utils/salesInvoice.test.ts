import { describe, it, expect } from 'vitest';
import {
  generateInvoiceCode, computeLineTotal, computeInvoiceTotals, computePaymentSummary,
  buildDraftInvoice, registerInvoice, addDeclaredPayment, submitForFinancialReview, returnInvoiceToSalesperson,
  splitPromotionIntoLineItems, submitForRegistrationReview, approveRegistration, editInvoiceLineItems,
  submitInvoiceToSupervisor,
  computeApprovedPaymentSummary, decideDeclaredPayment, approveSupervisorInvoice
} from './salesInvoice';
import { buildSalesHierarchySnapshot } from './salesOrgStructure';
import type { SalesInvoice, SalesInvoiceLineItem, DeclaredPayment, Promotion, Product, ServiceCatalogItem, SalesBranch, SalesOrgAssignment, User } from '../types';

function makeLineItem(overrides: Partial<SalesInvoiceLineItem> = {}): SalesInvoiceLineItem {
  return {
    id: 'li_1', itemType: 'goods', name: 'کالای تست', quantity: 2, unitPrice: 1000000, discount: 100000,
    lineTotal: 1900000, sourceType: 'manual_addition', ...overrides
  };
}

// بند ۲۱ AGENTS.md: بعد از registerInvoice/approveRegistration فاکتور اول در انتظار تأیید
// سرپرست است، نه مستقیماً registered — این Helper همان مرحلهٔ تأیید سرپرست را برای تست‌هایی که
// یک فاکتور واقعاً «ثبت‌شده» (نه فقط منتظر سرپرست) لازم دارند شبیه‌سازی می‌کند.
function approveSupervisor(invoice: SalesInvoice, now: string): SalesInvoice {
  const result = approveSupervisorInvoice(invoice, { approverUserId: 'sup_1', approverUserName: 'سرپرست', snapshotSupervisorUserId: 'sup_1', isSuccessor: false }, now);
  if (result.ok === false) throw new Error('setup failed: ' + result.reason);
  return result.invoice;
}

describe('generateInvoiceCode', () => {
  it('starts at INV-0001 with no existing invoices', () => {
    expect(generateInvoiceCode([])).toBe('INV-0001');
  });
  it('increments past the highest existing numeric suffix', () => {
    const invoices = [{ invoiceCode: 'INV-0005' } as SalesInvoice, { invoiceCode: 'INV-0002' } as SalesInvoice];
    expect(generateInvoiceCode(invoices)).toBe('INV-0006');
  });
});

describe('computeLineTotal / computeInvoiceTotals — discount and totals', () => {
  it('computes a single line total as quantity*unitPrice - discount', () => {
    expect(computeLineTotal(2, 1000000, 100000)).toBe(1900000);
  });
  it('never goes negative even if discount exceeds the line value', () => {
    expect(computeLineTotal(1, 100, 500)).toBe(0);
  });
  it('sums subtotal/discount/final across multiple lines correctly', () => {
    const lines = [makeLineItem({ id: 'a', quantity: 1, unitPrice: 1000000, discount: 0 }), makeLineItem({ id: 'b', quantity: 2, unitPrice: 500000, discount: 100000 })];
    const totals = computeInvoiceTotals(lines);
    expect(totals.subtotal).toBe(2000000);
    expect(totals.totalDiscount).toBe(100000);
    expect(totals.finalAmount).toBe(1900000);
  });
});

describe('buildDraftInvoice — invoice code immutability', () => {
  it('assigns the invoice code once at draft creation and it never changes across the lifecycle', () => {
    const draft = buildDraftInvoice({
      customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()]
    }, [], 't0');
    const code = draft.invoiceCode;

    const registered = registerInvoice(draft, { id: 'sp_1', fullName: 'فروشنده' }, 't1');
    expect(registered.ok).toBe(true);
    if (registered.ok === false) return;
    expect(registered.invoice.status).toBe('awaiting_supervisor_approval');
    expect(registered.invoice.invoiceCode).toBe(code);
    const approvedInvoice = approveSupervisor(registered.invoice, 't1b');

    const payment: DeclaredPayment = { id: 'p1', amount: 500000, date: 't2', method: 'cash', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't2', status: 'declared' };
    const paid = addDeclaredPayment(approvedInvoice, payment, 't2');
    expect(paid.ok).toBe(true);
    if (paid.ok === false) return;
    expect(paid.invoice.invoiceCode).toBe(code);
  });

  it('rejects registering an invoice with no line items', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [] }, [], 't0');
    const result = registerInvoice(draft, { id: 'sp_1', fullName: 'فروشنده' }, 't1');
    expect(result.ok).toBe(false);
  });
});

describe('addDeclaredPayment — multi-stage payment and remainder', () => {
  // بند ۵ مأموریت تکمیل فلو فاکتور: approveSupervisorInvoice دیگر «registered» تولید نمی‌کند
  // (مقصد awaiting_coordination_manager است) — وضعیت «registered» اکنون فقط از مسیر قدیمی/دستی
  // قابل ساخت است؛ همچنان یک فیکسچر معتبر برای تست مستقل خودِ addDeclaredPayment/deriveStatusAfterPayment.
  function registeredInvoice(): SalesInvoice {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem({ quantity: 1, unitPrice: 10000000, discount: 0 })] }, [], 't0');
    return { ...draft, status: 'registered' as const };
  }

  it('marks the invoice partial_payment when paid amount is less than final amount', () => {
    const invoice = registeredInvoice();
    const result = addDeclaredPayment(invoice, { id: 'p1', amount: 4000000, date: 't2', method: 'cash', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't2', status: 'declared' }, 't2');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.invoice.status).toBe('partial_payment');
    expect(result.invoice.paidAmount).toBe(4000000);
    expect(result.invoice.remainingAmount).toBe(6000000);
  });

  it('accumulates multiple declared payments and recomputes the remainder correctly', () => {
    let invoice = registeredInvoice();
    let result = addDeclaredPayment(invoice, { id: 'p1', amount: 3000000, date: 't2', method: 'cash', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't2', status: 'declared' }, 't2');
    if (result.ok === false) throw new Error('unexpected');
    invoice = result.invoice;
    result = addDeclaredPayment(invoice, { id: 'p2', amount: 7000000, date: 't3', method: 'card_to_card', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't3', status: 'declared' }, 't3');
    if (result.ok === false) throw new Error('unexpected');
    expect(result.invoice.paidAmount).toBe(10000000);
    expect(result.invoice.remainingAmount).toBe(0);
    expect(result.invoice.declaredPayments).toHaveLength(2);
  });

  it('accepts declared payments while the invoice is still an open draft', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const result = addDeclaredPayment(draft, { id: 'p1', amount: 100, date: 't1', method: 'cash', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't1', status: 'declared' }, 't1');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.invoice.declaredPayments).toHaveLength(1);
    expect(result.invoice.status).toBe('draft');
  });
});

describe('submitForFinancialReview / returnInvoiceToSalesperson', () => {
  it('legacy direct submission is blocked even when a fixture is manually marked registered', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const registered: SalesInvoice = {
      ...draft, status: 'registered' as const,
      supervisorApproval: { approverUserId: 'sup_1', approverUserName: 'سرپرست', snapshotSupervisorUserId: 'sup_1', isSuccessor: false, approvedAt: 't1b' }
    };
    const submitted = submitForFinancialReview(registered, { id: 'sp_1', fullName: 'فروشنده' }, 't2');
    expect(submitted.ok).toBe(false);
  });

  // مأموریت چرخهٔ عمر نیروی فروش، تست الزامی ۲۰: فاکتور بدون تأیید سرپرست به مالی نمی‌رود.
  it('never allows submitting a registered-but-not-yet-supervisor-approved invoice straight to financial review', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const registered = registerInvoice(draft, { id: 'sp_1', fullName: 'فروشنده' }, 't1');
    if (registered.ok === false) throw new Error('unexpected');
    expect(registered.invoice.status).toBe('awaiting_supervisor_approval');
    expect(registered.invoice.supervisorApproval).toBeUndefined();
    // یک فاکتور در وضعیت awaiting_supervisor_approval اصلاً نمی‌تواند وارد submitForFinancialReview
    // شود (status گارد اول رد می‌کند)؛ حتی اگر با دستکاری مستقیم به registered برسد ولی هنوز
    // supervisorApproval ندارد، گارد دوم صریح آن را رد می‌کند.
    const manuallyForced = { ...registered.invoice, status: 'registered' as const };
    const result = submitForFinancialReview(manuallyForced, { id: 'sp_1', fullName: 'فروشنده' }, 't2');
    expect(result.ok).toBe(false);
  });

  it('rejects returning an invoice without a reason', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const result = returnInvoiceToSalesperson(draft, '', { id: 'sup_1', fullName: 'سرپرست' }, 't1');
    expect(result.ok).toBe(false);
  });

  it('returns an invoice to the salesperson with a reason recorded in history', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const result = returnInvoiceToSalesperson(draft, 'مدارک مشتری ناقص است', { id: 'sup_1', fullName: 'سرپرست' }, 't1');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.invoice.status).toBe('returned_to_salesperson');
    expect(result.invoice.history.at(-1)?.note).toBe('مدارک مشتری ناقص است');
  });
});

describe('splitPromotionIntoLineItems — combined promotion splits into real goods/service rows', () => {
  const products: Product[] = [
    { id: 'prod_1', code: 'P-1', name: 'کالای پروموشن', category: 'x', unit: 'دستگاه', quantity: 10, purchasePrice: 100, salePrice: 400000000, isActive: true }
  ];
  const services: ServiceCatalogItem[] = [
    { id: 'svc_1', code: 'S-1', name: 'خدمت پروموشن', category: 'x', salePrice: 300000000, requiresActivation: false, isActive: true }
  ];
  const promotion: Promotion = {
    id: 'promo_1', code: 'PR-002', title: 'بستهٔ ترکیبی', version: 2,
    coreItems: [
      { itemType: 'goods', itemId: 'prod_1', itemName: 'کالای پروموشن', quantity: 1 },
      { itemType: 'service', itemId: 'svc_1', itemName: 'خدمت پروموشن', quantity: 1 }
    ],
    basePrice: 700000000, discountAmount: 50000000, finalPrice: 650000000, status: 'active', createdAt: 'x', createdByUserId: 'u', createdByUserName: 'u'
  };

  it('produces one real row per core item instead of a single fake goods row', () => {
    const rows = splitPromotionIntoLineItems(promotion, products, services);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.itemType).sort()).toEqual(['goods', 'service']);
  });

  it('sets promotionId/promotionVersion/sourceType on every split row', () => {
    const rows = splitPromotionIntoLineItems(promotion, products, services);
    for (const row of rows) {
      expect(row.promotionId).toBe('promo_1');
      expect(row.promotionVersion).toBe(2);
      expect(row.sourceType).toBe('promotion_core');
    }
  });

  it('guarantees the sum of split row totals exactly equals the promotion finalPrice', () => {
    const rows = splitPromotionIntoLineItems(promotion, products, services);
    const sum = rows.reduce((s, r) => s + r.lineTotal, 0);
    expect(sum).toBe(promotion.finalPrice);
  });

  it('still sums exactly even when catalog prices have drifted from the promotion basePrice', () => {
    const driftedProducts: Product[] = [{ ...products[0], salePrice: 999999999 }];
    const rows = splitPromotionIntoLineItems(promotion, driftedProducts, services);
    const sum = rows.reduce((s, r) => s + r.lineTotal, 0);
    expect(sum).toBe(promotion.finalPrice);
  });
});

describe('direct supervisor submission — registration is an entry channel, not an approval gate', () => {
  it('moves a fully declared draft directly to the supervisor and then coordination', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const withPayment = addDeclaredPayment(draft, { id: 'p1', amount: draft.finalAmount, date: 't1', method: 'cash', recordedByUserId: 'entry_1', recordedByUserName: 'واحد ثبت', recordedAt: 't1', status: 'declared' }, 't1');
    if (withPayment.ok === false) throw new Error('unexpected');
    const submitted = submitInvoiceToSupervisor(withPayment.invoice, { id: 'entry_1', fullName: 'واحد ثبت' }, 't2');
    expect(submitted.ok).toBe(true);
    if (submitted.ok === false) return;
    expect(submitted.invoice.status).toBe('awaiting_supervisor_approval');
    expect(submitted.invoice.invoiceCode).toBe(draft.invoiceCode);

    const supervisorApproved = approveSupervisorInvoice(
      submitted.invoice, { approverUserId: 'sup_1', approverUserName: 'سرپرست', snapshotSupervisorUserId: 'sup_1', isSuccessor: false }, 't3'
    );
    expect(supervisorApproved.ok).toBe(true);
    if (supervisorApproved.ok === false) return;
    expect(supervisorApproved.invoice.status).toBe('awaiting_coordination_manager');
    expect(supervisorApproved.invoice.supervisorApproval?.approverUserId).toBe('sup_1');
    expect(supervisorApproved.invoice.invoiceCode).toBe(draft.invoiceCode);
  });

  it('keeps a partially paid invoice open and rejects supervisor submission', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const withPayment = addDeclaredPayment(draft, { id: 'p1', amount: 100, date: 't1', method: 'cash', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't1', status: 'declared' }, 't1');
    if (withPayment.ok === false) throw new Error('unexpected');
    const submitted = submitInvoiceToSupervisor(withPayment.invoice, { id: 'sp_1', fullName: 'فروشنده' }, 't2');
    expect(submitted.ok).toBe(false);
    expect(withPayment.invoice.status).toBe('draft');
  });

  it('records successor approval details when a snapshot supervisor was inactive', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const registered = registerInvoice(draft, { id: 'sp_1', fullName: 'فروشنده' }, 't1');
    if (registered.ok === false) throw new Error('unexpected');
    const result = approveSupervisorInvoice(
      registered.invoice,
      { approverUserId: 'senior_1', approverUserName: 'سرپرست ارشد', snapshotSupervisorUserId: 'sup_old', isSuccessor: true, successorReason: 'سرپرست اصلی غیرفعال بود' },
      't2'
    );
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.invoice.supervisorApproval?.isSuccessor).toBe(true);
    expect(result.invoice.supervisorApproval?.snapshotSupervisorUserId).toBe('sup_old');
  });

  it('rejects supervisor-approving an invoice not currently awaiting supervisor approval', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const result = approveSupervisorInvoice(draft, { approverUserId: 'sup_1', approverUserName: 'سرپرست', snapshotSupervisorUserId: 'sup_1', isSuccessor: false }, 't1');
    expect(result.ok).toBe(false);
  });

  it('rejects approving registration on an invoice that is not awaiting review', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const result = approveRegistration(draft, { id: 'entry_1', fullName: 'واحد ثبت' }, 't1');
    expect(result.ok).toBe(false);
  });
});

describe('editInvoiceLineItems — real Draft editing, invoice code stability, revision on return', () => {
  it('edits line items on a draft without changing the invoice code or bumping revision', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const edited = editInvoiceLineItems(draft, [makeLineItem({ id: 'li_2', quantity: 3, unitPrice: 500000, discount: 0, lineTotal: 1500000 })], { id: 'sp_1', fullName: 'فروشنده' }, 't1');
    expect(edited.ok).toBe(true);
    if (edited.ok === false) return;
    expect(edited.invoice.invoiceCode).toBe(draft.invoiceCode);
    expect(edited.invoice.revision).toBe(1);
    expect(edited.invoice.finalAmount).toBe(1500000);
  });

  it('bumps revision (never invoiceCode) and resets to draft when editing after a return', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const returned = returnInvoiceToSalesperson(draft, 'مدارک ناقص', { id: 'sup_1', fullName: 'سرپرست' }, 't1');
    if (returned.ok === false) throw new Error('unexpected');
    const edited = editInvoiceLineItems(returned.invoice, [makeLineItem()], { id: 'sp_1', fullName: 'فروشنده' }, 't2');
    expect(edited.ok).toBe(true);
    if (edited.ok === false) return;
    expect(edited.invoice.invoiceCode).toBe(draft.invoiceCode);
    expect(edited.invoice.revision).toBe(2);
    expect(edited.invoice.status).toBe('draft');
  });

  it('rejects editing an invoice that is already registered', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem()] }, [], 't0');
    const registered = registerInvoice(draft, { id: 'sp_1', fullName: 'فروشنده' }, 't1');
    if (registered.ok === false) throw new Error('unexpected');
    const edited = editInvoiceLineItems(registered.invoice, [makeLineItem()], { id: 'sp_1', fullName: 'فروشنده' }, 't2');
    expect(edited.ok).toBe(false);
  });
});

describe('decideDeclaredPayment / computeApprovedPaymentSummary — row-level financial confirmation', () => {
  // بند ۵ مأموریت تکمیل فلو فاکتور: مسیر واقعی جدید به مالی از هماهنگی عبور می‌کند
  // (coordinationCase.test.ts آن را پوشش می‌دهد)؛ این فیکسچر فقط رفتار مستقل decideDeclaredPayment
  // را روی یک فاکتور در انتظار بررسی مالی می‌سنجد، بدون وابستگی به زنجیرهٔ کامل هماهنگی.
  function invoiceAwaitingFinancialReview(finalAmount: number): SalesInvoice {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [makeLineItem({ quantity: 1, unitPrice: finalAmount, discount: 0, lineTotal: finalAmount })] }, [], 't0');
    return {
      ...draft, status: 'awaiting_financial_confirmation' as const,
      supervisorApproval: { approverUserId: 'sup_1', approverUserName: 'سرپرست', snapshotSupervisorUserId: 'sup_1', isSuccessor: false, approvedAt: 't1b' }
    };
  }
  function withPayment(invoice: SalesInvoice, id: string, amount: number): SalesInvoice {
    const payment: DeclaredPayment = { id, amount, date: 't3', method: 'cash', recordedByUserId: 'sp_1', recordedByUserName: 'فروشنده', recordedAt: 't3', status: 'declared' };
    return { ...invoice, declaredPayments: [...invoice.declaredPayments, payment] };
  }

  it('excludes a rejected row entirely from the approved total', () => {
    let invoice = invoiceAwaitingFinancialReview(1000000);
    invoice = withPayment(invoice, 'p1', 1000000);
    const rejected = decideDeclaredPayment(invoice, 'p1', 'rejected', undefined, 'مدرک نامعتبر', { id: 'fin_1', fullName: 'مسئول مالی' }, 't4');
    expect(rejected.ok).toBe(true);
    if (rejected.ok === false) return;
    const summary = computeApprovedPaymentSummary(rejected.invoice.finalAmount, rejected.invoice.declaredPayments);
    expect(summary.approvedTotal).toBe(0);
    expect(rejected.invoice.status).toBe('awaiting_financial_confirmation');
  });

  it('reaches financial_confirmed only when approved rows exactly match the final amount', () => {
    let invoice = invoiceAwaitingFinancialReview(658400000);
    invoice = withPayment(invoice, 'p1', 200000000);
    invoice = withPayment(invoice, 'p2', 150000000);
    invoice = withPayment(invoice, 'p3', 458400000);

    let result = decideDeclaredPayment(invoice, 'p1', 'approved', 200000000, undefined, { id: 'fin_1', fullName: 'مسئول مالی' }, 't4');
    if (result.ok === false) throw new Error('unexpected');
    invoice = result.invoice;
    expect(invoice.status).toBe('awaiting_financial_confirmation');

    result = decideDeclaredPayment(invoice, 'p2', 'rejected', undefined, 'واریز نامرتبط', { id: 'fin_1', fullName: 'مسئول مالی' }, 't5');
    if (result.ok === false) throw new Error('unexpected');
    invoice = result.invoice;
    expect(invoice.status).toBe('awaiting_financial_confirmation');

    result = decideDeclaredPayment(invoice, 'p3', 'approved', 458400000, undefined, { id: 'fin_1', fullName: 'مسئول مالی' }, 't6');
    if (result.ok === false) throw new Error('unexpected');
    invoice = result.invoice;

    const summary = computeApprovedPaymentSummary(invoice.finalAmount, invoice.declaredPayments);
    expect(summary.approvedTotal).toBe(658400000);
    expect(summary.remainingAmount).toBe(0);
    expect(invoice.status).toBe('financial_confirmed');
  });

  it('never auto-confirms on overpayment — flags a discrepancy instead', () => {
    let invoice = invoiceAwaitingFinancialReview(1000000);
    invoice = withPayment(invoice, 'p1', 1500000);
    const result = decideDeclaredPayment(invoice, 'p1', 'approved', 1500000, undefined, { id: 'fin_1', fullName: 'مسئول مالی' }, 't4');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.invoice.status).not.toBe('financial_confirmed');
    const summary = computeApprovedPaymentSummary(result.invoice.finalAmount, result.invoice.declaredPayments);
    expect(summary.hasDiscrepancy).toBe(true);
  });

  it('rejects an approval decision that lacks a positive approved amount', () => {
    let invoice = invoiceAwaitingFinancialReview(1000000);
    invoice = withPayment(invoice, 'p1', 1000000);
    const result = decideDeclaredPayment(invoice, 'p1', 'approved', undefined, undefined, { id: 'fin_1', fullName: 'مسئول مالی' }, 't4');
    expect(result.ok).toBe(false);
  });

  it('rejects a rejection/correction decision that lacks a reason', () => {
    let invoice = invoiceAwaitingFinancialReview(1000000);
    invoice = withPayment(invoice, 'p1', 1000000);
    const result = decideDeclaredPayment(invoice, 'p1', 'rejected', undefined, '', { id: 'fin_1', fullName: 'مسئول مالی' }, 't4');
    expect(result.ok).toBe(false);
  });
});

describe('price Snapshot — later catalog price changes never touch an already-built invoice', () => {
  it('keeps an existing line item unitPrice/lineTotal unchanged after the source catalog price object mutates', () => {
    const catalogProduct = { salePrice: 1000000 };
    const line = makeLineItem({ unitPrice: catalogProduct.salePrice, quantity: 1, discount: 0, lineTotal: catalogProduct.salePrice });
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [line] }, [], 't0');

    // فرض تغییر بعدی قیمت در کاتالوگ — روی خودِ آبجکت کاتالوگ، نه روی فاکتور
    catalogProduct.salePrice = 5000000;

    expect(draft.lineItems[0].unitPrice).toBe(1000000);
    expect(draft.lineItems[0].lineTotal).toBe(1000000);
    expect(draft.finalAmount).toBe(1000000);
  });
});

describe('test 11 — a later sales-org assignment change never rewrites a previous invoice Snapshot', () => {
  const branches: SalesBranch[] = [
    { id: 'b1', code: 'B1', name: 'شعبه یک', companyId: 'comp_sales', isActive: true },
    { id: 'b2', code: 'B2', name: 'شعبه دو', companyId: 'comp_sales', isActive: true }
  ];
  const users: User[] = [
    { id: 'sp', username: 'sp', password: 'x', fullName: 'فروشنده', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
    { id: 'sup_old', username: 'sup_old', password: 'x', fullName: 'سرپرست قدیم', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
    { id: 'sup_new', username: 'sup_new', password: 'x', fullName: 'سرپرست جدید', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
    { id: 'senior', username: 'senior', password: 'x', fullName: 'سرپرست ارشد', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
    { id: 'mgr', username: 'mgr', password: 'x', fullName: 'مدیر فروش', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
    { id: 'dep', username: 'dep', password: 'x', fullName: 'معاونت فروش', phone: '', email: '', role: 'member', roleTitle: '', isActive: true }
  ];

  function assignmentsWithSupervisor(supervisorId: string): SalesOrgAssignment[] {
    return [
      { id: 'a1', userId: 'sp', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], directManagerUserId: supervisorId, validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a2', userId: supervisorId, salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'senior', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a3', userId: 'senior', salesRoleId: 'role_senior_sales_supervisor', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'mgr', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a4', userId: 'mgr', salesRoleId: 'role_sales_manager', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'dep', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a5', userId: 'dep', salesRoleId: 'role_sales_deputy', salesBranchIds: ['b1', 'b2'], directManagerUserId: undefined, validFrom: 't0', isActive: true, changedAt: 't0' }
    ];
  }

  it('keeps the first invoice pointing at the old supervisor even after the salesperson is reassigned to a new one', () => {
    // فاکتور اول در لحظه‌ای ساخته می‌شود که مدیر مستقیم فروشنده sup_old است
    const firstSnapshot = buildSalesHierarchySnapshot('sp', assignmentsWithSupervisor('sup_old'), users, branches, 't1');
    expect(firstSnapshot.ok).toBe(true);
    if (firstSnapshot.ok === false) return;
    const invoice1 = buildDraftInvoice(
      { customerId: 'c1', salespersonUserId: 'sp', salespersonUserName: 'فروشنده', salesHierarchySnapshot: firstSnapshot.snapshot, lineItems: [makeLineItem()] },
      [], 't1'
    );
    expect(invoice1.salesHierarchySnapshot?.supervisorUserId).toBe('sup_old');

    // بعداً ادمین فروشنده را به سرپرست جدید (sup_new) منتقل می‌کند — یک فاکتور دوم بعد از این تغییر ساخته می‌شود
    const secondSnapshot = buildSalesHierarchySnapshot('sp', assignmentsWithSupervisor('sup_new'), users, branches, 't2');
    expect(secondSnapshot.ok).toBe(true);
    if (secondSnapshot.ok === false) return;
    const invoice2 = buildDraftInvoice(
      { customerId: 'c1', salespersonUserId: 'sp', salespersonUserName: 'فروشنده', salesHierarchySnapshot: secondSnapshot.snapshot, lineItems: [makeLineItem()] },
      [invoice1], 't2'
    );
    expect(invoice2.salesHierarchySnapshot?.supervisorUserId).toBe('sup_new');

    // فاکتور اول باید دقیقاً همان Snapshot قدیمی را نگه دارد — تغییر سازمانی بعدی هرگز آن را بازنویسی نمی‌کند
    expect(invoice1.salesHierarchySnapshot?.supervisorUserId).toBe('sup_old');
  });
});
