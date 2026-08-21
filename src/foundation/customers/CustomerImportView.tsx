import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { foundationApi, foundationErrorMessage } from '../api/client';
import type { CustomerImportAction, CustomerImportJob, CustomerImportRecord } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';

const classificationLabels = {
  VALID: 'معتبر', INVALID: 'نامعتبر', EXACT_MATCH: 'تطبیق دقیق',
  POSSIBLE_DUPLICATE: 'تکراری احتمالی', REVIEW_REQUIRED: 'نیازمند بررسی',
} as const;
const actionLabels: Record<CustomerImportAction, string> = {
  CREATE_NEW: 'ساخت مشتری جدید', LINK_TO_EXISTING: 'اتصال به مشتری موجود',
  LINK_TO_STAGED: 'اتصال به ردیف همین فایل', REJECT: 'رد ردیف', KEEP_FOR_REVIEW: 'باز نگه‌داشتن بررسی',
};
const reasonLabels: Record<string, string> = {
  missing_or_short_full_name: 'نام کامل نیست', invalid_phone: 'شماره تلفن معتبر نیست',
  invalid_secondary_phone: 'شماره دوم معتبر نیست', duplicate_phone_fields: 'شماره اصلی و دوم یکسان است',
  invalid_purchase_date: 'تاریخ خرید معتبر نیست', invalid_purchase_amount: 'مبلغ خرید معتبر نیست',
  existing_normalized_phone_match: 'شماره تلفن در مرکز مشتریان وجود دارد',
  duplicate_normalized_phone_in_file: 'همین شماره در ردیف قبلی فایل است',
  existing_normalized_name_match: 'نام مشابه در مرکز مشتریان وجود دارد',
  normalized_name_match_in_file: 'نام مشابه در ردیف دیگری از فایل است',
  multiple_existing_phone_matches: 'چند تطبیق تلفن پیدا شد',
};

export function customerImportReasonLabel(reason: string): string {
  return reasonLabels[reason] ?? 'نیازمند بررسی دستی';
}

function Notice({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null;
}

export function CustomerImportView() {
  const { session } = useFoundationSession();
  const [jobs, setJobs] = useState<CustomerImportJob[]>([]);
  const [active, setActive] = useState<CustomerImportJob | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState('ورودی آزمایشی مشتریان');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permissions = session?.activeContext?.permissions ?? [];
  const canCreate = permissions.includes('customer.import.create');
  const canReview = permissions.includes('customer.import.review');
  const canApprove = permissions.includes('customer.import.approve');

  const loadJobs = useCallback(async () => {
    try { setJobs((await foundationApi.listCustomerImports()).imports); setError(null); }
    catch (caught) { setError(foundationErrorMessage(caught, 'فهرست ورود فایل‌ها دریافت نشد.')); }
  }, [session?.activeContext?.membershipId]);

  useEffect(() => { setActive(null); void loadJobs(); }, [loadJobs]);

  const openJob = async (jobId: string) => {
    setBusy(true);
    try { setActive((await foundationApi.readCustomerImport(jobId)).import); setError(null); }
    catch (caught) { setError(foundationErrorMessage(caught, 'جزئیات ورود فایل دریافت نشد.')); }
    finally { setBusy(false); }
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !file) return;
    setBusy(true);
    try {
      const result = await foundationApi.stageCustomerImport(file, await file.text(), sourceName, session.csrfToken);
      setActive(result.import); setFile(null); setError(null); await loadJobs();
    } catch (caught) { setError(foundationErrorMessage(caught, 'فایل در بخش بررسی اولیه ثبت نشد.')); }
    finally { setBusy(false); }
  };

  const mutate = async (operation: () => Promise<{ import: CustomerImportJob }>) => {
    setBusy(true);
    try { const result = await operation(); setActive(result.import); setError(null); await loadJobs(); }
    catch (caught) { setError(foundationErrorMessage(caught, 'عملیات ورود فایل انجام نشد.')); }
    finally { setBusy(false); }
  };

  const decide = (record: CustomerImportRecord, action: CustomerImportAction, target?: { customer?: string; record?: string }) => {
    if (!session || !active) return;
    void mutate(() => foundationApi.decideCustomerImportRecord(active.id, record.id, {
      action, targetCustomerId: target?.customer, targetRecordId: target?.record,
    }, session.csrfToken));
  };

  const unresolved = useMemo(() => active?.records?.filter((record) => !record.decidedAction || record.decidedAction === 'KEEP_FOR_REVIEW').length ?? 0, [active]);

  return <section className="max-w-7xl space-y-5 dir-rtl">
    <header className="rounded-3xl border border-emerald-800/40 bg-slate-900 p-6">
      <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-400"><FileUp /></div><div><h2 className="text-lg font-extrabold">ورود کنترل‌شده مشتریان از فایل</h2><p className="mt-1 text-xs text-slate-400">فایل ابتدا بررسی می‌شود؛ هیچ مشتری بدون تصمیم و تأیید نهایی ساخته نمی‌شود.</p></div></div>
    </header>

    {canCreate && <form onSubmit={upload} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-[1fr_1fr_auto]">
      <label className="grid gap-1 text-xs text-slate-400">فایل UTF-8 CSV
        <input aria-label="فایل CSV مشتریان" type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 file:ml-3 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-3 file:py-2 file:text-white" />
      </label>
      <label className="grid gap-1 text-xs text-slate-400">نام منبع
        <input aria-label="نام منبع ورود فایل" value={sourceName} onChange={(event) => setSourceName(event.target.value)} minLength={1} maxLength={200} required className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200" />
      </label>
      <button disabled={busy || !file} className="self-end rounded-xl bg-emerald-600 px-5 py-3 font-bold disabled:opacity-50">{busy ? <Loader2 className="mx-auto animate-spin" size={18} /> : 'بررسی و ثبت اولیه'}</button>
    </form>}
    <Notice error={error} />

    <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="self-start overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-3"><strong className="text-sm">ورودی‌های اخیر</strong><button type="button" onClick={() => void loadJobs()} title="بازخوانی"><RefreshCw size={16} /></button></div>
        {jobs.length === 0 ? <p className="p-5 text-sm text-slate-500">هنوز فایلی ثبت نشده است.</p> : jobs.map((job) => <button type="button" key={job.id} disabled={!canReview} title={canReview ? 'مشاهده جزئیات ورود فایل' : 'نمایش خلاصه؛ جزئیات خام نیازمند مجوز بررسی است'} onClick={() => canReview && void openJob(job.id)} className={`block w-full border-b border-slate-800 p-3 text-right text-sm last:border-0 enabled:hover:bg-slate-800 disabled:cursor-default ${active?.id === job.id ? 'bg-emerald-500/10' : ''}`}><strong className="block truncate">{job.fileName}</strong><span className="text-xs text-slate-400">{job.counts.total} ردیف · {job.status === 'approved' ? 'تأییدشده' : 'در انتظار بررسی'}</span></button>)}
      </aside>

      {active ? <article className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">{active.fileName}</h3><p className="text-xs text-slate-400">منبع: {active.sourceName}</p></div>{active.status === 'approved' ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-300"><CheckCircle2 size={16} />تأییدشده</span> : <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-sm text-amber-200"><AlertTriangle size={16} />{unresolved} تصمیم باز</span>}</div>
          <div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-8">
            <Count label="کل" value={active.counts.total} /><Count label="معتبر" value={active.counts.valid} /><Count label="نامعتبر" value={active.counts.invalid} /><Count label="دقیق" value={active.counts.exactMatch} /><Count label="احتمالی" value={active.counts.possibleDuplicate} /><Count label="بررسی" value={active.counts.reviewRequired} />
            <Count label="تأییدشده" value={active.counts.approved} /><Count label="ردشده" value={active.counts.rejected} />
          </div>
          {active.status !== 'approved' && <div className="mt-4 flex flex-wrap gap-2">
            {canReview && <button type="button" disabled={busy} onClick={() => session && void mutate(() => foundationApi.applySafeCustomerImportDecisions(active.id, session.csrfToken))} className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-bold text-emerald-300">اعمال تصمیم‌های کم‌ریسک</button>}
            {canApprove && <button type="button" disabled={busy || unresolved > 0} onClick={() => session && void mutate(() => foundationApi.approveCustomerImport(active.id, session.csrfToken))} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold disabled:opacity-40"><ShieldCheck size={16} />تأیید نهایی و انتقال به مرکز مشتریان</button>}
          </div>}
        </section>

        <div className="space-y-3">{active.records?.map((record) => <div key={record.id}><ImportRecordCard record={record} job={active} disabled={busy || !canReview || active.status === 'approved'} onDecide={decide} /></div>)}</div>
      </article> : <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-500">یک ورودی را انتخاب کنید یا فایل جدیدی برای بررسی ثبت کنید.</div>}
    </div>
  </section>;
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-950 p-3 text-center"><strong className="block text-lg text-emerald-300">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>;
}

function ImportRecordCard({ record, job, disabled, onDecide }: {
  record: CustomerImportRecord; job: CustomerImportJob; disabled: boolean;
  onDecide(record: CustomerImportRecord, action: CustomerImportAction, target?: { customer?: string; record?: string }): void;
}) {
  const candidates = job.candidates?.filter((item) => record.candidateCustomerIds.includes(item.id)) ?? [];
  const decision = record.decidedAction ? actionLabels[record.decidedAction] : 'بدون تصمیم نهایی';
  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-xs text-slate-500">ردیف {record.rowNumber}</span><h4 className="font-bold">{record.fullName || 'نام ثبت نشده'}</h4><p dir="ltr" className="text-sm text-slate-400">{record.phone || '—'}</p></div><div className="text-left"><span className="rounded-full bg-slate-800 px-3 py-1 text-xs">{classificationLabels[record.classification]}</span><p className="mt-2 text-xs text-emerald-300">{decision}</p></div></div>
    {record.reasons.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{record.reasons.map((reason) => <li key={reason} className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-200">{customerImportReasonLabel(reason)}</li>)}</ul>}
    {!disabled && <div className="mt-3 flex flex-wrap gap-2">
      {record.classification !== 'INVALID' && <button type="button" onClick={() => onDecide(record, 'CREATE_NEW')} className="rounded-lg border border-slate-600 px-3 py-2 text-xs">مشتری جدید</button>}
      {candidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => onDecide(record, 'LINK_TO_EXISTING', { customer: candidate.id })} className="rounded-lg border border-blue-600 px-3 py-2 text-xs text-blue-200">اتصال به {candidate.fullName}</button>)}
      {record.duplicateOfRecordId && <button type="button" onClick={() => onDecide(record, 'LINK_TO_STAGED', { record: record.duplicateOfRecordId! })} className="rounded-lg border border-violet-600 px-3 py-2 text-xs text-violet-200">اتصال به ردیف قبلی</button>}
      <button type="button" onClick={() => onDecide(record, 'REJECT')} className="rounded-lg border border-rose-700 px-3 py-2 text-xs text-rose-200">رد ردیف</button>
    </div>}
    {record.appliedCustomerId && <p className="mt-3 text-xs text-emerald-400">با موفقیت به مرکز مشتریان منتقل شد.</p>}
  </section>;
}
