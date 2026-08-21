import { Lead, LeadStatus, LeadTimelineEntry, CallOutcomeType, CallLogEntry } from '../types';

// ============================================================
// Adapter ثبت تماس (بند ۱۰ مأموریت فروش) — یک لایهٔ Adapter است، نه اتصال واقعی Issabel.
// کاملاً خالص — بدون localStorage/alert.
// ============================================================

export const CALL_OUTCOME_LABELS: Record<CallOutcomeType, string> = {
  not_dialed: 'شماره‌گیری نشد', could_not_connect: 'اتصال برقرار نشد', switched_off: 'خاموش',
  no_answer: 'پاسخ داده نشد', wrong_number: 'شماره اشتباه', connected_no_time: 'وصل شد ولی فرصت صحبت نبود',
  real_conversation: 'گفتگوی واقعی و معرفی انجام شد', callback_requested: 'درخواست تماس مجدد',
  interested: 'علاقه‌مند', ready_for_invoice: 'آمادهٔ صدور فاکتور', cancelled: 'انصراف داد', complaint: 'شکایت/پشتیبانی'
};

// نگاشت نتیجهٔ تماس به وضعیت Lead — null یعنی «هنوز نیازمند اقدام»، نه تغییر وضعیت خاص.
const OUTCOME_TO_STATUS: Record<CallOutcomeType, LeadStatus | null> = {
  not_dialed: null, could_not_connect: null, switched_off: null, no_answer: null, connected_no_time: null,
  wrong_number: 'wrong_number', real_conversation: 'in_negotiation', callback_requested: 'callback_scheduled',
  interested: 'in_negotiation', ready_for_invoice: 'ready_for_invoice', cancelled: 'closed_lost', complaint: 'complaint_blocked'
};

export interface RecordCallOutcomeResult {
  updatedLead: Lead;
  callLogEntry: CallLogEntry;
}

// هر تماسِ ثبت‌شده (حتی بی‌پاسخ) hadFirstContact را true می‌کند — «اولین تماس ثبت‌شده» یعنی
// اولین بار که یک تلاش واقعی برای تماس ثبت شده، نه لزوماً اولین مکالمهٔ موفق.
export function recordCallOutcome(
  lead: Lead, outcome: CallOutcomeType, note: string | undefined, callbackAt: string | undefined,
  actor: { id: string; fullName: string }, startedAt: string, endedAt: string
): RecordCallOutcomeResult {
  const nextStatusFromOutcome = OUTCOME_TO_STATUS[outcome];
  const nextStatus: LeadStatus = nextStatusFromOutcome || (lead.status === 'new' ? 'pending_action' : lead.status);

  const callLogEntry: CallLogEntry = {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, leadId: lead.id, customerId: lead.customerId,
    salespersonUserId: actor.id, salespersonUserName: actor.fullName, startedAt, endedAt, outcome, note,
    callbackAt: outcome === 'callback_requested' ? callbackAt : undefined, createdAt: endedAt
  };

  const timelineEntry: LeadTimelineEntry = {
    id: `${lead.id}_t${lead.timeline.length}`, type: 'call_logged',
    title: `تماس ثبت شد — نتیجه: ${CALL_OUTCOME_LABELS[outcome]}`, detail: note,
    actorUserId: actor.id, actorUserName: actor.fullName, timestamp: endedAt
  };

  const updatedLead: Lead = {
    ...lead, status: nextStatus, hadFirstContact: true, lastCallOutcome: outcome,
    actionDeadline: outcome === 'callback_requested' ? callbackAt : lead.actionDeadline,
    timeline: [...lead.timeline, timelineEntry]
  };

  return { updatedLead, callLogEntry };
}

// «صف روزانه بدون اقدام باقی نماند» (بند ۹ مأموریت): true یعنی این Lead هنوز امروز به هیچ
// نتیجه‌ای نرسیده و مهلت اقدامش گذشته — فقط محاسبه، بدون هیچ نوشتن.
export function isLeadOverdue(lead: Lead, nowDateOnly: string): boolean {
  if (lead.status !== 'pending_action' && lead.status !== 'callback_scheduled') return false;
  if (!lead.actionDeadline) return false;
  return lead.actionDeadline < nowDateOnly;
}
