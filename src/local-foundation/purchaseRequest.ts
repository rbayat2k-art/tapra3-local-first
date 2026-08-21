import type {FoundationState, OperationalPayloadValue, OperationalRecord} from './model';
import type {OperationalRecordInput} from './service';
import {isValidBankCard, normalizeBankCard} from '../utils/operationalFormat';

export interface PurchaseRequestLine {
  id: string;
  title: string;
  category: string;
  specification: string;
  quantity: string;
  unit: string;
  estimatedUnitPriceRial: string;
  preferredSupplier: string;
}

export interface PurchaseRequestQuotationAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
}

export interface PurchaseRequestAllocation {
  id: string;
  branchUnitId: string;
  costCenterUnitId: string;
  amountRial: string;
  note: string;
}

export interface PurchaseRequestPayload {
  requestDate: string;
  purchaseType: 'goods' | 'service' | 'mixed';
  deliveryLocation: string;
  lines: PurchaseRequestLine[];
  quotationAttachments: PurchaseRequestQuotationAttachment[];
  beneficiaryCardNumber: string;
  beneficiaryLastName: string;
  allocations: PurchaseRequestAllocation[];
}

const digits = (value: unknown) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

export function normalizePurchaseAmount(value: unknown): string {
  const normalized = digits(value).replace(/[٬,\s]/g, '');
  if (!normalized) return '0';
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, '') : '0';
}

export function purchaseLineTotal(line: PurchaseRequestLine): bigint {
  const quantity = digits(line.quantity).replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(quantity)) return 0n;
  const scaledQuantity = BigInt(Math.round(Number(quantity) * 1000));
  return scaledQuantity * BigInt(normalizePurchaseAmount(line.estimatedUnitPriceRial)) / 1000n;
}

export function purchaseRequestTotal(payload: PurchaseRequestPayload): bigint {
  return payload.lines.reduce((sum, line) => sum + purchaseLineTotal(line), 0n);
}

export function purchaseAllocationTotal(payload: PurchaseRequestPayload): bigint {
  return payload.allocations.reduce((sum, allocation) => sum + BigInt(normalizePurchaseAmount(allocation.amountRial)), 0n);
}

const safeArray = <T>(value: OperationalPayloadValue | undefined): T[] => Array.isArray(value) ? value as T[] : [];
const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function readPurchaseRequestPayload(payload: OperationalRecord['payload'] | undefined): PurchaseRequestPayload {
  const source = payload ?? {};
  return {
    requestDate: text(source.requestDate),
    purchaseType: source.purchaseType === 'service' || source.purchaseType === 'mixed' ? source.purchaseType : 'goods',
    deliveryLocation: text(source.deliveryLocation),
    lines: safeArray<Record<string, OperationalPayloadValue>>(source.lines).map((line, index) => ({
      id: text(line.id) || `line-${index + 1}`,
      title: text(line.title), category: text(line.category), specification: text(line.specification),
      quantity: text(line.quantity) || '1', unit: text(line.unit) || 'عدد',
      estimatedUnitPriceRial: text(line.estimatedUnitPriceRial), preferredSupplier: text(line.preferredSupplier),
    })),
    quotationAttachments: (() => {
      const attachments = safeArray<Record<string, OperationalPayloadValue>>(source.quotationAttachments).map((attachment, index) => ({
        id: text(attachment.id) || `quotation-attachment-${index + 1}`,
        fileName: text(attachment.fileName), mimeType: text(attachment.mimeType), size: number(attachment.size),
        dataUrl: text(attachment.dataUrl), uploadedAt: text(attachment.uploadedAt),
      }));
      if (attachments.length) return attachments;
      // Compatibility for requests created before quotations became real file attachments.
      return safeArray<Record<string, OperationalPayloadValue>>(source.quotations).map((quote, index) => ({
        id: text(quote.id) || `legacy-quotation-${index + 1}`,
        fileName: text(quote.reference) || text(quote.quoteNumber) || `پیش‌فاکتور قدیمی ${index + 1}`,
        mimeType: 'application/pdf', size: 0, dataUrl: '', uploadedAt: text(quote.quoteDate),
      }));
    })(),
    beneficiaryCardNumber: normalizeBankCard(text(source.beneficiaryCardNumber)),
    beneficiaryLastName: text(source.beneficiaryLastName),
    allocations: safeArray<Record<string, OperationalPayloadValue>>(source.allocations).map((allocation, index) => ({
      id: text(allocation.id) || `allocation-${index + 1}`, branchUnitId: text(allocation.branchUnitId),
      costCenterUnitId: text(allocation.costCenterUnitId), amountRial: text(allocation.amountRial), note: text(allocation.note),
    })),
  };
}

export function purchaseRequestValidationErrors(state: FoundationState, input: OperationalRecordInput): string[] {
  const payload = readPurchaseRequestPayload(input.payload);
  const errors: string[] = [];
  if (input.title.trim().length < 3) errors.push('عنوان درخواست خرید را کامل وارد کنید.');
  if ((input.description ?? '').trim().length < 5) errors.push('شرح نیاز یا دلیل خرید الزامی است.');
  if (!payload.requestDate) errors.push('تاریخ درخواست الزامی است.');
  if (!payload.lines.length) errors.push('حداقل یک ردیف خرید ثبت کنید.');
  payload.lines.forEach((line, index) => {
    const row = (index + 1).toLocaleString('en-US');
    if (!line.title.trim()) errors.push(`شرح ردیف ${row} الزامی است.`);
    if (!line.category.trim()) errors.push(`گروه خرید ردیف ${row} الزامی است.`);
    if (!line.unit.trim()) errors.push(`واحد سنجش ردیف ${row} الزامی است.`);
    if (!/^\d+(\.\d+)?$/.test(digits(line.quantity).replace(/,/g, '')) || Number(digits(line.quantity).replace(/,/g, '')) <= 0) errors.push(`مقدار ردیف ${row} باید بیشتر از صفر باشد.`);
    if (BigInt(normalizePurchaseAmount(line.estimatedUnitPriceRial)) <= 0n) errors.push(`قیمت حدودی ردیف ${row} الزامی است.`);
  });
  const total = purchaseRequestTotal(payload);
  if (total <= 0n) errors.push('مجموع برآورد درخواست باید بیشتر از صفر باشد.');
  if (!payload.allocations.length) errors.push('حداقل یک سهم شعبه و مرکز هزینه ثبت کنید.');
  const combinations = new Set<string>();
  payload.allocations.forEach((allocation, index) => {
    const row = (index + 1).toLocaleString('en-US');
    if (!state.units.some((unit) => unit.id === allocation.branchUnitId && unit.type === 'شعبه' && unit.status === 'active')) errors.push(`شعبه ردیف تخصیص ${row} معتبر نیست.`);
    if (!state.units.some((unit) => unit.id === allocation.costCenterUnitId && unit.type !== 'شعبه' && unit.status === 'active')) errors.push(`مرکز هزینه ردیف تخصیص ${row} معتبر نیست.`);
    if (BigInt(normalizePurchaseAmount(allocation.amountRial)) <= 0n) errors.push(`مبلغ سهم ردیف تخصیص ${row} باید بیشتر از صفر باشد.`);
    const key = `${allocation.branchUnitId}:${allocation.costCenterUnitId}`;
    if (combinations.has(key)) errors.push(`ترکیب شعبه و مرکز هزینه در ردیف ${row} تکراری است.`);
    combinations.add(key);
  });
  if (payload.allocations.length && purchaseAllocationTotal(payload) !== total) errors.push('مجموع سهم شعب و مراکز هزینه باید دقیقاً با مجموع ردیف‌های خرید برابر باشد.');
  if (!isValidBankCard(payload.beneficiaryCardNumber)) errors.push('شماره کارت دریافت‌کننده الزامی است و باید دقیقاً ۱۶ رقم باشد.');
  if (payload.beneficiaryLastName.trim().length < 2) errors.push('نام خانوادگی صاحب کارت الزامی است.');
  payload.quotationAttachments.forEach((attachment, index) => {
    if (!attachment.fileName.trim()) errors.push(`نام فایل پیش‌فاکتور ${(index + 1).toLocaleString('en-US')} معتبر نیست.`);
  });
  return [...new Set(errors)];
}

export function preparePurchaseRequestInput(state: FoundationState, input: OperationalRecordInput): OperationalRecordInput {
  const payload = readPurchaseRequestPayload(input.payload);
  const errors = purchaseRequestValidationErrors(state, {...input, payload: payload as unknown as OperationalRecord['payload']});
  if (errors.length) throw new Error(errors[0]);
  const total = purchaseRequestTotal(payload).toString();
  return {
    ...input,
    amountRial: total,
    quantity: String(payload.lines.length),
    branchUnitId: payload.allocations.length === 1 ? payload.allocations[0].branchUnitId : undefined,
    unitId: payload.allocations.length === 1 ? payload.allocations[0].costCenterUnitId : input.unitId,
    payload: payload as unknown as OperationalRecord['payload'],
  };
}

export function purchasePayloadForRecord(record: OperationalRecord): OperationalRecordInput {
  return {
    title: record.title, description: record.description, priority: record.priority, unitId: record.unitId,
    branchUnitId: record.branchUnitId, ownerPersonnelId: record.ownerPersonnelId, assigneeUserId: record.assigneeUserId,
    relatedRecordId: record.relatedRecordId, amountRial: record.amountRial, quantity: record.quantity,
    dueAt: record.dueAt, payload: record.payload,
  };
}
