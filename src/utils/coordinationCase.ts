import {
  CoordinationAttempt,
  CoordinationAttemptResult,
  CoordinationCase,
  CoordinationChecklistDecision,
  CoordinationChecklistItem,
  CoordinationChecklistKey,
  CoordinationDistributionMode,
  SalesInvoice
} from '../types';
import { formatIsoAsJalaliDisplay } from './persianDate';
import { ActorContext } from './salesPersonnelLifecycle';

const CHECKLIST_DEFINITIONS: Array<{ key: CoordinationChecklistKey; label: string; required: boolean }> = [
  { key: 'identity_contact', label: 'هویت و اطلاعات تماس مشتری', required: true },
  { key: 'items_promotion', label: 'اقلام، خدمات و پروموشن', required: true },
  { key: 'quantity_final_price_discount', label: 'تعداد، قیمت نهایی و تخفیف', required: true },
  { key: 'declared_payments', label: 'پرداخت‌های اعلامی', required: true },
  { key: 'address_delivery', label: 'نشانی و روش تحویل', required: false },
  { key: 'activation_terms', label: 'شرایط فعال‌سازی خدمت', required: false },
  { key: 'salesperson_promises', label: 'تعهدات و توضیحات فروشنده', required: true },
  { key: 'customer_willingness', label: 'تمایل مشتری به ادامه خرید', required: true },
  { key: 'complaint_cancellation', label: 'شکایت یا درخواست انصراف', required: true }
];

function makeAuditFields(actor: ActorContext, nowIso: string) {
  const display = formatIsoAsJalaliDisplay(nowIso);
  const [jalaliDate, timeWithSeconds] = display.split(' - ');
  const realActor = actor.real || actor.effective;
  return {
    occurredAtIso: nowIso,
    jalaliDate,
    timeWithSeconds,
    realActorUserId: realActor.id,
    effectiveUserId: actor.effective.id,
    correlationId: `corr_coord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  };
}

function makeAttempt(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string,
  result: CoordinationAttemptResult,
  extra: { structuredReason?: string; note?: string; nextActionAt?: string } = {}
): CoordinationAttempt {
  return {
    id: `catt_${kase.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    caseId: kase.id,
    invoiceId: kase.invoiceId,
    actorUserId: actor.effective.id,
    actorUserName: actor.effective.fullName,
    result,
    ...extra,
    ...makeAuditFields(actor, nowIso)
  };
}

export function buildCoordinationChecklist(): CoordinationChecklistItem[] {
  return CHECKLIST_DEFINITIONS.map((item) => ({ ...item, decision: 'pending' }));
}

export function createCoordinationCase(
  invoice: SalesInvoice,
  nowIso: string,
  distributionMode: CoordinationDistributionMode = 'manual_assignment'
): CoordinationCase {
  const display = formatIsoAsJalaliDisplay(nowIso);
  return {
    id: `coord_${invoice.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    invoiceId: invoice.id,
    invoiceCode: invoice.invoiceCode,
    customerId: invoice.customerId,
    status: 'pending_assignment',
    distributionMode,
    checklist: buildCoordinationChecklist(),
    isManagerBypassed: false,
    createdAt: display,
    updatedAt: display
  };
}

export function assignCoordinationCase(
  kase: CoordinationCase,
  coordinator: { id: string; fullName: string },
  actor: ActorContext,
  nowIso: string
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (kase.status !== 'pending_assignment') return { ok: false, reason: 'فقط پروندهٔ در انتظار تخصیص قابل تخصیص است.' };
  const display = formatIsoAsJalaliDisplay(nowIso);
  const updated: CoordinationCase = {
    ...kase,
    status: 'assigned',
    assignedCoordinatorUserId: coordinator.id,
    assignedCoordinatorUserName: coordinator.fullName,
    assignedByUserId: actor.effective.id,
    assignedByUserName: actor.effective.fullName,
    assignedAt: display,
    updatedAt: display
  };
  return {
    ok: true,
    case: updated,
    attempt: makeAttempt(updated, actor, nowIso, 'assigned', { note: `تخصیص به ${coordinator.fullName}` })
  };
}

export function claimCoordinationCase(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  const sharedClaim = kase.status === 'pending_assignment' && kase.distributionMode === 'shared_claim';
  if (kase.status !== 'assigned' && !sharedClaim) return { ok: false, reason: 'این پرونده در وضعیت قابل Claim نیست.' };
  if (!sharedClaim && kase.assignedCoordinatorUserId !== actor.effective.id) {
    return { ok: false, reason: 'فقط مسئول هماهنگی تعیین‌شده می‌تواند این پرونده را Claim کند.' };
  }
  const display = formatIsoAsJalaliDisplay(nowIso);
  const updated: CoordinationCase = {
    ...kase,
    status: 'in_progress',
    assignedCoordinatorUserId: actor.effective.id,
    assignedCoordinatorUserName: actor.effective.fullName,
    assignedByUserId: sharedClaim ? actor.effective.id : kase.assignedByUserId,
    assignedByUserName: sharedClaim ? actor.effective.fullName : kase.assignedByUserName,
    assignedAt: sharedClaim ? display : kase.assignedAt,
    updatedAt: display
  };
  return { ok: true, case: updated, attempt: makeAttempt(updated, actor, nowIso, 'claimed') };
}

const ACTIVE_CASE_STATUSES = ['assigned', 'in_progress', 'callback_scheduled'] as const;

export function updateCoordinationChecklistItem(
  kase: CoordinationCase,
  key: CoordinationChecklistKey,
  decision: CoordinationChecklistDecision,
  note: string,
  actor: ActorContext,
  nowIso: string
): { ok: true; case: CoordinationCase } | { ok: false; reason: string } {
  if (!(ACTIVE_CASE_STATUSES as readonly string[]).includes(kase.status)) {
    return { ok: false, reason: 'چک‌لیست فقط روی پروندهٔ فعال هماهنگی قابل تغییر است.' };
  }
  if (decision === 'mismatch' && !note.trim()) return { ok: false, reason: 'برای مغایرت، ثبت توضیح الزامی است.' };
  const item = kase.checklist.find((candidate) => candidate.key === key);
  if (!item) return { ok: false, reason: 'قلم چک‌لیست یافت نشد.' };
  const updatedAt = formatIsoAsJalaliDisplay(nowIso);
  return {
    ok: true,
    case: {
      ...kase,
      checklist: kase.checklist.map((candidate) => candidate.key === key ? {
        ...candidate,
        decision,
        note: note.trim() || undefined,
        updatedAt,
        updatedByUserId: actor.effective.id,
        updatedByUserName: actor.effective.fullName
      } : candidate),
      updatedAt
    }
  };
}

export function evaluateCoordinationChecklist(kase: CoordinationCase): { ok: true } | { ok: false; reason: string } {
  if (kase.checklist.some((item) => item.decision === 'mismatch')) {
    return { ok: false, reason: 'چک‌لیست دارای مغایرت است؛ ابتدا پرونده را برای اصلاح عودت دهید.' };
  }
  const incomplete = kase.checklist.filter((item) => item.required && item.decision === 'pending');
  if (incomplete.length > 0) {
    return { ok: false, reason: `چک‌لیست اجباری کامل نیست: ${incomplete.map((item) => item.label).join('، ')}` };
  }
  return { ok: true };
}

export function recordCoordinationAttempt(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string,
  result: CoordinationAttemptResult,
  fields: { structuredReason?: string; note?: string; nextActionAt?: string } = {}
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (!(ACTIVE_CASE_STATUSES as readonly string[]).includes(kase.status)) {
    return { ok: false, reason: 'فقط پروندهٔ فعال قابل ثبت تلاش هماهنگی است.' };
  }
  if ((result === 'callback_requested' || result === 'no_answer') && !fields.nextActionAt) {
    return { ok: false, reason: 'برای تماس مجدد یا عدم پاسخ، زمان اقدام بعدی الزامی است.' };
  }
  const attempt = makeAttempt(kase, actor, nowIso, result, fields);
  const updatedAt = formatIsoAsJalaliDisplay(nowIso);
  const status = result === 'callback_requested' || result === 'no_answer' ? 'callback_scheduled' : kase.status;
  return { ok: true, case: { ...kase, status, updatedAt }, attempt };
}

export function approveCoordinationCase(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string,
  attempts: CoordinationAttempt[] = []
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (!(ACTIVE_CASE_STATUSES as readonly string[]).includes(kase.status)) {
    return { ok: false, reason: 'فقط پروندهٔ فعال قابل تأیید هماهنگی است.' };
  }
  const checklist = evaluateCoordinationChecklist(kase);
  if (checklist.ok === false) return checklist;
  if (!attempts.some((attempt) => attempt.caseId === kase.id && attempt.result === 'confirmed')) {
    return { ok: false, reason: 'پیش از تأیید نهایی باید نتیجهٔ تماس «تأیید شد» ثبت شده باشد.' };
  }
  const attempt = makeAttempt(kase, actor, nowIso, 'confirmed');
  const display = formatIsoAsJalaliDisplay(nowIso);
  return { ok: true, case: { ...kase, status: 'closed', closedAt: display, closedResult: 'confirmed', updatedAt: display }, attempt };
}

export function bypassCoordinationByManager(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string,
  reason: string
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (kase.status === 'closed' || kase.status === 'exception') {
    return { ok: false, reason: 'پروندهٔ بسته یا استثنا قابل عبور مدیریتی نیست.' };
  }
  if (!reason.trim()) return { ok: false, reason: 'دلیل عبور مدیریتی بدون تماس الزامی است.' };
  const attempt = makeAttempt(kase, actor, nowIso, 'manager_bypass', { structuredReason: reason.trim() });
  const display = formatIsoAsJalaliDisplay(nowIso);
  return {
    ok: true,
    case: {
      ...kase,
      status: 'closed',
      isManagerBypassed: true,
      managerBypassReason: reason.trim(),
      closedAt: display,
      closedResult: 'manager_bypass',
      updatedAt: display
    },
    attempt
  };
}

export function returnCoordinationCaseForCorrection(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string,
  reason: string
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (!(ACTIVE_CASE_STATUSES as readonly string[]).includes(kase.status) && kase.status !== 'exception') {
    return { ok: false, reason: 'فقط پروندهٔ فعال قابل عودت برای اصلاح است.' };
  }
  if (!reason.trim()) return { ok: false, reason: 'ثبت دلیل مغایرت الزامی است.' };
  const attempt = makeAttempt(kase, actor, nowIso, 'mismatch_returned', { structuredReason: reason.trim() });
  const display = formatIsoAsJalaliDisplay(nowIso);
  return { ok: true, case: { ...kase, status: 'closed', closedAt: display, closedResult: 'mismatch_returned', updatedAt: display }, attempt };
}

export function recallPendingCoordinationCase(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (kase.status !== 'pending_assignment') return { ok: false, reason: 'پس از اقدام رسمی هماهنگی، پرونده فقط با عودت رسمی قابل بازگشت است.' };
  const attempt = makeAttempt(kase, actor, nowIso, 'recalled');
  const display = formatIsoAsJalaliDisplay(nowIso);
  return { ok: true, case: { ...kase, status: 'closed', closedAt: display, closedResult: 'recalled', updatedAt: display }, attempt };
}

const EXCEPTION_RESULTS: CoordinationAttemptResult[] = ['customer_cancelled', 'complaint_referred', 'escalated_to_manager'];
export function raiseCoordinationException(
  kase: CoordinationCase,
  actor: ActorContext,
  nowIso: string,
  result: CoordinationAttemptResult,
  note?: string
): { ok: true; case: CoordinationCase; attempt: CoordinationAttempt } | { ok: false; reason: string } {
  if (!EXCEPTION_RESULTS.includes(result)) return { ok: false, reason: 'نتیجهٔ نامعتبر برای صف استثنا.' };
  if (!(ACTIVE_CASE_STATUSES as readonly string[]).includes(kase.status)) {
    return { ok: false, reason: 'فقط پروندهٔ فعال قابل ارجاع به صف استثنا است.' };
  }
  if (!note?.trim()) return { ok: false, reason: 'شرح انصراف، شکایت یا ارجاع به مدیر الزامی است.' };
  const attempt = makeAttempt(kase, actor, nowIso, result, { note: note.trim() });
  const display = formatIsoAsJalaliDisplay(nowIso);
  return { ok: true, case: { ...kase, status: 'exception', updatedAt: display }, attempt };
}

export function chooseBalancedCoordinator(
  specialists: Array<{ id: string; fullName: string }>,
  cases: CoordinationCase[]
): { id: string; fullName: string } | null {
  if (specialists.length === 0) return null;
  const activeStatuses = new Set(['assigned', 'in_progress', 'callback_scheduled']);
  return [...specialists].sort((a, b) => {
    const aLoad = cases.filter((kase) => kase.assignedCoordinatorUserId === a.id && activeStatuses.has(kase.status)).length;
    const bLoad = cases.filter((kase) => kase.assignedCoordinatorUserId === b.id && activeStatuses.has(kase.status)).length;
    return aLoad - bLoad || a.id.localeCompare(b.id);
  })[0];
}
