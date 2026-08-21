import {
  LayoutDashboard, PlusCircle, Inbox, Archive, FileText, Search,
  GitFork, MessageSquare, ShieldCheck, Building, MapPin, KeyRound, Users, CheckSquare,
  UsersRound, BookUser, Tags, LifeBuoy, Mail, ShieldAlert, Palette,
  Contact, GitMerge, GitBranch, Receipt, Database, Megaphone, Users2, PhoneCall,
  Package, Wrench, Tag, FileSpreadsheet, Upload, BadgeCheck, Truck, UserCog, Headset, Warehouse, type LucideIcon
} from 'lucide-react';
import { User, SystemPermission } from '../types';
import { canAccessNavItem } from '../utils/permissions';

// ============================================================
// Navigation Registry (مأموریت بازطراحی UI Foundation) — تنها منبع id/label/icon/گروه/ترتیب/
// Permission/badge برای هر صفحهٔ موجود. Sidebar.tsx، TabBar.tsx و Guard مربوط به بازکردن تب در
// App.tsx همگی از همین فایل می‌خوانند؛ هیچ‌کدام دیگر مستقل label/icon/permission تعریف نمی‌کنند.
//
// هیچ id/Route جدیدی اینجا ساخته نشده — این فقط بازآرایی و تجمیع ۳۴ آیتم موجود Sidebar.tsx/
// TabBar.tsx/App.tsx's tabAccessMap است؛ معنای Permission (فهرست OR-based `requires`) دقیقاً
// همان مقادیر قبلی است. مخفی‌شدن این‌جا جایگزین Authorization داخلی Handlerها نیست — همان
// canAccessNavItem قبلی که دیگر منطقی جز حذف/اضافه دسترسی ندارد، هنوز مرجع نهایی است.
// ============================================================

export type NavGroupId =
  | 'home' | 'inbox' | 'sales_crm' | 'data_marketing' | 'catalog'
  | 'order_ops' | 'finance_treasury' | 'communications' | 'org_admin' | 'settings';

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  home: 'خانه',
  inbox: 'کارتابل من',
  sales_crm: 'فروش و CRM',
  data_marketing: 'داده و بازاریابی',
  catalog: 'کاتالوگ و پیشنهادها',
  order_ops: 'مالی و انبار',
  finance_treasury: 'مالی و خزانه‌داری',
  communications: 'ارتباطات',
  org_admin: 'سازمان و مدیریت',
  settings: 'تنظیمات'
};

// ترتیب نمایش گروه‌ها در Sidebar.
export const NAV_GROUP_ORDER: NavGroupId[] = [
  'home', 'inbox', 'sales_crm', 'data_marketing', 'catalog',
  'order_ops', 'finance_treasury', 'communications', 'org_admin', 'settings'
];

export type NavBadgeKey = 'pendingApproval' | 'myRequests' | 'unreadLetters' | 'unreadDMs';

// زمینهٔ لازم برای تصمیم‌گیری «آیا این آیتم برای همین کاربر قابل مشاهده است» — دقیقاً همان
// ورودی‌هایی که canAccessNavItem/چک‌های دستی preexisting به آن‌ها نیاز داشتند.
export interface NavVisibilityContext {
  currentUser: User | null;
  effectivePermissions: SystemPermission[] | null;
  isAdmin: boolean;
  foundationPermissions?: string[];
  activeCompanyId?: string | null;
}

export type NavBacking = 'CURRENT' | 'HYBRID' | 'PROTOTYPE' | 'LEGACY';

export interface NavItemDefinition {
  id: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  group: NavGroupId;
  order: number;
  // فهرست OR-based Permission — دقیقاً همان معنای قبلی canAccessNavItem؛ تغییر معنایی نداده‌ایم.
  requires?: SystemPermission[];
  // فقط برای سه آیتم preexisting که به‌جای effectivePermissions مستقیماً customPermissions/
  // isAdmin را چک می‌کردند (admin, roles_permissions, all_communications) — رفتار قبلی
  // بدون تغییر حفظ شده، نه «تصحیح» شده به مسیر استاندارد effectivePermissions.
  isVisible?: (ctx: NavVisibilityContext) => boolean;
  badgeKey?: NavBadgeKey;
  // فقط 'new_request': این id هرگز یک تب واقعی نبوده — همیشه Modal ثبت درخواست را باز می‌کرده.
  isModalAction?: boolean;
  description?: string;
  backing?: NavBacking;
  operationalNav?: boolean;
  serverPermissions?: string[];
  serverPermissionGroups?: string[][];
  requiresCompanyContext?: boolean;
}

export function isNavItemVisible(item: NavItemDefinition, ctx: NavVisibilityContext): boolean {
  if (!item.operationalNav || !['CURRENT', 'HYBRID'].includes(item.backing ?? 'LEGACY')) return false;
  if (item.requiresCompanyContext && !ctx.activeCompanyId) return false;
  if (item.serverPermissions?.length) {
    const granted = ctx.foundationPermissions ?? [];
    if (!item.serverPermissions.some((permission) => granted.includes(permission))) return false;
  }
  if (item.serverPermissionGroups?.length) {
    const granted = ctx.foundationPermissions ?? [];
    if (!item.serverPermissionGroups.every((group) => group.some((permission) => granted.includes(permission)))) return false;
  }
  return item.backing === 'HYBRID' || !!item.serverPermissions?.length || !!item.serverPermissionGroups?.length;
}

const adminOrCustom = (permKey: 'manage_users' | 'manage_roles') => (ctx: NavVisibilityContext) =>
  ctx.isAdmin || !!ctx.currentUser?.customPermissions?.includes(permKey);

export const NAV_ITEMS: NavItemDefinition[] = [
  // ۱. خانه
  { id: 'dashboard', label: 'داشبورد عملیاتی', shortLabel: 'داشبورد', icon: LayoutDashboard, group: 'home', order: 10, backing: 'HYBRID', operationalNav: true },

  // ۲. کارتابل من
  { id: 'my_requests', label: 'درخواست‌های مالی', shortLabel: 'درخواست‌های من', icon: FileText, group: 'inbox', order: 10, requires: ['create_request'], badgeKey: 'myRequests', backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.finance.read'], requiresCompanyContext: true },
  { id: 'assigned_tasks', label: 'کارها و وظایف', shortLabel: 'کارهای محوله', icon: CheckSquare, group: 'inbox', order: 20, requires: ['manage_assigned_tasks'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.task.read'], requiresCompanyContext: true },
  { id: 'approval_inbox', label: 'کارتابل تأیید مالی', shortLabel: 'تأیید مالی', icon: Inbox, group: 'inbox', order: 30, requires: ['approve_branch_request', 'approve_treasury', 'execute_payment'], badgeKey: 'pendingApproval', backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.finance.approve'], requiresCompanyContext: true },

  // ۳. فروش و CRM
  { id: 'my_sales_queue', label: 'صف فروش من', shortLabel: 'صف فروش', icon: PhoneCall, group: 'sales_crm', order: 10, requires: ['view_sales_queue'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['sales.queue.read'], requiresCompanyContext: true },
  { id: 'customers', label: 'مشتریان', shortLabel: 'مشتریان', icon: Contact, group: 'sales_crm', order: 20, requires: ['sales_access', 'view_customer_profile'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['customer.read'], requiresCompanyContext: true },
  { id: 'sales_organization', label: 'سازمان فروش و سلسله‌مراتب', shortLabel: 'سازمان فروش', icon: GitBranch, group: 'sales_crm', order: 25, requires: ['sales_access', 'manage_sales_hierarchy', 'manage_sales_users'] },
  { id: 'lead_assignment', label: 'مدیریت سرنخ‌های فروش', shortLabel: 'سرنخ‌های فروش', icon: Users2, group: 'sales_crm', order: 30, requires: ['assign_sales_lead', 'reassign_sales_lead', 'drain_salesperson_queue', 'configure_lead_assignment'], backing: 'CURRENT', operationalNav: true, serverPermissionGroups: [['sales.lead.read_all'], ['sales.lead.create', 'sales.lead.assign', 'sales.lead.reassign', 'sales.marketing.link']], requiresCompanyContext: true },
  { id: 'sales_invoices', label: 'فروش و فاکتور', shortLabel: 'فاکتور فروش', icon: FileSpreadsheet, group: 'sales_crm', order: 40, requires: ['create_sales_invoice', 'view_own_invoices', 'view_team_invoices'], backing: 'CURRENT', operationalNav: true, serverPermissionGroups: [['sales.invoice.read_own', 'sales.invoice.read_all']], requiresCompanyContext: true },
  { id: 'batch_invoice_import', label: 'ثبت گروهی فاکتور', shortLabel: 'ثبت گروهی', icon: Upload, group: 'sales_crm', order: 50, requires: ['bulk_import_invoices'] },
  { id: 'sales_personnel_lifecycle', label: 'چرخهٔ عمر نیروی فروش', shortLabel: 'چرخهٔ عمر نیرو', icon: UserCog, group: 'sales_crm', order: 60, requires: ['sales_access', 'request_salesperson_transfer', 'review_salesperson_transfer', 'manage_sales_users', 'view_archived_sales_workspace'] },

  // ۴. داده و بازاریابی
  // Customer Import/merge are now naturally hosted by the SaaS Customer workspace.
  // The legacy screens remain recoverable in source until their UI is rewired, but exposing
  // them here would create a second localStorage-backed Customer product.
  { id: 'raw_contact_repository', label: 'مخزن داده خام و Import', shortLabel: 'داده خام', icon: Database, group: 'data_marketing', order: 10, isVisible: () => false },
  { id: 'campaigns', label: 'کمپین‌ها', shortLabel: 'کمپین‌ها', icon: Megaphone, group: 'data_marketing', order: 20, requires: ['advertising_access', 'manage_advertising_campaigns', 'view_campaign_reports'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.marketing.read'], requiresCompanyContext: true },
  { id: 'customer_merge_candidates', label: 'درخواست ادغام مشتری', shortLabel: 'ادغام مشتری', icon: GitMerge, group: 'data_marketing', order: 30, isVisible: () => false },
  { id: 'customer_merge_queue', label: 'کارتابل ادغام و تعارض مشتری', shortLabel: 'کارتابل ادغام', icon: GitMerge, group: 'data_marketing', order: 40, isVisible: () => false },
  { id: 'purchase_claim_review', label: 'ادعای خرید مشتری', shortLabel: 'ادعای خرید', icon: Receipt, group: 'data_marketing', order: 50, isVisible: () => false },

  // ۵. کاتالوگ و پیشنهادها
  { id: 'products', label: 'کالاها', shortLabel: 'کالاها', icon: Package, group: 'catalog', order: 10, requires: ['manage_products'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.catalog.read'], requiresCompanyContext: true },
  { id: 'services', label: 'خدمات', shortLabel: 'خدمات', icon: Wrench, group: 'catalog', order: 20, requires: ['manage_services'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.catalog.read'], requiresCompanyContext: true },
  { id: 'promotions', label: 'پیشنهادها و تخفیف‌ها', shortLabel: 'پیشنهادها', icon: Tag, group: 'catalog', order: 30, requires: ['manage_promotions'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.catalog.read'], requiresCompanyContext: true },

  // ۶. عملیات سفارش و خدمت
  { id: 'coordination_inbox', label: 'کارتابل هماهنگی سفارش', shortLabel: 'هماهنگی', icon: Headset, group: 'order_ops', order: 5, requires: ['view_coordination_queue'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.fulfillment.read'], requiresCompanyContext: true },
  { id: 'sales_financial_confirmation', label: 'بررسی مالی پرداخت‌ها', shortLabel: 'بررسی مالی', icon: BadgeCheck, group: 'order_ops', order: 10, requires: ['view_sales_financial_queue', 'review_invoice_financial_confirmation'], backing: 'CURRENT', operationalNav: true, serverPermissionGroups: [['sales.payment.review'], ['sales.invoice.read_own', 'sales.invoice.read_all']], requiresCompanyContext: true },
  { id: 'warehouse_foundation', label: 'عملیات انبار', shortLabel: 'انبار', icon: Warehouse, group: 'order_ops', order: 15, backing: 'CURRENT', operationalNav: true, serverPermissions: ['warehouse.read'] },
  { id: 'fulfillment_cases', label: 'اجرای کالا و خدمت', shortLabel: 'اجرای کالا/خدمت', icon: Truck, group: 'order_ops', order: 20, requires: ['dispatch_product_case', 'deliver_product_case', 'manage_service_fulfillment_assignment', 'execute_service_fulfillment_case'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.fulfillment.read'], requiresCompanyContext: true },
  { id: 'support', label: 'خدمات پس از فروش و شکایات', shortLabel: 'پس از فروش', icon: LifeBuoy, group: 'order_ops', order: 30, requires: ['manage_support_cases', 'financial_approve_support', 'view_support_reports'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.support.read'], requiresCompanyContext: true },

  // ۷. مالی و خزانه‌داری
  { id: 'new_request', label: 'ثبت درخواست جدید', shortLabel: 'درخواست جدید', icon: PlusCircle, group: 'finance_treasury', order: 10, requires: ['create_request'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.finance.write'], requiresCompanyContext: true },
  { id: 'vendors', label: 'ذی‌نفعان و فروشندگان', shortLabel: 'دفتر تأمین‌کنندگان', icon: BookUser, group: 'finance_treasury', order: 20, requires: ['manage_vendors'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.vendor.read'], requiresCompanyContext: true },
  { id: 'vendor_categories', label: 'دسته‌بندی تأمین‌کنندگان', shortLabel: 'دسته‌بندی‌ها', icon: Tags, group: 'finance_treasury', order: 30, requires: ['manage_vendors'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.vendor.read'], requiresCompanyContext: true },
  { id: 'cost_centers', label: 'مراکز هزینه', shortLabel: 'مراکز هزینه', icon: MapPin, group: 'finance_treasury', order: 40, requires: ['manage_cost_centers'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.finance.read'], requiresCompanyContext: true },
  { id: 'archive', label: 'بایگانی و جستجوی مالی', shortLabel: 'بایگانی', icon: Search, group: 'finance_treasury', order: 50, requires: ['view_branch_requests', 'view_all_requests', 'export_archive', 'manage_support_cases', 'financial_approve_support'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.finance.read', 'operations.audit.read'], requiresCompanyContext: true },

  // ۸. ارتباطات
  { id: 'messenger', label: 'پیام‌های عمومی', shortLabel: 'پیام‌ها', icon: MessageSquare, group: 'communications', order: 10, backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.communication.read'], requiresCompanyContext: true },
  { id: 'colleagues', label: 'ارتباط با همکاران', shortLabel: 'همکاران', icon: UsersRound, group: 'communications', order: 20, badgeKey: 'unreadDMs', backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.communication.read'], requiresCompanyContext: true },
  { id: 'letters', label: 'نامه‌ها', shortLabel: 'نامه‌ها', icon: Mail, group: 'communications', order: 30, requires: ['manage_letters'], badgeKey: 'unreadLetters', backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.communication.read'], requiresCompanyContext: true },
  { id: 'all_communications', label: 'همه مکاتبات', shortLabel: 'همه مکاتبات', icon: ShieldAlert, group: 'communications', order: 40, isVisible: adminOrCustom('manage_users'), backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.communication.read'], requiresCompanyContext: true },

  // ۹. سازمان و مدیریت
  { id: 'companies', label: 'سازمان و مدیریت', shortLabel: 'سازمان', icon: Building, group: 'org_admin', order: 10, requires: ['manage_companies'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['organization.read'] },
  { id: 'admin', label: 'مدیریت کاربران سیستمی', shortLabel: 'کاربران', icon: Users, group: 'org_admin', order: 20, isVisible: adminOrCustom('manage_users') },
  { id: 'roles_permissions', label: 'نقش‌ها و دسترسی‌ها (RBAC)', shortLabel: 'نقش‌ها', icon: KeyRound, group: 'org_admin', order: 30, isVisible: adminOrCustom('manage_roles') },
  { id: 'workflow', label: 'گردش‌کارهای سازمانی', shortLabel: 'گردش‌کار', icon: GitFork, group: 'org_admin', order: 40, requires: ['view_analytics'], backing: 'CURRENT', operationalNav: true, serverPermissions: ['operations.workflow.read'], requiresCompanyContext: true },

  // ۱۰. تنظیمات
  { id: 'style_settings', label: 'ظاهر و دسترس‌پذیری', shortLabel: 'ظاهر', icon: Palette, group: 'settings', order: 10, backing: 'HYBRID', operationalNav: true }
];

export const NAV_ITEM_BY_ID: Record<string, NavItemDefinition> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item])
);

export function getVisibleNavItems(ctx: NavVisibilityContext): NavItemDefinition[] {
  return NAV_ITEMS.filter((item) => isNavItemVisible(item, ctx));
}

export function getVisibleGroupedNavItems(ctx: NavVisibilityContext): { group: NavGroupId; items: NavItemDefinition[] }[] {
  const visible = getVisibleNavItems(ctx);
  return NAV_GROUP_ORDER
    .map((group) => ({ group, items: visible.filter((i) => i.group === group).sort((a, b) => a.order - b.order) }))
    .filter((g) => g.items.length > 0);
}

// ============================================================
// Primary Action Registry (بند ۶ مأموریت) — اقدام اصلی سایدبار دیگر همیشه «ایجاد درخواست
// پرداخت» نیست؛ اولین موردی که کاربر Permission واقعی برایش دارد انتخاب می‌شود. فقط Actionهایی
// که هم‌اکنون Route/Permission واقعی دارند اینجا هستند — هیچ Action آینده ساخته نشده.
// ============================================================
export interface PrimaryActionDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  navId: string; // به همان NavItemDefinition.id ارجاع می‌دهد (تب یا Modal Action)
  requires: SystemPermission[];
  serverPermissions?: string[];
}

export const PRIMARY_ACTIONS: PrimaryActionDefinition[] = [
  { id: 'create_sales_invoice', label: 'ثبت فروش و فاکتور', icon: FileSpreadsheet, navId: 'sales_invoices', requires: ['create_sales_invoice'], serverPermissions: ['sales.sale.create'] },
  { id: 'approval_inbox', label: 'کارتابل تأیید مالی', icon: Inbox, navId: 'approval_inbox', requires: ['approve_branch_request', 'approve_treasury', 'execute_payment'], serverPermissions: ['operations.finance.approve'] },
  { id: 'create_request', label: 'ایجاد درخواست مالی', icon: PlusCircle, navId: 'new_request', requires: ['create_request'], serverPermissions: ['operations.finance.write'] }
];

// اولین Action که کاربر واقعاً Permission آن را دارد (ترتیب آرایه = اولویت). کاربر چندنقشی/Admin
// معمولاً چند Action واجد شرایط دارد؛ فراخوانی‌کننده (Sidebar) از eligibleActions برای منوی
// «ایجاد / اقدام سریع» استفاده می‌کند، از primaryAction برای دکمهٔ تکی حالت تک‌نقشی.
export function getEligiblePrimaryActions(ctx: NavVisibilityContext): PrimaryActionDefinition[] {
  return PRIMARY_ACTIONS.filter((action) => {
    const navItem = NAV_ITEM_BY_ID[action.navId];
    if (!navItem || !isNavItemVisible(navItem, ctx)) return false;
    if (!action.serverPermissions?.length) return false;
    return action.serverPermissions.some((permission) => ctx.foundationPermissions?.includes(permission));
  });
}
