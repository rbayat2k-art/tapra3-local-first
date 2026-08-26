import type {FoundationStoreName, OperationalDomain, OperationalRecord, PermissionCode, ScopeType, WorkflowDefinition, WorkflowTransitionDefinition} from './model';
import {COMPANY_ID, SEED_TIME} from './seedConstants';

export interface ErpModuleDefinition {
  id: string;
  domain: OperationalDomain;
  group: string;
  title: string;
  singular: string;
  description: string;
  store: FoundationStoreName;
  prefix: string;
  fields: Array<'amount' | 'quantity' | 'customer' | 'owner' | 'assignee' | 'due' | 'unit' | 'related'>;
  workflow: WorkflowDefinition;
  productDecisionRequired?: string;
}

const STATE_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس', submitted: 'ارسال‌شده', in_review: 'در حال بررسی', approved: 'تأییدشده', rejected: 'ردشده', returned: 'عودت برای اصلاح', active: 'فعال', inactive: 'غیرفعال', archived: 'بایگانی‌شده', scheduled: 'زمان‌بندی‌شده', in_progress: 'در حال انجام', completed: 'تکمیل‌شده', cancelled: 'لغوشده', pending: 'در انتظار', assigned: 'تخصیص‌یافته', qualified: 'واجد شرایط', converted: 'تبدیل‌شده', disqualified: 'رد صلاحیت', sent: 'ارسال‌شده', accepted: 'پذیرفته‌شده', expired: 'منقضی', issued: 'صادرشده', awaiting_approval: 'منتظر تأیید', awaiting_payment: 'منتظر پرداخت', payment_review: 'بررسی پرداخت', financially_cleared: 'تأیید مالی', fulfilling: 'در حال اجرا', fulfilled: 'اجراشده', needs_correction: 'نیازمند اصلاح', replaced: 'جایگزین‌شده', requested: 'درخواست‌شده', allocated: 'تخصیص موجودی', partially_allocated: 'تخصیص جزئی', shortage: 'کسری', released: 'آزادشده', consumed: 'مصرف‌شده', ready_to_ship: 'آماده ارسال', dispatched: 'اعزام‌شده', in_transit: 'در مسیر', delivered: 'تحویل‌شده', delivery_failed: 'تحویل ناموفق', rescheduled: 'زمان‌بندی مجدد', evidence_submitted: 'مدرک ثبت‌شده', reviewed: 'بازبینی‌شده', waiting_customer: 'منتظر مشتری', waiting_internal: 'منتظر داخلی', resolved: 'حل‌شده', closed: 'بسته‌شده', reopened: 'بازگشایی‌شده', approved_pending_payment: 'تأیید و منتظر پرداخت', queued: 'در صف خزانه', claimed: 'در اختیار مجری', payment_recorded: 'پرداخت ثبت‌شده', verified: 'راستی‌آزمایی‌شده', paid: 'پرداخت‌شده', failed: 'ناموفق', posted: 'ثبت قطعی', counting: 'در حال شمارش', inspecting: 'در حال بازرسی', dispositioned: 'تعیین تکلیف‌شده', received: 'دریافت‌شده', registered: 'ثبت دبیرخانه', routed: 'ارجاع‌شده', read: 'خوانده‌شده', published: 'منتشرشده', retired: 'بازنشسته', paused: 'متوقف موقت', ended: 'پایان‌یافته', open: 'باز', won: 'برنده', lost: 'از دست‌رفته', proposal: 'پیشنهاد', selected: 'انتخاب‌شده', compared: 'مقایسه‌شده', ordered: 'سفارش‌شده', matched: 'تطبیق‌شده', acquired: 'تحصیل‌شده', disposed: 'واگذارشده', blocked: 'مسدود', todo: 'برای انجام', done: 'انجام‌شده', approved_pending_send: 'تأیید و آماده ارسال', sent_to_treasury: 'ارسال به خزانه', financial_rejected: 'رد مالی', correction: 'اصلاح', validated: 'اعتبارسنجی‌شده', ready_to_forward: 'آماده ارجاع', forwarded: 'ارجاع‌شده', payment_pending: 'در انتظار پرداخت', execution: 'در حال اجرا', evidence: 'ثبت مدرک', review: 'بازبینی', confirmed: 'تأیید مشتری', maintenance: 'در تعمیر', on_hold: 'متوقف', released_for_use: 'آزاد برای استفاده', posted_draft: 'سند پیش‌نویس', reconciled: 'مغایرت‌گیری‌شده', locked: 'بسته دوره', open_period: 'دوره باز', onboarding: 'ورود به کار', offboarding: 'خروج از کار', enrolled: 'ثبت‌نام‌شده', evaluated: 'ارزیابی‌شده', approved_for_payment: 'مجوز پرداخت', executed: 'اجراشده', renewed: 'تمدیدشده', amended: 'اصلاحیه', submitted_for_review: 'ارسال برای بازبینی', approved_for_send: 'مجوز ارسال', purchase_review: 'بررسی خرید', offer_received: 'پیشنهاد دریافت‌شده', comparison: 'در حال مقایسه', purchase_approved: 'خرید تأییدشده', receiving: 'در حال دریافت', invoiced: 'فاکتور شده', matching: 'در حال تطبیق', settled: 'تسویه‌شده', custody: 'تحویل به مأمور', attempt: 'تلاش تحویل', coordination: 'در حال هماهنگی', activation: 'در حال فعال‌سازی', needs_rework: 'نیازمند بازکاری', unable_to_fulfill: 'غیرقابل اجرا', escalated: 'ارجاع ویژه', registered_asset: 'ثبت دارایی', transferred: 'منتقل‌شده', training: 'در حال آموزش', under_review: 'زیر بررسی', pending_financial_approval: 'منتظر تأیید مالی', pending_send: 'منتظر ارسال', pending_payment: 'منتظر پرداخت', reversal_requested: 'درخواست ثبت معکوس', reversed: 'ثبت معکوس‌شده', review_required: 'نیازمند بررسی', staged: 'مرحله‌بندی‌شده', applied: 'اعمال‌شده', proposed: 'پیشنهادشده', correction_requested: 'درخواست اصلاح', announced: 'اعلام‌شده', acknowledged: 'دریافت‌شده', allocated_budget: 'بودجه تخصیص‌یافته', journal_draft: 'سند حسابداری پیش‌نویس', ready_to_post: 'آماده ثبت', registered_message: 'ثبت‌شده', delivered_message: 'تحویل پیام', correction_message: 'پیام اصلاحی', uploaded: 'ثبت سند', checksum_verified: 'صحت‌سنجی‌شده', linked: 'متصل‌شده', unlinked: 'جداشده', approved_policy: 'سیاست تأییدشده', published_policy: 'سیاست منتشرشده', generated: 'تولیدشده', rebuilt: 'بازسازی‌شده',
};

const actionPermission = (domain: OperationalDomain, id: string, action: string) => `${domain}.${id.replaceAll('-', '_')}.${action}`;
function transition(domain: OperationalDomain, moduleId: string, from: string | string[], to: string, label: string, options: Partial<WorkflowTransitionDefinition> = {}): WorkflowTransitionDefinition { return {id: `${moduleId}.${to}`, from: Array.isArray(from) ? from : [from], to, label, permission: actionPermission(domain, moduleId, options.makerChecker ? 'approve' : 'transition'), ...options}; }
function sequential(domain: OperationalDomain, moduleId: string, states: string[], labels: string[], options: {approvalAt?: number; reasonFrom?: number; sensitiveAt?: number; handoffAt?: number; handoffModuleId?: string} = {}): WorkflowDefinition {
  const transitions = states.slice(1).map((to, index) => transition(domain, moduleId, states[index], to, labels[index] ?? `انتقال به ${STATE_LABELS[to] ?? to}`, {makerChecker: options.approvalAt === index + 1, sensitive: options.sensitiveAt === index + 1, reasonRequired: options.reasonFrom !== undefined && index + 1 >= options.reasonFrom, handoffModuleId: options.handoffAt === index + 1 ? options.handoffModuleId : undefined}));
  return {id: `workflow-${moduleId}`, moduleId, title: `گردش‌کار ${moduleId}`, version: 1, status: 'published', initialState: states[0], stateLabels: Object.fromEntries(states.map((state) => [state, STATE_LABELS[state] ?? state])), transitions, queueStrategy: 'assignee', assignmentPolicy: 'تخصیص دستی یا مالک رکورد؛ قابل تنظیم توسط مدیر گردش‌کار', createdAt: SEED_TIME, updatedAt: SEED_TIME};
}
function mod(input: Omit<ErpModuleDefinition, 'workflow'> & {states: string[]; actions: string[]; approvalAt?: number; reasonFrom?: number; sensitiveAt?: number; handoffAt?: number; handoffModuleId?: string}): ErpModuleDefinition { return {...input, workflow: {...sequential(input.domain, input.id, input.states, input.actions, input), title: `گردش‌کار ${input.title}`, productDecisionRequired: input.productDecisionRequired}}; }

const purchaseRequestWorkflow: WorkflowDefinition = {
  id: 'workflow-purchase-request', moduleId: 'purchase-request', title: 'گردش‌کار درخواست خرید چندشعبه‌ای', version: 3,
  status: 'published', initialState: 'draft',
  stateLabels: Object.fromEntries(['draft','submitted','purchase_review','needs_correction','purchase_approved','sent_to_treasury','rejected','cancelled'].map((state) => [state, STATE_LABELS[state] ?? state])),
  transitions: [
    transition('procurement','purchase-request',['draft','needs_correction'],'submitted','ثبت و ارسال برای تأیید'),
    transition('procurement','purchase-request','draft','cancelled','لغو پیش‌نویس با حفظ سابقه',{reasonRequired:true}),
    transition('procurement','purchase-request',['submitted','purchase_review','purchase_approved'],'needs_correction','نیازمند اصلاح',{makerChecker:true,reasonRequired:true}),
    transition('procurement','purchase-request',['submitted','purchase_review','purchase_approved'],'rejected','رد درخواست',{makerChecker:true,reasonRequired:true}),
  ],
  queueStrategy: 'assignee',
  assignmentPolicy: 'سازنده فقط پیش‌نویس و اصلاحات را ویرایش می‌کند؛ تأییدکننده مستقل پس از تأیید، پرونده را به تأییدکننده بعدی یا پرداخت‌کننده ارجاع می‌دهد.',
  approvalPolicyId: 'purchase-request-amount-branch-cost-center-v1', createdAt: SEED_TIME, updatedAt: SEED_TIME,
};

const treasuryExecutionWorkflow: WorkflowDefinition = {
  id: 'workflow-treasury-execution', moduleId: 'treasury-execution', title: 'گردش‌کار اجرای مستقیم پرداخت خزانه', version: 3,
  status: 'published', initialState: 'queued',
  stateLabels: {...Object.fromEntries(['queued','claimed','payment_recorded','verified','completed'].map((state) => [state, STATE_LABELS[state] ?? state])), queued: 'در اختیار مجری پرداخت'},
  transitions: [
    transition('treasury','treasury-execution',['queued','claimed'],'payment_recorded','ثبت پرداخت'),
    transition('treasury','treasury-execution','payment_recorded','queued','بازگشت از پرداخت',{sensitive:true,reasonRequired:true}),
    transition('treasury','treasury-execution','payment_recorded','verified','راستی‌آزمایی',{makerChecker:true,sensitive:true,reasonRequired:true}),
    transition('treasury','treasury-execution','verified','completed','تکمیل',{reasonRequired:true}),
  ],
  queueStrategy: 'assignee',
  assignmentPolicy: 'تأییدکننده، مجری پرداخت را هنگام ارجاع تعیین می‌کند؛ پرونده بدون دریافت مجدد کار مستقیماً در اختیار همان مجری قرار می‌گیرد.',
  createdAt: SEED_TIME, updatedAt: SEED_TIME,
};

const employeeAdvanceWorkflow: WorkflowDefinition = {
  id: 'workflow-employee-advance', moduleId: 'employee-advance', title: 'گردش‌کار مساعده پرسنلی', version: 2,
  status: 'published', initialState: 'draft',
  stateLabels: {
    draft: 'پیش‌نویس', branch_review: 'بررسی مدیر شعبه', accounting_review: 'کنترل حسابداری',
    final_review: 'تأییدکننده اصلی مساعده', needs_correction: 'نیازمند اصلاح', sent_to_treasury: 'ارسال به خزانه',
    rejected: 'رد و بسته‌شده', paid: 'پرداخت‌شده',
  },
  transitions: [
    transition('hr','employee-advance',['draft','needs_correction'],'branch_review','ثبت و ارسال به مدیر شعبه'),
    transition('hr','employee-advance','branch_review','accounting_review','تأیید مدیر شعبه و ارسال به حسابداری',{makerChecker:true}),
    transition('hr','employee-advance','accounting_review','final_review','تأیید حسابداری و ارسال به تأییدکننده اصلی',{makerChecker:true}),
    transition('hr','employee-advance',['accounting_review','final_review'],'sent_to_treasury','تأیید و ارسال به خزانه',{makerChecker:true,sensitive:true,handoffModuleId:'treasury-execution'}),
    transition('hr','employee-advance','sent_to_treasury','paid','ثبت پرداخت'),
  ],
  queueStrategy: 'assignee',
  assignmentPolicy: 'ثبت عادی: مدیر شعبه ← حسابداری ← تأییدکننده اصلی ← خزانه؛ ثبت نیابتی تأییدکننده اصلی: حسابداری ← خزانه.',
  approvalPolicyId: 'employee-advance-branch-accounting-main-approver-v1', createdAt: SEED_TIME, updatedAt: SEED_TIME,
};

const recruitmentWorkflow: WorkflowDefinition = {
  id: 'workflow-recruitment-case', moduleId: 'recruitment-case', title: 'گردش‌کار جذب تا شروع همکاری', version: 1,
  status: 'published', initialState: 'submitted',
  stateLabels: {
    submitted: 'اعلام نیاز ثبت‌شده', hr_review: 'بررسی منابع انسانی', ready_to_publish: 'آماده انتشار آگهی', published: 'جذب و دریافت متقاضی',
    candidate_review: 'بررسی پرونده متقاضی', interview_scheduled: 'دعوت و مصاحبه', evaluated: 'ارزیابی مصاحبه', offer_sent: 'پیشنهاد همکاری',
    offer_accepted: 'پیشنهاد پذیرفته‌شده', ready_to_start: 'آماده شروع به کار', training: 'همکاری آموزشی', contracted: 'همکاری قراردادی',
    needs_correction: 'نیازمند اصلاح', on_hold: 'توقف موقت', withdrawn: 'انصراف درخواست‌کننده', rejected: 'ردشده', closed: 'بسته‌شده',
  },
  transitions: [
    transition('hr','recruitment-case','submitted','hr_review','دریافت و شروع بررسی منابع انسانی'),
    transition('hr','recruitment-case',['submitted','hr_review'],'needs_correction','بازگشت برای اصلاح',{reasonRequired:true}),
    transition('hr','recruitment-case','needs_correction','submitted','ارسال مجدد پس از اصلاح',{reasonRequired:true}),
    transition('hr','recruitment-case','hr_review','ready_to_publish','تأیید اعلام نیاز و آماده‌سازی آگهی',{makerChecker:true}),
    transition('hr','recruitment-case','ready_to_publish','published','ثبت انتشار و شروع جذب'),
    transition('hr','recruitment-case','published','candidate_review','ثبت و تکمیل پرونده متقاضی'),
    transition('hr','recruitment-case','candidate_review','interview_scheduled','دعوت به مصاحبه'),
    transition('hr','recruitment-case','interview_scheduled','evaluated','ثبت ارزیابی مصاحبه',{makerChecker:true}),
    transition('hr','recruitment-case','evaluated','offer_sent','ارسال پیشنهاد نسخه‌دار'),
    transition('hr','recruitment-case','offer_sent','offer_accepted','ثبت پذیرش و امضای سیستمی'),
    transition('hr','recruitment-case','offer_accepted','ready_to_start','تکمیل مدارک و دستور شروع'),
    transition('hr','recruitment-case','ready_to_start','training','تأیید شروع همکاری آموزشی'),
    transition('hr','recruitment-case','training','contracted','تبدیل به همکاری قراردادی',{reasonRequired:true}),
    transition('hr','recruitment-case',['submitted','hr_review','ready_to_publish','published','candidate_review','interview_scheduled'],'withdrawn','ثبت انصراف و توقف جذب',{reasonRequired:true}),
    transition('hr','recruitment-case',['hr_review','ready_to_publish','published','candidate_review','interview_scheduled','evaluated','offer_sent'],'on_hold','توقف موقت پرونده',{reasonRequired:true}),
    transition('hr','recruitment-case',['submitted','hr_review','candidate_review','interview_scheduled','evaluated','offer_sent'],'rejected','رد و بستن پرونده',{reasonRequired:true,makerChecker:true}),
  ],
  queueStrategy: 'assignee',
  assignmentPolicy: 'مدیر واحد فقط برای واحد خود اعلام نیاز می‌کند؛ منابع انسانی می‌تواند با دلیل اجباری نیابتی ثبت کند. هر پرونده نسخه گردش‌کار، عامل، زمان، دلیل، تحویل و امضا را حفظ می‌کند.',
  createdAt: SEED_TIME, updatedAt: SEED_TIME,
};

export const ERP_MODULES: ErpModuleDefinition[] = [
  {id:'recruitment-case',domain:'hr',group:'منابع انسانی / جذب',title:'جذب و شروع همکاری',singular:'پرونده جذب',description:'اعلام نیاز نیرو، جذب، تماس، مصاحبه، پیشنهاد، امضا، ساخت حساب، شروع آموزشی و تبدیل قراردادی',store:'recruitment_cases',prefix:'REC',fields:['owner','assignee','due','unit'],workflow:recruitmentWorkflow},
  mod({id:'employment-contract',domain:'hr',group:'منابع انسانی / پرسنل',title:'قراردادهای همکاری',singular:'قرارداد همکاری',description:'نسخه، شروع/پایان، تعهد و تمدید همکاری',store:'employment_contracts',prefix:'HRC',fields:['owner','unit','due','related'],states:['draft','in_review','active','ended'],actions:['ارسال برای بررسی','فعال‌سازی قرارداد','پایان قرارداد'],approvalAt:2,reasonFrom:3,productDecisionRequired:'الگوهای حقوقی و محاسبات مزایا باید توسط Product Owner/مشاور حقوقی تصویب شوند.'}),
  mod({id:'onboarding',domain:'hr',group:'منابع انسانی / پرسنل',title:'ورود به کار',singular:'پرونده ورود به کار',description:'چک‌لیست و تحویل مسئولیت ورود همکار',store:'onboarding_cases',prefix:'ONB',fields:['owner','assignee','due','unit'],states:['draft','onboarding','completed'],actions:['شروع ورود به کار','تکمیل ورود به کار']}),
  mod({id:'offboarding',domain:'hr',group:'منابع انسانی / پرسنل',title:'خروج از کار',singular:'پرونده خروج از کار',description:'تحویل دارایی/دسترسی و حفظ تاریخچه',store:'offboarding_cases',prefix:'OFB',fields:['owner','assignee','due','unit'],states:['draft','offboarding','completed'],actions:['شروع خروج','تکمیل خروج'],reasonFrom:1}),
  mod({id:'attendance',domain:'hr',group:'منابع انسانی / پرسنل',title:'حضور و غیاب',singular:'رکورد حضور',description:'پایه ثبت حضور بدون محاسبه حقوق',store:'attendance_records',prefix:'ATT',fields:['owner','due','unit'],states:['draft','submitted','approved'],actions:['ارسال رکورد','تأیید حضور'],approvalAt:2}),
  mod({id:'shift',domain:'hr',group:'منابع انسانی / پرسنل',title:'شیفت‌ها',singular:'شیفت',description:'تعریف و انتساب شیفت کاری',store:'shifts',prefix:'SHF',fields:['owner','due','unit'],states:['draft','active','ended'],actions:['فعال‌سازی','پایان شیفت'],reasonFrom:2}),
  mod({id:'leave',domain:'hr',group:'منابع انسانی / پرسنل',title:'مرخصی',singular:'درخواست مرخصی',description:'ثبت، بررسی و تعیین تکلیف مرخصی',store:'leave_requests',prefix:'LEV',fields:['owner','assignee','due','unit'],states:['draft','submitted','approved','completed'],actions:['ارسال درخواست','تأیید مرخصی','ثبت پایان'],approvalAt:2}),
  mod({id:'mission',domain:'hr',group:'منابع انسانی / پرسنل',title:'مأموریت',singular:'درخواست مأموریت',description:'مأموریت/سفر و تسویه پایه',store:'missions',prefix:'MSN',fields:['owner','amount','due','unit'],states:['draft','submitted','approved','completed'],actions:['ارسال','تأیید مأموریت','تکمیل'],approvalAt:2}),
  mod({id:'overtime',domain:'hr',group:'منابع انسانی / پرسنل',title:'اضافه‌کاری',singular:'درخواست اضافه‌کاری',description:'ثبت و تأیید ساعت اضافه‌کاری بدون Payroll',store:'overtime_requests',prefix:'OVT',fields:['owner','quantity','due','unit'],states:['draft','submitted','approved'],actions:['ارسال','تأیید'],approvalAt:2}),
  {id:'employee-advance',domain:'hr',group:'منابع انسانی / پرسنل',title:'مساعده',singular:'درخواست مساعده',description:'ثبت شخصی یا نیابتی، تأیید شعبه و حسابداری، کنترل نهایی و پرداخت خزانه',store:'employee_advances',prefix:'ADV',fields:['owner','amount','unit','related'],workflow:employeeAdvanceWorkflow},
  mod({id:'employee-loan',domain:'hr',group:'منابع انسانی / پرسنل',title:'وام کارکنان',singular:'درخواست وام',description:'پایه وام؛ اقساط و قانون وابسته قابل تنظیم',store:'employee_loans',prefix:'LON',fields:['owner','amount','due','unit'],states:['draft','submitted','in_review','approved'],actions:['ارسال','شروع بررسی','تأیید'],approvalAt:3,productDecisionRequired:'سقف، اقساط، تضمین و نحوه تسویه وام تصویب نشده است.'}),
  mod({id:'performance-review',domain:'hr',group:'منابع انسانی / پرسنل',title:'ارزیابی عملکرد',singular:'ارزیابی',description:'دوره، ارزیاب، نتیجه و history',store:'performance_reviews',prefix:'PRF',fields:['owner','assignee','due','unit'],states:['draft','under_review','evaluated','completed'],actions:['شروع ارزیابی','ثبت نتیجه','نهایی‌سازی'],approvalAt:3}),
  mod({id:'training',domain:'hr',group:'منابع انسانی / پرسنل',title:'آموزش',singular:'برنامه آموزشی',description:'برنامه، شرکت‌کننده و نتیجه آموزش',store:'training_records',prefix:'TRN',fields:['owner','due','unit'],states:['draft','enrolled','training','completed'],actions:['ثبت‌نام','شروع آموزش','تکمیل']}),
  mod({id:'personnel-document',domain:'hr',group:'منابع انسانی / پرسنل',title:'اسناد پرسنلی',singular:'سند پرسنلی',description:'فراداده سند و checksum؛ بدون حذف تاریخچه',store:'personnel_documents',prefix:'PDC',fields:['owner','related'],states:['uploaded','checksum_verified','linked'],actions:['صحت‌سنجی','اتصال به پرونده']}),

  mod({id:'lead',domain:'crm',group:'مشتری و CRM',title:'سرنخ‌ها و تخصیص',singular:'سرنخ',description:'Lead، مالک، Assignment/Reassignment و Timeline',store:'leads',prefix:'LED',fields:['customer','owner','assignee','due','unit'],states:['draft','assigned','in_progress','qualified','converted'],actions:['تخصیص','شروع پیگیری','واجد شرایط','تبدیل به فروش'],reasonFrom:1,handoffAt:4,handoffModuleId:'sale'}),
  mod({id:'call',domain:'crm',group:'مشتری و CRM',title:'تماس‌ها',singular:'تماس',description:'نتیجه تماس و Snapshot زمینه بازاریابی',store:'calls',prefix:'CAL',fields:['customer','assignee','due','related'],states:['draft','completed'],actions:['ثبت نتیجه تماس']}),
  mod({id:'followup',domain:'crm',group:'مشتری و CRM',title:'پیگیری‌ها',singular:'پیگیری',description:'Scheduled/Due/Done/Missed و مالک',store:'followups',prefix:'FLW',fields:['customer','assignee','due','related'],states:['scheduled','in_progress','done'],actions:['شروع پیگیری','ثبت انجام']}),
  mod({id:'opportunity',domain:'crm',group:'مشتری و CRM',title:'فرصت‌های فروش',singular:'فرصت',description:'فرصت اختیاری؛ مانع فروش ساده نیست',store:'opportunities',prefix:'OPP',fields:['customer','owner','amount','due','related'],states:['open','proposal','won'],actions:['ارسال پیشنهاد','ثبت برد']}),

  mod({id:'quote',domain:'sales',group:'فروش',title:'پیش‌فاکتور',singular:'پیش‌فاکتور',description:'پیش‌فاکتور مستقل با تاریخچه مجزا',store:'quotes',prefix:'QOT',fields:['customer','owner','amount','due','related'],states:['draft','sent','accepted'],actions:['ارسال به مشتری','ثبت پذیرش'],handoffAt:2,handoffModuleId:'sale'}),
  mod({id:'sale',domain:'sales',group:'فروش',title:'فروش‌ها',singular:'فروش',description:'DIRECT/PAPER_ENTRY با Actor و Seller جدا',store:'sales',prefix:'SAL',fields:['customer','owner','amount','unit','related'],states:['draft','confirmed','invoiced','closed'],actions:['تأیید فروش','ساخت فاکتور','بستن فروش'],handoffAt:2,handoffModuleId:'invoice'}),
  mod({id:'invoice',domain:'sales',group:'فروش',title:'فاکتورها',singular:'فاکتور',description:'Revision غیرمخرب، Approval Gate و وضعیت مالی مشتق‌شده',store:'invoices',prefix:'INV',fields:['customer','owner','amount','related'],states:['draft','issued','payment_review','financially_cleared','fulfilling','fulfilled'],actions:['صدور','ارسال به بررسی پرداخت','تأیید مالی','شروع اجرا','تکمیل اجرا'],approvalAt:3,sensitiveAt:3}),
  mod({id:'payment',domain:'sales',group:'فروش',title:'پرداخت‌های مشتری',singular:'پرداخت',description:'Payment مستقل، review و correction lineage',store:'payments',prefix:'PAY',fields:['customer','amount','related','assignee'],states:['submitted','approved'],actions:['تأیید پرداخت'],approvalAt:1,sensitiveAt:1}),
  mod({id:'campaign',domain:'marketing',group:'بازاریابی',title:'کمپین‌ها',singular:'کمپین',description:'Context/Snapshot؛ بدون تخفیف یا Eligibility خودکار',store:'campaigns',prefix:'CMP',fields:['owner','due'],states:['draft','scheduled','active','paused','ended','archived'],actions:['زمان‌بندی','فعال‌سازی','توقف','پایان','بایگانی']}),
  mod({id:'promotion',domain:'marketing',group:'بازاریابی',title:'پروموشن‌ها',singular:'پروموشن',description:'Policy قیمت/شرایط با Snapshot',store:'promotions',prefix:'PRO',fields:['owner','due','related'],states:['draft','scheduled','active','ended','archived'],actions:['زمان‌بندی','فعال‌سازی','پایان','بایگانی']}),
  mod({id:'catalog-item',domain:'catalog',group:'کاتالوگ کالا و خدمات',title:'کالا و خدمات',singular:'آیتم کاتالوگ',description:'Product/Service، UOM، Tracking، SLA و Confirmation Policy',store:'catalog_items',prefix:'CAT',fields:['quantity','owner'],states:['draft','active','inactive','archived'],actions:['فعال‌سازی','غیرفعال‌سازی','بایگانی']}),
  mod({id:'price-list',domain:'catalog',group:'کاتالوگ کالا و خدمات',title:'قیمت‌ها',singular:'لیست قیمت',description:'نسخه قیمت و تاریخ اعتبار؛ بدون Tax rule فرضی',store:'price_lists',prefix:'PRC',fields:['amount','due','related'],states:['draft','approved','active','ended'],actions:['تأیید','فعال‌سازی','پایان'],approvalAt:1}),

  {id:'purchase-request',domain:'procurement',group:'خرید و تدارکات',title:'درخواست خرید',singular:'درخواست خرید',description:'درخواست چندردیفی، تفکیک شعب و مراکز هزینه، تأیید مستقل و ارسال سهم‌ها به خزانه',store:'purchase_requests',prefix:'PRQ',fields:['owner','amount','unit','due','related'],workflow:purchaseRequestWorkflow},
  mod({id:'rfq',domain:'procurement',group:'خرید و تدارکات',title:'استعلام تأمین‌کنندگان',singular:'استعلام',description:'دعوت تأمین‌کنندگان و دریافت پیشنهاد',store:'rfqs',prefix:'RFQ',fields:['owner','due','related'],states:['draft','sent','offer_received','comparison'],actions:['ارسال استعلام','ثبت دریافت پیشنهاد','شروع مقایسه'],handoffAt:2,handoffModuleId:'supplier-offer'}),
  mod({id:'supplier-offer',domain:'procurement',group:'خرید و تدارکات',title:'پیشنهادهای تأمین‌کننده',singular:'پیشنهاد تأمین‌کننده',description:'قیمت، شرایط، اعتبار و provenance پیشنهاد',store:'supplier_offers',prefix:'OFR',fields:['amount','due','related'],states:['draft','submitted','in_review','selected'],actions:['ثبت پیشنهاد','شروع بررسی','انتخاب'],approvalAt:3,handoffAt:3,handoffModuleId:'purchase-order'}),
  mod({id:'offer-comparison',domain:'procurement',group:'خرید و تدارکات',title:'مقایسه پیشنهادها',singular:'مقایسه',description:'مقایسه کنترل‌شده و دلیل انتخاب',store:'offer_comparisons',prefix:'CMPQ',fields:['amount','owner','related'],states:['draft','comparison','approved'],actions:['شروع مقایسه','تأیید نتیجه'],approvalAt:2,reasonFrom:2}),
  mod({id:'purchase-order',domain:'procurement',group:'خرید و تدارکات',title:'سفارش خرید',singular:'سفارش خرید',description:'PO، دریافت و اتصال به Invoice تأمین‌کننده',store:'purchase_orders',prefix:'PO',fields:['amount','quantity','owner','due','related'],states:['draft','ordered','receiving','received','invoiced','matched'],actions:['صدور سفارش','شروع دریافت','تکمیل دریافت','ثبت فاکتور','تطبیق'],handoffAt:1,handoffModuleId:'receipt'}),
  mod({id:'matching',domain:'procurement',group:'خرید و تدارکات',title:'تطبیق خرید',singular:'رکورد تطبیق',description:'PO/Receipt/Supplier Invoice matching foundation',store:'matching_records',prefix:'MAT',fields:['amount','related','assignee'],states:['draft','matching','matched','approved_for_payment'],actions:['شروع تطبیق','ثبت تطبیق','مجوز پرداخت'],approvalAt:3,handoffAt:3,handoffModuleId:'finance-request'}),
  mod({id:'supplier',domain:'supplier',group:'تأمین‌کنندگان',title:'نمای جامع تأمین‌کننده',singular:'تأمین‌کننده',description:'هویت، تماس، بانک کنترل‌شده، عملکرد و تاریخچه',store:'suppliers',prefix:'SUP',fields:['owner','unit'],states:['draft','in_review','active','inactive'],actions:['ارسال بررسی','فعال‌سازی','غیرفعال‌سازی'],approvalAt:2}),
  mod({id:'supplier-invoice',domain:'supplier',group:'تأمین‌کنندگان',title:'فاکتورهای تأمین‌کننده',singular:'فاکتور تأمین‌کننده',description:'فاکتور، تطبیق و handoff مالی',store:'supplier_invoices',prefix:'SIV',fields:['amount','related','due'],states:['draft','submitted','matching','approved_for_payment'],actions:['ارسال','شروع تطبیق','مجوز پرداخت'],approvalAt:3,handoffAt:3,handoffModuleId:'finance-request'}),

  mod({id:'cost-center',domain:'finance',group:'مالی',title:'مراکز هزینه',singular:'مرکز هزینه',description:'Hierarchy، مدیر، بودجه، درخواست و History',store:'cost_centers',prefix:'CST',fields:['owner','amount','unit','related'],states:['draft','active','inactive'],actions:['فعال‌سازی','غیرفعال‌سازی']}),
  mod({id:'budget',domain:'finance',group:'مالی',title:'بودجه',singular:'رکورد بودجه',description:'Budget foundation و اتصال مرکز هزینه',store:'budget_entries',prefix:'BDG',fields:['amount','owner','due','related'],states:['draft','submitted','approved','allocated_budget'],actions:['ارسال','تأیید بودجه','تخصیص'],approvalAt:2,productDecisionRequired:'کنترل سخت بودجه و Carry-over نیازمند Policy مصوب است.'}),
  mod({id:'finance-request',domain:'finance',group:'مالی',title:'درخواست‌های مالی',singular:'درخواست مالی',description:'Approval Chain قابل تنظیم بر مبلغ، نوع و مرکز هزینه',store:'finance_requests',prefix:'FNR',fields:['amount','owner','assignee','unit','due','related'],states:['draft','submitted','in_review','approved_pending_payment','paid','completed'],actions:['ارسال','شروع بررسی','تأیید و ارسال خزانه','ثبت پرداخت','تکمیل'],approvalAt:3,sensitiveAt:3,handoffAt:3,handoffModuleId:'treasury-execution'}),
  mod({id:'bank-account',domain:'treasury',group:'خزانه‌داری',title:'حساب‌های بانکی',singular:'حساب بانکی',description:'Reference پوشیده و دسترسی حساس',store:'bank_accounts',prefix:'BNK',fields:['owner','unit'],states:['draft','in_review','active','inactive'],actions:['ارسال بررسی','فعال‌سازی','غیرفعال‌سازی'],approvalAt:2,sensitiveAt:2}),
  {id:'treasury-execution',domain:'treasury',group:'خزانه‌داری',title:'صف پرداخت خزانه',singular:'اجرای پرداخت',description:'ارجاع مستقیم به مجری، ثبت پرداخت، راستی‌آزمایی و تاریخچه پایدار',store:'treasury_executions',prefix:'TRY',fields:['amount','assignee','due','related'],workflow:treasuryExecutionWorkflow},
  mod({id:'chart-account',domain:'accounting',group:'حسابداری',title:'کدینگ حساب‌ها',singular:'حساب',description:'Chart of Accounts قابل تنظیم',store:'chart_of_accounts',prefix:'COA',fields:['related'],states:['draft','active','inactive'],actions:['فعال‌سازی','غیرفعال‌سازی']}),
  mod({id:'accounting-period',domain:'accounting',group:'حسابداری',title:'دوره‌های مالی',singular:'دوره مالی',description:'Open/Lock foundation با کنترل دسترسی',store:'accounting_periods',prefix:'PER',fields:['due'],states:['draft','open_period','locked'],actions:['بازکردن دوره','بستن دوره'],approvalAt:2,sensitiveAt:2,productDecisionRequired:'قواعد Closing و مجوز بازگشایی دوره نیازمند تصویب حسابداری است.'}),
  mod({id:'journal-entry',domain:'accounting',group:'حسابداری',title:'اسناد حسابداری',singular:'سند حسابداری',description:'Journal/Lines draft؛ Auto-post فقط با Rule مصوب',store:'journal_entries',prefix:'JRN',fields:['amount','owner','related'],states:['journal_draft','submitted','ready_to_post','posted'],actions:['ارسال بررسی','آماده ثبت','ثبت قطعی'],approvalAt:2,sensitiveAt:3,productDecisionRequired:'Posting Ruleهای مالیاتی/قانونی تصویب نشده و Auto-post غیرفعال است.'}),
  mod({id:'bank-reconciliation',domain:'accounting',group:'حسابداری',title:'مغایرت بانکی',singular:'مغایرت بانکی',description:'Foundation تطبیق بانک و دفتر',store:'bank_reconciliations',prefix:'REC',fields:['amount','assignee','related'],states:['draft','in_review','reconciled','completed'],actions:['شروع بررسی','ثبت تطبیق','تکمیل'],approvalAt:3}),

  mod({id:'warehouse-master',domain:'warehouse',group:'انبار',title:'انبارها',singular:'انبار',description:'Warehouse و Locationهای عملیاتی',store:'warehouses',prefix:'WHS',fields:['owner','unit'],states:['draft','active','inactive'],actions:['فعال‌سازی','غیرفعال‌سازی']}),
  mod({id:'location',domain:'warehouse',group:'انبار',title:'مکان‌های انبار',singular:'مکان',description:'Receiving/Sellable/Picking/Packing/Returns/Quarantine/Damaged/Transit',store:'locations',prefix:'LOC',fields:['related'],states:['draft','active','inactive'],actions:['فعال‌سازی','غیرفعال‌سازی']}),
  mod({id:'inventory-item',domain:'warehouse',group:'انبار',title:'اقلام موجودی',singular:'قلم موجودی',description:'SKU، UOM و Tracking NONE/LOT/SERIAL',store:'inventory_items',prefix:'ITM',fields:['quantity','related'],states:['draft','active','inactive'],actions:['فعال‌سازی','غیرفعال‌سازی']}),
  mod({id:'receipt',domain:'warehouse',group:'انبار',title:'رسید انبار',singular:'رسید',description:'Purchase/Manual Receiving؛ Manual نیازمند Reason/Evidence',store:'receipts',prefix:'RCT',fields:['quantity','owner','related'],states:['draft','receiving','received','posted'],actions:['شروع دریافت','تکمیل دریافت','ثبت در Ledger'],approvalAt:3}),
  mod({id:'reservation',domain:'warehouse',group:'انبار',title:'رزرو موجودی',singular:'رزرو',description:'فقط Invoice Line واجد شرایط مالی و مکان SELLABLE',store:'reservations',prefix:'RSV',fields:['quantity','assignee','related'],states:['requested','allocated','consumed'],actions:['تخصیص موجودی','مصرف رزرو']}),
  mod({id:'transfer',domain:'warehouse',group:'انبار',title:'انتقال موجودی',singular:'انتقال',description:'Dispatch/Receive و Reversal کل سند',store:'transfers',prefix:'TRF',fields:['quantity','owner','related'],states:['draft','dispatched','received','completed'],actions:['خروج از مبدأ','دریافت مقصد','تکمیل'],reasonFrom:1}),
  mod({id:'adjustment',domain:'warehouse',group:'انبار',title:'تعدیل موجودی',singular:'تعدیل',description:'Maker/Checker و Ledger append-only',store:'adjustments',prefix:'ADJ',fields:['quantity','owner','related'],states:['draft','submitted','approved','posted'],actions:['ارسال','تأیید غیرخودی','ثبت Ledger'],approvalAt:2,sensitiveAt:2,reasonFrom:1}),
  mod({id:'count',domain:'warehouse',group:'انبار',title:'شمارش موجودی',singular:'شمارش',description:'Count، اختلاف و Approval مستقل',store:'counts',prefix:'CNT',fields:['quantity','owner','related'],states:['draft','counting','submitted','approved','posted'],actions:['شروع شمارش','ارسال','تأیید غیرخودی','ثبت اختلاف'],approvalAt:3,sensitiveAt:3}),
  mod({id:'return',domain:'warehouse',group:'انبار',title:'مرجوعی انبار',singular:'مرجوعی',description:'Inspection و Disposition کنترل‌شده',store:'returns',prefix:'RTN',fields:['quantity','customer','owner','related'],states:['received','inspecting','dispositioned','posted'],actions:['شروع بازرسی','تعیین تکلیف','ثبت Ledger'],approvalAt:3,reasonFrom:2}),
  mod({id:'inventory-movement',domain:'warehouse',group:'انبار',title:'دفتر حرکات موجودی',singular:'حرکت موجودی',description:'Ledger immutable؛ اصلاح فقط Reversal linked',store:'inventory_movements',prefix:'MOV',fields:['quantity','related'],states:['posted','reversal_requested','reversed'],actions:['درخواست ثبت معکوس','ثبت حرکت معکوس'],approvalAt:2,sensitiveAt:2,reasonFrom:1}),

  mod({id:'shipment',domain:'logistics',group:'لجستیک و تحویل',title:'ارسال‌ها',singular:'محموله',description:'Reservation → Ready → Shipment → Dispatch',store:'shipments',prefix:'SHP',fields:['quantity','customer','assignee','due','related'],states:['draft','ready_to_ship','dispatched','in_transit','delivered'],actions:['آماده ارسال','اعزام','ثبت در مسیر','تحویل موفق'],reasonFrom:2}),
  mod({id:'delivery',domain:'logistics',group:'لجستیک و تحویل',title:'صف نمایندگان تحویل',singular:'مأموریت تحویل',description:'Custody، Attempt، Success/Failure و Re-coordinate',store:'deliveries',prefix:'DLV',fields:['customer','assignee','due','related'],states:['assigned','custody','in_transit','attempt','delivered'],actions:['تحویل به مأمور','حرکت','ثبت تلاش','تحویل موفق'],reasonFrom:1}),
  mod({id:'service-case',domain:'service',group:'عملیات و فعال‌سازی خدمات',title:'فعال‌سازی خدمات',singular:'پرونده خدمت',description:'Policy Snapshot، SLA، Evidence، Review و Confirmation',store:'service_cases',prefix:'SRV',fields:['customer','assignee','due','related'],states:['assigned','coordination','activation','evidence_submitted','reviewed','completed'],actions:['شروع هماهنگی','شروع اجرا','ثبت مدرک','بازبینی','تکمیل'],approvalAt:4}),
  mod({id:'service-evidence',domain:'service',group:'عملیات و فعال‌سازی خدمات',title:'مدارک اجرا',singular:'مدرک اجرا',description:'Evidence metadata و review/rework',store:'service_evidence',prefix:'EVD',fields:['assignee','related'],states:['draft','submitted','reviewed','completed'],actions:['ارسال مدرک','بازبینی','تأیید'],approvalAt:2}),
  mod({id:'support-case',domain:'support',group:'پشتیبانی و خدمات پس از فروش',title:'پرونده‌های پشتیبانی',singular:'پرونده پشتیبانی',description:'Complaint/Cancel/Return/Correction/Refund، SLA و Reopen',store:'support_cases',prefix:'SUPC',fields:['customer','owner','assignee','due','related'],states:['open','in_review','waiting_customer','resolved','closed'],actions:['شروع بررسی','انتظار مشتری','ثبت حل','بستن'],reasonFrom:1}),
  mod({id:'support-transaction',domain:'support',group:'پشتیبانی و خدمات پس از فروش',title:'ردیف‌های مالی پشتیبانی',singular:'ردیف مالی',description:'چند ردیف، Approval، Correction و Treasury Handoff',store:'support_transactions',prefix:'STR',fields:['customer','amount','assignee','related'],states:['pending_financial_approval','approved_pending_send','sent_to_treasury','paid'],actions:['تأیید مالی','ارسال خزانه','ثبت پرداخت'],approvalAt:1,sensitiveAt:1,handoffAt:2,handoffModuleId:'treasury-execution'}),
  mod({id:'contract',domain:'contract',group:'قراردادها',title:'قراردادها',singular:'قرارداد',description:'Party، Version/Amendment، Obligation، SLA و Renewal',store:'contracts',prefix:'CTR',fields:['customer','owner','amount','due','related'],states:['draft','in_review','active','amended','renewed','ended'],actions:['ارسال بررسی','فعال‌سازی','ثبت اصلاحیه','تمدید','پایان'],approvalAt:2,reasonFrom:3}),
  mod({id:'fixed-asset',domain:'asset',group:'دارایی‌های ثابت',title:'دارایی‌ها',singular:'دارایی ثابت',description:'Registry، Custodian، Transfer، Maintenance و Disposal',store:'fixed_assets',prefix:'AST',fields:['amount','owner','unit','related'],states:['registered_asset','active','maintenance','transferred','disposed'],actions:['فعال‌سازی','ارسال تعمیر','انتقال','واگذاری'],approvalAt:4,reasonFrom:2,productDecisionRequired:'روش استهلاک و Posting حسابداری دارایی تصویب نشده است.'}),
  mod({id:'asset-transfer',domain:'asset',group:'دارایی‌های ثابت',title:'انتقال دارایی',singular:'انتقال دارایی',description:'تحویل از متولی قبلی به متولی جدید',store:'asset_transfers',prefix:'ATR',fields:['owner','assignee','unit','related'],states:['draft','submitted','approved','completed'],actions:['ارسال','تأیید انتقال','تحویل'],approvalAt:2}),
  mod({id:'asset-maintenance',domain:'asset',group:'دارایی‌های ثابت',title:'نگهداری دارایی',singular:'درخواست تعمیر',description:'Maintenance foundation، هزینه و نتیجه',store:'asset_maintenance',prefix:'AMT',fields:['amount','owner','due','related'],states:['draft','submitted','in_progress','completed'],actions:['ارسال','شروع تعمیر','تکمیل']}),
  mod({id:'task',domain:'task',group:'کارتابل و وظایف',title:'وظایف',singular:'وظیفه',description:'Due/Priority/Owner/Handoff/Block/Reopen',store:'tasks',prefix:'TSK',fields:['owner','assignee','due','related'],states:['todo','in_progress','done'],actions:['شروع','انجام']}),
  mod({id:'chat',domain:'communications',group:'Chat / ارتباطات',title:'گفت‌وگوها',singular:'گفت‌وگو',description:'Member، Message Version و Correction؛ حذف فیزیکی ممنوع',store:'chats',prefix:'CHT',fields:['owner','assignee','related'],states:['active','archived'],actions:['بایگانی']}),
  mod({id:'message',domain:'communications',group:'Chat / ارتباطات',title:'پیام‌ها',singular:'پیام',description:'Sent/Delivered/Read و Correction Message',store:'messages',prefix:'MSG',fields:['related'],states:['sent','delivered_message','read'],actions:['ثبت تحویل','ثبت خواندن']}),
  mod({id:'letter',domain:'letter',group:'نامه / دبیرخانه',title:'نامه‌ها و دبیرخانه',singular:'نامه',description:'Incoming/Outgoing، Review، Approve، Send و Archive',store:'letters',prefix:'LTR',fields:['owner','assignee','due','related'],states:['draft','in_review','approved_for_send','sent','archived'],actions:['ارسال بررسی','مجوز ارسال','ارسال نامه','بایگانی'],approvalAt:2}),
  mod({id:'document',domain:'document',group:'اسناد و آرشیو',title:'اسناد و آرشیو',singular:'سند',description:'Metadata، checksum، quota و ارتباط رکورد؛ حذف تاریخچه ممنوع',store:'documents',prefix:'DOC',fields:['owner','related'],states:['uploaded','checksum_verified','linked','archived'],actions:['صحت‌سنجی','اتصال رکورد','بایگانی']}),
];

function addBranch(moduleId:string, from:string|string[], to:string, label:string, options:Partial<WorkflowTransitionDefinition>={}) {const module=ERP_MODULES.find((item)=>item.id===moduleId); if(!module)return; module.workflow.stateLabels[to]=STATE_LABELS[to]??to; module.workflow.transitions.push(transition(module.domain,module.id,from,to,label,options));}
addBranch('payment','submitted','needs_correction','عودت برای اصلاح',{reasonRequired:true,makerChecker:true});
addBranch('payment','needs_correction','submitted','ارسال مجدد پرداخت',{reasonRequired:true});
addBranch('payment','submitted','rejected','رد پرداخت',{reasonRequired:true,makerChecker:true,sensitive:true});
addBranch('delivery','attempt','delivery_failed','ثبت تحویل ناموفق',{reasonRequired:true});
addBranch('delivery','delivery_failed','rescheduled','زمان‌بندی مجدد',{reasonRequired:true});
addBranch('delivery','rescheduled','assigned','تخصیص مجدد',{reasonRequired:true});
addBranch('service-case','evidence_submitted','needs_rework','عودت برای بازکاری',{reasonRequired:true,makerChecker:true});
addBranch('service-case','needs_rework','activation','شروع بازکاری',{reasonRequired:true});
addBranch('service-case','reviewed','confirmed','ثبت تأیید مشتری',{reasonRequired:false});
addBranch('service-case','confirmed','completed','تکمیل پس از تأیید');
addBranch('service-case',['assigned','coordination','activation'],'unable_to_fulfill','ثبت عدم امکان اجرا',{reasonRequired:true});
addBranch('service-case',['assigned','coordination','activation'],'escalated','ارجاع ویژه',{reasonRequired:true});
addBranch('support-case','closed','reopened','بازگشایی پرونده',{reasonRequired:true});
addBranch('support-case','reopened','in_review','شروع بررسی مجدد',{reasonRequired:true});
addBranch('support-transaction','pending_financial_approval','rejected','رد مالی',{reasonRequired:true,makerChecker:true,sensitive:true});
addBranch('task','in_progress','blocked','مسدودکردن وظیفه',{reasonRequired:true});
addBranch('task','blocked','in_progress','رفع مانع',{reasonRequired:true});
addBranch('task','done','reopened','بازگشایی وظیفه',{reasonRequired:true});
addBranch('task','reopened','in_progress','شروع مجدد',{reasonRequired:true});

export const ERP_WORKFLOWS = ERP_MODULES.map((module) => module.workflow);
export const ERP_OPERATIONAL_STORES = [...new Set(ERP_MODULES.map((module) => module.store))];
export const ERP_ADMIN_PERMISSIONS: PermissionCode[] = [...new Set(ERP_MODULES.flatMap((module) => ['view','create','edit','transition','approve','manage'].map((action) => actionPermission(module.domain,module.id,action))))];
export const permissionFor = (moduleId: string, action: 'view'|'create'|'edit'|'transition'|'approve'|'manage') => {const module = ERP_MODULES.find((item) => item.id === moduleId); return module ? actionPermission(module.domain,module.id,action) : `unknown.${moduleId}.${action}`;};

type RoleTemplateInput = {id:string;title:string;description:string;scope:ScopeType;permissions:PermissionCode[]};
const perms = (moduleIds:string[], actions:Array<'view'|'create'|'edit'|'transition'|'approve'|'manage'>) => moduleIds.flatMap((id) => actions.map((action) => permissionFor(id, action)));
const role = (id:string,title:string,description:string,scope:ScopeType,moduleIds:string[],actions:Array<'view'|'create'|'edit'|'transition'|'approve'|'manage'>):RoleTemplateInput => ({id,title,description,scope,permissions:[...new Set(perms(moduleIds,actions))]});
const hr=['recruitment-case','employment-contract','onboarding','offboarding','attendance','shift','leave','mission','overtime','employee-advance','employee-loan','performance-review','training','personnel-document'];
const crm=['lead','call','followup','opportunity']; const sales=['quote','sale','invoice','payment']; const market=['campaign','promotion']; const catalog=['catalog-item','price-list']; const procurement=['purchase-request','rfq','supplier-offer','offer-comparison','purchase-order','matching']; const supplier=['supplier','supplier-invoice']; const finance=['cost-center','budget','finance-request']; const treasury=['bank-account','treasury-execution']; const accounting=['chart-account','accounting-period','journal-entry','bank-reconciliation']; const warehouse=['warehouse-master','location','inventory-item','receipt','reservation','transfer','adjustment','count','return','inventory-movement']; const logistics=['shipment','delivery']; const service=['service-case','service-evidence']; const support=['support-case','support-transaction'];
export const ERP_ROLE_TEMPLATES: RoleTemplateInput[] = [
  role('role-workforce-requester','مدیر درخواست‌کننده نیرو','ثبت اعلام نیاز فقط برای واحد یا شعبه تحت مدیریت خود و مشاهده نتیجه همان پرونده','UNIT',['recruitment-case'],['view','create','edit','transition']),
  role('role-recruitment-operator','کارشناس جذب منابع انسانی','دریافت اعلام نیاز، تماس، ساخت پرونده موقت، انتشار آگهی، دعوت و تکمیل پرونده متقاضی','COMPANY',['recruitment-case'],['view','create','edit','transition']),
  role('role-recruitment-manager','مدیر جذب منابع انسانی','تأیید اعلام نیاز، ثبت نیابتی، پیشنهاد همکاری، دستور شروع و کنترل نهایی جذب','COMPANY',['recruitment-case'],['view','create','edit','transition','approve','manage']),
  role('role-recruitment-interviewer','ارزیاب مصاحبه','مشاهده پرونده‌های تخصیص‌یافته و ثبت مستقل ارزیابی مصاحبه','SELF',['recruitment-case'],['view','transition','approve']),
  role('role-onboarding-supervisor','سرپرست شروع همکاری','تأیید آمادگی شروع، ارزیابی دوره آموزشی و پیشنهاد تبدیل به قراردادی','UNIT',['recruitment-case','onboarding','training'],['view','edit','transition','approve']),
  role('role-user-manager','مدیر کاربران سیستم','ساخت و نگهداری حساب، رمز و تخصیص نقش بدون اختیار تغییر تعریف نقش یا عملیات تجاری','COMPANY',[],[]),
  role('role-organization-manager','مدیر سازمان','مدیریت ساختار و جایگاه سازمانی','COMPANY',[],[]),
  role('role-hr-operator','اپراتور منابع انسانی','اجرای عملیات روزانه پرسنلی','COMPANY',hr,['view','create','edit','transition']), role('role-hr-manager','مدیر منابع انسانی','بازبینی و تأیید چرخه‌های منابع انسانی','COMPANY',hr,['view','create','edit','transition','approve']), role('role-attendance-operator','اپراتور حضور و غیاب','ثبت حضور، شیفت و اضافه‌کاری','UNIT',['attendance','shift','overtime'],['view','create','edit','transition']), role('role-personnel-reviewer','بازبین پرسنل','بازبینی پرونده و اسناد پرسنلی','COMPANY',['employment-contract','onboarding','offboarding','personnel-document'],['view','transition','approve']),
  role('role-advance-branch-manager','مدیر شعبه مساعده','بررسی درخواست مساعده کارکنان همان شعبه و ارجاع به حسابداری','UNIT',['employee-advance'],['view','transition','approve']),
  role('role-advance-accounting-reviewer','کنترل‌کننده حسابداری مساعده','کنترل مالی مساعده و ارجاع به تأییدکننده اصلی یا خزانه','COMPANY',['employee-advance'],['view','edit','transition','approve']),
  role('role-sales-advance-approver','تأییدکننده اصلی مساعده فروش','ثبت نیابتی، تغییر مبلغ، تأیید شعب منتخب و ارجاع مستقیم یا پس از بازبینی حسابداری','COMPANY',['employee-advance'],['view','create','edit','transition','approve','manage']),
  role('role-customer-operator','اپراتور مشتری','مدیریت مشتری و Leadهای مجاز','COMPANY',crm,['view','create','edit','transition']), role('role-data-steward','ناظر کیفیت داده','بازبینی هویت، تکراری و کیفیت داده','COMPANY',crm,['view','edit','approve']), role('role-import-operator','اپراتور ورود داده','ورود داده مشتری بدون Approval','COMPANY',crm,['view','create']), role('role-import-reviewer','بازبین ورود داده','بازبینی و اعمال Import','COMPANY',crm,['view','approve']),
  role('role-sales-vice','معاون فروش','دید مدیریتی فروش بدون اختیار سازمانی ضمنی','COMPANY',[...crm,...sales],['view','transition','approve']), role('role-sales-manager','مدیر فروش','مدیریت صف، reassignment و فروش Company','COMPANY',[...crm,...sales],['view','create','edit','transition','approve']), role('role-senior-sales-supervisor','سرپرست ارشد','مدیریت چند تیم فروش','UNIT',[...crm,...sales],['view','create','edit','transition','approve']), role('role-sales-supervisor','سرپرست فروش','تخصیص و بررسی تیم فروش','TEAM',[...crm,...sales],['view','create','transition','approve']), role('role-sales-seller','فروشنده','صف خود، تماس، پیگیری و فروش خود','SELF',[...crm,...sales],['view','create','edit','transition']), role('role-paper-entry','اپراتور ثبت کاغذی','ثبت فروش به نمایندگی با Seller attribution','COMPANY',['sale','invoice'],['view','create','edit','transition']), role('role-sales-operations','عملیات فروش','کنترل Queue و اسناد فروش','COMPANY',[...crm,...sales],['view','edit','transition']),
  role('role-marketing-manager','مدیر بازاریابی','کمپین و Promotion','COMPANY',market,['view','create','edit','transition','approve']), role('role-campaign-operator','اپراتور کمپین','اجرای کمپین','COMPANY',market,['view','create','edit','transition']), role('role-product-manager','مدیر محصول','مدیریت کالای کاتالوگ','COMPANY',catalog,['view','create','edit','transition','approve']), role('role-service-catalog','مدیر کاتالوگ خدمات','مدیریت SLA و Service Policy','COMPANY',catalog,['view','create','edit','transition','approve']), role('role-pricing-manager','مدیر قیمت و پروموشن','قیمت و Promotion نسخه‌دار','COMPANY',['price-list','promotion'],['view','create','edit','transition','approve']),
  role('role-payment-recorder','ثبت‌کننده پرداخت','ثبت Payment بدون Review','COMPANY',['payment'],['view','create','edit','transition']), role('role-financial-reviewer','بازبین مالی فروش','Review غیرخودی پرداخت','COMPANY',['invoice','payment'],['view','approve']), role('role-collection-manager','مدیر وصول','مدیریت زیرساخت و صف وصول','COMPANY',['invoice','payment'],['view','manage','transition']),
  role('role-purchase-requester','درخواست‌کننده خرید','ثبت، اصلاح و پیگیری درخواست خرید خود','SELF',['purchase-request'],['view','create','edit','transition']), role('role-purchase-approver','تأییدکننده درخواست خرید','بررسی مستقل، تأیید، رد، درخواست اصلاح، ارجاع و ارسال سهم‌های تأییدشده به خزانه','COMPANY',['purchase-request'],['view','transition','approve','manage']), role('role-procurement-officer','کارشناس تدارکات','RFQ، Offer و PO','COMPANY',procurement,['view','create','edit','transition']), role('role-procurement-manager','مدیر تدارکات','تأیید انتخاب و خرید','COMPANY',procurement,['view','create','edit','transition','approve','manage']), role('role-supplier-manager','مدیر تأمین‌کنندگان','Supplier 360 و Invoice تأمین‌کننده','COMPANY',supplier,['view','create','edit','transition','approve']),
  role('role-finance-requester-v1','درخواست‌کننده مالی','ثبت درخواست مالی خود','SELF',['finance-request'],['view','create','edit','transition']), role('role-finance-approver-v1','تأییدکننده مالی','Approval Chain و عودت/رد','UNIT',['finance-request','budget'],['view','transition','approve']), role('role-cost-center-manager','مدیر مرکز هزینه','مرکز هزینه و بودجه مرتبط','UNIT',['cost-center','budget','finance-request'],['view','create','edit','transition','approve']), role('role-treasury-manager-v1','مدیر خزانه','صف، Verify و کنترل پرداخت','COMPANY',treasury,['view','create','edit','transition','approve']), role('role-treasury-executor-v1','مجری خزانه','اجرای مستقیم پرداخت‌های ارجاع‌شده','COMPANY',['treasury-execution'],['view','edit','transition']), role('role-emergency-payment','مسئول پرداخت اضطراری','مسیر اضطراری با Reason/Audit','COMPANY',['treasury-execution'],['view','create','transition']),
  role('role-accountant','حسابدار','اسناد پیش‌نویس، مغایرت و تسویه مالی خروج پرسنل','COMPANY',[...accounting,'offboarding'],['view','create','edit','transition']), role('role-senior-accountant','حسابدار ارشد','بازبینی اسناد، دوره و تسویه مالی خروج','COMPANY',[...accounting,'offboarding'],['view','create','edit','transition','approve']), role('role-chief-accountant','رئیس حسابداری','کنترل نهایی مالی و تسویه خروج بدون Rule قانونی فرضی','COMPANY',[...accounting,'offboarding'],['view','manage','transition','approve']), role('role-ap-operator','اپراتور حساب‌های پرداختنی','Supplier invoice/AP foundation','COMPANY',['supplier-invoice','journal-entry'],['view','create','edit','transition']), role('role-ar-operator','اپراتور حساب‌های دریافتنی','Invoice/Payment/AR foundation','COMPANY',['invoice','payment','journal-entry'],['view','create','edit','transition']), role('role-bank-reconciliation','اپراتور مغایرت بانکی','Bank reconciliation','COMPANY',['bank-reconciliation'],['view','create','edit','transition']),
  role('role-warehouse-manager-v1','مدیر انبار','مدیریت master و عملیات انبار','COMPANY',warehouse,['view','create','edit','transition','approve','manage']), role('role-receiving-operator','اپراتور رسید','Receiving استاندارد','UNIT',['receipt'],['view','create','edit','transition']), role('role-manual-receiving','اپراتور رسید دستی','رسید دستی با Evidence','UNIT',['receipt'],['view','create','edit','transition']), role('role-reservation-operator','اپراتور رزرو','Reservation واجد شرایط','UNIT',['reservation'],['view','create','transition']), role('role-transfer-operator','اپراتور انتقال','Transfer whole-document','UNIT',['transfer'],['view','create','edit','transition']), role('role-inventory-maker-v1','سازنده کنترل موجودی','ساخت تعدیل/شمارش','UNIT',['adjustment','count'],['view','create','edit','transition']), role('role-inventory-approver-v1','تأییدکننده کنترل موجودی','Approval غیرخودی','UNIT',['adjustment','count'],['view','approve']), role('role-return-inspector','بازرس مرجوعی','Inspection/Disposition','UNIT',['return'],['view','create','edit','transition']), role('role-movement-reversal','مسئول ثبت معکوس','Reversal movement linked','COMPANY',['inventory-movement'],['view','transition','approve']),
  role('role-logistics-manager','مدیر لجستیک','Shipment/Delivery و صف مأموران','COMPANY',logistics,['view','create','edit','transition','approve']), role('role-dispatch-operator','اپراتور اعزام','Dispatch و Custody handoff','UNIT',logistics,['view','create','edit','transition']), role('role-delivery-coordinator','هماهنگ‌کننده تحویل','Assignment/Reschedule','UNIT',['delivery'],['view','create','edit','transition']), role('role-delivery-representative','نماینده تحویل کالا','فقط مأموریت تخصیص‌یافته','SELF',['delivery'],['view','edit','transition']), role('role-driver','راننده / پیک','مسیر و Attempt تخصیص‌یافته','SELF',['delivery'],['view','transition']),
  role('role-service-ops-manager','مدیر عملیات خدمات','Service queue و escalation','COMPANY',service,['view','create','edit','transition','approve']), role('role-service-activation-manager','مدیر فعال‌سازی','Assignment و Review','UNIT',service,['view','create','edit','transition','approve']), role('role-service-officer','کارشناس فعال‌سازی','Coordination/Execution/Evidence','SELF',service,['view','create','edit','transition']), role('role-service-reviewer','بازبین خدمت','Review غیرخودی evidence','UNIT',service,['view','approve']),
  role('role-support-agent-v1','کارشناس پشتیبانی','Caseهای تخصیص‌یافته','SELF',support,['view','create','edit','transition']), role('role-support-manager-v1','مدیر پشتیبانی','صف، SLA و Closure','COMPANY',support,['view','create','edit','transition','approve']), role('role-support-financial','تأییدکننده مالی پشتیبانی','Approval ردیف مالی غیرخودی','COMPANY',['support-transaction'],['view','approve']),
  role('role-contract-manager','مدیر قراردادها','Contract/Version/Obligation','COMPANY',['contract'],['view','create','edit','transition','approve']), role('role-asset-manager','مسئول دارایی‌ها و اموال','ثبت دارایی، تحویل و عودت دوطرفه، انتقال، نگهداری و تسویه اموال خروج','COMPANY',['fixed-asset','asset-transfer','asset-maintenance','offboarding'],['view','create','edit','transition','approve']), role('role-document-manager','مدیر اسناد و آرشیو','Document metadata/quota/history','COMPANY',['document','personnel-document'],['view','create','edit','transition','manage']), role('role-letter-reviewer','بازبین نامه','Review و مجوز ارسال','COMPANY',['letter'],['view','transition','approve']), role('role-task-manager','مدیر وظایف','Task/Handoff/Reopen','COMPANY',['task'],['view','create','edit','transition','manage']), role('role-communications-operator','اپراتور ارتباطات','Chat/Message/Letter','COMPANY',['chat','message','letter'],['view','create','edit','transition']), role('role-executive-mis','مدیر ارشد / مشاهده اطلاعات مدیریتی','مشاهده شاخص‌های عملکرد و سلامت صف‌ها','COMPANY',ERP_MODULES.map((item)=>item.id),['view']), role('role-audit-reviewer','بازبین رویدادها','بازبینی رویدادها و کنترل داخلی فقط‌خواندنی','COMPANY',ERP_MODULES.map((item)=>item.id),['view']), role('role-workflow-admin','مدیر گردش‌کار','مدیریت محدود صف، ترتیب مراحل، تخصیص و سیاست تأیید','COMPANY',[],[]),
];

export function seedOperationalRecords(): Record<string, OperationalRecord[]> {
  const result: Record<string, OperationalRecord[]> = {};
  ERP_MODULES.forEach((module,index) => {
    const isPurchase = module.id === 'purchase-request';
    const isTreasuryExecution = module.id === 'treasury-execution';
    const record:OperationalRecord={
      id:`demo-${module.id}-1`,moduleId:module.id,domain:module.domain,trackingCode:`${module.prefix}-1405-${String(index+1).padStart(3,'0')}`,
      title:isPurchase?'تجهیز اتاق جلسات شعب فروش':`${module.singular} نمونه`,description:isPurchase?'خرید تجهیزات موردنیاز اتاق جلسات و آموزش شعب فروش.':`رکورد نمایشی عملیاتی برای آزمون ${module.title}`,
      status:module.workflow.initialState,priority:isPurchase?'high':index%11===0?'high':'normal',companyId:COMPANY_ID,
      unitId:isPurchase?'unit-sales':index%3===0?'unit-management':index%3===1?'unit-sales':'unit-finance',branchUnitId:isPurchase?undefined:index%4===0?'unit-branch-central':undefined,
      ownerPersonnelId:index%2===0?'personnel-admin':'personnel-sara',assigneeUserId:isPurchase?'persona-purchase-requester':isTreasuryExecution?'persona-treasury-executor':index%2===0?'persona-product-owner':'persona-system-admin',
      customerId:['crm','sales','support','logistics','service'].includes(module.domain)?'customer-kiana':undefined,
      amountRial:isPurchase?'165000000':module.fields.includes('amount')?String((index+1)*1250000):undefined,quantity:isPurchase?'2':module.fields.includes('quantity')?String((index%5)+1):undefined,
      dueAt:module.fields.includes('due')?'2026-09-20T12:00:00.000Z':undefined,createdByActorId:isPurchase?'actor-purchase-requester':'actor-product-owner',createdByUserId:isPurchase?'persona-purchase-requester':'persona-product-owner',updatedByActorId:isPurchase?'actor-purchase-requester':'actor-product-owner',version:1,
      payload:isPurchase?{
        demo:true,source:'NORMAL_DEMO',requestDate:'2026-08-19',purchaseType:'goods',deliveryLocation:'تحویل در شعب منتخب',
        lines:[
          {id:'line-demo-1',title:'ویدئو پروژکتور',category:'تجهیزات اداری',specification:'حداقل روشنایی ۴۰۰۰ لومن',quantity:'2',unit:'دستگاه',estimatedUnitPriceRial:'70000000',preferredSupplier:'تأمین‌کننده نمونه'},
          {id:'line-demo-2',title:'پرده نمایش',category:'تجهیزات اداری',specification:'پرده برقی ۲٫۵ متری',quantity:'1',unit:'عدد',estimatedUnitPriceRial:'25000000',preferredSupplier:''},
        ],
        beneficiaryCardNumber:'6104337812345678',beneficiaryLastName:'فرهمند',
        quotationAttachments:[{id:'quotation-demo-1',fileName:'پیش‌فاکتور-نمونه.pdf',mimeType:'application/pdf',size:18,dataUrl:'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',uploadedAt:'2026-08-18T10:00:00.000Z'}],
        allocations:[
          {id:'allocation-demo-1',branchUnitId:'unit-branch-central',costCenterUnitId:'unit-sales',amountRial:'100000000',note:'سهم شعبه سعادت‌آباد'},
          {id:'allocation-demo-2',branchUnitId:'unit-branch-poonak',costCenterUnitId:'unit-sales',amountRial:'65000000',note:'سهم شعبه پونک'},
        ],
      }:isTreasuryExecution?{demo:true,source:'NORMAL_DEMO',initialRequesterUserId:'persona-purchase-requester',initialRequesterName:'پریسا جوادی',productDecisionRequired:module.productDecisionRequired??null}:{demo:true,source:'NORMAL_DEMO',productDecisionRequired:module.productDecisionRequired??null},createdAt:SEED_TIME,updatedAt:SEED_TIME,
    };
    (result[module.store]??=[]).push(record);
  });
  result.letters = [
    {
      id:'letter-sample-incoming-bank',moduleId:'letter',domain:'letter',trackingCode:'LTR-1405-0001',title:'ابلاغ برنامه قطعی نگهداری شبکه بانکی',
      description:'اطلاع‌رسانی بانک درباره بازه نگهداری سرویس‌های پرداخت و لزوم هماهنگی واحدهای مالی.',status:'sent',priority:'high',companyId:COMPANY_ID,
      unitId:'unit-management',ownerPersonnelId:'personnel-admin',assigneeUserId:'persona-product-owner',createdByActorId:'actor-product-owner',createdByUserId:'persona-product-owner',updatedByActorId:'actor-product-owner',workflowVersion:1,version:1,
      payload:{direction:'incoming',body:'با سلام؛ به اطلاع می‌رساند عملیات نگهداری دوره‌ای شبکه بانکی در روز پنج‌شنبه از ساعت ۰۰:۳۰ تا ۰۳:۰۰ انجام می‌شود. لطفاً پرداخت‌های ضروری پیش از این بازه ثبت و مسئولان خزانه نیز مطلع شوند.',recipientUserIds:['persona-product-owner','persona-treasury-executor'],externalParty:'بانک ملت — مدیریت امور مشتریان سازمانی',attachment:null},
      createdAt:'2026-08-20T07:15:00.000Z',updatedAt:'2026-08-20T07:15:00.000Z',
    },
    {
      id:'letter-sample-outgoing-support',moduleId:'letter',domain:'letter',trackingCode:'LTR-1405-0002',title:'درخواست تمدید قرارداد خدمات پشتیبانی',
      description:'درخواست رسمی تمدید قرارداد پشتیبانی و اعلام برنامه حضور کارشناسان پیمانکار.',status:'sent',priority:'normal',companyId:COMPANY_ID,
      unitId:'unit-management',ownerPersonnelId:'personnel-admin',assigneeUserId:'persona-product-owner',createdByActorId:'actor-product-owner',createdByUserId:'persona-product-owner',updatedByActorId:'actor-product-owner',workflowVersion:1,version:4,
      payload:{direction:'outgoing',body:'با سلام؛ با توجه به پایان دوره جاری قرارداد خدمات پشتیبانی، خواهشمند است پیشنهاد تمدید یک‌ساله، برنامه حضور کارشناسان و سطح خدمات پیشنهادی حداکثر تا پایان هفته ارسال شود.',recipientUserIds:[],externalParty:'شرکت راهکاران شبکه آریا',attachment:null,reviewRequestedByUserId:'persona-product-owner',approvedByUserId:'persona-system-admin',sentByUserId:'persona-product-owner'},
      createdAt:'2026-08-21T08:10:00.000Z',updatedAt:'2026-08-21T11:40:00.000Z',
    },
    {
      id:'letter-sample-internal-performance',moduleId:'letter',domain:'letter',trackingCode:'LTR-1405-0003',title:'اعلام تقویم ارزیابی عملکرد نیم‌سال',
      description:'تقویم تکمیل فرم‌ها و جلسات ارزیابی عملکرد نیم‌سال اول برای مدیران واحدها.',status:'sent',priority:'normal',companyId:COMPANY_ID,
      unitId:'unit-human-resources',ownerPersonnelId:'personnel-hr-manager',assigneeUserId:'persona-hr-manager',createdByActorId:'actor-hr-manager',createdByUserId:'persona-hr-manager',updatedByActorId:'actor-hr-manager',workflowVersion:1,version:4,
      payload:{direction:'internal',body:'مدیران محترم؛ فرم‌های ارزیابی عملکرد نیم‌سال اول تا دهم شهریور تکمیل شود. جلسات جمع‌بندی از دوازدهم تا پانزدهم شهریور برگزار خواهد شد و نتیجه نهایی در پرونده پرسنلی ثبت می‌شود.',recipientUserIds:['persona-product-owner','persona-system-admin','persona-organization-manager'],externalParty:null,attachment:null,reviewRequestedByUserId:'persona-hr-manager',approvedByUserId:'persona-system-admin',sentByUserId:'persona-hr-manager'},
      createdAt:'2026-08-22T06:45:00.000Z',updatedAt:'2026-08-22T10:20:00.000Z',
    },
    {
      id:'letter-sample-draft-archive',moduleId:'letter',domain:'letter',trackingCode:'LTR-1405-0004',title:'پیش‌نویس دستورالعمل بایگانی قراردادها',
      description:'نسخه اولیه دستورالعمل نام‌گذاری، نگهداری و دسترسی به قراردادهای سازمان.',status:'draft',priority:'normal',companyId:COMPANY_ID,
      unitId:'unit-management',ownerPersonnelId:'personnel-admin',assigneeUserId:'persona-product-owner',createdByActorId:'actor-product-owner',createdByUserId:'persona-product-owner',updatedByActorId:'actor-product-owner',workflowVersion:1,version:1,
      payload:{direction:'internal',body:'این پیش‌نویس برای تعیین روش یکسان نام‌گذاری، سطح دسترسی و مدت نگهداری قراردادها تهیه شده است. پیش از ارسال برای بازبینی، جدول مسئولیت واحدها باید تکمیل شود.',recipientUserIds:['persona-system-admin','persona-hr-manager'],externalParty:null,attachment:null},
      createdAt:'2026-08-23T09:30:00.000Z',updatedAt:'2026-08-23T09:30:00.000Z',
    },
    {
      id:'letter-sample-review-tax',moduleId:'letter',domain:'letter',trackingCode:'LTR-1405-0005',title:'پاسخ پیشنهادی به استعلام اداره مالیات',
      description:'متن پیشنهادی پاسخ به استعلام برای بازبینی و صدور مجوز ارسال.',status:'in_review',priority:'high',companyId:COMPANY_ID,
      unitId:'unit-human-resources',ownerPersonnelId:'personnel-hr-operator',assigneeUserId:'persona-hr-operator',createdByActorId:'actor-hr-operator',createdByUserId:'persona-hr-operator',updatedByActorId:'actor-hr-operator',workflowVersion:1,version:2,
      payload:{direction:'outgoing',body:'با احترام؛ در پاسخ به استعلام آن اداره، فهرست اطلاعات مورد درخواست بررسی و با سوابق ثبت‌شده تطبیق داده شد. متن حاضر جهت بازبینی نهایی و اعلام مجوز ارسال ارائه می‌شود.',recipientUserIds:[],externalParty:'اداره کل امور مالیاتی تهران',attachment:null,reviewRequestedByUserId:'persona-hr-operator'},
      createdAt:'2026-08-24T07:50:00.000Z',updatedAt:'2026-08-24T08:35:00.000Z',
    },
    {
      id:'letter-sample-approved-supplier',moduleId:'letter',domain:'letter',trackingCode:'LTR-1405-0006',title:'پاسخ تأییدشده به درخواست تأمین‌کننده',
      description:'پاسخ آماده ارسال درباره زمان‌بندی تحویل و مدارک تسویه تأمین‌کننده.',status:'approved_for_send',priority:'normal',companyId:COMPANY_ID,
      unitId:'unit-management',ownerPersonnelId:'personnel-admin',assigneeUserId:'persona-product-owner',createdByActorId:'actor-product-owner',createdByUserId:'persona-product-owner',updatedByActorId:'actor-system-admin',workflowVersion:1,version:3,
      payload:{direction:'outgoing',body:'با سلام؛ برنامه تحویل پیشنهادی مورد تأیید قرار گرفت. لطفاً اصل فاکتور، رسید تحویل و اطلاعات حساب حقوقی را همراه محموله ارائه کنید تا فرایند تطبیق و تسویه بدون وقفه انجام شود.',recipientUserIds:[],externalParty:'شرکت تأمین گستر پارس',attachment:null,reviewRequestedByUserId:'persona-product-owner',approvedByUserId:'persona-system-admin'},
      createdAt:'2026-08-25T06:20:00.000Z',updatedAt:'2026-08-25T09:10:00.000Z',
    },
  ];
  const formalLetterRouting: Record<string,{recipientUnitIds:string[];senderUnitId:string;senderUnitName:string}> = {
    'letter-sample-incoming-bank': {recipientUnitIds:['unit-management','unit-finance'],senderUnitId:'unit-management',senderUnitName:'مدیریت'},
    'letter-sample-outgoing-support': {recipientUnitIds:[],senderUnitId:'unit-management',senderUnitName:'مدیریت'},
    'letter-sample-internal-performance': {recipientUnitIds:['unit-management'],senderUnitId:'unit-human-resources',senderUnitName:'منابع انسانی'},
    'letter-sample-draft-archive': {recipientUnitIds:['unit-management','unit-human-resources'],senderUnitId:'unit-management',senderUnitName:'مدیریت'},
    'letter-sample-review-tax': {recipientUnitIds:[],senderUnitId:'unit-human-resources',senderUnitName:'منابع انسانی'},
    'letter-sample-approved-supplier': {recipientUnitIds:[],senderUnitId:'unit-management',senderUnitName:'مدیریت'},
  };
  for (const record of result.letters as OperationalRecord[]) {
    const routing=formalLetterRouting[record.id];
    if(routing)record.payload={...record.payload,...routing};
  }
  const recruitmentModule = ERP_MODULES.find((item) => item.id === 'recruitment-case');
  if (recruitmentModule) {
    const basePayload = {
      requestedHeadcount: 1,
      employmentType: 'تمام‌وقت',
      neededDate: '1405/06/15',
      salaryRangeRial: '300000000 تا 450000000',
      requestReason: 'تکمیل ظرفیت مصوب عملیاتی واحد',
      requestChannel: 'ثبت توسط مدیر واحد',
      proxySubmission: false,
      publicationChannels: ['پیامک','اینستاگرام','تماس تلفنی'],
      consentRecorded: true,
      duplicateCheck: 'بدون رکورد همسان بر اساس موبایل و کد ملی',
      interviewType: 'حضوری',
      interviewLocation: 'دفتر سعادت‌آباد',
      digitalSignatures: [],
      accountStatus: 'هنوز ساخته نشده',
      personnelStatus: 'متقاضی',
      currentWaitingFor: 'منابع انسانی',
    };
    const makeCase = (input: Partial<OperationalRecord> & {id:string; title:string; status:string; assigneeUserId:string; payload:OperationalRecord['payload']}): OperationalRecord => ({
      id: input.id, moduleId: 'recruitment-case', domain: 'hr', trackingCode: input.trackingCode ?? `REC-1405-${input.id.slice(-3)}`,
      title: input.title, description: input.description ?? 'پرونده یکپارچه اعلام نیاز تا شروع همکاری', status: input.status, priority: input.priority ?? 'normal',
      companyId: COMPANY_ID, unitId: input.unitId ?? 'unit-sales', branchUnitId: input.branchUnitId ?? 'unit-branch-central',
      ownerPersonnelId: input.ownerPersonnelId ?? 'personnel-arman', assigneeUserId: input.assigneeUserId,
      createdByActorId: input.createdByActorId ?? 'actor-seller', createdByUserId: input.createdByUserId ?? 'persona-seller', updatedByActorId: input.updatedByActorId ?? 'actor-hr-operator',
      workflowVersion: 1, version: input.version ?? 1, payload: {...basePayload, ...input.payload}, createdAt: input.createdAt ?? SEED_TIME, updatedAt: input.updatedAt ?? SEED_TIME,
    });
    result.recruitment_cases = [
      makeCase({id:'recruitment-case-001',trackingCode:'REC-1405-001',title:'اعلام نیاز کارشناس فروش شعبه سعادت‌آباد',status:'submitted',assigneeUserId:'persona-hr-operator',payload:{candidateName:'هنوز انتخاب نشده',currentWaitingFor:'کارشناس جذب منابع انسانی',qaScenario:'۱ — اعلام نیاز تازه ثبت‌شده'}}),
      makeCase({id:'recruitment-case-002',trackingCode:'REC-1405-002',title:'پرونده جذب سحر محمدی — کارشناس حسابداری',status:'candidate_review',unitId:'unit-accounting',ownerPersonnelId:'personnel-advance-accounting',assigneeUserId:'persona-hr-operator',createdByActorId:'actor-hr-manager',createdByUserId:'persona-hr-manager',payload:{candidateName:'سحر محمدی',candidateMobile:'09121230021',candidateNationalId:'0041234521',candidateAccount:'حساب موقت فعال',resumeStatus:'دریافت‌شده',contactChannel:'تماس تلفنی و پیامک',currentWaitingFor:'تکمیل بررسی منابع انسانی',qaScenario:'۲ — پرونده متقاضی تکمیل و آماده دعوت'}}),
      makeCase({id:'recruitment-case-003',trackingCode:'REC-1405-003',title:'مصاحبه امیرحسین کریمی — فروشنده',status:'interview_scheduled',assigneeUserId:'persona-callcenter-a',payload:{candidateName:'امیرحسین کریمی',candidateMobile:'09121230031',candidateNationalId:'0051234531',candidateAccount:'حساب موقت فعال',resumeStatus:'تکمیل‌شده',interviewDate:'1405/06/03',interviewTime:'10:30',invitationPhoneStatus:'تأیید تلفنی',invitationSmsStatus:'ارسال و تحویل‌شده',currentWaitingFor:'ارزیاب مصاحبه',qaScenario:'۳ — دعوت حضوری و انتظار ارزیابی'}}),
      makeCase({id:'recruitment-case-004',trackingCode:'REC-1405-004',title:'شروع همکاری نازنین رضایی — فروش',status:'ready_to_start',unitId:'unit-sales',assigneeUserId:'persona-callcenter-a',createdByActorId:'actor-hr-manager',createdByUserId:'persona-hr-manager',payload:{candidateName:'نازنین رضایی',candidateMobile:'09121230041',candidateNationalId:'0061234541',candidateAccount:'آماده فعال‌سازی در تاریخ شروع',resumeStatus:'تکمیل‌شده',offerVersion:2,offerStatus:'پذیرفته و امضاشده',employmentType:'آموزشی',startDate:'1405/06/05',supervisor:'ناهید احمدی',mentor:'علی مرادی',documentsStatus:'کامل',digitalSignatures:[{actor:'نازنین رضایی',role:'متقاضی',version:2,at:'1405/05/31 14:20'}],currentWaitingFor:'تأیید آمادگی شروع توسط سرپرست',qaScenario:'۴ — پیشنهاد پذیرفته و آماده شروع'}}),
      makeCase({id:'recruitment-case-005',trackingCode:'REC-1405-005',title:'دوره آموزشی یاسین احمدی — فروشنده',status:'training',assigneeUserId:'persona-callcenter-a',payload:{candidateName:'یاسین احمدی',candidateMobile:'09121230051',candidateNationalId:'0071234551',candidateAccount:'فعال',personnelCode:'P-6105',personnelStatus:'پرسنل آموزشی',employmentType:'آموزشی',startDate:'1405/05/20',trainingStartedAt:'1405/05/20',conversionRequestedAt:'1405/05/31',conversionReason:'عملکرد مناسب و آمادگی شروع قرارداد',salaryMode:'حقوق ثابت + پورسانت',monthlyFixedSalaryRial:'300000000',commissionPercent:'8',commissionBasis:'وصول فاکتور',digitalSignatures:[{actor:'یاسین احمدی',role:'پرسنل',version:1,at:'1405/05/19 16:05'},{actor:'مریم توکلی',role:'منابع انسانی',version:1,at:'1405/05/19 16:20'}],currentWaitingFor:'بررسی تبدیل آموزشی به قراردادی',qaScenario:'۵ — درخواست تبدیل زودهنگام به قراردادی'}}),
    ];
  }
  return result;
}

export function stateLabel(workflow: WorkflowDefinition, status: string) {return workflow.stateLabels[status] ?? STATE_LABELS[status] ?? status;}
