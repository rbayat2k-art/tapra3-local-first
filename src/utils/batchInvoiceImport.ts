import {
  Customer, Product, ServiceCatalogItem, Promotion, SalesInvoice, SalesInvoiceLineItem,
  SalesOrgAssignment, SalesBranch, User, DeclaredPaymentMethod
} from '../types';
import { resolveIncomingCustomerData, IncomingCustomerData } from './customerIdentity';
import { addDeclaredPayment, buildDraftInvoice, splitPromotionIntoLineItems, submitInvoiceToSupervisor } from './salesInvoice';
import { buildSalesHierarchySnapshot } from './salesOrgStructure';

export interface BatchInvoiceRowInput {
  rowIndex: number;
  externalInvoiceKey: string;
  customerPhone: string;
  customerName?: string;
  province?: string;
  city?: string;
  address?: string;
  itemCode: string;
  quantity: number;
  discount?: number;
  // سازگاری با قالب تخت قدیمی؛ قالب سه‌شیتی از BatchPaymentRowInput استفاده می‌کند.
  depositAmount?: number;
  depositDate?: string;
  destinationAccount?: string;
  description?: string;
  registrationSheetImageUrl?: string;
}

export interface BatchPaymentRowInput {
  rowIndex: number;
  externalInvoiceKey: string;
  amount: number;
  date: string;
  time?: string;
  method: DeclaredPaymentMethod;
  trackingNumber?: string;
  destinationAccount?: string;
  receiptImageUrl?: string;
}

export interface BatchImportOptions {
  payments?: BatchPaymentRowInput[];
  batchImportId?: string;
  sourceFileName?: string;
}

export type BatchInvoiceGroupOutcome =
  | 'created' | 'conflict' | 'invalid_phone' | 'item_not_found' | 'duplicate' | 'invalid_reference' | 'error';

export interface BatchInvoiceGroupResult {
  externalInvoiceKey: string;
  rowIndexes: number[];
  outcome: BatchInvoiceGroupOutcome;
  invoice?: SalesInvoice;
  errorMessage?: string;
}

export interface BatchInvoiceResolution {
  results: BatchInvoiceGroupResult[];
  updatedCustomers: Customer[];
}

function findItem(code: string, products: Product[], services: ServiceCatalogItem[], promotions: Promotion[]) {
  const normalized = code.trim().toLocaleLowerCase('en-US');
  const product = products.find((item) => item.code.trim().toLocaleLowerCase('en-US') === normalized && item.isActive);
  if (product) return { kind: 'product' as const, item: product };
  const service = services.find((item) => item.code.trim().toLocaleLowerCase('en-US') === normalized && item.isActive);
  if (service) return { kind: 'service' as const, item: service };
  const promotion = promotions.find((item) => item.code.trim().toLocaleLowerCase('en-US') === normalized && item.status === 'active');
  if (promotion) return { kind: 'promotion' as const, item: promotion };
  return null;
}

function buildPaymentId(batchId: string, externalKey: string, rowIndex: number): string {
  return `pay_${batchId}_${externalKey}_${rowIndex}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function resolveBatchInvoiceRows(
  rows: BatchInvoiceRowInput[],
  allCustomers: Customer[],
  products: Product[],
  services: ServiceCatalogItem[],
  promotions: Promotion[],
  existingInvoices: SalesInvoice[],
  salesperson: { id: string; fullName: string; salesSupervisorId?: string },
  registeredBy: { id: string; fullName: string },
  now: string,
  salesOrgAssignments: SalesOrgAssignment[] = [],
  salesOrgUsers: User[] = [],
  salesOrgBranches: SalesBranch[] = [],
  options: BatchImportOptions = {}
): BatchInvoiceResolution {
  const snapshotResult = buildSalesHierarchySnapshot(salesperson.id, salesOrgAssignments, salesOrgUsers, salesOrgBranches, now);
  const salesHierarchySnapshot = snapshotResult.ok ? snapshotResult.snapshot : undefined;
  const batchImportId = options.batchImportId || `batch_${Date.now()}`;
  const groups = new Map<string, BatchInvoiceRowInput[]>();

  for (const row of rows) {
    const key = row.externalInvoiceKey.trim();
    if (!key) {
      groups.set(`__invalid_${row.rowIndex}`, [{ ...row, externalInvoiceKey: '' }]);
      continue;
    }
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const results: BatchInvoiceGroupResult[] = [];
  let workingCustomers = [...allCustomers];
  let workingInvoices = [...existingInvoices];

  for (const [groupKey, groupRows] of groups) {
    const externalInvoiceKey = groupRows[0].externalInvoiceKey.trim();
    const rowIndexes = groupRows.map((row) => row.rowIndex);
    try {
      if (!externalInvoiceKey) {
        results.push({ externalInvoiceKey: groupKey, rowIndexes, outcome: 'invalid_reference', errorMessage: 'کلید فاکتور خارجی الزامی است.' });
        continue;
      }
      if (workingInvoices.some((invoice) => invoice.externalInvoiceKey === externalInvoiceKey)) {
        results.push({ externalInvoiceKey, rowIndexes, outcome: 'duplicate', errorMessage: 'این کلید فاکتور خارجی قبلاً ثبت شده است.' });
        continue;
      }

      const first = groupRows[0];
      const inconsistentCustomer = groupRows.some((row) => row.customerPhone !== first.customerPhone);
      if (inconsistentCustomer) {
        results.push({ externalInvoiceKey, rowIndexes, outcome: 'invalid_reference', errorMessage: 'شماره مشتری در ردیف‌های یک فاکتور یکسان نیست.' });
        continue;
      }

      const lineItems: SalesInvoiceLineItem[] = [];
      let itemError = '';
      for (const row of groupRows) {
        const found = findItem(row.itemCode, products, services, promotions);
        if (!found) { itemError = `کد «${row.itemCode}» فعال یا معتبر نیست.`; break; }
        if (!Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.discount || 0) || (row.discount || 0) < 0) {
          itemError = `تعداد/تخفیف ردیف ${row.rowIndex} معتبر نیست.`;
          break;
        }
        if (found.kind === 'promotion') {
          if ((row.discount || 0) > 0) { itemError = `تخفیف افزوده روی پروموشن در ردیف ${row.rowIndex} مجاز نیست؛ قیمت نهایی خود پروموشن ملاک است.`; break; }
          lineItems.push(...splitPromotionIntoLineItems(found.item, products, services).map((line) => ({
            ...line,
            id: `${line.id}_${batchImportId}_${row.rowIndex}`,
            quantity: line.quantity * row.quantity,
            lineTotal: line.lineTotal * row.quantity
          })));
          continue;
        }
        const quantity = row.quantity;
        const discount = row.discount || 0;
        const lineTotal = quantity * found.item.salePrice - discount;
        if (lineTotal < 0) { itemError = `تخفیف ردیف ${row.rowIndex} از مبلغ ردیف بیشتر است.`; break; }
        lineItems.push({
          id: `li_${batchImportId}_${row.rowIndex}`,
          itemType: found.kind === 'product' ? 'goods' : 'service',
          productId: found.kind === 'product' ? found.item.id : undefined,
          serviceId: found.kind === 'service' ? found.item.id : undefined,
          name: found.item.name,
          quantity,
          unitPrice: found.item.salePrice,
          discount,
          lineTotal,
          sourceType: 'manual_addition'
        });
      }
      if (itemError) {
        results.push({ externalInvoiceKey, rowIndexes, outcome: 'item_not_found', errorMessage: itemError });
        continue;
      }

      const incoming: IncomingCustomerData = {
        phone: first.customerPhone,
        name: first.customerName,
        address: first.address,
        province: first.province,
        city: first.city
      };
      const identity = resolveIncomingCustomerData(incoming, workingCustomers);
      let customerId: string;
      let createdCustomer: Customer | null = null;
      if (identity.action === 'conflict_needs_review') {
        results.push({ externalInvoiceKey, rowIndexes, outcome: 'conflict', errorMessage: identity.reason });
        continue;
      }
      if (identity.action === 'attach_to_existing') {
        customerId = identity.targetCustomerId;
      } else {
        customerId = `cust_${batchImportId}_${first.rowIndex}`;
        createdCustomer = {
          id: customerId,
          fullName: first.customerName,
          phone1: first.customerPhone,
          address: first.address,
          province: first.province,
          city: first.city,
          createdAt: now,
          updatedAt: now,
          version: 1,
          phoneEntries: [{
            id: `phone_${customerId}`,
            value: first.customerPhone,
            normalizedValue: first.customerPhone,
            source: 'data_entry_unit',
            recordedAt: now,
            recordedByUserId: registeredBy.id,
            recordedByName: registeredBy.fullName,
            isCustomerConfirmed: false,
            isCurrentPrimary: true
          }],
          identityStatus: first.customerName ? 'complete' : 'incomplete',
          financialStatus: 'reconciled',
          contactStatus: 'needs_recall',
          contactPermissionStatus: 'allowed',
          complaintStatus: 'none',
          satisfactionStatus: 'unknown'
        };
      }

      let invoice: SalesInvoice = {
        ...buildDraftInvoice({
          customerId,
          externalInvoiceKey,
          salespersonUserId: salesperson.id,
          salespersonUserName: salesperson.fullName,
          salesSupervisorId: salesperson.salesSupervisorId,
          registeredByUserId: registeredBy.id,
          registeredByUserName: registeredBy.fullName,
          salesHierarchySnapshot,
          lineItems,
          registrationMode: 'on_behalf',
          saleOrigin: 'paper_offline'
        }, workingInvoices, now),
        batchImportId,
        batchSourceFileName: options.sourceFileName,
        batchSourceRowIndexes: rowIndexes,
        registrationSheetImageUrl: first.registrationSheetImageUrl
      };
      if (options.sourceFileName || first.description) {
        invoice = {
          ...invoice,
          history: [...invoice.history, {
            id: `${invoice.id}_h${invoice.history.length}`,
            action: 'batch_source_attached',
            byUserId: registeredBy.id,
            byUserName: registeredBy.fullName,
            at: now,
            note: [options.sourceFileName ? `فایل: ${options.sourceFileName}` : '', first.description || ''].filter(Boolean).join(' — ')
          }]
        };
      }

      const legacyPayments: BatchPaymentRowInput[] = groupRows
        .filter((row) => (row.depositAmount || 0) > 0)
        .map((row) => ({
          rowIndex: row.rowIndex,
          externalInvoiceKey,
          amount: row.depositAmount || 0,
          date: row.depositDate || now,
          method: 'other',
          destinationAccount: row.destinationAccount
        }));
      const explicitPaymentRows = (options.payments || []).filter((row) => row.externalInvoiceKey === externalInvoiceKey);
      const paymentRows = [...explicitPaymentRows, ...legacyPayments];
      let paymentError = '';
      for (const paymentRow of paymentRows) {
        if (!Number.isFinite(paymentRow.amount) || paymentRow.amount <= 0 || !paymentRow.date) {
          paymentError = `پرداخت ردیف ${paymentRow.rowIndex} معتبر نیست.`;
          break;
        }
        if (explicitPaymentRows.includes(paymentRow) && !/^\d{4}\/\d{2}\/\d{2}$/.test(paymentRow.date)) {
          paymentError = `تاریخ پرداخت ردیف ${paymentRow.rowIndex} باید با قالب 1405/05/18 ثبت شود.`;
          break;
        }
        if (explicitPaymentRows.includes(paymentRow) && paymentRow.time && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(paymentRow.time)) {
          paymentError = `ساعت پرداخت ردیف ${paymentRow.rowIndex} باید با قالب 12:30:00 ثبت شود.`;
          break;
        }
        const added = addDeclaredPayment(invoice, {
          id: buildPaymentId(batchImportId, externalInvoiceKey, paymentRow.rowIndex),
          amount: paymentRow.amount,
          date: paymentRow.date,
          time: paymentRow.time,
          method: paymentRow.method,
          trackingNumber: paymentRow.trackingNumber,
          destinationAccount: paymentRow.destinationAccount,
          receiptImageUrl: paymentRow.receiptImageUrl,
          recordedByUserId: registeredBy.id,
          recordedByUserName: registeredBy.fullName,
          recordedAt: now,
          status: 'declared'
        }, now);
        if (added.ok === false) { paymentError = added.reason; break; }
        invoice = added.invoice;
      }
      if (paymentError) {
        results.push({ externalInvoiceKey, rowIndexes, outcome: 'error', errorMessage: paymentError });
        continue;
      }

      // فاکتور کامل مستقیم به سرپرست می‌رود؛ فاکتور دارای مانده در Draft باز می‌ماند.
      const submitted = submitInvoiceToSupervisor(invoice, registeredBy, now);
      if (submitted.ok) invoice = submitted.invoice;

      if (createdCustomer) workingCustomers = [createdCustomer, ...workingCustomers];
      workingInvoices = [invoice, ...workingInvoices];
      results.push({ externalInvoiceKey, rowIndexes, outcome: 'created', invoice });
    } catch (error) {
      results.push({
        externalInvoiceKey: externalInvoiceKey || groupKey,
        rowIndexes,
        outcome: 'error',
        errorMessage: error instanceof Error ? error.message : 'خطای ناشناخته'
      });
    }
  }

  // Payments با کلید ناموجود باید در Preview دیده شوند، نه اینکه ساکت حذف شوند.
  const knownKeys = new Set(rows.map((row) => row.externalInvoiceKey));
  for (const payment of options.payments || []) {
    if (!knownKeys.has(payment.externalInvoiceKey)) {
      results.push({
        externalInvoiceKey: payment.externalInvoiceKey,
        rowIndexes: [payment.rowIndex],
        outcome: 'invalid_reference',
        errorMessage: 'پرداخت به کلید فاکتوری اشاره می‌کند که در Sheetهای Invoices/Items وجود ندارد.'
      });
    }
  }

  return { results, updatedCustomers: workingCustomers };
}
