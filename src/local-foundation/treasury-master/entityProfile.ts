import type {LegalEntityForm, LegalEntityOfficerRole} from '../legal-inspection/model';

export interface LegalEntityOfficerInput {
  id?: string;
  displayName: string;
  nationalId?: string;
  role: LegalEntityOfficerRole;
  appointmentStartDate?: string;
  appointmentEndDate?: string;
  unlimitedTenure?: boolean;
  shareAmountRial?: string;
}

export interface LegalEntityProfileInput {
  displayName: string;
  legalForm?: LegalEntityForm;
  nationalIdentifier?: string;
  registrationNumber?: string;
  registeredAt?: string;
  registeredAddress?: string;
  postalCode?: string;
  officers?: LegalEntityOfficerInput[];
}

export const LEGAL_ENTITY_FORM_LABELS:Record<LegalEntityForm,string>={
  private_joint_stock:'سهامی خاص',limited_liability:'با مسئولیت محدود',public_joint_stock:'سهامی عام',cooperative:'تعاونی',other:'سایر',
};

export const LEGAL_ENTITY_OFFICER_ROLE_LABELS:Record<LegalEntityOfficerRole,string>={
  chief_executive:'مدیرعامل',board_chair:'رئیس هیئت‌مدیره',board_vice_chair:'نایب‌رئیس هیئت‌مدیره',board_member:'عضو هیئت‌مدیره',partner:'شریک',other:'سایر',
};

export const LEGAL_SYNTHETIC_ADDRESS_OPTIONS=[
  'تهران، نشانی کاملاً ساختگی شماره ۱',
  'تهران، نشانی کاملاً ساختگی شماره ۲',
  'کرج، نشانی کاملاً ساختگی شماره ۳',
] as const;

const compact=(value?:string)=>value?.trim().replace(/\s+/g,' ')||undefined;
const digits=(value?:string)=>value?.replace(/[۰-۹]/g,(digit)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,(digit)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\D/g,'')||undefined;
const isoDate=(value?:string)=>{const normalized=compact(value);if(normalized&&!/^\d{4}-\d{2}-\d{2}$/.test(normalized))throw new Error('تاریخ باید با قالب معتبر انتخاب شود.');return normalized;};

export function normalizeLegalEntityProfileInput(input:LegalEntityProfileInput):LegalEntityProfileInput{
  const displayName=compact(input.displayName);
  if(!displayName||displayName.length<2||displayName.length>160)throw new Error('نام شخصیت حقوقی معتبر نیست.');
  const registeredAddress=compact(input.registeredAddress);
  if(!/^(شرکت|شخصیت حقوقی) (کاملاً )?(آزمایشی|مصنوعی|ساختگی)( [A-Za-z0-9-]+)?$/.test(displayName))throw new Error('در نسخه محلی، نام شرکت باید فقط از الگوی رزروشده ساختگی مانند «شرکت کاملاً آزمایشی QA-01» استفاده کند.');
  if(registeredAddress&&!LEGAL_SYNTHETIC_ADDRESS_OPTIONS.includes(registeredAddress as (typeof LEGAL_SYNTHETIC_ADDRESS_OPTIONS)[number]))throw new Error('در نسخه محلی فقط یکی از نشانی‌های ساختگی رزروشده قابل انتخاب است.');
  const nationalIdentifier=digits(input.nationalIdentifier);
  const registrationNumber=digits(input.registrationNumber);
  const postalCode=digits(input.postalCode);
  if(nationalIdentifier&&nationalIdentifier.length!==11)throw new Error('شناسه ملی شخصیت حقوقی باید ۱۱ رقم باشد.');
  if(registrationNumber&&(registrationNumber.length<3||registrationNumber.length>20))throw new Error('شماره ثبت معتبر نیست.');
  if(postalCode&&postalCode.length!==10)throw new Error('کد پستی باید ۱۰ رقم باشد.');
  if(nationalIdentifier&&!/^(\d)\1{10}$/.test(nationalIdentifier))throw new Error('نسخه محلی فقط شناسه ملی ساختگی با رقم‌های تکراری می‌پذیرد.');
  if(registrationNumber&&!/^(\d)\1{2,19}$/.test(registrationNumber))throw new Error('نسخه محلی فقط شماره ثبت ساختگی با رقم‌های تکراری می‌پذیرد.');
  if(postalCode&&!/^(\d)\1{9}$/.test(postalCode))throw new Error('نسخه محلی فقط کد پستی ساختگی با رقم‌های تکراری می‌پذیرد.');
  const registeredAt=isoDate(input.registeredAt);
  const officers=(input.officers??[]).map((item,index)=>{
    const officerName=compact(item.displayName);
    if(!officerName||officerName.length<2||officerName.length>120)throw new Error(`نام مدیر یا عضو ردیف ${index+1} معتبر نیست.`);
    if(!/^(مدیرعامل|رئیس|نایب‌رئیس|عضو|شریک|شخص) کاملاً ساختگی( [A-Za-z0-9-]+)?$/.test(officerName))throw new Error(`در نسخه محلی، نام مدیر یا عضو ردیف ${index+1} باید از الگوی رزروشده ساختگی استفاده کند.`);
    const nationalId=digits(item.nationalId);
    if(nationalId&&nationalId.length!==10)throw new Error(`کد ملی مدیر یا عضو ردیف ${index+1} باید ۱۰ رقم باشد.`);
    if(nationalId&&!/^(\d)\1{9}$/.test(nationalId))throw new Error(`نسخه محلی فقط کد ملی ساختگی با رقم‌های تکراری برای ردیف ${index+1} می‌پذیرد.`);
    const appointmentStartDate=isoDate(item.appointmentStartDate);
    const unlimitedTenure=Boolean(item.unlimitedTenure);
    const appointmentEndDate=unlimitedTenure?undefined:isoDate(item.appointmentEndDate);
    if(appointmentStartDate&&appointmentEndDate&&appointmentEndDate<appointmentStartDate)throw new Error(`تاریخ پایان مسئولیت ردیف ${index+1} نمی‌تواند پیش از شروع باشد.`);
    const shareAmountRial=digits(item.shareAmountRial);
    if(shareAmountRial&&BigInt(shareAmountRial)<=0n)throw new Error(`مبلغ سهم‌الشرکه ردیف ${index+1} باید مثبت باشد.`);
    return {id:compact(item.id),displayName:officerName,nationalId,role:item.role,appointmentStartDate,appointmentEndDate,unlimitedTenure,shareAmountRial};
  });
  for(const role of ['chief_executive','board_chair','board_vice_chair'] as const){
    if(officers.filter((item)=>item.role===role).length>1)throw new Error(`برای نقش «${LEGAL_ENTITY_OFFICER_ROLE_LABELS[role]}» فقط یک فرد فعال قابل ثبت است.`);
  }
  const existingIds=officers.map((item)=>item.id).filter((id):id is string=>Boolean(id));
  if(new Set(existingIds).size!==existingIds.length)throw new Error('شناسه یک مدیر یا عضو بیش از یک‌بار در فرم تکرار شده است.');
  return {displayName,legalForm:input.legalForm,nationalIdentifier,registrationNumber,registeredAt,registeredAddress,postalCode,officers};
}
