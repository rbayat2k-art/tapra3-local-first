import type {OperationalPayloadValue, OperationalRecord, RecruitmentCandidateFile} from './model';
import {validatePersonnelDocumentFile} from './personnelDocuments';
import {digitsOnly, isValidIranianMobile, normalizeIranianMobile} from '../utils/operationalFormat';

export const RECRUITMENT_CANDIDATE_FILE_MAX_SIZE = 5 * 1024 * 1024;
export const RECRUITMENT_CANDIDATE_FILE_MAX_COUNT = 6;

export type RecruitmentCandidateFileKind = RecruitmentCandidateFile['kind'];

export interface RecruitmentCandidateFileInput {
  kind: RecruitmentCandidateFileKind;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface RecruitmentCandidateProfileInput {
  fullName: string;
  mobile: string;
  nationalId: string;
  email?: string;
  city?: string;
  unitId: string;
  branchUnitId?: string;
  positionTitle: string;
  educationLevel: string;
  educationField?: string;
  workExperienceYears: string;
  lastJobTitle?: string;
  skills: string;
  about: string;
  expectedSalaryRial?: string;
  availableFrom?: string;
  consent: boolean;
  files: RecruitmentCandidateFileInput[];
}

export interface RecruitmentCandidateDocumentMetadata {
  id: string;
  kind: RecruitmentCandidateFileKind;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: 'applicant' | 'hr';
  status: 'active' | 'replaced';
}

export const RECRUITMENT_CANDIDATE_FILE_CATALOG: Array<{kind: RecruitmentCandidateFileKind; label: string; repeatable: boolean}> = [
  {kind: 'resume', label: 'فایل رزومه', repeatable: false},
  {kind: 'education', label: 'مدرک تحصیلی', repeatable: true},
  {kind: 'work_certificate', label: 'گواهی سابقه کار', repeatable: true},
  {kind: 'portfolio', label: 'نمونه‌کار', repeatable: true},
  {kind: 'other', label: 'مدرک تکمیلی', repeatable: true},
];

export function candidateFileLabel(kind: RecruitmentCandidateFileKind): string {
  return RECRUITMENT_CANDIDATE_FILE_CATALOG.find((item) => item.kind === kind)?.label ?? 'مدرک متقاضی';
}

export function normalizeCandidateNationalId(value: string): string {
  return digitsOnly(value, 10);
}

export function isValidCandidateNationalId(value: string): boolean {
  const id = normalizeCandidateNationalId(value);
  if (!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id)) return false;
  const check = Number(id[9]);
  const remainder = id.slice(0, 9).split('').reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11;
  return (remainder < 2 ? remainder : 11 - remainder) === check;
}

export function normalizeRecruitmentCandidateProfile(input: RecruitmentCandidateProfileInput): RecruitmentCandidateProfileInput {
  return {
    ...input,
    fullName: input.fullName.trim().replace(/\s+/g, ' '),
    mobile: normalizeIranianMobile(input.mobile),
    nationalId: normalizeCandidateNationalId(input.nationalId),
    email: input.email?.trim().toLowerCase(),
    city: input.city?.trim(),
    unitId: input.unitId.trim(),
    branchUnitId: input.branchUnitId?.trim() || undefined,
    positionTitle: input.positionTitle.trim(),
    educationLevel: input.educationLevel.trim(),
    educationField: input.educationField?.trim(),
    workExperienceYears: digitsOnly(input.workExperienceYears, 2),
    lastJobTitle: input.lastJobTitle?.trim(),
    skills: input.skills.trim(),
    about: input.about.trim(),
    expectedSalaryRial: digitsOnly(input.expectedSalaryRial ?? '') || undefined,
    availableFrom: input.availableFrom?.trim() || undefined,
    files: input.files.map((file) => ({...file, fileName: file.fileName.trim()})),
  };
}

export function validateRecruitmentCandidateProfile(input: RecruitmentCandidateProfileInput): string[] {
  const errors: string[] = [];
  if (input.fullName.length < 3) errors.push('نام و نام خانوادگی را کامل وارد کنید.');
  if (!isValidIranianMobile(input.mobile)) errors.push('شماره همراه باید با ۰۹ شروع شود و ۱۱ رقم باشد.');
  if (!isValidCandidateNationalId(input.nationalId)) errors.push('کد ملی معتبر ۱۰ رقمی وارد کنید.');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.push('نشانی ایمیل معتبر نیست.');
  if (!input.unitId) errors.push('حوزه یا واحد شغلی را انتخاب کنید.');
  if (input.positionTitle.length < 2) errors.push('عنوان شغلی موردنظر را وارد کنید.');
  if (!input.educationLevel) errors.push('آخرین مقطع تحصیلی را انتخاب کنید.');
  if (input.skills.length < 3) errors.push('حداقل یک مهارت مرتبط را وارد کنید.');
  if (input.about.length < 20) errors.push('معرفی کوتاه و هدف شغلی باید حداقل ۲۰ نویسه باشد.');
  if (!input.consent) errors.push('تأیید نگهداری اطلاعات در بانک استعداد الزامی است.');
  if (input.files.length > RECRUITMENT_CANDIDATE_FILE_MAX_COUNT) errors.push(`حداکثر ${RECRUITMENT_CANDIDATE_FILE_MAX_COUNT.toLocaleString('fa-IR')} فایل قابل ثبت است.`);
  return errors;
}

export async function validateRecruitmentCandidateFiles(files: RecruitmentCandidateFileInput[]) {
  const validated: Array<RecruitmentCandidateFileInput & {checksumSha256: string}> = [];
  for (const file of files) {
    if (!RECRUITMENT_CANDIDATE_FILE_CATALOG.some((item) => item.kind === file.kind)) throw new Error('نوع مدرک متقاضی معتبر نیست.');
    if (file.size > RECRUITMENT_CANDIDATE_FILE_MAX_SIZE) throw new Error('حجم هر فایل باید حداکثر ۵ مگابایت باشد.');
    const result = await validatePersonnelDocumentFile('other', file);
    validated.push({...file, ...result});
  }
  return validated;
}

export function candidateDocuments(record: OperationalRecord): RecruitmentCandidateDocumentMetadata[] {
  const value = record.payload.candidateDocuments;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const data = item as Record<string, OperationalPayloadValue>;
    if (typeof data.id !== 'string' || typeof data.kind !== 'string' || typeof data.fileName !== 'string') return [];
    if (!RECRUITMENT_CANDIDATE_FILE_CATALOG.some((entry) => entry.kind === data.kind)) return [];
    return [{
      id: data.id,
      kind: data.kind as RecruitmentCandidateFileKind,
      label: typeof data.label === 'string' ? data.label : candidateFileLabel(data.kind as RecruitmentCandidateFileKind),
      fileName: data.fileName,
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : '',
      size: typeof data.size === 'number' ? data.size : 0,
      uploadedAt: typeof data.uploadedAt === 'string' ? data.uploadedAt : record.updatedAt,
      uploadedBy: data.uploadedBy === 'applicant' ? 'applicant' as const : 'hr' as const,
      status: data.status === 'replaced' ? 'replaced' as const : 'active' as const,
    }];
  });
}

export function candidateProfilePayload(input: RecruitmentCandidateProfileInput, documents: RecruitmentCandidateDocumentMetadata[], channel: 'applicant' | 'hr') {
  const hasResumeFile = documents.some((item) => item.kind === 'resume' && item.status === 'active');
  return {
    candidateName: input.fullName,
    candidateMobile: input.mobile,
    candidateNationalId: input.nationalId,
    candidateEmail: input.email ?? null,
    candidateCity: input.city ?? null,
    positionTitle: input.positionTitle,
    educationLevel: input.educationLevel,
    educationField: input.educationField ?? null,
    workExperienceYears: input.workExperienceYears || '0',
    lastJobTitle: input.lastJobTitle ?? null,
    candidateSkills: input.skills,
    candidateAbout: input.about,
    expectedSalaryRial: input.expectedSalaryRial ?? null,
    availableFrom: input.availableFrom ?? null,
    candidateConsent: true,
    candidateProfileChannel: channel,
    resumeStatus: hasResumeFile ? 'فرم و فایل رزومه تکمیل‌شده' : 'فرم رزومه تکمیل‌شده',
    documentsStatus: documents.length ? `${documents.filter((item) => item.status === 'active').length.toLocaleString('fa-IR')} فایل ثبت‌شده` : 'بدون فایل ضمیمه',
    candidateDocuments: documents as unknown as OperationalPayloadValue,
  };
}
