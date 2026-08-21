import { describe, expect, it } from 'vitest';
import {
  combinePortalDateTime,
  formatPortalAmount,
  formatPortalDate,
  formatPortalMoney,
  formatPortalTime,
  getPortalNowTimestamp,
  getPortalToday,
  isValidBankCard,
  isValidIranianIban,
  isValidIranianLandline,
  isValidIranianMobile,
  isValidPostalCode,
  normalizeBankCard,
  normalizeIranianIban,
  normalizeIranianLandline,
  normalizeIranianMobile,
  normalizePostalCode,
  splitPortalTimestamp,
  toLatinDigits
} from './operationalFormat';

describe('operational presentation contract', () => {
  it('formats monetary values with Latin digits and thousands separators', () => {
    expect(formatPortalAmount(10000000)).toBe('10,000,000');
    expect(formatPortalMoney('۱۲۳۴۵۶')).toBe('123,456 ریال');
  });

  it('normalizes Persian and Arabic digits without changing other text', () => {
    expect(toLatinDigits('۱۴۰۵/۰۵/۱۷')).toBe('1405/05/17');
    expect(toLatinDigits('١٢:٣٤')).toBe('12:34');
  });

  it('normalizes Jalali date and always emits seconds in time', () => {
    expect(formatPortalDate('۱۴۰۵/۵/۷')).toBe('1405/05/07');
    expect(formatPortalTime('۹:۳:۲')).toBe('09:03:02');
    expect(formatPortalTime('14:08')).toBe('14:08:00');
  });

  it('splits legacy display timestamps into adjacent report fields', () => {
    expect(splitPortalTimestamp('۱۴۰۵/۰۵/۱۷ - ۱۴:۲۹')).toEqual({
      date: '1405/05/17', time: '14:29:00', display: '1405/05/17 - 14:29:00'
    });
  });

  it('fills a missing legacy payment time from its recorded timestamp', () => {
    expect(combinePortalDateTime('1403/05/07', undefined, '1403/05/07 - 09:12')).toEqual({
      date: '1403/05/07', time: '09:12:00', display: '1403/05/07 - 09:12:00'
    });
  });

  it('formats ISO timestamps in Tehran-local Jalali form with seconds', () => {
    const result = splitPortalTimestamp('2026-08-09T10:20:30.000Z');
    expect(result).toEqual({ date: '1405/05/18', time: '13:50:30', display: '1405/05/18 - 13:50:30' });
    expect(getPortalToday(new Date('2026-08-09T10:20:30.000Z'))).toBe('1405/05/18');
    expect(getPortalNowTimestamp(new Date('2026-08-09T10:20:30.000Z'))).toBe('1405/05/18 - 13:50:30');
  });

  it('uses a safe placeholder for missing values', () => {
    expect(splitPortalTimestamp(undefined)).toEqual({ date: '—', time: '—', display: '—' });
  });

  it('enforces the product-wide mobile, landline, postal and banking lengths', () => {
    expect(normalizeIranianMobile('۰۹۱۲-۵۰۲۶۷۰۷')).toBe('09125026707');
    expect(isValidIranianMobile('09125026707')).toBe(true);
    expect(isValidIranianMobile('9125026707')).toBe(false);
    expect(normalizeIranianLandline('۰۲۱ ۵۶۱۷۴۶۸۰')).toBe('02156174680');
    expect(isValidIranianLandline('02156174680')).toBe(true);
    expect(isValidIranianLandline('09125026707')).toBe(false);
    expect(normalizeBankCard('6104-3378-1234-5678')).toBe('6104337812345678');
    expect(isValidBankCard('6104337812345678')).toBe(true);
    expect(normalizePostalCode('۳۷۱۶۶-۱۳۷۸۱')).toBe('3716613781');
    expect(isValidPostalCode('3716613781')).toBe(true);
    expect(isValidPostalCode('371661378')).toBe(false);
    expect(normalizeIranianIban('IR82 0540 1026 8002 0817 9090 02')).toBe('IR820540102680020817909002');
    expect(normalizeIranianIban('۸۲۰۵۴۰۱۰۲۶۸۰۰۲۰۸۱۷۹۰۹۰۰۲')).toBe('IR820540102680020817909002');
    expect(isValidIranianIban('IR820540102680020817909002')).toBe(true);
    expect(isValidIranianIban('IR82054010268002081790900')).toBe(false);
  });
});
