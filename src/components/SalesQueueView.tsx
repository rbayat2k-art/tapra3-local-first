import React, { useState } from 'react';
import { Lead, CallLogEntry, CallOutcomeType, User, SystemRole, SystemPermission } from '../types';
import { recordCallOutcome, isLeadOverdue, CALL_OUTCOME_LABELS } from '../utils/callLog';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { getJalaliNow, getJalaliNowWithSeconds } from '../utils/persianDate';
import { applyBusinessUseLock } from '../utils/salesPersonnelLifecycle';
import { PhoneCall, Clock, AlertTriangle, CheckCircle2, XCircle, History } from 'lucide-react';

interface SalesQueueViewProps {
  leads: Lead[];
  onUpdateLeads: (leads: Lead[]) => void;
  callLogs: CallLogEntry[];
  onUpdateCallLogs: (logs: CallLogEntry[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'جدید', pending_action: 'در انتظار اقدام', callback_scheduled: 'یادآوری تماس', overdue: 'عقب‌افتاده',
  in_negotiation: 'در حال مذاکره', ready_for_invoice: 'آمادهٔ صدور فاکتور', closed_won: 'بسته‌شده (برد)',
  closed_lost: 'بسته‌شده (باخت)', wrong_number: 'شماره اشتباه', complaint_blocked: 'مسدود (شکایت)'
};

type QueueCategory = 'no_action' | 'callback_due' | 'overdue' | 'negotiation' | 'ready_for_invoice' | 'closed' | 'wrong_number' | 'complaint';

const CATEGORY_LABELS: Record<QueueCategory, string> = {
  no_action: 'بدون اقدام', callback_due: 'یادآوری تماس', overdue: 'عقب‌افتاده', negotiation: 'در حال مذاکره',
  ready_for_invoice: 'آمادهٔ صدور فاکتور', closed: 'بسته‌شده', wrong_number: 'شماره اشتباه', complaint: 'شکایت/مسدود'
};

export const SalesQueueView: React.FC<SalesQueueViewProps> = ({ leads, onUpdateLeads, callLogs, onUpdateCallLogs, currentUser, roles, effectivePermissions, impersonatorAdmin }) => {
  const [category, setCategory] = useState<QueueCategory>('no_action');
  const [activeCallLeadId, setActiveCallLeadId] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CallOutcomeType>('real_conversation');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [expandedHistoryLeadId, setExpandedHistoryLeadId] = useState<string | null>(null);

  const canView = hasPermission(effectivePermissions, ['view_sales_queue']);
  const canLog = hasPermission(effectivePermissions, ['log_call_outcome']);

  if (!currentUser) return null;
  if (!canView) return <div className="p-6 text-slate-500">دسترسی لازم برای مشاهدهٔ صف فروش را ندارید.</div>;

  const myLeads = leads.filter((l) => l.currentOwnerUserId === currentUser.id);
  const today = getJalaliNow().split(' ')[0];

  const categorized: Record<QueueCategory, Lead[]> = {
    no_action: myLeads.filter((l) => l.status === 'new' || (l.status === 'pending_action' && !isLeadOverdue(l, today))),
    callback_due: myLeads.filter((l) => l.status === 'callback_scheduled'),
    overdue: myLeads.filter((l) => l.status === 'overdue' || isLeadOverdue(l, today)),
    negotiation: myLeads.filter((l) => l.status === 'in_negotiation'),
    ready_for_invoice: myLeads.filter((l) => l.status === 'ready_for_invoice'),
    closed: myLeads.filter((l) => l.status === 'closed_won' || l.status === 'closed_lost'),
    wrong_number: myLeads.filter((l) => l.status === 'wrong_number'),
    complaint: myLeads.filter((l) => l.status === 'complaint_blocked')
  };

  const startCall = (leadId: string) => {
    setActiveCallLeadId(leadId);
    setCallStartedAt(getJalaliNow());
    setOutcome('real_conversation');
    setNote('');
    setCallbackAt('');
  };

  const cancelCall = () => {
    setActiveCallLeadId(null);
    setCallStartedAt(null);
  };

  const submitOutcome = () => {
    if (!canLog) { alert('مجوز ثبت نتیجهٔ تماس را ندارید.'); return; }
    const lead = leads.find((l) => l.id === activeCallLeadId);
    if (!lead || !callStartedAt) return;
    if (outcome === 'callback_requested' && !callbackAt.trim()) { alert('برای یادآوری تماس، تاریخ را وارد کنید.'); return; }

    const endedAt = getJalaliNow();
    const { updatedLead, callLogEntry } = recordCallOutcome(
      lead, outcome, note.trim() || undefined, callbackAt.trim() || undefined,
      { id: currentUser.id, fullName: currentUser.fullName }, callStartedAt, endedAt
    );
    const updatedLeads = leads.map((l) => (l.id === lead.id ? updatedLead : l));
    const updatedCallLogs = [callLogEntry, ...callLogs];
    // ثبت نتیجهٔ تماس «استفادهٔ مؤثر» از انتصاب فعال فروشنده است (بند ۲۱ AGENTS.md) — قفل در
    // همان تراکنش اتمیک زیر اعمال می‌شود تا هرگز بین ذخیرهٔ Lead/تماس و قفل انتصاب واگرایی نیفتد.
    const currentAssignments = storage.getSalesOrgAssignments();
    const lockedAssignments = applyBusinessUseLock(currentAssignments, currentUser.id, 'call_logged', callLogEntry.id, getJalaliNowWithSeconds());
    const tx = storage.saveCustomerIdentityTransaction({
      leads: updatedLeads, callLogs: updatedCallLogs,
      ...(lockedAssignments !== currentAssignments ? { salesOrgAssignments: lockedAssignments } : {})
    });
    if (tx.ok === false) {
      logAudit({ action: 'call_outcome_logged', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: lead.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'call_outcome_logged', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: lead.id, details: `نتیجه: ${CALL_OUTCOME_LABELS[outcome]}` });
    onUpdateLeads(updatedLeads);
    onUpdateCallLogs(updatedCallLogs);
    cancelCall();
  };

  const activeLead = myLeads.find((l) => l.id === activeCallLeadId);
  const list = categorized[category];

  return (
    <div className="space-y-6 dir-rtl" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><PhoneCall className="w-5 h-5" /> صف فروش من</h2>
        <p className="text-sm text-slate-500 mt-1">عملیات واقعی از همین صف انجام می‌شود — نه فقط یک داشبورد اطلاعاتی.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(CATEGORY_LABELS) as QueueCategory[]).map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${category === c ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {CATEGORY_LABELS[c]} ({categorized[c].length})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {list.length === 0 && <div className="p-6 text-center text-slate-400">Leadی در این دسته نیست.</div>}
        {list.map((lead) => {
          const leadCallLogs = callLogs.filter((c) => c.leadId === lead.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          const isActiveCall = activeCallLeadId === lead.id;
          return (
            <div key={lead.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold text-slate-800">{lead.trackingCode} — {STATUS_LABELS[lead.status]}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {lead.declaredInterest || '-'} {lead.lastCallOutcome && `— آخرین نتیجه: ${CALL_OUTCOME_LABELS[lead.lastCallOutcome]}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setExpandedHistoryLeadId(expandedHistoryLeadId === lead.id ? null : lead.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                    <History className="w-3.5 h-3.5" /> تاریخچه ({leadCallLogs.length})
                  </button>
                  {canLog && !isActiveCall && lead.status !== 'closed_won' && lead.status !== 'closed_lost' && (
                    <button onClick={() => startCall(lead.id)} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                      <PhoneCall className="w-3.5 h-3.5" /> شروع تماس آزمایشی
                    </button>
                  )}
                </div>
              </div>

              {expandedHistoryLeadId === lead.id && (
                <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs space-y-1.5">
                  {leadCallLogs.length === 0 && <div className="text-slate-400">هنوز تماسی ثبت نشده.</div>}
                  {leadCallLogs.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-slate-600">
                      <span>{c.startedAt} — {CALL_OUTCOME_LABELS[c.outcome]}{c.note ? ` — ${c.note}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {isActiveCall && activeLead && (
                <div className="mt-3 bg-indigo-50 rounded-lg p-3 space-y-2">
                  <div className="text-xs text-slate-500">تماس از {callStartedAt} در حال انجام —</div>
                  <select value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcomeType)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    {(Object.keys(CALL_OUTCOME_LABELS) as CallOutcomeType[]).map((o) => <option key={o} value={o}>{CALL_OUTCOME_LABELS[o]}</option>)}
                  </select>
                  {outcome === 'callback_requested' && (
                    <input placeholder="تاریخ یادآوری تماس (مثال: 1403/05/10)" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  )}
                  <textarea placeholder="توضیح تماس" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={submitOutcome} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> پایان تماس و ثبت نتیجه
                    </button>
                    <button onClick={cancelCall} className="flex items-center gap-1 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium">
                      <XCircle className="w-3.5 h-3.5" /> انصراف
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
