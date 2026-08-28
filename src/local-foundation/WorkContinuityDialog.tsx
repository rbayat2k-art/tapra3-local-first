import {useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, ArrowLeftRight, LoaderCircle, ShieldCheck, X} from 'lucide-react';
import type {FoundationState, LocalUser, WorkContinuityDependencyPreview, WorkContinuityPlan, WorkContinuityResolution} from './model';
import {userConcurrencyToken, type LocalFoundationService} from './service';
import {RecordDialog} from './RecordDialog';
import {FormValidationSummary, RequiredLabel} from './FormValidation';
import {eligibleWorkContinuityReplacementUsers, type WorkContinuitySnapshot} from './workContinuity';

export function WorkContinuityDialog({state,service,target,initialReason='',confirmLabel='تأیید و اجرای برنامه',onClose,onConfirm}:{
  state:FoundationState;service:LocalFoundationService;target:LocalUser;initialReason?:string;confirmLabel?:string;
  onClose:()=>void;onConfirm:(plan:WorkContinuityPlan)=>Promise<void>|void;
}){
  const [preview,setPreview]=useState<WorkContinuityDependencyPreview>();
  const [reason,setReason]=useState(initialReason);
  const [choices,setChoices]=useState<Record<string,string>>({});
  const [errors,setErrors]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const busyRef=useRef(false);
  const dirty=Boolean(reason.trim()||Object.keys(choices).length);
  useEffect(()=>{let active=true;setLoading(true);service.previewWorkContinuity(target.id).then((value)=>{if(active)setPreview(value);}).catch((error)=>{if(active)setErrors([error instanceof Error?error.message:'بررسی مسئولیت‌ها ممکن نشد.']);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[service,target.id]);
  const snapshot=useMemo<WorkContinuitySnapshot>(()=>({users:state.users,personnel:state.personnel,positions:state.positions,units:state.units,roles:state.roles,workflows:state.workflows,workflowVersions:state.workflowVersions,records:state.operationalRecords}),[state.users,state.personnel,state.positions,state.units,state.roles,state.workflows,state.workflowVersions,state.operationalRecords]);
  const requestClose=()=>{if(busy)return;if(dirty&&!window.confirm('برنامه تداوم هنوز ثبت نشده است. پنجره بسته شود؟'))return;onClose();};
  const submit=async()=>{
    if(!preview||busyRef.current)return;
    const next:string[]=[];
    if(reason.trim().length<3)next.push('دلیل برنامه تداوم مسئولیت باید حداقل ۳ نویسه باشد.');
    const resolutions:WorkContinuityResolution[]=preview.responsibilities.map((item)=>{
      const choice=choices[item.id];
      if(item.mode==='replacement_required'&&!choice)next.push(`برای «${item.title}» جانشین انتخاب کنید.`);
      if(item.mode==='replacement_or_needs_reassignment'&&!choice)next.push(`برای «${item.title}» جانشین یا حالت نیازمند تخصیص مجدد را انتخاب کنید.`);
      return {responsibilityId:item.id,action:item.mode==='replacement_required'?'replace':item.mode==='replacement_or_needs_reassignment'?(choice==='__needs__'?'mark_needs_reassignment':'replace'):item.mode==='return_to_role_queue'?'return_to_queue':item.mode==='remove_membership'?'remove_membership':'preserve_history',replacementUserId:choice&&choice!=='__needs__'?choice:undefined};
    });
    setErrors(next);if(next.length)return;
    const plan:WorkContinuityPlan={schemaVersion:1,targetUserId:target.id,targetUserVersionToken:userConcurrencyToken(target),generatedAt:preview.generatedAt,reason:reason.trim(),responsibilityIds:preview.responsibilities.map((item)=>item.id),resolutions};
    busyRef.current=true;setBusy(true);try{await onConfirm(plan);}finally{busyRef.current=false;setBusy(false);}
  };
  return <RecordDialog ariaLabel={`برنامه تداوم مسئولیت ${target.name}`} className="continuity-dialog" onClose={requestClose}>
    <header><div><span className="eyebrow">کنترل پیش از غیرفعال‌سازی</span><h2>تحویل مسئولیت‌های {target.name}</h2><p>هیچ مسئولیت بازی بدون تعیین تکلیف رها نمی‌شود؛ اجرا دوباره همه نقش‌ها و محدوده‌ها را کنترل می‌کند.</p></div><button className="icon-button" onClick={requestClose} disabled={busy} aria-label="بستن"><X size={20}/></button></header>
    <div className="drawer-body form-stack">
      <FormValidationSummary errors={errors}/>
      {loading?<div className="continuity-loading"><LoaderCircle className="spin" size={24}/><span>در حال کشف مسئولیت‌های جاری…</span></div>:preview&&<>
        <div className="continuity-summary"><ShieldCheck size={22}/><div><strong>{preview.responsibilities.length.toLocaleString('fa-IR')} وابستگی شناسایی شد</strong><span>{preview.blockingCount.toLocaleString('fa-IR')} مورد نیازمند تصمیم صریح است.</span></div></div>
        {!preview.responsibilities.length&&<div className="success-panel"><ShieldCheck size={20}/><div><strong>مسئولیت بازی پیدا نشد</strong><span>غیرفعال‌سازی بدون انتقال رکورد عملیاتی انجام می‌شود.</span></div></div>}
        <div className="continuity-list">{preview.responsibilities.map((item)=>{const candidates=eligibleWorkContinuityReplacementUsers(snapshot,target.id,item);return <article key={item.id}><div><strong>{item.title}</strong><small>{continuityKindLabel(item.kind)} · {item.moduleId??'ساختار سازمانی'}</small></div>{item.mode==='replacement_required'||item.mode==='replacement_or_needs_reassignment'?<label><span className="sr-only">تعیین تکلیف {item.title}</span><select value={choices[item.id]??''} disabled={busy} onChange={(event)=>setChoices((current)=>({...current,[item.id]:event.target.value}))}><option value="">انتخاب کنید</option>{item.mode==='replacement_or_needs_reassignment'&&<option value="__needs__">بدون جانشین؛ علامت نیازمند تخصیص مجدد</option>}{candidates.map((user)=><option key={user.id} value={user.id}>{user.name} — {user.roleTitle}</option>)}</select></label>:<span className="state-badge state-badge--neutral">{item.mode==='return_to_role_queue'?'بازگشت به صف نقش':item.mode==='remove_membership'?'خاتمه عضویت فعال':'حفظ سابقه'}</span>}</article>;})}</div>
        <label className="field"><RequiredLabel>دلیل و شرح تحویل مسئولیت</RequiredLabel><textarea value={reason} disabled={busy} onChange={(event)=>setReason(event.target.value)} placeholder="علت غیرفعال‌سازی و نحوه تحویل کارها…"/></label>
        <div className="waiting-banner"><AlertTriangle size={19}/><div><span>کنترل نهایی هنگام اجرا</span><strong>اگر جانشین، نقش، محدوده یا رکورد تا زمان ثبت تغییر کند، کل عملیات بدون هیچ تغییر متوقف می‌شود.</strong></div></div>
      </>}
    </div><footer><button className="button button--secondary" disabled={busy} onClick={requestClose}>انصراف</button><button className="button button--primary" disabled={loading||busy||!preview} onClick={()=>void submit()}>{busy?<LoaderCircle className="spin" size={17}/>:<ArrowLeftRight size={17}/>} {confirmLabel}</button></footer>
  </RecordDialog>;
}

function continuityKindLabel(kind:string):string{
  const labels:Record<string,string>={direct_report:'مدیر مستقیم',personnel_manager:'مدیریت پرسنلی',sales_supervisor:'سرپرستی فروش',unit_manager:'مدیریت دائم واحد',unit_acting_manager:'جانشینی واحد',project_owner:'مالکیت پروژه',project_member:'عضویت پروژه',project_task_assignee:'مسئول کار',chat_owner:'مالک گروه',chat_admin:'مدیر گروه',chat_member:'عضو گروه',letter_assignee:'مسئول نامه',letter_recipient:'گیرنده نامه',letter_reviewer:'بازبین نامه',recruitment_assignee:'مسئول جذب',recruitment_correction_recipient:'گیرنده اصلاح جذب',workflow_correction_recipient:'گیرنده اصلاح گردش‌کار',workflow_assignee:'مسئول گردش‌کار',treasury_executor:'مجری خزانه',offboarding_assignee:'مسئول خروج'};
  return labels[kind]??'مسئولیت سازمانی';
}
