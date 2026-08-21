import React, { useState } from 'react';
import { SystemRole, SystemPermission, User } from '../types';
import { DEFAULT_ROLE_ID_MAP } from '../utils/storage';
import {
  ShieldCheck, ShieldPlus, KeyRound, Users, Edit2,
  Trash2, CheckCircle2, Lock, Sparkles, Check, X, ShieldAlert
} from 'lucide-react';

// A user counts toward a role if it's their explicit roleId, an additionalRoleIds entry, or
// (for accounts predating the multi-role model) the DEFAULT_ROLE_ID_MAP fallback for their
// base UserRole — never a fragile roleTitle string match.
const userHasRole = (u: User, roleId: string): boolean =>
  u.roleId === roleId ||
  (u.additionalRoleIds || []).includes(roleId) ||
  (!u.roleId && DEFAULT_ROLE_ID_MAP[u.role] === roleId);

interface RolesAndPermissionsViewProps {
  roles: SystemRole[];
  users: User[];
  currentUser: User | null;
  onUpdateRoles: (updatedRoles: SystemRole[]) => void;
}

export const ALL_PERMISSIONS: { key: SystemPermission; title: string; category: string; description: string }[] = [
  // Request Operations
  { key: 'create_request', title: 'ثبت درخواست جدید', category: 'عملیات درخواست‌ها', description: 'امکان ایجاد و ارسال فاکتور و درخواست پرداخت جدید' },
  { key: 'view_all_requests', title: 'مشاهده تمامی درخواست‌های کل سازمان', category: 'عملیات درخواست‌ها', description: 'دسترسی کامل به بایگانی و کارتابل کل شرکت‌ها و شعب' },
  { key: 'view_branch_requests', title: 'مشاهده درخواست‌های شعب مجاز', category: 'عملیات درخواست‌ها', description: 'دسترسی محدود فقط به درخواست‌های شعب تحت سرپرستی کاربر' },
  
  // Approval & Treasury
  { key: 'approve_branch_request', title: 'تایید اولیه سرپرست / مدیر شعبه', category: 'تایید و واریز مالی', description: 'بررسی اولویت و تایید فاکتور خریداران شعب' },
  { key: 'approve_treasury', title: 'تایید نهایی و تخصیص بودجه خزانه‌داری', category: 'تایید و واریز مالی', description: 'تایید مبلغ توسط رضا بیات (مدیر خزانه‌داری)' },
  { key: 'execute_payment', title: 'اجرای واریز بانکی و آپلود فیش', category: 'تایید و واریز مالی', description: 'صدور واریز پایا/کارت‌به‌کارت و آپلود فیش تسویه' },
  { key: 'return_reject_request', title: 'عودت / رد درخواست‌های دارای اشکال', category: 'تایید و واریز مالی', description: 'امکان برگشت به متقاضی جهت اصلاح یا لغو سفارش' },

  // Management & Config
  { key: 'manage_cost_centers', title: 'مدیریت شعب و مراکز هزینه', category: 'مدیریت و پیکربندی', description: 'تعریف شعبه جدید، کدینگ و تخصیص بودجه' },
  { key: 'manage_companies', title: 'مدیریت شرکت‌های هلدینگ شاواز', category: 'مدیریت و پیکربندی', description: 'افزودن و ویرایش شرکت‌های زیرمجموعه' },
  { key: 'manage_users', title: 'مدیریت کاربران و کلمه عبور', category: 'مدیریت و پیکربندی', description: 'افزودن کاربر جدید، غیرفعالسازی و تغییر رمز' },
  { key: 'manage_roles', title: 'مدیریت نقش‌ها و ماتریس دسترسی‌ها', category: 'مدیریت و پیکربندی', description: 'تعریف نقش‌های شغلی جدید و تغییر سطح دسترسی' },
  { key: 'manage_vendors', title: 'مدیریت دفترچه ذینفعان و دسته‌بندی‌ها', category: 'مدیریت و پیکربندی', description: 'افزودن/ویرایش ذینفعان، و مدیریت دسته‌بندی‌های دفترچه (فقط ادمین)' },

  // After-sales service & complaints
  { key: 'manage_support_cases', title: 'ثبت و پیگیری پرونده‌های خدمات پس از فروش', category: 'خدمات پس از فروش و شکایات', description: 'ثبت تماس مشتری، شکایت و درخواست عودت وجه توسط پشتیبانی' },
  { key: 'financial_approve_support', title: 'تایید مالی مبالغ عودتی پشتیبانی', category: 'خدمات پس از فروش و شکایات', description: 'بررسی و تایید/رد/نیاز اصلاح هر ردیف تراکنش پیش از ارسال به خزانه' },
  { key: 'view_support_reports', title: 'گزارش‌گیری پیشرفته خدمات پس از فروش', category: 'خدمات پس از فروش و شکایات', description: 'مشاهده و خروجی گزارش کامل همه پرونده‌ها با فیلتر پیشرفته (ادمین)' },

  // Internal correspondence (نامه‌نگاری داخلی)
  { key: 'manage_letters', title: 'دسترسی به سامانه نامه‌نگاری داخلی', category: 'نامه‌نگاری داخلی (دبیرخانه)', description: 'ثبت نامه جدید، ارجاع، پاسخ و پیگیری مکاتبات با واحدهای دیگر' },

  // Reports & Archive
  { key: 'export_archive', title: 'خروجی اکسل و گزارش‌گیری پیشرفته', category: 'گزارشات و بایگانی', description: 'دانلود خروجی جامع اکسل و پرینت فرم‌های پرداخت' },
  { key: 'export_bank_batch', title: 'خروجی فایل پرداخت گروهی بانکی', category: 'گزارشات و بایگانی', description: 'تولید فایل دسته‌ای پایا/ساتنا جهت ارسال به سامانه بانکی' },
  { key: 'view_analytics', title: 'مشاهده نمودارها و داشبورد مدیریتی', category: 'گزارشات و بایگانی', description: 'تحلیل آمار و مانده اعتبارات خزانه‌داری' },
  { key: 'manage_assigned_tasks', title: 'مدیریت و دسترسی به کارهای محوله و دستورات اداری', category: 'دستورات اداری و کارهای محوله', description: 'امکان ارجاع کار بین کاربران، چت، ارسال نامه و تاییدیه انجام' },

  // Security & Impersonation
  { key: 'impersonate_users', title: 'ورود به حساب سایر کاربران (Impersonation)', category: 'امنیت و Impersonation', description: 'فقط برای هویت واقعی ادمین معنا دارد؛ نشست تودرتو مجاز نیست و در Audit Log ثبت می‌شود' },

  // Payment referral (normal + emergency)
  { key: 'refer_for_payment', title: 'ارجاع درخواست آماده به یک مسئول پرداخت مشخص', category: 'تایید و واریز مالی', description: 'پس از تایید نهایی، انتخاب صریح مسئول پرداخت (بدون انتخاب خودکار)' },
  { key: 'refer_for_emergency_payment', title: 'ارجاع به مسیر پرداخت فوری', category: 'تایید و واریز مالی', description: 'ارجاع به فرد دیگر با ذکر دلیل اجباری؛ خودارجاعی ممنوع' },
  { key: 'execute_emergency_payment', title: 'اجرای پرداخت فوری', category: 'تایید و واریز مالی', description: 'فقط توسط فردی که پرداخت فوری صراحتاً به او ارجاع شده است' },

  // Sales organization — customer-facing
  { key: 'sales_access', title: 'دسترسی پایه به ماژول فروش', category: 'سازمان فروش — مشتریان', description: 'ورود به بخش مشتریان و فاکتور فروش' },
  { key: 'view_own_customers', title: 'مشاهده مشتریان خودم', category: 'سازمان فروش — مشتریان', description: 'مشتریانی که خودِ کاربر با آن‌ها کار کرده' },
  { key: 'view_team_customers', title: 'مشاهده مشتریان زیرمجموعه مستقیم', category: 'سازمان فروش — مشتریان', description: 'دید سرپرست روی فروشندگان تحت نظارت مستقیم' },
  { key: 'view_descendant_customers', title: 'مشاهده مشتریان کل زیردرخت سازمانی', category: 'سازمان فروش — مشتریان', description: 'دید کامل زیرشاخه سازمانی فروش' },
  { key: 'search_customer_by_phone', title: 'جستجوی سراسری مشتری با شماره تماس', category: 'سازمان فروش — مشتریان', description: 'جستجوی مشتری در کل بانک مشتریان با شماره تماس' },
  { key: 'create_customer', title: 'ثبت مشتری جدید', category: 'سازمان فروش — مشتریان', description: 'ایجاد رکورد مشتری جدید' },
  { key: 'edit_customer_basic_info', title: 'ویرایش اطلاعات پایه مشتری', category: 'سازمان فروش — مشتریان', description: 'ویرایش نام، آدرس و اطلاعات پایه' },
  { key: 'view_customer_contact_fields', title: 'مشاهده شماره تماس مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به فیلدهای تماس مشتری' },
  { key: 'view_customer_address', title: 'مشاهده آدرس مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به آدرس ثبت‌شده مشتری' },
  { key: 'view_customer_purchase_history', title: 'مشاهده تاریخچه خرید مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به سوابق خرید مشتری' },
  { key: 'view_customer_call_history', title: 'مشاهده تاریخچه تماس مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی به سوابق تماس مشتری' },
  { key: 'view_customer_complaint_summary', title: 'مشاهده خلاصه شکایات مشتری', category: 'سازمان فروش — مشتریان', description: 'خلاصه شکایات ثبت‌شده برای مشتری' },
  { key: 'view_customer_complaint_details', title: 'مشاهده جزئیات کامل شکایات مشتری', category: 'سازمان فروش — مشتریان', description: 'دسترسی کامل به متن و جزئیات شکایات' },
  { key: 'start_sale_cycle', title: 'شروع چرخه فروش جدید', category: 'سازمان فروش — مشتریان', description: 'آغاز چرخه فروش با مشتری (قفل مالکیت پویا)' },
  { key: 'close_sale_cycle', title: 'بستن چرخه فروش فعال', category: 'سازمان فروش — مشتریان', description: 'اتمام و بستن چرخه فروش جاری' },

  // Sales organization — management (تخصیص/انتقال/تخلیهٔ صف اکنون پنل عملیاتی واقعی دارند)
  { key: 'assign_sales_lead', title: 'تخصیص Lead به فروشنده/زیرمجموعه', category: 'سازمان فروش — مدیریت', description: 'پنل «تخصیص و انتقال Lead» — قلمرو از زنجیرهٔ سرپرستی محاسبه می‌شود' },
  { key: 'reassign_sales_lead', title: 'انتقال Lead بعد از اولین تماس', category: 'سازمان فروش — مدیریت', description: 'فقط با ثبت دلیل — همان پنل «تخصیص و انتقال Lead»' },
  { key: 'drain_salesperson_queue', title: 'تخلیه صف Lead فروشندهٔ غیرفعال', category: 'سازمان فروش — مدیریت', description: 'انتقال گروهی Leadهای باز به فروشندهٔ دیگر — Leadهای بسته‌شده دست‌نخورده می‌مانند' },
  { key: 'view_sales_reports', title: 'گزارش‌گیری عملکرد فروش', category: 'سازمان فروش — مدیریت', description: 'گزارش عملکرد سازمان فروش' },
  { key: 'configure_sales_field_visibility', title: 'پیکربندی نمایش فیلدهای مشتری بر اساس نقش', category: 'سازمان فروش — مدیریت', description: 'تعیین این‌که کدام فیلد مشتری برای کدام نقش نمایان باشد' },
  { key: 'manage_sales_hierarchy', title: 'مدیریت زنجیره سرپرستی سازمان فروش', category: 'سازمان فروش — مدیریت', description: 'ویرایش زنجیره سرپرستی فروشندگان و سرپرستان' },

  // Data manager — Import/مخزن داده خام و تخصیص Lead اکنون پنل عملیاتی واقعی دارند
  { key: 'data_management_access', title: 'دسترسی پایه به مدیریت داده', category: 'مدیر داده', description: 'دسترسی پایه؛ صفحهٔ اختصاصی مستقل ندارد' },
  { key: 'import_raw_contacts', title: 'Import بانک داده خام (تکی/اکسل)', category: 'مدیر داده', description: 'پنل «مخزن داده خام و Import» — ثبت دستی و Import اکسل با نتیجهٔ ردیفی' },
  { key: 'review_import_conflicts', title: 'بررسی تعارض‌های Import', category: 'مدیر داده', description: 'کارتابل تعارض ورود اطلاعات (بازاستفاده از کارتابل ادغام فاز ۱ CRM)' },
  { key: 'view_raw_contact_pool', title: 'مشاهده مخزن داده خام', category: 'مدیر داده', description: 'پنل «مخزن داده خام و Import» — فیلتر وضعیت، تاریخچهٔ Import Job' },
  { key: 'configure_lead_assignment', title: 'تخصیص بدون‌محدودیت قلمرو Lead', category: 'مدیر داده', description: 'مدیر داده/ادمین در پنل «تخصیص و انتقال Lead» بدون محدودیت زنجیرهٔ سرپرستی' },
  { key: 'view_data_reports', title: 'گزارش‌گیری بانک داده (زیرساخت آماده)', category: 'مدیر داده', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },

  // Advertising operator — کمپین و تبدیل به Lead اکنون پنل عملیاتی واقعی دارند
  { key: 'advertising_access', title: 'دسترسی پایه به بخش تبلیغات', category: 'اپراتور تبلیغات', description: 'دسترسی پایه؛ صفحهٔ اختصاصی مستقل ندارد' },
  { key: 'manage_advertising_campaigns', title: 'ثبت/ویرایش کمپین تبلیغاتی', category: 'اپراتور تبلیغات', description: 'پنل «کمپین‌ها» — تولید Lead دستی یا خودکار قاعده‌محور' },
  { key: 'review_incoming_leads', title: 'بررسی اولیه Lead های ورودی (زیرساخت آماده)', category: 'اپراتور تبلیغات', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },
  { key: 'convert_interaction_to_lead', title: 'تبدیل داده خام به Lead', category: 'اپراتور تبلیغات', description: 'دکمهٔ «تبدیل به Lead» در پنل مخزن داده خام — فقط با تأیید صریح علاقهٔ خرید' },
  { key: 'view_campaign_reports', title: 'گزارش‌گیری کمپین‌ها (زیرساخت آماده)', category: 'اپراتور تبلیغات', description: 'صفحه عملیاتی هنوز پیاده‌سازی نشده است' },

  // صف فروش و ثبت تماس (فاز فروش تا ثبت فاکتور)
  { key: 'view_sales_queue', title: 'مشاهده و کار روی صف فروش شخصی', category: 'صف فروش و تماس', description: 'پنل «صف فروش من» — ۸ دستهٔ عملیاتی، نه فقط نمایش آماری' },
  { key: 'log_call_outcome', title: 'ثبت نتیجهٔ تماس با Lead', category: 'صف فروش و تماس', description: 'Adapter تماس — بدون اتصال واقعی Issabel' },

  // کاتالوگ کالا/خدمت/پروموشن
  { key: 'manage_products', title: 'مدیریت کاتالوگ کالا', category: 'کاتالوگ کالا/خدمت/پروموشن', description: 'ایجاد و ویرایش نسخه‌دار مشخصات/قیمت/وضعیت کالا با Audit' },
  { key: 'view_purchase_price', title: 'مشاهده قیمت خرید/بهای داخلی', category: 'کاتالوگ کالا/خدمت/پروموشن', description: 'فقط با مجوز صریح — هیچ نقش فروشی به‌صورت پیش‌فرض ندارد' },
  { key: 'manage_services', title: 'مدیریت کاتالوگ خدمت', category: 'کاتالوگ کالا/خدمت/پروموشن', description: 'ایجاد و ویرایش نسخه‌دار خدمت؛ مستقل از کارتابل اجرا' },
  { key: 'manage_promotions', title: 'مدیریت پروموشن', category: 'کاتالوگ کالا/خدمت/پروموشن', description: 'تعریف و ویرایش نسخه‌دار اجزا، قیمت نهایی مستقل، بازه و وضعیت' },
  { key: 'view_promotions', title: 'مشاهده پروموشن‌های فعال', category: 'کاتالوگ کالا/خدمت/پروموشن', description: 'فقط در Context انتخاب ردیف فاکتور؛ نه منوی مدیریتی' },

  // فاکتور فروش و پرداخت اعلامی
  { key: 'create_sales_invoice', title: 'ایجاد فاکتور فروش', category: 'فاکتور فروش و پرداخت', description: 'پنل «فاکتور فروش» — کد فاکتور از اولین ثبت هرگز تغییر نمی‌کند' },
  { key: 'view_own_invoices', title: 'مشاهده فاکتورهای خودم', category: 'فاکتور فروش و پرداخت', description: 'شامل فاکتورهای ثبت‌شده به نمایندگی توسط واحد ثبت' },
  { key: 'view_team_invoices', title: 'مشاهده فاکتورهای زیرمجموعه', category: 'فاکتور فروش و پرداخت', description: 'قلمرو از زنجیرهٔ سرپرستی فروش محاسبه می‌شود' },
  { key: 'edit_invoice_draft', title: 'ویرایش فاکتور در وضعیت Draft', category: 'فاکتور فروش و پرداخت', description: 'فقط پیش از ثبت نهایی فاکتور' },
  { key: 'record_declared_payment', title: 'ثبت پرداخت اعلامی', category: 'فاکتور فروش و پرداخت', description: 'هنوز تایید نهایی بانکی نیست — فقط اعلامی' },
  { key: 'return_invoice_to_salesperson', title: 'عودت فاکتور به فروشنده', category: 'فاکتور فروش و پرداخت', description: 'الزام ثبت دلیل عودت' },
  { key: 'register_invoice_on_behalf', title: 'ثبت فاکتور به نمایندگی فروشنده', category: 'فاکتور فروش و پرداخت', description: 'واحد ثبت — فروش/پورسانت متعلق به فروشندهٔ واقعی می‌ماند' },
  { key: 'bulk_import_invoices', title: 'Import گروهی فاکتور از اکسل', category: 'فاکتور فروش و پرداخت', description: 'پنل «ثبت گروهی فاکتور» — گروه‌بندی با کلید فاکتور خارجی، جلوگیری از ثبت دوباره' },

  // پروفایل یکپارچه مشتری و ادغام/جداسازی (فاز ۱ CRM) — همه دارای پنل عملیاتی واقعی
  { key: 'view_customer_profile', title: 'مشاهده پروفایل یکپارچه مشتری', category: 'پروفایل مشتری و ادغام', description: 'دسترسی به جزئیات کامل پروفایل چندمقداری و وضعیت‌های هفت‌گانه' },
  { key: 'search_customer_global', title: 'جستجوی سراسری چندفیلدی مشتری', category: 'پروفایل مشتری و ادغام', description: 'جستجو بر اساس نام یا شماره در کل بانک مشتریان' },
  { key: 'view_customer_merge_candidates', title: 'مشاهده پروفایل‌های مشابه پیشنهادی', category: 'پروفایل مشتری و ادغام', description: 'نمایش نتایج موتور تطبیق برای یک پروفایل' },
  { key: 'request_customer_merge', title: 'درخواست ادغام دو پروفایل', category: 'پروفایل مشتری و ادغام', description: 'ثبت درخواست ادغام — تصمیم نهایی همیشه با مدیر داده است' },
  { key: 'view_own_merge_requests', title: 'مشاهده درخواست‌های ادغام خودم', category: 'پروفایل مشتری و ادغام', description: 'پیگیری وضعیت درخواست‌های ادغامی که خودِ کاربر ثبت کرده' },
  { key: 'review_customer_merge_queue', title: 'مشاهده کارتابل ادغام مدیر داده', category: 'پروفایل مشتری و ادغام', description: 'دسترسی به صف درخواست‌های ادغام در انتظار تصمیم' },
  { key: 'approve_reject_customer_merge', title: 'تأیید/رد نهایی ادغام (فقط مدیر داده)', category: 'پروفایل مشتری و ادغام', description: 'اجرای واقعی ادغام دو پروفایل — بدون استثنا فقط مدیر داده/ادمین' },
  { key: 'select_customer_primary_value', title: 'انتخاب مقدار اصلی هنگام تعارض (فقط مدیر داده)', category: 'پروفایل مشتری و ادغام', description: 'تعیین نام/تلفن/آدرس معتبر در صورت وجود چند مقدار متعارض' },
  { key: 'split_customer_merge', title: 'اجرای جداسازی (Split) یک ادغام قبلی', category: 'پروفایل مشتری و ادغام', description: 'بازگردانی غیرمخرب پروفایل جذب‌شده — فقط مدیر داده/ادمین' },
  { key: 'view_customer_identity_audit', title: 'مشاهده تاریخچه و Audit ادغام/جداسازی', category: 'پروفایل مشتری و ادغام', description: 'دسترسی به رویدادهای کامل Merge/Split هر پروفایل' },
  { key: 'review_customer_entry_conflict', title: 'بررسی تعارض ورود اطلاعات', category: 'پروفایل مشتری و ادغام', description: 'تصمیم روی ورودی‌های متعارض (اتصال/پروفایل جدید/رد) — فقط مدیر داده' },
  { key: 'submit_customer_purchase_claim', title: 'ثبت ادعای خرید پیشین مشتری', category: 'پروفایل مشتری و ادغام', description: 'ثبت ادعای مبلغ خرید نامشخص برای بررسی دومرحله‌ای' },
  { key: 'review_customer_purchase_claim_data', title: 'بررسی مرحلهٔ داده ادعای خرید (فقط مدیر داده)', category: 'پروفایل مشتری و ادغام', description: 'بررسی هویت/سابقه و ارجاع یا رد — بدون اختیار تأیید نهایی مبلغ' },
  { key: 'review_customer_purchase_claim_financial', title: 'بررسی مرحلهٔ مالی ادعای خرید', category: 'پروفایل مشتری و ادغام', description: 'تأیید نهایی مبلغ — فقط با دسترسی به اطلاعات حداقلی ادعا، نه کل پروفایل' },
  { key: 'update_customer_contact_status', title: 'به‌روزرسانی نتیجهٔ تماس مشتری (واحد شنود)', category: 'پروفایل مشتری و ادغام', description: 'ثبت نتیجهٔ آخرین تماس (تأییدشده/بدون پاسخ/نیاز تماس مجدد)' },

  // چرخهٔ واقعی فاکتور ترکیبی: بررسی ثبت، تأیید مالی ردیفی، اجرای کالا/خدمت (مأموریت تکمیلی)
  { key: 'submit_sales_invoice_to_supervisor', title: 'ارسال فاکتور کامل به سرپرست', category: 'ثبت و گردش فاکتور فروش', description: 'فروشنده یا ثبات پس از تکمیل پرداخت‌های اعلامی، فاکتور را مستقیم به سرپرست Snapshot‌شده می‌فرستد' },
  { key: 'review_invoice_financial_confirmation', title: 'کارتابل تأیید مالی فروش', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'تصمیم ردیفی روی هر پرداخت اعلامی — تأیید/رد/نیاز اصلاح، مستقل از بررسی ادعای خرید' },
  { key: 'view_sales_financial_queue', title: 'مشاهده صف مالی فروش', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'مدیر کل صف و مسئول فقط صف مشترک یا پرونده تخصیص‌یافته را می‌بیند' },
  { key: 'claim_sales_financial_review', title: 'Claim پرونده مالی فروش', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'قفل عملیاتی پرونده به نام مسئول برای جلوگیری از اقدام هم‌زمان' },
  { key: 'decide_sales_declared_payment', title: 'تعیین تکلیف ردیف پرداخت', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'تأیید، رد، نیاز اصلاح یا توقف مشکوک روی هر ردیف' },
  { key: 'return_sales_invoice_financial_correction', title: 'عودت مالی برای اصلاح', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'عودت با دلیل، شرح کامل و ردیف مسئله‌دار به فروشنده یا ثبات' },
  { key: 'manage_sales_financial_distribution', title: 'مدیریت توزیع صف مالی فروش', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'تنظیم صف مشترک، تخصیص دستی یا توزیع متعادل و تخصیص مسئول' },
  { key: 'release_sales_financial_hold', title: 'رفع توقف مشکوک مالی', category: 'بررسی ثبت و تأیید مالی فاکتور', description: 'فقط مدیر مالی فروش با دلیل ثبت‌شده' },
  { key: 'dispatch_product_case', title: 'آماده‌سازی و ارسال پروندهٔ اجرای کالا', category: 'اجرای کالا و خدمت', description: 'مسئول ارسال و لجستیک — بعد از تأیید مالی نهایی فاکتور' },
  { key: 'deliver_product_case', title: 'تحویل پروندهٔ اجرای کالا به مشتری', category: 'اجرای کالا و خدمت', description: 'نمایندهٔ تحویل — آخرین مرحلهٔ چرخهٔ اجرای کالا' },
  { key: 'manage_service_fulfillment_assignment', title: 'مدیریت پروندهٔ اجرای خدمت', category: 'اجرای کالا و خدمت', description: 'مدیر پروژهٔ خدمات — دریافت، ارجاع/تغییر کارشناس، بازبینی نتیجه، عودت اصلاحی و بستن دلیل‌دار' },
  { key: 'execute_service_fulfillment_case', title: 'اجرای پروندهٔ خدمت شخصی', category: 'اجرای کالا و خدمت', description: 'کارشناس خدمات — تماس، انتظار دلیل‌دار، ثبت مدرک و ارسال نتیجه؛ فقط پرونده‌های ارجاع‌شده به خودش' },

  // چرخهٔ عمر نیروی فروش و سلسله‌مراتب زمان‌دار (بند ۲۱ AGENTS.md)
  { key: 'manage_sales_users', title: 'مدیریت کاربران فروش', category: 'چرخهٔ عمر نیروی فروش', description: 'ایجاد/غیرفعال‌سازی/بایگانی نیروی فروش — مستقل از مالی/خزانه/دفترچهٔ ذینفعان' },
  { key: 'manage_sales_branches_and_chains', title: 'مدیریت شعب فروش و زنجیره‌های ثابت', category: 'چرخهٔ عمر نیروی فروش', description: 'تعریف شعبه و زنجیره/تیم ثابت داخل شعبه' },
  { key: 'request_salesperson_transfer', title: 'درخواست انتقال فروشنده', category: 'چرخهٔ عمر نیروی فروش', description: 'فقط سرپرست مستقیم فعلی فروشنده می‌تواند ثبت کند — بدون تعیین مقصد' },
  { key: 'review_salesperson_transfer', title: 'بررسی/تأیید/رد درخواست انتقال', category: 'چرخهٔ عمر نیروی فروش', description: 'تعیین مقصد کامل (شعبه+زنجیره) و زمان اثرگذاری — فقط مدیر کاربران فروش/ادمین' },
  { key: 'correct_unused_sales_assignment', title: 'اصلاح انتصاب پیش از استفادهٔ مؤثر', category: 'چرخهٔ عمر نیروی فروش', description: 'اصلاح درجا با Audit — فقط پیش از اولین رویداد کسب‌وکاری روی انتصاب' },
  { key: 'execute_due_sales_transfers', title: 'اجرای انتقال‌های زمان‌بندی‌شدهٔ سررسیده', category: 'چرخهٔ عمر نیروی فروش', description: 'Trigger دستی/سیستمی اجرای انتقال‌هایی که زمان اثرگذاری‌شان رسیده' },
  { key: 'view_archived_sales_workspace', title: 'مشاهدهٔ نمای بایگانی‌شدهٔ نیروی غیرفعال', category: 'چرخهٔ عمر نیروی فروش', description: 'مشاهدهٔ Read-only سوابق نیروی فروش غیرفعال، بدون Impersonation روزمره' },
  { key: 'add_archived_sales_note', title: 'ثبت یادداشت مدیریتی روی پروندهٔ بایگانی‌شده', category: 'چرخهٔ عمر نیروی فروش', description: 'یادداشت Append-only — تاریخچهٔ قبلی هرگز ویرایش/حذف نمی‌شود' },
  { key: 'emergency_correct_sales_assignment', title: 'اصلاح اضطراری انتصاب استفاده‌شده', category: 'چرخهٔ عمر نیروی فروش', description: 'فقط ادمین اصلی — نامه/دلیل/شرح کامل اجباری، close+create نه بازنویسی' },
  { key: 'approve_sales_invoice_supervisor_step', title: 'تأیید سرپرست فاکتور', category: 'چرخهٔ عمر نیروی فروش', description: 'مجوز مستقل گام تأیید سرپرست پیش از مالی — Deny صریح این مجوز حتی روی مدیر کل هم غالب است' },

  // تکمیل فلو نهایی فاکتور: پس‌گرفتن/عودت رسمی و هماهنگی پیش از مالی (مأموریت تکمیل فلو نهایی فاکتور)
  { key: 'recall_invoice_for_correction', title: 'پس‌گرفتن فاکتور برای اصلاح', category: 'هماهنگی فاکتور', description: 'فقط فروشنده/ثبات مالک ثبت — پیش از اولین اقدام رسمی واحد بعد' },
  { key: 'return_invoice_for_correction', title: 'عودت رسمی برای اصلاح', category: 'هماهنگی فاکتور', description: 'عودت دلیل‌دار از هماهنگی به فروشنده/ثبات — تأیید سرپرست را نامعتبر می‌کند' },
  { key: 'view_coordination_queue', title: 'مشاهدهٔ کارتابل هماهنگی', category: 'هماهنگی فاکتور', description: 'مدیر: کل قلمرو صف — مسئول: فقط پرونده‌های تخصیص‌یافته به خودش' },
  { key: 'assign_coordination_case', title: 'تخصیص پروندهٔ هماهنگی', category: 'هماهنگی فاکتور', description: 'فقط مدیر هماهنگی — انتخاب مسئول هماهنگی برای هر پرونده' },
  { key: 'claim_coordination_case', title: 'Claim پروندهٔ هماهنگی', category: 'هماهنگی فاکتور', description: 'شروع رسمی کار روی پروندهٔ تخصیص‌یافته به خود' },
  { key: 'record_coordination_attempt', title: 'ثبت تلاش/نتیجهٔ هماهنگی', category: 'هماهنگی فاکتور', description: 'ثبت Append-only نتیجهٔ تماس/بررسی — هرگز overwrite نمی‌شود' },
  { key: 'approve_coordination', title: 'تأیید هماهنگی', category: 'هماهنگی فاکتور', description: 'تنها نقطهٔ ورود فاکتور از هماهنگی به تأیید مالی' },
  { key: 'escalate_coordination_case', title: 'ارجاع پروندهٔ هماهنگی به مدیر', category: 'هماهنگی فاکتور', description: 'ارجاع به صف استثنا برای رسیدگی مدیر هماهنگی' },
  { key: 'manage_coordination_distribution', title: 'مدیریت روش توزیع هماهنگی', category: 'هماهنگی فاکتور', description: 'انتخاب تخصیص دستی، مخزن مشترک با Claim یا توزیع متوازن — فقط مدیر هماهنگی' },
  { key: 'bypass_coordination_without_contact', title: 'عبور مدیریتی بدون تماس', category: 'هماهنگی فاکتور', description: 'انتخاب تکی/گروهی و ارسال دلیل‌دار به مالی؛ هرگز به‌عنوان تأیید مشتری ثبت نمی‌شود' }
];

const PERMISSION_CATEGORIES = [
  'عملیات درخواست‌ها', 'تایید و واریز مالی', 'مدیریت و پیکربندی',
  'خدمات پس از فروش و شکایات', 'نامه‌نگاری داخلی (دبیرخانه)', 'گزارشات و بایگانی',
  'دستورات اداری و کارهای محوله', 'امنیت و Impersonation',
  'سازمان فروش — مشتریان', 'سازمان فروش — مدیریت', 'پروفایل مشتری و ادغام',
  'مدیر داده', 'اپراتور تبلیغات',
  'صف فروش و تماس', 'کاتالوگ کالا/خدمت/پروموشن', 'فاکتور فروش و پرداخت',
  'بررسی ثبت و تأیید مالی فاکتور', 'اجرای کالا و خدمت', 'چرخهٔ عمر نیروی فروش'
];

const ORG_LEVEL_LABELS: Record<number, string> = {
  1: 'سطح ۱ — فروشنده',
  2: 'سطح ۲ — سرپرست',
  3: 'سطح ۳ — سرپرست ارشد',
  4: 'سطح ۴ — مدیر فروش',
  5: 'سطح ۵ — معاونت فروش'
};

// دامنهٔ نقش (مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش) — فروش را از خزانه‌داری/مالی کاملاً
// تفکیک‌شده نمایش می‌دهد؛ نقش‌های فروش هرگز زیر همان گروه بصری خزانه‌داری دیده نمی‌شوند.
const DOMAIN_LABELS: Record<string, string> = {
  system: 'سیستم', treasury: 'خزانه‌داری', sales: 'فروش', sales_finance: 'مالی فروش',
  data: 'مدیریت داده', advertising: 'تبلیغات', registration: 'واحد ثبت', monitoring: 'واحد شنود',
  after_sales: 'خدمات پس از فروش', fulfillment: 'اجرا و لجستیک', general: 'عمومی'
};
const DOMAIN_BADGE_CLASSES: Record<string, string> = {
  system: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  treasury: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60',
  sales: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  sales_finance: 'bg-teal-950/60 text-teal-300 border-teal-800/60',
  data: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
  advertising: 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-800/60',
  registration: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60',
  monitoring: 'bg-violet-950/60 text-violet-300 border-violet-800/60',
  after_sales: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
  fulfillment: 'bg-orange-950/60 text-orange-300 border-orange-800/60',
  general: 'bg-slate-800 text-slate-400 border-slate-700'
};

export const RolesAndPermissionsView: React.FC<RolesAndPermissionsViewProps> = ({
  roles,
  users,
  currentUser,
  onUpdateRoles
}) => {
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<SystemRole | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const visibleRoles = domainFilter === 'all' ? roles : roles.filter((r) => (r.domain || 'general') === domainFilter);

  // Form State
  const [roleName, setRoleName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<SystemPermission[]>([]);

  const handleOpenCreateModal = () => {
    setIsCreatingNew(true);
    setSelectedRoleForEdit(null);
    setRoleName('');
    setRoleCode(`ROLE_${Date.now().toString().slice(-4)}`);
    setRoleDesc('');
    setSelectedPermissions(['create_request', 'view_branch_requests']);
  };

  const handleOpenEditModal = (role: SystemRole) => {
    setIsCreatingNew(false);
    setSelectedRoleForEdit(role);
    setRoleName(role.name);
    setRoleCode(role.code);
    setRoleDesc(role.description);
    setSelectedPermissions(role.permissions || []);
  };

  const handleTogglePermission = (permKey: SystemPermission) => {
    if (selectedPermissions.includes(permKey)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== permKey));
    } else {
      setSelectedPermissions([...selectedPermissions, permKey]);
    }
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) {
      alert('لطفاً عنوان نقش را وارد کنید.');
      return;
    }

    if (isCreatingNew) {
      const newRole: SystemRole = {
        id: `role_${Date.now()}`,
        code: roleCode.trim().toUpperCase() || 'CUSTOM_ROLE',
        name: roleName.trim(),
        description: roleDesc.trim() || 'نقش کاربری سفارشی در سیستم خزانه‌داری',
        isSystemRole: false,
        permissions: selectedPermissions
      };
      onUpdateRoles([...roles, newRole]);
      alert(`نقش جدید "${newRole.name}" با موفقیت ایجاد شد.`);
    } else if (selectedRoleForEdit) {
      // System role id/code are never editable from the UI, even if the readOnly input were
      // bypassed — the handler itself re-enforces this, not just the disabled field.
      const updated = roles.map(r => r.id === selectedRoleForEdit.id ? {
        ...r,
        name: roleName.trim(),
        code: r.isSystemRole ? r.code : (roleCode.trim().toUpperCase() || r.code),
        description: roleDesc.trim(),
        permissions: selectedPermissions
      } : r);
      onUpdateRoles(updated);
      alert(`نقش "${roleName}" با موفقیت ویرایش گردید.`);
    }

    setIsCreatingNew(false);
    setSelectedRoleForEdit(null);
  };

  const handleDeleteRole = (roleId: string, roleNameStr: string) => {
    if (currentUser?.role !== 'admin') {
      alert('تنها ادمین ارشد سیستم اجازه حذف نقش‌های شغلی و دسترسی‌ها را دارد.');
      return;
    }

    const roleObj = roles.find(r => r.id === roleId);
    const assignedUsers = users.filter(u =>
      u.roleId === roleId ||
      u.role === roleObj?.code?.toLowerCase() ||
      (u.additionalRoleIds || []).includes(roleId)
    );

    if (assignedUsers.length > 0) {
      alert(`امکان حذف نقش "${roleNameStr}" وجود ندارد.\n\nتعداد ${assignedUsers.length} کاربر در سیستم دارای این نقش شغلی می‌باشند. برای حذف نقش، ابتدا نقش کاربران مربوطه را تغییر دهید.`);
      return;
    }

    if (confirm(`آیا از حذف کامل نقش "${roleNameStr}" اطمینان دارید؟`)) {
      onUpdateRoles(roles.filter(r => r.id !== roleId));
      alert(`نقش "${roleNameStr}" با موفقیت حذف گردید.`);
    }
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Page Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <span>مدیریت نقش‌ها و ماتریس دسترسی‌ها (RBAC)</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                استاندارد سازمانی
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تعریف نقش‌های سیستمی و تعیین دقیق اختیارات و دسترسی‌های ریز هر نقش به صورت تفکیک‌شده
            </p>
          </div>
        </div>

        {currentUser?.role === 'admin' && (
          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition cursor-pointer"
          >
            <ShieldPlus className="w-4 h-4" />
            <span>تعریف نقش جدید</span>
          </button>
        )}
      </div>

      {/* Domain Filter — دامنهٔ نقش (فروش/خزانه‌داری/مالی فروش/...) کاملاً مستقل از هم نمایش داده می‌شوند */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-400">فیلتر بر اساس دامنهٔ نقش:</span>
        <button
          onClick={() => setDomainFilter('all')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
            domainFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          همه ({roles.length})
        </button>
        {Object.keys(DOMAIN_LABELS).map((domainKey) => {
          const count = roles.filter((r) => (r.domain || 'general') === domainKey).length;
          if (count === 0) return null;
          return (
            <button
              key={domainKey}
              onClick={() => setDomainFilter(domainKey)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                domainFilter === domainKey ? DOMAIN_BADGE_CLASSES[domainKey] + ' ring-1 ring-inset ring-current' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {DOMAIN_LABELS[domainKey]} ({count})
            </button>
          );
        })}
      </div>

      {/* Roles Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleRoles.map((r) => {
          const userCount = users.filter(u => userHasRole(u, r.id)).length;

          return (
            <div key={r.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 hover:border-indigo-500/40 transition group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0 font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">{r.name}</h3>
                    <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-900/60">
                      {r.code}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold whitespace-nowrap ${DOMAIN_BADGE_CLASSES[r.domain || 'general']}`}>
                    {DOMAIN_LABELS[r.domain || 'general']}
                  </span>
                  {r.isSystemRole && (
                    <span className="text-[9px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                      سیستمی
                    </span>
                  )}
                  {r.implementationStatus === 'infrastructure_ready' && (
                    <span className="text-[9px] bg-slate-700/40 text-slate-300 px-2 py-0.5 rounded-full border border-slate-600/40 font-bold whitespace-nowrap">
                      زیرساخت آماده — در انتظار پیاده‌سازی
                    </span>
                  )}
                  {r.organizationalLevel !== undefined && (
                    <span className="text-[9px] bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/20 font-bold whitespace-nowrap">
                      {ORG_LEVEL_LABELS[r.organizationalLevel] || `سطح سازمانی ${r.organizationalLevel}`}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 min-h-[36px] line-clamp-2">
                {r.description}
              </p>

              {/* Active Permissions Summary Badges */}
              <div className="pt-2 border-t border-slate-800">
                <div className="text-[10px] font-bold text-slate-500 mb-1.5 flex items-center justify-between">
                  <span>دسترسی‌های فعال ({r.permissions?.length || 0}):</span>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Users className="w-3 h-3 text-indigo-400" />
                    <strong>{userCount}</strong> کاربر
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {r.permissions?.map(pKey => {
                    const permObj = ALL_PERMISSIONS.find(ap => ap.key === pKey);
                    return (
                      <span key={pKey} className="text-[9.5px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded-md border border-slate-800 flex items-center gap-1 font-bold">
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span>{permObj?.title || pKey}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              {currentUser?.role === 'admin' && (
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEditModal(r)}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش دسترسی‌ها</span>
                  </button>

                  {!r.isSystemRole && (
                    <button
                      onClick={() => handleDeleteRole(r.id, r.name)}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-xl text-xs transition cursor-pointer"
                      title="حذف نقش"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Permission Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 space-y-4 mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>ماتریس جامع مقایسه دسترسی نقش‌ها (Full Permissions Matrix)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              جدول تفکیکی اختیارات ریز هر نقش کاربری در کل سیستم خزانه‌داری
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">عنوان دسترسی / اختیار</th>
                <th className="p-3">دسته‌بندی</th>
                {visibleRoles.map(r => (
                  <th key={r.id} className="p-3 text-center min-w-[120px]">
                    <span className="text-white block font-extrabold">{r.name}</span>
                    <span className="text-[9px] text-indigo-400 font-mono font-normal">{r.code}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ALL_PERMISSIONS.map(perm => (
                <tr key={perm.key} className="hover:bg-slate-800/40 transition">
                  <td className="p-3 font-bold text-white">
                    <div>{perm.title}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{perm.description}</div>
                  </td>

                  <td className="p-3">
                    <span className="text-[10px] bg-slate-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-900/60 font-bold">
                      {perm.category}
                    </span>
                  </td>

                  {visibleRoles.map(r => {
                    const hasPerm = r.permissions?.includes(perm.key);
                    return (
                      <td key={r.id} className="p-3 text-center">
                        {hasPerm ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-950 text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Role Modal */}
      {(isCreatingNew || selectedRoleForEdit) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <span>{isCreatingNew ? 'تعریف نقش و سطح دسترسی جدید' : `ویرایش نقش: ${selectedRoleForEdit?.name}`}</span>
              </h3>
              <button
                onClick={() => { setIsCreatingNew(false); setSelectedRoleForEdit(null); }}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    عنوان نقش <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    required
                    placeholder="مثال: سرپرست انبار و استور"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    کد اختصاری سیستمی {selectedRoleForEdit?.isSystemRole && <span className="text-[10px] text-slate-500 font-normal">(نقش سیستمی — غیرقابل ویرایش)</span>}
                  </label>
                  <input
                    type="text"
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value)}
                    readOnly={!!selectedRoleForEdit?.isSystemRole}
                    placeholder="STORE_SUPERVISOR"
                    className={`w-full text-xs rounded-xl px-3 py-2 border font-mono text-left focus:outline-none ${
                      selectedRoleForEdit?.isSystemRole
                        ? 'bg-slate-950 text-slate-500 border-slate-800 cursor-not-allowed'
                        : 'bg-slate-800 text-indigo-200 border-slate-700 focus:border-indigo-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  توضیحات و شرح وظایف نقش
                </label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="توضیح کوتاه در خصوص حیطه مسئولیت‌های این نقش..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Permissions Checklist Grouped by Category */}
              <div className="pt-2 space-y-3">
                <label className="block text-xs font-extrabold text-indigo-300">
                  انتخاب دسترسی‌ها و اختیارات این نقش:
                </label>

                {PERMISSION_CATEGORIES.map(cat => {
                  const catPerms = ALL_PERMISSIONS.filter(p => p.category === cat);
                  return (
                    <div key={cat} className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                      <div className="text-[11px] font-bold text-slate-400 border-b border-slate-800 pb-1">
                        {cat}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {catPerms.map(p => {
                          const isChecked = selectedPermissions.includes(p.key);
                          return (
                            <label
                              key={p.key}
                              className={`p-2 rounded-xl border text-xs font-bold flex items-start gap-2 cursor-pointer transition ${
                                isChecked
                                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePermission(p.key)}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800 mt-0.5 focus:ring-indigo-500"
                              />
                              <div>
                                <div>{p.title}</div>
                                <div className="text-[9.5px] text-slate-500 font-normal leading-tight mt-0.5">
                                  {p.description}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsCreatingNew(false); setSelectedRoleForEdit(null); }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  ذخیره نقش
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
