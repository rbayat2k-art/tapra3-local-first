import { describe, expect, it } from 'vitest';
import type { FoundationSalesInvoice } from '../api/contracts';
import { buildReservationCandidates, visibleWarehouseSections } from './operationalModel';

function invoice(overrides: Partial<FoundationSalesInvoice> = {}): FoundationSalesInvoice {
  return {
    id: 'invoice-1', code: 'INV-100', revision: 1, status: 'financially_approved', paymentStatus: 'paid',
    currency: 'IRR', subtotalAmount: '1000', discountAmount: '0', finalAmount: '1000', approvedPaymentAmount: '1000',
    salesApprovalRequired: false, supervisorApproval: null,
    sale: {
      id: 'sale-1', entryMode: 'direct', seller: { membershipId: 'membership-1', name: 'فروشنده' },
      actor: { userAccountId: 'user-1', name: 'فروشنده' },
      customer: { id: 'customer-1', canonicalIdentityId: 'identity-1', name: 'مشتری نمونه' }, leadId: null,
    },
    lines: [{
      id: 'line-1', lineNumber: 1, itemType: 'goods', catalogReference: 'SKU-1', itemName: 'کالای نمونه',
      quantity: 2, unitPrice: '500', discountAmount: '0', lineTotal: '1000', sourceType: 'manual_addition',
      fulfillmentStatus: 'eligible', snapshot: {},
    }],
    payments: [], history: [], createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('warehouse operational visibility', () => {
  it('does not expose mutation workspaces to a read-only persona', () => {
    expect(visibleWarehouseSections(['warehouse.read'])).toEqual(['warehouses', 'inventory']);
  });

  it('shows maker and checker sections independently from broad read access', () => {
    expect(visibleWarehouseSections(['warehouse.read', 'warehouse.adjustment.approve', 'warehouse.count.create']))
      .toEqual(['warehouses', 'inventory', 'adjustments', 'counts']);
  });
});

describe('warehouse reservation candidates', () => {
  it('returns only unreserved, financially approved and eligible goods lines', () => {
    const approved = invoice();
    const unpaid = invoice({ id: 'invoice-2', status: 'awaiting_payment' });
    const candidates = buildReservationCandidates([approved, unpaid], []);
    expect(candidates).toEqual([expect.objectContaining({ invoiceLineId: 'line-1', invoiceCode: 'INV-100', customerName: 'مشتری نمونه' })]);
    expect(buildReservationCandidates([approved], ['line-1'])).toEqual([]);
  });
});
