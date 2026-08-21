import {describe, expect, it} from 'vitest';
import {formatPersianDate, toIsoDate} from './PersianDate';

describe('Persian calendar foundation', () => {
  it('formats stored Gregorian ISO dates in the Persian calendar', () => {
    expect(formatPersianDate('2025-03-21')).toBe('1404/01/01');
    expect(formatPersianDate('2026-08-19')).toBe('1405/05/28');
  });

  it('keeps the persisted date contract as Gregorian ISO', () => {
    expect(toIsoDate(new Date(2025, 2, 21, 12))).toBe('2025-03-21');
  });
});
