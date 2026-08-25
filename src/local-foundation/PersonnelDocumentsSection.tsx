import {useMemo, useRef, useState, type ChangeEvent} from 'react';
import {CheckCircle2, Download, FileImage, FileText, LoaderCircle, Plus, RefreshCw, ShieldCheck} from 'lucide-react';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService} from './service';
import {FormValidationSummary} from './FormValidation';
import {
  PERSONNEL_DOCUMENT_CATALOG, PERSONNEL_DOCUMENT_MAX_SIZE, PERSONNEL_DOCUMENT_PERMISSION_MANAGE,
  PERSONNEL_DOCUMENT_PERMISSION_READ, activePersonnelDocuments, missingPersonnelDocuments,
  personnelVerificationSummary, validatePersonnelDocumentFile, type PersonnelDocumentDefinition,
} from './personnelDocuments';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;

export function PersonnelDocumentsSection({state, service, execute, personnelId, mode = 'self'}: {
  state: FoundationState;
  service: LocalFoundationService;
  execute: Execute;
  personnelId: string;
  mode?: 'self' | 'gate' | 'hr';
}) {
  const personnel = state.personnel.find((item) => item.id === personnelId);
  const documents = useMemo(() => activePersonnelDocuments(state.operationalRecords, personnelId), [state.operationalRecords, personnelId]);
  const missing = useMemo(() => missingPersonnelDocuments(state.operationalRecords, personnelId), [state.operationalRecords, personnelId]);
  const isSelf = state.activeUser.personnelId === personnelId || personnel?.linkedUserId === state.activeUser.id;
  const mayManage = !state.session.actingAdminUserId && (isSelf || state.activeUser.permissions.includes(PERSONNEL_DOCUMENT_PERMISSION_MANAGE));
  const mayDownload = !state.session.actingAdminUserId && (isSelf || state.activeUser.permissions.includes(PERSONNEL_DOCUMENT_PERMISSION_READ));
  const completedRequired = PERSONNEL_DOCUMENT_CATALOG.filter((item) => item.required).length - missing.length;
  const verification = personnelVerificationSummary(personnel, state.operationalRecords);
  const [errors, setErrors] = useState<string[]>([]);
  const [busyKind, setBusyKind] = useState<string>();
  const operationInProgress = useRef(false);

  if (!personnel) return <div className="compact-empty">پرونده پرسنلی پیدا نشد.</div>;

  const upload = async (definition: PersonnelDocumentDefinition, event: ChangeEvent<HTMLInputElement>, replaceDocumentId?: string) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (operationInProgress.current) return;
    if (file.size > PERSONNEL_DOCUMENT_MAX_SIZE) { setErrors(['حجم هر فایل باید حداکثر ۵ مگابایت باشد.']); return; }
    operationInProgress.current = true;
    setBusyKind(definition.kind); setErrors([]);
    try {
      const dataUrl = await readFile(file);
      await validatePersonnelDocumentFile(definition.kind, {fileName: file.name, mimeType: file.type, size: file.size, dataUrl});
      await execute(`personnel-document-${definition.kind}`, () => service.savePersonnelDocument(personnelId, {kind: definition.kind, fileName: file.name, mimeType: file.type, size: file.size, dataUrl, replaceDocumentId}), `${definition.label} با موفقیت ثبت شد.`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'خواندن فایل ممکن نشد.']);
    } finally { operationInProgress.current = false; setBusyKind(undefined); }
  };

  const download = async (record: OperationalRecord) => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setErrors([]); setBusyKind(record.id);
    try {
      const file = await service.getPersonnelDocumentFile(record.id);
      const anchor = document.createElement('a');
      anchor.href = file.dataUrl; anchor.download = String(record.payload.fileName ?? 'personnel-document');
      anchor.rel = 'noopener'; anchor.click();
    } catch (error) { setErrors([error instanceof Error ? error.message : 'دریافت فایل ممکن نشد.']); }
    finally { operationInProgress.current = false; setBusyKind(undefined); }
  };

  return <section className={`personnel-documents personnel-documents--${mode}`} aria-labelledby={`personnel-documents-${personnelId}`}>
    <header className="personnel-documents__heading">
      <span><ShieldCheck size={22}/></span>
      <div><strong id={`personnel-documents-${personnelId}`}>مدارک و تصویر پرسنلی</strong><p>فایل‌ها فقط برای خود فرد و منابع انسانی مجاز قابل دریافت‌اند.</p></div>
      <div className={missing.length ? 'personnel-documents__progress personnel-documents__progress--missing' : 'personnel-documents__progress'}><b>سطح {verification.level.toLocaleString('fa-IR')} · {verification.label}</b><span>{verification.score.toLocaleString('fa-IR')}٪ تکمیل · {completedRequired.toLocaleString('fa-IR')} از {PERSONNEL_DOCUMENT_CATALOG.filter((item) => item.required).length.toLocaleString('fa-IR')} مدرک اجباری</span></div>
    </header>
    <FormValidationSummary errors={errors}/>
    {state.session.actingAdminUserId && <div className="notice notice--warning"><ShieldCheck size={18}/><span>بارگذاری و دریافت مدارک در حالت مشاهده دسترسی غیرفعال است.</span></div>}
    <div className="personnel-documents__grid">
      {PERSONNEL_DOCUMENT_CATALOG.map((definition) => {
        const current = documents.filter((record) => record.payload.documentKind === definition.kind);
        return <article key={definition.kind} className={`personnel-document-card ${current.length ? 'personnel-document-card--complete' : definition.required ? 'personnel-document-card--missing' : ''}`}>
          <div className="personnel-document-card__top"><span>{definition.imageOnly ? <FileImage size={21}/> : <FileText size={21}/>}</span><div><strong>{definition.label}</strong><small>{definition.description}</small></div><em>{definition.required ? 'اجباری' : 'اختیاری'}</em></div>
          {current.length ? <div className="personnel-document-card__files">{current.map((record) => <div key={record.id}><span><CheckCircle2 size={17}/><b title={String(record.payload.fileName ?? '')}>{String(record.payload.fileName ?? 'فایل ثبت‌شده')}</b><small>{formatSize(Number(record.payload.fileSize ?? 0))}</small></span><div>{mayDownload && <button type="button" onClick={() => void download(record)} disabled={Boolean(busyKind)} aria-label={`دریافت ${definition.label}`}>{busyKind === record.id ? <LoaderCircle className="spin" size={17}/> : <Download size={17}/>} دریافت</button>}{mayManage && <UploadButton definition={definition} replaceDocumentId={record.id} busy={Boolean(busyKind)} onChange={upload} label="جایگزینی"/>}</div></div>)}</div> : <p className="personnel-document-card__empty">هنوز فایلی ثبت نشده است.</p>}
          {mayManage && (!current.length || definition.repeatable) && <UploadButton definition={definition} busy={Boolean(busyKind)} onChange={upload} label={definition.repeatable && current.length ? 'افزودن فایل دیگر' : 'انتخاب و بارگذاری فایل'}/>} 
        </article>;
      })}
    </div>
    <p className="personnel-documents__policy">فرمت مجاز: PDF، JPG، PNG و WebP · حداکثر حجم هر فایل ۵ مگابایت · نسخه قبلی هنگام جایگزینی حذف نمی‌شود.</p>
  </section>;
}

function UploadButton({definition, replaceDocumentId, busy, onChange, label}: {definition: PersonnelDocumentDefinition; replaceDocumentId?: string; busy: boolean; onChange: (definition: PersonnelDocumentDefinition, event: ChangeEvent<HTMLInputElement>, replaceDocumentId?: string) => void; label: string}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <><button type="button" className="personnel-document-upload" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <LoaderCircle className="spin" size={17}/> : replaceDocumentId ? <RefreshCw size={17}/> : <Plus size={17}/>} {busy ? 'در حال ثبت…' : label}</button><input ref={inputRef} className="visually-hidden" tabIndex={-1} type="file" accept={definition.imageOnly ? 'image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp'} aria-label={`بارگذاری ${definition.label}`} onChange={(event) => void onChange(definition, event, replaceDocumentId)}/></>;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('خواندن فایل ممکن نشد.'));
    reader.onerror = () => reject(new Error('خواندن فایل ممکن نشد. فایل را دوباره انتخاب کنید.'));
    reader.onabort = () => reject(new Error('خواندن فایل لغو شد.'));
    reader.readAsDataURL(file);
  });
}

function formatSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'اندازه نامشخص';
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024).toLocaleString('en-US')} کیلوبایت` : `${(value / (1024 * 1024)).toFixed(1)} مگابایت`;
}
