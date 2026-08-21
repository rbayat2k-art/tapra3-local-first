import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Database,
  History,
  Link2,
  Loader2,
  MapPin,
  Merge,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { foundationApi, foundationErrorMessage } from '../api/client';
import type {
  DuplicateCheckResult,
  FoundationCustomer,
  FoundationCustomerProfile,
} from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';

const eventLabels: Record<string, string> = {
  customer_created: 'ایجاد پروفایل',
  phone_added: 'افزودن شماره تماس',
  address_added: 'افزودن نشانی',
  source_linked: 'اتصال منبع',
  customer_merged: 'ادغام پروفایل',
  customer_split: 'بازگردانی ادغام',
  customer_identity_merged: 'یکپارچه‌سازی هویت مرکزی',
  customer_identity_split: 'بازگردانی هویت مرکزی',
  sales_lead_created: 'ایجاد سرنخ فروش',
  sales_call_logged: 'ثبت تماس فروش',
  sales_marketing_linked: 'اتصال زمینه بازاریابی',
  sales_sale_created: 'ثبت فروش',
  sales_invoice_created: 'ایجاد صورتحساب فروش',
  sales_payment_recorded: 'ثبت اعلام پرداخت',
  sales_payment_reviewed: 'بررسی مالی پرداخت',
};

const sourceLabels: Record<string, string> = {
  manual: 'ورود دستی',
  foundation_migration: 'مهاجرت Foundation Sprint 1',
  legacy_crm: 'CRM قدیمی',
  excel: 'Excel',
  call_center: 'مرکز تماس',
  website: 'وب‌سایت',
  campaign: 'کمپین',
  external_company: 'شرکت بیرونی',
  api_integration: 'یکپارچه‌سازی سامانه',
};

export function customerEventLabel(eventType: string): string {
  return eventLabels[eventType] ?? 'رویداد مشتری';
}

export function customerSourceLabel(sourceType: string): string {
  return sourceLabels[sourceType] ?? 'منبع ثبت‌شده';
}

const eventSummaries: Record<string, string> = {
  sales_lead_created: 'سرنخ فروش برای مشتری ایجاد شد.',
  sales_sale_created: 'فروش در سابقه ارتباط با مشتری ثبت شد.',
  sales_invoice_created: 'صورتحساب فروش به‌صورت خودکار ایجاد شد.',
  sales_payment_recorded: 'پرداخت صورتحساب فروش اعلام شد.',
  sales_payment_reviewed: 'پرداخت به‌صورت مستقل توسط واحد مالی بررسی شد.',
};

export function customerEventSummary(eventType: string, summary: string): string {
  return eventSummaries[eventType] ?? summary;
}

export function customerSourceName(sourceName: string): string {
  return sourceName === 'Deterministic development seed' ? 'دادهٔ پایدار محیط توسعه' : sourceName;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function ErrorNotice({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{message}</p> : null;
}

export function SaasCustomersView() {
  const { session } = useFoundationSession();
  const [customers, setCustomers] = useState<FoundationCustomer[]>([]);
  const [profile, setProfile] = useState<FoundationCustomerProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = session?.activeContext?.permissions ?? [];
  const canCreate = permissions.includes('customer.create');
  const canManageIdentity = permissions.includes('customer.identity.manage');
  const canMerge = permissions.includes('customer.merge');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await foundationApi.listCustomers();
      setCustomers(response.customers);
      setError(null);
    } catch (caught) {
      setError(foundationErrorMessage(caught, 'دریافت مشتریان انجام نشد.'));
    } finally {
      setLoading(false);
    }
  }, [session?.activeContext?.membershipId]);

  useEffect(() => {
    setProfile(null);
    setDuplicate(null);
    void load();
  }, [load]);

  const openProfile = async (customerId: string) => {
    setProfileLoading(true);
    try {
      setProfile((await foundationApi.readCustomer(customerId)).customer);
      setError(null);
    } catch (caught) {
      setError(foundationErrorMessage(caught, 'دریافت پروفایل انجام نشد.'));
    } finally {
      setProfileLoading(false);
    }
  };

  const persistCustomer = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const created = await foundationApi.createCustomer({ fullName, phonePrimary }, session.csrfToken);
      setFullName('');
      setPhonePrimary('');
      setDuplicate(null);
      await load();
      setProfile(created.customer);
      setError(null);
    } catch (caught) {
      setError(foundationErrorMessage(caught, 'ثبت مشتری انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    try {
      const result = await foundationApi.checkCustomerDuplicates({ phone: phonePrimary, fullName }, session.csrfToken);
      setDuplicate(result);
      setError(null);
      if (result.match === 'NO_MATCH') {
        setSaving(false);
        await persistCustomer();
        return;
      }
    } catch (caught) {
      setError(foundationErrorMessage(caught, 'بررسی تکراری بودن انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-6xl space-y-5 dir-rtl">
      <header className="rounded-3xl border border-emerald-800/40 bg-slate-900 p-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-400"><Users /></div>
          <div><h2 className="font-extrabold text-lg">نمای جامع مشتری</h2><p className="text-xs text-slate-400 mt-1">پروفایل پایدار و امن مشتری در محیط کاری فعال</p></div>
        </div>
        <button onClick={() => void load()} className="rounded-xl border border-slate-700 p-2 text-slate-300" title="بازخوانی"><RefreshCw size={18} /></button>
      </header>

      {canCreate && <form onSubmit={create} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input aria-label="نام مشتری جدید" value={fullName} onChange={(event) => { setFullName(event.target.value); setDuplicate(null); }} minLength={2} required placeholder="نام و نام خانوادگی" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" />
        <input aria-label="شماره تماس مشتری جدید" dir="ltr" value={phonePrimary} onChange={(event) => { setPhonePrimary(event.target.value); setDuplicate(null); }} minLength={7} required placeholder="09121234567" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" />
        <button disabled={saving} className="rounded-xl bg-emerald-600 px-4 font-bold flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />} بررسی و ثبت</button>
      </form>}

      {duplicate && duplicate.match !== 'NO_MATCH' && <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold text-amber-200"><AlertTriangle size={19} />{duplicate.match === 'EXACT_MATCH' ? 'این شماره قبلاً برای یک مشتری ثبت شده است.' : 'مشتری‌ای با همین نام پیدا شد؛ لطفاً بررسی کنید.'}</div>
        {duplicate.candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => void openProfile(candidate.id)} className="block w-full rounded-xl border border-amber-500/20 bg-slate-950/40 p-3 text-right"><strong>{candidate.fullName}</strong><span dir="ltr" className="mr-3 text-sm text-amber-100">{candidate.phonePrimary}</span></button>)}
        {duplicate.match === 'POSSIBLE_DUPLICATE' && <button type="button" disabled={saving} onClick={() => void persistCustomer()} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold">پس از بررسی، پروفایل جدا ثبت شود</button>}
      </div>}

      {!canCreate && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">دسترسی شما در این محیط فقط خواندنی است.</p>}
      <ErrorNotice message={error} />

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.8fr)]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden self-start">
          {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-emerald-400" /></div> : customers.length === 0
            ? <p className="p-8 text-center text-slate-400">هنوز مشتری‌ای در این شرکت ثبت نشده است.</p>
            : customers.map((customer) => <button type="button" key={customer.id} onClick={() => void openProfile(customer.id)} className={`w-full p-4 border-b last:border-b-0 border-slate-800 flex items-center justify-between gap-3 text-right hover:bg-slate-800/60 ${profile?.id === customer.id ? 'bg-emerald-500/10' : ''}`}><div><strong className="block">{customer.fullName}</strong><span dir="ltr" className="text-sm text-slate-400">{customer.phonePrimary}</span></div><ArrowRight size={17} className="text-emerald-500" /></button>)}
        </div>

        {profileLoading ? <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-400" /></div> : profile
          ? <CustomerProfilePanel
              profile={profile}
              customers={customers}
              csrfToken={session!.csrfToken}
              canManageIdentity={canManageIdentity}
              canMerge={canMerge}
              onChanged={async (updated) => { setProfile(updated); await load(); }}
              onError={setError}
            />
          : <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-500"><Database className="mx-auto mb-3" /><p>برای مشاهده پروفایل کامل، یک مشتری را انتخاب کنید.</p></div>}
      </div>
    </section>
  );
}

function CustomerProfilePanel({
  profile,
  customers,
  csrfToken,
  canManageIdentity,
  canMerge,
  onChanged,
  onError,
}: {
  profile: FoundationCustomerProfile;
  customers: FoundationCustomer[];
  csrfToken: string;
  canManageIdentity: boolean;
  canMerge: boolean;
  onChanged(profile: FoundationCustomerProfile): Promise<void>;
  onError(message: string | null): void;
}) {
  const [phone, setPhone] = useState('');
  const [phoneLabel, setPhoneLabel] = useState('mobile');
  const [addressText, setAddressText] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeReason, setMergeReason] = useState('پروفایل‌های یک مشتری با بررسی انسانی تأیید شدند.');
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const [unmergeConfirmId, setUnmergeConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mergeCandidates = useMemo(() => customers.filter((customer) => customer.id !== profile.id), [customers, profile.id]);

  const mutate = async (operation: () => Promise<FoundationCustomerProfile>) => {
    setBusy(true);
    try { await onChanged(await operation()); onError(null); }
    catch (caught) { onError(foundationErrorMessage(caught, 'تغییر پروفایل انجام نشد.')); }
    finally { setBusy(false); }
  };

  const addPhone = (event: React.FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const updated = (await foundationApi.addCustomerPhone(profile.id, { value: phone, label: phoneLabel }, csrfToken)).customer;
      setPhone('');
      return updated;
    });
  };

  const addAddress = (event: React.FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const updated = (await foundationApi.addCustomerAddress(profile.id, { addressText, city, province, label: 'other' }, csrfToken)).customer;
      setAddressText(''); setCity(''); setProvince('');
      return updated;
    });
  };

  const merge = () => {
    if (!mergeTarget || !mergeConfirmed) return;
    void mutate(async () => {
      const updated = (await foundationApi.mergeCustomers({ customerId: profile.id, targetCustomerId: mergeTarget, reason: mergeReason }, csrfToken)).canonicalCustomer;
      setMergeTarget(''); setMergeConfirmed(false);
      return updated;
    });
  };

  const unmerge = (operationId: string) => {
    if (unmergeConfirmId !== operationId) { setUnmergeConfirmId(operationId); return; }
    void mutate(async () => {
      const updated = (await foundationApi.unmergeCustomers(operationId, 'بازگردانی ادغام پس از بررسی انسانی.', csrfToken)).canonicalCustomer;
      setUnmergeConfirmId(null);
      return updated;
    });
  };

  return <article className="space-y-4">
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-emerald-400">پروفایل مشتری</p><h3 className="mt-1 text-xl font-extrabold">{profile.fullName}</h3><p dir="ltr" className="mt-1 text-slate-400">{profile.phonePrimary}</p></div><ShieldCheck className="text-emerald-500" /></div>
    </section>

    <div className="grid gap-4 md:grid-cols-2">
      <ProfileCard icon={<Phone size={18} />} title="شماره‌های تماس">
        {profile.phones.map((item) => <div key={item.id} className="rounded-xl bg-slate-950 p-3"><div className="flex justify-between gap-2"><span dir="ltr">{item.value}</span><span className="text-xs text-emerald-400">{item.isPrimary ? 'اصلی' : item.label}</span></div>{item.originalCustomerId !== profile.id && <small className="text-amber-300">از پروفایل ادغام‌شده</small>}</div>)}
        {canManageIdentity && <form onSubmit={addPhone} className="grid grid-cols-[1fr_auto_auto] gap-2"><input aria-label="شماره تماس جدید" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={7} required placeholder="شماره جدید" className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" /><select aria-label="برچسب شماره" value={phoneLabel} onChange={(event) => setPhoneLabel(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs"><option value="mobile">همراه</option><option value="work">کاری</option><option value="home">منزل</option></select><button disabled={busy} className="rounded-lg bg-emerald-700 p-2" title="افزودن شماره"><Plus size={17} /></button></form>}
      </ProfileCard>

      <ProfileCard icon={<MapPin size={18} />} title="نشانی‌ها">
        {profile.addresses.length === 0 && <p className="text-sm text-slate-500">نشانی ثبت نشده است.</p>}
        {profile.addresses.map((item) => <div key={item.id} className="rounded-xl bg-slate-950 p-3 text-sm"><strong>{item.label}{item.isPrimary ? ' · اصلی' : ''}</strong><p className="mt-1 text-slate-300">{[item.province, item.city, item.addressText].filter(Boolean).join('، ')}</p>{item.originalCustomerId !== profile.id && <small className="text-amber-300">از پروفایل ادغام‌شده</small>}</div>)}
        {canManageIdentity && <form onSubmit={addAddress} className="grid gap-2"><div className="grid grid-cols-2 gap-2"><input aria-label="استان" value={province} onChange={(event) => setProvince(event.target.value)} placeholder="استان" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" /><input aria-label="شهر" value={city} onChange={(event) => setCity(event.target.value)} placeholder="شهر" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" /></div><div className="flex gap-2"><input aria-label="نشانی جدید" value={addressText} onChange={(event) => setAddressText(event.target.value)} minLength={2} required placeholder="نشانی کامل" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" /><button disabled={busy} className="rounded-lg bg-emerald-700 p-2" title="افزودن نشانی"><Plus size={17} /></button></div></form>}
      </ProfileCard>

      <ProfileCard icon={<Link2 size={18} />} title="منابع داده">
        {profile.sources.map((source) => <div key={source.id} className="rounded-xl bg-slate-950 p-3 text-sm"><strong>{customerSourceLabel(source.sourceType)}</strong><p className="mt-1 text-slate-400">{customerSourceName(source.sourceName)}</p><small className="text-slate-500">ورود: {formatDate(source.ingestedAt)}</small></div>)}
      </ProfileCard>

      <ProfileCard icon={<History size={18} />} title="تاریخچه">
        {profile.timeline.map((event) => <div key={event.id} className="border-r-2 border-emerald-800 pr-3"><strong className="text-sm">{customerEventLabel(event.eventType)}</strong><p className="text-xs text-slate-400">{customerEventSummary(event.eventType, event.summary)}</p><time className="text-[11px] text-slate-500">{formatDate(event.occurredAt)}</time></div>)}
      </ProfileCard>
    </div>

    {canMerge && <ProfileCard icon={<Merge size={18} />} title="ادغام رابطه شرکتی؛ کنترل‌شده و قابل بازگشت">
      {mergeCandidates.length > 0 && <div className="grid gap-2 md:grid-cols-2"><select aria-label="انتخاب پروفایل برای ادغام" value={mergeTarget} onChange={(event) => { setMergeTarget(event.target.value); setMergeConfirmed(false); }} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"><option value="">انتخاب مشتری دیگر</option>{mergeCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.fullName} — {candidate.phonePrimary}</option>)}</select><input aria-label="دلیل ادغام" value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} minLength={3} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" /></div>}
      {mergeTarget && <label className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><input type="checkbox" checked={mergeConfirmed} onChange={(event) => setMergeConfirmed(event.target.checked)} /> تأیید می‌کنم هر دو رابطه شرکتی بررسی شده‌اند و ادغام باید قابل بازگشت بماند.</label>}
      {mergeTarget && <button type="button" disabled={!mergeConfirmed || busy} onClick={merge} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold disabled:opacity-50">ادغام رابطه شرکتی</button>}
      {profile.merges.filter((item) => item.status === 'active' && item.canonicalCustomerId === profile.id).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 p-3 text-sm"><span>یک ادغام فعال · {formatDate(item.mergedAt)}</span><button type="button" disabled={busy} onClick={() => unmerge(item.id)} className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs"><RotateCcw size={14} />{unmergeConfirmId === item.id ? 'تأیید بازگردانی' : 'بازگردانی ادغام'}</button></div>)}
    </ProfileCard>}
  </article>;
}

function ProfileCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3"><h4 className="flex items-center gap-2 font-bold text-slate-200">{icon}{title}</h4>{children}</section>;
}
