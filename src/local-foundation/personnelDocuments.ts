import type {LocalUser, OperationalRecord, PersonnelRecord} from './model';
import {missingProfileFields} from './profileCompletion';
import {authorize} from './authorization';

export const PERSONNEL_DOCUMENT_MAX_SIZE = 5 * 1024 * 1024;
export const PERSONNEL_DOCUMENT_PERMISSION_QUEUE = 'organization.personnel.documents.queue.view';
export const PERSONNEL_DOCUMENT_PERMISSION_READ = 'organization.personnel.documents.content.read';
export const PERSONNEL_DOCUMENT_PERMISSION_MANAGE = 'organization.personnel.documents.manage';

export type PersonnelDocumentKind =
  | 'birth_certificate_first'
  | 'birth_certificate_additional'
  | 'national_id_back'
  | 'residence_proof'
  | 'personnel_photo'
  | 'other';

export interface PersonnelDocumentDefinition {
  kind: PersonnelDocumentKind;
  label: string;
  description: string;
  required: boolean;
  repeatable: boolean;
  imageOnly?: boolean;
}

export interface PersonnelDocumentUploadInput {
  kind: PersonnelDocumentKind;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  replaceDocumentId?: string;
}

export interface ValidatedPersonnelDocumentFile {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  checksumSha256: string;
}

export type PersonnelVerificationLevel = 1 | 2 | 3 | 4;
export interface PersonnelVerificationSummary {
  level: PersonnelVerificationLevel;
  label: string;
  score: number;
  nextStep: string;
}

export const PERSONNEL_DOCUMENT_CATALOG: PersonnelDocumentDefinition[] = [
  {kind: 'birth_certificate_first', label: 'صفحه اول شناسنامه', description: 'تصویر یا PDF خوانا از صفحه اول شناسنامه', required: true, repeatable: false},
  {kind: 'national_id_back', label: 'پشت کارت ملی', description: 'تصویر یا PDF خوانا از پشت کارت ملی', required: true, repeatable: false},
  {kind: 'birth_certificate_additional', label: 'صفحات بعدی شناسنامه', description: 'صفحات توضیحات یا صفحات تکمیلی شناسنامه', required: false, repeatable: true},
  {kind: 'residence_proof', label: 'مدرک محل سکونت', description: 'قبض، اجاره‌نامه یا مدرک قابل استناد محل سکونت', required: false, repeatable: false},
  {kind: 'personnel_photo', label: 'عکس پرسنلی', description: 'عکس چهره با فرمت تصویری', required: false, repeatable: false, imageOnly: true},
  {kind: 'other', label: 'سایر مدارک', description: 'مدرک تکمیلی موردنیاز پرونده', required: false, repeatable: true},
];

export const REQUIRED_PERSONNEL_DOCUMENT_KINDS = PERSONNEL_DOCUMENT_CATALOG.filter((item) => item.required).map((item) => item.kind);

export function personnelDocumentDefinition(kind: PersonnelDocumentKind): PersonnelDocumentDefinition {
  const found = PERSONNEL_DOCUMENT_CATALOG.find((item) => item.kind === kind);
  if (!found) throw new Error('نوع مدرک پرسنلی معتبر نیست.');
  return found;
}

export function isPersonnelDocumentKind(value: unknown): value is PersonnelDocumentKind {
  return typeof value === 'string' && PERSONNEL_DOCUMENT_CATALOG.some((item) => item.kind === value);
}

export function activePersonnelDocuments(records: OperationalRecord[], personnelId: string): OperationalRecord[] {
  return records.filter((record) => record.moduleId === 'personnel-document'
    && record.ownerPersonnelId === personnelId
    && record.status === 'linked'
    && isPersonnelDocumentKind(record.payload.documentKind)
    && typeof record.payload.fileRef === 'string');
}

export function missingPersonnelDocuments(records: OperationalRecord[], personnelId: string): PersonnelDocumentDefinition[] {
  const present = new Set(activePersonnelDocuments(records, personnelId).map((record) => record.payload.documentKind as PersonnelDocumentKind));
  return PERSONNEL_DOCUMENT_CATALOG.filter((item) => item.required && !present.has(item.kind));
}

export function personnelCompletionSummary(personnel: PersonnelRecord | undefined, records: OperationalRecord[]) {
  const profileFields = missingProfileFields(personnel);
  const documents = personnel ? missingPersonnelDocuments(records, personnel.id) : PERSONNEL_DOCUMENT_CATALOG.filter((item) => item.required);
  return {profileFields, documents, complete: Boolean(personnel) && profileFields.length === 0 && documents.length === 0};
}

export function personnelVerificationSummary(personnel: PersonnelRecord | undefined, records: OperationalRecord[]): PersonnelVerificationSummary {
  const completion = personnelCompletionSummary(personnel, records);
  const active = personnel ? activePersonnelDocuments(records, personnel.id) : [];
  const kinds = new Set(active.map((record) => record.payload.documentKind));
  const fieldCompleted = Math.max(0, 8 - completion.profileFields.length);
  const requiredCompleted = Math.max(0, 2 - completion.documents.length);
  const enhancedCompleted = Number(kinds.has('personnel_photo')) + Number(kinds.has('residence_proof'));
  const score = Math.round(((fieldCompleted + requiredCompleted + enhancedCompleted) / 12) * 100);
  if (completion.profileFields.length) return {level: 1, label: 'شروع پرونده', score, nextStep: `تکمیل ${completion.profileFields.length.toLocaleString('fa-IR')} اطلاعات اجباری`};
  if (completion.documents.length) return {level: 2, label: 'اطلاعات کامل', score, nextStep: `بارگذاری ${completion.documents.map((item) => item.label).join(' و ')}`};
  if (!kinds.has('personnel_photo') || !kinds.has('residence_proof')) return {level: 3, label: 'هویت تکمیل', score, nextStep: 'افزودن عکس پرسنلی و مدرک محل سکونت برای پرونده کامل‌تر'};
  return {level: 4, label: 'پرونده تکمیلی', score: 100, nextStep: 'همه اطلاعات و مدارک پیشنهادی کامل است'};
}

export function mayViewPersonnelCompletion(user: LocalUser, personnel: PersonnelRecord, users: LocalUser[]): boolean {
  if (!user.permissions.includes(PERSONNEL_DOCUMENT_PERMISSION_QUEUE)) return false;
  const linkedUser = users.find((item) => item.id === personnel.linkedUserId || item.personnelId === personnel.id);
  const unitCompanyIds = [...new Set(users.filter((item) => item.unitId === personnel.unitId).map((item) => item.companyId))];
  const companyId = personnel.companyId ?? linkedUser?.companyId ?? (unitCompanyIds.length === 1 ? unitCompanyIds[0] : undefined);
  if (!companyId) return false;
  return authorize({persona: user, permission: PERSONNEL_DOCUMENT_PERMISSION_QUEUE, action: 'view', resource: {id: personnel.id, companyId, unitId: personnel.unitId, ownerId: linkedUser?.actorId, createdBy: 'system', state: personnel.employmentStatus}}).allowed;
}

const MIME_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

function bytesFromDataUrl(dataUrl: string): {mimeType: string; bytes: Uint8Array} {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('فایل انتخاب‌شده ساختار معتبری ندارد. دوباره فایل را انتخاب کنید.');
  let binary: string;
  try { binary = atob(match[2]); } catch { throw new Error('خواندن محتوای فایل ممکن نشد.'); }
  return {mimeType: match[1].toLowerCase(), bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0))};
}

function matchesSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'application/pdf') return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  if (mimeType === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

function safeFileName(value: string): string {
  const cleaned = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const unsafeControl = code <= 31 || code === 127;
    const unsafeDirectionMarker = (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    return unsafeControl || unsafeDirectionMarker || character === '\\' || character === '/' ? '' : character;
  }).join('').trim();
  if (!cleaned || cleaned.length > 180) throw new Error('نام فایل معتبر نیست.');
  return cleaned;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validatePersonnelDocumentFile(kind: PersonnelDocumentKind, input: Omit<PersonnelDocumentUploadInput, 'kind' | 'replaceDocumentId'>): Promise<ValidatedPersonnelDocumentFile> {
  const definition = personnelDocumentDefinition(kind);
  const fileName = safeFileName(input.fileName);
  const declaredMime = input.mimeType.toLowerCase();
  if (!MIME_EXTENSIONS[declaredMime]) throw new Error('فقط فایل PDF، JPG، PNG یا WebP مجاز است.');
  if (definition.imageOnly && !declaredMime.startsWith('image/')) throw new Error('عکس پرسنلی باید فایل تصویری باشد.');
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  if (!MIME_EXTENSIONS[declaredMime].includes(extension)) throw new Error('پسوند فایل با نوع محتوای آن سازگار نیست.');
  const {mimeType, bytes} = bytesFromDataUrl(input.dataUrl);
  if (mimeType !== declaredMime) throw new Error('نوع اعلام‌شده فایل با محتوای آن سازگار نیست.');
  if (!bytes.length || input.size <= 0) throw new Error('فایل خالی قابل ثبت نیست.');
  if (bytes.length !== input.size) throw new Error('اندازه اعلام‌شده فایل با محتوای آن سازگار نیست.');
  if (bytes.length > PERSONNEL_DOCUMENT_MAX_SIZE) throw new Error('حجم هر فایل باید حداکثر ۵ مگابایت باشد.');
  if (!matchesSignature(mimeType, bytes)) throw new Error('امضای فایل با فرمت انتخاب‌شده سازگار نیست.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {fileName, mimeType, size: bytes.length, dataUrl: input.dataUrl, checksumSha256: bytesToHex(new Uint8Array(digest))};
}
