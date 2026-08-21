import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Edit3, Filter,
  Loader2, Plus, RefreshCw, Search, Sparkles, X,
} from 'lucide-react';
import { foundationApi, foundationErrorMessage } from '../api/client';
import type {
  OperationalModule, OperationalPriority, OperationalRecord, OperationalRecordInput, OperationalStatus,
} from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';

export interface OperationalModuleViewProps {
  module: OperationalModule;
  title: string;
  description: string;
  singular: string;
  recordTypes: Array<{ value: string; label: string }>;
  fixedRecordType?: string;
}

const permissionMap: Record<OperationalModule, { write: string; approve?: string }> = {
  task: { write: 'operations.task.write', approve: 'operations.task.assign' },
  finance: { write: 'operations.finance.write', approve: 'operations.finance.approve' },
  vendor: { write: 'operations.vendor.write' },
  catalog: { write: 'operations.catalog.write' },
  marketing: { write: 'operations.marketing.write' },
  fulfillment: { write: 'operations.fulfillment.write' },
  support: { write: 'operations.support.write' },
  communication: { write: 'operations.communication.write' },
  workflow: { write: 'operations.workflow.write' },
};

const statusLabels: Record<OperationalStatus, string> = {
  DRAFT: 'پیش‌نویس', OPEN: 'باز', PENDING: 'منتظر بررسی', IN_PROGRESS: 'در حال انجام',
  WAITING: 'در انتظار', APPROVED: 'تأییدشده', REJECTED: 'ردشده', COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغوشده', ARCHIVED: 'بایگانی‌شده',
};
const priorityLabels: Record<OperationalPriority, string> = {
  LOW: 'کم', NORMAL: 'عادی', HIGH: 'زیاد', URGENT: 'فوری',
};
const statusClasses: Record<OperationalStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', OPEN: 'bg-blue-50 text-blue-700',
  PENDING: 'bg-amber-50 text-amber-800', IN_PROGRESS: 'bg-indigo-50 text-indigo-700',
  WAITING: 'bg-violet-50 text-violet-700', APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700', COMPLETED: 'bg-teal-50 text-teal-700',
  CANCELLED: 'bg-slate-100 text-slate-500', ARCHIVED: 'bg-slate-200 text-slate-600',
};

const nextStatuses: Record<OperationalStatus, OperationalStatus[]> = {
  DRAFT: ['OPEN', 'PENDING', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'PENDING', 'COMPLETED', 'CANCELLED'],
  PENDING: ['APPROVED', 'REJECTED', 'IN_PROGRESS'],
  IN_PROGRESS: ['WAITING', 'COMPLETED', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'COMPLETED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'], CANCELLED: ['ARCHIVED'], ARCHIVED: [],
};

function localDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function amountLabel(value: string | null): string {
  return value ? `${Number(value).toLocaleString('fa-IR')} ریال` : 'بدون مبلغ';
}

function blankInput(recordType: string): OperationalRecordInput {
  return { recordType, title: '', description: '', priority: 'NORMAL', amount: null, dueAt: null, metadata: {} };
}

export function OperationalModuleView(props: OperationalModuleViewProps) {
  const { session } = useFoundationSession();
  const permissions = session?.activeContext?.permissions ?? [];
  const canWrite = permissions.includes(permissionMap[props.module].write);
  const canApprove = !!permissionMap[props.module].approve && permissions.includes(permissionMap[props.module].approve!);
  const defaultType = props.fixedRecordType ?? props.recordTypes[0]?.value ?? 'general';
  const [records, setRecords] = useState<OperationalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OperationalStatus | 'ALL'>('ALL');
  const [editor, setEditor] = useState<OperationalRecord | 'new' | null>(null);
  const [form, setForm] = useState<OperationalRecordInput>(blankInput(defaultType));
  const [transition, setTransition] = useState<{ record: OperationalRecord; status: OperationalStatus } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await foundationApi.listOperationalRecords(props.module);
      setRecords(result.records);
      setError(null);
    } catch (caught) {
      setError(foundationErrorMessage(caught, 'دریافت اطلاعات این بخش انجام نشد.'));
    } finally { setLoading(false); }
  }, [props.module, session?.activeContext?.contextKey]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => records.filter((record) => {
    if (props.fixedRecordType && record.recordType !== props.fixedRecordType) return false;
    if (statusFilter !== 'ALL' && record.status !== statusFilter) return false;
    const needle = query.trim().toLocaleLowerCase('fa');
    return !needle || [record.title, record.code, record.description, record.recordType]
      .some((value) => value.toLocaleLowerCase('fa').includes(needle));
  }), [props.fixedRecordType, query, records, statusFilter]);

  const stats = useMemo(() => ({
    total: visible.length,
    active: visible.filter((record) => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(record.status)).length,
    pending: visible.filter((record) => record.status === 'PENDING').length,
    completed: visible.filter((record) => ['APPROVED', 'COMPLETED'].includes(record.status)).length,
  }), [visible]);

  const openCreate = () => { setForm(blankInput(defaultType)); setEditor('new'); setError(null); };
  const openEdit = (record: OperationalRecord) => {
    setForm({
      recordType: record.recordType, code: record.code, title: record.title,
      description: record.description, priority: record.priority, amount: record.amount,
      dueAt: record.dueAt, assigneeUserAccountId: record.assigneeUserAccountId, metadata: record.metadata,
    });
    setEditor(record); setError(null);
  };

  const save = async () => {
    if (!session || !form.title.trim() || !form.recordType) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      if (editor === 'new') await foundationApi.createOperationalRecord(props.module, form, session.csrfToken);
      else if (editor) await foundationApi.updateOperationalRecord(props.module, editor.id, { ...form, version: editor.version }, session.csrfToken);
      setSuccess(editor === 'new' ? `${props.singular} با موفقیت ثبت شد.` : 'تغییرات با موفقیت ذخیره شد.');
      setEditor(null); await load();
    } catch (caught) { setError(foundationErrorMessage(caught, 'ذخیره اطلاعات انجام نشد.')); }
    finally { setSaving(false); }
  };

  const changeStatus = async () => {
    if (!session || !transition || reason.trim().length < 3) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await foundationApi.transitionOperationalRecord(props.module, transition.record.id, {
        status: transition.status, reason: reason.trim(), version: transition.record.version,
      }, session.csrfToken);
      setSuccess(`وضعیت ${props.singular} به «${statusLabels[transition.status]}» تغییر کرد.`);
      setTransition(null); setReason(''); await load();
    } catch (caught) { setError(foundationErrorMessage(caught, 'تغییر وضعیت انجام نشد.')); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5" dir="rtl">
    <header className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-l from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-xl sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-indigo-100">
            <Sparkles size={14} /> فضای عملیاتی یکپارچه
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{props.title}</h1>
          <p className="mt-2 text-sm leading-7 text-slate-300">{props.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/15">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> بازخوانی
          </button>
          {canWrite && <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-black shadow-lg shadow-indigo-950/40 hover:bg-indigo-400">
            <Plus size={18} /> ثبت {props.singular}
          </button>}
        </div>
      </div>
    </header>

    {(error || success) && <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role="status">
      {error ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}<span>{error ?? success}</span>
    </div>}

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        ['کل موارد', stats.total, 'bg-slate-900 text-white'], ['در جریان', stats.active, 'bg-indigo-50 text-indigo-800'],
        ['منتظر بررسی', stats.pending, 'bg-amber-50 text-amber-800'], ['نهایی‌شده', stats.completed, 'bg-emerald-50 text-emerald-800'],
      ].map(([label, value, classes]) => <div key={String(label)} className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${classes}`}>
        <div className="text-xs font-bold opacity-70">{label}</div><div className="mt-2 text-3xl font-black">{value}</div>
      </div>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="relative flex-1"><Search size={17} className="absolute right-3 top-3 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو در عنوان، کد یا توضیحات…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50" />
        </label>
        <label className="relative"><Filter size={16} className="absolute right-3 top-3 text-slate-400" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OperationalStatus | 'ALL')} className="w-full min-w-52 rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm font-bold outline-none md:w-auto">
            <option value="ALL">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
    </section>

    {loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
      : visible.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><Search className="text-slate-400" /></div><h3 className="mt-4 font-black text-slate-800">موردی پیدا نشد</h3><p className="mt-1 text-sm text-slate-500">فیلترها را تغییر دهید یا یک {props.singular} جدید ثبت کنید.</p></div>
      : <section className="grid gap-4 xl:grid-cols-2">
        {visible.map((record) => <article key={record.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusClasses[record.status]}`}>{statusLabels[record.status]}</span><span className="font-mono text-xs text-slate-400" dir="ltr">{record.code}</span></div><h2 className="mt-3 truncate text-lg font-black text-slate-900">{record.title}</h2></div>
            {canWrite && <button type="button" onClick={() => openEdit(record)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700" title="ویرایش"><Edit3 size={17} /></button>}
          </div>
          <p className="mt-2 line-clamp-2 min-h-11 text-sm leading-6 text-slate-600">{record.description || 'بدون توضیح تکمیلی'}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">اولویت</span><strong className="mt-1 block text-slate-700">{priorityLabels[record.priority]}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">مبلغ</span><strong className="mt-1 block text-slate-700">{amountLabel(record.amount)}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">موعد</span><strong className="mt-1 block text-slate-700">{localDate(record.dueAt)}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">آخرین ویرایش</span><strong className="mt-1 block text-slate-700">{record.updatedByName}</strong></div>
          </div>
          {(canWrite || canApprove) && nextStatuses[record.status].length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {nextStatuses[record.status].filter((status) => !(['APPROVED', 'REJECTED'].includes(status) && props.module === 'finance' && !canApprove)).slice(0, 4).map((status) =>
              <button key={status} type="button" onClick={() => setTransition({ record, status })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">{statusLabels[status]}</button>)}
          </div>}
        </article>)}
      </section>}

    {editor && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null); }}>
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">{editor === 'new' ? `ثبت ${props.singular}` : `ویرایش ${props.singular}`}</h2><p className="mt-1 text-xs text-slate-500">اطلاعات ضروری را کامل و سپس ذخیره کنید.</p></div><button onClick={() => setEditor(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X /></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {!props.fixedRecordType && <Field label="نوع"><select value={form.recordType} onChange={(event) => setForm({ ...form, recordType: event.target.value })} className={inputClass}>{props.recordTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>}
          <Field label="کد (اختیاری)"><input value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClass} dir="ltr" placeholder="تولید خودکار" /></Field>
          <Field label="عنوان" wide><input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} maxLength={240} /></Field>
          <Field label="توضیحات" wide><textarea value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} min-h-28 resize-y`} maxLength={5000} /></Field>
          <Field label="اولویت"><select value={form.priority ?? 'NORMAL'} onChange={(event) => setForm({ ...form, priority: event.target.value as OperationalPriority })} className={inputClass}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="مبلغ (ریال)"><input value={form.amount ?? ''} onChange={(event) => setForm({ ...form, amount: event.target.value || null })} className={inputClass} inputMode="decimal" dir="ltr" /></Field>
          <Field label="موعد"><input type="datetime-local" value={form.dueAt ? form.dueAt.slice(0, 16) : ''} onChange={(event) => setForm({ ...form, dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className={inputClass} /></Field>
        </div>
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => setEditor(null)} disabled={saving} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">انصراف</button><button onClick={() => void save()} disabled={saving || form.title.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">{saving && <Loader2 className="animate-spin" size={17} />} ذخیره اطلاعات</button></div>
      </section>
    </div>}

    {transition && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Clock3 /></div><h2 className="mt-4 text-lg font-black">تغییر وضعیت به «{statusLabels[transition.status]}»</h2><p className="mt-1 text-sm text-slate-500">برای ثبت در تاریخچه، دلیل این اقدام را بنویسید.</p><textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} mt-4 min-h-24`} placeholder="دلیل اقدام…" /><div className="mt-5 flex gap-2"><button onClick={() => { setTransition(null); setReason(''); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">انصراف</button><button onClick={() => void changeStatus()} disabled={saving || reason.trim().length < 3} className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">ثبت تغییر</button></div></section>
    </div>}
  </div>;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50';
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block text-xs font-bold text-slate-600 ${wide ? 'sm:col-span-2' : ''}`}><span className="mb-1.5 block">{label}</span>{children}</label>;
}

