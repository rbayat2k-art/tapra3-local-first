import React, { useState } from 'react';
import {
  CoordinationAttempt,
  CoordinationAttemptResult,
  CoordinationCase,
  CoordinationCaseStatus,
  CoordinationChecklistDecision,
  CoordinationChecklistKey,
  CoordinationDistributionMode,
  Customer,
  SalesInvoice,
  SystemPermission,
  SystemRole,
  User
} from '../types';
import {
  approveCoordinationCase,
  assignCoordinationCase,
  bypassCoordinationByManager,
  claimCoordinationCase,
  raiseCoordinationException,
  recordCoordinationAttempt,
  returnCoordinationCaseForCorrection,
  updateCoordinationChecklistItem
} from '../utils/coordinationCase';
import { enterFinancialConfirmation, returnForCorrection, syncInvoiceCoordinationStatus } from '../utils/salesInvoice';
import { ActorContext } from '../utils/salesPersonnelLifecycle';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { formatIsoAsJalaliDisplay } from '../utils/persianDate';
import { formatPortalDate, formatPortalMoney, formatPortalTime, splitPortalTimestamp } from '../utils/operationalFormat';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Headset, Phone, Undo2 } from 'lucide-react';
import { PersianDatePicker } from './PersianDatePicker';

interface CoordinationInboxViewProps {
  coordinationCases: CoordinationCase[];
  onUpdateCoordinationCases: (cases: CoordinationCase[]) => void;
  salesInvoices: SalesInvoice[];
  onUpdateSalesInvoices: (invoices: SalesInvoice[]) => void;
  customers: Customer[];
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const CASE_STATUS_LABELS: Record<CoordinationCaseStatus, string> = {
  pending_assignment: 'در انتظار تخصیص', assigned: 'تخصیص‌یافته', in_progress: 'در حال هماهنگی',
  callback_scheduled: 'تماس مجدد', exception: 'صف استثنا', closed: 'بسته‌شده'
};
const RESULT_LABELS: Record<CoordinationAttemptResult, string> = {
  confirmed: 'تأیید مشتری', callback_requested: 'درخواست تماس مجدد', no_answer: 'عدم پاسخ',
  mismatch_returned: 'مغایرت و عودت', customer_cancelled: 'انصراف مشتری', complaint_referred: 'ارجاع شکایت',
  escalated_to_manager: 'ارجاع به مدیر', assigned: 'تخصیص', claimed: 'شروع کار', recalled: 'پس‌گرفتن',
  manager_bypass: 'عبور مدیریتی بدون تماس'
};
const DECISION_LABELS: Record<CoordinationChecklistDecision, string> = {
  pending: 'بررسی‌نشده', confirmed: 'تأیید', mismatch: 'مغایرت', not_applicable: 'نامرتبط'
};
const MODE_LABELS: Record<CoordinationDistributionMode, string> = {
  manual_assignment: 'تخصیص دستی مدیر', shared_claim: 'مخزن مشترک با Claim', balanced_assignment: 'توزیع متوازن'
};
const TABS: CoordinationCaseStatus[] = ['pending_assignment', 'assigned', 'in_progress', 'callback_scheduled', 'exception', 'closed'];

export const CoordinationInboxView: React.FC<CoordinationInboxViewProps> = ({
  coordinationCases, onUpdateCoordinationCases, salesInvoices, onUpdateSalesInvoices, customers, users,
  currentUser, roles, effectivePermissions, impersonatorAdmin
}) => {
  const [tab, setTab] = useState<CoordinationCaseStatus>('pending_assignment');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCoordinatorId, setBulkCoordinatorId] = useState('');
  const [bulkBypassReason, setBulkBypassReason] = useState('');
  const [attemptForms, setAttemptForms] = useState<Record<string, { result: CoordinationAttemptResult; note: string; nextActionDate: string; nextActionTime: string }>>({});
  const [returnForms, setReturnForms] = useState<Record<string, { destination: 'salesperson' | 'registrar' | ''; reason: string; description: string }>>({});
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState(() => storage.getCoordinationSettings());

  const canView = hasPermission(effectivePermissions, ['view_coordination_queue']);
  const canAssign = hasPermission(effectivePermissions, ['assign_coordination_case']);
  const canClaim = hasPermission(effectivePermissions, ['claim_coordination_case']);
  const canRecordAttempt = hasPermission(effectivePermissions, ['record_coordination_attempt']);
  const canApprove = hasPermission(effectivePermissions, ['approve_coordination']);
  const canReturn = hasPermission(effectivePermissions, ['return_invoice_for_correction']);
  const canManageDistribution = hasPermission(effectivePermissions, ['manage_coordination_distribution']);
  const canBypass = hasPermission(effectivePermissions, ['bypass_coordination_without_contact']);
  const isAdminUser = currentUser?.role === 'admin';

  if (!currentUser) return null;
  if (!canView) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-secondary)]">دسترسی لازم برای مشاهدهٔ کارتابل هماهنگی را ندارید.</div>;

  const actorCtx: ActorContext = {
    effective: { id: currentUser.id, fullName: currentUser.fullName },
    real: impersonatorAdmin ? { id: impersonatorAdmin.id, fullName: impersonatorAdmin.fullName } : null
  };
  const specialists = users.filter((user) => user.isActive !== false && user.roleId === 'role_coordination_specialist');
  const visibleCases = coordinationCases.filter((kase) => {
    if (isAdminUser || canAssign) return true;
    if (kase.status === 'pending_assignment' && kase.distributionMode === 'shared_claim') return true;
    return kase.assignedCoordinatorUserId === currentUser.id;
  });
  const tabCases = visibleCases.filter((kase) => kase.status === tab).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const attempts = storage.getCoordinationAttempts();
  const selectedCases = coordinationCases.filter((kase) => selectedIds.includes(kase.id));
  const selectedTotal = selectedCases.reduce((sum, kase) => sum + (salesInvoices.find((invoice) => invoice.id === kase.invoiceId)?.finalAmount || 0), 0);

  const persist = (cases: CoordinationCase[], invoices?: SalesInvoice[], newAttempts: CoordinationAttempt[] = []): boolean => {
    const tx = storage.saveCustomerIdentityTransaction({
      coordinationCases: cases,
      coordinationAttempts: [...storage.getCoordinationAttempts(), ...newAttempts],
      ...(invoices ? { salesInvoices: invoices } : {})
    });
    if (tx.ok === false) { alert('خطا در ذخیره‌سازی: ' + tx.error); return false; }
    onUpdateCoordinationCases(cases);
    if (invoices) onUpdateSalesInvoices(invoices);
    return true;
  };
  const setErr = (caseId: string, message: string) => setErrors((current) => ({ ...current, [caseId]: message }));
  const syncInvoice = (invoice: SalesInvoice, status: 'assigned' | 'in_progress' | 'callback_scheduled') =>
    syncInvoiceCoordinationStatus(invoice, status, actorCtx.effective, formatIsoAsJalaliDisplay(new Date().toISOString()));

  const handleAssign = (kase: CoordinationCase, coordinatorId = assignSelections[kase.id]) => {
    const coordinator = specialists.find((user) => user.id === coordinatorId);
    const invoice = salesInvoices.find((candidate) => candidate.id === kase.invoiceId);
    if (!coordinator || !invoice) { setErr(kase.id, 'مسئول هماهنگی یا فاکتور مرتبط یافت نشد.'); return false; }
    const result = assignCoordinationCase(kase, coordinator, actorCtx, new Date().toISOString());
    if (result.ok === false) { setErr(kase.id, result.reason); return false; }
    const synced = syncInvoice(invoice, 'assigned');
    if (synced.ok === false) { setErr(kase.id, synced.reason); return false; }
    const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? result.case : candidate);
    const invoices = salesInvoices.map((candidate) => candidate.id === invoice.id ? synced.invoice : candidate);
    if (!persist(cases, invoices, [result.attempt])) return false;
    setErr(kase.id, '');
    logAudit({ action: 'coordination_assigned', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: `${kase.invoiceCode} → ${coordinator.fullName}` });
    return true;
  };

  const handleClaim = (kase: CoordinationCase) => {
    const invoice = salesInvoices.find((candidate) => candidate.id === kase.invoiceId);
    if (!invoice) { setErr(kase.id, 'فاکتور مرتبط یافت نشد.'); return; }
    const result = claimCoordinationCase(kase, actorCtx, new Date().toISOString());
    if (result.ok === false) { setErr(kase.id, result.reason); return; }
    const synced = syncInvoice(invoice, 'in_progress');
    if (synced.ok === false) { setErr(kase.id, synced.reason); return; }
    const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? result.case : candidate);
    const invoices = salesInvoices.map((candidate) => candidate.id === invoice.id ? synced.invoice : candidate);
    if (!persist(cases, invoices, [result.attempt])) return;
    logAudit({ action: 'coordination_claimed', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: kase.invoiceCode });
  };

  const handleChecklist = (kase: CoordinationCase, key: CoordinationChecklistKey, decision: CoordinationChecklistDecision) => {
    const noteKey = `${kase.id}:${key}`;
    const result = updateCoordinationChecklistItem(kase, key, decision, checklistNotes[noteKey] || '', actorCtx, new Date().toISOString());
    if (result.ok === false) { setErr(kase.id, result.reason); return; }
    const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? result.case : candidate);
    persist(cases);
  };

  const handleRecordAttempt = (kase: CoordinationCase) => {
    const form = attemptForms[kase.id] || { result: 'confirmed' as CoordinationAttemptResult, note: '', nextActionDate: '', nextActionTime: '' };
    if (['customer_cancelled', 'complaint_referred', 'escalated_to_manager'].includes(form.result)) {
      const result = raiseCoordinationException(kase, actorCtx, new Date().toISOString(), form.result, form.note);
      if (result.ok === false) { setErr(kase.id, result.reason); return; }
      const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? result.case : candidate);
      if (persist(cases, undefined, [result.attempt])) logAudit({ action: 'coordination_exception_raised', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: form.note });
      return;
    }
    const nextActionAt = form.nextActionDate && form.nextActionTime ? `${form.nextActionDate} - ${form.nextActionTime}:00` : undefined;
    const result = recordCoordinationAttempt(kase, actorCtx, new Date().toISOString(), form.result, { note: form.note || undefined, nextActionAt });
    if (result.ok === false) { setErr(kase.id, result.reason); return; }
    let invoices: SalesInvoice[] | undefined;
    const invoice = salesInvoices.find((candidate) => candidate.id === kase.invoiceId);
    if (invoice && result.case.status === 'callback_scheduled') {
      const synced = syncInvoice(invoice, 'callback_scheduled');
      if (synced.ok === false) { setErr(kase.id, synced.reason); return; }
      invoices = salesInvoices.map((candidate) => candidate.id === invoice.id ? synced.invoice : candidate);
    }
    const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? result.case : candidate);
    if (persist(cases, invoices, [result.attempt])) logAudit({ action: 'coordination_attempt_recorded', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: RESULT_LABELS[form.result] });
  };

  const handleApprove = (kase: CoordinationCase) => {
    const invoice = salesInvoices.find((candidate) => candidate.id === kase.invoiceId);
    if (!invoice) { setErr(kase.id, 'فاکتور مرتبط یافت نشد.'); return; }
    const result = approveCoordinationCase(kase, actorCtx, new Date().toISOString(), attempts);
    if (result.ok === false) { setErr(kase.id, result.reason); return; }
    const entered = enterFinancialConfirmation(invoice, actorCtx.effective, formatIsoAsJalaliDisplay(new Date().toISOString()), {
      caseId: result.case.id, invoiceId: invoice.id, decision: 'confirmed'
    });
    if (entered.ok === false) { setErr(kase.id, entered.reason); return; }
    const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? result.case : candidate);
    const invoices = salesInvoices.map((candidate) => candidate.id === invoice.id ? entered.invoice : candidate);
    if (persist(cases, invoices, [result.attempt])) logAudit({ action: 'coordination_approved', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: kase.invoiceCode });
  };

  const bypassOne = (kase: CoordinationCase, reason: string, baseCases = coordinationCases, baseInvoices = salesInvoices, baseAttempts: CoordinationAttempt[] = []) => {
    const invoice = baseInvoices.find((candidate) => candidate.id === kase.invoiceId);
    if (!invoice) return { ok: false as const, reason: 'فاکتور مرتبط یافت نشد.', cases: baseCases, invoices: baseInvoices, attempts: baseAttempts };
    const result = bypassCoordinationByManager(kase, actorCtx, new Date().toISOString(), reason);
    if (result.ok === false) return { ok: false as const, reason: result.reason, cases: baseCases, invoices: baseInvoices, attempts: baseAttempts };
    const entered = enterFinancialConfirmation(invoice, actorCtx.effective, formatIsoAsJalaliDisplay(new Date().toISOString()), {
      caseId: result.case.id, invoiceId: invoice.id, decision: 'manager_bypass'
    });
    if (entered.ok === false) return { ok: false as const, reason: entered.reason, cases: baseCases, invoices: baseInvoices, attempts: baseAttempts };
    return {
      ok: true as const,
      cases: baseCases.map((candidate) => candidate.id === kase.id ? result.case : candidate),
      invoices: baseInvoices.map((candidate) => candidate.id === invoice.id ? entered.invoice : candidate),
      attempts: [...baseAttempts, result.attempt]
    };
  };

  const handleBypass = (kase: CoordinationCase) => {
    const reason = prompt('دلیل عبور مدیریتی بدون تماس را وارد کنید:') || '';
    const result = bypassOne(kase, reason);
    if (result.ok === false) { setErr(kase.id, result.reason); return; }
    if (persist(result.cases, result.invoices, result.attempts)) logAudit({ action: 'coordination_manager_bypass', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: reason });
  };

  const handleReturn = (kase: CoordinationCase) => {
    const form = returnForms[kase.id];
    const invoice = salesInvoices.find((candidate) => candidate.id === kase.invoiceId);
    if (!invoice || !form?.reason.trim() || !form?.description.trim()) { setErr(kase.id, 'دلیل و شرح کامل عودت الزامی است.'); return; }
    const caseResult = returnCoordinationCaseForCorrection(kase, actorCtx, new Date().toISOString(), form.reason);
    if (caseResult.ok === false) { setErr(kase.id, caseResult.reason); return; }
    const invoiceResult = returnForCorrection(invoice, { destination: form.destination || undefined, reason: form.reason, description: form.description }, actorCtx, new Date().toISOString());
    if (invoiceResult.ok === false) { setErr(kase.id, invoiceResult.reason); return; }
    const cases = coordinationCases.map((candidate) => candidate.id === kase.id ? caseResult.case : candidate);
    const invoices = salesInvoices.map((candidate) => candidate.id === invoice.id ? invoiceResult.invoice : candidate);
    if (persist(cases, invoices, [caseResult.attempt])) logAudit({ action: 'coordination_returned', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: kase.id, details: form.reason });
  };

  const handleBulkAssign = () => {
    if (!bulkCoordinatorId) { alert('مسئول هماهنگی را انتخاب کنید.'); return; }
    const coordinator = specialists.find((user) => user.id === bulkCoordinatorId);
    if (!coordinator) { alert('مسئول هماهنگی معتبر نیست.'); return; }
    let cases = coordinationCases;
    let invoices = salesInvoices;
    const newAttempts: CoordinationAttempt[] = [];
    const failed: string[] = [];
    selectedCases.forEach((selected) => {
      const kase = cases.find((candidate) => candidate.id === selected.id) || selected;
      const invoice = invoices.find((candidate) => candidate.id === kase.invoiceId);
      if (kase.status !== 'pending_assignment' || !invoice) { failed.push(`${kase.invoiceCode}: وضعیت یا فاکتور نامعتبر`); return; }
      const assigned = assignCoordinationCase(kase, coordinator, actorCtx, new Date().toISOString());
      if (assigned.ok === false) { failed.push(`${kase.invoiceCode}: ${assigned.reason}`); return; }
      const synced = syncInvoiceCoordinationStatus(invoice, 'assigned', actorCtx.effective, formatIsoAsJalaliDisplay(new Date().toISOString()));
      if (synced.ok === false) { failed.push(`${kase.invoiceCode}: ${synced.reason}`); return; }
      cases = cases.map((candidate) => candidate.id === kase.id ? assigned.case : candidate);
      invoices = invoices.map((candidate) => candidate.id === invoice.id ? synced.invoice : candidate);
      newAttempts.push(assigned.attempt);
    });
    if (newAttempts.length > 0) persist(cases, invoices, newAttempts);
    if (failed.length > 0) alert(`برخی موارد تخصیص نیافتند:\n${failed.join('\n')}`);
    setSelectedIds([]);
  };

  const handleBulkBypass = () => {
    if (!bulkBypassReason.trim()) { alert('دلیل مشترک عبور مدیریتی الزامی است.'); return; }
    let cases = coordinationCases;
    let invoices = salesInvoices;
    let newAttempts: CoordinationAttempt[] = [];
    const failed: string[] = [];
    selectedCases.forEach((kase) => {
      const current = cases.find((candidate) => candidate.id === kase.id) || kase;
      const result = bypassOne(current, bulkBypassReason, cases, invoices, newAttempts);
      if (result.ok) { cases = result.cases; invoices = result.invoices; newAttempts = result.attempts; }
      else failed.push(`${kase.invoiceCode}: ${result.reason}`);
    });
    if (newAttempts.length > 0) persist(cases, invoices, newAttempts);
    if (failed.length > 0) alert(`برخی موارد عبور نکردند:\n${failed.join('\n')}`);
    setSelectedIds([]);
    setBulkBypassReason('');
  };

  const handleDistributionMode = (mode: CoordinationDistributionMode) => {
    const next = { distributionMode: mode, updatedAt: formatIsoAsJalaliDisplay(new Date().toISOString()), updatedByUserId: currentUser.id, updatedByUserName: currentUser.fullName };
    storage.saveCoordinationSettings(next);
    setSettings(next);
    logAudit({ action: 'coordination_distribution_changed', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: 'coordination_settings', details: MODE_LABELS[mode] });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><Headset className="h-5 w-5" /> کارتابل هماهنگی فاکتور</h2><p className="text-sm leading-6 text-[var(--text-secondary)]">پس از تأیید سرپرست و پیش از تأیید مالی؛ عبور مدیریتی با تأیید مشتری یکسان نیست.</p></div>

      {canManageDistribution && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><span className="text-sm font-semibold text-[var(--text-primary)]">روش توزیع پرونده‌های جدید:</span><select value={settings.distributionMode} onChange={(event) => handleDistributionMode(event.target.value as CoordinationDistributionMode)} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]">{Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}

      <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">{TABS.map((status) => <button key={status} onClick={() => setTab(status)} className={`min-h-11 rounded px-3 py-2 text-xs font-bold ${tab === status ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>{CASE_STATUS_LABELS[status]} ({visibleCases.filter((kase) => kase.status === status).length})</button>)}</div>

      {canAssign && selectedIds.length > 0 && <div className="space-y-2 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)] p-3"><div className="text-sm font-semibold text-[var(--text-primary)]">انتخاب‌شده: {selectedIds.length} فاکتور — جمع مبلغ {formatPortalMoney(selectedTotal)}</div><div className="flex flex-wrap gap-2"><select value={bulkCoordinatorId} onChange={(event) => setBulkCoordinatorId(event.target.value)} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"><option value="">مسئول برای تخصیص گروهی</option>{specialists.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select><button onClick={handleBulkAssign} className="min-h-11 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white">تخصیص گروهی</button>{canBypass && <><input value={bulkBypassReason} onChange={(event) => setBulkBypassReason(event.target.value)} placeholder="دلیل مشترک عبور بدون تماس" className="min-h-11 min-w-[220px] flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"/><button onClick={handleBulkBypass} className="min-h-11 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white">عبور گروهی به مالی</button></>}</div></div>}

      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {tabCases.length === 0 && <div className="p-6 text-center text-[var(--text-muted)]">پرونده‌ای در این وضعیت نیست.</div>}
        {tabCases.map((kase) => {
          const invoice = salesInvoices.find((candidate) => candidate.id === kase.invoiceId);
          const customer = customers.find((candidate) => candidate.id === kase.customerId);
          const mine = kase.assignedCoordinatorUserId === currentUser.id;
          const activeForMe = mine && ['in_progress', 'callback_scheduled'].includes(kase.status);
          const form = attemptForms[kase.id] || { result: 'confirmed' as CoordinationAttemptResult, note: '', nextActionDate: '', nextActionTime: '' };
          const returnForm = returnForms[kase.id] || { destination: '' as const, reason: '', description: '' };
          const caseAttempts = attempts.filter((attempt) => attempt.caseId === kase.id);
          const latestAttempt = [...caseAttempts].sort((a, b) => b.occurredAtIso.localeCompare(a.occurredAtIso))[0];
          const latestStamp = latestAttempt
            ? { date: formatPortalDate(latestAttempt.jalaliDate), time: formatPortalTime(latestAttempt.timeWithSeconds) }
            : splitPortalTimestamp(kase.updatedAt);
          return <div key={kase.id} className="p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2"><div className="flex items-start gap-2">{canAssign && kase.status !== 'closed' && <input type="checkbox" checked={selectedIds.includes(kase.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, kase.id] : selectedIds.filter((id) => id !== kase.id))}/>}<div><div className="font-semibold text-[var(--text-primary)]">{kase.invoiceCode} — {customer?.fullName || kase.customerId}</div><div className="text-xs text-[var(--text-secondary)]">مبلغ: {formatPortalMoney(invoice?.finalAmount || 0)} — روش ورود: {MODE_LABELS[kase.distributionMode]}{kase.assignedCoordinatorUserName ? ` — مسئول: ${kase.assignedCoordinatorUserName}` : ''}</div><div className="mt-1 text-xs text-[var(--text-muted)]">آخرین اقدام: {latestAttempt?.actorUserName || kase.assignedByUserName || 'سیستم'} — تاریخ: {latestStamp.date} — ساعت: {latestStamp.time}</div></div></div><span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--text-secondary)]">{CASE_STATUS_LABELS[kase.status]}</span></div>
            {errors[kase.id] && <div className="rounded-lg bg-[var(--danger-soft)] p-2 text-xs text-[var(--danger)]">{errors[kase.id]}</div>}
            <div className="flex gap-2 flex-wrap">
              {kase.status === 'pending_assignment' && canAssign && <><select value={assignSelections[kase.id] || ''} onChange={(event) => setAssignSelections({ ...assignSelections, [kase.id]: event.target.value })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"><option value="">انتخاب مسئول</option>{specialists.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select><button onClick={() => handleAssign(kase)} className="min-h-11 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white">تخصیص</button></>}
              {((kase.status === 'assigned' && mine) || (kase.status === 'pending_assignment' && kase.distributionMode === 'shared_claim')) && canClaim && <button onClick={() => handleClaim(kase)} className="rounded-lg bg-sky-600 text-white px-3 py-2 text-xs flex gap-1"><Phone className="w-4 h-4"/> شروع کار</button>}
              {canBypass && !['closed', 'exception'].includes(kase.status) && <button onClick={() => handleBypass(kase)} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs">عبور مدیریتی بدون تماس</button>}
              <button onClick={() => setExpandedId(expandedId === kase.id ? null : kase.id)} className="flex min-h-11 gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">{expandedId === kase.id ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>} جزئیات و Timeline</button>
            </div>

            {expandedId === kase.id && <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">چک‌لیست هماهنگی</div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{kase.checklist.map((item) => { const noteKey = `${kase.id}:${item.key}`; return <div key={item.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"><div className="text-xs font-medium text-[var(--text-primary)]">{item.label}{item.required ? ' *' : ''}</div><div className="mt-1 flex gap-1"><select disabled={!activeForMe} value={item.decision} onChange={(event) => handleChecklist(kase, item.key, event.target.value as CoordinationChecklistDecision)} className="min-h-11 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1 py-1 text-xs text-[var(--text-primary)]">{Object.entries(DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input disabled={!activeForMe} value={checklistNotes[noteKey] ?? item.note ?? ''} onChange={(event) => setChecklistNotes({ ...checklistNotes, [noteKey]: event.target.value })} placeholder="توضیح" className="min-h-11 flex-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"/></div></div>; })}</div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">Timeline</div>{caseAttempts.length === 0 ? <div className="text-xs text-[var(--text-muted)]">هنوز اقدامی ثبت نشده.</div> : caseAttempts.map((attempt) => <div key={attempt.id} className="text-xs text-[var(--text-secondary)]">تاریخ: {formatPortalDate(attempt.jalaliDate)} — ساعت: {formatPortalTime(attempt.timeWithSeconds)} — {attempt.actorUserName}: {RESULT_LABELS[attempt.result]}{attempt.note ? ` — ${attempt.note}` : ''}{attempt.structuredReason ? ` — ${attempt.structuredReason}` : ''}</div>)}
            </div>}

            {activeForMe && <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              {canRecordAttempt && <div className="flex flex-wrap gap-2"><select value={form.result} onChange={(event) => setAttemptForms({ ...attemptForms, [kase.id]: { ...form, result: event.target.value as CoordinationAttemptResult } })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]">{(['confirmed', 'callback_requested', 'no_answer', 'customer_cancelled', 'complaint_referred', 'escalated_to_manager'] as CoordinationAttemptResult[]).map((result) => <option key={result} value={result}>{RESULT_LABELS[result]}</option>)}</select><input value={form.note} onChange={(event) => setAttemptForms({ ...attemptForms, [kase.id]: { ...form, note: event.target.value } })} placeholder="یادداشت/شرح" className="min-h-11 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"/>{['callback_requested', 'no_answer'].includes(form.result) && <><PersianDatePicker value={form.nextActionDate} onChange={(value) => setAttemptForms({ ...attemptForms, [kase.id]: { ...form, nextActionDate: value } })} placeholder="تاریخ تماس بعدی"/><input type="time" step="60" value={form.nextActionTime} onChange={(event) => setAttemptForms({ ...attemptForms, [kase.id]: { ...form, nextActionTime: event.target.value } })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"/></>}<button onClick={() => handleRecordAttempt(kase)} className="min-h-11 rounded-lg bg-[var(--text-primary)] px-3 py-2 text-xs font-bold text-[var(--surface)]">ثبت نتیجه</button></div>}
              {canApprove && <button onClick={() => handleApprove(kase)} className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs flex gap-1"><Check className="w-4 h-4"/> تأیید هماهنگی و ارسال به مالی</button>}
            </div>}

            {canReturn && (activeForMe || (canAssign && kase.status === 'exception')) && <div className="space-y-2 rounded-lg bg-[var(--danger-soft)] p-3"><div className="text-xs font-semibold text-[var(--danger)]">عودت رسمی برای اصلاح</div><div className="flex flex-wrap gap-2"><select value={returnForm.destination} onChange={(event) => setReturnForms({ ...returnForms, [kase.id]: { ...returnForm, destination: event.target.value as 'salesperson' | 'registrar' | '' } })} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"><option value="">مقصد پیش‌فرض مسیر</option><option value="salesperson">فروشنده</option><option value="registrar">واحد ثبت</option></select><input value={returnForm.reason} onChange={(event) => setReturnForms({ ...returnForms, [kase.id]: { ...returnForm, reason: event.target.value } })} placeholder="دلیل *" className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"/><input value={returnForm.description} onChange={(event) => setReturnForms({ ...returnForms, [kase.id]: { ...returnForm, description: event.target.value } })} placeholder="شرح کامل *" className="min-h-11 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[var(--text-primary)]"/><button onClick={() => handleReturn(kase)} className="flex min-h-11 gap-1 rounded-lg bg-[var(--danger)] px-3 py-2 text-xs font-bold text-white"><Undo2 className="w-4 h-4"/> عودت</button></div></div>}
            {kase.status === 'exception' && <div className="flex gap-1 text-xs text-[var(--danger)]"><AlertTriangle className="w-4 h-4"/> توقف در صف استثنا؛ عبور مستقیم به مالی مجاز نیست.</div>}
            {kase.status === 'closed' && (() => { const stamp = splitPortalTimestamp(kase.closedAt); return <div className="text-xs text-[var(--text-secondary)]">نتیجه: {kase.closedResult ? RESULT_LABELS[kase.closedResult] : '—'} — تاریخ: {stamp.date} — ساعت: {stamp.time}</div>; })()}
          </div>;
        })}
      </div>
    </div>
  );
};
