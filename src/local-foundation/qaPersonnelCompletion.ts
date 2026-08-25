import type {PersonnelRecord} from './model';

const normalizeDigits = (value?: string) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/\D/g, '');

export function isValidQaNationalId(value?: string): boolean {
  const id = normalizeDigits(value);
  if (!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id)) return false;
  const check = Number(id[9]);
  const remainder = id.slice(0, 9).split('').reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0) % 11;
  return (remainder < 2 ? remainder : 11 - remainder) === check;
}

function nationalIdFor(index: number): string {
  const body = String(100_000_000 + index).slice(-9);
  const remainder = body.split('').reduce((sum, digit, position) => sum + Number(digit) * (10 - position), 0) % 11;
  return `${body}${remainder < 2 ? remainder : 11 - remainder}`;
}

function uniqueNationalId(index: number, used: Set<string>): string {
  let attempt = index + 1;
  while (used.has(nationalIdFor(attempt))) attempt += 1;
  return nationalIdFor(attempt);
}

function uniqueMobile(prefix: '0914' | '0936', index: number, used: Set<string>): string {
  let attempt = index + 1;
  let value = `${prefix}${String(7_000_000 + attempt).slice(-7)}`;
  while (used.has(value)) { attempt += 1; value = `${prefix}${String(7_000_000 + attempt).slice(-7)}`; }
  return value;
}

/** Fill only missing/invalid required values with deterministic, visibly QA data. */
export function completeRequiredQaPersonnelRecords(records: PersonnelRecord[], reservedNationalIds: string[] = [], reservedMobiles: string[] = []): PersonnelRecord[] {
  const usedNationalIds = new Set(reservedNationalIds.map(normalizeDigits).filter(Boolean));
  const usedMobiles = new Set(reservedMobiles.map(normalizeDigits).filter(Boolean));
  return records.map((record, index) => {
    const normalizedNationalId = normalizeDigits(record.nationalId);
    const nationalId = isValidQaNationalId(normalizedNationalId) && !usedNationalIds.has(normalizedNationalId) ? normalizedNationalId : uniqueNationalId(index, usedNationalIds);
    usedNationalIds.add(nationalId);
    const normalizedPrimary = normalizeDigits(record.primaryMobile);
    const primaryMobile = /^09\d{9}$/.test(normalizedPrimary) && !usedMobiles.has(normalizedPrimary) ? normalizedPrimary : uniqueMobile('0914', index, usedMobiles);
    usedMobiles.add(primaryMobile);
    const normalizedSecondary = normalizeDigits(record.secondaryMobile);
    const secondaryMobile = /^09\d{9}$/.test(normalizedSecondary) && !usedMobiles.has(normalizedSecondary) ? normalizedSecondary : uniqueMobile('0936', index, usedMobiles);
    usedMobiles.add(secondaryMobile);
    const card = normalizeDigits(record.cardNumber);
    return {
      ...record,
      nationalId,
      gender: record.gender && record.gender !== 'unspecified' ? record.gender : index % 2 ? 'female' : 'male',
      primaryMobile,
      secondaryMobile,
      province: record.province?.trim() || 'تهران',
      city: record.city?.trim() || 'تهران',
      address: record.address?.trim() || `نشانی آزمایشی QA تیرا ـ ${record.personnelCode}`,
      bankName: record.bankName?.trim() || 'بانک آزمایشی تیرا',
      cardNumber: card.length === 16 ? card : `62198610${String(10_000_000 + index + 1).slice(-8)}`,
    };
  });
}
