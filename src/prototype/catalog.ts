import type { ModuleDefinition, PrototypeRecord, PrototypeRole } from './model';

const flow = (...steps: Array<[string, string, 'neutral' | 'info' | 'warning' | 'success' | 'danger']>) =>
  steps.map(([id, label, tone]) => ({ id, label, tone }));

export const MODULES: ModuleDefinition[] = [
  { id: 'dashboard', title: 'داشبورد مدیریتی', shortTitle: 'داشبورد', description: 'تصویر یکپارچه از وضعیت شرکت و اقدام‌های مهم امروز', group: 'کار روزانه', icon: 'LayoutDashboard', singular: 'شاخص', flow: [], fields: [] },
  { id: 'tasks', title: 'کارها و وظایف', shortTitle: 'وظایف', description: 'تخصیص، پیگیری و تحویل کارهای بین واحدی', group: 'کار روزانه', icon: 'ListTodo', singular: 'وظیفه', fields: ['owner','dueDate','category'], flow: flow(['draft','پیش‌نویس','neutral'],['open','آماده انجام','info'],['in_progress','در حال انجام','warning'],['review','بازبینی','warning'],['completed','تکمیل‌شده','success']) },
  { id: 'customers', title: 'مشتریان ۳۶۰', shortTitle: 'مشتریان', description: 'پرونده کامل مشتری، تماس‌ها، آدرس‌ها و سابقه تعامل', group: 'فروش و مشتری', icon: 'ContactRound', singular: 'مشتری', fields: ['phone','owner','category'], flow: flow(['new','جدید','info'],['verified','اعتبارسنجی‌شده','success'],['active','فعال','success'],['inactive','غیرفعال','neutral']) },
  { id: 'leads', title: 'سرنخ‌ها و صف فروش', shortTitle: 'سرنخ‌ها', description: 'مدیریت سرنخ، تماس، پیگیری و تبدیل به فروش', group: 'فروش و مشتری', icon: 'PhoneCall', singular: 'سرنخ', fields: ['customer','phone','owner','dueDate'], flow: flow(['new','جدید','info'],['assigned','تخصیص‌یافته','info'],['contacted','تماس برقرار شد','warning'],['qualified','واجد شرایط','success'],['won','تبدیل به فروش','success'],['lost','از دست‌رفته','danger']) },
  { id: 'invoices', title: 'فروش و فاکتورها', shortTitle: 'فاکتورها', description: 'ثبت فروش، اصلاح اقلام و گردش تأیید فاکتور', group: 'فروش و مشتری', icon: 'ReceiptText', singular: 'فاکتور', fields: ['customer','amount','owner','dueDate'], flow: flow(['draft','پیش‌نویس','neutral'],['supervisor_review','بررسی سرپرست','warning'],['awaiting_payment','منتظر پرداخت','warning'],['financial_review','بررسی مالی','warning'],['approved','تأیید مالی','success'],['completed','تکمیل‌شده','success']) },
  { id: 'payments', title: 'پرداخت‌ها و وصول', shortTitle: 'پرداخت‌ها', description: 'ثبت و بررسی واریزی‌ها و مغایرت‌های مالی', group: 'فروش و مشتری', icon: 'BadgeDollarSign', singular: 'پرداخت', fields: ['customer','amount','owner','dueDate'], flow: flow(['submitted','ثبت‌شده','info'],['review','در حال بررسی','warning'],['correction','نیازمند اصلاح','danger'],['approved','تأییدشده','success'],['settled','تسویه‌شده','success']) },
  { id: 'warehouse', title: 'انبار و موجودی', shortTitle: 'انبار', description: 'رسید، رزرو، انتقال، شمارش و برگشتی کالا', group: 'عملیات و مالی', icon: 'Warehouse', singular: 'عملیات انبار', fields: ['category','quantity','owner','dueDate'], flow: flow(['draft','پیش‌نویس','neutral'],['submitted','ارسال‌شده','info'],['approved','تأییدشده','success'],['posted','ثبت قطعی','success']) },
  { id: 'finance', title: 'درخواست‌های مالی', shortTitle: 'مالی', description: 'درخواست هزینه، تنخواه، خرید و گردش تأیید', group: 'عملیات و مالی', icon: 'Landmark', singular: 'درخواست مالی', fields: ['amount','owner','dueDate','category'], flow: flow(['draft','پیش‌نویس','neutral'],['manager_review','تأیید مدیر','warning'],['finance_review','بررسی مالی','warning'],['treasury','خزانه‌داری','warning'],['paid','پرداخت‌شده','success'],['archived','بایگانی','neutral']) },
  { id: 'vendors', title: 'تأمین‌کنندگان و ذی‌نفعان', shortTitle: 'تأمین‌کنندگان', description: 'دفتر تأمین‌کنندگان، اطلاعات بانکی و ارزیابی همکاری', group: 'عملیات و مالی', icon: 'BookUser', singular: 'تأمین‌کننده', fields: ['phone','owner','category'], flow: flow(['draft','پیش‌نویس','neutral'],['verification','اعتبارسنجی','warning'],['active','فعال','success'],['suspended','تعلیق','danger']) },
  { id: 'catalog', title: 'کاتالوگ کالا و خدمات', shortTitle: 'کاتالوگ', description: 'تعریف کالا، خدمت، قیمت و پیشنهادهای فروش', group: 'عملیات و مالی', icon: 'Boxes', singular: 'قلم کاتالوگ', fields: ['amount','quantity','category'], flow: flow(['draft','پیش‌نویس','neutral'],['review','بازبینی','warning'],['active','فعال','success'],['retired','خارج از فروش','neutral']) },
  { id: 'campaigns', title: 'کمپین‌ها و پروموشن‌ها', shortTitle: 'کمپین‌ها', description: 'طراحی، اجرا و تحلیل برنامه‌های بازاریابی', group: 'فروش و مشتری', icon: 'Megaphone', singular: 'کمپین', fields: ['amount','owner','dueDate','category'], flow: flow(['draft','پیش‌نویس','neutral'],['scheduled','زمان‌بندی‌شده','info'],['running','در حال اجرا','warning'],['paused','متوقف','danger'],['completed','پایان‌یافته','success']) },
  { id: 'fulfillment', title: 'اجرای سفارش و خدمت', shortTitle: 'اجرای سفارش', description: 'هماهنگی تحویل کالا و اجرای خدمات پس از فروش', group: 'عملیات و مالی', icon: 'Truck', singular: 'پرونده اجرا', fields: ['customer','owner','dueDate','category'], flow: flow(['new','جدید','info'],['planned','برنامه‌ریزی','info'],['in_progress','در حال اجرا','warning'],['delivered','تحویل‌شده','success'],['closed','بسته‌شده','success']) },
  { id: 'support', title: 'پشتیبانی و شکایات', shortTitle: 'پشتیبانی', description: 'ثبت، ارجاع و حل پرونده‌های خدمات پس از فروش', group: 'ارتباطات', icon: 'LifeBuoy', singular: 'پرونده پشتیبانی', fields: ['customer','phone','owner','dueDate','category'], flow: flow(['new','جدید','info'],['assigned','ارجاع‌شده','info'],['investigating','در حال بررسی','warning'],['waiting_customer','منتظر مشتری','warning'],['resolved','حل‌شده','success'],['closed','بسته‌شده','success']) },
  { id: 'letters', title: 'نامه‌ها و مکاتبات', shortTitle: 'مکاتبات', description: 'نامه داخلی، ابلاغ، پیام و ارتباطات سازمانی', group: 'ارتباطات', icon: 'Mail', singular: 'مکاتبه', fields: ['owner','dueDate','category'], flow: flow(['draft','پیش‌نویس','neutral'],['review','بازبینی','warning'],['sent','ارسال‌شده','success'],['received','دریافت‌شده','info'],['archived','بایگانی','neutral']) },
  { id: 'users', title: 'کاربران و ساختار سازمانی', shortTitle: 'کاربران', description: 'مدیریت کاربر، واحد، سمت و وضعیت همکاری', group: 'مدیریت', icon: 'Users', singular: 'کاربر', fields: ['phone','owner','category'], flow: flow(['invited','دعوت‌شده','info'],['active','فعال','success'],['suspended','تعلیق','danger'],['departed','خاتمه همکاری','neutral']) },
  { id: 'roles', title: 'نقش‌ها و دسترسی‌ها', shortTitle: 'نقش‌ها', description: 'تعریف نقش‌های کاری و سطح دسترسی هر نقش', group: 'مدیریت', icon: 'ShieldCheck', singular: 'نقش', fields: ['category'], flow: flow(['draft','پیش‌نویس','neutral'],['active','فعال','success'],['deprecated','منسوخ','neutral']) },
  { id: 'workflows', title: 'گردش‌کارها و قوانین', shortTitle: 'گردش‌کارها', description: 'طراحی مرحله‌ها، مسئول‌ها و شرط‌های فرایند', group: 'مدیریت', icon: 'GitBranch', singular: 'گردش‌کار', fields: ['owner','category'], flow: flow(['draft','پیش‌نویس','neutral'],['testing','در حال آزمون','warning'],['active','فعال','success'],['paused','متوقف','danger']) },
  { id: 'reports', title: 'گزارش‌ها و تحلیل', shortTitle: 'گزارش‌ها', description: 'نمای مدیریتی شاخص‌ها و روندهای عملیاتی', group: 'مدیریت', icon: 'ChartNoAxesCombined', singular: 'گزارش', flow: [], fields: [] },
  { id: 'settings', title: 'تنظیمات نمایش', shortTitle: 'تنظیمات', description: 'شخصی‌سازی ظاهر و تجربه کاربری', group: 'مدیریت', icon: 'Settings2', singular: 'تنظیم', flow: [], fields: [] },
];

const all = MODULES.map((module) => module.id);
const business = all.filter((id) => !['roles','workflows','settings'].includes(id));
export const ROLES: PrototypeRole[] = [
  { id: 'super_admin', title: 'مدیر سامانه', description: 'دسترسی کامل به طراحی و مدیریت همه بخش‌ها', color: '#4f46e5', modules: all, canEdit: all, canApprove: all },
  { id: 'executive', title: 'مدیرعامل', description: 'دید مدیریتی و تصویب تصمیم‌های کلیدی', color: '#0f766e', modules: business, canEdit: ['tasks'], canApprove: ['finance','invoices','campaigns'] },
  { id: 'finance_manager', title: 'مدیر مالی', description: 'مدیریت مالی، وصول و تأمین‌کنندگان', color: '#047857', modules: ['dashboard','tasks','invoices','payments','finance','vendors','reports','settings'], canEdit: ['tasks','payments','finance','vendors'], canApprove: ['payments','finance','invoices'] },
  { id: 'finance_requester', title: 'درخواست‌کننده مالی', description: 'ثبت و پیگیری درخواست‌های مالی', color: '#0891b2', modules: ['dashboard','tasks','finance','vendors','settings'], canEdit: ['tasks','finance'], canApprove: [] },
  { id: 'treasury', title: 'کارشناس خزانه', description: 'پرداخت و تسویه درخواست‌های تأییدشده', color: '#059669', modules: ['dashboard','tasks','payments','finance','vendors','reports','settings'], canEdit: ['tasks','payments','finance','vendors'], canApprove: ['payments','finance'] },
  { id: 'sales_manager', title: 'مدیر فروش', description: 'مدیریت تیم فروش، سرنخ‌ها و فاکتورها', color: '#7c3aed', modules: ['dashboard','tasks','customers','leads','invoices','payments','catalog','campaigns','fulfillment','reports','settings'], canEdit: ['tasks','customers','leads','invoices','catalog','campaigns','fulfillment'], canApprove: ['leads','invoices','campaigns'] },
  { id: 'seller', title: 'کارشناس فروش', description: 'صف فروش، تماس و ثبت فاکتور', color: '#2563eb', modules: ['dashboard','tasks','customers','leads','invoices','catalog','fulfillment','settings'], canEdit: ['tasks','customers','leads','invoices'], canApprove: [] },
  { id: 'marketing', title: 'مدیر بازاریابی', description: 'کاتالوگ، کمپین و تحلیل عملکرد', color: '#db2777', modules: ['dashboard','tasks','customers','leads','catalog','campaigns','reports','settings'], canEdit: ['tasks','catalog','campaigns'], canApprove: ['campaigns'] },
  { id: 'customer_success', title: 'عملیات مشتری', description: 'پرونده مشتری و اجرای خدمات', color: '#0d9488', modules: ['dashboard','tasks','customers','fulfillment','support','letters','settings'], canEdit: ['tasks','customers','fulfillment','support','letters'], canApprove: ['fulfillment','support'] },
  { id: 'support', title: 'کارشناس پشتیبانی', description: 'ثبت و حل درخواست‌ها و شکایات', color: '#ea580c', modules: ['dashboard','tasks','customers','support','letters','settings'], canEdit: ['tasks','support','letters'], canApprove: [] },
  { id: 'warehouse_manager', title: 'مدیر انبار', description: 'کنترل موجودی و تأیید عملیات انبار', color: '#a16207', modules: ['dashboard','tasks','invoices','warehouse','catalog','fulfillment','reports','settings'], canEdit: ['tasks','warehouse','fulfillment'], canApprove: ['warehouse','fulfillment'] },
  { id: 'warehouse_operator', title: 'اپراتور انبار', description: 'ثبت رسید، انتقال، شمارش و برگشتی', color: '#ca8a04', modules: ['dashboard','tasks','warehouse','catalog','fulfillment','settings'], canEdit: ['tasks','warehouse','fulfillment'], canApprove: [] },
  { id: 'communications', title: 'مسئول مکاتبات', description: 'نامه‌ها و ارتباطات رسمی شرکت', color: '#9333ea', modules: ['dashboard','tasks','letters','users','settings'], canEdit: ['tasks','letters'], canApprove: ['letters'] },
  { id: 'auditor', title: 'ممیز داخلی', description: 'مشاهده خواندنی همه فرایندها و گزارش‌ها', color: '#475569', modules: [...business,'users','roles','workflows','reports','settings'], canEdit: [], canApprove: [] },
];

const now = Date.now();
const days = (offset: number) => new Date(now + offset * 86_400_000).toISOString();
let sequence = 1000;
export const SEED_RECORDS: PrototypeRecord[] = MODULES.filter((module) => !['dashboard','reports','settings'].includes(module.id)).flatMap((module, index) => {
  const statuses = module.flow.map((step) => step.id);
  return [0, 1, 2].map((item) => {
    const status = statuses[Math.min(item + (index % 2), statuses.length - 1)] ?? 'active';
    const id = crypto.randomUUID();
    const code = `${module.id.slice(0, 3).toUpperCase()}-${++sequence}`;
    const titleSamples: Record<string, string[]> = {
      tasks: ['پیگیری قرارداد فروش سازمانی','تهیه گزارش هفتگی مدیریت','هماهنگی جلسه تحویل'],
      customers: ['شرکت راهکار سپهر','فروشگاه آرمان','گروه صنعتی پارس'], leads: ['درخواست خرید تجهیزات','پیگیری دموی سازمانی','تمدید قرارداد خدمات'],
      invoices: ['فاکتور فروش تجهیزات اداری','فاکتور خدمات استقرار','فاکتور تمدید پشتیبانی'], payments: ['واریزی کارت به کارت','حواله بانکی سازمانی','تسویه قرارداد خدمات'],
      warehouse: ['رسید خرید کالای مرکزی','انتقال به انبار شعبه','شمارش دوره‌ای قفسه A'], finance: ['درخواست خرید تجهیزات','تسویه هزینه مأموریت','پرداخت قرارداد پیمانکار'],
      vendors: ['تأمین کالای ایرانیان','خدمات فنی آریا','حمل‌ونقل سپهر'], catalog: ['سامانه مدیریت فروش','خدمت نصب و آموزش','بسته پشتیبانی طلایی'],
      campaigns: ['کمپین بازگشت مشتریان','فروش ویژه پایان فصل','معرفی سرویس سازمانی'], fulfillment: ['تحویل سفارش شرکت سپهر','استقرار نرم‌افزار آرمان','آموزش تیم فروش پارس'],
      support: ['اختلال در گزارش فروش','درخواست آموزش کاربر جدید','شکایت تأخیر در تحویل'], letters: ['ابلاغ سیاست فروش','نامه تمدید قرارداد','صورتجلسه هماهنگی'],
      users: ['سارا احمدی — فروش','مهدی رضایی — مالی','نیلوفر کریمی — پشتیبانی'], roles: ['نقش مدیر فروش','نقش کارشناس مالی','نقش اپراتور انبار'],
      workflows: ['گردش تأیید درخواست مالی','گردش ثبت تا تحویل فروش','گردش رسیدگی به شکایت'],
    };
    return {
      id, module: module.id as PrototypeRecord['module'], code,
      title: titleSamples[module.id]?.[item] ?? `${module.singular} نمونه ${item + 1}`,
      description: `نمونه کامل ${module.singular} برای مشاهده و ارزیابی رابط و گردش‌کار محصول.`,
      status, priority: (['normal','high','urgent'] as const)[item],
      amount: module.fields.includes('amount') ? (item + 1) * 18_750_000 : undefined,
      customer: module.fields.includes('customer') ? ['شرکت راهکار سپهر','فروشگاه آرمان','گروه صنعتی پارس'][item] : undefined,
      owner: module.fields.includes('owner') ? ['سارا احمدی','مهدی رضایی','نیلوفر کریمی'][item] : undefined,
      dueDate: module.fields.includes('dueDate') ? days(item - 1) : undefined,
      phone: module.fields.includes('phone') ? `09120000${120 + item}` : undefined,
      category: module.fields.includes('category') ? ['عملیاتی','فروش','مدیریتی'][item] : undefined,
      quantity: module.fields.includes('quantity') ? (item + 1) * 12 : undefined,
      tags: [module.shortTitle, item === 2 ? 'مهم' : 'نمونه'], createdAt: days(-8 - item), updatedAt: days(-item),
      events: [
        { id: crypto.randomUUID(), kind: 'created', summary: `${module.singular} ایجاد شد.`, actor: 'کاربر نمونه', occurredAt: days(-8 - item) },
        { id: crypto.randomUUID(), kind: 'status', summary: `وضعیت به «${module.flow.find((step) => step.id === status)?.label ?? status}» تغییر کرد.`, actor: 'سامانه نمایشی', occurredAt: days(-item) },
      ],
    };
  });
});

