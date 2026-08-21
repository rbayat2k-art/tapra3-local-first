import React from 'react';
import {
  PaymentRequest, User, Company, CostCenter, SystemRole, SystemPermission, Lead,
  SalesInvoice, CoordinationCase, SalesFinancialReviewCase, SalesOverpaymentCase
} from '../types';
import { formatRial } from '../utils/numberToWords';
import { formatPortalMoney } from '../utils/operationalFormat';
import { storage } from '../utils/storage';
import { TAB_DEFINITIONS } from './TabBar';
import { SectionCard, StatusBadge, type StatusTone } from './ui/primitives';
import {
  CreditCard, CheckCircle2, Clock, RefreshCw,
  Building, MapPin, PlusCircle, Archive, ArrowUpRight,
  TrendingUp, Layers, Users, Sparkles, ShieldCheck, XCircle, Zap,
  PhoneCall, FileSpreadsheet, Headset, BadgeCheck, AlertTriangle
} from 'lucide-react';
import {
  getOwnedOpenLeads,
  getVisibleCoordinationCases,
  getVisibleSalesFinancialCases,
  getVisibleSalesInvoices,
  resolveDashboardDomain,
  type DashboardDomain
} from '../utils/dashboardProfile';

interface DashboardViewProps {
  requests: PaymentRequest[];
  currentUser: User | null;
  companies: Company[];
  costCenters: CostCenter[];
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  leads: Lead[];
  salesInvoices: SalesInvoice[];
  coordinationCases: CoordinationCase[];
  financialCases: SalesFinancialReviewCase[];
  overpaymentCases: SalesOverpaymentCase[];
  onOpenNewRequest: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectRequest: (req: PaymentRequest) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  requests,
  currentUser,
  companies,
  costCenters,
  roles,
  effectivePermissions,
  leads,
  salesInvoices,
  coordinationCases,
  financialCases,
  overpaymentCases,
  onOpenNewRequest,
  onNavigateTab,
  onSelectRequest
}) => {
  const dashboardDomain = resolveDashboardDomain(currentUser, roles, effectivePermissions);

  if (dashboardDomain !== 'treasury') {
    return (
      <OperationalDashboard
        domain={dashboardDomain}
        currentUser={currentUser}
        effectivePermissions={effectivePermissions}
        leads={leads}
        salesInvoices={salesInvoices}
        coordinationCases={coordinationCases}
        financialCases={financialCases}
        overpaymentCases={overpaymentCases}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // Filter accessible requests according to user role
  const userAccessibleRequests = requests.filter(r => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;

    if (currentUser.role === 'requestor' && !currentUser.isDualRole) {
      return r.requestorId === currentUser.id || r.requestorName === currentUser.fullName;
    }

    if (currentUser.role === 'approver' || currentUser.isDualRole) {
      const isMyOwn = r.requestorId === currentUser.id || r.requestorName === currentUser.fullName;
      const isAssigned = r.currentApproverId === currentUser.id;
      const isMyBranch = currentUser.allowedCostCenterIds?.includes(r.costCenterId) || r.costCenterId === currentUser.costCenterId;
      const isInTimeline = r.timeline?.some(t => t.actorId === currentUser.id || t.actorName === currentUser.fullName);
      return isMyOwn || isAssigned || isMyBranch || isInTimeline;
    }

    if (currentUser.role === 'treasury_executor') {
      const isMyOwn = r.requestorId === currentUser.id || r.requestorName === currentUser.fullName;
      const isAssigned = r.currentApproverId === currentUser.id;
      const isTreasuryStage = ['approved_awaiting_payment_assignment', 'approved_pending_payment', 'emergency_pending_payment', 'paid', 'completed'].includes(r.status);
      const isMyBranch = currentUser.allowedCostCenterIds?.includes(r.costCenterId) || r.costCenterId === currentUser.costCenterId;
      return isMyOwn || isAssigned || isTreasuryStage || isMyBranch;
    }

    return r.requestorId === currentUser.id || r.requestorName === currentUser.fullName;
  });

  const pendingCount = userAccessibleRequests.filter(r =>
    r.status === 'pending_approval' || r.status === 'approved_awaiting_payment_assignment' ||
    r.status === 'approved_pending_payment' || r.status === 'emergency_pending_payment'
  ).length;
  const paidRequests = userAccessibleRequests.filter(r => r.status === 'paid');
  const totalPaidAmount = paidRequests.reduce((sum, r) => sum + r.amount, 0);
  const returnedCount = userAccessibleRequests.filter(r => r.status === 'returned').length;
  const cancelledCount = userAccessibleRequests.filter(r => r.status === 'cancelled').length;
  const emergencyPendingCount = userAccessibleRequests.filter(r => r.status === 'emergency_pending_payment').length;

  // "پرکاربردترین منوهای شما" widget data — read this user's per-tab open counts
  // (recorded by App.tsx's openTab -> storage.recordTabUsage) and rank them. Only tab
  // ids still present in TAB_DEFINITIONS are shown, so a removed/renamed tab can't leave
  // a broken entry behind. Hidden entirely for a user with fewer than 3 distinct tabs
  // used so far (new users never see an empty/awkward widget).
  const tabUsageCounts = currentUser ? (storage.getTabUsage()[currentUser.id] || {}) : {};
  const topUsedTabs = Object.entries(tabUsageCounts)
    .filter(([tabId]) => !!TAB_DEFINITIONS[tabId])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tabId]) => ({ tabId, ...TAB_DEFINITIONS[tabId] }));

  // Security & Privacy: Filter cost centers based on user branch permissions
  const displayedCostCenters = costCenters.filter(cc => {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  const kpiCards: Array<{ key: string; label: string; icon: React.ElementType; tone: StatusTone; value: React.ReactNode; hint: string; onClick: () => void }> = [
    {
      key: 'pending',
      label: 'در انتظار بررسی / واریز',
      icon: Clock,
      tone: 'warning',
      value: <>{pendingCount} <span className="text-xs text-[var(--text-muted)] font-normal">درخواست</span></>,
      hint: 'نیازمند تایید یا واریز خزانه‌داری',
      onClick: () => onNavigateTab('approval_inbox')
    },
    {
      key: 'paid',
      label: 'مجموع واریزی‌های انجام شده',
      icon: CheckCircle2,
      tone: 'success',
      value: <span className="text-lg font-mono truncate block">{formatRial(totalPaidAmount)}</span>,
      hint: `${paidRequests.length} درخواست نهایی با فیش واریزی`,
      onClick: () => onNavigateTab('archive')
    },
    {
      key: 'returned',
      label: 'نیازمند اصلاح (عودت شده)',
      icon: RefreshCw,
      tone: 'warning',
      value: <>{returnedCount} <span className="text-xs text-[var(--text-muted)] font-normal">درخواست</span></>,
      hint: 'علت ایراد در جزئیات ذکر شده است',
      onClick: () => {
        const canCreate = currentUser?.role === 'admin' || (currentUser?.canCreateRequests !== false);
        onNavigateTab(canCreate ? 'my_requests' : 'approval_inbox');
      }
    },
    {
      key: 'cancelled',
      label: 'لغوشده / پرداخت فوری',
      icon: XCircle,
      tone: 'danger',
      value: (
        <span className="flex items-center gap-2">
          {cancelledCount}
          <span className="text-xs text-[var(--text-muted)] font-normal">لغوشده</span>
          {emergencyPendingCount > 0 && (
            <span className="text-xs font-bold text-[var(--warning)] flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              {emergencyPendingCount} فوری
            </span>
          )}
        </span>
      ),
      hint: 'درخواست‌های لغوشده (بایگانی می‌مانند) و در انتظار پرداخت فوری',
      onClick: () => onNavigateTab('archive')
    },
    {
      key: 'companies',
      label: 'مراکز هزینه و شرکت‌ها',
      icon: Building,
      tone: 'info',
      value: '۶ شرکت | ۸ شعبه',
      hint: 'tapra store، شرکت فروش و شعب',
      onClick: () => onNavigateTab('workflow')
    }
  ];

  return (
    <div className="space-y-6 dir-rtl">

      {/* Welcome Hero Banner — یکی از معدود نقاط مجاز Gradient برند (بند ۸ مأموریت) */}
      <div className="p-6 sm:p-8 bg-[var(--primary)] dark:bg-gradient-to-l dark:from-[var(--primary)] dark:to-[var(--primary-hover)] rounded-[14px] shadow-md relative overflow-hidden text-white">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold border border-white/20 backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>سامانه یکپارچه خزانه‌داری tapra</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              خوش آمدید، {currentUser?.fullName || 'مدیر گرامی'}
            </h2>
            <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-medium">
              مدیریت و تایید درخواست‌های پرداخت شعبه‌های فروش (سعادت آباد، پونک، مخبری، آزادی، فخار مقدم)، شرکت‌های هلدینگ و بایگانی فیش‌های واریزی خزانه‌داری.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.key}
            onClick={card.onClick}
            className="p-5 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[14px] shadow-sm transition cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[var(--text-secondary)]">{card.label}</span>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--${card.tone}) 15%, transparent)`,
                  color: `var(--${card.tone})`
                }}
              >
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-[var(--text-primary)]">{card.value}</div>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* Most-Used Menus Widget (per-user tab open counts) */}
      {topUsedTabs.length >= 3 && (
        <SectionCard title="پرکاربردترین منوهای شما">
          <div className="flex flex-wrap gap-2">
            {topUsedTabs.map(({ tabId, label, icon: Icon }) => (
              <button
                key={tabId}
                onClick={() => onNavigateTab(tabId)}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-muted)] hover:bg-[var(--primary-soft)] border border-[var(--border)] hover:border-[var(--primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--primary)] transition cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Cost Centers Breakdown Cards with Budget vs. Actual Variance */}
      <SectionCard
        title="کنترل و انحراف بودجه شعب (Budget vs. Actual Variance)"
        description="مقایسه بودجه مصوب ماهانه با مصارف واقعی و واریز شده هر شعبه (دوره جاری)"
        actions={
          <button
            onClick={() => onNavigateTab('cost_centers')}
            className="text-xs text-[var(--primary)] font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>مدیریت سقف بودجه شعب</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {displayedCostCenters.map((cc) => {
            const ccApprovedRequests = requests.filter(r => r.costCenterId === cc.id && (r.status === 'paid' || r.status === 'approved_pending_payment'));
            const usedAmount = ccApprovedRequests.reduce((sum, r) => sum + r.amount, 0);
            const budget = cc.monthlyBudget || 400000000;
            const usagePercent = Math.round((usedAmount / budget) * 100);
            const isOverBudget = usagePercent >= 100;
            const isWarningBudget = usagePercent >= 80 && usagePercent < 100;

            const tone: StatusTone = isOverBudget ? 'danger' : isWarningBudget ? 'warning' : 'success';
            const barColorVar = isOverBudget ? 'var(--danger)' : isWarningBudget ? 'var(--warning)' : 'var(--success)';

            return (
              <div key={cc.id} className="p-4 bg-[var(--surface-muted)] border border-[var(--border)] rounded-[12px] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--text-primary)] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--primary)]" />
                    {cc.name}
                  </span>
                  <StatusBadge label={`${usagePercent}% مصرف`} tone={tone} />
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full bg-[var(--border)] h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(usagePercent, 100)}%`, backgroundColor: barColorVar }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold text-[var(--text-muted)]">
                    <span>مصرف: {formatRial(usedAmount)}</span>
                    <span>بودجه: {formatRial(budget)}</span>
                  </div>
                </div>

                {isOverBudget && (
                  <div className="text-[11px] font-bold text-[var(--danger)] flex items-center gap-1 pt-1 border-t border-[var(--border)]">
                    <span>⚠️ هشدار: عبور از سقف بودجه مصوب شعبه!</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

    </div>
  );
};

interface OperationalDashboardProps {
  domain: Exclude<DashboardDomain, 'treasury'>;
  currentUser: User | null;
  effectivePermissions: SystemPermission[] | null;
  leads: Lead[];
  salesInvoices: SalesInvoice[];
  coordinationCases: CoordinationCase[];
  financialCases: SalesFinancialReviewCase[];
  overpaymentCases: SalesOverpaymentCase[];
  onNavigateTab: (tab: string) => void;
}

interface OperationalKpi {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone: StatusTone;
  tabId?: string;
}

const DOMAIN_COPY: Record<Exclude<DashboardDomain, 'treasury'>, { badge: string; title: string; description: string }> = {
  sales: {
    badge: 'میز کار فروش',
    title: 'خلاصه عملکرد فروش',
    description: 'Leadها، پیگیری‌ها و فاکتورهای قابل مشاهده در قلمرو واقعی شما'
  },
  registration: {
    badge: 'واحد ثبت',
    title: 'کارتابل ثبت فاکتور',
    description: 'فاکتورهای در انتظار بررسی ثبت و موارد عودت‌شده برای اصلاح'
  },
  coordination: {
    badge: 'واحد هماهنگی',
    title: 'خلاصه هماهنگی فاکتور',
    description: 'پرونده‌های تخصیص‌یافته، تماس مجدد و موارد نیازمند تصمیم'
  },
  sales_finance: {
    badge: 'تأیید مالی فروش',
    title: 'خلاصه بررسی واریزی‌های فروش',
    description: 'فقط پرونده‌ها و واریزی‌های فروش در قلمرو تأیید مالی شما'
  },
  generic: {
    badge: 'میز کار شخصی',
    title: 'داشبورد فعالیت‌ها',
    description: 'برای این نقش هنوز داشبورد تخصصی تعریف نشده است؛ از منوی مجاز خود استفاده کنید.'
  }
};

const OperationalDashboard: React.FC<OperationalDashboardProps> = ({
  domain,
  currentUser,
  effectivePermissions,
  leads,
  salesInvoices,
  coordinationCases,
  financialCases,
  overpaymentCases,
  onNavigateTab
}) => {
  const copy = DOMAIN_COPY[domain];
  const visibleInvoices = getVisibleSalesInvoices(salesInvoices, currentUser, effectivePermissions);
  const ownedLeads = currentUser ? getOwnedOpenLeads(leads, currentUser.id) : [];
  const visibleCoordination = getVisibleCoordinationCases(coordinationCases, currentUser, effectivePermissions);
  const visibleFinancial = getVisibleSalesFinancialCases(financialCases, currentUser, effectivePermissions);
  const hasPermission = (permission: SystemPermission) =>
    effectivePermissions === null || !!effectivePermissions?.includes(permission);

  const activeInvoiceStatuses = new Set([
    'draft', 'awaiting_registration_review', 'awaiting_supervisor_approval', 'registered',
    'partial_payment', 'awaiting_coordination_manager', 'coordination_assigned',
    'coordination_in_progress', 'coordination_callback_scheduled', 'awaiting_financial_confirmation',
    'financial_suspicious_hold', 'returned_for_correction', 'returned_to_salesperson'
  ]);
  const confirmedStatuses = new Set(['financial_confirmed', 'fulfillment_in_progress', 'completed']);

  let kpis: OperationalKpi[] = [];
  if (domain === 'sales') {
    const callbackCount = ownedLeads.filter((lead) => ['callback_scheduled', 'overdue'].includes(lead.status)).length;
    const openInvoices = visibleInvoices.filter((invoice) => activeInvoiceStatuses.has(invoice.status));
    const confirmedInvoices = visibleInvoices.filter((invoice) => confirmedStatuses.has(invoice.status));
    kpis = [
      { key: 'leads', label: 'Lead باز من', value: String(ownedLeads.length), hint: 'شماره‌های نیازمند اقدام شما', icon: PhoneCall, tone: 'info', tabId: 'my_sales_queue' },
      { key: 'callbacks', label: 'تماس مجدد / عقب‌افتاده', value: String(callbackCount), hint: 'پیگیری‌های زمان‌دار فروش', icon: Clock, tone: callbackCount ? 'warning' : 'success', tabId: 'my_sales_queue' },
      { key: 'invoices', label: 'فاکتور باز قابل مشاهده', value: String(openInvoices.length), hint: 'در قلمرو شخصی یا زنجیره فروش شما', icon: FileSpreadsheet, tone: 'info', tabId: 'sales_invoices' },
      { key: 'sales', label: 'فروش تأییدشده', value: formatPortalMoney(confirmedInvoices.reduce((sum, item) => sum + item.finalAmount, 0)), hint: `${confirmedInvoices.length} فاکتور تأیید مالی‌شده`, icon: TrendingUp, tone: 'success', tabId: 'sales_invoices' }
    ];
  } else if (domain === 'registration') {
    const registrationInvoices = salesInvoices.filter((invoice) => invoice.registeredByUserId === currentUser?.id);
    kpis = [
      { key: 'open', label: 'باز برای تکمیل', value: String(registrationInvoices.filter((item) => ['draft', 'awaiting_registration_review'].includes(item.status)).length), hint: 'پرداخت/اطلاعات ناقص یا رکورد قدیمی', icon: Clock, tone: 'warning', tabId: 'sales_invoices' },
      { key: 'supervisor', label: 'ارسال‌شده به سرپرست', value: String(registrationInvoices.filter((item) => item.status === 'awaiting_supervisor_approval').length), hint: 'بدون Gate میانی واحد ثبت', icon: FileSpreadsheet, tone: 'info', tabId: 'sales_invoices' },
      { key: 'returned', label: 'عودت برای اصلاح', value: String(registrationInvoices.filter((item) => ['returned_for_correction', 'returned_to_salesperson'].includes(item.status)).length), hint: 'نیازمند توضیح و اصلاح نسخه جدید', icon: RefreshCw, tone: 'warning', tabId: 'sales_invoices' },
      { key: 'submitted', label: 'ثبت‌شده توسط من', value: String(salesInvoices.filter((item) => item.registeredByUserId === currentUser?.id).length), hint: 'تاریخچه ثبت نیابتی شما', icon: CheckCircle2, tone: 'success', tabId: 'sales_invoices' }
    ];
  } else if (domain === 'coordination') {
    const active = visibleCoordination.filter((item) => item.status !== 'closed');
    kpis = [
      { key: 'pending', label: 'در انتظار تخصیص', value: String(active.filter((item) => item.status === 'pending_assignment').length), hint: 'بسته به روش توزیع مدیر', icon: Users, tone: 'warning', tabId: 'coordination_inbox' },
      { key: 'working', label: 'تخصیص‌یافته / در حال کار', value: String(active.filter((item) => ['assigned', 'in_progress'].includes(item.status)).length), hint: 'پرونده‌های فعال قابل مشاهده', icon: Headset, tone: 'info', tabId: 'coordination_inbox' },
      { key: 'callback', label: 'تماس مجدد', value: String(active.filter((item) => item.status === 'callback_scheduled').length), hint: 'پیگیری زمان‌دار مشتری', icon: Clock, tone: 'warning', tabId: 'coordination_inbox' },
      { key: 'exception', label: 'نیازمند تصمیم مدیر', value: String(active.filter((item) => item.status === 'exception').length), hint: 'مغایرت یا استثنای هماهنگی', icon: AlertTriangle, tone: 'danger', tabId: 'coordination_inbox' }
    ];
  } else if (domain === 'sales_finance') {
    const active = visibleFinancial.filter((item) => item.status !== 'closed');
    const canManage = hasPermission('manage_sales_financial_distribution');
    kpis = [
      { key: 'pending', label: 'در انتظار تخصیص', value: String(active.filter((item) => item.status === 'pending_assignment').length), hint: 'پرونده‌های مالی فروش', icon: Users, tone: 'warning', tabId: 'sales_financial_confirmation' },
      { key: 'working', label: 'در حال بررسی', value: String(active.filter((item) => ['assigned', 'in_progress'].includes(item.status)).length), hint: 'تخصیص‌یافته یا Claim‌شده', icon: BadgeCheck, tone: 'info', tabId: 'sales_financial_confirmation' },
      { key: 'suspicious', label: 'توقف مشکوک', value: String(active.filter((item) => item.status === 'suspicious_hold').length), hint: 'تا تعیین تکلیف مدیر متوقف است', icon: ShieldCheck, tone: 'danger', tabId: 'sales_financial_confirmation' },
      { key: 'overpayment', label: canManage ? 'اضافه‌واریزی باز' : 'عودت برای اصلاح', value: String(canManage ? overpaymentCases.filter((item) => item.status !== 'closed').length : active.filter((item) => item.status === 'returned_for_correction').length), hint: canManage ? 'فقط در سطح مدیر تأیید مالی' : 'پرونده‌های ارجاع‌شده به مبدأ', icon: canManage ? PlusCircle : RefreshCw, tone: 'warning', tabId: 'sales_financial_confirmation' }
    ];
  }

  return (
    <div className="space-y-5 sm:space-y-6 dir-rtl">
      <section className="relative overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -left-12 -top-16 h-48 w-48 rounded-full bg-[var(--primary-soft)] blur-3xl" />
        <div className="relative space-y-2">
          <StatusBadge label={copy.badge} tone="info" />
          <h2 className="text-xl font-black text-[var(--text-primary)] sm:text-2xl">
            {copy.title} — {currentUser?.fullName || 'کاربر'}
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">{copy.description}</p>
        </div>
      </section>

      {kpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => card.tabId && onNavigateTab(card.tabId)}
              className="min-h-[132px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 text-right shadow-sm transition hover:border-[var(--primary)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[var(--text-secondary)]">{card.label}</span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--primary)]">
                  <card.icon className="h-5 w-5" />
                </span>
              </div>
              <div className="break-words text-xl font-black text-[var(--text-primary)]">{card.value}</div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">{card.hint}</p>
            </button>
          ))}
        </div>
      ) : (
        <SectionCard title="داشبورد تخصصی این نقش">
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--text-secondary)]">
            اطلاعات خزانه‌داری و فروش برای این نقش نمایش داده نمی‌شود. فقط منوهایی که مجوز آن‌ها را دارید در دسترس هستند.
          </div>
        </SectionCard>
      )}
    </div>
  );
};
