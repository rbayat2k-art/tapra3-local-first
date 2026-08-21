import React, { useEffect, useMemo, useState } from 'react';
import {
  Customer, DeclaredPaymentStatus, ProductFulfillmentCase, SalesFinancialReviewCase,
  SalesFinancialReviewEvent, SalesFinancialSettings, SalesInvoice, SalesOverpaymentCase,
  ServiceFulfillmentCase, SystemPermission, SystemRole, User
} from '../types';
import { computeApprovedPaymentSummary } from '../utils/salesInvoice';
import {
  assignFinancialReviewCase, claimFinancialReviewCase, decideFinancialPayment,
  ensureFinancialReviewCases, releaseSuspiciousFinancialHold, returnFinancialCaseForCorrection
} from '../utils/salesFinancialReview';
import { generateFulfillmentCases } from '../utils/fulfillment';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { combinePortalDateTime, formatPortalDate, formatPortalMoney, formatPortalTime, splitPortalTimestamp } from '../utils/operationalFormat';
import { BadgeCheck, LockKeyhole, UsersRound } from 'lucide-react';

interface Props {
  salesInvoices: SalesInvoice[];
  onUpdateSalesInvoices: (value: SalesInvoice[]) => void;
  productFulfillmentCases: ProductFulfillmentCase[];
  onUpdateProductFulfillmentCases: (value: ProductFulfillmentCase[]) => void;
  serviceFulfillmentCases: ServiceFulfillmentCase[];
  onUpdateServiceFulfillmentCases: (value: ServiceFulfillmentCase[]) => void;
  customers: Customer[];
  users: User[];
  financialCases: SalesFinancialReviewCase[];
  onUpdateFinancialCases: (value: SalesFinancialReviewCase[]) => void;
  financialEvents: SalesFinancialReviewEvent[];
  onUpdateFinancialEvents: (value: SalesFinancialReviewEvent[]) => void;
  financialSettings: SalesFinancialSettings;
  onUpdateFinancialSettings: (value: SalesFinancialSettings) => void;
  overpaymentCases: SalesOverpaymentCase[];
  onUpdateOverpaymentCases: (value: SalesOverpaymentCase[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending_assignment: 'در انتظار تخصیص', assigned: 'تخصیص‌یافته', in_progress: 'در حال بررسی',
  suspicious_hold: 'توقف مشکوک', returned_for_correction: 'عودت برای اصلاح', closed: 'بسته'
};

function maskPhone(phone?: string) {
  return !phone || phone.length < 6 ? phone || '—' : `${phone.slice(0, 4)}•••${phone.slice(-2)}`;
}

export const SalesFinancialConfirmationView: React.FC<Props> = (props) => {
  const {
    salesInvoices, onUpdateSalesInvoices, productFulfillmentCases, onUpdateProductFulfillmentCases,
    serviceFulfillmentCases, onUpdateServiceFulfillmentCases, customers, users,
    financialCases, onUpdateFinancialCases, financialEvents, onUpdateFinancialEvents,
    financialSettings, onUpdateFinancialSettings, overpaymentCases, onUpdateOverpaymentCases,
    currentUser, roles, effectivePermissions, impersonatorAdmin
  } = props;
  const [forms, setForms] = useState<Record<string, { approvedAmount: string; reason: string; description: string }>>({});
  const [assignees, setAssignees] = useState<Record<string, string>>({});

  const canView = hasPermission(effectivePermissions, ['view_sales_financial_queue', 'review_invoice_financial_confirmation']);
  const canClaim = hasPermission(effectivePermissions, ['claim_sales_financial_review']);
  const canDecide = hasPermission(effectivePermissions, ['decide_sales_declared_payment', 'review_invoice_financial_confirmation']);
  const canReturn = hasPermission(effectivePermissions, ['return_sales_invoice_financial_correction']);
  const canManage = hasPermission(effectivePermissions, ['manage_sales_financial_distribution']);
  const canReleaseHold = hasPermission(effectivePermissions, ['release_sales_financial_hold']);
  const reviewers = useMemo(() => users.filter((user) => user.isActive && ['role_sales_payment_approver', 'role_sales_financial_manager'].includes(user.roleId || '')), [users]);

  useEffect(() => {
    const ensured = ensureFinancialReviewCases(salesInvoices, financialCases, new Date().toISOString(), financialSettings.distributionMode, reviewers);
    if (JSON.stringify(ensured) !== JSON.stringify(financialCases)) onUpdateFinancialCases(ensured);
  }, [salesInvoices, financialCases, financialSettings.distributionMode, reviewers, onUpdateFinancialCases]);

  if (!currentUser) return null;
  if (!canView) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-secondary)]">دسترسی کارتابل تأیید مالی فروش را ندارید.</div>;

  const actor = { effective: { id: currentUser.id, fullName: currentUser.fullName }, real: impersonatorAdmin ? { id: impersonatorAdmin.id, fullName: impersonatorAdmin.fullName } : undefined };
  const visibleCases = financialCases.filter((kase) => {
    if (canManage) return true;
    if (kase.assignedReviewerUserId === currentUser.id) return true;
    return kase.status === 'pending_assignment' && kase.distributionMode === 'shared_claim';
  });

  const persist = (bundle: {
    invoices?: SalesInvoice[]; cases?: SalesFinancialReviewCase[]; events?: SalesFinancialReviewEvent[];
    overpayments?: SalesOverpaymentCase[]; products?: ProductFulfillmentCase[]; services?: ServiceFulfillmentCase[];
    settings?: SalesFinancialSettings;
  }) => {
    const tx = storage.saveCustomerIdentityTransaction({
      salesInvoices: bundle.invoices, salesFinancialReviewCases: bundle.cases,
      salesFinancialReviewEvents: bundle.events, salesOverpaymentCases: bundle.overpayments,
      productFulfillmentCases: bundle.products, serviceFulfillmentCases: bundle.services,
      salesFinancialSettings: bundle.settings
    });
    if (tx.ok === false) { alert(`خطا در ذخیره‌سازی: ${tx.error}`); return false; }
    if (bundle.invoices) onUpdateSalesInvoices(bundle.invoices);
    if (bundle.cases) onUpdateFinancialCases(bundle.cases);
    if (bundle.events) onUpdateFinancialEvents(bundle.events);
    if (bundle.overpayments) onUpdateOverpaymentCases(bundle.overpayments);
    if (bundle.products) onUpdateProductFulfillmentCases(bundle.products);
    if (bundle.services) onUpdateServiceFulfillmentCases(bundle.services);
    if (bundle.settings) onUpdateFinancialSettings(bundle.settings);
    return true;
  };

  const replaceCase = (updated: SalesFinancialReviewCase) => financialCases.map((kase) => kase.id === updated.id ? updated : kase);

  const handleAssign = (kase: SalesFinancialReviewCase) => {
    if (!canManage) return;
    const reviewer = reviewers.find((u) => u.id === assignees[kase.id]);
    if (!reviewer) { alert('مسئول مالی را انتخاب کنید.'); return; }
    const result = assignFinancialReviewCase(kase, reviewer, actor, new Date().toISOString());
    if (result.ok === false) { alert(result.reason); return; }
    persist({ cases: replaceCase(result.case), events: [...financialEvents, result.event] });
  };

  const handleClaim = (kase: SalesFinancialReviewCase) => {
    if (!canClaim) return;
    const result = claimFinancialReviewCase(kase, actor, new Date().toISOString());
    if (result.ok === false) { alert(result.reason); return; }
    persist({ cases: replaceCase(result.case), events: [...financialEvents, result.event] });
  };

  const handleDecide = (kase: SalesFinancialReviewCase, invoice: SalesInvoice, paymentId: string, decision: Extract<DeclaredPaymentStatus, 'approved' | 'rejected' | 'needs_correction' | 'suspicious'>) => {
    if (!canDecide) return;
    const form = forms[paymentId] || { approvedAmount: '', reason: '', description: '' };
    const approvedAmount = decision === 'approved' ? Number(form.approvedAmount) || 0 : undefined;
    const nowIso = new Date().toISOString();
    const result = decideFinancialPayment(kase, invoice, paymentId, decision, approvedAmount, form.reason || undefined, actor, nowIso, overpaymentCases);
    if (result.ok === false) { alert(result.reason); return; }
    let invoices = salesInvoices.map((item) => item.id === invoice.id ? result.invoice : item);
    let products = productFulfillmentCases;
    let services = serviceFulfillmentCases;
    if (result.invoice.status === 'financial_confirmed') {
      const generated = generateFulfillmentCases(result.invoice, products, services, nowIso);
      products = [...products, ...generated.newProductCases];
      services = [...services, ...generated.newServiceCases];
      invoices = invoices.map((item) => item.id === invoice.id ? { ...result.invoice, status: 'fulfillment_in_progress' } : item);
    }
    if (persist({ invoices, cases: replaceCase(result.case), events: [...financialEvents, result.event], overpayments: result.overpayments, products, services })) {
      logAudit({ action: `sales_financial_${decision}`, effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: `${invoice.invoiceCode} — ${paymentId}` });
      setForms((prev) => ({ ...prev, [paymentId]: { approvedAmount: '', reason: '', description: '' } }));
    }
  };

  const handleReturn = (kase: SalesFinancialReviewCase, invoice: SalesInvoice, paymentId: string) => {
    if (!canReturn) return;
    const form = forms[paymentId] || { approvedAmount: '', reason: '', description: '' };
    const result = returnFinancialCaseForCorrection(kase, invoice, { reason: form.reason, description: form.description, paymentIds: [paymentId] }, actor, new Date().toISOString());
    if (result.ok === false) { alert(result.reason); return; }
    persist({ invoices: salesInvoices.map((item) => item.id === invoice.id ? result.invoice : item), cases: replaceCase(result.case), events: [...financialEvents, result.event] });
  };

  const handleRelease = (kase: SalesFinancialReviewCase, invoice: SalesInvoice, paymentId: string) => {
    if (!canReleaseHold) return;
    const reason = forms[paymentId]?.reason || '';
    const result = releaseSuspiciousFinancialHold(kase, invoice, paymentId, reason, actor, new Date().toISOString());
    if (result.ok === false) { alert(result.reason); return; }
    persist({ invoices: salesInvoices.map((item) => item.id === invoice.id ? result.invoice : item), cases: replaceCase(result.case), events: [...financialEvents, result.event] });
  };

  const changeDistribution = (mode: SalesFinancialSettings['distributionMode']) => {
    if (!canManage) return;
    const settings = { distributionMode: mode, updatedAt: new Date().toISOString(), updatedByUserId: currentUser.id, updatedByUserName: currentUser.fullName };
    persist({ settings });
  };

  return <div className="space-y-5" dir="rtl">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><BadgeCheck className="h-5 w-5" /> تأیید مالی فروش</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">هر ردیف مستقل تعیین تکلیف می‌شود؛ بستن فاکتور فقط پس از تصمیم همه ردیف‌ها و برابری دقیق مبلغ مجاز است.</p></div>
      {canManage && <label className="text-xs text-[var(--text-secondary)]">روش توزیع
        <select value={financialSettings.distributionMode} onChange={(e) => changeDistribution(e.target.value as SalesFinancialSettings['distributionMode'])} className="mt-1 block min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 text-[var(--text-primary)]">
          <option value="manual_assignment">تخصیص دستی مدیر</option><option value="shared_claim">صف مشترک و Claim</option><option value="balanced_assignment">توزیع متعادل</option>
        </select></label>}
    </header>

    {visibleCases.filter((kase) => kase.status !== 'closed' && kase.status !== 'returned_for_correction').map((kase) => {
      const invoice = salesInvoices.find((item) => item.id === kase.invoiceId);
      if (!invoice) return null;
      const customer = customers.find((item) => item.id === invoice.customerId);
      const summary = computeApprovedPaymentSummary(invoice.finalAmount, invoice.declaredPayments);
      const caseEvents = financialEvents.filter((event) => event.caseId === kase.id);
      const latestEvent = [...caseEvents].sort((a, b) => b.occurredAtIso.localeCompare(a.occurredAtIso))[0];
      const latestStamp = latestEvent
        ? { date: formatPortalDate(latestEvent.jalaliDate), time: formatPortalTime(latestEvent.timeWithSeconds) }
        : splitPortalTimestamp(kase.updatedAt);
      return <section key={kase.id} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><strong className="text-[var(--text-primary)]">{invoice.invoiceCode} — {customer?.fullName || '—'}</strong>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">{maskPhone(customer?.phone1)} | مبلغ: {formatPortalMoney(invoice.finalAmount)} | {STATUS_LABEL[kase.status]}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">آخرین اقدام: {latestEvent?.actorUserName || kase.assignedByUserName || 'سیستم'} — تاریخ: {latestStamp.date} — ساعت: {latestStamp.time}</div></div>
          <div className="flex flex-wrap gap-2 items-center">
            {canManage && ['pending_assignment', 'assigned'].includes(kase.status) && <><select value={assignees[kase.id] || kase.assignedReviewerUserId || ''} onChange={(e) => setAssignees({ ...assignees, [kase.id]: e.target.value })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 text-xs text-[var(--text-primary)]"><option value="">انتخاب مسئول</option>{reviewers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select><button onClick={() => handleAssign(kase)} className="min-h-11 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white"><UsersRound className="ml-1 inline h-4 w-4" />تخصیص</button></>}
            {canClaim && ((kase.status === 'assigned' && kase.assignedReviewerUserId === currentUser.id) || (kase.status === 'pending_assignment' && kase.distributionMode === 'shared_claim')) && <button onClick={() => handleClaim(kase)} className="min-h-11 rounded-lg bg-[var(--success)] px-3 py-2 text-xs font-bold text-white"><LockKeyhole className="ml-1 inline h-4 w-4" />دریافت پرونده</button>}
          </div>
        </div>
        {invoice.declaredPayments.filter((p) => !p.supersededByPaymentId).map((payment) => {
          const form = forms[payment.id] || { approvedAmount: String(payment.amount), reason: '', description: '' };
          const editable = kase.status === 'in_progress' && kase.assignedReviewerUserId === currentUser.id && canDecide && ['declared', 'needs_correction'].includes(payment.status);
          const paymentStamp = combinePortalDateTime(payment.date, payment.time, payment.recordedAt);
          return <div key={payment.id} className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-primary)]">
            <div className="flex flex-wrap justify-between gap-2"><span>{formatPortalMoney(payment.amount)} — تاریخ: {paymentStamp.date} — ساعت: {paymentStamp.time} — {payment.method} {payment.trackingNumber ? `— ${payment.trackingNumber}` : ''}</span><strong>{payment.status}</strong></div>
            {payment.proposedMatchConfidence !== undefined && <div className="text-[var(--primary)]">پیشنهاد تطبیق بانک: {payment.proposedMatchConfidence}% — {(payment.proposedMatchReasons || []).join('، ') || 'بدون توضیح'}</div>}
            {payment.financialDecisionReason && <div className="text-[var(--text-secondary)]">دلیل قبلی: {payment.financialDecisionReason}</div>}
            {(editable || (canReleaseHold && payment.status === 'suspicious')) && <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input type="number" value={form.approvedAmount} placeholder="مبلغ تأییدشده" onChange={(e) => setForms({ ...forms, [payment.id]: { ...form, approvedAmount: e.target.value } })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text-primary)]" />
              <input value={form.reason} placeholder="دلیل تصمیم (برای استثنا الزامی)" onChange={(e) => setForms({ ...forms, [payment.id]: { ...form, reason: e.target.value } })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text-primary)]" />
              <input value={form.description} placeholder="شرح کامل اصلاح" onChange={(e) => setForms({ ...forms, [payment.id]: { ...form, description: e.target.value } })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text-primary)]" />
            </div>}
            {editable && <div className="flex flex-wrap gap-2"><button onClick={() => handleDecide(kase, invoice, payment.id, 'approved')} className="bg-emerald-600 text-white rounded-lg px-2 py-1">تأیید</button><button onClick={() => handleDecide(kase, invoice, payment.id, 'rejected')} className="bg-red-100 text-red-700 rounded-lg px-2 py-1">رد</button><button onClick={() => handleDecide(kase, invoice, payment.id, 'needs_correction')} className="bg-amber-100 text-amber-700 rounded-lg px-2 py-1">نیاز به اصلاح</button><button onClick={() => handleDecide(kase, invoice, payment.id, 'suspicious')} className="bg-violet-100 text-violet-700 rounded-lg px-2 py-1">مشکوک/توقف</button>{canReturn && <button onClick={() => handleReturn(kase, invoice, payment.id)} className="border border-amber-500 text-amber-700 rounded-lg px-2 py-1">عودت با شرح</button>}</div>}
            {canReleaseHold && payment.status === 'suspicious' && <button onClick={() => handleRelease(kase, invoice, payment.id)} className="bg-indigo-600 text-white rounded-lg px-2 py-1">رفع توقف و بازگرداندن برای تصمیم</button>}
          </div>;
        })}
        <footer className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-secondary)]"><span>اعلامی: {formatPortalMoney(summary.declaredTotal)}</span><strong className="text-[var(--text-primary)]">تأییدشده: {formatPortalMoney(summary.approvedTotal)}</strong><span>مانده: {formatPortalMoney(summary.remainingAmount)}</span><span>مسئول: {kase.assignedReviewerUserName || 'تخصیص‌نیافته'}</span></footer>
      </section>;
    })}

    {visibleCases.filter((kase) => kase.status !== 'closed' && kase.status !== 'returned_for_correction').length === 0 && <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--text-secondary)]">پرونده‌ای در صف شما نیست.</div>}
    {canManage && overpaymentCases.filter((item) => item.status === 'open').length > 0 && <section className="rounded-xl border border-[var(--warning)] bg-[var(--surface)] p-4 text-[var(--text-primary)]"><h3 className="font-semibold text-[var(--warning)]">صف مازاد پرداخت</h3>{overpaymentCases.filter((item) => item.status === 'open').map((item) => <div key={item.id} className="mt-2 text-xs">{item.invoiceCode} — ردیف {item.paymentId} — {formatPortalMoney(item.excessAmount)} (درآمد فروش محسوب نشده)</div>)}</section>}
  </div>;
};
