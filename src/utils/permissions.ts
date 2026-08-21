import { useMemo } from 'react';
import { User, SystemRole, SystemPermission, UserRole } from '../types';
import { DEFAULT_ROLE_ID_MAP } from './storage';

// منبع واحد «کدام نقش‌های RBAC روی این کاربر فعال است» — نقش پایه (roleId یا معادل قدیمی از
// روی User.role) + additionalRoleIds، بدون تکرار. هر جای دیگری که قبلاً دستی [roleId,
// ...additionalRoleIds] می‌ساخت باید از این تابع عبور کند تا اگر منطق نقش پایه تغییر کرد، فقط
// یک‌جا اصلاح شود.
export function getAssignedRoleIds(user: User): string[] {
  const baseRoleId = user.roleId || DEFAULT_ROLE_ID_MAP[user.role];
  return Array.from(new Set([baseRoleId, ...(user.additionalRoleIds || [])].filter(Boolean)));
}

// آیا این کاربر مدیر ارشد سیستم است — قوی‌تر از صرفِ چک user.role === 'admin' (که همچنان جای
// دیگری هم برای Admin Bypass استفاده می‌شود)، چون نقش role_super_admin را چه به‌عنوان نقش پایه
// و چه (در یک حالت نادر سفارشی) به‌عنوان additionalRoleIds هم تشخیص می‌دهد. هرگز این تشخیص را
// تضعیف یا گسترده‌تر نکنید — Impersonation و Admin Bypass به همین قطعیت متکی‌اند.
export function isSystemAdmin(user: User, _roles: SystemRole[]): boolean {
  return user.role === 'admin' || getAssignedRoleIds(user).includes('role_super_admin');
}

// نقش‌های شناخته‌شدهٔ قدیمی که معنای Legacy مشخص و محافظت‌شده دارند — این‌ها هرگز به 'member'
// تبدیل نمی‌شوند، چون گردش‌های خزانه (approvalChain، مسیر پرداخت، پشتیبانی) هنوز مستقیماً روی
// همین مقادیر سوییچ می‌کنند. ترتیب آرایه = اولویت وقتی کاربر هم‌زمان چند نقش قدیمی دارد.
const LEGACY_ROLE_BY_ID: { roleId: string; legacy: UserRole }[] = [
  { roleId: 'role_super_admin', legacy: 'admin' },
  { roleId: 'role_branch_approver', legacy: 'approver' },
  { roleId: 'role_treasury_manager', legacy: 'approver' },
  { roleId: 'role_purchaser', legacy: 'requestor' },
  { roleId: 'role_treasury_executor', legacy: 'treasury_executor' },
  { roleId: 'role_support_agent', legacy: 'support_agent' },
  { roleId: 'role_financial_approver', legacy: 'financial_approver' }
];

// نوع Legacy مناسب یک مجموعه نقش RBAC را برمی‌گرداند — برای نقش‌های رسمی خزانه/تاییدکننده/خریدار
// همان نوع قدیمی مربوطه (طبق LEGACY_ROLE_BY_ID، به ترتیب اولویت)، برای هر نقش دیگری (فروش، مدیر
// داده، تبلیغات، واحد ثبت/شنود، پروموشن، اجرای کالا/خدمت، تأیید مالی فروش، پرداخت فوری و...)
// نوع خنثی 'member'. این تابع فقط محاسبه می‌کند؛ خودش چیزی نمی‌نویسد یا Migrate نمی‌کند.
export function deriveLegacyUserRoleFromAssignedRoles(roleIds: string[]): UserRole {
  for (const entry of LEGACY_ROLE_BY_ID) {
    if (roleIds.includes(entry.roleId)) return entry.legacy;
  }
  return 'member';
}

// Resolves the full, deduplicated set of permissions a user effectively has under the
// multi-role access model: base role (role/roleId) + every additionalRoleIds entry,
// with roleAccessOverrides fully replacing (not merging) a given role's permission
// list for this user only, plus any individual customPermissions on top — then
// user.deniedPermissions is subtracted last. Deny always wins over any allow, no matter
// which role/override/customPermission granted it.
export function getEffectiveUserPermissions(user: User, roles: SystemRole[]): SystemPermission[] {
  const baseRoleId = user.roleId || DEFAULT_ROLE_ID_MAP[user.role];
  const roleIds = Array.from(new Set([baseRoleId, ...(user.additionalRoleIds || [])].filter(Boolean)));

  const permissionsFromRoles = roleIds.flatMap((roleId) => {
    const override = user.roleAccessOverrides?.find((o) => o.roleId === roleId);
    if (override) return override.permissions;
    const role = roles.find((r) => r.id === roleId);
    return role?.permissions || [];
  });

  const customPermissions = user.customPermissions || [];
  const allowed = Array.from(new Set([...permissionsFromRoles, ...customPermissions]));

  const denied = new Set(user.deniedPermissions || []);
  if (denied.size === 0) return allowed;
  return allowed.filter((p) => !denied.has(p));
}

// Which of the user's currently-active roles is granting a specific permission — used for
// "effective role used for this operation" display/audit (admin can see WHY a user has a
// permission). Returns null if the permission comes only from customPermissions, or is denied.
export function getGrantingRoleId(user: User, roles: SystemRole[], permission: SystemPermission): string | null {
  if ((user.deniedPermissions || []).includes(permission)) return null;
  const baseRoleId = user.roleId || DEFAULT_ROLE_ID_MAP[user.role];
  const roleIds = [baseRoleId, ...(user.additionalRoleIds || [])].filter(Boolean);
  for (const roleId of roleIds) {
    const override = user.roleAccessOverrides?.find((o) => o.roleId === roleId);
    const perms = override ? override.permissions : roles.find((r) => r.id === roleId)?.permissions || [];
    if (perms.includes(permission)) return roleId;
  }
  return null;
}

// Single source of truth for "does this user have any of the required permissions" — admins
// always bypass (null sentinel), everyone else is checked against getEffectiveUserPermissions.
export function hasPermission(effectivePermissions: SystemPermission[] | null, required?: SystemPermission[]): boolean {
  if (!required || required.length === 0) return true;
  if (effectivePermissions === null) return true; // admin bypass
  return required.some((p) => effectivePermissions.includes(p));
}

// Memoized effective-permissions hook — null for admins (unrestricted), else the resolved
// permission list. Reuse this everywhere instead of re-deriving effectivePermissions locally.
export function useEffectivePermissions(currentUser: User | null, roles: SystemRole[]): SystemPermission[] | null {
  return useMemo(() => {
    if (!currentUser) return [];
    if (isSystemAdmin(currentUser, roles)) return null;
    return getEffectiveUserPermissions(currentUser, roles);
  }, [currentUser, roles]);
}

// Single source of truth for "can this user access a nav item / tab / operation gated by
// `required`" — encodes every special-case override that already existed inline in
// Sidebar.tsx's hasAccess (canCreateRequests, isDualRole for approval/payment permissions,
// the three-way manage_assigned_tasks check) on top of the plain effective-permission check.
// Both the Sidebar menu AND the App.tsx tab-render guard call this so a permission unlocks
// menu + page + data + operations consistently — never just the menu item.
export function canAccessNavItem(
  currentUser: User | null,
  effectivePermissions: SystemPermission[] | null,
  required?: SystemPermission[]
): boolean {
  if (!required || required.length === 0) return true;
  if (effectivePermissions === null) return true; // admin bypass

  if (required.includes('create_request') && currentUser?.canCreateRequests !== undefined) {
    return currentUser.canCreateRequests;
  }

  if (
    (required.includes('approve_branch_request') || required.includes('approve_treasury') || required.includes('execute_payment')) &&
    currentUser?.isDualRole === true
  ) {
    return true;
  }

  if (required.includes('manage_assigned_tasks')) {
    const canIssue = currentUser?.canIssueTasks === true;
    const canExecute = currentUser?.canExecuteTasks === true;
    const hasCustom = !!currentUser?.customPermissions?.includes('manage_assigned_tasks');
    return canIssue || canExecute || hasCustom;
  }

  return required.some((p) => effectivePermissions.includes(p));
}
