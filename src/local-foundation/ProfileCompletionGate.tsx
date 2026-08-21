import {useState, type ReactNode} from 'react';
import {AlertTriangle, BadgeCheck, CreditCard, LockKeyhole, LogOut, MapPin, ShieldCheck, UserRound} from 'lucide-react';
import {FormValidationSummary, OptionalLabel, RequiredLabel} from './FormValidation';
import type {FoundationState} from './model';
import {missingProfileFields, validateRequiredProfile, type ProfileCompletionInput} from './profileCompletion';
import {digitsOnly, normalizeBankCard, normalizeIranianMobile} from '../utils/operationalFormat';

interface Props {
  state: FoundationState;
  busy: boolean;
  externalError?: string | null;
  onSubmit: (input: ProfileCompletionInput) => Promise<void>;
  onSignOut: () => void;
  onEndQa?: () => void;
}

export function ProfileCompletionGate({state, busy, externalError, onSubmit, onSignOut, onEndQa}: Props) {
  const personnel = state.personnel.find((item) => item.id === state.activeUser.personnelId || item.linkedUserId === state.activeUser.id);
  const initialMissing = missingProfileFields(personnel);
  const [form, setForm] = useState<ProfileCompletionInput>(() => ({
    nationalId: personnel?.nationalId ?? '',
    gender: personnel?.gender ?? 'unspecified',
    secondaryMobile: personnel?.secondaryMobile ?? '',
    province: personnel?.province ?? '',
    city: personnel?.city ?? '',
    address: personnel?.address ?? '',
    postalCode: personnel?.postalCode ?? '',
    bankName: personnel?.bankName ?? '',
    cardNumber: personnel?.cardNumber ?? '',
  }));
  const [errors, setErrors] = useState<string[]>([]);

  const update = <K extends keyof ProfileCompletionInput>(key: K, value: ProfileCompletionInput[K]) => setForm((current) => ({...current, [key]: value}));
  const submit = async () => {
    const next = validateRequiredProfile(form);
    setErrors(next);
    if (!next.length) await onSubmit(form);
  };

  return <div className="profile-completion-layer" role="dialog" aria-modal="true" aria-labelledby="profile-completion-title">
    <section className="profile-completion-card">
      <header className="profile-completion-heading">
        <span className="profile-completion-lock"><LockKeyhole size={24}/></span>
        <div><span>تکمیل پرونده پرسنلی</span><h2 id="profile-completion-title">برای ادامه، اطلاعات الزامی خود را کامل کنید</h2><p>{state.activeUser.name}، تا زمانی که موارد زیر تکمیل و ذخیره نشوند، دسترسی به بخش‌های سامانه امکان‌پذیر نیست.</p></div>
      </header>

      {!personnel ? <div className="profile-completion-blocked"><AlertTriangle size={22}/><div><strong>پرونده پرسنلی به حساب شما متصل نیست</strong><p>برای اتصال پرونده با ادمین سازمان تماس بگیرید. تا آن زمان فقط می‌توانید از حساب خارج شوید.</p></div></div> : <>
        <div className="profile-completion-notice"><AlertTriangle size={20}/><div><strong>{initialMissing.length.toLocaleString('en-US')} مورد الزامی نیاز به تکمیل دارد</strong><span>{initialMissing.map((item) => item.label).join('، ')}</span></div></div>
        <FormValidationSummary errors={[...errors, ...(externalError ? [externalError] : [])]}/>
        <div className="profile-completion-sections">
          <ProfileSection icon={<UserRound size={19}/>} title="اطلاعات فردی و تماس">
            <Field label="کد ملی" required><input aria-required="true" inputMode="numeric" dir="ltr" maxLength={10} value={form.nationalId ?? ''} onChange={(event) => update('nationalId', digitsOnly(event.target.value, 10))} placeholder="کد ملی ۱۰ رقمی"/></Field>
            <Field label="جنسیت" required><select aria-required="true" value={form.gender} onChange={(event) => update('gender', event.target.value as ProfileCompletionInput['gender'])}><option value="unspecified">انتخاب کنید</option><option value="female">زن</option><option value="male">مرد</option></select></Field>
            <Field label="شماره تماس دوم" required><input aria-required="true" inputMode="tel" dir="ltr" maxLength={11} value={form.secondaryMobile ?? ''} onChange={(event) => update('secondaryMobile', normalizeIranianMobile(event.target.value))} placeholder="09121234567"/></Field>
          </ProfileSection>
          <ProfileSection icon={<MapPin size={19}/>} title="نشانی محل سکونت">
            <Field label="استان" required><input aria-required="true" value={form.province ?? ''} onChange={(event) => update('province', event.target.value)}/></Field>
            <Field label="شهر" required><input aria-required="true" value={form.city ?? ''} onChange={(event) => update('city', event.target.value)}/></Field>
            <Field label="کد پستی"><input inputMode="numeric" dir="ltr" maxLength={10} value={form.postalCode ?? ''} onChange={(event) => update('postalCode', digitsOnly(event.target.value, 10))}/></Field>
            <Field label="نشانی" required full><textarea aria-required="true" value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} placeholder="نشانی کامل، خیابان، کوچه و پلاک"/></Field>
          </ProfileSection>
          <ProfileSection icon={<CreditCard size={19}/>} title="اطلاعات بانکی">
            <Field label="نام بانک" required><input aria-required="true" value={form.bankName ?? ''} onChange={(event) => update('bankName', event.target.value)} placeholder="مثلاً ملت"/></Field>
            <Field label="شماره کارت" required><input aria-required="true" inputMode="numeric" dir="ltr" maxLength={16} value={form.cardNumber ?? ''} onChange={(event) => update('cardNumber', normalizeBankCard(event.target.value))} placeholder="6104337812345678"/></Field>
            <div className="profile-sensitive-note"><ShieldCheck size={18}/><span>مقدارهای بانکی در گزارش ممیزی نمایش داده نمی‌شوند؛ فقط وقوع تکمیل پرونده ثبت می‌شود.</span></div>
          </ProfileSection>
        </div>
      </>}

      <footer className="profile-completion-actions">
        <div>{onEndQa && <button type="button" className="button button--secondary" onClick={onEndQa}>بازگشت به دسترسی ادمین</button>}<button type="button" className="button button--ghost" onClick={onSignOut}><LogOut size={17}/> خروج از حساب</button></div>
        {personnel && <button type="button" className="button button--primary" disabled={busy} onClick={() => void submit()}><BadgeCheck size={18}/>{busy ? 'در حال ذخیره…' : 'ذخیره و ورود به سامانه'}</button>}
      </footer>
    </section>
  </div>;
}

function ProfileSection({icon, title, children}: {icon: ReactNode; title: string; children: ReactNode}) {return <section className="profile-completion-section"><div className="profile-completion-section__title"><span>{icon}</span><strong>{title}</strong></div><div className="profile-completion-grid">{children}</div></section>;}
function Field({label, required = false, full = false, children}: {label: string; required?: boolean; full?: boolean; children: ReactNode}) {return <label className={`field-label ${full ? 'field-label--full' : ''}`}>{required ? <RequiredLabel>{label}</RequiredLabel> : <OptionalLabel>{label}</OptionalLabel>}{children}</label>;}
