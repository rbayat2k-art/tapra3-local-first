import type {LocalUser, PermissionCode, SecurityRole} from './model';

export const PRIMARY_ADMIN_USER_ID = 'persona-product-owner';

export const PROTECTED_ROLE_IDS = new Set([
  'role-admin',
  'role-system-admin',
  'role-user-manager',
  'role-registration-reviewer',
  'role-workflow-admin',
]);

export const PROTECTED_PERMISSION_CODES = new Set<PermissionCode>([
  'organization.roles.manage',
  'organization.roles.assign',
  'foundation.users.edit',
  'foundation.users.status.manage',
  'organization.users.create',
  'organization.users.password.manage',
  'foundation.data.manage',
  'foundation.data.export',
  'foundation.qa.manage',
  'foundation.users.qa_login',
  'foundation.users.view',
  'foundation.audit.view',
  'crm.customers.view',
  'organization.personnel.view',
  'organization.personnel.banking.view',
  'organization.personnel.documents.content.read',
  'organization.personnel.documents.queue.view',
  'foundation.workflow.manage',
  'organization.registrations.review',
  'organization.registrations.activate',
]);

export const REGISTRATION_ASSIGNABLE_ROLE_IDS = new Set([
  'role-sales-seller',
  'role-support-agent-v1',
  'role-purchase-requester',
  'role-finance-requester-v1',
  'role-inventory-maker-v1',
  'role-attendance-operator',
  'role-communications-operator',
  'role-delivery-representative',
  'role-driver',
  'role-service-officer',
]);

export function assertDirectAccessAssignmentAllowed(
  actor: LocalUser,
  target: LocalUser | undefined,
  nextRoleIds: string[],
  nextGrants: PermissionCode[],
  nextDenials: PermissionCode[],
  roles: SecurityRole[],
  actingAdminUserId?: string,
): void {
  if (actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، تغییر دسترسی مجاز نیست.');
  if (target?.id === actor.id) throw new Error('هیچ کاربر نمی‌تواند نقش یا ریزمجوز خودش را تغییر دهد.');
  if (target?.id === PRIMARY_ADMIN_USER_ID && !nextRoleIds.includes('role-admin')) {
    throw new Error('نقش پایه ادمین از حساب اصلی قابل حذف نیست.');
  }
  if (target?.id !== PRIMARY_ADMIN_USER_ID && nextRoleIds.includes('role-admin')) {
    throw new Error('نقش ادمین فقط متعلق به حساب اصلی محافظت‌شده است.');
  }
  const changedProtectedRole = nextRoleIds.some((roleId) => PROTECTED_ROLE_IDS.has(roleId))
    || target?.roleIds.some((roleId) => PROTECTED_ROLE_IDS.has(roleId) && !nextRoleIds.includes(roleId));
  if (changedProtectedRole && actor.id !== PRIMARY_ADMIN_USER_ID) {
    throw new Error('انتساب یا حذف نقش‌های سطح‌بالا فقط توسط ادمین اصلی مجاز است.');
  }
  const assignsProtectedCapability = nextRoleIds.some((roleId) => {
    const role = roles.find((item) => item.id === roleId);
    return role?.permissions.some((permission) => PROTECTED_PERMISSION_CODES.has(permission));
  });
  if (assignsProtectedCapability && actor.id !== PRIMARY_ADMIN_USER_ID) {
    throw new Error('انتساب نقش دارای مجوز سطح‌بالا فقط توسط ادمین اصلی مجاز است.');
  }
  if (nextGrants.some((permission) => PROTECTED_PERMISSION_CODES.has(permission))) {
    throw new Error('مجوزهای سطح‌بالا باید فقط از نقش محافظت‌شده اعطا شوند و ریزمجوز مستقیم نمی‌پذیرند.');
  }
  if (nextGrants.some((permission) => !isSafeDirectGrant(permission))) {
    throw new Error('مجوزهای عملیاتی و مدیریتی باید از نقش مصوب اعطا شوند؛ ریزمجوز مستقیم فقط برای مشاهده مجاز است.');
  }
  if (actor.id !== PRIMARY_ADMIN_USER_ID && nextDenials.some((permission)=>PROTECTED_PERMISSION_CODES.has(permission))) {
    throw new Error('تعلیق مجوزهای حساس و سطح‌بالا فقط توسط ادمین اصلی مجاز است.');
  }
}

export function assertRoleDefinitionAllowed(actor: LocalUser, permissions: PermissionCode[], actingAdminUserId?: string): void {
  if (actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، تغییر نقش مجاز نیست.');
  if (actor.id !== PRIMARY_ADMIN_USER_ID && permissions.length > 0) {
    throw new Error('تعریف مجوزهای یک نقش فقط توسط ادمین اصلی مجاز است؛ مدیر واگذارشده می‌تواند نقش‌های مصوب را به کاربران تخصیص دهد.');
  }
}

export function assertProtectedRoleMutationAllowed(actor: LocalUser, role: SecurityRole, actingAdminUserId?: string): void {
  if (actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، تغییر نقش مجاز نیست.');
  if ((PROTECTED_ROLE_IDS.has(role.id) || role.permissions.length > 0) && actor.id !== PRIMARY_ADMIN_USER_ID) {
    throw new Error('تغییر نقش سطح‌بالا فقط توسط ادمین اصلی مجاز است.');
  }
}

export function isSafeDirectGrant(_permission: PermissionCode): boolean {
  // Direct grants are deliberately disabled. Many commands and views are not
  // resource-aware yet, so attaching SELF to a direct grant would give a false
  // sense of isolation. Access must come from a reviewed role instead.
  return false;
}
