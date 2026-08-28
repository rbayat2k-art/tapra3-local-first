import type {LegalDocumentMetadata, LegalNotice, LegalProceeding} from './model';

export interface LegalProceedingInput {
  caseId:string;
  authorityType:LegalProceeding['authorityType'];
  authorityName:string;
  stage:LegalProceeding['stage'];
  externalReferenceMasked?:string;
}

export interface LegalNoticeInput {
  caseId:string;
  proceedingId:string;
  noticeType:LegalNotice['noticeType'];
  issuedAt?:string;
  receivedAt:string;
  externalReferenceMasked?:string;
  deadline?:{dueAt:string;priority:'normal'|'high'|'critical';assigneeUserId:string};
  document?:{
    documentType:LegalDocumentMetadata['documentType'];
    classification:LegalDocumentMetadata['classification'];
    displayName:string;
    mimeType?:string;
    sizeBytes?:number;
    checksum?:string;
  };
}

const clean=(value:string,max:number)=>value.trim().replace(/\s+/g,' ').slice(0,max);
const iso=(value:string,label:string)=>{const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new Error(`${label} معتبر نیست.`);return new Date(parsed).toISOString();};
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
export function tehranEndOfDayIso(value:string):string{
  if(!dateOnly.test(value))return iso(value,'مهلت اقدام');
  const [year,month,day]=value.split('-').map(Number);const guess=Date.UTC(year,month-1,day,23,59,59,999);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const part=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find((item)=>item.type===type)?.value??0);const represented=Date.UTC(part('year'),part('month')-1,part('day'),part('hour'),part('minute'),part('second'),999);const offset=represented-guess;return new Date(guess-offset).toISOString();
}
const safeReference=(value?:string)=>{if(!value)return undefined;const normalized=clean(value,48);if(/\d{7,}/.test(normalized))throw new Error('شماره مرجع باید از ابتدا ماسک‌شده و بدون عدد کامل ثبت شود.');return normalized;};

export function normalizeLegalProceedingInput(input:LegalProceedingInput):LegalProceedingInput{
  const caseId=clean(input.caseId,96);const authorityName=clean(input.authorityName,120);
  if(!caseId||authorityName.length<2)throw new Error('پرونده و نام مرجع رسیدگی الزامی است.');
  return {...input,caseId,authorityName,externalReferenceMasked:safeReference(input.externalReferenceMasked)};
}

export function normalizeLegalNoticeInput(input:LegalNoticeInput):LegalNoticeInput{
  const caseId=clean(input.caseId,96);const proceedingId=clean(input.proceedingId,96);if(!caseId||!proceedingId)throw new Error('پرونده و روند دادرسی ابلاغ الزامی است.');
  const receivedAt=iso(input.receivedAt,'تاریخ دریافت');const issuedAt=input.issuedAt?iso(input.issuedAt,'تاریخ صدور'):undefined;
  if(issuedAt&&Date.parse(issuedAt)>Date.parse(receivedAt))throw new Error('تاریخ صدور نمی‌تواند پس از تاریخ دریافت باشد.');
  let deadline=input.deadline;if(deadline){const dueAt=tehranEndOfDayIso(deadline.dueAt);if(Date.parse(dueAt)<=Date.parse(receivedAt))throw new Error('مهلت اقدام باید پس از زمان دریافت باشد.');deadline={...deadline,dueAt,assigneeUserId:clean(deadline.assigneeUserId,96)};if(!deadline.assigneeUserId)throw new Error('مسئول مهلت الزامی است.');}
  let document=input.document;if(document){const displayName=clean(document.displayName,120);if(displayName.length<2)throw new Error('عنوان نمایشی سند الزامی است.');if(document.sizeBytes!==undefined&&(!Number.isSafeInteger(document.sizeBytes)||document.sizeBytes<0))throw new Error('اندازه سند معتبر نیست.');const checksum=document.checksum?.trim().toLowerCase();if(checksum&&!/^[a-f0-9]{64}$/.test(checksum))throw new Error('checksum سند باید SHA-256 معتبر باشد.');document={...document,displayName,mimeType:document.mimeType?clean(document.mimeType,80):undefined,checksum};}
  return {...input,caseId,proceedingId,issuedAt,receivedAt,externalReferenceMasked:safeReference(input.externalReferenceMasked),deadline,document};
}
