import {useRef, useState, type FormEvent, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2, Clock3, FileText, Gavel, Plus, X} from 'lucide-react';
import type {FoundationState} from '../model';
import type {FoundationExecutor} from '../OrganizationPages';
import type {LocalFoundationService} from '../service';
import {formatPersianDate, formatPersianDateTime, PersianDateInput, todayIsoDate} from '../PersianDate';
import {RecordDialog} from '../RecordDialog';
import type {LegalCase, LegalDeadline, LegalProceeding} from './model';
import type {LegalNoticeInput, LegalProceedingInput} from './operations';
import {LEGAL_PERMISSIONS} from './policy';

interface Props {
  state: FoundationState;
  record: LegalCase;
  service: LocalFoundationService;
  execute: FoundationExecutor;
}

const hasPermission = (state: FoundationState, permission: string) => state.roles.some((role) =>
  role.status === 'active' && role.permissions.includes(permission) && state.activeUser.roleIds.includes(role.id),
);
const stageLabel: Record<LegalProceeding['stage'], string> = {
  initial_review: 'بررسی اولیه',
  hearing: 'جلسه رسیدگی',
  judgment: 'صدور رأی',
  appeal: 'تجدیدنظر',
  execution: 'اجرای حکم',
};
const noticeLabel: Record<string, string> = {
  hearing: 'وقت رسیدگی',
  response_required: 'نیازمند پاسخ',
  judgment: 'رأی',
  execution: 'اجراییه',
  other: 'سایر',
};

function deadlineTiming(item: LegalDeadline): {label: string; tone: 'danger' | 'progress' | 'good' | 'neutral'} {
  if (item.status === 'completed') return {label: 'تکمیل‌شده', tone: 'good'};
  if (item.status === 'cancelled') return {label: 'لغوشده', tone: 'neutral'};
  if (item.status === 'superseded') return {label: 'جایگزین‌شده', tone: 'neutral'};
  const today = todayIsoDate();
  const dueDate = todayIsoDate(new Date(item.dueAt));
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return {label: `${Math.abs(days).toLocaleString('fa-IR')} روز گذشته از مهلت`, tone: 'danger'};
  if (days === 0) return {label: 'سررسید امروز', tone: 'progress'};
  return {label: `${days.toLocaleString('fa-IR')} روز باقی‌مانده`, tone: 'good'};
}

export function LegalCaseOperationsSection({state, record, service, execute}: Props) {
  const legal = state.legalInspection!;
  const proceedings = legal.proceedings.filter((item) => item.caseId === record.id);
  const actionableProceedings = proceedings.filter((item) => item.status === 'active' || item.status === 'on_hold');
  const notices = legal.notices.filter((item) => item.caseId === record.id);
  const deadlines = legal.deadlines.filter((item) => item.caseId === record.id);
  const documents = legal.documents.filter((item) => item.caseId === record.id);
  const [dialog, setDialog] = useState<'proceeding' | 'notice'>();
  const command = useRef<{fingerprint: string; id: string} | undefined>(undefined);
  const mayManageDeadline = hasPermission(state, LEGAL_PERMISSIONS.deadlineManage);
  const mayManageDocument = hasPermission(state, LEGAL_PERMISSIONS.documentMetadataManage);

  const run = (kind: string, payload: unknown, work: (id: string) => Promise<FoundationState>, message: string) => {
    const fingerprint = JSON.stringify({kind, payload});
    if (!command.current || command.current.fingerprint !== fingerprint) {
      command.current = {fingerprint, id: `ui-legal-operation:${kind}:${crypto.randomUUID()}`};
    }
    return execute(`legal-operation-${kind}`, () => work(command.current!.id), message).then((ok) => {
      if (ok) {
        command.current = undefined;
        setDialog(undefined);
      }
      return ok;
    });
  };
  const locked = Boolean(record.qaDatasetId) || ['closed', 'void'].includes(record.status);

  return <section className="legal-detail-section legal-operations-section">
    <div className="legal-section-heading">
      <div>
        <h3>گردش عملیاتی پرونده</h3>
        <p className="muted">رسیدگی، ابلاغ، مهلت و مشخصات سند؛ بدون فایل واقعی یا عملیات پرداخت.</p>
      </div>
      <div className="legal-section-actions">
        {!locked && hasPermission(state, LEGAL_PERMISSIONS.proceedingManage) && <button className="button button--secondary" onClick={() => setDialog('proceeding')}><Plus size={16}/>روند جدید</button>}
        {!locked && actionableProceedings.length > 0 && hasPermission(state, LEGAL_PERMISSIONS.noticeManage) && <button className="button button--primary" onClick={() => setDialog('notice')}><Plus size={16}/>ثبت ابلاغ</button>}
      </div>
    </div>
    <div className="legal-operation-grid">
      <article>
        <h4><Gavel size={17}/>روندهای دادرسی</h4>
        {proceedings.length ? proceedings.map((item) => <div className="legal-operation-row" key={item.id}>
          <div><strong>{item.authorityName}</strong><small>{stageLabel[item.stage]} · نسخه {item.version.toLocaleString('fa-IR')}</small></div>
          {!locked && ['active', 'on_hold'].includes(item.status) && hasPermission(state, LEGAL_PERMISSIONS.proceedingManage)
            ? <button className="button button--ghost" onClick={() => void run('proceeding-close', {id: item.id, version: item.version}, (id) => service.closeLegalProceeding(item.id, item.version, id), 'روند دادرسی بسته شد.')}><CheckCircle2 size={15}/>بستن روند</button>
            : <span className="state-badge state-badge--good">{item.status === 'closed' ? 'بسته' : item.status}</span>}
        </div>) : <p className="muted">هنوز روندی ثبت نشده است.</p>}
      </article>
      <article>
        <h4><FileText size={17}/>ابلاغیه‌ها</h4>
        {notices.length ? notices.map((item) => <div className="legal-operation-row" key={item.id}>
          <div><strong>{noticeLabel[item.noticeType] ?? item.noticeType}</strong><small>دریافت: {formatPersianDate(item.receivedAt)}</small></div>
          {!locked && item.status === 'received' && hasPermission(state, LEGAL_PERMISSIONS.noticeManage)
            ? <button className="button button--ghost" onClick={() => void run('acknowledge', {id: item.id, version: item.version}, (id) => service.acknowledgeLegalNotice(item.id, item.version, id), 'دریافت ابلاغ تأیید شد.')}><CheckCircle2 size={15}/>تأیید دریافت</button>
            : <span className="state-badge state-badge--good">{item.status === 'acknowledged' ? 'تأییدشده' : item.status}</span>}
        </div>) : <p className="muted">ابلاغی ثبت نشده است.</p>}
      </article>
      <article>
        <h4><Clock3 size={17}/>مهلت‌ها</h4>
        {deadlines.length ? deadlines.map((item) => {
          const timing = deadlineTiming(item);
          return <div className="legal-operation-row" key={item.id}>
            <div>
              <strong>{formatPersianDate(item.dueAt)}</strong>
              <small>{item.priority === 'critical' ? 'بحرانی' : item.priority === 'high' ? 'بالا' : 'عادی'} · {state.users.find((user) => user.id === item.assigneeUserId)?.name ?? 'مسئول ثبت‌شده'}</small>
            </div>
            <div className="legal-operation-row__actions">
              <span className={`state-badge state-badge--${timing.tone}`}>{timing.label}</span>
              {!locked && item.status === 'open' && mayManageDeadline && <button className="button button--ghost" onClick={() => void run('deadline-complete', {id: item.id, version: item.version}, (id) => service.completeLegalDeadline(item.id, item.version, id), 'مهلت تکمیل شد.')}><CheckCircle2 size={15}/>تکمیل</button>}
            </div>
          </div>;
        }) : <p className="muted">مهلتی ثبت نشده است.</p>}
      </article>
      <article>
        <h4><FileText size={17}/>مشخصات اسناد</h4>
        {documents.length ? documents.map((item) => <div className="legal-operation-row" key={item.id}>
          <div><strong>{item.displayName}</strong><small>{item.classification === 'highly_confidential' ? 'فوق‌محرمانه' : item.classification === 'confidential' ? 'محرمانه' : 'داخلی'} · ثبت {formatPersianDateTime(item.createdAt)}</small></div>
          <span className="state-badge state-badge--neutral">بدون فایل</span>
        </div>) : <p className="muted">مشخصات سندی ثبت نشده است.</p>}
      </article>
    </div>
    {dialog === 'proceeding' && <ProceedingDialog record={record} onClose={() => setDialog(undefined)} onSubmit={(input) => void run('proceeding', input, (id) => service.createLegalProceeding(input, record.version, id), 'روند دادرسی ثبت شد.')}/>} 
    {dialog === 'notice' && <NoticeDialog state={state} record={record} proceedings={actionableProceedings} mayManageDeadline={mayManageDeadline} mayManageDocument={mayManageDocument} onClose={() => setDialog(undefined)} onSubmit={(input, version) => void run('notice', input, (id) => service.recordLegalNotice(input, version, id), 'ابلاغ و پیوست‌های متادیتایی ثبت شد.')}/>} 
  </section>;
}

function ProceedingDialog({record, onClose, onSubmit}: {record: LegalCase; onClose: () => void; onSubmit: (input: LegalProceedingInput) => void}) {
  const [authorityName, setAuthorityName] = useState('');
  const [authorityType, setAuthorityType] = useState<LegalProceeding['authorityType']>('court');
  const [stage, setStage] = useState<LegalProceeding['stage']>('initial_review');
  const [reference, setReference] = useState('');
  return <Dialog title="ثبت روند دادرسی" onClose={onClose}>
    <form onSubmit={(event) => {event.preventDefault(); onSubmit({caseId: record.id, authorityName, authorityType, stage, externalReferenceMasked: reference || undefined});}}>
      <div className="form-grid">
        <label>نوع مرجع<select value={authorityType} onChange={(event) => setAuthorityType(event.target.value as LegalProceeding['authorityType'])}><option value="court">دادگاه</option><option value="prosecutor">دادسرا</option><option value="administrative">مرجع اداری</option><option value="other">سایر</option></select></label>
        <label>نام مرجع<input required minLength={2} value={authorityName} onChange={(event) => setAuthorityName(event.target.value)}/></label>
        <label>مرحله<select value={stage} onChange={(event) => setStage(event.target.value as LegalProceeding['stage'])}>{Object.entries(stageLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>مرجع ماسک‌شده<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="مثلاً REF-***-42"/></label>
      </div>
      <Actions onClose={onClose}/>
    </form>
  </Dialog>;
}

interface NoticeDialogProps {
  state: FoundationState;
  record: LegalCase;
  proceedings: LegalProceeding[];
  mayManageDeadline: boolean;
  mayManageDocument: boolean;
  onClose: () => void;
  onSubmit: (input: LegalNoticeInput, version: number) => void;
}

function NoticeDialog({state, record, proceedings, mayManageDeadline, mayManageDocument, onClose, onSubmit}: NoticeDialogProps) {
  const [proceedingId, setProceedingId] = useState(proceedings[0]?.id ?? '');
  const [noticeType, setNoticeType] = useState<LegalNoticeInput['noticeType']>('response_required');
  const [receivedAt, setReceivedAt] = useState(todayIsoDate());
  const [issuedAt, setIssuedAt] = useState('');
  const [reference, setReference] = useState('');
  const [withDeadline, setWithDeadline] = useState(mayManageDeadline);
  const [dueAt, setDueAt] = useState(todayIsoDate());
  const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>('normal');
  const activeUsers = state.users.filter((user) => user.status === 'active' && user.companyId === record.companyId);
  const [assigneeUserId, setAssigneeUserId] = useState(activeUsers.some((user) => user.id === state.activeUser.id) ? state.activeUser.id : activeUsers[0]?.id ?? '');
  const [withDocument, setWithDocument] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [classification, setClassification] = useState<'internal' | 'confidential' | 'highly_confidential'>('internal');
  const proceeding = proceedings.find((item) => item.id === proceedingId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!proceeding) return;
    onSubmit({
      caseId: record.id,
      proceedingId,
      noticeType,
      receivedAt,
      issuedAt: issuedAt || undefined,
      externalReferenceMasked: reference || undefined,
      deadline: mayManageDeadline && withDeadline ? {dueAt, priority, assigneeUserId} : undefined,
      document: mayManageDocument && withDocument ? {documentType: 'notice', classification, displayName} : undefined,
    }, proceeding.version);
  };
  return <Dialog title="ثبت ابلاغ متادیتایی" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>روند دادرسی<select required value={proceedingId} onChange={(event) => setProceedingId(event.target.value)}>{proceedings.map((item) => <option key={item.id} value={item.id}>{item.authorityName} · {stageLabel[item.stage]}</option>)}</select></label>
        <label>نوع ابلاغ<select value={noticeType} onChange={(event) => setNoticeType(event.target.value as LegalNoticeInput['noticeType'])}>{Object.entries(noticeLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>تاریخ صدور<PersianDateInput value={issuedAt} onChange={setIssuedAt}/></label>
        <label>تاریخ دریافت<PersianDateInput required value={receivedAt} onChange={setReceivedAt}/></label>
        <label>مرجع ماسک‌شده<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="شماره کامل وارد نکنید"/></label>
        {mayManageDeadline && <label className="checkbox-row"><input type="checkbox" checked={withDeadline} onChange={(event) => setWithDeadline(event.target.checked)}/>ثبت مهلت اقدام</label>}
        {mayManageDeadline && withDeadline && <>
          <label>تاریخ مهلت<PersianDateInput required min={receivedAt} value={dueAt} onChange={setDueAt}/></label>
          <label>اولویت<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">عادی</option><option value="high">بالا</option><option value="critical">بحرانی</option></select></label>
          <label>مسئول مهلت<select required value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)}>{activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        </>}
        {mayManageDocument && <label className="checkbox-row"><input type="checkbox" checked={withDocument} onChange={(event) => setWithDocument(event.target.checked)}/>ثبت مشخصات سند بدون فایل</label>}
        {mayManageDocument && withDocument && <>
          <label>عنوان سند<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)}/></label>
          <label>طبقه‌بندی<select value={classification} onChange={(event) => setClassification(event.target.value as typeof classification)}><option value="internal">داخلی</option><option value="confidential">محرمانه</option><option value="highly_confidential">فوق‌محرمانه</option></select></label>
        </>}
      </div>
      {!mayManageDeadline && <p className="muted">مهلت اقدام را کاربری با مجوز مدیریت مهلت ثبت می‌کند.</p>}
      {!mayManageDocument && <p className="muted">ثبت مشخصات سند نیازمند مجوز مستقل مدیریت اسناد است.</p>}
      <Actions onClose={onClose}/>
    </form>
  </Dialog>;
}

function Dialog({title, onClose, children}: {title: string; onClose: () => void; children: ReactNode}) {
  return createPortal(<RecordDialog ariaLabel={title} className="dialog-card legal-dialog" onClose={onClose}>
    <header><div><span>گردش عملیاتی حقوقی</span><h2>{title}</h2></div><button type="button" className="icon-button" aria-label="بستن" onClick={onClose}><X size={20}/></button></header>
    <div className="legal-prototype-inline">فقط داده کاملاً مصنوعی وارد کنید؛ فایل واقعی ذخیره نمی‌شود.</div>
    {children}
  </RecordDialog>, document.body);
}
function Actions({onClose}: {onClose: () => void}) {
  return <footer><button type="button" className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--primary">ثبت</button></footer>;
}
