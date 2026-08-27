import {useMemo, useState, type ReactNode} from 'react';
import {CheckCircle2, Download, Eye, FileText, Pencil, Printer, ReceiptText, RotateCcw, Trash2, UploadCloud, X} from 'lucide-react';
import {can} from './authorization';
import {ERP_MODULES, permissionFor, stateLabel, type ErpModuleDefinition} from './erpCatalog';
import {FormValidationSummary, OptionalLabel, RequiredLabel} from './FormValidation';
import type {FoundationState, OperationalRecord} from './model';
import {formatPersianDate, formatPersianDateTime, PersianDateInput} from './PersianDate';
import {PurchaseRequestDetails} from './PurchaseRequestUi';
import {readPurchaseRequestPayload} from './purchaseRequest';
import type {LocalFoundationService, TreasuryPaymentInput} from './service';
import {SortHeader, useSortableRows, type SortColumn} from './Sorting';
import {formatPortalAmount} from '../utils/operationalFormat';
import {EmployeeAdvanceDetails} from './EmployeeAdvanceUi';
import {advanceBeneficiaryName, maskCard, readEmployeeAdvancePayload} from './employeeAdvance';
import {RecordDialog} from './RecordDialog';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
type ReceiptFile = NonNullable<TreasuryPaymentInput['receipt']>;
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;
const ACCEPTED_RECEIPTS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => `receipt-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
const rial = (value?: string) => `${BigInt(value || '0').toLocaleString('en-US')} ریال`;
const fileSize = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024)).toLocaleString('en-US')} KB`;
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? '')); reader.onerror = () => reject(new Error('خواندن فایل رسید ناموفق بود.')); reader.readAsDataURL(file);});

export function isTreasuryRecordVisibleToUser(record: OperationalRecord, state: FoundationState): boolean {
  if (state.activeUser.isAdmin) return true;
  if (state.activeUser.roleIds.includes('role-treasury-executor-v1')) return record.assigneeUserId === state.activeUser.id;
  return true;
}

export function canRevealTreasuryBeneficiaryCard(record: OperationalRecord, state: FoundationState): boolean {
  return state.activeUser.status === 'active'
    && record.assigneeUserId === state.activeUser.id
    && state.activeUser.roleIds.includes('role-treasury-executor-v1')
    && can(state.activeUser, permissionFor('treasury-execution', 'view'))
    && can(state.activeUser, permissionFor('treasury-execution', 'transition'));
}

export function treasuryRequesterName(record: OperationalRecord, state: FoundationState): string {
  const source = state.operationalRecords.find((item) => item.id === record.relatedRecordId);
  if (source?.moduleId === 'employee-advance') return advanceBeneficiaryName(source);
  const requesterId = source?.createdByUserId ?? (typeof record.payload.initialRequesterUserId === 'string' ? record.payload.initialRequesterUserId : undefined);
  return state.users.find((user) => user.id === requesterId)?.name
    ?? (typeof record.payload.initialRequesterName === 'string' ? record.payload.initialRequesterName : 'ثبت نشده');
}

function treasuryReferralDate(record: OperationalRecord, state: FoundationState): string {
  const firstHandoff = state.operationalHistory.filter((item) => item.recordId === record.id && item.eventType === 'handoff').sort((a, b) => a.sequence - b.sequence)[0];
  return firstHandoff?.occurredAt ?? record.createdAt;
}

const priorityText = (priority: OperationalRecord['priority']) => ({low: 'کم', normal: 'عادی', high: 'زیاد', critical: 'بحرانی'})[priority];

export function TreasuryExecutionTable({records, state, module, onOpen, onEdit}: {records: OperationalRecord[]; state: FoundationState; module: ErpModuleDefinition; onOpen: (record: OperationalRecord) => void; onEdit: (record: OperationalRecord) => void}) {
  const columns = useMemo<SortColumn<OperationalRecord>[]>(() => [
    {key: 'record', kind: 'text', value: (item) => `${item.title} ${item.description}`},
    {key: 'requester', kind: 'text', value: (item) => treasuryRequesterName(item, state)},
    {key: 'amount', kind: 'number', value: (item) => Number(item.amountRial ?? 0)},
    {key: 'status', kind: 'text', value: (item) => stateLabel(module.workflow, item.status)},
    {key: 'priority', kind: 'number', value: (item) => ({low: 1, normal: 2, high: 3, critical: 4})[item.priority]},
    {key: 'referred', kind: 'date', value: (item) => treasuryReferralDate(item, state)},
  ], [module.workflow, state]);
  const {sortedRows, sort, requestSort} = useSortableRows(records, columns, 'referred', 'desc');
  const advanceRecords = sortedRows.filter((record) => state.operationalRecords.some((item) => item.id === record.relatedRecordId && item.moduleId === 'employee-advance'));
  const exportAdvances = async () => {const XLSX = await import('xlsx'); const rows = advanceRecords.map((record, index) => {const source = state.operationalRecords.find((item) => item.id === record.relatedRecordId)!; const payload = readEmployeeAdvancePayload(source); return {'ردیف': index + 1, 'شماره درخواست': source.trackingCode, 'کد پرسنلی': payload.personnelCode, 'نام': payload.firstName, 'نام خانوادگی': payload.lastName, 'شعبه': payload.branchName, 'واحد سازمانی': payload.unitName, 'سمت': payload.positionName, 'مبلغ مصوب (ریال)': Number(record.amountRial ?? 0), 'نام بانک': payload.bankName, 'شماره کارت': payload.cardNumber, 'تاریخ درخواست': formatPersianDate(payload.requestDate || source.createdAt), 'وضعیت': stateLabel(module.workflow, record.status)};}); const sheet = XLSX.utils.json_to_sheet(rows); sheet['!cols'] = [6,18,14,14,18,16,20,20,20,14,24,16,18].map((wch) => ({wch})); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'مساعده‌های پرداخت'); XLSX.writeFile(workbook, `مساعده_خزانه_${today()}.xlsx`, {compression: true});};
  return <div className="operational-table-wrap">{advanceRecords.length > 0 && <div className="treasury-export-bar"><button type="button" className="button button--secondary button--small" onClick={exportAdvances}><Download size={16}/> خروجی اکسل مساعده‌های این کارتابل</button><span>{advanceRecords.length.toLocaleString('en-US')} درخواست</span></div>}<table className="operational-table treasury-cartable-table"><thead><tr><th className="operational-row-number">ردیف</th><th><SortHeader columnKey="record" label="رکورد (توضیحات)" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="requester" label="درخواست‌کننده" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="amount" label="مبلغ درخواست" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="status" label="وضعیت" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="priority" label="اولویت" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="referred" label="تاریخ ارجاع به من" sort={sort} onSort={requestSort}/></th><th><span className="sr-only">اقدام‌ها</span></th></tr></thead><tbody>{sortedRows.map((record, index) => {const mayEdit = record.assigneeUserId === state.activeUser.id && ['queued','claimed','payment_recorded'].includes(record.status) && can(state.activeUser, permissionFor(module.id, 'edit'));return <tr key={record.id} onDoubleClick={() => onOpen(record)}><td className="operational-row-number">{(index + 1).toLocaleString('en-US')}</td><td><button className="record-link treasury-record-link" onClick={() => onOpen(record)}><strong>{record.title}</strong><span>{record.description || 'بدون توضیحات'}</span><code dir="ltr">{record.trackingCode}</code></button></td><td><strong className="treasury-requester-name">{treasuryRequesterName(record, state)}</strong></td><td><b className="treasury-amount" dir="ltr">{formatPortalAmount(record.amountRial ?? '0')} ریال</b></td><td><span className="state-badge state-badge--progress">{stateLabel(module.workflow, record.status)}</span></td><td><span className={`priority-dot priority-dot--${record.priority}`}/>{priorityText(record.priority)}</td><td><span className="cell-date">{formatPersianDateTime(treasuryReferralDate(record, state))}</span></td><td><div className="icon-actions"><button className="icon-button" title="مشاهده پرونده پرداخت" aria-label="مشاهده پرونده پرداخت" onClick={() => onOpen(record)}><Eye size={17}/></button>{mayEdit && <button className="icon-button" title="اصلاح اطلاعات پرداخت" aria-label="اصلاح اطلاعات پرداخت" onClick={() => onEdit(record)}><Pencil size={16}/></button>}</div></td></tr>;})}</tbody></table>{!sortedRows.length && <div className="empty-state"><ReceiptText size={26}/><strong>پرونده‌ای به کارتابل شما ارجاع نشده است.</strong><span>فقط پرداخت‌هایی که برای همین حساب تعیین شده‌اند اینجا نمایش داده می‌شوند.</span></div>}</div>;
}

export function TreasuryExecutionDrawer({state, record, module, service, execute, onClose, initialEditPayment = false}: {state: FoundationState; record: OperationalRecord; module: ErpModuleDefinition; service: LocalFoundationService; execute: Execute; onClose: () => void; initialEditPayment?: boolean}) {
  const source = state.operationalRecords.find((item) => item.id === record.relatedRecordId);
  const purchaseModule = ERP_MODULES.find((item) => item.id === 'purchase-request');
  const advanceModule = ERP_MODULES.find((item) => item.id === 'employee-advance');
  const history = state.operationalHistory.filter((item) => item.recordId === record.id).sort((a, b) => b.sequence - a.sequence);
  const sourceHistory = source ? state.operationalHistory.filter((item) => item.recordId === source.id).sort((a, b) => b.sequence - a.sequence) : [];
  const payment = readPayment(record);
  const linkedTreasuryRecords = source ? state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === source.id) : [record];
  const canPrint = Boolean(source) && state.activeUser.status === 'active' && !state.activeUser.isAdmin && state.activeUser.roleIds.includes('role-treasury-executor-v1');
  const [paidAt, setPaidAt] = useState(payment?.paidAt ?? today());
  const [paymentReference, setPaymentReference] = useState(payment?.paymentReference ?? '');
  const [note, setNote] = useState(payment?.note ?? '');
  const [receipt, setReceipt] = useState<ReceiptFile | undefined>(payment?.receipt);
  const [editingPayment, setEditingPayment] = useState(Boolean(initialEditPayment && payment));
  const [revisionReason, setRevisionReason] = useState('');
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const canRecordPayment = ['queued', 'claimed'].includes(record.status) && record.assigneeUserId === state.activeUser.id && can(state.activeUser, permissionFor('treasury-execution', 'transition'));
  const canManageRecordedPayment = record.status === 'payment_recorded' && record.assigneeUserId === state.activeUser.id && can(state.activeUser, permissionFor('treasury-execution', 'edit'));

  const chooseReceipt = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_RECEIPT_SIZE) {setErrors(['حجم رسید پرداخت نباید بیشتر از ۵ مگابایت باشد.']); return;}
    if (!ACCEPTED_RECEIPTS.includes(file.type)) {setErrors(['رسید پرداخت باید تصویر JPG، PNG، WEBP یا فایل PDF باشد.']); return;}
    try {
      const dataUrl = await fileToDataUrl(file);
      setReceipt({id: newId(), fileName: file.name, mimeType: file.type, size: file.size, dataUrl});
      setErrors([]);
    } catch (error) {setErrors([error instanceof Error ? error.message : 'بارگذاری رسید ناموفق بود.']);}
  };
  const submitPayment = () => {
    const next = !paidAt ? ['تاریخ پرداخت الزامی است.'] : [];
    setErrors(next); if (next.length) return;
    void execute('treasury-payment', () => service.recordTreasuryPayment(record.id, {paidAt, paymentReference, note, receipt}, record.version), 'پرداخت ثبت و برای راستی‌آزمایی ارسال شد.').then((succeeded) => {if (succeeded) setErrors([]);});
  };
  const savePaymentRevision = () => {
    const next = [...(!paidAt ? ['تاریخ پرداخت الزامی است.'] : []), ...(revisionReason.trim().length < 3 ? ['دلیل اصلاح اطلاعات پرداخت را وارد کنید.'] : [])];
    setErrors(next); if (next.length) return;
    void execute('treasury-payment-revision', () => service.reviseTreasuryPayment(record.id, {paidAt, paymentReference, note, receipt}, revisionReason, record.version), 'اصلاحات پرداخت با حفظ نسخه قبلی ثبت شد.').then((succeeded) => {if (succeeded) {setEditingPayment(false); setRevisionReason(''); setErrors([]);}});
  };
  const revertPayment = () => {
    const next = revertReason.trim().length < 3 ? ['دلیل بازگشت از پرداخت را وارد کنید.'] : [];
    setErrors(next); if (next.length) return;
    void execute('treasury-payment-revert', () => service.revertTreasuryPayment(record.id, revertReason, record.version), 'پرداخت با حفظ سابقه به وضعیت «در اختیار مجری پرداخت» بازگشت.').then((succeeded) => {if (succeeded) {setConfirmingRevert(false); setRevertReason(''); setErrors([]);}});
  };
  const cancelPaymentRevision = () => {
    setPaidAt(payment?.paidAt ?? today());
    setPaymentReference(payment?.paymentReference ?? '');
    setNote(payment?.note ?? '');
    setReceipt(payment?.receipt);
    setRevisionReason('');
    setErrors([]);
    setEditingPayment(false);
  };

  return <RecordDialog ariaLabel={`پرونده پرداخت ${record.title}`} className="purchase-drawer treasury-payment-drawer" onClose={onClose}>
    <header><div><span className="eyebrow">{record.trackingCode}</span><h2>{record.title}</h2><p>پرونده کامل درخواست و ثبت پرداخت خزانه</p></div><div className="treasury-drawer-actions">{canPrint && <button type="button" className="button button--secondary button--small" onClick={() => globalThis.print()}><Printer size={16}/> چاپ درخواست</button>}<button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></div></header>
    <div className="drawer-body">
      <div className="record-status-hero"><span className="state-badge state-badge--progress">{stateLabel(module.workflow, record.status)}</span><span>نسخه {record.version.toLocaleString('en-US')}</span><strong>{rial(record.amountRial)}</strong></div>
      <section className="treasury-source-banner"><ReceiptText size={20}/><div><span>درخواست مبنا</span><strong>{source ? `${source.trackingCode} — ${source.title}` : 'درخواست مبنا پیدا نشد'}</strong><small>{record.description}</small></div></section>
      {source?.moduleId === 'purchase-request' ? <><PurchaseRequestDetails state={state} record={source} revealBeneficiaryCard={canRevealTreasuryBeneficiaryCard(record, state)}/>{purchaseModule && <HistorySection title="تاریخچه تأیید درخواست خرید" history={sourceHistory} module={purchaseModule}/>}</> : source?.moduleId === 'employee-advance' ? <><EmployeeAdvanceDetails state={state} record={source} revealCard={canRevealTreasuryBeneficiaryCard(record, state)}/>{advanceModule && <HistorySection title="تاریخچه تأیید مساعده" history={sourceHistory} module={advanceModule}/>}</> : <div className="quiet-state">اطلاعات درخواست مبنا در داده‌های محلی موجود نیست.</div>}

      <section className="purchase-detail-section treasury-payment-section"><h3>ثبت و مستندات پرداخت</h3><FormValidationSummary errors={errors}/>
        {(canRecordPayment || editingPayment) && <div className="treasury-payment-form"><div className="treasury-payment-grid"><label className="field"><RequiredLabel>تاریخ پرداخت</RequiredLabel><PersianDateInput value={paidAt} onChange={setPaidAt} ariaLabel="انتخاب تاریخ شمسی پرداخت"/></label><label className="field"><OptionalLabel>شماره پیگیری پرداخت</OptionalLabel><input dir="ltr" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="در صورت وجود، شماره پیگیری بانک"/></label><label className="field field--wide"><OptionalLabel>توضیحات پرداخت</OptionalLabel><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="توضیح تکمیلی برای واحد مالی و تأییدکننده…"/></label>{editingPayment && <label className="field field--wide"><RequiredLabel>دلیل اصلاح اطلاعات پرداخت</RequiredLabel><textarea aria-required="true" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} placeholder="مثلاً: شماره پیگیری یا فایل رسید اشتباه ثبت شده بود"/></label>}</div>
          <label className="receipt-upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void chooseReceipt(event.target.files?.[0])}/>{receipt ? <><CheckCircle2 size={24}/><strong>{receipt.fileName}</strong><span>{fileSize(receipt.size)} · برای جایگزینی فایل کلیک کنید</span></> : <><UploadCloud size={26}/><strong>بارگذاری رسید پرداخت (اختیاری)</strong><span>در صورت وجود: تصویر JPG، PNG، WEBP یا PDF تا ۵ مگابایت</span></>}</label>
          {receipt && <button type="button" className="button button--ghost button--small receipt-remove-button" onClick={() => setReceipt(undefined)}><Trash2 size={15}/> حذف رسید ثبت‌شده از نسخه جدید</button>}
          <div className="treasury-form-actions">{editingPayment && <button type="button" className="button button--secondary" onClick={cancelPaymentRevision}>انصراف از اصلاح</button>}<button type="button" className="button button--primary treasury-pay-button" onClick={editingPayment ? savePaymentRevision : submitPayment}><ReceiptText size={17}/>{editingPayment ? 'ذخیره اصلاحات پرداخت' : 'ثبت پرداخت'}</button></div>
        </div>}
        {payment && !editingPayment && <><div className="payment-recorded-card"><CheckCircle2 size={22}/><div><strong>پرداخت ثبت شده است</strong><span>تاریخ پرداخت: {formatPersianDate(payment.paidAt)}{payment.financialDocumentNumber && <> · شماره سند: <b dir="ltr">{payment.financialDocumentNumber}</b></>}{payment.fiscalPeriod && <> · دوره مالی: <b dir="ltr">{payment.fiscalPeriod}</b></>}{payment.paymentReference && <> · شماره پیگیری: <b dir="ltr">{payment.paymentReference}</b></>}</span>{payment.note && <small>{payment.note}</small>}</div><div className="payment-recorded-actions">{payment.receipt && <a className="button button--secondary button--small" href={payment.receipt.dataUrl} download={payment.receipt.fileName}><Download size={15}/> دریافت رسید</a>}{canManageRecordedPayment && <button type="button" className="button button--secondary button--small" onClick={() => {setEditingPayment(true);setConfirmingRevert(false);setErrors([]);}}><Pencil size={15}/> اصلاح اطلاعات پرداخت</button>}{canManageRecordedPayment && <button type="button" className="button button--danger button--small" onClick={() => {setConfirmingRevert(true);setErrors([]);}}><RotateCcw size={15}/> بازگشت از پرداخت</button>}</div></div>
          {confirmingRevert && <div className="treasury-revert-box"><strong>بازگشت از ثبت پرداخت</strong><p>پرداخت فعلی حذف فیزیکی نمی‌شود؛ نسخه آن در تاریخچه می‌ماند و پرونده دوباره برای همین مجری قابل پرداخت خواهد شد.</p><label className="field"><RequiredLabel>دلیل بازگشت از پرداخت</RequiredLabel><textarea aria-required="true" value={revertReason} onChange={(event) => setRevertReason(event.target.value)} placeholder="دلیل اشتباه و نیاز به ثبت مجدد را بنویسید…"/></label><div><button type="button" className="button button--secondary" onClick={() => {setConfirmingRevert(false);setRevertReason('');setErrors([]);}}>انصراف</button><button type="button" className="button button--danger" onClick={revertPayment}><RotateCcw size={16}/> تأیید بازگشت از پرداخت</button></div></div>}</>}
        {!canRecordPayment && !payment && <div className="quiet-state"><CheckCircle2 size={18}/>در این مرحله اقدام اجرایی برای این حساب وجود ندارد.</div>}
      </section>
      <HistorySection title="تاریخچه اجرای خزانه" history={history} module={module}/>
      {source?.moduleId === 'purchase-request' && purchaseModule && <TreasuryPrintSheet state={state} source={source} purchaseModule={purchaseModule} treasuryModule={module} treasuryRecords={linkedTreasuryRecords}/>} 
      {source?.moduleId === 'employee-advance' && advanceModule && <EmployeeAdvancePrintSheet state={state} source={source} advanceModule={advanceModule} treasuryModule={module} treasuryRecords={linkedTreasuryRecords}/>} 
    </div><footer>{canPrint && <button type="button" className="button button--secondary" onClick={() => globalThis.print()}><Printer size={17}/> چاپ کامل درخواست</button>}<button className="button button--ghost" onClick={onClose}>بستن</button></footer>
  </RecordDialog>;
}

function readPayment(record: OperationalRecord): TreasuryPaymentInput | undefined {
  const value = record.payload.payment;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const payment = value as unknown as TreasuryPaymentInput;
  return payment.paidAt ? payment : undefined;
}

function HistorySection({title, history, module}: {title: string; history: FoundationState['operationalHistory']; module: ErpModuleDefinition}) {
  return <section className="history-box"><h3>{title}</h3>{history.length ? history.map((item) => <article key={item.id}><span/><div><strong>{item.toState ? `${stateLabel(module.workflow, item.fromState ?? '')} ← ${stateLabel(module.workflow, item.toState)}` : item.eventType}</strong><p>{item.reason || `${item.actorName} این رویداد را ثبت کرد.`}</p><small>{formatPersianDateTime(item.occurredAt)} · #{item.sequence.toLocaleString('en-US')}</small></div></article>) : <div className="quiet-state">رویدادی ثبت نشده است.</div>}</section>;
}

function EmployeeAdvancePrintSheet({state, source, advanceModule, treasuryModule, treasuryRecords}: {state: FoundationState; source: OperationalRecord; advanceModule: ErpModuleDefinition; treasuryModule: ErpModuleDefinition; treasuryRecords: OperationalRecord[]}) {
  const payload = readEmployeeAdvancePayload(source);
  const personnel = state.personnel.find((item) => item.id === payload.beneficiaryPersonnelId);
  const sourceHistory = state.operationalHistory.filter((item) => item.recordId === source.id).sort((a, b) => a.sequence - b.sequence);
  const printedAt = new Date().toISOString();
  const treasuryHistory = treasuryRecords.flatMap((record) => state.operationalHistory.filter((item) => item.recordId === record.id).map((item) => ({...item, treasuryRecord: record}))).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const actorRows = [
    ...sourceHistory.map((item) => ({id: item.id, stage: item.eventType === 'created' ? 'درخواست‌کننده / ثبت‌کننده' : 'گردش تأیید مساعده', name: item.actorName, status: item.toState ? stateLabel(advanceModule.workflow, item.toState) : item.eventType, occurredAt: item.occurredAt, reason: item.reason || '—'})),
    ...treasuryHistory.map((item) => ({id: item.id, stage: 'مجری خزانه', name: item.actorName, status: item.toState ? stateLabel(treasuryModule.workflow, item.toState) : item.eventType, occurredAt: item.occurredAt, reason: item.reason || '—'})),
  ];
  const paymentRows = treasuryRecords.map((record) => ({record, executor: state.users.find((user) => user.id === record.assigneeUserId), payment: readPayment(record)}));
  return <article className="treasury-print-sheet advance-print-sheet" aria-hidden="true">
    <header className="print-document-header"><div><strong>شاهراه — فرم کامل مساعده پرسنلی</strong><span>نسخه قابل بایگانی فیزیکی خزانه</span></div><div><span>شماره درخواست</span><b dir="ltr">{source.trackingCode}</b><small>زمان چاپ: {formatPersianDateTime(printedAt)}</small></div></header>
    <section className="print-title"><h1>{source.title}</h1><p>{source.description || 'بدون توضیحات'}</p><div><span>وضعیت فعلی<strong>{stateLabel(advanceModule.workflow, source.status)}</strong></span><span>تاریخ و ساعت درخواست<strong>{formatPersianDateTime(source.createdAt)}</strong></span><span>مبلغ اولیه<strong>{rial(payload.originalAmountRial)}</strong></span><span>مبلغ فعلی مصوب<strong>{rial(source.amountRial)}</strong></span></div></section>
    <PrintSection title="مشخصات پرسنل و جایگاه سازمانی"><div className="print-advance-facts"><span>نام و نام خانوادگی<strong>{payload.firstName} {payload.lastName}</strong></span><span>کد پرسنلی<strong dir="ltr">{payload.personnelCode}</strong></span><span>کد ملی<strong dir="ltr">{payload.nationalId || personnel?.nationalId || '—'}</strong></span><span>شماره همراه<strong dir="ltr">{payload.primaryMobile || personnel?.primaryMobile || '—'}</strong></span><span>شعبه<strong>{payload.branchName}</strong></span><span>واحد سازمانی<strong>{payload.unitName}</strong></span><span>سمت سازمانی<strong>{payload.positionName}</strong></span><span>نوع ثبت<strong>{payload.submittedOnBehalf ? `نیابتی توسط ${payload.proxyByName}` : 'توسط خود پرسنل'}</strong></span></div></PrintSection>
    <PrintSection title="اطلاعات بانکی و امضای دیجیتال"><div className="print-advance-facts"><span>نام بانک<strong>{payload.bankName || '—'}</strong></span><span>شماره کارت مقصد<strong dir="ltr">{maskCard(payload.cardNumber)}</strong></span><span>امضاکننده نسخه جاری<strong>{payload.signedByName || '—'}</strong></span><span>زمان آخرین امضا<strong>{payload.signedAt ? formatPersianDateTime(payload.signedAt) : '—'}</strong></span></div></PrintSection>
    <PrintSection title="گردش کامل از ثبت تا خزانه"><table className="print-actors-table"><thead><tr><th>ردیف</th><th>مرحله</th><th>نام شخص</th><th>وضعیت / اقدام</th><th>تاریخ و ساعت</th><th>توضیحات</th><th>امضا / مهر</th></tr></thead><tbody>{actorRows.map((item, index) => <tr key={item.id}><td>{(index + 1).toLocaleString('en-US')}</td><td>{item.stage}</td><td>{item.name}</td><td>{item.status}</td><td>{formatPersianDateTime(item.occurredAt)}</td><td>{item.reason}</td><td className="print-signature-cell"/></tr>)}</tbody></table></PrintSection>
    <PrintSection title="نتیجه اجرای پرداخت"><table><thead><tr><th>ردیف</th><th>مجری خزانه</th><th>وضعیت</th><th>تاریخ پرداخت</th><th>شماره پیگیری</th><th>توضیحات</th></tr></thead><tbody>{paymentRows.map(({record, executor, payment}, index) => <tr key={record.id}><td>{(index + 1).toLocaleString('en-US')}</td><td>{executor?.name || '—'}</td><td>{stateLabel(treasuryModule.workflow, record.status)}</td><td>{payment?.paidAt ? formatPersianDate(payment.paidAt) : 'ثبت نشده'}</td><td dir="ltr">{payment?.paymentReference || 'اختیاری / ثبت نشده'}</td><td>{payment?.note || record.description || '—'}</td></tr>)}</tbody></table></PrintSection>
    <footer className="print-document-footer"><span>این سند از نسخه جاری و تاریخچه غیرقابل حذف گردش مساعده در سامانه شاهراه تولید شده است.</span><b dir="ltr">{source.trackingCode}</b></footer>
  </article>;
}

function TreasuryPrintSheet({state, source, purchaseModule, treasuryModule, treasuryRecords}: {state: FoundationState; source: OperationalRecord; purchaseModule: ErpModuleDefinition; treasuryModule: ErpModuleDefinition; treasuryRecords: OperationalRecord[]}) {
  const payload = readPurchaseRequestPayload(source.payload);
  const sourceHistory = state.operationalHistory.filter((item) => item.recordId === source.id).sort((a, b) => a.sequence - b.sequence);
  const requester = state.users.find((user) => user.id === source.createdByUserId);
  const printedAt = new Date().toISOString();
  const actorRows = [
    {id: `requester-${source.id}`, stage: 'درخواست‌کننده خرید', name: requester?.name ?? '—', status: 'ثبت درخواست', occurredAt: source.createdAt, reason: source.description || '—'},
    ...sourceHistory.map((item) => ({id: item.id, stage: item.eventType === 'handoff' ? 'تأیید و ارجاع' : 'گردش تأیید', name: item.actorName, status: item.toState ? stateLabel(purchaseModule.workflow, item.toState) : item.eventType, occurredAt: item.occurredAt, reason: item.reason || '—'})),
    ...treasuryRecords.map((item) => {const executor = state.users.find((user) => user.id === item.assigneeUserId); const itemPayment = readPayment(item); return {id: `treasury-${item.id}`, stage: itemPayment ? 'پرداخت‌کننده' : 'مجری خزانه', name: executor?.name ?? 'تخصیص‌نیافته', status: stateLabel(treasuryModule.workflow, item.status), occurredAt: itemPayment?.paidAt ?? item.updatedAt, reason: itemPayment ? (itemPayment.paymentReference ? `شماره پیگیری: ${itemPayment.paymentReference}` : 'پرداخت بدون شماره پیگیری ثبت شد') : item.description};}),
  ];
  const paymentReceipts = treasuryRecords.map((item) => ({record: item, payment: readPayment(item)})).filter((item): item is {record: OperationalRecord; payment: TreasuryPaymentInput & {receipt: NonNullable<TreasuryPaymentInput['receipt']>}} => Boolean(item.payment?.receipt));
  return <article className="treasury-print-sheet" aria-hidden="true">
    <header className="print-document-header"><div><strong>شاهراه — پرونده درخواست خرید</strong><span>نسخه قابل بایگانی فیزیکی</span></div><div><span>شماره درخواست</span><b dir="ltr">{source.trackingCode}</b><small>زمان چاپ: {formatPersianDateTime(printedAt)}</small></div></header>
    <section className="print-title"><h1>{source.title}</h1><p>{source.description || 'بدون توضیحات'}</p><div><span>وضعیت نهایی گردش<strong>{stateLabel(purchaseModule.workflow, source.status)}</strong></span><span>تاریخ درخواست<strong>{formatPersianDate(payload.requestDate || source.createdAt)}</strong></span><span>تاریخ موردنیاز<strong>{source.dueAt ? formatPersianDate(source.dueAt) : 'اختیاری / ثبت نشده'}</strong></span><span>جمع کل<strong>{rial(source.amountRial)}</strong></span></div></section>
    <PrintSection title="ردیف‌های خرید"><table><thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>گروه و مشخصات</th><th>مقدار</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>{payload.lines.map((line, index) => <tr key={line.id}><td>{(index + 1).toLocaleString('en-US')}</td><td>{line.title}</td><td>{line.category}<small>{line.specification}</small></td><td>{Number(line.quantity).toLocaleString('en-US')} {line.unit}</td><td>{rial(line.estimatedUnitPriceRial)}</td><td>{rial((BigInt(line.estimatedUnitPriceRial || '0') * BigInt(line.quantity || '0')).toString())}</td></tr>)}</tbody></table></PrintSection>
    <PrintSection title="تقسیم مالی شعب و مراکز هزینه"><table><thead><tr><th>ردیف</th><th>شعبه</th><th>مرکز هزینه</th><th>مبلغ سهم</th><th>یادداشت</th></tr></thead><tbody>{payload.allocations.map((item, index) => <tr key={item.id}><td>{(index + 1).toLocaleString('en-US')}</td><td>{state.units.find((unit) => unit.id === item.branchUnitId)?.name ?? '—'}</td><td>{state.units.find((unit) => unit.id === item.costCenterUnitId)?.name ?? '—'}</td><td>{rial(item.amountRial)}</td><td>{item.note || '—'}</td></tr>)}</tbody></table></PrintSection>
    <PrintSection title="اطلاعات پرداخت اعلام‌شده"><div className="print-payment-facts"><span>نام خانوادگی صاحب کارت<strong>{payload.beneficiaryLastName || '—'}</strong></span><span>شماره کارت<strong dir="ltr">{payload.beneficiaryCardNumber || '—'}</strong></span></div></PrintSection>
    <PrintSection title="پیش‌فاکتورها و پیوست‌های درخواست"><div className="print-attachments">{payload.quotationAttachments.map((attachment) => <figure key={attachment.id}>{attachment.mimeType.startsWith('image/') && attachment.dataUrl ? <img src={attachment.dataUrl} alt={attachment.fileName}/> : <div className="print-file-placeholder"><FileText size={25}/><span>فایل PDF</span></div>}<figcaption>{attachment.fileName}</figcaption></figure>)}{!payload.quotationAttachments.length && <p>پیوستی ثبت نشده است.</p>}</div></PrintSection>
    {paymentReceipts.length > 0 && <PrintSection title="رسیدهای پرداخت"><div className="print-attachments">{paymentReceipts.map(({record: item, payment: itemPayment}) => <figure key={item.id}>{itemPayment.receipt.mimeType.startsWith('image/') ? <img src={itemPayment.receipt.dataUrl} alt={itemPayment.receipt.fileName}/> : <div className="print-file-placeholder"><ReceiptText size={25}/><span>رسید PDF</span></div>}<figcaption>{itemPayment.receipt.fileName}<small>{rial(item.amountRial)} · {itemPayment.paymentReference}</small></figcaption></figure>)}</div></PrintSection>}
    <PrintSection title="درخواست‌کننده، تأییدکنندگان و پرداخت‌کنندگان"><table className="print-actors-table"><thead><tr><th>ردیف</th><th>سمت در گردش</th><th>نام شخص</th><th>وضعیت / اقدام</th><th>تاریخ و ساعت</th><th>توضیحات</th><th>امضا / مهر</th></tr></thead><tbody>{actorRows.map((item, index) => <tr key={item.id}><td>{(index + 1).toLocaleString('en-US')}</td><td>{item.stage}</td><td>{item.name}</td><td>{item.status}</td><td>{formatPersianDateTime(item.occurredAt)}</td><td>{item.reason}</td><td className="print-signature-cell"/></tr>)}</tbody></table></PrintSection>
    <footer className="print-document-footer"><span>این سند از داده‌های ثبت‌شده و تاریخچه غیرقابل حذف سامانه شاهراه تولید شده است.</span><b dir="ltr">{source.trackingCode}</b></footer>
  </article>;
}

function PrintSection({title, children}: {title: string; children: ReactNode}) {return <section className="print-section"><h2>{title}</h2>{children}</section>;}
