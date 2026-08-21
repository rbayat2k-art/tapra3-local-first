import { describe, it, expect } from 'vitest';
import { isValidIranianMobile, isDuplicateImportJob, resolveRawContactImportRows, RawContactRowInput } from './rawContactImport';
import { normalizePhone } from './customerIdentity';
import type { Customer, ImportJob } from '../types';

function makeCustomer(id: string, phone: string, name: string): Customer {
  return {
    id, fullName: name, phone1: phone, createdAt: '۱۴۰۳/۰۱/۰۱',
    phoneEntries: [{ id: `${id}_p`, value: phone, normalizedValue: normalizePhone(phone), source: 'legacy_migration', recordedAt: '۱۴۰۳/۰۱/۰۱', recordedByUserId: 'u', recordedByName: 'x', isCustomerConfirmed: true, isCurrentPrimary: true }],
    nameEntries: [{ id: `${id}_n`, value: name, normalizedValue: name, source: 'legacy_migration', recordedAt: '۱۴۰۳/۰۱/۰۱', recordedByUserId: 'u', recordedByName: 'x', isCustomerConfirmed: true, isCurrentPrimary: true }]
  };
}

describe('isValidIranianMobile', () => {
  it('accepts a well-formed 11-digit mobile starting with 09', () => {
    expect(isValidIranianMobile('09121234567')).toBe(true);
  });
  it('rejects short numbers', () => {
    expect(isValidIranianMobile('0912123')).toBe(false);
  });
  it('rejects landline-shaped numbers (no leading 09)', () => {
    expect(isValidIranianMobile('02112345678')).toBe(false);
  });
  it('rejects non-numeric garbage after normalization', () => {
    expect(isValidIranianMobile(normalizePhone('abc'))).toBe(false);
  });
});

describe('isDuplicateImportJob', () => {
  const jobs: ImportJob[] = [{
    id: 'j1', idempotencyKey: 'file_100_5', sourceType: 'excel', importedByUserId: 'u', importedByUserName: 'u',
    importedAt: 'x', totalRows: 5, createdCount: 5, attachedCount: 0, conflictCount: 0, invalidPhoneCount: 0, duplicateInFileCount: 0, errorCount: 0, rows: []
  }];
  it('flags an identical idempotency key as duplicate', () => {
    expect(isDuplicateImportJob('file_100_5', jobs)).toBe(true);
  });
  it('allows a different idempotency key through', () => {
    expect(isDuplicateImportJob('file_100_6', jobs)).toBe(false);
  });
});

describe('resolveRawContactImportRows', () => {
  it('processes each row independently — one invalid row does not stop the rest', () => {
    const rows: RawContactRowInput[] = [
      { rowIndex: 1, phone: 'not-a-phone' },
      { rowIndex: 2, phone: '09121110001', name: 'مشتری جدید' }
    ];
    const decisions = resolveRawContactImportRows(rows, [], { createCustomerWhenNoMatch: false });
    expect(decisions).toHaveLength(2);
    expect(decisions[0].outcome).toBe('invalid_phone');
    expect(decisions[1].outcome).toBe('created');
  });

  it('detects a duplicate phone number within the same file — only the first occurrence is resolved', () => {
    const rows: RawContactRowInput[] = [
      { rowIndex: 1, phone: '09121110002', name: 'اول' },
      { rowIndex: 2, phone: '09121110002', name: 'دوم' }
    ];
    const decisions = resolveRawContactImportRows(rows, [], { createCustomerWhenNoMatch: false });
    expect(decisions[0].outcome).toBe('created');
    expect(decisions[1].outcome).toBe('duplicate_in_file');
    expect((decisions[1] as any).firstSeenRowIndex).toBe(1);
  });

  it('routes an exact-phone match with no name/address conflict to attached, not created', () => {
    const existing = [makeCustomer('cust_1', '09121110003', 'رضا احمدی')];
    const rows: RawContactRowInput[] = [{ rowIndex: 1, phone: '09121110003', name: 'رضا احمدی' }];
    const decisions = resolveRawContactImportRows(rows, existing, { createCustomerWhenNoMatch: false });
    expect(decisions[0].outcome).toBe('attached');
    expect((decisions[0] as any).targetCustomerId).toBe('cust_1');
  });

  it('routes a same-phone but conflicting-name row to conflict, never silently attaching', () => {
    const existing = [makeCustomer('cust_2', '09121110004', 'رضا احمدی')];
    const rows: RawContactRowInput[] = [{ rowIndex: 1, phone: '09121110004', name: 'یک نام کاملاً متفاوت و نامرتبط' }];
    const decisions = resolveRawContactImportRows(rows, existing, { createCustomerWhenNoMatch: false });
    expect(decisions[0].outcome).toBe('conflict');
    expect((decisions[0] as any).conflictingCustomerIds).toEqual(['cust_2']);
  });

  it('respects createCustomerWhenNoMatch=false — a fresh number is marked created but not flagged to build a profile', () => {
    const rows: RawContactRowInput[] = [{ rowIndex: 1, phone: '09121110005' }];
    const decisions = resolveRawContactImportRows(rows, [], { createCustomerWhenNoMatch: false });
    expect(decisions[0].outcome).toBe('created');
    expect((decisions[0] as any).willCreateCustomerProfile).toBe(false);
  });

  it('respects createCustomerWhenNoMatch=true — a fresh number is flagged to build a profile', () => {
    const rows: RawContactRowInput[] = [{ rowIndex: 1, phone: '09121110006' }];
    const decisions = resolveRawContactImportRows(rows, [], { createCustomerWhenNoMatch: true });
    expect(decisions[0].outcome).toBe('created');
    expect((decisions[0] as any).willCreateCustomerProfile).toBe(true);
  });
});
