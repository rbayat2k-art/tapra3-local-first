import type { OrganizationScopeType } from '../api/contracts';

export const organizationScopeLabels: Record<OrganizationScopeType, string> = {
  WORKSPACE: 'کل مجموعه',
  COMPANY: 'شرکت',
  BRANCH: 'شعبه',
  DEPARTMENT: 'واحد سازمانی',
  TEAM: 'تیم',
  SELF: 'دسترسی شخصی',
};

export const serviceKindLabels: Record<'HR' | 'DATA' | 'MIS' | 'OTHER', string> = {
  HR: 'منابع انسانی',
  DATA: 'مدیریت داده',
  MIS: 'گزارش‌های مدیریتی',
  OTHER: 'سایر خدمات مشترک',
};

const permissionLabels: Record<string, string> = {
  'organization.read': 'مشاهده ساختار سازمان و دسترسی‌ها',
  'organization.company.manage': 'مدیریت شرکت‌ها',
  'organization.unit.manage': 'مدیریت شعب، واحدها، تیم‌ها و خدمات مشترک',
  'organization.user.manage': 'مدیریت حساب‌های کاربری',
  'organization.membership.manage': 'مدیریت عضویت‌های سازمانی',
  'organization.role.manage': 'مدیریت نقش‌ها و دسترسی‌ها',
  'organization.impersonate': 'ورود محدود و ممیزی‌شده به نمای کاربر',
  'customer.read': 'مشاهده مشتریان',
  'customer.create': 'ایجاد مشتری',
  'customer.identity.manage': 'مدیریت اطلاعات هویتی مشتری',
  'customer.identity.reconcile': 'یکپارچه‌سازی هویت مرکزی مشتری',
  'customer.merge': 'ادغام و بازگردانی رابطه مشتری',
  'customer.import.read': 'مشاهده ورود اطلاعات مشتری',
  'customer.import.create': 'ایجاد ورود اطلاعات مشتری',
  'customer.import.review': 'بررسی و تطبیق اطلاعات ورودی مشتری',
  'customer.import.approve': 'تأیید نهایی ورود اطلاعات مشتری',
  'sales.queue.read': 'مشاهده صف فروش شخصی',
  'sales.call.create': 'ثبت نتیجه تماس فروش',
  'sales.lead.create': 'ایجاد سرنخ فروش',
  'sales.lead.read_all': 'مشاهده همه سرنخ‌های شرکت',
  'sales.lead.assign': 'تخصیص سرنخ بدون مسئول',
  'sales.lead.reassign': 'بازتخصیص سرنخ فروش',
  'sales.marketing.link': 'اتصال زمینه بازاریابی به سرنخ',
  'sales.sale.create': 'ثبت فروش مستقیم',
  'sales.sale.create_on_behalf': 'ثبت فروش به‌نمایندگی از فروشنده',
  'sales.invoice.read_own': 'مشاهده فاکتورهای شخصی',
  'sales.invoice.read_all': 'مشاهده همه فاکتورهای شرکت',
  'sales.invoice.supervisor_approve': 'تأیید سرپرست فروش',
  'sales.invoice.edit_draft': 'ویرایش پیش‌نویس فاکتور',
  'sales.invoice.correct_returned': 'اصلاح فاکتور برگشتی',
  'sales.invoice.amend': 'اصلاح ممیزی‌شده فاکتور',
  'sales.payment.record': 'ثبت پرداخت مشتری',
  'sales.payment.review': 'تأیید پرداخت یا بازگرداندن برای اصلاح',
  'sales.payment.infrastructure.manage': 'مدیریت حساب‌های وصول و سیاست تأیید فروش',
  'warehouse.read': 'مشاهده انبار و موجودی',
  'warehouse.manage': 'مدیریت انبارها و محل‌ها',
  'warehouse.item.manage': 'مدیریت اقلام موجودی',
  'warehouse.receiving.create': 'ایجاد رسید دریافت کالا',
  'warehouse.receiving.post': 'ثبت نهایی دریافت کالا',
  'warehouse.receiving.manual': 'ثبت دریافت دستی با مستندات',
  'warehouse.reservation.manage': 'مدیریت رزرو موجودی',
  'warehouse.transfer.manage': 'مدیریت انتقال بین انبارها',
  'warehouse.adjustment.create': 'ایجاد اصلاح موجودی',
  'warehouse.adjustment.approve': 'تأیید اصلاح موجودی',
  'warehouse.count.create': 'ایجاد شمارش موجودی',
  'warehouse.count.approve': 'تأیید شمارش موجودی',
  'warehouse.return.manage': 'مدیریت کالای برگشتی',
  'warehouse.movement.reverse': 'ثبت حرکت معکوس موجودی',
};

export function permissionLabel(code: string): string {
  return permissionLabels[code] ?? 'دسترسی تعریف‌شده سامانه';
}

export const legacyMappingStatusLabels: Record<'UNMAPPED' | 'PARTIAL' | 'MAPPED' | 'REVIEW_REQUIRED', string> = {
  UNMAPPED: 'تطبیق‌داده‌نشده',
  PARTIAL: 'تطبیق جزئی',
  MAPPED: 'تطبیق‌شده',
  REVIEW_REQUIRED: 'نیازمند بررسی',
};
