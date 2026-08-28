import type {OperationalPayloadValue, OperationalRecord} from './model';

export type FinancialSourceModuleId = 'employee-advance' | 'purchase-request' | 'finance-request' | 'manual';

export interface FinancialReceiptInput {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface FinancialPaymentInput {
  paidAt: string;
  paymentReference: string;
  note: string;
  receipt?: FinancialReceiptInput;
  /** Assigned by the treasury service when the payment is first recorded. */
  financialDocumentNumber?: string;
  /** Gregorian fiscal month in YYYY-MM form, derived from paidAt. */
  fiscalPeriod?: string;
}

export interface FinancialObligation {
  schemaVersion: 1;
  currency: 'IRR';
  obligationId: string;
  sourceModuleId: FinancialSourceModuleId;
  sourceRecordId: string;
  amountRial: string;
  beneficiaryUserId?: string;
  beneficiaryPersonnelId?: string;
  beneficiaryName: string;
  beneficiaryCardNumber?: string;
  branchUnitId?: string;
  costCenterUnitId?: string;
}

export interface FinancialPaymentProgress {
  obligationCount: number;
  paidCount: number;
  totalRial: string;
  paidRial: string;
  complete: boolean;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
export const MAX_FINANCIAL_RECEIPT_SIZE = 5 * 1024 * 1024;

export function normalizeRialAmount(value: unknown): string {
  const normalized = String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(normalized)) throw new Error('مبلغ ریالی باید یک عدد صحیح و بدون علامت باشد.');
  return normalized.replace(/^0+(?=\d)/, '');
}

export function requirePositiveRialAmount(value: unknown): string {
  const normalized = normalizeRialAmount(value);
  if (BigInt(normalized) <= 0n) throw new Error('مبلغ باید بیشتر از صفر باشد.');
  return normalized;
}

export function normalizePaymentReference(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/\s+/g, '')
    .toLocaleUpperCase('en-US')
    .slice(0, 120);
}

export function paymentReferenceKey(companyId: string, reference: unknown): string | undefined {
  const normalized = normalizePaymentReference(reference);
  return normalized ? `${companyId}:${normalized}` : undefined;
}

export function validateFinancialPayment(input: FinancialPaymentInput): FinancialPaymentInput {
  const paidAt = input.paidAt.trim();
  const parsedDate = new Date(`${paidAt}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== paidAt) throw new Error('تاریخ پرداخت الزامی و باید معتبر باشد.');
  const paymentReference = normalizePaymentReference(input.paymentReference);
  const note = input.note.trim().slice(0, 1000);
  if (input.receipt) {
    if (!input.receipt.dataUrl || !input.receipt.fileName.trim() || input.receipt.size <= 0) throw new Error('فایل رسید پرداخت کامل نیست؛ فایل را دوباره انتخاب کنید یا رسید را خالی بگذارید.');
    if (input.receipt.size > MAX_FINANCIAL_RECEIPT_SIZE) throw new Error('حجم رسید پرداخت نباید بیشتر از ۵ مگابایت باشد.');
    if (!RECEIPT_TYPES.has(input.receipt.mimeType)) throw new Error('رسید پرداخت باید تصویر JPG، PNG، WEBP یا فایل PDF باشد.');
    if (!input.receipt.dataUrl.startsWith(`data:${input.receipt.mimeType};base64,`)) throw new Error('محتوای رسید پرداخت معتبر نیست.');
  }
  return {...input, paidAt, paymentReference, note, receipt: input.receipt ? {...input.receipt, fileName: input.receipt.fileName.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)} : undefined};
}

export function fiscalPeriodForPayment(paidAt: string): string {
  return validateFinancialPayment({paidAt, paymentReference: '', note: ''}).paidAt.slice(0, 7);
}

export function nextFinancialDocumentNumber(paidAt: string, existingNumbers: string[]): string {
  const year = fiscalPeriodForPayment(paidAt).slice(0, 4);
  const pattern = new RegExp(`^PAY-${year}-(\\d+)$`);
  const highest = existingNumbers.reduce((max, value) => {
    const match = pattern.exec(value);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PAY-${year}-${String(highest + 1).padStart(4, '0')}`;
}

function text(value: OperationalPayloadValue | undefined): string {return typeof value === 'string' ? value : '';}

export function readFinancialObligation(record: OperationalRecord): FinancialObligation {
  const raw = record.payload.financialObligation;
  const value = raw && !Array.isArray(raw) && typeof raw === 'object' ? raw : {};
  const sourceModuleId = text(value.sourceModuleId) as FinancialSourceModuleId;
  return {
    schemaVersion: 1,
    currency: 'IRR',
    obligationId: text(value.obligationId) || record.id,
    sourceModuleId: ['employee-advance','purchase-request','finance-request','manual'].includes(sourceModuleId) ? sourceModuleId : (text(record.payload.sourceModuleId) as FinancialSourceModuleId || 'manual'),
    sourceRecordId: text(value.sourceRecordId) || record.relatedRecordId || record.id,
    amountRial: requirePositiveRialAmount(text(value.amountRial) || record.amountRial || '0'),
    beneficiaryUserId: text(value.beneficiaryUserId) || undefined,
    beneficiaryPersonnelId: text(value.beneficiaryPersonnelId) || text(record.payload.beneficiaryPersonnelId) || undefined,
    beneficiaryName: text(value.beneficiaryName) || text(record.payload.beneficiaryName) || text(record.payload.beneficiaryLastName) || 'ذی‌نفع ثبت‌شده',
    beneficiaryCardNumber: text(value.beneficiaryCardNumber) || text(record.payload.beneficiaryCardNumber) || undefined,
    branchUnitId: text(value.branchUnitId) || record.branchUnitId,
    costCenterUnitId: text(value.costCenterUnitId) || record.unitId,
  };
}

export function readFinancialPaymentProgress(record: OperationalRecord): FinancialPaymentProgress | undefined {
  const raw = record.payload.financialPaymentProgress;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return undefined;
  const obligationCount = typeof raw.obligationCount === 'number' ? raw.obligationCount : Number(raw.obligationCount);
  const paidCount = typeof raw.paidCount === 'number' ? raw.paidCount : Number(raw.paidCount);
  const totalRial = text(raw.totalRial);
  const paidRial = text(raw.paidRial);
  if (!Number.isInteger(obligationCount) || !Number.isInteger(paidCount) || !/^\d+$/.test(totalRial) || !/^\d+$/.test(paidRial)) return undefined;
  return {obligationCount, paidCount, totalRial, paidRial, complete: raw.complete === true};
}

export function financialPaymentProgress(source: OperationalRecord, treasuryRecords: OperationalRecord[]): FinancialPaymentProgress {
  const obligations = treasuryRecords.filter((record) => record.moduleId === 'treasury-execution' && record.relatedRecordId === source.id);
  const paid = obligations.filter((record) => ['payment_recorded','verified','completed'].includes(record.status) && record.payload.payment);
  const total = obligations.reduce((sum, record) => sum + BigInt(requirePositiveRialAmount(record.amountRial ?? '0')), 0n);
  const paidTotal = paid.reduce((sum, record) => sum + BigInt(requirePositiveRialAmount(record.amountRial ?? '0')), 0n);
  const expected = BigInt(requirePositiveRialAmount(source.amountRial ?? '0'));
  return {obligationCount:obligations.length,paidCount:paid.length,totalRial:total.toString(),paidRial:paidTotal.toString(),complete:obligations.length>0&&paid.length===obligations.length&&total===expected&&paidTotal===expected};
}
