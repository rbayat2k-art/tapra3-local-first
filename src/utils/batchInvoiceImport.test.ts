import { describe, it, expect } from 'vitest';
import { resolveBatchInvoiceRows, BatchInvoiceRowInput } from './batchInvoiceImport';
import type { Customer, Product, ServiceCatalogItem, Promotion, SalesInvoice } from '../types';

const products: Product[] = [
  { id: 'p1', code: 'P-001', name: 'یخچال', category: 'x', unit: 'دستگاه', quantity: 10, purchasePrice: 100, salePrice: 1000, isActive: true }
];
const services: ServiceCatalogItem[] = [];
const promotions: Promotion[] = [];
const salesperson = { id: 'sp_1', fullName: 'فروشنده' };
const registeredBy = { id: 'entry_1', fullName: 'واحد ثبت' };

describe('resolveBatchInvoiceRows', () => {
  it('groups multiple rows sharing the same External Invoice Key into a single invoice', () => {
    const rows: BatchInvoiceRowInput[] = [
      { rowIndex: 1, externalInvoiceKey: 'EXT-1', customerPhone: '09121110001', customerName: 'مشتری یک', itemCode: 'P-001', quantity: 1 },
      { rowIndex: 2, externalInvoiceKey: 'EXT-1', customerPhone: '09121110001', customerName: 'مشتری یک', itemCode: 'P-001', quantity: 2 }
    ];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now');
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('created');
    expect(results[0].invoice!.lineItems).toHaveLength(2);
    expect(results[0].invoice!.finalAmount).toBe(3000);
  });

  it('processes each invoice group independently — one bad group does not stop the rest', () => {
    const rows: BatchInvoiceRowInput[] = [
      { rowIndex: 1, externalInvoiceKey: 'EXT-1', customerPhone: '09121110002', customerName: 'مشتری خوب', itemCode: 'P-001', quantity: 1 },
      { rowIndex: 2, externalInvoiceKey: 'EXT-2', customerPhone: '09121110003', customerName: 'مشتری بد', itemCode: 'UNKNOWN-CODE', quantity: 1 }
    ];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now');
    expect(results).toHaveLength(2);
    const good = results.find((r) => r.externalInvoiceKey === 'EXT-1')!;
    const bad = results.find((r) => r.externalInvoiceKey === 'EXT-2')!;
    expect(good.outcome).toBe('created');
    expect(bad.outcome).toBe('item_not_found');
  });

  it('attaches to an existing customer by exact phone match instead of creating a duplicate profile', () => {
    const existing: Customer[] = [{ id: 'cust_1', fullName: 'مشتری موجود', phone1: '09121110004', createdAt: 'x' }];
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-3', customerPhone: '09121110004', customerName: 'مشتری موجود', itemCode: 'P-001', quantity: 1 }];
    const { results } = resolveBatchInvoiceRows(rows, existing, products, services, promotions, [], salesperson, registeredBy, 'now');
    expect(results[0].outcome).toBe('created');
    expect(results[0].invoice!.customerId).toBe('cust_1');
  });

  it('prevents duplicate registration of the same External Invoice Key against already-imported invoices', () => {
    const existingInvoices: SalesInvoice[] = [{
      id: 'inv_1', invoiceCode: 'INV-0001', revision: 1, externalInvoiceKey: 'EXT-DUP', customerId: 'cust_1',
      salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [], subtotal: 0, totalDiscount: 0,
      finalAmount: 0, paidAmount: 0, remainingAmount: 0, status: 'registered', declaredPayments: [], history: [],
      createdAt: 'x', updatedAt: 'x'
    }];
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-DUP', customerPhone: '09121110005', itemCode: 'P-001', quantity: 1 }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, existingInvoices, salesperson, registeredBy, 'now');
    expect(results[0].outcome).toBe('duplicate');
  });

  it('creates immutable declared-payment rows on the imported invoice instead of a timeline-only amount', () => {
    const rows: BatchInvoiceRowInput[] = [
      { rowIndex: 1, externalInvoiceKey: 'EXT-4', customerPhone: '09121110006', customerName: 'مشتری', itemCode: 'P-001', quantity: 1, depositAmount: 300 },
      { rowIndex: 2, externalInvoiceKey: 'EXT-4', customerPhone: '09121110006', customerName: 'مشتری', itemCode: 'P-001', quantity: 1, depositAmount: 200 }
    ];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now');
    const invoice = results[0].invoice!;
    expect(invoice.declaredPayments).toHaveLength(2);
    expect(invoice.paidAmount).toBe(500);
    expect(invoice.remainingAmount).toBe(invoice.finalAmount - 500);
    expect(invoice.history.filter((h) => h.action === 'declared_payment_added')).toHaveLength(2);
  });

  it('sends a fully paid paper invoice directly to the supervisor without a registration approval gate', () => {
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-6', customerPhone: '09121110008', customerName: 'مشتری', itemCode: 'P-001', quantity: 1, depositAmount: 1000, depositDate: '1405/05/18' }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now');
    expect(results[0].invoice!.status).toBe('awaiting_supervisor_approval');
    expect(results[0].invoice!.registrationMode).toBe('on_behalf');
    expect(results[0].invoice!.saleOrigin).toBe('paper_offline');
  });

  it('keeps an unpaid or partially paid import as an editable open draft', () => {
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-OPEN', customerPhone: '09121110018', customerName: 'مشتری', itemCode: 'P-001', quantity: 1, depositAmount: 200, depositDate: '1405/05/18' }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now');
    expect(results[0].invoice!.status).toBe('draft');
    expect(results[0].invoice!.remainingAmount).toBe(800);
  });

  it('rejects payment rows whose date or time does not follow the portal format', () => {
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 2, externalInvoiceKey: 'EXT-DATE', customerPhone: '09121110012', customerName: 'مشتری', itemCode: 'P-001', quantity: 1 }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, '1405/05/18 - 12:00:00', [], [], [], {
      payments: [{ rowIndex: 2, externalInvoiceKey: 'EXT-DATE', amount: 1000, date: '1405-05-18', time: '25:00:00', method: 'card_to_card' }]
    });
    expect(results[0].outcome).toBe('error');
    expect(results[0].errorMessage).toContain('1405/05/18');
  });

  it('rejects a payment that points to an invoice key absent from the invoice/item sheets', () => {
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-8', customerPhone: '09121110019', customerName: 'مشتری', itemCode: 'P-001', quantity: 1 }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now', [], [], [], {
      payments: [{ rowIndex: 2, externalInvoiceKey: 'EXT-MISSING', amount: 1000, date: '1405/05/18', method: 'cash' }]
    });
    expect(results.some((result) => result.outcome === 'invalid_reference' && result.externalInvoiceKey === 'EXT-MISSING')).toBe(true);
  });

  it('splits a promotion row into its real goods/service line items instead of one fake goods row', () => {
    const promo: Promotion = {
      id: 'promo_1', code: 'PR-BATCH', title: 'بستهٔ تست', version: 1, coreItems: [
        { itemType: 'goods', itemId: 'p1', itemName: 'یخچال', quantity: 1 }
      ], basePrice: 1000, discountAmount: 100, finalPrice: 900, status: 'active', createdAt: 'x', createdByUserId: 'u', createdByUserName: 'u'
    };
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-7', customerPhone: '09121110009', customerName: 'مشتری', itemCode: 'PR-BATCH', quantity: 1 }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, [promo], [], salesperson, registeredBy, 'now');
    const invoice = results[0].invoice!;
    expect(invoice.lineItems).toHaveLength(1);
    expect(invoice.lineItems[0].itemType).toBe('goods');
    expect(invoice.lineItems[0].sourceType).toBe('promotion_core');
    expect(invoice.finalAmount).toBe(900);
  });

  it('marks the actual registeredBy separately from the salesperson on the created invoice', () => {
    const rows: BatchInvoiceRowInput[] = [{ rowIndex: 1, externalInvoiceKey: 'EXT-5', customerPhone: '09121110007', customerName: 'مشتری', itemCode: 'P-001', quantity: 1 }];
    const { results } = resolveBatchInvoiceRows(rows, [], products, services, promotions, [], salesperson, registeredBy, 'now');
    expect(results[0].invoice!.salespersonUserId).toBe('sp_1');
    expect(results[0].invoice!.registeredByUserId).toBe('entry_1');
  });
});
