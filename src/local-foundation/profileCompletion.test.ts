import {describe, expect, it} from 'vitest';
import {isProfileComplete, missingProfileFields, normalizeCardNumber, validateRequiredProfile} from './profileCompletion';
import type {PersonnelRecord} from './model';

const completeProfile = {
  nationalId: '0013546783',
  gender: 'female',
  secondaryMobile: '09121234567',
  province: 'تهران',
  city: 'تهران',
  address: 'خیابان نمونه، پلاک ۱',
  postalCode: '',
  bankName: 'ملت',
  cardNumber: '6104337812345678',
} as const;

describe('mandatory personnel profile completion', () => {
  it('requires every approved field except postal code', () => {
    const missing = missingProfileFields({...completeProfile, nationalId: '', gender: 'unspecified', secondaryMobile: '', bankName: ''} as unknown as PersonnelRecord);
    expect(missing.map((field) => field.key)).toEqual(['nationalId', 'gender', 'secondaryMobile', 'bankName']);
    expect(missing.map((field) => String(field.key))).not.toContain('postalCode');
  });

  it('accepts a complete profile without postal code', () => {
    expect(validateRequiredProfile(completeProfile)).toEqual([]);
    expect(isProfileComplete(completeProfile as unknown as PersonnelRecord)).toBe(true);
  });

  it('normalizes Persian card digits and rejects invalid length', () => {
    expect(normalizeCardNumber('۶۱۰۴-۳۳۷۸-۱۲۳۴-۵۶۷۸')).toBe('6104337812345678');
    expect(validateRequiredProfile({...completeProfile, cardNumber: '1234'})).toContain('شماره کارت باید ۱۶ رقم باشد.');
  });

  it('requires a ten-digit national id in every personnel profile', () => {
    expect(validateRequiredProfile({...completeProfile, nationalId: '123'})).toContain('کد ملی باید ۱۰ رقم باشد.');
  });
});
