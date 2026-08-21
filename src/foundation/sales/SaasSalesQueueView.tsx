import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, History, PhoneCall, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { foundationApi, foundationErrorMessage } from '../api/client';
import type { SalesCallOutcome, SalesLead, SalesLeadDetail } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';
import { formatSalesDate, SALES_CALL_OUTCOME_LABELS, SALES_LEAD_STATUS_LABELS } from './labels';

type QueueCategory = 'no_action' | 'callback_due' | 'overdue' | 'negotiation' | 'ready_for_invoice' | 'closed' | 'wrong_number' | 'complaint';

const categoryLabels: Record<QueueCategory, string> = {
  no_action: 'بدون اقدام', callback_due: 'یادآوری تماس', overdue: 'عقب‌افتاده', negotiation: 'در حال مذاکره',
  ready_for_invoice: 'آمادهٔ صدور فاکتور', closed: 'بسته‌شده', wrong_number: 'شماره اشتباه', complaint: 'شکایت/مسدود',
};

const relationshipProtectionLabels = {
  none: 'بدون انحصار',
  until_reassigned: 'تا زمان بازتخصیص',
  duration: 'مدت‌دار',
} as const;

function isOverdue(lead: SalesLead): boolean {
  return !!lead.actionDeadline && new Date(lead.actionDeadline).getTime() < Date.now()
    && ['pending_action', 'callback_scheduled'].includes(lead.status);
}

function messageFrom(error: unknown): string {
  return foundationErrorMessage(error, 'دریافت صف فروش انجام نشد؛ اتصال را بررسی و دوباره تلاش کنید.');
}

export function SaasSalesQueueView() {
  const { session } = useFoundationSession();
  const permissions = session?.activeContext?.permissions ?? [];
  const canView = permissions.includes('sales.queue.read') || permissions.includes('sales.lead.read_all');
  const canLog = permissions.includes('sales.call.create');
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [category, setCategory] = useState<QueueCategory>('no_action');
  const [activeCallLeadId, setActiveCallLeadId] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SalesCallOutcome>('real_conversation');
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [detail, setDetail] = useState<SalesLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const response = await foundationApi.listSalesLeads();
      setLeads(response.leads);
      setError(null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [canView, session?.activeContext?.membershipId]);

  useEffect(() => { void load(); }, [load]);

  const categorized = useMemo<Record<QueueCategory, SalesLead[]>>(() => ({
    no_action: leads.filter((lead) => lead.status === 'new' || (lead.status === 'pending_action' && !isOverdue(lead))),
    callback_due: leads.filter((lead) => lead.status === 'callback_scheduled' && !isOverdue(lead)),
    overdue: leads.filter((lead) => lead.status === 'overdue' || isOverdue(lead)),
    negotiation: leads.filter((lead) => lead.status === 'in_negotiation'),
    ready_for_invoice: leads.filter((lead) => lead.status === 'ready_for_invoice'),
    closed: leads.filter((lead) => lead.status === 'closed_won' || lead.status === 'closed_lost'),
    wrong_number: leads.filter((lead) => lead.status === 'wrong_number'),
    complaint: leads.filter((lead) => lead.status === 'complaint_blocked'),
  }), [leads]);

  const startCall = (leadId: string) => {
    setActiveCallLeadId(leadId);
    setCallStartedAt(new Date().toISOString());
    setOutcome('real_conversation');
    setNote('');
    setCallbackAt('');
    setError(null);
  };

  const cancelCall = () => {
    setActiveCallLeadId(null);
    setCallStartedAt(null);
  };

  const openHistory = async (leadId: string) => {
    if (detail?.id === leadId) {
      setDetail(null);
      return;
    }
    try {
      setDetail((await foundationApi.readSalesLead(leadId)).lead);
      setError(null);
    } catch (caught) {
      setError(messageFrom(caught));
    }
  };

  const submitCall = async () => {
    if (!session || !activeCallLeadId || !callStartedAt || !canLog) return;
    if (outcome === 'callback_requested' && !callbackAt) {
      setError('برای درخواست تماس مجدد، زمان تماس بعدی را وارد کنید.');
      return;
    }
    setSaving(true);
    try {
      const response = await foundationApi.recordSalesCall(activeCallLeadId, {
        outcome,
        startedAt: callStartedAt,
        note: note.trim() || undefined,
        callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        context: { ui: 'sales_queue' },
      }, session.csrfToken);
      setDetail(response.lead);
      cancelCall();
      await load();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!canView) return <div className="p-6 text-slate-500">مجوز لازم برای مشاهده صف فروش را ندارید.</div>;

  const list = categorized[category];
  return <div className="space-y-6 dir-rtl" dir="rtl">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800"><PhoneCall className="h-5 w-5" />صف فروش من</h2>
        <p className="mt-1 text-sm text-slate-500">صف، تماس‌ها و تاریخچه رابطه در سامانه ثبت می‌شوند؛ پایان شیفت باعث انتقال خودکار کارهای باز نمی‌شود.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />بازخوانی
      </button>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

    <nav aria-label="دسته‌های صف فروش" className="flex flex-wrap gap-2">
      {(Object.keys(categoryLabels) as QueueCategory[]).map((item) => <button key={item} type="button" onClick={() => setCategory(item)}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${category === item ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
        {categoryLabels[item]} ({categorized[item].length})
      </button>)}
    </nav>

    <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {loading && <div className="p-6 text-center text-slate-400">در حال دریافت صف…</div>}
      {!loading && list.length === 0 && <div className="p-6 text-center text-slate-400">سرنخ فروشی در این دسته نیست.</div>}
      {list.map((lead) => {
        const activeCall = activeCallLeadId === lead.id;
        const currentDetail = detail?.id === lead.id ? detail : null;
        return <article key={lead.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800">{lead.trackingCode} — {lead.customerName}</div>
              <div className="mt-1 text-xs text-slate-500">{SALES_LEAD_STATUS_LABELS[lead.status]} — {lead.declaredInterest}</div>
              <div className="mt-1 text-xs text-slate-400">{lead.company.name} · {[lead.campaignReference, lead.promotionReference].filter(Boolean).join(' · ') || lead.source}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void openHistory(lead.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                <History className="h-3.5 w-3.5" />تاریخچه ({lead.callCount})
              </button>
              {canLog && !activeCall && !['closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked'].includes(lead.status) && <button type="button" onClick={() => startCall(lead.id)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">
                <PhoneCall className="h-3.5 w-3.5" />شروع تماس
              </button>}
            </div>
          </div>

          {currentDetail && <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {currentDetail.relationship?.ownerName && <div className="flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-4 w-4" />رابطه فعال: {currentDetail.relationship.ownerName} · شیوه حفاظت: {relationshipProtectionLabels[currentDetail.relationship.lockMode]}</div>}
            {currentDetail.marketingLinks.length > 0 && <div className="rounded-lg border border-cyan-100 bg-cyan-50 p-2 text-cyan-900">
              زمینه فروش: {currentDetail.marketingLinks.map((link) => `${link.type === 'campaign' ? 'کمپین' : 'پیشنهاد فروش'} ${link.referenceCode}${link.displayName ? ` — ${link.displayName}` : ''}`).join('، ')}
            </div>}
            {currentDetail.calls.length === 0 && <div className="text-slate-400">هنوز تماسی ثبت نشده است.</div>}
            {currentDetail.calls.map((call) => <div key={call.id} className="rounded-lg border border-slate-200 bg-white p-2">
              <div>{formatSalesDate(call.startedAt)} — {SALES_CALL_OUTCOME_LABELS[call.outcome]} {call.effective ? '· مؤثر' : '· ناموفق/غیرمؤثر'}</div>
              <div className="mt-1 text-slate-400">{call.companyName} · {call.salespersonName} · {call.campaignReference ?? 'بدون کمپین'}</div>
              {call.marketingSnapshot.length > 0 && <div className="mt-1 text-slate-400">زمینه ثبت‌شده: {call.marketingSnapshot.map((link) => `${link.type === 'campaign' ? 'کمپین' : 'پیشنهاد فروش'}: ${link.referenceCode}`).join('، ')}</div>}
              {call.note && <div className="mt-1">{call.note}</div>}
            </div>)}
            {currentDetail.assignments.length > 0 && <div className="border-t border-slate-200 pt-2">آخرین تخصیص: {currentDetail.assignments.at(-1)?.assigneeName} توسط {currentDetail.assignments.at(-1)?.assignedByName}</div>}
          </div>}

          {activeCall && <div className="mt-3 space-y-2 rounded-lg bg-indigo-50 p-3">
            <div className="text-xs text-slate-500">شروع تماس: {formatSalesDate(callStartedAt)}</div>
            <select aria-label="نتیجه تماس" value={outcome} onChange={(event) => setOutcome(event.target.value as SalesCallOutcome)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {(Object.keys(SALES_CALL_OUTCOME_LABELS) as SalesCallOutcome[]).map((item) => <option key={item} value={item}>{SALES_CALL_OUTCOME_LABELS[item]}</option>)}
            </select>
            {outcome === 'callback_requested' && <input aria-label="زمان تماس مجدد" type="datetime-local" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />}
            <textarea aria-label="توضیح تماس" value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="توضیح تماس" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => void submitCall()} disabled={saving} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />پایان و ثبت تماس</button>
              <button type="button" onClick={cancelCall} disabled={saving} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600"><XCircle className="h-3.5 w-3.5" />انصراف</button>
            </div>
          </div>}
        </article>;
      })}
    </section>
  </div>;
}
