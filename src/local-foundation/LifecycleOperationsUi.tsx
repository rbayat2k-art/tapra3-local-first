import {useMemo, useState} from 'react';
import {BadgeCheck, Banknote, CheckCircle2, CircleAlert, ClipboardCheck, FileArchive, PackageCheck, RotateCcw, ShieldCheck, X, type LucideIcon} from 'lucide-react';
import {can} from './authorization';
import {permissionFor, type ErpModuleDefinition} from './erpCatalog';
import {formatPersianDate, formatPersianDateTime, PersianDateInput} from './PersianDate';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalAssetCustodyChallenge, LocalFoundationService, OperationalRecordInput} from './service';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {formatPortalAmount, toLatinDigits} from '../utils/operationalFormat';
import {RecordDialog} from './RecordDialog';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;

export const structuredOperationalModules = new Set(['fixed-asset', 'asset-maintenance', 'onboarding', 'employment-contract', 'personnel-document']);

const text = (value: unknown) => typeof value === 'string' ? value : '';
const truthy = (value: unknown) => value === true;
const personName = (state: FoundationState, id: unknown) => {
  const person = state.personnel.find((item) => item.id === id);
  return person ? `${person.firstName} ${person.lastName}` : 'تعیین نشده';
};

export function OffboardingDrawer({state, record, service, execute, onClose}: {state: FoundationState; record: OperationalRecord; service: LocalFoundationService; execute: Execute; onClose: () => void}) {
  const person = state.personnel.find((item) => item.id === record.ownerPersonnelId);
  const pendingIds = Array.isArray(record.payload.pendingAssetIds) ? record.payload.pendingAssetIds.filter((id): id is string => typeof id === 'string') : [];
  const pendingAssets = state.operationalRecords.filter((item) => pendingIds.includes(item.id));
  const [note, setNote] = useState('');
  const [challenges, setChallenges] = useState<Record<string, LocalAssetCustodyChallenge>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const history = state.operationalHistory.filter((item) => item.recordId === record.id).sort((a, b) => b.sequence - a.sequence);
  const canFinance = state.activeUser.isAdmin || state.activeUser.roleIds.some((id) => ['role-accountant', 'role-senior-accountant', 'role-chief-accountant'].includes(id));
  const canOrganization = state.activeUser.isAdmin || state.activeUser.roleIds.some((id) => ['role-hr-operator', 'role-hr-manager', 'role-personnel-reviewer'].includes(id));
  const canClose = state.activeUser.isAdmin || state.activeUser.roleIds.some((id) => ['role-hr-manager', 'role-personnel-reviewer'].includes(id));
  const canRequestReturn = state.activeUser.isAdmin || can(state.activeUser, permissionFor('asset-transfer', 'create'));
  const allClear = record.payload.accountClosureStatus === 'disabled' && record.payload.assetClearanceStatus === 'clear' && record.payload.financialClearanceStatus === 'clear' && record.payload.organizationalClearanceStatus === 'clear';
  const isEmploymentEndRequest = ['requested', 'scheduled'].includes(record.status);
  const isRequester = record.createdByUserId === state.activeUser.id;

  const requireNote = () => {
    const next = validateRequired([{label: 'توضیح تصمیم', value: note}]);
    setErrors(next);
    return !next.length;
  };
  const updateClearance = async (area: 'financial' | 'organizational', cleared: boolean) => {
    if (!requireNote()) return;
    const ok = await execute(`offboarding-${area}`, () => service.updateOffboardingClearance(record.id, record.version, area, cleared, note), `${area === 'financial' ? 'تسویه مالی' : 'تسویه سازمانی'} ثبت شد.`);
    if (ok) { setNote(''); setErrors([]); }
  };
  const startReturn = async (asset: OperationalRecord) => {
    let challenge: LocalAssetCustodyChallenge | undefined;
    const ok = await execute(`offboarding-return-${asset.id}`, async () => {
      challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: record.ownerPersonnelId!, action: 'return', notes: `عودت در پرونده خروج ${record.trackingCode}`});
      return challenge.state;
    }, `درخواست عودت «${asset.title}» ایجاد شد.`);
    if (ok && challenge) setChallenges((current) => ({...current, [asset.id]: challenge!}));
  };
  const closeCase = async () => {
    if (!requireNote()) return;
    const ok = await execute('offboarding-complete', () => service.completeOffboarding(record.id, record.version, note), 'پرونده خروج پس از تکمیل همه تسویه‌ها بسته شد.');
    if (ok) onClose();
  };

  const approveEndRequest = async () => {
    if (!requireNote()) return;
    const ok = await execute('offboarding-request-approve', () => service.approvePersonnelEndRequest(record.id, record.version, note), 'درخواست تأیید شد؛ اجرای خروج فقط در تاریخ مؤثر انجام می‌شود.');
    if (ok) onClose();
  };
  const cancelEndRequest = async () => {
    if (!record.ownerPersonnelId || !requireNote()) return;
    const ok = await execute('offboarding-request-cancel', () => service.cancelPersonnelEndRequest(record.ownerPersonnelId!, note, record.version), 'درخواست لغو شد و حساب و همکاری فرد فعال باقی ماند.');
    if (ok) onClose();
  };

  if (isEmploymentEndRequest) return <RecordDialog ariaLabel={`درخواست بررسی پایان همکاری ${person?.firstName ?? ''}`} className="offboarding-drawer" onClose={onClose}>
    <header><div><span className="eyebrow">{record.trackingCode} · درخواست بررسی پایان همکاری</span><h2>{person ? `${person.firstName} ${person.lastName}` : record.title}</h2><p>{record.payload.personnelCode ? `کد پرسنلی ${record.payload.personnelCode}` : ''}</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="drawer-body form-stack">
      <div className="waiting-banner"><CircleAlert size={20}/><div><span>مرحله جاری</span><strong>{record.status === 'requested' ? 'در انتظار بررسی منابع انسانی' : text(record.payload.currentWaitingFor) || 'تأییدشده و در انتظار تاریخ اجرا'}</strong></div></div>
      <section className="detail-section"><h3>اطلاعات درخواست</h3><div className="structured-facts"><Fact label="موضوع درخواست" value={text(record.payload.departureInitiator) === 'employee' ? 'اعلام استعفا / عدم تمایل پرسنل' : 'بررسی قطع همکاری با تصمیم سازمان'}/><Fact label="ثبت‌کننده" value={text(record.payload.requesterName) || 'ثبت نشده'}/><Fact label="تاریخ پیشنهادی" value={formatPersianDate(text(record.payload.proposedEmploymentEndDate))}/><Fact label="دلیل درخواست" value={text(record.payload.employmentEndReason) || 'ثبت نشده'}/><Fact label="وضعیت همکاری" value={record.status === 'requested' ? 'فعال و بدون تغییر' : 'فعال تا تاریخ اجرای مصوب'}/><Fact label="وضعیت حساب و پنل" value="فعال و بدون تغییر"/></div>{record.description && <p className="record-description">{record.description}</p>}</section>
      <div className="success-panel"><ShieldCheck size={21}/><div><strong>ثبت درخواست اثر عملیاتی ندارد</strong><span>نقش‌ها، حقوق، دسترسی‌ها، حساب کاربری و پنل این فرد تا اجرای نهایی خروج تغییر نمی‌کنند.</span></div></div>
      {(record.status === 'requested' && canOrganization || isRequester || canClose) && <section className="workflow-box"><h3>{record.status === 'requested' && canOrganization ? 'تصمیم منابع انسانی' : 'لغو درخواست'}</h3><FormValidationSummary errors={errors}/><label className="field"><RequiredLabel>توضیح تصمیم</RequiredLabel><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="دلیل تأیید یا پس‌گرفتن درخواست را ثبت کنید…"/></label><div className="transition-actions">{record.status === 'requested' && canOrganization && <button className="button button--primary" onClick={() => void approveEndRequest()}><BadgeCheck size={17}/> تأیید درخواست و ثبت تاریخ اجرا</button>}{(isRequester || canClose) && <button className="button button--secondary" onClick={() => void cancelEndRequest()}><RotateCcw size={17}/> {record.status === 'requested' ? 'لغو درخواست' : 'لغو پیش از اجرا'}</button>}</div></section>}
      <section className="history-box"><h3>تاریخچه غیرقابل حذف</h3>{history.map((item) => <article key={item.id}><span/><div><strong>{item.actorName}</strong><p>{item.reason || 'رویداد سیستمی ثبت شد.'}</p><small>{formatPersianDateTime(item.occurredAt)} · #{item.sequence.toLocaleString('fa-IR')}</small></div></article>)}</section>
    </div><footer><button className="button button--ghost" onClick={onClose}>بستن</button></footer>
  </RecordDialog>;

  return <RecordDialog ariaLabel={`پرونده خروج ${person?.firstName ?? ''}`} className="offboarding-drawer" onClose={onClose}>
    <header><div><span className="eyebrow">{record.trackingCode} · پرونده خروج</span><h2>{person ? `${person.firstName} ${person.lastName}` : record.title}</h2><p>{record.payload.personnelCode ? `کد پرسنلی ${record.payload.personnelCode}` : ''}</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="drawer-body form-stack">
      <div className="waiting-banner"><CircleAlert size={20}/><div><span>مرحله جاری</span><strong>{text(record.payload.currentWaitingFor) || 'در حال بررسی'}</strong></div></div>
      <div className="clearance-steps" aria-label="مراحل خروج">
        <ClearanceStep icon={ShieldCheck} label="بستن حساب" done={record.payload.accountClosureStatus === 'disabled'}/>
        <ClearanceStep icon={PackageCheck} label="عودت اموال" done={record.payload.assetClearanceStatus === 'clear'}/>
        <ClearanceStep icon={Banknote} label="تسویه مالی" done={record.payload.financialClearanceStatus === 'clear'}/>
        <ClearanceStep icon={ClipboardCheck} label="تسویه سازمانی" done={record.payload.organizationalClearanceStatus === 'clear'}/>
        <ClearanceStep icon={BadgeCheck} label="بستن پرونده" done={record.status === 'completed'}/>
      </div>
      <section className="detail-section"><h3>اطلاعات خروج</h3><div className="structured-facts"><Fact label="نوع پایان همکاری" value={text(record.payload.departureInitiator) === 'employee' ? 'استعفا / درخواست پرسنل' : 'قطع همکاری با تصمیم سازمان'}/><Fact label="تاریخ پایان همکاری" value={formatPersianDate(text(record.payload.employmentEndDate))}/><Fact label="دلیل پایان همکاری" value={text(record.payload.employmentEndReason) || 'ثبت نشده'}/><Fact label="وضعیت حساب" value={record.payload.accountClosureStatus === 'disabled' ? 'غیرفعال شده' : 'نیازمند بررسی'}/><Fact label="تحویل کارها" value={text(record.payload.handoffStatus) === 'documented' ? 'مستند شده' : 'در انتظار'}/></div>{record.description && <p className="record-description">{record.description}</p>}</section>
      <section className="detail-section"><div className="section-heading"><div><h3>دارایی‌های در انتظار عودت</h3><span>{pendingAssets.length.toLocaleString('fa-IR')} مورد</span></div><PackageCheck size={20}/></div>
        {!pendingAssets.length && record.payload.assetClearanceStatus === 'clear' ? <div className="success-panel"><CheckCircle2 size={21}/><div><strong>تسویه اموال کامل است</strong><span>دارایی فعالی در اختیار این پرسنل باقی نمانده است.</span></div></div> : !pendingAssets.length ? <div className="waiting-banner"><CircleAlert size={20}/><div><span>نیازمند شناسایی دارایی</span><strong>این پرونده قدیمی یا دستی است؛ خروج را از پرونده پرسنل ثبت کنید تا دارایی‌ها خودکار شناسایی شوند.</strong></div></div> : <div className="offboarding-assets">{pendingAssets.map((asset) => {
          const challenge = challenges[asset.id];
          const openTransfer = state.operationalRecords.find((item) => item.moduleId === 'asset-transfer' && item.relatedRecordId === asset.id && ['submitted', 'approved'].includes(item.status));
          return <article key={asset.id}><div><strong>{asset.title}</strong><span>{asset.trackingCode}{text(asset.payload.serialNumber) ? ` · سریال ${asset.payload.serialNumber}` : ''}</span></div>{challenge ? <div className="otp-preview"><span>{challenge.party === 'employee' ? 'رمز پرسنل' : 'رمز مسئول اموال'} <b dir="ltr">{challenge.otp}</b></span><small>این رمز فقط برای طرف فعلی است · اعتبار تا {formatPersianDateTime(challenge.expiresAt)}</small></div> : openTransfer ? <span className="state-badge state-badge--progress">در انتظار تأیید دوطرفه</span> : canRequestReturn ? <button className="button button--secondary" onClick={() => void startReturn(asset)}><RotateCcw size={16}/> درخواست عودت</button> : <span className="state-badge state-badge--neutral">منتظر مسئول اموال</span>}</article>;
        })}</div>}
      </section>
      {record.status !== 'completed' && <section className="workflow-box"><h3>ثبت تسویه و بستن پرونده</h3><FormValidationSummary errors={errors}/><label className="field"><RequiredLabel>توضیح تصمیم</RequiredLabel><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="شرح تسویه، اقلام کنترل‌شده یا دلیل تصمیم…"/></label><div className="transition-actions">{canFinance && <button className="button button--secondary" onClick={() => void updateClearance('financial', record.payload.financialClearanceStatus !== 'clear')}><Banknote size={17}/>{record.payload.financialClearanceStatus === 'clear' ? 'بازگشایی تسویه مالی' : 'تأیید تسویه مالی'}</button>}{canOrganization && <button className="button button--secondary" onClick={() => void updateClearance('organizational', record.payload.organizationalClearanceStatus !== 'clear')}><ClipboardCheck size={17}/>{record.payload.organizationalClearanceStatus === 'clear' ? 'بازگشایی تسویه سازمانی' : 'تأیید تسویه سازمانی'}</button>}{canClose && <button className="button button--primary" disabled={!allClear} title={!allClear ? 'ابتدا همه مراحل تسویه را کامل کنید' : 'بستن پرونده'} onClick={() => void closeCase()}><BadgeCheck size={17}/> بستن نهایی پرونده خروج</button>}</div></section>}
      <section className="history-box"><h3>تاریخچه غیرقابل حذف</h3>{history.map((item) => <article key={item.id}><span/><div><strong>{item.actorName}</strong><p>{item.reason || 'رویداد سیستمی ثبت شد.'}</p><small>{formatPersianDateTime(item.occurredAt)} · #{item.sequence.toLocaleString('fa-IR')}</small></div></article>)}</section>
    </div><footer><button className="button button--ghost" onClick={onClose}>بستن</button></footer>
  </RecordDialog>;
}

function ClearanceStep({icon: Icon, label, done}: {icon: LucideIcon; label: string; done: boolean}) {return <div className={done ? 'done' : ''}><Icon size={18}/><span>{label}</span><strong>{done ? 'تکمیل' : 'در انتظار'}</strong></div>;}

export function StructuredPayloadDetails({state, record}: {state: FoundationState; record: OperationalRecord}) {
  const p = record.payload;
  if (!structuredOperationalModules.has(record.moduleId)) return null;
  const details: Array<[string, string]> = record.moduleId === 'fixed-asset' ? [
    ['دسته دارایی', text(p.category)], ['شماره سریال', text(p.serialNumber)], ['برند و مدل', [text(p.brand), text(p.model)].filter(Boolean).join(' · ')], ['محل نگهداری', text(p.location)], ['تحویل‌گیرنده فعلی', personName(state, p.custodianPersonnelId)], ['وضعیت تحویل', text(p.custodyStatus) === 'delivered' ? 'تحویل‌شده' : 'موجود در سازمان'],
  ] : record.moduleId === 'asset-maintenance' ? [
    ['دارایی مرتبط', state.operationalRecords.find((item) => item.id === record.relatedRecordId)?.title ?? text(p.assetTrackingCode)], ['نوع مشکل', issueLabel(text(p.issueType))], ['گزارش‌دهنده', personName(state, p.reportedByPersonnelId)], ['تعمیرکار/تأمین‌کننده', text(p.vendorName)], ['نتیجه تعمیر', text(p.result)],
  ] : record.moduleId === 'onboarding' ? [
    ['پرسنل', personName(state, record.ownerPersonnelId)], ['تاریخ شروع', formatPersianDate(text(p.startDate))], ['سرپرست ورود', state.users.find((item) => item.id === record.assigneeUserId)?.name ?? 'تعیین نشده'], ['ساخت حساب', yesNo(p.accountReady)], ['تکمیل مدارک', yesNo(p.documentsReady)], ['قرارداد', yesNo(p.contractReady)], ['تحویل تجهیزات', yesNo(p.assetsReady)], ['معرفی و آموزش', yesNo(p.orientationReady)],
  ] : record.moduleId === 'employment-contract' ? [
    ['پرسنل', personName(state, record.ownerPersonnelId)], ['نوع قرارداد', text(p.contractType)], ['شماره نسخه', text(p.contractVersion)], ['شروع قرارداد', formatPersianDate(text(p.startDate))], ['پایان قرارداد', formatPersianDate(text(p.endDate))], ['مبلغ مبنا', text(p.baseSalaryRial) ? `${formatPortalAmount(text(p.baseSalaryRial))} ریال` : 'ثبت نشده'],
  ] : [
    ['پرسنل', personName(state, record.ownerPersonnelId)], ['نوع سند', text(p.documentType)], ['شماره سند', text(p.documentNumber)], ['تاریخ صدور', formatPersianDate(text(p.issueDate))], ['تاریخ اعتبار', formatPersianDate(text(p.expiryDate))], ['فایل', text(p.fileName) || 'فایلی بارگذاری نشده'],
  ];
  return <section className="detail-section structured-details"><h3>{record.moduleId === 'fixed-asset' ? 'شناسنامه دارایی' : record.moduleId === 'asset-maintenance' ? 'جزئیات تعمیر و نگهداری' : record.moduleId === 'onboarding' ? 'چک‌لیست ورود به کار' : record.moduleId === 'employment-contract' ? 'مشخصات قرارداد' : 'مشخصات سند پرسنلی'}</h3><div className="structured-facts">{details.map(([label, value]) => <Fact key={label} label={label} value={value || 'ثبت نشده'}/>)}</div>{record.moduleId === 'personnel-document' && text(p.fileDataUrl) && <a className="button button--secondary" href={text(p.fileDataUrl)} download={text(p.fileName) || 'document'}><FileArchive size={17}/> دریافت فایل سند</a>}</section>;
}

export function StructuredRecordEditor({state, record, module, onClose, onSave}: {state: FoundationState; record?: OperationalRecord; module: ErpModuleDefinition; onClose: () => void; onSave: (input: OperationalRecordInput) => Promise<void>}) {
  const [form, setForm] = useState({title: record?.title ?? '', description: record?.description ?? '', priority: record?.priority ?? 'normal', ownerPersonnelId: record?.ownerPersonnelId ?? '', relatedRecordId: record?.relatedRecordId ?? '', amountRial: record?.amountRial ?? '', dueAt: record?.dueAt?.slice(0, 10) ?? '', payload: {...(record?.payload ?? {})}});
  const [errors, setErrors] = useState<string[]>([]);
  const assets = useMemo(() => state.operationalRecords.filter((item) => item.moduleId === 'fixed-asset' && item.status !== 'disposed'), [state.operationalRecords]);
  const setPayload = (key: string, value: string | boolean | null) => setForm((current) => ({...current, payload: {...current.payload, [key]: value}}));
  const submit = () => {
    const required: Array<{label: string; value: unknown}> = [{label: 'عنوان', value: form.title}];
    if (['onboarding', 'employment-contract', 'personnel-document'].includes(module.id)) required.push({label: 'پرسنل', value: form.ownerPersonnelId});
    if (module.id === 'fixed-asset') required.push({label: 'دسته دارایی', value: form.payload.category}, {label: 'شماره سریال/شناسه', value: form.payload.serialNumber});
    if (module.id === 'asset-maintenance') required.push({label: 'دارایی مرتبط', value: form.relatedRecordId}, {label: 'نوع مشکل', value: form.payload.issueType});
    if (module.id === 'employment-contract') required.push({label: 'نوع قرارداد', value: form.payload.contractType}, {label: 'تاریخ شروع', value: form.payload.startDate});
    if (module.id === 'personnel-document') required.push({label: 'نوع سند', value: form.payload.documentType});
    const next = validateRequired(required); setErrors(next); if (next.length) return;
    void onSave({...form, priority: form.priority as OperationalRecord['priority']});
  };
  const fileChanged = (file?: File) => {if (!file) return; const reader = new FileReader(); reader.onload = () => setForm((current) => ({...current, payload: {...current.payload, fileName: file.name, fileType: file.type, fileSize: file.size, fileDataUrl: String(reader.result)}})); reader.readAsDataURL(file);};
  return <div className="modal-scrim"><form className="dialog structured-record-editor" noValidate onSubmit={(event) => {event.preventDefault();submit();}}><header><div><span className="eyebrow">{record ? 'ویرایش نسخه‌دار' : 'ایجاد رکورد تخصصی'}</span><h2>{record ? record.title : `ایجاد ${module.singular}`}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body form-grid"><FormValidationSummary errors={errors}/><label className="field field--wide"><RequiredLabel>عنوان</RequiredLabel><input value={form.title} onChange={(event) => setForm({...form, title: event.target.value})}/></label><label className="field field--wide"><OptionalLabel>توضیحات</OptionalLabel><textarea value={form.description} onChange={(event) => setForm({...form, description: event.target.value})}/></label>
    {['onboarding', 'employment-contract', 'personnel-document'].includes(module.id) && <label className="field"><RequiredLabel>پرسنل</RequiredLabel><select value={form.ownerPersonnelId} onChange={(event) => setForm({...form, ownerPersonnelId: event.target.value})}><option value="">انتخاب پرسنل…</option>{state.personnel.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} — {person.personnelCode}</option>)}</select></label>}
    {module.id === 'fixed-asset' && <><Field label="دسته دارایی" required value={text(form.payload.category)} onChange={(value) => setPayload('category', value)}/><Field label="شماره سریال/شناسه" required value={text(form.payload.serialNumber)} onChange={(value) => setPayload('serialNumber', value)}/><Field label="برند" value={text(form.payload.brand)} onChange={(value) => setPayload('brand', value)}/><Field label="مدل" value={text(form.payload.model)} onChange={(value) => setPayload('model', value)}/><Field label="محل نگهداری" value={text(form.payload.location)} onChange={(value) => setPayload('location', value)}/><label className="field"><OptionalLabel>ارزش خرید (ریال)</OptionalLabel><input dir="ltr" inputMode="numeric" value={form.amountRial ? formatPortalAmount(form.amountRial) : ''} onChange={(event) => setForm({...form, amountRial: toLatinDigits(event.target.value).replace(/\D/g, '')})}/></label></>}
    {module.id === 'asset-maintenance' && <><label className="field"><RequiredLabel>دارایی مرتبط</RequiredLabel><select value={form.relatedRecordId} onChange={(event) => setForm({...form, relatedRecordId: event.target.value})}><option value="">انتخاب دارایی…</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title} — {asset.trackingCode}</option>)}</select></label><label className="field"><RequiredLabel>نوع مشکل</RequiredLabel><select value={text(form.payload.issueType)} onChange={(event) => setPayload('issueType', event.target.value)}><option value="">انتخاب…</option><option value="damage">خرابی</option><option value="lost">مفقودی</option><option value="service">سرویس دوره‌ای</option><option value="other">سایر</option></select></label><Field label="تعمیرکار/تأمین‌کننده" value={text(form.payload.vendorName)} onChange={(value) => setPayload('vendorName', value)}/><Field label="نتیجه تعمیر" value={text(form.payload.result)} onChange={(value) => setPayload('result', value)}/><DateField label="تاریخ موردنیاز" value={form.dueAt} onChange={(value) => setForm({...form, dueAt: value})}/></>}
    {module.id === 'onboarding' && <><DateField label="تاریخ شروع" required value={text(form.payload.startDate)} onChange={(value) => setPayload('startDate', value)}/><div className="checklist-editor field--wide">{[['accountReady','ساخت و تحویل حساب کاربری'],['documentsReady','تکمیل مدارک پرسنلی'],['contractReady','ثبت قرارداد'],['assetsReady','تحویل تجهیزات و دارایی'],['orientationReady','معرفی واحد و آموزش اولیه']].map(([key, label]) => <label key={key}><input type="checkbox" checked={truthy(form.payload[key])} onChange={(event) => setPayload(key, event.target.checked)}/><span>{label}</span></label>)}</div></>}
    {module.id === 'employment-contract' && <><Field label="نوع قرارداد" required value={text(form.payload.contractType)} onChange={(value) => setPayload('contractType', value)}/><Field label="شماره نسخه" value={text(form.payload.contractVersion)} onChange={(value) => setPayload('contractVersion', value)}/><DateField label="تاریخ شروع" required value={text(form.payload.startDate)} onChange={(value) => setPayload('startDate', value)}/><DateField label="تاریخ پایان" value={text(form.payload.endDate)} onChange={(value) => setPayload('endDate', value)}/><label className="field"><OptionalLabel>حقوق مبنا (ریال)</OptionalLabel><input dir="ltr" inputMode="numeric" value={text(form.payload.baseSalaryRial) ? formatPortalAmount(text(form.payload.baseSalaryRial)) : ''} onChange={(event) => setPayload('baseSalaryRial', toLatinDigits(event.target.value).replace(/\D/g, ''))}/></label></>}
    {module.id === 'personnel-document' && <><Field label="نوع سند" required value={text(form.payload.documentType)} onChange={(value) => setPayload('documentType', value)}/><Field label="شماره سند" value={text(form.payload.documentNumber)} onChange={(value) => setPayload('documentNumber', value)}/><DateField label="تاریخ صدور" value={text(form.payload.issueDate)} onChange={(value) => setPayload('issueDate', value)}/><DateField label="تاریخ اعتبار" value={text(form.payload.expiryDate)} onChange={(value) => setPayload('expiryDate', value)}/><label className="field field--wide file-drop"><FileArchive size={22}/><span>{text(form.payload.fileName) || 'بارگذاری فایل سند'}</span><input type="file" accept="image/*,.pdf" onChange={(event) => fileChanged(event.target.files?.[0])}/></label></>}
  </div><footer><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary">{record ? 'ذخیره نسخه جدید' : 'ایجاد رکورد'}</button></footer></form></div>;
}

function Field({label, value, required, onChange}: {label: string; value: string; required?: boolean; onChange: (value: string) => void}) {return <label className="field">{required ? <RequiredLabel>{label}</RequiredLabel> : <OptionalLabel>{label}</OptionalLabel>}<input value={value} onChange={(event) => onChange(event.target.value)}/></label>;}
function DateField({label, value, required, onChange}: {label: string; value: string; required?: boolean; onChange: (value: string) => void}) {return <label className="field">{required ? <RequiredLabel>{label}</RequiredLabel> : <OptionalLabel>{label}</OptionalLabel>}<PersianDateInput value={value} onChange={onChange} ariaLabel={`انتخاب ${label}`}/></label>;}
function Fact({label, value}: {label: string; value: string}) {return <div><span>{label}</span><strong>{value}</strong></div>;}
function yesNo(value: unknown) {return value === true ? 'تکمیل شده' : 'در انتظار';}
function issueLabel(value: string) {return value === 'damage' ? 'خرابی' : value === 'lost' ? 'مفقودی' : value === 'service' ? 'سرویس دوره‌ای' : value === 'other' ? 'سایر' : 'ثبت نشده';}
