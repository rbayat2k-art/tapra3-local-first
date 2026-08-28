import {useMemo, useRef, useState, type ChangeEvent, type DragEvent} from 'react';
import {Download, FilePlus2, Paperclip, Trash2, UploadCloud, X} from 'lucide-react';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService, RecruitmentCandidateProfileInput} from './service';
import {RecordDialog} from './RecordDialog';
import {FormValidationSummary, OptionalLabel, RequiredLabel} from './FormValidation';
import {
  candidateDocuments, candidateFileLabel, RECRUITMENT_CANDIDATE_FILE_CATALOG,
  RECRUITMENT_CANDIDATE_FILE_MAX_COUNT, RECRUITMENT_CANDIDATE_FILE_MAX_SIZE,
  validateRecruitmentCandidateProfile, type RecruitmentCandidateFileInput, type RecruitmentCandidateFileKind,
} from './recruitmentCandidateProfile';

interface Props {
  state: FoundationState;
  service: LocalFoundationService;
  mode: 'public' | 'hr-create' | 'hr-edit';
  record?: OperationalRecord;
  onClose: () => void;
  execute?: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
  onSubmitted?: (result: {trackingCode: string; submittedAt: string}) => void;
}

const value = (record: OperationalRecord | undefined, key: string) => {
  const candidate = record?.payload[key];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : '';
};
const formatBytes = (size: number) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024)).toLocaleString('fa-IR')} کیلوبایت`
  : `${(size / 1024 / 1024).toLocaleString('fa-IR', {maximumFractionDigits:1})} مگابایت`;

function initialProfile(record?: OperationalRecord): RecruitmentCandidateProfileInput {
  return {
    fullName: value(record, 'candidateName'), mobile: value(record, 'candidateMobile'), nationalId: value(record, 'candidateNationalId'),
    email: value(record, 'candidateEmail'), city: value(record, 'candidateCity'), unitId: record?.unitId ?? '', branchUnitId: record?.branchUnitId,
    positionTitle: value(record, 'positionTitle'), educationLevel: value(record, 'educationLevel'), educationField: value(record, 'educationField'),
    workExperienceYears: value(record, 'workExperienceYears'), lastJobTitle: value(record, 'lastJobTitle'), skills: value(record, 'candidateSkills'),
    about: value(record, 'candidateAbout') || record?.description || '', expectedSalaryRial: value(record, 'expectedSalaryRial'),
    availableFrom: value(record, 'availableFrom'), consent: Boolean(record?.payload.candidateConsent ?? record?.payload.consentRecorded), files: [],
  };
}

const fileToInput = (file: File, kind: RecruitmentCandidateFileKind) => new Promise<RecruitmentCandidateFileInput>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({kind, fileName:file.name, mimeType:file.type || 'application/octet-stream', size:file.size, dataUrl:String(reader.result ?? '')});
  reader.onerror = () => reject(new Error('خواندن فایل ممکن نشد؛ دوباره انتخاب کنید.'));
  reader.readAsDataURL(file);
});

export function RecruitmentCandidateProfileDialog({state, service, mode, record, onClose, execute, onSubmitted}: Props) {
  const initial = useMemo(() => initialProfile(record), [record]);
  const [form, setForm] = useState(initial);
  const [fileKind, setFileKind] = useState<RecruitmentCandidateFileKind>('resume');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingDocuments = useMemo(() => record ? candidateDocuments(record) : [], [record]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const isPublic = mode === 'public';
  const set = <K extends keyof RecruitmentCandidateProfileInput>(key: K, next: RecruitmentCandidateProfileInput[K]) => setForm((current) => ({...current, [key]:next}));
  const safeClose = () => {
    if (busy) return;
    if (dirty && !window.confirm('اطلاعات واردشده هنوز ثبت نشده است. پنجره بسته شود؟')) return;
    onClose();
  };
  const addFile = async (file?: File) => {
    if (!file) return;
    if (form.files.length >= RECRUITMENT_CANDIDATE_FILE_MAX_COUNT) {setErrors([`حداکثر ${RECRUITMENT_CANDIDATE_FILE_MAX_COUNT.toLocaleString('fa-IR')} فایل قابل ثبت است.`]);return;}
    if (file.size > RECRUITMENT_CANDIDATE_FILE_MAX_SIZE) {setErrors(['حجم هر فایل باید حداکثر ۵ مگابایت باشد.']);return;}
    if (fileKind === 'resume' && form.files.some((item) => item.kind === 'resume')) {setErrors(['در هر بار ثبت فقط یک فایل رزومه انتخاب کنید.']);return;}
    try {set('files', [...form.files, await fileToInput(file, fileKind)]);setErrors([]);} catch (error) {setErrors([error instanceof Error ? error.message : 'خواندن فایل ممکن نشد.']);}
  };
  const fileChanged = (event: ChangeEvent<HTMLInputElement>) => {const file=event.target.files?.[0];event.target.value='';void addFile(file);};
  const dropped = (event: DragEvent<HTMLDivElement>) => {event.preventDefault();setDragging(false);void addFile(event.dataTransfer.files?.[0]);};
  const downloadExisting = async (fileId: string, fileName: string) => {
    if (!record) return;
    setBusy(true);setErrors([]);
    try {const file=await service.getRecruitmentCandidateFile(record.id,fileId);const anchor=document.createElement('a');anchor.href=file.dataUrl;anchor.download=fileName;anchor.click();}
    catch (error) {setErrors([error instanceof Error?error.message:'دریافت فایل ممکن نشد.']);}
    finally {setBusy(false);}
  };
  const submit = async () => {
    const nextErrors = validateRecruitmentCandidateProfile(form);
    setErrors(nextErrors);
    if (nextErrors.length) {requestAnimationFrame(()=>document.querySelector<HTMLElement>('.candidate-profile-dialog input:invalid, .candidate-profile-dialog select:invalid, .candidate-profile-dialog textarea:invalid')?.focus());return;}
    setBusy(true);
    try {
      if (mode === 'public') onSubmitted?.(await service.submitRecruitmentApplication(form));
      else {
        const work = mode === 'hr-edit' && record
          ? () => service.updateRecruitmentCandidateProfile(record.id, record.version, form)
          : () => service.createRecruitmentCandidateProfile(form);
        const ok = execute ? await execute('recruitment-candidate-profile', work, 'رزومه و مدارک متقاضی با حفظ تاریخچه ثبت شد.') : false;
        if (ok) onClose();
      }
    } catch (error) {setErrors([error instanceof Error?error.message:'ثبت رزومه ممکن نشد.']);}
    finally {setBusy(false);}
  };
  const activeUnits = state.units.filter((unit) => unit.status === 'active' && unit.type !== 'شعبه');
  const branches = state.units.filter((unit) => unit.status === 'active' && unit.type === 'شعبه');
  return <RecordDialog ariaLabel={isPublic?'ارسال رزومه برای همکاری':'پرونده رزومه متقاضی'} className="candidate-profile-dialog" onClose={safeClose}>
    <header><div><span className="eyebrow">{isPublic?'همکاری با شاهراه':'بانک متقاضیان منابع انسانی'}</span><h2>{mode==='hr-edit'?'ویرایش رزومه و مدارک':isPublic?'فرم رزومه و ارسال مدارک':'ثبت متقاضی و رزومه'}</h2><p>اطلاعات فرم و فایل‌های رزومه و مدارک به یک پرونده قابل پیگیری متصل می‌شوند.</p></div><button type="button" className="icon-button" disabled={busy} onClick={safeClose} aria-label="بستن"><X/></button></header>
    <div className="drawer-body candidate-profile-body" data-workspace-dirty={dirty?'true':undefined}>
      <FormValidationSummary errors={errors}/>
      <section className="candidate-profile-section"><h3>هویت و راه ارتباطی</h3><div className="form-grid">
        <label className="field"><RequiredLabel>نام و نام خانوادگی</RequiredLabel><input required disabled={busy} value={form.fullName} onChange={(e)=>set('fullName',e.target.value)}/></label>
        <label className="field"><RequiredLabel>شماره همراه</RequiredLabel><input required dir="ltr" inputMode="tel" disabled={busy} value={form.mobile} onChange={(e)=>set('mobile',e.target.value)} placeholder="09121234567"/></label>
        <label className="field"><RequiredLabel>کد ملی</RequiredLabel><input required dir="ltr" inputMode="numeric" disabled={busy} value={form.nationalId} onChange={(e)=>set('nationalId',e.target.value)}/></label>
        <label className="field"><OptionalLabel>ایمیل</OptionalLabel><input type="email" dir="ltr" disabled={busy} value={form.email??''} onChange={(e)=>set('email',e.target.value)}/></label>
        <label className="field"><OptionalLabel>شهر محل سکونت</OptionalLabel><input disabled={busy} value={form.city??''} onChange={(e)=>set('city',e.target.value)}/></label>
      </div></section>
      <section className="candidate-profile-section"><h3>فرصت شغلی و سوابق</h3><div className="form-grid">
        <label className="field"><RequiredLabel>حوزه یا واحد موردنظر</RequiredLabel><select required disabled={busy} value={form.unitId} onChange={(e)=>set('unitId',e.target.value)}><option value="">انتخاب واحد…</option>{activeUnits.map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="field"><OptionalLabel>شعبه موردنظر</OptionalLabel><select disabled={busy} value={form.branchUnitId??''} onChange={(e)=>set('branchUnitId',e.target.value||undefined)}><option value="">بدون ترجیح شعبه</option>{branches.map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="field"><RequiredLabel>عنوان شغلی موردنظر</RequiredLabel><input required disabled={busy} value={form.positionTitle} onChange={(e)=>set('positionTitle',e.target.value)}/></label>
        <label className="field"><RequiredLabel>آخرین مقطع تحصیلی</RequiredLabel><select required disabled={busy} value={form.educationLevel} onChange={(e)=>set('educationLevel',e.target.value)}><option value="">انتخاب مقطع…</option><option>دیپلم</option><option>کاردانی</option><option>کارشناسی</option><option>کارشناسی ارشد</option><option>دکتری</option><option>سایر</option></select></label>
        <label className="field"><OptionalLabel>رشته تحصیلی</OptionalLabel><input disabled={busy} value={form.educationField??''} onChange={(e)=>set('educationField',e.target.value)}/></label>
        <label className="field"><RequiredLabel>سابقه کار (سال)</RequiredLabel><input required dir="ltr" inputMode="numeric" disabled={busy} value={form.workExperienceYears} onChange={(e)=>set('workExperienceYears',e.target.value)}/></label>
        <label className="field"><OptionalLabel>آخرین عنوان شغلی</OptionalLabel><input disabled={busy} value={form.lastJobTitle??''} onChange={(e)=>set('lastJobTitle',e.target.value)}/></label>
        <label className="field"><OptionalLabel>حقوق مورد انتظار (ریال)</OptionalLabel><input dir="ltr" inputMode="numeric" disabled={busy} value={form.expectedSalaryRial??''} onChange={(e)=>set('expectedSalaryRial',e.target.value)}/></label>
        <label className="field"><OptionalLabel>آماده شروع از تاریخ</OptionalLabel><input type="date" dir="ltr" disabled={busy} value={form.availableFrom??''} onChange={(e)=>set('availableFrom',e.target.value)}/></label>
        <label className="field field--wide"><RequiredLabel>مهارت‌ها</RequiredLabel><textarea required disabled={busy} value={form.skills} onChange={(e)=>set('skills',e.target.value)} placeholder="مهارت‌های تخصصی، نرم‌افزارها، زبان و گواهی‌ها…"/></label>
        <label className="field field--wide"><RequiredLabel>درباره من و هدف شغلی</RequiredLabel><textarea required minLength={20} disabled={busy} value={form.about} onChange={(e)=>set('about',e.target.value)} placeholder="کوتاه درباره تجربه، توانایی و هدف همکاری خود بنویسید…"/></label>
      </div></section>
      <section className="candidate-profile-section"><h3>رزومه و مدارک</h3><p>PDF یا تصویر JPG/PNG/WebP، حداکثر ۵ مگابایت برای هر فایل. در ویرایش، رزومه جدید جایگزین نسخه فعال می‌شود و نسخه قبلی در تاریخچه باقی می‌ماند.</p>
        <div className="candidate-file-controls"><label className="field"><span>نوع فایل</span><select disabled={busy} value={fileKind} onChange={(e)=>setFileKind(e.target.value as RecruitmentCandidateFileKind)}>{RECRUITMENT_CANDIDATE_FILE_CATALOG.map((item)=><option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label><button type="button" className="button button--secondary" disabled={busy} onClick={()=>fileInputRef.current?.click()}><FilePlus2/> انتخاب فایل</button><input ref={fileInputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={fileChanged}/></div>
        <div className={`candidate-drop-zone ${dragging?'is-dragging':''}`} onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={dropped} onClick={()=>fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')fileInputRef.current?.click();}}><UploadCloud/><strong>فایل را اینجا رها کنید</strong><span>یا برای انتخاب فایل کلیک کنید</span></div>
        <div className="candidate-file-list">{existingDocuments.map((document)=><article key={document.id} className={document.status==='replaced'?'is-replaced':''}><Paperclip/><span><strong>{document.label}</strong><small>{document.fileName} · {formatBytes(document.size)} · {document.status==='replaced'?'نسخه قبلی':'نسخه فعال'}</small></span><button type="button" className="icon-button" disabled={busy} onClick={()=>void downloadExisting(document.id,document.fileName)} aria-label={`دریافت ${document.label} ${document.fileName}`}><Download/></button></article>)}{form.files.map((file,index)=><article key={`${file.fileName}-${index}`}><Paperclip/><span><strong>{candidateFileLabel(file.kind)}</strong><small>{file.fileName} · {formatBytes(file.size)} · آماده ثبت</small></span><button type="button" className="icon-button icon-button--danger" disabled={busy} onClick={()=>set('files',form.files.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`حذف ${file.fileName}`}><Trash2/></button></article>)}{!existingDocuments.length&&!form.files.length&&<div className="quiet-state">هنوز فایلی انتخاب نشده است؛ تکمیل فرم بدون فایل رزومه نیز امکان‌پذیر است.</div>}</div>
      </section>
      <label className="candidate-consent"><input type="checkbox" disabled={busy} checked={form.consent} onChange={(e)=>set('consent',e.target.checked)}/><span><strong>اجازه نگهداری در بانک استعداد</strong><small>اطلاعات و مدارک این پرونده برای بررسی فرصت‌های فعلی و آینده نگهداری شود.</small></span></label>
    </div>
    <footer><button type="button" className="button button--ghost" disabled={busy} onClick={safeClose}>انصراف</button><button type="button" className="button button--primary" disabled={busy} onClick={()=>void submit()}>{busy?'در حال ثبت…':isPublic?'ارسال رزومه و دریافت کد پیگیری':'ثبت پرونده و مدارک'}</button></footer>
  </RecordDialog>;
}
