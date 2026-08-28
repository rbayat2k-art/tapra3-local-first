import {useMemo, useState} from 'react';
import {Archive, ArrowLeft, BadgeCheck, BriefcaseBusiness, CalendarClock, CheckCircle2, CircleAlert, Eye, FileSignature, Pencil, RotateCcw, Search, UserPlus, UsersRound, X} from 'lucide-react';
import {authorizeWithActiveRole, can, operationalRecordResource} from './authorization';
import {ERP_MODULES, permissionFor, stateLabel} from './erpCatalog';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService, RecruitmentRequestInput, ReuseRecruitmentCandidateInput} from './service';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {formatPersianDate, formatPersianDateTime, PersianDateInput} from './PersianDate';
import {formatPortalAmount, toLatinDigits} from '../utils/operationalFormat';
import {resolveWorkforceRequestScope} from './salesManagementScope';
import {RecordDialog} from './RecordDialog';
import {
  hasRecruitmentCandidate,
  isReusableRecruitmentCandidate,
  matchesRecruitmentBankFilter,
  matchesRecruitmentCandidateQuery,
  recruitmentReachedInterview,
  recruitmentReuseCount,
  recruitmentSourceRecordId,
  type RecruitmentBankFilter,
} from './recruitmentCandidateBank';
import {RecruitmentCandidateProfileDialog} from './RecruitmentCandidateProfileDialog';
import {candidateDocuments} from './recruitmentCandidateProfile';
import {RecruitmentTrainingStartDialog} from './RecruitmentTrainingStartDialog';
import {ContinuityReassignmentPanel} from './ContinuityReassignmentPanel';

interface Props {
  state: FoundationState;
  service: LocalFoundationService;
  execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
}

const moduleDefinition = ERP_MODULES.find((item) => item.id === 'recruitment-case')!;
const terminal = new Set(['contracted','withdrawn','rejected','closed']);
const stages = [
  ['submitted','اعلام نیاز'],['hr_review','بررسی منابع انسانی'],['ready_to_publish','انتشار'],['candidate_review','پرونده متقاضی'],
  ['interview_scheduled','مصاحبه'],['evaluated','ارزیابی'],['offer_sent','پیشنهاد'],['ready_to_start','شروع'],['training','آموزشی'],['contracted','قراردادی'],
] as const;

const text = (record: OperationalRecord, key: string, fallback = 'ثبت نشده') => {
  const value = record.payload[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
};

function visibleToUser(record: OperationalRecord, state: FoundationState) {
  const user = state.activeUser;
  if (authorizeWithActiveRole({persona:user,roles:state.roles,allowedRoleIds:['role-recruitment-manager','role-recruitment-operator'],permission:permissionFor('recruitment-case','view'),action:'view',resource:operationalRecordResource(user,record),allowAdminWithoutRole:false}).allowed) return true;
  if (record.assigneeUserId === user.id || record.createdByUserId === user.id) return true;
  const scope = resolveWorkforceRequestScope(state, user);
  return can(user,permissionFor('recruitment-case','view')) && record.unitId === user.unitId && Boolean(record.branchUnitId && scope.branchUnitIds.includes(record.branchUnitId));
}

export function RecruitmentPage({state, service, execute}: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [bankFilter, setBankFilter] = useState<RecruitmentBankFilter>('all');
  const [selected, setSelected] = useState<OperationalRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [candidateProfile, setCandidateProfile] = useState<OperationalRecord | 'new' | null>(null);
  const [reuseCandidate, setReuseCandidate] = useState<OperationalRecord | null>(null);
  const [trainingStart, setTrainingStart] = useState<OperationalRecord | null>(null);
  const visibleRecords = useMemo(() => state.operationalRecords
    .filter((record) => record.moduleId === 'recruitment-case' && visibleToUser(record, state)), [state]);
  const records = useMemo(() => visibleRecords
    .filter((record) => status === 'all' || record.status === status)
    .filter((record) => matchesRecruitmentBankFilter(record, state.operationalHistory, bankFilter))
    .filter((record) => matchesRecruitmentCandidateQuery(record, query, state.units.find((unit)=>unit.id===record.unitId)?.name??''))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)), [visibleRecords, state.operationalHistory, state.units, query, status, bankFilter]);
  const workforceScope = resolveWorkforceRequestScope(state);
  const canCreate = can(state.activeUser, permissionFor('recruitment-case','create')) && workforceScope.branchUnitIds.length > 0;
  const canReuse = authorizeWithActiveRole({persona:state.activeUser,roles:state.roles,allowedRoleIds:['role-recruitment-manager','role-recruitment-operator'],permission:permissionFor('recruitment-case','create'),action:'create',allowAdminWithoutRole:false}).allowed;
  const canManageCandidate = (can(state.activeUser, permissionFor('recruitment-case','create')) || can(state.activeUser, permissionFor('recruitment-case','edit')))
    && authorizeWithActiveRole({persona:state.activeUser,roles:state.roles,allowedRoleIds:['role-recruitment-manager','role-recruitment-operator'],permission:permissionFor('recruitment-case','view'),action:'view',allowAdminWithoutRole:false}).allowed;
  const candidateRecords = visibleRecords.filter(hasRecruitmentCandidate);
  const activeCount = visibleRecords.filter((record) => !terminal.has(record.status)).length;
  return <div className="page-stack recruitment-page">
    <section className="page-hero">
      <div className="page-hero__title"><span className="page-icon"><UserPlus size={26}/></span><div><span className="eyebrow">منابع انسانی / بانک متقاضیان</span><h2>جذب و بانک استعداد</h2><p>پرونده متقاضی پس از مصاحبه، رد یا انصراف حذف نمی‌شود؛ سابقه برای فرصت‌های آینده قابل جست‌وجو و استفاده مجدد می‌ماند.</p></div></div>
      <div className="page-hero__actions">{canManageCandidate&&<button className="button button--secondary" onClick={()=>setCandidateProfile('new')}><FileSignature size={18}/> ثبت متقاضی و رزومه</button>}{canCreate && <button className="button button--primary" onClick={()=>setCreating(true)}><UserPlus size={18}/> اعلام نیاز نیرو</button>}</div>
    </section>

    <ContinuityReassignmentPanel state={state} records={visibleRecords} service={service} execute={execute}/>

    <section className="metric-grid metric-grid--four">
      <Metric value={candidateRecords.length} label="متقاضی در بانک" detail="بدون حذف پرونده‌های قدیمی" icon={<UsersRound/>}/>
      <Metric value={activeCount} label="در جریان" detail="تا شروع یا بستن پرونده" icon={<BriefcaseBusiness/>}/>
      <Metric value={candidateRecords.filter((record)=>recruitmentReachedInterview(record,state.operationalHistory)).length} label="دارای سابقه مصاحبه" detail="حتی اگر مرحله فعلی تغییر کرده" icon={<CalendarClock/>}/>
      <Metric value={candidateRecords.filter((record)=>['training','contracted'].includes(record.status)).length} label="شروع همکاری" detail="آموزشی یا قراردادی" icon={<BadgeCheck/>}/>
    </section>

    <section className="data-card recruitment-table-card">
      <div className="recruitment-bank-filters" role="group" aria-label="دسته‌بندی بانک متقاضیان">
        {([
          ['all','همه پرونده‌ها'],['interviewed','مصاحبه‌شده‌ها'],['reusable','قابل استفاده مجدد'],['rejected','ردشده‌ها'],
          ['withdrawn','انصرافی‌ها'],['training','پرسنل آموزشی'],['contracted','قراردادی‌ها'],
        ] as Array<[RecruitmentBankFilter,string]>).map(([id,label])=><button type="button" key={id} className={`button button--compact ${bankFilter===id?'button--primary':'button--ghost'}`} aria-pressed={bankFilter===id} onClick={()=>setBankFilter(id)}>{label}</button>)}
      </div>
      <div className="table-toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="نام، موبایل، کد ملی، کد پرونده، سمت یا واحد…"/></label>
        <select value={status} onChange={(event)=>setStatus(event.target.value)} aria-label="فیلتر وضعیت"><option value="all">همه وضعیت‌ها</option>{Object.entries(moduleDefinition.workflow.stateLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
      </div>
      <div className="table-scroll"><table className="recruitment-table"><colgroup><col className="recruitment-col-index"/><col className="recruitment-col-record"/><col className="recruitment-col-unit"/><col className="recruitment-col-state"/><col className="recruitment-col-waiting"/><col className="recruitment-col-scenario"/><col className="recruitment-col-action"/></colgroup><thead><tr><th>ردیف</th><th>پرونده / متقاضی</th><th>واحد</th><th>مرحله فعلی</th><th>منتظر اقدام چه کسی</th><th>سناریوی آزمون</th><th>اقدام</th></tr></thead><tbody>
        {records.map((record,index)=><tr key={record.id}><td>{(index+1).toLocaleString('fa-IR')}</td><td><strong>{text(record,'candidateName')}</strong><small>{record.trackingCode} · {text(record,'candidateMobile','بدون موبایل')} · {text(record,'positionTitle',record.title)}</small></td><td>{state.units.find((unit)=>unit.id===record.unitId)?.name??'—'}</td><td><span className="state-badge">{stateLabel(moduleDefinition.workflow,record.status)}</span>{recruitmentReachedInterview(record,state.operationalHistory)&&<small className="recruitment-history-badge">سابقه مصاحبه</small>}</td><td>{text(record,'currentWaitingFor')}</td><td><span>{text(record,'qaScenario','پرونده عملیاتی')}</span>{recruitmentReuseCount(record.id,visibleRecords)>0&&<small>{recruitmentReuseCount(record.id,visibleRecords).toLocaleString('fa-IR')} استفاده مجدد</small>}</td><td><div className="recruitment-row-actions"><button className="icon-button" title="مشاهده پرونده کامل" aria-label={`مشاهده پرونده ${text(record,'candidateName')}`} onClick={()=>setSelected(record)}><Eye size={18}/></button>{canReuse&&isReusableRecruitmentCandidate(record)&&<button className="icon-button" title="استفاده برای فرصت جدید" aria-label={`استفاده مجدد از پرونده ${text(record,'candidateName')}`} onClick={()=>setReuseCandidate(record)}><RotateCcw size={18}/></button>}</div></td></tr>)}
        {!records.length&&<tr><td colSpan={7}><div className="empty-state"><CircleAlert/><strong>پرونده‌ای با این فیلتر پیدا نشد.</strong></div></td></tr>}
      </tbody></table></div>
    </section>
    {selected && <RecruitmentDrawer key={`${selected.id}-${selected.version}`} record={state.operationalRecords.find((item)=>item.id===selected.id)??selected} state={state} service={service} execute={execute} canReuse={canReuse} canEditProfile={canManageCandidate&&hasRecruitmentCandidate(selected)} onEditProfile={(record)=>{setSelected(null);setCandidateProfile(record);}} onReuse={(record)=>{setSelected(null);setReuseCandidate(record);}} onStartTraining={(record)=>{setSelected(null);setTrainingStart(record);}} onClose={()=>setSelected(null)}/>}
    {creating && <RecruitmentRequestDialog state={state} service={service} execute={execute} onClose={()=>setCreating(false)}/>} 
    {candidateProfile&&<RecruitmentCandidateProfileDialog state={state} service={service} execute={execute} mode={candidateProfile==='new'?'hr-create':'hr-edit'} record={candidateProfile==='new'?undefined:candidateProfile} onClose={()=>setCandidateProfile(null)}/>}
    {reuseCandidate && <ReuseRecruitmentCandidateDialog source={reuseCandidate} state={state} service={service} execute={execute} onClose={()=>setReuseCandidate(null)}/>}
    {trainingStart && <RecruitmentTrainingStartDialog record={state.operationalRecords.find((item)=>item.id===trainingStart.id)??trainingStart} state={state} service={service} execute={execute} onClose={()=>setTrainingStart(null)}/>}
  </div>;
}

function Metric({value,label,detail,icon}:{value:number;label:string;detail:string;icon:React.ReactNode}) {
  return <article className="metric-card"><span className="metric-icon metric-icon--violet">{icon}</span><div><strong>{value.toLocaleString('fa-IR')}</strong><b>{label}</b><small>{detail}</small></div></article>;
}

function RecruitmentDrawer({record,state,service,execute,canReuse,canEditProfile,onEditProfile,onReuse,onStartTraining,onClose}: {record:OperationalRecord;state:FoundationState;service:LocalFoundationService;execute:Props['execute'];canReuse:boolean;canEditProfile:boolean;onEditProfile:(record:OperationalRecord)=>void;onReuse:(record:OperationalRecord)=>void;onStartTraining:(record:OperationalRecord)=>void;onClose:()=>void}) {
  const [reason,setReason]=useState('');
  const [errors,setErrors]=useState<string[]>([]);
  const history=state.operationalHistory.filter((item)=>item.recordId===record.id).sort((a,b)=>a.sequence-b.sequence);
  const transitions=moduleDefinition.workflow.transitions.filter((transition)=>transition.from.includes(record.status) && can(state.activeUser,transition.permission));
  const currentIndex=Math.max(0,stages.findIndex(([id])=>id===record.status));
  const sourceRecordId=recruitmentSourceRecordId(record);
  const sourceRecord=sourceRecordId?state.operationalRecords.find((item)=>item.id===sourceRecordId):undefined;
  const reusedRecords=state.operationalRecords.filter((item)=>item.payload.sourceCandidateRecordId===record.id);
  const documents=candidateDocuments(record);
  const act=(transition:typeof transitions[number])=>{
    if(transition.to==='training'){onStartTraining(record);return;}
    const next=transition.reasonRequired?validateRequired([{label:'دلیل تصمیم',value:reason}]):[]; setErrors(next); if(next.length)return;
    void execute('recruitment-transition',()=>service.transitionRecruitmentCase(record.id,transition.id,reason),`پرونده به «${transition.label}» منتقل شد.`).then((ok)=>{if(ok){setReason('');setErrors([]);}});
  };
  return <RecordDialog ariaLabel={`پرونده استخدام ${record.title}`} className="recruitment-drawer" onClose={onClose}><header><div><span className="eyebrow">{record.trackingCode} · نسخه {record.version.toLocaleString('fa-IR')}</span><h2>{record.title}</h2><p>منتظر اقدام: <strong>{text(record,'currentWaitingFor')}</strong></p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X/></button></header><div className="drawer-body">
    <section className="recruitment-progress" aria-label="مسیر پرونده">{stages.map(([id,label],index)=><div key={id} className={`${index<currentIndex?'done ':''}${id===record.status?'current':''}`}><span>{index<currentIndex?<CheckCircle2/>:(index+1).toLocaleString('fa-IR')}</span><small>{label}</small></div>)}</section>
    <section className="record-facts recruitment-facts"><Fact label="متقاضی" value={text(record,'candidateName')}/><Fact label="سمت موردنیاز" value={text(record,'positionTitle','بر اساس عنوان پرونده')}/><Fact label="نوع همکاری" value={text(record,'employmentType')}/><Fact label="تعداد" value={text(record,'requestedHeadcount','۱')}/><Fact label="تاریخ نیاز/شروع" value={record.dueAt?formatPersianDate(record.dueAt):text(record,'startDate')}/><Fact label="شعبه" value={state.units.find((unit)=>unit.id===record.branchUnitId)?.name??'—'}/></section>
    <section className="detail-section"><h3>هویت، تماس و پرونده متقاضی</h3><div className="detail-grid"><Fact label="موبایل" value={text(record,'candidateMobile')}/><Fact label="کد ملی" value={text(record,'candidateNationalId')}/><Fact label="حساب متقاضی/پرسنل" value={text(record,'candidateAccount')}/><Fact label="کد پرسنلی" value={text(record,'personnelCode')}/><Fact label="رزومه" value={text(record,'resumeStatus')}/><Fact label="کانال تماس" value={text(record,'contactChannel')}/></div></section>
    {hasRecruitmentCandidate(record)&&<section className="detail-section"><h3>رزومه، تحصیلات و مدارک</h3><div className="detail-grid"><Fact label="مقطع تحصیلی" value={text(record,'educationLevel')}/><Fact label="رشته تحصیلی" value={text(record,'educationField')}/><Fact label="سابقه کار" value={`${text(record,'workExperienceYears','۰')} سال`}/><Fact label="آخرین شغل" value={text(record,'lastJobTitle')}/><Fact label="مهارت‌ها" value={text(record,'candidateSkills')}/><Fact label="فایل‌های پرونده" value={documents.length?`${documents.filter((item)=>item.status==='active').length.toLocaleString('fa-IR')} فایل فعال`:'بدون فایل؛ فرم رزومه ثبت شده است'}/></div>{text(record,'candidateAbout','')&&<p className="candidate-profile-about">{text(record,'candidateAbout','')}</p>}{documents.length>0&&<div className="candidate-document-chips">{documents.map((item)=><span key={item.id}>{item.label} · {item.status==='replaced'?'نسخه قبلی':'فعال'}</span>)}</div>}</section>}
    <section className="detail-section"><h3>مصاحبه، پیشنهاد و شروع همکاری</h3><div className="detail-grid"><Fact label="زمان مصاحبه" value={`${text(record,'interviewDate','—')} ${text(record,'interviewTime','')}`}/><Fact label="دعوت پیامکی" value={text(record,'invitationSmsStatus')}/><Fact label="دعوت تلفنی" value={text(record,'invitationPhoneStatus')}/><Fact label="وضعیت پیشنهاد" value={text(record,'offerStatus')}/><Fact label="سرپرست" value={text(record,'supervisor')}/><Fact label="وضعیت پرسنلی" value={text(record,'personnelStatus')}/></div></section>
    {(sourceRecord||reusedRecords.length>0||text(record,'lastInterviewOutcome','')||Array.isArray(record.payload.talentTags))&&<section className="detail-section recruitment-talent-history"><h3><Archive size={19}/> سابقه بانک استعداد</h3><div className="detail-grid"><Fact label="نتیجه آخرین مصاحبه" value={text(record,'lastInterviewOutcome','ثبت نشده')}/><Fact label="پرونده مبنا" value={sourceRecord?`${sourceRecord.trackingCode} · ${text(sourceRecord,'candidateName')}`:'اولین پرونده این متقاضی'}/><Fact label="فرصت‌های بعدی" value={reusedRecords.length?reusedRecords.map((item)=>item.trackingCode).join('، '):'هنوز استفاده مجدد نشده'}/></div>{Array.isArray(record.payload.talentTags)&&<div className="recruitment-talent-tags">{record.payload.talentTags.map((tag)=><span key={String(tag)}>{String(tag)}</span>)}</div>}</section>}
    <section className="detail-section"><h3><FileSignature size={19}/> امضاها و سوابق غیرقابل حذف</h3><p>{Array.isArray(record.payload.digitalSignatures)&&record.payload.digitalSignatures.length?`${record.payload.digitalSignatures.length.toLocaleString('fa-IR')} امضای سیستمی روی نسخه‌های پرونده ثبت شده است.`:'هنوز امضای سیستمی ثبت نشده است.'}</p>{history.map((item)=><article className="timeline-row" key={item.id}><span/><div><strong>{item.actorName} · {item.toState?stateLabel(moduleDefinition.workflow,item.toState):'ایجاد پرونده'}</strong><p>{item.reason||'اقدام سیستمی ثبت شد.'}</p><small>{formatPersianDateTime(item.occurredAt)} · رخداد {item.sequence.toLocaleString('fa-IR')}</small></div></article>)}</section>
    <section className="workflow-box"><h3>اقدام مجاز این نقش</h3><FormValidationSummary errors={errors}/>{transitions.some((item)=>item.reasonRequired)&&<label className="field"><OptionalLabel>توضیح یا دلیل تصمیم (در اقدامات مشخص الزامی می‌شود)</OptionalLabel><textarea value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="توضیح تصمیم و تحویل مرحله…"/></label>}<div className="transition-actions">{transitions.map((transition)=><button key={transition.id} className={`button ${['rejected','withdrawn','needs_correction'].includes(transition.to)?'button--danger':'button--primary'}`} onClick={()=>act(transition)}>{transition.label}<ArrowLeft size={16}/></button>)}{!transitions.length&&<span className="quiet-state">این پرونده اکنون منتظر نقش دیگری است یا چرخه آن پایان یافته است.</span>}</div></section>
  </div><footer><button className="button button--ghost" onClick={onClose}>بستن</button>{canEditProfile&&<button className="button button--secondary" onClick={()=>onEditProfile(record)}><Pencil size={17}/> ویرایش رزومه و مدارک</button>}{canReuse&&isReusableRecruitmentCandidate(record)&&<button className="button button--primary" onClick={()=>onReuse(record)}><RotateCcw size={17}/> استفاده برای فرصت جدید</button>}</footer></RecordDialog>;
}

function Fact({label,value}:{label:string;value:string}) {return <div className="fact"><small>{label}</small><strong>{value||'ثبت نشده'}</strong></div>}

function RecruitmentRequestDialog({state,service,execute,onClose}: {state:FoundationState;service:LocalFoundationService;execute:Props['execute'];onClose:()=>void}) {
  const isHr=authorizeWithActiveRole({persona:state.activeUser,roles:state.roles,allowedRoleIds:['role-recruitment-manager'],permission:permissionFor('recruitment-case','create'),action:'create',allowAdminWithoutRole:false}).allowed;
  const managerialScope=useMemo(()=>resolveWorkforceRequestScope(state),[state]);
  const branchOptions=useMemo(()=>state.units.filter((unit)=>unit.status==='active'&&unit.type==='شعبه'&&managerialScope.branchUnitIds.includes(unit.id)),[state.units,managerialScope.branchUnitIds]);
  const initialBranchId=isHr?'':branchOptions.length===1?branchOptions[0].id:'';
  const [form,setForm]=useState<RecruitmentRequestInput>({title:'',description:'',unitId:isHr?'':state.activeUser.unitId??'',branchUnitId:initialBranchId,positionTitle:'',requestedHeadcount:'1',employmentType:'تمام‌وقت',neededDate:'',salaryRangeRial:'',requestReason:'',proxyReason:''});
  const [errors,setErrors]=useState<string[]>([]);
  const set=<K extends keyof RecruitmentRequestInput>(key:K,value:RecruitmentRequestInput[K])=>setForm((current)=>({...current,[key]:value}));
  const selectedStructures=managerialScope.source==='active_sales_structure'&&form.branchUnitId
    ? state.salesStructures.filter((structure)=>structure.status==='active'&&structure.branchUnitId===form.branchUnitId&&managerialScope.structureIds.includes(structure.id))
    : [];
  const selectedSeniorNames=[...new Set(selectedStructures.map((structure)=>state.personnel.find((person)=>person.id===structure.seniorSupervisorPersonnelId)).filter(Boolean).map((person)=>`${person!.firstName} ${person!.lastName}`))];
  const submit=()=>{const next=validateRequired([{label:'عنوان نیاز',value:form.title},{label:'واحد',value:form.unitId},{label:'شعبه محل استقرار',value:form.branchUnitId},{label:'سمت موردنیاز',value:form.positionTitle},{label:'تعداد',value:form.requestedHeadcount},{label:'نوع همکاری',value:form.employmentType},{label:'دلیل نیاز',value:form.requestReason},...(isHr&&form.unitId!==state.activeUser.unitId?[{label:'دلیل ثبت نیابتی',value:form.proxyReason}]:[])]);setErrors(next);if(next.length)return;void execute('recruitment-create',()=>service.createRecruitmentRequest(form),'اعلام نیاز بدون پیش‌نویس ثبت و به کارتابل جذب ارسال شد.').then((ok)=>{if(ok)onClose();});};
  const grouped=(value:string)=>value?formatPortalAmount(value):'';
  return <div className="modal-scrim"><form className="dialog recruitment-request-dialog" onSubmit={(event)=>{event.preventDefault();submit();}} noValidate><header><div><span className="eyebrow">ثبت مستقیم و عملیاتی</span><h2>اعلام نیاز نیروی جدید</h2><p>با ثبت فرم، پرونده بدون وضعیت پیش‌نویس مستقیماً به صف منابع انسانی می‌رود.</p></div><button type="button" className="icon-button" onClick={onClose}><X/></button></header><div className="dialog-body form-grid"><FormValidationSummary errors={errors}/>
    <label className="field field--wide"><RequiredLabel>عنوان نیاز</RequiredLabel><input value={form.title} onChange={(event)=>set('title',event.target.value)} placeholder="مثلاً جذب دو فروشنده برای شعبه سعادت‌آباد"/></label>
    <label className="field"><RequiredLabel>واحد سازمانی</RequiredLabel><select disabled={!isHr} value={form.unitId} onChange={(event)=>set('unitId',event.target.value)}><option value="">انتخاب واحد…</option>{state.units.filter((unit)=>unit.status==='active'&&unit.type!=='شعبه').map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
    <label className="field"><RequiredLabel>شعبه محل استقرار نیروی جدید</RequiredLabel><select disabled={!isHr&&branchOptions.length===1} value={form.branchUnitId??''} onChange={(event)=>set('branchUnitId',event.target.value)}><option value="">انتخاب شعبه…</option>{branchOptions.map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
    {!isHr&&<div className="recruitment-scope-note field--wide"><strong>حوزه مدیریتی فعال شما</strong><span>{branchOptions.length.toLocaleString('fa-IR')} شعبه · {managerialScope.structureIds.length.toLocaleString('fa-IR')} مسیر فروش · {managerialScope.seniorSupervisorPersonnelIds.length.toLocaleString('fa-IR')} سرپرست ارشد</span><small>فقط مسیرهای فعال مبنای این فهرست هستند؛ نقش کاربری به‌تنهایی شعبه‌ای را مجاز نمی‌کند.</small>{form.branchUnitId&&selectedStructures.length>0&&<small>مسیرهای شعبه انتخاب‌شده: {selectedStructures.length.toLocaleString('fa-IR')} مسیر{selectedSeniorNames.length?` · سرپرست ارشد: ${selectedSeniorNames.join('، ')}`:''}</small>}</div>}
    <label className="field"><RequiredLabel>سمت موردنیاز</RequiredLabel><input value={form.positionTitle} onChange={(event)=>set('positionTitle',event.target.value)}/></label>
    <label className="field"><RequiredLabel>تعداد نیرو</RequiredLabel><input inputMode="numeric" value={form.requestedHeadcount} onChange={(event)=>set('requestedHeadcount',toLatinDigits(event.target.value).replace(/\D/g,''))}/></label>
    <label className="field"><RequiredLabel>نوع همکاری</RequiredLabel><select value={form.employmentType} onChange={(event)=>set('employmentType',event.target.value)}><option>تمام‌وقت</option><option>پاره‌وقت</option><option>آموزشی</option><option>پروژه‌ای</option></select></label>
    <label className="field"><OptionalLabel>تاریخ موردنیاز</OptionalLabel><PersianDateInput value={form.neededDate} onChange={(value)=>set('neededDate',value)} ariaLabel="تاریخ موردنیاز شمسی"/></label>
    <label className="field"><OptionalLabel>محدوده حقوق (ریال)</OptionalLabel><input dir="ltr" value={grouped(form.salaryRangeRial??'')} onChange={(event)=>set('salaryRangeRial',toLatinDigits(event.target.value).replace(/,/g,''))}/></label>
    <label className="field field--wide"><RequiredLabel>دلیل و شرح نیاز</RequiredLabel><textarea value={form.requestReason} onChange={(event)=>set('requestReason',event.target.value)} placeholder="علت نیاز، وظایف اصلی و زمان مورد انتظار…"/></label>
    <label className="field field--wide"><OptionalLabel>توضیحات تکمیلی</OptionalLabel><textarea value={form.description} onChange={(event)=>set('description',event.target.value)}/></label>
    {isHr&&form.unitId!==state.activeUser.unitId&&<label className="field field--wide"><RequiredLabel>دلیل ثبت نیابتی از طرف مدیر واحد</RequiredLabel><textarea value={form.proxyReason} onChange={(event)=>set('proxyReason',event.target.value)} placeholder="مثلاً درخواست ثبت‌شده در جلسه حضوری با مدیر واحد…"/></label>}
  </div><footer><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary">ثبت و ارسال به منابع انسانی</button></footer></form></div>;
}

function ReuseRecruitmentCandidateDialog({source,state,service,execute,onClose}: {source:OperationalRecord;state:FoundationState;service:LocalFoundationService;execute:Props['execute'];onClose:()=>void}) {
  const defaultUnitId=source.unitId??'';
  const defaultBranchId=source.branchUnitId??'';
  const candidateName=text(source,'candidateName');
  const [form,setForm]=useState<ReuseRecruitmentCandidateInput>({
    sourceRecordId:source.id,
    title:`بررسی مجدد ${candidateName} برای فرصت جدید`,
    description:`ایجاد فرصت جدید با حفظ ارتباط به پرونده ${source.trackingCode}`,
    unitId:defaultUnitId,
    branchUnitId:defaultBranchId,
    positionTitle:text(source,'positionTitle',''),
    employmentType:text(source,'employmentType','تمام‌وقت'),
    neededDate:'',
    requestReason:'',
  });
  const [errors,setErrors]=useState<string[]>([]);
  const [saving,setSaving]=useState(false);
  const set=<K extends keyof ReuseRecruitmentCandidateInput>(key:K,value:ReuseRecruitmentCandidateInput[K])=>setForm((current)=>({...current,[key]:value}));
  const submit=()=>{
    const next=validateRequired([
      {label:'عنوان فرصت جدید',value:form.title},{label:'واحد',value:form.unitId},{label:'شعبه',value:form.branchUnitId},
      {label:'سمت',value:form.positionTitle},{label:'نوع همکاری',value:form.employmentType},{label:'دلیل استفاده مجدد',value:form.requestReason},
    ]);
    setErrors(next);if(next.length)return;
    setSaving(true);
    void execute('recruitment-candidate-reuse',()=>service.reuseRecruitmentCandidate(form),`فرصت جدید برای «${candidateName}» ساخته و پرونده قبلی بدون تغییر حفظ شد.`).then((ok)=>{setSaving(false);if(ok)onClose();});
  };
  return <RecordDialog ariaLabel={`استفاده مجدد از پرونده ${candidateName}`} className="recruitment-request-dialog" onClose={saving?()=>undefined:onClose}>
    <header><div><span className="eyebrow">بانک متقاضیان · {source.trackingCode}</span><h2>استفاده برای فرصت جدید</h2><p>پرونده قدیمی دست‌نخورده می‌ماند و یک پرونده جدید با پیوند قابل‌پیگیری ساخته می‌شود.</p></div><button type="button" className="icon-button" disabled={saving} onClick={onClose} aria-label="بستن"><X/></button></header>
    <div className="drawer-body form-grid"><FormValidationSummary errors={errors}/>
      <div className="recruitment-reuse-source field--wide"><strong>{candidateName}</strong><span>{text(source,'candidateMobile','بدون موبایل')} · {text(source,'candidateNationalId','بدون کد ملی')}</span><small>نتیجه قبلی: {text(source,'lastInterviewOutcome',stateLabel(moduleDefinition.workflow,source.status))}</small></div>
      <label className="field field--wide"><RequiredLabel>عنوان فرصت جدید</RequiredLabel><input disabled={saving} value={form.title} onChange={(event)=>set('title',event.target.value)}/></label>
      <label className="field"><RequiredLabel>واحد مقصد</RequiredLabel><select disabled={saving} value={form.unitId} onChange={(event)=>set('unitId',event.target.value)}><option value="">انتخاب واحد…</option>{state.units.filter((unit)=>unit.status==='active'&&unit.type!=='شعبه').map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label className="field"><RequiredLabel>شعبه مقصد</RequiredLabel><select disabled={saving} value={form.branchUnitId} onChange={(event)=>set('branchUnitId',event.target.value)}><option value="">انتخاب شعبه…</option>{state.units.filter((unit)=>unit.status==='active'&&unit.type==='شعبه').map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label className="field"><RequiredLabel>سمت جدید</RequiredLabel><input disabled={saving} value={form.positionTitle} onChange={(event)=>set('positionTitle',event.target.value)}/></label>
      <label className="field"><RequiredLabel>نوع همکاری</RequiredLabel><select disabled={saving} value={form.employmentType} onChange={(event)=>set('employmentType',event.target.value)}><option>تمام‌وقت</option><option>پاره‌وقت</option><option>آموزشی</option><option>پروژه‌ای</option></select></label>
      <label className="field"><OptionalLabel>تاریخ موردنیاز</OptionalLabel><PersianDateInput disabled={saving} value={form.neededDate} onChange={(value)=>set('neededDate',value)} ariaLabel="تاریخ موردنیاز فرصت جدید"/></label>
      <label className="field field--wide"><RequiredLabel>دلیل استفاده مجدد</RequiredLabel><textarea disabled={saving} value={form.requestReason} onChange={(event)=>set('requestReason',event.target.value)} placeholder="مثلاً سابقه مناسب ارتباط با مشتری و نیاز جدید واحد پشتیبانی…"/></label>
      <label className="field field--wide"><OptionalLabel>توضیحات تکمیلی</OptionalLabel><textarea disabled={saving} value={form.description} onChange={(event)=>set('description',event.target.value)}/></label>
    </div>
    <footer><button type="button" className="button button--ghost" disabled={saving} onClick={onClose}>انصراف</button><button type="button" className="button button--primary" disabled={saving} onClick={submit}>{saving?'در حال ثبت…':'ساخت پرونده جدید'}</button></footer>
  </RecordDialog>;
}
