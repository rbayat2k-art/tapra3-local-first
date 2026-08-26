import type {LocalUser, OperationalPayloadValue, OperationalRecord} from './model';

export type LetterDirection='internal'|'outgoing'|'incoming';
export type LetterAction='submit_review'|'approve'|'send';
export interface LetterAttachmentInput{fileName:string;mimeType:string;size:number;dataUrl:string}
export interface LetterInput{direction:LetterDirection;subject:string;body:string;recipientUserIds?:string[];externalParty?:string;attachment?:LetterAttachmentInput}

const LETTER_FILE_TYPES=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
export const MAX_LETTER_FILE_SIZE=10*1024*1024;
const text=(value:OperationalPayloadValue|undefined)=>typeof value==='string'?value:'';
const texts=(value:OperationalPayloadValue|undefined)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];

export function letterDirection(record:OperationalRecord):LetterDirection{const value=text(record.payload.direction);return value==='incoming'||value==='outgoing'?value:'internal';}
export function letterRecipientUserIds(record:OperationalRecord):string[]{return [...new Set(texts(record.payload.recipientUserIds))];}
export function letterExternalParty(record:OperationalRecord):string{return text(record.payload.externalParty);}
export function letterBody(record:OperationalRecord):string{return text(record.payload.body);}
export function letterAttachment(record:OperationalRecord):LetterAttachmentInput|undefined{const value=record.payload.attachment;if(!value||Array.isArray(value)||typeof value!=='object')return;const item=value as Record<string,OperationalPayloadValue>;const fileName=text(item.fileName),mimeType=text(item.mimeType),dataUrl=text(item.dataUrl),size=typeof item.size==='number'?item.size:0;return fileName&&mimeType&&dataUrl?{fileName,mimeType,dataUrl,size}:undefined;}
export function validateLetterAttachment(input:LetterAttachmentInput):LetterAttachmentInput{if(!LETTER_FILE_TYPES.has(input.mimeType))throw new Error('فرمت پیوست نامه پشتیبانی نمی‌شود.');if(!Number.isFinite(input.size)||input.size<=0)throw new Error('پیوست خالی قابل ثبت نیست.');if(input.size>MAX_LETTER_FILE_SIZE)throw new Error('حجم پیوست نامه بیشتر از ۱۰ مگابایت است.');const prefix=`data:${input.mimeType};base64,`;if(!input.dataUrl.startsWith(prefix)||input.dataUrl.length<=prefix.length)throw new Error('محتوای پیوست معتبر نیست.');const fileName=input.fileName.trim().replace(/[\\/:*?"<>|]/g,'-').slice(0,120);if(!fileName)throw new Error('نام پیوست معتبر نیست.');return {...input,fileName};}
export function isLetterParticipant(record:OperationalRecord,user:LocalUser):boolean{return record.companyId===user.companyId&&(record.createdByUserId===user.id||record.assigneeUserId===user.id||(record.status==='sent'&&letterRecipientUserIds(record).includes(user.id)));}
export function letterDirectionLabel(direction:LetterDirection):string{return direction==='incoming'?'وارده':direction==='outgoing'?'صادره':'داخلی';}
export function letterStatusLabel(status:string):string{return ({draft:'پیش‌نویس',in_review:'در حال بازبینی',approved_for_send:'مجوز ارسال صادر شده',sent:'ارسال‌شده',archived:'بایگانی‌شده'} as Record<string,string>)[status]??status;}
