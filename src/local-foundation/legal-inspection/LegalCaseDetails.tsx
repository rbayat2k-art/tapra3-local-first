import {X} from 'lucide-react';
import type {FoundationState} from '../model';
import type {FoundationExecutor} from '../OrganizationPages';
import type {LocalFoundationService} from '../service';
import {formatPersianDate,formatPersianDateTime} from '../PersianDate';
import {RecordDialog} from '../RecordDialog';
import {formatPortalAmount} from '../../utils/operationalFormat';
import type {LegalCase,LegalCaseHistory} from './model';
import {LEGAL_PERMISSIONS} from './policy';
import {LegalCaseOperationsSection} from './LegalCaseOperationsSection';

interface Props{state:FoundationState;record:LegalCase;service:LocalFoundationService;execute:FoundationExecutor;onClose:()=>void;onEdit:()=>void;onStatus:(record:LegalCase)=>void}
const statusLabel:Record<string,string>={draft:'پیش‌نویس',open:'باز',on_hold:'متوقف',closed:'بسته',void:'باطل'};
const partyLabel:Record<string,string>={complainant:'شاکی',buyer:'خریدار',payer:'پرداخت‌کننده',cardholder:'صاحب کارت',representative:'نماینده',counterparty:'طرف مقابل',other:'سایر'};
const invoiceStatus:Record<string,string>={draft:'پیش‌نویس',issued:'صادرشده',payment_review:'بررسی پرداخت',financially_cleared:'تسویه مالی',fulfilling:'در حال انجام',fulfilled:'تکمیل‌شده'};
const historyAction:Record<string,string>={created:'ایجاد پرونده',basic_updated:'ویرایش اطلاعات پایه',status_changed:'تغییر وضعیت',proceeding_created:'ثبت روند دادرسی',proceeding_closed:'بستن روند دادرسی',notice_received:'دریافت ابلاغ',notice_acknowledged:'تأیید دریافت ابلاغ',deadline_completed:'تکمیل مهلت'};
const hasPermission=(state:FoundationState,permission:string)=>state.roles.some((role)=>role.status==='active'&&role.permissions.includes(permission)&&state.activeUser.roleIds.includes(role.id));
const operationStateLabel:Record<string,string>={draft:'پیش‌نویس',active:'فعال',on_hold:'متوقف',closed:'بسته',void:'باطل',received:'دریافت‌شده',acknowledged:'تأییدشده',superseded:'جایگزین‌شده',open:'باز',completed:'تکمیل‌شده',cancelled:'لغوشده'};
const resourceKindLabel:Record<string,string>={case:'پرونده',proceeding:'روند دادرسی',notice:'ابلاغ',deadline:'مهلت',document:'سند'};
const historyNoticeLabel:Record<string,string>={hearing:'وقت رسیدگی',response_required:'نیازمند پاسخ',judgment:'رأی',execution:'اجراییه',other:'سایر'};

function historyResourceSummary(state:FoundationState,entry:LegalCaseHistory):string|undefined{
  const legal=state.legalInspection;if(!legal||!entry.resourceId)return undefined;
  if(entry.resourceKind==='proceeding')return legal.proceedings.find((item)=>item.id===entry.resourceId)?.authorityName;
  if(entry.resourceKind==='notice'){const item=legal.notices.find((notice)=>notice.id===entry.resourceId);return item?historyNoticeLabel[item.noticeType]??'ابلاغ':undefined;}
  if(entry.resourceKind==='deadline'){const item=legal.deadlines.find((deadline)=>deadline.id===entry.resourceId);return item?`سررسید ${formatPersianDate(item.dueAt)}`:undefined;}
  if(entry.resourceKind==='document')return legal.documents.find((item)=>item.id===entry.resourceId)?.displayName;
  return undefined;
}

export function LegalCaseDetails({state,record,service,execute,onClose,onEdit,onStatus}:Props){
  const legal=state.legalInspection!;const owner=legal.legalEntities.find((item)=>item.id===record.owningLegalEntityId);const links=legal.companyLinks.filter((item)=>item.caseId===record.id&&item.status==='active');const parties=legal.caseParties.filter((item)=>item.caseId===record.id&&item.status==='active');const history=legal.history.filter((item)=>item.caseId===record.id).sort((a,b)=>b.sequence-a.sequence);const invoices=(record.invoiceIds??[]).map((id)=>legal.invoiceSummaries.find((item)=>item.id===id)).filter(Boolean);
  return <RecordDialog ariaLabel={`جزئیات ${record.trackingCode}`} onClose={onClose}><header><div><span className="eyebrow">{record.trackingCode}</span><h2>{record.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="drawer-body"><div className="record-status-hero"><span className={`state-badge state-badge--${record.status==='closed'?'good':record.status==='void'?'danger':record.status==='draft'?'neutral':'progress'}`}>{statusLabel[record.status]}</span><span>نسخه {record.version.toLocaleString('fa-IR')}</span>{record.qaDatasetId&&<span>دیتاست QA</span>}</div>
    <section className="legal-detail-section"><h3>خلاصه پرونده</h3><dl className="record-facts-grid"><div><dt>نوع</dt><dd>{record.caseType}</dd></div><div><dt>شخصیت مالک</dt><dd>{owner?.displayName??'—'}</dd></div><div><dt>مسئول</dt><dd>{state.users.find((item)=>item.id===record.primaryOwnerUserId)?.name??'—'}</dd></div><div><dt>آخرین تغییر</dt><dd>{formatPersianDateTime(record.updatedAt)}</dd></div></dl></section>
    <section className="legal-detail-section"><h3>شخصیت‌های حقوقی مرتبط</h3>{links.map((link)=><p key={link.id}>{link.role==='owner'?'مالک':link.role==='affected'?'درگیر':link.role==='counterparty'?'طرف مقابل':'مالک حساب'}: {legal.legalEntities.find((item)=>item.id===link.legalEntityId)?.displayName??'—'}</p>)}</section>
    <section className="legal-detail-section"><h3>اشخاص و نقش‌ها</h3>{parties.map((link)=><p key={link.id}>{partyLabel[link.role]??link.role}: {legal.parties.find((item)=>item.id===link.partyId)?.displayName??link.displaySnapshot}</p>)}</section>
    <section className="legal-detail-section"><h3>اطلاعات بانکی مرتبط</h3><p>{record.bankSnapshotMasked??'حسابی ثبت نشده است.'}</p></section>
    <section className="legal-detail-section"><h3>ریز وضعیت فاکتورها</h3>{invoices.length?invoices.map((invoice)=><article key={invoice!.id} className="legal-invoice-row"><div><strong>{invoice!.title}</strong><code dir="ltr">{invoice!.trackingCode}</code></div><span className="state-badge state-badge--progress">{invoiceStatus[invoice!.status]??invoice!.status}</span><strong>{invoice!.amountRial?`${formatPortalAmount(invoice!.amountRial)} ریال`:'بدون مبلغ'}</strong><small>{formatPersianDateTime(invoice!.updatedAt)}</small></article>):<p className="muted">فاکتوری به این پرونده متصل نشده است.</p>}</section>
    <LegalCaseOperationsSection state={state} record={record} service={service} execute={execute}/>
    <section className="history-box"><h3>تاریخچه کامل پرونده</h3>{history.map((entry)=><History key={entry.id} state={state} entry={entry}/>)}</section></div><footer>{hasPermission(state,LEGAL_PERMISSIONS.caseEdit)&&!record.qaDatasetId&&!['closed','void'].includes(record.status)&&<button className="button button--secondary" onClick={onEdit}>ویرایش اطلاعات پایه</button>}{hasPermission(state,LEGAL_PERMISSIONS.caseEdit)&&!['closed','void'].includes(record.status)&&<button className="button button--primary" onClick={()=>onStatus(record)}>تغییر وضعیت</button>}<button className="button button--ghost" onClick={onClose}>بستن</button></footer></RecordDialog>;
}
function History({state,entry}:{state:FoundationState;entry:LegalCaseHistory}){
  const from=entry.fromStatus?statusLabel[entry.fromStatus]:entry.fromState?operationStateLabel[entry.fromState]??entry.fromState:undefined;
  const to=entry.toStatus?statusLabel[entry.toStatus]:entry.toState?operationStateLabel[entry.toState]??entry.toState:undefined;
  const resource=historyResourceSummary(state,entry);
  const resourceDetails=entry.resourceKind&&entry.resourceKind!=='case'
    ? [resourceKindLabel[entry.resourceKind]??entry.resourceKind,resource,entry.resourceVersion?`نسخه ${entry.resourceVersion.toLocaleString('fa-IR')}`:undefined].filter(Boolean).join(' · ')
    : undefined;
  return <article><span/><div><strong>{historyAction[entry.action]??entry.action}</strong><p>{from&&to?`از «${from}» به «${to}»`:to?`وضعیت «${to}»`:resourceDetails??'بدون تغییر وضعیت پرونده'}</p>{resourceDetails&&<small>{resourceDetails}</small>}<small>{entry.actorDisplayName??state.users.find((item)=>item.id===entry.effectiveUserId)?.name??'عامل ثبت‌شده'} · {formatPersianDateTime(entry.occurredAt)}</small></div></article>}
