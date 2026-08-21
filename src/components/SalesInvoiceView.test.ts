import { describe, it, expect } from 'vitest';
import { isInvoiceInUserTerritory, canActOnInvoice } from './SalesInvoiceView';
import type { SalesInvoice } from '../types';

function makeInvoice(overrides: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: 'inv_1', invoiceCode: 'INV-0001', revision: 1, customerId: 'cust_1',
    salespersonUserId: 'sp_1', salespersonUserName: 'فروشنده', lineItems: [],
    subtotal: 0, totalDiscount: 0, finalAmount: 0, paidAmount: 0, remainingAmount: 0,
    status: 'draft', declaredPayments: [], history: [], createdAt: 't0', updatedAt: 't0',
    ...overrides
  };
}

describe('isInvoiceInUserTerritory — Handler-level scope, not just a hidden button', () => {
  it('lets a salesperson act on their own invoice', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_1' });
    expect(isInvoiceInUserTerritory(invoice, { id: 'sp_1' }, false, new Set())).toBe(true);
  });

  it('rejects a salesperson touching another salesperson\'s invoice', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_1' });
    expect(isInvoiceInUserTerritory(invoice, { id: 'sp_2' }, false, new Set())).toBe(false);
  });

  it('lets the registrar (واحد ثبت) act on an invoice they personally registered, even for a different salesperson', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_1', registeredByUserId: 'entry_1' });
    expect(isInvoiceInUserTerritory(invoice, { id: 'entry_1' }, false, new Set())).toBe(true);
  });

  it('lets a supervisor act on an invoice belonging to a salesperson in their subtree', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_1' });
    expect(isInvoiceInUserTerritory(invoice, { id: 'sup_1' }, false, new Set(['sp_1']))).toBe(true);
  });

  it('rejects a supervisor touching an invoice outside their subtree', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_OUTSIDE' });
    expect(isInvoiceInUserTerritory(invoice, { id: 'sup_1' }, false, new Set(['sp_1', 'sp_2']))).toBe(false);
  });

  it('lets admin act on any invoice regardless of ownership or subtree', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_OUTSIDE' });
    expect(isInvoiceInUserTerritory(invoice, { id: 'admin_1' }, true, new Set())).toBe(true);
  });
});

describe('canActOnInvoice — permission + territory combined, the single gate every mutating Handler calls', () => {
  it('rejects when the user lacks the required permission, even inside their own territory (replaces the removed permission-less direct-register path)', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_1' });
    const result = canActOnInvoice(invoice, { id: 'sp_1' }, false, new Set(), false);
    expect(result.ok).toBe(false);
  });

  it('rejects when the user has the permission but the invoice is outside their territory', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_OTHER' });
    const result = canActOnInvoice(invoice, { id: 'sp_1' }, false, new Set(), true);
    expect(result.ok).toBe(false);
  });

  it('allows when the user has the permission and the invoice is in their territory', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_1' });
    const result = canActOnInvoice(invoice, { id: 'sp_1' }, false, new Set(), true);
    expect(result.ok).toBe(true);
  });

  it('admin bypasses both permission and territory checks unconditionally', () => {
    const invoice = makeInvoice({ salespersonUserId: 'sp_OTHER' });
    const result = canActOnInvoice(invoice, { id: 'admin_1' }, true, new Set(), false);
    expect(result.ok).toBe(true);
  });
});
