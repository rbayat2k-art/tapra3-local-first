import { describe, expect, it } from 'vitest';
import type { FoundationMembership } from '../api/contracts';
import { buildOperationalDashboardModel } from './OperationalDashboardView';

function membership(companyName: string | null): FoundationMembership {
  return {
    membershipId: 'membership',
    workspace: { id: 'workspace', name: 'مجموعه آزمون', slug: 'test' },
    company: companyName ? { id: companyName, name: companyName, code: companyName } : null,
    organizationUnit: null,
    scope: { type: companyName ? 'COMPANY' : 'WORKSPACE', id: companyName ?? 'workspace' },
    contextKey: companyName ?? 'workspace',
    roles: [],
    permissions: ['customer.read', 'organization.read'],
  };
}

describe('operational dashboard context', () => {
  it('changes with the active company and never supplies legacy metrics', () => {
    const alpha = buildOperationalDashboardModel(membership('آلفا'));
    const beta = buildOperationalDashboardModel(membership('بتا'));
    expect(alpha.contextLabel).toBe('آلفا');
    expect(beta.contextLabel).toBe('بتا');
    expect(alpha.metricState).toBe('UNAVAILABLE');
    expect(alpha.available.map((item) => item.id)).toContain('customers');
  });

  it('removes company operations in the whole-organization context', () => {
    const workspace = buildOperationalDashboardModel(membership(null));
    expect(workspace.needsCompanySelection).toBe(true);
    expect(workspace.available.map((item) => item.id)).toEqual(['companies']);
  });
});
