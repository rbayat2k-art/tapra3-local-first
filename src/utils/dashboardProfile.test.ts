import { describe, expect, it } from 'vitest';
import type {
  CoordinationCase,
  SalesFinancialReviewCase,
  SalesInvoice,
  SystemPermission,
  SystemRole,
  User
} from '../types';
import {
  getVisibleCoordinationCases,
  getVisibleSalesFinancialCases,
  getVisibleSalesInvoices,
  isInvoiceInSalesScope,
  resolveDashboardDomain
} from './dashboardProfile';

const role = (id: string, domain: SystemRole['domain'], permissions: SystemPermission[] = []): SystemRole => ({
  id,
  code: id,
  name: id,
  description: id,
  domain,
  permissions
});

const user = (id: string, roleId: string, legacyRole: User['role'] = 'member'): User => ({
  id,
  username: id,
  fullName: id,
  phone: '',
  email: '',
  role: legacyRole,
  roleId,
  roleTitle: roleId,
  isActive: true,
  password: 'test'
} as User);

const invoice = (id: string, salespersonUserId: string, supervisorUserId = 'sup_1'): SalesInvoice => ({
  id,
  invoiceCode: id,
  revision: 1,
  customerId: 'customer_1',
  salespersonUserId,
  salespersonUserName: salespersonUserId,
  salesHierarchySnapshot: {
    salespersonUserId,
    salespersonUserName: salespersonUserId,
    salesBranchId: 'branch_1',
    salesBranchName: 'شعبه',
    supervisorUserId,
    supervisorUserName: supervisorUserId,
    seniorSupervisorUserId: 'senior_1',
    seniorSupervisorUserName: 'senior_1',
    salesManagerUserId: 'manager_1',
    salesManagerUserName: 'manager_1',
    salesDeputyUserId: 'deputy_1',
    salesDeputyUserName: 'deputy_1',
    capturedAt: '2026-08-09T00:00:00.000Z'
  },
  lineItems: [],
  subtotal: 0,
  totalDiscount: 0,
  finalAmount: 0,
  paidAmount: 0,
  remainingAmount: 0,
  status: 'draft',
  declaredPayments: [],
  history: [],
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z'
});

describe('role-aware dashboard isolation', () => {
  const roles = [
    role('role_seller', 'sales', ['view_sales_queue']),
    role('role_coord', 'coordination', ['view_coordination_queue']),
    role('role_fin', 'sales_finance', ['view_sales_financial_queue']),
    role('role_treasury', 'treasury', ['view_all_requests']),
    role('role_general', 'general')
  ];

  it('uses the primary role domain and never turns a salesperson into treasury because of an additional role', () => {
    const salesperson = { ...user('seller_1', 'role_seller'), additionalRoleIds: ['role_treasury'] };
    expect(resolveDashboardDomain(salesperson, roles, ['view_sales_queue', 'view_all_requests'])).toBe('sales');
  });

  it('falls back to a safe generic dashboard when no operational domain or permission exists', () => {
    expect(resolveDashboardDomain(user('general_1', 'role_general'), roles, [])).toBe('generic');
  });

  it('keeps explicit treasury and system admin dashboards in treasury', () => {
    expect(resolveDashboardDomain(user('treasury_1', 'role_treasury', 'treasury_executor'), roles, ['view_all_requests'])).toBe('treasury');
    expect(resolveDashboardDomain(user('admin_1', 'missing', 'admin'), roles, null)).toBe('treasury');
  });
});

describe('dashboard data scopes', () => {
  it('shows a seller only own invoices and a supervisor only the immutable snapshot subtree', () => {
    const records = [invoice('own', 'seller_1'), invoice('other', 'seller_2', 'sup_2')];
    expect(getVisibleSalesInvoices(records, user('seller_1', 'role_seller'), ['view_own_invoices']).map((x) => x.id)).toEqual(['own']);
    expect(isInvoiceInSalesScope(records[0], 'sup_1')).toBe(true);
    expect(isInvoiceInSalesScope(records[1], 'sup_1')).toBe(false);
    expect(getVisibleSalesInvoices(records, user('sup_1', 'role_supervisor'), ['view_team_invoices']).map((x) => x.id)).toEqual(['own']);
  });

  it('shows shared pending coordination work but hides another specialist assigned case', () => {
    const cases = [
      { id: 'shared', distributionMode: 'shared_claim', status: 'pending_assignment' },
      { id: 'mine', distributionMode: 'manual_assignment', status: 'assigned', assignedCoordinatorUserId: 'coord_1' },
      { id: 'other', distributionMode: 'manual_assignment', status: 'assigned', assignedCoordinatorUserId: 'coord_2' }
    ] as CoordinationCase[];
    expect(getVisibleCoordinationCases(cases, user('coord_1', 'role_coord'), ['view_coordination_queue']).map((x) => x.id)).toEqual(['shared', 'mine']);
  });

  it('shows shared pending financial work but hides another reviewer assigned case', () => {
    const cases = [
      { id: 'shared', distributionMode: 'shared_claim', status: 'pending_assignment' },
      { id: 'mine', distributionMode: 'manual_assignment', status: 'assigned', assignedReviewerUserId: 'fin_1' },
      { id: 'other', distributionMode: 'manual_assignment', status: 'assigned', assignedReviewerUserId: 'fin_2' }
    ] as SalesFinancialReviewCase[];
    expect(getVisibleSalesFinancialCases(cases, user('fin_1', 'role_fin'), ['view_sales_financial_queue']).map((x) => x.id)).toEqual(['shared', 'mine']);
  });
});
