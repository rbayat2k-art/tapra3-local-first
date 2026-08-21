export function salesInvoiceLoadDependencies(options: {
  mode: 'sales' | 'financial_review';
  canCreate: boolean;
  canCreateOnBehalf: boolean;
  canRecordPayment: boolean;
  canManageInfrastructure: boolean;
}) {
  const isSales = options.mode === 'sales';
  return {
    customers: isSales && (options.canCreate || options.canCreateOnBehalf),
    sellers: isSales && (options.canCreate || options.canCreateOnBehalf),
    paymentInfrastructure: isSales && (options.canRecordPayment || options.canManageInfrastructure),
  };
}
