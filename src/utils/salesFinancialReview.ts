import {
  DeclaredPayment,
  DeclaredPaymentHistoryEntry,
  DeclaredPaymentStatus,
  SalesFinancialDistributionMode,
  SalesFinancialReviewCase,
  SalesFinancialReviewEvent,
  SalesInvoice,
  SalesOverpaymentCase,
  User
} from '../types';
import { formatIsoAsJalaliDisplay } from './persianDate';
import { ActorContext } from './salesPersonnelLifecycle';
import { decideDeclaredPayment, returnForCorrection } from './salesInvoice';

type Result<T> = { ok: true } & T | { ok: false; reason: string };

function displayTime(nowIso: string) {
  const [jalaliDate, timeWithSeconds] = formatIsoAsJalaliDisplay(nowIso).split(' - ');
  return { display: `${jalaliDate} - ${timeWithSeconds}`, jalaliDate, timeWithSeconds };
}

function makeEvent(
  kase: SalesFinancialReviewCase,
  actor: ActorContext,
  nowIso: string,
  result: SalesFinancialReviewEvent['result'],
  fields: Partial<Pick<SalesFinancialReviewEvent, 'paymentId' | 'reason' | 'declaredAmount' | 'approvedAmount'>> = {}
): SalesFinancialReviewEvent {
  const time = displayTime(nowIso);
  const real = actor.real || actor.effective;
  return {
    id: `sfre_${kase.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    caseId: kase.id,
    invoiceId: kase.invoiceId,
    result,
    actorUserId: actor.effective.id,
    actorUserName: actor.effective.fullName,
    realActorUserId: real.id,
    effectiveUserId: actor.effective.id,
    occurredAtIso: nowIso,
    jalaliDate: time.jalaliDate,
    timeWithSeconds: time.timeWithSeconds,
    correlationId: `corr_sfr_${kase.invoiceId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...fields
  };
}

export function createFinancialReviewCase(
  invoice: SalesInvoice,
  nowIso: string,
  distributionMode: SalesFinancialDistributionMode = 'manual_assignment',
  reviewers: User[] = [],
  existingCases: SalesFinancialReviewCase[] = []
): SalesFinancialReviewCase {
  const display = displayTime(nowIso).display;
  const base: SalesFinancialReviewCase = {
    id: `sfr_${invoice.id}`,
    invoiceId: invoice.id,
    invoiceCode: invoice.invoiceCode,
    customerId: invoice.customerId,
    status: 'pending_assignment',
    distributionMode,
    createdAt: display,
    updatedAt: display
  };
  if (distributionMode !== 'balanced_assignment' || reviewers.length === 0) return base;
  const activeCounts = new Map(reviewers.map((u) => [u.id, existingCases.filter((c) => c.assignedReviewerUserId === u.id && c.status !== 'closed' && c.status !== 'returned_for_correction').length]));
  const chosen = [...reviewers].sort((a, b) => (activeCounts.get(a.id) || 0) - (activeCounts.get(b.id) || 0) || a.fullName.localeCompare(b.fullName, 'fa'))[0];
  return {
    ...base,
    status: 'assigned',
    assignedReviewerUserId: chosen.id,
    assignedReviewerUserName: chosen.fullName,
    assignedByUserId: 'system_balancer',
    assignedByUserName: 'توزیع متعادل سیستم',
    assignedAt: display
  };
}

export function ensureFinancialReviewCases(
  invoices: SalesInvoice[],
  cases: SalesFinancialReviewCase[],
  nowIso: string,
  distributionMode: SalesFinancialDistributionMode,
  reviewers: User[] = []
): SalesFinancialReviewCase[] {
  const activeStatuses = new Set(['awaiting_financial_confirmation', 'financial_suspicious_hold']);
  const missing = invoices.filter((invoice) => activeStatuses.has(invoice.status) && !cases.some((kase) => kase.invoiceId === invoice.id));
  return missing.reduce((all, invoice) => [...all, createFinancialReviewCase(invoice, nowIso, distributionMode, reviewers, all)], [...cases]);
}

export function assignFinancialReviewCase(
  kase: SalesFinancialReviewCase,
  reviewer: Pick<User, 'id' | 'fullName'>,
  actor: ActorContext,
  nowIso: string
): Result<{ case: SalesFinancialReviewCase; event: SalesFinancialReviewEvent }> {
  if (!['pending_assignment', 'assigned'].includes(kase.status)) return { ok: false, reason: 'این پرونده در وضعیت قابل تخصیص نیست.' };
  const display = displayTime(nowIso).display;
  const updated: SalesFinancialReviewCase = {
    ...kase,
    status: 'assigned',
    assignedReviewerUserId: reviewer.id,
    assignedReviewerUserName: reviewer.fullName,
    assignedByUserId: actor.effective.id,
    assignedByUserName: actor.effective.fullName,
    assignedAt: display,
    updatedAt: display
  };
  return { ok: true, case: updated, event: makeEvent(updated, actor, nowIso, 'assigned', { reason: `تخصیص به ${reviewer.fullName}` }) };
}

export function claimFinancialReviewCase(
  kase: SalesFinancialReviewCase,
  actor: ActorContext,
  nowIso: string
): Result<{ case: SalesFinancialReviewCase; event: SalesFinancialReviewEvent }> {
  const shared = kase.status === 'pending_assignment' && kase.distributionMode === 'shared_claim';
  if (kase.status !== 'assigned' && !shared) return { ok: false, reason: 'پرونده در وضعیت قابل Claim نیست.' };
  if (!shared && kase.assignedReviewerUserId !== actor.effective.id) return { ok: false, reason: 'فقط مسئول مالی تخصیص‌یافته می‌تواند پرونده را Claim کند.' };
  const display = displayTime(nowIso).display;
  const updated: SalesFinancialReviewCase = {
    ...kase,
    status: 'in_progress',
    assignedReviewerUserId: actor.effective.id,
    assignedReviewerUserName: actor.effective.fullName,
    assignedByUserId: shared ? actor.effective.id : kase.assignedByUserId,
    assignedByUserName: shared ? actor.effective.fullName : kase.assignedByUserName,
    assignedAt: shared ? display : kase.assignedAt,
    updatedAt: display
  };
  return { ok: true, case: updated, event: makeEvent(updated, actor, nowIso, 'claimed') };
}

export function decideFinancialPayment(
  kase: SalesFinancialReviewCase,
  invoice: SalesInvoice,
  paymentId: string,
  decision: Extract<DeclaredPaymentStatus, 'approved' | 'rejected' | 'needs_correction' | 'suspicious'>,
  approvedAmount: number | undefined,
  reason: string | undefined,
  actor: ActorContext,
  nowIso: string,
  overpayments: SalesOverpaymentCase[]
): Result<{ case: SalesFinancialReviewCase; invoice: SalesInvoice; event: SalesFinancialReviewEvent; overpayments: SalesOverpaymentCase[] }> {
  if (kase.invoiceId !== invoice.id) return { ok: false, reason: 'پرونده مالی با فاکتور تطبیق ندارد.' };
  if (kase.status !== 'in_progress' || kase.assignedReviewerUserId !== actor.effective.id) return { ok: false, reason: 'ابتدا پرونده را به نام خود Claim کنید.' };
  const payment = invoice.declaredPayments.find((p) => p.id === paymentId);
  if (!payment) return { ok: false, reason: 'ردیف پرداخت یافت نشد.' };
  const decided = decideDeclaredPayment(invoice, paymentId, decision, approvedAmount, reason, actor.effective, nowIso);
  if (decided.ok === false) return decided;
  const display = displayTime(nowIso).display;
  const status = decided.invoice.status === 'financial_suspicious_hold' ? 'suspicious_hold'
    : decided.invoice.status === 'financial_confirmed' ? 'closed' : 'in_progress';
  const resultMap = {
    approved: 'payment_approved', rejected: 'payment_rejected', needs_correction: 'payment_needs_correction', suspicious: 'payment_suspicious'
  } as const;
  const updatedCase: SalesFinancialReviewCase = {
    ...kase,
    status,
    holdReason: decision === 'suspicious' ? reason : kase.holdReason,
    updatedAt: display,
    closedAt: status === 'closed' ? display : undefined,
    closedResult: status === 'closed' ? 'financial_confirmed' : undefined
  };
  const event = makeEvent(updatedCase, actor, nowIso, resultMap[decision], {
    paymentId, reason, declaredAmount: payment.amount, approvedAmount
  });
  let nextOverpayments = overpayments;
  if (decision === 'approved' && approvedAmount !== undefined && payment.amount > approvedAmount) {
    const excessAmount = payment.amount - approvedAmount;
    const idempotencyKey = `${invoice.id}:${payment.id}:${excessAmount}`;
    if (!overpayments.some((item) => item.idempotencyKey === idempotencyKey)) {
      nextOverpayments = [...overpayments, {
        id: `overpay_${invoice.id}_${payment.id}`,
        invoiceId: invoice.id,
        invoiceCode: invoice.invoiceCode,
        paymentId: payment.id,
        excessAmount,
        status: 'open',
        idempotencyKey,
        createdAt: display,
        createdByUserId: actor.effective.id,
        createdByUserName: actor.effective.fullName
      }];
    }
  }
  return { ok: true, case: updatedCase, invoice: decided.invoice, event, overpayments: nextOverpayments };
}

export function releaseSuspiciousFinancialHold(
  kase: SalesFinancialReviewCase,
  invoice: SalesInvoice,
  paymentId: string,
  reason: string,
  actor: ActorContext,
  nowIso: string
): Result<{ case: SalesFinancialReviewCase; invoice: SalesInvoice; event: SalesFinancialReviewEvent }> {
  if (kase.status !== 'suspicious_hold' || invoice.status !== 'financial_suspicious_hold') return { ok: false, reason: 'پرونده در توقف مشکوک نیست.' };
  if (!reason.trim()) return { ok: false, reason: 'دلیل رفع توقف الزامی است.' };
  const payment = invoice.declaredPayments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'suspicious') return { ok: false, reason: 'ردیف مشکوک یافت نشد.' };
  const history: DeclaredPaymentHistoryEntry = {
    id: `${payment.id}_fh${(payment.financialHistory || []).length}`,
    status: 'declared', amount: payment.amount,
    byUserId: actor.effective.id, byUserName: actor.effective.fullName,
    at: nowIso, note: `رفع توقف مدیر: ${reason.trim()}`
  };
  const resetPayment: DeclaredPayment = {
    ...payment, status: 'declared', approvedAmount: undefined,
    financialApproverUserId: undefined, financialApproverUserName: undefined,
    financialDecisionAt: undefined, financialDecisionReason: undefined,
    financialHistory: [...(payment.financialHistory || []), history]
  };
  const display = displayTime(nowIso).display;
  const updatedCase: SalesFinancialReviewCase = { ...kase, status: 'in_progress', holdReason: undefined, updatedAt: display };
  const updatedInvoice: SalesInvoice = {
    ...invoice,
    status: 'awaiting_financial_confirmation',
    declaredPayments: invoice.declaredPayments.map((p) => p.id === paymentId ? resetPayment : p),
    updatedAt: nowIso,
    version: (invoice.version || 0) + 1,
    history: [...invoice.history, {
      id: `${invoice.id}_h${invoice.history.length}`, action: 'financial_suspicious_hold_released',
      byUserId: actor.effective.id, byUserName: actor.effective.fullName, at: display, note: reason.trim()
    }]
  };
  return { ok: true, case: updatedCase, invoice: updatedInvoice, event: makeEvent(updatedCase, actor, nowIso, 'hold_released', { paymentId, reason: reason.trim() }) };
}

export function returnFinancialCaseForCorrection(
  kase: SalesFinancialReviewCase,
  invoice: SalesInvoice,
  fields: { reason: string; description: string; paymentIds: string[] },
  actor: ActorContext,
  nowIso: string
): Result<{ case: SalesFinancialReviewCase; invoice: SalesInvoice; event: SalesFinancialReviewEvent }> {
  if (!['in_progress', 'suspicious_hold'].includes(kase.status)) return { ok: false, reason: 'فقط پروندهٔ فعال یا متوقف‌شده قابل عودت است.' };
  if (kase.assignedReviewerUserId !== actor.effective.id) return { ok: false, reason: 'فقط مسئول مالی پرونده می‌تواند آن را عودت دهد.' };
  if (fields.paymentIds.length === 0) return { ok: false, reason: 'حداقل یک ردیف یا فیلد مسئله‌دار را مشخص کنید.' };
  const returned = returnForCorrection(invoice, {
    reason: fields.reason,
    description: fields.description,
    correctedFields: fields.paymentIds.map((id) => `payment:${id}`)
  }, actor, nowIso);
  if (returned.ok === false) return returned;
  const display = displayTime(nowIso).display;
  const updatedCase: SalesFinancialReviewCase = {
    ...kase, status: 'returned_for_correction', updatedAt: display, closedAt: display, closedResult: 'returned_for_correction'
  };
  return {
    ok: true,
    case: updatedCase,
    invoice: returned.invoice,
    event: makeEvent(updatedCase, actor, nowIso, 'returned_for_correction', { reason: `${fields.reason} — ${fields.description}` })
  };
}
