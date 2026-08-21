import { describe, it, expect } from 'vitest';
import {
  resolveSalesHierarchy, validateSalesAssignment, buildSalesHierarchySnapshot,
  getVisibleSalesOrganizationUserIds
} from './salesOrgStructure';
import type { SalesBranch, SalesOrgAssignment, User, SystemRole } from '../types';

// ============================================================
// فیکسچر مستقل و کوچک: زنجیرهٔ پنج‌سطحی کامل (فروشنده ← سرپرست ← سرپرست ارشد ← مدیر فروش ←
// معاونت فروش) با دو شعبه، مستقل از داده‌های Demo واقعی storage.ts — تا این تست‌ها فقط به رفتار
// موتور خالص salesOrgStructure.ts وابسته باشند، نه به محتوای فعلی DEFAULT_SALES_*.
// ============================================================
const branches: SalesBranch[] = [
  { id: 'b1', code: 'B1', name: 'شعبه یک', companyId: 'comp_sales', isActive: true },
  { id: 'b2', code: 'B2', name: 'شعبه دو', companyId: 'comp_sales', isActive: true }
];

const users: User[] = [
  { id: 'u_sp', username: 'sp', password: 'x', fullName: 'فروشنده تست', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
  { id: 'u_sup', username: 'sup', password: 'x', fullName: 'سرپرست تست', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
  { id: 'u_senior', username: 'senior', password: 'x', fullName: 'سرپرست ارشد تست', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
  { id: 'u_mgr', username: 'mgr', password: 'x', fullName: 'مدیر فروش تست', phone: '', email: '', role: 'member', roleTitle: '', isActive: true },
  { id: 'u_dep', username: 'dep', password: 'x', fullName: 'معاونت فروش تست', phone: '', email: '', role: 'member', roleTitle: '', isActive: true }
];

const roles: SystemRole[] = [
  { id: 'role_salesperson', code: 'SP', name: 'فروشنده', description: '', isSystemRole: true, organizationalLevel: 1, allowedParentRoleIds: ['role_sales_supervisor'], permissions: [] },
  { id: 'role_sales_supervisor', code: 'SUP', name: 'سرپرست فروش', description: '', isSystemRole: true, organizationalLevel: 2, allowedParentRoleIds: ['role_senior_sales_supervisor'], permissions: [] },
  { id: 'role_senior_sales_supervisor', code: 'SR', name: 'سرپرست ارشد فروش', description: '', isSystemRole: true, organizationalLevel: 3, allowedParentRoleIds: ['role_sales_manager'], permissions: [] },
  { id: 'role_sales_manager', code: 'MGR', name: 'مدیر فروش', description: '', isSystemRole: true, organizationalLevel: 4, allowedParentRoleIds: ['role_sales_deputy'], permissions: [] },
  { id: 'role_sales_deputy', code: 'DEP', name: 'معاونت فروش', description: '', isSystemRole: true, organizationalLevel: 5, allowedParentRoleIds: [], permissions: [] }
];

function fullChainAssignments(): SalesOrgAssignment[] {
  return [
    { id: 'a1', userId: 'u_sp', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a2', userId: 'u_sup', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_senior', validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a3', userId: 'u_senior', salesRoleId: 'role_senior_sales_supervisor', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_mgr', validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a4', userId: 'u_mgr', salesRoleId: 'role_sales_manager', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_dep', validFrom: 't0', isActive: true, changedAt: 't0' },
    { id: 'a5', userId: 'u_dep', salesRoleId: 'role_sales_deputy', salesBranchIds: ['b1', 'b2'], directManagerUserId: undefined, validFrom: 't0', isActive: true, changedAt: 't0' }
  ];
}

describe('resolveSalesHierarchy / buildSalesHierarchySnapshot — test 4: full 5-level chain resolves', () => {
  it('resolves all five levels for the salesperson at the bottom of a complete chain', () => {
    const result = resolveSalesHierarchy('u_sp', fullChainAssignments(), users);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.hierarchy.salesperson?.userId).toBe('u_sp');
    expect(result.hierarchy.supervisor?.userId).toBe('u_sup');
    expect(result.hierarchy.seniorSupervisor?.userId).toBe('u_senior');
    expect(result.hierarchy.manager?.userId).toBe('u_mgr');
    expect(result.hierarchy.deputy?.userId).toBe('u_dep');
  });

  it('builds a complete SalesHierarchySnapshot with all five names/ids and the branch', () => {
    const result = buildSalesHierarchySnapshot('u_sp', fullChainAssignments(), users, branches, 'now');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.snapshot).toEqual({
      salespersonUserId: 'u_sp', salespersonUserName: 'فروشنده تست',
      salesBranchId: 'b1', salesBranchName: 'شعبه یک',
      supervisorUserId: 'u_sup', supervisorUserName: 'سرپرست تست',
      seniorSupervisorUserId: 'u_senior', seniorSupervisorUserName: 'سرپرست ارشد تست',
      salesManagerUserId: 'u_mgr', salesManagerUserName: 'مدیر فروش تست',
      salesDeputyUserId: 'u_dep', salesDeputyUserName: 'معاونت فروش تست',
      capturedAt: 'now'
    });
  });
});

describe('getVisibleSalesOrganizationUserIds — قلمرو دایرکتوری سازمان فروش', () => {
  it('فروشنده فقط خودش و مسیر پنج‌سطحی بالادستی خودش را می‌بیند، نه زنجیره موازی', () => {
    const parallelSeller: User = {
      id: 'u_other_sp', username: 'other', password: 'x', fullName: 'فروشنده موازی',
      phone: '', email: '', role: 'member', roleTitle: '', isActive: true
    };
    const scopedAssignments = [
      ...fullChainAssignments(),
      { id: 'a_other', userId: parallelSeller.id, salesRoleId: 'role_salesperson' as const, salesBranchIds: ['b1'], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true, changedAt: 't0' }
    ];

    const visible = getVisibleSalesOrganizationUserIds('u_sp', scopedAssignments, false);
    expect(visible).toEqual(expect.arrayContaining(['u_sp', 'u_sup', 'u_senior', 'u_mgr', 'u_dep']));
    expect(visible).not.toContain('u_other_sp');
  });

  it('سرپرست، مسیر بالادستی و تمام زیرمجموعهٔ خودش را می‌بیند', () => {
    const visible = getVisibleSalesOrganizationUserIds('u_sup', fullChainAssignments(), false);
    expect(visible).toEqual(expect.arrayContaining(['u_sp', 'u_sup', 'u_senior', 'u_mgr', 'u_dep']));
  });

  it('مدیر کاربران فروش/ادمین با canViewAll تمام انتصاب‌های فعال و فقط همان‌ها را می‌بیند', () => {
    const assignments = [
      ...fullChainAssignments(),
      { ...fullChainAssignments()[0], id: 'inactive', userId: 'u_inactive', isActive: false }
    ];
    const visible = getVisibleSalesOrganizationUserIds('outside', assignments, true);
    expect(visible.sort()).toEqual(['u_dep', 'u_mgr', 'u_senior', 'u_sp', 'u_sup'].sort());
    expect(visible).not.toContain('u_inactive');
  });

  it('کاربر بدون انتصاب فروش در حالت قلمرو محدود هیچ اطلاعاتی دریافت نمی‌کند', () => {
    expect(getVisibleSalesOrganizationUserIds('outside', fullChainAssignments(), false)).toEqual([]);
  });
});

describe('validateSalesAssignment — test 5: wrong-level Parent rejected', () => {
  it('rejects a salesperson whose direct manager is another salesperson (not a supervisor)', () => {
    const assignments = fullChainAssignments();
    const result = validateSalesAssignment(
      { userId: 'u_sp2', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], directManagerUserId: 'u_sp', validFrom: 't0', isActive: true },
      'u_sp2', assignments, [...users, { id: 'u_sp2', username: 'sp2', password: 'x', fullName: 'فروشنده دو', phone: '', email: '', role: 'member', roleTitle: '', isActive: true }], branches, roles
    );
    expect(result.ok).toBe(false);
  });
});

describe('resolveSalesHierarchy / validateSalesAssignment — test 6: hierarchy cycle rejected', () => {
  it('resolveSalesHierarchy detects a cycle and returns ok:false instead of looping forever', () => {
    const cyclic: SalesOrgAssignment[] = [
      { id: 'c1', userId: 'u_sup', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], directManagerUserId: 'u_senior', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'c2', userId: 'u_senior', salesRoleId: 'role_senior_sales_supervisor', salesBranchIds: ['b1'], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true, changedAt: 't0' }
    ];
    const result = resolveSalesHierarchy('u_sup', cyclic, users);
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect(result.reason).toMatch(/حلقه/);
  });

  it('validateSalesAssignment rejects an assignment that would introduce a cycle back to the target user', () => {
    const assignments = fullChainAssignments();
    // تلاش برای این‌که «معاونت فروش» زیرِ «فروشنده» برود — باید حلقه در بالارفتن زنجیره تشخیص داده شود
    const result = validateSalesAssignment(
      { userId: 'u_dep', salesRoleId: 'role_sales_manager', salesBranchIds: ['b1'], directManagerUserId: 'u_sp', validFrom: 't0', isActive: true },
      'u_dep', assignments, users, branches, roles
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateSalesAssignment — test 7: salesperson without branch rejected', () => {
  it('rejects an active salesperson with zero branches', () => {
    const result = validateSalesAssignment(
      { userId: 'u_sp', salesRoleId: 'role_salesperson', salesBranchIds: [], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true },
      'u_sp', fullChainAssignments(), users, branches, roles
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateSalesAssignment — test 8: salesperson with multiple branches rejected', () => {
  it('rejects an active salesperson assigned to two branches at once', () => {
    const result = validateSalesAssignment(
      { userId: 'u_sp', salesRoleId: 'role_salesperson', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true },
      'u_sp', fullChainAssignments(), users, branches, roles
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateSalesAssignment — test 9: sales manager accepts multiple branches', () => {
  it('accepts a sales manager assigned to two branches', () => {
    const result = validateSalesAssignment(
      { userId: 'u_mgr', salesRoleId: 'role_sales_manager', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_dep', validFrom: 't0', isActive: true },
      'u_mgr', fullChainAssignments(), users, branches, roles
    );
    expect(result.ok).toBe(true);
  });
});

describe('validateSalesAssignment — test 10: Parent must cover Child branch', () => {
  it('rejects when the direct manager does not cover one of the child branches', () => {
    const assignments: SalesOrgAssignment[] = [
      { id: 'a1', userId: 'u_sup', salesRoleId: 'role_sales_supervisor', salesBranchIds: ['b1'], directManagerUserId: 'u_senior', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a3', userId: 'u_senior', salesRoleId: 'role_senior_sales_supervisor', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_mgr', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a4', userId: 'u_mgr', salesRoleId: 'role_sales_manager', salesBranchIds: ['b1', 'b2'], directManagerUserId: 'u_dep', validFrom: 't0', isActive: true, changedAt: 't0' },
      { id: 'a5', userId: 'u_dep', salesRoleId: 'role_sales_deputy', salesBranchIds: ['b1', 'b2'], directManagerUserId: undefined, validFrom: 't0', isActive: true, changedAt: 't0' }
    ];
    // فروشنده در شعبهٔ ۲ می‌خواهد زیر سرپرستی برود که فقط شعبهٔ ۱ را پوشش می‌دهد — باید رد شود
    const result = validateSalesAssignment(
      { userId: 'u_sp', salesRoleId: 'role_salesperson', salesBranchIds: ['b2'], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true },
      'u_sp', assignments, users, branches, roles
    );
    expect(result.ok).toBe(false);
  });

  it('accepts when the direct manager covers every child branch', () => {
    const result = validateSalesAssignment(
      { userId: 'u_sp', salesRoleId: 'role_salesperson', salesBranchIds: ['b1'], directManagerUserId: 'u_sup', validFrom: 't0', isActive: true },
      'u_sp', fullChainAssignments(), users, branches, roles
    );
    expect(result.ok).toBe(true);
  });
});
