import {describe, expect, it} from 'vitest';
import {createSeedData, CUSTOMER_RECORDS, LOCAL_USERS, PERSONNEL_RECORDS} from './seed';
import {findDuplicateCustomers, nextPersonnelCode, normalizeDigits, normalizeIban, normalizeNationalId, normalizePhone} from './service';

describe('Phase B.2 local personnel and customer rules', () => {
  it('keeps personnel independent from user accounts', () => {
    const withoutAccount = PERSONNEL_RECORDS.find((person) => !person.linkedUserId);
    const endedPersonnel = PERSONNEL_RECORDS.find((person) => person.employmentStatus === 'ended');
    expect(withoutAccount).toBeDefined();
    expect(endedPersonnel).toBeDefined();
    expect(LOCAL_USERS.every((user) => Boolean(user.personnelId))).toBe(true);
    expect(PERSONNEL_RECORDS.length).toBeGreaterThan(LOCAL_USERS.length);
  });

  it('normalizes Persian contact and banking values', () => {
    expect(normalizeDigits('۱۲۳٤٥')).toBe('12345');
    expect(normalizePhone('+۹۸ ۹۱۲ ۱۲۳ ۴۵۶۷')).toBe('09121234567');
    expect(normalizeNationalId('۰۰۱-۳۵۴-۸۷۶۹')).toBe('0013548769');
    expect(normalizeIban('۶۲ ۰۵۴ ۰۱۷ ۲۲۱ ۰۳۴ ۵۶۷ ۸۹۰ ۱')).toBe('IR620540172210345678901');
  });

  it('generates the next personnel code from existing system codes', () => {
    expect(nextPersonnelCode([{personnelCode: 'P-1001'}, {personnelCode: 'QA-5098'}, {personnelCode: 'بدون-شماره'}])).toBe('P-5099');
    expect(nextPersonnelCode([])).toBe('P-1001');
  });

  it('detects duplicates by normalized phone without overwriting either record', () => {
    const target = CUSTOMER_RECORDS.find((item) => item.displayName.includes('ثبت دوم'))!;
    const candidates = findDuplicateCustomers(CUSTOMER_RECORDS, target, target.id);
    expect(candidates.some((item) => item.displayName === 'کیانا محمدی')).toBe(true);
    expect(CUSTOMER_RECORDS.filter((item) => item.displayName.includes('کیانا محمدی'))).toHaveLength(2);
  });

  it('includes operational stores in deterministic snapshots', () => {
    const data = createSeedData();
    expect(data.personnel).toHaveLength(PERSONNEL_RECORDS.length);
    expect(data.customers).toHaveLength(CUSTOMER_RECORDS.length);
    expect(data.customer_imports).toEqual([]);
  });
});
