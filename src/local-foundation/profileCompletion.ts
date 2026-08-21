import type {PersonnelRecord} from './model';
import {isValidBankCard, isValidIranianMobile, isValidPostalCode, normalizeBankCard} from '../utils/operationalFormat';

export const REQUIRED_PROFILE_FIELDS = [
  {key: 'nationalId', label: 'کد ملی'},
  {key: 'gender', label: 'جنسیت'},
  {key: 'secondaryMobile', label: 'شماره تماس دوم'},
  {key: 'province', label: 'استان'},
  {key: 'city', label: 'شهر'},
  {key: 'address', label: 'نشانی'},
  {key: 'bankName', label: 'نام بانک'},
  {key: 'cardNumber', label: 'شماره کارت'},
] as const;

export type RequiredProfileField = typeof REQUIRED_PROFILE_FIELDS[number]['key'];
export type ProfileCompletionInput = Pick<PersonnelRecord, RequiredProfileField> & Pick<PersonnelRecord, 'postalCode'>;

export function missingProfileFields(personnel?: PersonnelRecord): {key: RequiredProfileField; label: string}[] {
  if (!personnel) return REQUIRED_PROFILE_FIELDS.map((field) => ({...field}));
  return REQUIRED_PROFILE_FIELDS.filter((field) => {
    const value = personnel[field.key];
    if (field.key === 'gender') return value === 'unspecified' || !value;
    return typeof value !== 'string' || !value.trim();
  }).map((field) => ({...field}));
}

export function isProfileComplete(personnel?: PersonnelRecord): boolean {
  return Boolean(personnel) && missingProfileFields(personnel).length === 0;
}

export function normalizeCardNumber(value: string): string {
  return normalizeBankCard(value);
}

function normalizeNumerals(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function validateRequiredProfile(input: ProfileCompletionInput): string[] {
  const missing = missingProfileFields(input as PersonnelRecord).map((field) => `فیلد «${field.label}» الزامی است.`);
  const nationalId = normalizeNumerals(String(input.nationalId ?? '')).replace(/\D/g, '');
  if (nationalId && nationalId.length !== 10) missing.push('کد ملی باید ۱۰ رقم باشد.');
  const mobile = normalizeNumerals(String(input.secondaryMobile ?? '')).replace(/\D/g, '');
  if (mobile && !isValidIranianMobile(mobile)) missing.push('شماره تماس دوم باید ۱۱ رقم و با 09 شروع شود.');
  const card = normalizeCardNumber(String(input.cardNumber ?? ''));
  if (card && !isValidBankCard(card)) missing.push('شماره کارت باید ۱۶ رقم باشد.');
  const postalCode = String(input.postalCode ?? '').trim();
  if (postalCode && !isValidPostalCode(postalCode)) missing.push('کد پستی باید دقیقاً ۱۰ رقم باشد.');
  return missing;
}
