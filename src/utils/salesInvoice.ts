import {
  SalesInvoice, SalesInvoiceLineItem, SalesInvoiceStatus, DeclaredPayment, DeclaredPaymentStatus,
  DeclaredPaymentHistoryEntry, SalesInvoiceHistoryEntry, Promotion, Product, ServiceCatalogItem, SalesHierarchySnapshot,
  SalesInvoiceSupervisorApproval, User, SalesOrgAssignment, SystemPermission
} from '../types';
import { resolveInvoiceApprover } from './salesOrgStructure';
import { formatIsoAsJalaliDisplay } from './persianDate';
import { formatPortalMoney } from './operationalFormat';
import { ActorContext } from './salesPersonnelLifecycle';

// ============================================================
// موتور فاکتور فروش و پرداخت اعلامی (بند ۱۴-۱۸ مأموریت فروش تا ثبت فاکتور) — کاملاً خالص.
// کد فاکتور فقط یک‌بار، در لحظهٔ ساخت Draft، تولید می‌شود و در هیچ تابعی بازنویسی نمی‌شود —
// همین «عدم بازنویسی» خودِ تضمین تغییرناپذیری invoiceCode در طول عمر فاکتور است.
// ============================================================

export function generateInvoiceCode(existingInvoices: SalesInvoice[]): string {
  const max = existingInvoices.reduce((m, inv) => {
    const match = /^INV-(\d+)$/.exec(inv.invoiceCode);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `INV-${String(max + 1).padStart(4, '0')}`;
}

export function computeLineTotal(quantity: number, unitPrice: number, discount: number): number {
  return Math.max(0, quantity * unitPrice - discount);
}

// تفکیک پروموشن ترکیبی به ردیف‌های واقعی کالا/خدمت Snapshotشده — هرگز یک ردیف ساختگی «کالا»
// برای کل پروموشن نمی‌سازد. تخفیف/مبلغ نهایی به‌صورت متناسب با سهم هر قلم از قیمت پایه توزیع
// می‌شود؛ ردیف آخر باقیماندهٔ گرد‌کردن را جذب می‌کند تا مجموع ردیف‌ها دقیقاً با finalPrice
// پروموشن برابر شود — حتی اگر قیمت فعلی کاتالوگ کمی از basePrice ثبت‌شدهٔ پروموشن فاصله گرفته باشد.
export function splitPromotionIntoLineItems(
  promotion: Promotion, products: Product[], services: ServiceCatalogItem[]
): SalesInvoiceLineItem[] {
  const resolved = promotion.coreItems.map((core) => {
    if (core.itemType === 'goods') {
      const product = products.find((p) => p.id === core.itemId);
      return { core, unitPrice: product?.salePrice ?? 0, name: product?.name ?? core.itemName, itemType: 'goods' as const };
    }
    const service = services.find((s) => s.id === core.itemId);
    return { core, unitPrice: service?.salePrice ?? 0, name: service?.name ?? core.itemName, itemType: 'service' as const };
  });

  const baseTotal = resolved.reduce((sum, r) => sum + r.unitPrice * r.core.quantity, 0);
  const items: SalesInvoiceLineItem[] = [];
  let allocatedFinal = 0;
  resolved.forEach((r, index) => {
    const lineBase = r.unitPrice * r.core.quantity;
    const isLast = index === resolved.length - 1;
    let lineTotal: number;
    if (isLast) {
      lineTotal = promotion.finalPrice - allocatedFinal;
    } else if (baseTotal > 0) {
      lineTotal = Math.round((lineBase / baseTotal) * promotion.finalPrice);
    } else {
      lineTotal = Math.round(promotion.finalPrice / resolved.length);
    }
    allocatedFinal += lineTotal;
    items.push({
      id: `li_${promotion.id}_${r.core.itemId}_${index}`,
      itemType: r.itemType,
      productId: r.itemType === 'goods' ? r.core.itemId : undefined,
      serviceId: r.itemType === 'service' ? r.core.itemId : undefined,
      promotionId: promotion.id, promotionVersion: promotion.version,
      name: r.name, quantity: r.core.quantity, unitPrice: r.unitPrice, discount: lineBase - lineTotal,
      lineTotal, sourceType: 'promotion_core'
    });
  });
  return items;
}

export function computeInvoiceTotals(lineItems: SalesInvoiceLineItem[]): { subtotal: number; totalDiscount: number; finalAmount: number } {
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const totalDiscount = lineItems.reduce((sum, li) => sum + li.discount, 0);
  return { subtotal, totalDiscount, finalAmount: Math.max(0, subtotal - totalDiscount) };
}

export function computePaymentSummary(finalAmount: number, declaredPayments: DeclaredPayment[]): { paidAmount: number; remainingAmount: number } {
  // ردیف ردشده یا جایگزین‌شده دیگر ادعای فعال فاکتور نیست؛ تاریخچه‌اش حفظ می‌شود اما در
  // آمادگی ارسال مجدد/مبلغ اعلامی جاری محاسبه نمی‌شود.
  const paidAmount = declaredPayments
    .filter((p) => p.status !== 'rejected' && !p.supersededByPaymentId)
    .reduce((sum, p) => sum + p.amount, 0);
  return { paidAmount, remainingAmount: Math.max(0, finalAmount - paidAmount) };
}

// Optimistic Lock (بند ۴/۱۰ مأموریت تکمیل فلو فاکتور) — هر تابع تغییردهنده یک واحد افزایش
// می‌دهد؛ checkInvoiceVersion در ابتدای Handlerهای حساس صدا زده می‌شود.
function nextVersion(invoice: SalesInvoice): number {
  return (invoice.version || 1) + 1;
}

export function checkInvoiceVersion(current: SalesInvoice, expectedVersion: number | undefined): { ok: true } | { ok: false; reason: string } {
  if (expectedVersion === undefined) return { ok: true };
  if ((current.version || 1) !== expectedVersion) {
    return { ok: false, reason: 'این فاکتور از زمان بازکردن فرم توسط واحد دیگری تغییر کرده — لطفاً نسخهٔ تازه را دوباره باز کنید.' };
  }
  return { ok: true };
}

function deriveStatusAfterPayment(currentStatus: SalesInvoiceStatus, paidAmount: number, finalAmount: number): SalesInvoiceStatus {
  if (currentStatus !== 'registered' && currentStatus !== 'partial_payment') return currentStatus;
  if (paidAmount > 0 && paidAmount < finalAmount) return 'partial_payment';
  return 'registered';
}

export function buildDraftInvoice(fields: {
  customerId: string; leadId?: string; campaignId?: string; externalInvoiceKey?: string;
  salespersonUserId: string; salespersonUserName: string;
  salesSupervisorId?: string; salesSupervisorName?: string;
  registeredByUserId?: string; registeredByUserName?: string;
  companyId?: string; costCenterId?: string;
  salesHierarchySnapshot?: SalesHierarchySnapshot;
  registrationSheetImageUrl?: string;
  lineItems: SalesInvoiceLineItem[];
  // بند ۳ مأموریت تکمیل فلو فاکتور — پیش‌فرض از روی وجود/غیاب registeredByUserId محاسبه
  // می‌شود (سازگار با فراخوانی‌های قبلی)؛ فراخوان جدید می‌تواند صریح مقداردهی کند.
  registrationMode?: 'direct' | 'on_behalf';
  saleOrigin?: 'digital_queue' | 'paper_offline';
}, existingInvoices: SalesInvoice[], now: string): SalesInvoice {
  const { subtotal, totalDiscount, finalAmount } = computeInvoiceTotals(fields.lineItems);
  const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id, invoiceCode: generateInvoiceCode(existingInvoices), revision: 1, externalInvoiceKey: fields.externalInvoiceKey,
    customerId: fields.customerId, leadId: fields.leadId, campaignId: fields.campaignId,
    salespersonUserId: fields.salespersonUserId, salespersonUserName: fields.salespersonUserName,
    salesSupervisorId: fields.salesSupervisorId, salesSupervisorName: fields.salesSupervisorName,
    registeredByUserId: fields.registeredByUserId, registeredByUserName: fields.registeredByUserName,
    companyId: fields.companyId, costCenterId: fields.costCenterId,
    salesHierarchySnapshot: fields.salesHierarchySnapshot,
    registrationSheetImageUrl: fields.registrationSheetImageUrl,
    lineItems: fields.lineItems, subtotal, totalDiscount, finalAmount, paidAmount: 0, remainingAmount: finalAmount,
    status: 'draft', declaredPayments: [],
    history: [{ id: `${id}_h0`, action: 'draft_created', byUserId: fields.salespersonUserId, byUserName: fields.salespersonUserName, at: now }],
    createdAt: now, updatedAt: now, version: 1,
    registrationMode: fields.registrationMode || (fields.registeredByUserId ? 'on_behalf' : 'direct'),
    saleOrigin: fields.saleOrigin || (fields.registeredByUserId ? 'paper_offline' : 'digital_queue')
  };
}

// بند ۲۱ AGENTS.md / بند ۸ مأموریت چرخهٔ عمر نیروی فروش: ثبت دیجیتال مستقیم فروشنده دیگر
// مستقیم به registered نمی‌رود — باید از تأیید سرپرست عبور کند تا مالی هرگز فاکتور تأییدنشده
// را نبیند (ارسال مستقیم به مالی ممنوع).
export function registerInvoice(invoice: SalesInvoice, actor: { id: string; fullName: string }, now: string): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'draft') return { ok: false, reason: 'فقط فاکتور در وضعیت Draft قابل ثبت است.' };
  if (invoice.lineItems.length === 0) return { ok: false, reason: 'فاکتور بدون ردیف کالا/خدمت قابل ثبت نیست.' };
  const entry: SalesInvoiceHistoryEntry = { id: `${invoice.id}_h${invoice.history.length}`, action: 'registered_awaiting_supervisor', byUserId: actor.id, byUserName: actor.fullName, at: now };
  return { ok: true, invoice: { ...invoice, status: 'awaiting_supervisor_approval', updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// مسیر مصوب هر دو کانال دیجیتال و کاغذی: عامل ثبت پس از تکمیل اطلاعات و پرداخت‌های
// اعلامی، فاکتور را مستقیماً به سرپرست Snapshot‌شده می‌فرستد. واحد ثبت Gate میانی نیست.
// awaiting_registration_review فقط برای مهاجرت رکوردهای قدیمی پذیرفته می‌شود.
export function submitInvoiceToSupervisor(
  invoice: SalesInvoice,
  actor: { id: string; fullName: string },
  now: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!['draft', 'awaiting_registration_review'].includes(invoice.status)) {
    return { ok: false, reason: 'فقط فاکتور باز قابل ارسال به سرپرست است.' };
  }
  const readiness = evaluateSupervisorSubmissionReadiness(invoice);
  if (readiness.ok === false) return readiness;
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`,
    action: 'submitted_directly_to_supervisor',
    byUserId: actor.id,
    byUserName: actor.fullName,
    at: now,
    oldStatus: invoice.status,
    newStatus: 'awaiting_supervisor_approval'
  };
  return {
    ok: true,
    invoice: {
      ...invoice,
      status: 'awaiting_supervisor_approval',
      updatedAt: now,
      version: nextVersion(invoice),
      history: [...invoice.history, entry]
    }
  };
}

// بند ۲ مأموریت تکمیل فلو فاکتور: پرداخت اعلامی از لحظهٔ ورود به صف بررسی ثبت تا پایان
// هماهنگی قابل ثبت است (نه فقط بعد از تأیید سرپرست مثل قبل) — چون ارسال به سرپرست اکنون
// خودش نیازمند تکمیل اعلام پرداخت است (evaluateSupervisorSubmissionReadiness). وضعیت‌های
// registered/partial_payment قدیمی برای سازگاری با مسیر ثبت مستقیم دست‌نخورده ماندند.
const PAYMENT_DECLARABLE_STATUSES: SalesInvoiceStatus[] = [
  'draft', 'awaiting_registration_review', 'registered', 'partial_payment',
  'awaiting_coordination_manager', 'coordination_assigned', 'coordination_in_progress', 'coordination_callback_scheduled',
  'returned_for_correction'
];

export function addDeclaredPayment(invoice: SalesInvoice, payment: DeclaredPayment, now: string): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!PAYMENT_DECLARABLE_STATUSES.includes(invoice.status)) {
    return { ok: false, reason: 'در وضعیت فعلی فاکتور امکان ثبت پرداخت اعلامی وجود ندارد.' };
  }
  if (payment.amount <= 0) return { ok: false, reason: 'مبلغ پرداخت باید مثبت باشد.' };
  const declaredPayments = [...invoice.declaredPayments, payment];
  const { paidAmount, remainingAmount } = computePaymentSummary(invoice.finalAmount, declaredPayments);
  const nextStatus = deriveStatusAfterPayment(invoice.status, paidAmount, invoice.finalAmount);
  const entry: SalesInvoiceHistoryEntry = { id: `${invoice.id}_h${invoice.history.length}`, action: 'declared_payment_added', byUserId: payment.recordedByUserId, byUserName: payment.recordedByUserName, at: now, note: formatPortalMoney(payment.amount) };
  return { ok: true, invoice: { ...invoice, declaredPayments, paidAmount, remainingAmount, status: nextStatus, updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// بند ۲ مأموریت تکمیل فلو فاکتور — پیش‌شرط ارسال فاکتور به سرپرست: اطلاعات مشتری/اقلام/مبلغ
// معتبر و مجموع پرداخت‌های اعلامی دقیقاً برابر مبلغ نهایی. Handler واقعی (نه صرفاً مخفی‌کردن
// دکمه) این تابع را پیش از approveRegistration/ثبت مستقیم صدا می‌زند.
export function evaluateSupervisorSubmissionReadiness(invoice: SalesInvoice): { ok: true } | { ok: false; reason: string } {
  if (!invoice.customerId) return { ok: false, reason: 'اطلاعات مشتری تکمیل نیست.' };
  if (invoice.lineItems.length === 0) return { ok: false, reason: 'فاکتور باید حداقل یک قلم معتبر داشته باشد.' };
  if (invoice.finalAmount <= 0) return { ok: false, reason: 'مبلغ نهایی فاکتور نامعتبر است.' };
  if (invoice.declaredPayments.some((p) => p.status === 'needs_correction')) {
    return { ok: false, reason: 'یک یا چند پرداخت اعلامی نیازمند اصلاح است — ابتدا آن را رفع کنید.' };
  }
  const { remainingAmount } = computePaymentSummary(invoice.finalAmount, invoice.declaredPayments);
  if (remainingAmount !== 0) {
    return { ok: false, reason: 'مجموع پرداخت‌های اعلامی باید دقیقاً برابر مبلغ نهایی فاکتور باشد.' };
  }
  return { ok: true };
}

export function submitForFinancialReview(invoice: SalesInvoice, actor: { id: string; fullName: string }, now: string): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  void actor;
  void now;
  return { ok: false, reason: 'ارسال مستقیم به مالی غیرفعال است؛ فاکتور باید ابتدا تأیید سرپرست و سپس تأیید هماهنگی یا عبور مدیریتی را بگیرد.' };
}

// بند ۱۳ سند مادر: مسیر واقعی ورود به تأیید مالی فقط پس از «تأیید هماهنگی توسط کارشناس»
// یا «عبور مدیریتیِ صریح بدون تماس» معتبر است. هیچ موتور تصمیم‌گیر خودکاری در این مسیر
// وجود ندارد؛ Handler پس از ثبت یکی از این دو مدرک، این Gate را فراخوانی می‌کند.
export const COORDINATION_STATUSES: SalesInvoiceStatus[] = [
  'awaiting_coordination_manager', 'coordination_assigned', 'coordination_in_progress', 'coordination_callback_scheduled'
];
export function enterFinancialConfirmation(
  invoice: SalesInvoice,
  actor: { id: string; fullName: string },
  now: string,
  coordinationGate: { caseId: string; invoiceId: string; decision: 'confirmed' | 'manager_bypass' }
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!COORDINATION_STATUSES.includes(invoice.status)) {
    return { ok: false, reason: 'فقط فاکتور فعال در مرحله هماهنگی قابل ارسال به تأیید مالی است.' };
  }
  if (!invoice.supervisorApproval) {
    return { ok: false, reason: 'این فاکتور هنوز تأیید سرپرست را نگرفته — ارسال مستقیم به مالی مجاز نیست.' };
  }
  if (!coordinationGate?.caseId || coordinationGate.invoiceId !== invoice.id) {
    return { ok: false, reason: 'مدرک معتبر تصمیم هماهنگی برای این فاکتور وجود ندارد.' };
  }
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`,
    action: 'financial_confirmation_started',
    byUserId: actor.id,
    byUserName: actor.fullName,
    at: now,
    note: `${coordinationGate.decision === 'confirmed' ? 'تأیید مشتری/هماهنگی' : 'عبور مدیریتی بدون تماس'} — پرونده ${coordinationGate.caseId}`
  };
  return { ok: true, invoice: { ...invoice, status: 'awaiting_financial_confirmation', updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// بند ۱ سند مادر: وضعیت فاکتور باید مراحل هماهنگی (تخصیص/در حال هماهنگی/تماس مجدد) را هم صریح
// نشان دهد — این تابع تنها نقطهٔ مجاز تغییر status فاکتور برای این آینه‌سازی است (Transition
// فقط از Utility مرکزی، هرگز مستقیم داخل Component). coordinationCase.ts خودش CoordinationCase
// را جدا مدیریت می‌کند؛ Handler هر دو را در یک تراکنش اتمیک با هم Persist می‌کند.
const COORDINATION_CASE_TO_INVOICE_STATUS: Partial<Record<'assigned' | 'in_progress' | 'callback_scheduled', SalesInvoiceStatus>> = {
  assigned: 'coordination_assigned', in_progress: 'coordination_in_progress', callback_scheduled: 'coordination_callback_scheduled'
};
export function syncInvoiceCoordinationStatus(
  invoice: SalesInvoice, caseStatus: 'assigned' | 'in_progress' | 'callback_scheduled', actor: { id: string; fullName: string }, now: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!COORDINATION_STATUSES.includes(invoice.status)) {
    return { ok: false, reason: 'فاکتور در مرحلهٔ هماهنگی نیست.' };
  }
  const target = COORDINATION_CASE_TO_INVOICE_STATUS[caseStatus];
  if (!target || target === invoice.status) return { ok: true, invoice };
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: 'coordination_status_synced',
    byUserId: actor.id, byUserName: actor.fullName, at: now, note: target, oldStatus: invoice.status, newStatus: target
  };
  return { ok: true, invoice: { ...invoice, status: target, updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

export function returnInvoiceToSalesperson(invoice: SalesInvoice, reason: string, actor: { id: string; fullName: string }, now: string): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!reason.trim()) return { ok: false, reason: 'برای عودت فاکتور، ثبت دلیل الزامی است.' };
  const entry: SalesInvoiceHistoryEntry = { id: `${invoice.id}_h${invoice.history.length}`, action: 'returned_to_salesperson', byUserId: actor.id, byUserName: actor.fullName, at: now, note: reason };
  return { ok: true, invoice: { ...invoice, status: 'returned_to_salesperson', updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// ============================================================
// چرخهٔ واحد ثبت: draft → awaiting_registration_review → registered (مسیر مستقل از
// registerInvoice که همچنان مسیر «ثبت مستقیم فروشنده» بدون بررسی واحد ثبت را پوشش می‌دهد).
// ============================================================
export function submitForRegistrationReview(invoice: SalesInvoice, actor: { id: string; fullName: string }, now: string): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'draft') return { ok: false, reason: 'فقط فاکتور Draft قابل ارسال برای بررسی ثبت است.' };
  if (invoice.lineItems.length === 0) return { ok: false, reason: 'فاکتور بدون ردیف کالا/خدمت قابل ارسال نیست.' };
  const entry: SalesInvoiceHistoryEntry = { id: `${invoice.id}_h${invoice.history.length}`, action: 'submitted_for_registration_review', byUserId: actor.id, byUserName: actor.fullName, at: now };
  return { ok: true, invoice: { ...invoice, status: 'awaiting_registration_review', updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

export function approveRegistration(invoice: SalesInvoice, actor: { id: string; fullName: string }, now: string): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'awaiting_registration_review') return { ok: false, reason: 'فقط فاکتور در انتظار بررسی ثبت قابل تأیید است.' };
  const entry: SalesInvoiceHistoryEntry = { id: `${invoice.id}_h${invoice.history.length}`, action: 'registration_approved_awaiting_supervisor', byUserId: actor.id, byUserName: actor.fullName, at: now };
  return { ok: true, invoice: { ...invoice, status: 'awaiting_supervisor_approval', updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// ============================================================
// Gate واحد تأیید سرپرست فاکتور (بند ۲۱ AGENTS.md، بدهی #۲ مأموریت جاری) — پیش‌تر Handler در
// SalesInvoiceView.tsx فقط تطبیق هویت (کاربر جاری == سرپرست محاسبه‌شده، یا ادمین) را بررسی
// می‌کرد، بدون هیچ Permission مستقلی. این تابع تنها نقطهٔ تصمیم مجاز/غیرمجاز بودن است — همهٔ
// عامل‌ها (وضعیت فاکتور، Permission مستقل approve_sales_invoice_supervisor_step، Deny صریح،
// Snapshot/قلمرو زنجیره، کاسکید جانشینی، هویت واقعی اقدام‌کننده) در یک جا ترکیب می‌شوند تا هیچ
// Handler دیگری مجبور به بازسازی همین منطق نباشد. کاملاً خالص — بدون localStorage/alert.
//
// نکتهٔ مهم دربارهٔ Deny/Bypass ادمین (تصمیم باز #۲۱ سند مرجع، عمداً اینجا تصمیم‌گیری نمی‌شود):
// رفتار فعلی پروژه (permissions.ts's hasPermission) این است که ادمین بدون بررسی Permission
// عبور می‌کند (Bypass). این Gate همان رفتار موجود را برای «نداشتن Permission» حفظ می‌کند — نه
// چون این تصمیم درست/نهایی است، بلکه چون تغییر آن یک تصمیم مالکیتی باز است که این مأموریت مجاز
// به نهایی‌کردنش نیست. اما «رد صریح» (deniedPermissions) یک استثنای مستقل و از‌قبل‌تثبیت‌شده
// است: طبق قانون کلی پروژه Deny/Bypass ادمین را هم می‌بندد و اینجا مستقیماً از روی
// User.deniedPermissions خام بررسی می‌شود (نه از effectivePermissions که برای ادمین همیشه
// null است و همین باعث می‌شد Deny روی ادمین اصلاً اثر نکند) — دقیقاً همان رفتاری که این
// مأموریت به‌صراحت خواسته: «Deny باید حتی بر Bypass ادمین غالب باشد».
// ============================================================
export function resolveSupervisorApprovalGate(params: {
  invoice: SalesInvoice;
  actorUser: User;
  isAdminUser: boolean;
  effectivePermissions: SystemPermission[] | null;
  users: User[];
  assignments: SalesOrgAssignment[];
}): { ok: true; approverUserId: string; approverUserName: string; isSuccessor: boolean; successorReason?: string }
  | { ok: false; reason: string } {
  const { invoice, actorUser, isAdminUser, effectivePermissions, users, assignments } = params;

  if (invoice.status !== 'awaiting_supervisor_approval') {
    return { ok: false, reason: 'فقط فاکتور در انتظار تأیید سرپرست قابل تأیید است.' };
  }

  // Deny صریح — همیشه اول بررسی می‌شود و حتی روی ادمین هم غالب است (طبق درخواست صریح مأموریت).
  if ((actorUser.deniedPermissions || []).includes('approve_sales_invoice_supervisor_step')) {
    return { ok: false, reason: 'مجوز تأیید سرپرست فاکتور برای این کاربر صراحتاً رد شده — حتی دسترسی مدیر کل هم این رد را نمی‌پوشاند.' };
  }

  // Permission مستقل — رفتار Bypass فعلی ادمین (effectivePermissions === null) حفظ می‌شود؛
  // تغییر این رفتار تصمیم بازِ #۲۱ سند مرجع است، نه موضوع این Gate.
  const hasApprovalPermission = effectivePermissions === null || effectivePermissions.includes('approve_sales_invoice_supervisor_step');
  if (!hasApprovalPermission) {
    return { ok: false, reason: 'مجوز تأیید سرپرست فاکتور را ندارید.' };
  }

  const resolved = resolveInvoiceApprover(invoice.salesHierarchySnapshot, users, assignments);
  if (resolved.ok === false) return resolved;

  // هویت واقعی اقدام‌کننده/قلمرو — فقط سرپرست محاسبه‌شده (یا جانشین همان زنجیره) یا ادمین.
  if (!isAdminUser && actorUser.id !== resolved.approverUserId) {
    return { ok: false, reason: 'فقط سرپرست فعلی (یا جانشین فعال همان زنجیره) این فاکتور می‌تواند تأیید کند.' };
  }

  return resolved;
}

// ============================================================
// تأیید اجباری سرپرست پیش از مالی (بند ۲۱ AGENTS.md، بند ۸ مأموریت چرخهٔ عمر نیروی فروش) —
// تأییدکننده از قبل با resolveSupervisorApprovalGate محاسبه شده؛ این تابع فقط نتیجه را روی
// فاکتور ثبت می‌کند، خودش هیچ منطق مجوز/تشخیص جانشین ندارد.
// بند ۵ مأموریت تکمیل فلو فاکتور: مقصد بعد از تأیید سرپرست دیگر «registered» نیست — چون
// evaluateSupervisorSubmissionReadiness از قبل تضمین کرده پرداخت کامل اعلام شده، فاکتور
// مستقیماً وارد صف مدیر هماهنگی می‌شود؛ Handler بلافاصله بعد createCoordinationCase را صدا
// می‌زند (وضعیت registered قدیمی فقط برای مسیر legacy/Golden Demo موجود دست‌نخورده ماند).
// ============================================================
export function approveSupervisorInvoice(
  invoice: SalesInvoice,
  approval: { approverUserId: string; approverUserName: string; snapshotSupervisorUserId: string; isSuccessor: boolean; successorReason?: string },
  now: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'awaiting_supervisor_approval') {
    return { ok: false, reason: 'فقط فاکتور در انتظار تأیید سرپرست قابل تأیید است.' };
  }
  const supervisorApproval: SalesInvoiceSupervisorApproval = {
    approverUserId: approval.approverUserId, approverUserName: approval.approverUserName,
    snapshotSupervisorUserId: approval.snapshotSupervisorUserId, isSuccessor: approval.isSuccessor,
    successorReason: approval.successorReason, approvedAt: now
  };
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: 'supervisor_approved', byUserId: approval.approverUserId, byUserName: approval.approverUserName, at: now,
    note: approval.isSuccessor ? `جانشینی: ${approval.successorReason || 'سرپرست اصلی غیرفعال بود'}` : undefined
  };
  return { ok: true, invoice: { ...invoice, status: 'awaiting_coordination_manager', supervisorApproval, updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// ============================================================
// ویرایش واقعی Draft — فقط پیش از ثبت نهایی (Draft/در انتظار بررسی ثبت/عودت‌شده). کد فاکتور
// هرگز تغییر نمی‌کند. بعد از عودت به فروشنده، ویرایش Revision را افزایش می‌دهد (نه کد جدید).
// ============================================================
const EDITABLE_STATUSES: SalesInvoiceStatus[] = ['draft', 'awaiting_registration_review', 'returned_to_salesperson'];

export function editInvoiceLineItems(
  invoice: SalesInvoice, newLineItems: SalesInvoiceLineItem[], actor: { id: string; fullName: string }, now: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!EDITABLE_STATUSES.includes(invoice.status)) {
    return { ok: false, reason: 'فقط فاکتور در وضعیت Draft، در انتظار بررسی ثبت یا عودت‌شده قابل ویرایش است.' };
  }
  if (newLineItems.length === 0) return { ok: false, reason: 'فاکتور باید حداقل یک ردیف کالا/خدمت داشته باشد.' };
  const { subtotal, totalDiscount, finalAmount } = computeInvoiceTotals(newLineItems);
  const { paidAmount, remainingAmount } = computePaymentSummary(finalAmount, invoice.declaredPayments);
  const wasReturned = invoice.status === 'returned_to_salesperson';
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: wasReturned ? 'revised_after_return' : 'draft_edited',
    byUserId: actor.id, byUserName: actor.fullName, at: now
  };
  return {
    ok: true,
    invoice: {
      ...invoice, lineItems: newLineItems, subtotal, totalDiscount, finalAmount, paidAmount, remainingAmount,
      status: wasReturned ? 'draft' : invoice.status,
      revision: wasReturned ? invoice.revision + 1 : invoice.revision,
      updatedAt: now, version: nextVersion(invoice), history: [...invoice.history, entry]
    }
  };
}

// ============================================================
// تأیید مالی ردیفی پرداخت‌های اعلامی — فقط روی فاکتور در انتظار بررسی مالی. مبلغ قطعی فاکتور
// همیشه فقط مجموع approvedAmount ردیف‌های approved است؛ ردیف rejected هرگز حساب نمی‌شود.
// اضافه‌پرداخت هرگز خودکار تأیید نهایی نمی‌شود — فقط تساوی دقیق financial_confirmed می‌سازد.
// ============================================================
export function computeApprovedPaymentSummary(
  finalAmount: number, declaredPayments: DeclaredPayment[]
): { declaredTotal: number; approvedTotal: number; remainingAmount: number; hasDiscrepancy: boolean } {
  const declaredTotal = declaredPayments.filter((p) => !p.supersededByPaymentId).reduce((sum, p) => sum + p.amount, 0);
  const approvedTotal = declaredPayments.filter((p) => p.status === 'approved' && !p.supersededByPaymentId).reduce((sum, p) => sum + (p.approvedAmount ?? 0), 0);
  return { declaredTotal, approvedTotal, remainingAmount: Math.max(0, finalAmount - approvedTotal), hasDiscrepancy: approvedTotal > finalAmount };
}

export function decideDeclaredPayment(
  invoice: SalesInvoice, paymentId: string, decision: DeclaredPaymentStatus,
  approvedAmount: number | undefined, reason: string | undefined,
  actor: { id: string; fullName: string }, now: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'awaiting_financial_confirmation') {
    return { ok: false, reason: 'فقط فاکتور در انتظار بررسی مالی قابل تصمیم‌گیری روی پرداخت است.' };
  }
  const payment = invoice.declaredPayments.find((p) => p.id === paymentId);
  if (!payment) return { ok: false, reason: 'ردیف پرداخت یافت نشد.' };
  if (!['declared', 'needs_correction'].includes(payment.status)) {
    return { ok: false, reason: 'این ردیف قبلاً تعیین‌تکلیف شده و تصمیم آن قابل بازنویسی نیست.' };
  }
  if (decision === 'declared') return { ok: false, reason: 'برگشت به وضعیت اعلامی مجاز نیست.' };
  if (decision === 'approved' && (approvedAmount === undefined || approvedAmount <= 0)) {
    return { ok: false, reason: 'مبلغ تأییدشده باید مثبت باشد.' };
  }
  if (decision === 'approved' && approvedAmount! > payment.amount) {
    return { ok: false, reason: 'مبلغ تأییدشده نمی‌تواند از مبلغ همان ردیف پرداخت بیشتر باشد.' };
  }
  if ((decision === 'rejected' || decision === 'needs_correction' || decision === 'suspicious') && !reason?.trim()) {
    return { ok: false, reason: 'برای رد، نیاز به اصلاح یا علامت‌گذاری مشکوک، ثبت دلیل الزامی است.' };
  }
  const finalApprovedAmount = decision === 'approved' ? approvedAmount! : undefined;
  const histEntry: DeclaredPaymentHistoryEntry = {
    id: `${payment.id}_fh${(payment.financialHistory || []).length}`, status: decision,
    amount: decision === 'approved' ? finalApprovedAmount! : payment.amount,
    byUserId: actor.id, byUserName: actor.fullName, at: now, note: reason
  };
  const updatedPayment: DeclaredPayment = {
    ...payment, status: decision, approvedAmount: finalApprovedAmount,
    financialApproverUserId: actor.id, financialApproverUserName: actor.fullName,
    financialDecisionAt: now, financialDecisionReason: reason,
    financialHistory: [...(payment.financialHistory || []), histEntry]
  };
  const declaredPayments = invoice.declaredPayments.map((p) => (p.id === paymentId ? updatedPayment : p));

  const summary = computeApprovedPaymentSummary(invoice.finalAmount, declaredPayments);
  const everyRowDecided = declaredPayments.every((p) => Boolean(p.supersededByPaymentId) || ['approved', 'rejected'].includes(p.status));
  const nextStatus: SalesInvoiceStatus = decision === 'suspicious'
    ? 'financial_suspicious_hold'
    : (everyRowDecided && summary.approvedTotal === invoice.finalAmount ? 'financial_confirmed' : 'awaiting_financial_confirmation');

  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: `declared_payment_${decision}`,
    byUserId: actor.id, byUserName: actor.fullName, at: now,
    note: reason || formatPortalMoney(decision === 'approved' ? finalApprovedAmount : payment.amount)
  };
  if (nextStatus === 'financial_confirmed') {
    entry.note = (entry.note ? entry.note + ' — ' : '') + 'تأیید نهایی مالی فاکتور';
  }
  const finalEntries = nextStatus === 'financial_confirmed'
    ? [...invoice.history, entry, { id: `${invoice.id}_h${invoice.history.length + 1}`, action: 'financial_confirmed', byUserId: actor.id, byUserName: actor.fullName, at: now }]
    : [...invoice.history, entry];

  return {
    ok: true,
    invoice: {
      ...invoice, declaredPayments, paidAmount: summary.approvedTotal, remainingAmount: summary.remainingAmount,
      status: nextStatus, updatedAt: now, version: nextVersion(invoice), history: finalEntries
    }
  };
}

// اصلاح ردیف پرداخت به‌صورت جبرانی: ردیف قبلی حذف/بازنویسی نمی‌شود و lineage نسخه جاری را مشخص می‌کند.
// عامل مؤثر باید همان مالک مسیر اصلاح باشد؛ کنترل Permission در Handler صفحه مستقل باقی می‌ماند.
export function replaceDeclaredPaymentForCorrection(
  invoice: SalesInvoice, oldPaymentId: string, replacement: DeclaredPayment,
  actor: ActorContext, nowIso: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'returned_for_correction') return { ok: false, reason: 'اصلاح ردیف پرداخت فقط روی فاکتور عودت‌شده مجاز است.' };
  if (actor.effective.id !== correctionOwnerUserId(invoice)) return { ok: false, reason: 'فقط فروشنده یا ثبات مالک این فاکتور می‌تواند ردیف پرداخت را اصلاح کند.' };
  const oldPayment = invoice.declaredPayments.find((p) => p.id === oldPaymentId);
  if (!oldPayment) return { ok: false, reason: 'ردیف پرداخت قبلی یافت نشد.' };
  if (!['needs_correction', 'suspicious', 'rejected'].includes(oldPayment.status)) return { ok: false, reason: 'این ردیف نیازمند اصلاح یا ردشده نیست.' };
  if (replacement.amount <= 0) return { ok: false, reason: 'مبلغ جایگزین باید مثبت باشد.' };
  if (invoice.declaredPayments.some((p) => p.id === replacement.id)) return { ok: false, reason: 'شناسهٔ ردیف جایگزین تکراری است.' };

  const oldHistory: DeclaredPaymentHistoryEntry = {
    id: `${oldPayment.id}_fh${(oldPayment.financialHistory || []).length}`, status: oldPayment.status, amount: oldPayment.amount,
    byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: nowIso, note: `جایگزین با ${replacement.id}`
  };
  const previousRevision: DeclaredPayment = {
    ...oldPayment, supersededByPaymentId: replacement.id,
    financialHistory: [...(oldPayment.financialHistory || []), oldHistory]
  };
  const fresh: DeclaredPayment = {
    ...replacement, status: 'declared', correctsPaymentId: oldPayment.id,
    approvedAmount: undefined, financialApproverUserId: undefined, financialApproverUserName: undefined,
    financialDecisionAt: undefined, financialDecisionReason: undefined
  };
  const declaredPayments = [...invoice.declaredPayments.map((p) => p.id === oldPayment.id ? previousRevision : p), fresh];
  const summary = computePaymentSummary(invoice.finalAmount, declaredPayments);
  const audit = makeCorrectionAuditFields(invoice, actor, nowIso);
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: 'declared_payment_corrected',
    byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: formatIsoAsJalaliDisplay(nowIso),
    ...audit, newStatus: 'returned_for_correction', correctedFields: [`payment:${oldPayment.id}`],
    note: `${oldPayment.id} → ${fresh.id}`
  };
  return { ok: true, invoice: { ...invoice, declaredPayments, paidAmount: summary.paidAmount, remainingAmount: summary.remainingAmount, updatedAt: nowIso, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

// ============================================================
// پس‌گرفتن، عودت رسمی برای اصلاح و ارسال مجدد (بند ۴ مأموریت تکمیل فلو فاکتور) — سه عملیات
// صریح و مستقل. Recall فقط پیش از اولین اقدام رسمی واحد بعد ممکن است؛ چون هر اقدام رسمی در
// این پروژه همیشه با تغییر status همراه است (Claim/تخصیص/تصمیم/تأیید/رد/عودت هرکدام status را
// عوض می‌کنند)، همین سه وضعیت «در انتظار واحد بعد، هنوز دست‌نخورده» کل شرط رسمی‌بودن اقدام را
// به‌درستی پیاده می‌کند — بدون نیاز به فیلد اضافه یا ردیابی موازی.
// ============================================================
export const RECALLABLE_STATUSES: SalesInvoiceStatus[] = ['awaiting_registration_review', 'awaiting_supervisor_approval', 'awaiting_coordination_manager'];

function makeCorrectionAuditFields(invoice: SalesInvoice, actor: ActorContext, nowIso: string): Pick<SalesInvoiceHistoryEntry, 'occurredAtIso' | 'jalaliDate' | 'timeWithSeconds' | 'realActorUserId' | 'effectiveUserId' | 'correlationId' | 'oldStatus'> {
  const display = formatIsoAsJalaliDisplay(nowIso);
  const [jalaliDate, timeWithSeconds] = display.split(' - ');
  const realActor = actor.real || actor.effective;
  return {
    occurredAtIso: nowIso, jalaliDate, timeWithSeconds,
    realActorUserId: realActor.id, effectiveUserId: actor.effective.id,
    correlationId: `corr_${invoice.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    oldStatus: invoice.status
  };
}

// مالک واقعی رکورد: مسیر دیجیتال → خودِ فروشنده؛ مسیر کاغذی/ثبت‌شده به‌نمایندگی → ثبات
// (registeredByUserId). این تعیین از registrationMode می‌آید، نه از حدس روی فیلدهای دیگر.
function correctionOwnerUserId(invoice: SalesInvoice): string {
  return invoice.registrationMode === 'on_behalf' && invoice.registeredByUserId ? invoice.registeredByUserId : invoice.salespersonUserId;
}

export function recallForCorrection(
  invoice: SalesInvoice, actor: ActorContext, nowIso: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!RECALLABLE_STATUSES.includes(invoice.status)) {
    return { ok: false, reason: 'در این وضعیت امکان پس‌گرفتن فاکتور وجود ندارد — واحد بعد اقدام رسمی انجام داده یا فاکتور در مرحله‌ای نیست که پس‌گرفتن مجاز باشد.' };
  }
  const owner = correctionOwnerUserId(invoice);
  if (actor.effective.id !== owner) {
    return { ok: false, reason: 'فقط ثبت‌کنندهٔ اصلی این فاکتور (فروشنده در مسیر دیجیتال، ثبات در مسیر کاغذی) می‌تواند آن را پس بگیرد.' };
  }
  const audit = makeCorrectionAuditFields(invoice, actor, nowIso);
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: 'invoice_recalled_for_correction',
    byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: formatIsoAsJalaliDisplay(nowIso),
    ...audit, newStatus: 'draft'
  };
  return { ok: true, invoice: { ...invoice, status: 'draft', updatedAt: nowIso, version: nextVersion(invoice), history: [...invoice.history, entry] } };
}

const RETURNABLE_FOR_CORRECTION_STATUSES: SalesInvoiceStatus[] = [
  'awaiting_registration_review', 'awaiting_supervisor_approval',
  'awaiting_coordination_manager', 'coordination_assigned', 'coordination_in_progress', 'coordination_callback_scheduled',
  'awaiting_financial_confirmation', 'financial_suspicious_hold'
];

export function returnForCorrection(
  invoice: SalesInvoice,
  fields: { destination?: 'salesperson' | 'registrar'; reason: string; description: string; correctedFields?: string[] },
  actor: ActorContext, nowIso: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (!RETURNABLE_FOR_CORRECTION_STATUSES.includes(invoice.status)) {
    return { ok: false, reason: 'فاکتور در وضعیت فعلی قابل عودت برای اصلاح نیست.' };
  }
  if (!fields.reason.trim()) return { ok: false, reason: 'ثبت دلیل عودت الزامی است.' };
  if (!fields.description.trim()) return { ok: false, reason: 'ثبت شرح عودت الزامی است.' };

  // مسیر کاغذی به‌طور پیش‌فرض به ثبات و مسیر دیجیتال به فروشنده برمی‌گردد (بند ۴ مأموریت)،
  // مگر مقصد صریح دیگری داده شده باشد.
  const destination = fields.destination || (invoice.registrationMode === 'on_behalf' ? 'registrar' : 'salesperson');
  const audit = makeCorrectionAuditFields(invoice, actor, nowIso);

  const entries: SalesInvoiceHistoryEntry[] = [];
  // اصلاح مؤثر همیشه تأیید سرپرست را باطل می‌کند (بند ۴-۱۲/۱۳: Default امن، بدون تشخیص
  // «نگارشی در برابر مؤثر» — فاکتور همیشه از Gate سرپرست دوباره وارد چرخه می‌شود).
  if (invoice.supervisorApproval) {
    entries.push({
      id: `${invoice.id}_h${invoice.history.length + entries.length}`, action: 'approval_invalidated_by_revision',
      byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: formatIsoAsJalaliDisplay(nowIso),
      ...audit, note: 'عودت برای اصلاح، تأیید سرپرست قبلی را نامعتبر کرد.'
    });
  }
  entries.push({
    id: `${invoice.id}_h${invoice.history.length + entries.length}`, action: 'invoice_returned_for_correction',
    byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: formatIsoAsJalaliDisplay(nowIso),
    ...audit, newStatus: 'returned_for_correction', destination, correctedFields: fields.correctedFields || [],
    note: `دلیل: ${fields.reason} — شرح: ${fields.description}`
  });

  return {
    ok: true,
    invoice: {
      ...invoice, status: 'returned_for_correction', supervisorApproval: undefined,
      updatedAt: nowIso, version: nextVersion(invoice), history: [...invoice.history, ...entries]
    }
  };
}

export function resubmitAfterCorrection(
  invoice: SalesInvoice, newLineItems: SalesInvoiceLineItem[], actor: ActorContext, nowIso: string
): { ok: true; invoice: SalesInvoice } | { ok: false; reason: string } {
  if (invoice.status !== 'returned_for_correction') {
    return { ok: false, reason: 'فقط فاکتور عودت‌شده برای اصلاح قابل ارسال مجدد است.' };
  }
  if (newLineItems.length === 0) return { ok: false, reason: 'فاکتور باید حداقل یک ردیف کالا/خدمت داشته باشد.' };
  const { subtotal, totalDiscount, finalAmount } = computeInvoiceTotals(newLineItems);
  const { paidAmount, remainingAmount } = computePaymentSummary(finalAmount, invoice.declaredPayments);
  const audit = makeCorrectionAuditFields(invoice, actor, nowIso);
  // بند ۴-۲۱ مأموریت: ارسال مجدد چرخه را همیشه از سرپرست تکرار می‌کند.
  const entry: SalesInvoiceHistoryEntry = {
    id: `${invoice.id}_h${invoice.history.length}`, action: 'invoice_resubmitted',
    byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: formatIsoAsJalaliDisplay(nowIso),
    ...audit, newStatus: 'awaiting_supervisor_approval', revision: invoice.revision + 1
  };
  return {
    ok: true,
    invoice: {
      ...invoice, lineItems: newLineItems, subtotal, totalDiscount, finalAmount, paidAmount, remainingAmount,
      status: 'awaiting_supervisor_approval', revision: invoice.revision + 1,
      updatedAt: nowIso, version: nextVersion(invoice), history: [...invoice.history, entry]
    }
  };
}
