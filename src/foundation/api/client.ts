import type {
  ApiErrorPayload,
  CreateFoundationCustomer,
  DuplicateCheckResult,
  FoundationCustomer,
  FoundationCustomerProfile,
  FoundationSession,
  CustomerImportAction,
  CustomerImportJob,
  CustomerIdentityMergeOperation,
  FoundationMembership,
  FoundationSalesInvoice,
  OrganizationScopeType,
  OrganizationSnapshot,
  SalesAssignee,
  SalesCallOutcome,
  SalesLead,
  SalesLeadDetail,
  SalesInvoiceLineInput,
  SalesMarketingLinkType,
  SalesPaymentInfrastructure,
  SalesPaymentMethod,
  InventoryReturnDisposition,
  InventoryTrackingMode,
  WarehouseLocationType,
  WarehouseOverview,
} from './contracts';

export class FoundationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'FoundationApiError';
  }
}

const exactErrorMessages: Record<string, string> = {
  invalid_credentials: 'ایمیل یا رمز عبور نادرست است.',
  invalid_current_password: 'رمز عبور فعلی نادرست است.',
  password_change_required: 'پیش از ادامه، رمز عبور موقت را تغییر دهید.',
  authentication_required: 'نشست شما پایان یافته است؛ دوباره وارد شوید.',
  active_context_required: 'ابتدا محیط کاری موردنظر را انتخاب کنید.',
  company_context_required: 'برای ورود به این بخش، ابتدا یک شرکت را انتخاب کنید.',
  warehouse_company_context_required: 'برای این عملیات، محیط شرکت یا نمای کل مجموعه را انتخاب کنید.',
  validation_failed: 'اطلاعات واردشده معتبر نیست؛ موارد فرم را بررسی کنید.',
  permission_denied: 'برای انجام این عملیات دسترسی لازم را ندارید.',
  organization_conflict: 'اطلاعات واردشده با یک رکورد موجود تداخل دارد.',
  customer_phone_conflict: 'این شماره تلفن با اطلاعات مشتری دیگری تداخل دارد.',
  customer_identity_conflict: 'اطلاعات هویتی مشتری با داده موجود تداخل دارد.',
  customer_not_found: 'مشتری موردنظر در محیط فعال یافت نشد.',
  sales_lead_not_found: 'سرنخ فروش موردنظر در محیط فعال یافت نشد.',
  sales_invoice_not_found: 'فاکتور موردنظر در محیط فعال یافت نشد.',
};

export function localizedFoundationError(status: number, code: string): string {
  if (exactErrorMessages[code]) return exactErrorMessages[code];
  if (code.includes('context_required')) return 'ابتدا محیط کاری مناسب را انتخاب کنید.';
  if (code.includes('scope_') || code.includes('_scope')) return 'این عملیات در محدوده دسترسی فعال مجاز نیست.';
  if (code.includes('permission') || code.includes('forbidden') || status === 403) return 'برای انجام این عملیات دسترسی لازم را ندارید.';
  if (code.includes('not_found') || status === 404) return 'مورد درخواستی در محیط فعال یافت نشد.';
  if (code.includes('duplicate') || code.includes('idempotency')) return 'این درخواست قبلاً ثبت شده یا با درخواست دیگری تداخل دارد.';
  if (code.includes('conflict') || code.includes('already_') || status === 409) return 'وضعیت فعلی با این عملیات سازگار نیست؛ اطلاعات را بازخوانی و دوباره بررسی کنید.';
  if (code.includes('invalid') || code.includes('required') || status === 400 || status === 415 || status === 413) {
    return 'اطلاعات واردشده معتبر یا کامل نیست؛ موارد فرم را بررسی کنید.';
  }
  if (status === 401) return 'نشست شما معتبر نیست؛ دوباره وارد شوید.';
  if (status >= 500) return 'سرویس در حال حاضر پاسخ‌گو نیست؛ کمی بعد دوباره تلاش کنید.';
  return 'درخواست انجام نشد؛ دوباره تلاش کنید.';
}

export function foundationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof FoundationApiError ? error.message : fallback;
}

async function request<T>(path: string, init: RequestInit = {}, csrfToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);

  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
    throw new FoundationApiError(
      response.status,
      payload.error?.code ?? 'request_failed',
      localizedFoundationError(response.status, payload.error?.code ?? 'request_failed'),
      payload.correlationId ?? payload.error?.correlationId,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const foundationApi = {
  login: (email: string, password: string) => request<FoundationSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  session: () => request<FoundationSession>('/auth/session'),
  logout: (csrfToken: string) => request<void>('/auth/logout', { method: 'POST' }, csrfToken),
  changePassword: (input: { currentPassword: string; newPassword: string }, csrfToken: string) => request<FoundationSession>('/auth/password', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  selectContext: (context: Pick<FoundationMembership, 'membershipId' | 'scope'>, csrfToken: string) => request<FoundationSession>('/session/context', {
    method: 'POST',
    body: JSON.stringify({ membershipId: context.membershipId, scopeType: context.scope.type, scopeId: context.scope.id }),
  }, csrfToken),
  readOrganization: () => request<{ organization: OrganizationSnapshot }>('/organization'),
  createCompany: (input: { code: string; name: string; description?: string; isActive?: boolean }, csrfToken: string) => request<{ company: OrganizationSnapshot['companies'][number] }>('/organization/companies', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateCompany: (id: string, input: { code: string; name: string; description?: string; isActive?: boolean }, csrfToken: string) => request<{ company: OrganizationSnapshot['companies'][number] }>(`/organization/companies/${id}`, { method: 'PUT', body: JSON.stringify(input) }, csrfToken),
  createOrganizationUnit: (input: { companyId?: string; parentId?: string; type: OrganizationSnapshot['units'][number]['type']; code: string; name: string; description?: string; serviceKind?: 'HR' | 'DATA' | 'MIS' | 'OTHER'; isActive?: boolean }, csrfToken: string) => request<{ unit: OrganizationSnapshot['units'][number] }>('/organization/units', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateOrganizationUnit: (id: string, input: { companyId?: string; parentId?: string; type: OrganizationSnapshot['units'][number]['type']; code: string; name: string; description?: string; serviceKind?: 'HR' | 'DATA' | 'MIS' | 'OTHER'; isActive?: boolean }, csrfToken: string) => request<{ unit: OrganizationSnapshot['units'][number] }>(`/organization/units/${id}`, { method: 'PUT', body: JSON.stringify(input) }, csrfToken),
  createOrganizationUser: (input: { fullName: string; email: string; companyId?: string }, csrfToken: string) => request<{ account: OrganizationSnapshot['users'][number] & { membership: OrganizationSnapshot['memberships'][number] }; temporaryPassword: string }>('/organization/users', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateOrganizationUserStatus: (id: string, isActive: boolean, csrfToken: string) => request<{ account: { id: string; isActive: boolean } }>(`/organization/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, csrfToken),
  createMembership: (input: { personId: string; companyId?: string }, csrfToken: string) => request<{ membership: OrganizationSnapshot['memberships'][number] }>('/organization/memberships', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateMembershipStatus: (id: string, status: 'active' | 'suspended' | 'ended', csrfToken: string) => request<{ membership: OrganizationSnapshot['memberships'][number] }>(`/organization/memberships/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, csrfToken),
  createRole: (input: { code: string; name: string; description?: string; permissionCodes: string[] }, csrfToken: string) => request<{ role: OrganizationSnapshot['roles'][number] }>('/organization/roles', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  assignRole: (input: { membershipId: string; roleId: string; scopeType: OrganizationScopeType; scopeId?: string; validUntil?: string }, csrfToken: string) => request<{ assignment: OrganizationSnapshot['assignments'][number] }>('/organization/role-assignments', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  revokeRole: (id: string, reason: string, csrfToken: string) => request<void>(`/organization/role-assignments/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }, csrfToken),
  startImpersonation: (input: { targetUserAccountId: string; targetMembershipId: string; targetScopeType: OrganizationScopeType; targetScopeId: string; reason: string; durationMinutes: number }, csrfToken: string) => request<FoundationSession>('/impersonation/start', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  stopImpersonation: (reason: string, csrfToken: string) => request<FoundationSession>('/impersonation/stop', { method: 'POST', body: JSON.stringify({ reason }) }, csrfToken),
  listCustomers: () => request<{ customers: FoundationCustomer[] }>('/customers'),
  readCustomer: (customerId: string) => request<{ customer: FoundationCustomerProfile }>(`/customers/${customerId}`),
  createCustomer: (input: CreateFoundationCustomer, csrfToken: string) => request<{ customer: FoundationCustomerProfile }>('/customers', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  checkCustomerDuplicates: (input: { phone: string; fullName?: string }, csrfToken: string) => request<DuplicateCheckResult>('/customers/duplicates/check', {
    method: 'POST',
    body: JSON.stringify(input),
  }, csrfToken),
  addCustomerPhone: (customerId: string, input: { value: string; label?: string; isPrimary?: boolean }, csrfToken: string) => request<{ customer: FoundationCustomerProfile }>(`/customers/${customerId}/phones`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  addCustomerAddress: (customerId: string, input: { province?: string; city?: string; addressText: string; postalCode?: string; label?: string; isPrimary?: boolean }, csrfToken: string) => request<{ customer: FoundationCustomerProfile }>(`/customers/${customerId}/addresses`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  mergeCustomers: (input: { customerId: string; targetCustomerId: string; reason: string }, csrfToken: string) => request<{ operationId: string; canonicalCustomer: FoundationCustomerProfile }>('/customers/merge', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  unmergeCustomers: (operationId: string, reason: string, csrfToken: string) => request<{ canonicalCustomer: FoundationCustomerProfile; restoredCustomer: FoundationCustomerProfile }>(`/customers/merges/${operationId}/unmerge`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }, csrfToken),
  mergeCustomerIdentities: (input: { identityId: string; targetIdentityId: string; reason: string }, csrfToken: string) => request<{ operation: CustomerIdentityMergeOperation }>('/customer-identities/merge', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  unmergeCustomerIdentity: (operationId: string, reason: string, csrfToken: string) => request<{ operation: CustomerIdentityMergeOperation }>(`/customer-identities/merges/${operationId}/unmerge`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }, csrfToken),
  listCustomerImports: () => request<{ imports: CustomerImportJob[] }>('/customer-imports'),
  readCustomerImport: (jobId: string) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}`),
  stageCustomerImport: (file: File, csv: string, sourceName: string, csrfToken: string) => request<{ import: CustomerImportJob }>('/customer-imports', {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'idempotency-key': crypto.randomUUID(),
      'x-file-name': file.name,
      'x-import-source': encodeURIComponent(sourceName),
    },
    body: csv,
  }, csrfToken),
  applySafeCustomerImportDecisions: (jobId: string, csrfToken: string) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}/apply-safe-decisions`, {
    method: 'POST', body: JSON.stringify({}),
  }, csrfToken),
  decideCustomerImportRecord: (
    jobId: string, recordId: string,
    decision: { action: CustomerImportAction; targetCustomerId?: string; targetRecordId?: string },
    csrfToken: string,
  ) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}/records/${recordId}/decision`, {
    method: 'PUT', body: JSON.stringify(decision),
  }, csrfToken),
  approveCustomerImport: (jobId: string, csrfToken: string) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}/approve`, {
    method: 'POST', body: JSON.stringify({}),
  }, csrfToken),
  listSalesLeads: () => request<{ leads: SalesLead[] }>('/sales/leads'),
  readSalesLead: (leadId: string) => request<{ lead: SalesLeadDetail }>(`/sales/leads/${leadId}`),
  listSalesAssignees: () => request<{ assignees: SalesAssignee[] }>('/sales/assignees'),
  listSaleSellers: () => request<{ sellers: SalesAssignee[] }>('/sales/sellers'),
  createSalesLead: (input: {
    customerId: string; source: string; declaredInterest: string; priority: 'low' | 'normal' | 'high';
    campaignReference?: string; promotionReference?: string; context?: Record<string, unknown>;
  }, csrfToken: string) => request<{ lead: SalesLeadDetail }>('/sales/leads', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  assignSalesLead: (leadId: string, input: { targetMembershipId: string; reason?: string }, csrfToken: string) =>
    request<{ lead: SalesLeadDetail }>(`/sales/leads/${leadId}/assignments`, {
      method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
    }, csrfToken),
  linkSalesMarketingContext: (leadId: string, input: {
    type: SalesMarketingLinkType; referenceCode: string; displayName?: string; context?: Record<string, unknown>;
  }, csrfToken: string) => request<{ lead: SalesLeadDetail }>(`/sales/leads/${leadId}/marketing-links`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  recordSalesCall: (leadId: string, input: {
    outcome: SalesCallOutcome; startedAt: string; note?: string; callbackAt?: string; context?: Record<string, unknown>;
  }, csrfToken: string) => request<{ lead: SalesLeadDetail }>(`/sales/leads/${leadId}/calls`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  listSalesInvoices: () => request<{ invoices: FoundationSalesInvoice[] }>('/sales/invoices'),
  readSalesInvoice: (invoiceId: string) => request<{ invoice: FoundationSalesInvoice }>(`/sales/invoices/${invoiceId}`),
  getSalesPaymentInfrastructure: () => request<SalesPaymentInfrastructure>('/sales/payment-infrastructure'),
  createSalesCollectionAccount: (input: {
    displayName: string; bankName: string; maskedReference: string; isActive?: boolean;
  }, csrfToken: string) => request<{ account: SalesPaymentInfrastructure['accounts'][number] }>('/sales/collection-accounts', {
    method: 'POST', body: JSON.stringify(input),
  }, csrfToken),
  updateSalesCollectionAccount: (accountId: string, input: {
    displayName: string; bankName: string; maskedReference: string; isActive?: boolean;
  }, csrfToken: string) => request<{ account: SalesPaymentInfrastructure['accounts'][number] }>(`/sales/collection-accounts/${accountId}`, {
    method: 'PUT', body: JSON.stringify(input),
  }, csrfToken),
  updateSalesApprovalPolicy: (required: boolean, csrfToken: string) => request<{
    policy: SalesPaymentInfrastructure['salesApprovalPolicy'];
  }>('/sales/settings/supervisor-approval', {
    method: 'PUT', body: JSON.stringify({ required }),
  }, csrfToken),
  createSaleAndInvoice: (input: {
    customerId: string;
    leadId?: string;
    entryMode: 'direct' | 'paper_entry';
    sellerMembershipId?: string;
    source?: Record<string, unknown>;
    lines: SalesInvoiceLineInput[];
  }, csrfToken: string) => request<{ invoice: FoundationSalesInvoice }>('/sales/sales', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  reviseSalesInvoice: (invoiceId: string, input: {
    lines: SalesInvoiceLineInput[]; reason?: string;
  }, csrfToken: string) => request<{ invoice: FoundationSalesInvoice }>(`/sales/invoices/${invoiceId}`, {
    method: 'PUT', body: JSON.stringify(input),
  }, csrfToken),
  approveSalesInvoice: (invoiceId: string, csrfToken: string) => request<{ invoice: FoundationSalesInvoice }>(`/sales/invoices/${invoiceId}/supervisor-approval`, {
    method: 'POST', body: JSON.stringify({}),
  }, csrfToken),
  recordSalesPayment: (invoiceId: string, input: {
    amount: string;
    paymentMethod: Exclude<SalesPaymentMethod, 'payment_gateway'>;
    occurredAt: string;
    lastFourDigits?: string;
    destinationAccountId: string;
    trackingNumber: string;
    receiptReference?: string;
    correctsPaymentId?: string;
  }, csrfToken: string) => request<{ invoice: FoundationSalesInvoice }>(`/sales/invoices/${invoiceId}/payments`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  reviewSalesPayment: (invoiceId: string, paymentId: string, input: {
    decision: 'approved' | 'needs_correction'; reason?: string;
  }, csrfToken: string) => request<{ invoice: FoundationSalesInvoice }>(`/sales/invoices/${invoiceId}/payments/${paymentId}/review`, {
    method: 'POST', body: JSON.stringify(input),
  }, csrfToken),
  readWarehouse: () => request<{ warehouse: WarehouseOverview }>('/warehouse'),
  createWarehouse: (input: { ownerCompanyId?: string; operatorUnitId?: string; code: string; name: string; description?: string }, csrfToken: string) =>
    request<{ warehouse: WarehouseOverview['warehouses'][number] }>('/warehouse/warehouses', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  createWarehouseLocation: (warehouseId: string, input: { code: string; name: string; locationType: WarehouseLocationType }, csrfToken: string) =>
    request<{ location: WarehouseOverview['locations'][number] }>(`/warehouse/warehouses/${warehouseId}/locations`, { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  createInventoryItem: (input: { sku: string; name: string; catalogReference: string; trackingMode: InventoryTrackingMode; uom: string }, csrfToken: string) =>
    request<{ item: WarehouseOverview['items'][number] }>('/warehouse/items', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  createWarehouseReceipt: (input: {
    ownerCompanyId?: string; warehouseId: string; receivingLocationId: string; receiptType: 'PURCHASE' | 'MANUAL';
    sourceNote: string; reason?: string; lines: Array<{ inventoryItemId: string; quantity: string; lotCode?: string; serialCode?: string; evidenceNote: string }>;
  }, csrfToken: string) => request<{ receipt: { id: string; status: string } }>('/warehouse/receipts', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  postWarehouseReceipt: (receiptId: string, csrfToken: string) => request<{ receipt: { id: string; status: string } }>(`/warehouse/receipts/${receiptId}/post`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  createInventoryReservation: (input: { ownerCompanyId?: string; invoiceLineId: string }, csrfToken: string) =>
    request<{ reservation: { id: string; status: string; requestedQuantity: string; reservedQuantity: string; shortageQuantity: string } }>('/warehouse/reservations', {
      method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
    }, csrfToken),
  releaseInventoryReservation: (reservationId: string, reason: string, csrfToken: string) => request<{ reservation: { id: string; status: string } }>(`/warehouse/reservations/${reservationId}/release`, { method: 'POST', body: JSON.stringify({ reason }) }, csrfToken),
  createWarehouseTransfer: (input: {
    ownerCompanyId?: string; sourceWarehouseId: string; destinationWarehouseId: string; sourceLocationId: string;
    destinationLocationId: string; reason: string; lines: Array<{ stockIdentityId: string; quantity: string }>;
  }, csrfToken: string) => request<{ transfer: { id: string; status: string } }>('/warehouse/transfers', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  dispatchWarehouseTransfer: (transferId: string, csrfToken: string) => request<{ transfer: { id: string; status: string } }>(`/warehouse/transfers/${transferId}/dispatch`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  receiveWarehouseTransfer: (transferId: string, csrfToken: string) => request<{ transfer: { id: string; status: string } }>(`/warehouse/transfers/${transferId}/receive`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  reverseWarehouseTransfer: (transferId: string, reason: string, csrfToken: string) => request<{ transfer: { id: string; status: string; reversedMovementCount: number } }>(`/warehouse/transfers/${transferId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }, csrfToken),
  createInventoryAdjustment: (input: {
    ownerCompanyId?: string; warehouseId: string; locationId: string; reason: string; evidenceNote: string;
    lines: Array<{ stockIdentityId: string; direction: 'IN' | 'OUT'; quantity: string }>;
  }, csrfToken: string) => request<{ adjustment: { id: string; status: string } }>('/warehouse/adjustments', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  submitInventoryAdjustment: (id: string, csrfToken: string) => request<{ adjustment: { id: string; status: string } }>(`/warehouse/adjustments/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  approveInventoryAdjustment: (id: string, csrfToken: string) => request<{ adjustment: { id: string; status: string } }>(`/warehouse/adjustments/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  createInventoryCount: (input: {
    ownerCompanyId?: string; warehouseId: string; locationId: string; reason: string;
    lines: Array<{ stockIdentityId: string; actualQuantity: string }>;
  }, csrfToken: string) => request<{ count: { id: string; status: string } }>('/warehouse/counts', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  submitInventoryCount: (id: string, csrfToken: string) => request<{ count: { id: string; status: string } }>(`/warehouse/counts/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  approveInventoryCount: (id: string, csrfToken: string) => request<{ count: { id: string; status: string } }>(`/warehouse/counts/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  createInventoryReturn: (input: {
    ownerCompanyId?: string; warehouseId: string; returnsLocationId: string; customerId?: string; invoiceId?: string;
    reason: string; evidenceNote: string; lines: Array<{ inventoryItemId: string; quantity: string; lotCode?: string; serialCode?: string }>;
  }, csrfToken: string) => request<{ inventoryReturn: { id: string; status: string } }>('/warehouse/returns', {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input),
  }, csrfToken),
  receiveInventoryReturn: (id: string, csrfToken: string) => request<{ inventoryReturn: { id: string; status: string } }>(`/warehouse/returns/${id}/receive`, { method: 'POST', body: JSON.stringify({}) }, csrfToken),
  inspectInventoryReturnLine: (returnId: string, lineId: string, input: {
    disposition: InventoryReturnDisposition; quantity: string; destinationLocationId?: string; reason: string;
  }, csrfToken: string) => request<{ inspection: { id: string; status: string } }>(`/warehouse/returns/${returnId}/lines/${lineId}/inspect`, { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  reverseInventoryMovement: (movementId: string, reason: string, csrfToken: string) => request<{ movement: { movementId: string } }>(`/warehouse/movements/${movementId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }, csrfToken),
  listOperationalRecords: (module: import('./contracts').OperationalModule) =>
    request<{ records: import('./contracts').OperationalRecord[] }>(`/operations/${module}`),
  createOperationalRecord: (
    module: import('./contracts').OperationalModule,
    input: import('./contracts').OperationalRecordInput,
    csrfToken: string,
  ) => request<{ record: import('./contracts').OperationalRecord }>(`/operations/${module}`, {
    method: 'POST', body: JSON.stringify(input),
  }, csrfToken),
  updateOperationalRecord: (
    module: import('./contracts').OperationalModule,
    recordId: string,
    input: import('./contracts').OperationalRecordInput & { version: number },
    csrfToken: string,
  ) => request<{ record: import('./contracts').OperationalRecord }>(`/operations/${module}/${recordId}`, {
    method: 'PUT', body: JSON.stringify(input),
  }, csrfToken),
  transitionOperationalRecord: (
    module: import('./contracts').OperationalModule,
    recordId: string,
    input: { status: import('./contracts').OperationalStatus; reason: string; version: number },
    csrfToken: string,
  ) => request<{ record: import('./contracts').OperationalRecord }>(`/operations/${module}/${recordId}/status`, {
    method: 'POST', body: JSON.stringify(input),
  }, csrfToken),
};
