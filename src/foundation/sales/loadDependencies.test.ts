import { describe, expect, it } from 'vitest';
import { salesInvoiceLoadDependencies } from './loadDependencies';

describe('sales invoice dependency loading', () => {
  it('does not request sales create dependencies for Financial Review', () => {
    expect(salesInvoiceLoadDependencies({
      mode: 'financial_review', canCreate: true, canCreateOnBehalf: true,
      canRecordPayment: true, canManageInfrastructure: true,
    })).toEqual({ customers: false, sellers: false, paymentInfrastructure: false });
  });

  it('loads the paper-entry seller list without Lead assignment authority', () => {
    expect(salesInvoiceLoadDependencies({
      mode: 'sales', canCreate: false, canCreateOnBehalf: true,
      canRecordPayment: false, canManageInfrastructure: false,
    })).toEqual({ customers: true, sellers: true, paymentInfrastructure: false });
  });
});
