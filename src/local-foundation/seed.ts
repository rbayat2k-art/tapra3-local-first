import type {
  AuditEvent, CustomerRecord, DomainEvent, FoundationSession, LocalUser, MetaRecord, OrganizationalPosition,
  OperationalRecord, OperationalRecordHistory, OrganizationalUnit, PermissionCatalogItem, PermissionCode, PermissionEntitlement, PersonnelRecord, PolicyDefinition, SalesStructure, ScopeType, SecurityRole,
} from './model';
import {completeRequiredQaPersonnelRecords} from './qaPersonnelCompletion';
import {FOUNDATION_SCHEMA_VERSION, FOUNDATION_SEED_VERSION, FOUNDATION_STORES, type FoundationStoreName} from './model';
import {ERP_ADMIN_PERMISSIONS, ERP_MODULES, ERP_ROLE_TEMPLATES, ERP_WORKFLOWS, permissionFor, seedOperationalRecords} from './erpCatalog';
import {COMPANY_ID, SEED_TIME} from './seedConstants';
import {ORGANIZATION_ROLE_GRANTS} from './organizationAccess';
import {defaultApprovalStages} from './workflowPolicy';
import {createDefaultSalesCompensationRecord} from './salesCompensation';

export {COMPANY_ID, SEED_TIME} from './seedConstants';

export interface RoleTemplate {
  id: string;
  title: string;
  description: string;
  scope: ScopeType;
  permissions: PermissionCode[];
}

const shellBase: PermissionCode[] = [
  'foundation.dashboard.view', 'foundation.preferences.manage', 'organization.overview.view',
];
const employeeSelfService: PermissionCode[] = [
  ...shellBase,
  permissionFor('employee-advance', 'view'), permissionFor('employee-advance', 'create'),
  permissionFor('employee-advance', 'edit'), permissionFor('employee-advance', 'transition'),
];
export const ADMIN_OPERATIONAL_PERMISSIONS: PermissionCode[] = [
  ...employeeSelfService, 'foundation.users.view', 'foundation.users.edit', 'foundation.users.status.manage',
  'foundation.users.qa_login', 'foundation.qa.view', 'foundation.policy.inspect', 'foundation.audit.view',
  'foundation.data.export', 'foundation.data.manage', 'organization.units.view', 'organization.units.manage',
  'organization.positions.view', 'organization.positions.manage', 'organization.users.create',
  'organization.users.password.manage', 'organization.roles.view', 'organization.roles.manage', 'organization.roles.assign',
  'organization.personnel.view', 'organization.personnel.manage', 'organization.personnel.changes.review', 'organization.personnel.banking.view',
  'organization.personnel.banking.manage', 'organization.personnel.account.manage',
  'organization.personnel.documents.queue.view', 'organization.personnel.documents.content.read', 'organization.personnel.documents.manage',
  'crm.customers.view', 'crm.customers.create', 'crm.customers.edit', 'crm.customers.status.manage',
  'crm.customers.merge', 'crm.customers.import',
  'organization.registrations.view', 'organization.registrations.review', 'organization.registrations.activate', 'foundation.qa.manage',
  'foundation.reports.view', 'foundation.workflow.manage', ...ERP_ADMIN_PERMISSIONS,
];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {id: 'role-admin', title: 'ادمین', description: 'مدیریت کامل محصول محلی، سازمان و دسترسی‌ها', scope: 'COMPANY', permissions: ADMIN_OPERATIONAL_PERMISSIONS},
  {id: 'role-system-admin', title: 'مدیر سامانه', description: 'مدیریت کاربران، ساختار سازمان، نقش‌ها و دادهٔ محلی؛ بدون اختیار تجاری ضمنی', scope: 'COMPANY', permissions: [...shellBase, 'foundation.users.view', 'foundation.users.edit', 'foundation.users.status.manage', 'foundation.users.qa_login', 'foundation.qa.view', 'foundation.qa.manage', 'foundation.policy.inspect', 'foundation.audit.view', 'foundation.data.export', 'foundation.data.manage', 'foundation.workflow.manage', 'foundation.reports.view', 'organization.units.view', 'organization.units.manage', 'organization.positions.view', 'organization.positions.manage', 'organization.users.create', 'organization.users.password.manage', 'organization.roles.view', 'organization.roles.manage', 'organization.roles.assign', 'organization.personnel.view', 'organization.personnel.manage', 'organization.personnel.changes.review', 'organization.personnel.banking.view', 'organization.personnel.banking.manage', 'organization.personnel.account.manage', 'organization.registrations.view', 'organization.registrations.activate']},
  {id: 'role-finance-requester', title: 'درخواست‌کننده مالی', description: 'ثبت درخواست در محدودهٔ کاری خود', scope: 'SELF', permissions: [...employeeSelfService, 'business.request.create']},
  {id: 'role-branch-approver', title: 'تأییدکننده مالی', description: 'تأیید درخواست‌های واحد با رعایت سازنده/تأییدکننده', scope: 'UNIT', permissions: [...employeeSelfService, 'business.request.approve']},
  {id: 'role-inventory-maker', title: 'ثبت‌کننده موجودی', description: 'ثبت تعدیل موجودی بدون مجوز تأیید', scope: 'UNIT', permissions: [...employeeSelfService, 'business.inventory.adjust']},
  {id: 'role-inventory-approver', title: 'تأییدکننده موجودی', description: 'تأیید تعدیل‌های دیگران در واحد انبار', scope: 'UNIT', permissions: [...employeeSelfService, 'business.inventory.approve']},
  {id: 'role-support-agent', title: 'کارشناس پشتیبانی', description: 'دسترسی به پرونده‌های تخصیص‌یافته', scope: 'SELF', permissions: employeeSelfService},
  {id: 'role-auditor', title: 'ممیز داخلی', description: 'نقش موقت فقط‌خواندنی برای مشاهده ساختار و خط‌مشی؛ گزارش ممیزی تا تصویب قرارداد سانسور نمایش داده نمی‌شود', scope: 'COMPANY', permissions: [...shellBase, 'organization.units.view', 'organization.positions.view', 'organization.roles.view', 'foundation.policy.inspect']},
  {id: 'role-registration-reviewer', title: 'بازبین ثبت‌نام', description: 'بررسی هویت و تصمیم‌گیری درباره درخواست ثبت‌نام؛ بدون اختیار ویرایش پرونده یا نقش', scope: 'COMPANY', permissions: ORGANIZATION_ROLE_GRANTS['role-registration-reviewer']},
  ...ERP_ROLE_TEMPLATES.map((role) => ({
    ...role,
    permissions: [...new Set([
      ...role.permissions,
      ...(ORGANIZATION_ROLE_GRANTS[role.id] ?? []),
      ...(['role-sales-vice', 'role-sales-manager', 'role-senior-sales-supervisor', 'role-sales-supervisor', 'role-sales-seller', 'role-purchase-requester', 'role-purchase-approver', 'role-treasury-executor-v1'].includes(role.id) ? employeeSelfService : []),
    ])],
  })),
];

export const SECURITY_ROLES: SecurityRole[] = ROLE_TEMPLATES.map((role) => ({
  id: role.id, name: role.title, description: role.description, status: 'active', protected: true,
  scope: role.scope, permissions: [...role.permissions], createdAt: SEED_TIME, updatedAt: SEED_TIME,
}));

export const ORGANIZATIONAL_UNITS: OrganizationalUnit[] = [
  {id: 'unit-management', name: 'مدیریت', type: 'مدیریت', status: 'active', order: 1, managerUserId: 'persona-product-owner', description: 'راهبری و مدیریت کل شرکت', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-central', name: 'سعادت‌آباد', type: 'شعبه', parentId: 'unit-management', managerUserId: 'persona-advance-branch-manager', status: 'active', order: 1, description: 'شعبه فروش سعادت‌آباد', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-poonak', name: 'پونک', type: 'شعبه', parentId: 'unit-management', status: 'active', order: 2, description: 'شعبه فروش پونک', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-poonak-night', name: 'پونک شب', type: 'شعبه', parentId: 'unit-management', status: 'active', order: 3, description: 'شعبه فروش پونک شب', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-mokhberi-1', name: 'مخبری یک', type: 'شعبه', parentId: 'unit-management', status: 'active', order: 4, description: 'شعبه فروش مخبری یک', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-mokhberi-4', name: 'مخبری چهار', type: 'شعبه', parentId: 'unit-management', status: 'active', order: 5, description: 'شعبه فروش مخبری چهار', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-fakhar', name: 'فخار مقدم', type: 'شعبه', parentId: 'unit-management', status: 'active', order: 6, description: 'شعبه فروش فخار مقدم', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-branch-azadi', name: 'آزادی', type: 'شعبه', parentId: 'unit-management', status: 'active', order: 7, description: 'شعبه فروش آزادی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-human-resources', name: 'منابع انسانی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 1, description: 'مدیریت سرمایه انسانی و امور کارکنان', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-accounting', name: 'حسابداری', type: 'واحد', parentId: 'unit-management', status: 'active', order: 2, description: 'ثبت و کنترل عملیات حسابداری', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-finance', name: 'خزانه', type: 'واحد', parentId: 'unit-management', managerUserId: 'persona-branch-approver', status: 'active', order: 3, description: 'مدیریت دریافت، پرداخت و جریان نقدی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-post', name: 'پست', type: 'واحد', parentId: 'unit-management', status: 'active', order: 4, description: 'هماهنگی مراسلات و ارسال‌های سازمانی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-warehouse', name: 'انبار', type: 'واحد', parentId: 'unit-management', managerUserId: 'persona-inventory-approver', status: 'active', order: 5, description: 'کنترل موجودی و عملیات انبار', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-recording-monitoring', name: 'ثبت و شنود', type: 'واحد', parentId: 'unit-management', status: 'active', order: 6, description: 'ثبت و پایش تعاملات مجاز سازمانی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-legal', name: 'حقوقی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 7, description: 'رسیدگی به امور حقوقی و قراردادها', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-growth-team', name: 'تیم افزایشی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 8, description: 'توسعه ظرفیت و رشد عملیات', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-after-sales', name: 'خدمات پس از فروش', type: 'واحد', parentId: 'unit-management', status: 'active', order: 9, description: 'رسیدگی به تعهدات و خدمات پس از فروش', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-administration', name: 'اداری', type: 'واحد', parentId: 'unit-management', status: 'active', order: 10, description: 'امور اداری و هماهنگی داخلی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-commercial', name: 'بازرگانی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 11, description: 'خرید، تأمین و ارتباطات بازرگانی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-content', name: 'تولید محتوا', type: 'واحد', parentId: 'unit-management', status: 'active', order: 12, description: 'برنامه‌ریزی و تولید محتوای سازمان', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-mis', name: 'MIS', type: 'واحد', parentId: 'unit-management', status: 'active', order: 13, description: 'گزارش‌ها و سامانه اطلاعات مدیریت', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-web-development', name: 'سایت و برنامه‌نویسی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 14, description: 'توسعه و نگهداری محصولات نرم‌افزاری و وب', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-acceptors', name: 'پذیرندگان', type: 'واحد', parentId: 'unit-management', status: 'active', order: 15, description: 'مدیریت امور پذیرندگان', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-sales', name: 'فروش', type: 'واحد', parentId: 'unit-management', managerUserId: 'persona-seller', status: 'active', order: 16, description: 'فروش و توسعه ارتباط تجاری', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-it', name: 'IT', type: 'واحد', parentId: 'unit-management', status: 'active', order: 17, description: 'زیرساخت، شبکه و پشتیبانی فناوری اطلاعات', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-maximum', name: 'ماکسیمم', type: 'واحد', parentId: 'unit-management', status: 'active', order: 18, description: 'واحد ماکسیمم', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-operations', name: 'عملیات', type: 'واحد', parentId: 'unit-management', status: 'active', order: 19, description: 'برنامه‌ریزی و اجرای عملیات سازمان', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-advertising', name: 'تبلیغات', type: 'واحد', parentId: 'unit-management', status: 'active', order: 20, description: 'طراحی و اجرای برنامه‌های تبلیغاتی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-security', name: 'حراست', type: 'واحد', parentId: 'unit-management', status: 'active', order: 21, description: 'حفاظت و کنترل امنیت سازمانی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-services', name: 'خدمات', type: 'واحد', parentId: 'unit-management', status: 'active', order: 22, description: 'پشتیبانی خدمات عمومی سازمان', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-collector', name: 'تحصیل‌دار', type: 'واحد', parentId: 'unit-management', status: 'active', order: 23, description: 'پیگیری وصول و تحویل اسناد مالی', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-projects', name: 'پروژه‌ها', type: 'واحد', parentId: 'unit-management', status: 'active', order: 24, description: 'برنامه‌ریزی و کنترل پروژه‌ها', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-support', name: 'پشتیبانی', type: 'واحد', parentId: 'unit-management', managerUserId: 'persona-support-agent', status: 'active', order: 25, description: 'رسیدگی به درخواست‌ها و پشتیبانی کاربران', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-studio', name: 'آتلیه', type: 'واحد', parentId: 'unit-management', status: 'active', order: 26, description: 'تولید و مدیریت محتوای تصویری', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-validation', name: 'اعتبارسنجی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 27, description: 'بررسی و کنترل اعتبار اطلاعات و پرونده‌ها', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'unit-sales-boost', name: 'فروش تقویتی', type: 'واحد', parentId: 'unit-management', status: 'active', order: 28, description: 'برنامه‌های تکمیلی و تقویت عملکرد فروش', createdAt: SEED_TIME, updatedAt: SEED_TIME},
];

const GENERAL_POSITION_UNIT_IDS = ORGANIZATIONAL_UNITS.filter((unit) => unit.type !== 'شعبه').map((unit) => unit.id);
const SALES_POSITION_UNIT_IDS = ['unit-sales'];

export const ORGANIZATIONAL_POSITIONS: OrganizationalPosition[] = [
  {id: 'position-ceo', title: 'مدیرعامل', description: 'مسئول راهبری کل شرکت', unitIds: ['unit-management'], status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-manager', title: 'مدیر', description: 'مسئول یک واحد یا حوزه سازمانی', unitIds: GENERAL_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-supervisor', title: 'سرپرست', description: 'هماهنگی تیم و پیگیری عملیات', unitIds: GENERAL_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-specialist', title: 'کارشناس', description: 'اجرای فعالیت‌های تخصصی', unitIds: GENERAL_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-responsible', title: 'مسئول', description: 'پاسخ‌گویی نسبت به یک جریان مشخص', unitIds: GENERAL_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-operator', title: 'اپراتور', description: 'اجرای عملیات ثبت و پردازش', unitIds: GENERAL_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-sales-vice', title: 'معاونت فروش', description: 'سمت خودکار متناظر با رده معاونت فروش', unitIds: SALES_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-sales-manager', title: 'مدیر فروش', description: 'سمت خودکار متناظر با رده مدیر فروش', unitIds: SALES_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-sales-senior-supervisor', title: 'سرپرست ارشد فروش', description: 'سمت خودکار متناظر با رده سرپرست ارشد فروش', unitIds: SALES_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-sales-supervisor', title: 'سرپرست کال‌سنتر', description: 'سمت خودکار متناظر با رده سرپرست کال‌سنتر', unitIds: SALES_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'position-seller', title: 'فروشنده', description: 'سمت خودکار متناظر با رده فروشنده', unitIds: SALES_POSITION_UNIT_IDS, status: 'active', createdAt: SEED_TIME, updatedAt: SEED_TIME},
];

// PBKDF2 hash of the deterministic acceptance credential; plaintext never enters IndexedDB or Audit.
// Deterministic NORMAL_DEMO credential: Tapra2@123 (PBKDF2; never store the plain value in IndexedDB).
const PASSWORD_HASH = 'pbkdf2$120000$dGFwcmEyLXNlZWQtdjE=$c7g7Y8/IzaGuBPy0F3nuyktczTVMqAfjJquBsb/NYHU=';

type SeedUserInput = Pick<LocalUser, 'id' | 'actorId' | 'name' | 'username' | 'roleId' | 'roleIds' | 'status' | 'companyId' | 'unitId' | 'positionId' | 'managerUserId' | 'accent' | 'initials' | 'isAdmin'> & Partial<Pick<LocalUser, 'teamId' | 'personnelId' | 'branchUnitId' | 'salesHierarchyLevel' | 'advanceBranchIds'>>;
function user(input: SeedUserInput): LocalUser {
  const assigned = ROLE_TEMPLATES.filter((role) => input.roleIds.includes(role.id));
  const primary = assigned.find((role) => role.id === input.roleId) ?? assigned[0];
  if (!primary) throw new Error(`Unknown seed role: ${input.roleId}`);
  const permissionEntitlements = assigned.flatMap((role) => role.permissions.map((permission) => ({permission, scope: role.scope, source: 'role' as const, sourceRoleId: role.id})));
  return {branchUnitId: 'unit-branch-central', ...input, passwordHash: PASSWORD_HASH, passwordUpdatedAt: SEED_TIME, roleTitle: primary.title, roles: assigned.map((role) => role.title), description: primary.description, scope: primary.scope, permissions: [...new Set(permissionEntitlements.map((item) => item.permission))], permissionEntitlements};
}

export const LOCAL_USERS: LocalUser[] = [
  user({id: 'persona-product-owner', actorId: 'actor-product-owner', name: 'ایلیا بیات', username: 'admin', roleId: 'role-admin', roleIds: ['role-admin'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-management', positionId: 'position-ceo', personnelId: 'personnel-admin', accent: '#6957d9', initials: 'ا.ب', isAdmin: true}),
  user({id: 'persona-system-admin', actorId: 'actor-system-admin', name: 'سارا احمدی', username: 's.ahmadi', roleId: 'role-system-admin', roleIds: ['role-system-admin'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-management', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-sara', accent: '#0d9488', initials: 'س.ا', isAdmin: false}),
  user({id: 'persona-finance-requester', actorId: 'actor-finance-requester', name: 'مهدی رضایی', username: 'm.rezaei', roleId: 'role-finance-requester', roleIds: ['role-finance-requester'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-finance', positionId: 'position-specialist', managerUserId: 'persona-branch-approver', personnelId: 'personnel-mehdi', accent: '#0284c7', initials: 'م.ر', isAdmin: false}),
  user({id: 'persona-branch-approver', actorId: 'actor-branch-approver', name: 'نیلوفر کریمی', username: 'n.karimi', roleId: 'role-branch-approver', roleIds: ['role-branch-approver'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-finance', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-niloofar', accent: '#7c3aed', initials: 'ن.ک', isAdmin: false}),
  user({id: 'persona-seller', actorId: 'actor-seller', name: 'آرمان فرهمند', username: 'a.farahmand', roleId: 'role-sales-manager', roleIds: ['role-sales-manager','role-workforce-requester','role-recruitment-interviewer'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-arman', teamId: 'team-sales-a', salesHierarchyLevel: 'sales_manager', accent: '#2563eb', initials: 'آ.ف', isAdmin: false}),
  user({id: 'persona-sales-vice-network', actorId: 'actor-sales-vice-network', name: 'سودابه مرادی', username: 's.moradi.sales', roleId: 'role-sales-vice', roleIds: ['role-sales-vice'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-vice', managerUserId: 'persona-product-owner', personnelId: 'personnel-sales-vice', branchUnitId: 'unit-branch-central', salesHierarchyLevel: 'sales_vice', accent: '#7c3aed', initials: 'س.م', isAdmin: false}),
  user({id: 'persona-sales-senior', actorId: 'actor-sales-senior', name: 'فرزاد قاسمی', username: 'f.ghasemi', roleId: 'role-senior-sales-supervisor', roleIds: ['role-senior-sales-supervisor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-senior-supervisor', managerUserId: 'persona-seller', personnelId: 'personnel-sales-senior', branchUnitId: 'unit-branch-central', salesHierarchyLevel: 'senior_supervisor', accent: '#4f46e5', initials: 'ف.ق', isAdmin: false}),
  user({id: 'persona-sales-senior-poonak', actorId: 'actor-sales-senior-poonak', name: 'پوریا شریفی', username: 'p.sharifi.sales', roleId: 'role-senior-sales-supervisor', roleIds: ['role-senior-sales-supervisor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-senior-supervisor', managerUserId: 'persona-seller', personnelId: 'personnel-sales-senior-poonak', branchUnitId: 'unit-branch-poonak', salesHierarchyLevel: 'senior_supervisor', accent: '#7c3aed', initials: 'پ.ش', isAdmin: false}),
  user({id: 'persona-callcenter-a', actorId: 'actor-callcenter-a', name: 'ناهید احمدی', username: 'n.ahmadi', roleId: 'role-sales-supervisor', roleIds: ['role-sales-supervisor','role-recruitment-interviewer','role-onboarding-supervisor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerUserId: 'persona-sales-senior', personnelId: 'personnel-callcenter-a', branchUnitId: 'unit-branch-central', salesHierarchyLevel: 'sales_supervisor', accent: '#0d9488', initials: 'ن.ا', isAdmin: false}),
  user({id: 'persona-callcenter-b', actorId: 'actor-callcenter-b', name: 'رضا محمدی', username: 'r.mohammadi', roleId: 'role-sales-supervisor', roleIds: ['role-sales-supervisor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerUserId: 'persona-sales-senior', personnelId: 'personnel-callcenter-b', branchUnitId: 'unit-branch-central', salesHierarchyLevel: 'sales_supervisor', accent: '#0891b2', initials: 'ر.م', isAdmin: false}),
  user({id: 'persona-callcenter-c', actorId: 'actor-callcenter-c', name: 'مریم حسینی', username: 'm.hosseini', roleId: 'role-sales-supervisor', roleIds: ['role-sales-supervisor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerUserId: 'persona-sales-senior', personnelId: 'personnel-callcenter-c', branchUnitId: 'unit-branch-central', salesHierarchyLevel: 'sales_supervisor', accent: '#db2777', initials: 'م.ح', isAdmin: false}),
  user({id: 'persona-callcenter-poonak', actorId: 'actor-callcenter-poonak', name: 'سینا عزیزی', username: 's.azizi.sales', roleId: 'role-sales-supervisor', roleIds: ['role-sales-supervisor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerUserId: 'persona-sales-senior-poonak', personnelId: 'personnel-callcenter-poonak', branchUnitId: 'unit-branch-poonak', salesHierarchyLevel: 'sales_supervisor', accent: '#0f766e', initials: 'س.ع', isAdmin: false}),
  user({id: 'persona-laleh', actorId: 'actor-laleh', name: 'لاله مرادی', username: 'l.moradi', roleId: 'role-sales-seller', roleIds: ['role-sales-seller'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', positionId: 'position-seller', managerUserId: 'persona-callcenter-a', personnelId: 'personnel-laleh', branchUnitId: 'unit-branch-central', teamId: 'team-sales-a', salesHierarchyLevel: 'seller', accent: '#9333ea', initials: 'ل.م', isAdmin: false}),
  user({id: 'persona-inventory-maker', actorId: 'actor-inventory-maker', name: 'رضا نادری', username: 'r.naderi', roleId: 'role-inventory-maker', roleIds: ['role-inventory-maker'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-warehouse', positionId: 'position-operator', managerUserId: 'persona-inventory-approver', personnelId: 'personnel-reza', accent: '#d97706', initials: 'ر.ن', isAdmin: false}),
  user({id: 'persona-inventory-approver', actorId: 'actor-inventory-approver', name: 'الهام شریفی', username: 'e.sharifi', roleId: 'role-inventory-approver', roleIds: ['role-inventory-approver'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-warehouse', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-elham', accent: '#b45309', initials: 'ا.ش', isAdmin: false}),
  user({id: 'persona-support-agent', actorId: 'actor-support-agent', name: 'نگار موسوی', username: 'n.mousavi', roleId: 'role-support-agent', roleIds: ['role-support-agent'], status: 'inactive', companyId: COMPANY_ID, unitId: 'unit-support', positionId: 'position-supervisor', managerUserId: 'persona-product-owner', personnelId: 'personnel-negar', teamId: 'team-support-a', accent: '#e11d48', initials: 'ن.م', isAdmin: false}),
  user({id: 'persona-auditor', actorId: 'actor-auditor', name: 'فرهاد زمانی', username: 'f.zamani', roleId: 'role-auditor', roleIds: ['role-auditor'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-management', positionId: 'position-specialist', managerUserId: 'persona-product-owner', personnelId: 'personnel-farhad', accent: '#475569', initials: 'ف.ز', isAdmin: false}),
  user({id: 'persona-organization-manager', actorId: 'actor-organization-manager', name: 'پویا رستگار', username: 'p.rostegar', roleId: 'role-organization-manager', roleIds: ['role-organization-manager'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-management', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-organization-manager', accent: '#4f46e5', initials: 'پ.ر', isAdmin: false}),
  user({id: 'persona-hr-manager', actorId: 'actor-hr-manager', name: 'نازنین اکبری', username: 'n.akbari', roleId: 'role-hr-manager', roleIds: ['role-hr-manager','role-recruitment-manager'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-human-resources', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-hr-manager', accent: '#9333ea', initials: 'ن.ا', isAdmin: false}),
  user({id: 'persona-hr-operator', actorId: 'actor-hr-operator', name: 'مریم توکلی', username: 'm.tavakoli', roleId: 'role-hr-operator', roleIds: ['role-hr-operator','role-recruitment-operator'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-human-resources', positionId: 'position-specialist', managerUserId: 'persona-hr-manager', personnelId: 'personnel-hr-operator', accent: '#db2777', initials: 'م.ت', isAdmin: false}),
  user({id: 'persona-user-manager', actorId: 'actor-user-manager', name: 'کیانا صادقی', username: 'k.sadeghi', roleId: 'role-user-manager', roleIds: ['role-user-manager'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-it', positionId: 'position-specialist', managerUserId: 'persona-system-admin', personnelId: 'personnel-user-manager', accent: '#0891b2', initials: 'ک.ص', isAdmin: false}),
  user({id: 'persona-registration-reviewer', actorId: 'actor-registration-reviewer', name: 'سمیرا کریمی', username: 's.karimi', roleId: 'role-registration-reviewer', roleIds: ['role-registration-reviewer'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-human-resources', positionId: 'position-specialist', managerUserId: 'persona-hr-manager', personnelId: 'personnel-registration-reviewer', accent: '#059669', initials: 'س.ک', isAdmin: false}),
  user({id: 'persona-personnel-reviewer', actorId: 'actor-personnel-reviewer', name: 'علی مرادی', username: 'a.moradi', roleId: 'role-personnel-reviewer', roleIds: ['role-personnel-reviewer'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-human-resources', positionId: 'position-specialist', managerUserId: 'persona-hr-manager', personnelId: 'personnel-personnel-reviewer', accent: '#c2410c', initials: 'ع.م', isAdmin: false}),
  user({id: 'persona-purchase-requester', actorId: 'actor-purchase-requester', name: 'پریسا جوادی', username: 'p.javadi', roleId: 'role-purchase-requester', roleIds: ['role-purchase-requester'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-administration', positionId: 'position-specialist', managerUserId: 'persona-purchase-approver', personnelId: 'personnel-purchase-requester', accent: '#2563eb', initials: 'پ.ج', isAdmin: false}),
  user({id: 'persona-purchase-approver', actorId: 'actor-purchase-approver', name: 'حمید رستمی', username: 'h.rostami', roleId: 'role-purchase-approver', roleIds: ['role-purchase-approver'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-management', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-purchase-approver', accent: '#7c3aed', initials: 'ح.ر', isAdmin: false}),
  user({id: 'persona-treasury-executor', actorId: 'actor-treasury-executor', name: 'بردیا نوری', username: 'b.nouri', roleId: 'role-treasury-executor-v1', roleIds: ['role-treasury-executor-v1'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-finance', positionId: 'position-specialist', managerUserId: 'persona-branch-approver', personnelId: 'personnel-treasury-executor', accent: '#059669', initials: 'ب.ن', isAdmin: false}),
  user({id: 'persona-advance-branch-manager', actorId: 'actor-advance-branch-manager', name: 'کامران یوسفی', username: 'k.yousefi', roleId: 'role-advance-branch-manager', roleIds: ['role-advance-branch-manager'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', branchUnitId: 'unit-branch-central', positionId: 'position-manager', managerUserId: 'persona-product-owner', personnelId: 'personnel-advance-branch-manager', advanceBranchIds: ['unit-branch-central'], accent: '#ea580c', initials: 'ک.ی', isAdmin: false}),
  user({id: 'persona-advance-accounting', actorId: 'actor-advance-accounting', name: 'بهاره اکبری', username: 'b.akbari', roleId: 'role-advance-accounting-reviewer', roleIds: ['role-advance-accounting-reviewer'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-accounting', branchUnitId: 'unit-branch-central', positionId: 'position-specialist', managerUserId: 'persona-product-owner', personnelId: 'personnel-advance-accounting', advanceBranchIds: ['*'], accent: '#0891b2', initials: 'ب.ا', isAdmin: false}),
  user({id: 'persona-sales-advance-approver', actorId: 'actor-sales-advance-approver', name: 'سودابه مرادی', username: 's.moradi', roleId: 'role-sales-advance-approver', roleIds: ['role-sales-advance-approver', 'role-sales-vice'], status: 'active', companyId: COMPANY_ID, unitId: 'unit-sales', branchUnitId: 'unit-branch-central', positionId: 'position-sales-vice', managerUserId: 'persona-product-owner', personnelId: 'personnel-sales-advance-approver', advanceBranchIds: ['*'], salesHierarchyLevel: 'sales_vice', accent: '#7c3aed', initials: 'س.م', isAdmin: false}),
];

const personnel = (input: Omit<PersonnelRecord, 'createdAt' | 'updatedAt' | 'gender' | 'maritalStatus' | 'employmentType' | 'startDate' | 'primaryMobile' | 'branchUnitId' | 'movements' | 'salesCompensationHistory'> & Partial<Pick<PersonnelRecord, 'gender' | 'maritalStatus' | 'employmentType' | 'startDate' | 'primaryMobile' | 'branchUnitId' | 'movements' | 'salesCompensationHistory'>>): PersonnelRecord => {
  const record: PersonnelRecord = {companyId: COMPANY_ID, gender: 'unspecified', maritalStatus: 'unspecified', employmentType: 'تمام‌وقت', startDate: '2024-01-01', primaryMobile: '', branchUnitId: 'unit-branch-central', movements: [], createdAt: SEED_TIME, updatedAt: SEED_TIME, ...input};
  if (record.salesHierarchyLevel && !record.salesAssignmentStartDate) record.salesAssignmentStartDate = record.startDate;
  const initialCompensation = createDefaultSalesCompensationRecord(record, SEED_TIME);
  return initialCompensation && !record.salesCompensationHistory?.length ? {...record, salesCompensationHistory: [initialCompensation]} : record;
};
const BASE_PERSONNEL_RECORDS: PersonnelRecord[] = [
  personnel({id: 'personnel-admin', personnelCode: 'P-1001', firstName: 'ایلیا', lastName: 'بیات', nationalId: '0013546783', gender: 'male', primaryMobile: '09121234567', secondaryMobile: '09121234568', personalEmail: 'iliya@example.test', province: 'تهران', city: 'تهران', address: 'تهران، دفتر مرکزی شاهراه', employmentStatus: 'active', unitId: 'unit-management', positionId: 'position-ceo', bankName: 'ملت', cardNumber: '6104337812345678', iban: 'IR820540102680020817909002', linkedUserId: 'persona-product-owner'}),
  personnel({id: 'personnel-sara', personnelCode: 'P-1002', firstName: 'سارا', lastName: 'احمدی', primaryMobile: '09123334455', employmentStatus: 'active', unitId: 'unit-management', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-system-admin'}),
  personnel({id: 'personnel-mehdi', personnelCode: 'P-2001', firstName: 'مهدی', lastName: 'رضایی', primaryMobile: '09125556677', employmentStatus: 'active', unitId: 'unit-finance', positionId: 'position-specialist', managerPersonnelId: 'personnel-niloofar', linkedUserId: 'persona-finance-requester'}),
  personnel({id: 'personnel-niloofar', personnelCode: 'P-2002', firstName: 'نیلوفر', lastName: 'کریمی', primaryMobile: '09127778899', employmentStatus: 'active', unitId: 'unit-finance', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-branch-approver'}),
  personnel({id: 'personnel-arman', personnelCode: 'P-3001', firstName: 'آرمان', lastName: 'فرهمند', primaryMobile: '09121112233', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-manager', managerPersonnelId: 'personnel-admin', salesHierarchyLevel: 'sales_manager', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-seller'}),
  personnel({id: 'personnel-sales-vice', personnelCode: 'P-3010', firstName: 'سودابه', lastName: 'مرادی', primaryMobile: '09121000010', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-vice', managerPersonnelId: 'personnel-admin', salesHierarchyLevel: 'sales_vice', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-sales-vice-network'}),
  personnel({id: 'personnel-sales-senior', personnelCode: 'P-3011', firstName: 'فرزاد', lastName: 'قاسمی', primaryMobile: '09121000011', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-senior-supervisor', managerPersonnelId: 'personnel-arman', salesHierarchyLevel: 'senior_supervisor', salesSupervisorPersonnelId: 'personnel-arman', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-sales-senior'}),
  personnel({id: 'personnel-sales-senior-poonak', personnelCode: 'P-3015', firstName: 'پوریا', lastName: 'شریفی', primaryMobile: '09121000015', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-senior-supervisor', managerPersonnelId: 'personnel-arman', branchUnitId: 'unit-branch-poonak', salesHierarchyLevel: 'senior_supervisor', salesSupervisorPersonnelId: 'personnel-arman', salesBranchUnitId: 'unit-branch-poonak', linkedUserId: 'persona-sales-senior-poonak'}),
  personnel({id: 'personnel-callcenter-a', personnelCode: 'P-3012', firstName: 'ناهید', lastName: 'احمدی', primaryMobile: '09121000012', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerPersonnelId: 'personnel-sales-senior', salesHierarchyLevel: 'sales_supervisor', salesSupervisorPersonnelId: 'personnel-sales-senior', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-callcenter-a'}),
  personnel({id: 'personnel-callcenter-b', personnelCode: 'P-3013', firstName: 'رضا', lastName: 'محمدی', primaryMobile: '09121000013', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerPersonnelId: 'personnel-sales-senior', salesHierarchyLevel: 'sales_supervisor', salesSupervisorPersonnelId: 'personnel-sales-senior', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-callcenter-b'}),
  personnel({id: 'personnel-callcenter-c', personnelCode: 'P-3014', firstName: 'مریم', lastName: 'حسینی', primaryMobile: '09121000014', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerPersonnelId: 'personnel-sales-senior', salesHierarchyLevel: 'sales_supervisor', salesSupervisorPersonnelId: 'personnel-sales-senior', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-callcenter-c'}),
  personnel({id: 'personnel-callcenter-poonak', personnelCode: 'P-3016', firstName: 'سینا', lastName: 'عزیزی', primaryMobile: '09121000016', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-supervisor', managerPersonnelId: 'personnel-sales-senior-poonak', branchUnitId: 'unit-branch-poonak', salesHierarchyLevel: 'sales_supervisor', salesSupervisorPersonnelId: 'personnel-sales-senior-poonak', salesBranchUnitId: 'unit-branch-poonak', linkedUserId: 'persona-callcenter-poonak'}),
  personnel({id: 'personnel-reza', personnelCode: 'P-4001', firstName: 'رضا', lastName: 'نادری', primaryMobile: '09124445566', employmentStatus: 'active', unitId: 'unit-warehouse', positionId: 'position-operator', managerPersonnelId: 'personnel-elham', linkedUserId: 'persona-inventory-maker'}),
  personnel({id: 'personnel-elham', personnelCode: 'P-4002', firstName: 'الهام', lastName: 'شریفی', primaryMobile: '09128889900', employmentStatus: 'active', unitId: 'unit-warehouse', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-inventory-approver'}),
  personnel({id: 'personnel-negar', personnelCode: 'P-5001', firstName: 'نگار', lastName: 'موسوی', primaryMobile: '09126667788', employmentStatus: 'active', unitId: 'unit-support', positionId: 'position-supervisor', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-support-agent'}),
  personnel({id: 'personnel-farhad', personnelCode: 'P-1003', firstName: 'فرهاد', lastName: 'زمانی', primaryMobile: '09129990011', employmentStatus: 'active', unitId: 'unit-management', positionId: 'position-specialist', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-auditor'}),
  personnel({id: 'personnel-organization-manager', personnelCode: 'P-1101', firstName: 'پویا', lastName: 'رستگار', primaryMobile: '09121110001', employmentStatus: 'active', unitId: 'unit-management', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-organization-manager'}),
  personnel({id: 'personnel-hr-manager', personnelCode: 'P-1201', firstName: 'نازنین', lastName: 'اکبری', primaryMobile: '09121110002', employmentStatus: 'active', unitId: 'unit-human-resources', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-hr-manager'}),
  personnel({id: 'personnel-hr-operator', personnelCode: 'P-1202', firstName: 'مریم', lastName: 'توکلی', primaryMobile: '09121110003', employmentStatus: 'active', unitId: 'unit-human-resources', positionId: 'position-specialist', managerPersonnelId: 'personnel-hr-manager', linkedUserId: 'persona-hr-operator'}),
  personnel({id: 'personnel-user-manager', personnelCode: 'P-1301', firstName: 'کیانا', lastName: 'صادقی', primaryMobile: '09121110004', employmentStatus: 'active', unitId: 'unit-it', positionId: 'position-specialist', managerPersonnelId: 'personnel-sara', linkedUserId: 'persona-user-manager'}),
  personnel({id: 'personnel-registration-reviewer', personnelCode: 'P-1203', firstName: 'سمیرا', lastName: 'کریمی', primaryMobile: '09121110005', employmentStatus: 'active', unitId: 'unit-human-resources', positionId: 'position-specialist', managerPersonnelId: 'personnel-hr-manager', linkedUserId: 'persona-registration-reviewer'}),
  personnel({id: 'personnel-personnel-reviewer', personnelCode: 'P-1204', firstName: 'علی', lastName: 'مرادی', primaryMobile: '09121110006', employmentStatus: 'active', unitId: 'unit-human-resources', positionId: 'position-specialist', managerPersonnelId: 'personnel-hr-manager', linkedUserId: 'persona-personnel-reviewer'}),
  personnel({id: 'personnel-purchase-requester', personnelCode: 'P-1401', firstName: 'پریسا', lastName: 'جوادی', primaryMobile: '09121114001', employmentStatus: 'active', unitId: 'unit-administration', positionId: 'position-specialist', managerPersonnelId: 'personnel-purchase-approver', linkedUserId: 'persona-purchase-requester'}),
  personnel({id: 'personnel-purchase-approver', personnelCode: 'P-1402', firstName: 'حمید', lastName: 'رستمی', primaryMobile: '09121114002', employmentStatus: 'active', unitId: 'unit-management', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-purchase-approver'}),
  personnel({id: 'personnel-treasury-executor', personnelCode: 'P-1403', firstName: 'بردیا', lastName: 'نوری', primaryMobile: '09121114003', employmentStatus: 'active', unitId: 'unit-finance', positionId: 'position-specialist', managerPersonnelId: 'personnel-niloofar', linkedUserId: 'persona-treasury-executor'}),
  personnel({id: 'personnel-advance-branch-manager', personnelCode: 'P-1501', firstName: 'کامران', lastName: 'یوسفی', primaryMobile: '09121115001', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-manager', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-advance-branch-manager'}),
  personnel({id: 'personnel-advance-accounting', personnelCode: 'P-1502', firstName: 'بهاره', lastName: 'اکبری', primaryMobile: '09121115002', employmentStatus: 'active', unitId: 'unit-accounting', positionId: 'position-specialist', managerPersonnelId: 'personnel-admin', linkedUserId: 'persona-advance-accounting'}),
  personnel({id: 'personnel-sales-advance-approver', personnelCode: 'P-1503', firstName: 'سودابه', lastName: 'مرادی', primaryMobile: '09121115003', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-sales-vice', managerPersonnelId: 'personnel-admin', salesHierarchyLevel: 'sales_vice', salesBranchUnitId: 'unit-branch-central', linkedUserId: 'persona-sales-advance-approver'}),
  personnel({id: 'personnel-laleh', personnelCode: 'P-3002', firstName: 'لاله', lastName: 'مرادی', primaryMobile: '09122223344', city: 'تهران', employmentStatus: 'active', unitId: 'unit-sales', positionId: 'position-seller', managerPersonnelId: 'personnel-callcenter-a', salesHierarchyLevel: 'seller', salesChannel: 'call_center', salesSupervisorPersonnelId: 'personnel-callcenter-a', salesBranchUnitId: 'unit-branch-central', salesStructureId: 'sales-structure-saadat-a', linkedUserId: 'persona-laleh'}),
  personnel({id: 'personnel-ended', personnelCode: 'P-5098', firstName: 'حمید', lastName: 'زارعی', primaryMobile: '09120001122', employmentStatus: 'ended', employmentType: 'پروژه‌ای', startDate: '2022-05-01', endDate: '2025-09-30', unitId: 'unit-support', positionId: 'position-specialist'}),
];

export const PERSONNEL_RECORDS: PersonnelRecord[] = completeRequiredQaPersonnelRecords(BASE_PERSONNEL_RECORDS);

export const SALES_STRUCTURES: SalesStructure[] = [
  {id: 'sales-structure-saadat-a', code: 'SS-SDA-01', branchUnitId: 'unit-branch-central', salesVicePersonnelId: 'personnel-sales-vice', salesManagerPersonnelId: 'personnel-arman', seniorSupervisorPersonnelId: 'personnel-sales-senior', callCenterSupervisorPersonnelId: 'personnel-callcenter-a', status: 'active', version: 1, createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'sales-structure-saadat-b', code: 'SS-SDA-02', branchUnitId: 'unit-branch-central', salesVicePersonnelId: 'personnel-sales-vice', salesManagerPersonnelId: 'personnel-arman', seniorSupervisorPersonnelId: 'personnel-sales-senior', callCenterSupervisorPersonnelId: 'personnel-callcenter-b', status: 'active', version: 1, createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'sales-structure-saadat-c', code: 'SS-SDA-03', branchUnitId: 'unit-branch-central', salesVicePersonnelId: 'personnel-sales-vice', salesManagerPersonnelId: 'personnel-arman', seniorSupervisorPersonnelId: 'personnel-sales-senior', callCenterSupervisorPersonnelId: 'personnel-callcenter-c', status: 'active', version: 1, createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'sales-structure-poonak-a', code: 'SS-PNK-01', branchUnitId: 'unit-branch-poonak', salesVicePersonnelId: 'personnel-sales-vice', salesManagerPersonnelId: 'personnel-arman', seniorSupervisorPersonnelId: 'personnel-sales-senior-poonak', callCenterSupervisorPersonnelId: 'personnel-callcenter-poonak', status: 'active', version: 1, createdAt: SEED_TIME, updatedAt: SEED_TIME},
];

const customerTimeline = (id: string, title: string) => [{id: `timeline-${id}`, type: 'identity' as const, title, actorName: 'بنیاد محلی شاهراه', occurredAt: SEED_TIME}];
export const CUSTOMER_RECORDS: CustomerRecord[] = [
  {id: 'customer-ava', type: 'legal', displayName: 'شرکت آوا پرداز', legalName: 'شرکت آوا پرداز ایرانیان', businessId: '14007894512', economicCode: '411111111111', status: 'active', phones: [{id: 'phone-ava-1', label: 'دفتر', number: '02188776655', primary: true}], email: 'info@avapardaz.example', addresses: [{id: 'address-ava-1', label: 'دفتر مرکزی', province: 'تهران', city: 'تهران', address: 'خیابان ولیعصر، پلاک ۱۲', postalCode: '1599912345', primary: true}], source: 'معرفی مشتری', provenance: 'ثبت دستی', ownerPersonnelId: 'personnel-arman', notes: 'مشتری حقوقی نمونه برای آزمون Customer 360.', relationships: [{id: 'rel-ava-1', title: 'نماینده اصلی', personName: 'ندا احمدی', description: 'مدیر خرید'}], timeline: customerTimeline('ava', 'پرونده مشتری ایجاد شد.'), createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'customer-kiana', type: 'individual', displayName: 'کیانا محمدی', firstName: 'کیانا', lastName: 'محمدی', nationalId: '0084573211', status: 'active', phones: [{id: 'phone-kiana-1', label: 'موبایل', number: '09121239876', primary: true}], email: 'kiana@example.test', addresses: [{id: 'address-kiana-1', label: 'منزل', province: 'البرز', city: 'کرج', address: 'جهانشهر، بلوار مولانا', primary: true}], source: 'نمایشگاه', provenance: 'ورود دستی', ownerPersonnelId: 'personnel-laleh', notes: '', relationships: [], timeline: customerTimeline('kiana', 'پرونده مشتری ایجاد شد.'), createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'customer-kiana-duplicate', type: 'individual', displayName: 'کیانا محمدی (ثبت دوم)', firstName: 'کیانا', lastName: 'محمدی', nationalId: '', status: 'prospect', phones: [{id: 'phone-kiana-2', label: 'همراه', number: '۰۹۱۲۱۲۳۹۸۷۶', primary: true}], addresses: [], source: 'فایل اکسل قدیمی', provenance: 'Import آزمایشی', notes: 'کاندید تکراری بر اساس موبایل نرمال‌شده.', relationships: [], timeline: customerTimeline('kiana-duplicate', 'رکورد از منبع قدیمی وارد شد.'), createdAt: SEED_TIME, updatedAt: SEED_TIME},
  {id: 'customer-saman', type: 'individual', displayName: 'سامان توکلی', firstName: 'سامان', lastName: 'توکلی', nationalId: '0061234567', status: 'inactive', phones: [{id: 'phone-saman-1', label: 'موبایل', number: '09351234567', primary: true}], addresses: [], source: 'وب‌سایت', provenance: 'فرم تماس', notes: 'رکورد غیرفعال نمونه.', relationships: [], timeline: customerTimeline('saman', 'پرونده مشتری ایجاد شد.'), createdAt: SEED_TIME, updatedAt: SEED_TIME},
];

/** @deprecated Compatibility export for authorization tests; the product models these records as users. */
export const QA_PERSONAS = LOCAL_USERS;

export function resolveUserAccess(userRecord: LocalUser, roles: SecurityRole[]): LocalUser {
  const assigned = roles.filter((role) => userRecord.roleIds.includes(role.id) && role.status === 'active');
  const primary = assigned.find((role) => role.id === userRecord.roleId) ?? assigned[0];
  const permissionGrants = [...new Set(userRecord.permissionGrants ?? [])];
  const permissionDenials = [...new Set(userRecord.permissionDenials ?? [])];
  const denied = new Set(permissionDenials);
  const roleEntitlements = assigned.flatMap((role) => role.permissions.map((permission) => ({
    permission, scope: role.scope, source: 'role' as const, sourceRoleId: role.id,
  }))).filter((entitlement) => !denied.has(entitlement.permission));
  // Persisted direct grants are retained only as migration evidence. They are
  // intentionally ineffective until every consumer is resource-aware.
  const grantEntitlements: PermissionEntitlement[] = [];
  const permissionEntitlements = userRecord.isAdmin
    ? ADMIN_OPERATIONAL_PERMISSIONS.map((permission) => ({permission, scope: 'COMPANY' as const, source: 'admin' as const}))
    : [...roleEntitlements, ...grantEntitlements];
  const permissions = userRecord.isAdmin
    ? ADMIN_OPERATIONAL_PERMISSIONS
    : [...new Set(permissionEntitlements.map((entitlement) => entitlement.permission))];
  return {...userRecord, permissionGrants, permissionDenials, permissionEntitlements, roleId: primary?.id ?? userRecord.roleId, roleTitle: userRecord.isAdmin ? 'ادمین' : primary?.name ?? 'بدون نقش فعال', roles: assigned.map((role) => role.name), description: userRecord.isAdmin ? 'مدیریت کامل محصول محلی، سازمان و دسترسی‌ها' : primary?.description ?? 'نقش فعالی به این کاربر اختصاص داده نشده است.', scope: userRecord.isAdmin ? 'COMPANY' : primary?.scope ?? userRecord.scope, permissions};
}

export function applyRole(userRecord: LocalUser, roleId: string): LocalUser {
  return resolveUserAccess({...userRecord, roleId, roleIds: [roleId]}, SECURITY_ROLES);
}

export const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  {code: 'organization.overview.view', label: 'مشاهده نمای سازمان', description: 'مشاهده ساختار و شاخص‌های سازمان', domain: 'organization', available: true},
  {code: 'organization.units.view', label: 'مشاهده واحدها', description: 'مشاهده سلسله‌مراتب واحدهای سازمانی', domain: 'organization', available: true},
  {code: 'organization.units.manage', label: 'مدیریت واحدها', description: 'ایجاد، ویرایش و تغییر وضعیت واحدها', domain: 'organization', available: true},
  {code: 'organization.positions.view', label: 'مشاهده سمت‌ها', description: 'مشاهده سمت‌های سازمانی', domain: 'organization', available: true},
  {code: 'organization.positions.manage', label: 'مدیریت سمت‌ها', description: 'ایجاد، ویرایش و تغییر وضعیت سمت‌ها', domain: 'organization', available: true},
  {code: 'foundation.users.view', label: 'مشاهده کاربران', description: 'مشاهده پرونده کاربران سازمان', domain: 'organization', available: true},
  {code: 'organization.users.create', label: 'ایجاد کاربر', description: 'ساخت حساب کاربری محلی', domain: 'organization', available: true},
  {code: 'foundation.users.edit', label: 'ویرایش کاربران', description: 'ویرایش اطلاعات و انتساب سازمانی', domain: 'organization', available: true},
  {code: 'foundation.users.status.manage', label: 'مدیریت وضعیت کاربر', description: 'فعال یا غیرفعال‌کردن حساب', domain: 'organization', available: true},
  {code: 'organization.users.password.manage', label: 'تنظیم رمز عبور', description: 'تنظیم امن رمز محلی کاربر', domain: 'organization', available: true},
  {code: 'organization.roles.view', label: 'مشاهده نقش‌ها', description: 'مشاهده نقش و دسترسی مؤثر', domain: 'management', available: true},
  {code: 'organization.roles.manage', label: 'مدیریت نقش‌ها', description: 'ایجاد، ویرایش، کپی و تنظیم مجوزها', domain: 'management', available: true},
  {code: 'organization.roles.assign', label: 'انتساب نقش', description: 'افزودن یا حذف نقش کاربر', domain: 'management', available: true},
  {code: 'organization.personnel.view', label: 'مشاهده پرسنل', description: 'مشاهده پرونده و جایگاه پرسنل', domain: 'organization', available: true},
  {code: 'organization.personnel.manage', label: 'مدیریت پرسنل', description: 'ایجاد و ویرایش اطلاعات پرسنلی', domain: 'organization', available: true},
  {code: 'organization.personnel.changes.review', label: 'بررسی صف تغییرات پرسنل', description: 'مشاهده، تأیید یا رد درخواست‌های تغییر اطلاعات پرسنلی با ثبت ممیزی', domain: 'organization', available: true},
  {code: 'organization.personnel.banking.view', label: 'مشاهده اطلاعات بانکی', description: 'نمایش کنترل‌شده اطلاعات بانکی پرسنل', domain: 'organization', available: true},
  {code: 'organization.personnel.banking.manage', label: 'ویرایش اطلاعات بانکی', description: 'ثبت و ویرایش اطلاعات بانکی پرسنل', domain: 'organization', available: true},
  {code: 'organization.personnel.account.manage', label: 'مدیریت حساب پرسنل', description: 'ایجاد یا کنترل حساب کاربری مرتبط', domain: 'organization', available: true},
  {code: 'organization.personnel.documents.queue.view', label: 'مشاهده نواقص مدارک پرسنلی', description: 'مشاهده صف محاسباتی اطلاعات و مدارک اجباری ناقص در محدوده مجاز', domain: 'organization', available: true},
  {code: 'organization.personnel.documents.content.read', label: 'مشاهده محتوای مدارک پرسنلی', description: 'دریافت کنترل‌شده فایل مدارک هویتی در محدوده مجاز', domain: 'organization', available: true},
  {code: 'organization.personnel.documents.manage', label: 'مدیریت مدارک پرسنلی', description: 'بارگذاری و جایگزینی نسخه‌دار مدارک برای پرسنل مجاز', domain: 'organization', available: true},
  {code: 'foundation.audit.view', label: 'مشاهده ممیزی', description: 'مشاهده تاریخچه اقدام‌ها', domain: 'management', available: true},
  {code: 'foundation.data.export', label: 'خروجی پشتیبان', description: 'دریافت Snapshot محلی', domain: 'management', available: true},
  {code: 'crm.customers.view', label: 'مشاهده مشتریان', description: 'مشاهده فهرست و Customer 360', domain: 'crm', available: true},
  {code: 'crm.customers.create', label: 'ایجاد مشتری', description: 'ساخت پرونده مشتری حقیقی یا حقوقی', domain: 'crm', available: true},
  {code: 'crm.customers.edit', label: 'ویرایش مشتری', description: 'ویرایش هویت، تماس و نشانی', domain: 'crm', available: true},
  {code: 'crm.customers.status.manage', label: 'مدیریت وضعیت مشتری', description: 'فعال، غیرفعال یا بالقوه', domain: 'crm', available: true},
  {code: 'crm.customers.merge', label: 'بررسی و ادغام تکراری', description: 'Merge کنترل‌شده با حفظ سابقه', domain: 'crm', available: true},
  {code: 'crm.customers.import', label: 'ورود گروهی مشتری', description: 'پیش‌نمایش و Import فایل CSV کوچک', domain: 'crm', available: true},
  {code: 'organization.registrations.view', label: 'مشاهده ثبت‌نام‌ها', description: 'مشاهده صف درخواست‌های ثبت‌نام', domain: 'organization', available: true},
  {code: 'organization.registrations.review', label: 'بررسی ثبت‌نام‌ها', description: 'بررسی هویت و پیشنهاد نقش ورودی توسط منابع انسانی', domain: 'organization', available: true},
  {code: 'organization.registrations.activate', label: 'فعال‌سازی حساب ثبت‌نام', description: 'فعال‌سازی نهایی حساب پس از پیشنهاد منابع انسانی', domain: 'organization', available: true},
  {code: 'foundation.workflow.manage', label: 'مدیریت گردش‌کار', description: 'نسخه‌گذاری صف، تخصیص و سیاست تأیید', domain: 'management', available: true},
  {code: 'foundation.reports.view', label: 'مشاهده گزارش‌های مدیریتی', description: 'KPI و سلامت صف‌های عملیاتی', domain: 'management', available: true},
  {code: 'foundation.qa.manage', label: 'مدیریت داده آزمون حجیم', description: 'ساخت و بازنشانی LARGE_QA', domain: 'management', available: true},
  ...ERP_MODULES.flatMap((module) => (['view','create','edit','transition','approve','manage'] as const).map((action) => ({code: permissionFor(module.id, action), label: `${permissionActionLabel(action)} ${module.singular}`, description: `${permissionActionLabel(action)} در زیربخش ${module.title} با اجرای Scope و Resource Policy`, domain: module.domain, available: true}))),
];

function permissionActionLabel(action: 'view'|'create'|'edit'|'transition'|'approve'|'manage') {return ({view:'مشاهده',create:'ایجاد',edit:'ویرایش',transition:'اجرای گردش‌کار',approve:'تأیید',manage:'مدیریت'} as const)[action];}

export const POLICY_DEFINITIONS: PolicyDefinition[] = [
  {id: 'policy-scope', title: 'محدوده دسترسی', description: 'شرکت، واحد، تیم، خود یا رکورد صریح', kind: 'scope', version: 1, enabled: true},
  {id: 'policy-maker-checker', title: 'تفکیک سازنده و تأییدکننده', description: 'سازنده نمی‌تواند همان رکورد حساس را تأیید کند', kind: 'resource', version: 1, enabled: true},
  {id: 'policy-company-boundary', title: 'مرز شرکت', description: 'دسترسی خارج از شرکت جاری همیشه رد می‌شود', kind: 'resource', version: 1, enabled: true},
  {id: 'policy-workflow-transition', title: 'گارد گردش‌کار', description: 'فقط انتقال‌های تعریف‌شده از وضعیت جاری مجازند', kind: 'workflow', version: 1, enabled: true},
];

export const INITIAL_SESSION: FoundationSession = {id: 'active-session', activeUserId: 'persona-product-owner', switchedAt: SEED_TIME, version: 3};
export const SEED_META: MetaRecord[] = [{id: 'schemaVersion', value: FOUNDATION_SCHEMA_VERSION}, {id: 'seedVersion', value: FOUNDATION_SEED_VERSION}, {id: 'seededAt', value: SEED_TIME}];
export const SEED_AUDITS: AuditEvent[] = [{id: 'audit-seed-ready', sequence: 1, companyId: COMPANY_ID, category: 'system', action: 'foundation.seed.completed', actorId: 'system', actorName: 'بنیاد محلی شاهراه', effectiveUserId: 'persona-product-owner', occurredAt: SEED_TIME, summary: 'بنیاد ERP محلی V1، گردش‌کارها و داده نمایشی آماده شد.', outcome: 'success', correlationId: 'correlation-seed-erp-v1', metadata: {schemaVersion: FOUNDATION_SCHEMA_VERSION, userCount: LOCAL_USERS.length, personnelCount: PERSONNEL_RECORDS.length, customerCount: CUSTOMER_RECORDS.length, workflowCount: ERP_WORKFLOWS.length}}];
export const SEED_DOMAIN_EVENTS: DomainEvent[] = [{id: 'event-foundation-ready', aggregateType: 'local-foundation', aggregateId: 'erp-v1', eventType: 'LocalErpFoundationSeeded', actorId: 'system', occurredAt: SEED_TIME, correlationId: 'correlation-seed-erp-v1', payload: {schemaVersion: FOUNDATION_SCHEMA_VERSION, seedVersion: FOUNDATION_SEED_VERSION}}];

const recruitmentStatePaths: Record<string, string[]> = {
  submitted: ['submitted'],
  candidate_review: ['submitted','hr_review','ready_to_publish','published','candidate_review'],
  interview_scheduled: ['submitted','hr_review','ready_to_publish','published','candidate_review','interview_scheduled'],
  ready_to_start: ['submitted','hr_review','ready_to_publish','published','candidate_review','interview_scheduled','evaluated','offer_sent','offer_accepted','ready_to_start'],
  training: ['submitted','hr_review','ready_to_publish','published','candidate_review','interview_scheduled','evaluated','offer_sent','offer_accepted','ready_to_start','training'],
};

const recruitmentStateActor = (state: string) => {
  if (state === 'submitted') return {actorId:'actor-seller', actorName:'آرمان فرهمند', effectiveUserId:'persona-seller'};
  if (['hr_review','ready_to_publish','published','candidate_review','interview_scheduled'].includes(state)) return {actorId:'actor-hr-operator', actorName:'مریم توکلی', effectiveUserId:'persona-hr-operator'};
  if (['evaluated','offer_sent','offer_accepted','ready_to_start'].includes(state)) return {actorId:'actor-hr-manager', actorName:'نازنین اکبری', effectiveUserId:'persona-hr-manager'};
  return {actorId:'actor-callcenter-a', actorName:'ناهید احمدی', effectiveUserId:'persona-callcenter-a'};
};

const recruitmentStateTitle: Record<string, string> = {
  submitted:'اعلام نیاز ثبت‌شده', hr_review:'بررسی منابع انسانی', ready_to_publish:'آماده انتشار آگهی', published:'انتشار و جذب متقاضی',
  candidate_review:'بررسی پرونده متقاضی', interview_scheduled:'دعوت و مصاحبه', evaluated:'ارزیابی مصاحبه', offer_sent:'ارسال پیشنهاد همکاری',
  offer_accepted:'پذیرش و امضای پیشنهاد', ready_to_start:'آماده شروع به کار', training:'همکاری آموزشی', contracted:'همکاری قراردادی',
};

function seedRecruitmentHistory(records: OperationalRecord[]): OperationalRecordHistory[] {
  return records.flatMap((record, recordIndex) => {
    const states = recruitmentStatePaths[record.status] ?? ['submitted'];
    return states.map((state, stateIndex) => {
      const actor = recruitmentStateActor(state);
      const occurredAt = new Date(Date.UTC(2026, 7, 10 + recordIndex, 7 + stateIndex, 15)).toISOString();
      const previous = stateIndex ? states[stateIndex - 1] : undefined;
      return {
        id: `history-${record.id}-${stateIndex + 1}`,
        recordId: record.id,
        moduleId: record.moduleId,
        sequence: stateIndex + 1,
        eventType: stateIndex ? 'transitioned' : 'created',
        fromState: previous,
        toState: state,
        ...actor,
        reason: stateIndex ? `تحویل پرونده به مرحله «${recruitmentStateTitle[state] ?? state}»` : 'ثبت اولیه پرونده جذب و اعلام نیاز نیرو',
        snapshot: {status: state, assigneeUserId: record.assigneeUserId, currentWaitingFor: record.payload.currentWaitingFor, workflowVersion: record.workflowVersion},
        occurredAt,
      } satisfies OperationalRecordHistory;
    });
  });
}

export function createSeedData() {
  const emptyStores = Object.fromEntries(FOUNDATION_STORES.map((store) => [store, []])) as Record<FoundationStoreName, unknown[]>;
  const operationalStores = seedOperationalRecords();
  const recruitmentHistory = seedRecruitmentHistory((operationalStores.recruitment_cases ?? []) as OperationalRecord[]);
  return {
    ...emptyStores,
    meta: SEED_META.map((item) => ({...item})), users: LOCAL_USERS.map((item) => ({...item, roleIds: [...item.roleIds], roles: [...item.roles], permissions: [...item.permissions], permissionGrants: [...(item.permissionGrants ?? [])], permissionDenials: [...(item.permissionDenials ?? [])]})),
    organizational_units: ORGANIZATIONAL_UNITS.map((item) => ({...item})), organizational_positions: ORGANIZATIONAL_POSITIONS.map((item) => ({...item, unitIds: [...item.unitIds]})),
    security_roles: SECURITY_ROLES.map((item) => ({...item, permissions: [...item.permissions]})), personnel: PERSONNEL_RECORDS.map((item) => ({...item})), sales_structures: SALES_STRUCTURES.map((item) => ({...item})), customers: CUSTOMER_RECORDS.map((item) => ({...item, phones: item.phones.map((phone) => ({...phone})), addresses: item.addresses.map((address) => ({...address})), relationships: item.relationships.map((relationship) => ({...relationship})), timeline: item.timeline.map((timeline) => ({...timeline}))})), customer_imports: [], qa_personas: [], sessions: [{...INITIAL_SESSION}],
    policy_definitions: POLICY_DEFINITIONS.map((item) => ({...item})), audit_events: SEED_AUDITS.map((item) => ({...item, metadata: {...item.metadata}})),
    domain_events: SEED_DOMAIN_EVENTS.map((item) => ({...item, payload: {...item.payload}})), foundation_records: [],
    workflow_definitions: ERP_WORKFLOWS.map((item) => ({...item, approvalStages: defaultApprovalStages(item, SECURITY_ROLES), transitions: item.transitions.map((transition) => ({...transition})), stateLabels: {...item.stateLabels}})),
    workflow_versions: ERP_WORKFLOWS.map((item) => ({...item, id: `${item.id}-v${item.version}`, workflowId: item.id, approvalStages: defaultApprovalStages(item, SECURITY_ROLES), transitions: item.transitions.map((transition) => ({...transition})), stateLabels: {...item.stateLabels}})),
    registration_requests: [], registration_reviews: [], workflow_history: recruitmentHistory, role_versions: [],
    qa_dataset_manifests: [{id: 'large-qa', status: 'empty', roleCount: 0, userCount: 0, seed: 'tapra2-large-qa-v1'}],
    projections: [{id: 'projection-module-counts', kind: 'module-counts', rebuiltAt: SEED_TIME, version: 1, data: {moduleCount: ERP_WORKFLOWS.length, recordCount: Object.values(operationalStores).reduce((sum, records) => sum + records.length, 0)}}],
    ...operationalStores,
  };
}
