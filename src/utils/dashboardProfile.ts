import {
  CoordinationCase,
  Lead,
  SalesFinancialReviewCase,
  SalesInvoice,
  SystemPermission,
  SystemRole,
  User
} from '../types';
import { getAssignedRoleIds, isSystemAdmin } from './permissions';

export type DashboardDomain =
  | 'treasury'
  | 'sales'
  | 'registration'
  | 'coordination'
  | 'sales_finance'
  | 'generic';

const hasAnyPermission = (
  effectivePermissions: SystemPermission[] | null,
  required: SystemPermission[]
): boolean => effectivePermissions === null || required.some((permission) => effectivePermissions.includes(permission));

/**
 * Dashboard selection deliberately follows the user's primary role. Additional roles add
 * permissions/actions, but never replace the user's operational home with treasury data.
 */
export function resolveDashboardDomain(
  user: User | null,
  roles: SystemRole[],
  effectivePermissions: SystemPermission[] | null
): DashboardDomain {
  if (!user) return 'generic';
  if (isSystemAdmin(user, roles)) return 'treasury';

  const primaryRoleId = getAssignedRoleIds(user)[0];
  const primaryDomain = roles.find((role) => role.id === primaryRoleId)?.domain;
  if (primaryDomain === 'treasury') return 'treasury';
  if (primaryDomain === 'sales') return 'sales';
  if (primaryDomain === 'registration') return 'registration';
  if (primaryDomain === 'coordination') return 'coordination';
  if (primaryDomain === 'sales_finance') return 'sales_finance';

  // Legacy/fallback users may not have a normalized primary domain yet. Resolve only to the
  // narrow operational dashboard their permissions clearly identify; never default to treasury.
  if (hasAnyPermission(effectivePermissions, ['view_sales_financial_queue', 'review_invoice_financial_confirmation'])) {
    return 'sales_finance';
  }
  if (hasAnyPermission(effectivePermissions, ['view_coordination_queue', 'record_coordination_attempt'])) {
    return 'coordination';
  }
  if (hasAnyPermission(effectivePermissions, ['bulk_import_invoices', 'register_invoice_on_behalf'])) {
    return 'registration';
  }
  if (hasAnyPermission(effectivePermissions, ['view_sales_queue', 'view_own_invoices', 'view_team_invoices'])) {
    return 'sales';
  }
  if (hasAnyPermission(effectivePermissions, ['approve_treasury', 'execute_payment', 'view_all_requests'])) {
    return 'treasury';
  }
  return 'generic';
}

export function isInvoiceInSalesScope(invoice: SalesInvoice, userId: string): boolean {
  const snapshot = invoice.salesHierarchySnapshot;
  return invoice.salespersonUserId === userId || [
    snapshot?.supervisorUserId,
    snapshot?.seniorSupervisorUserId,
    snapshot?.salesManagerUserId,
    snapshot?.salesDeputyUserId
  ].includes(userId);
}

export function getVisibleSalesInvoices(
  invoices: SalesInvoice[],
  user: User | null,
  effectivePermissions: SystemPermission[] | null
): SalesInvoice[] {
  if (!user) return [];
  if (effectivePermissions === null) return invoices;
  if (effectivePermissions.includes('view_team_invoices')) {
    return invoices.filter((invoice) => isInvoiceInSalesScope(invoice, user.id));
  }
  return invoices.filter((invoice) => invoice.salespersonUserId === user.id || invoice.registeredByUserId === user.id);
}

export function getOwnedOpenLeads(leads: Lead[], userId: string): Lead[] {
  const closedStatuses = new Set(['closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked']);
  return leads.filter((lead) => lead.currentOwnerUserId === userId && !closedStatuses.has(lead.status));
}

export function getVisibleCoordinationCases(
  cases: CoordinationCase[],
  user: User | null,
  effectivePermissions: SystemPermission[] | null
): CoordinationCase[] {
  if (!user) return [];
  if (effectivePermissions === null || effectivePermissions.includes('assign_coordination_case')) return cases;
  return cases.filter((item) =>
    item.assignedCoordinatorUserId === user.id ||
    (item.distributionMode === 'shared_claim' && item.status === 'pending_assignment')
  );
}

export function getVisibleSalesFinancialCases(
  cases: SalesFinancialReviewCase[],
  user: User | null,
  effectivePermissions: SystemPermission[] | null
): SalesFinancialReviewCase[] {
  if (!user) return [];
  if (effectivePermissions === null || effectivePermissions.includes('manage_sales_financial_distribution')) return cases;
  return cases.filter((item) =>
    item.assignedReviewerUserId === user.id ||
    (item.distributionMode === 'shared_claim' && item.status === 'pending_assignment')
  );
}
