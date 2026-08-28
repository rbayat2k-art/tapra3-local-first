import {useState,type FormEvent} from 'react';
import {BadgeAlert,Building2,Plus,Trash2,UsersRound,X} from 'lucide-react';
import {PersianDateInput} from '../PersianDate';
import {RecordDialog} from '../RecordDialog';
import type {LegalEntity,LegalEntityOfficer,LegalEntityOfficerRole} from '../legal-inspection/model';
import {LEGAL_ENTITY_FORM_LABELS,LEGAL_ENTITY_OFFICER_ROLE_LABELS,LEGAL_SYNTHETIC_ADDRESS_OPTIONS,type LegalEntityOfficerInput,type LegalEntityProfileInput} from './entityProfile';

interface Props{entity?:LegalEntity;officers:LegalEntityOfficer[];onClose:()=>void;onSubmit:(input:LegalEntityProfileInput)=>void}
const blankOfficer=():LegalEntityOfficerInput=>({displayName:'',role:'board_member'});

export function LegalEntityProfileDialog({entity,officers,onClose,onSubmit}:Props){
  const [displayName,setDisplayName]=useState(entity?.displayName??'');
  const [legalForm,setLegalForm]=useState(entity?.legalForm??'private_joint_stock');
  const [nationalIdentifier,setNationalIdentifier]=useState('');
  const [registrationNumber,setRegistrationNumber]=useState('');
  const [registeredAt,setRegisteredAt]=useState(entity?.registeredAt??'');
  const [registeredAddress,setRegisteredAddress]=useState(entity?.registeredAddress??'');
  const [postalCode,setPostalCode]=useState('');
  const [rows,setRows]=useState<LegalEntityOfficerInput[]>(officers.filter((item)=>item.status==='active').map((item)=>({id:item.id,displayName:item.displayName,role:item.role,appointmentStartDate:item.appointmentStartDate,appointmentEndDate:item.appointmentEndDate,unlimitedTenure:item.unlimitedTenure,shareAmountRial:item.shareAmountRial})));
  const update=(index:number,patch:Partial<LegalEntityOfficerInput>)=>setRows((current)=>current.map((item,rowIndex)=>rowIndex===index?{...item,...patch}:item));
  const submit=(event:FormEvent)=>{event.preventDefault();onSubmit({displayName,legalForm,nationalIdentifier:nationalIdentifier||undefined,registrationNumber:registrationNumber||undefined,registeredAt:registeredAt||undefined,registeredAddress:registeredAddress||undefined,postalCode:postalCode||undefined,officers:rows});};
  return <RecordDialog ariaLabel={entity?'ویرایش اطلاعات شخصیت حقوقی':'ثبت شخصیت حقوقی آزمایشی'} className="dialog-card legal-dialog entity-profile-dialog" onClose={onClose}>
    <header><div><span>خزانه · مرجع مشترک شرکت‌ها</span><h2>{entity?'ویرایش اطلاعات شخصیت حقوقی':'ثبت شخصیت حقوقی آزمایشی'}</h2><p>اطلاعات ثبتی و ترکیب مدیران به‌صورت نسخه‌دار نگهداری می‌شود.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="legal-prototype-inline"><BadgeAlert size={18}/>فقط اطلاعات ساختگی وارد کنید؛ مقادیر هویتی پس از ثبت فقط به‌صورت ماسک‌شده قابل مشاهده‌اند.</div>
    <form onSubmit={submit}>
      <section className="entity-profile-section"><div className="entity-profile-section__title"><Building2 size={19}/><div><strong>مشخصات ثبتی و نشانی</strong><small>فیلد خالی در ویرایش، مقدار ماسک‌شده قبلی را حفظ می‌کند.</small></div></div><div className="form-grid">
        <label>نام شرکت<input required value={displayName} onChange={(event)=>setDisplayName(event.target.value)} placeholder="شرکت کاملاً آزمایشی QA-01"/></label>
        <label>نوع شرکت<select value={legalForm} onChange={(event)=>setLegalForm(event.target.value as keyof typeof LEGAL_ENTITY_FORM_LABELS)}>{Object.entries(LEGAL_ENTITY_FORM_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>شناسه ملی مصنوعی<input inputMode="numeric" dir="ltr" value={nationalIdentifier} onChange={(event)=>setNationalIdentifier(event.target.value)} placeholder={entity?.nationalIdentifierMasked??'۱۱ رقم'}/></label>
        <label>شماره ثبت مصنوعی<input inputMode="numeric" dir="ltr" value={registrationNumber} onChange={(event)=>setRegistrationNumber(event.target.value)} placeholder={entity?.registrationNumberMasked??'شماره ثبت'}/></label>
        <label>تاریخ تأسیس/ثبت<PersianDateInput value={registeredAt} onChange={setRegisteredAt} ariaLabel="تاریخ تأسیس یا ثبت"/></label>
        <label>کد پستی مصنوعی<input inputMode="numeric" dir="ltr" value={postalCode} onChange={(event)=>setPostalCode(event.target.value)} placeholder={entity?.postalCodeMasked??'۱۰ رقم'}/></label>
        <label className="form-grid-span">آخرین مرکز یا نشانی<select value={registeredAddress} onChange={(event)=>setRegisteredAddress(event.target.value)}><option value="">ثبت نشده</option>{LEGAL_SYNTHETIC_ADDRESS_OPTIONS.map((address)=><option key={address} value={address}>{address}</option>)}</select></label>
      </div></section>
      <section className="entity-profile-section"><div className="entity-profile-section__title"><UsersRound size={19}/><div><strong>مدیران، اعضای هیئت‌مدیره و شرکا</strong><small>حذف یک ردیف، سابقه آن فرد را غیرفعال می‌کند و از بین نمی‌برد.</small></div><button type="button" className="button button--secondary" onClick={()=>setRows((current)=>[...current,blankOfficer()])}><Plus size={16}/>افزودن فرد</button></div>
        {!rows.length&&<div className="entity-profile-empty">هنوز مدیر، عضو یا شریکی ثبت نشده است.</div>}
        <div className="entity-officer-list">{rows.map((row,index)=><article key={row.id??`new-${index}`} className="entity-officer-card"><div className="entity-officer-card__head"><strong>ردیف {(index+1).toLocaleString('fa-IR')}</strong><button type="button" className="icon-button" aria-label={`حذف ردیف ${index+1}`} onClick={()=>setRows((current)=>current.filter((_,rowIndex)=>rowIndex!==index))}><Trash2 size={17}/></button></div><div className="form-grid">
          <label>نام و نام خانوادگی<input required value={row.displayName} onChange={(event)=>update(index,{displayName:event.target.value})} placeholder="مدیرعامل کاملاً ساختگی QA-01"/></label>
          <label>سمت<select value={row.role} onChange={(event)=>update(index,{role:event.target.value as LegalEntityOfficerRole})}>{Object.entries(LEGAL_ENTITY_OFFICER_ROLE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>کد ملی مصنوعی<input inputMode="numeric" dir="ltr" value={row.nationalId??''} onChange={(event)=>update(index,{nationalId:event.target.value})} placeholder={row.id?'برای حفظ مقدار قبلی خالی بگذارید':'۱۰ رقم'}/></label>
          <label>مبلغ سهم‌الشرکه (ریال)<input inputMode="numeric" dir="ltr" value={row.shareAmountRial??''} onChange={(event)=>update(index,{shareAmountRial:event.target.value})} disabled={row.role!=='partner'}/></label>
          <label>شروع مسئولیت<PersianDateInput value={row.appointmentStartDate} onChange={(value)=>update(index,{appointmentStartDate:value})} ariaLabel={`شروع مسئولیت ردیف ${index+1}`}/></label>
          <label>پایان مسئولیت<PersianDateInput value={row.appointmentEndDate} onChange={(value)=>update(index,{appointmentEndDate:value})} disabled={row.unlimitedTenure} ariaLabel={`پایان مسئولیت ردیف ${index+1}`}/></label>
          <label className="entity-officer-unlimited"><input type="checkbox" checked={Boolean(row.unlimitedTenure)} onChange={(event)=>update(index,{unlimitedTenure:event.target.checked,appointmentEndDate:event.target.checked?undefined:row.appointmentEndDate})}/>مدت مسئولیت نامحدود است</label>
        </div></article>)}</div>
      </section>
      <footer><button type="button" className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--primary">{entity?'ذخیره نسخه جدید':'ثبت شخصیت حقوقی'}</button></footer>
    </form>
  </RecordDialog>;
}
