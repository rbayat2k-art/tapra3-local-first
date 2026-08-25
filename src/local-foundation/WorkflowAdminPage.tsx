import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, CircleHelp, GitBranch, LockKeyhole, Pencil, Plus, Search, ShieldCheck, Trash2, Workflow, X} from 'lucide-react';
import type {
  FoundationState,
  WorkflowApprovalStageDefinition,
  WorkflowDefinition,
  WorkflowRouteVariantDefinition,
  WorkflowStageAssignmentMode,
  WorkflowStageDecision,
  WorkflowStageScope,
} from './model';
import type {LocalFoundationService} from './service';
import {ERP_MODULES} from './erpCatalog';
import {approvalStagesFor, assignmentModeForStage, defaultApprovalStages, validateWorkflowPolicy} from './workflowPolicy';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {userDisplayLabel} from './personIdentity';

type Execute = (label:string, work:()=>Promise<FoundationState>, success:string)=>Promise<boolean>;
interface Props {state:FoundationState;execute:Execute;service?:LocalFoundationService}

const queueLabels:Record<string,string>={owner:'مالک پرونده',assignee:'یک کاربر مشخص',unit:'کارتابل مشترک واحد',company:'کارتابل مشترک شرکت'};
const queueDescriptions:Record<string,string>={
  owner:'پرونده همیشه در کارتابل مالک یا ثبت‌کننده همان پرونده قرار می‌گیرد.',
  assignee:'هنگام ارجاع، یک کاربر مشخص انتخاب می‌شود و فقط همان شخص مسئول اقدام است.',
  unit:'پرونده در کارتابل مشترک واحد سازمانی قرار می‌گیرد و افراد مجاز آن واحد می‌توانند اقدام کنند.',
  company:'پرونده در کارتابل مشترک کل شرکت قرار می‌گیرد و همه نقش‌های مجاز شرکت آن را می‌بینند.',
};
const scopeLabels:Record<WorkflowStageScope,string>={COMPANY:'کل شرکت',UNIT:'واحد سازمانی',BRANCH:'شعبه',SELF:'خود کاربر'};
const assignmentModeLabels:Record<WorkflowStageAssignmentMode,string>={role_queue:'یکی از کاربران دارای نقش',specific_user:'یک کاربر مشخص',branch_manager:'مدیر ثبت‌شده همان شعبه'};
const decisionLabels:Record<WorkflowStageDecision,string>={approve:'تأیید',reject:'رد',needs_correction:'نیازمند اصلاح',return_previous:'بازگشت به مرحله قبل',handoff:'ارجاع به مرحله بعد'};
const stageTitleLabels:Record<string,string>={branch_review:'بررسی مدیر شعبه',accounting_review:'بررسی حسابداری',final_review:'تأیید نهایی',sent_to_treasury:'ارسال به خزانه'};
const decisions=Object.keys(decisionLabels) as WorkflowStageDecision[];
const hasLatinText=(value:string)=>/[A-Za-z]/.test(value);
const persianNumber=(value:number)=>value.toLocaleString('fa-IR');
const moduleTitle=(moduleId:string)=>ERP_MODULES.find((item)=>item.id===moduleId)?.title??'فرایند سازمانی';
const workflowTitle=(workflow:WorkflowDefinition)=>hasLatinText(workflow.title)?`گردش‌کار ${moduleTitle(workflow.moduleId)}`:workflow.title;
const approvalPolicyTitle=(workflow:WorkflowDefinition)=>workflow.approvalPolicyId&&!hasLatinText(workflow.approvalPolicyId)?workflow.approvalPolicyId:`سیاست تأیید ${moduleTitle(workflow.moduleId)}`;
const stageDisplayTitle=(workflow:WorkflowDefinition,stage:WorkflowApprovalStageDefinition)=>stageTitleLabels[stage.title]??(stage.title.trim()||workflow.stateLabels[stage.stateId]||'مرحله بدون عنوان');
const cloneStages=(stages:WorkflowApprovalStageDefinition[])=>stages.map((stage)=>({...stage,roleIds:[...stage.roleIds],decisions:[...stage.decisions]}));
const newStage=(workflow:WorkflowDefinition,index:number):WorkflowApprovalStageDefinition=>({
  id:`${workflow.moduleId}-stage-${crypto.randomUUID()}`,
  title:'مرحله جدید',
  stateId:Object.keys(workflow.stateLabels)[index]??Object.keys(workflow.stateLabels)[0]??workflow.initialState,
  roleIds:[],scope:'COMPANY',decisions:['approve'],required:true,allowSelfApproval:false,
  assignmentMode:'role_queue',
});

export function WorkflowAdminPage({state,execute,service}:Props){
  const [selected,setSelected]=useState(state.workflows[0]?.moduleId??'');
  const [editing,setEditing]=useState(false);
  const [query,setQuery]=useState('');
  const workflow=state.workflows.find((item)=>item.moduleId===selected)??state.workflows[0];
  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('fa-IR');
    return q?state.workflows.filter((item)=>`${item.title} ${item.moduleId} ${item.assignmentPolicy} ${item.approvalPolicyId??''}`.toLocaleLowerCase('fa-IR').includes(q)):state.workflows;
  },[query,state.workflows]);
  useEffect(()=>{if(visible.length&&!visible.some((item)=>item.moduleId===selected))setSelected(visible[0].moduleId);},[selected,visible]);
  if(!workflow)return <div className="empty-state empty-state--page"><Workflow/><strong>گردش‌کاری پیدا نشد.</strong></div>;
  const stages=approvalStagesFor(workflow,state.roles);
  const runtimeEditable=workflow.moduleId==='employee-advance';
  return <div className="page-stack workflow-manager">
    <section className="page-intro"><div className="page-intro__icon"><Workflow size={24}/></div><div><span className="eyebrow">طراح کنترل‌شده و نسخه‌دار</span><h2>مدیریت گردش‌کار</h2><p>مسیر پایه شرکت و مسیرهای استثنایی شعب را تنظیم کنید. هر پرونده هنگام ثبت به همان نسخه و مسیر قفل می‌شود.</p></div></section>
    <div className="workflow-admin-grid">
      <section className="panel workflow-directory"><h3>گردش‌کارها</h3><label className="search-field"><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="جست‌وجوی نام یا سیاست…"/></label>{visible.map((item)=><button type="button" key={item.id} className={item.moduleId===workflow.moduleId?'active':''} onClick={()=>setSelected(item.moduleId)}><span><strong>{workflowTitle(item)}</strong><small>{moduleTitle(item.moduleId)}</small></span><b>نسخه {persianNumber(item.version)}</b></button>)}</section>
      <section className="panel workflow-detail">
        <div className="panel-heading"><div><span className="eyebrow">نسخه فعال {persianNumber(workflow.version)}</span><h3>{workflowTitle(workflow)}</h3><p>{workflow.assignmentPolicy}</p></div><button className="button button--primary" disabled={!runtimeEditable} title={runtimeEditable?'ایجاد نسخه جدید':'ویرایش پس از اتصال کامل موتور اجرایی این ماژول فعال می‌شود.'} onClick={()=>setEditing(true)}><Pencil size={17}/> {runtimeEditable?'ایجاد نسخه جدید':'فعلاً فقط خواندنی'}</button></div>
        <div className="workflow-version-rule"><LockKeyhole size={20}/><div><strong>نسخه فعال فقط خواندنی است</strong><p>نسخه جدید فقط بر پرونده‌های بعدی اثر دارد؛ پرونده‌های جاری مسیر و نسخه قبلی خود را ادامه می‌دهند.</p></div></div>
        <div className="record-facts"><div><span>روش تعیین مسئول پرونده<strong>{queueLabels[workflow.queueStrategy]}</strong></span></div><div><span>مسیر تأیید<strong>{approvalPolicyTitle(workflow)}</strong></span></div><div><span>مسیرهای استثنایی فعال<strong>{persianNumber((workflow.routeVariants??[]).filter((item)=>item.status==='active').length)}</strong></span></div></div>
        <RoutePreview title="مسیر پایه شرکت" subtitle={workflow.moduleId==='employee-advance'?(workflow.allowSelfSubmission??true?'ثبت مستقیم پرسنل مجاز است':'فقط ثبت نیابتی مجاز است'):undefined} stages={stages} workflow={workflow} state={state}/>
        {(workflow.routeVariants??[]).map((variant)=><RoutePreview key={variant.id} title={variant.title} subtitle={`${variant.branchUnitIds.map((id)=>state.units.find((unit)=>unit.id===id)?.name??'شعبه حذف‌شده').join('، ')} · ${variant.status==='active'?'فعال':'غیرفعال'}${workflow.moduleId==='employee-advance'?` · ${(variant.allowSelfSubmission??true)?'ثبت مستقیم مجاز':'فقط ثبت نیابتی'}`:''}`} stages={variant.approvalStages} workflow={workflow} state={state}/>)}
        <details className="workflow-locked-map"><summary><ShieldCheck size={18}/> نمایش ماشین وضعیت محافظت‌شده</summary><div className="workflow-state-map">{Object.entries(workflow.stateLabels).map(([id,label])=><span key={id}>{label}</span>)}</div><div className="transition-map">{workflow.transitions.map((item)=><article key={item.id}><span>{item.from.map((from)=>workflow.stateLabels[from]??'وضعیت تعریف‌شده').join(' / ')}</span><ArrowLeft size={17}/><strong>{workflow.stateLabels[item.to]??'وضعیت تعریف‌شده'}</strong><small>{item.label}</small></article>)}</div></details>
      </section>
    </div>
    {editing&&runtimeEditable&&<WorkflowPolicyDialog state={state} workflow={workflow} onClose={()=>setEditing(false)} onSave={(input)=>{if(!service)throw new Error('سرویس گردش‌کار در دسترس نیست.');return execute('workflow-policy',()=>service.updateWorkflowPolicy(workflow.moduleId,workflow.version,input),'نسخه جدید گردش‌کار منتشر شد.').then((succeeded)=>{if(succeeded)setEditing(false);return succeeded;});}}/>}
  </div>;
}

function RoutePreview({title,subtitle,stages,workflow,state}:{title:string;subtitle?:string;stages:WorkflowApprovalStageDefinition[];workflow:WorkflowDefinition;state:FoundationState}){
  return <div className="workflow-route"><header><div><GitBranch size={19}/><strong>{title}</strong>{subtitle&&<small>{subtitle}</small>}</div><span>{persianNumber(stages.length)} مرحله</span></header>{stages.length?stages.map((stage,index)=>{const assignee=state.users.find((user)=>user.id===stage.assigneeUserId);return <article key={stage.id}><i>{persianNumber(index+1)}</i><div><strong>{stageDisplayTitle(workflow,stage)}</strong><small>{workflow.stateLabels[stage.stateId]??'وضعیت تعریف‌شده'}</small></div><div className="workflow-role-chips"><span className="workflow-assignment-chip">{assignmentModeForStage(stage)==='specific_user'?(assignee?userDisplayLabel(assignee,state):'کاربر تعیین نشده'):assignmentModeLabels[assignmentModeForStage(stage)]}</span>{stage.roleIds.map((roleId)=><span key={roleId}>{state.roles.find((role)=>role.id===roleId)?.name??'نقش سازمانی'}</span>)}</div><b>{scopeLabels[stage.scope]}</b><div className="workflow-decision-chips">{stage.decisions.map((item)=><span key={item}>{decisionLabels[item]}</span>)}</div></article>}):<div className="quiet-state">مرحله‌ای تعریف نشده است.</div>}</div>;
}

interface PolicyInput {queueStrategy:WorkflowDefinition['queueStrategy'];assignmentPolicy:string;approvalPolicyId?:string;allowSelfSubmission?:boolean;approvalStages:WorkflowApprovalStageDefinition[];routeVariants:WorkflowRouteVariantDefinition[];changeSummary:string}

function WorkflowPolicyDialog({state,workflow,onClose,onSave}:{state:FoundationState;workflow:WorkflowDefinition;onClose:()=>void;onSave:(input:PolicyInput)=>Promise<boolean>}){
  const dialogRef=useRef<HTMLFormElement>(null);
  const queueStrategy=workflow.queueStrategy;
  const [assignmentPolicy,setAssignment]=useState(workflow.assignmentPolicy);
  const [approvalPolicyId,setApproval]=useState(approvalPolicyTitle(workflow));
  const [allowSelfSubmission,setAllowSelfSubmission]=useState(workflow.allowSelfSubmission??true);
  const [changeSummary,setChangeSummary]=useState('');
  const [stages,setStages]=useState(()=>approvalStagesFor(workflow,state.roles));
  const [routes,setRoutes]=useState(()=>workflow.routeVariants?.map((route)=>({...route,branchUnitIds:[...route.branchUnitIds],approvalStages:cloneStages(route.approvalStages)}))??[]);
  const [errors,setErrors]=useState<string[]>([]);
  const [openRouteIds,setOpenRouteIds]=useState<string[]>([]);
  const [versionRuleAccepted,setVersionRuleAccepted]=useState(false);
  const branches=state.units.filter((unit)=>unit.type==='شعبه'&&unit.status==='active');
  const addRoute=()=>{const id=`route-${crypto.randomUUID()}`;setRoutes((current)=>[...current,{
    id,title:'مسیر استثنایی شعبه',description:'',branchUnitIds:[],priority:current.length+1,status:'active',allowSelfSubmission:true,approvalStages:cloneStages(stages).map((stage)=>({...stage,id:`${stage.id}-${crypto.randomUUID()}`})),
  }]);setOpenRouteIds((current)=>[...current,id]);};
  const updateRoute=(index:number,patch:Partial<WorkflowRouteVariantDefinition>)=>setRoutes((current)=>current.map((route,row)=>row===index?{...route,...patch}:route));
  useEffect(()=>{
    const dialog=dialogRef.current;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!dialog)return;
    dialog.focus({preventScroll:true});
    const handleKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return;}
      if(event.key!=='Tab')return;
      const focusable=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter((element)=>element.offsetParent!==null);
      if(!focusable.length){event.preventDefault();dialog.focus();return;}
      const first=focusable[0];const last=focusable[focusable.length-1];
      if(document.activeElement===dialog){event.preventDefault();(event.shiftKey?last:first).focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    dialog.addEventListener('keydown',handleKeyDown);
    return()=>{dialog.removeEventListener('keydown',handleKeyDown);previousFocus?.focus({preventScroll:true});};
  },[onClose]);
  const submit=()=>{
    const next=[...validateRequired([{label:'توضیح قانون تعیین مسئول',value:assignmentPolicy},{label:'دلیل انتشار نسخه',value:changeSummary}]),...validateWorkflowPolicy(workflow,stages,state.roles,routes,state.users),...(!versionRuleAccepted?['برای انتشار، قانون نسخه‌گذاری را تأیید کنید.']:[])];
    setErrors(next);
    const invalidRoute=routes.find((route,index)=>next.some((error)=>error.startsWith(`مسیر شعبه‌ای ${index+1}`)||error.includes(`مسیر «${route.title||index+1}»`)));
    if(invalidRoute)setOpenRouteIds((current)=>current.includes(invalidRoute.id)?current:[...current,invalidRoute.id]);
    if(!next.length)void onSave({queueStrategy,assignmentPolicy,approvalPolicyId,allowSelfSubmission,approvalStages:stages,routeVariants:routes,changeSummary});
  };
  return <div className="modal-scrim"><form ref={dialogRef} tabIndex={-1} noValidate role="dialog" aria-modal="true" aria-labelledby="workflow-policy-title" className="dialog workflow-policy-dialog" onSubmit={(event)=>{event.preventDefault();submit();}}>
    <header><div><span className="eyebrow">پیش‌نویس نسخه {persianNumber(workflow.version+1)}</span><h2 id="workflow-policy-title">{workflowTitle(workflow)}</h2><p>نسخه فعال {persianNumber(workflow.version)} بدون تغییر باقی می‌ماند.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="dialog-body"><FormValidationSummary errors={errors}/>
      <section className="workflow-draft-rule workflow-draft-rule--compact"><ShieldCheck size={21}/><div><strong>ویرایش امن نسخه جدید</strong><p>نسخه فعلی و پرونده‌های در جریان تغییر نمی‌کنند؛ این تنظیمات فقط برای پرونده‌های آینده منتشر می‌شود.</p></div></section>
      <details className="workflow-builder-help"><summary><CircleHelp size={20}/><span><strong>راهنمای ساخت مسیر</strong><small>قوانین مسیر پایه، شعب و نسخه‌گذاری</small></span><ChevronDown size={18}/></summary><div><ol><li>مسیر پایه برای تمام شعبی است که استثنا ندارند.</li><li>برای شعب متفاوت، مسیر استثنایی بسازید و شعبه‌های مشمول را انتخاب کنید.</li><li>ترتیب مصوب مراحل مساعده ثابت است؛ می‌توانید مراحل مجاز را حذف یا اضافه کنید.</li><li>سیستم هنگام ثبت، مسیر منطبق را انتخاب و روی پرونده قفل می‌کند.</li></ol></div></details>
      <section className="workflow-form-section"><header><strong>تنظیمات کلی</strong><small>نام سیاست و قانون تعیین مسئول پرونده</small></header><div className="form-grid"><div className="field"><RequiredLabel>روش ثابت تعیین مسئول پرونده</RequiredLabel><div className="workflow-readonly-value"><LockKeyhole size={16}/><span><strong>{queueLabels[queueStrategy]}</strong><small>{queueDescriptions[queueStrategy]}</small></span></div></div><label className="field"><OptionalLabel>نام سیاست تأیید</OptionalLabel><input value={approvalPolicyId} onChange={(event)=>setApproval(event.target.value)}/></label><label className="field field--wide"><RequiredLabel>توضیح قانون تعیین مسئول</RequiredLabel><textarea rows={3} value={assignmentPolicy} onChange={(event)=>setAssignment(event.target.value)}/></label>{workflow.moduleId==='employee-advance'&&<label className="switch-row field--wide"><input type="checkbox" checked={allowSelfSubmission} onChange={(event)=>setAllowSelfSubmission(event.target.checked)}/><span><strong>ثبت مستقیم مساعده توسط پرسنل مجاز باشد</strong><small>این قانون برای تمام شعب فاقد مسیر استثنایی اجرا می‌شود.</small></span></label>}</div></section>
      <StageEditor title="مسیر پایه شرکت" description="اگر برای شعبه مسیر استثنایی فعال نباشد، این مسیر اجرا می‌شود." state={state} workflow={workflow} stages={stages} errors={errors} onChange={setStages}/>
      {workflow.moduleId==='employee-advance'&&<section className="workflow-branch-routes"><header><div><strong>مسیرهای استثنایی شعب</strong><small>برای یک یا چند شعبه، مراحل متفاوت تعریف کنید. هر شعبه فقط در یک مسیر فعال باشد.</small></div><button type="button" className="button button--secondary" onClick={addRoute}><Plus size={16}/> افزودن مسیر شعبه‌ای</button></header>
        {routes.map((route,index)=>{
          const routeHasError=errors.some((error)=>error.startsWith(`مسیر شعبه‌ای ${index+1}`)||error.includes(`مسیر «${route.title||index+1}»`));
          return <details key={route.id} className={`workflow-branch-route ${routeHasError?'has-error':''}`} open={openRouteIds.includes(route.id)} onToggle={(event)=>{const isOpen=event.currentTarget.open;setOpenRouteIds((current)=>isOpen?(current.includes(route.id)?current:[...current,route.id]):current.filter((id)=>id!==route.id));}}>
            <summary><GitBranch size={17}/><strong>{route.title||'مسیر بدون نام'}</strong><span>{routeHasError?'نیازمند اصلاح':route.branchUnitIds.length?`${persianNumber(route.branchUnitIds.length)} شعبه`:'شعبه انتخاب نشده'}</span><ChevronDown size={17}/></summary>
            <div className="workflow-branch-route__body"><div className="form-grid"><label className="field"><RequiredLabel>نام مسیر</RequiredLabel><input value={route.title} onChange={(event)=>updateRoute(index,{title:event.target.value})}/></label><label className="field"><RequiredLabel>وضعیت مسیر</RequiredLabel><select value={route.status} onChange={(event)=>updateRoute(index,{status:event.target.value as WorkflowRouteVariantDefinition['status']})}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label><label className="field"><RequiredLabel>اولویت تطبیق</RequiredLabel><input type="number" min="0" value={route.priority} onChange={(event)=>updateRoute(index,{priority:Number(event.target.value)})}/></label><label className="field field--wide"><OptionalLabel>توضیح مسیر</OptionalLabel><input value={route.description??''} onChange={(event)=>updateRoute(index,{description:event.target.value})}/></label><label className="switch-row field--wide"><input type="checkbox" checked={route.allowSelfSubmission??true} onChange={(event)=>updateRoute(index,{allowSelfSubmission:event.target.checked})}/><span><strong>پرسنل این شعبه بتوانند مستقیم درخواست مساعده ثبت کنند</strong><small>در صورت غیرفعال بودن، فقط ثبت نیابتی توسط نقش مجاز امکان‌پذیر است.</small></span></label></div><div className="field"><RequiredLabel>شعبه‌های مشمول</RequiredLabel><div className="workflow-branch-options">{branches.map((branch)=><label key={branch.id}><input type="checkbox" checked={route.branchUnitIds.includes(branch.id)} onChange={(event)=>updateRoute(index,{branchUnitIds:event.target.checked?[...route.branchUnitIds,branch.id]:route.branchUnitIds.filter((id)=>id!==branch.id)})}/><span>{branch.name}</span></label>)}</div></div><StageEditor title={`مراحل ${route.title}`} errorLabel={`مسیر «${route.title||index+1}»`} description="می‌توانید مرحله مدیر شعبه یا تأییدکننده اصلی را حذف کنید؛ حسابداری و خزانه باید باقی بمانند." state={state} workflow={workflow} stages={route.approvalStages} errors={errors} onChange={(approvalStages)=>updateRoute(index,{approvalStages})}/><button type="button" className="button button--danger" onClick={()=>setRoutes((current)=>current.filter((_,row)=>row!==index))}><Trash2 size={16}/> حذف این مسیر استثنایی</button></div>
          </details>;
        })}
        {!routes.length&&<div className="quiet-state">هنوز مسیر استثنایی ساخته نشده است؛ همه شعب از مسیر پایه استفاده می‌کنند.</div>}
      </section>}
      <label className="field"><RequiredLabel>دلیل انتشار نسخه جدید</RequiredLabel><textarea rows={3} value={changeSummary} onChange={(event)=>setChangeSummary(event.target.value)} placeholder="مثلاً افزودن مسیر ویژه شعبه سعادت‌آباد…"/></label>
      <label className="workflow-version-confirm"><input type="checkbox" checked={versionRuleAccepted} onChange={(event)=>setVersionRuleAccepted(event.target.checked)}/><span><strong>قانون نسخه‌گذاری را تأیید می‌کنم</strong><small>نسخه جدید فقط برای پرونده‌های جدید فعال شود و پرونده‌های جاری با مسیر قبلی ادامه پیدا کنند.</small></span></label>
    </div><footer><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary">انتشار نسخه {persianNumber(workflow.version+1)}</button></footer>
  </form></div>;
}

function StageEditor({title,errorLabel=title,description,state,workflow,stages,errors,onChange}:{title:string;errorLabel?:string;description:string;state:FoundationState;workflow:WorkflowDefinition;stages:WorkflowApprovalStageDefinition[];errors:string[];onChange:(stages:WorkflowApprovalStageDefinition[])=>void}){
  const [roleSearch,setRoleSearch]=useState<Record<string,string>>({});
  const [openStageId,setOpenStageId]=useState<string|undefined>(stages[0]?.id);
  const activeRoles=state.roles.filter((role)=>role.status==='active');
  const activeUsers=state.users.filter((user)=>user.status==='active');
  const approvedStageTemplates=useMemo(()=>defaultApprovalStages(workflow,state.roles),[state.roles,workflow]);
  const missingStageTemplate=approvedStageTemplates.find((template)=>!stages.some((stage)=>stage.stateId===template.stateId));
  const canReorder=workflow.moduleId!=='employee-advance';
  const update=(index:number,patch:Partial<WorkflowApprovalStageDefinition>)=>onChange(stages.map((stage,row)=>row===index?{...stage,...patch}:stage));
  const move=(index:number,delta:number)=>{const target=index+delta;if(target<0||target>=stages.length)return;const copy=[...stages];[copy[index],copy[target]]=[copy[target],copy[index]];onChange(copy);};
  const add=()=>{
    const template=workflow.moduleId==='employee-advance'?missingStageTemplate:undefined;
    if(workflow.moduleId==='employee-advance'&&!template)return;
    const stage=template?{...template,id:`${template.id}-${crypto.randomUUID()}`,roleIds:[...template.roleIds],decisions:[...template.decisions]}:newStage(workflow,stages.length);
    const next=template?[...stages,stage].sort((first,second)=>approvedStageTemplates.findIndex((item)=>item.stateId===first.stateId)-approvedStageTemplates.findIndex((item)=>item.stateId===second.stateId)):[...stages,stage];
    onChange(next);setOpenStageId(stage.id);
  };
  const remove=(index:number)=>{const remaining=stages.filter((_,row)=>row!==index);onChange(remaining);if(stages[index]?.id===openStageId)setOpenStageId(remaining[Math.min(index,remaining.length-1)]?.id);};
  const firstErrorStageId=useMemo(()=>stages.find((_,index)=>errors.some((error)=>error.includes(`${errorLabel}، مرحله ${index+1}`)))?.id,[errorLabel,errors,stages]);
  useEffect(()=>{if(firstErrorStageId)setOpenStageId(firstErrorStageId);},[firstErrorStageId]);
  return <section className="workflow-stage-editor">
    <header><div><strong>{title}</strong><small>{description}</small></div>{(workflow.moduleId!=='employee-advance'||missingStageTemplate)&&<button type="button" className="button button--secondary" onClick={add}><Plus size={16}/> {missingStageTemplate?`بازگرداندن ${stageDisplayTitle(workflow,missingStageTemplate)}`:'افزودن مرحله'}</button>}</header>
    <div className="workflow-stage-list">{stages.map((stage,index)=>{
      const assignmentMode=assignmentModeForStage(stage);
      const eligibleUsers=activeUsers.filter((user)=>!stage.roleIds.length||user.roleIds.some((roleId)=>stage.roleIds.includes(roleId)));
      const stageOpen=openStageId===stage.id;
      const hasError=errors.some((error)=>error.includes(`${errorLabel}، مرحله ${index+1}`));
      const protectedStage=workflow.moduleId==='employee-advance'&&['accounting_review','sent_to_treasury'].includes(stage.stateId);
      const visibleRoles=activeRoles.filter((role)=>`${role.name} ${role.description}`.toLocaleLowerCase('fa-IR').includes((roleSearch[stage.id]??'').trim().toLocaleLowerCase('fa-IR')));
      const stageLabel=stageDisplayTitle(workflow,stage);
      return <article key={stage.id} className={`workflow-stage-card ${stageOpen?'is-open':''} ${hasError?'has-error':''}`}>
        <div className="workflow-stage-card__header">
          <button type="button" className="workflow-stage-toggle" aria-expanded={stageOpen} aria-controls={`workflow-stage-${stage.id}`} onClick={()=>setOpenStageId(stageOpen?undefined:stage.id)}>
            <span className="workflow-stage-number">{persianNumber(index+1)}</span>
            <span className="workflow-stage-summary"><strong>{stageLabel}</strong><small>{assignmentModeLabels[assignmentMode]} · {scopeLabels[stage.scope]}</small></span>
            <span className="workflow-stage-counts"><b>{persianNumber(stage.roleIds.length)} نقش</b><b>{persianNumber(stage.decisions.length)} تصمیم</b>{hasError&&<b className="is-error">نیازمند اصلاح</b>}</span>
            <ChevronDown size={18}/>
          </button>
          {(canReorder||!protectedStage)&&<div className="workflow-stage-actions">
            {canReorder&&<><button type="button" className="icon-button" onClick={()=>move(index,-1)} disabled={index===0} aria-label="انتقال مرحله به بالا"><ArrowUp size={16}/></button><button type="button" className="icon-button" onClick={()=>move(index,1)} disabled={index===stages.length-1} aria-label="انتقال مرحله به پایین"><ArrowDown size={16}/></button></>}
            {!protectedStage&&<button type="button" className="icon-button icon-button--danger" onClick={()=>remove(index)} aria-label="حذف مرحله"><Trash2 size={16}/></button>}
          </div>}
        </div>
        {stageOpen&&<div id={`workflow-stage-${stage.id}`} className="workflow-stage-card__body">
          <fieldset className="workflow-stage-group"><legend>مشخصات مرحله</legend><div className="workflow-stage-fields">
            <label className="field"><RequiredLabel>عنوان نمایشی مرحله</RequiredLabel><input value={stage.title} onChange={(event)=>update(index,{title:event.target.value})}/></label>
            {workflow.moduleId==='employee-advance'?<div className="field"><RequiredLabel>وضعیت پرونده</RequiredLabel><div className="workflow-readonly-value workflow-readonly-value--small"><LockKeyhole size={15}/><span><strong>{workflow.stateLabels[stage.stateId]??stageDisplayTitle(workflow,stage)}</strong><small>ترتیب وضعیت‌های مساعده طبق سیاست مصوب ثابت است.</small></span></div></div>:<label className="field"><RequiredLabel>وضعیت پرونده</RequiredLabel><select value={stage.stateId} onChange={(event)=>update(index,{stateId:event.target.value})}>{Object.entries(workflow.stateLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
          </div></fieldset>
          <fieldset className="workflow-stage-group"><legend>مسئول مرحله</legend><div className="workflow-stage-fields">
            <label className="field"><RequiredLabel>روش تعیین مسئول</RequiredLabel><select value={assignmentMode} onChange={(event)=>update(index,{assignmentMode:event.target.value as WorkflowStageAssignmentMode,assigneeUserId:undefined,scope:event.target.value==='branch_manager'?'BRANCH':stage.scope})}>{Object.entries(assignmentModeLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><small className="field-help">{assignmentMode==='branch_manager'?'مدیر از ساختار سازمان همان شعبه خوانده می‌شود.':assignmentMode==='specific_user'?'پرونده فقط به کاربر انتخاب‌شده ارجاع می‌شود.':'سیستم یک کاربر فعال دارای نقش و محدوده مجاز را انتخاب می‌کند.'}</small></label>
            {assignmentMode==='branch_manager'?(stage.scope==='BRANCH'?<div className="field"><RequiredLabel>محدوده مسئولیت</RequiredLabel><div className="workflow-readonly-value workflow-readonly-value--small"><LockKeyhole size={15}/><span><strong>شعبه</strong><small>برای مدیر همان شعبه ثابت است</small></span></div></div>:<div className="field"><RequiredLabel>محدوده مسئولیت</RequiredLabel><div className="workflow-repair-setting"><CircleHelp size={17}/><span><strong>محدوده قدیمی ناسازگار است</strong><small>روش «مدیر همان شعبه» فقط با محدوده شعبه معتبر است.</small></span><button type="button" className="button button--secondary" onClick={()=>update(index,{scope:'BRANCH'})}>اصلاح به شعبه</button></div></div>):<label className="field"><RequiredLabel>محدوده مسئولیت</RequiredLabel><select value={stage.scope} onChange={(event)=>update(index,{scope:event.target.value as WorkflowStageScope})}>{Object.entries(scopeLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
            {assignmentMode==='specific_user'&&<label className="field field--wide"><RequiredLabel>کاربر مسئول</RequiredLabel><select value={stage.assigneeUserId??''} onChange={(event)=>update(index,{assigneeUserId:event.target.value||undefined})}><option value="">انتخاب کاربر…</option>{eligibleUsers.map((user)=><option key={user.id} value={user.id}>{userDisplayLabel(user,state)}</option>)}</select></label>}
          </div>
          <details className="workflow-role-picker"><summary><span><strong>نقش‌های مسئول</strong><small>{stage.roleIds.length?stage.roleIds.map((id)=>state.roles.find((role)=>role.id===id)?.name??'نقش حذف‌شده').join('، '):'هنوز نقشی انتخاب نشده است'}</small></span><b>{persianNumber(stage.roleIds.length)} انتخاب</b><ChevronDown size={17}/></summary><div><span className="workflow-role-search"><Search size={15}/><input aria-label="جست‌وجوی نقش مسئول" value={roleSearch[stage.id]??''} onChange={(event)=>setRoleSearch((current)=>({...current,[stage.id]:event.target.value}))} placeholder="جست‌وجوی نقش…"/></span><div className="workflow-role-options">{visibleRoles.map((role)=>{const selected=stage.roleIds.includes(role.id);return <label key={role.id} className={selected?'selected':''}><input type="checkbox" checked={selected} onChange={(event)=>update(index,{roleIds:event.target.checked?[...stage.roleIds,role.id]:stage.roleIds.filter((id)=>id!==role.id),assigneeUserId:undefined})}/><span className="workflow-option-check">{selected&&<Check size={13}/>}</span><span><strong>{role.name}</strong><small>{role.description}</small></span></label>;})}{!visibleRoles.length&&<p>نقشی با این جست‌وجو پیدا نشد.</p>}</div></div></details>
          </fieldset>
          <fieldset className="workflow-stage-group"><legend>تصمیم‌ها و کنترل مرحله</legend><div className="workflow-decision-options">{decisions.map((decision)=>{const selected=stage.decisions.includes(decision);return <label key={decision} className={selected?'selected':''}><input type="checkbox" checked={selected} onChange={(event)=>update(index,{decisions:event.target.checked?[...stage.decisions,decision]:stage.decisions.filter((item)=>item!==decision)})}/><span className="workflow-option-check">{selected&&<Check size={13}/>}</span><span>{decisionLabels[decision]}</span></label>;})}</div><div className="workflow-stage-fixed-row"><div className="workflow-fixed-setting"><ShieldCheck size={17}/><span><strong>مرحله الزامی</strong><small>عبور از این مرحله طبق سیاست مساعده اجباری است.</small></span></div><label className="switch-row"><input type="checkbox" checked={stage.allowSelfApproval} onChange={(event)=>update(index,{allowSelfApproval:event.target.checked})}/><span><strong>تأیید درخواست خود مجاز باشد</strong><small>در حالت عادی برای تفکیک ثبت‌کننده و تأییدکننده خاموش بماند.</small></span></label></div></fieldset>
        </div>}
      </article>;
    })}</div>
    {!stages.length&&<div className="quiet-state">مرحله‌ای تعریف نشده است. برای ادامه یک مرحله اضافه کنید.</div>}
  </section>;
}
