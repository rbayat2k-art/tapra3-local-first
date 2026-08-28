import {ShieldCheck, UserRoundCheck, X} from 'lucide-react';
import {useState} from 'react';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService, RecruitmentTrainingStartInput} from './service';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {PersianDateInput, todayIsoDate} from './PersianDate';
import {personnelDisplayLabel} from './personIdentity';
import {RecordDialog} from './RecordDialog';
import {positionsForUnit} from './unitPosition';

interface Props {
  record: OperationalRecord;
  state: FoundationState;
  service: LocalFoundationService;
  execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
  onClose: () => void;
}

function candidateNameParts(record: OperationalRecord) {
  const parts = String(record.payload.candidateName ?? '').trim().split(/\s+/).filter(Boolean);
  return {firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ')};
}

function preferredPositionId(record: OperationalRecord, state: FoundationState) {
  const title = String(record.payload.positionTitle ?? '').trim();
  const available = positionsForUnit(state.positions.filter((item) => item.status === 'active'), record.unitId);
  return available.find((item) => item.title === title)?.id
    ?? available.find((item) => title && (item.title.includes(title) || title.includes(item.title)))?.id
    ?? '';
}

export function RecruitmentTrainingStartDialog({record,state,service,execute,onClose}: Props) {
  const name = candidateNameParts(record);
  const [initial] = useState<RecruitmentTrainingStartInput>(() => ({
    firstName: name.firstName,
    lastName: name.lastName,
    nationalId: String(record.payload.candidateNationalId ?? ''),
    primaryMobile: String(record.payload.candidateMobile ?? ''),
    startDate: todayIsoDate(),
    unitId: record.unitId ?? '',
    positionId: preferredPositionId(record,state),
    branchUnitId: record.branchUnitId,
    managerPersonnelId: state.activeUser.personnelId,
    createAccount: true,
    username: '',
    initialPassword: '',
    note: '',
  }));
  const [form,setForm]=useState(initial);
  const [errors,setErrors]=useState<string[]>([]);
  const [saving,setSaving]=useState(false);
  const dirty=JSON.stringify(form)!==JSON.stringify(initial);
  const set=<K extends keyof RecruitmentTrainingStartInput>(key:K,value:RecruitmentTrainingStartInput[K])=>setForm((current)=>({...current,[key]:value}));
  const positions=positionsForUnit(state.positions.filter((item)=>item.status==='active'),form.unitId);
  const managers=state.personnel.filter((item)=>item.employmentStatus==='active'&&(!item.companyId||item.companyId===state.activeUser.companyId));
  const safeClose=()=>{
    if(saving)return;
    if(dirty&&!window.confirm('اطلاعات شروع دوره هنوز ثبت نشده است. از فرم خارج می‌شوید؟'))return;
    onClose();
  };
  const submit=()=>{
    const next=validateRequired([
      {label:'نام',value:form.firstName},{label:'نام خانوادگی',value:form.lastName},{label:'کد ملی',value:form.nationalId},{label:'شماره همراه',value:form.primaryMobile},{label:'تاریخ شروع دوره',value:form.startDate},
      {label:'واحد سازمانی',value:form.unitId},{label:'سمت سازمانی',value:form.positionId},
      ...(form.createAccount?[{label:'نام کاربری',value:form.username},{label:'رمز عبور اولیه',value:form.initialPassword,valid:(value)=>String(value??'').length>=8,message:'رمز عبور اولیه باید حداقل ۸ نویسه باشد.'}]:[]),
    ]);
    setErrors(next);if(next.length)return;
    setSaving(true);
    void execute('recruitment-training-start',()=>service.startRecruitmentTraining(record.id,record.version,form),`دوره آموزشی «${form.firstName} ${form.lastName}» آغاز و پرونده پرسنلی تشکیل شد.`).then((ok)=>{setSaving(false);if(ok)onClose();});
  };
  return <RecordDialog ariaLabel={`شروع دوره آموزشی ${String(record.payload.candidateName??'متقاضی')}`} className="recruitment-training-dialog" onClose={safeClose}>
    <header><div><span className="eyebrow">شروع همکاری · {record.trackingCode}</span><h2>تشکیل پرونده پرسنلی آموزشی</h2><p>شروع واقعی دوره، پرونده پرسنلی را قطعی می‌سازد. حساب ورود فقط در صورت نیاز و با دسترسی محدود آموزشی ایجاد می‌شود.</p></div><button type="button" data-window-close className="icon-button" disabled={saving} onClick={safeClose} aria-label="بستن"><X/></button></header>
    <fieldset className="drawer-body form-grid" disabled={saving} data-workspace-dirty={dirty?'true':undefined}>
      <FormValidationSummary errors={errors}/>
      <div className="training-start-policy field--wide" role="note"><ShieldCheck aria-hidden="true"/><div><strong>مرز دسترسی دوره آموزشی</strong><span>این فرد از همین لحظه در «پرسنل سازمان» با نوع همکاری آموزشی دیده می‌شود؛ مساعده و دسترسی‌های مالی برای او فعال نیست.</span></div></div>
      <label className="field"><RequiredLabel>نام</RequiredLabel><input value={form.firstName} onChange={(event)=>set('firstName',event.target.value)}/></label>
      <label className="field"><RequiredLabel>نام خانوادگی</RequiredLabel><input value={form.lastName} onChange={(event)=>set('lastName',event.target.value)}/></label>
      <label className="field"><RequiredLabel>کد ملی</RequiredLabel><input dir="ltr" inputMode="numeric" value={form.nationalId} onChange={(event)=>set('nationalId',event.target.value)} placeholder="۱۰ رقم"/></label>
      <label className="field"><RequiredLabel>شماره همراه</RequiredLabel><input dir="ltr" inputMode="tel" value={form.primaryMobile} onChange={(event)=>set('primaryMobile',event.target.value)} placeholder="09xxxxxxxxx"/></label>
      <label className="field"><RequiredLabel>تاریخ شروع دوره</RequiredLabel><PersianDateInput value={form.startDate} onChange={(value)=>set('startDate',value)} required ariaLabel="تاریخ شروع دوره آموزشی"/></label>
      <label className="field"><RequiredLabel>واحد سازمانی</RequiredLabel><select value={form.unitId} onChange={(event)=>setForm((current)=>({...current,unitId:event.target.value,positionId:''}))}><option value="">انتخاب واحد…</option>{state.units.filter((item)=>item.status==='active'&&item.type!=='شعبه').map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><RequiredLabel>سمت سازمانی</RequiredLabel><select value={form.positionId} onChange={(event)=>set('positionId',event.target.value)}><option value="">انتخاب سمت…</option>{positions.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="field"><OptionalLabel>شعبه محل استقرار</OptionalLabel><select value={form.branchUnitId??''} onChange={(event)=>set('branchUnitId',event.target.value||undefined)}><option value="">بدون شعبه</option>{state.units.filter((item)=>item.status==='active'&&item.type==='شعبه').map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field field--wide"><OptionalLabel>مدیر مستقیم دوره</OptionalLabel><select value={form.managerPersonnelId??''} onChange={(event)=>set('managerPersonnelId',event.target.value||undefined)}><option value="">بدون مدیر مستقیم</option>{managers.map((item)=><option key={item.id} value={item.id}>{personnelDisplayLabel(item,state)}</option>)}</select></label>
      <label className="training-account-choice field--wide"><input type="checkbox" checked={form.createAccount} onChange={(event)=>set('createAccount',event.target.checked)}/><UserRoundCheck aria-hidden="true"/><span><strong>برای این فرد حساب ورود به شاهراه بساز</strong><small>فقط نقش ثابت «پرسنل آموزشی» داده می‌شود و نقش دیگری از این فرم قابل انتخاب نیست.</small></span></label>
      {form.createAccount&&<><label className="field"><RequiredLabel>نام کاربری</RequiredLabel><input dir="ltr" autoComplete="off" value={form.username??''} onChange={(event)=>set('username',event.target.value)} placeholder="name.family.training"/></label><label className="field"><RequiredLabel>رمز عبور اولیه</RequiredLabel><input dir="ltr" type="password" autoComplete="new-password" value={form.initialPassword??''} onChange={(event)=>set('initialPassword',event.target.value)}/></label></>}
      <label className="field field--wide"><OptionalLabel>یادداشت شروع دوره</OptionalLabel><textarea value={form.note??''} onChange={(event)=>set('note',event.target.value)} placeholder="برنامه روز اول، مربی یا توضیح تحویل کار…"/></label>
    </fieldset>
    <footer><button type="button" className="button button--ghost" disabled={saving} onClick={safeClose}>انصراف</button><button type="button" className="button button--primary" disabled={saving} onClick={submit}>{saving?'در حال ثبت…':'تشکیل پرونده و شروع دوره'}</button></footer>
  </RecordDialog>;
}
