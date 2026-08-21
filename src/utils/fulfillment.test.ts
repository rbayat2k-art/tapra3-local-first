import { describe, it, expect } from 'vitest';
import {
  generateFulfillmentCases, markProductReadyForDispatch, dispatchProductCase, markProductDelivered,
  assignServiceCaseToProjectManager, assignServiceCaseToEmployee, reassignServiceCaseEmployee,
  startServiceCase, recordServiceCoordination, holdServiceCase, resumeServiceCase,
  submitServiceCaseForConfirmation, approveServiceCaseCompletion, returnServiceCaseForCorrection,
  closeServiceCase, computeInvoiceFulfillmentStatus
} from './fulfillment';
import type { SalesInvoice, SalesInvoiceLineItem, ProductFulfillmentCase, ServiceFulfillmentCase, ServiceCatalogItem } from '../types';

function makeInvoice(lineItems: SalesInvoiceLineItem[], overrides: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: 'inv_1', invoiceCode: 'INV-0001', revision: 1, customerId: 'cust_1',
    salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems,
    subtotal: 0, totalDiscount: 0, finalAmount: 0, paidAmount: 0, remainingAmount: 0,
    status: 'financial_confirmed', declaredPayments: [], history: [], createdAt: 't0', updatedAt: 't0',
    ...overrides
  };
}

const goodsLine1: SalesInvoiceLineItem = { id: 'li_g1', itemType: 'goods', productId: 'prod_1', name: 'کالای ۱', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100, sourceType: 'manual_addition' };
const goodsLine2: SalesInvoiceLineItem = { id: 'li_g2', itemType: 'goods', productId: 'prod_2', name: 'کالای ۲', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100, sourceType: 'manual_addition' };
const serviceLine1: SalesInvoiceLineItem = { id: 'li_s1', itemType: 'service', serviceId: 'svc_1', name: 'خدمت ۱', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100, sourceType: 'manual_addition' };
const serviceLine2: SalesInvoiceLineItem = { id: 'li_s2', itemType: 'service', serviceId: 'svc_2', name: 'خدمت ۲', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100, sourceType: 'manual_addition' };
const serviceLine3: SalesInvoiceLineItem = { id: 'li_s3', itemType: 'service', serviceId: 'svc_3', name: 'خدمت ۳', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100, sourceType: 'manual_addition' };

describe('generateFulfillmentCases — idempotent creation of exactly one case per row', () => {
  it('creates one ProductFulfillmentCase per goods row and one ServiceFulfillmentCase per service row', () => {
    const invoice = makeInvoice([goodsLine1, goodsLine2, serviceLine1, serviceLine2, serviceLine3]);
    const { newProductCases, newServiceCases } = generateFulfillmentCases(invoice, [], [], 't1');
    expect(newProductCases).toHaveLength(2);
    expect(newServiceCases).toHaveLength(3);
    expect(newProductCases.every((c) => c.status === 'pending_coordination')).toBe(true);
    expect(newServiceCases.every((c) => c.status === 'pending_assignment')).toBe(true);
  });

  it('never creates duplicate cases when run again on the same invoice', () => {
    const invoice = makeInvoice([goodsLine1, serviceLine1]);
    const first = generateFulfillmentCases(invoice, [], [], 't1');
    const second = generateFulfillmentCases(invoice, first.newProductCases, first.newServiceCases, 't2');
    expect(second.newProductCases).toHaveLength(0);
    expect(second.newServiceCases).toHaveLength(0);
  });

  it('each case links back to its invoice and specific line item', () => {
    const invoice = makeInvoice([goodsLine1, serviceLine1]);
    const { newProductCases, newServiceCases } = generateFulfillmentCases(invoice, [], [], 't1');
    expect(newProductCases[0].invoiceId).toBe('inv_1');
    expect(newProductCases[0].lineItemId).toBe('li_g1');
    expect(newServiceCases[0].invoiceId).toBe('inv_1');
    expect(newServiceCases[0].lineItemId).toBe('li_s1');
  });
});

describe('product fulfillment cycle — pending_coordination → ready_for_dispatch → dispatched → delivered', () => {
  function baseCase(): ProductFulfillmentCase {
    return {
      id: 'pfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_g1', productId: 'prod_1',
      productName: 'کالای ۱', customerId: 'cust_1', quantity: 1, status: 'pending_coordination', timeline: [], createdAt: 't0', updatedAt: 't0'
    };
  }

  it('walks the full cycle to delivered', () => {
    let kase = baseCase();
    const actor = { id: 'op_1', fullName: 'اپراتور هماهنگی' };
    const ready = markProductReadyForDispatch(kase, actor, 't1');
    expect(ready.ok).toBe(true);
    if (ready.ok === false) return;
    kase = ready.case;

    const dispatched = dispatchProductCase(kase, { id: 'disp_1', fullName: 'اپراتور ارسال' }, actor, 't2');
    expect(dispatched.ok).toBe(true);
    if (dispatched.ok === false) return;
    kase = dispatched.case;
    expect(kase.status).toBe('dispatched');

    const delivered = markProductDelivered(kase, { id: 'del_1', fullName: 'نمایندهٔ تحویل' }, actor, 't3');
    expect(delivered.ok).toBe(true);
    if (delivered.ok === false) return;
    expect(delivered.case.status).toBe('delivered');
  });

  it('rejects skipping a stage (dispatch before ready)', () => {
    const kase = baseCase();
    const result = dispatchProductCase(kase, { id: 'disp_1', fullName: 'اپراتور ارسال' }, { id: 'op_1', fullName: 'اپراتور' }, 't1');
    expect(result.ok).toBe(false);
  });
});

describe('service fulfillment cycle — personal execution and manager confirmation', () => {
  function baseCase(): ServiceFulfillmentCase {
    return {
      id: 'sfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s1', serviceId: 'svc_1',
      serviceName: 'خدمت ۱', customerId: 'cust_1', quantity: 1, status: 'pending_assignment', timeline: [], createdAt: 't0', updatedAt: 't0'
    };
  }

  it('walks the full cycle to completed independently of other cases', () => {
    let kase = baseCase();
    const actor = { id: 'admin_1', fullName: 'ادمین' };
    const toPm = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژه' }, actor, 't1');
    if (toPm.ok === false) throw new Error('unexpected');
    kase = toPm.case;

    const toEmployee = assignServiceCaseToEmployee(kase, { id: 'emp_1', fullName: 'کارمند اجرا' }, { id: 'pm_1', fullName: 'مدیر پروژه' }, 't2');
    if (toEmployee.ok === false) throw new Error('unexpected');
    kase = toEmployee.case;

    const started = startServiceCase(kase, { id: 'emp_1', fullName: 'کارمند اجرا' }, 't3');
    if (started.ok === false) throw new Error('unexpected');
    kase = started.case;
    expect(kase.status).toBe('in_progress');

    const submitted = submitServiceCaseForConfirmation(kase, {
      completionNote: 'فعال‌سازی با موفقیت انجام شد', evidenceType: 'activation_code',
      evidenceTitle: 'کد فعال‌سازی', evidenceReference: 'ACT-1001',
      customerConfirmationMethod: 'recorded_phone', customerConfirmationReference: 'CALL-20'
    }, { id: 'emp_1', fullName: 'کارمند اجرا' }, '2026-08-09T10:00:00.000Z');
    expect(submitted.ok).toBe(true);
    if (submitted.ok === false) return;
    expect(submitted.case.status).toBe('awaiting_confirmation');
    expect(submitted.case.completionEvidence).toHaveLength(1);

    const completed = approveServiceCaseCompletion(submitted.case, 'مدرک بررسی شد', { id: 'pm_1', fullName: 'مدیر پروژه' }, '2026-08-09T10:05:00.000Z');
    expect(completed.ok).toBe(true);
    if (completed.ok === false) return;
    expect(completed.case.status).toBe('completed');
    expect(completed.case.timeline.at(-1)?.timeWithSeconds).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('rejects submitting a case that has not started', () => {
    const kase = baseCase();
    const result = submitServiceCaseForConfirmation(kase, {
      completionNote: 'انجام شد', customerConfirmationMethod: 'not_required'
    }, { id: 'emp_1', fullName: 'کارمند اجرا' }, 't1');
    expect(result.ok).toBe(false);
  });
});

describe('security/scope hardening — service case ownership and unit territory', () => {
  function baseCase(overrides: Partial<ServiceFulfillmentCase> = {}): ServiceFulfillmentCase {
    return {
      id: 'sfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s1', serviceId: 'svc_1',
      serviceName: 'خدمت ۱', customerId: 'cust_1', quantity: 1, status: 'pending_assignment', timeline: [], createdAt: 't0', updatedAt: 't0',
      ...overrides
    };
  }

  it('rejects a project manager referring a case that was claimed by a different project manager', () => {
    let kase = baseCase();
    const claim = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژهٔ اول' }, { id: 'pm_1', fullName: 'مدیر پروژهٔ اول' }, 't1');
    if (claim.ok === false) throw new Error('unexpected');
    kase = claim.case;

    const hijack = assignServiceCaseToEmployee(kase, { id: 'emp_1', fullName: 'کارمند اجرا' }, { id: 'pm_2', fullName: 'مدیر پروژهٔ دوم' }, 't2');
    expect(hijack.ok).toBe(false);
    if (hijack.ok === false) expect(hijack.reason).toContain('مدیر پروژهٔ دیگری');
  });

  it('allows an admin to refer a case even though it belongs to a different project manager', () => {
    let kase = baseCase();
    const claim = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژهٔ اول' }, { id: 'pm_1', fullName: 'مدیر پروژهٔ اول' }, 't1');
    if (claim.ok === false) throw new Error('unexpected');
    kase = claim.case;

    const asAdmin = assignServiceCaseToEmployee(kase, { id: 'emp_1', fullName: 'کارمند اجرا' }, { id: 'admin_1', fullName: 'ادمین' }, 't2', true);
    expect(asAdmin.ok).toBe(true);
  });

  it('rejects an employee starting a case that was referred to a different employee', () => {
    const kase = baseCase({ status: 'assigned_to_employee', projectManagerUserId: 'pm_1', assignedEmployeeUserId: 'emp_1' });
    const result = startServiceCase(kase, { id: 'emp_2', fullName: 'کارمند دیگر' }, 't1');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain('کارمند دیگری');
  });

  it('rejects an employee submitting a case that was referred to a different employee', () => {
    const kase = baseCase({ status: 'in_progress', projectManagerUserId: 'pm_1', assignedEmployeeUserId: 'emp_1' });
    const result = submitServiceCaseForConfirmation(kase, {
      completionNote: 'انجام شد', customerConfirmationMethod: 'not_required'
    }, { id: 'emp_2', fullName: 'کارمند دیگر' }, 't1');
    expect(result.ok).toBe(false);
  });

  it('allows the actual assigned employee to start and submit their own case', () => {
    let kase = baseCase({ status: 'assigned_to_employee', projectManagerUserId: 'pm_1', assignedEmployeeUserId: 'emp_1' });
    const started = startServiceCase(kase, { id: 'emp_1', fullName: 'کارمند اجرا' }, 't1');
    expect(started.ok).toBe(true);
    if (started.ok === false) return;
    kase = started.case;
    const submitted = submitServiceCaseForConfirmation(kase, {
      completionNote: 'انجام شد', customerConfirmationMethod: 'not_required'
    }, { id: 'emp_1', fullName: 'کارمند اجرا' }, 't2');
    expect(submitted.ok).toBe(true);
  });

  it('allows an admin to start a case regardless of who it was assigned to', () => {
    const kase = baseCase({ status: 'assigned_to_employee', projectManagerUserId: 'pm_1', assignedEmployeeUserId: 'emp_1' });
    const result = startServiceCase(kase, { id: 'admin_1', fullName: 'ادمین' }, 't1', true);
    expect(result.ok).toBe(true);
  });

  it('requires the owning project manager to approve the submitted result', () => {
    const kase = baseCase({ status: 'awaiting_confirmation', projectManagerUserId: 'pm_1', assignedEmployeeUserId: 'emp_1' });
    expect(approveServiceCaseCompletion(kase, '', { id: 'pm_2', fullName: 'مدیر دیگر' }, 't1').ok).toBe(false);
    expect(approveServiceCaseCompletion(kase, '', { id: 'pm_1', fullName: 'مدیر مالک' }, 't1').ok).toBe(true);
  });

  it('rejects a project manager claiming a case whose responsibleUnit is outside their assigned units', () => {
    const kase = baseCase({ responsibleUnit: 'واحد باغبانی' });
    const result = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژه' }, { id: 'pm_1', fullName: 'مدیر پروژه' }, 't1', false, ['واحد نصب']);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain('قلمرو');
  });

  it('allows a project manager to claim a case whose responsibleUnit matches one of their assigned units', () => {
    const kase = baseCase({ responsibleUnit: 'واحد نصب' });
    const result = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژه' }, { id: 'pm_1', fullName: 'مدیر پروژه' }, 't1', false, ['واحد نصب', 'واحد گارانتی']);
    expect(result.ok).toBe(true);
  });

  it('leaves an unrestricted project manager (no responsibleUnits set) able to claim any case — backward compatible default', () => {
    const kase = baseCase({ responsibleUnit: 'واحد باغبانی' });
    const result = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژه' }, { id: 'pm_1', fullName: 'مدیر پروژه' }, 't1');
    expect(result.ok).toBe(true);
  });

  it('leaves a case with no responsibleUnit snapshot visible to every project manager regardless of their units', () => {
    const kase = baseCase({ responsibleUnit: undefined });
    const result = assignServiceCaseToProjectManager(kase, { id: 'pm_1', fullName: 'مدیر پروژه' }, { id: 'pm_1', fullName: 'مدیر پروژه' }, 't1', false, ['واحد نصب']);
    expect(result.ok).toBe(true);
  });

  it('admin claiming ignores unit restrictions entirely', () => {
    const kase = baseCase({ responsibleUnit: 'واحد باغبانی' });
    const result = assignServiceCaseToProjectManager(kase, { id: 'admin_1', fullName: 'ادمین' }, { id: 'admin_1', fullName: 'ادمین' }, 't1', true, ['واحد نصب']);
    expect(result.ok).toBe(true);
  });
});

describe('service operations — waiting, correction, reassignment and terminal reasons', () => {
  const actorEmployee = { id: 'emp_1', fullName: 'کارمند اجرا' };
  const actorManager = { id: 'pm_1', fullName: 'مدیر پروژه' };
  const base = (overrides: Partial<ServiceFulfillmentCase> = {}): ServiceFulfillmentCase => ({
    id: 'sfc_ops', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s1', serviceId: 'svc_1',
    serviceName: 'خدمت ۱', customerId: 'cust_1', quantity: 1, status: 'in_progress',
    projectManagerUserId: 'pm_1', assignedEmployeeUserId: 'emp_1', timeline: [], createdAt: 't0', updatedAt: 't0', ...overrides
  });

  it('records a callback as a reasoned wait and can resume it without losing history', () => {
    const contacted = recordServiceCoordination(base(), 'callback_requested', 'فردا ساعت ۱۰ تماس بگیرید', actorEmployee, '2026-08-09T10:00:00.000Z');
    expect(contacted.ok).toBe(true);
    if (!contacted.ok) return;
    expect(contacted.case.status).toBe('waiting');
    expect(contacted.case.waitReason).toContain('تماس مجدد');
    const resumed = resumeServiceCase(contacted.case, 'مشتری پاسخ داد', actorEmployee, '2026-08-10T06:30:01.000Z');
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.case.status).toBe('in_progress');
    expect(resumed.case.timeline).toHaveLength(2);
  });

  it('requires a non-empty reason for manual waiting and closure', () => {
    expect(holdServiceCase(base(), '   ', actorEmployee, 't1').ok).toBe(false);
    expect(closeServiceCase(base(), 'failed', '', actorManager, 't1').ok).toBe(false);
  });

  it('returns a submitted result for correction and preserves submitted evidence', () => {
    const submitted = submitServiceCaseForConfirmation(base(), {
      completionNote: 'انجام شد', evidenceType: 'document', evidenceTitle: 'فرم اجرا', evidenceReference: 'DOC-1',
      customerConfirmationMethod: 'not_required'
    }, actorEmployee, '2026-08-09T10:00:00.000Z');
    if (!submitted.ok) throw new Error('unexpected');
    const returned = returnServiceCaseForCorrection(submitted.case, 'مدرک ناخواناست', actorManager, '2026-08-09T10:05:00.000Z');
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.case.status).toBe('in_progress');
    expect(returned.case.completionEvidence).toHaveLength(1);
    expect(returned.case.timeline.at(-1)?.note).toBe('مدرک ناخواناست');
  });

  it('reassigns only by the owning manager, with a required reason and append-only history', () => {
    const kase = base({ status: 'waiting', assignedEmployeeUserName: 'کارمند قبلی', waitReason: 'منتظر مدرک' });
    expect(reassignServiceCaseEmployee(kase, { id: 'emp_2', fullName: 'کارمند جدید' }, 'جابجایی ظرفیت', { id: 'pm_2', fullName: 'مدیر دیگر' }, 't1').ok).toBe(false);
    const result = reassignServiceCaseEmployee(kase, { id: 'emp_2', fullName: 'کارمند جدید' }, 'جابجایی ظرفیت', actorManager, 't1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.status).toBe('assigned_to_employee');
    expect(result.case.waitReason).toBeUndefined();
    expect(result.case.timeline.at(-1)?.note).toBe('جابجایی ظرفیت');
  });

  it('does not treat failed/cancelled service cases as completed invoice fulfillment', () => {
    const failed = closeServiceCase(base(), 'failed', 'مجری قادر به اجرا نبود', actorManager, 't1');
    if (!failed.ok) throw new Error('unexpected');
    expect(computeInvoiceFulfillmentStatus('inv_1', [], [failed.case])).toBe('fulfillment_in_progress');
  });
});

describe('security/scope hardening — quantity/serviceCategory/responsibleUnit Snapshot immutability', () => {
  const catalogServices: ServiceCatalogItem[] = [
    { id: 'svc_1', code: 'S-001', name: 'نصب و راه‌اندازی', category: 'نصب', salePrice: 1200000, responsibleUnit: 'واحد نصب', requiresActivation: true, isActive: true }
  ];

  it('snapshots quantity, serviceCategory, and responsibleUnit from the line item/catalog at case-creation time', () => {
    const line: SalesInvoiceLineItem = { id: 'li_s1', itemType: 'service', serviceId: 'svc_1', name: 'نصب و راه‌اندازی', quantity: 3, unitPrice: 1200000, discount: 0, lineTotal: 3600000, sourceType: 'manual_addition' };
    const invoice: SalesInvoice = {
      id: 'inv_1', invoiceCode: 'INV-0001', revision: 1, customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده',
      lineItems: [line], subtotal: 0, totalDiscount: 0, finalAmount: 0, paidAmount: 0, remainingAmount: 0,
      status: 'financial_confirmed', declaredPayments: [], history: [], createdAt: 't0', updatedAt: 't0'
    };
    const { newServiceCases } = generateFulfillmentCases(invoice, [], [], 't1', catalogServices);
    expect(newServiceCases[0].quantity).toBe(3);
    expect(newServiceCases[0].serviceCategory).toBe('نصب');
    expect(newServiceCases[0].responsibleUnit).toBe('واحد نصب');
  });

  it('never lets a later catalog change retroactively alter an already-created case\'s quantity/responsibleUnit', () => {
    const mutableCatalog: ServiceCatalogItem[] = [
      { id: 'svc_1', code: 'S-001', name: 'نصب و راه‌اندازی', category: 'نصب', salePrice: 1200000, responsibleUnit: 'واحد نصب', requiresActivation: true, isActive: true }
    ];
    const line: SalesInvoiceLineItem = { id: 'li_s1', itemType: 'service', serviceId: 'svc_1', name: 'نصب و راه‌اندازی', quantity: 2, unitPrice: 1200000, discount: 0, lineTotal: 2400000, sourceType: 'manual_addition' };
    const invoice: SalesInvoice = {
      id: 'inv_1', invoiceCode: 'INV-0001', revision: 1, customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده',
      lineItems: [line], subtotal: 0, totalDiscount: 0, finalAmount: 0, paidAmount: 0, remainingAmount: 0,
      status: 'financial_confirmed', declaredPayments: [], history: [], createdAt: 't0', updatedAt: 't0'
    };
    const { newServiceCases } = generateFulfillmentCases(invoice, [], [], 't1', mutableCatalog);
    const createdCase = newServiceCases[0];

    // فرض تغییر بعدی کاتالوگ — روی خودِ آرایهٔ کاتالوگ، نه روی پروندهٔ ازقبل‌ساخته‌شده
    mutableCatalog[0].category = 'دستهٔ جدید';
    mutableCatalog[0].responsibleUnit = 'واحد جدید';

    expect(createdCase.quantity).toBe(2);
    expect(createdCase.serviceCategory).toBe('نصب');
    expect(createdCase.responsibleUnit).toBe('واحد نصب');
  });

  it('snapshots quantity on a ProductFulfillmentCase so a row with quantity greater than one is never lost', () => {
    const line: SalesInvoiceLineItem = { id: 'li_g1', itemType: 'goods', productId: 'prod_1', name: 'کالای ۱', quantity: 5, unitPrice: 100000, discount: 0, lineTotal: 500000, sourceType: 'manual_addition' };
    const invoice: SalesInvoice = {
      id: 'inv_1', invoiceCode: 'INV-0001', revision: 1, customerId: 'cust_1', salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده',
      lineItems: [line], subtotal: 0, totalDiscount: 0, finalAmount: 0, paidAmount: 0, remainingAmount: 0,
      status: 'financial_confirmed', declaredPayments: [], history: [], createdAt: 't0', updatedAt: 't0'
    };
    const { newProductCases } = generateFulfillmentCases(invoice, [], [], 't1');
    expect(newProductCases[0].quantity).toBe(5);
  });
});

describe('computeInvoiceFulfillmentStatus — completed only when ALL cases of the invoice are done', () => {
  it('reports fulfillment_in_progress while any case is unfinished', () => {
    const productCases: ProductFulfillmentCase[] = [
      { id: 'pfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_g1', productName: 'x', customerId: 'cust_1', quantity: 1, status: 'delivered', timeline: [], createdAt: 't0', updatedAt: 't0' }
    ];
    const serviceCases: ServiceFulfillmentCase[] = [
      { id: 'sfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s1', serviceName: 'x', customerId: 'cust_1', quantity: 1, status: 'in_progress', timeline: [], createdAt: 't0', updatedAt: 't0' }
    ];
    expect(computeInvoiceFulfillmentStatus('inv_1', productCases, serviceCases)).toBe('fulfillment_in_progress');
  });

  it('reports completed only once every product AND service case of that invoice is finished', () => {
    const productCases: ProductFulfillmentCase[] = [
      { id: 'pfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_g1', productName: 'x', customerId: 'cust_1', quantity: 1, status: 'delivered', timeline: [], createdAt: 't0', updatedAt: 't0' },
      { id: 'pfc_2', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_g2', productName: 'x', customerId: 'cust_1', quantity: 1, status: 'delivered', timeline: [], createdAt: 't0', updatedAt: 't0' }
    ];
    const serviceCases: ServiceFulfillmentCase[] = [
      { id: 'sfc_1', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s1', serviceName: 'x', customerId: 'cust_1', quantity: 1, status: 'completed', timeline: [], createdAt: 't0', updatedAt: 't0' },
      { id: 'sfc_2', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s2', serviceName: 'x', customerId: 'cust_1', quantity: 1, status: 'completed', timeline: [], createdAt: 't0', updatedAt: 't0' },
      { id: 'sfc_3', invoiceId: 'inv_1', invoiceCode: 'INV-0001', lineItemId: 'li_s3', serviceName: 'x', customerId: 'cust_1', quantity: 1, status: 'completed', timeline: [], createdAt: 't0', updatedAt: 't0' }
    ];
    expect(computeInvoiceFulfillmentStatus('inv_1', productCases, serviceCases)).toBe('completed');
  });

  it('ignores cases belonging to other invoices', () => {
    const productCases: ProductFulfillmentCase[] = [
      { id: 'pfc_x', invoiceId: 'inv_OTHER', invoiceCode: 'INV-0002', lineItemId: 'li_x', productName: 'x', customerId: 'cust_2', quantity: 1, status: 'pending_coordination', timeline: [], createdAt: 't0', updatedAt: 't0' }
    ];
    expect(computeInvoiceFulfillmentStatus('inv_1', productCases, [])).toBe('completed');
  });
});
