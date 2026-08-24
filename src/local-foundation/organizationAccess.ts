import type {LocalUser, PermissionCode} from './model';

/**
 * دسترسی‌های پایهٔ نقش‌های سازمانی. مجوزهای عملیاتی منابع انسانی در Seed
 * با این فهرست جمع می‌شوند تا تعریف هر نقش یک منبع روشن و قابل‌آزمون داشته باشد.
 */
export const ORGANIZATION_ROLE_GRANTS: Record<string, PermissionCode[]> = {
  'role-organization-manager': [
    'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
    'organization.units.view', 'organization.units.manage',
    'organization.positions.view', 'organization.positions.manage',
    'organization.personnel.view', 'foundation.users.view', 'organization.roles.view',
  ],
  'role-hr-operator': [
    'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
    'organization.units.view', 'organization.positions.view',
    'organization.personnel.view', 'organization.personnel.manage',
    'organization.personnel.banking.view', 'organization.personnel.banking.manage',
  ],
  'role-hr-manager': [
    'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
    'organization.units.view', 'organization.positions.view', 'foundation.users.view', 'organization.roles.view',
    'organization.personnel.view', 'organization.personnel.manage', 'organization.personnel.changes.review',
    'organization.personnel.banking.view', 'organization.personnel.banking.manage',
  ],
  'role-personnel-reviewer': [
    'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
    'organization.units.view', 'organization.positions.view',
    'organization.personnel.view', 'organization.personnel.changes.review',
    'organization.personnel.banking.view',
  ],
  'role-user-manager': [
    'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
    'foundation.users.view', 'foundation.users.edit', 'foundation.users.status.manage',
    'organization.users.create', 'organization.users.password.manage',
    'organization.roles.view', 'organization.roles.assign',
    'organization.personnel.view', 'organization.personnel.account.manage',
    'organization.registrations.view',
  ],
  'role-registration-reviewer': [
    'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
    'foundation.users.view', 'organization.roles.view',
    'organization.personnel.view',
    'organization.registrations.view', 'organization.registrations.review',
  ],
};

export interface DashboardCapability {
  id: 'organization' | 'structure' | 'personnel' | 'personnel-review' | 'users' | 'registrations' | 'roles' | 'recruitment' | 'procurement' | 'treasury';
  page: string;
  title: string;
  description: string;
  anyPermissions: PermissionCode[];
}

export const DASHBOARD_CAPABILITIES: DashboardCapability[] = [
  {id: 'organization', page: 'organization', title: 'نمای سازمان', description: 'ساختار، شعبه‌ها و وضعیت کلی سازمان', anyPermissions: ['organization.overview.view']},
  {id: 'structure', page: 'units', title: 'مدیریت ساختار سازمانی', description: 'واحدها، شعبه‌ها و سمت‌های سازمانی', anyPermissions: ['organization.units.manage', 'organization.positions.manage']},
  {id: 'personnel', page: 'personnel', title: 'عملیات پرونده‌های پرسنلی', description: 'ثبت، تکمیل و اصلاح اطلاعات پرسنل', anyPermissions: ['organization.personnel.manage']},
  {id: 'personnel-review', page: 'personnel', title: 'صف تغییرات پرسنل', description: 'بررسی مستقل درخواست‌های تغییر اطلاعات', anyPermissions: ['organization.personnel.changes.review']},
  {id: 'users', page: 'users', title: 'حساب‌های کاربری', description: 'ساخت حساب، وضعیت ورود، رمز و نقش‌ها', anyPermissions: ['organization.users.create', 'foundation.users.edit', 'foundation.users.status.manage']},
  {id: 'registrations', page: 'registrations', title: 'درخواست‌های ثبت‌نام', description: 'بررسی هویت و تصمیم‌گیری درباره ثبت‌نام', anyPermissions: ['organization.registrations.review']},
  {id: 'roles', page: 'roles', title: 'نقش‌ها و تخصیص دسترسی', description: 'مشاهده، تعریف یا تخصیص کنترل‌شده نقش‌ها', anyPermissions: ['organization.roles.manage', 'organization.roles.assign']},
  {id: 'recruitment', page: 'recruitment', title: 'جذب و شروع همکاری', description: 'اعلام نیاز، جذب، مصاحبه، پیشنهاد، شروع آموزشی و تبدیل قراردادی', anyPermissions: ['hr.recruitment_case.view', 'hr.recruitment_case.create']},
  {id: 'procurement', page: 'procurement', title: 'درخواست‌های خرید', description: 'ثبت، اصلاح، بررسی و ارجاع خرید چندشعبه‌ای', anyPermissions: ['procurement.purchase_request.view']},
  {id: 'treasury', page: 'treasury', title: 'صف پرداخت خزانه', description: 'دریافت و اجرای سهم‌های مالی تأییدشده', anyPermissions: ['treasury.treasury_execution.view']},
];

export function dashboardCapabilitiesFor(user: LocalUser): DashboardCapability[] {
  const permissions = new Set(user.permissions);
  return DASHBOARD_CAPABILITIES.filter((item) => item.anyPermissions.some((permission) => permissions.has(permission)));
}
