import {describe, expect, it} from 'vitest';
import {buildPersonnelExportData} from './PersonnelExport';
import type {FoundationState, PersonnelRecord} from './model';

describe('personnel Excel export', () => {
  it('places current assignment and branch-transfer history in dedicated columns', () => {
    const person: PersonnelRecord = {
      id: 'person-1', personnelCode: 'P-1001', firstName: 'علی', lastName: 'نمونه', gender: 'male', maritalStatus: 'single',
      primaryMobile: '09120000000', employmentStatus: 'active', employmentType: 'تمام‌وقت', startDate: '2024-03-20',
      unitId: 'unit-sales', positionId: 'position-specialist', branchUnitId: 'branch-new', salesHierarchyLevel: 'seller', salesAssignmentStartDate: '2025-03-21', createdAt: '2024-03-20T08:00:00.000Z', updatedAt: '2025-03-21T08:00:00.000Z',
      salesCompensationHistory: [{id: 'comp-1', mode: 'fixed_salary_plus_commission', monthlyFixedSalaryRial: '30000000', commissionPercent: '8', commissionBasis: 'invoice_collection', effectiveFrom: '2025-03-21', reason: 'شروع نقش فروش', actorId: 'actor-admin', actorName: 'ادمین', recordedAt: '2025-03-19T08:00:00.000Z'}],
      movements: [{id: 'move-1', kind: 'branch_transfer', fromId: 'branch-old', toId: 'branch-new', effectiveDate: '2025-03-21', previousEndedAt: '2025-03-20', newStartedAt: '2025-03-21', reason: 'انتقال محل استقرار', actorId: 'actor-admin', actorName: 'ادمین', recordedAt: '2025-03-19T08:00:00.000Z'}],
    };
    const state = {personnel: [person], units: [{id: 'unit-sales', name: 'فروش'}, {id: 'branch-old', name: 'شعبه قبلی'}, {id: 'branch-new', name: 'شعبه جدید'}], positions: [{id: 'position-specialist', title: 'کارشناس'}], users: []} as FoundationState;
    const result = buildPersonnelExportData(state, false);
    expect(result.personnelRows[0]['شعبه جدید در آخرین انتقال']).toBe('شعبه جدید');
    expect(result.personnelRows[0]['تاریخ انتقال/شروع شعبه جدید (شمسی)']).toBe('1404/01/01');
    expect(result.movementRows[0]['مقدار قبلی']).toBe('شعبه قبلی');
    expect(result.movementRows[0]['دلیل تغییر']).toBe('انتقال محل استقرار');
    expect(result.personnelRows[0]['تاریخ شروع نقش فروش (شمسی)']).toBe('1404/01/01');
    expect(result.personnelRows[0]['حقوق ثابت ماهانه فعلی (ریال)']).toBe('30000000');
    expect(result.compensationRows[0]['درصد پورسانت']).toBe('8');
    expect(result.compensationRows[0]['تاریخ شروع اجرای شرایط (شمسی)']).toBe('1404/01/01');
    expect(result.personnelRows[0]).not.toHaveProperty('شماره شبا');
  });
});
