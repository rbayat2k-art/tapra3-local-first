import {describe, expect, it} from 'vitest';
import {
  isValidCandidateNationalId, normalizeRecruitmentCandidateProfile,
  validateRecruitmentCandidateFiles, validateRecruitmentCandidateProfile,
  type RecruitmentCandidateProfileInput,
} from './recruitmentCandidateProfile';

const validProfile = (): RecruitmentCandidateProfileInput => ({
  fullName:'متقاضی نمونه', mobile:'09121234567', nationalId:'1234567891', email:'candidate@example.test', city:'تهران',
  unitId:'unit-human-resources', positionTitle:'کارشناس منابع انسانی', educationLevel:'کارشناسی', educationField:'مدیریت',
  workExperienceYears:'3', lastJobTitle:'کارشناس اداری', skills:'اکسل، ارتباط سازمانی', about:'سه سال سابقه مرتبط دارم و علاقه‌مند به همکاری بلندمدت هستم.',
  consent:true, files:[],
});

describe('recruitment candidate resume contract', () => {
  it('normalizes applicant fields and validates Iranian identity inputs', () => {
    const profile=normalizeRecruitmentCandidateProfile({...validProfile(),fullName:'  متقاضی   نمونه  ',mobile:'۰۹۱۲۱۲۳۴۵۶۷'});
    expect(profile.fullName).toBe('متقاضی نمونه');
    expect(profile.mobile).toBe('09121234567');
    expect(isValidCandidateNationalId(profile.nationalId)).toBe(true);
    expect(validateRecruitmentCandidateProfile(profile)).toEqual([]);
  });

  it('rejects incomplete consent and malformed identity fields', () => {
    const errors=validateRecruitmentCandidateProfile({...validProfile(),mobile:'0912',nationalId:'1111111111',consent:false});
    expect(errors.join(' ')).toContain('شماره همراه');
    expect(errors.join(' ')).toContain('کد ملی');
    expect(errors.join(' ')).toContain('بانک استعداد');
  });

  it('accepts a real PDF signature and rejects disguised executable content', async () => {
    const pdf={kind:'resume' as const,fileName:'resume.pdf',mimeType:'application/pdf',size:5,dataUrl:'data:application/pdf;base64,JVBERi0='};
    await expect(validateRecruitmentCandidateFiles([pdf])).resolves.toMatchObject([{fileName:'resume.pdf',checksumSha256:expect.any(String)}]);
    await expect(validateRecruitmentCandidateFiles([{...pdf,dataUrl:'data:application/pdf;base64,TVqQAAMAAAAE'}])).rejects.toThrow();
  });
});
