import {describe, expect, it} from 'vitest';
import {
  createDefaultSalesCompensationRecord, currentSalesCompensation, defaultSalesCompensation,
  orderedSalesCompensationHistory, validateSalesCompensationInput,
} from './salesCompensation';

describe('sales compensation policy', () => {
  it('seeds sellers with fixed salary plus 8 percent commission', () => {
    expect(defaultSalesCompensation('seller')).toEqual({
      mode: 'fixed_salary_plus_commission',
      monthlyFixedSalaryRial: '30000000',
      commissionPercent: '8',
    });
  });

  it.each(['sales_manager', 'senior_supervisor', 'sales_supervisor'] as const)('seeds %s with 1.5 percent commission', (level) => {
    expect(defaultSalesCompensation(level)).toEqual({mode: 'commission_only', commissionPercent: '1.5'});
  });

  it('keeps dated history append-only and resolves the currently effective version', () => {
    const initial = createDefaultSalesCompensationRecord({id: 'p-1', salesHierarchyLevel: 'seller', startDate: '2024-01-01'}, '2026-03-21T08:00:00.000Z')!;
    const future = {...initial, id: 'future', commissionPercent: '9', effectiveFrom: '2027-03-21', recordedAt: '2026-08-22T08:00:00.000Z'};
    const person = {salesCompensationHistory: [initial, future]};
    expect(currentSalesCompensation(person, new Date('2026-08-22T12:00:00.000Z'))?.commissionPercent).toBe('8');
    expect(orderedSalesCompensationHistory(person).map((item) => item.id)).toEqual(['future', initial.id]);
  });

  it('starts initial sales terms with employment for an initial sales role', () => {
    const initial = createDefaultSalesCompensationRecord({id: 'p-2', salesHierarchyLevel: 'seller', startDate: '2024-01-01'}, '2026-03-21T08:00:00.000Z')!;
    expect(initial.effectiveFrom).toBe('2024-01-01');
  });

  it('uses the independent assignment date when sales is a later secondary role', () => {
    const initial = createDefaultSalesCompensationRecord({id: 'p-3', salesHierarchyLevel: 'seller', startDate: '2024-01-01', salesAssignmentStartDate: '2026-08-22'}, '2026-08-22T08:00:00.000Z')!;
    expect(initial.effectiveFrom).toBe('2026-08-22');
  });

  it('requires the values needed by the selected payment mode', () => {
    expect(() => validateSalesCompensationInput({mode: 'fixed_salary_plus_commission', monthlyFixedSalaryRial: '', commissionPercent: '8', effectiveFrom: '2026-08-22', reason: 'حکم جدید'})).toThrow('مبلغ حقوق ثابت');
    expect(() => validateSalesCompensationInput({mode: 'commission_only', commissionPercent: '101', effectiveFrom: '2026-08-22', reason: 'حکم جدید'})).toThrow('حداکثر ۱۰۰');
  });
});
