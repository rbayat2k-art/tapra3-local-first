import {useMemo, useState, type ReactNode} from 'react';
import {
  BadgeDollarSign, Banknote, BriefcaseBusiness, Check, ChevronDown, CircleAlert, Clock3, ContactRound,
  FileClock, IdCard, MapPin, PackageCheck, PencilLine, Phone, Send, ShieldCheck, UserRound, X, type LucideIcon,
} from 'lucide-react';
import type {
  FoundationState, PersonnelProfileChangeField, PersonnelProfileChangeRequest, PersonnelProfileChangeValues, PersonnelRecord,
} from './model';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {formatPersianDate, formatPersianDateTime, PersianDateInput} from './PersianDate';
import type {LocalFoundationService, OwnProfileChangeInput} from './service';
import {
  digitsOnly, isValidBankCard, isValidIranianIban, isValidIranianMobile, isValidPostalCode,
  normalizeBankCard, normalizeIranianIban, normalizeIranianLandline, normalizeIranianMobile, normalizePostalCode,
  formatPortalAmount,
} from '../utils/operationalFormat';
import {currentSalesCompensation, orderedSalesCompensationHistory, salesCompensationModeLabel} from './salesCompensation';
import {MyAssetsSection} from './MyAssetsSection';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;

export const FIELD_LABELS: Record<PersonnelProfileChangeField, string> = {
  firstName: 'نام', lastName: 'نام خانوادگی', fatherName: 'نام پدر', nationalId: 'کد ملی', identityNumber: 'شماره شناسنامه',
  birthDate: 'تاریخ تولد', birthPlace: 'محل تولد', gender: 'جنسیت', maritalStatus: 'وضعیت تأهل', primaryMobile: 'همراه اصلی',
  secondaryMobile: 'شماره تماس دوم', phone: 'تلفن ثابت', personalEmail: 'ایمیل شخصی', province: 'استان', city: 'شهر',
  address: 'نشانی', postalCode: 'کد پستی', bankName: 'نام بانک', accountNumber: 'شماره حساب', cardNumber: 'شماره کارت',
  iban: 'شماره شبا', emergencyName: 'نام تماس اضطراری', emergencyRelation: 'نسبت', emergencyPhone: 'شماره تماس اضطراری',
};

const EDITABLE_FIELDS = Object.keys(FIELD_LABELS) as PersonnelProfileChangeField[];

export function MyAccountPage({state, service, execute}: {state: FoundationState; service: LocalFoundationService; execute: Execute}) {
  const user = state.activeUser;
  const personnel = state.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
  const [editing, setEditing] = useState(false);
  const ownRequests = state.personnelProfileChangeRequests.filter((request) => request.requesterUserId === user.id);
  const pending = ownRequests.find((request) => request.status === 'submitted');

  if (!personnel) return <section className="panel account-profile-missing"><CircleAlert size={26}/><div><h2>پرونده پرسنلی متصل نیست</h2><p>برای مشاهده و درخواست تغییر اطلاعات، ابتدا باید حساب شما به پرونده پرسنلی متصل شود.</p></div></section>;

  const unit = state.units.find((item) => item.id === personnel.unitId)?.name ?? 'تعیین نشده';
  const position = state.positions.find((item) => item.id === personnel.positionId)?.title ?? 'تعیین نشده';
  const branch = state.units.find((item) => item.id === personnel.branchUnitId)?.name ?? 'تعیین نشده';
  const manager = state.personnel.find((item) => item.id === personnel.managerPersonnelId);
  const compensation = currentSalesCompensation(personnel);

  return <div className="page-stack my-account-page">
    <section className="my-account-hero">
      <span className="persona-avatar persona-avatar--large" style={{background: user.accent}}>{user.initials}</span>
      <div><span className="eyebrow">حساب کاربری من</span><h2>{personnel.firstName} {personnel.lastName}</h2><p>{personnel.personnelCode} · {user.roleTitle} · @{user.username}</p></div>
      <span className={`status-badge status-badge--${user.status}`}>{user.status === 'active' ? 'حساب فعال' : 'حساب غیرفعال'}</span>
      <button className="button button--primary" disabled={Boolean(pending) || Boolean(state.session.actingAdminUserId)} onClick={() => setEditing(true)}><PencilLine size={18}/> درخواست تغییر اطلاعات</button>
    </section>

    {pending && <div className="notice notice--warning"><Clock3 size={19}/><span>درخواست <strong>{pending.trackingCode}</strong> در انتظار بررسی منابع انسانی است. تا اعلام نتیجه، امکان ثبت درخواست دیگری ندارید.</span></div>}
    {state.session.actingAdminUserId && <div className="notice notice--warning"><ShieldCheck size={19}/><span>در حالت مشاهده دسترسی فقط اطلاعات این کاربر نمایش داده می‌شود؛ ثبت درخواست باید با ورود مستقیم خود کاربر انجام شود.</span></div>}

    <div className="my-account-grid">
      <section className="panel my-account-profile">
        <div className="account-section-heading"><div><span className="eyebrow">اطلاعات ثبت‌شده</span><h3>پرونده من</h3><p>اطلاعات سازمانی فقط از گردش تغییر جایگاه و انتقال رسمی تغییر می‌کنند.</p></div><IdCard size={24}/></div>
        <AccountSection icon={UserRound} title="اطلاعات فردی" subtitle="هویت و مشخصات پایه" open>
          <FactGrid><Fact label="نام" value={personnel.firstName}/><Fact label="نام خانوادگی" value={personnel.lastName}/><Fact label="نام پدر" value={personnel.fatherName}/><Fact label="کد ملی" value={personnel.nationalId} ltr/><Fact label="شماره شناسنامه" value={personnel.identityNumber} ltr/><Fact label="تاریخ تولد" value={personnel.birthDate ? formatPersianDate(personnel.birthDate) : undefined}/><Fact label="محل تولد" value={personnel.birthPlace}/><Fact label="جنسیت" value={genderLabel(personnel.gender)}/><Fact label="وضعیت تأهل" value={maritalLabel(personnel.maritalStatus)}/></FactGrid>
        </AccountSection>
        <AccountSection icon={MapPin} title="تماس و نشانی" subtitle="راه‌های ارتباطی و محل سکونت">
          <FactGrid><Fact label="همراه اصلی" value={personnel.primaryMobile} ltr/><Fact label="شماره تماس دوم" value={personnel.secondaryMobile} ltr/><Fact label="تلفن ثابت" value={personnel.phone} ltr/><Fact label="ایمیل شخصی" value={personnel.personalEmail} ltr/><Fact label="استان" value={personnel.province}/><Fact label="شهر" value={personnel.city}/><Fact label="نشانی" value={personnel.address} wide/><Fact label="کد پستی" value={personnel.postalCode} ltr/></FactGrid>
        </AccountSection>
        <AccountSection icon={BriefcaseBusiness} title="همکاری و جایگاه" subtitle="اطلاعات خواندنی سازمانی">
          <FactGrid><Fact label="وضعیت همکاری" value={personnel.employmentStatus === 'active' ? 'فعال' : personnel.employmentStatus === 'ending_scheduled' ? 'پایان زمان‌بندی‌شده' : personnel.employmentStatus === 'rehire_scheduled' ? 'بازگشت زمان‌بندی‌شده' : 'خاتمه‌یافته'}/><Fact label="نوع همکاری" value={personnel.employmentType}/><Fact label="تاریخ شروع" value={formatPersianDate(personnel.startDate)}/><Fact label="واحد سازمانی" value={unit}/><Fact label="سمت سازمانی" value={position}/><Fact label="شعبه استقرار" value={branch}/><Fact label="مدیر مستقیم" value={manager ? `${manager.firstName} ${manager.lastName}` : undefined}/><Fact label="محل کار" value={personnel.workLocation}/></FactGrid>
        </AccountSection>
        <AccountSection icon={PackageCheck} title="دارایی‌ها و اموال من" subtitle="دارایی‌های تحت اختیار، تأییدها و سابقه عودت" open={state.operationalRecords.some((item) => item.ownerPersonnelId === personnel.id && ['fixed-asset', 'asset-transfer', 'asset-maintenance'].includes(item.moduleId))}>
          <MyAssetsSection state={state} service={service} execute={execute} personnelId={personnel.id} readOnly={Boolean(state.session.actingAdminUserId)}/>
        </AccountSection>
        {personnel.salesHierarchyLevel && <AccountSection icon={BadgeDollarSign} title="حقوق و پورسانت فروش" subtitle="شرایط جاری و سابقه تغییرات مالی من">
          <FactGrid><Fact label="تاریخ شروع نقش فروش" value={personnel.salesAssignmentStartDate ? formatPersianDate(personnel.salesAssignmentStartDate) : undefined}/><Fact label="تاریخ شروع همکاری" value={formatPersianDate(personnel.startDate)}/></FactGrid>
          <div className="my-compensation-summary"><FactGrid><Fact label="نوع پرداخت" value={compensation ? salesCompensationModeLabel(compensation.mode) : undefined}/><Fact label="حقوق ثابت ماهانه" value={compensation?.monthlyFixedSalaryRial ? `${formatPortalAmount(compensation.monthlyFixedSalaryRial)} ریال` : 'ندارد'} ltr/><Fact label="درصد پورسانت" value={compensation?.commissionPercent ? `${compensation.commissionPercent}٪` : 'ندارد'} ltr/><Fact label="مبنای پورسانت" value="وصول فاکتور (محاسبه در مرحله بعد)"/><Fact label="تاریخ شروع اجرا" value={compensation?.effectiveFrom ? formatPersianDate(compensation.effectiveFrom) : undefined}/></FactGrid><div className="my-compensation-history"><strong>سابقه تغییرات</strong>{orderedSalesCompensationHistory(personnel).map((item) => <article key={item.id}><span>{formatPersianDate(item.effectiveFrom)}</span><div><b>{salesCompensationModeLabel(item.mode)}</b><small>{item.monthlyFixedSalaryRial ? `${formatPortalAmount(item.monthlyFixedSalaryRial)} ریال` : 'بدون حقوق ثابت'} · {item.commissionPercent ? `${item.commissionPercent}٪` : 'بدون پورسانت'}</small></div></article>)}</div></div>
        </AccountSection>}
        <AccountSection icon={Banknote} title="اطلاعات بانکی" subtitle="نمایش فقط برای صاحب حساب و بازبین مجاز">
          <FactGrid><Fact label="نام بانک" value={personnel.bankName}/><Fact label="شماره حساب" value={personnel.accountNumber} ltr/><Fact label="شماره کارت" value={personnel.cardNumber} ltr/><Fact label="شماره شبا" value={personnel.iban} ltr wide/></FactGrid>
        </AccountSection>
        <AccountSection icon={Phone} title="تماس اضطراری" subtitle="اطلاعات فرد قابل تماس">
          <FactGrid><Fact label="نام" value={personnel.emergencyName}/><Fact label="نسبت" value={personnel.emergencyRelation}/><Fact label="شماره تماس" value={personnel.emergencyPhone} ltr/></FactGrid>
        </AccountSection>
        <AccountSection icon={ShieldCheck} title="حساب و دسترسی" subtitle="اطلاعات ورود و نقش‌های مؤثر">
          <FactGrid><Fact label="نام کاربری" value={`@${user.username}`} ltr/><Fact label="نقش اصلی" value={user.roleTitle}/><Fact label="نقش‌ها" value={user.roles.join('، ')} wide/><Fact label="آخرین تغییر رمز" value={formatPersianDateTime(user.passwordUpdatedAt)}/></FactGrid>
        </AccountSection>
      </section>

      <aside className="my-account-side">
        <section className="panel"><div className="account-section-heading"><div><span className="eyebrow">گردش درخواست</span><h3>درخواست‌های من</h3></div><FileClock size={22}/></div><RequestHistory requests={ownRequests}/></section>
      </aside>
    </div>

    {editing && <ProfileChangeDialog personnel={personnel} pending={Boolean(pending)} onClose={() => setEditing(false)} onSubmit={(input) => {void execute('profile-change-submit', () => service.submitOwnProfileChange(input), 'درخواست تغییر اطلاعات برای منابع انسانی ارسال شد.');setEditing(false);}}/>}
  </div>;
}

function AccountSection({icon: Icon, title, subtitle, open = false, children}: {icon: LucideIcon; title: string; subtitle: string; open?: boolean; children: ReactNode}) {
  return <details className="account-accordion" open={open}><summary><span><i><Icon size={18}/></i><b>{title}<small>{subtitle}</small></b></span><ChevronDown size={18}/></summary><div className="account-accordion-body">{children}</div></details>;
}

function FactGrid({children}: {children: ReactNode}) {return <div className="account-fact-grid">{children}</div>;}
function Fact({label, value, ltr = false, wide = false}: {label: string; value?: string; ltr?: boolean; wide?: boolean}) {return <div className={wide ? 'account-fact account-fact--wide' : 'account-fact'}><span>{label}</span><strong dir={ltr ? 'ltr' : undefined}>{value?.trim() || 'ثبت نشده'}</strong></div>;}

function RequestHistory({requests}: {requests: PersonnelProfileChangeRequest[]}) {
  if (!requests.length) return <div className="compact-empty"><FileClock size={21}/><span>هنوز درخواستی ثبت نکرده‌اید.</span></div>;
  return <div className="account-request-history">{requests.map((request) => <article key={request.id}><span className={`state-badge state-badge--${request.status === 'approved' ? 'good' : request.status === 'rejected' ? 'danger' : 'progress'}`}>{requestStatusLabel(request.status)}</span><div><strong>{request.trackingCode}</strong><small>{Object.keys(request.requestedValues).map((field) => FIELD_LABELS[field as PersonnelProfileChangeField]).join('، ')}</small><time>{formatPersianDateTime(request.createdAt)}</time>{request.reviewReason && <p>نتیجه: {request.reviewReason}</p>}</div></article>)}</div>;
}

function ProfileChangeDialog({personnel, pending, onClose, onSubmit}: {personnel: PersonnelRecord; pending: boolean; onClose: () => void; onSubmit: (input: OwnProfileChangeInput) => void}) {
  const initial = useMemo(() => Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, String(personnel[field] ?? '')])) as PersonnelProfileChangeValues, [personnel]);
  const [values, setValues] = useState<PersonnelProfileChangeValues>(initial);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const set = (field: PersonnelProfileChangeField, value: string) => setValues((current) => ({...current, [field]: value}));
  const submit = () => {
    const next = validateRequired([
      {label: 'نام', value: values.firstName}, {label: 'نام خانوادگی', value: values.lastName},
      {label: 'کد ملی', value: values.nationalId, valid: (value) => digitsOnly(String(value)).length === 10, message: 'فیلد «کد ملی» الزامی است و باید دقیقاً ۱۰ رقم باشد.'}, {label: 'جنسیت', value: values.gender, valid: (value) => value !== 'unspecified'},
      {label: 'همراه اصلی', value: values.primaryMobile, valid: (value) => isValidIranianMobile(String(value)), message: 'فیلد «همراه اصلی» باید ۱۱ رقم و با 09 شروع شود.'}, {label: 'شماره تماس دوم', value: values.secondaryMobile, valid: (value) => isValidIranianMobile(String(value)), message: 'فیلد «شماره تماس دوم» باید ۱۱ رقم و با 09 شروع شود.'},
      {label: 'استان', value: values.province}, {label: 'شهر', value: values.city}, {label: 'نشانی', value: values.address},
      {label: 'کد پستی', value: values.postalCode, valid: (value) => !String(value ?? '').trim() || isValidPostalCode(String(value)), message: 'فیلد «کد پستی» در صورت ورود باید دقیقاً ۱۰ رقم باشد.'},
      {label: 'نام بانک', value: values.bankName}, {label: 'شماره کارت', value: values.cardNumber, valid: (value) => isValidBankCard(String(value)), message: 'فیلد «شماره کارت» باید دقیقاً ۱۶ رقم باشد.'},
      {label: 'شماره شبا', value: values.iban, valid: (value) => !String(value ?? '').trim() || isValidIranianIban(String(value)), message: 'فیلد «شماره شبا» باید شامل IR و ۲۴ رقم باشد.'},
      {label: 'دلیل درخواست', value: reason, valid: (value) => String(value).trim().length >= 5, message: 'فیلد «دلیل درخواست» الزامی است و باید حداقل ۵ نویسه داشته باشد.'},
    ]);
    setErrors(next); if (!next.length) onSubmit({requestedValues: values, reason});
  };
  return <div className="modal-scrim"><form className="dialog profile-change-dialog" noValidate onSubmit={(event) => {event.preventDefault();submit();}}><header><div><span className="eyebrow">خودخدمتی پرسنل</span><h2>درخواست تغییر اطلاعات</h2><p>تغییرات پس از تأیید منابع انسانی روی پرونده اعمال می‌شوند.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body"><FormValidationSummary errors={errors}/>{pending && <div className="notice notice--warning"><Clock3 size={18}/><span>یک درخواست در انتظار بررسی دارید.</span></div>}
    <AccountSection icon={UserRound} title="اطلاعات فردی" subtitle="هویت و مشخصات پایه" open><div className="form-grid"><Field required label="نام"><input value={values.firstName} onChange={(e)=>set('firstName',e.target.value)}/></Field><Field required label="نام خانوادگی"><input value={values.lastName} onChange={(e)=>set('lastName',e.target.value)}/></Field><Field label="نام پدر"><input value={values.fatherName} onChange={(e)=>set('fatherName',e.target.value)}/></Field><Field required label="کد ملی"><input dir="ltr" inputMode="numeric" maxLength={10} value={values.nationalId} onChange={(e)=>set('nationalId',digitsOnly(e.target.value,10))}/></Field><Field label="شماره شناسنامه"><input dir="ltr" value={values.identityNumber} onChange={(e)=>set('identityNumber',e.target.value)}/></Field><Field label="تاریخ تولد"><PersianDateInput value={values.birthDate} onChange={(value)=>set('birthDate',value)} ariaLabel="تاریخ تولد شمسی"/></Field><Field label="محل تولد"><input value={values.birthPlace} onChange={(e)=>set('birthPlace',e.target.value)}/></Field><Field required label="جنسیت"><select value={values.gender} onChange={(e)=>set('gender',e.target.value)}><option value="unspecified">انتخاب کنید</option><option value="female">زن</option><option value="male">مرد</option></select></Field><Field label="وضعیت تأهل"><select value={values.maritalStatus} onChange={(e)=>set('maritalStatus',e.target.value)}><option value="unspecified">ثبت نشده</option><option value="single">مجرد</option><option value="married">متأهل</option></select></Field></div></AccountSection>
    <AccountSection icon={ContactRound} title="تماس و نشانی" subtitle="شماره‌ها و محل سکونت"><div className="form-grid"><Field required label="همراه اصلی"><input dir="ltr" inputMode="tel" maxLength={11} placeholder="09125026707" value={values.primaryMobile} onChange={(e)=>set('primaryMobile',normalizeIranianMobile(e.target.value))}/></Field><Field required label="شماره تماس دوم"><input dir="ltr" inputMode="tel" maxLength={11} placeholder="09121234567" value={values.secondaryMobile} onChange={(e)=>set('secondaryMobile',normalizeIranianMobile(e.target.value))}/></Field><Field label="تلفن ثابت"><input dir="ltr" inputMode="tel" maxLength={11} placeholder="02156174680" value={values.phone} onChange={(e)=>set('phone',normalizeIranianLandline(e.target.value))}/></Field><Field label="ایمیل شخصی"><input dir="ltr" type="email" value={values.personalEmail} onChange={(e)=>set('personalEmail',e.target.value)}/></Field><Field required label="استان"><input value={values.province} onChange={(e)=>set('province',e.target.value)}/></Field><Field required label="شهر"><input value={values.city} onChange={(e)=>set('city',e.target.value)}/></Field><Field required full label="نشانی"><textarea rows={3} value={values.address} onChange={(e)=>set('address',e.target.value)}/></Field><Field label="کد پستی"><input dir="ltr" inputMode="numeric" maxLength={10} placeholder="3716613781" value={values.postalCode} onChange={(e)=>set('postalCode',normalizePostalCode(e.target.value))}/></Field></div></AccountSection>
    <AccountSection icon={Banknote} title="اطلاعات بانکی" subtitle="اطلاعات حساس؛ با مجوز مستقل منابع انسانی"><div className="form-grid"><Field required label="نام بانک"><input value={values.bankName} onChange={(e)=>set('bankName',e.target.value)}/></Field><Field required label="شماره کارت"><input dir="ltr" inputMode="numeric" maxLength={16} placeholder="6104337812345678" value={values.cardNumber} onChange={(e)=>set('cardNumber',normalizeBankCard(e.target.value))}/></Field><Field label="شماره حساب"><input dir="ltr" inputMode="numeric" value={values.accountNumber} onChange={(e)=>set('accountNumber',digitsOnly(e.target.value))}/></Field><Field label="شماره شبا"><input dir="ltr" inputMode="numeric" maxLength={26} placeholder="IR820540102680020817909002" value={values.iban} onChange={(e)=>set('iban',normalizeIranianIban(e.target.value))}/></Field></div></AccountSection>
    <AccountSection icon={Phone} title="تماس اضطراری" subtitle="فرد قابل تماس در شرایط ضروری"><div className="form-grid"><Field label="نام تماس اضطراری"><input value={values.emergencyName} onChange={(e)=>set('emergencyName',e.target.value)}/></Field><Field label="نسبت"><input value={values.emergencyRelation} onChange={(e)=>set('emergencyRelation',e.target.value)}/></Field><Field label="شماره تماس"><input dir="ltr" inputMode="tel" maxLength={11} value={values.emergencyPhone} onChange={(e)=>set('emergencyPhone',digitsOnly(e.target.value,11))}/></Field></div></AccountSection>
    <label className="field field--wide profile-change-reason"><RequiredLabel>دلیل درخواست</RequiredLabel><textarea rows={3} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="دلیل دقیق تغییر اطلاعات را بنویسید…"/></label>
  </div><footer><button type="button" className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--primary" disabled={pending}><Send size={18}/> ارسال برای منابع انسانی</button></footer></form></div>;
}

export function ReviewDialog({request, personnel, readOnly = false, onClose, onDecision}: {request: PersonnelProfileChangeRequest; personnel?: PersonnelRecord; readOnly?: boolean; onClose: () => void; onDecision: (decision: 'approved'|'rejected', reason: string) => void}) {
  const [reason,setReason]=useState(readOnly ? request.reviewReason ?? '' : ''); const [errors,setErrors]=useState<string[]>([]);
  const decide=(decision:'approved'|'rejected')=>{const next=validateRequired([{label:'دلیل تصمیم',value:reason,valid:(value)=>String(value).trim().length>=3,message:'فیلد «دلیل تصمیم» الزامی است و باید حداقل ۳ نویسه داشته باشد.'}]);setErrors(next);if(!next.length)onDecision(decision,reason);};
  return <div className="modal-scrim"><section className="dialog profile-review-dialog"><header><div><span className="eyebrow">{request.trackingCode}</span><h2>{readOnly ? 'نتیجه درخواست' : 'بررسی درخواست'} {request.requesterName}</h2><p>ثبت در {formatPersianDateTime(request.createdAt)} · نسخه {request.version.toLocaleString('en-US')}</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body"><FormValidationSummary errors={errors}/><div className="notice notice--info"><FileClock size={18}/><span>دلیل کاربر: {request.reason}</span></div><div className="profile-change-diff">{Object.entries(request.requestedValues).map(([field,value])=><article key={field}><span>{FIELD_LABELS[field as PersonnelProfileChangeField]}</span><div><small>مقدار فعلی</small><strong>{displayField(field as PersonnelProfileChangeField,request.beforeValues[field as PersonnelProfileChangeField])}</strong></div><i>←</i><div><small>مقدار پیشنهادی</small><strong>{displayField(field as PersonnelProfileChangeField,value)}</strong></div></article>)}</div>{!personnel&&<div className="notice notice--danger"><CircleAlert size={18}/><span>پرونده مرتبط پیدا نشد و تأیید ممکن نیست.</span></div>}<label className="field"><RequiredLabel>{readOnly ? 'دلیل ثبت‌شده برای تصمیم' : 'دلیل تصمیم منابع انسانی'}</RequiredLabel><textarea rows={3} value={reason} readOnly={readOnly} onChange={(e)=>setReason(e.target.value)} placeholder="نتیجه بررسی و مستند تصمیم را ثبت کنید…"/></label>{readOnly && <div className={`notice notice--${request.status === 'approved' ? 'success' : 'danger'}`}><Check size={18}/><span>این درخواست در {request.reviewedAt ? formatPersianDateTime(request.reviewedAt) : 'گذشته'} توسط {request.reviewerName ?? 'بازبین مجاز'} {request.status === 'approved' ? 'تأیید و اعمال' : 'رد'} شده است.</span></div>}</div><footer><button className="button button--secondary" onClick={onClose}>{readOnly ? 'بستن' : 'انصراف'}</button>{!readOnly && <><button className="button button--danger" onClick={()=>decide('rejected')}>رد درخواست</button><button className="button button--primary" disabled={!personnel} onClick={()=>decide('approved')}><Check size={18}/> تأیید و اعمال</button></>}</footer></section></div>;
}

function Field({label,required=false,full=false,children}:{label:string;required?:boolean;full?:boolean;children:ReactNode}){return <label className={`field${full?' field--wide':''}`}>{required?<RequiredLabel>{label}</RequiredLabel>:<OptionalLabel>{label}</OptionalLabel>}{children}</label>;}
function displayField(field:PersonnelProfileChangeField,value?:string){if(!value)return 'خالی';if(field==='gender')return genderLabel(value as PersonnelRecord['gender']);if(field==='maritalStatus')return maritalLabel(value as PersonnelRecord['maritalStatus']);if(field==='birthDate')return formatPersianDate(value);return value;}
function requestStatusLabel(status:PersonnelProfileChangeRequest['status']){return status==='approved'?'تأییدشده':status==='rejected'?'ردشده':'در انتظار بررسی';}
function genderLabel(value:PersonnelRecord['gender']){return value==='female'?'زن':value==='male'?'مرد':'ثبت نشده';}
function maritalLabel(value:PersonnelRecord['maritalStatus']){return value==='single'?'مجرد':value==='married'?'متأهل':'ثبت نشده';}
