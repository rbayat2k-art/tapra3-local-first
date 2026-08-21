import { describe, expect, it } from 'vitest';
import {
  getEligiblePrimaryActions,
  getVisibleGroupedNavItems,
  isNavItemVisible,
  NAV_ITEM_BY_ID,
  type NavVisibilityContext,
} from './navigationRegistry';
import type { User } from '../types';

const presentationUser: User = {
  id: 'presentation-user',
  username: 'user',
  fullName: 'کاربر آزمون',
  phone: '',
  email: 'user@example.test',
  role: 'member',
  roleTitle: 'کاربر سامانه',
  customPermissions: [],
  isActive: true,
};

function context(
  foundationPermissions: string[] = [],
  activeCompanyId: string | null = 'company-alpha',
  user: User = presentationUser,
): NavVisibilityContext {
  return {
    currentUser: user,
    effectivePermissions: [],
    isAdmin: user.role === 'admin',
    foundationPermissions,
    activeCompanyId,
  };
}

function visibleIds(ctx: NavVisibilityContext): string[] {
  return getVisibleGroupedNavItems(ctx).flatMap((group) => group.items.map((item) => item.id));
}

describe('operational navigation authority', () => {
  it('uses server permissions instead of legacy role or custom permissions', () => {
    const legacyAdministrator = { ...presentationUser, role: 'admin' as const, customPermissions: ['sales_access', 'manage_users'] as User['customPermissions'] };
    expect(visibleIds(context([], 'company-alpha', legacyAdministrator))).toEqual(['dashboard']);

    const serverReader = visibleIds(context(['customer.read']));
    expect(serverReader).toEqual(['dashboard', 'customers']);
  });

  it('limits an impersonated customer reader to the allowed operational surface', () => {
    const ids = visibleIds(context(['customer.read']));
    expect(ids).toContain('customers');
    expect(ids).not.toContain('my_sales_queue');
    expect(ids).not.toContain('sales_organization');
    expect(ids).not.toContain('sales_personnel_lifecycle');
    expect(ids).not.toContain('campaigns');
  });

  it('guards company-scoped pages before they can be opened', () => {
    const workspaceIds = visibleIds(context(['customer.read', 'sales.queue.read', 'organization.read'], null));
    expect(workspaceIds).toEqual(['dashboard', 'companies']);
    expect(isNavItemVisible(NAV_ITEM_BY_ID.customers, context(['customer.read'], null))).toBe(false);
  });

  it('shows CURRENT and valid HYBRID entries but never normal Prototype navigation', () => {
    const ids = visibleIds(context([
      'customer.read', 'sales.queue.read', 'sales.lead.read_all', 'sales.lead.assign', 'sales.invoice.read_all',
      'sales.payment.review', 'warehouse.read', 'organization.read',
    ]));
    expect(ids).toEqual(expect.arrayContaining([
      'dashboard', 'customers', 'my_sales_queue', 'lead_assignment', 'sales_invoices',
      'sales_financial_confirmation', 'warehouse_foundation', 'companies',
    ]));
    expect(ids).not.toContain('support');
    expect(ids).not.toContain('products');
    expect(ids).not.toContain('messenger');
    expect(ids).not.toContain('roles_permissions');
  });

  it('does not render empty navigation groups', () => {
    for (const group of getVisibleGroupedNavItems(context([]))) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe('operational quick actions', () => {
  it('offers sale creation only with the matching server permission and company context', () => {
    expect(getEligiblePrimaryActions(context([]))).toEqual([]);
    expect(getEligiblePrimaryActions(context(['sales.sale.create', 'sales.invoice.read_own'])).map((action) => action.id)).toEqual(['create_sales_invoice']);
    expect(getEligiblePrimaryActions(context(['sales.sale.create', 'sales.invoice.read_own'], null))).toEqual([]);
  });
});
