import {describe, expect, it} from 'vitest';
import type {LocalUser, PermissionCatalogItem, SecurityRole} from './model';
import {roleInsight} from './roleInsights';
import {PERMISSION_CATALOG, SECURITY_ROLES} from './seed';

const catalog: PermissionCatalogItem[] = [
  {code: 'organization.units.view', label: 'مشاهده واحدها', description: '', domain: 'organization', available: true},
  {code: 'foundation.audit.view', label: 'مشاهده ممیزی', description: '', domain: 'management', available: true},
];

const role = (input: Partial<SecurityRole> = {}): SecurityRole => ({
  id: 'role-test',
  name: 'نقش آزمایشی',
  description: '',
  status: 'active',
  protected: false,
  scope: 'UNIT',
  permissions: ['organization.units.view'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...input,
});

const user = (input: Partial<LocalUser> = {}): LocalUser => ({
  id: 'user-1', actorId: 'actor-1', name: 'کاربر نمونه', roleTitle: 'کارشناس', roles: ['نقش آزمایشی'],
  roleId: 'role-test', roleIds: ['role-test'], status: 'active', username: 'sample', passwordHash: '',
  passwordUpdatedAt: '', isAdmin: false, description: '', companyId: 'company-1', scope: 'UNIT', permissions: [],
  accent: '#000', initials: 'ک‌ن', ...input,
});

describe('roleInsight', () => {
  it('keeps every built-in role permission represented in the permission catalog', () => {
    const catalogCodes = new Set(PERMISSION_CATALOG.map((item) => item.code));
    const missing = [...new Set(SECURITY_ROLES.flatMap((item) => item.permissions).filter((permission) => !catalogCodes.has(permission)))].sort();
    expect(missing).toEqual([]);
  });

  it('summarizes assigned users, permission domains, and protected access', () => {
    const insight = roleInsight(
      role({permissions: ['organization.units.view', 'foundation.audit.view']}),
      [user(), user({id: 'user-2', status: 'inactive'})],
      catalog,
    );

    expect(insight.users).toHaveLength(2);
    expect(insight.activeUsers).toHaveLength(1);
    expect(insight.inactiveUsers).toHaveLength(1);
    expect(insight.domains).toEqual([
      {id: 'organization', label: 'سازمان', count: 1},
      {id: 'management', label: 'مدیریت', count: 1},
    ]);
    expect(insight.protectedAccess).toBe(true);
    expect(insight.attention).toEqual([]);
  });

  it('flags inactive assigned, empty active, unused, and unknown permission states', () => {
    expect(roleInsight(role({status: 'inactive'}), [user()], catalog).attention).toContain('inactive-with-users');
    expect(roleInsight(role({permissions: []}), [], catalog).attention).toEqual(['active-without-permissions', 'unused']);
    expect(roleInsight(role({permissions: ['legacy.unknown']}), [user()], catalog).attention).toContain('unknown-permission');
  });

  it('keeps an unassigned protected role visible as unused without weakening its protection', () => {
    const insight = roleInsight(role({id: 'role-admin', protected: true, permissions: []}), [], catalog);
    expect(insight.attention).toEqual(['active-without-permissions', 'unused']);
    expect(insight.protectedAccess).toBe(true);
  });
});
