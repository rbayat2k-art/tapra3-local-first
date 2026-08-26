import {PROTECTED_PERMISSION_CODES, PROTECTED_ROLE_IDS} from './accessPolicy';
import type {LocalUser, PermissionCatalogItem, SecurityRole} from './model';

export type RoleAttentionCode =
  | 'inactive-with-users'
  | 'active-without-permissions'
  | 'unused'
  | 'unknown-permission';

export interface RoleDomainSummary {
  id: string;
  label: string;
  count: number;
}

export interface RoleInsight {
  role: SecurityRole;
  users: LocalUser[];
  activeUsers: LocalUser[];
  inactiveUsers: LocalUser[];
  domains: RoleDomainSummary[];
  unknownPermissions: string[];
  protectedAccess: boolean;
  attention: RoleAttentionCode[];
}

const DOMAIN_LABELS: Record<string, string> = {
  organization: 'سازمان',
  hr: 'منابع انسانی',
  crm: 'مشتری و CRM',
  sales: 'فروش',
  marketing: 'بازاریابی',
  catalog: 'کاتالوگ',
  procurement: 'تدارکات',
  supplier: 'تأمین‌کننده',
  finance: 'مالی',
  treasury: 'خزانه',
  accounting: 'حسابداری',
  warehouse: 'انبار',
  logistics: 'لجستیک',
  service: 'خدمات',
  support: 'پشتیبانی',
  contract: 'قرارداد',
  asset: 'دارایی',
  task: 'وظایف',
  communications: 'ارتباطات',
  letter: 'نامه',
  document: 'اسناد',
  management: 'مدیریت',
};

export function permissionDomainLabel(domain: string) {
  return DOMAIN_LABELS[domain] ?? domain;
}

export function roleInsight(role: SecurityRole, users: LocalUser[], catalog: PermissionCatalogItem[]): RoleInsight {
  const assignedUsers = users.filter((user) => user.roleIds.includes(role.id));
  const catalogByCode = new Map(catalog.map((item) => [item.code, item]));
  const domainCounts = new Map<string, number>();
  const unknownPermissions: string[] = [];

  role.permissions.forEach((permission) => {
    const catalogItem = catalogByCode.get(permission);
    if (!catalogItem) {
      unknownPermissions.push(permission);
      return;
    }
    domainCounts.set(catalogItem.domain, (domainCounts.get(catalogItem.domain) ?? 0) + 1);
  });

  const attention: RoleAttentionCode[] = [];
  if (role.status === 'inactive' && assignedUsers.length) attention.push('inactive-with-users');
  if (role.status === 'active' && !role.permissions.length) attention.push('active-without-permissions');
  if (role.status === 'active' && !assignedUsers.length) attention.push('unused');
  if (unknownPermissions.length) attention.push('unknown-permission');

  return {
    role,
    users: assignedUsers,
    activeUsers: assignedUsers.filter((user) => user.status === 'active'),
    inactiveUsers: assignedUsers.filter((user) => user.status === 'inactive'),
    domains: [...domainCounts.entries()]
      .map(([id, count]) => ({id, count, label: permissionDomainLabel(id)}))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'fa')),
    unknownPermissions,
    protectedAccess: PROTECTED_ROLE_IDS.has(role.id) || role.permissions.some((permission) => PROTECTED_PERMISSION_CODES.has(permission)),
    attention,
  };
}

export function roleAttentionLabel(code: RoleAttentionCode) {
  const labels: Record<RoleAttentionCode, string> = {
    'inactive-with-users': 'نقش غیرفعال هنوز کاربر دارد',
    'active-without-permissions': 'نقش فعال بدون مجوز است',
    unused: 'نقش فعال به هیچ کاربری تخصیص ندارد',
    'unknown-permission': 'مجوز ناشناخته نیازمند بررسی است',
  };
  return labels[code];
}
