import {
  SalesInvoice, ProductFulfillmentCase, ServiceFulfillmentCase, ProductFulfillmentStatus,
  ServiceFulfillmentStatus, FulfillmentTimelineEntry, ServiceCatalogItem, ServiceCoordinationOutcome,
  ServiceCustomerConfirmationMethod, ServiceFulfillmentEvidenceType
} from '../types';
import { formatIsoAsJalaliDisplay } from './persianDate';

// ============================================================
// پروندهٔ اجرای کالا/خدمت — فقط بعد از financial_confirmed، به‌صورت Idempotent. کاملاً خالص —
// بدون اتصال واقعی پیامک/درگاه/Issabel/بانک؛ فقط Event/Timeline قابل‌اتصال آینده. تغییر بعدی
// کاتالوگ/پروموشن هرگز پروندهٔ ازقبل‌ساخته‌شده را تغییر نمی‌دهد (همان اصل Snapshot فاکتور).
// ============================================================

// Idempotent: اجرای دوباره روی همان فاکتور هیچ پروندهٔ تکراری نمی‌سازد — تطبیق بر اساس
// invoiceId+lineItemId، نه شمارش ردیف‌ها. quantity همیشه از خودِ ردیف فاکتور Snapshot می‌شود
// (بدون نیاز به کاتالوگ)؛ serviceCategory/responsibleUnit در لحظهٔ ساخت از کاتالوگ خدمت
// (پارامتر services، اختیاری برای سازگاری با فراخوانی‌های قدیمی) Snapshot می‌شوند — تغییر بعدی
// کاتالوگ هرگز این مقادیر را در پروندهٔ ازقبل‌ساخته‌شده تغییر نمی‌دهد.
export function generateFulfillmentCases(
  invoice: SalesInvoice, existingProductCases: ProductFulfillmentCase[], existingServiceCases: ServiceFulfillmentCase[], now: string,
  services: ServiceCatalogItem[] = []
): { newProductCases: ProductFulfillmentCase[]; newServiceCases: ServiceFulfillmentCase[] } {
  const newProductCases: ProductFulfillmentCase[] = [];
  const newServiceCases: ServiceFulfillmentCase[] = [];

  for (const li of invoice.lineItems) {
    if (li.itemType === 'goods') {
      const exists = existingProductCases.some((c) => c.invoiceId === invoice.id && c.lineItemId === li.id);
      if (exists) continue;
      newProductCases.push({
        id: `pfc_${invoice.id}_${li.id}`, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, lineItemId: li.id,
        productId: li.productId, productName: li.name, customerId: invoice.customerId, quantity: li.quantity, status: 'pending_coordination',
        timeline: [{ id: `${invoice.id}_${li.id}_t0`, type: 'created', title: 'پروندهٔ اجرای کالا ایجاد شد', timestamp: now }],
        createdAt: now, updatedAt: now
      });
    } else {
      const exists = existingServiceCases.some((c) => c.invoiceId === invoice.id && c.lineItemId === li.id);
      if (exists) continue;
      const catalogService = services.find((s) => s.id === li.serviceId);
      newServiceCases.push({
        id: `sfc_${invoice.id}_${li.id}`, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, lineItemId: li.id,
        serviceId: li.serviceId, serviceName: li.name, customerId: invoice.customerId, quantity: li.quantity,
        serviceCategory: catalogService?.category, responsibleUnit: catalogService?.responsibleUnit, status: 'pending_assignment',
        timeline: [{ id: `${invoice.id}_${li.id}_t0`, type: 'created', title: 'پروندهٔ اجرای خدمت ایجاد شد', timestamp: now }],
        createdAt: now, updatedAt: now
      });
    }
  }

  return { newProductCases, newServiceCases };
}

type FulfillmentActor = { id: string; fullName: string };

function getTimeParts(now: string): Pick<FulfillmentTimelineEntry, 'timestamp' | 'occurredAtIso' | 'jalaliDate' | 'timeWithSeconds'> {
  const parsed = new Date(now);
  if (/^\d{4}-\d{2}-\d{2}T/.test(now) && !Number.isNaN(parsed.getTime())) {
    const display = formatIsoAsJalaliDisplay(now);
    const [jalaliDate, timeWithSeconds] = display.split(' - ');
    return { timestamp: display, occurredAtIso: now, jalaliDate, timeWithSeconds };
  }
  const [jalaliDate, rawTime = '00:00:00'] = now.split(/\s+-\s+/);
  const timeWithSeconds = /^\d{2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime;
  return { timestamp: `${jalaliDate} - ${timeWithSeconds}`, jalaliDate, timeWithSeconds };
}

function addTimeline(
  kase: { timeline: FulfillmentTimelineEntry[]; status?: string }, type: string, title: string,
  actor: FulfillmentActor, now: string, nextStatus?: string, note?: string
): FulfillmentTimelineEntry[] {
  return [...kase.timeline, {
    id: `${type}_${kase.timeline.length + 1}_${now}`,
    type,
    title,
    actorUserId: actor.id,
    actorUserName: actor.fullName,
    previousStatus: kase.status,
    nextStatus,
    note,
    ...getTimeParts(now)
  }];
}

// --- چرخهٔ کالا: pending_coordination → ready_for_dispatch → dispatched → delivered ---
export function markProductReadyForDispatch(kase: ProductFulfillmentCase, actor: { id: string; fullName: string }, now: string): { ok: true; case: ProductFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'pending_coordination') return { ok: false, reason: 'فقط پروندهٔ در انتظار هماهنگی قابل آماده‌سازی برای ارسال است.' };
  return { ok: true, case: { ...kase, status: 'ready_for_dispatch', updatedAt: now, timeline: addTimeline(kase, 'ready_for_dispatch', 'آمادهٔ ارسال شد', actor, now) } };
}

export function dispatchProductCase(kase: ProductFulfillmentCase, dispatchUser: { id: string; fullName: string }, actor: { id: string; fullName: string }, now: string): { ok: true; case: ProductFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'ready_for_dispatch') return { ok: false, reason: 'فقط پروندهٔ آمادهٔ ارسال قابل ارسال است.' };
  return {
    ok: true,
    case: { ...kase, status: 'dispatched', assignedDispatchUserId: dispatchUser.id, assignedDispatchUserName: dispatchUser.fullName, updatedAt: now, timeline: addTimeline(kase, 'dispatched', `ارسال شد توسط ${dispatchUser.fullName}`, actor, now) }
  };
}

export function markProductDelivered(kase: ProductFulfillmentCase, deliveryUser: { id: string; fullName: string }, actor: { id: string; fullName: string }, now: string): { ok: true; case: ProductFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'dispatched') return { ok: false, reason: 'فقط پروندهٔ ارسال‌شده قابل تحویل است.' };
  return {
    ok: true,
    case: { ...kase, status: 'delivered', assignedDeliveryUserId: deliveryUser.id, assignedDeliveryUserName: deliveryUser.fullName, updatedAt: now, timeline: addTimeline(kase, 'delivered', `تحویل داده شد توسط ${deliveryUser.fullName}`, actor, now) }
  };
}

// --- چرخهٔ خدمت ---
// pending_assignment → assigned_to_project_manager → assigned_to_employee → in_progress
// → waiting ↔ in_progress → awaiting_confirmation → completed
// شکست/لغو فقط با دلیل و توسط مدیر مالک/ادمین انجام می‌شود. مالکیت و قلمرو در همین Utility
// اجرا می‌شود، نه فقط با مخفی‌کردن دکمه در UI.
export function assignServiceCaseToProjectManager(
  kase: ServiceFulfillmentCase, projectManager: { id: string; fullName: string }, actor: { id: string; fullName: string }, now: string,
  isAdminActor = false, pmResponsibleUnits?: string[]
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'pending_assignment') return { ok: false, reason: 'فقط پروندهٔ در انتظار ارجاع قابل ارجاع به مدیر پروژه است.' };
  // قلمرو مدیر پروژه بر اساس واحد مسئول Snapshotشدهٔ پرونده — غایب/خالی‌بودن pmResponsibleUnits
  // یعنی مدیر پروژه محدودیت واحد ندارد (سازگار با نصب تک‌مدیرپروژه‌ای)؛ پروندهٔ بدون واحد مشخص
  // (responsibleUnit غایب) برای همهٔ مدیران پروژه قابل‌ادعا می‌ماند.
  if (!isAdminActor && pmResponsibleUnits && pmResponsibleUnits.length > 0 && kase.responsibleUnit && !pmResponsibleUnits.includes(kase.responsibleUnit)) {
    return { ok: false, reason: 'این پرونده خارج از قلمرو واحد مسئولیت شماست.' };
  }
  return {
    ok: true,
    case: { ...kase, status: 'assigned_to_project_manager', projectManagerUserId: projectManager.id, projectManagerUserName: projectManager.fullName, updatedAt: now, timeline: addTimeline(kase, 'assigned_to_project_manager', `ارجاع به مدیر پروژه ${projectManager.fullName}`, actor, now, 'assigned_to_project_manager') }
  };
}

export function assignServiceCaseToEmployee(
  kase: ServiceFulfillmentCase, employee: { id: string; fullName: string }, actor: { id: string; fullName: string }, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'assigned_to_project_manager') return { ok: false, reason: 'فقط پروندهٔ ارجاع‌شده به مدیر پروژه قابل ارجاع به کارمند است.' };
  if (!isAdminActor && kase.projectManagerUserId !== actor.id) {
    return { ok: false, reason: 'این پرونده به مدیر پروژهٔ دیگری اختصاص یافته است — فقط مدیر پروژهٔ مالک پرونده می‌تواند آن را ارجاع دهد.' };
  }
  return {
    ok: true,
    case: { ...kase, status: 'assigned_to_employee', assignedEmployeeUserId: employee.id, assignedEmployeeUserName: employee.fullName, updatedAt: now, timeline: addTimeline(kase, 'assigned_to_employee', `ارجاع به کارمند ${employee.fullName}`, actor, now, 'assigned_to_employee') }
  };
}

export function reassignServiceCaseEmployee(
  kase: ServiceFulfillmentCase, employee: FulfillmentActor, reason: string, actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (!['assigned_to_employee', 'in_progress', 'waiting'].includes(kase.status)) {
    return { ok: false, reason: 'این پرونده در وضعیت قابل تخصیص مجدد نیست.' };
  }
  if (!isAdminActor && kase.projectManagerUserId !== actor.id) {
    return { ok: false, reason: 'فقط مدیر پروژهٔ مالک پرونده می‌تواند تخصیص کارمند را تغییر دهد.' };
  }
  if (!reason.trim()) return { ok: false, reason: 'دلیل تخصیص مجدد اجباری است.' };
  if (employee.id === kase.assignedEmployeeUserId) return { ok: false, reason: 'کارمند جدید باید با کارمند فعلی متفاوت باشد.' };
  const previousEmployee = kase.assignedEmployeeUserName || 'نامشخص';
  return {
    ok: true,
    case: {
      ...kase,
      status: 'assigned_to_employee',
      assignedEmployeeUserId: employee.id,
      assignedEmployeeUserName: employee.fullName,
      waitReason: undefined,
      statusBeforeWait: undefined,
      updatedAt: now,
      timeline: addTimeline(
        kase, 'reassigned_to_employee', `تخصیص از ${previousEmployee} به ${employee.fullName} تغییر کرد`,
        actor, now, 'assigned_to_employee', reason.trim()
      )
    }
  };
}

export function startServiceCase(
  kase: ServiceFulfillmentCase, actor: { id: string; fullName: string }, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'assigned_to_employee') return { ok: false, reason: 'فقط پروندهٔ ارجاع‌شده به کارمند قابل شروع است.' };
  if (!isAdminActor && kase.assignedEmployeeUserId !== actor.id) {
    return { ok: false, reason: 'این پرونده به کارمند دیگری ارجاع شده است — فقط همان کارمند می‌تواند اجرا را شروع کند.' };
  }
  return { ok: true, case: { ...kase, status: 'in_progress', updatedAt: now, timeline: addTimeline(kase, 'in_progress', 'اجرای خدمت شروع شد', actor, now, 'in_progress') } };
}

function canEmployeeAct(kase: ServiceFulfillmentCase, actor: FulfillmentActor, isAdminActor: boolean): boolean {
  return isAdminActor || kase.assignedEmployeeUserId === actor.id;
}

function canManagerAct(kase: ServiceFulfillmentCase, actor: FulfillmentActor, isAdminActor: boolean): boolean {
  return isAdminActor || kase.projectManagerUserId === actor.id;
}

export function recordServiceCoordination(
  kase: ServiceFulfillmentCase, outcome: ServiceCoordinationOutcome, note: string,
  actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (!['assigned_to_employee', 'in_progress', 'waiting'].includes(kase.status)) {
    return { ok: false, reason: 'ثبت نتیجه تماس در این وضعیت مجاز نیست.' };
  }
  if (!canEmployeeAct(kase, actor, isAdminActor)) return { ok: false, reason: 'فقط کارمند مسئول پرونده می‌تواند نتیجه تماس را ثبت کند.' };
  if (!note.trim()) return { ok: false, reason: 'شرح نتیجه تماس اجباری است.' };
  const waitOutcomes: ServiceCoordinationOutcome[] = ['callback_requested', 'unreachable', 'documents_required'];
  const nextStatus: ServiceFulfillmentStatus = waitOutcomes.includes(outcome) ? 'waiting' : 'in_progress';
  const outcomeLabels: Record<ServiceCoordinationOutcome, string> = {
    contacted: 'تماس موفق', callback_requested: 'درخواست تماس مجدد', unreachable: 'عدم دسترسی به مشتری', documents_required: 'منتظر مدرک مشتری'
  };
  return {
    ok: true,
    case: {
      ...kase,
      status: nextStatus,
      latestCoordinationOutcome: outcome,
      latestCoordinationNote: note.trim(),
      waitReason: nextStatus === 'waiting' ? outcomeLabels[outcome] : undefined,
      statusBeforeWait: nextStatus === 'waiting' ? (kase.status === 'assigned_to_employee' ? 'assigned_to_employee' : 'in_progress') : undefined,
      updatedAt: now,
      timeline: addTimeline(kase, `coordination_${outcome}`, outcomeLabels[outcome], actor, now, nextStatus, note.trim())
    }
  };
}

export function holdServiceCase(
  kase: ServiceFulfillmentCase, reason: string, actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (!['assigned_to_employee', 'in_progress'].includes(kase.status)) return { ok: false, reason: 'این پرونده در وضعیت قابل انتظار نیست.' };
  if (!canEmployeeAct(kase, actor, isAdminActor) && !canManagerAct(kase, actor, isAdminActor)) {
    return { ok: false, reason: 'فقط کارمند مسئول یا مدیر پروژهٔ مالک پرونده می‌تواند انتظار ثبت کند.' };
  }
  if (!reason.trim()) return { ok: false, reason: 'دلیل انتظار اجباری است.' };
  return {
    ok: true,
    case: {
      ...kase,
      status: 'waiting',
      statusBeforeWait: kase.status === 'assigned_to_employee' ? 'assigned_to_employee' : 'in_progress',
      waitReason: reason.trim(),
      updatedAt: now,
      timeline: addTimeline(kase, 'waiting', 'پرونده در انتظار قرار گرفت', actor, now, 'waiting', reason.trim())
    }
  };
}

export function resumeServiceCase(
  kase: ServiceFulfillmentCase, note: string, actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'waiting') return { ok: false, reason: 'فقط پروندهٔ در انتظار قابل ادامه است.' };
  if (!canEmployeeAct(kase, actor, isAdminActor) && !canManagerAct(kase, actor, isAdminActor)) {
    return { ok: false, reason: 'فقط کارمند مسئول یا مدیر پروژهٔ مالک پرونده می‌تواند آن را ادامه دهد.' };
  }
  if (!note.trim()) return { ok: false, reason: 'شرح ادامه کار اجباری است.' };
  return {
    ok: true,
    case: {
      ...kase,
      status: 'in_progress',
      waitReason: undefined,
      statusBeforeWait: undefined,
      updatedAt: now,
      timeline: addTimeline(kase, 'resumed', 'پرونده از انتظار خارج شد', actor, now, 'in_progress', note.trim())
    }
  };
}

export interface SubmitServiceCompletionInput {
  completionNote: string;
  evidenceType?: ServiceFulfillmentEvidenceType;
  evidenceTitle?: string;
  evidenceReference?: string;
  customerConfirmationMethod: ServiceCustomerConfirmationMethod;
  customerConfirmationReference?: string;
}

export function submitServiceCaseForConfirmation(
  kase: ServiceFulfillmentCase, input: SubmitServiceCompletionInput, actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'in_progress') return { ok: false, reason: 'فقط پروندهٔ در حال اجرا قابل ارسال برای تأیید است.' };
  if (!canEmployeeAct(kase, actor, isAdminActor)) return { ok: false, reason: 'فقط کارمند مسئول می‌تواند نتیجه اجرا را ارسال کند.' };
  if (!input.completionNote.trim()) return { ok: false, reason: 'شرح نتیجه اجرا اجباری است.' };
  if (input.evidenceType && !input.evidenceTitle?.trim()) return { ok: false, reason: 'عنوان مدرک اجباری است.' };
  if (input.customerConfirmationMethod !== 'not_required' && !input.customerConfirmationReference?.trim()) {
    return { ok: false, reason: 'مرجع تأیید مشتری برای روش انتخاب‌شده اجباری است.' };
  }
  const completionEvidence = [...(kase.completionEvidence || [])];
  if (input.evidenceType && input.evidenceTitle?.trim()) {
    completionEvidence.push({
      id: `evidence_${kase.id}_${completionEvidence.length + 1}_${now}`,
      type: input.evidenceType,
      title: input.evidenceTitle.trim(),
      reference: input.evidenceReference?.trim() || undefined,
      addedByUserId: actor.id,
      addedByUserName: actor.fullName,
      addedAt: getTimeParts(now).timestamp
    });
  }
  return {
    ok: true,
    case: {
      ...kase,
      status: 'awaiting_confirmation',
      completionNote: input.completionNote.trim(),
      completionEvidence,
      customerConfirmationMethod: input.customerConfirmationMethod,
      customerConfirmationReference: input.customerConfirmationReference?.trim() || undefined,
      submittedForConfirmationByUserId: actor.id,
      submittedForConfirmationByUserName: actor.fullName,
      submittedForConfirmationAt: getTimeParts(now).timestamp,
      updatedAt: now,
      timeline: addTimeline(kase, 'submitted_for_confirmation', 'نتیجه اجرا برای تأیید مدیر ارسال شد', actor, now, 'awaiting_confirmation', input.completionNote.trim())
    }
  };
}

export function approveServiceCaseCompletion(
  kase: ServiceFulfillmentCase, note: string, actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'awaiting_confirmation') return { ok: false, reason: 'فقط نتیجهٔ در انتظار تأیید قابل نهایی‌سازی است.' };
  if (!canManagerAct(kase, actor, isAdminActor)) return { ok: false, reason: 'فقط مدیر پروژهٔ مالک پرونده می‌تواند تکمیل را تأیید کند.' };
  return {
    ok: true,
    case: {
      ...kase,
      status: 'completed',
      completedByUserId: actor.id,
      completedByUserName: actor.fullName,
      completedAt: getTimeParts(now).timestamp,
      updatedAt: now,
      timeline: addTimeline(kase, 'completed', 'تکمیل خدمت تأیید شد', actor, now, 'completed', note.trim() || undefined)
    }
  };
}

export function returnServiceCaseForCorrection(
  kase: ServiceFulfillmentCase, reason: string, actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (kase.status !== 'awaiting_confirmation') return { ok: false, reason: 'فقط نتیجهٔ در انتظار تأیید قابل عودت است.' };
  if (!canManagerAct(kase, actor, isAdminActor)) return { ok: false, reason: 'فقط مدیر پروژهٔ مالک پرونده می‌تواند نتیجه را عودت دهد.' };
  if (!reason.trim()) return { ok: false, reason: 'دلیل عودت برای اصلاح اجباری است.' };
  return {
    ok: true,
    case: {
      ...kase,
      status: 'in_progress',
      updatedAt: now,
      timeline: addTimeline(kase, 'returned_for_correction', 'نتیجه اجرا برای اصلاح عودت شد', actor, now, 'in_progress', reason.trim())
    }
  };
}

export function closeServiceCase(
  kase: ServiceFulfillmentCase, target: 'failed' | 'cancelled', reason: string,
  actor: FulfillmentActor, now: string, isAdminActor = false
): { ok: true; case: ServiceFulfillmentCase } | { ok: false; reason: string } {
  if (['completed', 'failed', 'cancelled'].includes(kase.status)) return { ok: false, reason: 'پروندهٔ بسته دوباره قابل بستن نیست.' };
  if (!canManagerAct(kase, actor, isAdminActor)) return { ok: false, reason: 'فقط مدیر پروژهٔ مالک پرونده می‌تواند شکست یا لغو را ثبت کند.' };
  if (!reason.trim()) return { ok: false, reason: 'دلیل شکست یا لغو اجباری است.' };
  return {
    ok: true,
    case: {
      ...kase,
      status: target,
      closureReason: reason.trim(),
      updatedAt: now,
      timeline: addTimeline(kase, target, target === 'failed' ? 'اجرای خدمت ناموفق بسته شد' : 'پروندهٔ خدمت لغو شد', actor, now, target, reason.trim())
    }
  };
}

// تکمیل هر فاکتور مستقل از سایر فاکتورها و هر پرونده مستقل از سایر پرونده‌های همان فاکتور است —
// این تابع فقط پرونده‌های همین فاکتور را می‌بیند، نه فاکتورهای دیگر.
export function computeInvoiceFulfillmentStatus(
  invoiceId: string, productCases: ProductFulfillmentCase[], serviceCases: ServiceFulfillmentCase[]
): 'fulfillment_in_progress' | 'completed' {
  const relatedProductCases = productCases.filter((c) => c.invoiceId === invoiceId);
  const relatedServiceCases = serviceCases.filter((c) => c.invoiceId === invoiceId);
  const allProductsDelivered = relatedProductCases.every((c) => c.status === 'delivered');
  const allServicesCompleted = relatedServiceCases.every((c) => c.status === 'completed');
  return allProductsDelivered && allServicesCompleted ? 'completed' : 'fulfillment_in_progress';
}

export const PRODUCT_FULFILLMENT_LABELS: Record<ProductFulfillmentStatus, string> = {
  pending_coordination: 'در انتظار هماهنگی', ready_for_dispatch: 'آمادهٔ ارسال', dispatched: 'ارسال‌شده', delivered: 'تحویل‌شده'
};
export const SERVICE_FULFILLMENT_LABELS: Record<ServiceFulfillmentStatus, string> = {
  pending_assignment: 'در انتظار ارجاع', assigned_to_project_manager: 'ارجاع‌شده به مدیر پروژه',
  assigned_to_employee: 'ارجاع‌شده به کارمند', in_progress: 'در حال اجرا', waiting: 'در انتظار',
  awaiting_confirmation: 'در انتظار تأیید نتیجه', completed: 'تکمیل‌شده', failed: 'ناموفق', cancelled: 'لغوشده'
};
