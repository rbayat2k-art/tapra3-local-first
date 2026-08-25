import {useMemo, useState} from 'react';
import {ArrowLeft, Check, ChevronDown, CircleAlert, ClipboardCheck, CreditCard, Eye, EyeOff, KeyRound, MapPin, Search, ShieldCheck, UserPlus, UserRound, X} from 'lucide-react';
import type {FoundationState, RegistrationRequest} from './model';
import type {LocalFoundationService, RegistrationInput} from './service';
import {formatPersianDateTime} from './PersianDate';
import {digitsOnly, normalizeBankCard, normalizeIranianMobile} from '../utils/operationalFormat';
import {FormValidationSummary, OptionalLabel, RequiredLabel} from './FormValidation';
import {REGISTRATION_ASSIGNABLE_ROLE_IDS} from './accessPolicy';
import {RecordDialog} from './RecordDialog';

interface ReviewProps {state: FoundationState; service: LocalFoundationService; execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>}

export function RegistrationPage({state, service, execute}: ReviewProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RegistrationRequest | null>(null);
  const normalized = query.trim().toLocaleLowerCase('fa-IR');
  const rows = state.registrationRequests.filter((item) => `${item.fullName} ${item.mobile} ${item.nationalId} ${item.requestedUsername} ${item.trackingCode}`.toLocaleLowerCase('fa-IR').includes(normalized));
  return <div className="page-stack">
    <section className="page-intro"><div className="page-intro__icon"><ClipboardCheck size={24}/></div><div><span className="eyebrow">گردش ثبت‌نام</span><h2>درخواست‌های ثبت‌نام</h2><p>هویت، کد ملی، موبایل و نام کاربری پیش از ثبت و دوباره هنگام فعال‌سازی کنترل می‌شوند.</p></div></section>
    <section className="panel"><div className="operational-toolbar"><div><span className="eyebrow">صف بررسی</span><h3>{rows.length.toLocaleString('en-US')} درخواست</h3></div><label className="search-field"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام، موبایل، کد ملی، نام کاربری یا کد پیگیری…"/></label></div><div className="registration-list">{rows.map((item) => <button key={item.id} onClick={() => setSelected(item)}><span className={`state-badge state-badge--${item.status === 'rejected' ? 'danger' : item.status === 'activated' ? 'good' : 'progress'}`}>{registrationLabel(item.status)}</span><div><strong>{item.fullName}</strong><small>{item.trackingCode} · {item.mobile} · @{item.requestedUsername}</small><time>ثبت در {formatPersianDateTime(item.createdAt)}</time></div><ArrowLeft size={17}/></button>)}{!rows.length && <div className="empty-state"><UserPlus size={28}/><strong>درخواستی مطابق جست‌وجو پیدا نشد.</strong></div>}</div></section>
    {selected && <ReviewDialog request={selected} state={state} onClose={() => setSelected(null)} onReview={(decision, reason, roleIds) => execute('registration-review', () => service.reviewRegistration(selected.id, selected.version, decision, reason, roleIds), 'تصمیم منابع انسانی ذخیره شد.').then((succeeded) => {if (succeeded) setSelected(null);})} onActivate={(password) => execute('registration-activate', () => service.activateRegistration(selected.id, selected.version, password), 'حساب ثبت‌نام فعال شد.').then((succeeded) => {if (succeeded) setSelected(null);})}/>}
  </div>;
}

const EMPTY_REGISTRATION: RegistrationInput = {fullName: '', mobile: '', secondaryMobile: '', email: '', nationalId: '', gender: 'unspecified', province: '', city: '', address: '', postalCode: '', bankName: '', cardNumber: '', requestedUsername: '', selfDeclaration: {}};

export function RegistrationDialog({service, onClose, onDone}: {service: LocalFoundationService; onClose: () => void; onDone: (state: FoundationState) => void}) {
  const [form, setForm] = useState<RegistrationInput>(EMPTY_REGISTRATION);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) => setForm((current) => ({...current, [key]: value}));
  async function submit() {setBusy(true); setError(''); try {onDone(await service.submitRegistration(form));} catch (cause) {setError(cause instanceof Error ? cause.message : 'ثبت درخواست ممکن نشد.'); setBusy(false);}}
  return <div className="modal-scrim"><form className="dialog dialog--registration" onSubmit={(event) => {event.preventDefault(); void submit();}}>
    <header><div><span className="eyebrow">درخواست دسترسی سازمانی</span><h2>ثبت‌نام کامل در تیرا</h2><p>تمام موارد ستاره‌دار برای ایجاد درخواست الزامی هستند.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="dialog-body registration-form-body">
      {error && <div className="notice notice--danger"><CircleAlert size={18}/><span>{error}</span></div>}
      <RegistrationSection icon={<UserRound size={18}/>} title="هویت و حساب">
        <Field label="نام و نام خانوادگی" required full><input required value={form.fullName} onChange={(event) => update('fullName', event.target.value)}/></Field>
        <Field label="کد ملی" required><input required inputMode="numeric" dir="ltr" maxLength={10} value={form.nationalId} onChange={(event) => update('nationalId', digitsOnly(event.target.value, 10))}/></Field>
        <Field label="جنسیت" required><select required value={form.gender} onChange={(event) => update('gender', event.target.value as RegistrationInput['gender'])}><option value="unspecified">انتخاب کنید</option><option value="female">زن</option><option value="male">مرد</option></select></Field>
        <Field label="نام کاربری پیشنهادی" required><input required dir="ltr" autoComplete="username" value={form.requestedUsername} onChange={(event) => update('requestedUsername', event.target.value)} placeholder="name.family"/></Field>
        <Field label="ایمیل"><input type="email" dir="ltr" value={form.email} onChange={(event) => update('email', event.target.value)}/></Field>
      </RegistrationSection>
      <RegistrationSection icon={<MapPin size={18}/>} title="تماس و نشانی">
        <Field label="شماره همراه اصلی" required><input required inputMode="tel" dir="ltr" maxLength={11} value={form.mobile} onChange={(event) => update('mobile', normalizeIranianMobile(event.target.value))} placeholder="09125026707"/></Field>
        <Field label="شماره تماس دوم" required><input required inputMode="tel" dir="ltr" maxLength={11} value={form.secondaryMobile} onChange={(event) => update('secondaryMobile', normalizeIranianMobile(event.target.value))} placeholder="09121234567"/></Field>
        <Field label="استان" required><input required value={form.province} onChange={(event) => update('province', event.target.value)}/></Field>
        <Field label="شهر" required><input required value={form.city} onChange={(event) => update('city', event.target.value)}/></Field>
        <Field label="کد پستی"><input inputMode="numeric" dir="ltr" maxLength={10} value={form.postalCode} onChange={(event) => update('postalCode', digitsOnly(event.target.value, 10))}/></Field>
        <Field label="نشانی کامل" required full><textarea required rows={3} value={form.address} onChange={(event) => update('address', event.target.value)}/></Field>
      </RegistrationSection>
      <RegistrationSection icon={<CreditCard size={18}/>} title="اطلاعات بانکی">
        <Field label="نام بانک" required><input required value={form.bankName} onChange={(event) => update('bankName', event.target.value)}/></Field>
        <Field label="شماره کارت" required><input required inputMode="numeric" dir="ltr" maxLength={16} value={form.cardNumber} onChange={(event) => update('cardNumber', normalizeBankCard(event.target.value))} placeholder="6104337812345678"/></Field>
        <div className="registration-security-note"><ShieldCheck size={18}/><span>کد ملی، موبایل و نام کاربری تکراری پذیرفته نمی‌شوند. رمز عبور اولیه پس از بررسی توسط ادمین تخصیص داده می‌شود.</span></div>
      </RegistrationSection>
    </div>
    <footer><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary" disabled={busy}>{busy ? 'در حال کنترل و ثبت…' : 'ثبت درخواست'}</button></footer>
  </form></div>;
}

function ReviewDialog({request, state, onClose, onReview, onActivate}: {request: RegistrationRequest; state: FoundationState; onClose: () => void; onReview: (decision: 'in_review'|'needs_correction'|'rejected'|'approved', reason: string, roles: string[]) => Promise<unknown>; onActivate: (password: string) => Promise<unknown>}) {
  const [reason, setReason] = useState(request.reviewReason ?? '');
  const [roles, setRoles] = useState<string[]>([]);
  const [roleQuery, setRoleQuery] = useState('');
  const [decision, setDecision] = useState<'in_review'|'needs_correction'|'rejected'|'approved'>('in_review');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const visibleRoles = useMemo(() => {const query = roleQuery.trim().toLocaleLowerCase('fa-IR'); return state.roles.filter((role) => role.status === 'active' && REGISTRATION_ASSIGNABLE_ROLE_IDS.has(role.id) && (!query || `${role.name} ${role.description}`.toLocaleLowerCase('fa-IR').includes(query)));}, [roleQuery, state.roles]);
  const activated = request.status === 'activated';
  const mayReview = state.activeUser.permissions.includes('organization.registrations.review');
  const mayActivate = state.activeUser.permissions.includes('organization.registrations.activate');
  const submit = async () => {if (busy) return; const next: string[] = []; if (['needs_correction','rejected'].includes(decision) && reason.trim().length < 3) next.push('برای اصلاح یا رد درخواست، دلیل را وارد کنید.'); if (decision === 'approved' && !roles.length) next.push('حداقل یک نقش ورودی مجاز پیشنهاد کنید.'); setErrors(next); if (!next.length) {setBusy(true); try {await onReview(decision, reason, roles);} finally {setBusy(false);}}};
  const activate = async () => {if (busy) return; const next: string[] = []; if (password.length < 8) next.push('رمز عبور اولیه باید حداقل ۸ نویسه باشد.'); if (password !== passwordConfirm) next.push('تکرار رمز عبور اولیه یکسان نیست.'); setErrors(next); if (!next.length) {setBusy(true); try {await onActivate(password);} finally {setBusy(false);}}};
  return <RecordDialog ariaLabel={`بررسی درخواست ثبت‌نام ${request.fullName}، ${request.trackingCode}`} className="dialog--registration-review" onClose={() => {if (!busy) onClose();}}>
    <header><div><span className="eyebrow">{request.trackingCode}</span><h2>{request.fullName}</h2><p>ثبت در {formatPersianDateTime(request.createdAt)}</p></div><button className="icon-button" disabled={busy} onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <fieldset className="dialog-body registration-review-body" disabled={busy} aria-busy={busy}>
      <div className="record-facts registration-review-facts"><div><span>موبایل اصلی<strong dir="ltr">{request.mobile}</strong></span></div><div><span>کد ملی<strong dir="ltr">{request.nationalId || 'ثبت نشده'}</strong></span></div><div><span>نام کاربری<strong dir="ltr">@{request.requestedUsername}</strong></span></div><div><span>تاریخ و ساعت ثبت<strong>{formatPersianDateTime(request.createdAt)}</strong></span></div><div><span>وضعیت<strong>{registrationLabel(request.status)}</strong></span></div></div>
      <div className="registration-review-details"><span><b>تماس دوم</b><strong dir="ltr">{request.secondaryMobile || '—'}</strong></span><span><b>نشانی</b><strong>{[request.province, request.city, request.address].filter(Boolean).join('، ') || '—'}</strong></span><span><b>بانک</b><strong>{request.bankName || '—'} · {maskCard(request.cardNumber)}</strong></span></div>
      {activated ? <div className="notice notice--success"><Check size={18}/><span>این درخواست در {formatPersianDateTime(request.updatedAt)} فعال شده و حساب آن ساخته شده است.</span></div> : <>
        {request.status === 'approved' && <div className="notice notice--success"><ShieldCheck size={18}/><span>منابع انسانی نقش‌های ورودی را پیشنهاد داده است. فعال‌سازی نهایی و ساخت رمز فقط توسط مدیر سامانه انجام می‌شود.</span></div>}
        {mayReview && request.status !== 'approved' && <>
        <div className="segmented-control" role="group" aria-label="تصمیم منابع انسانی">{([['in_review','در حال بررسی'],['needs_correction','نیازمند اصلاح'],['rejected','رد'],['approved','تأیید پیشنهاد نقش']] as const).map(([id, label]) => <button type="button" className={decision === id ? 'active' : ''} aria-pressed={decision===id} disabled={busy} key={id} onClick={() => setDecision(id)}>{label}</button>)}</div>
        <FormValidationSummary errors={errors}/>
        {decision === 'approved' && <div className="registration-activation-panel">
          <div className="activation-heading"><ShieldCheck size={19}/><div><strong>پیشنهاد نقش ورودی</strong><span>فقط نقش‌های شروع همکاری قابل انتخاب‌اند؛ حساب در مرحله بعد ساخته می‌شود.</span></div></div>
          <details className="registration-role-picker"><summary><span>{roles.length.toLocaleString('en-US')} نقش انتخاب‌شده</span><small>بازکردن فهرست نقش‌ها</small><ChevronDown size={17}/></summary><div><label className="compact-role-search"><Search size={16}/><input value={roleQuery} onChange={(event) => setRoleQuery(event.target.value)} placeholder="جست‌وجوی نقش…"/></label><div className="registration-role-list">{visibleRoles.map((role) => <label key={role.id} className={roles.includes(role.id) ? 'selected' : ''}><input type="checkbox" checked={roles.includes(role.id)} onChange={(event) => setRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))}/><span>{roles.includes(role.id) && <Check size={13}/>}</span><div><strong>{role.name}</strong><small>{role.description}</small></div><b>{role.permissions.length.toLocaleString('en-US')} مجوز</b></label>)}{!visibleRoles.length && <p>نقشی پیدا نشد.</p>}</div></div></details>
        </div>}
        <label className="field"><OptionalLabel>دلیل / یادداشت بررسی</OptionalLabel><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)}/></label>
        </>}
        {request.status === 'approved' && <div className="registration-activation-panel">
          <div className="activation-heading"><KeyRound size={19}/><div><strong>فعال‌سازی نهایی حساب</strong><span>نقش‌های پیشنهادی: {(request.proposedRoleIds ?? []).map((id) => state.roles.find((role) => role.id === id)?.name ?? id).join('، ') || 'ثبت نشده'}</span></div></div>
          {mayActivate ? <><FormValidationSummary errors={errors}/><div className="registration-password-grid"><label className="field"><RequiredLabel>رمز عبور اولیه</RequiredLabel><span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="حداقل ۸ نویسه"/><button type="button" aria-label={showPassword ? 'پنهان‌کردن رمز' : 'نمایش رمز'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label><label className="field"><RequiredLabel>تکرار رمز عبور</RequiredLabel><input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)}/></label></div></> : <p>این مرحله در انتظار مدیر سامانه است.</p>}
        </div>}
      </>}
    </fieldset>
    <footer>{busy && <span className="registration-review-status" role="status" aria-live="polite">در حال ثبت امن؛ تا پایان عملیات پنجره باز می‌ماند.</span>}<button className="button button--ghost" disabled={busy} onClick={onClose}>{activated ? 'بستن' : 'انصراف'}</button>{!activated && mayReview && request.status !== 'approved' && <button className="button button--primary" disabled={busy} onClick={()=>void submit()}><Check size={17}/> {busy?'در حال ثبت…':'ثبت تصمیم منابع انسانی'}</button>}{request.status === 'approved' && mayActivate && <button className="button button--primary" disabled={busy} onClick={()=>void activate()}><KeyRound size={17}/> {busy?'در حال فعال‌سازی…':'فعال‌سازی حساب'}</button>}</footer>
  </RecordDialog>;
}

function RegistrationSection({icon, title, children}: {icon: React.ReactNode; title: string; children: React.ReactNode}) {return <section className="registration-form-section"><div className="registration-form-heading"><span>{icon}</span><strong>{title}</strong></div><div className="registration-form-grid">{children}</div></section>;}
function Field({label, required = false, full = false, children}: {label: string; required?: boolean; full?: boolean; children: React.ReactNode}) {return <label className={`field ${full ? 'field--wide' : ''}`}>{required ? <RequiredLabel>{label}</RequiredLabel> : <OptionalLabel>{label}</OptionalLabel>}{children}</label>;}
function maskCard(value = '') {const digits = value.replace(/\D/g, ''); return digits ? `**** **** **** ${digits.slice(-4)}` : 'شماره کارت ثبت نشده';}
function registrationLabel(value: RegistrationRequest['status']) {return {submitted: 'ثبت‌شده', in_review: 'در حال بررسی', needs_correction: 'نیازمند اصلاح', approved: 'تأییدشده', rejected: 'ردشده', activated: 'حساب فعال'}[value];}
