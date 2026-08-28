import {useRef,useState} from 'react';
import {UserRoundCheck} from 'lucide-react';
import {can} from './authorization';
import {ERP_MODULES,permissionFor} from './erpCatalog';
import type {FoundationState,OperationalRecord,WorkContinuityResponsibilityKind} from './model';
import type {LocalFoundationService} from './service';
import {RequiredLabel} from './FormValidation';
import {userDisplayLabel} from './personIdentity';
import {canResolveContinuityReassignment,continuityReassignmentKinds,type WorkContinuitySnapshot} from './workContinuity';

type Execute=(label:string,work:()=>Promise<FoundationState>,success:string)=>Promise<boolean>;
type Choice={userId:string;reason:string};

const kindLabel:Record<WorkContinuityResponsibilityKind,string>={
  workflow_approval_voter:'رأی‌دهنده مرحله تأیید',
  direct_report:'مدیر مستقیم',personnel_manager:'مدیر پرسنلی',sales_supervisor:'سرپرست فروش',unit_manager:'مدیر واحد',unit_acting_manager:'سرپرست موقت واحد',project_owner:'مالک پروژه',project_member:'عضو پروژه',project_task_assignee:'مسئول کار پروژه',chat_owner:'مالک گفت‌وگو',chat_admin:'مدیر گفت‌وگو',chat_member:'عضو گفت‌وگو',letter_assignee:'مسئول نامه',letter_recipient:'گیرنده نامه',letter_reviewer:'بازبین نامه',recruitment_assignee:'مسئول جذب',recruitment_correction_recipient:'مسئول اصلاح جذب',workflow_assignee:'مسئول مرحله',workflow_correction_recipient:'مسئول اصلاح',treasury_executor:'مجری خزانه',offboarding_assignee:'مسئول خروج',
};

export function ContinuityReassignmentPanel({state,records,service,execute}:{state:FoundationState;records:OperationalRecord[];service:LocalFoundationService;execute:Execute}){
  const [choices,setChoices]=useState<Record<string,Choice>>({});
  const commands=useRef<Record<string,{id:string;fingerprint:string}>>({});
  const busy=useRef(new Set<string>());
  // Raw electorates are intentionally not exposed by FoundationState. The
  // service-side continuity preview reads the authoritative approval rounds.
  const snapshot:WorkContinuitySnapshot={users:state.users,personnel:state.personnel,positions:state.positions,units:state.units,roles:state.roles,workflows:state.workflows,workflowVersions:state.workflowVersions,records:state.operationalRecords};
  const rows=records.flatMap((record)=>{
    const module=ERP_MODULES.find((item)=>item.id===record.moduleId);
    if(!module||record.payload.needsReassignment!==true||!can(state.activeUser,permissionFor(module.id,'manage')))return [];
    return continuityReassignmentKinds(record).map((kind)=>({record,kind,key:`${record.id}:${kind}`}));
  });
  if(!rows.length)return null;
  const resolve=(record:OperationalRecord,kind:WorkContinuityResponsibilityKind,key:string)=>{
    const choice=choices[key];if(!choice?.userId||choice.reason.trim().length<3||busy.current.has(key))return;
    const fingerprint=JSON.stringify({recordId:record.id,kind,version:record.version,...choice});const existing=commands.current[key];
    if(!existing||existing.fingerprint!==fingerprint)commands.current[key]={id:`ui-continuity-repair:${crypto.randomUUID()}`,fingerprint};
    busy.current.add(key);void execute('continuity-reassignment',()=>service.resolveContinuityReassignment(record.moduleId,record.id,kind,choice.userId,record.version,choice.reason,commands.current[key].id),'مسئول جدید این بخش تعیین شد.')
      .then((ok)=>{if(ok){delete commands.current[key];setChoices((current)=>{const next={...current};delete next[key];return next;});}})
      .finally(()=>busy.current.delete(key));
  };
  return <section className="workflow-box" aria-label="صف رفع توقف تخصیص"><h3>نیازمند تعیین مسئول جدید</h3><p className="quiet-state">هر مسئولیت به‌صورت مستقل و فقط به کاربر واجد شرایط همان مرحله واگذار می‌شود.</p><div className="continuity-list">{rows.map(({record,kind,key})=>{const choice=choices[key]??{userId:'',reason:''};const candidates=state.users.filter((user)=>canResolveContinuityReassignment(snapshot,record,user,kind));return <article key={key}><div><strong>{record.title}</strong><small>{kindLabel[kind]} · {record.trackingCode} · نسخه {record.version.toLocaleString('en-US')}</small></div><label className="field"><RequiredLabel>جانشین واجد شرایط</RequiredLabel><select value={choice.userId} onChange={(event)=>setChoices((current)=>({...current,[key]:{...choice,userId:event.target.value}}))}><option value="">انتخاب کنید…</option>{candidates.map((user)=><option key={user.id} value={user.id}>{userDisplayLabel(user,state)}</option>)}</select></label><label className="field"><RequiredLabel>دلیل تخصیص</RequiredLabel><input value={choice.reason} onChange={(event)=>setChoices((current)=>({...current,[key]:{...choice,reason:event.target.value}}))}/></label><button className="button button--primary button--small" disabled={!choice.userId||choice.reason.trim().length<3||busy.current.has(key)} onClick={()=>resolve(record,kind,key)}><UserRoundCheck size={16}/> رفع توقف این مسئولیت</button></article>;})}</div></section>;
}
