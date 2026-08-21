// 'member' یک نوع خنثی Compatibility است — برای کاربران غیرخزانه‌ای (فروش، مدیر داده، تبلیغات،
// واحد ثبت/شنود، پروموشن، اجرای کالا/خدمت) که نباید به‌اشتباه به‌عنوان «درخواست‌کننده پرداخت»
// شناخته شوند. منبع واقعی نقش/Permission همیشه roleId/additionalRoleIds + getEffectiveUserPermissions
// است؛ این فیلد فقط برای گردش‌های قدیمی خزانه که مستقیماً به User.role سوییچ می‌کنند نگه داشته شده.
export type UserRole = 'admin' | 'approver' | 'requestor' | 'treasury_executor' | 'support_agent' | 'financial_approver' | 'member';

export type SystemPermission = 
  | 'create_request'           // ثبت درخواست جدید
  | 'view_all_requests'        // مشاهده کل درخواست‌های سازمان
  | 'view_branch_requests'     // مشاهده فقط درخواست‌های شعب مجاز
  | 'approve_branch_request'   // تایید اولیه سرپرست شعبه
  | 'approve_treasury'         // تایید نهایی خزانه‌داری
  | 'execute_payment'          // اجرا و واریز بانکی
  | 'return_reject_request'    // عودت و رد درخواست
  | 'manage_cost_centers'      // مدیریت شعب و مراکز هزینه
  | 'manage_companies'         // مدیریت شرکت‌ها
  | 'manage_users'             // مدیریت کاربران و کلمه عبور
  | 'manage_roles'             // مدیریت نقش‌ها و ماتریس دسترسی‌ها
  | 'manage_vendors'           // مدیریت دفترچه ذینفعان و تامین‌کنندگان
  | 'export_archive'           // خروجی اکسل و بایگانی کل
  | 'export_bank_batch'        // خروجی فایل پرداخت گروهی بانکی
  | 'view_analytics'           // مشاهده آمار و نمودارهای خزانه‌داری
  | 'manage_assigned_tasks'    // دسترسی به بخش کارهای محوله و دستورات اداری
  | 'manage_support_cases'     // ثبت و پیگیری پرونده‌های خدمات پس از فروش و شکایات
  | 'financial_approve_support'// تایید مالی مبالغ عودتی پرونده‌های پشتیبانی
  | 'view_support_reports'     // گزارش‌گیری پیشرفته کل پرونده‌های خدمات پس از فروش (ادمین)
  | 'manage_letters'           // دسترسی به سامانه نامه‌نگاری داخلی (ثبت، ارجاع، پاسخ)
  | 'sales_access'             // دسترسی به ماژول فروش (مشتریان، فاکتور فروش)
  | 'impersonate_users'        // ورود ادمین به حساب کاربران دیگر (Impersonation) — فقط برای نقش admin واقعی معنا دارد
  | 'refer_for_payment'        // ارجاع درخواست آماده‌ی پرداخت به یک مسئول پرداخت مشخص
  | 'refer_for_emergency_payment' // ارجاع یک درخواست به مسیر پرداخت فوری (بدون تایید کامل زنجیره عادی)
  | 'execute_emergency_payment'   // اجرای پرداخت فوری برای درخواست ارجاع‌شده به مسیر فوری
  // --- مجوزهای ریزدانه سازمان فروش ---
  | 'view_own_customers'           // دیدن مشتریانی که خودِ کاربر با آن‌ها کار کرده
  | 'view_team_customers'          // دیدن مشتریان زیرمجموعه‌ی مستقیم
  | 'view_descendant_customers'    // دیدن مشتریان کل زیردرخت سازمانی زیرمجموعه
  | 'search_customer_by_phone'     // جستجوی سراسری مشتری بر اساس شماره تماس
  | 'create_customer'              // ثبت مشتری جدید
  | 'edit_customer_basic_info'     // ویرایش اطلاعات پایه مشتری
  | 'view_customer_contact_fields' // مشاهده شماره تماس‌های مشتری
  | 'view_customer_address'        // مشاهده آدرس مشتری
  | 'view_customer_purchase_history'   // مشاهده تاریخچه خرید مشتری
  | 'view_customer_call_history'       // مشاهده تاریخچه تماس مشتری
  | 'view_customer_complaint_summary'  // مشاهده خلاصه شکایات مشتری
  | 'view_customer_complaint_details'  // مشاهده جزئیات کامل شکایات مشتری
  | 'start_sale_cycle'             // شروع چرخه فروش جدید با مشتری
  | 'close_sale_cycle'             // بستن چرخه فروش فعال
  | 'assign_sales_lead'            // ارجاع مستقیم Lead به یک فروشنده/زیرمجموعه (زیرساخت — هنوز بدون صفحه عملیاتی)
  | 'reassign_sales_lead'          // جابه‌جایی/ارجاع مجدد یک Lead (زیرساخت — هنوز بدون صفحه عملیاتی)
  | 'drain_salesperson_queue'      // تخلیه صف Lead های یک فروشنده (زیرساخت — هنوز بدون صفحه عملیاتی)
  | 'view_sales_reports'           // گزارش‌گیری از عملکرد فروش
  | 'configure_sales_field_visibility' // پیکربندی این‌که کدام فیلدهای مشتری برای چه نقشی نمایان باشد
  | 'manage_sales_hierarchy'       // ویرایش زنجیره سرپرستی سازمان فروش
  // --- مجوزهای مدیر داده (زیرساخت آماده، فلو کامل در فاز بعد) ---
  | 'data_management_access'       // دسترسی پایه به بخش مدیریت داده
  | 'import_raw_contacts'          // Import بانک داده خام
  | 'review_import_conflicts'      // بررسی تعارض‌های Import
  | 'view_raw_contact_pool'        // مشاهده مخزن داده خام
  | 'configure_lead_assignment'    // پیکربندی موتور تخصیص Lead
  | 'view_data_reports'            // گزارش‌گیری بانک داده
  // --- مجوزهای اپراتور تبلیغات (زیرساخت آماده، فلو کامل در فاز بعد) ---
  | 'advertising_access'           // دسترسی پایه به بخش تبلیغات
  | 'manage_advertising_campaigns' // ثبت/ویرایش کمپین تبلیغاتی
  | 'review_incoming_leads'        // بررسی اولیه Lead های ورودی
  | 'convert_interaction_to_lead'  // تبدیل تعامل ورودی به Lead
  | 'view_campaign_reports'        // گزارش‌گیری کمپین‌ها
  // --- پروفایل یکپارچه مشتری و ادغام/جداسازی (فاز ۱ CRM) ---
  | 'view_customer_profile'            // مشاهده پروفایل کامل مشتری (چندمقداری، وضعیت‌های چندبعدی، Timeline)
  | 'search_customer_global'           // جستجوی سراسری چندفیلدی مشتری (نام/تلفن/آدرس)، نه فقط شماره دقیق
  | 'view_customer_merge_candidates'   // مشاهده پروفایل‌های مشابه احتمالی جهت درخواست ادغام
  | 'request_customer_merge'           // ثبت درخواست ادغام دو یا چند پروفایل مستقل
  | 'view_own_merge_requests'          // مشاهده درخواست‌های ادغام ثبت‌شده توسط خودِ کاربر
  | 'review_customer_merge_queue'      // مشاهده کارتابل کامل درخواست‌های ادغام و تعارض‌های ورود اطلاعات (مدیر داده)
  | 'approve_reject_customer_merge'    // تایید یا رد نهایی درخواست ادغام (فقط مدیر داده)
  | 'select_customer_primary_value'    // انتخاب/تغییر مقدار اصلی نام، شماره، نشانی (فقط مدیر داده/ادمین)
  | 'split_customer_merge'             // جداسازی (Unmerge) یک ادغام انجام‌شده
  | 'view_customer_identity_audit'     // مشاهده تاریخچه Audit هویت، ادغام و جداسازی
  | 'review_customer_entry_conflict'   // بررسی و تعیین‌تکلیف تعارض‌های ورود خودکار اطلاعات (مدیر داده)
  | 'submit_customer_purchase_claim'   // ثبت ادعای خرید/مبلغ پیشین مشتری
  | 'review_customer_purchase_claim_data'      // بررسی مرحله اول (هویتی/داده‌ای) ادعای خرید — مدیر داده
  | 'review_customer_purchase_claim_financial' // بررسی مرحله دوم (مالی) و ثبت مبلغ قطعی ادعای خرید
  | 'update_customer_contact_status'  // ثبت نتیجه تماس/شنود روی وضعیت تماس مشتری
  // --- صف فروش و ثبت تماس (فاز فروش تا ثبت فاکتور، Commit 3) ---
  | 'view_sales_queue'          // مشاهده و کار روی صف عملیاتی Lead های شخصی فروشنده
  | 'log_call_outcome'          // ثبت نتیجهٔ تماس با Lead (Adapter — بدون اتصال واقعی Issabel)
  // --- کاتالوگ کالا/خدمت/پروموشن (فاز فروش تا ثبت فاکتور، Commit 4) ---
  | 'manage_products'           // مدیریت کاتالوگ کالا
  | 'view_purchase_price'       // مشاهده قیمت خرید/بهای تمام‌شده (فقط ادمین/مجوز صریح)
  | 'manage_services'           // مدیریت کاتالوگ خدمت
  | 'manage_promotions'         // مدیریت پروموشن
  | 'view_promotions'           // مشاهده پروموشن‌های فعال برای فروش
  // --- فاکتور فروش و پرداخت اعلامی (فاز فروش تا ثبت فاکتور، Commit 5) ---
  | 'create_sales_invoice'              // ایجاد فاکتور فروش (مستقیم توسط فروشنده)
  | 'view_own_invoices'                 // مشاهده فاکتورهای خودِ فروشنده
  | 'view_team_invoices'                // مشاهده فاکتورهای زیرمجموعه (سرپرستی فروش)
  | 'edit_invoice_draft'                // ویرایش فاکتور در وضعیت Draft
  | 'record_declared_payment'           // ثبت ردیف پرداخت اعلامی (هنوز تاییدنشدهٔ بانکی)
  | 'submit_invoice_for_financial_review' // ارسال فاکتور برای بررسی مالی
  | 'return_invoice_to_salesperson'     // عودت فاکتور دارای ایراد به فروشنده/سرپرست
  // --- ثبت به نمایندگی و Import گروهی فاکتور (فاز فروش تا ثبت فاکتور، Commit 6) ---
  | 'register_invoice_on_behalf'        // ثبت فاکتور به نمایندگی فروشنده (واحد ثبت)
  | 'bulk_import_invoices'              // Import گروهی فاکتور از اکسل
  | 'submit_sales_invoice_to_supervisor' // ارسال فاکتور کامل‌شده مستقیم به سرپرست Snapshot‌شده
  // --- چرخهٔ واقعی فاکتور ترکیبی: بررسی ثبت، تأیید مالی، اجرا (مأموریت تکمیلی) ---
  | 'submit_invoice_for_registration_review' // ارسال Draft برای بررسی واحد ثبت
  | 'approve_invoice_registration'      // تأیید ثبت فاکتور ارسال‌شده توسط فروشنده (واحد ثبت)
  | 'review_invoice_financial_confirmation' // کارتابل تأیید مالی فروش — تصمیم ردیفی روی پرداخت‌ها
  | 'view_sales_financial_queue'             // مشاهدهٔ صف مالی فروش در قلمرو مجاز
  | 'claim_sales_financial_review'           // Claim پروندهٔ مالی از صف مشترک/تخصیص‌یافته
  | 'decide_sales_declared_payment'          // تعیین تکلیف ردیف پرداخت اعلامی
  | 'return_sales_invoice_financial_correction' // عودت دلیل‌دار فاکتور از مالی برای اصلاح
  | 'manage_sales_financial_distribution'    // تنظیم روش توزیع و تخصیص پرونده‌های مالی
  | 'release_sales_financial_hold'            // رفع توقف مشکوک فقط با تصمیم مدیر مالی فروش
  | 'dispatch_product_case'             // آماده‌سازی/ارسال پروندهٔ اجرای کالا
  | 'deliver_product_case'              // تحویل پروندهٔ اجرای کالا به مشتری
  | 'manage_service_fulfillment_assignment' // دریافت/ارجاع/بازبینی/بستن پروندهٔ خدمت (مدیر پروژه)
  | 'execute_service_fulfillment_case'      // تماس/انتظار/مدرک/ارسال نتیجهٔ پروندهٔ شخصی (کارشناس)
  // --- چرخهٔ عمر نیروی فروش، انتقال، قفل انتصاب، تأیید سرپرست فاکتور (بند ۲۱ AGENTS.md) ---
  | 'manage_sales_users'                    // مدیریت کاربران فروش (ایجاد/غیرفعال‌سازی/بایگانی) — مستقل از مالی/خزانه
  | 'manage_sales_branches_and_chains'      // مدیریت شعب فروش و زنجیره‌های ثابت داخل شعبه
  | 'request_salesperson_transfer'          // ثبت درخواست جابه‌جایی فروشنده — فقط سرپرست مستقیم فعلی
  | 'review_salesperson_transfer'           // بررسی/تأیید/رد/تعیین مقصد درخواست انتقال — مدیر کاربران فروش
  | 'correct_unused_sales_assignment'       // اصلاح انتصاب پیش از اولین استفادهٔ مؤثر (with Audit)
  | 'execute_due_sales_transfers'           // اجرای دستی/Trigger انتقال‌های زمان‌بندی‌شدهٔ سررسیده
  | 'view_archived_sales_workspace'         // مشاهدهٔ نمای بایگانی‌شدهٔ نیروی غیرفعال فروش
  | 'add_archived_sales_note'               // ثبت یادداشت مدیریتی Append-only روی پروندهٔ بایگانی‌شده
  | 'emergency_correct_sales_assignment'    // اصلاح اضطراری انتصاب استفاده‌شده — فقط Super Admin
  // مجوز مستقل تأیید سرپرست فاکتور (بدهی #۲ مأموریت جاری) — پیش‌تر این گام فقط با تطبیق هویت
  // (کاربر جاری = سرپرست محاسبه‌شده) کنترل می‌شد، بدون هیچ Permission واقعی؛ این مجوز جدید و
  // مستقل، مستقیماً کنار همان تطبیق هویت در Gate واحد (resolveSupervisorApprovalGate) اعمال
  // می‌شود، نه جایگزین آن.
  | 'approve_sales_invoice_supervisor_step'
  // --- تکمیل فلو فاکتور: هماهنگی پیش از مالی + پس‌گرفتن/عودت رسمی برای اصلاح (مأموریت تکمیل فلو نهایی فاکتور) ---
  | 'recall_invoice_for_correction'    // پس‌گرفتن خودِ فروشنده/ثبات پیش از اولین اقدام رسمی واحد بعد
  | 'return_invoice_for_correction'    // عودت رسمی دلیل‌دار از هماهنگی به فروشنده/ثبات
  | 'view_coordination_queue'          // مشاهده کارتابل هماهنگی (مدیر: کل قلمرو، مسئول: فقط تخصیص‌یافته)
  | 'assign_coordination_case'         // تخصیص پرونده هماهنگی به یک مسئول — فقط مدیر هماهنگی
  | 'claim_coordination_case'          // Claim پروندهٔ تخصیص‌یافته به خود — مسئول هماهنگی
  | 'record_coordination_attempt'      // ثبت تلاش/نتیجهٔ تماس هماهنگی (Append-only)
  | 'approve_coordination'             // تأیید هماهنگی — ورود فاکتور به تأیید مالی
  | 'escalate_coordination_case'       // ارجاع پرونده هماهنگی به مدیر
  | 'manage_coordination_distribution' // انتخاب روش توزیع صف هماهنگی — فقط مدیر هماهنگی
  | 'bypass_coordination_without_contact'; // عبور انتخابی مدیر بدون تماس؛ دلیل اجباری و مستقل از تأیید مشتری

// دامنهٔ سازمانی نقش — صرفاً برای گروه‌بندی/فیلتر در پنل «نقش‌ها و دسترسی‌ها» و برای تصمیم‌های
// نمایشی UI (مثل نمایش/عدم‌نمایش بخش مالی و خزانه در فرم کاربر)؛ هرگز منبع تصمیم Permission
// نیست. 'sales_finance' عمداً از 'treasury' مستقل است (تأیید مالی واریزی فروش، نه خزانه‌داری عمومی).
export type SystemRoleDomain =
  | 'system' | 'treasury' | 'sales' | 'sales_finance' | 'data' | 'advertising'
  | 'registration' | 'monitoring' | 'after_sales' | 'fulfillment' | 'general' | 'coordination';

export interface SystemRole {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystemRole?: boolean; // System roles cannot be deleted
  permissions: SystemPermission[];
  userCount?: number;
  // Organizational level within a hierarchy (e.g. sales org: 1=فروشنده ... 5=معاونت فروش) —
  // display/reporting only, never a source of permission by itself.
  organizationalLevel?: number;
  // Which role ids are the "normal" upward reporting targets for a user in this role. برای
  // پنج نقش سلسله‌مراتب فروش، این فهرست واقعاً در src/utils/salesOrgStructure.ts's
  // validateSalesAssignment مصرف می‌شود (نه صرفاً تزئینی)؛ برای بقیهٔ نقش‌ها هنوز فقط اطلاعاتی است.
  allowedParentRoleIds?: string[];
  // 'infrastructure_ready' = role/permissions exist but no operational page/flow yet
  // (e.g. future logistics/delivery roles) — never grant sensitive permissions to these.
  implementationStatus?: 'active' | 'infrastructure_ready';
  // دامنهٔ سازمانی — نگاه کنید به توضیح SystemRoleDomain بالا.
  domain?: SystemRoleDomain;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  phone: string;
  email: string;
  role: UserRole;
  roleId?: string; // Link to custom SystemRole
  roleTitle: string;
  companyId?: string;
  costCenterId?: string;
  allowedCostCenterIds?: string[]; // Multiple cost centers / branches this approver/user is authorized for
  customPermissions?: SystemPermission[]; // Individual user permission overrides
  isActive: boolean;
  avatarUrl?: string;
  password?: string;
  
  // Custom Task & Directive Permissions set by Admin
  canCreateRequests?: boolean; // آیا مجاز به ایجاد و ثبت درخواست پرداخت جدید است (مستقل از نقش اصلی)
  canIssueTasks?: boolean; // آیا مجاز به صدور و ارجاع دستورات اداری به دیگران است (صادرکننده)
  canExecuteTasks?: boolean; // آیا مجاز به دریافت و انجام کارهای محوله است (مجری)
  
  // Custom Workflow Routing set by Admin
  allowedApproverIds?: string[]; // IDs of approvers this user can send requests to
  approvalChain?: string[]; // Step-by-step user IDs approval sequence (e.g. [step1, step2, step3])
  allowDirectToTreasury?: boolean; // Can send directly to Treasury Manager (Reza Bayat)
  workflowNote?: string; // Admin notes/rules for this user's execution flow

  // Dual-role: this user is simultaneously a requestor AND an approver (set by Admin only)
  isDualRole?: boolean;
  // Marks the single user who is the senior treasury supervisor - the mandatory
  // destination for self-submitted requests of dual-role users
  isSeniorTreasurySupervisor?: boolean;

  // Multi-role access model: extra SystemRole ids granted to this user on top of
  // their base role/roleId (see getEffectiveUserPermissions in utils/permissions.ts)
  additionalRoleIds?: string[];
  // Per-user, per-role permission overrides: for a given roleId, fully replaces that
  // role's permission list (from base role or an additionalRoleIds entry) for this user only
  roleAccessOverrides?: { roleId: string; permissions: SystemPermission[] }[];

  // Sales hierarchy supervisor chain (سرپرست فروش این کاربر) — completely independent of
  // the treasury approvalChain/allowedApproverIds above; used only by src/utils/salesHierarchy.ts
  // to compute which customers a salesperson/supervisor can see.
  salesSupervisorId?: string;

  // Explicit permission denial: subtracted from the union of role/customPermissions in
  // getEffectiveUserPermissions (src/utils/permissions.ts) — deny always wins over allow.
  deniedPermissions?: SystemPermission[];

  // General organizational supervisor chain (used for Archive territory visibility via
  // src/utils/orgHierarchy.ts) — completely independent of salesSupervisorId (sales-only)
  // and approvalChain/allowedApproverIds (treasury approval routing only). This is who this
  // user "reports to" for org-hierarchy/territory purposes, nothing else.
  reportsToUserId?: string;

  // Per-role scope assignment: for a given roleId, how wide this user's data visibility is
  // under that role (see RoleAssignmentScope). Missing entry for a role = 'own' by default —
  // never a silent broader fallback. Computed by src/utils/orgHierarchy.ts:computeVisibleUserIds.
  roleScopes?: { roleId: string; scope: RoleAssignmentScope }[];

  // قلمرو مدیر پروژهٔ خدمات (role_service_project_manager) بر اساس ServiceFulfillmentCase.responsibleUnit
  // — غایب/خالی یعنی بدون محدودیت واحد (سازگار با نصب‌های قبلی، تک-مدیرپروژه‌ای)؛ وقتی مقداردهی
  // شود، فقط پرونده‌های همان واحد(ها) در کارتابل «ارجاع به من» دیده/قابل‌ادعا می‌شوند — طراحی از
  // روز اول چند مدیر پروژهٔ هم‌زمان با واحدهای متفاوت را پشتیبانی می‌کند.
  responsibleUnits?: string[];
}

// Data-visibility scope attached to a specific role assignment. 'own' is always the default
// when no explicit scope is set for a role — 'company'/'branch' only ever apply when an
// admin has explicitly assigned them (never an automatic/implicit fallback).
export type RoleScopeType = 'own' | 'direct_reports' | 'subtree' | 'company' | 'branch';
export interface RoleAssignmentScope {
  scopeType: RoleScopeType;
  companyId?: string;   // required context when scopeType === 'company'
  costCenterId?: string; // required context when scopeType === 'branch'
}

// Impersonation audit trail (Admin → user "login as"). One entry per session: startedAt is
// set when impersonation begins, endedAt when it ends (exit or full logout).
export interface ImpersonationLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  targetUserId: string;
  targetUserName: string;
  startedAt: string;
  endedAt?: string;
}

// Generic audit trail for security/finance-sensitive operations (impersonation lifecycle,
// normal + emergency payment referral/execution). Intentionally NOT a full app-wide audit
// log — see docs/BUSINESS_RULES.md for the documented scope boundary.
export interface AuditLogEntry {
  id: string;
  action: string; // e.g. 'impersonation_start', 'payment_referred', 'emergency_payment_executed'
  effectiveUserId: string;   // who the action appears to be performed by (currentUser at the time)
  effectiveUserName: string;
  impersonatorAdminId?: string; // set only if the effectiveUser was being impersonated by an admin
  impersonatorAdminName?: string;
  effectiveRoleId?: string; // which of the user's active roles granted the permission used
  targetId?: string; // e.g. paymentRequest id, target user id
  details?: string;
  timestamp: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface CompanyBankAccount {
  id: string;
  companyId: string;
  companyName: string;
  bankName: string;         // نام بانک (ملت، ملی، سامان، پاسارگاد، پارسیان، تجارت، ...)
  accountNumber: string;    // شماره حساب بانکی
  shebaNumber: string;      // شماره شبا ۲۴ رقمی
  cardNumber?: string;      // شماره کارت ۱۶ رقمی
  accountTitle: string;     // عنوان یا نوع حساب (مثلا: حساب درآمدی اصلی، حساب مسدودی درگاه، ...)
  isActive: boolean;
}

export interface CostCenter {
  id: string;
  companyId: string;
  name: string;
  code: string;
  description?: string;
  monthlyBudget?: number; // بودجه مصوب ماهانه به ریال
  budgetPeriod?: string;  // دوره بودجه (مثلاً مرداد ۱۴۰۳)
}

export interface Vendor {
  id: string;
  name: string;             // نام تجاری / فروشگاه / شرکت
  category: string;         // گروه (تجهیزات، شوینده، اداری، خدمات فنی، ...)
  companyId?: string;       // شرکت مربوطه (کدام شرکت داخلی این ذینفع را مدیریت می‌کند)
  companyName?: string;     // نام شرکت مربوطه (برای نمایش سریع)
  nationalCode?: string;    // کد ملی / شناسه ملی
  economicCode?: string;    // کد اقتصادی
  shebaNumber: string;      // شماره شبا (مثلاً IR120170000000123456789012)
  cardNumber?: string;      // شماره کارت ۱۶ رقمی
  accountNumber?: string;   // شماره حساب بانکی
  bankName: string;         // نام بانک (ملت، ملی، پاسارگاد، سامان، تجارت، صادرات، ...)
  accountHolderName: string; // نام و نام خانوادگی کامل صاحب حساب
  phone: string;            // شماره تماس
  address?: string;         // آدرس
  totalPaid?: number;       // مجموع واریزی‌های تاریخی
  transactionCount?: number; // تعداد تراکنش‌ها
  notes?: string;           // یادداشت خزانه‌داری
}

export interface VendorCategory {
  id: string;
  name: string; // دسته‌بندی / زمینه فعالیت
}

export type RequestType = 'current_payment' | 'advance_payment' | 'info_request' | 'customer_refund';

// ============================================================
// سامانه نامه‌نگاری داخلی (دبیرخانه)
// ============================================================

export type LetterStatus =
  | 'draft'            // پیش‌نویس
  | 'in_review'        // در حال بررسی
  | 'needs_correction' // نیاز به اصلاح
  | 'approved'         // تایید شده
  | 'sent'             // ارسال شده
  | 'seen'             // مشاهده شده
  | 'replied'          // پاسخ داده شده
  | 'archived'         // بایگانی شده
  | 'cancelled';        // لغو شده

export interface LetterAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface LetterSignature {
  userId: string;
  fullName: string;
  roleTitle: string;
  date: string; // تاریخ
  time: string; // ساعت
}

export interface LetterVersion {
  version: number; // V1, V2, V3...
  subject: string;
  body: string;
  editedAt: string;
  editedById: string;
  editedByName: string;
  note?: string; // چه اصلاحی انجام شد
}

export interface LetterForwardRecord {
  id: string;
  toUserId: string;
  toUserName: string;
  byUserId: string;
  byUserName: string;
  at: string;
  note?: string;
}

export interface LetterSeenRecord {
  userId: string;
  userName: string;
  at: string;
}

export interface LetterTimelineStep {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: 'created' | 'status_changed' | 'forwarded' | 'replied' | 'seen' | 'versioned' | 'archived' | 'cancelled' | 'commented' | 'signed';
  actionTitle: string;
  comment?: string;
  timestamp: string;
}

export interface Letter {
  id: string;
  letterNumber: string; // شماره نامه - خودکار، مثال: L1001
  threadId: string;      // شناسه گفتگو - نامه ریشه یا خودش اگر ریشه است
  parentLetterId?: string; // اگر این نامه پاسخ به نامه دیگری است

  date: string;  // تاریخ نامه - پیش‌فرض امروز
  time: string;

  subject: string;
  toUnit: string;      // به - واحد گیرنده (دستی)
  toUserId?: string;    // گیرنده مشخص (در صورت ارجاع به شخص)
  toUserName?: string;

  fromUserId: string;
  fromUserName: string;
  fromRoleTitle: string;

  body: string;
  tags: string[];
  attachments: LetterAttachment[];

  status: LetterStatus;
  currentVersion: number;
  versions: LetterVersion[];

  signature?: LetterSignature;
  forwardHistory: LetterForwardRecord[];
  seenBy: LetterSeenRecord[];
  timeline: LetterTimelineStep[];

  createdAt: string;
  updatedAt: string;
}

export type SupportContactType = 'تلفنی' | 'حضوری' | 'پیامکی' | 'آنلاین' | 'ایمیل';
export type SupportReasonType = 'فعال‌سازی' | 'انصراف و عودت وجه' | 'قطع خدمات' | 'شکایت کیفیت' | 'سایر';
export type SupportPriority = 'normal' | 'urgent' | 'critical';
export type SupportCaseStatus = 'open' | 'in_review' | 'needs_correction' | 'closed';
export type SupportSatisfaction = 'satisfied' | 'unsatisfied' | 'neutral';

export type SupportTransactionStatus =
  | 'pending_financial_approval' // در انتظار تایید مالی
  | 'approved_pending_send'      // تایید شد ولی هنوز به خزانه ارسال نشده (کارشناس تایید مالی می‌تواند دسته‌ای ارسال کند)
  | 'financial_approved'         // ارسال شد - در کارتابل خزانه
  | 'financial_rejected'         // رد شده توسط تایید مالی
  | 'needs_correction'           // نیاز به اصلاح توسط پشتیبان
  | 'pending_treasury_payment'   // در کارتابل خزانه (لینک به PaymentRequest)
  | 'paid';                      // پرداخت‌شده

export interface SupportTimelineStep {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: 'created' | 'transaction_added' | 'financial_approved' | 'financial_rejected' | 'needs_correction' | 'sent_to_treasury' | 'paid' | 'commented' | 'case_closed';
  actionTitle: string;
  comment?: string;
  timestamp: string;
}

export interface SupportCustomField {
  id: string;
  label: string;
  value: string;
}

export interface SupportTransactionRow {
  id: string;
  invoiceCode: string;
  invoiceDate: string;
  totalInvoiceAmount: number;
  preDepositAmount?: number;
  preDepositDate?: string;
  preDepositTime?: string;
  destAccountLast4?: string;
  destAccountCompanyName?: string;
  sourceAccountLast4?: string;
  sourceAccountHolderName?: string;
  customerRefundCardNumber?: string;
  customerRefundShebaNumber: string;
  description?: string;
  totalDeductions?: number;
  litigationCost?: number;
  extraCost?: number;
  doorDeliveryAmount?: number; // مبلغ واریزی درب منزل (اضافه می‌شود به جمع مبلغ عودتی)
  finalRefundAmount: number; // خودکار محاسبه می‌شود: کل فاکتور - کسورات + هزینه دادرسی + هزینه مازاد + واریزی درب منزل
  refundCorrection?: string;
  refundDateAnnouncedToCustomer?: string;
  customFields?: SupportCustomField[]; // فیلدهای سفارشی که کاربر پشتیبانی خودش اضافه می‌کند

  status: SupportTransactionStatus;
  financialApproverId?: string;
  financialApproverName?: string;
  financialApproverNote?: string;
  financialActionAt?: string;

  // Link to the payment created in the existing treasury flow once approved
  paymentRequestId?: string;
  paymentRequestTrackingCode?: string;
  paidAt?: string;
}

export interface SupportCase {
  id: string;
  trackingCode: string; // e.g. S50001
  createdAt: string; // تاریخ و ساعت و ثانیه ثبت - خودکار
  operatorId: string;
  operatorName: string;

  customerFullName: string;
  customerPhone: string;
  province: string;
  city: string;
  address?: string;

  contactType: SupportContactType;
  reasonForContact: SupportReasonType;
  complaintDetail?: string;
  complaintReference?: string;
  complaintStatus: SupportCaseStatus;
  accountBlocked?: boolean; // مشتری با ثبت شکایت (فتا، آگاهی و...) موجب مسدودی حساب(های) شرکت گردیده است
  blockedAccountCompanyIds?: string[]; // کدام شرکت‌ها/پلتفرم‌ها حساب بانکی‌شان مسدود گردیده است
  blockedAccountCompanyNames?: string[]; // نام شرکت‌ها جهت نمایش سریع
  blockedBankAccountIds?: string[]; // شناسه شماره حساب‌های بانکی مسدودشده شرکت
  blockedBankAccounts?: CompanyBankAccount[]; // جزییات شماره حساب‌های بانکی مسدودشده شرکت جهت نمایش کامل در پرونده
  assignedRepresentative?: string;
  referrerName?: string;
  referralDate?: string;
  previousSupportHistoryNote?: string;

  salesPersonName?: string;
  callCenterName?: string;
  seniorSupervisorName?: string;
  salesManagerName?: string;
  branchId?: string;
  branchName?: string;
  dataType?: string;
  promotionType?: string;
  priority: SupportPriority;
  attachments: AttachmentFile[];

  callResult?: string;
  satisfactionStatus?: SupportSatisfaction;
  completedAt?: string;

  transactions: SupportTransactionRow[];
  timeline: SupportTimelineStep[];
  status: SupportCaseStatus;
}

export type RequestStatus =
  | 'pending_approval'        // در انتظار تایید
  | 'returned'                // عودت داده شده / نیاز به اصلاح
  | 'approved_awaiting_payment_assignment' // تایید مالی نهایی شد، هنوز به هیچ مسئول پرداختی ارجاع نشده
  | 'approved_pending_payment'// ارجاع شده به یک مسئول پرداخت مشخص - در انتظار واریز
  | 'emergency_pending_payment' // ارجاع‌شده به مسیر پرداخت فوری (بدون تایید کامل زنجیره عادی)
  | 'paid'                    // واریز شده (دارای فیش)
  | 'completed'               // اتمام کار
  | 'cancelled'                // لغو شده توسط درخواست‌کننده (بایگانی می‌ماند، حذف فیزیکی نمی‌شود)
  | 'rejected';               // رد شده

export interface AttachmentFile {
  id: string;
  name: string;
  url: string; // Data URL or Image placeholder
  type: string;
  size: number;
  uploadedAt: string;
}

export interface RequestTimelineStep {
  id: string;
  actorId?: string;
  actorName: string;
  actorRole: string;
  action: 'submitted' | 'forwarded' | 'returned' | 'rejected' | 'approved' | 'paid' | 'completed' | 'commented' | 'undone'
    | 'referred_for_payment' | 'referred_for_emergency_payment' | 'emergency_paid' | 'cancelled'
    | 'cleanup_requested' | 'cleanup_approved';
  actionTitle: string;
  comment?: string;
  nextActorName?: string;
  timestamp: string;
  reverted?: boolean; // true if this approval/forward step was later undone by its actor
  amountCorrectionNote?: string; // set when the approver corrected the request amount during this step (old → new)
}

export interface RequestBatchItemChangeEntry {
  field: string;
  oldValue: string;
  newValue: string;
  byUserId: string;
  byName: string;
  at: string;
}

export interface RequestBatchItem {
  id: string;
  title: string;
  // amount stays as the row's live/current amount for backward compatibility with every
  // existing sum-over-batchItems call site; originalAmount/currentAmount are the new
  // audit-trail-friendly names — currentAmount is always kept equal to amount.
  amount: number;
  amountInWords: string;
  destinationName: string;
  destinationCard: string; // شماره کارت یا شبا ذینفع این ردیف
  status: 'pending' | 'approved' | 'rejected';
  decidedByUserId?: string;
  decidedByName?: string;
  decidedAt?: string;
  rejectionReason?: string;

  // Row-level correction audit trail (Business rule: approver may correct a row's amount
  // before approving it; every correction is recorded here, never silently overwritten).
  originalAmount?: number; // set once, at row creation — never changes afterward
  currentAmount?: number;  // mirrors `amount`; kept for explicit naming in new code paths
  amountCorrectedByUserId?: string;
  amountCorrectedByName?: string;
  amountCorrectedAt?: string;
  amountCorrectionReason?: string;
  changeHistory?: RequestBatchItemChangeEntry[];
}

export interface CostCenterAllocation {
  id: string;
  companyId: string;
  companyName: string;
  costCenterId: string;
  costCenterName: string;
  amount: number; // مبلغ تخصیص داده شده به این شرکت/مرکز هزینه (به ریال)
  description?: string; // بابت یا توضیح اختصاصی برای این مرکز هزینه
}

export interface PaymentRequest {
  id: string;
  trackingCode: string; // e.g. K50001, K50002
  title: string;
  requestType: RequestType;
  companyId: string;
  companyName: string;
  costCenterId: string;
  costCenterName: string;

  // تقسیم بین چند مرکز هزینه / چند شرکت
  isMultiCostCenter?: boolean;
  costCenterAllocations?: CostCenterAllocation[];

  amount: number; // in Rials
  amountInWords: string; // به حروف
  destinationCardNumber: string;
  destinationAccountName: string;
  destinationSheba?: string; // شماره شبا برای واریز گروهی پایا/ساتنا
  destinationBankName?: string; // نام بانک دریافت‌کننده
  vendorId?: string; // لینک به دفترچه ذینفعان
  vendorName?: string; // نام فروشنده مربوطه
  description: string;
  
  requestorId: string;
  requestorName: string;
  requestorPhone: string;
  
  currentApproverId: string;
  currentApproverName: string;
  currentApproverPhone?: string;
  
  status: RequestStatus;
  createdAt: string; // e.g. 1403/05/10 - 14:30
  updatedAt: string;
  
  initialAttachments: AttachmentFile[]; // تصاویر فاکتورها / صورت‌حساب
  paymentReceiptAttachment?: AttachmentFile; // عکس فیش واریزی
  
  timeline: RequestTimelineStep[];
  returnReason?: string;
  rejectionReason?: string;
  cancellationRequested?: boolean;
  cancellationReason?: string;
  delegatedToExecutorId?: string;
  delegatedToExecutorName?: string;

  // Set when this payment originated from an after-sales refund (خدمات پس از فروش)
  sourceSupportCaseId?: string;
  sourceSupportCaseTrackingCode?: string;
  sourceSupportTransactionId?: string;
  sourceCustomerName?: string;

  // Generic issuing-unit tracking (complements the support-case-specific quartet above,
  // does not replace it) — used by the treasury "مرجع صادرکننده" filter and by
  // src/utils/treasurySourceView.ts to build the minimal treasury-safe view of a request.
  sourceType?: 'support_refund' | 'sales_invoice' | 'manual';
  sourceUnitId?: string;
  sourceUnitName?: string;
  sourceReferenceId?: string;

  // ردیف‌های درخواست تجمیعی (چند فاکتور/ذینفع در یک درخواست)
  batchItems?: RequestBatchItem[];

  // Explicitly recorded when a payment was marked paid with no uploaded receipt image —
  // never a fake/placeholder image; the UI shows this flag instead of a photo.
  paidWithoutReceipt?: boolean;

  // --- مسیر پرداخت فوری (بدون تایید کامل زنجیره عادی) ---
  isEmergencyPayment?: boolean;
  emergencyReason?: string;
  emergencyReferredByUserId?: string;
  emergencyReferredByName?: string;
  emergencyReferredAt?: string;

  // --- لغو (وضعیت 'cancelled') — هرگز به معنای حذف فیزیکی از آرایه requests نیست ---
  cancelledByUserId?: string;
  cancelledByName?: string;
  cancelledAt?: string;

  // --- درخواست/تایید پاکسازی — فقط پرچم؛ در این فاز هیچ عملیاتی رکورد را فیزیکی حذف نمی‌کند ---
  cleanupRequested?: boolean;
  cleanupRequestedByUserId?: string;
  cleanupRequestedByName?: string;
  cleanupRequestedAt?: string;
  cleanupApproved?: boolean;
  cleanupApprovedByUserId?: string;
  cleanupApprovedByName?: string;
  cleanupApprovedAt?: string;
}

export interface WorkflowStepRule {
  id: string;
  stepName: string;
  approverUserId: string;
  approverName: string;
  approverRole: string;
  order: number;
  isDirectToTreasuryAllowed: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  timestamp: string;
  requestId?: string;
  requestTrackingCode?: string;
}

export interface SystemNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  requestId?: string;
  trackingCode?: string;
  colleagueId?: string; // if set, this notification is about a new direct message from this user
  isRead: boolean;
  createdAt: string;
}

export interface DirectMessageAttachment {
  name: string;
  mimeType: string;
  size: number; // bytes
  dataUrl: string; // base64 data URL
  isVoice?: boolean;
  durationSeconds?: number; // for voice notes
}

export interface DirectMessage {
  id: string;
  conversationId: string; // deterministic: [userIdA, userIdB].sort().join('__')
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  content: string; // may be empty if the message is attachment-only
  attachment?: DirectMessageAttachment;
  timestamp: string;
  readAt?: string | null;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected';
export type TaskPriority = 'normal' | 'urgent' | 'immediate';

export interface TaskLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  actionTitle: string;
  detail?: string;
  timestamp: string;
}

export interface TaskMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  letterNumber?: string;
  letterDate?: string;
  timestamp: string;
}

export interface AssignedTask {
  id: string;
  taskNumber: string; // e.g., T1001
  title: string;
  description: string;
  assignerId: string;
  assignerName: string;
  assignerRole: string;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  letterNumber?: string;
  letterDate?: string;
  messages: TaskMessage[];
  logs: TaskLogEntry[];
}

// ============================================================
// ماژول فروش (گام اول): مشتری با قفل مالکیت پویا و دید سلسله‌مراتبی
// ============================================================

export interface CustomerActivityLogEntry {
  id?: string; // افزوده‌شده برای ارجاع پایدار از Snapshot/transferredValueIds هنگام Merge/Split — رکوردهای قدیمی بدون id هم معتبرند
  salespersonId: string;
  invoiceId?: string; // در فاز بعدی (فاکتور فروش) پر می‌شود؛ در این گام هنوز فاکتوری وجود ندارد
  startedAt: string;
  status: 'active' | 'completed';
}

// ============================================================
// پروفایل یکپارچه مشتری — مدل چندمقداری، وضعیت‌های چندبعدی، ادغام/جداسازی (فاز ۱ CRM)
// همه‌چیز افزودنی روی Customer موجود است؛ هیچ فیلد قدیمی حذف/rename نشده.
// ============================================================

// --- سه بُعد کاملاً مستقل از یکدیگر — هرگز با هم قاطی/ادغام نشوند ---
// «بدون اقدام» به عملکرد فروشنده/صف روزانه مربوط است (pending_action/overdue_no_action)؛
// «ممنوع از تماس» یک محدودیت مستقل مشتری است (CustomerContactPermissionStatus).
export type CustomerSalesOperationStatus = 'free' | 'active_cycle' | 'pending_action' | 'overdue_no_action' | 'completed';
export type CustomerContactPermissionStatus = 'allowed' | 'temporarily_blocked' | 'do_not_contact';
export type CustomerComplaintStatus = 'none' | 'active' | 'cooldown' | 'released';

export type CustomerIdentityStatus = 'complete' | 'incomplete' | 'pending_merge_review' | 'has_conflict';
export type CustomerFinancialStatus = 'reconciled' | 'has_discrepancy' | 'under_review';
// «آخرین تماس به نتیجه رسید یا نه» — مستقل از CustomerContactPermissionStatus («اصلاً مجاز به تماس هستیم یا نه»)
export type CustomerContactStatus = 'confirmed' | 'no_answer' | 'needs_recall';
export type CustomerSatisfactionStatus = 'unknown' | 'dissatisfied' | 'partially_satisfied' | 'fully_satisfied';

// هر تغییر در این ۴ بُعد باید منبع+رکورد مرتبط+زمان+کاربر داشته باشد و در Timeline دیده شود.
// اصلاح: field همچنین انتخاب مقدار اصلی (نام/تلفن/آدرس، فقط مدیر داده/ادمین) و نتیجهٔ تماس
// (واحد شنود — مستقل از contactPermissionStatus) را پوشش می‌دهد؛ همان زیرساخت Timeline/Audit
// موجود بازاستفاده می‌شود، نه یک مسیر جدید.
export interface CustomerStatusChangeEvent {
  id: string;
  field:
    | 'financialStatus' | 'complaintStatus' | 'contactPermissionStatus' | 'salesOperationStatusOverride'
    | 'contactStatus' | 'primaryNameEntryId' | 'primaryPhoneEntryId' | 'primaryAddressEntryId';
  oldValue?: string;
  newValue: string;
  reason: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  changedByUserId: string;
  changedByName: string;
  changedAt: string;
}

export type CustomerValueSource =
  | 'sales_entry' | 'data_entry_unit' | 'call_monitoring_unit'
  | 'customer_confirmed' | 'data_manager_correction' | 'legacy_migration';

interface CustomerValueEntryBase {
  id: string;
  source: CustomerValueSource;
  recordedAt: string;
  recordedByUserId: string;
  recordedByName: string;
  isCustomerConfirmed: boolean;
  isCurrentPrimary: boolean;
  supersededAt?: string;
}
export interface CustomerPhoneEntry extends CustomerValueEntryBase { value: string; normalizedValue: string; }
export interface CustomerNameEntry extends CustomerValueEntryBase { value: string; normalizedValue: string; }
export interface CustomerAddressEntry extends CustomerValueEntryBase {
  address: string;
  province?: string;
  city?: string;
  postalCode?: string;
  normalizedValue: string;
}

// ثبت خودکار (بدون Merge) هنگام ورود اطلاعات جدید که با بیش از یک پروفایل فعال تطبیق دارد یا
// تعارض جدی نام/آدرس دارد — کارتابل مستقل مدیر داده، جدا از CustomerMergeRequest.
export interface CustomerEntryConflict {
  id: string;
  incomingSource: CustomerValueSource;
  submittedByUserId: string;
  submittedByUserName: string;
  submittedAt: string;
  incomingPhone?: string;
  incomingName?: string;
  incomingAddress?: string;
  conflictingCustomerIds: string[];
  reason: string;
  status: 'pending' | 'resolved_attached' | 'resolved_new_profile' | 'resolved_dismissed';
  resolvedByUserId?: string;
  resolvedByUserName?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export type CustomerMergeMatchType = 'user_flagged_duplicate' | 'exact_phone_similarity' | 'name_address_similarity';
export interface CustomerMatchReason { field: 'phone' | 'name' | 'address'; score: number; note: string; }

// درخواست ادغام دو یا چند پروفایل مستقل و از‌قبل‌موجود — همیشه دستی/انسانی؛ تأیید/رد نهایی فقط مدیر داده.
export interface CustomerMergeRequest {
  id: string;
  requestNumber: string;
  idempotencyKey: string;
  profileIds: string[];
  motherProfileId: string;
  motherProfileReason: string;
  matchType: CustomerMergeMatchType;
  overallScore: number;
  reasons: CustomerMatchReason[];
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedByUserId?: string;
  decidedByUserName?: string;
  decidedAt?: string;
  decisionNote?: string;
}

// Snapshot نسخه‌دار — فقط برای Audit/تشخیص Drift، نه بازیابی (بازیابی از روی نسخهٔ اصلی
// دست‌نخوردهٔ Entry ها روی خودِ پروفایل جذب‌شده انجام می‌شود، نه از این Snapshot).
// طراحی‌شده برای سازگاری با انتقال آیندهٔ به Backend واقعی.
export interface CustomerSnapshot {
  schemaVersion: number;
  customerId: string;
  capturedAt: string;
  baseProfile: {
    fullName?: string; phone1?: string; phone2?: string;
    address?: string; province?: string; city?: string; postalCode?: string; createdAt: string;
  };
  identityValueIds: { phoneEntryIds: string[]; nameEntryIds: string[]; addressEntryIds: string[] };
  relatedRecordIds: { activityLogIds: string[]; claimedPurchaseIds: string[] };
  statusesAtCapture: Partial<Record<
    'identityStatus' | 'financialStatus' | 'complaintStatus' | 'contactPermissionStatus' | 'salesOperationStatusOverride' | 'satisfactionStatus',
    string
  >>;
  operationId: string;
  hash: string; // Hash ساده (نه رمزنگاری‌شده)، فقط برای تشخیص Drift در Prototype
}

export interface CustomerMergeEvent {
  id: string;
  mergeRequestId: string;
  idempotencyKey: string;
  motherProfileId: string;
  mergedProfileIds: string[];
  // دقیقاً همان id هایی که از پروفایل(های) جذب‌شده روی مادر کپی شدند (نه منتقل — نسخهٔ اصلی
  // دست‌نخورده روی پروفایل جذب‌شده می‌ماند)
  transferredValueIds: {
    phoneEntryIds: string[]; nameEntryIds: string[]; addressEntryIds: string[];
    activityLogIds: string[]; claimedPurchaseIds: string[];
  };
  motherProfileReason: string;
  executedByUserId: string;
  executedByUserName: string;
  executedAt: string;
  beforeSnapshot: CustomerSnapshot[];
  afterSnapshot: CustomerSnapshot;
}

export interface CustomerSplitEvent {
  id: string;
  originalMergeEventId: string;
  idempotencyKey: string;
  requestedByUserId: string;
  requestedAt: string;
  decidedByUserId: string;
  decidedByUserName: string;
  decidedAt: string;
  reason: string;
  restoredProfileIds: string[];
  // شناسهٔ Entry ایجادشده روی مادر بعد از زمان Merge → شناسهٔ پروفایل مقصد انتخاب‌شده توسط مدیر داده
  postMergeDataDestinations: Record<string, string>;
  afterSnapshot: CustomerSnapshot[];
}

// ادعای خرید/مبلغ پیشین مشتری — موجودیت کاملاً مستقل از Customer (کارتابل/ارجاع/بررسی
// مستقل، مثل PaymentRequest مستقل از SupportCase)؛ مسیر دومرحله‌ای: داده → مالی.
export type ClaimedPurchaseStatus = 'pending_data_review' | 'pending_financial_review' | 'confirmed' | 'rejected' | 'unverified_closed';
export interface ClaimedPurchase {
  id: string;
  customerId: string;
  claimedAmount: number;
  claimedDescription?: string;
  approximateDate?: string;
  phoneNumberAtPurchase?: string;
  possibleInvoiceNumber?: string;
  evidenceAttachments?: AttachmentFile[];
  submittedByUserId: string;
  submittedByUserName: string;
  submittedAt: string;
  status: ClaimedPurchaseStatus;
  dataManagerResult?: { decision: 'approved' | 'rejected'; byUserId: string; byUserName: string; at: string; note?: string };
  financialResult?: { decision: 'approved' | 'rejected'; byUserId: string; byUserName: string; at: string; confirmedAmount?: number; note?: string };
  // فقط بعد از تایید مرحلهٔ مالی مقداردهی می‌شود — تا آن زمان در هیچ اعتبار/گزارش قطعی/پروموشن/پورسانتی محاسبه نمی‌شود
  finalConfirmedAmount?: number;
}

export interface Customer {
  id: string;
  fullName?: string;
  phone1?: string; // کلید شناسایی یکتای مشتری در کل سیستم — اگر پر شود باید یکتا باشد؛ خودِ فیلد اجباری نیست
  phone2?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  createdAt: string;
  // تاریخچه‌ی کامل همه‌ی چرخه‌های فروش این مشتری با فروشندگان مختلف در طول زمان.
  // مالکیت فعلی مشتری (currentActiveSalespersonId) فیلد ذخیره‌شده نیست؛ از روی همین آرایه
  // با getCurrentActiveSalespersonId در src/utils/salesHierarchy.ts محاسبه می‌شود.
  activityLog?: CustomerActivityLogEntry[];

  // --- پروفایل یکپارچه (فاز ۱ CRM) — همه افزودنی، همه اختیاری برای سازگاری با دادهٔ قدیمی ---
  updatedAt?: string;
  version?: number; // کنترل هم‌زمانی خوش‌بینانه برای عملیات Merge/Split

  phoneEntries?: CustomerPhoneEntry[];
  nameEntries?: CustomerNameEntry[];
  addressEntries?: CustomerAddressEntry[];

  identityStatus?: CustomerIdentityStatus;
  financialStatus?: CustomerFinancialStatus;
  contactStatus?: CustomerContactStatus;
  contactPermissionStatus?: CustomerContactPermissionStatus;
  // فقط زیرساخت فاز ۱ — صف کامل Lead/سررسید در فاز بعد؛ وقتی محاسبهٔ فعلی 'free' باشد،
  // اگر این مقدار ست شده باشد جایگزین نمایش می‌شود (getCustomerSalesOperationStatus در salesHierarchy.ts)
  salesOperationStatusOverride?: 'pending_action' | 'overdue_no_action' | 'completed';
  complaintStatus?: CustomerComplaintStatus;
  complaintCooldownEndsAt?: string;
  satisfactionStatus?: CustomerSatisfactionStatus;
  statusChangeHistory?: CustomerStatusChangeEvent[];

  // ادغام/جذب — پروفایل جذب‌شده هرگز حذف/خالی نمی‌شود، فقط این دو فیلد می‌گیرد
  mergedIntoCustomerId?: string;
  isAbsorbed?: boolean;
}

// ============================================================
// مخزن داده خام و Import — فاز فروش تا ثبت فاکتور (بند ۵-۶ مأموریت)
// RawContact هرگز Customer یا Lead نیست؛ فقط بعد از تشخیص هویت (resolveIncomingCustomerData
// در customerIdentity.ts — بازاستفاده، نه بازسازی) به یک پروفایل مشتری وصل یا پروفایل جدید
// می‌سازد؛ تبدیل به Lead یک تصمیم جداگانه (بند ۷) است. هیچ رکوردی هرگز فیزیکی حذف نمی‌شود.
// ============================================================
export type RawContactStatus =
  | 'new' | 'matched_customer' | 'created_customer' | 'identity_conflict'
  | 'eligible_for_campaign' | 'converted_to_lead' | 'invalid_phone'
  | 'wrong_number' | 'excluded' | 'archived';

export interface RawContact {
  id: string;
  primaryPhoneNormalized: string;
  primaryPhoneRaw: string;
  otherPhones?: string[];
  probableName?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  nationalCodeOptional?: string;
  probablePurchaseHistory?: string;
  sourceFile: 'manual' | 'excel';
  sourceFileName?: string;
  sourceRowNumber?: number;
  campaignId?: string;
  importedAt: string;
  importedByUserId: string;
  importedByUserName: string;
  importJobId?: string;
  status: RawContactStatus;
  linkedCustomerId?: string;
  linkedConflictId?: string;
  linkedLeadId?: string;
  rejectionOrErrorReason?: string;
  tags?: string[];
  notes?: string;
}

export type ImportJobRowOutcome = 'created' | 'attached' | 'conflict' | 'invalid_phone' | 'duplicate_in_file' | 'error';
export interface ImportJobRowResult {
  rowIndex: number;
  outcome: ImportJobRowOutcome;
  rawContactId?: string;
  customerId?: string;
  conflictId?: string;
  errorMessage?: string;
}

// Idempotency: idempotencyKey تکراری یعنی این فایل/دسته قبلاً Import شده — دوباره اجرا نمی‌شود.
export interface ImportJob {
  id: string;
  idempotencyKey: string;
  sourceType: 'manual' | 'excel';
  fileName?: string;
  campaignId?: string;
  importedByUserId: string;
  importedByUserName: string;
  importedAt: string;
  totalRows: number;
  createdCount: number;
  attachedCount: number;
  conflictCount: number;
  invalidPhoneCount: number;
  duplicateInFileCount: number;
  errorCount: number;
  rows: ImportJobRowResult[];
}

// ============================================================
// کمپین و Lead — فاز فروش تا ثبت فاکتور (بند ۷-۸ مأموریت). Lead فقط وقتی ساخته می‌شود که
// تماس/داده علاقهٔ خرید واقعی نشان داده باشد — نه هر RawContact/تعامل خامی.
// ============================================================
export type CampaignChannelType = 'sms' | 'call' | 'social' | 'web_form' | 'referral' | 'other';
export type CampaignStatus = 'active' | 'paused' | 'ended';
export type LeadGenerationMode = 'manual' | 'automatic';

export interface Campaign {
  id: string;
  name: string;
  code: string;
  channelType: CampaignChannelType;
  companyId?: string;
  costCenterId?: string;
  advertisingOperatorUserId?: string;
  advertisingOperatorName?: string;
  startDate?: string;
  endDate?: string;
  status: CampaignStatus;
  leadGenerationMode: LeadGenerationMode;
  // فقط وقتی leadGenerationMode==='automatic' معنا دارد — یک قاعدهٔ ساده و قابل غیرفعال‌سازی:
  // اگر probableName/probablePurchaseHistory/notهای RawContact حاوی این کلیدواژه بود، به Lead تبدیل شود.
  autoRuleEnabled?: boolean;
  autoRuleKeyword?: string;
  requiresManualConfirmationBeforeConversion?: boolean;
  priority: 'low' | 'normal' | 'high';
  tags?: string[];
  allowedPromotionIds?: string[];
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
}

export type LeadStatus =
  | 'new' | 'pending_action' | 'callback_scheduled' | 'overdue' | 'in_negotiation'
  | 'ready_for_invoice' | 'closed_won' | 'closed_lost' | 'wrong_number' | 'complaint_blocked';

export interface LeadTimelineEntry {
  id: string;
  type: string;
  title: string;
  detail?: string;
  actorUserId?: string;
  actorUserName?: string;
  timestamp: string;
}

// هر تخصیص/انتقال در timeline ثبت می‌شود و تاریخچهٔ قبلی هرگز تغییر نمی‌کند (بند ۸ مأموریت).
export interface Lead {
  id: string;
  trackingCode: string; // کد پیگیری ثابت — هرگز تغییر نمی‌کند
  rawContactId?: string;
  customerId?: string;
  campaignId?: string;
  source: string;
  declaredInterest?: string;
  priority: 'low' | 'normal' | 'high';
  productOrServiceOrPromotionHint?: string;
  companyId?: string;
  costCenterId?: string;
  currentOwnerUserId?: string;
  currentOwnerUserName?: string;
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
  actionDeadline?: string;
  status: LeadStatus;
  // قبل از اولین تماس هر مدیر مجاز می‌تواند Lead را جابه‌جا کند؛ بعد از اولین تماس ثبت‌شده،
  // انتقال فقط با دلیل + مجوز اختصاصی مجاز است (بند ۸ مأموریت).
  hadFirstContact: boolean;
  lastCallOutcome?: CallOutcomeType;
  timeline: LeadTimelineEntry[];
  // تخلیهٔ صف هنگام انتقال/غیرفعال‌سازی فروشنده (بند ۲۱ AGENTS.md) — Lead باز به‌جای واگذاری
  // مستقیم به فروشندهٔ دیگر، به مخزن «تخلیه‌شده» مدیر داده برمی‌گردد؛ currentOwnerUserId خالی
  // می‌شود ولی status/lastCallOutcome/callbackAt/timeline دست‌نخورده می‌مانند. غایب/undefined
  // یعنی هنوز هیچ‌وقت تخلیه نشده (رفتار قدیمی).
  distributionState?: 'assigned' | 'drained';
  drainedFromUserId?: string;
  drainedFromUserName?: string;
  drainReason?: string;
  drainedAt?: string;
  drainedByUserId?: string;
  drainedByUserName?: string;
  transferRequestId?: string;
}

// ============================================================
// تماس و نتیجهٔ تماس (بند ۱۰ مأموریت فروش) — یک Adapter است، نه اتصال واقعی Issabel.
// ============================================================
export type CallOutcomeType =
  | 'not_dialed' | 'could_not_connect' | 'switched_off' | 'no_answer' | 'wrong_number'
  | 'connected_no_time' | 'real_conversation' | 'callback_requested' | 'interested'
  | 'ready_for_invoice' | 'cancelled' | 'complaint';

export interface CallLogEntry {
  id: string;
  leadId: string;
  customerId?: string;
  salespersonUserId: string;
  salespersonUserName: string;
  startedAt: string;
  endedAt?: string;
  outcome: CallOutcomeType;
  note?: string;
  callbackAt?: string;
  createdAt: string;
}

// ============================================================
// کاتالوگ کالا، خدمت و پروموشن (بند ۱۱-۱۳ مأموریت فروش تا ثبت فاکتور). قیمت خرید فقط با
// مجوز view_purchase_price نمایش داده می‌شود؛ قیمت/تخفیف در فاکتور یک Snapshot است، نه
// ارجاع زنده به این رکوردها — تغییر بعدی کاتالوگ فاکتورهای قبلی را تغییر نمی‌دهد.
// ============================================================
export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  model?: string;
  color?: string;
  weight?: string;
  dimensions?: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  warranty?: string;
  isActive: boolean;
  description?: string;
  version?: number;
  updatedAt?: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
  revisionHistory?: CatalogRevision[];
}

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  salePrice: number;
  internalCost?: number; // بهای داخلی/خرید — همان محدودیت دسترسی purchasePrice کالا
  responsibleUnit?: string; // واحد آیندهٔ مسئول اجرا — فقط اطلاعاتی، اجرای خدمت در این مأموریت نیست
  description?: string;
  terms?: string;
  warrantyOrValidityPeriod?: string;
  requiresActivation: boolean;
  isActive: boolean;
  version?: number;
  updatedAt?: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
  revisionHistory?: CatalogRevision[];
}

export interface CatalogRevision {
  version: number;
  changedAt: string;
  changedByUserId: string;
  changedByUserName: string;
  reason: string;
  changedFields: string[];
  snapshot: Record<string, unknown>;
}

export type PromotionItemType = 'goods' | 'service';
export interface PromotionCoreItem {
  itemType: PromotionItemType;
  itemId: string;
  itemName: string;
  quantity: number;
}
export type PromotionStatus = 'active' | 'inactive' | 'expired';

export interface Promotion {
  id: string;
  code: string;
  title: string;
  version: number;
  startDate?: string;
  endDate?: string;
  allowedCostCenterIds?: string[];
  allowedCampaignIds?: string[];
  coreItems: PromotionCoreItem[];
  basePrice: number;
  discountAmount: number;
  finalPrice: number;
  salespersonDiscountCap?: number;
  status: PromotionStatus;
  conditions?: string;
  salesNotes?: string;
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
  updatedAt?: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
  revisionHistory?: CatalogRevision[];
}

// ============================================================
// فاکتور فروش و پرداخت اعلامی (بند ۱۴-۱۸ مأموریت فروش تا ثبت فاکتور). این موجودیت کاملاً
// مستقل از PaymentRequest خزانه‌داری و فاکتور بازگشتی پشتیبانی است. کد فاکتور از اولین ثبت
// هرگز تغییر نمی‌کند؛ Revision برای اصلاحات آینده. قیمت/تخفیف هر ردیف در لحظهٔ ثبت Snapshot
// می‌شود — تغییر بعدی کاتالوگ/پروموشن فاکتورهای قبلی را تغییر نمی‌دهد. تا سطح ثبت و ارسال
// برای بررسی مالی؛ تایید نهایی بانکی فاز بعد است.
// ============================================================
export type SalesInvoiceLineItemType = 'goods' | 'service';
export type SalesInvoiceLineSourceType = 'promotion_core' | 'cross_sell' | 'manual_addition';

export interface SalesInvoiceLineItem {
  id: string;
  itemType: SalesInvoiceLineItemType;
  productId?: string;
  serviceId?: string;
  promotionId?: string;
  promotionVersion?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  sourceType: SalesInvoiceLineSourceType;
}

export type SalesInvoiceStatus =
  | 'draft' | 'awaiting_registration_review' | 'awaiting_supervisor_approval' | 'registered' | 'partial_payment'
  | 'awaiting_financial_confirmation' | 'returned_to_salesperson' | 'cancelled'
  | 'financial_suspicious_hold'
  | 'financial_confirmed' | 'fulfillment_in_progress' | 'completed'
  // هماهنگی — مرحلهٔ مستقل بعد از تأیید سرپرست و پیش از تأیید مالی (بند ۱۳ سند مادر):
  | 'awaiting_coordination_manager' | 'coordination_assigned' | 'coordination_in_progress' | 'coordination_callback_scheduled'
  // عودت رسمی دلیل‌دار برای اصلاح (پس از اقدام رسمی واحد بعد) — جایگزین یکپارچهٔ returned_to_salesperson
  // برای مسیرهای جدید (هماهنگی/ثبت/سرپرست)؛ returned_to_salesperson قدیمی برای سازگاری دست‌نخورده ماند.
  | 'returned_for_correction';

// تأیید اجباری سرپرست پیش از مالی (بند ۲۱ AGENTS.md / بند ۸ مأموریت) — فقط بعد از این رکورد
// submitForFinancialReview مجاز است. جانشینی (سرپرست Snapshot غیرفعال) صریح ثبت می‌شود.
export interface SalesInvoiceSupervisorApproval {
  approverUserId: string;
  approverUserName: string;
  snapshotSupervisorUserId: string;
  isSuccessor: boolean;
  successorReason?: string;
  approvedAt: string;
}

export type DeclaredPaymentMethod = 'card_to_card' | 'cash' | 'gateway' | 'other';
// declared: تازه اعلام شده — تصمیم مالی هنوز نیامده. approved: مبلغ تأییدشده در مبلغ قطعی فاکتور
// محاسبه می‌شود. rejected: به‌کلی رد شده، هرگز در مبلغ قطعی نمی‌آید. needs_correction: نیازمند
// اصلاح فروشنده/واحد ثبت است، هنوز نه تأیید نه رد قطعی.
export type DeclaredPaymentStatus = 'declared' | 'approved' | 'rejected' | 'needs_correction' | 'suspicious';
export interface DeclaredPaymentHistoryEntry {
  id: string;
  status: DeclaredPaymentStatus;
  amount: number;
  byUserId: string;
  byUserName: string;
  at: string;
  note?: string;
}
export interface DeclaredPayment {
  id: string;
  amount: number; // مبلغ اعلامی اولیه — هرگز توسط تأیید مالی بازنویسی نمی‌شود
  date: string;
  time?: string;
  method: DeclaredPaymentMethod;
  trackingNumber?: string;
  lastFourDigits?: string;
  destinationAccount?: string;
  receiptImageUrl?: string;
  recordedByUserId: string;
  recordedByUserName: string;
  recordedAt: string;
  status: DeclaredPaymentStatus;
  approvedAmount?: number; // فقط وقتی status==='approved' مقداردهی می‌شود
  financialApproverUserId?: string;
  financialApproverUserName?: string;
  financialDecisionAt?: string;
  financialDecisionReason?: string; // برای rejected/needs_correction الزامی
  financialHistory?: DeclaredPaymentHistoryEntry[];
  // اصلاح هرگز ردیف قبلی را حذف/بازنویسی نمی‌کند؛ ردیف تازه به قبلی متصل می‌شود و lineage، نسخه جاری را مشخص می‌کند.
  correctsPaymentId?: string;
  supersededByPaymentId?: string;
  // تطبیق بانک در این فاز «پیشنهاد» است، نه اتصال واقعی بانک. تصمیم نهایی همیشه انسانی است.
  proposedBankTransactionId?: string;
  proposedMatchConfidence?: number;
  proposedMatchReasons?: string[];
}

export interface SalesInvoiceHistoryEntry {
  id: string;
  action: string;
  byUserId: string;
  byUserName: string;
  at: string;
  note?: string;
  // فیلدهای Audit افزایشی (بند ۱۱ مأموریت تکمیل فلو فاکتور) — هرگز فیلد موجود بالا را rename
  // نمی‌کنند: occurredAtIso/jalaliDate/timeWithSeconds شمسی+ثانیه، realActorUserId/effectiveUserId
  // تفکیک هویت واقعی از هویت مؤثر زیر Impersonation، correlationId برای ردیابی یک عملیات چندرویدادی،
  // oldStatus/newStatus و revision برای گزارش تغییر وضعیت، destination/correctedFields برای عودت رسمی.
  occurredAtIso?: string;
  jalaliDate?: string;
  timeWithSeconds?: string;
  realActorUserId?: string;
  effectiveUserId?: string;
  revision?: number;
  oldStatus?: SalesInvoiceStatus;
  newStatus?: SalesInvoiceStatus;
  correlationId?: string;
  destination?: 'salesperson' | 'registrar';
  correctedFields?: string[];
}

export interface SalesInvoice {
  id: string;
  invoiceCode: string; // ثابت از اولین ثبت — هرگز تغییر نمی‌کند
  revision: number;
  externalInvoiceKey?: string; // کلید فاکتور خارجی (Import گروهی) — برای گروه‌بندی ردیف‌ها و جلوگیری از ثبت دوباره
  batchImportId?: string;
  batchSourceFileName?: string;
  batchSourceRowIndexes?: number[];
  customerId: string;
  leadId?: string;
  campaignId?: string;
  salespersonUserId: string;
  salespersonUserName: string;
  salesSupervisorId?: string; // Snapshot زنجیرهٔ سرپرستی در لحظهٔ ثبت — قدیمی، فقط برای خواندن؛ رکوردهای جدید salesHierarchySnapshot کامل دارند
  salesSupervisorName?: string;
  // Snapshot کامل پنج‌سطحی زنجیرهٔ فروش (SalesOrgAssignment) در لحظهٔ ثبت — هرگز با تغییر بعدی
  // شعبه/مدیران کاربر Update نمی‌شود. اختیاری برای سازگاری با فاکتورهای قدیمی‌تر از این مأموریت.
  salesHierarchySnapshot?: SalesHierarchySnapshot;
  registeredByUserId?: string; // اگر واحد ثبت به نمایندگی فروشنده ثبت کرده — از فروشنده جدا
  registeredByUserName?: string;
  // تأیید اجباری سرپرست پیش از مالی — غایب یعنی هنوز تأیید نشده (بند ۲۱ AGENTS.md).
  supervisorApproval?: SalesInvoiceSupervisorApproval;
  companyId?: string;
  costCenterId?: string;
  lineItems: SalesInvoiceLineItem[];
  subtotal: number;
  totalDiscount: number;
  finalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  registrationSheetImageUrl?: string;
  status: SalesInvoiceStatus;
  declaredPayments: DeclaredPayment[];
  history: SalesInvoiceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  // بند ۳/۱۰ مأموریت تکمیل فلو فاکتور — Optimistic Lock: هر تابع تغییردهنده یک واحد افزایش
  // می‌دهد؛ Handler پیش از ذخیره، نسخهٔ لحظهٔ بازکردن فرم را با نسخهٔ فعلی Storage مقایسه می‌کند.
  version?: number;
  // مستقل از registeredByUserId (که فقط شناسهٔ عامل ثبت را نگه می‌دارد) — این دو فیلد صریحاً
  // «مسیر ورود» را مدل می‌کنند تا هیچ Rule‌ای مجبور به Infer کردن از روی وجود/غیاب یک فیلد نباشد.
  registrationMode?: 'direct' | 'on_behalf';
  saleOrigin?: 'digital_queue' | 'paper_offline';
}

// ============================================================
// هماهنگی فاکتور — مرحلهٔ مستقل بعد از تأیید سرپرست و پیش از تأیید مالی (بند ۱۳ سند مادر،
// مأموریت تکمیل فلو نهایی فاکتور). پرونده به‌ازای هر فاکتور که تأیید سرپرست گرفته ساخته
// می‌شود؛ هر تلاش/نتیجه Append-only است — هرگز overwrite/حذف نمی‌شود.
// ============================================================
export type CoordinationCaseStatus = 'pending_assignment' | 'assigned' | 'in_progress' | 'callback_scheduled' | 'exception' | 'closed';
export type CoordinationAttemptResult =
  | 'confirmed' | 'callback_requested' | 'no_answer' | 'mismatch_returned'
  | 'customer_cancelled' | 'complaint_referred' | 'escalated_to_manager'
  | 'assigned' | 'claimed' | 'recalled' | 'manager_bypass';

export type CoordinationDistributionMode = 'manual_assignment' | 'shared_claim' | 'balanced_assignment';
export type CoordinationChecklistKey =
  | 'identity_contact' | 'items_promotion' | 'quantity_final_price_discount'
  | 'declared_payments' | 'address_delivery' | 'activation_terms'
  | 'salesperson_promises' | 'customer_willingness' | 'complaint_cancellation';
export type CoordinationChecklistDecision = 'pending' | 'confirmed' | 'mismatch' | 'not_applicable';

export interface CoordinationChecklistItem {
  key: CoordinationChecklistKey;
  label: string;
  required: boolean;
  decision: CoordinationChecklistDecision;
  note?: string;
  updatedAt?: string;
  updatedByUserId?: string;
  updatedByUserName?: string;
}

export interface CoordinationCase {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  customerId: string;
  status: CoordinationCaseStatus;
  assignedCoordinatorUserId?: string;
  assignedCoordinatorUserName?: string;
  assignedByUserId?: string;
  assignedByUserName?: string;
  assignedAt?: string;
  distributionMode: CoordinationDistributionMode;
  checklist: CoordinationChecklistItem[];
  isManagerBypassed: boolean;
  managerBypassReason?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedResult?: CoordinationAttemptResult;
}

// هر Claim/تخصیص/تلاش تماس/نتیجه/عودت یک رکورد Append-only مستقل است — هرگز یک فیلد توضیح
// آزاد واحد نیست (بند ۱۳ سند مادر). فیلدهای Audit همان قرارداد بند ۱۱ مأموریت را دارند.
export interface CoordinationAttempt {
  id: string;
  caseId: string;
  invoiceId: string;
  actorUserId: string;
  actorUserName: string;
  realActorUserId: string;
  effectiveUserId: string;
  result: CoordinationAttemptResult;
  structuredReason?: string;
  note?: string;
  nextActionAt?: string;
  occurredAtIso: string;
  jalaliDate: string;
  timeWithSeconds: string;
  correlationId: string;
}

export interface CoordinationSettings {
  distributionMode: CoordinationDistributionMode;
  updatedAt: string;
  updatedByUserId: string;
  updatedByUserName: string;
}

// ============================================================
// تأیید مالی ردیفی فروش — پروندهٔ مستقل، سه روش توزیع، Claim/Assignment و Event append-only.
// اتصال واقعی بانک خارج از این Slice است؛ proposed match فقط مدرک کمکی و غیرقطعی است.
// ============================================================
export type SalesFinancialDistributionMode = 'manual_assignment' | 'shared_claim' | 'balanced_assignment';
export type SalesFinancialReviewCaseStatus =
  | 'pending_assignment' | 'assigned' | 'in_progress' | 'suspicious_hold'
  | 'returned_for_correction' | 'closed';
export type SalesFinancialReviewResult =
  | 'assigned' | 'claimed' | 'payment_approved' | 'payment_rejected'
  | 'payment_needs_correction' | 'payment_suspicious' | 'hold_released'
  | 'returned_for_correction' | 'financial_confirmed' | 'overpayment_opened';

export interface SalesFinancialReviewCase {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  customerId: string;
  status: SalesFinancialReviewCaseStatus;
  distributionMode: SalesFinancialDistributionMode;
  assignedReviewerUserId?: string;
  assignedReviewerUserName?: string;
  assignedByUserId?: string;
  assignedByUserName?: string;
  assignedAt?: string;
  holdReason?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedResult?: 'financial_confirmed' | 'returned_for_correction';
}

export interface SalesFinancialReviewEvent {
  id: string;
  caseId: string;
  invoiceId: string;
  paymentId?: string;
  result: SalesFinancialReviewResult;
  reason?: string;
  declaredAmount?: number;
  approvedAmount?: number;
  actorUserId: string;
  actorUserName: string;
  realActorUserId: string;
  effectiveUserId: string;
  occurredAtIso: string;
  jalaliDate: string;
  timeWithSeconds: string;
  correlationId: string;
}

export interface SalesFinancialSettings {
  distributionMode: SalesFinancialDistributionMode;
  updatedAt: string;
  updatedByUserId: string;
  updatedByUserName: string;
}

export interface SalesOverpaymentCase {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  paymentId: string;
  excessAmount: number;
  status: 'open' | 'referred' | 'closed';
  idempotencyKey: string;
  createdAt: string;
  createdByUserId: string;
  createdByUserName: string;
}

// ============================================================
// پروندهٔ اجرای کالا/خدمت — فقط بعد از financial_confirmed و فقط Event/Timeline قابل‌اتصال
// آینده (بدون پیامک/درگاه/Issabel/بانک واقعی). تغییر بعدی کاتالوگ/پروموشن هرگز پروندهٔ
// ازقبل‌ساخته‌شده را تغییر نمی‌دهد — همان اصل Snapshot فاکتور اینجا هم برقرار است.
// ============================================================
export interface FulfillmentTimelineEntry {
  id: string;
  type: string;
  title: string;
  actorUserId?: string;
  actorUserName?: string;
  timestamp: string;
  occurredAtIso?: string;
  jalaliDate?: string;
  timeWithSeconds?: string;
  previousStatus?: string;
  nextStatus?: string;
  note?: string;
}

export type ProductFulfillmentStatus = 'pending_coordination' | 'ready_for_dispatch' | 'dispatched' | 'delivered';
export interface ProductFulfillmentCase {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  lineItemId: string;
  productId?: string;
  productName: string;
  customerId: string;
  quantity: number; // Snapshot از ردیف فاکتور در لحظهٔ ساخت پرونده — ردیف با تعداد بیشتر از یک هرگز گم نمی‌شود
  status: ProductFulfillmentStatus;
  assignedDispatchUserId?: string;
  assignedDispatchUserName?: string;
  assignedDeliveryUserId?: string;
  assignedDeliveryUserName?: string;
  timeline: FulfillmentTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}
// ============================================================
// شعبهٔ فروش — Entity واقعی و مستقل از CostCenter (مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش).
// CostCenter مرکز هزینهٔ مالی خزانه‌داری است؛ SalesBranch قلمرو عملیاتی سازمان فروش است. این دو
// هرگز یکی نیستند — linkedCostCenterId فقط برای تطبیق/گزارش مالی اختیاری است، نه منبع Permission.
// ============================================================
export interface SalesBranch {
  id: string;
  code: string;
  name: string;
  companyId: string;
  linkedCostCenterId?: string;
  isActive: boolean;
}

// پنج نقش سلسله‌مراتب فروش — همان id های واقعی SystemRole، اینجا هم به‌عنوان Union محدود تکرار
// شده تا SalesOrgAssignment.salesRoleId در Compile-time به یکی از این پنج مقدار محدود بماند.
export type SalesHierarchyRoleId =
  | 'role_salesperson' | 'role_sales_supervisor' | 'role_senior_sales_supervisor'
  | 'role_sales_manager' | 'role_sales_deputy';

// انتصاب مؤثر یک کاربر در سلسله‌مراتب سازمان فروش — منبع اصلی (نه User.salesSupervisorId، که فقط
// برای خواندن دادهٔ قدیمی/سازگاری با مصرف‌کننده‌های فعلی salesHierarchy.ts نگه داشته شده و در
// لحظهٔ ذخیرهٔ یک SalesOrgAssignment جدید با directManagerUserId هم‌گام می‌شود).
export interface SalesOrgAssignment {
  id: string;
  userId: string;
  salesRoleId: SalesHierarchyRoleId;
  salesBranchIds: string[];
  // زنجیرهٔ/تیم ثابت داخل شعبه (مأموریت چرخهٔ عمر نیروی فروش) — فروشندهٔ فعال دقیقاً یک
  // salesChainId دارد؛ سطوح بالاتر می‌توانند چند زنجیره را در انتصاب خودشان فهرست کنند.
  salesChainIds?: string[];
  directManagerUserId?: string;
  validFrom: string;
  validTo?: string;
  isActive: boolean;
  changedByUserId?: string;
  changedAt: string;
  // چرا این انتصاب بسته شد (بند ۲۱ AGENTS.md) — فقط وقتی validTo مقداردهی می‌شود پر می‌شود.
  closeReason?: 'transfer' | 'correction_before_use' | 'emergency_correction' | 'role_change' | 'deactivation';
  closedByUserId?: string;
  // اگر این انتصاب حاصل یک SalespersonTransferRequest اجراشده است — ارجاع برای Audit/گزارش.
  transferRequestId?: string;
  // «استفادهٔ مؤثر» یعنی حداقل یک رویداد کسب‌وکاری (بند ۷ سند مرجع) — ورود/مشاهده/ایجاد خودِ
  // انتصاب استفادهٔ مؤثر نیست. تا این مقدار false/غایب است، اصلاح درجا مجاز است؛ بعد از true
  // شدن، فقط close+create مجاز است (به‌جز اصلاح اضطراری ادمین).
  immutableAfterFirstBusinessUse?: boolean;
  firstBusinessEventAt?: string;
  firstBusinessEventType?: string;
  firstBusinessEventId?: string;
}

// زنجیره/تیم ثابت داخل یک شعبه (بند ۲۱ AGENTS.md / مأموریت چرخهٔ عمر نیروی فروش) — موجودیت
// ثابت است؛ تغییر سرپرست/مدیر هرگز SalesChain یا SalesBranch جدید نمی‌سازد.
export interface SalesChain {
  id: string;
  code: string;
  name: string;
  salesBranchId: string;
  callCenterId?: string;
  callCenterName?: string;
  isActive: boolean;
  createdAt: string;
  createdByUserId: string;
  updatedAt?: string;
  updatedByUserId?: string;
}

// Snapshot کامل زنجیرهٔ فروش در لحظهٔ ثبت فاکتور/رکورد فروش — هرگز با تغییر بعدی شعبه/نقش/مدیران
// کاربر Update نمی‌شود؛ گزارش، پورسانت و تاریخچهٔ گذشته همیشه از این Snapshot خوانده می‌شوند.
export interface SalesHierarchySnapshot {
  salespersonUserId: string;
  salespersonUserName: string;
  salesBranchId: string;
  salesBranchName: string;
  // اختیاری برای سازگاری با Snapshotهای قدیمی‌تر از مأموریت چرخهٔ عمر نیروی فروش.
  salesChainId?: string;
  salesChainName?: string;
  supervisorUserId: string;
  supervisorUserName: string;
  seniorSupervisorUserId: string;
  seniorSupervisorUserName: string;
  salesManagerUserId: string;
  salesManagerUserName: string;
  salesDeputyUserId: string;
  salesDeputyUserName: string;
  capturedAt: string;
}

// ============================================================
// چرخهٔ عمر نیروی فروش: درخواست انتقال، Event زمان‌دار Append-only (بند ۲۱ AGENTS.md،
// docs/SALES_PERSONNEL_LIFECYCLE_AND_HIERARCHY_CHANGE.md). فروشنده هرگز این فرم را نمی‌بیند؛
// فقط سرپرست مستقیم فعلی درخواست می‌دهد، فقط مدیر کاربران فروش/ادمین تأیید/رد/مقصد را تعیین می‌کند.
// ============================================================
export type SalespersonTransferRequestStatus = 'pending' | 'rejected' | 'approved' | 'scheduled' | 'executed' | 'failed';

export interface SalespersonTransferRequest {
  id: string;
  code: string;
  salespersonUserId: string;
  salespersonUserName: string;
  // Snapshot انتصاب فعلی در لحظهٔ ثبت درخواست — برای مقایسه/Audit، نه منبع اجرا.
  currentAssignmentSnapshot: { salesBranchId: string; salesBranchName: string; salesChainId?: string; salesChainName?: string };
  requestedBySupervisorUserId: string;
  requestedBySupervisorName: string;
  reason: string;
  fullDescription: string;
  attachment?: { fileName: string; url: string };
  requestedAt: string;
  status: SalespersonTransferRequestStatus;
  // مقصد را سرپرست تعیین نمی‌کند — طبق سند مرجع، فقط مدیر کاربران فروش/ادمین در لحظهٔ تأیید
  // شعبه/زنجیرهٔ مقصد و زمان اثرگذاری را تعیین می‌کند؛ تا پیش از تأیید این سه فیلد خالی‌اند.
  targetBranchId?: string;
  targetSalesChainId?: string;
  effectiveAtIso?: string;
  targetHierarchySnapshot?: SalesHierarchySnapshot;
  reviewedByUserId?: string;
  reviewedByUserName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  executedAt?: string;
  oldAssignmentId?: string;
  newAssignmentId?: string;
  drainedLeadIds?: string[];
  drainedLeadCount?: number;
  failureReason?: string;
}

export type SalesOrgAssignmentEventType =
  | 'create' | 'correct_before_use' | 'transfer_requested' | 'transfer_rejected'
  | 'transfer_scheduled' | 'queue_drained' | 'assignment_closed' | 'assignment_started'
  | 'user_deactivated' | 'emergency_correction';

// Append-only — هیچ رکورد این نوع هرگز ویرایش/حذف نمی‌شود؛ عامل واقعی/زمان/دلیل/before-after
// همیشه با هر تغییر انتصاب سازمان فروش ثبت می‌شود (بند ۱۹ AGENTS.md). فیلدهای زیرین (occurredAtIso
// تا correlationId) بدهی #B مأموریت تکمیل چرخهٔ عمر را می‌بندند: هر Event تازه باید Timestamp
// ISO مرتب‌شدنی + نمایش شمسی تا ثانیه + هویت واقعی/مؤثر (زیر Impersonation) + Correlation
// داشته باشد. برای Eventهای قدیمی که پیش از این نسخه ثبت شده‌اند این فیلدها غایب می‌مانند —
// طبق سیاست Append-only، رکورد قدیمی هرگز بازنویسی نمی‌شود، فقط Eventهای تازه کامل‌اند.
export interface SalesOrgAssignmentEvent {
  id: string;
  type: SalesOrgAssignmentEventType;
  userId: string;
  actorUserId: string;
  actorUserName: string;
  reason?: string;
  description?: string;
  before?: Partial<SalesOrgAssignment>;
  after?: Partial<SalesOrgAssignment>;
  transferRequestId?: string;
  attachment?: { fileName: string; url: string };
  timestamp: string;
  // --- بدهی #B: Timestamp ISO مرتب‌شدنی + نمایش شمسی تا ثانیه، مستقل از `timestamp` بالا ---
  occurredAtIso?: string;
  jalaliDate?: string;
  timeWithSeconds?: string;
  // --- هویت واقعی در برابر هویت مؤثر (Impersonation) — بدون این تفکیک، اقدام انجام‌شده زیر
  // نیابت به‌اشتباه به‌نام کاربر نیابت‌شده ثبت می‌شود، نه ادمین واقعی ---
  realActorUserId?: string;
  effectiveUserId?: string;
  // --- شناسه‌های سریع برای گزارش/Grain، مکمل before/after کامل بالا ---
  oldAssignmentId?: string;
  newAssignmentId?: string;
  oldBranchId?: string;
  newBranchId?: string;
  oldHierarchySnapshot?: SalesHierarchySnapshot;
  newHierarchySnapshot?: SalesHierarchySnapshot;
  relatedRequestId?: string;
  correlationId?: string;
}

// یادداشت مدیریتی Append-only روی پروندهٔ بایگانی‌شدهٔ نیروی غیرفعال فروش (بدهی #۵ مأموریت
// اصلاح پذیرش) — پیش‌تر این یادداشت فقط داخل AuditLog محدودالمحدودهٔ Impersonation/پرداخت
// (که طبق مستندات پروژه اصلاً برای این منظور نیست) گم می‌شد و هرگز به کاربر نمایش داده
// نمی‌شد؛ حالا مجموعهٔ مستقل خودش را دارد و در همان پنل بایگانی نمایش داده می‌شود. رکورد
// موجود هرگز ویرایش/حذف نمی‌شود — فقط افزوده می‌شود.
export interface SalesArchivedNote {
  id: string;
  targetUserId: string;
  note: string;
  authorUserId: string;
  authorUserName: string;
  createdAt: string;
}

export type ServiceFulfillmentStatus =
  | 'pending_assignment' | 'assigned_to_project_manager' | 'assigned_to_employee' | 'in_progress'
  | 'waiting' | 'awaiting_confirmation' | 'completed' | 'failed' | 'cancelled';

export type ServiceCoordinationOutcome = 'contacted' | 'callback_requested' | 'unreachable' | 'documents_required';
export type ServiceCustomerConfirmationMethod = 'otp' | 'recorded_phone' | 'managerial' | 'not_required';
export type ServiceFulfillmentEvidenceType = 'note' | 'document' | 'image' | 'contract' | 'activation_code' | 'customer_confirmation';

export interface ServiceFulfillmentEvidence {
  id: string;
  type: ServiceFulfillmentEvidenceType;
  title: string;
  reference?: string;
  addedByUserId: string;
  addedByUserName: string;
  addedAt: string;
}

export interface ServiceFulfillmentCase {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  lineItemId: string;
  serviceId?: string;
  serviceName: string;
  customerId: string;
  quantity: number; // Snapshot از ردیف فاکتور در لحظهٔ ساخت پرونده
  serviceCategory?: string; // Snapshot از دستهٔ کاتالوگ خدمت در لحظهٔ ساخت پرونده — تغییر بعدی کاتالوگ این مقدار را عوض نمی‌کند
  responsibleUnit?: string; // Snapshot از واحد مسئول کاتالوگ خدمت — مبنای محاسبهٔ قلمرو مدیر پروژه
  status: ServiceFulfillmentStatus;
  projectManagerUserId?: string;
  projectManagerUserName?: string;
  assignedEmployeeUserId?: string;
  assignedEmployeeUserName?: string;
  latestCoordinationOutcome?: ServiceCoordinationOutcome;
  latestCoordinationNote?: string;
  waitReason?: string;
  statusBeforeWait?: 'assigned_to_employee' | 'in_progress';
  completionNote?: string;
  completionEvidence?: ServiceFulfillmentEvidence[];
  customerConfirmationMethod?: ServiceCustomerConfirmationMethod;
  customerConfirmationReference?: string;
  submittedForConfirmationByUserId?: string;
  submittedForConfirmationByUserName?: string;
  submittedForConfirmationAt?: string;
  completedByUserId?: string;
  completedByUserName?: string;
  completedAt?: string;
  closureReason?: string;
  timeline: FulfillmentTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

