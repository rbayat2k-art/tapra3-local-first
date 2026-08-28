import {useMemo, useRef, useState} from 'react';
import {ArrowLeft, BellRing, Building2, CheckCircle2, Download, Eye, FileImage, FileText, Landmark, Pencil, Plus, Search, Trash2, UploadCloud, UserRound, X} from 'lucide-react';
import {can} from './authorization';
import {permissionFor, stateLabel, type ErpModuleDefinition} from './erpCatalog';
import {FormValidationSummary, OptionalLabel, RequiredLabel} from './FormValidation';
import type {FoundationState, OperationalRecord} from './model';
import {PersianDateInput, formatPersianDate, formatPersianDateTime} from './PersianDate';
import {
  normalizePurchaseAmount, purchaseAllocationTotal, purchaseLineTotal, purchaseRequestTotal,
  purchaseRequestValidationErrors, readPurchaseRequestPayload,
  type PurchaseRequestAllocation, type PurchaseRequestLine, type PurchaseRequestPayload,
} from './purchaseRequest';
import type {LocalFoundationService, OperationalRecordInput} from './service';
import {SortHeader, useSortableRows, type SortColumn} from './Sorting';
import {RecordDialog} from './RecordDialog';
import {formatPortalAmount, normalizeBankCard} from '../utils/operationalFormat';
import {canRequestTreasuryFollowUp} from './purchaseFollowUp';
import {decisionsForWorkflowState, roleIdsForWorkflowState} from './workflowPolicy';
import {readFinancialPaymentProgress} from './financialCore';
import {ApprovalRoundProgress} from './ApprovalRoundProgress';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
const today = () => new Date().toISOString().slice(0, 10);
const newId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
const rial = (value: string | bigint | undefined) => `${BigInt(value || '0').toLocaleString('en-US')} ریال`;
const groupedNumber = (value: string | undefined) => value ? formatPortalAmount(value) : '';
const priorityLabel = (value: OperationalRecord['priority']) => ({low: 'کم', normal: 'عادی', high: 'زیاد', critical: 'بحرانی'})[value];
const tone = (status: string) => ['purchase_approved', 'sent_to_treasury', 'paid'].includes(status) ? 'good' : ['rejected', 'cancelled'].includes(status) ? 'danger' : status === 'draft' ? 'neutral' : 'progress';

const emptyLine = (): PurchaseRequestLine => ({id: newId('line'), title: '', category: '', specification: '', quantity: '1', unit: 'عدد', estimatedUnitPriceRial: '', preferredSupplier: ''});
const emptyAllocation = (): PurchaseRequestAllocation => ({id: newId('allocation'), branchUnitId: '', costCenterUnitId: '', amountRial: '', note: ''});
const MAX_QUOTATION_FILE_SIZE = 5 * 1024 * 1024;
const QUOTATION_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const isAllowedQuotationFile = (file: File) => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? '')); reader.onerror = () => reject(new Error('خواندن فایل پیش‌فاکتور ناموفق بود.')); reader.readAsDataURL(file);});
const fileSizeLabel = (size: number) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024)).toLocaleString('en-US')} KB`;
const maskedCard = (value: string) => value.length === 16 ? `**** **** **** ${value.slice(-4)}` : '—';
const visibleCard = (value: string) => value.length === 16 ? value.replace(/(\d{4})(?=\d)/g, '$1 ') : '—';

export function PurchaseRequestTable({records, state, module, onOpen, onEdit, onFollowUp}: {records: OperationalRecord[]; state: FoundationState; module: ErpModuleDefinition; onOpen: (record: OperationalRecord) => void; onEdit: (record: OperationalRecord) => void; onFollowUp: (record: OperationalRecord) => void}) {
  const columns = useMemo<SortColumn<OperationalRecord>[]>(() => [
    {key: 'record', kind: 'text', value: (item) => item.title},
    {key: 'status', kind: 'text', value: (item) => stateLabel(module.workflow, item.status)},
    {key: 'priority', kind: 'number', value: (item) => ({low: 1, normal: 2, high: 3, critical: 4})[item.priority]},
    {key: 'branches', kind: 'number', value: (item) => readPurchaseRequestPayload(item.payload).allocations.length},
    {key: 'amount', kind: 'number', value: (item) => Number(item.amountRial ?? 0)},
    {key: 'updated', kind: 'date', value: (item) => item.updatedAt},
  ], [module.workflow]);
  const {sortedRows, sort, requestSort} = useSortableRows(records, columns, 'updated', 'desc');
  return <div className="operational-table-wrap"><table className="operational-table purchase-table"><thead><tr>
    <th className="operational-row-number">ردیف</th><th><SortHeader columnKey="record" label="درخواست" sort={sort} onSort={requestSort}/></th>
    <th><SortHeader columnKey="status" label="وضعیت" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="priority" label="اولویت" sort={sort} onSort={requestSort}/></th>
    <th><SortHeader columnKey="branches" label="تقسیم شعب" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="amount" label="جمع برآورد" sort={sort} onSort={requestSort}/></th>
    <th><SortHeader columnKey="updated" label="آخرین تغییر" sort={sort} onSort={requestSort}/></th><th><span className="sr-only">اقدام‌ها</span></th>
  </tr></thead><tbody>{sortedRows.map((record, index) => {
    const payload = readPurchaseRequestPayload(record.payload);
    const correctionRecipient=typeof record.payload.continuityCorrectionRecipientUserId==='string'?record.payload.continuityCorrectionRecipientUserId:undefined;
    const editable = can(state.activeUser, permissionFor(module.id, 'edit')) && (record.createdByUserId === state.activeUser.id || (record.status==='needs_correction'&&correctionRecipient===state.activeUser.id)) && ['draft', 'needs_correction'].includes(record.status);
    const followUpAvailable = canRequestTreasuryFollowUp(state, record);
    return <tr key={record.id} onDoubleClick={() => onOpen(record)}><td className="operational-row-number">{(index + 1).toLocaleString('en-US')}</td>
      <td><button className="record-link" onClick={() => onOpen(record)}><strong>{record.title}</strong><code dir="ltr">{record.trackingCode}</code></button></td>
      <td><span className={`state-badge state-badge--${tone(record.status)}`}>{stateLabel(module.workflow, record.status)}</span></td><td>{priorityLabel(record.priority)}</td>
      <td>{payload.allocations.length.toLocaleString('en-US')} سهم / {new Set(payload.allocations.map((item) => item.branchUnitId)).size.toLocaleString('en-US')} شعبه</td>
      <td><strong>{rial(record.amountRial)}</strong></td><td>{formatPersianDateTime(record.updatedAt)}<small className="table-version">نسخه {record.version.toLocaleString('en-US')}</small></td>
      <td><div className="icon-actions"><button className="icon-button" title="مشاهده درخواست و گردش تأیید" aria-label="مشاهده درخواست و گردش تأیید" onClick={() => onOpen(record)}><Eye size={17}/></button>{followUpAvailable && <button className="icon-button icon-button--follow-up" title="درخواست پیگیری از خزانه" aria-label="درخواست پیگیری از خزانه" onClick={() => onFollowUp(record)}><BellRing size={16}/></button>}{editable && <button className="icon-button" title="ویرایش پیش‌نویس" aria-label="ویرایش پیش‌نویس" onClick={() => onEdit(record)}><Pencil size={16}/></button>}</div></td>
    </tr>;
  })}</tbody></table>{!sortedRows.length && <div className="empty-state"><Search size={26}/><strong>درخواست خریدی پیدا نشد.</strong><span>فیلترها را تغییر دهید یا درخواست تازه بسازید.</span></div>}</div>;
}

export function PurchaseRequestEditor({state, record, onClose, onSave}: {state: FoundationState; record?: OperationalRecord; onClose: () => void; onSave: (input: OperationalRecordInput) => Promise<unknown>}) {
  const stored = readPurchaseRequestPayload(record?.payload);
  const [form, setForm] = useState<OperationalRecordInput>({
    title: record?.title ?? '', description: record?.description ?? '', priority: record?.priority ?? 'normal', dueAt: record?.dueAt?.slice(0, 10) ?? '',
    payload: ({
      requestDate: stored.requestDate || today(), purchaseType: stored.purchaseType, deliveryLocation: stored.deliveryLocation,
      lines: stored.lines.length ? stored.lines : [emptyLine()], quotationAttachments: stored.quotationAttachments,
      beneficiaryCardNumber: stored.beneficiaryCardNumber, beneficiaryLastName: stored.beneficiaryLastName,
      allocations: stored.allocations.length ? stored.allocations : [emptyAllocation()],
    } as unknown as OperationalRecord['payload']),
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const payload = readPurchaseRequestPayload(form.payload);
  const total = purchaseRequestTotal(payload); const allocated = purchaseAllocationTotal(payload); const difference = total - allocated;
  const branches = state.units.filter((unit) => unit.status === 'active' && unit.type === 'شعبه');
  const costCenters = state.units.filter((unit) => unit.status === 'active' && unit.type !== 'شعبه');
  const setField = <K extends keyof OperationalRecordInput>(key: K, value: OperationalRecordInput[K]) => setForm((current) => ({...current, [key]: value}));
  const setPayload = (next: Partial<PurchaseRequestPayload>) => setForm((current) => ({...current, payload: {...readPurchaseRequestPayload(current.payload), ...next} as unknown as OperationalRecord['payload']}));
  const updateLine = (id: string, key: keyof PurchaseRequestLine, value: string) => setPayload({lines: payload.lines.map((item) => item.id === id ? {...item, [key]: value} : item)});
  const updateAllocation = (id: string, key: keyof PurchaseRequestAllocation, value: string) => setPayload({allocations: payload.allocations.map((item) => item.id === id ? {...item, [key]: value} : item)});
  const uploadQuotations = async (selected: File[]) => {
    if (!selected.length) return;
    const invalidType = selected.find((file) => !isAllowedQuotationFile(file));
    const oversized = selected.find((file) => file.size > MAX_QUOTATION_FILE_SIZE);
    if (invalidType) {setUploadError(`فایل «${invalidType.name}» مجاز نیست؛ فقط تصویر یا PDF بارگذاری کنید.`); return;}
    if (oversized) {setUploadError(`حجم فایل «${oversized.name}» بیشتر از ۵ مگابایت است.`); return;}
    try {
      const uploadedAt = new Date().toISOString();
      const additions = await Promise.all(selected.map(async (file) => ({id: newId('quotation-file'), fileName: file.name, mimeType: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg'), size: file.size, dataUrl: await fileToDataUrl(file), uploadedAt})));
      setPayload({quotationAttachments: [...payload.quotationAttachments, ...additions]}); setUploadError('');
    } catch (error) {setUploadError(error instanceof Error ? error.message : 'بارگذاری فایل پیش‌فاکتور ناموفق بود.');}
  };
  const distribute = () => {
    if (!payload.allocations.length || total <= 0n) return;
    const base = total / BigInt(payload.allocations.length); const remainder = total % BigInt(payload.allocations.length);
    setPayload({allocations: payload.allocations.map((item, index) => ({...item, amountRial: String(base + (index === 0 ? remainder : 0n))}))});
  };
  const submit = () => {const next = purchaseRequestValidationErrors(state, form); setErrors(next); if (!next.length) void onSave(form);};
  return <div className="modal-scrim"><form className="dialog purchase-editor" noValidate onSubmit={(event) => {event.preventDefault(); submit();}}>
    <header><div><span className="eyebrow">{record ? `ویرایش نسخه ${record.version.toLocaleString('en-US')}` : 'درخواست خرید جدید'}</span><h2>{record ? record.title : 'ایجاد درخواست خرید چندشعبه‌ای'}</h2><p>جمع مبلغ از ردیف‌ها محاسبه می‌شود و تقسیم مالی باید دقیقاً با آن برابر باشد.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="dialog-body purchase-editor__body"><FormValidationSummary errors={errors}/>
      <PurchaseSection icon={FileText} title="سربرگ درخواست" caption="مشخصات اصلی و زمان‌بندی">
        <div className="form-grid"><label className="field field--wide"><RequiredLabel>عنوان درخواست</RequiredLabel><input aria-required="true" autoFocus value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="مثلاً خرید تجهیزات اتاق جلسات شعب"/></label>
          <label className="field"><RequiredLabel>تاریخ درخواست</RequiredLabel><PersianDateInput value={payload.requestDate} onChange={(value) => setPayload({requestDate: value})} ariaLabel="تاریخ درخواست شمسی"/></label>
          <label className="field"><OptionalLabel>تاریخ موردنیاز</OptionalLabel><PersianDateInput value={form.dueAt} onChange={(value) => setField('dueAt', value)} ariaLabel="تاریخ موردنیاز شمسی"/></label>
          <label className="field"><RequiredLabel>اولویت</RequiredLabel><select value={form.priority} onChange={(event) => setField('priority', event.target.value as OperationalRecord['priority'])}><option value="low">کم</option><option value="normal">عادی</option><option value="high">زیاد</option><option value="critical">فوری / بحرانی</option></select></label>
          <label className="field"><RequiredLabel>نوع خرید</RequiredLabel><select value={payload.purchaseType} onChange={(event) => setPayload({purchaseType: event.target.value as PurchaseRequestPayload['purchaseType']})}><option value="goods">کالا</option><option value="service">خدمت</option><option value="mixed">کالا و خدمت</option></select></label>
          <label className="field field--wide"><OptionalLabel>محل تحویل</OptionalLabel><input value={payload.deliveryLocation} onChange={(event) => setPayload({deliveryLocation: event.target.value})} placeholder="انبار مرکزی یا نشانی تحویل"/></label>
          <label className="field field--wide"><RequiredLabel>شرح نیاز و دلیل خرید</RequiredLabel><textarea aria-required="true" rows={3} value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="هدف، ضرورت و محدودیت‌های خرید را بنویسید…"/></label>
        </div>
      </PurchaseSection>

      <PurchaseSection icon={Plus} title="ردیف‌های خرید" caption={`${payload.lines.length.toLocaleString('en-US')} ردیف · جمع ${rial(total)}`} action={<button type="button" className="button button--secondary button--small" onClick={() => setPayload({lines: [...payload.lines, emptyLine()]})}><Plus size={15}/> افزودن ردیف</button>}>
        <div className="purchase-lines">{payload.lines.map((line, index) => <article className="purchase-line" key={line.id}><div className="purchase-line__head"><strong>ردیف {(index + 1).toLocaleString('en-US')}</strong><span>{rial(purchaseLineTotal(line))}</span><button type="button" className="icon-button icon-button--danger" disabled={payload.lines.length === 1} onClick={() => setPayload({lines: payload.lines.filter((item) => item.id !== line.id)})} title="حذف ردیف" aria-label={`حذف ردیف ${(index + 1).toLocaleString('en-US')}`}><Trash2 size={16}/></button></div><div className="purchase-line__grid">
          <label className="field"><RequiredLabel>شرح کالا / خدمت</RequiredLabel><input value={line.title} onChange={(e) => updateLine(line.id, 'title', e.target.value)}/></label>
          <label className="field"><RequiredLabel>گروه خرید</RequiredLabel><input value={line.category} onChange={(e) => updateLine(line.id, 'category', e.target.value)} placeholder="تجهیزات، اداری، خدمات…"/></label>
          <label className="field field--wide"><OptionalLabel>مشخصات فنی</OptionalLabel><input value={line.specification} onChange={(e) => updateLine(line.id, 'specification', e.target.value)}/></label>
          <label className="field"><RequiredLabel>تعداد</RequiredLabel><input inputMode="decimal" dir="ltr" value={groupedNumber(line.quantity)} onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}/></label>
          <label className="field"><RequiredLabel>واحد سنجش</RequiredLabel><select value={line.unit} onChange={(e) => updateLine(line.id, 'unit', e.target.value)}><option>عدد</option><option>دستگاه</option><option>بسته</option><option>کیلوگرم</option><option>متر</option><option>ساعت</option><option>خدمت</option></select></label>
          <label className="field"><RequiredLabel>قیمت حدودی واحد (ریال)</RequiredLabel><input inputMode="numeric" dir="ltr" value={groupedNumber(line.estimatedUnitPriceRial)} onChange={(e) => updateLine(line.id, 'estimatedUnitPriceRial', normalizePurchaseAmount(e.target.value))}/></label>
          <label className="field"><OptionalLabel>تأمین‌کننده پیشنهادی</OptionalLabel><input value={line.preferredSupplier} onChange={(e) => updateLine(line.id, 'preferredSupplier', e.target.value)}/></label>
        </div></article>)}</div>
      </PurchaseSection>

      <PurchaseSection icon={Building2} title="تقسیم مالی شعب و مراکز هزینه" caption="برای هر سهم، شعبه و مرکز هزینه را جدا تعیین کنید." action={<div className="section-actions"><button type="button" className="button button--ghost button--small" onClick={distribute}>تقسیم مساوی</button><button type="button" className="button button--secondary button--small" onClick={() => setPayload({allocations: [...payload.allocations, emptyAllocation()]})}><Plus size={15}/> افزودن سهم</button></div>}>
        <div className="purchase-allocations">{payload.allocations.map((allocation, index) => <article className="purchase-allocation" key={allocation.id}><span className="purchase-allocation__number">{(index + 1).toLocaleString('en-US')}</span>
          <label className="field"><RequiredLabel>شعبه</RequiredLabel><select value={allocation.branchUnitId} onChange={(e) => updateAllocation(allocation.id, 'branchUnitId', e.target.value)}><option value="">انتخاب شعبه…</option>{branches.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
          <label className="field"><RequiredLabel>مرکز هزینه</RequiredLabel><select value={allocation.costCenterUnitId} onChange={(e) => updateAllocation(allocation.id, 'costCenterUnitId', e.target.value)}><option value="">انتخاب مرکز هزینه…</option>{costCenters.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
          <label className="field"><RequiredLabel>مبلغ سهم (ریال)</RequiredLabel><input inputMode="numeric" dir="ltr" value={groupedNumber(allocation.amountRial)} onChange={(e) => updateAllocation(allocation.id, 'amountRial', normalizePurchaseAmount(e.target.value))}/></label>
          <label className="field"><OptionalLabel>یادداشت مالی</OptionalLabel><input value={allocation.note} onChange={(e) => updateAllocation(allocation.id, 'note', e.target.value)}/></label>
          <button type="button" className="icon-button icon-button--danger" disabled={payload.allocations.length === 1} onClick={() => setPayload({allocations: payload.allocations.filter((item) => item.id !== allocation.id)})} title="حذف سهم" aria-label={`حذف سهم ${(index + 1).toLocaleString('en-US')}`}><Trash2 size={16}/></button>
        </article>)}</div>
        <div className={`allocation-summary ${difference === 0n ? 'allocation-summary--ok' : 'allocation-summary--error'}`}><span>جمع ردیف‌ها <strong>{rial(total)}</strong></span><span>جمع تخصیص <strong>{rial(allocated)}</strong></span><span>اختلاف <strong>{rial(difference < 0n ? -difference : difference)}</strong></span></div>
      </PurchaseSection>

      <PurchaseSection icon={FileImage} title="پیش‌فاکتور و اطلاعات پرداخت" caption="فایل تصویر یا PDF پیش‌فاکتور را مستقیماً بارگذاری کنید؛ اطلاعات صاحب کارت الزامی است.">
        <div className="quotation-upload-layout">
          <label className="quotation-upload-zone">
            <input type="file" accept={QUOTATION_FILE_ACCEPT} multiple onChange={(event) => {const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void uploadQuotations(files);}}/>
            <UploadCloud size={28}/><strong>بارگذاری فایل یا تصویر پیش‌فاکتور</strong><span>JPG، PNG، WebP یا PDF؛ حداکثر ۵ مگابایت برای هر فایل</span>
          </label>
          {uploadError && <div className="field-error" role="alert">{uploadError}</div>}
          <div className="quotation-payment-fields">
            <label className="field"><RequiredLabel>شماره کارت دریافت‌کننده</RequiredLabel><input aria-required="true" inputMode="numeric" dir="ltr" maxLength={16} value={payload.beneficiaryCardNumber} onChange={(event) => setPayload({beneficiaryCardNumber: normalizeBankCard(event.target.value)})} placeholder="6104337812345678"/></label>
            <label className="field"><RequiredLabel>نام خانوادگی صاحب کارت</RequiredLabel><input aria-required="true" value={payload.beneficiaryLastName} onChange={(event) => setPayload({beneficiaryLastName: event.target.value})} placeholder="مثلاً احمدی"/></label>
          </div>
          {!payload.quotationAttachments.length ? <div className="quiet-state">هنوز فایل پیش‌فاکتوری بارگذاری نشده است.</div> : <div className="quotation-files">{payload.quotationAttachments.map((attachment) => <article key={attachment.id}>
            <div className="quotation-file-preview">{attachment.mimeType.startsWith('image/') && attachment.dataUrl ? <img src={attachment.dataUrl} alt={`پیش‌نمایش ${attachment.fileName}`}/> : <FileText size={28}/>}</div>
            <span><strong>{attachment.fileName}</strong><small>{attachment.size ? fileSizeLabel(attachment.size) : 'پیوست منتقل‌شده از نسخه قبلی'}</small></span>
            <div className="icon-actions">{attachment.dataUrl && <a className="icon-button" href={attachment.dataUrl} download={attachment.fileName} aria-label={`دریافت ${attachment.fileName}`} title="دریافت فایل"><Download size={16}/></a>}<button type="button" className="icon-button icon-button--danger" onClick={() => setPayload({quotationAttachments: payload.quotationAttachments.filter((item) => item.id !== attachment.id)})} aria-label={`حذف ${attachment.fileName}`} title="حذف فایل"><Trash2 size={16}/></button></div>
          </article>)}</div>}
        </div>
      </PurchaseSection>
    </div><footer><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary">{record ? 'ذخیره نسخه اصلاحی' : 'ثبت پیش‌نویس درخواست'}</button></footer>
  </form></div>;
}

export function PurchaseRequestDrawer({state, record, module, service, execute, onClose, onEdit}: {state: FoundationState; record: OperationalRecord; module: ErpModuleDefinition; service: LocalFoundationService; execute: Execute; onClose: () => void; onEdit: () => void}) {
  const [reason, setReason] = useState(''); const [assignee, setAssignee] = useState(''); const [errors, setErrors] = useState<string[]>([]);
  const decisionCommand=useRef<{id:string;fingerprint:string}|undefined>(undefined);const decisionBusy=useRef(false);
  const payload = readPurchaseRequestPayload(record.payload); const history = state.operationalHistory.filter((item) => item.recordId === record.id).sort((a, b) => b.sequence - a.sequence);
  const decisionStage = ['submitted', 'purchase_review', 'purchase_approved'].includes(record.status);
  const currentApprovalState = record.status === 'submitted' ? 'submitted' : 'purchase_review';
  const currentApprovalRoles = roleIdsForWorkflowState(state, 'purchase-request', currentApprovalState, ['role-purchase-approver']);
  const allowedDecisions = decisionsForWorkflowState(state, 'purchase-request', currentApprovalState, ['approve','reject','needs_correction']);
  const isDecisionMaker = decisionStage && record.createdByUserId !== state.activeUser.id && can(state.activeUser, permissionFor('purchase-request', 'approve')) && (state.activeUser.isAdmin || state.activeUser.roleIds.some((roleId) => currentApprovalRoles.includes(roleId)));
  const correctionRecipient=typeof record.payload.continuityCorrectionRecipientUserId==='string'?record.payload.continuityCorrectionRecipientUserId:undefined;
  const isCorrectionOwner=record.createdByUserId===state.activeUser.id||(record.status==='needs_correction'&&correctionRecipient===state.activeUser.id);
  const transitions = module.workflow.transitions.filter((item) => item.from.includes(record.status) && can(state.activeUser, item.permission) && !item.makerChecker && isCorrectionOwner);
  const approverRoleIds = roleIdsForWorkflowState(state, 'purchase-request', 'purchase_review', ['role-purchase-approver']);
  const payerRoleIds = roleIdsForWorkflowState(state, 'purchase-request', 'sent_to_treasury', ['role-treasury-executor-v1']);
  const approvers = state.users.filter((user) => user.status === 'active' && !user.isAdmin && user.id !== state.activeUser.id && user.id !== record.createdByUserId && user.roleIds.some((roleId)=>approverRoleIds.includes(roleId)) && can(user, permissionFor('purchase-request', 'approve')));
  const payers = state.users.filter((user) => user.status === 'active' && !user.isAdmin && user.id !== state.activeUser.id && user.roleIds.some((roleId)=>payerRoleIds.includes(roleId)) && can(user, permissionFor('treasury-execution', 'transition')) && !approvers.some((approver) => approver.id === user.id));
  const editable = can(state.activeUser, permissionFor(module.id, 'edit')) && isCorrectionOwner && ['draft', 'needs_correction'].includes(record.status);
  const decide = (transition: ErpModuleDefinition['workflow']['transitions'][number]) => {const next = transition.reasonRequired && reason.trim().length < 3 ? ['دلیل تصمیم یا توضیح برای خزانه را کامل وارد کنید.'] : []; setErrors(next); if(next.length||decisionBusy.current)return;const fingerprint=JSON.stringify({recordId:record.id,version:record.version,transitionId:transition.id,reason});if(!decisionCommand.current||decisionCommand.current.fingerprint!==fingerprint)decisionCommand.current={id:`ui-purchase-transition:${crypto.randomUUID()}`,fingerprint};const commandId=decisionCommand.current.id;decisionBusy.current=true;void execute('purchase-transition', () => service.transitionOperationalRecord(module.id, record.id, transition.id, reason,commandId), `وضعیت درخواست به «${stateLabel(module.workflow, transition.to)}» تغییر کرد.`).then((succeeded) => {if (succeeded) {decisionCommand.current=undefined;setReason(''); setErrors([]);}}).finally(()=>{decisionBusy.current=false;});};
  const submitDecision = (decision: 'approve_and_forward' | 'needs_correction' | 'rejected') => {
    const next = [
      ...(reason.trim().length < 3 ? ['توضیح تصمیم را کامل وارد کنید.'] : []),
      ...(decision === 'approve_and_forward' && !assignee ? ['تأییدکننده بعدی یا پرداخت‌کننده مقصد را انتخاب کنید.'] : []),
    ];
    setErrors(next);
    if (next.length||decisionBusy.current) return;
    const message = decision === 'approve_and_forward' ? 'درخواست تأیید و به مقصد بعدی ارجاع شد.' : decision === 'needs_correction' ? 'درخواست برای اصلاح به کارتابل درخواست‌کننده بازگشت.' : 'درخواست رد و بسته شد.';
    const fingerprint=JSON.stringify({recordId:record.id,version:record.version,decision,assignee,reason});if(!decisionCommand.current||decisionCommand.current.fingerprint!==fingerprint)decisionCommand.current={id:`ui-purchase-decision:${crypto.randomUUID()}`,fingerprint};const commandId=decisionCommand.current.id;decisionBusy.current=true;
    void execute('purchase-decision', () => service.decidePurchaseRequest(record.id, decision, assignee, reason, record.version,commandId), message).then((succeeded) => {if (succeeded) {decisionCommand.current=undefined;setReason(''); setAssignee(''); setErrors([]);}}).finally(()=>{decisionBusy.current=false;});
  };
  return <RecordDialog ariaLabel={`جزئیات ${record.title}`} className="purchase-drawer" onClose={onClose}><header><div><span className="eyebrow">{record.trackingCode}</span><h2>{record.title}</h2><p>{record.description}</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="drawer-body">
    <div className="record-status-hero"><span className={`state-badge state-badge--${tone(record.status)}`}>{stateLabel(module.workflow, record.status)}</span><span>نسخه {record.version.toLocaleString('en-US')}</span><span>{priorityLabel(record.priority)}</span><strong>{rial(record.amountRial)}</strong></div>
    <PurchaseRequestDetails state={state} record={record}/>
    <ApprovalRoundProgress state={state} record={record}/>
    <section className="workflow-box"><h3>{isDecisionMaker ? 'تصمیم تأییدکننده' : 'اقدام بعدی'}</h3><FormValidationSummary errors={errors}/>{(isDecisionMaker || transitions.some((item) => item.reasonRequired)) && <label className="field"><RequiredLabel>توضیح تصمیم</RequiredLabel><textarea aria-required="true" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="توضیحی بنویسید که در تاریخچه پرونده ثبت شود…"/></label>}
      {isDecisionMaker && <div className="purchase-assignment"><label className="field"><RequiredLabel>مقصد پس از تأیید</RequiredLabel><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">انتخاب تأییدکننده بعدی یا پرداخت‌کننده…</option>{approvers.length > 0 && <optgroup label="تأییدکنندگان بعدی">{approvers.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.roleTitle}</option>)}</optgroup>}{payers.length > 0 && <optgroup label="پرداخت‌کنندگان خزانه">{payers.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.roleTitle}</option>)}</optgroup>}</select></label><span className="quiet-state"><UserRound size={16}/>با انتخاب تأییدکننده، پرونده در زنجیره تأیید می‌ماند؛ با انتخاب پرداخت‌کننده، سهم‌های شعب وارد صف خزانه می‌شوند.</span></div>}
      {isDecisionMaker ? <div className="transition-actions">{allowedDecisions.includes('approve') && <button className="button button--primary" type="button" onClick={() => submitDecision('approve_and_forward')}>تأیید و ارجاع به نفر بعدی<ArrowLeft size={16}/></button>}{allowedDecisions.includes('needs_correction') && <button className="button button--secondary" type="button" onClick={() => submitDecision('needs_correction')}>نیازمند اصلاح<ArrowLeft size={16}/></button>}{allowedDecisions.includes('reject') && <button className="button button--danger" type="button" onClick={() => submitDecision('rejected')}>رد و بستن پرونده<ArrowLeft size={16}/></button>}</div> : <div className="transition-actions">{transitions.map((transition) => <button className={`button ${transition.to === 'cancelled' ? 'button--danger' : 'button--primary'}`} key={transition.id} onClick={() => decide(transition)}>{transition.label}<ArrowLeft size={16}/></button>)}{!transitions.length && <span className="quiet-state"><CheckCircle2 size={18}/>اقدام مجاز بعدی برای این نقش وجود ندارد.</span>}</div>}
    </section>
    <section className="history-box"><h3>تاریخچه غیرقابل حذف</h3>{history.length ? history.map((item) => <article key={item.id}><span/><div><strong>{item.toState ? `${item.fromState ?? ''} ← ${item.toState}` : item.eventType}</strong><p>{item.reason || `${item.actorName} این رویداد را ثبت کرد.`}</p><small>{formatPersianDateTime(item.occurredAt)} · #{item.sequence.toLocaleString('en-US')}</small></div></article>) : <div className="quiet-state">تاریخچه‌ای ثبت نشده است.</div>}</section>
  </div><footer>{editable && <button className="button button--secondary" onClick={onEdit}><Pencil size={17}/> ویرایش پیش‌نویس</button>}<button className="button button--ghost" onClick={onClose}>بستن</button></footer></RecordDialog>;
}

export function PurchaseRequestDetails({state, record, revealBeneficiaryCard = false}: {state: FoundationState; record: OperationalRecord; revealBeneficiaryCard?: boolean}) {
  const payload = readPurchaseRequestPayload(record.payload);
  const paymentProgress = readFinancialPaymentProgress(record);
  return <>
    <div className="purchase-summary-grid"><span>تاریخ درخواست<strong>{payload.requestDate ? formatPersianDate(payload.requestDate) : '—'}</strong></span><span>تاریخ موردنیاز<strong>{record.dueAt ? formatPersianDate(record.dueAt) : '—'}</strong></span><span>نوع خرید<strong>{{goods: 'کالا', service: 'خدمت', mixed: 'کالا و خدمت'}[payload.purchaseType]}</strong></span><span>درخواست‌کننده<strong>{state.users.find((user) => user.id === record.createdByUserId)?.name ?? '—'}</strong></span></div>
    {paymentProgress && <section className="financial-progress" aria-label="پیشرفت پرداخت درخواست"><div><span>سهم‌های پرداخت‌شده</span><strong>{paymentProgress.paidCount.toLocaleString('en-US')} از {paymentProgress.obligationCount.toLocaleString('en-US')}</strong></div><div><span>مبلغ پرداخت‌شده</span><strong>{rial(paymentProgress.paidRial)}</strong></div><div><span>وضعیت تعهد</span><strong>{paymentProgress.complete ? 'تسویه کامل' : 'در انتظار تکمیل پرداخت'}</strong></div></section>}
    <section className="purchase-detail-section"><h3>ردیف‌های خرید</h3><div className="purchase-detail-table"><div className="purchase-detail-table__head"><span>ردیف</span><span>شرح</span><span>مقدار</span><span>قیمت واحد</span><span>جمع</span></div>{payload.lines.map((line, index) => <div key={line.id}><span>{(index + 1).toLocaleString('en-US')}</span><span><strong>{line.title}</strong><small>{line.category} · {line.specification || 'بدون مشخصات تکمیلی'}</small></span><span>{Number(line.quantity).toLocaleString('en-US')} {line.unit}</span><span>{rial(line.estimatedUnitPriceRial)}</span><span>{rial(purchaseLineTotal(line))}</span></div>)}</div></section>
    <section className="purchase-detail-section"><h3>تقسیم مالی شعب</h3><div className="allocation-cards">{payload.allocations.map((item, index) => <article key={item.id}><i>{(index + 1).toLocaleString('en-US')}</i><Building2 size={18}/><span>شعبه<strong>{state.units.find((unit) => unit.id === item.branchUnitId)?.name ?? '—'}</strong></span><Landmark size={18}/><span>مرکز هزینه<strong>{state.units.find((unit) => unit.id === item.costCenterUnitId)?.name ?? '—'}</strong></span><b>{rial(item.amountRial)}</b>{item.note && <small>{item.note}</small>}</article>)}</div></section>
    <section className="purchase-detail-section"><h3>پیش‌فاکتور و اطلاعات پرداخت</h3><div className="quotation-payment-summary"><span>نام خانوادگی صاحب کارت<strong>{payload.beneficiaryLastName || '—'}</strong></span><span>{revealBeneficiaryCard ? 'شماره کارت مقصد پرداخت' : 'شماره کارت'}<strong dir="ltr">{revealBeneficiaryCard ? visibleCard(payload.beneficiaryCardNumber) : maskedCard(payload.beneficiaryCardNumber)}</strong>{revealBeneficiaryCard && <small>نمایش کامل فقط برای مجری همین پرداخت</small>}</span></div>{payload.quotationAttachments.length > 0 ? <div className="quote-cards">{payload.quotationAttachments.map((attachment) => <article key={attachment.id}>{attachment.mimeType.startsWith('image/') && attachment.dataUrl ? <img src={attachment.dataUrl} alt={`پیش‌نمایش ${attachment.fileName}`}/> : <FileText size={18}/>}<span><strong>{attachment.fileName}</strong><small>{attachment.size ? fileSizeLabel(attachment.size) : 'پیوست منتقل‌شده از نسخه قبلی'}</small></span>{attachment.dataUrl && <a className="icon-button" href={attachment.dataUrl} download={attachment.fileName} aria-label={`دریافت ${attachment.fileName}`} title="دریافت فایل"><Download size={16}/></a>}</article>)}</div> : <div className="quiet-state">فایل پیش‌فاکتوری بارگذاری نشده است.</div>}</section>
  </>;
}

function PurchaseSection({icon: Icon, title, caption, action, children}: {icon: typeof FileText; title: string; caption: string; action?: React.ReactNode; children: React.ReactNode}) {
  return <section className="purchase-section"><header><div className="purchase-section__icon"><Icon size={19}/></div><div><h3>{title}</h3><p>{caption}</p></div>{action && <div className="purchase-section__action">{action}</div>}</header><div className="purchase-section__body">{children}</div></section>;
}
