import { describe, it, expect } from 'vitest';
import { getEffectiveUserPermissions, getAssignedRoleIds, deriveLegacyUserRoleFromAssignedRoles } from './permissions';
import { DEFAULT_ROLES } from './storage';
import type { User, SystemRole } from '../types';

// نقش‌های واقعی پروژه استفاده می‌شوند تا تست‌ها با تعریف واقعی role_salesperson/role_purchaser
// (و لیست دقیق مجوزهای ممنوع بند ۷ مأموریت) هماهنگ بمانند، نه یک فیکسچر جداگانه که ممکن است
// از واقعیت جدا بیفتد.
const roles: SystemRole[] = DEFAULT_ROLES;

function makeSalesperson(overrides: Partial<User> = {}): User {
  return {
    id: 'u1', username: 'sp', password: 'x', fullName: 'فروشنده تست', phone: '', email: '',
    role: 'member', roleId: 'role_salesperson', roleTitle: 'فروشنده', isActive: true,
    ...overrides
  };
}

// بند ۷ مأموریت: این ۱۰ مجوز هرگز نباید به‌صورت پیش‌فرض روی نقش فروشنده باشد.
const FORBIDDEN_TREASURY_PERMISSIONS = [
  'create_request', 'view_all_requests', 'view_branch_requests', 'approve_branch_request',
  'approve_treasury', 'execute_payment', 'refer_for_payment', 'refer_for_emergency_payment',
  'execute_emergency_payment', 'manage_vendors'
] as const;

describe('test 1 — salesperson has only the sales role, no treasury permission', () => {
  it('role_salesperson alone grants none of the ten forbidden treasury/purchase permissions', () => {
    const salesperson = makeSalesperson();
    const effective = getEffectiveUserPermissions(salesperson, roles);
    for (const forbidden of FORBIDDEN_TREASURY_PERMISSIONS) {
      expect(effective).not.toContain(forbidden);
    }
  });

  it('record_declared_payment (customer deposit declaration, not treasury execution) IS allowed for a salesperson', () => {
    const effective = getEffectiveUserPermissions(makeSalesperson(), roles);
    expect(effective).toContain('record_declared_payment');
  });
});

describe('test 2 — salesperson + purchaser role gets the exact union of permissions', () => {
  it('adding role_purchaser as an additional role unlocks exactly its permissions on top of the sales ones, nothing more/less', () => {
    const salesRole = roles.find((r) => r.id === 'role_salesperson')!;
    const purchaserRole = roles.find((r) => r.id === 'role_purchaser')!;
    const user = makeSalesperson({ additionalRoleIds: ['role_purchaser'] });
    const effective = getEffectiveUserPermissions(user, roles);

    const expectedUnion = new Set([...(salesRole.permissions || []), ...(purchaserRole.permissions || [])]);
    expect(new Set(effective)).toEqual(expectedUnion);
    // اکنون که role_purchaser صریحاً اضافه شده، create_request باید در دسترس باشد
    expect(effective).toContain('create_request');
  });

  it('removing the additional purchaser role closes financial access again (back to sales-only permissions)', () => {
    const salesRole = roles.find((r) => r.id === 'role_salesperson')!;
    const user = makeSalesperson(); // بدون additionalRoleIds
    const effective = getEffectiveUserPermissions(user, roles);
    expect(new Set(effective)).toEqual(new Set(salesRole.permissions || []));
    expect(effective).not.toContain('create_request');
  });
});

describe('test 3 — explicit Deny overrides both roles', () => {
  it('deniedPermissions removes a permission even though both the base and additional role grant it', () => {
    const user = makeSalesperson({ additionalRoleIds: ['role_purchaser'], deniedPermissions: ['create_request'] });
    const effective = getEffectiveUserPermissions(user, roles);
    expect(effective).not.toContain('create_request');
    // بقیه پرمیشن‌های union دست‌نخورده می‌مانند — فقط دقیقاً همان یکی حذف شده
    expect(effective).toContain('view_branch_requests');
  });
});

describe('test 14 — getAssignedRoleIds returns base + supplementary without duplication', () => {
  it('deduplicates when the base roleId is accidentally also listed in additionalRoleIds', () => {
    const user = makeSalesperson({ additionalRoleIds: ['role_purchaser', 'role_salesperson'] });
    const ids = getAssignedRoleIds(user);
    expect(ids).toEqual(['role_salesperson', 'role_purchaser']);
    expect(ids.filter((id) => id === 'role_salesperson')).toHaveLength(1);
  });

  it('falls back to DEFAULT_ROLE_ID_MAP[role] when roleId is unset, still without duplicates', () => {
    const user: User = { id: 'u2', username: 'x', password: 'x', fullName: 'کاربر', phone: '', email: '', role: 'requestor', roleTitle: '', isActive: true, additionalRoleIds: ['role_purchaser'] };
    const ids = getAssignedRoleIds(user);
    expect(ids).toEqual(['role_purchaser']);
  });
});

describe('test 15 — a sales user resolves to "فروشنده", never to the legacy "درخواست‌کننده" label', () => {
  it('role_salesperson RBAC role display name is "فروشنده"', () => {
    const salesRole = roles.find((r) => r.id === 'role_salesperson')!;
    expect(salesRole.name).toBe('فروشنده');
  });

  it('deriveLegacyUserRoleFromAssignedRoles never maps a pure salesperson to the requestor/purchaser legacy value', () => {
    const derived = deriveLegacyUserRoleFromAssignedRoles(['role_salesperson']);
    expect(derived).toBe('member');
    expect(derived).not.toBe('requestor');
  });

  it('a real purchaser (role_purchaser) still correctly derives to the requestor legacy value', () => {
    const derived = deriveLegacyUserRoleFromAssignedRoles(['role_purchaser']);
    expect(derived).toBe('requestor');
  });
});
