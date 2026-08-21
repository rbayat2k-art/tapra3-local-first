import {
  User, Company, CompanyBankAccount, CostCenter, PaymentRequest, SystemNotification,
  ChatMessage, WorkflowStepRule, SystemRole, Vendor, AssignedTask, VendorCategory, DirectMessage, SupportCase, UserRole, Letter,
  Customer, ImpersonationLogEntry, AuditLogEntry, SystemPermission,
  CustomerMergeRequest, CustomerMergeEvent, CustomerSplitEvent, CustomerEntryConflict, ClaimedPurchase,
  RawContact, ImportJob, Campaign, Lead, CallLogEntry, Product, ServiceCatalogItem, Promotion, SalesInvoice,
  ProductFulfillmentCase, ServiceFulfillmentCase, SalesBranch, SalesOrgAssignment,
  SalesChain, SalespersonTransferRequest, SalesOrgAssignmentEvent, SalesArchivedNote,
  CoordinationCase, CoordinationAttempt, CoordinationSettings,
  SalesFinancialReviewCase, SalesFinancialReviewEvent, SalesFinancialSettings, SalesOverpaymentCase
} from '../types';
import { numberToPersianWords } from './numberToWords';
import { getJalaliNow } from './persianDate';
import {
  buildDraftInvoice, registerInvoice, addDeclaredPayment, returnInvoiceToSalesperson,
  splitPromotionIntoLineItems, submitForRegistrationReview, approveRegistration, decideDeclaredPayment, approveSupervisorInvoice,
  enterFinancialConfirmation, submitInvoiceToSupervisor, evaluateSupervisorSubmissionReadiness
} from './salesInvoice';
import { generateFulfillmentCases } from './fulfillment';
import { deriveLegacyUserRoleFromAssignedRoles } from './permissions';
import { buildSalesHierarchySnapshot } from './salesOrgStructure';
import { applyBusinessUseLock, ActorContext } from './salesPersonnelLifecycle';
import { buildCoordinationChecklist, createCoordinationCase, assignCoordinationCase, claimCoordinationCase, recordCoordinationAttempt, approveCoordinationCase } from './coordinationCase';
import { ensureFinancialReviewCases } from './salesFinancialReview';
import { withCatalogMetadata } from './catalog';

// Maps each base UserRole to its default SystemRole (used to look up the
// permission set that drives sidebar/page visibility) unless a user has an
// explicit roleId override (e.g. assigned to a custom role an admin created).
export const DEFAULT_ROLE_ID_MAP: Record<UserRole, string> = {
  admin: 'role_super_admin',
  approver: 'role_branch_approver',
  requestor: 'role_purchaser',
  treasury_executor: 'role_treasury_executor',
  support_agent: 'role_support_agent',
  financial_approver: 'role_financial_approver',
  // نوع خنثی Compatibility — بدون هیچ Permission پیش‌فرض (role_basic_user، پرمیشن خالی).
  member: 'role_basic_user'
};

const STORAGE_KEYS = {
  USERS: 'shavaz_treasury_users_v2',
  ROLES: 'shavaz_treasury_roles_v2',
  COMPANIES: 'shavaz_treasury_companies_v2',
  COMPANY_BANK_ACCOUNTS: 'shavaz_treasury_company_bank_accounts_v1',
  COST_CENTERS: 'shavaz_treasury_cost_centers_v2',
  VENDORS: 'shavaz_treasury_vendors_v2',
  VENDOR_CATEGORIES: 'shavaz_treasury_vendor_categories_v1',
  REQUESTS: 'shavaz_treasury_requests_v2',
  NOTIFICATIONS: 'shavaz_treasury_notifications_v2',
  MESSAGES: 'shavaz_treasury_messages_v2',
  DIRECT_MESSAGES: 'shavaz_treasury_direct_messages_v1',
  SUPPORT_CASES: 'shavaz_treasury_support_cases_v1',
  LETTERS: 'shavaz_treasury_letters_v1',
  WORKFLOW: 'shavaz_treasury_workflow_v2',
  CURRENT_USER: 'shavaz_treasury_current_user_v2',
  REQUEST_COUNTER: 'shavaz_treasury_req_counter_v2',
  SUPPORT_CASE_COUNTER: 'shavaz_treasury_support_case_counter_v1',
  LETTER_COUNTER: 'shavaz_treasury_letter_counter_v1',
  TASKS: 'shavaz_treasury_tasks_v2',
  TAB_USAGE: 'shavaz_treasury_tab_usage_v1',
  CUSTOMERS: 'shavaz_treasury_customers_v1',
  IMPERSONATION_LOG: 'shavaz_treasury_impersonation_log_v1',
  AUDIT_LOG: 'shavaz_treasury_audit_log_v1',
  ROLES_MIGRATION_VERSION: 'shavaz_treasury_roles_migration_version_v1',
  USERS_MIGRATION_VERSION: 'shavaz_treasury_users_migration_version_v1',
  CUSTOMERS_MIGRATION_VERSION: 'shavaz_treasury_customers_migration_version_v1',
  CUSTOMER_MERGE_REQUESTS: 'shavaz_treasury_customer_merge_requests_v1',
  CUSTOMER_MERGE_EVENTS: 'shavaz_treasury_customer_merge_events_v1',
  CUSTOMER_SPLIT_EVENTS: 'shavaz_treasury_customer_split_events_v1',
  CUSTOMER_ENTRY_CONFLICTS: 'shavaz_treasury_customer_entry_conflicts_v1',
  CLAIMED_PURCHASES: 'shavaz_treasury_claimed_purchases_v1',
  RAW_CONTACTS: 'shavaz_treasury_raw_contacts_v1',
  IMPORT_JOBS: 'shavaz_treasury_import_jobs_v1',
  CAMPAIGNS: 'shavaz_treasury_campaigns_v1',
  LEADS: 'shavaz_treasury_leads_v1',
  CALL_LOGS: 'shavaz_treasury_call_logs_v1',
  PRODUCTS: 'shavaz_treasury_products_v1',
  SERVICES: 'shavaz_treasury_services_v1',
  PROMOTIONS: 'shavaz_treasury_promotions_v1',
  CATALOG_METADATA_MIGRATION_VERSION: 'shavaz_treasury_catalog_metadata_migration_version_v1',
  SALES_INVOICES: 'shavaz_treasury_sales_invoices_v1',
  SALES_INVOICE_REGISTRATION_FLOW_MIGRATION_VERSION: 'shavaz_treasury_sales_invoice_registration_flow_migration_version_v1',
  PRODUCT_FULFILLMENT_CASES: 'shavaz_treasury_product_fulfillment_cases_v1',
  SERVICE_FULFILLMENT_CASES: 'shavaz_treasury_service_fulfillment_cases_v1',
  SERVICE_FULFILLMENT_MIGRATION_VERSION: 'shavaz_treasury_service_fulfillment_migration_version_v1',
  GOLDEN_MIXED_INVOICE_SEED_VERSION: 'shavaz_treasury_golden_mixed_invoice_seed_version_v1',
  SALES_BRANCHES: 'shavaz_treasury_sales_branches_v1',
  SALES_ORG_ASSIGNMENTS: 'shavaz_treasury_sales_org_assignments_v1',
  SALES_ORG_STRUCTURE_SEED_VERSION: 'shavaz_treasury_sales_org_structure_seed_version_v1',
  USERS_LEGACY_ROLE_NORMALIZATION_VERSION: 'shavaz_treasury_users_legacy_role_normalization_version_v1',
  SALES_CHAINS: 'shavaz_treasury_sales_chains_v1',
  SALESPERSON_TRANSFER_REQUESTS: 'shavaz_treasury_salesperson_transfer_requests_v1',
  SALES_ORG_ASSIGNMENT_EVENTS: 'shavaz_treasury_sales_org_assignment_events_v1',
  SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION: 'shavaz_treasury_sales_assignment_lock_backfill_version_v1',
  SALES_ARCHIVED_NOTES: 'shavaz_treasury_sales_archived_notes_v1',
  COORDINATION_CASES: 'shavaz_treasury_coordination_cases_v1',
  COORDINATION_ATTEMPTS: 'shavaz_treasury_coordination_attempts_v1',
  COORDINATION_SETTINGS: 'shavaz_treasury_coordination_settings_v1',
  SALES_FINANCIAL_REVIEW_CASES: 'shavaz_treasury_sales_financial_review_cases_v1',
  SALES_FINANCIAL_REVIEW_EVENTS: 'shavaz_treasury_sales_financial_review_events_v1',
  SALES_FINANCIAL_SETTINGS: 'shavaz_treasury_sales_financial_settings_v1',
  SALES_OVERPAYMENT_CASES: 'shavaz_treasury_sales_overpayment_cases_v1'
};

// Per-user tab/menu open counts, used to power the "پرکاربردترین منوهای شما" dashboard
// widget: { [userId]: { [tabId]: openCount } }. Independent of everything else in
// STORAGE_KEYS above; not part of src/types.ts since it's UI usage telemetry, not a
// core data model.
export type TabUsageCounts = Record<string, Record<string, number>>;

// Default System Roles
export const DEFAULT_ROLES: SystemRole[] = [
  {
    id: 'role_super_admin',
    code: 'SUPER_ADMIN',
    name: 'مدیر ارشد کل (Super Admin)',
    description: 'دسترسی کامل به تمامی بخش‌های سیستم، مدیریت کاربران، نقش‌ها و تنظیمات مالی خزانه‌داری',
    isSystemRole: true,
    domain: 'system',
    permissions: [
      'create_request', 'view_all_requests', 'view_branch_requests',
      'approve_branch_request', 'approve_treasury', 'execute_payment',
      'return_reject_request', 'manage_cost_centers', 'manage_companies',
      'manage_users', 'manage_roles', 'manage_vendors', 'export_archive',
      'export_bank_batch', 'view_analytics', 'manage_assigned_tasks',
      'manage_support_cases', 'financial_approve_support', 'view_support_reports', 'manage_letters',
      'impersonate_users', 'refer_for_payment', 'refer_for_emergency_payment', 'execute_emergency_payment',
      'sales_access', 'view_own_customers', 'view_team_customers', 'view_descendant_customers',
      'search_customer_by_phone', 'create_customer', 'edit_customer_basic_info', 'view_customer_contact_fields',
      'view_customer_address', 'view_customer_purchase_history', 'view_customer_call_history',
      'view_customer_complaint_summary', 'view_customer_complaint_details', 'start_sale_cycle', 'close_sale_cycle',
      'assign_sales_lead', 'reassign_sales_lead', 'drain_salesperson_queue', 'view_sales_reports',
      'configure_sales_field_visibility', 'manage_sales_hierarchy',
      'data_management_access', 'import_raw_contacts', 'review_import_conflicts', 'view_raw_contact_pool',
      'configure_lead_assignment', 'view_data_reports',
      'advertising_access', 'manage_advertising_campaigns', 'review_incoming_leads',
      'convert_interaction_to_lead', 'view_campaign_reports',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'review_customer_merge_queue',
      'approve_reject_customer_merge', 'select_customer_primary_value', 'split_customer_merge',
      'view_customer_identity_audit', 'review_customer_entry_conflict', 'submit_customer_purchase_claim',
      'review_customer_purchase_claim_data', 'review_customer_purchase_claim_financial',
      'update_customer_contact_status'
    ]
  },
  {
    id: 'role_treasury_manager',
    code: 'TREASURY_MGR',
    name: 'مدیر خزانه‌داری (Treasury Manager)',
    description: 'تایید نهایی مبالغ، صدور دستور واریز بانکی، عودت فاکتورها و مشاهده گزارشات کامل',
    isSystemRole: true,
    domain: 'treasury',
    permissions: [
      'create_request', 'view_all_requests', 'approve_treasury',
      'execute_payment', 'return_reject_request', 'manage_cost_centers', 'manage_vendors',
      'export_archive', 'export_bank_batch', 'view_analytics', 'view_support_reports'
    ]
  },
  {
    id: 'role_branch_approver',
    code: 'BRANCH_MGR',
    name: 'مدیر / سرپرست شعبه (Branch Manager)',
    description: 'بررسی و تایید اولیه درخواست‌های خریداران شعب اختصاصی تحت سرپرستی و ارجاع به خزانه‌داری',
    isSystemRole: true,
    domain: 'treasury',
    permissions: [
      'create_request', 'view_branch_requests', 'approve_branch_request', 'return_reject_request',
      'manage_vendors', 'view_analytics'
    ]
  },
  {
    id: 'role_treasury_executor',
    code: 'BANK_EXEC',
    name: 'کارمند اجرای پرداخت (Bank Executor)',
    description: 'اجرای واریز بانکی پایا / کارت به کارت، آپلود فیش‌های واریزی و ثبت نهایی در سیستم',
    isSystemRole: true,
    domain: 'treasury',
    permissions: [
      'view_all_requests', 'execute_payment', 'manage_vendors', 'export_archive', 'export_bank_batch'
    ]
  },
  {
    id: 'role_purchaser',
    code: 'PURCHASER',
    name: 'درخواست‌کننده / مسئول خرید شعب',
    description: 'ثبت درخواست جدید پرداخت فاکتور، آپلود مدرک و پیگیری روند تاییدیه خود',
    isSystemRole: true,
    domain: 'treasury',
    permissions: [
      'create_request', 'view_branch_requests', 'manage_vendors'
    ]
  },
  {
    id: 'role_support_agent',
    code: 'SUPPORT_AGENT',
    name: 'کارشناس پشتیبانی و خدمات پس از فروش',
    description: 'ثبت پرونده‌های تماس مشتریان، پیگیری شکایات و ثبت درخواست عودت وجه جهت تایید مالی',
    isSystemRole: true,
    domain: 'after_sales',
    permissions: [
      'manage_support_cases'
    ]
  },
  {
    id: 'role_financial_approver',
    code: 'FINANCIAL_APPROVER',
    name: 'کارشناس تایید مالی (خدمات پس از فروش)',
    description: 'بررسی و تایید یا رد مبالغ عودتی ثبت‌شده توسط پشتیبانی، پیش از ارسال به کارتابل خزانه‌داری',
    isSystemRole: true,
    domain: 'after_sales',
    permissions: [
      'financial_approve_support'
    ]
  },

  // ============================================================
  // نقش‌های رسمی سازمان فروش — رکورد واقعی و قابل‌مدیریت در «نقش‌ها و دسترسی‌ها»، نه صرفاً
  // customPermissions روی کاربر. شناسه‌ی فنی (id/code) پایدار و مستقل از roleTitle آزاد است؛
  // تشخیص نقش هرجا لازم باشد باید از roleId/پرمیشن مؤثر باشد، نه roleTitle.includes(...).
  // عمداً بدون manage_vendors/create_request/view_branch_requests: هیچ نقش فروش نباید به‌صورت
  // پیش‌فرض دسترسی مالی/دفترچه ذینفعان بگیرد (docs/BUSINESS_RULES.md).
  // ============================================================
  {
    id: 'role_salesperson',
    code: 'SALESPERSON',
    name: 'فروشنده',
    description: 'ثبت/پیگیری مشتری، شروع و بستن چرخه‌ی فروش با مشتریان خودش',
    isSystemRole: true,
    organizationalLevel: 1,
    allowedParentRoleIds: ['role_sales_supervisor'],
    implementationStatus: 'active',
    domain: 'sales',
    permissions: [
      'sales_access', 'view_own_customers', 'search_customer_by_phone', 'create_customer',
      'edit_customer_basic_info', 'view_customer_contact_fields', 'start_sale_cycle', 'close_sale_cycle',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim',
      'view_sales_queue', 'log_call_outcome',
      'create_sales_invoice', 'view_own_invoices', 'edit_invoice_draft', 'record_declared_payment',
      'submit_sales_invoice_to_supervisor'
    ]
  },
  {
    id: 'role_sales_supervisor',
    code: 'SALES_SUPERVISOR',
    name: 'سرپرست فروش',
    description: 'می‌تواند چند فروشنده زیرمجموعه داشته باشد؛ دید و مدیریت مشتریان تیم مستقیم + ارجاع Lead',
    isSystemRole: true,
    organizationalLevel: 2,
    allowedParentRoleIds: ['role_senior_sales_supervisor'],
    implementationStatus: 'active',
    domain: 'sales',
    permissions: [
      'sales_access', 'view_own_customers', 'search_customer_by_phone', 'create_customer',
      'edit_customer_basic_info', 'view_customer_contact_fields', 'start_sale_cycle', 'close_sale_cycle',
      'view_team_customers', 'assign_sales_lead', 'reassign_sales_lead', 'drain_salesperson_queue',
      'view_sales_reports', 'view_customer_address', 'view_customer_purchase_history',
      'view_customer_call_history', 'view_customer_complaint_summary',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim',
      'view_sales_queue', 'log_call_outcome',
      'create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft',
      'record_declared_payment', 'submit_sales_invoice_to_supervisor', 'return_invoice_to_salesperson',
      'approve_sales_invoice_supervisor_step'
    ]
  },
  {
    id: 'role_senior_sales_supervisor',
    code: 'SENIOR_SALES_SUPERVISOR',
    name: 'سرپرست ارشد فروش',
    description: 'می‌تواند چند سرپرست فروش زیرمجموعه داشته باشد؛ دید کل زیردرخت سازمانی سرپرستان',
    isSystemRole: true,
    organizationalLevel: 3,
    allowedParentRoleIds: ['role_sales_manager'],
    implementationStatus: 'active',
    domain: 'sales',
    permissions: [
      'sales_access', 'view_own_customers', 'search_customer_by_phone', 'create_customer',
      'edit_customer_basic_info', 'view_customer_contact_fields', 'start_sale_cycle', 'close_sale_cycle',
      'assign_sales_lead', 'reassign_sales_lead', 'drain_salesperson_queue', 'view_sales_reports',
      'view_customer_address', 'view_customer_purchase_history', 'view_customer_call_history',
      'view_customer_complaint_summary', 'view_descendant_customers', 'view_customer_complaint_details',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim',
      'view_sales_queue', 'log_call_outcome',
      'create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft',
      'record_declared_payment', 'submit_sales_invoice_to_supervisor', 'return_invoice_to_salesperson',
      'approve_sales_invoice_supervisor_step'
    ]
  },
  {
    id: 'role_sales_manager',
    code: 'SALES_MANAGER',
    name: 'مدیر فروش',
    description: 'می‌تواند چند شعبه، سرپرست ارشد و ساختار فروش زیرمجموعه داشته باشد',
    isSystemRole: true,
    organizationalLevel: 4,
    allowedParentRoleIds: ['role_sales_deputy'],
    implementationStatus: 'active',
    domain: 'sales',
    permissions: [
      'sales_access', 'view_own_customers', 'search_customer_by_phone', 'create_customer',
      'edit_customer_basic_info', 'view_customer_contact_fields', 'start_sale_cycle', 'close_sale_cycle',
      'assign_sales_lead', 'reassign_sales_lead', 'drain_salesperson_queue', 'view_sales_reports',
      'view_customer_address', 'view_customer_purchase_history', 'view_customer_call_history',
      'view_customer_complaint_summary', 'view_descendant_customers', 'view_customer_complaint_details',
      'manage_sales_hierarchy',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim',
      'view_sales_queue', 'log_call_outcome',
      'create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft',
      'record_declared_payment', 'submit_sales_invoice_to_supervisor', 'return_invoice_to_salesperson',
      'approve_sales_invoice_supervisor_step'
    ]
  },
  {
    id: 'role_sales_deputy',
    code: 'SALES_DEPUTY',
    name: 'معاونت فروش',
    description: 'می‌تواند چند مدیر فروش و ساختار زیرمجموعه داشته باشد — بالاترین سطح عملیاتی فروش؛ ادمین سیستم محسوب نمی‌شود و دسترسی خودکار به بخش‌های فنی/کاربران سیستمی/خزانه/دفترچه مالی نمی‌گیرد',
    isSystemRole: true,
    organizationalLevel: 5,
    allowedParentRoleIds: [],
    implementationStatus: 'active',
    domain: 'sales',
    permissions: [
      'sales_access', 'view_own_customers', 'search_customer_by_phone', 'create_customer',
      'edit_customer_basic_info', 'view_customer_contact_fields', 'start_sale_cycle', 'close_sale_cycle',
      'assign_sales_lead', 'reassign_sales_lead', 'drain_salesperson_queue', 'view_sales_reports',
      'view_customer_address', 'view_customer_purchase_history', 'view_customer_call_history',
      'view_customer_complaint_summary', 'view_descendant_customers', 'view_customer_complaint_details',
      'manage_sales_hierarchy', 'configure_sales_field_visibility',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim',
      'view_sales_queue', 'log_call_outcome',
      'create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft',
      'record_declared_payment', 'submit_sales_invoice_to_supervisor', 'return_invoice_to_salesperson',
      'approve_sales_invoice_supervisor_step'
    ]
  },

  // مسئول بانک داده، Import، بررسی ورودی‌ها و تخصیص Lead — زیرساخت Import/تبلیغات/Lead هنوز
  // در فاز بعد است، ولی فاز ۱ CRM (پروفایل یکپارچه، ادغام/جداسازی، بررسی تعارض ورود اطلاعات،
  // مرحلهٔ داده‌ای ادعای خرید) اکنون صفحهٔ عملیاتی واقعی دارد؛ implementationStatus به 'active'
  // تغییر کرد. علاوه بر مجوزهای ادغام/جدید، مجوزهای «قدیمی» مشاهدهٔ نام/تلفن/نشانی/تاریخچه هم
  // اضافه شدند — بدون آن‌ها مدیر داده عملاً نمی‌توانست پروفایل‌ها را برای تصمیم Merge ببیند.
  // عمداً بدون view_customer_complaint_details — جزئیات تفصیلی شکایت فقط با نیاز تجاری صریح بعداً.
  {
    id: 'role_data_manager',
    code: 'DATA_MANAGER',
    name: 'مدیر داده',
    description: 'مسئول بانک داده، Import، بررسی تعارض‌های ورودی، تخصیص Lead و ادغام/جداسازی پروفایل یکپارچهٔ مشتری',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'data',
    permissions: [
      'data_management_access', 'import_raw_contacts', 'review_import_conflicts', 'view_raw_contact_pool',
      'assign_sales_lead', 'reassign_sales_lead', 'configure_lead_assignment', 'view_data_reports',
      'view_customer_contact_fields', 'view_customer_address', 'edit_customer_basic_info', 'create_customer',
      'view_customer_call_history', 'view_customer_purchase_history', 'view_customer_complaint_summary',
      'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'review_customer_merge_queue',
      'approve_reject_customer_merge', 'select_customer_primary_value', 'split_customer_merge',
      'view_customer_identity_audit', 'review_customer_entry_conflict', 'submit_customer_purchase_claim',
      'review_customer_purchase_claim_data'
    ]
  },
  {
    id: 'role_advertising_operator',
    code: 'ADVERTISING_OPERATOR',
    name: 'اپراتور تبلیغات',
    description: 'مسئول ثبت کمپین، کانال ورودی و بررسی اولیه Lead — قلمرو فعالیت توسط مدیر داده تعیین می‌شود',
    isSystemRole: true,
    // فاز فروش تا ثبت فاکتور (Commit 2): پنل واقعی کمپین و تبدیل به Lead ساخته شد؛ از
    // infrastructure_ready به active تغییر کرد — مجوزهای زیر بدون تغییر باقی ماندند.
    implementationStatus: 'active',
    domain: 'advertising',
    permissions: [
      'advertising_access', 'manage_advertising_campaigns', 'review_incoming_leads',
      'convert_interaction_to_lead', 'view_campaign_reports'
    ]
  },

  // دو نقش مستقل از سلسله‌مراتب فروش (docs/LEGACY_CRM_ANALYSIS_AND_END_TO_END_SALES_FLOW.md
  // بخش ۳): واحد ثبت (ورود اطلاعات فاکتور کاغذی به نمایندگی فروشنده) و واحد شنود (کنترل
  // کیفیت تماس) — دو مجوز کاملاً جدا، هرگز نباید با هم یا با تایید مالی/ثبت فاکتور یکی شوند.
  // هیچ‌کدام: تایید Merge، تغییر مقدار اصلی، اجرای Split، یا مجوز مالی/دفترچهٔ ذینفعان.
  {
    id: 'role_data_entry_unit',
    code: 'DATA_ENTRY_UNIT',
    name: 'واحد ثبت',
    description: 'ورود اطلاعات فروش از برگهٔ فاکتور کاغذی به نمایندگی فروشنده اصلی — مستقل از واحد شنود و تایید مالی',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'registration',
    permissions: [
      'search_customer_global', 'view_customer_profile', 'view_customer_contact_fields', 'view_customer_address',
      'create_customer', 'edit_customer_basic_info', 'view_customer_merge_candidates',
      'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim',
      'register_invoice_on_behalf', 'bulk_import_invoices', 'view_promotions', 'record_declared_payment', 'view_own_invoices',
      'edit_invoice_draft', 'submit_sales_invoice_to_supervisor'
    ]
  },
  {
    id: 'role_call_monitoring_unit',
    code: 'CALL_MONITORING_UNIT',
    name: 'واحد شنود',
    description: 'کنترل کیفیت و شنود تماس‌های فروش — مستقل از واحد ثبت و تایید مالی',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'monitoring',
    permissions: [
      'search_customer_global', 'view_customer_profile', 'view_customer_contact_fields', 'view_customer_call_history',
      'view_customer_merge_candidates', 'request_customer_merge', 'view_own_merge_requests',
      'update_customer_contact_status'
    ]
  },

  // نقش‌های مستقل کاتالوگ؛ دیدن قیمت خرید/بهای داخلی در هیچ‌کدام ضمنی نیست.
  {
    id: 'role_product_manager',
    code: 'PRODUCT_MANAGER',
    name: 'مدیر کالا',
    description: 'مدیریت نسخه‌دار مشخصات و وضعیت کالا؛ بدون مشاهده ضمنی قیمت خرید',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'sales',
    permissions: ['manage_products']
  },
  {
    id: 'role_service_catalog_manager',
    code: 'SERVICE_CATALOG_MANAGER',
    name: 'مدیر خدمات',
    description: 'مدیریت نسخه‌دار کاتالوگ خدمت؛ مستقل از کارتابل اجرای خدمت',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'sales',
    permissions: ['manage_services']
  },
  {
    id: 'role_promotion_manager',
    code: 'PROMOTION_MANAGER',
    name: 'مدیر پروموشن',
    description: 'مدیریت نسخه‌دار پروموشن و قیمت نهایی مستقل؛ بدون مدیریت ضمنی کالا و خدمت',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'sales',
    permissions: ['manage_promotions', 'view_promotions']
  },

  // نقش‌های آینده‌ی فروش — «آماده برای توسعه آینده»: تا وقتی فلوی مربوطه پیاده نشده، هیچ
  // مجوز حساس (مالی/مشتریان عمومی/اطلاعات سایر واحد) نمی‌گیرند.
  // استثنا: role_sales_payment_approver اکنون مرحلهٔ مالی ادعای خرید (فاز ۱ CRM) را دارد —
  // implementationStatus 'active' شد، ولی عمداً فقط همین یک مجوز را گرفت، نه view_customer_profile
  // یا هیچ مجوز مشاهدهٔ کامل پروفایل/شکایت/دفترچهٔ نامرتبط؛ دسترسی این نقش فقط از طریق
  // toPurchaseClaimFinancialView (View Model حداقلی) است.
  {
    id: 'role_sales_payment_approver',
    code: 'SALES_PAYMENT_APPROVER',
    name: 'مسئول تأیید مالی واریزی فروش',
    description: 'مستقل از تاییدکننده مالی خدمات پس از فروش و خزانه‌داری — بررسی مرحلهٔ مالی ادعای خرید مشتری',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'sales_finance',
    permissions: ['review_customer_purchase_claim_financial']
  },
  {
    id: 'role_sales_financial_manager',
    code: 'SALES_FINANCIAL_MANAGER',
    name: 'مدیر تأیید مالی فروش',
    description: 'مدیریت صف و توزیع پرونده‌های تأیید مالی فروش، رفع توقف مشکوک و نظارت بر مسئولان مالی',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'sales_finance',
    permissions: [
      'view_sales_financial_queue', 'claim_sales_financial_review', 'decide_sales_declared_payment',
      'return_sales_invoice_financial_correction', 'manage_sales_financial_distribution',
      'release_sales_financial_hold', 'review_invoice_financial_confirmation'
    ]
  },
  // سه نقش زیر infrastructure_ready بودند؛ با اجرای واقعی چرخهٔ اجرای کالا/خدمت (مأموریت
  // تکمیلی فاکتور ترکیبی) به active تغییر کردند — هرکدام فقط یک مجوز عملیاتی حداقلی گرفتند.
  {
    id: 'role_service_activation_officer',
    code: 'SERVICE_ACTIVATION_OFFICER',
    name: 'مسئول فعال‌سازی خدمات',
    description: 'اجرای پروندهٔ خدمت ارجاع‌شده توسط مدیر پروژه — فقط پرونده‌های ارجاع‌شده به خودش را می‌بیند',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'fulfillment',
    permissions: ['execute_service_fulfillment_case']
  },
  {
    id: 'role_dispatch_operator',
    code: 'DISPATCH_OPERATOR',
    name: 'مسئول ارسال و لجستیک',
    description: 'هماهنگی و ارسال پروندهٔ اجرای کالا',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'fulfillment',
    permissions: ['dispatch_product_case']
  },
  {
    id: 'role_delivery_representative',
    code: 'DELIVERY_REPRESENTATIVE',
    name: 'نماینده تحویل',
    description: 'تحویل نهایی پروندهٔ اجرای کالا به مشتری',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'fulfillment',
    permissions: ['deliver_product_case']
  },
  {
    id: 'role_service_project_manager',
    code: 'SERVICE_PROJECT_MANAGER',
    name: 'مدیر پروژهٔ خدمات',
    description: 'دریافت پروندهٔ اجرای خدمت و ارجاع به کارمند اجرا — فقط پرونده‌های حوزهٔ خودش',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'fulfillment',
    permissions: ['manage_service_fulfillment_assignment']
  },

  // پرداخت فوری: نقش مستقل (خارج از سازمان فروش)، عمداً به هیچ کاربر نمونه‌ای assign نمی‌شود.
  {
    id: 'role_emergency_payment_officer',
    code: 'EMERGENCY_PAYMENT_OFFICER',
    name: 'مسئول پرداخت فوری',
    description: 'اجرای پرداخت فوری برای درخواست‌هایی که به مسیر فوری ارجاع شده‌اند (بدون تایید کامل زنجیره عادی)',
    isSystemRole: true,
    domain: 'treasury',
    permissions: [
      'execute_payment', 'execute_emergency_payment'
    ]
  },
  // مدیر کاربران فروش (بند ۲۱ AGENTS.md) — مسئول چرخهٔ عمر نیروی فروش (ایجاد/غیرفعال‌سازی/
  // بایگانی/انتقال/اصلاح‌پیش‌ازاستفاده). عمداً بدون هیچ مجوز مالی/خزانه/دفترچهٔ ذینفعان/شکایت
  // مشتری — این نقش کاملاً مستقل از role_sales_manager/role_data_manager/role_treasury_manager است.
  {
    id: 'role_sales_user_manager',
    code: 'SALES_USER_MANAGER',
    name: 'مدیر کاربران فروش',
    description: 'مدیریت چرخهٔ عمر نیروی فروش: انتقال فروشنده، غیرفعال‌سازی، اصلاح انتصاب پیش از استفاده، نمای بایگانی‌شده',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'sales',
    permissions: [
      'manage_sales_users', 'manage_sales_branches_and_chains', 'review_salesperson_transfer',
      'correct_unused_sales_assignment', 'execute_due_sales_transfers',
      'view_archived_sales_workspace', 'add_archived_sales_note'
    ]
  },
  // هماهنگی فاکتور (بند ۶ سند مادر، مأموریت تکمیل فلو نهایی فاکتور) — دو نقش کاملاً مستقل از
  // سلسله‌مراتب فروش/مالی: مدیر هماهنگی قلمرو کامل صف را می‌بیند و تخصیص می‌دهد؛ مسئول
  // هماهنگی فقط پرونده‌های تخصیص‌یافته به خودش را. هیچ‌کدام مجوز مالی/تأیید سرپرست ندارند.
  {
    id: 'role_coordination_manager',
    code: 'COORDINATION_MANAGER',
    name: 'مدیر هماهنگی',
    description: 'مدیریت صف هماهنگی فاکتور: توزیع پرونده، عبور انتخابی بدون تماس، تأیید/عودت/ارجاع به استثنا',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'coordination',
    permissions: [
      'view_coordination_queue', 'assign_coordination_case', 'claim_coordination_case', 'record_coordination_attempt',
      'approve_coordination', 'return_invoice_for_correction', 'escalate_coordination_case',
      'manage_coordination_distribution', 'bypass_coordination_without_contact'
    ]
  },
  {
    id: 'role_coordination_specialist',
    code: 'COORDINATION_SPECIALIST',
    name: 'مسئول هماهنگی',
    description: 'کار روی پرونده‌های هماهنگی تخصیص‌یافته: تماس، ثبت نتیجه، تأیید یا عودت برای اصلاح',
    isSystemRole: true,
    implementationStatus: 'active',
    domain: 'coordination',
    permissions: [
      'view_coordination_queue', 'claim_coordination_case', 'record_coordination_attempt',
      'approve_coordination', 'return_invoice_for_correction', 'escalate_coordination_case'
    ]
  },
  // نقش پایهٔ خنثی — Compatibility Role برای کاربرانی که هنوز هیچ نقش RBAC واقعی به آن‌ها
  // اختصاص نیافته؛ صفر Permission، هرگز نباید هیچ مجوزی به این نقش اضافه شود.
  {
    id: 'role_basic_user',
    code: 'BASIC_USER',
    name: 'کاربر پایه سیستم',
    description: 'نقش خنثی بدون هیچ دسترسی — Compatibility Role برای کاربرانی که نقش RBAC واقعی هنوز به آن‌ها اختصاص نیافته',
    isSystemRole: true,
    domain: 'general',
    permissions: []
  }
];

// ============================================================
// Migration نقش‌های پیش‌فرض — idempotent، بدون Reset داده‌ی موجود کاربران/نقش‌ها.
// هر بار getRoles() صدا زده می‌شود: نقش‌های موجود در localStorage خوانده می‌شوند؛ هر نقش پایه‌ی
// جدید (از DEFAULT_ROLES) که با id غایب است اضافه می‌شود؛ نقش‌های موجود (چه پیش‌فرض چه سفارشی
// ادمین) هرگز overwrite نمی‌شوند. نسخه‌ی Migration در STORAGE_KEYS.ROLES_MIGRATION_VERSION ثبت
// می‌شود تا اجرای مجدد هیچ‌چیز را تکرار نکند.
// ============================================================
const CURRENT_ROLES_MIGRATION_VERSION = 15;

// نسخه ۲: علاوه بر افزودن نقش‌های کاملاً جدید (role_data_entry_unit/role_call_monitoring_unit —
// خودکار توسط منطق زیر چون id غایب است)، پرمیشن‌های تازهٔ فاز ۱ CRM را روی نقش‌های از‌قبل‌موجود
// در localStorage قدیمی هم Union می‌کند — بدون این کار، مرورگرهایی که قبلاً role_salesperson/
// role_data_manager/role_sales_payment_approver را داشتند این پرمیشن‌های جدید را هرگز نمی‌گرفتند
// (منطق قبلی فقط id غایب را اضافه می‌کرد، permissions نقش موجود را هرگز دست نمی‌زد). این افزودن
// امن است چون این پرمیشن‌ها اصلاً وجود نداشتند، پس هیچ سفارشی‌سازی ادمینی نمی‌تواند عمداً حذفشان
// کرده باشد؛ فقط Union (بدون حذف چیزی)، و User.deniedPermissions هیچ کاربری دست‌نخورده می‌ماند.
const ROLE_PERMISSION_ADDITIONS_V2: Partial<Record<string, SystemPermission[]>> = {
  role_salesperson: ['view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim'],
  role_sales_supervisor: ['view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim'],
  role_senior_sales_supervisor: ['view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim'],
  role_sales_manager: ['view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim'],
  role_sales_deputy: ['view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge', 'view_own_merge_requests', 'submit_customer_purchase_claim'],
  role_data_manager: [
    'view_customer_contact_fields', 'view_customer_address', 'edit_customer_basic_info', 'create_customer',
    'view_customer_call_history', 'view_customer_purchase_history', 'view_customer_complaint_summary',
    'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge',
    'view_own_merge_requests', 'review_customer_merge_queue', 'approve_reject_customer_merge',
    'select_customer_primary_value', 'split_customer_merge', 'view_customer_identity_audit',
    'review_customer_entry_conflict', 'submit_customer_purchase_claim', 'review_customer_purchase_claim_data'
  ],
  role_sales_payment_approver: ['review_customer_purchase_claim_financial'],
  role_super_admin: [
    'view_customer_profile', 'search_customer_global', 'view_customer_merge_candidates', 'request_customer_merge',
    'view_own_merge_requests', 'review_customer_merge_queue', 'approve_reject_customer_merge',
    'select_customer_primary_value', 'split_customer_merge', 'view_customer_identity_audit',
    'review_customer_entry_conflict', 'submit_customer_purchase_claim', 'review_customer_purchase_claim_data',
    'review_customer_purchase_claim_financial', 'update_customer_contact_status'
  ]
};

// نسخه ۳ (Commit 3 فاز فروش تا ثبت فاکتور): صف عملیاتی فروش + ثبت تماس روی ۵ نقش سلسله‌مراتب
// فروش که از قبل در localStorage نصب‌شده بودند — همان قاعدهٔ Union-only، بدون حذف چیزی.
const ROLE_PERMISSION_ADDITIONS_V3: Partial<Record<string, SystemPermission[]>> = {
  role_salesperson: ['view_sales_queue', 'log_call_outcome'],
  role_sales_supervisor: ['view_sales_queue', 'log_call_outcome'],
  role_senior_sales_supervisor: ['view_sales_queue', 'log_call_outcome'],
  role_sales_manager: ['view_sales_queue', 'log_call_outcome'],
  role_sales_deputy: ['view_sales_queue', 'log_call_outcome']
};

// نسخه ۴ (Commit 5 فاز فروش تا ثبت فاکتور): فاکتور فروش و پرداخت اعلامی روی ۵ نقش سلسله‌مراتب
// فروش که از قبل نصب‌شده بودند — همان قاعدهٔ Union-only.
const ROLE_PERMISSION_ADDITIONS_V4: Partial<Record<string, SystemPermission[]>> = {
  role_salesperson: ['create_sales_invoice', 'view_own_invoices', 'edit_invoice_draft', 'record_declared_payment', 'submit_invoice_for_registration_review'],
  role_sales_supervisor: ['create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft', 'record_declared_payment', 'submit_invoice_for_registration_review', 'return_invoice_to_salesperson'],
  role_senior_sales_supervisor: ['create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft', 'record_declared_payment', 'submit_invoice_for_registration_review', 'return_invoice_to_salesperson'],
  role_sales_manager: ['create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft', 'record_declared_payment', 'submit_invoice_for_registration_review', 'return_invoice_to_salesperson'],
  role_sales_deputy: ['create_sales_invoice', 'view_own_invoices', 'view_team_invoices', 'edit_invoice_draft', 'record_declared_payment', 'submit_invoice_for_registration_review', 'return_invoice_to_salesperson']
};

// نسخه ۵ (Commit 6 فاز فروش تا ثبت فاکتور): ثبت به نمایندگی و Import گروهی فاکتور روی
// role_data_entry_unit که از قبل نصب‌شده بود.
const ROLE_PERMISSION_ADDITIONS_V5: Partial<Record<string, SystemPermission[]>> = {
  role_data_entry_unit: ['register_invoice_on_behalf', 'bulk_import_invoices', 'view_promotions', 'record_declared_payment', 'view_own_invoices']
};

// نسخه ۶ (مأموریت تکمیلی چرخهٔ واقعی فاکتور ترکیبی): بررسی ثبت، تأیید مالی ردیفی، و اجرای
// کالا/خدمت روی نقش‌های از‌قبل‌نصب‌شده — همان قاعدهٔ Union-only. سه نقش infrastructure_ready
// (اجرای کالا/خدمت) هم اینجا permissions می‌گیرند تا نصب‌های قدیمی‌تر هم فعال شوند؛ implementationStatus
// آن‌ها جداگانه در پایین همین تابع (نه از طریق این map) به‌روزرسانی می‌شود.
const ROLE_PERMISSION_ADDITIONS_V6: Partial<Record<string, SystemPermission[]>> = {
  role_salesperson: ['submit_invoice_for_registration_review'],
  role_sales_supervisor: ['submit_invoice_for_registration_review'],
  role_senior_sales_supervisor: ['submit_invoice_for_registration_review'],
  role_sales_manager: ['submit_invoice_for_registration_review'],
  role_sales_deputy: ['submit_invoice_for_registration_review'],
  role_data_entry_unit: ['submit_invoice_for_registration_review', 'approve_invoice_registration'],
  role_sales_payment_approver: ['review_invoice_financial_confirmation'],
  role_service_activation_officer: ['execute_service_fulfillment_case'],
  role_dispatch_operator: ['dispatch_product_case'],
  role_delivery_representative: ['deliver_product_case'],
  role_super_admin: [
    'submit_invoice_for_registration_review', 'approve_invoice_registration', 'review_invoice_financial_confirmation',
    'dispatch_product_case', 'deliver_product_case', 'manage_service_fulfillment_assignment', 'execute_service_fulfillment_case'
  ]
};
const ROLE_IMPLEMENTATION_STATUS_UPGRADES_V6: Record<string, 'active'> = {
  role_service_activation_officer: 'active', role_dispatch_operator: 'active', role_delivery_representative: 'active'
};

// نسخه ۸ (مأموریت چرخهٔ عمر نیروی فروش، بند ۲۱ AGENTS.md): درخواست انتقال فقط برای سرپرست
// مستقیم به بالا (فروشندهٔ خودش هرگز این مجوز را نمی‌گیرد)؛ اصلاح اضطراری فقط Super Admin.
const ROLE_PERMISSION_ADDITIONS_V8: Partial<Record<string, SystemPermission[]>> = {
  role_sales_supervisor: ['request_salesperson_transfer'],
  role_senior_sales_supervisor: ['request_salesperson_transfer'],
  role_sales_manager: ['request_salesperson_transfer'],
  role_sales_deputy: ['request_salesperson_transfer'],
  role_super_admin: [
    'manage_sales_users', 'manage_sales_branches_and_chains', 'request_salesperson_transfer',
    'review_salesperson_transfer', 'correct_unused_sales_assignment', 'execute_due_sales_transfers',
    'view_archived_sales_workspace', 'add_archived_sales_note', 'emergency_correct_sales_assignment'
  ]
};

// نسخه ۹ (بدهی #۲ مأموریت اصلاح پذیرش چرخهٔ عمر نیروی فروش): مجوز مستقل تأیید سرپرست فاکتور —
// قبلاً این گام هیچ Permission واقعی نداشت (فقط تطبیق هویت). فقط روی ۴ نقش سرپرستی‌تر + Super
// Admin اعطا می‌شود؛ همان قاعدهٔ Union-only، بدون حذف چیزی و بدون دست‌زدن به deniedPermissions.
const ROLE_PERMISSION_ADDITIONS_V9: Partial<Record<string, SystemPermission[]>> = {
  role_sales_supervisor: ['approve_sales_invoice_supervisor_step'],
  role_senior_sales_supervisor: ['approve_sales_invoice_supervisor_step'],
  role_sales_manager: ['approve_sales_invoice_supervisor_step'],
  role_sales_deputy: ['approve_sales_invoice_supervisor_step'],
  role_super_admin: ['approve_sales_invoice_supervisor_step']
};

// نسخه ۱۰ (مأموریت تکمیل فلو نهایی فاکتور): پس‌گرفتن پیش از اقدام رسمی فقط برای مالک واقعی
// ثبت (۵ نقش سلسله‌مراتب فروش برای مسیر دیجیتال + واحد ثبت برای مسیر کاغذی) — Super Admin
// همان قاعدهٔ همیشگی این پروژه را می‌گیرد (اتحاد کامل مجوزهای جدید، نه Bypass ضمنی).
const ROLE_PERMISSION_ADDITIONS_V10: Partial<Record<string, SystemPermission[]>> = {
  role_salesperson: ['recall_invoice_for_correction'],
  role_sales_supervisor: ['recall_invoice_for_correction'],
  role_senior_sales_supervisor: ['recall_invoice_for_correction'],
  role_sales_manager: ['recall_invoice_for_correction'],
  role_sales_deputy: ['recall_invoice_for_correction'],
  role_data_entry_unit: ['recall_invoice_for_correction'],
  role_super_admin: [
    'recall_invoice_for_correction', 'return_invoice_for_correction', 'view_coordination_queue',
    'assign_coordination_case', 'claim_coordination_case', 'record_coordination_attempt',
    'approve_coordination', 'escalate_coordination_case', 'manage_coordination_distribution',
    'bypass_coordination_without_contact'
  ]
};

const ROLE_PERMISSION_ADDITIONS_V11: Partial<Record<string, SystemPermission[]>> = {
  role_coordination_manager: ['manage_coordination_distribution', 'bypass_coordination_without_contact'],
  role_super_admin: ['manage_coordination_distribution', 'bypass_coordination_without_contact']
};

const ROLE_PERMISSION_ADDITIONS_V13: Partial<Record<string, SystemPermission[]>> = {
  role_sales_payment_approver: [
    'view_sales_financial_queue', 'claim_sales_financial_review',
    'decide_sales_declared_payment', 'return_sales_invoice_financial_correction'
  ],
  role_sales_financial_manager: [
    'view_sales_financial_queue', 'claim_sales_financial_review', 'decide_sales_declared_payment',
    'return_sales_invoice_financial_correction', 'manage_sales_financial_distribution',
    'release_sales_financial_hold', 'review_invoice_financial_confirmation'
  ],
  role_super_admin: [
    'view_sales_financial_queue', 'claim_sales_financial_review', 'decide_sales_declared_payment',
    'return_sales_invoice_financial_correction', 'manage_sales_financial_distribution',
    'release_sales_financial_hold'
  ]
};

const ROLE_PERMISSION_ADDITIONS_V15: Partial<Record<string, SystemPermission[]>> = {
  role_salesperson: ['submit_sales_invoice_to_supervisor'],
  role_sales_supervisor: ['submit_sales_invoice_to_supervisor'],
  role_senior_sales_supervisor: ['submit_sales_invoice_to_supervisor'],
  role_sales_manager: ['submit_sales_invoice_to_supervisor'],
  role_sales_deputy: ['submit_sales_invoice_to_supervisor'],
  role_data_entry_unit: ['edit_invoice_draft', 'submit_sales_invoice_to_supervisor'],
  role_super_admin: ['submit_sales_invoice_to_supervisor']
};

function ensureDefaultRolesMigrated(existingRoles: SystemRole[]): SystemRole[] {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.ROLES_MIGRATION_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;

  if (storedVersion >= CURRENT_ROLES_MIGRATION_VERSION) {
    return existingRoles;
  }

  const existingIds = new Set(existingRoles.map((r) => r.id));
  const missingDefaults = DEFAULT_ROLES.filter((r) => !existingIds.has(r.id));
  let migrated = missingDefaults.length > 0 ? [...existingRoles, ...missingDefaults] : existingRoles;

  if (storedVersion < 2) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V2[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 3) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V3[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 4) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V4[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 5) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V5[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 6) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V6[r.id];
      const statusUpgrade = ROLE_IMPLEMENTATION_STATUS_UPGRADES_V6[r.id];
      if (!additions && !statusUpgrade) return r;
      const union = additions ? Array.from(new Set([...(r.permissions || []), ...additions])) : r.permissions;
      return { ...r, permissions: union, implementationStatus: statusUpgrade || r.implementationStatus };
    });
  }

  // نسخه ۷ (مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش): فیلد کاملاً جدید `domain` را برای
  // نقش‌های از‌قبل‌نصب‌شده از DEFAULT_ROLES پر می‌کند — چون این فیلد قبلاً اصلاً وجود نداشت، هیچ
  // سفارشی‌سازی ادمینی نمی‌تواند حذفش کرده باشد؛ فقط وقتی نقش موجود فاقد domain است backfill
  // می‌شود (نقش سفارشی بدون معادل در DEFAULT_ROLES دست‌نخورده می‌ماند، domain آن undefined است).
  if (storedVersion < 7) {
    migrated = migrated.map((r) => {
      if (r.domain) return r;
      const defaultMatch = DEFAULT_ROLES.find((d) => d.id === r.id);
      return defaultMatch?.domain ? { ...r, domain: defaultMatch.domain } : r;
    });
  }

  if (storedVersion < 8) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V8[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 9) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V9[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 10) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V10[r.id];
      if (!additions) return r;
      const union = Array.from(new Set([...(r.permissions || []), ...additions]));
      return { ...r, permissions: union };
    });
  }

  if (storedVersion < 11) {
    migrated = migrated.map((r) => {
      const withoutRetiredPermission = (r.permissions || []).filter((permission) => String(permission) !== 'configure_auto_coordination');
      const additions = ROLE_PERMISSION_ADDITIONS_V11[r.id] || [];
      return { ...r, permissions: Array.from(new Set([...withoutRetiredPermission, ...additions])) };
    });
  }

  if (storedVersion < 12) {
    migrated = migrated.map((r) => ({
      ...r,
      permissions: (r.permissions || []).filter((permission) => String(permission) !== 'submit_invoice_for_financial_review')
    }));
  }

  if (storedVersion < 13) {
    migrated = migrated.map((r) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V13[r.id];
      if (!additions) return r;
      return { ...r, permissions: Array.from(new Set([...(r.permissions || []), ...additions])) };
    });
  }

  // نسخه ۱۴: نقش تجمیعی قدیمی کاتالوگ به سه نقش مستقل شکسته شد. حذف این دو Permission فقط
  // از System Role قدیمی انجام می‌شود؛ نقش‌های سفارشی و Deny/Grant کاربران دست‌نخورده‌اند.
  if (storedVersion < 14) {
    migrated = migrated.map((role) => role.id === 'role_promotion_manager'
      ? { ...role, permissions: (role.permissions || []).filter((permission) => !['manage_products', 'manage_services'].includes(permission)) }
      : role);
  }

  // نسخه ۱۵: واحد ثبت دیگر Gate تأیید میانی نیست. فقط System Roleهای پایه از Permissionهای
  // منسوخ پاک می‌شوند؛ نقش سفارشی دست‌نخورده می‌ماند و Permission ارسال مستقیم افزوده می‌شود.
  if (storedVersion < 15) {
    const baseIds = new Set(Object.keys(ROLE_PERMISSION_ADDITIONS_V15));
    migrated = migrated.map((role) => {
      const additions = ROLE_PERMISSION_ADDITIONS_V15[role.id] || [];
      const current = baseIds.has(role.id)
        ? (role.permissions || []).filter((permission) => !['submit_invoice_for_registration_review', 'approve_invoice_registration'].includes(permission))
        : (role.permissions || []);
      return additions.length > 0 ? { ...role, permissions: Array.from(new Set([...current, ...additions])) } : role;
    });
  }

  setStoredData(STORAGE_KEYS.ROLES, migrated);
  localStorage.setItem(STORAGE_KEYS.ROLES_MIGRATION_VERSION, String(CURRENT_ROLES_MIGRATION_VERSION));

  return migrated;
}

// Migration کاربران پیش‌فرض — همان الگوی ensureDefaultRolesMigrated: idempotent، فقط افزودنی.
// اصلاح باگ کشف‌شده در QA فاز ۱ CRM: getUsers() قبلاً DEFAULT_USERS را فقط به‌عنوان مقدار
// پیش‌فرض getStoredData (یعنی فقط وقتی هیچ‌چیز اصلاً ذخیره نشده) استفاده می‌کرد — به محض اینکه
// یک بار هر آرایهٔ کاربران در localStorage ذخیره می‌شد، کاربران Demo جدیدی که بعداً به
// DEFAULT_USERS اضافه می‌شدند (مثل user_data_entry_unit_1/user_call_monitoring_unit_1) هرگز به
// نصب‌های موجود اضافه نمی‌شدند. این تابع دقیقاً مثل نقش‌ها، فقط شناسه‌های غایب را اضافه می‌کند؛
// هیچ کاربر موجودی (حتی اگر ادمین رمز/نقش آن را تغییر داده باشد) هرگز overwrite نمی‌شود.
const CURRENT_USERS_MIGRATION_VERSION = 6;

function ensureDefaultUsersMigrated(existingUsers: User[]): User[] {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.USERS_MIGRATION_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;

  if (storedVersion >= CURRENT_USERS_MIGRATION_VERSION) {
    return existingUsers;
  }

  const existingIds = new Set(existingUsers.map((u) => u.id));
  const missingDefaults = DEFAULT_USERS.filter((u) => !existingIds.has(u.id));
  const migrated = missingDefaults.length > 0 ? [...existingUsers, ...missingDefaults] : existingUsers;

  setStoredData(STORAGE_KEYS.USERS, migrated);
  localStorage.setItem(STORAGE_KEYS.USERS_MIGRATION_VERSION, String(CURRENT_USERS_MIGRATION_VERSION));

  return migrated;
}

// نرمال‌سازی Legacy یک‌باره برای نصب‌های قدیمی localStorage (مأموریت بازسازی کاربران/نقش‌ها/سازمان
// فروش): پیش از این مأموریت، کاربران غیرمالی (فروش، مدیر داده، تبلیغات، ثبت/شنود، پروموشن، اجرای
// کالا/خدمت و...) صرفاً چون در آن زمان تنها گزینهٔ غیرِ خزانه همین بود، role:'requestor' داشتند.
// این تابع عمداً از ensureDefaultUsersMigrated جدا است (آن تابع طبق قرارداد پروژه فقط شناسهٔ غایب
// اضافه می‌کند، نه تغییر مقدار رکورد موجود) و فقط user.role==='requestor' که roleId واقعی‌شان طبق
// LEGACY_ROLE_BY_ID/deriveLegacyUserRoleFromAssignedRoles به requestor نگاشت نمی‌شود (یعنی واقعاً
// role_purchaser نیستند) را به 'member' تبدیل می‌کند. role_purchaser واقعی، رمز، additionalRoleIds،
// deniedPermissions، roleAccessOverrides و هر ویرایش دستی دیگر دست‌نخورده می‌ماند. Idempotent است.
// نسخه ۲: باگ نسخه ۱ اصلاح شد — کاربری که roleId صریح ندارد (اکثر کاربران قدیمی، از جمله
// خریدار واقعی) باید طبق همان قاعدهٔ getAssignedRoleIds اول به roleId پیش‌فرض نقشِ Legacyِ خودش
// Fallback کند، نه این‌که roleId نداشتن را «هیچ نقشی ندارد» تعبیر کند. نسخهٔ ۱ این Fallback را
// نداشت و در نتیجه کاربر خریدار واقعی بدون roleId صریح را به‌اشتباه از 'requestor' به 'member'
// تبدیل می‌کرد — دقیقاً همان چیزی که این Migration باید هرگز انجام ندهد.
// نسخه ۳: نصب‌هایی که نسخهٔ ۱ روی آن‌ها واقعاً اجرا شده بود، همین حالا هم role='member' نادرست
// ذخیره‌شده دارند — نسخهٔ ۲ این رکوردهای از‌قبل‌خراب‌شده را ترمیم نمی‌کرد چون شرط ورودی‌اش
// role==='requestor' بود، نه 'member'. این نسخه یک ترمیم محدود و ایمن اضافه می‌کند: فقط کاربری
// که (الف) شناسه‌اش دقیقاً با یک رکورد DEFAULT_USERS یکی است، (ب) آن رکورد پیش‌فرض هنوز
// role:'requestor' دارد (یعنی این کاربر هرگز جزو ۱۵ کاربر عمداً 'member'‌شده نبود)، و (ج) roleId
// کاربر فعلی صریحاً تنظیم نشده (یعنی هیچ ادمینی دستی چیزی برایش انتخاب نکرده) — role را به
// 'requestor' برمی‌گرداند. این سه شرط با هم تضمین می‌کنند فقط خرابی واقعی نسخهٔ ۱ ترمیم شود، نه
// هیچ تنظیم دستی یا کاربر جدید دیگری.
const CURRENT_LEGACY_ROLE_NORMALIZATION_VERSION = 3;

function ensureLegacyUserRoleNormalized(existingUsers: User[]): User[] {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.USERS_LEGACY_ROLE_NORMALIZATION_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;

  if (storedVersion >= CURRENT_LEGACY_ROLE_NORMALIZATION_VERSION) {
    return existingUsers;
  }

  let changed = false;
  const normalized = existingUsers.map((u) => {
    if (u.role === 'member' && !u.roleId) {
      const defaultMatch = DEFAULT_USERS.find((d) => d.id === u.id);
      if (defaultMatch && defaultMatch.role === 'requestor') {
        changed = true;
        return { ...u, role: 'requestor' as UserRole };
      }
    }
    if (u.role !== 'requestor') return u;
    const roleIds = Array.from(new Set([u.roleId || DEFAULT_ROLE_ID_MAP[u.role], ...(u.additionalRoleIds || [])].filter(Boolean))) as string[];
    const derivedRole = deriveLegacyUserRoleFromAssignedRoles(roleIds);
    if (derivedRole === 'requestor') return u;
    changed = true;
    return { ...u, role: derivedRole };
  });

  if (changed) {
    setStoredData(STORAGE_KEYS.USERS, normalized);
  }
  localStorage.setItem(STORAGE_KEYS.USERS_LEGACY_ROLE_NORMALIZATION_VERSION, String(CURRENT_LEGACY_ROLE_NORMALIZATION_VERSION));

  return normalized;
}

// Default Companies
export const DEFAULT_COMPANIES: Company[] = [
  { id: 'comp_mother', name: 'شرکت مادر', code: 'MTH', description: 'هلدینگ مرکزی و شرکت مادر' },
  { id: 'comp_shavaz', name: 'شرکت شاواز', code: 'SHV', description: 'تجارت الکترونیک و فروش آنلاین شاواز' },
  { id: 'comp_store', name: 'شرکت استور', code: 'STR', description: 'مدیریت استورها و انبارها' },
  { id: 'comp_sales', name: 'شرکت فروش', code: 'SLS', description: 'مدیریت شعبه‌ها و شبکه فروش' },
  { id: 'comp_maximum', name: 'شرکت ماکسیمم', code: 'MAX', description: 'خدمات لوجستیک ماکسیمم' },
  { id: 'comp_ibazar', name: 'شرکت آی بازار', code: 'IBZ', description: 'پلتفرم تجارت آی بازار' },
];

// Default Company Bank Accounts
export const DEFAULT_COMPANY_BANK_ACCOUNTS: CompanyBankAccount[] = [
  { id: 'cba_1', companyId: 'comp_mother', companyName: 'شرکت مادر', bankName: 'بانک ملی ایران', accountNumber: '0102938475001', shebaNumber: 'IR120170000000102938475001', cardNumber: '6037-9918-1000-2001', accountTitle: 'حساب اصلی خزانه‌داری هلدینگ مرکزی', isActive: true },
  { id: 'cba_2', companyId: 'comp_shavaz', companyName: 'شرکت شاواز', bankName: 'بانک ملت', accountNumber: '021983741002', shebaNumber: 'IR890120000000021983741002', cardNumber: '6104-3378-2000-3002', accountTitle: 'حساب درگاه فروش آنلاین شاواز', isActive: true },
  { id: 'cba_3', companyId: 'comp_shavaz', companyName: 'شرکت شاواز', bankName: 'بانک سامان', accountNumber: '031029382003', shebaNumber: 'IR540570000000031029382003', cardNumber: '6219-8610-3000-4003', accountTitle: 'حساب مسدودی درگاه پلتفرم شاواز', isActive: true },
  { id: 'cba_4', companyId: 'comp_store', companyName: 'شرکت استور', bankName: 'بانک پاسارگاد', accountNumber: '041029383004', shebaNumber: 'IR780560000000041029383004', cardNumber: '5022-2910-4000-5004', accountTitle: 'حساب خریدهای استور و انبارها', isActive: true },
  { id: 'cba_5', companyId: 'comp_sales', companyName: 'شرکت فروش', bankName: 'بانک تجارت', accountNumber: '051029384005', shebaNumber: 'IR180180000000051029384005', cardNumber: '6273-5310-5000-6005', accountTitle: 'حساب واریزی و فروش شعب', isActive: true },
  { id: 'cba_6', companyId: 'comp_maximum', companyName: 'شرکت ماکسیمم', bankName: 'بانک صادرات', accountNumber: '061029385006', shebaNumber: 'IR190190000000061029385006', cardNumber: '6037-6910-6000-7006', accountTitle: 'حساب لجستیک ماکسیمم', isActive: true },
  { id: 'cba_7', companyId: 'comp_ibazar', companyName: 'شرکت آی بازار', bankName: 'بانک پارسیان', accountNumber: '071029386007', shebaNumber: 'IR200200000000071029386007', cardNumber: '6221-0610-7000-8007', accountTitle: 'حساب درگاه پلتفرم آی بازار', isActive: true },
];

// Default Cost Centers (8 Sales Branches + Store + Central) with Monthly Budgets
export const DEFAULT_COST_CENTERS: CostCenter[] = [
  { id: 'cc_saadatabad', companyId: 'comp_sales', name: 'سعادت آباد', code: 'CC-101', description: 'شعبه فروش سعادت آباد', monthlyBudget: 500000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_poonak', companyId: 'comp_sales', name: 'پونک', code: 'CC-102', description: 'شعبه فروش پونک روز', monthlyBudget: 450000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_poonak_night', companyId: 'comp_sales', name: 'پونک شب', code: 'CC-103', description: 'شعبه فروش پونک شیفت شب', monthlyBudget: 350000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_mokhberi_1', companyId: 'comp_sales', name: 'مخبری یک', code: 'CC-104', description: 'شعبه فروش مخبری ۱', monthlyBudget: 300000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_mokhberi_4', companyId: 'comp_sales', name: 'مخبری چهار', code: 'CC-105', description: 'شعبه فروش مخبری ۴', monthlyBudget: 300000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_fakhar', companyId: 'comp_sales', name: 'فخار مقدم', code: 'CC-106', description: 'شعبه فروش فخار مقدم', monthlyBudget: 400000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_azadi', companyId: 'comp_sales', name: 'آزادی', code: 'CC-107', description: 'شعبه فروش آزادی', monthlyBudget: 400000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_store_branch', companyId: 'comp_store', name: 'استور (مرکز هزینه انبار و تجهیزات)', code: 'CC-201', description: 'مرکز هزینه استور و تجهیزات فروشگاهی', monthlyBudget: 1200000000, budgetPeriod: 'مرداد ۱۴۰۳' },
  { id: 'cc_hq', companyId: 'comp_mother', name: 'دفتر مرکزی / عمومی', code: 'CC-001', description: 'مرکز هزینه ستادی دفتر مرکزی', monthlyBudget: 1500000000, budgetPeriod: 'مرداد ۱۴۰۳' },
];

// ============================================================
// شعبهٔ فروش (SalesBranch) — Entity واقعی و مستقل از CostCenter (مأموریت بازسازی کاربران/نقش‌ها/
// سازمان فروش). هفت شعبهٔ فروش نمونهٔ موجود (سعادت‌آباد، پونک، پونک شب، مخبری یک/چهار، فخار
// مقدم، آزادی) به‌صورت Migration افزایشی از روی مراکز هزینهٔ مالی متناظرشان ساخته شده‌اند —
// linkedCostCenterId فقط برای تطبیق/گزارش مالی است، هرگز منبع Permission/سلسله‌مراتب فروش.
// عمداً بدون cc_store_branch/cc_hq: مدیر فروش/معاونت با شعبهٔ جعلی «دفتر مرکزی» نمایش داده
// نمی‌شوند — آن‌ها مجموعهٔ واقعی شعب فروش زیرمجموعه را دارند (پایین‌تر در DEFAULT_SALES_ORG_ASSIGNMENTS).
// ============================================================
export const DEFAULT_SALES_BRANCHES: SalesBranch[] = [
  { id: 'sb_saadatabad', code: 'SB-101', name: 'سعادت آباد', companyId: 'comp_sales', linkedCostCenterId: 'cc_saadatabad', isActive: true },
  { id: 'sb_poonak', code: 'SB-102', name: 'پونک', companyId: 'comp_sales', linkedCostCenterId: 'cc_poonak', isActive: true },
  { id: 'sb_poonak_night', code: 'SB-103', name: 'پونک شب', companyId: 'comp_sales', linkedCostCenterId: 'cc_poonak_night', isActive: true },
  { id: 'sb_mokhberi_1', code: 'SB-104', name: 'مخبری یک', companyId: 'comp_sales', linkedCostCenterId: 'cc_mokhberi_1', isActive: true },
  { id: 'sb_mokhberi_4', code: 'SB-105', name: 'مخبری چهار', companyId: 'comp_sales', linkedCostCenterId: 'cc_mokhberi_4', isActive: true },
  { id: 'sb_fakhar', code: 'SB-106', name: 'فخار مقدم', companyId: 'comp_sales', linkedCostCenterId: 'cc_fakhar', isActive: true },
  { id: 'sb_azadi', code: 'SB-107', name: 'آزادی', companyId: 'comp_sales', linkedCostCenterId: 'cc_azadi', isActive: true }
];

const ALL_SALES_BRANCH_IDS = DEFAULT_SALES_BRANCHES.map((b) => b.id);

// ============================================================
// زنجیرهٔ Demo کامل و بدون حلقهٔ پنج‌سطحی سازمان فروش — همان پنج کاربر Demo موجود
// (user_sales_person_1 ← ... ← user_sales_deputy_1)، این‌بار با انتصاب واقعی SalesOrgAssignment
// (نه فقط User.salesSupervisorId). سطوح بالاتر عمداً چند شعبه دارند تا «مدیران بالاتر می‌توانند
// چند شعبه داشته باشند» از روز اول در Demo قابل مشاهده/تست باشد؛ هر سطح دقیقاً شعبه‌های سطح
// پایین‌ترِ خودش را پوشش می‌دهد (قاعدهٔ Coverage در validateSalesAssignment).
// ============================================================
// زنجیره‌های ثابت داخل شعبه (بند ۲۱ AGENTS.md) — یک شعبه می‌تواند چند زنجیره داشته باشد؛
// دو زنجیره در سعادت‌آباد عمداً برای سناریوی Demo انتقال فروشنده بین زنجیره‌های همان شعبه.
export const DEFAULT_SALES_CHAINS: SalesChain[] = [
  { id: 'sc_saadatabad_a', code: 'SC-SDA-A', name: 'سعادت آباد — تیم الف', salesBranchId: 'sb_saadatabad', isActive: true, createdAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', createdByUserId: 'system_seed' },
  { id: 'sc_saadatabad_b', code: 'SC-SDA-B', name: 'سعادت آباد — تیم ب', salesBranchId: 'sb_saadatabad', isActive: true, createdAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', createdByUserId: 'system_seed' },
  { id: 'sc_poonak_a', code: 'SC-PNK-A', name: 'پونک — تیم الف', salesBranchId: 'sb_poonak', isActive: true, createdAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', createdByUserId: 'system_seed' }
];

export const DEFAULT_SALES_ORG_ASSIGNMENTS: SalesOrgAssignment[] = [
  {
    id: 'sassign_sales_person_1', userId: 'user_sales_person_1', salesRoleId: 'role_salesperson',
    salesBranchIds: ['sb_saadatabad'], salesChainIds: ['sc_saadatabad_a'], directManagerUserId: 'user_sales_supervisor_1',
    validFrom: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', isActive: true, changedByUserId: 'system_seed', changedAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰'
  },
  {
    id: 'sassign_sales_supervisor_1', userId: 'user_sales_supervisor_1', salesRoleId: 'role_sales_supervisor',
    salesBranchIds: ['sb_saadatabad', 'sb_poonak'], salesChainIds: ['sc_saadatabad_a', 'sc_poonak_a'], directManagerUserId: 'user_sales_senior_supervisor_1',
    validFrom: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', isActive: true, changedByUserId: 'system_seed', changedAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰'
  },
  {
    id: 'sassign_senior_supervisor_1', userId: 'user_sales_senior_supervisor_1', salesRoleId: 'role_senior_sales_supervisor',
    salesBranchIds: ['sb_saadatabad', 'sb_poonak', 'sb_poonak_night'], directManagerUserId: 'user_sales_manager_1',
    validFrom: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', isActive: true, changedByUserId: 'system_seed', changedAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰'
  },
  {
    id: 'sassign_sales_manager_1', userId: 'user_sales_manager_1', salesRoleId: 'role_sales_manager',
    salesBranchIds: ['sb_saadatabad', 'sb_poonak', 'sb_poonak_night', 'sb_mokhberi_1', 'sb_mokhberi_4'], directManagerUserId: 'user_sales_deputy_1',
    validFrom: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', isActive: true, changedByUserId: 'system_seed', changedAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰'
  },
  {
    id: 'sassign_sales_deputy_1', userId: 'user_sales_deputy_1', salesRoleId: 'role_sales_deputy',
    salesBranchIds: ALL_SALES_BRANCH_IDS, directManagerUserId: undefined,
    validFrom: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰', isActive: true, changedByUserId: 'system_seed', changedAt: '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰'
  }
];

// Default Vendors Directory
export const DEFAULT_VENDORS: Vendor[] = [
  {
    id: 'vendor_1',
    name: 'فروشگاه شوینده ملل (احمد حسینی)',
    category: 'شوینده و تنظیفات',
    nationalCode: '10103829102',
    economicCode: '411391829302',
    shebaNumber: 'IR120170000000109283740001',
    cardNumber: '6037-9918-2234-8891',
    accountNumber: '109283740001',
    bankName: 'بانک ملی ایران',
    accountHolderName: 'احمد حسینی',
    phone: '02188992211',
    address: 'تهران، خیابان ولیعصر، نرسیده به میدان ونک، پلاک ۱۴',
    totalPaid: 350000000,
    transactionCount: 4,
    notes: 'فروشنده اصلی مواد شوینده و بهداشتی شعب تهران'
  },
  {
    id: 'vendor_2',
    name: 'تجهیزات صنعتی و انبارداری البرز',
    category: 'تجهیزات انبار و فروشگاهی',
    nationalCode: '14002938101',
    economicCode: '411182736451',
    shebaNumber: 'IR890120000000021983746002',
    cardNumber: '6104-3378-9012-4455',
    accountNumber: '021983746002',
    bankName: 'بانک ملت',
    accountHolderName: 'شرکت تجهیزات البرز (مدیریت: رضایی)',
    phone: '02166554433',
    address: 'تهران، جاده قدیم کرج، خیابان فتح ۱۷',
    totalPaid: 850000000,
    transactionCount: 6,
    notes: 'تامین‌کننده قفسه، استند و تجهیزات انبار استور و شعب'
  },
  {
    id: 'vendor_3',
    name: 'تامین اقلام مصرفی و اداری ارمغان',
    category: 'ملزومات اداری و کاغذ',
    nationalCode: '10320491820',
    shebaNumber: 'IR540570000000031029384003',
    cardNumber: '5022-2910-4488-1200',
    accountNumber: '031029384003',
    bankName: 'بانک پاسارگاد',
    accountHolderName: 'مرتضی کریمی ارمغان',
    phone: '02177665544',
    address: 'تهران، خیابان انقلاب، خیابان بهار جنوبی',
    totalPaid: 180000000,
    transactionCount: 3,
    notes: 'تامین کننده زونکن، کاغذ A4 و ملزومات اداری ستاد'
  },
  {
    id: 'vendor_4',
    name: 'شرکت شبکه و خدمات فناوری پارس',
    category: 'خدمات IT و دوربین مداربسته',
    nationalCode: '10108877661',
    shebaNumber: 'IR780560000000041029384004',
    cardNumber: '6219-8610-3344-1212',
    accountNumber: '041029384004',
    bankName: 'بانک سامان',
    accountHolderName: 'شرکت فناوری اطلاعات پارس تک',
    phone: '02188102030',
    address: 'تهران، خیابان مطهری، خیابان میرعماد، پلاک ۸',
    totalPaid: 420000000,
    transactionCount: 2,
    notes: 'پشتیبانی شبکه، دوربین‌های امنیتی و نرم‌افزار صندوق شعب'
  }
];

// Default Vendor Categories (دسته‌بندی و زمینه فعالیت دفترچه ذینفعان)
export const DEFAULT_VENDOR_CATEGORIES: VendorCategory[] = [
  { id: 'vcat_cleaning', name: 'شوینده و تنظیفات' },
  { id: 'vcat_warehouse', name: 'تجهیزات انبار و فروشگاهی' },
  { id: 'vcat_office', name: 'ملزومات اداری و کاغذ' },
  { id: 'vcat_it', name: 'خدمات IT و دوربین مداربسته' },
  { id: 'vcat_payroll', name: 'پرسنل و حقوق' },
  { id: 'vcat_transport', name: 'حمل و نقل و لجستیک' },
  { id: 'vcat_utilities', name: 'قبوض و خدمات شهری' },
  { id: 'vcat_other', name: 'سایر' },
];

// Sample placeholder receipt images (SVG/Data URLs for clear visualization)
const SAMPLE_INVOICE_IMG = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';
const SAMPLE_BANK_RECEIPT_IMG = 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80';

// Default Users (Admin + Treasury + Approver + Requestors)
export const DEFAULT_USERS: User[] = [
  {
    id: 'user_admin_reza',
    username: 'admin',
    fullName: 'رضا بیات (مدیر ارشد خزانه‌داری)',
    phone: '09330297784',
    email: 'rbayat2k@gmail.com',
    role: 'admin',
    roleTitle: 'مدیر کل خزانه‌داری و ادمین',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    allowedCostCenterIds: ['cc_hq', 'cc_saadatabad', 'cc_poonak', 'cc_mokhberi_1', 'cc_mokhberi_4', 'cc_azadi', 'cc_fakhar'],
    isActive: true,
    password: '123456',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    allowedApproverIds: ['user_admin_reza', 'user_treasury_exec', 'user_approver_sales'],
    approvalChain: ['user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    isSeniorTreasurySupervisor: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'ادمین ارشد سیستم با اختیارات کامل جهت صدور دستور پرداخت و ارسال مستقیم به واریز'
  },
  {
    id: 'user_treasury_exec',
    username: 'treasury',
    fullName: 'امیرحسین رضایی (کارمند اجرای پرداخت)',
    phone: '09121112233',
    email: 'rezaei@shavaz.com',
    role: 'treasury_executor',
    roleTitle: 'کارشناس صدور چک و واریز بانکی',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    allowedApproverIds: ['user_admin_reza'],
    approvalChain: ['user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'مجری عملیات پرداخت بانکی و آپلود فیش‌های پایا / کارت‌به‌کارت'
  },
  {
    id: 'user_approver_sales',
    username: 'manager_sales',
    fullName: 'مهندس احمدی (مدیر فروش شعب)',
    phone: '09123456789',
    email: 'ahmadi@shavaz.com',
    role: 'approver',
    roleTitle: 'سرپرست تایید شعب فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    allowedCostCenterIds: ['cc_saadatabad', 'cc_poonak', 'cc_mokhberi_1', 'cc_mokhberi_4'],
    password: '123456',
    isActive: true,
    allowedApproverIds: ['user_admin_reza', 'user_treasury_exec'],
    approvalChain: ['user_approver_sales', 'user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'تاییدکننده اول درخواست‌های شعب فروش و ارجاع‌دهنده به خزانه‌داری مرکز'
  },
  {
    id: 'user_requestor_poonak',
    username: 'user_poonak',
    fullName: 'علی محمدی (مسئول خرید شعبه پونک)',
    phone: '09129876543',
    email: 'mohammadi@shavaz.com',
    role: 'requestor',
    roleTitle: 'درخواست‌کننده و مسئول خرید شعبه',
    companyId: 'comp_sales',
    costCenterId: 'cc_poonak',
    password: '123456',
    isActive: true,
    allowedApproverIds: ['user_approver_sales', 'user_admin_reza'],
    approvalChain: ['user_approver_sales', 'user_admin_reza', 'user_treasury_exec'],
    allowDirectToTreasury: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مسئول خرید شعبه پونک با امکان ارسال به مهندس احمدی یا مستقیم به رضا بیات'
  },
  {
    id: 'user_support_sara',
    username: 'support',
    fullName: 'سارا کریمی (کارشناس پشتیبانی)',
    phone: '09121230001',
    email: 'karimi.support@shavaz.com',
    role: 'support_agent',
    roleId: 'role_support_agent',
    roleTitle: 'کارشناس خدمات پس از فروش و پشتیبانی',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'ثبت‌کننده پرونده‌های تماس مشتریان و درخواست عودت وجه'
  },
  {
    id: 'user_finance_narges',
    username: 'finance_approve',
    fullName: 'نرگس صالحی (کارشناس تایید مالی)',
    phone: '09121230002',
    email: 'salehi.finance@shavaz.com',
    role: 'financial_approver',
    roleId: 'role_financial_approver',
    roleTitle: 'کارشناس تایید مالی خدمات پس از فروش',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'بررسی و تایید یا رد مبالغ عودتی ثبت‌شده توسط پشتیبانی'
  },

  // --- سازمان فروش: ۵ کاربر نمونه، یک زنجیره‌ی کامل سرپرستی فروش (salesSupervisorId) ---
  // این زنجیره کاملاً مستقل از approvalChain/allowedApproverIds خزانه‌داری است و فقط توسط
  // src/utils/salesHierarchy.ts برای دید سلسله‌مراتبی مشتریان استفاده می‌شود.
  // roleId به‌صورت صریح روی نقش‌های فروش (role_salesperson و ...) ست شده — نه role_purchaser
  // (که با role:'requestor' fallback می‌گرفت و اشتباهاً manage_vendors می‌داد)؛ تشخیص نقش هرجا
  // لازم باشد باید از roleId/پرمیشن مؤثر باشد، نه roleTitle.includes(...).
  {
    id: 'user_sales_person_1',
    username: 'sales_hosseini',
    fullName: 'زهرا حسینی (فروشنده تلفنی)',
    phone: '09121230010',
    email: 'hosseini.sales@shavaz.com',
    role: 'member',
    roleId: 'role_salesperson',
    roleTitle: 'فروشنده تلفنی',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    password: '123456',
    isActive: true,
    customPermissions: ['sales_access'],
    canIssueTasks: false,
    canExecuteTasks: true,
    salesSupervisorId: 'user_sales_supervisor_1',
    workflowNote: 'فروشنده تلفنی شعبه سعادت‌آباد — ثبت و پیگیری مشتریان و فاکتور فروش'
  },
  {
    id: 'user_sales_supervisor_1',
    username: 'sales_karimi',
    fullName: 'بهروز کریمی (سرپرست فروش)',
    phone: '09121230011',
    email: 'karimi.sales@shavaz.com',
    role: 'member',
    roleId: 'role_sales_supervisor',
    roleTitle: 'سرپرست فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    password: '123456',
    isActive: true,
    customPermissions: ['sales_access'],
    canIssueTasks: true,
    canExecuteTasks: true,
    salesSupervisorId: 'user_sales_senior_supervisor_1',
    workflowNote: 'سرپرست تیم فروشندگان تلفنی — دید سلسله‌مراتبی روی مشتریان زیرمجموعه'
  },
  {
    id: 'user_sales_senior_supervisor_1',
    username: 'sales_ghasemi',
    fullName: 'فرزاد قاسمی (سرپرست ارشد فروش)',
    phone: '09121230013',
    email: 'ghasemi.sales@shavaz.com',
    role: 'member',
    roleId: 'role_senior_sales_supervisor',
    roleTitle: 'سرپرست ارشد فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_saadatabad',
    password: '123456',
    isActive: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    salesSupervisorId: 'user_sales_manager_1',
    workflowNote: 'سرپرست ارشد فروش — دید کل زیردرخت سرپرستان و فروشندگان زیرمجموعه'
  },
  {
    id: 'user_sales_manager_1',
    username: 'sales_hashemi',
    fullName: 'مریم هاشمی (مدیر فروش)',
    phone: '09121230012',
    email: 'hashemi.sales@shavaz.com',
    role: 'member',
    roleId: 'role_sales_manager',
    roleTitle: 'مدیر فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    customPermissions: ['sales_access'],
    canIssueTasks: true,
    canExecuteTasks: true,
    salesSupervisorId: 'user_sales_deputy_1',
    workflowNote: 'مدیر فروش — مدیریت کامل زیردرخت فروش، گزارش‌گیری و زنجیره سرپرستی'
  },
  {
    id: 'user_sales_deputy_1',
    username: 'sales_moradi',
    fullName: 'سودابه مرادی (معاونت فروش)',
    phone: '09121230014',
    email: 'moradi.sales@shavaz.com',
    role: 'member',
    roleId: 'role_sales_deputy',
    roleTitle: 'معاونت فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'معاونت فروش — رأس زنجیره‌ی سرپرستی فروش نمونه'
  },

  // Demo users for the remaining "definitive" (non-sales-hierarchy) roles — added so every
  // finalized role has a real, loginable account for permission/menu/page verification, even
  // though role_data_manager/role_advertising_operator/role_sales_payment_approver stay
  // 'infrastructure_ready' (no operational page/menu exists for them yet — confirmed no
  // Sidebar item is gated on their permissions, so logging in as them shows no fake page,
  // only the same base menu as any requestor-level account).
  {
    id: 'user_data_manager_1',
    username: 'data_kazemi',
    fullName: 'الهام کاظمی (مدیر داده)',
    phone: '09121230015',
    email: 'kazemi.data@shavaz.com',
    role: 'member',
    roleId: 'role_data_manager',
    roleTitle: 'مدیر داده',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مدیر داده — زیرساخت آماده، ماژول عملیاتی Import/تخصیص Lead هنوز پیاده‌سازی نشده است.'
  },
  {
    id: 'user_advertising_operator_1',
    username: 'ads_rahimi',
    fullName: 'نیما رحیمی (اپراتور تبلیغات)',
    phone: '09121230016',
    email: 'rahimi.ads@shavaz.com',
    role: 'member',
    roleId: 'role_advertising_operator',
    roleTitle: 'اپراتور تبلیغات',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'اپراتور تبلیغات — زیرساخت آماده، ماژول عملیاتی کمپین/سرنخ هنوز پیاده‌سازی نشده است.'
  },
  {
    id: 'user_sales_payment_approver_1',
    username: 'sales_pay_tavakoli',
    fullName: 'مهدی توکلی (مسئول تأیید مالی واریزی فروش)',
    phone: '09121230017',
    email: 'tavakoli.salespay@shavaz.com',
    role: 'member',
    roleId: 'role_sales_payment_approver',
    roleTitle: 'مسئول تأیید مالی واریزی فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مسئول تأیید مالی واریزی فروش — مرحلهٔ مالی بررسی ادعای خرید مشتری (فاز ۱ CRM)، مستقل از تاییدکننده مالی خدمات پس از فروش و خزانه‌داری.'
  },
  {
    id: 'user_sales_payment_approver_2',
    username: 'sales_pay_jafari',
    fullName: 'سحر جعفری (مسئول تأیید مالی واریزی فروش)',
    phone: '09121230031',
    email: 'jafari.salespay@shavaz.com',
    role: 'member',
    roleId: 'role_sales_payment_approver',
    roleTitle: 'مسئول تأیید مالی واریزی فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'حساب شخصی مسئول مالی فروش؛ صف و اقدام‌ها با هویت همین فرد ثبت می‌شوند.'
  },
  {
    id: 'user_sales_financial_manager_1',
    username: 'sales_fin_manager',
    fullName: 'لیلا نادری (مدیر تأیید مالی فروش)',
    phone: '09121230032',
    email: 'naderi.salesfinance@shavaz.com',
    role: 'member',
    roleId: 'role_sales_financial_manager',
    roleTitle: 'مدیر تأیید مالی فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: true,
    canExecuteTasks: true,
    workflowNote: 'مدیر صف تأیید مالی فروش؛ تنظیم توزیع، تخصیص و رفع توقف مشکوک.'
  },
  {
    id: 'user_emergency_payment_officer_1',
    username: 'emergency_sadeghi',
    fullName: 'کامران صادقی (مسئول پرداخت فوری)',
    phone: '09121230018',
    email: 'sadeghi.emergency@shavaz.com',
    role: 'member',
    roleId: 'role_emergency_payment_officer',
    roleTitle: 'مسئول پرداخت فوری',
    companyId: 'comp_mother',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مسئول اجرای پرداخت فوری — فقط برای درخواست‌های صراحتاً ارجاع‌شده به مسیر پرداخت فوری.'
  },

  // دو کاربر Demo نقش‌های مستقل «واحد ثبت»/«واحد شنود» (فاز ۱ CRM) — رمز طبق تصمیم موقت پروژه 123456
  {
    id: 'user_data_entry_unit_1',
    username: 'entry_amini',
    fullName: 'پریسا امینی (واحد ثبت)',
    phone: '09121230019',
    email: 'amini.entry@shavaz.com',
    role: 'member',
    roleId: 'role_data_entry_unit',
    roleTitle: 'واحد ثبت',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'ورود اطلاعات فروش از برگهٔ فاکتور کاغذی به نمایندگی فروشنده اصلی — مستقل از واحد شنود و تایید مالی.'
  },
  {
    id: 'user_call_monitoring_unit_1',
    username: 'monitor_yousefi',
    fullName: 'بابک یوسفی (واحد شنود)',
    phone: '09121230020',
    email: 'yousefi.monitor@shavaz.com',
    role: 'member',
    roleId: 'role_call_monitoring_unit',
    roleTitle: 'واحد شنود',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'کنترل کیفیت و شنود تماس‌های فروش — مستقل از واحد ثبت و تایید مالی.'
  },
  // دو کاربر Demo نقش‌های مستقل «مدیر هماهنگی»/«مسئول هماهنگی» (مأموریت تکمیل فلو نهایی فاکتور)
  {
    id: 'user_coordination_manager_1',
    username: 'coord_ghorbani',
    fullName: 'الهام قربانی (مدیر هماهنگی)',
    phone: '09121230026',
    email: 'ghorbani.coord@shavaz.com',
    role: 'member',
    roleId: 'role_coordination_manager',
    roleTitle: 'مدیر هماهنگی',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مدیریت صف هماهنگی فاکتور: توزیع پرونده و عبور انتخابی و دلیل‌دار بدون تماس.'
  },
  {
    id: 'user_coordination_specialist_1',
    username: 'coord_rahimi',
    fullName: 'یاسر رحیمی (مسئول هماهنگی)',
    phone: '09121230027',
    email: 'rahimi.coord@shavaz.com',
    role: 'member',
    roleId: 'role_coordination_specialist',
    roleTitle: 'مسئول هماهنگی',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'کار روی پرونده‌های هماهنگی تخصیص‌یافته: تماس با مشتری، ثبت نتیجه، تأیید یا عودت.'
  },
  {
    id: 'user_promotion_manager_1',
    username: 'promo_rostami',
    fullName: 'کیانا رستمی (مدیر پروموشن)',
    phone: '09121230021',
    email: 'rostami.promo@shavaz.com',
    role: 'member',
    roleId: 'role_promotion_manager',
    roleTitle: 'مدیر پروموشن',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مدیریت کاتالوگ کالا، خدمت و پروموشن — بدون مجوز مشاهدهٔ قیمت خرید به‌صورت پیش‌فرض.'
  },

  // پنج کاربر Demo چرخهٔ اجرای کالا/خدمت (مأموریت تکمیلی فاکتور ترکیبی) — رمز 123456.
  {
    id: 'user_service_project_manager_1',
    username: 'pm_karimi',
    fullName: 'سینا کریمی (مدیر پروژهٔ خدمات)',
    phone: '09121230022',
    email: 'karimi.pm@shavaz.com',
    role: 'member',
    roleId: 'role_service_project_manager',
    roleTitle: 'مدیر پروژهٔ خدمات',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    responsibleUnits: ['واحد نصب', 'گارانتی', 'خدمات پس از فروش'],
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'دریافت پروندهٔ اجرای خدمت پس از تأیید مالی فاکتور و ارجاع به کارمند اجرا — فقط پرونده‌های ارجاع‌شده به خودش را می‌بیند.'
  },
  {
    id: 'user_service_activation_officer_1',
    username: 'exec_moradi',
    fullName: 'نیما مرادی (مسئول فعال‌سازی خدمات)',
    phone: '09121230023',
    email: 'moradi.exec@shavaz.com',
    role: 'member',
    roleId: 'role_service_activation_officer',
    roleTitle: 'مسئول فعال‌سازی خدمات',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    responsibleUnits: ['واحد نصب', 'گارانتی', 'خدمات پس از فروش'],
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'اجرای پروندهٔ خدمتی که مدیر پروژه به او ارجاع داده — فقط همان پرونده‌های ارجاع‌شده را می‌بیند.'
  },
  {
    id: 'user_service_activation_officer_2',
    username: 'exec_ahmadi',
    fullName: 'مونا احمدی (کارشناس اجرای خدمات)',
    phone: '09121230033',
    email: 'ahmadi.exec@shavaz.com',
    role: 'member',
    roleId: 'role_service_activation_officer',
    roleTitle: 'کارشناس اجرای خدمات',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    responsibleUnits: ['واحد نصب', 'گارانتی', 'خدمات پس از فروش'],
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'حساب شخصی کارشناس اجرای خدمت برای تخصیص و ثبت اقدام؛ استفاده از حساب مشترک ممنوع است.'
  },
  {
    id: 'user_dispatch_operator_1',
    username: 'dispatch_hashemi',
    fullName: 'آرش هاشمی (مسئول ارسال و لجستیک)',
    phone: '09121230024',
    email: 'hashemi.dispatch@shavaz.com',
    role: 'member',
    roleId: 'role_dispatch_operator',
    roleTitle: 'مسئول ارسال و لجستیک',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'آماده‌سازی و ارسال پروندهٔ اجرای کالا پس از تأیید مالی فاکتور.'
  },
  {
    id: 'user_delivery_representative_1',
    username: 'delivery_ghorbani',
    fullName: 'وحید قربانی (نماینده تحویل)',
    phone: '09121230025',
    email: 'ghorbani.delivery@shavaz.com',
    role: 'member',
    roleId: 'role_delivery_representative',
    roleTitle: 'نماینده تحویل',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'تحویل نهایی پروندهٔ ارسال‌شدهٔ کالا به مشتری.'
  },
  {
    id: 'user_sales_user_manager_1',
    username: 'sales_hr_karimi',
    fullName: 'شیرین کریمی (مدیر کاربران فروش)',
    phone: '09121230026',
    email: 'karimi.saleshr@shavaz.com',
    role: 'member',
    roleId: 'role_sales_user_manager',
    roleTitle: 'مدیر کاربران فروش',
    companyId: 'comp_sales',
    costCenterId: 'cc_hq',
    password: '123456',
    isActive: true,
    canIssueTasks: false,
    canExecuteTasks: true,
    workflowNote: 'مدیریت چرخهٔ عمر نیروی فروش (انتقال، غیرفعال‌سازی، اصلاح انتصاب پیش از استفاده) — بدون هیچ مجوز مالی/خزانه/دفترچهٔ ذینفعان.'
  }
];

// Initial Workflow Setup
export const DEFAULT_WORKFLOW: WorkflowStepRule[] = [
  { id: 'wf_1', stepName: 'درخواست‌کننده اولیه', approverUserId: 'user_requestor_poonak', approverName: 'علی محمدی', approverRole: 'ثبت درخواست اولیه و آپلود فاکتور', order: 1, isDirectToTreasuryAllowed: true },
  { id: 'wf_2', stepName: 'مدیر تایید واحد/شعبه', approverUserId: 'user_approver_sales', approverName: 'مهندس احمدی', approverRole: 'تایید اول واحد عملیات', order: 2, isDirectToTreasuryAllowed: true },
  { id: 'wf_3', stepName: 'تایید نهایی خزانه‌داری', approverUserId: 'user_admin_reza', approverName: 'رضا بیات', approverRole: 'تایید نهایی و اختصاص بودجه', order: 3, isDirectToTreasuryAllowed: true },
  { id: 'wf_4', stepName: 'کارمند اجرای پرداخت', approverUserId: 'user_treasury_exec', approverName: 'امیرحسین رضایی', approverRole: 'پرداخت بانکی و آپلود فیش واریزی', order: 4, isDirectToTreasuryAllowed: false },
];

// Default Initial Sample Requests
export const DEFAULT_REQUESTS: PaymentRequest[] = [
  {
    id: 'req_10001',
    trackingCode: 'K50001',
    title: 'پرداخت اقلام مصرفی و تنظیفات شعبه پونک شب',
    requestType: 'current_payment',
    companyId: 'comp_sales',
    companyName: 'شرکت فروش',
    costCenterId: 'cc_poonak_night',
    costCenterName: 'پونک شب',
    amount: 125000000, // 125,000,000 Rials
    amountInWords: numberToPersianWords(125000000),
    destinationCardNumber: '6037-9918-2234-8891',
    destinationAccountName: 'فروشگاه شوینده ملل (صاحب حساب: احمد حسینی)',
    description: 'خرید شوینده و کیسه زباله و اقلام مصرفی ماهانه شعبه فروش پونک شب طبق فاکتور ضمیمه شده.',
    requestorId: 'user_requestor_poonak',
    requestorName: 'علی محمدی (مسئول خرید شعبه پونک)',
    requestorPhone: '09129876543',
    currentApproverId: 'user_admin_reza',
    currentApproverName: 'رضا بیات (مدیر ارشد خزانه‌داری)',
    currentApproverPhone: '09330297784',
    status: 'approved_pending_payment',
    createdAt: '1403/05/08 - 10:15',
    updatedAt: '1403/05/09 - 11:30',
    initialAttachments: [
      {
        id: 'att_inv_1',
        name: 'فاکتور_خرید_اقلام_تنظیفات.jpg',
        url: SAMPLE_INVOICE_IMG,
        type: 'image/jpeg',
        size: 1420000,
        uploadedAt: '1403/05/08 - 10:15'
      }
    ],
    timeline: [
      { id: 'tl_1', actorName: 'علی محمدی', actorRole: 'درخواست‌کننده', action: 'submitted', actionTitle: 'ثبت درخواست پرداخت', timestamp: '1403/05/08 - 10:15', comment: 'فاکتورهای رسمی و مهر شده پیوست شد.' },
      { id: 'tl_2', actorName: 'مهندس احمدی', actorRole: 'مدیر فروش شعب', action: 'forwarded', actionTitle: 'تایید اولیه و ارجاع به خزانه‌داری', nextActorName: 'رضا بیات', timestamp: '1403/05/08 - 14:20', comment: 'با اقلام فوق موافقت گردید.' },
      { id: 'tl_3', actorName: 'رضا بیات', actorRole: 'مدیر خزانه‌داری', action: 'approved', actionTitle: 'تایید نهایی خزانه‌داری و صدور دستور پرداخت', nextActorName: 'امیرحسین رضایی', timestamp: '1403/05/09 - 11:30', comment: 'تایید شد. جهت واریز به کارمند اجرا ارجاع گردد.' }
    ]
  },
  {
    id: 'req_10002',
    trackingCode: 'K50002',
    title: 'درخواست مساعده حقوق پرسنل شعبه سعادت آباد',
    requestType: 'advance_payment',
    companyId: 'comp_sales',
    companyName: 'شرکت فروش',
    costCenterId: 'cc_saadatabad',
    costCenterName: 'سعادت آباد',
    amount: 100000000, // 100,000,000 Rials (10 Million Tomans)
    amountInWords: numberToPersianWords(100000000),
    destinationCardNumber: '6219-8610-3344-1212',
    destinationAccountName: 'رضا بیات',
    description: 'درخواست مساعده میان‌ماه پرسنل شعبه سعادت آباد طبق درخواست کتبی امضا شده.',
    requestorId: 'user_admin_reza',
    requestorName: 'رضا بیات',
    requestorPhone: '09330297784',
    currentApproverId: 'user_treasury_exec',
    currentApproverName: 'امیرحسین رضایی (کارمند اجرای پرداخت)',
    currentApproverPhone: '09121112233',
    status: 'paid',
    createdAt: '1403/05/06 - 09:00',
    updatedAt: '1403/05/06 - 15:45',
    initialAttachments: [
      {
        id: 'att_inv_2',
        name: 'فرم_امضا_شده_مساعده.jpg',
        url: SAMPLE_INVOICE_IMG,
        type: 'image/jpeg',
        size: 980000,
        uploadedAt: '1403/05/06 - 09:00'
      }
    ],
    paymentReceiptAttachment: {
      id: 'att_receipt_1',
      name: 'فیش_واریزی_پایا_مساعده.jpg',
      url: SAMPLE_BANK_RECEIPT_IMG,
      type: 'image/jpeg',
      size: 1100000,
      uploadedAt: '1403/05/06 - 15:45'
    },
    timeline: [
      { id: 'tl_4', actorName: 'رضا بیات', actorRole: 'مدیر خزانه‌داری', action: 'submitted', actionTitle: 'ثبت درخواست مساعده', timestamp: '1403/05/06 - 09:00' },
      { id: 'tl_5', actorName: 'رضا بیات', actorRole: 'مدیر خزانه‌داری', action: 'approved', actionTitle: 'تایید و ارسال مستقیم به واریز', nextActorName: 'امیرحسین رضایی', timestamp: '1403/05/06 - 10:00' },
      { id: 'tl_6', actorName: 'امیرحسین رضایی', actorRole: 'کارمند اجرا', action: 'paid', actionTitle: 'واریز بانکی انجام شد و فیش آپلود گردید', timestamp: '1403/05/06 - 15:45', comment: 'کد پیگیری پایا: 88273921' }
    ]
  },
  {
    id: 'req_10003',
    trackingCode: 'K50003',
    title: 'درخواست صورت‌حساب و اطلاعات فاکتورهای ۱۰ نفر پرسنل شرکت استور',
    requestType: 'info_request',
    companyId: 'comp_store',
    companyName: 'شرکت استور',
    costCenterId: 'cc_store_branch',
    costCenterName: 'استور (مرکز هزینه انبار و تجهیزات)',
    amount: 350000000, // 350,000,000 Rials
    amountInWords: numberToPersianWords(350000000),
    destinationCardNumber: '5892-1011-4567-9000',
    destinationAccountName: 'حساب گروهی خریدهای استور',
    description: 'درخواست آپلود فایل صورت‌حساب ترکیبی ۱۰ نفر خریدار تجهیزات انبار شاواز جهت بررسی خزانه‌داری.',
    requestorId: 'user_requestor_poonak',
    requestorName: 'علی محمدی',
    requestorPhone: '09129876543',
    currentApproverId: 'user_admin_reza',
    currentApproverName: 'رضا بیات (مدیر ارشد خزانه‌داری)',
    currentApproverPhone: '09330297784',
    status: 'pending_approval',
    createdAt: '1403/05/10 - 08:30',
    updatedAt: '1403/05/10 - 08:30',
    initialAttachments: [
      {
        id: 'att_inv_3',
        name: 'لیست_لیست_۱۰_نفر_صورتحساب.xlsx',
        url: SAMPLE_INVOICE_IMG,
        type: 'image/jpeg',
        size: 512000,
        uploadedAt: '1403/05/10 - 08:30'
      }
    ],
    timeline: [
      { id: 'tl_7', actorName: 'علی محمدی', actorRole: 'مسئول خرید', action: 'submitted', actionTitle: 'ثبت درخواست اطلاعات صورت‌حساب', timestamp: '1403/05/10 - 08:30', comment: 'اطلاعات ۱۰ صورت‌حساب قرار داده شد.' }
    ]
  }
];

// Initial Chat Messages
export const DEFAULT_MESSAGES: ChatMessage[] = [
  { id: 'msg_1', senderId: 'user_admin_reza', senderName: 'رضا بیات', senderRole: 'مدیر خزانه‌داری', content: 'سلام همکاران گرامی. لطفاً تمامی درخواست‌های پرداخت بالای ۵۰ میلیون تومان را همراه با فایل صورت‌حساب و مهر شعبه ثبت بفرمایید.', timestamp: '1403/05/08 - 09:00' },
  { id: 'msg_2', senderId: 'user_requestor_poonak', senderName: 'علی محمدی', senderRole: 'مسئول خرید', content: 'سلام آقای بیات. درخواست شعبه پونک شب با کد K50001 ثبت شد و فاکتورها آپلود گردید.', timestamp: '1403/05/08 - 10:20', requestId: 'req_10001', requestTrackingCode: 'K50001' },
  { id: 'msg_3', senderId: 'user_treasury_exec', senderName: 'امیرحسین رضایی', senderRole: 'کارمند اجرا', content: 'فیش‌های واریز تمام درخواست‌های تایید شده در سیستم آپلود شده است.', timestamp: '1403/05/09 - 16:00' }
];

// Initial Notifications
export const DEFAULT_NOTIFICATIONS: SystemNotification[] = [
  { id: 'notif_1', userId: 'user_admin_reza', title: 'درخواست جدید نیازمند تایید', message: 'درخواست K50001 مربوط به شرکت فروش در انتظار بررسی شماست.', requestId: 'req_10001', trackingCode: 'K50001', isRead: false, createdAt: '1403/05/08 - 10:15' },
  { id: 'notif_2', userId: 'user_requestor_poonak', title: 'واریز انجام شد', message: 'پرداخت درخواست K50002 انجام گردید و فیش واریز آپلود شد.', requestId: 'req_10002', trackingCode: 'K50002', isRead: true, createdAt: '1403/05/06 - 15:45' }
];

// Initial Assigned Tasks
export const DEFAULT_TASKS: AssignedTask[] = [
  {
    id: 'task_1',
    taskNumber: 'T1001',
    title: 'ارسال و ثبت فاکتورهای خریدهای خرد شعبه سعادت‌آباد',
    description: 'لطفاً فاکتورهای مربوط به خرید ملزومات مصرفی مردادماه شعبه سعادت‌آباد را تا فردا ظهر اسکن نموده و در سیستم بارگذاری فرمایید.',
    assignerId: 'user_admin_reza',
    assignerName: 'رضا بیات',
    assignerRole: 'مدیر خزانه‌داری',
    assigneeId: 'user_approver_saadatabad',
    assigneeName: 'امیر صفی آریان',
    assigneeRole: 'مدیر شعبه سعادت‌آباد',
    priority: 'urgent',
    status: 'in_progress',
    dueDate: '۱۴۰۳/۰۵/۱۲',
    createdAt: '۱۴۰۳/۰۵/۱۰ - ۰۹:۳۰',
    updatedAt: '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵',
    letterNumber: '۱۰۱/۱۴۰۳/ش',
    letterDate: '۱۴۰۳/۰۵/۱۰',
    messages: [
      {
        id: `msg_t1_1`,
        senderId: 'user_admin_reza',
        senderName: 'رضا بیات',
        senderRole: 'مدیر خزانه‌داری',
        content: 'جناب صفی آریان با سلام، فاکتورهای اصلاحی خریدهای اخیر شعبه ارسال گردد.',
        letterNumber: '۱۰۱/۱۴۰۳/ش',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۰۹:۳۰'
      },
      {
        id: `msg_t1_2`,
        senderId: 'user_approver_saadatabad',
        senderName: 'امیر صفی آریان',
        senderRole: 'مدیر شعبه سعادت‌آباد',
        content: 'سلام جناب بیات. فاکتورها آماده شده و تا یک ساعت دیگر آپلود می‌شود.',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵'
      }
    ],
    logs: [
      {
        id: 'log_t1_1',
        actorId: 'user_admin_reza',
        actorName: 'رضا بیات',
        actorRole: 'مدیر خزانه‌داری',
        actionTitle: 'ایجاد و ارجاع دستور کار جدید',
        detail: 'ابلاغ به امیر صفی آریان',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۰۹:۳۰'
      },
      {
        id: 'log_t1_2',
        actorId: 'user_approver_saadatabad',
        actorName: 'امیر صفی آریان',
        actorRole: 'مدیر شعبه سعادت‌آباد',
        actionTitle: 'تغییر وضعیت کار: شروع به انجام کار',
        timestamp: '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵'
      }
    ]
  }
];

// ۱۰ مشتری Demo (بند ۲۱ مأموریت فاز فروش) — لازم تا مخزن داده خام/Lead/فاکتور روی دادهٔ واقعی
// قابل تست باشند؛ همه «آزاد» (بدون activityLog) می‌مانند تا چرخهٔ فروش با Lead/فاکتور واقعی
// این مأموریت آغاز شود، نه از قبل قفل‌شده روی یک فروشندهٔ نمونه.
function buildDemoCustomer(
  id: string, fullName: string, phone1: string, address: string, province: string, city: string, postalCode: string
): Customer {
  const now = '۱۴۰۳/۰۴/۰۱ - ۰۹:۰۰';
  return {
    id, fullName, phone1, address, province, city, postalCode,
    createdAt: now, updatedAt: now, version: 1,
    phoneEntries: [{
      id: `phone_${id}_0`, value: phone1, normalizedValue: phone1,
      source: 'legacy_migration', recordedAt: now, recordedByUserId: 'system', recordedByName: 'Demo Seed',
      isCustomerConfirmed: true, isCurrentPrimary: true
    }],
    nameEntries: [{
      id: `name_${id}_0`, value: fullName, normalizedValue: fullName,
      source: 'legacy_migration', recordedAt: now, recordedByUserId: 'system', recordedByName: 'Demo Seed',
      isCustomerConfirmed: true, isCurrentPrimary: true
    }],
    addressEntries: [{
      id: `address_${id}_0`, address, province, city, postalCode, normalizedValue: address,
      source: 'legacy_migration', recordedAt: now, recordedByUserId: 'system', recordedByName: 'Demo Seed',
      isCustomerConfirmed: true, isCurrentPrimary: true
    }],
    identityStatus: 'complete', financialStatus: 'reconciled', contactStatus: 'needs_recall',
    contactPermissionStatus: 'allowed', complaintStatus: 'none', satisfactionStatus: 'unknown'
  };
}

export const DEFAULT_CUSTOMERS: Customer[] = [
  buildDemoCustomer('cust_demo_1', 'رضا احمدی', '09120001001', 'خیابان ولیعصر، پلاک ۱۲', 'تهران', 'تهران', '1234567890'),
  buildDemoCustomer('cust_demo_2', 'مریم صادقی', '09120001002', 'بلوار کشاورز، پلاک ۴۵', 'تهران', 'تهران', '1234567891'),
  buildDemoCustomer('cust_demo_3', 'علی نوروزی', '09120001003', 'خیابان امام، پلاک ۷', 'اصفهان', 'اصفهان', '8134567890'),
  buildDemoCustomer('cust_demo_4', 'سارا محمدی', '09120001004', 'خیابان شریعتی، پلاک ۲۳', 'فارس', 'شیراز', '7134567890'),
  buildDemoCustomer('cust_demo_5', 'حسین کریمی', '09120001005', 'بلوار آزادی، پلاک ۱۶', 'خراسان رضوی', 'مشهد', '9134567890'),
  buildDemoCustomer('cust_demo_6', 'فاطمه رضایی', '09120001006', 'خیابان انقلاب، پلاک ۳۳', 'تهران', 'کرج', '3134567890'),
  buildDemoCustomer('cust_demo_7', 'محمد قاسمی', '09120001007', 'خیابان فردوسی، پلاک ۹', 'آذربایجان شرقی', 'تبریز', '5134567890'),
  buildDemoCustomer('cust_demo_8', 'زهرا حیدری', '09120001008', 'بلوار امام رضا، پلاک ۵۵', 'خوزستان', 'اهواز', '6134567890'),
  buildDemoCustomer('cust_demo_9', 'امیر تقوی', '09120001009', 'خیابان چمران، پلاک ۱۸', 'اصفهان', 'اصفهان', '8134567891'),
  buildDemoCustomer('cust_demo_10', 'لیلا موسوی', '09120001010', 'خیابان طالقانی، پلاک ۲۹', 'تهران', 'تهران', '1234567892'),
  // مشتری سناریوی طلایی فاکتور ترکیبی (مأموریت تکمیلی) — تفکیک شده از مشتریان عمومی دمو تا
  // سناریوی مرجع (۶۵۸,۴۰۰,۰۰۰ ریال، ۲ ردیف کالا + ۳ ردیف خدمت) در Refresh هم قابل بازتولید بماند.
  buildDemoCustomer('cust_golden_mixed_invoice', 'مشتری سناریوی طلایی فاکتور ترکیبی', '09120009001', 'بلوار میرداماد، پلاک ۱۰۱', 'تهران', 'تهران', '1234567899')
];

// ============================================================
// Demo مخزن داده خام و Import Job (بند ۲۱ مأموریت فروش) — ۳۰ RawContact با چند شمارهٔ تکراری
// و چند تعارض نام/آدرس، به‌علاوهٔ یک Import Job موفق و یک Import Job حاوی تعارض.
// ============================================================
function buildRawContact(fields: {
  id: string; phone: string; name?: string; address?: string; province?: string; city?: string; postalCode?: string;
  status: RawContact['status']; rowNumber: number; importJobId: string; sourceFileName: string;
  linkedCustomerId?: string; linkedConflictId?: string; rejectionOrErrorReason?: string; tags?: string[];
}): RawContact {
  return {
    id: fields.id,
    primaryPhoneNormalized: fields.phone,
    primaryPhoneRaw: fields.phone,
    probableName: fields.name,
    address: fields.address,
    province: fields.province,
    city: fields.city,
    postalCode: fields.postalCode,
    sourceFile: 'excel',
    sourceFileName: fields.sourceFileName,
    sourceRowNumber: fields.rowNumber,
    campaignId: 'campaign_demo_1',
    importedAt: '۱۴۰۳/۰۵/۰۱ - ۱۱:۰۰',
    importedByUserId: 'user_data_manager_1',
    importedByUserName: 'الهام کاظمی (مدیر داده)',
    importJobId: fields.importJobId,
    status: fields.status,
    linkedCustomerId: fields.linkedCustomerId,
    linkedConflictId: fields.linkedConflictId,
    rejectionOrErrorReason: fields.rejectionOrErrorReason,
    tags: fields.tags
  };
}

export const DEFAULT_RAW_CONTACTS: RawContact[] = [
  // ۱۰ ردیف که دقیقاً با شمارهٔ ۱۰ مشتری Demo تطبیق دارند (matched_customer)
  ...DEFAULT_CUSTOMERS.map((c, i) => buildRawContact({
    id: `raw_matched_${i + 1}`, phone: c.phone1!, name: c.fullName, address: c.address, province: c.province, city: c.city, postalCode: c.postalCode,
    status: 'matched_customer', rowNumber: i + 1, importJobId: 'import_job_demo_success', sourceFileName: 'ورودی_کمپین_تابستان.xlsx',
    linkedCustomerId: c.id
  })),
  // ۸ ردیف کاملاً جدید (بدون تطبیق) — واجد شرایط کمپین
  ...Array.from({ length: 8 }, (_, i) => buildRawContact({
    id: `raw_new_${i + 1}`, phone: `0913000${(1000 + i).toString().slice(-4)}`, name: `مشتری احتمالی ${i + 1}`,
    address: 'آدرس ثبت‌نشده', province: 'تهران', city: 'تهران', postalCode: '1111111111',
    status: i < 4 ? 'eligible_for_campaign' : 'new', rowNumber: 11 + i, importJobId: 'import_job_demo_success', sourceFileName: 'ورودی_کمپین_تابستان.xlsx'
  })),
  // ۴ جفت شمارهٔ تکراری داخل فایل (۸ ردیف، ۴ شماره) — outcome واقعی duplicate_in_file برای ردیف دوم هر جفت
  ...Array.from({ length: 4 }, (_, i) => {
    const phone = `0914000${(2000 + i).toString().slice(-4)}`;
    const rowBase = 19 + i * 2;
    return [
      buildRawContact({ id: `raw_dup_${i + 1}_a`, phone, name: `مشتری تکراری ${i + 1}`, status: 'new', rowNumber: rowBase, importJobId: 'import_job_demo_success', sourceFileName: 'ورودی_کمپین_تابستان.xlsx' }),
      buildRawContact({ id: `raw_dup_${i + 1}_b`, phone, name: `مشتری تکراری ${i + 1}`, status: 'excluded', rowNumber: rowBase + 1, importJobId: 'import_job_demo_success', sourceFileName: 'ورودی_کمپین_تابستان.xlsx', rejectionOrErrorReason: 'شمارهٔ تکراری در همین فایل (ردیف ' + rowBase + ')', tags: ['duplicate_in_file'] })
    ];
  }).flat(),
  // ۳ ردیف با تعارض جدی نام/آدرس روی شمارهٔ یک مشتری موجود (identity_conflict)
  buildRawContact({ id: 'raw_conflict_1', phone: DEFAULT_CUSTOMERS[0].phone1!, name: 'ناشناس متفاوت یک', address: 'آدرس کاملاً متفاوت ۱', status: 'identity_conflict', rowNumber: 27, importJobId: 'import_job_demo_conflict', sourceFileName: 'ورودی_دیتابیس_قدیمی.xlsx', linkedConflictId: 'entry_conflict_demo_1' }),
  buildRawContact({ id: 'raw_conflict_2', phone: DEFAULT_CUSTOMERS[1].phone1!, name: 'ناشناس متفاوت دو', address: 'آدرس کاملاً متفاوت ۲', status: 'identity_conflict', rowNumber: 28, importJobId: 'import_job_demo_conflict', sourceFileName: 'ورودی_دیتابیس_قدیمی.xlsx', linkedConflictId: 'entry_conflict_demo_2' }),
  buildRawContact({ id: 'raw_conflict_3', phone: DEFAULT_CUSTOMERS[2].phone1!, name: 'ناشناس متفاوت سه', address: 'آدرس کاملاً متفاوت ۳', status: 'identity_conflict', rowNumber: 29, importJobId: 'import_job_demo_conflict', sourceFileName: 'ورودی_دیتابیس_قدیمی.xlsx', linkedConflictId: 'entry_conflict_demo_3' }),
  // ۲ شمارهٔ نامعتبر
  buildRawContact({ id: 'raw_invalid_1', phone: '0210001', name: 'شماره نامعتبر یک', status: 'invalid_phone', rowNumber: 30, importJobId: 'import_job_demo_conflict', sourceFileName: 'ورودی_دیتابیس_قدیمی.xlsx', rejectionOrErrorReason: 'شمارهٔ موبایل معتبر نیست' }),
  buildRawContact({ id: 'raw_invalid_2', phone: 'abc', name: 'شماره نامعتبر دو', status: 'invalid_phone', rowNumber: 31, importJobId: 'import_job_demo_conflict', sourceFileName: 'ورودی_دیتابیس_قدیمی.xlsx', rejectionOrErrorReason: 'شمارهٔ موبایل معتبر نیست' }),
  // یک شمارهٔ اشتباه که از صف فروش خارج و به مخزن شمارهٔ اشتباه منتقل شده
  buildRawContact({ id: 'raw_wrong_number_1', phone: '09140009999', name: 'شمارهٔ اشتباه', status: 'wrong_number', rowNumber: 32, importJobId: 'import_job_demo_conflict', sourceFileName: 'ورودی_دیتابیس_قدیمی.xlsx', rejectionOrErrorReason: 'در تماس اعلام شد شمارهٔ اشتباه است' })
];

// سه تعارض واقعی متناظر با raw_conflict_1/2/3 — تا کارتابل تعارض مدیر داده (از فاز ۱ CRM،
// بازاستفاده‌شده نه بازسازی‌شده) این Import Job را واقعاً قابل بررسی نشان دهد.
export const DEFAULT_CUSTOMER_ENTRY_CONFLICTS: CustomerEntryConflict[] = [
  { id: 'entry_conflict_demo_1', incomingSource: 'data_entry_unit', submittedByUserId: 'user_data_manager_1', submittedByUserName: 'الهام کاظمی (مدیر داده)', submittedAt: '۱۴۰۳/۰۵/۰۲ - ۱۰:۰۰', incomingPhone: DEFAULT_CUSTOMERS[0].phone1, incomingName: 'ناشناس متفاوت یک', incomingAddress: 'آدرس کاملاً متفاوت ۱', conflictingCustomerIds: ['cust_demo_1'], reason: 'تعارض جدی در نام با پروفایل موجود (شمارهٔ یکسان)', status: 'pending' },
  { id: 'entry_conflict_demo_2', incomingSource: 'data_entry_unit', submittedByUserId: 'user_data_manager_1', submittedByUserName: 'الهام کاظمی (مدیر داده)', submittedAt: '۱۴۰۳/۰۵/۰۲ - ۱۰:۰۰', incomingPhone: DEFAULT_CUSTOMERS[1].phone1, incomingName: 'ناشناس متفاوت دو', incomingAddress: 'آدرس کاملاً متفاوت ۲', conflictingCustomerIds: ['cust_demo_2'], reason: 'تعارض جدی در نام با پروفایل موجود (شمارهٔ یکسان)', status: 'pending' },
  { id: 'entry_conflict_demo_3', incomingSource: 'data_entry_unit', submittedByUserId: 'user_data_manager_1', submittedByUserName: 'الهام کاظمی (مدیر داده)', submittedAt: '۱۴۰۳/۰۵/۰۲ - ۱۰:۰۰', incomingPhone: DEFAULT_CUSTOMERS[2].phone1, incomingName: 'ناشناس متفاوت سه', incomingAddress: 'آدرس کاملاً متفاوت ۳', conflictingCustomerIds: ['cust_demo_3'], reason: 'تعارض جدی در نام با پروفایل موجود (شمارهٔ یکسان)', status: 'pending' }
];

export const DEFAULT_IMPORT_JOBS: ImportJob[] = [
  {
    id: 'import_job_demo_success',
    idempotencyKey: 'demo_import_summer_campaign_v1',
    sourceType: 'excel',
    fileName: 'ورودی_کمپین_تابستان.xlsx',
    campaignId: 'campaign_demo_1',
    importedByUserId: 'user_data_manager_1',
    importedByUserName: 'الهام کاظمی (مدیر داده)',
    importedAt: '۱۴۰۳/۰۵/۰۱ - ۱۱:۰۰',
    totalRows: 26,
    createdCount: 8,
    attachedCount: 10,
    conflictCount: 0,
    invalidPhoneCount: 0,
    duplicateInFileCount: 4,
    errorCount: 0,
    rows: []
  },
  {
    id: 'import_job_demo_conflict',
    idempotencyKey: 'demo_import_legacy_db_v1',
    sourceType: 'excel',
    fileName: 'ورودی_دیتابیس_قدیمی.xlsx',
    importedByUserId: 'user_data_manager_1',
    importedByUserName: 'الهام کاظمی (مدیر داده)',
    importedAt: '۱۴۰۳/۰۵/۰۲ - ۱۰:۰۰',
    totalRows: 6,
    createdCount: 0,
    attachedCount: 0,
    conflictCount: 3,
    invalidPhoneCount: 2,
    duplicateInFileCount: 0,
    errorCount: 0,
    rows: []
  }
];

// ============================================================
// Demo کمپین و Lead (بند ۲۱ مأموریت فروش) — ۳ کمپین و ۲۰ Lead با وضعیت‌های متنوع، یک Lead
// روی هر سطح از سلسله‌مراتب فروش تا اختیار تخصیص/انتقال هر سطح واقعاً قابل تست باشد.
// ============================================================
export const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    id: 'campaign_demo_1', name: 'کمپین تابستان', code: 'SUMMER24', channelType: 'sms',
    companyId: 'comp_sales', costCenterId: 'cc_saadatabad',
    advertisingOperatorUserId: 'user_advertising_operator_1', advertisingOperatorName: 'نیما رحیمی (اپراتور تبلیغات)',
    startDate: '۱۴۰۳/۰۴/۰۱', endDate: '۱۴۰۳/۰۶/۳۱', status: 'active', leadGenerationMode: 'manual',
    priority: 'high', tags: ['تابستان', 'پیامکی'], createdAt: '۱۴۰۳/۰۴/۰۱ - ۰۹:۰۰',
    createdByUserId: 'user_advertising_operator_1', createdByUserName: 'نیما رحیمی (اپراتور تبلیغات)'
  },
  {
    id: 'campaign_demo_2', name: 'معرفی محصول جدید', code: 'NEWPROD24', channelType: 'social',
    companyId: 'comp_sales', advertisingOperatorUserId: 'user_advertising_operator_1', advertisingOperatorName: 'نیما رحیمی (اپراتور تبلیغات)',
    startDate: '۱۴۰۳/۰۵/۰۱', status: 'active', leadGenerationMode: 'automatic',
    autoRuleEnabled: true, autoRuleKeyword: 'قیمت', requiresManualConfirmationBeforeConversion: true,
    priority: 'normal', tags: ['شبکه اجتماعی'], createdAt: '۱۴۰۳/۰۵/۰۱ - ۰۹:۰۰',
    createdByUserId: 'user_advertising_operator_1', createdByUserName: 'نیما رحیمی (اپراتور تبلیغات)'
  },
  {
    id: 'campaign_demo_3', name: 'کمپین پاییزهٔ سال قبل', code: 'FALL23', channelType: 'call',
    companyId: 'comp_sales', status: 'ended', leadGenerationMode: 'manual', priority: 'low',
    createdAt: '۱۴۰۲/۰۸/۰۱ - ۰۹:۰۰', createdByUserId: 'user_advertising_operator_1', createdByUserName: 'نیما رحیمی (اپراتور تبلیغات)'
  }
];

function buildDemoLead(fields: {
  id: string; code: string; status: Lead['status']; ownerUserId?: string; ownerUserName?: string;
  customerId?: string; hadFirstContact: boolean; priority?: 'low' | 'normal' | 'high'; declaredInterest?: string;
}): Lead {
  return {
    id: fields.id, trackingCode: fields.code, campaignId: 'campaign_demo_1', source: 'کمپین تابستان',
    declaredInterest: fields.declaredInterest || 'ابراز علاقه به خرید', priority: fields.priority || 'normal',
    customerId: fields.customerId, companyId: 'comp_sales', costCenterId: 'cc_saadatabad',
    currentOwnerUserId: fields.ownerUserId, currentOwnerUserName: fields.ownerUserName,
    createdAt: '۱۴۰۳/۰۵/۰۳ - ۰۹:۰۰', createdByUserId: 'user_data_manager_1', createdByUserName: 'الهام کاظمی (مدیر داده)',
    status: fields.status, hadFirstContact: fields.hadFirstContact,
    timeline: [{ id: `${fields.id}_t0`, type: 'created', title: 'Lead ایجاد شد', actorUserId: 'user_data_manager_1', actorUserName: 'الهام کاظمی (مدیر داده)', timestamp: '۱۴۰۳/۰۵/۰۳ - ۰۹:۰۰' }]
  };
}

export const DEFAULT_LEADS: Lead[] = [
  buildDemoLead({ id: 'lead_demo_1', code: 'LD-0001', status: 'new', hadFirstContact: false }),
  buildDemoLead({ id: 'lead_demo_2', code: 'LD-0002', status: 'new', hadFirstContact: false }),
  buildDemoLead({ id: 'lead_demo_3', code: 'LD-0003', status: 'new', hadFirstContact: false }),
  buildDemoLead({ id: 'lead_demo_4', code: 'LD-0004', status: 'pending_action', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: false }),
  buildDemoLead({ id: 'lead_demo_5', code: 'LD-0005', status: 'pending_action', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: false }),
  buildDemoLead({ id: 'lead_demo_6', code: 'LD-0006', status: 'pending_action', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: false }),
  buildDemoLead({ id: 'lead_demo_7', code: 'LD-0007', status: 'callback_scheduled', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_8', code: 'LD-0008', status: 'callback_scheduled', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_9', code: 'LD-0009', status: 'callback_scheduled', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_10', code: 'LD-0010', status: 'overdue', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_11', code: 'LD-0011', status: 'overdue', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_12', code: 'LD-0012', status: 'in_negotiation', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', customerId: 'cust_demo_5', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_13', code: 'LD-0013', status: 'in_negotiation', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', customerId: 'cust_demo_6', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_14', code: 'LD-0014', status: 'in_negotiation', ownerUserId: 'user_sales_supervisor_1', ownerUserName: 'بهروز کریمی (سرپرست فروش)', customerId: 'cust_demo_7', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_15', code: 'LD-0015', status: 'ready_for_invoice', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', customerId: 'cust_demo_8', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_16', code: 'LD-0016', status: 'ready_for_invoice', ownerUserId: 'user_sales_senior_supervisor_1', ownerUserName: 'فرزاد قاسمی (سرپرست ارشد فروش)', customerId: 'cust_demo_9', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_17', code: 'LD-0017', status: 'closed_won', ownerUserId: 'user_sales_manager_1', ownerUserName: 'مریم هاشمی (مدیر فروش)', customerId: 'cust_demo_10', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_18', code: 'LD-0018', status: 'closed_lost', ownerUserId: 'user_sales_deputy_1', ownerUserName: 'سودابه مرادی (معاونت فروش)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_19', code: 'LD-0019', status: 'wrong_number', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true }),
  buildDemoLead({ id: 'lead_demo_20', code: 'LD-0020', status: 'complaint_blocked', ownerUserId: 'user_sales_person_1', ownerUserName: 'زهرا حسینی (فروشنده تلفنی)', hadFirstContact: true })
];

// Demo ثبت تماس (بند ۱۰ مأموریت فروش) — چند تماس واقعی روی Leadهایی که hadFirstContact:true دارند.
export const DEFAULT_CALL_LOGS: CallLogEntry[] = [
  { id: 'call_demo_1', leadId: 'lead_demo_7', salespersonUserId: 'user_sales_person_1', salespersonUserName: 'زهرا حسینی (فروشنده تلفنی)', startedAt: '۱۴۰۳/۰۵/۰۴ - ۱۰:۰۰', endedAt: '۱۴۰۳/۰۵/۰۴ - ۱۰:۰۳', outcome: 'callback_requested', note: 'مشتری فردا بعدازظهر وقت خواست', callbackAt: '۱۴۰۳/۰۵/۰۵', createdAt: '۱۴۰۳/۰۵/۰۴ - ۱۰:۰۳' },
  { id: 'call_demo_2', leadId: 'lead_demo_10', salespersonUserId: 'user_sales_person_1', salespersonUserName: 'زهرا حسینی (فروشنده تلفنی)', startedAt: '۱۴۰۳/۰۵/۰۲ - ۰۹:۰۰', endedAt: '۱۴۰۳/۰۵/۰۲ - ۰۹:۰۱', outcome: 'no_answer', createdAt: '۱۴۰۳/۰۵/۰۲ - ۰۹:۰۱' },
  { id: 'call_demo_3', leadId: 'lead_demo_12', salespersonUserId: 'user_sales_person_1', salespersonUserName: 'زهرا حسینی (فروشنده تلفنی)', startedAt: '۱۴۰۳/۰۵/۰۳ - ۱۱:۰۰', endedAt: '۱۴۰۳/۰۵/۰۳ - ۱۱:۱۰', outcome: 'real_conversation', note: 'معرفی کامل محصول انجام شد', createdAt: '۱۴۰۳/۰۵/۰۳ - ۱۱:۱۰' },
  { id: 'call_demo_4', leadId: 'lead_demo_19', salespersonUserId: 'user_sales_person_1', salespersonUserName: 'زهرا حسینی (فروشنده تلفنی)', startedAt: '۱۴۰۳/۰۵/۰۲ - ۱۲:۰۰', endedAt: '۱۴۰۳/۰۵/۰۲ - ۱۲:۰۱', outcome: 'wrong_number', createdAt: '۱۴۰۳/۰۵/۰۲ - ۱۲:۰۱' },
  { id: 'call_demo_5', leadId: 'lead_demo_20', salespersonUserId: 'user_sales_person_1', salespersonUserName: 'زهرا حسینی (فروشنده تلفنی)', startedAt: '۱۴۰۳/۰۵/۰۲ - ۱۳:۰۰', endedAt: '۱۴۰۳/۰۵/۰۲ - ۱۳:۰۵', outcome: 'complaint', note: 'شکایت از تأخیر ارسال سفارش قبلی', createdAt: '۱۴۰۳/۰۵/۰۲ - ۱۳:۰۵' }
];

// ============================================================
// Demo کاتالوگ کالا/خدمت/پروموشن (بند ۱۱-۱۳ و ۲۱ مأموریت فروش) — ۸ کالا، ۸ خدمت، ۵ پروموشن
// (کالایی/خدماتی/ترکیبی). purchasePrice/internalCost فقط با view_purchase_price نمایش داده شود.
// ============================================================
export const DEFAULT_PRODUCTS: Product[] = [
  { id: 'prod_1', code: 'P-001', name: 'یخچال ساید بای ساید ۲۴ فوت', category: 'یخچال و فریزر', unit: 'دستگاه', quantity: 12, purchasePrice: 380000000, salePrice: 465000000, warranty: '۱۸ ماه', isActive: true },
  { id: 'prod_2', code: 'P-002', name: 'ماشین لباسشویی ۹ کیلویی', category: 'لوازم شستشو', unit: 'دستگاه', quantity: 20, purchasePrice: 145000000, salePrice: 189000000, warranty: '۲۴ ماه', isActive: true },
  { id: 'prod_3', code: 'P-003', name: 'تلویزیون ۵۵ اینچ ۴K', category: 'صوت و تصویر', unit: 'دستگاه', quantity: 15, purchasePrice: 98000000, salePrice: 129000000, warranty: '۱۲ ماه', isActive: true },
  { id: 'prod_4', code: 'P-004', name: 'جاروبرقی بدون کیسه', category: 'لوازم نظافت', unit: 'دستگاه', quantity: 30, purchasePrice: 12000000, salePrice: 16500000, warranty: '۱۲ ماه', isActive: true },
  { id: 'prod_5', code: 'P-005', name: 'اجاق گاز ۵ شعله استیل', category: 'آشپزخانه', unit: 'دستگاه', quantity: 18, purchasePrice: 34000000, salePrice: 45000000, warranty: '۲۴ ماه', isActive: true },
  { id: 'prod_6', code: 'P-006', name: 'مایکروویو توکار', category: 'آشپزخانه', unit: 'دستگاه', quantity: 22, purchasePrice: 21000000, salePrice: 28500000, warranty: '۱۲ ماه', isActive: true },
  { id: 'prod_7', code: 'P-007', name: 'کولر گازی اسپلیت ۲۴۰۰۰', category: 'سرمایش و گرمایش', unit: 'دستگاه', quantity: 10, purchasePrice: 62000000, salePrice: 82000000, warranty: '۱۸ ماه', isActive: true },
  { id: 'prod_8', code: 'P-008', name: 'مدل قدیمی پلوپز (متوقف‌شده)', category: 'آشپزخانه', unit: 'دستگاه', quantity: 0, purchasePrice: 4000000, salePrice: 5500000, isActive: false }
];

export const DEFAULT_SERVICES: ServiceCatalogItem[] = [
  { id: 'svc_1', code: 'S-001', name: 'نصب و راه‌اندازی یخچال', category: 'نصب', salePrice: 1200000, internalCost: 400000, responsibleUnit: 'واحد نصب', requiresActivation: true, isActive: true },
  { id: 'svc_2', code: 'S-002', name: 'نصب کولر گازی', category: 'نصب', salePrice: 2500000, internalCost: 900000, responsibleUnit: 'واحد نصب', requiresActivation: true, isActive: true },
  { id: 'svc_3', code: 'S-003', name: 'گارانتی طلایی ۲ سالهٔ تکمیلی', category: 'گارانتی', salePrice: 3500000, internalCost: 1200000, warrantyOrValidityPeriod: '۲۴ ماه', requiresActivation: true, isActive: true },
  { id: 'svc_4', code: 'S-004', name: 'سرویس دوره‌ای سالانه', category: 'خدمات پس از فروش', salePrice: 900000, internalCost: 300000, requiresActivation: true, isActive: true },
  { id: 'svc_5', code: 'S-005', name: 'حمل و جابه‌جایی درون‌شهری', category: 'لجستیک', salePrice: 800000, internalCost: 350000, requiresActivation: false, isActive: true },
  { id: 'svc_6', code: 'S-006', name: 'آموزش استفاده از دستگاه هوشمند', category: 'آموزش', salePrice: 500000, internalCost: 150000, requiresActivation: false, isActive: true },
  { id: 'svc_7', code: 'S-007', name: 'تعویض لاستیک درب یخچال', category: 'تعمیرات', salePrice: 1500000, internalCost: 600000, requiresActivation: false, isActive: true },
  { id: 'svc_8', code: 'S-008', name: 'خدمت متوقف‌شدهٔ نمونه', category: 'سایر', salePrice: 100000, internalCost: 50000, requiresActivation: false, isActive: false }
];

export const DEFAULT_PROMOTIONS: Promotion[] = [
  {
    id: 'promo_1', code: 'PR-001', title: 'بستهٔ آشپزخانهٔ کامل', version: 1, startDate: '۱۴۰۳/۰۴/۰۱', endDate: '۱۴۰۵/۱۲/۲۹',
    coreItems: [{ itemType: 'goods', itemId: 'prod_5', itemName: 'اجاق گاز ۵ شعله استیل', quantity: 1 }, { itemType: 'goods', itemId: 'prod_6', itemName: 'مایکروویو توکار', quantity: 1 }],
    basePrice: 73500000, discountAmount: 5500000, finalPrice: 68000000, salespersonDiscountCap: 2000000, status: 'active',
    conditions: 'فقط برای خرید همزمان هر دو کالا', createdAt: '۱۴۰۳/۰۴/۰۱ - ۰۹:۰۰', createdByUserId: 'user_promotion_manager_1', createdByUserName: 'کیانا رستمی (مدیر پروموشن)'
  },
  {
    id: 'promo_2', code: 'PR-002', title: 'یخچال + نصب رایگان', version: 1, startDate: '۱۴۰۳/۰۴/۰۱', endDate: '۱۴۰۵/۱۲/۲۹',
    coreItems: [{ itemType: 'goods', itemId: 'prod_1', itemName: 'یخچال ساید بای ساید ۲۴ فوت', quantity: 1 }, { itemType: 'service', itemId: 'svc_1', itemName: 'نصب و راه‌اندازی یخچال', quantity: 1 }],
    basePrice: 466200000, discountAmount: 1200000, finalPrice: 465000000, salespersonDiscountCap: 3000000, status: 'active',
    conditions: 'نصب رایگان فقط در محدودهٔ شهر تهران', createdAt: '۱۴۰۳/۰۴/۰۵ - ۰۹:۰۰', createdByUserId: 'user_promotion_manager_1', createdByUserName: 'کیانا رستمی (مدیر پروموشن)'
  },
  {
    id: 'promo_3', code: 'PR-003', title: 'بستهٔ گارانتی طلایی + سرویس سالانه', version: 1, startDate: '۱۴۰۳/۰۴/۰۱', endDate: '۱۴۰۵/۱۲/۲۹',
    coreItems: [{ itemType: 'service', itemId: 'svc_3', itemName: 'گارانتی طلایی ۲ سالهٔ تکمیلی', quantity: 1 }, { itemType: 'service', itemId: 'svc_4', itemName: 'سرویس دوره‌ای سالانه', quantity: 1 }],
    basePrice: 4400000, discountAmount: 400000, finalPrice: 4000000, salespersonDiscountCap: 300000, status: 'active',
    createdAt: '۱۴۰۳/۰۴/۱۰ - ۰۹:۰۰', createdByUserId: 'user_promotion_manager_1', createdByUserName: 'کیانا رستمی (مدیر پروموشن)'
  },
  {
    id: 'promo_4', code: 'PR-004', title: 'تخفیف تلویزیون تک‌کالایی', version: 1, startDate: '۱۴۰۳/۰۴/۰۱', endDate: '۱۴۰۵/۱۲/۲۹',
    coreItems: [{ itemType: 'goods', itemId: 'prod_3', itemName: 'تلویزیون ۵۵ اینچ ۴K', quantity: 1 }],
    basePrice: 129000000, discountAmount: 4000000, finalPrice: 125000000, salespersonDiscountCap: 2000000, status: 'active',
    createdAt: '۱۴۰۳/۰۴/۱۵ - ۰۹:۰۰', createdByUserId: 'user_promotion_manager_1', createdByUserName: 'کیانا رستمی (مدیر پروموشن)'
  },
  {
    id: 'promo_5', code: 'PR-005', title: 'کمپین پاییزهٔ منقضی‌شده', version: 1, startDate: '۱۴۰۲/۰۸/۰۱', endDate: '۱۴۰۲/۰۹/۳۰',
    coreItems: [{ itemType: 'goods', itemId: 'prod_4', itemName: 'جاروبرقی بدون کیسه', quantity: 1 }],
    basePrice: 16500000, discountAmount: 2000000, finalPrice: 14500000, status: 'expired',
    createdAt: '۱۴۰۲/۰۸/۰۱ - ۰۹:۰۰', createdByUserId: 'user_promotion_manager_1', createdByUserName: 'کیانا رستمی (مدیر پروموشن)'
  }
];

const CURRENT_CATALOG_METADATA_MIGRATION_VERSION = 1;

// Migration فقط‌افزودنی برای نصب‌های localStorage موجود: نسخه و آرایه تاریخچه را Backfill
// می‌کند، بدون تغییر قیمت، وضعیت، شناسه یا Snapshot فاکتورهای قبلی.
function ensureCatalogMetadataMigrated(): void {
  const storedVersion = Number(localStorage.getItem(STORAGE_KEYS.CATALOG_METADATA_MIGRATION_VERSION) || 0);
  if (storedVersion >= CURRENT_CATALOG_METADATA_MIGRATION_VERSION) return;

  const products = getStoredData<Product[]>(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS).map(withCatalogMetadata);
  const services = getStoredData<ServiceCatalogItem[]>(STORAGE_KEYS.SERVICES, DEFAULT_SERVICES).map(withCatalogMetadata);
  const promotions = getStoredData<Promotion[]>(STORAGE_KEYS.PROMOTIONS, DEFAULT_PROMOTIONS).map(withCatalogMetadata);
  setStoredData(STORAGE_KEYS.PRODUCTS, products);
  setStoredData(STORAGE_KEYS.SERVICES, services);
  setStoredData(STORAGE_KEYS.PROMOTIONS, promotions);
  localStorage.setItem(STORAGE_KEYS.CATALOG_METADATA_MIGRATION_VERSION, String(CURRENT_CATALOG_METADATA_MIGRATION_VERSION));
}

const CURRENT_SALES_INVOICE_REGISTRATION_FLOW_MIGRATION_VERSION = 1;

function ensureSalesInvoiceRegistrationFlowMigrated(): void {
  const storedVersion = Number(localStorage.getItem(STORAGE_KEYS.SALES_INVOICE_REGISTRATION_FLOW_MIGRATION_VERSION) || 0);
  if (storedVersion >= CURRENT_SALES_INVOICE_REGISTRATION_FLOW_MIGRATION_VERSION) return;

  const invoices = getStoredData<SalesInvoice[]>(STORAGE_KEYS.SALES_INVOICES, DEFAULT_SALES_INVOICES);
  const legacy = invoices.filter((invoice) => invoice.status === 'awaiting_registration_review');
  if (legacy.length > 0) {
    const backupKey = `${STORAGE_KEYS.SALES_INVOICES}_backup_registration_flow_v1`;
    if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(invoices));
    const now = getJalaliNow();
    const migrated = invoices.map((invoice) => {
      if (invoice.status !== 'awaiting_registration_review') return invoice;
      const latest = invoice.history.at(-1);
      const actor = {
        id: invoice.registeredByUserId || latest?.byUserId || invoice.salespersonUserId,
        fullName: invoice.registeredByUserName || latest?.byUserName || invoice.salespersonUserName
      };
      if (evaluateSupervisorSubmissionReadiness(invoice).ok) {
        const submitted = submitInvoiceToSupervisor(invoice, actor, now);
        if (submitted.ok) return submitted.invoice;
      }
      return {
        ...invoice,
        status: 'draft' as const,
        updatedAt: now,
        version: (invoice.version || 1) + 1,
        history: [...invoice.history, {
          id: `${invoice.id}_h${invoice.history.length}`,
          action: 'legacy_registration_gate_removed',
          byUserId: actor.id,
          byUserName: actor.fullName,
          at: now,
          note: 'Gate میانی واحد ثبت حذف شد؛ فاکتور ناقص برای تکمیل پرداخت اعلامی به کارتابل مالک ثبت بازگشت.',
          oldStatus: 'awaiting_registration_review' as const,
          newStatus: 'draft' as const
        }]
      };
    });
    setStoredData(STORAGE_KEYS.SALES_INVOICES, migrated);
  }
  localStorage.setItem(
    STORAGE_KEYS.SALES_INVOICE_REGISTRATION_FLOW_MIGRATION_VERSION,
    String(CURRENT_SALES_INVOICE_REGISTRATION_FLOW_MIGRATION_VERSION)
  );
}

// ============================================================
// Demo فاکتور فروش (بند ۲۱ مأموریت فروش) — ۸ فاکتور با استفاده از موتور واقعی salesInvoice.ts
// (نه رکورد دستی) تا Demo دقیقاً همان قوانین کد فاکتور/Snapshot/محاسبات را رعایت کند.
// ============================================================
function buildDemoInvoiceLine(product: Product | undefined, service: ServiceCatalogItem | undefined, quantity: number, discount: number) {
  const source = product || service!;
  return {
    id: `li_${source.id}_${Math.random().toString(36).slice(2, 6)}`,
    itemType: (product ? 'goods' : 'service') as 'goods' | 'service',
    productId: product?.id, serviceId: service?.id, name: source.name, quantity,
    unitPrice: product ? product.salePrice : service!.salePrice,
    discount, lineTotal: quantity * (product ? product.salePrice : service!.salePrice) - discount,
    sourceType: 'manual_addition' as const
  };
}

function buildDemoSalesInvoices(): SalesInvoice[] {
  const p = (id: string) => DEFAULT_PRODUCTS.find((x) => x.id === id);
  const s = (id: string) => DEFAULT_SERVICES.find((x) => x.id === id);
  const sp = { id: 'user_sales_person_1', fullName: 'زهرا حسینی (فروشنده تلفنی)' };
  const sup = { id: 'user_sales_supervisor_1', fullName: 'بهروز کریمی (سرپرست فروش)' };
  let invoices: SalesInvoice[] = [];

  const spSnapshotResult = buildSalesHierarchySnapshot(sp.id, DEFAULT_SALES_ORG_ASSIGNMENTS, DEFAULT_USERS, DEFAULT_SALES_BRANCHES, '۱۴۰۳/۰۴/۰۱ - ۰۰:۰۰');
  const spSnapshot = spSnapshotResult.ok === true ? spSnapshotResult.snapshot : undefined;

  const inv1 = buildDraftInvoice({ customerId: 'cust_demo_1', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(p('prod_3'), undefined, 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۵ - ۰۹:۰۰');
  invoices = [...invoices, inv1];

  const inv2Draft = buildDraftInvoice({ customerId: 'cust_demo_4', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(p('prod_4'), undefined, 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۵ - ۱۰:۰۰');
  invoices = [...invoices, inv2Draft];

  const inv3DraftBase = buildDraftInvoice({ customerId: 'cust_demo_2', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(p('prod_2'), undefined, 1, 2000000), buildDemoInvoiceLine(undefined, s('svc_1'), 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۴ - ۰۹:۰۰');
  const inv3Reg = registerInvoice(inv3DraftBase, sp, '۱۴۰۳/۰۵/۰۴ - ۰۹:۱۰');
  const inv3 = inv3Reg.ok ? inv3Reg.invoice : inv3DraftBase;
  invoices = [...invoices, inv3];

  const inv4DraftBase = buildDraftInvoice({ customerId: 'cust_demo_6', leadId: 'lead_demo_13', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(p('prod_7'), undefined, 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۳ - ۰۹:۰۰');
  const inv4RegRes = registerInvoice(inv4DraftBase, sp, '۱۴۰۳/۰۵/۰۳ - ۰۹:۱۰');
  const inv4 = inv4RegRes.ok ? inv4RegRes.invoice : inv4DraftBase;
  invoices = [...invoices, inv4];

  const inv5DraftBase = buildDraftInvoice({ customerId: 'cust_demo_8', leadId: 'lead_demo_15', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(p('prod_1'), undefined, 1, 1200000)] }, invoices, '۱۴۰۳/۰۵/۰۶ - ۰۹:۰۰');
  const inv5RegRes = registerInvoice(inv5DraftBase, sp, '۱۴۰۳/۰۵/۰۶ - ۰۹:۱۰');
  let inv5 = inv5RegRes.ok ? inv5RegRes.invoice : inv5DraftBase;
  const inv5PayRes = addDeclaredPayment(inv5, { id: 'pay_demo_1', amount: 200000000, date: '۱۴۰۳/۰۵/۰۶', method: 'card_to_card', trackingNumber: '1029384756', recordedByUserId: sp.id, recordedByUserName: sp.fullName, recordedAt: '۱۴۰۳/۰۵/۰۶ - ۱۰:۰۰', status: 'declared' }, '۱۴۰۳/۰۵/۰۶ - ۱۰:۰۰');
  if (inv5PayRes.ok) inv5 = inv5PayRes.invoice;
  invoices = [...invoices, inv5];

  const inv6DraftBase = buildDraftInvoice({ customerId: 'cust_demo_9', leadId: 'lead_demo_16', salespersonUserId: sup.id, salespersonUserName: sup.fullName, lineItems: [buildDemoInvoiceLine(p('prod_5'), undefined, 1, 0), buildDemoInvoiceLine(p('prod_6'), undefined, 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۷ - ۰۹:۰۰');
  const inv6RegRes = registerInvoice(inv6DraftBase, sup, '۱۴۰۳/۰۵/۰۷ - ۰۹:۱۰');
  let inv6 = inv6RegRes.ok ? inv6RegRes.invoice : inv6DraftBase;
  const inv6PayRes = addDeclaredPayment(inv6, { id: 'pay_demo_2', amount: inv6.finalAmount, date: '۱۴۰۳/۰۵/۰۷', method: 'gateway', recordedByUserId: sup.id, recordedByUserName: sup.fullName, recordedAt: '۱۴۰۳/۰۵/۰۷ - ۱۰:۰۰', status: 'declared' }, '۱۴۰۳/۰۵/۰۷ - ۱۰:۰۰');
  if (inv6PayRes.ok) inv6 = inv6PayRes.invoice;
  invoices = [...invoices, inv6];

  const inv7DraftBase = buildDraftInvoice({ customerId: 'cust_demo_3', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(p('prod_8'), undefined, 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۲ - ۰۹:۰۰');
  const inv7RegRes = registerInvoice(inv7DraftBase, sp, '۱۴۰۳/۰۵/۰۲ - ۰۹:۱۰');
  let inv7 = inv7RegRes.ok ? inv7RegRes.invoice : inv7DraftBase;
  const inv7ReturnRes = returnInvoiceToSalesperson(inv7, 'کالای انتخاب‌شده غیرفعال است — لطفاً کالای جایگزین ثبت شود', sup, '۱۴۰۳/۰۵/۰۲ - ۱۱:۰۰');
  if (inv7ReturnRes.ok) inv7 = inv7ReturnRes.invoice;
  invoices = [...invoices, inv7];

  const inv8 = buildDraftInvoice({ customerId: 'cust_demo_7', salespersonUserId: sp.id, salespersonUserName: sp.fullName, salesSupervisorId: sup.id, salesSupervisorName: sup.fullName, salesHierarchySnapshot: spSnapshot, lineItems: [buildDemoInvoiceLine(undefined, s('svc_3'), 1, 0), buildDemoInvoiceLine(undefined, s('svc_4'), 1, 0)] }, invoices, '۱۴۰۳/۰۵/۰۸ - ۰۹:۰۰');
  invoices = [...invoices, inv8];

  return invoices;
}

// ============================================================
// سناریوی طلایی فاکتور ترکیبی (مأموریت تکمیلی) — کاملاً با موتورهای واقعی ساخته می‌شود، نه
// رکورد دستی: پروموشن PR-002 به ۲ ردیف واقعی (کالا+خدمت) تفکیک، بعلاوهٔ ۳ ردیف Cross-sell
// مستقل (۲ کالا + ۳ خدمت جمعاً)؛ فروشنده sales_hosseini می‌سازد و ارسال می‌کند، واحد ثبت
// entry_amini تأیید ثبت می‌کند (کمیسیون همچنان مال فروشنده اصلی می‌ماند)، ۳ پرداخت اعلامی
// می‌شود و مسئول تأیید مالی sales_pay_tavakoli ردیفی تصمیم می‌گیرد: ۲۰۰M تأیید، ۱۵۰M رد، ۴۵۸.۴M
// تأیید — جمع تأییدشده دقیقاً برابر ۶۵۸,۴۰۰,۰۰۰ ریال، فاکتور financial_confirmed می‌شود، سپس
// ۲ پروندهٔ اجرای کالا + ۳ پروندهٔ اجرای خدمت idempotent ساخته می‌شود.
// ============================================================
function buildGoldenMixedInvoiceDemo(existingInvoices: SalesInvoice[]): {
  invoice: SalesInvoice; productCases: ProductFulfillmentCase[]; serviceCases: ServiceFulfillmentCase[];
  coordinationCase: CoordinationCase; coordinationAttempts: CoordinationAttempt[];
} {
  const p = (id: string) => DEFAULT_PRODUCTS.find((x) => x.id === id);
  const s = (id: string) => DEFAULT_SERVICES.find((x) => x.id === id);
  const promo = DEFAULT_PROMOTIONS.find((x) => x.code === 'PR-002')!;
  const salesperson = { id: 'user_sales_person_1', fullName: 'زهرا حسینی (فروشنده تلفنی)' };
  const supervisor = { id: 'user_sales_supervisor_1', fullName: 'بهروز کریمی (سرپرست فروش)' };
  const registrar = { id: 'user_data_entry_unit_1', fullName: 'پریسا امینی (واحد ثبت)' };
  const coordManager = { id: 'user_coordination_manager_1', fullName: 'الهام قربانی (مدیر هماهنگی)' };
  const coordSpecialist = { id: 'user_coordination_specialist_1', fullName: 'یاسر رحیمی (مسئول هماهنگی)' };
  const financialApprover = { id: 'user_sales_payment_approver_1', fullName: 'مهدی توکلی (مسئول تأیید مالی واریزی فروش)' };

  const promoLines = splitPromotionIntoLineItems(promo, DEFAULT_PRODUCTS, DEFAULT_SERVICES);
  const crossSellLines = [
    buildDemoInvoiceLine(p('prod_2'), undefined, 1, 0),
    buildDemoInvoiceLine(undefined, s('svc_3'), 1, 0),
    buildDemoInvoiceLine(undefined, s('svc_4'), 1, 0)
  ];

  const goldenSnapshotResult = buildSalesHierarchySnapshot(salesperson.id, DEFAULT_SALES_ORG_ASSIGNMENTS, DEFAULT_USERS, DEFAULT_SALES_BRANCHES, '۱۴۰۳/۰۵/۱۰ - ۰۹:۰۰');
  const draft = buildDraftInvoice({
    customerId: 'cust_golden_mixed_invoice', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName,
    salesSupervisorId: supervisor.id, salesSupervisorName: supervisor.fullName,
    salesHierarchySnapshot: goldenSnapshotResult.ok === true ? goldenSnapshotResult.snapshot : undefined,
    lineItems: [...promoLines, ...crossSellLines]
  }, existingInvoices, '۱۴۰۳/۰۵/۱۰ - ۰۹:۰۰');

  let invoice = draft;
  const submitted = submitForRegistrationReview(invoice, salesperson, '۱۴۰۳/۰۵/۱۰ - ۰۹:۱۰');
  if (submitted.ok) invoice = submitted.invoice;
  const approved = approveRegistration(invoice, registrar, '۱۴۰۳/۰۵/۱۰ - ۱۰:۰۰');
  if (approved.ok) invoice = { ...approved.invoice, registeredByUserId: registrar.id, registeredByUserName: registrar.fullName };

  // بند ۲۱ AGENTS.md: قبل از هر پرداخت اعلامی/بررسی مالی، تأیید اجباری سرپرست لازم است.
  const supervisorApproved = approveSupervisorInvoice(
    invoice, { approverUserId: supervisor.id, approverUserName: supervisor.fullName, snapshotSupervisorUserId: supervisor.id, isSuccessor: false },
    '۱۴۰۳/۰۵/۱۰ - ۱۰:۱۵'
  );
  if (supervisorApproved.ok) invoice = supervisorApproved.invoice;

  const pay1 = addDeclaredPayment(invoice, { id: 'pay_golden_1', amount: 200000000, date: '۱۴۰۳/۰۵/۱۰', method: 'card_to_card', trackingNumber: '1111222233', recordedByUserId: registrar.id, recordedByUserName: registrar.fullName, recordedAt: '۱۴۰۳/۰۵/۱۰ - ۱۰:۳۰', status: 'declared' }, '۱۴۰۳/۰۵/۱۰ - ۱۰:۳۰');
  if (pay1.ok) invoice = pay1.invoice;
  const pay2 = addDeclaredPayment(invoice, { id: 'pay_golden_2', amount: 150000000, date: '۱۴۰۳/۰۵/۱۰', method: 'card_to_card', trackingNumber: '4444555566', recordedByUserId: registrar.id, recordedByUserName: registrar.fullName, recordedAt: '۱۴۰۳/۰۵/۱۰ - ۱۰:۳۵', status: 'declared' }, '۱۴۰۳/۰۵/۱۰ - ۱۰:۳۵');
  if (pay2.ok) invoice = pay2.invoice;
  const pay3 = addDeclaredPayment(invoice, { id: 'pay_golden_3', amount: 458400000, date: '۱۴۰۳/۰۵/۱۰', method: 'gateway', recordedByUserId: registrar.id, recordedByUserName: registrar.fullName, recordedAt: '۱۴۰۳/۰۵/۱۰ - ۱۰:۴۰', status: 'declared' }, '۱۴۰۳/۰۵/۱۰ - ۱۰:۴۰');
  if (pay3.ok) invoice = pay3.invoice;

  // بند ۱۳ سند مادر: بعد از تأیید سرپرست، فاکتور از صف مدیر هماهنگی عبور می‌کند — نه مستقیم به
  // مالی. یک پروندهٔ هماهنگی واقعی با تخصیص/Claim/تأیید ساخته می‌شود تا سناریوی طلایی این مرحله
  // را هم مثل بقیهٔ فلو با موتور واقعی (نه رکورد دستی) اثبات کند. تاریخ‌های این تابع همیشه رشتهٔ
  // نمایشی شمسی‌اند (نه ISO)؛ Eventهای هماهنگی تازه به ISO واقعی نیاز دارند — یک ISO ثابت و
  // معنادار (نه new Date() لحظه‌ای) استفاده می‌شود تا Seed در هر بار Build یکسان بماند.
  const coordActorManager: ActorContext = { effective: coordManager, real: null };
  const coordActorSpecialist: ActorContext = { effective: coordSpecialist, real: null };
  const coordNowIso1 = '2024-07-31T07:00:00.000Z';
  const coordNowIso2 = '2024-07-31T07:15:00.000Z';
  const coordNowIso3 = '2024-07-31T07:30:00.000Z';

  let coordinationCase = createCoordinationCase(invoice, coordNowIso1);
  let coordinationAttempts: CoordinationAttempt[] = [];
  const assignRes = assignCoordinationCase(coordinationCase, coordSpecialist, coordActorManager, coordNowIso1);
  if (assignRes.ok) { coordinationCase = assignRes.case; coordinationAttempts.push(assignRes.attempt); }
  const claimRes = claimCoordinationCase(coordinationCase, coordActorSpecialist, coordNowIso2);
  if (claimRes.ok) { coordinationCase = claimRes.case; coordinationAttempts.push(claimRes.attempt); }
  coordinationCase = {
    ...coordinationCase,
    checklist: coordinationCase.checklist.map((item) => ({
      ...item, decision: 'confirmed', updatedAt: '۱۴۰۳/۰۵/۱۰ - ۱۱:۰۰:۰۰',
      updatedByUserId: coordSpecialist.id, updatedByUserName: coordSpecialist.fullName
    }))
  };
  const confirmedAttempt = recordCoordinationAttempt(coordinationCase, coordActorSpecialist, coordNowIso3, 'confirmed', { note: 'تأیید مشتری' });
  if (confirmedAttempt.ok) { coordinationCase = confirmedAttempt.case; coordinationAttempts.push(confirmedAttempt.attempt); }
  const approveRes = approveCoordinationCase(coordinationCase, coordActorSpecialist, coordNowIso3, coordinationAttempts);
  if (approveRes.ok) { coordinationCase = approveRes.case; coordinationAttempts.push(approveRes.attempt); }

  const enteredFinancial = enterFinancialConfirmation(invoice, coordSpecialist, '۱۴۰۳/۰۵/۱۰ - ۱۱:۰۰', {
    caseId: coordinationCase.id, invoiceId: invoice.id, decision: 'confirmed'
  });
  if (enteredFinancial.ok) invoice = enteredFinancial.invoice;

  const dec1 = decideDeclaredPayment(invoice, 'pay_golden_1', 'approved', 200000000, undefined, financialApprover, '۱۴۰۳/۰۵/۱۰ - ۱۲:۰۰');
  if (dec1.ok) invoice = dec1.invoice;
  const dec2 = decideDeclaredPayment(invoice, 'pay_golden_2', 'rejected', undefined, 'واریزی با شمارهٔ فاکتور دیگری مطابقت داشت — نامرتبط با این فاکتور', financialApprover, '۱۴۰۳/۰۵/۱۰ - ۱۲:۱۰');
  if (dec2.ok) invoice = dec2.invoice;
  const dec3 = decideDeclaredPayment(invoice, 'pay_golden_3', 'approved', 458400000, undefined, financialApprover, '۱۴۰۳/۰۵/۱۰ - ۱۲:۲۰');
  if (dec3.ok) invoice = dec3.invoice;

  const { newProductCases, newServiceCases } = generateFulfillmentCases(invoice, [], [], '۱۴۰۳/۰۵/۱۰ - ۱۲:۳۰');
  // همان قاعدهٔ Handler زنده (SalesFinancialConfirmationView): به‌محض ساخت پروندهٔ اجرا، فاکتور
  // بلافاصله به «در حال اجرا» می‌رود — هرگز روی financial_confirmed باقی نمی‌ماند.
  if (invoice.status === 'financial_confirmed') invoice = { ...invoice, status: 'fulfillment_in_progress' };

  return { invoice, productCases: newProductCases, serviceCases: newServiceCases, coordinationCase, coordinationAttempts };
}

const demoSalesInvoicesBase = buildDemoSalesInvoices();
const goldenMixedInvoiceDemo = buildGoldenMixedInvoiceDemo(demoSalesInvoicesBase);

export const DEFAULT_SALES_INVOICES: SalesInvoice[] = [...demoSalesInvoicesBase, goldenMixedInvoiceDemo.invoice];
export const DEFAULT_PRODUCT_FULFILLMENT_CASES: ProductFulfillmentCase[] = goldenMixedInvoiceDemo.productCases;
export const DEFAULT_SERVICE_FULFILLMENT_CASES: ServiceFulfillmentCase[] = goldenMixedInvoiceDemo.serviceCases;
export const DEFAULT_COORDINATION_CASES: CoordinationCase[] = [goldenMixedInvoiceDemo.coordinationCase];
export const DEFAULT_COORDINATION_ATTEMPTS: CoordinationAttempt[] = goldenMixedInvoiceDemo.coordinationAttempts;

// Migration افزایشی پرونده‌های اجرای خدمت — نسخهٔ ۱ فقط آرایهٔ مدرک جدید را برای رکوردهای
// قدیمی مقداردهی می‌کند. وضعیت completed قدیمی هرگز باز نمی‌شود و هیچ Timeline/مالکیتی
// overwrite نمی‌گردد؛ بنابراین نصب‌های موجود بدون Reset با مدل تازه سازگار می‌مانند.
const CURRENT_SERVICE_FULFILLMENT_MIGRATION_VERSION = 1;

function ensureServiceFulfillmentCasesMigrated(): void {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.SERVICE_FULFILLMENT_MIGRATION_VERSION);
  const storedVersion = storedVersionRaw ? Number.parseInt(storedVersionRaw, 10) : 0;
  if (storedVersion >= CURRENT_SERVICE_FULFILLMENT_MIGRATION_VERSION) return;

  const existing = getStoredData<ServiceFulfillmentCase[]>(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, DEFAULT_SERVICE_FULFILLMENT_CASES);
  const migrated = existing.map((kase) => ({
    ...kase,
    completionEvidence: Array.isArray(kase.completionEvidence) ? kase.completionEvidence : []
  }));
  setStoredData(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, migrated);
  localStorage.setItem(STORAGE_KEYS.SERVICE_FULFILLMENT_MIGRATION_VERSION, String(CURRENT_SERVICE_FULFILLMENT_MIGRATION_VERSION));
}

// نسخه‌ای از localStorage که پیش از این مأموریت پر شده بود (Array فاکتور فروش/پروندهٔ اجرا از
// قبل ذخیره شده) هرگز DEFAULT_SALES_INVOICES تازه را نمی‌بیند — getStoredData فقط وقتی کلید
// اصلاً غایب باشد از Default استفاده می‌کند. این تابع دقیقاً مثل ensureDefaultUsersMigrated/
// ensureCustomersMigrated، فقط افزودنی و Idempotent، سناریوی طلایی را به نصب‌های موجود هم
// می‌رساند — بدون Reset هیچ دادهٔ موجودی.
// نسخهٔ ۲: اصلاح یک باگ محاسباتی نسخهٔ ۱ (وضعیت فاکتور طلایی روی financial_confirmed
// می‌ماند با اینکه پروندهٔ اجرا از قبل ساخته شده) — فقط همین یک رکورد شناخته‌شده (بر اساس
// customerId) اصلاح می‌شود؛ هیچ دادهٔ دیگری (از جمله تصمیم/تاریخچهٔ همین فاکتور) دست نمی‌خورد.
// نسخهٔ ۳: پاک‌سازی پروندهٔ اجرای یتیم (invoiceId که به هیچ فاکتور موجودی اشاره نمی‌کند) —
// یک عملیات کاملاً امن و عمومی (نه مخصوص همین سناریو)، چون پروندهٔ بدون فاکتور مادر در هیچ
// سناریویی معنا ندارد؛ هیچ پروندهٔ متصل به یک فاکتور واقعی هرگز حذف نمی‌شود.
// Version 9 repairs only known golden demo records when an older seed left
// its calculated totals at zero. It never rewrites ordinary/user invoices.
const CURRENT_GOLDEN_MIXED_INVOICE_SEED_VERSION = 9;

function ensureGoldenMixedInvoiceSeeded(): void {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.GOLDEN_MIXED_INVOICE_SEED_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;
  if (storedVersion >= CURRENT_GOLDEN_MIXED_INVOICE_SEED_VERSION) return;

  let existingInvoices = getStoredData<SalesInvoice[]>(STORAGE_KEYS.SALES_INVOICES, DEFAULT_SALES_INVOICES);
  const existingGolden = existingInvoices.find((inv) => inv.customerId === 'cust_golden_mixed_invoice');
  if (!existingGolden) {
    const golden = buildGoldenMixedInvoiceDemo(existingInvoices);
    const existingProductCases = getStoredData<ProductFulfillmentCase[]>(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, DEFAULT_PRODUCT_FULFILLMENT_CASES);
    const existingServiceCases = getStoredData<ServiceFulfillmentCase[]>(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, DEFAULT_SERVICE_FULFILLMENT_CASES);
    const existingCoordCases = getStoredData<CoordinationCase[]>(STORAGE_KEYS.COORDINATION_CASES, DEFAULT_COORDINATION_CASES);
    const existingCoordAttempts = getStoredData<CoordinationAttempt[]>(STORAGE_KEYS.COORDINATION_ATTEMPTS, DEFAULT_COORDINATION_ATTEMPTS);
    existingInvoices = [...existingInvoices, golden.invoice];
    setStoredData(STORAGE_KEYS.SALES_INVOICES, existingInvoices);
    setStoredData(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, [...existingProductCases, ...golden.productCases]);
    setStoredData(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, [...existingServiceCases, ...golden.serviceCases]);
    setStoredData(STORAGE_KEYS.COORDINATION_CASES, [...existingCoordCases, golden.coordinationCase]);
    setStoredData(STORAGE_KEYS.COORDINATION_ATTEMPTS, [...existingCoordAttempts, ...golden.coordinationAttempts]);
  } else {
    const canonicalGolden = goldenMixedInvoiceDemo.invoice;
    if (Number(existingGolden.finalAmount || 0) <= 0 && canonicalGolden.finalAmount > 0) {
      existingInvoices = existingInvoices.map((inv) => inv.customerId === 'cust_golden_mixed_invoice' && Number(inv.finalAmount || 0) <= 0
        ? {
            ...inv,
            lineItems: canonicalGolden.lineItems,
            subtotal: canonicalGolden.subtotal,
            totalDiscount: canonicalGolden.totalDiscount,
            finalAmount: canonicalGolden.finalAmount,
            remainingAmount: Math.max(0, canonicalGolden.finalAmount - inv.paidAmount)
          }
        : inv);
      setStoredData(STORAGE_KEYS.SALES_INVOICES, existingInvoices);
    }

    if (existingGolden.status === 'financial_confirmed') {
      const hasCases =
        getStoredData<ProductFulfillmentCase[]>(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, DEFAULT_PRODUCT_FULFILLMENT_CASES).some((c) => c.invoiceId === existingGolden.id) ||
        getStoredData<ServiceFulfillmentCase[]>(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, DEFAULT_SERVICE_FULFILLMENT_CASES).some((c) => c.invoiceId === existingGolden.id);
      if (hasCases) {
        existingInvoices = existingInvoices.map((inv) => (inv.id === existingGolden.id ? { ...inv, status: 'fulfillment_in_progress' as const } : inv));
        setStoredData(STORAGE_KEYS.SALES_INVOICES, existingInvoices);
      }
    }
  }

  const invoiceIds = new Set(existingInvoices.map((inv) => inv.id));
  const canonicalStoredGolden = existingInvoices.find((inv) =>
    inv.customerId === 'cust_golden_mixed_invoice' && Number(inv.finalAmount || 0) > 0
  );
  if (canonicalStoredGolden) {
    const coordinationCases = getStoredData<CoordinationCase[]>(STORAGE_KEYS.COORDINATION_CASES, DEFAULT_COORDINATION_CASES);
    const repairedCases = coordinationCases.map((kase) =>
      kase.customerId === 'cust_golden_mixed_invoice' && !invoiceIds.has(kase.invoiceId)
        ? { ...kase, invoiceId: canonicalStoredGolden.id, invoiceCode: canonicalStoredGolden.invoiceCode }
        : kase
    );
    if (JSON.stringify(coordinationCases) !== JSON.stringify(repairedCases)) {
      setStoredData(STORAGE_KEYS.COORDINATION_CASES, repairedCases);
    }
    const caseInvoiceIds = new Map(repairedCases.map((kase) => [kase.id, kase.invoiceId]));
    const attempts = getStoredData<CoordinationAttempt[]>(STORAGE_KEYS.COORDINATION_ATTEMPTS, DEFAULT_COORDINATION_ATTEMPTS);
    let repairedAttempts = attempts.map((attempt) => {
      const repairedInvoiceId = caseInvoiceIds.get(attempt.caseId);
      return repairedInvoiceId && repairedInvoiceId !== attempt.invoiceId
        ? { ...attempt, invoiceId: repairedInvoiceId }
        : attempt;
    });
    const goldenCase = repairedCases.find((kase) => kase.customerId === 'cust_golden_mixed_invoice');
    if (goldenCase && !repairedAttempts.some((attempt) => attempt.caseId === goldenCase.id)) {
      const canonicalAttempts = goldenMixedInvoiceDemo.coordinationAttempts.map((attempt, index) => ({
        ...attempt,
        id: `${goldenCase.id}_seed_attempt_${index + 1}`,
        caseId: goldenCase.id,
        invoiceId: canonicalStoredGolden.id
      }));
      repairedAttempts = [...repairedAttempts, ...canonicalAttempts];
    }
    if (JSON.stringify(attempts) !== JSON.stringify(repairedAttempts)) {
      setStoredData(STORAGE_KEYS.COORDINATION_ATTEMPTS, repairedAttempts);
    }
  }
  const productCases = getStoredData<ProductFulfillmentCase[]>(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, DEFAULT_PRODUCT_FULFILLMENT_CASES);
  const cleanedProductCases = productCases.filter((c) => invoiceIds.has(c.invoiceId));
  if (cleanedProductCases.length !== productCases.length) setStoredData(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, cleanedProductCases);
  const serviceCases = getStoredData<ServiceFulfillmentCase[]>(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, DEFAULT_SERVICE_FULFILLMENT_CASES);
  const cleanedServiceCases = serviceCases.filter((c) => invoiceIds.has(c.invoiceId));
  if (cleanedServiceCases.length !== serviceCases.length) setStoredData(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, cleanedServiceCases);

  localStorage.setItem(STORAGE_KEYS.GOLDEN_MIXED_INVOICE_SEED_VERSION, String(CURRENT_GOLDEN_MIXED_INVOICE_SEED_VERSION));
}

// ============================================================
// Seed افزایشی و Idempotent ساختار سازمان فروش (شعب + انتصاب پنج‌سطحی) — همان الگوی
// ensureGoldenMixedInvoiceSeeded: فقط شناسه‌های غایب اضافه می‌شوند؛ هیچ شعبه/انتصاب موجودی
// (حتی اگر ادمین آن را از پنل ویرایش کرده باشد) هرگز overwrite نمی‌شود.
// ============================================================
const CURRENT_SALES_ORG_STRUCTURE_SEED_VERSION = 2;

function ensureSalesOrgStructureSeeded(): void {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.SALES_ORG_STRUCTURE_SEED_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;
  if (storedVersion >= CURRENT_SALES_ORG_STRUCTURE_SEED_VERSION) return;

  const existingBranches = getStoredData<SalesBranch[]>(STORAGE_KEYS.SALES_BRANCHES, DEFAULT_SALES_BRANCHES);
  const existingBranchIds = new Set(existingBranches.map((b) => b.id));
  const missingBranches = DEFAULT_SALES_BRANCHES.filter((b) => !existingBranchIds.has(b.id));
  if (missingBranches.length > 0) {
    setStoredData(STORAGE_KEYS.SALES_BRANCHES, [...existingBranches, ...missingBranches]);
  }

  // نسخه ۲ (مأموریت چرخهٔ عمر نیروی فروش): زنجیره‌های ثابت داخل شعبه — همان الگوی افزودنی.
  const existingChains = getStoredData<SalesChain[]>(STORAGE_KEYS.SALES_CHAINS, DEFAULT_SALES_CHAINS);
  const existingChainIds = new Set(existingChains.map((c) => c.id));
  const missingChains = DEFAULT_SALES_CHAINS.filter((c) => !existingChainIds.has(c.id));
  if (missingChains.length > 0) {
    setStoredData(STORAGE_KEYS.SALES_CHAINS, [...existingChains, ...missingChains]);
  }

  const existingAssignments = getStoredData<SalesOrgAssignment[]>(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, DEFAULT_SALES_ORG_ASSIGNMENTS);
  const existingAssignmentIds = new Set(existingAssignments.map((a) => a.id));
  const missingAssignments = DEFAULT_SALES_ORG_ASSIGNMENTS.filter((a) => !existingAssignmentIds.has(a.id));
  if (missingAssignments.length > 0) {
    setStoredData(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, [...existingAssignments, ...missingAssignments]);
  }

  localStorage.setItem(STORAGE_KEYS.SALES_ORG_STRUCTURE_SEED_VERSION, String(CURRENT_SALES_ORG_STRUCTURE_SEED_VERSION));
}

// ============================================================
// Backfill قفل «اولین استفادهٔ مؤثر» برای انتصاب‌های قدیمی (بدهی #۱ مأموریت جاری). چون این
// مکانیزم قفل بعد از این‌که داده‌های Demo/قدیمی از قبل تماس/فاکتور واقعی داشتند اضافه شد، بدون
// این Migration انتصاب‌های قدیمی هرگز قفل نمی‌شدند — نه چون بی‌استفاده بودند، بلکه چون مکانیزم
// ثبت وقتی آن‌ها استفاده شدند هنوز وجود نداشت. این تابع فقط رویداد واقعیِ از‌قبل‌موجود (اولین
// تماس ثبت‌شده یا اولین فاکتور همان فروشنده، هرکدام زودتر) را به‌عنوان مدرک قفل می‌کند — هرگز
// یک زمان جعلی/امروز نمی‌سازد؛ اگر مدرک واقعی‌ای نبود، انتصاب دست‌نخورده (باز) می‌ماند. افزودنی،
// Idempotent (نسخه‌دار) و کاملاً بدون حذف — دقیقاً همان الگوی ensureSalesOrgStructureSeeded.
// ============================================================
const CURRENT_SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION = 1;

function ensureSalesAssignmentBusinessUseBackfilled(): void {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;
  if (storedVersion >= CURRENT_SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION) return;

  const assignments = getStoredData<SalesOrgAssignment[]>(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, DEFAULT_SALES_ORG_ASSIGNMENTS);
  const callLogs = getStoredData<CallLogEntry[]>(STORAGE_KEYS.CALL_LOGS, []);
  const invoices = getStoredData<SalesInvoice[]>(STORAGE_KEYS.SALES_INVOICES, DEFAULT_SALES_INVOICES);

  let backfilledCount = 0;
  const updated = assignments.map((a) => {
    if (!a.isActive || a.immutableAfterFirstBusinessUse === true) return a;
    const candidates: { type: string; id: string; at: string }[] = [];
    for (const cl of callLogs) {
      if (cl.salespersonUserId === a.userId) candidates.push({ type: 'call_logged', id: cl.id, at: cl.createdAt });
    }
    for (const inv of invoices) {
      if (inv.salespersonUserId === a.userId) candidates.push({ type: 'invoice_created', id: inv.id, at: inv.createdAt });
    }
    if (candidates.length === 0) return a;
    // فرمت createdAt همیشه Jalali با پهنای ثابت (YYYY/MM/DD - HH:mm[:ss]) است — مقایسهٔ رشته‌ای
    // برای پیدا کردن زودترین رویداد در همین پهنای ثابت درست است.
    candidates.sort((x, y) => x.at.localeCompare(y.at));
    const earliest = candidates[0];
    backfilledCount += 1;
    return { ...a, immutableAfterFirstBusinessUse: true, firstBusinessEventAt: earliest.at, firstBusinessEventType: earliest.type, firstBusinessEventId: earliest.id };
  });

  if (backfilledCount > 0) setStoredData(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, updated);
  localStorage.setItem(STORAGE_KEYS.SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION, String(CURRENT_SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION));
  localStorage.setItem(
    `${STORAGE_KEYS.SALES_ORG_ASSIGNMENTS}_lock_backfill_log`,
    JSON.stringify({ version: CURRENT_SALES_ASSIGNMENT_LOCK_BACKFILL_VERSION, backfilledCount, totalActive: assignments.filter((a) => a.isActive).length, at: getJalaliNow() })
  );
}

// ============================================================
// Migration رکوردهای Customer به مدل چندمقداری پروفایل یکپارچه (فاز ۱ CRM) — idempotent،
// افزودنی، ایزولهٔ خطا در سطح هر رکورد (شکست یک رکورد بقیه را overwrite نمی‌کند)، با یک
// Backup منطقی نسخه‌دار پیش از اولین اجرا و گزارش نتیجه (موفق/Skip/Conflict).
// ============================================================
// نسخه ۲: علاوه بر Migration اسکیمای چندمقداری (v1)، شناسه‌های DEFAULT_CUSTOMERS غایب را هم
// اضافه می‌کند — دقیقاً همان الگوی ensureDefaultUsersMigrated؛ فقط افزودنی، هیچ مشتری موجودی
// (حتی اگر ادمین/فروشنده ویرایشش کرده باشد) هرگز overwrite نمی‌شود.
const CURRENT_CUSTOMERS_MIGRATION_VERSION = 3;

function normalizePhoneForMigration(raw: string): string {
  const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const digits = faToEn(raw).replace(/\D/g, '');
  if (digits.startsWith('0098')) return '0' + digits.slice(4);
  if (digits.startsWith('98') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.length === 10 && digits.startsWith('9')) return '0' + digits;
  return digits;
}

// یک رکورد Customer قدیمی را (بدون هیچ حذف/تغییر فیلد موجود) با Entry های منبع‌دار معادل
// تکمیل می‌کند. اگر از قبل حداقل یک phoneEntry داشته باشد، رکورد قبلاً Migrate شده و بدون تغییر
// برمی‌گردد (Idempotent — اجرای مجدد چیزی تکراری نمی‌سازد).
function migrateOneCustomer(c: Customer): Customer {
  if (c.phoneEntries && c.phoneEntries.length > 0) return c;

  const recordedAt = c.createdAt || getJalaliNow();
  const recordedByUserId = c.activityLog?.[0]?.salespersonId || 'system_migration';
  const recordedByName = 'Migration خودکار (دادهٔ قدیمی)';

  const phoneEntries = [c.phone1, c.phone2]
    .map((p, idx) => (p && p.trim() ? { raw: p.trim(), isPrimary: idx === 0 } : null))
    .filter((x): x is { raw: string; isPrimary: boolean } => x !== null)
    .map((x, idx) => ({
      id: `phone_legacy_${c.id}_${idx}`,
      value: x.raw,
      normalizedValue: normalizePhoneForMigration(x.raw),
      source: 'legacy_migration' as const,
      recordedAt, recordedByUserId, recordedByName,
      isCustomerConfirmed: false,
      isCurrentPrimary: x.isPrimary
    }));

  const nameEntries = c.fullName && c.fullName.trim()
    ? [{
        id: `name_legacy_${c.id}_0`,
        value: c.fullName.trim(),
        normalizedValue: c.fullName.trim().replace(/\s+/g, ' '),
        source: 'legacy_migration' as const,
        recordedAt, recordedByUserId, recordedByName,
        isCustomerConfirmed: false, isCurrentPrimary: true
      }]
    : [];

  const addressEntries = c.address && c.address.trim()
    ? [{
        id: `address_legacy_${c.id}_0`,
        address: c.address.trim(), province: c.province, city: c.city, postalCode: c.postalCode,
        normalizedValue: c.address.trim().replace(/\s+/g, ' '),
        source: 'legacy_migration' as const,
        recordedAt, recordedByUserId, recordedByName,
        isCustomerConfirmed: false, isCurrentPrimary: true
      }]
    : [];

  return {
    ...c,
    phoneEntries, nameEntries, addressEntries,
    identityStatus: (c.fullName && c.phone1) ? 'complete' : 'incomplete',
    financialStatus: 'reconciled',
    complaintStatus: 'none',
    satisfactionStatus: 'unknown',
    updatedAt: getJalaliNow(),
    version: 1
  };
}

function ensureCustomersMigrated(existingCustomers: Customer[]): Customer[] {
  const storedVersionRaw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS_MIGRATION_VERSION);
  const storedVersion = storedVersionRaw ? parseInt(storedVersionRaw, 10) : 0;
  if (storedVersion >= CURRENT_CUSTOMERS_MIGRATION_VERSION) return existingCustomers;

  // Backup منطقی یک‌باره از داده خام پیش از این نسخهٔ Migration
  const backupKey = `${STORAGE_KEYS.CUSTOMERS}_backup_v${CURRENT_CUSTOMERS_MIGRATION_VERSION}`;
  if (!localStorage.getItem(backupKey)) {
    const rawExisting = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (rawExisting) localStorage.setItem(backupKey, rawExisting);
  }

  let migratedCount = 0, skippedCount = 0, conflictCount = 0;
  const migrated = existingCustomers.map((c) => {
    try {
      if (c.phoneEntries && c.phoneEntries.length > 0) { skippedCount++; return c; }
      const result = migrateOneCustomer(c);
      migratedCount++;
      return result;
    } catch {
      // خطای یک رکورد کل مجموعه را overwrite نمی‌کند — همان رکورد دست‌نخورده باقی می‌ماند
      conflictCount++;
      return c;
    }
  });

  // این تابع فقط وقتی به این خط می‌رسد که storedVersion < CURRENT_CUSTOMERS_MIGRATION_VERSION
  // باشد (بازگشت زودهنگام بالا) — پس بررسی شناسه‌های غایب همیشه در همین‌جا امن است، نه فقط
  // برای اولین ارتقا؛ همین قاعده باعث شد مشتری سناریوی طلایی (نسخهٔ ۳) به نصب‌های نسخهٔ ۲ هم برسد.
  const existingIds = new Set(migrated.map((c) => c.id));
  const missingDefaultCustomers = DEFAULT_CUSTOMERS.filter((c) => !existingIds.has(c.id));
  const finalCustomers = missingDefaultCustomers.length > 0 ? [...migrated, ...missingDefaultCustomers] : migrated;

  setStoredData(STORAGE_KEYS.CUSTOMERS, finalCustomers);
  localStorage.setItem(STORAGE_KEYS.CUSTOMERS_MIGRATION_VERSION, String(CURRENT_CUSTOMERS_MIGRATION_VERSION));
  localStorage.setItem(
    `${STORAGE_KEYS.CUSTOMERS}_migration_log`,
    JSON.stringify({ version: CURRENT_CUSTOMERS_MIGRATION_VERSION, migratedCount, skippedCount, conflictCount, seededDefaults: missingDefaultCustomers.length, at: getJalaliNow() })
  );

  return finalCustomers;
}

// LocalStorage Helper Methods
export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
    return defaultValue;
  }
}

export function setStoredData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing ${key} to localStorage`, e);
  }
}

// Global App Storage Accessors
export const storage = {
  getUsers(): User[] {
    const stored = getStoredData(STORAGE_KEYS.USERS, DEFAULT_USERS);
    const withDefaults = ensureDefaultUsersMigrated(stored);
    return ensureLegacyUserRoleNormalized(withDefaults);
  },
  saveUsers(users: User[]): void {
    setStoredData(STORAGE_KEYS.USERS, users);
  },

  getRoles(): SystemRole[] {
    const stored = getStoredData(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
    return ensureDefaultRolesMigrated(stored);
  },
  saveRoles(roles: SystemRole[]): void {
    setStoredData(STORAGE_KEYS.ROLES, roles);
  },
  
  getCompanies(): Company[] {
    return getStoredData(STORAGE_KEYS.COMPANIES, DEFAULT_COMPANIES);
  },
  saveCompanies(companies: Company[]): void {
    setStoredData(STORAGE_KEYS.COMPANIES, companies);
  },

  getCompanyBankAccounts(): CompanyBankAccount[] {
    return getStoredData(STORAGE_KEYS.COMPANY_BANK_ACCOUNTS, DEFAULT_COMPANY_BANK_ACCOUNTS);
  },
  saveCompanyBankAccounts(accounts: CompanyBankAccount[]): void {
    setStoredData(STORAGE_KEYS.COMPANY_BANK_ACCOUNTS, accounts);
  },
  
  getCostCenters(): CostCenter[] {
    return getStoredData(STORAGE_KEYS.COST_CENTERS, DEFAULT_COST_CENTERS);
  },
  saveCostCenters(centers: CostCenter[]): void {
    setStoredData(STORAGE_KEYS.COST_CENTERS, centers);
  },

  getVendors(): Vendor[] {
    return getStoredData(STORAGE_KEYS.VENDORS, DEFAULT_VENDORS);
  },
  saveVendors(vendors: Vendor[]): void {
    setStoredData(STORAGE_KEYS.VENDORS, vendors);
  },

  getVendorCategories(): VendorCategory[] {
    return getStoredData(STORAGE_KEYS.VENDOR_CATEGORIES, DEFAULT_VENDOR_CATEGORIES);
  },
  saveVendorCategories(categories: VendorCategory[]): void {
    setStoredData(STORAGE_KEYS.VENDOR_CATEGORIES, categories);
  },

  getDirectMessages(): DirectMessage[] {
    return getStoredData(STORAGE_KEYS.DIRECT_MESSAGES, []);
  },
  saveDirectMessages(messages: DirectMessage[]): void {
    setStoredData(STORAGE_KEYS.DIRECT_MESSAGES, messages);
  },

  getSupportCases(): SupportCase[] {
    return getStoredData(STORAGE_KEYS.SUPPORT_CASES, []);
  },
  saveSupportCases(cases: SupportCase[]): void {
    setStoredData(STORAGE_KEYS.SUPPORT_CASES, cases);
  },

  getLetters(): Letter[] {
    return getStoredData(STORAGE_KEYS.LETTERS, []);
  },
  saveLetters(letters: Letter[]): void {
    setStoredData(STORAGE_KEYS.LETTERS, letters);
  },
  
  getRequests(): PaymentRequest[] {
    return getStoredData(STORAGE_KEYS.REQUESTS, DEFAULT_REQUESTS);
  },
  saveRequests(requests: PaymentRequest[]): void {
    setStoredData(STORAGE_KEYS.REQUESTS, requests);
  },

  getWorkflow(): WorkflowStepRule[] {
    return getStoredData(STORAGE_KEYS.WORKFLOW, DEFAULT_WORKFLOW);
  },
  saveWorkflow(wf: WorkflowStepRule[]): void {
    setStoredData(STORAGE_KEYS.WORKFLOW, wf);
  },

  getNotifications(userId?: string): SystemNotification[] {
    const all = getStoredData(STORAGE_KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
    if (userId) {
      return all.filter(n => n.userId === userId || n.userId === 'all');
    }
    return all;
  },
  saveNotifications(notifs: SystemNotification[]): void {
    setStoredData(STORAGE_KEYS.NOTIFICATIONS, notifs);
  },

  getMessages(): ChatMessage[] {
    return getStoredData(STORAGE_KEYS.MESSAGES, DEFAULT_MESSAGES);
  },
  saveMessages(msgs: ChatMessage[]): void {
    setStoredData(STORAGE_KEYS.MESSAGES, msgs);
  },

  getTasks(): AssignedTask[] {
    return getStoredData(STORAGE_KEYS.TASKS, DEFAULT_TASKS);
  },
  saveTasks(tasks: AssignedTask[]): void {
    setStoredData(STORAGE_KEYS.TASKS, tasks);
  },

  getTabUsage(): TabUsageCounts {
    return getStoredData<TabUsageCounts>(STORAGE_KEYS.TAB_USAGE, {});
  },
  saveTabUsage(usage: TabUsageCounts): void {
    setStoredData(STORAGE_KEYS.TAB_USAGE, usage);
  },
  // Increments this user's open-count for a tab and persists it; returns the updated
  // counts map so callers (e.g. App.tsx's openTab) can use it immediately if needed.
  recordTabUsage(userId: string, tabId: string): TabUsageCounts {
    const usage = getStoredData<TabUsageCounts>(STORAGE_KEYS.TAB_USAGE, {});
    const userUsage = { ...(usage[userId] || {}) };
    userUsage[tabId] = (userUsage[tabId] || 0) + 1;
    const next = { ...usage, [userId]: userUsage };
    setStoredData(STORAGE_KEYS.TAB_USAGE, next);
    return next;
  },

  getCustomers(): Customer[] {
    const stored = getStoredData(STORAGE_KEYS.CUSTOMERS, DEFAULT_CUSTOMERS);
    return ensureCustomersMigrated(stored);
  },
  saveCustomers(customers: Customer[]): void {
    setStoredData(STORAGE_KEYS.CUSTOMERS, customers);
  },

  getCustomerMergeRequests(): CustomerMergeRequest[] {
    return getStoredData<CustomerMergeRequest[]>(STORAGE_KEYS.CUSTOMER_MERGE_REQUESTS, []);
  },
  saveCustomerMergeRequests(requests: CustomerMergeRequest[]): void {
    setStoredData(STORAGE_KEYS.CUSTOMER_MERGE_REQUESTS, requests);
  },

  getCustomerMergeEvents(): CustomerMergeEvent[] {
    return getStoredData<CustomerMergeEvent[]>(STORAGE_KEYS.CUSTOMER_MERGE_EVENTS, []);
  },
  saveCustomerMergeEvents(events: CustomerMergeEvent[]): void {
    setStoredData(STORAGE_KEYS.CUSTOMER_MERGE_EVENTS, events);
  },

  getCustomerSplitEvents(): CustomerSplitEvent[] {
    return getStoredData<CustomerSplitEvent[]>(STORAGE_KEYS.CUSTOMER_SPLIT_EVENTS, []);
  },
  saveCustomerSplitEvents(events: CustomerSplitEvent[]): void {
    setStoredData(STORAGE_KEYS.CUSTOMER_SPLIT_EVENTS, events);
  },

  getCustomerEntryConflicts(): CustomerEntryConflict[] {
    return getStoredData<CustomerEntryConflict[]>(STORAGE_KEYS.CUSTOMER_ENTRY_CONFLICTS, []);
  },
  saveCustomerEntryConflicts(conflicts: CustomerEntryConflict[]): void {
    setStoredData(STORAGE_KEYS.CUSTOMER_ENTRY_CONFLICTS, conflicts);
  },

  getClaimedPurchases(): ClaimedPurchase[] {
    return getStoredData<ClaimedPurchase[]>(STORAGE_KEYS.CLAIMED_PURCHASES, []);
  },
  saveClaimedPurchases(claims: ClaimedPurchase[]): void {
    setStoredData(STORAGE_KEYS.CLAIMED_PURCHASES, claims);
  },

  getRawContacts(): RawContact[] {
    return getStoredData<RawContact[]>(STORAGE_KEYS.RAW_CONTACTS, DEFAULT_RAW_CONTACTS);
  },
  saveRawContacts(contacts: RawContact[]): void {
    setStoredData(STORAGE_KEYS.RAW_CONTACTS, contacts);
  },

  getImportJobs(): ImportJob[] {
    return getStoredData<ImportJob[]>(STORAGE_KEYS.IMPORT_JOBS, DEFAULT_IMPORT_JOBS);
  },
  saveImportJobs(jobs: ImportJob[]): void {
    setStoredData(STORAGE_KEYS.IMPORT_JOBS, jobs);
  },

  getCampaigns(): Campaign[] {
    return getStoredData<Campaign[]>(STORAGE_KEYS.CAMPAIGNS, DEFAULT_CAMPAIGNS);
  },
  saveCampaigns(campaigns: Campaign[]): void {
    setStoredData(STORAGE_KEYS.CAMPAIGNS, campaigns);
  },

  getLeads(): Lead[] {
    return getStoredData<Lead[]>(STORAGE_KEYS.LEADS, DEFAULT_LEADS);
  },
  saveLeads(leads: Lead[]): void {
    setStoredData(STORAGE_KEYS.LEADS, leads);
  },

  getCallLogs(): CallLogEntry[] {
    return getStoredData<CallLogEntry[]>(STORAGE_KEYS.CALL_LOGS, DEFAULT_CALL_LOGS);
  },
  saveCallLogs(logs: CallLogEntry[]): void {
    setStoredData(STORAGE_KEYS.CALL_LOGS, logs);
  },

  getProducts(): Product[] {
    ensureCatalogMetadataMigrated();
    return getStoredData<Product[]>(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS).map(withCatalogMetadata);
  },
  saveProducts(products: Product[]): void {
    setStoredData(STORAGE_KEYS.PRODUCTS, products);
  },

  getServices(): ServiceCatalogItem[] {
    ensureCatalogMetadataMigrated();
    return getStoredData<ServiceCatalogItem[]>(STORAGE_KEYS.SERVICES, DEFAULT_SERVICES).map(withCatalogMetadata);
  },
  saveServices(services: ServiceCatalogItem[]): void {
    setStoredData(STORAGE_KEYS.SERVICES, services);
  },

  getPromotions(): Promotion[] {
    ensureCatalogMetadataMigrated();
    return getStoredData<Promotion[]>(STORAGE_KEYS.PROMOTIONS, DEFAULT_PROMOTIONS).map(withCatalogMetadata);
  },
  savePromotions(promotions: Promotion[]): void {
    setStoredData(STORAGE_KEYS.PROMOTIONS, promotions);
  },

  getSalesInvoices(): SalesInvoice[] {
    ensureGoldenMixedInvoiceSeeded();
    ensureSalesInvoiceRegistrationFlowMigrated();
    return getStoredData<SalesInvoice[]>(STORAGE_KEYS.SALES_INVOICES, DEFAULT_SALES_INVOICES);
  },
  saveSalesInvoices(invoices: SalesInvoice[]): void {
    setStoredData(STORAGE_KEYS.SALES_INVOICES, invoices);
  },

  getProductFulfillmentCases(): ProductFulfillmentCase[] {
    ensureGoldenMixedInvoiceSeeded();
    return getStoredData<ProductFulfillmentCase[]>(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, DEFAULT_PRODUCT_FULFILLMENT_CASES);
  },
  saveProductFulfillmentCases(cases: ProductFulfillmentCase[]): void {
    setStoredData(STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, cases);
  },
  getServiceFulfillmentCases(): ServiceFulfillmentCase[] {
    ensureGoldenMixedInvoiceSeeded();
    ensureServiceFulfillmentCasesMigrated();
    return getStoredData<ServiceFulfillmentCase[]>(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, DEFAULT_SERVICE_FULFILLMENT_CASES);
  },
  saveServiceFulfillmentCases(cases: ServiceFulfillmentCase[]): void {
    setStoredData(STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, cases);
  },

  getCoordinationCases(): CoordinationCase[] {
    ensureGoldenMixedInvoiceSeeded();
    const existing = getStoredData<CoordinationCase[]>(STORAGE_KEYS.COORDINATION_CASES, DEFAULT_COORDINATION_CASES);
    const normalized = existing.map((kase) => ({
      ...kase,
      distributionMode: kase.distributionMode || 'manual_assignment',
      checklist: Array.isArray(kase.checklist) && kase.checklist.length > 0 ? kase.checklist : buildCoordinationChecklist(),
      isManagerBypassed: kase.isManagerBypassed || false
    }));
    if (JSON.stringify(existing) !== JSON.stringify(normalized)) setStoredData(STORAGE_KEYS.COORDINATION_CASES, normalized);
    return normalized;
  },
  saveCoordinationCases(cases: CoordinationCase[]): void {
    setStoredData(STORAGE_KEYS.COORDINATION_CASES, cases);
  },
  getCoordinationAttempts(): CoordinationAttempt[] {
    ensureGoldenMixedInvoiceSeeded();
    return getStoredData<CoordinationAttempt[]>(STORAGE_KEYS.COORDINATION_ATTEMPTS, DEFAULT_COORDINATION_ATTEMPTS);
  },
  saveCoordinationAttempts(attempts: CoordinationAttempt[]): void {
    setStoredData(STORAGE_KEYS.COORDINATION_ATTEMPTS, attempts);
  },
  getCoordinationSettings(): CoordinationSettings {
    return getStoredData<CoordinationSettings>(STORAGE_KEYS.COORDINATION_SETTINGS, {
      distributionMode: 'manual_assignment', updatedAt: '', updatedByUserId: '', updatedByUserName: ''
    });
  },
  saveCoordinationSettings(settings: CoordinationSettings): void {
    setStoredData(STORAGE_KEYS.COORDINATION_SETTINGS, settings);
  },

  getSalesFinancialReviewCases(): SalesFinancialReviewCase[] {
    const existing = getStoredData<SalesFinancialReviewCase[]>(STORAGE_KEYS.SALES_FINANCIAL_REVIEW_CASES, []);
    const settings = getStoredData<SalesFinancialSettings>(STORAGE_KEYS.SALES_FINANCIAL_SETTINGS, {
      distributionMode: 'manual_assignment', updatedAt: '', updatedByUserId: '', updatedByUserName: ''
    });
    const users = ensureDefaultUsersMigrated(getStoredData<User[]>(STORAGE_KEYS.USERS, DEFAULT_USERS));
    const reviewers = users.filter((user) => user.isActive && ['role_sales_payment_approver', 'role_sales_financial_manager'].includes(user.roleId || ''));
    const invoices = getStoredData<SalesInvoice[]>(STORAGE_KEYS.SALES_INVOICES, DEFAULT_SALES_INVOICES);
    const normalized = ensureFinancialReviewCases(invoices, existing, new Date().toISOString(), settings.distributionMode, reviewers);
    if (JSON.stringify(normalized) !== JSON.stringify(existing)) setStoredData(STORAGE_KEYS.SALES_FINANCIAL_REVIEW_CASES, normalized);
    return normalized;
  },
  saveSalesFinancialReviewCases(cases: SalesFinancialReviewCase[]): void {
    setStoredData(STORAGE_KEYS.SALES_FINANCIAL_REVIEW_CASES, cases);
  },
  getSalesFinancialReviewEvents(): SalesFinancialReviewEvent[] {
    return getStoredData<SalesFinancialReviewEvent[]>(STORAGE_KEYS.SALES_FINANCIAL_REVIEW_EVENTS, []);
  },
  saveSalesFinancialReviewEvents(events: SalesFinancialReviewEvent[]): void {
    setStoredData(STORAGE_KEYS.SALES_FINANCIAL_REVIEW_EVENTS, events);
  },
  getSalesFinancialSettings(): SalesFinancialSettings {
    return getStoredData<SalesFinancialSettings>(STORAGE_KEYS.SALES_FINANCIAL_SETTINGS, {
      distributionMode: 'manual_assignment', updatedAt: '', updatedByUserId: '', updatedByUserName: ''
    });
  },
  saveSalesFinancialSettings(settings: SalesFinancialSettings): void {
    setStoredData(STORAGE_KEYS.SALES_FINANCIAL_SETTINGS, settings);
  },
  getSalesOverpaymentCases(): SalesOverpaymentCase[] {
    return getStoredData<SalesOverpaymentCase[]>(STORAGE_KEYS.SALES_OVERPAYMENT_CASES, []);
  },
  saveSalesOverpaymentCases(cases: SalesOverpaymentCase[]): void {
    setStoredData(STORAGE_KEYS.SALES_OVERPAYMENT_CASES, cases);
  },

  getSalesBranches(): SalesBranch[] {
    ensureSalesOrgStructureSeeded();
    return getStoredData<SalesBranch[]>(STORAGE_KEYS.SALES_BRANCHES, DEFAULT_SALES_BRANCHES);
  },
  saveSalesBranches(branches: SalesBranch[]): void {
    setStoredData(STORAGE_KEYS.SALES_BRANCHES, branches);
  },
  getSalesOrgAssignments(): SalesOrgAssignment[] {
    ensureSalesOrgStructureSeeded();
    ensureSalesAssignmentBusinessUseBackfilled();
    return getStoredData<SalesOrgAssignment[]>(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, DEFAULT_SALES_ORG_ASSIGNMENTS);
  },
  saveSalesOrgAssignments(assignments: SalesOrgAssignment[]): void {
    setStoredData(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, assignments);
  },
  getSalesChains(): SalesChain[] {
    ensureSalesOrgStructureSeeded();
    return getStoredData<SalesChain[]>(STORAGE_KEYS.SALES_CHAINS, DEFAULT_SALES_CHAINS);
  },
  saveSalesChains(chains: SalesChain[]): void {
    setStoredData(STORAGE_KEYS.SALES_CHAINS, chains);
  },
  getSalespersonTransferRequests(): SalespersonTransferRequest[] {
    return getStoredData<SalespersonTransferRequest[]>(STORAGE_KEYS.SALESPERSON_TRANSFER_REQUESTS, []);
  },
  saveSalespersonTransferRequests(requests: SalespersonTransferRequest[]): void {
    setStoredData(STORAGE_KEYS.SALESPERSON_TRANSFER_REQUESTS, requests);
  },
  getSalesOrgAssignmentEvents(): SalesOrgAssignmentEvent[] {
    return getStoredData<SalesOrgAssignmentEvent[]>(STORAGE_KEYS.SALES_ORG_ASSIGNMENT_EVENTS, []);
  },
  saveSalesOrgAssignmentEvents(events: SalesOrgAssignmentEvent[]): void {
    setStoredData(STORAGE_KEYS.SALES_ORG_ASSIGNMENT_EVENTS, events);
  },

  // یادداشت مدیریتی Append-only پروندهٔ بایگانی‌شده (بدهی #۵ مأموریت اصلاح پذیرش) — مجموعهٔ
  // مستقل خودش، جدا از AuditLog محدودالمحدودهٔ Impersonation/پرداخت.
  getSalesArchivedNotes(): SalesArchivedNote[] {
    return getStoredData<SalesArchivedNote[]>(STORAGE_KEYS.SALES_ARCHIVED_NOTES, []);
  },
  saveSalesArchivedNotes(notes: SalesArchivedNote[]): void {
    setStoredData(STORAGE_KEYS.SALES_ARCHIVED_NOTES, notes);
  },

  // Persistence-Layer برای «قفل بعد از اولین استفادهٔ مؤثر» (بند ۲۱ AGENTS.md / بدهی #۱ مأموریت
  // جاری) — تنها نقطهٔ نوشتنِ مستقل این قفل، برای Handlerهایی که خودشان از قبل یک
  // saveCustomerIdentityTransaction دیگر در حال اجرا ندارند. Handlerهایی که همزمان داده‌ی دیگری
  // هم ذخیره می‌کنند (مثل SalesQueueView/SalesInvoiceView) باید به‌جای این تابع، مستقیماً
  // applyBusinessUseLock را صدا بزنند و نتیجه را در همان تراکنش اتمیک خودشان بگنجانند — این‌جا
  // فقط برای مسیرهایی که هیچ بستهٔ تراکنشی دیگری در همان لحظه ندارند.
  lockSalesAssignmentAfterBusinessUse(userId: string, eventType: string, eventId: string, now: string): void {
    const assignments = getStoredData<SalesOrgAssignment[]>(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, DEFAULT_SALES_ORG_ASSIGNMENTS);
    const updated = applyBusinessUseLock(assignments, userId, eventType, eventId, now);
    if (updated !== assignments) setStoredData(STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, updated);
  },

  // Transaction Helper اتمیک برای Merge/Split — چون یک عملیات هم‌زمان Customers،
  // CustomerMergeRequest، CustomerMergeEvent/CustomerSplitEvent را تغییر می‌دهد. چون
  // executeMerge/executeSplit در customerIdentity.ts کاملاً خالص‌اند و همهٔ محاسبات را قبل از
  // این تابع در حافظه کامل کرده‌اند، این تابع فقط نوشتن روی چند کلید را به‌صورت همه‌یا‌هیچ انجام
  // می‌دهد: اگر یکی از نوشتن‌ها وسط راه Throw کند، کلیدهای قبلاً نوشته‌شده با مقدار خوانده‌شده در
  // ابتدای تراکنش Rollback (بازنویسی) می‌شوند و {ok:false} برمی‌گردد — هیچ حالت نیمه‌کاره نمی‌ماند.
  saveCustomerIdentityTransaction(bundle: {
    customers?: Customer[];
    mergeRequests?: CustomerMergeRequest[];
    mergeEvents?: CustomerMergeEvent[];
    splitEvents?: CustomerSplitEvent[];
    entryConflicts?: CustomerEntryConflict[];
    claimedPurchases?: ClaimedPurchase[];
    rawContacts?: RawContact[];
    importJobs?: ImportJob[];
    leads?: Lead[];
    campaigns?: Campaign[];
    callLogs?: CallLogEntry[];
    salesInvoices?: SalesInvoice[];
    productFulfillmentCases?: ProductFulfillmentCase[];
    serviceFulfillmentCases?: ServiceFulfillmentCase[];
    salesBranches?: SalesBranch[];
    salesOrgAssignments?: SalesOrgAssignment[];
    users?: User[];
    salesChains?: SalesChain[];
    salespersonTransferRequests?: SalespersonTransferRequest[];
    salesOrgAssignmentEvents?: SalesOrgAssignmentEvent[];
    coordinationCases?: CoordinationCase[];
    coordinationAttempts?: CoordinationAttempt[];
    coordinationSettings?: CoordinationSettings;
    salesFinancialReviewCases?: SalesFinancialReviewCase[];
    salesFinancialReviewEvents?: SalesFinancialReviewEvent[];
    salesFinancialSettings?: SalesFinancialSettings;
    salesOverpaymentCases?: SalesOverpaymentCase[];
  }): { ok: true } | { ok: false; error: string } {
    const steps: { key: string; value: unknown }[] = [];
    if (bundle.customers) steps.push({ key: STORAGE_KEYS.CUSTOMERS, value: bundle.customers });
    if (bundle.users) steps.push({ key: STORAGE_KEYS.USERS, value: bundle.users });
    if (bundle.salesChains) steps.push({ key: STORAGE_KEYS.SALES_CHAINS, value: bundle.salesChains });
    if (bundle.salespersonTransferRequests) steps.push({ key: STORAGE_KEYS.SALESPERSON_TRANSFER_REQUESTS, value: bundle.salespersonTransferRequests });
    if (bundle.salesOrgAssignmentEvents) steps.push({ key: STORAGE_KEYS.SALES_ORG_ASSIGNMENT_EVENTS, value: bundle.salesOrgAssignmentEvents });
    if (bundle.mergeRequests) steps.push({ key: STORAGE_KEYS.CUSTOMER_MERGE_REQUESTS, value: bundle.mergeRequests });
    if (bundle.mergeEvents) steps.push({ key: STORAGE_KEYS.CUSTOMER_MERGE_EVENTS, value: bundle.mergeEvents });
    if (bundle.splitEvents) steps.push({ key: STORAGE_KEYS.CUSTOMER_SPLIT_EVENTS, value: bundle.splitEvents });
    if (bundle.entryConflicts) steps.push({ key: STORAGE_KEYS.CUSTOMER_ENTRY_CONFLICTS, value: bundle.entryConflicts });
    if (bundle.claimedPurchases) steps.push({ key: STORAGE_KEYS.CLAIMED_PURCHASES, value: bundle.claimedPurchases });
    if (bundle.rawContacts) steps.push({ key: STORAGE_KEYS.RAW_CONTACTS, value: bundle.rawContacts });
    if (bundle.importJobs) steps.push({ key: STORAGE_KEYS.IMPORT_JOBS, value: bundle.importJobs });
    if (bundle.leads) steps.push({ key: STORAGE_KEYS.LEADS, value: bundle.leads });
    if (bundle.campaigns) steps.push({ key: STORAGE_KEYS.CAMPAIGNS, value: bundle.campaigns });
    if (bundle.callLogs) steps.push({ key: STORAGE_KEYS.CALL_LOGS, value: bundle.callLogs });
    if (bundle.salesInvoices) steps.push({ key: STORAGE_KEYS.SALES_INVOICES, value: bundle.salesInvoices });
    if (bundle.productFulfillmentCases) steps.push({ key: STORAGE_KEYS.PRODUCT_FULFILLMENT_CASES, value: bundle.productFulfillmentCases });
    if (bundle.serviceFulfillmentCases) steps.push({ key: STORAGE_KEYS.SERVICE_FULFILLMENT_CASES, value: bundle.serviceFulfillmentCases });
    if (bundle.salesBranches) steps.push({ key: STORAGE_KEYS.SALES_BRANCHES, value: bundle.salesBranches });
    if (bundle.salesOrgAssignments) steps.push({ key: STORAGE_KEYS.SALES_ORG_ASSIGNMENTS, value: bundle.salesOrgAssignments });
    if (bundle.coordinationCases) steps.push({ key: STORAGE_KEYS.COORDINATION_CASES, value: bundle.coordinationCases });
    if (bundle.coordinationAttempts) steps.push({ key: STORAGE_KEYS.COORDINATION_ATTEMPTS, value: bundle.coordinationAttempts });
    if (bundle.coordinationSettings) steps.push({ key: STORAGE_KEYS.COORDINATION_SETTINGS, value: bundle.coordinationSettings });
    if (bundle.salesFinancialReviewCases) steps.push({ key: STORAGE_KEYS.SALES_FINANCIAL_REVIEW_CASES, value: bundle.salesFinancialReviewCases });
    if (bundle.salesFinancialReviewEvents) steps.push({ key: STORAGE_KEYS.SALES_FINANCIAL_REVIEW_EVENTS, value: bundle.salesFinancialReviewEvents });
    if (bundle.salesFinancialSettings) steps.push({ key: STORAGE_KEYS.SALES_FINANCIAL_SETTINGS, value: bundle.salesFinancialSettings });
    if (bundle.salesOverpaymentCases) steps.push({ key: STORAGE_KEYS.SALES_OVERPAYMENT_CASES, value: bundle.salesOverpaymentCases });

    const previousValues = steps.map((s) => ({ key: s.key, raw: localStorage.getItem(s.key) }));
    const written: string[] = [];
    try {
      for (const step of steps) {
        localStorage.setItem(step.key, JSON.stringify(step.value));
        written.push(step.key);
      }
      return { ok: true };
    } catch (err) {
      // Rollback: کلیدهایی که تا لحظهٔ شکست نوشته شدند به مقدار قبل از تراکنش برمی‌گردند
      for (const key of written) {
        const prev = previousValues.find((p) => p.key === key);
        if (prev) {
          if (prev.raw === null) localStorage.removeItem(key);
          else localStorage.setItem(key, prev.raw);
        }
      }
      return { ok: false, error: err instanceof Error ? err.message : 'خطای ناشناخته در ذخیره‌سازی تراکنشی' };
    }
  },

  getImpersonationLog(): ImpersonationLogEntry[] {
    return getStoredData<ImpersonationLogEntry[]>(STORAGE_KEYS.IMPERSONATION_LOG, []);
  },
  saveImpersonationLog(log: ImpersonationLogEntry[]): void {
    setStoredData(STORAGE_KEYS.IMPERSONATION_LOG, log);
  },

  getAuditLog(): AuditLogEntry[] {
    return getStoredData<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, []);
  },
  saveAuditLog(log: AuditLogEntry[]): void {
    setStoredData(STORAGE_KEYS.AUDIT_LOG, log);
  },

  getCurrentUser(): User | null {
    // No silent auto-login: an absent/invalid session must render the login screen,
    // never fall back to the super admin. See docs/BUSINESS_RULES.md (Impersonation/Auth).
    return getStoredData<User | null>(STORAGE_KEYS.CURRENT_USER, null);
  },
  setCurrentUser(user: User | null): void {
    setStoredData(STORAGE_KEYS.CURRENT_USER, user);
  },

  getAndIncrementCounter(): number {
    const current = getStoredData(STORAGE_KEYS.REQUEST_COUNTER, 4);
    setStoredData(STORAGE_KEYS.REQUEST_COUNTER, current + 1);
    return current;
  },

  getAndIncrementSupportCounter(): number {
    const current = getStoredData(STORAGE_KEYS.SUPPORT_CASE_COUNTER, 0);
    setStoredData(STORAGE_KEYS.SUPPORT_CASE_COUNTER, current + 1);
    return current;
  },

  getAndIncrementLetterCounter(): number {
    const current = getStoredData(STORAGE_KEYS.LETTER_COUNTER, 0);
    setStoredData(STORAGE_KEYS.LETTER_COUNTER, current + 1);
    return current;
  }
};
