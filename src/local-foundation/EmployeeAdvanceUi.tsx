import {useMemo, useState} from 'react';
import {ArrowLeft, Banknote, CheckCircle2, Eye, FileSignature, Pencil, RotateCcw, Search, Send, UserRound, X, XCircle} from 'lucide-react';
import type {ErpModuleDefinition} from './erpCatalog';
import {stateLabel} from './erpCatalog';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService} from './service';
import {advanceBeneficiaryName, advanceBranchIds, canEmployeeAdvanceReviewerDecide, canProxyAdvance, maskCard, readEmployeeAdvancePayload, type AdvanceDecision, type EmployeeAdvanceInput} from './employeeAdvance';
import {FormValidationSummary, OptionalLabel, RequiredLabel} from './FormValidation';
import {SortHeader, useSortableRows, type SortColumn} from './Sorting';
import {formatPersianDate, formatPersianDateTime} from './PersianDate';
import {formatPortalAmount, toLatinDigits} from '../utils/operationalFormat';
import {decisionsForWorkflowState, roleIdsForWorkflowState} from './workflowPolicy';
import {RecordDialog} from './RecordDialog';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
const rial = (value?: string) => `${formatPortalAmount(value || '0')} ریال`;
const numberOnly = (value: string) => toLatinDigits(value).replace(/\D/g, '');

const canEditAdvance = (record: OperationalRecord, state: FoundationState) => {
  const payload = readEmployeeAdvancePayload(record);
  return ['branch_review', 'needs_correction'].includes(record.status)
    && (state.activeUser.isAdmin || payload.beneficiaryUserId === state.activeUser.id || record.createdByUserId === state.activeUser.id);
};

export function EmployeeAdvanceTable({records, state, module, onOpen, onEdit}: {records: OperationalRecord[]; state: FoundationState; module: ErpModuleDefinition; onOpen: (record: OperationalRecord) => void; onEdit: (record: OperationalRecord) => void}) {
  const columns = useMemo<SortColumn<OperationalRecord>[]>(() => [
    {key: 'record', kind: 'text', value: advanceBeneficiaryName}, {key: 'amount', kind: 'number', value: (item) => item.amountRial},
    {key: 'status', kind: 'text', value: (item) => stateLabel(module.workflow, item.status)},
    {key: 'branch', kind: 'text', value: (item) => readEmployeeAdvancePayload(item).branchName}, {key: 'updated', kind: 'date', value: (item) => item.updatedAt},
  ], [module.workflow]);
  const {sortedRows, sort, requestSort} = useSortableRows(records, columns, 'updated', 'desc');
  return <div className="operational-table-wrap"><table className="operational-table advance-table"><thead><tr><th className="operational-row-number">ردیف</th><th><SortHeader columnKey="record" label="درخواست / پرسنل" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="amount" label="مبلغ" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="branch" label="شعبه" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="status" label="وضعیت" sort={sort} onSort={requestSort}/></th><th><SortHeader columnKey="updated" label="آخرین اقدام" sort={sort} onSort={requestSort}/></th><th>اقدام</th></tr></thead><tbody>{sortedRows.map((record, index) => {const payload = readEmployeeAdvancePayload(record); return <tr key={record.id}><td className="operational-row-number">{index + 1}</td><td><button className="record-link" onClick={() => onOpen(record)}><strong>{advanceBeneficiaryName(record)}</strong><code dir="ltr">{record.trackingCode}</code></button></td><td><strong>{rial(record.amountRial)}</strong></td><td>{payload.branchName}</td><td><span className={`state-badge state-badge--${record.status === 'paid' ? 'good' : record.status === 'rejected' ? 'danger' : 'progress'}`}>{stateLabel(module.workflow, record.status)}</span></td><td>{formatPersianDateTime(record.updatedAt)}</td><td><div className="icon-actions"><button className="icon-button" title="مشاهده و اقدام" aria-label="مشاهده و اقدام" onClick={() => onOpen(record)}><Eye size={17}/></button>{canEditAdvance(record, state) && <button className="icon-button" title="اصلاح درخواست مساعده" aria-label="اصلاح درخواست مساعده" onClick={() => onEdit(record)}><Pencil size={16}/></button>}</div></td></tr>;})}</tbody></table>{!sortedRows.length && <div className="empty-state"><Search size={26}/><strong>درخواست مساعده‌ای در این کارتابل نیست.</strong><span>فیلتر یا کارتابل دیگری را انتخاب کنید.</span></div>}</div>;
}

export function EmployeeAdvanceEditor({state, record, onClose, onSave}: {state: FoundationState; record?: OperationalRecord; onClose: () => void; onSave: (input: EmployeeAdvanceInput) => Promise<unknown>}) {
  const actor = state.activeUser;
  const existingPayload = record ? readEmployeeAdvancePayload(record) : undefined;
  const proxyRoleIds = roleIdsForWorkflowState(state, 'employee-advance', 'final_review', ['role-sales-advance-approver']);
  const mayProxy = !record && actor.roleIds.some((roleId) => proxyRoleIds.includes(roleId));
  const candidates = state.personnel.filter((person) => person.employmentStatus === 'active' && (person.id === actor.personnelId || canProxyAdvance(actor, person, state)));
  const [beneficiaryPersonnelId, setBeneficiary] = useState(existingPayload?.beneficiaryPersonnelId ?? (actor.personnelId && candidates.some((item) => item.id === actor.personnelId) ? actor.personnelId : candidates[0]?.id ?? ''));
  const [amountRial, setAmount] = useState(record?.amountRial ?? ''); const [note, setNote] = useState(record?.description ?? ''); const [signed, setSigned] = useState(false); const [approveAtCreation, setApproveAtCreation] = useState(mayProxy); const [errors, setErrors] = useState<string[]>([]);
  const beneficiary = state.personnel.find((person) => person.id === beneficiaryPersonnelId);
  const submit = () => {const next = [...(!beneficiary ? ['پرسنل را انتخاب کنید.'] : []), ...(!amountRial || BigInt(amountRial || '0') <= 0n ? ['مبلغ مساعده را وارد کنید.'] : []), ...(!signed ? ['تأیید و امضای دیجیتال الزامی است.'] : [])]; setErrors(next); if (!next.length) void onSave({beneficiaryPersonnelId, amountRial, note, signatureAccepted: signed, approveAtCreation});};
  return <div className="modal-scrim"><form className="dialog advance-editor" noValidate onSubmit={(event) => {event.preventDefault(); submit();}}><header><div><span className="eyebrow">{record ? `نسخه اصلاحی · ${record.trackingCode}` : 'فرم مساعده پرسنلی'}</span><h2>{record ? 'اصلاح درخواست مساعده' : mayProxy ? 'ثبت درخواست مساعده شخصی یا نیابتی' : 'درخواست مساعده من'}</h2><p>{record ? 'مبلغ و توضیحات را اصلاح کنید؛ نسخه قبلی و تمام تغییرات در تاریخچه باقی می‌ماند.' : 'اطلاعات بانکی و سازمانی از پرونده پرسنلی خوانده می‌شود.'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body form-grid"><FormValidationSummary errors={errors}/><label className="field field--wide"><RequiredLabel>پرسنل دریافت‌کننده</RequiredLabel><select value={beneficiaryPersonnelId} onChange={(event) => setBeneficiary(event.target.value)} disabled={Boolean(record) || !mayProxy}>{(record ? state.personnel.filter((person) => person.id === beneficiaryPersonnelId) : candidates).map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} — {person.personnelCode}</option>)}</select></label><label className="field"><RequiredLabel>مبلغ مساعده (ریال)</RequiredLabel><input dir="ltr" inputMode="numeric" value={amountRial ? formatPortalAmount(amountRial) : ''} onChange={(event) => setAmount(numberOnly(event.target.value))} placeholder="مثلاً 60,000,000"/></label><div className="advance-bank-preview"><Banknote size={20}/><span>پرداخت به کارت پرونده<strong dir="ltr">{beneficiary ? maskCard(beneficiary.cardNumber ?? '') : '—'}</strong><small>{beneficiary?.bankName || 'نام بانک ثبت نشده'}</small></span></div><label className="field field--wide"><OptionalLabel>توضیحات درخواست</OptionalLabel><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3}/></label>{mayProxy && <label className="check-field field--wide"><input type="checkbox" checked={approveAtCreation} onChange={(event) => setApproveAtCreation(event.target.checked)}/><span><strong>ثبت نیابتی و تأیید هم‌زمان</strong><small>در این حالت مدیر شعبه حذف می‌شود و درخواست مستقیم به حسابداری می‌رود.</small></span></label>}<label className="signature-consent field--wide"><input type="checkbox" checked={signed} onChange={(event) => setSigned(event.target.checked)}/><FileSignature size={22}/><span><strong>{record ? 'نسخه اصلاحی را تأیید و دوباره امضا می‌کنم' : 'درخواست را تأیید و امضا می‌کنم'}</strong><small>نام کاربر، تاریخ، ساعت و نسخه فرم در تاریخچه غیرقابل حذف ثبت می‌شود.</small></span></label></div><footer><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary"><Send size={17}/> {record ? 'ذخیره اصلاحات و ارسال مجدد' : 'ثبت، امضا و ارسال'}</button></footer></form></div>;
}

export function EmployeeAdvanceDetails({state, record, revealCard = false}: {state: FoundationState; record: OperationalRecord; revealCard?: boolean}) {
  const payload = readEmployeeAdvancePayload(record);
  const assignee = state.users.find((user) => user.id === record.assigneeUserId);
  const personnel = state.personnel.find((person) => person.id === payload.beneficiaryPersonnelId);
  return <div className="advance-details">
    <section className="advance-person-card"><UserRound size={24}/><div><strong>{payload.firstName} {payload.lastName}</strong><span>{payload.personnelCode} · {payload.positionName} · {payload.unitName}</span></div><span className="scope-badge">{payload.branchName}</span></section>
    <div className="advance-identity-strip"><span>کد ملی<strong dir="ltr">{payload.nationalId || personnel?.nationalId || 'ثبت نشده'}</strong></span><span>شماره همراه<strong dir="ltr">{payload.primaryMobile || personnel?.primaryMobile || 'ثبت نشده'}</strong></span><span>شماره درخواست<strong dir="ltr">{record.trackingCode}</strong></span></div>
    <div className="advance-fact-grid"><span>مبلغ اولیه<strong>{rial(payload.originalAmountRial)}</strong></span><span>مبلغ فعلی مصوب<strong>{rial(record.amountRial)}</strong></span><span>تاریخ و ساعت درخواست<strong>{formatPersianDateTime(record.createdAt)}</strong></span><span>نوع ثبت<strong>{payload.submittedOnBehalf ? `نیابتی توسط ${payload.proxyByName}` : 'توسط خود پرسنل'}</strong></span><span>مرحله / مسئول فعلی<strong>{assignee?.name || 'گردش پایان‌یافته'}</strong></span><span>نسخه فرم<strong>{record.version.toLocaleString('en-US')}</strong></span><span>نام بانک<strong>{payload.bankName || '—'}</strong></span><span>شماره کارت<strong dir="ltr">{revealCard ? maskCard(payload.cardNumber) : `**** **** **** ${payload.cardNumber.slice(-4)}`}</strong></span><span>آخرین تغییر<strong>{formatPersianDateTime(record.updatedAt)}</strong></span></div>
    <section className="advance-signature"><FileSignature size={21}/><div><strong>امضای دیجیتال نسخه جاری ثبت شده</strong><span>{payload.signedByName} · {formatPersianDateTime(payload.signedAt)}</span></div></section>
    <section className="advance-note"><span>توضیحات درخواست</span><p>{record.description || 'توضیحی ثبت نشده است.'}</p></section>
  </div>;
}

const routeStages = [
  {status: 'branch_review', label: 'مدیر شعبه'},
  {status: 'accounting_review', label: 'حسابداری'},
  {status: 'final_review', label: 'تأییدکننده اصلی'},
  {status: 'sent_to_treasury', label: 'خزانه'},
  {status: 'paid', label: 'پرداخت‌شده'},
];

function EmployeeAdvanceRouteStatus({state, record, canAct}: {state: FoundationState; record: OperationalRecord; canAct: boolean}) {
  const assignee = state.users.find((user) => user.id === record.assigneeUserId);
  const currentIndex = routeStages.findIndex((item) => item.status === record.status);
  const correction = record.status === 'needs_correction';
  const rejected = record.status === 'rejected';
  const currentLabel = correction ? 'درخواست‌کننده برای اصلاح' : rejected ? 'پرونده رد و بسته شده' : routeStages[currentIndex]?.label ?? 'مرحله نامشخص';
  return <section className="advance-route-card" aria-label="مسیر تأیید درخواست مساعده">
    <div className="advance-route-heading"><div><strong>مسیر تأیید درخواست</strong><span>وضعیت فعلی و مرحله بعدی به‌صورت ساده</span></div><b className={canAct ? 'is-actionable' : ''}>{canAct ? 'اکنون نوبت شماست' : `منتظر ${currentLabel}`}</b></div>
    <div className="advance-route-steps">{routeStages.map((step, index) => {
      const done = record.status === 'paid' || (!correction && !rejected && currentIndex > index);
      const active = !correction && !rejected && currentIndex === index;
      return <div key={step.status} className={done ? 'is-done' : active ? 'is-current' : ''}><i>{done ? '✓' : index + 1}</i><span>{step.label}</span></div>;
    })}</div>
    <div className={`advance-waiting-callout ${canAct ? 'is-actionable' : ''}`}>
      <strong>{canAct ? 'این درخواست اکنون برای تصمیم شما آماده است.' : correction ? 'این درخواست برای اصلاح به درخواست‌کننده بازگشته است.' : rejected ? 'این درخواست رد شده و گردش آن پایان یافته است.' : `این درخواست اکنون منتظر اقدام ${assignee?.name || currentLabel} است.`}</strong>
      <span>{canAct ? 'توضیحات اختیاری و گزینه‌های تصمیم در بخش زیر فعال هستند.' : 'وقتی درخواست به مرحله نقش شما برسد، گزینه‌های تأیید، اصلاح و رد به‌صورت خودکار فعال می‌شوند.'}</span>
    </div>
  </section>;
}

export function EmployeeAdvanceDrawer({state, record, module, service, execute, onClose, onEdit}: {state: FoundationState; record: OperationalRecord; module: ErpModuleDefinition; service: LocalFoundationService; execute: Execute; onClose: () => void; onEdit: () => void}) {
  const payload = readEmployeeAdvancePayload(record); const actor = state.activeUser;
  const assigned = record.assigneeUserId === actor.id || actor.isAdmin || canEmployeeAdvanceReviewerDecide(record, state);
  const [reason, setReason] = useState(''); const [amount, setAmount] = useState(record.amountRial ?? ''); const [errors, setErrors] = useState<string[]>([]);
  const history = state.operationalHistory.filter((item) => item.recordId === record.id).sort((a,b) => b.sequence - a.sequence);
  const isBeneficiary = payload.beneficiaryUserId === actor.id || record.createdByUserId === actor.id;
  const mayChangeAmount = assigned && ['accounting_review','final_review'].includes(record.status);
  const allowedDecisions = decisionsForWorkflowState(state, 'employee-advance', record.status, ['approve','reject','needs_correction']);
  const actions: Array<{decision: AdvanceDecision; label: string; tone?: string; icon: typeof CheckCircle2}> = [];
  if (record.status === 'branch_review' && assigned && allowedDecisions.includes('approve')) actions.push({decision: 'approve', label: 'تأیید و ارسال به حسابداری', icon: CheckCircle2});
  if (record.status === 'accounting_review' && assigned && allowedDecisions.includes('approve')) actions.push({decision: 'approve', label: payload.selfApprovedAt ? 'تأیید و ارسال به خزانه' : 'تأیید و ارسال به تأییدکننده اصلی', icon: CheckCircle2});
  if (record.status === 'final_review' && assigned) {if (allowedDecisions.includes('handoff') || allowedDecisions.includes('approve')) actions.push({decision: 'approve_to_treasury', label: 'تأیید و ارسال به خزانه', icon: CheckCircle2}); if (allowedDecisions.includes('return_previous')) actions.push({decision: 'accounting_recheck', label: 'ارسال مجدد به حسابداری', icon: RotateCcw});}
  if (assigned && ['branch_review','accounting_review','final_review'].includes(record.status)) {if (allowedDecisions.includes('needs_correction')) actions.push({decision: 'needs_correction', label: 'نیازمند اصلاح', icon: RotateCcw}); if (allowedDecisions.includes('reject')) actions.push({decision: 'reject', label: 'رد و بستن', tone: 'danger', icon: XCircle});}
  const decide = (decision: AdvanceDecision) => {const nextAmount = numberOnly(amount); const next = !nextAmount || BigInt(nextAmount) <= 0n ? ['مبلغ مساعده معتبر نیست.'] : []; setErrors(next); if (!next.length) void execute('advance-decision', () => service.decideEmployeeAdvance(record.id, decision, reason, nextAmount), 'تصمیم مساعده ثبت و کارتابل مرحله بعد به‌روزرسانی شد.').then((succeeded) => {if (succeeded) {setReason(''); setErrors([]);}});};
  return <RecordDialog ariaLabel={`پرونده مساعده ${record.title}`} className="advance-drawer" onClose={onClose}><header><div><span className="eyebrow">{record.trackingCode}</span><h2>{record.title}</h2><p>{stateLabel(module.workflow, record.status)}</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="drawer-body"><EmployeeAdvanceDetails state={state} record={record} revealCard={assigned || isBeneficiary || actor.roleIds.includes('role-treasury-executor-v1')}/><EmployeeAdvanceRouteStatus state={state} record={record} canAct={assigned && ['branch_review','accounting_review','final_review'].includes(record.status)}/>{record.status === 'needs_correction' && isBeneficiary && <section className="advance-correction-callout"><RotateCcw size={20}/><div><strong>این فرم نیازمند اصلاح است</strong><span>فرم را باز کنید، اطلاعات را اصلاح کنید و نسخه جدید را دوباره امضا و ارسال کنید.</span></div><button type="button" className="button button--primary button--small" onClick={onEdit}><Pencil size={16}/> اصلاح فرم</button></section>}{actions.length > 0 && <section className="workflow-box"><h3>تصمیم و ارجاع</h3><FormValidationSummary errors={errors}/>{mayChangeAmount && <label className="field"><RequiredLabel>مبلغ مورد تأیید (ریال)</RequiredLabel><input dir="ltr" inputMode="numeric" value={amount ? formatPortalAmount(amount) : ''} onChange={(event) => setAmount(numberOnly(event.target.value))}/><small>افزایش یا کاهش مجاز است؛ مبلغ قبلی و جدید با نام تغییر‌دهنده ثبت می‌شود.</small></label>}<label className="field"><OptionalLabel>توضیحات تصمیم</OptionalLabel><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="اختیاری؛ برای رد یا اصلاح بهتر است توضیح ثبت شود."/></label><div className="transition-actions">{actions.map(({decision, label, tone, icon: Icon}) => <button key={decision} type="button" className={`button ${tone === 'danger' ? 'button--danger' : 'button--primary'}`} onClick={() => decide(decision)}><Icon size={16}/>{label}<ArrowLeft size={15}/></button>)}</div></section>}<section className="history-box"><h3>گردش کامل و تاریخچه غیرقابل حذف</h3>{history.map((item) => <article key={item.id}><span/><div><strong>{item.toState ? stateLabel(module.workflow, item.toState) : item.eventType}</strong><p>{item.reason || `${item.actorName} این اقدام را ثبت کرد.`}</p><small>{formatPersianDateTime(item.occurredAt)} · {item.actorName} · نسخه {item.sequence.toLocaleString('en-US')}</small></div></article>)}</section></div><footer>{canEditAdvance(record, state) && <button className="button button--secondary" onClick={onEdit}><Pencil size={17}/> {record.status === 'needs_correction' ? 'اصلاح و ارسال مجدد' : 'ویرایش نسخه درخواست'}</button>}<button className="button button--ghost" onClick={onClose}>بستن</button></footer></RecordDialog>;
}
