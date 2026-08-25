import type {PersonnelRecord, SalesCompensationMode, SalesCompensationRecord, SalesHierarchyLevel} from './model';

export interface SalesCompensationInput {
  mode: SalesCompensationMode;
  monthlyFixedSalaryRial?: string;
  commissionPercent?: string;
  effectiveFrom: string;
  reason: string;
}

export function defaultSalesCompensation(level?: SalesHierarchyLevel): Omit<SalesCompensationInput, 'effectiveFrom' | 'reason'> | undefined {
  if (level === 'seller') return {
    mode: 'fixed_salary_plus_commission',
    monthlyFixedSalaryRial: '30000000',
    commissionPercent: '8',
  };
  if (level === 'sales_manager' || level === 'senior_supervisor' || level === 'sales_supervisor') return {
    mode: 'commission_only',
    commissionPercent: '1.5',
  };
  return undefined;
}

export function salesAssignmentEffectiveStart(person: Pick<PersonnelRecord, 'startDate' | 'salesAssignmentStartDate'>): string {
  return person.salesAssignmentStartDate || person.startDate;
}

export function createDefaultSalesCompensationRecord(person: Pick<PersonnelRecord, 'id' | 'salesHierarchyLevel' | 'startDate' | 'salesAssignmentStartDate'>, recordedAt: string, actorId = 'system', actorName = 'داده پایه تیرا'): SalesCompensationRecord | undefined {
  const terms = defaultSalesCompensation(person.salesHierarchyLevel);
  if (!terms) return undefined;
  return {
    id: `sales-compensation-${person.id}-initial`,
    ...terms,
    commissionBasis: 'invoice_collection',
    effectiveFrom: salesAssignmentEffectiveStart(person),
    reason: 'شرایط مالی اولیه مصوب برای شبکه فروش',
    actorId,
    actorName,
    recordedAt,
  };
}

export function currentSalesCompensation(person?: Pick<PersonnelRecord, 'salesCompensationHistory'>, at = new Date()): SalesCompensationRecord | undefined {
  return [...(person?.salesCompensationHistory ?? [])]
    .filter((item) => {
      const date = new Date(`${item.effectiveFrom}T12:00:00`);
      return !Number.isNaN(date.getTime()) && date.getTime() <= at.getTime();
    })
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || right.recordedAt.localeCompare(left.recordedAt))[0];
}

export function orderedSalesCompensationHistory(person?: Pick<PersonnelRecord, 'salesCompensationHistory'>): SalesCompensationRecord[] {
  return [...(person?.salesCompensationHistory ?? [])]
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || right.recordedAt.localeCompare(left.recordedAt));
}

export function salesCompensationModeLabel(mode?: SalesCompensationMode): string {
  return ({
    fixed_salary: 'حقوق ثابت',
    commission_only: 'فقط پورسانت',
    fixed_salary_plus_commission: 'حقوق ثابت + پورسانت',
  } as Record<SalesCompensationMode, string>)[mode ?? 'fixed_salary'] ?? 'ثبت نشده';
}

export function validateSalesCompensationInput(input: SalesCompensationInput): void {
  const fixedRequired = input.mode === 'fixed_salary' || input.mode === 'fixed_salary_plus_commission';
  const commissionRequired = input.mode === 'commission_only' || input.mode === 'fixed_salary_plus_commission';
  const fixed = Number(input.monthlyFixedSalaryRial ?? 0);
  const commission = Number(input.commissionPercent ?? 0);
  if (!input.effectiveFrom) throw new Error('تاریخ شروع اجرای شرایط مالی الزامی است.');
  if (fixedRequired && (!Number.isFinite(fixed) || fixed <= 0)) throw new Error('مبلغ حقوق ثابت ماهانه را وارد کنید.');
  if (commissionRequired && (!Number.isFinite(commission) || commission <= 0 || commission > 100)) throw new Error('درصد پورسانت باید بیشتر از صفر و حداکثر ۱۰۰ باشد.');
  if (input.reason.trim().length < 3) throw new Error('دلیل تغییر شرایط مالی را ثبت کنید.');
}
