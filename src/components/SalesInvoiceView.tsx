import React, { useState } from 'react';
import {
  SalesInvoice, SalesInvoiceLineItem, Customer, Lead, Product, ServiceCatalogItem, Promotion,
  User, SystemRole, SystemPermission, DeclaredPaymentMethod, SalesOrgAssignment, CoordinationAttempt, CoordinationCase
} from '../types';
import {
  buildDraftInvoice, addDeclaredPayment, returnInvoiceToSalesperson,
  computeInvoiceTotals, splitPromotionIntoLineItems, submitInvoiceToSupervisor, editInvoiceLineItems,
  approveSupervisorInvoice, resolveSupervisorApprovalGate,
  recallForCorrection, resubmitAfterCorrection, checkInvoiceVersion, RECALLABLE_STATUSES, computeApprovedPaymentSummary,
  syncInvoiceCoordinationStatus, replaceDeclaredPaymentForCorrection, evaluateSupervisorSubmissionReadiness
} from '../utils/salesInvoice';
import { assignCoordinationCase, chooseBalancedCoordinator, createCoordinationCase, recallPendingCoordinationCase } from '../utils/coordinationCase';
import { isPromotionSellable } from '../utils/catalog';
import { getSubordinateUserIds } from '../utils/salesHierarchy';
import { buildSalesHierarchySnapshot, resolveInvoiceApprover } from '../utils/salesOrgStructure';
import { applyBusinessUseLock, ActorContext } from '../utils/salesPersonnelLifecycle';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { combinePortalDateTime, formatPortalAmount, formatPortalMoney, getPortalNowTimestamp, getPortalToday, splitPortalTimestamp } from '../utils/operationalFormat';
import { Receipt, Plus, Trash2, ChevronDown, ChevronUp, Pencil, Undo2 } from 'lucide-react';

interface SalesInvoiceViewProps {
  salesInvoices: SalesInvoice[];
  onUpdateSalesInvoices: (invoices: SalesInvoice[]) => void;
  coordinationCases: CoordinationCase[];
  onUpdateCoordinationCases: (cases: CoordinationCase[]) => void;
  customers: Customer[];
  leads: Lead[];
  products: Product[];
  services: ServiceCatalogItem[];
  promotions: Promotion[];
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const STATUS_LABELS: Record<SalesInvoice['status'], string> = {
  draft: 'پیش‌نویس', awaiting_registration_review: 'در انتظار بررسی ثبت',
  awaiting_supervisor_approval: 'در انتظار تأیید سرپرست', registered: 'ثبت‌شده',
  partial_payment: 'پرداخت جزئی', awaiting_financial_confirmation: 'در انتظار تایید مالی',
  financial_suspicious_hold: 'توقف مشکوک مالی',
  returned_to_salesperson: 'عودت به فروشنده', cancelled: 'لغوشده',
  financial_confirmed: 'تایید مالی نهایی', fulfillment_in_progress: 'در حال اجرا', completed: 'تکمیل‌شده',
  awaiting_coordination_manager: 'در انتظار مدیر هماهنگی', coordination_assigned: 'هماهنگی — تخصیص‌یافته',
  coordination_in_progress: 'در حال هماهنگی', coordination_callback_scheduled: 'هماهنگی — تماس مجدد',
  returned_for_correction: 'عودت‌شده برای اصلاح'
};
const STATUS_COLORS: Record<SalesInvoice['status'], string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', awaiting_registration_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  awaiting_supervisor_approval: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  registered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', partial_payment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  awaiting_financial_confirmation: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', returned_to_salesperson: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  financial_suspicious_hold: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-500',
  financial_confirmed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', fulfillment_in_progress: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  awaiting_coordination_manager: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', coordination_assigned: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  coordination_in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', coordination_callback_scheduled: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  returned_for_correction: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
};
const SOURCE_LABELS: Record<SalesInvoiceLineItem['sourceType'], string> = {
  promotion_core: 'پروموشن', cross_sell: 'Cross-sell', manual_addition: 'دستی'
};
const EDITABLE_STATUSES: SalesInvoice['status'][] = ['draft', 'awaiting_registration_review', 'returned_to_salesperson', 'returned_for_correction'];
// بند ۲ مأموریت تکمیل فلو فاکتور: پرداخت اعلامی از صف بررسی ثبت تا پایان هماهنگی قابل ثبت است
// (نه فقط بعد از تأیید سرپرست مثل قبل) — دقیقاً همان PAYMENT_DECLARABLE_STATUSES در salesInvoice.ts.
const PAYMENT_FORM_VISIBLE_STATUSES: SalesInvoice['status'][] = [
  'draft', 'awaiting_registration_review', 'registered', 'partial_payment',
  'awaiting_coordination_manager', 'coordination_assigned', 'coordination_in_progress', 'coordination_callback_scheduled',
  'returned_for_correction'
];

// قلمرو Handler روی هر عملیات فاکتور — صرف مخفی‌شدن دکمه در UI کافی نیست، هر Handler دوباره
// همین تابع خالص را صدا می‌زند: فروشنده فقط فاکتور خودش، واحد ثبتی که خودش ثبت کرده فقط فاکتور
// خودش (کارتابل بررسی ثبت استثنای جداگانه‌ای دارد و از این تابع عبور نمی‌کند)، سرپرست فقط
// زیردرخت مجاز (territoryIds از getSubordinateUserIds)، ادمین همه. تابعی خالص و export‌شده تا
// مستقیماً (بدون رندر React) قابل تست باشد.
export function isInvoiceInUserTerritory(
  invoice: SalesInvoice, currentUser: { id: string }, isAdminUser: boolean, territoryIds: Set<string>
): boolean {
  if (isAdminUser) return true;
  if (invoice.salespersonUserId === currentUser.id) return true;
  if (invoice.registeredByUserId === currentUser.id) return true;
  return territoryIds.has(invoice.salespersonUserId);
}

// ترکیب مجوز + قلمرو در یک نقطهٔ واحد — هر Handler حساس (ارسال برای بررسی ثبت، پرداخت، بازگشت،
// ویرایش) دقیقاً همین تابع را صدا می‌زند تا رفتار همه‌جا یکسان و مستقل از UI باشد.
export function canActOnInvoice(
  invoice: SalesInvoice, currentUser: { id: string }, isAdminUser: boolean, territoryIds: Set<string>, hasRequiredPermission: boolean
): { ok: true } | { ok: false; reason: string } {
  if (!isAdminUser && !hasRequiredPermission) return { ok: false, reason: 'مجوز لازم برای این عملیات را ندارید.' };
  if (!isInvoiceInUserTerritory(invoice, currentUser, isAdminUser, territoryIds)) return { ok: false, reason: 'این فاکتور در قلمرو دسترسی شما نیست.' };
  return { ok: true };
}

export const SalesInvoiceView: React.FC<SalesInvoiceViewProps> = ({
  salesInvoices, onUpdateSalesInvoices, coordinationCases, onUpdateCoordinationCases, customers, leads, products, services, promotions, users,
  currentUser, roles, effectivePermissions, impersonatorAdmin
}) => {
  const isAdminUser = currentUser?.role === 'admin';
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [scope, setScope] = useState<'own' | 'team'>(isAdminUser ? 'team' : 'own');
  const [customerId, setCustomerId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [onBehalfSalespersonId, setOnBehalfSalespersonId] = useState('');
  const [registrationSheetImageUrl, setRegistrationSheetImageUrl] = useState('');
  const [lineItems, setLineItems] = useState<SalesInvoiceLineItem[]>([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [addType, setAddType] = useState<'goods' | 'service' | 'promotion'>('goods');
  const [addItemId, setAddItemId] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [addDiscount, setAddDiscount] = useState('0');
  const [paymentForms, setPaymentForms] = useState<Record<string, { amount: string; method: DeclaredPaymentMethod; trackingNumber: string }>>({});
  const [correctingPaymentIds, setCorrectingPaymentIds] = useState<Record<string, string>>({});
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [editingInvoiceVersion, setEditingInvoiceVersion] = useState<number | undefined>(undefined);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const canCreate = hasPermission(effectivePermissions, ['create_sales_invoice']);
  const canViewOwn = hasPermission(effectivePermissions, ['view_own_invoices']);
  const canViewTeam = hasPermission(effectivePermissions, ['view_team_invoices']);
  const canRecordPayment = hasPermission(effectivePermissions, ['record_declared_payment']);
  const canReturn = hasPermission(effectivePermissions, ['return_invoice_to_salesperson']);
  const canRegisterOnBehalf = hasPermission(effectivePermissions, ['register_invoice_on_behalf']);
  const canSubmitToSupervisor = hasPermission(effectivePermissions, ['submit_sales_invoice_to_supervisor']);
  const canEditDraft = hasPermission(effectivePermissions, ['edit_invoice_draft']);
  const canRecall = hasPermission(effectivePermissions, ['recall_invoice_for_correction']);

  if (!currentUser) return null;
  if (!canViewOwn && !canViewTeam) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-secondary)]">دسترسی لازم برای مشاهدهٔ فاکتور فروش را ندارید.</div>;

  const today = getPortalToday();
  const territoryIds = new Set(getSubordinateUserIds(currentUser, users));
  const salesRoleIds = new Set(roles.filter((r) => r.organizationalLevel !== undefined).map((r) => r.id));
  const salesUsers = users.filter((u) => u.isActive !== false && !!u.roleId && salesRoleIds.has(u.roleId));
  const visibleInvoices = salesInvoices.filter((inv) => {
    if (scope === 'own') {
      return inv.salespersonUserId === currentUser.id || inv.registeredByUserId === currentUser.id;
    }
    return canViewTeam && (isAdminUser || territoryIds.has(inv.salespersonUserId));
  });

  const myReadyLeads = leads.filter((l) => l.currentOwnerUserId === currentUser.id && l.status === 'ready_for_invoice');
  const totals = computeInvoiceTotals(lineItems);
  const actorCtx: ActorContext = {
    effective: { id: currentUser.id, fullName: currentUser.fullName },
    real: impersonatorAdmin ? { id: impersonatorAdmin.id, fullName: impersonatorAdmin.fullName } : null
  };
  const COORD_CASE_STATUS_LABELS: Record<string, string> = {
    pending_assignment: 'در انتظار تخصیص', assigned: 'تخصیص‌یافته', in_progress: 'در حال هماهنگی',
    callback_scheduled: 'تماس مجدد', exception: 'صف استثنا', closed: 'بسته‌شده'
  };

  const persist = (updated: SalesInvoice[], lockedAssignments?: SalesOrgAssignment[]): boolean => {
    const tx = storage.saveCustomerIdentityTransaction({
      salesInvoices: updated,
      ...(lockedAssignments ? { salesOrgAssignments: lockedAssignments } : {})
    });
    if (tx.ok === false) { alert('خطا در ذخیره‌سازی: ' + tx.error); return false; }
    onUpdateSalesInvoices(updated);
    return true;
  };

  // ثبت/ارسال فاکتور «استفادهٔ مؤثر» از انتصاب فعال فروشنده است (بند ۲۱ AGENTS.md، بدهی #۱
  // مأموریت جاری) — Idempotent، همیشه در همان تراکنش اتمیک با فاکتور ذخیره می‌شود.
  const computeInvoiceLock = (salespersonUserId: string, eventType: string, eventId: string): SalesOrgAssignment[] | undefined => {
    const current = storage.getSalesOrgAssignments();
    const locked = applyBusinessUseLock(current, salespersonUserId, eventType, eventId, getPortalNowTimestamp());
    return locked !== current ? locked : undefined;
  };

  const addLine = () => {
    if (addType === 'promotion') {
      const promo = promotions.find((p) => p.id === addItemId);
      if (!promo) return;
      const sellable = isPromotionSellable(promo, today);
      if (sellable.ok === false) { alert(sellable.reason); return; }
      // پروموشن ترکیبی به ردیف‌های واقعی کالا/خدمت Snapshotشده تفکیک می‌شود — هرگز یک ردیف
      // ساختگی «کالا» برای کل پروموشن.
      const splitRows = splitPromotionIntoLineItems(promo, products, services);
      setLineItems([...lineItems, ...splitRows]);
      setAddItemId('');
      return;
    }
    const source = addType === 'goods' ? products : services;
    const item = source.find((i) => i.id === addItemId);
    if (!item) return;
    if (!item.isActive) { alert('این کالا/خدمت غیرفعال است و قابل انتخاب نیست.'); return; }
    const quantity = Math.max(1, Number(addQuantity) || 1);
    const discount = Math.max(0, Number(addDiscount) || 0);
    const hasPromotionLine = lineItems.some((li) => li.sourceType === 'promotion_core');
    setLineItems([...lineItems, {
      id: `li_${Date.now()}`, itemType: addType === 'goods' ? 'goods' : 'service',
      productId: addType === 'goods' ? item.id : undefined, serviceId: addType === 'service' ? item.id : undefined,
      name: item.name, quantity, unitPrice: item.salePrice, discount, lineTotal: quantity * item.salePrice - discount,
      sourceType: hasPromotionLine ? 'cross_sell' : 'manual_addition'
    }]);
    setAddItemId(''); setAddQuantity('1'); setAddDiscount('0');
  };

  const resetForm = () => {
    setMode('list'); setEditingInvoiceId(null); setCustomerId(''); setLeadId(''); setLineItems([]); setOnBehalfSalespersonId(''); setRegistrationSheetImageUrl('');
    setEditingInvoiceVersion(undefined); setFormError('');
  };

  const startEdit = (invoice: SalesInvoice) => {
    if (!canEditDraft) { alert('مجوز ویرایش فاکتور Draft را ندارید.'); return; }
    if (!isInvoiceInUserTerritory(invoice, currentUser, isAdminUser, territoryIds)) { alert('این فاکتور در قلمرو دسترسی شما نیست.'); return; }
    setEditingInvoiceId(invoice.id);
    setEditingInvoiceVersion(invoice.version);
    setLineItems(invoice.lineItems);
    setCustomerId(invoice.customerId);
    setLeadId(invoice.leadId || '');
    setFormError('');
    setMode('create');
  };

  const handleSaveDraft = () => {
    if (editingInvoiceId) {
      const original = salesInvoices.find((i) => i.id === editingInvoiceId);
      if (!original) return;
      const editCheck = canActOnInvoice(original, currentUser, isAdminUser, territoryIds, canEditDraft);
      if (editCheck.ok === false) { setFormError(editCheck.reason); return; }
      // Optimistic Lock (بند ۱۰ مأموریت تکمیل فلو فاکتور) — اگر واحد دیگری بین بازکردن فرم و
      // ذخیره، فاکتور را تغییر داده باشد، ذخیرهٔ نسخهٔ قدیمی رد می‌شود.
      const versionCheck = checkInvoiceVersion(original, editingInvoiceVersion);
      if (versionCheck.ok === false) { setFormError(versionCheck.reason); return; }

      if (original.status === 'returned_for_correction') {
        const result = resubmitAfterCorrection(original, lineItems, actorCtx, new Date().toISOString());
        if (result.ok === false) { setFormError(result.reason); return; }
        const updated = salesInvoices.map((i) => (i.id === editingInvoiceId ? result.invoice : i));
        if (!persist(updated)) return;
        logAudit({ action: 'invoice_resubmitted', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: editingInvoiceId, details: `${original.invoiceCode} — نسخه ${result.invoice.revision}` });
        resetForm();
        return;
      }

      const result = editInvoiceLineItems(original, lineItems, { id: currentUser.id, fullName: currentUser.fullName }, getPortalNowTimestamp());
      if (result.ok === false) { setFormError(result.reason); return; }
      const updated = salesInvoices.map((i) => (i.id === editingInvoiceId ? result.invoice : i));
      if (!persist(updated)) return;
      logAudit({ action: 'sales_invoice_edited', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: editingInvoiceId, details: `${original.invoiceCode} — نسخه ${result.invoice.revision}` });
      resetForm();
      return;
    }

    const onBehalfUser = onBehalfSalespersonId ? users.find((u) => u.id === onBehalfSalespersonId) : undefined;
    if (onBehalfUser) {
      if (!canRegisterOnBehalf) { alert('مجوز ثبت فاکتور به نمایندگی فروشنده را ندارید.'); return; }
    } else if (!canCreate) {
      alert('مجوز ایجاد فاکتور فروش را ندارید.'); return;
    }
    if (!customerId) { alert('انتخاب مشتری الزامی است.'); return; }
    if (lineItems.length === 0) { alert('حداقل یک ردیف کالا/خدمت اضافه کنید.'); return; }
    const lead = leads.find((l) => l.id === leadId);
    const salespersonForSnapshotId = onBehalfUser ? onBehalfUser.id : currentUser.id;
    const snapshotResult = buildSalesHierarchySnapshot(
      salespersonForSnapshotId, storage.getSalesOrgAssignments(), users, storage.getSalesBranches(), getPortalNowTimestamp()
    );
    const draft = buildDraftInvoice({
      customerId, leadId: leadId || undefined, campaignId: lead?.campaignId,
      salespersonUserId: onBehalfUser ? onBehalfUser.id : currentUser.id,
      salespersonUserName: onBehalfUser ? onBehalfUser.fullName : currentUser.fullName,
      salesSupervisorId: onBehalfUser ? onBehalfUser.salesSupervisorId : currentUser.salesSupervisorId,
      registeredByUserId: onBehalfUser ? currentUser.id : undefined,
      registeredByUserName: onBehalfUser ? currentUser.fullName : undefined,
      salesHierarchySnapshot: snapshotResult.ok === true ? snapshotResult.snapshot : undefined,
      registrationSheetImageUrl: onBehalfUser ? registrationSheetImageUrl || undefined : undefined,
      lineItems
    }, salesInvoices, getPortalNowTimestamp());
    const updated = [draft, ...salesInvoices];
    const lockedAssignments = computeInvoiceLock(draft.salespersonUserId, 'invoice_created', draft.id);
    if (!persist(updated, lockedAssignments)) return;
    logAudit({ action: 'sales_invoice_draft_created', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: draft.id, details: draft.invoiceCode });
    resetForm();
    alert(`فاکتور ${draft.invoiceCode} به‌عنوان Draft ذخیره شد.`);
  };

  const handleSubmitToSupervisor = (invoice: SalesInvoice) => {
    const check = canActOnInvoice(invoice, currentUser, isAdminUser, territoryIds, canSubmitToSupervisor);
    if (check.ok === false) { alert(check.reason); return; }
    const result = submitInvoiceToSupervisor(invoice, { id: currentUser.id, fullName: currentUser.fullName }, getPortalNowTimestamp());
    if (result.ok === false) { setActionErrors({ ...actionErrors, [invoice.id]: result.reason }); return; }
    setActionErrors({ ...actionErrors, [invoice.id]: '' });
    const updated = salesInvoices.map((i) => (i.id === invoice.id ? result.invoice : i));
    const lockedAssignments = computeInvoiceLock(invoice.salespersonUserId, 'invoice_submitted_to_supervisor', invoice.id);
    if (!persist(updated, lockedAssignments)) return;
    logAudit({ action: 'sales_invoice_submitted_to_supervisor', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: invoice.invoiceCode });
  };

  // بند ۲۱ AGENTS.md / بند ۸ مأموریت چرخهٔ عمر نیروی فروش / بدهی #۲ مأموریت جاری: تأیید اجباری
  // سرپرست قبل از مالی — مجاز/غیرمجاز بودن (Permission+Deny+وضعیت+Snapshot+قلمرو+جانشینی+هویت
  // واقعی) یک‌جا از Gate واحد resolveSupervisorApprovalGate می‌آید؛ این Handler دیگر خودش هیچ
  // بخشی از این منطق را بازسازی نمی‌کند — فقط نتیجه را Audit و Persist می‌کند.
  const handleApproveSupervisorInvoice = (invoice: SalesInvoice) => {
    const gate = resolveSupervisorApprovalGate({
      invoice, actorUser: currentUser, isAdminUser, effectivePermissions, users, assignments: storage.getSalesOrgAssignments()
    });
    if (gate.ok === false) {
      logAudit({ action: 'sales_invoice_supervisor_approval_denied', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: `${invoice.invoiceCode} — ${gate.reason}` });
      alert(gate.reason);
      return;
    }
    const result = approveSupervisorInvoice(
      invoice,
      { approverUserId: currentUser.id, approverUserName: currentUser.fullName, snapshotSupervisorUserId: invoice.salesHierarchySnapshot?.supervisorUserId || currentUser.id, isSuccessor: gate.isSuccessor, successorReason: gate.successorReason },
      getPortalNowTimestamp()
    );
    if (result.ok === false) { alert(result.reason); return; }
    // بعد از تأیید سرپرست یک پروندهٔ هماهنگی واقعی ساخته می‌شود. هیچ موتور تصمیم‌گیر خودکاری
    // اجازهٔ تأیید/عبور به مالی ندارد؛ تنظیم صف فقط روش توزیع پرونده را تعیین می‌کند.
    const nowIso = new Date().toISOString();
    const settings = storage.getCoordinationSettings();
    let newCase = createCoordinationCase(result.invoice, nowIso, settings.distributionMode);
    let finalInvoice = result.invoice;
    const newAttempts: CoordinationAttempt[] = [];
    if (settings.distributionMode === 'balanced_assignment') {
      const specialists = users.filter((user) => user.isActive !== false && user.roleId === 'role_coordination_specialist');
      const coordinator = chooseBalancedCoordinator(specialists, coordinationCases);
      if (coordinator) {
        const assigned = assignCoordinationCase(newCase, coordinator, actorCtx, nowIso);
        if (assigned.ok) {
          newCase = assigned.case;
          newAttempts.push(assigned.attempt);
          const synced = syncInvoiceCoordinationStatus(finalInvoice, 'assigned', actorCtx.effective, getPortalNowTimestamp());
          if (synced.ok) finalInvoice = synced.invoice;
        }
      }
    }
    const updated = salesInvoices.map((i) => (i.id === invoice.id ? finalInvoice : i));
    const updatedCases = [...coordinationCases, newCase];
    const tx = storage.saveCustomerIdentityTransaction({
      salesInvoices: updated, coordinationCases: updatedCases,
      coordinationAttempts: [...storage.getCoordinationAttempts(), ...newAttempts]
    });
    if (tx.ok === false) { alert('خطا در ذخیره‌سازی: ' + tx.error); return; }
    onUpdateSalesInvoices(updated);
    // بدون این خط، State بالادستی (App.tsx) از ساخته‌شدن پروندهٔ هماهنگی بی‌خبر می‌ماند و
    // کارتابل هماهنگی تا Reload کامل صفحه پروندهٔ تازه را نمی‌بیند — دقیقاً همان الگوی onUpdateSalesInvoices.
    onUpdateCoordinationCases(updatedCases);
    logAudit({ action: 'sales_invoice_supervisor_approved', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: `${invoice.invoiceCode}${gate.isSuccessor ? ' (جانشین)' : ''}` });
    logAudit({ action: 'coordination_queued', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: newCase.id, details: `${invoice.invoiceCode} — ${settings.distributionMode}` });
  };

  // پس‌گرفتن پیش از اولین اقدام رسمی واحد بعد (بند ۴ مأموریت تکمیل فلو فاکتور) — مالک واقعی
  // (فروشنده در مسیر دیجیتال، ثبات در مسیر کاغذی) را recallForCorrection خودش هم بررسی می‌کند؛
  // اینجا فقط مجوز + وضعیت قابل‌پس‌گرفتن برای UX سریع‌تر پیش‌بررسی می‌شود.
  const handleRecall = (invoice: SalesInvoice) => {
    if (!canRecall) { setActionErrors({ ...actionErrors, [invoice.id]: 'مجوز پس‌گرفتن فاکتور را ندارید.' }); return; }
    const result = recallForCorrection(invoice, actorCtx, new Date().toISOString());
    if (result.ok === false) { setActionErrors({ ...actionErrors, [invoice.id]: result.reason }); return; }
    const updated = salesInvoices.map((i) => (i.id === invoice.id ? result.invoice : i));
    const pendingCase = coordinationCases.find((kase) => kase.invoiceId === invoice.id && kase.status === 'pending_assignment');
    if (pendingCase) {
      const recalledCase = recallPendingCoordinationCase(pendingCase, actorCtx, new Date().toISOString());
      if (recalledCase.ok === false) { setActionErrors({ ...actionErrors, [invoice.id]: recalledCase.reason }); return; }
      const updatedCases = coordinationCases.map((kase) => kase.id === pendingCase.id ? recalledCase.case : kase);
      const tx = storage.saveCustomerIdentityTransaction({
        salesInvoices: updated, coordinationCases: updatedCases,
        coordinationAttempts: [...storage.getCoordinationAttempts(), recalledCase.attempt]
      });
      if (tx.ok === false) { setActionErrors({ ...actionErrors, [invoice.id]: tx.error }); return; }
      onUpdateSalesInvoices(updated);
      onUpdateCoordinationCases(updatedCases);
    } else if (!persist(updated)) return;
    setActionErrors({ ...actionErrors, [invoice.id]: '' });
    logAudit({ action: 'invoice_recalled_for_correction', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: invoice.invoiceCode });
  };

  const handleAddPayment = (invoice: SalesInvoice) => {
    const check = canActOnInvoice(invoice, currentUser, isAdminUser, territoryIds, canRecordPayment);
    if (check.ok === false) { alert(check.reason); return; }
    const form = paymentForms[invoice.id];
    const amount = Number(form?.amount) || 0;
    if (amount <= 0) { alert('مبلغ معتبر وارد کنید.'); return; }
    const nowIso = new Date().toISOString();
    const now = getPortalNowTimestamp();
    const payment = {
      id: `pay_${Date.now()}`, amount, date: now.split(' - ')[0], time: now.split(' - ')[1], method: form?.method || 'card_to_card',
      trackingNumber: form?.trackingNumber || undefined, recordedByUserId: currentUser.id, recordedByUserName: currentUser.fullName,
      recordedAt: now, status: 'declared'
    } as const;
    const correctionTarget = correctingPaymentIds[invoice.id];
    const result = invoice.status === 'returned_for_correction' && correctionTarget
      ? replaceDeclaredPaymentForCorrection(invoice, correctionTarget, payment, actorCtx, nowIso)
      : addDeclaredPayment(invoice, payment, now);
    if (result.ok === false) { alert(result.reason); return; }
    const updated = salesInvoices.map((i) => (i.id === invoice.id ? result.invoice : i));
    if (!persist(updated)) return;
    logAudit({ action: 'declared_payment_recorded', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: formatPortalMoney(amount) });
    setPaymentForms({ ...paymentForms, [invoice.id]: { amount: '', method: 'card_to_card', trackingNumber: '' } });
    setCorrectingPaymentIds((prev) => { const next = { ...prev }; delete next[invoice.id]; return next; });
  };

  const handleReturn = (invoice: SalesInvoice) => {
    const check = canActOnInvoice(invoice, currentUser, isAdminUser, territoryIds, canReturn);
    if (check.ok === false) { alert(check.reason); return; }
    const reason = prompt('دلیل عودت فاکتور به فروشنده را وارد کنید:');
    if (!reason || !reason.trim()) return;
    const result = returnInvoiceToSalesperson(invoice, reason.trim(), { id: currentUser.id, fullName: currentUser.fullName }, getPortalNowTimestamp());
    if (result.ok === false) { alert(result.reason); return; }
    const updated = salesInvoices.map((i) => (i.id === invoice.id ? result.invoice : i));
    if (!persist(updated)) return;
    logAudit({ action: 'sales_invoice_returned', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: invoice.id, details: reason.trim() });
  };

  return (
    <div className="space-y-6 dir-rtl" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><Receipt className="w-5 h-5" /> فاکتور فروش</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">کد فاکتور از اولین ثبت هرگز تغییر نمی‌کند؛ قیمت هر ردیف Snapshot است.</p>
        </div>
        <div className="flex gap-2">
          {canViewTeam && (
            <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1">
              <button onClick={() => setScope('own')} className={`min-h-11 rounded px-3 py-1 text-sm font-bold ${scope === 'own' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>فاکتورهای من</button>
              <button onClick={() => setScope('team')} className={`min-h-11 rounded px-3 py-1 text-sm font-bold ${scope === 'team' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>{isAdminUser ? 'همهٔ فاکتورها' : 'فاکتورهای تیم'}</button>
            </div>
          )}
          {(canCreate || canRegisterOnBehalf) && mode === 'list' && (
            <button onClick={() => setMode('create')} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> فاکتور جدید
            </button>
          )}
          {mode === 'create' && <button onClick={resetForm} className="min-h-11 text-sm font-bold text-[var(--primary)]">بازگشت به لیست</button>}
        </div>
      </div>

      {mode === 'create' && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          {editingInvoiceId && (
            <div className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2">
              در حال ویرایش فاکتور {salesInvoices.find((i) => i.id === editingInvoiceId)?.invoiceCode} — کد فاکتور بدون تغییر می‌ماند؛ فقط ردیف‌ها قابل تغییرند.
            </div>
          )}
          {canRegisterOnBehalf && !editingInvoiceId && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
              <label className="text-xs text-[var(--text-secondary)]">ثبت به نمایندگی فروشنده (اختیاری — واحد ثبت)</label>
              <select value={onBehalfSalespersonId} onChange={(e) => setOnBehalfSalespersonId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="">-- ثبت با نام خودم --</option>
                {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>)}
              </select>
              </div>
              {onBehalfSalespersonId && (
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">تصویر برگه ثبتی (اختیاری، حداکثر ۱ مگابایت)</label>
                  <input type="file" accept="image/*" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) { setRegistrationSheetImageUrl(''); return; }
                    if (file.size > 1024 * 1024) { setFormError('حجم تصویر برگه نباید بیشتر از ۱ مگابایت باشد.'); event.target.value = ''; return; }
                    const reader = new FileReader();
                    reader.onload = () => setRegistrationSheetImageUrl(String(reader.result || ''));
                    reader.readAsDataURL(file);
                  }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 text-sm text-[var(--text-secondary)]" />
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!!editingInvoiceId} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-60">
              <option value="">-- انتخاب مشتری *--</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.fullName || c.id} — {c.phone1}</option>)}
            </select>
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={!!editingInvoiceId} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-60">
              <option value="">-- بدون Lead --</option>
              {myReadyLeads.map((l) => <option key={l.id} value={l.id}>{l.trackingCode}</option>)}
            </select>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">افزودن ردیف</h4>
            <div className="flex gap-2 flex-wrap items-center">
              <select value={addType} onChange={(e) => { setAddType(e.target.value as any); setAddItemId(''); }} className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm">
                <option value="goods">کالا</option><option value="service">خدمت</option><option value="promotion">پروموشن</option>
              </select>
              <select value={addItemId} onChange={(e) => setAddItemId(e.target.value)} className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm min-w-[200px]">
                <option value="">-- انتخاب --</option>
                {addType === 'goods' && products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name} — {formatPortalMoney(p.salePrice)}</option>)}
                {addType === 'service' && services.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name} — {formatPortalMoney(s.salePrice)}</option>)}
                {addType === 'promotion' && promotions.map((p) => <option key={p.id} value={p.id}>{p.title} — {formatPortalMoney(p.finalPrice)}</option>)}
              </select>
              {addType !== 'promotion' && (
                <>
                  <input type="number" placeholder="تعداد" value={addQuantity} onChange={(e) => setAddQuantity(e.target.value)} className="w-20 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm" />
                  <input type="number" placeholder="تخفیف" value={addDiscount} onChange={(e) => setAddDiscount(e.target.value)} className="w-28 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm" />
                </>
              )}
              <button onClick={addLine} className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg">افزودن</button>
            </div>

            <table className="w-full text-sm mt-3">
              <thead><tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800"><th className="py-1 text-right">نام</th><th className="py-1 text-right">تعداد</th><th className="py-1 text-right">قیمت واحد</th><th className="py-1 text-right">تخفیف</th><th className="py-1 text-right">جمع ردیف</th><th className="py-1 text-right">منشأ</th><th></th></tr></thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-slate-100 dark:border-slate-800 dark:text-slate-200">
                    <td className="py-1">{li.name}</td><td className="py-1">{li.quantity}</td>
                    <td className="py-1">{formatPortalAmount(li.unitPrice)}</td><td className="py-1">{formatPortalAmount(li.discount)}</td>
                    <td className="py-1">{formatPortalAmount(li.lineTotal)}</td>
                    <td className="py-1 text-xs text-slate-500 dark:text-slate-400">{SOURCE_LABELS[li.sourceType]}</td>
                    <td><button onClick={() => setLineItems(lineItems.filter((x) => x.id !== li.id))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 text-sm text-slate-700 dark:text-slate-200 flex gap-6">
              <span>جمع: {formatPortalMoney(totals.subtotal)}</span>
              <span>تخفیف: {formatPortalMoney(totals.totalDiscount)}</span>
              <span className="font-bold">مبلغ نهایی: {formatPortalMoney(totals.finalAmount)}</span>
            </div>
          </div>

          {formError && (
            <p className="text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{formError}</p>
          )}
          <button onClick={handleSaveDraft} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]">
            {editingInvoiceId ? (salesInvoices.find((i) => i.id === editingInvoiceId)?.status === 'returned_for_correction' ? 'اصلاح و ارسال مجدد' : 'ذخیرهٔ ویرایش') : 'ذخیرهٔ Draft'}
          </button>
        </div>
      )}

      {mode === 'list' && (
        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          {visibleInvoices.length === 0 && <div className="p-6 text-center text-[var(--text-muted)]">فاکتوری یافت نشد.</div>}
          {visibleInvoices.map((inv) => {
            const customer = customers.find((c) => c.id === inv.customerId);
            const pf = paymentForms[inv.id] || { amount: '', method: 'card_to_card' as DeclaredPaymentMethod, trackingNumber: '' };
            const canApproveThisSupervisorStep = resolveSupervisorApprovalGate({
              invoice: inv, actorUser: currentUser, isAdminUser, effectivePermissions, users, assignments: storage.getSalesOrgAssignments()
            }).ok === true;
            // بدهی #D مأموریت تکمیل چرخهٔ عمر: وقتی هیچ سرپرست/جانشین فعالی برای Snapshot این
            // فاکتور یافت نمی‌شود، پرونده نباید فقط بی‌صدا بدون دکمه بماند — باید صریحاً به‌عنوان
            // «صف استثنا» علامت بخورد تا مدیر مسئول رسیدگی متوجه شود، نه اینکه مخفی یا حذف شود.
            const noApproverFound = inv.status === 'awaiting_supervisor_approval'
              && resolveInvoiceApprover(inv.salesHierarchySnapshot, users, storage.getSalesOrgAssignments()).ok === false;
            const isExpanded = expandedInvoiceId === inv.id;
            const inTerritory = isInvoiceInUserTerritory(inv, currentUser, isAdminUser, territoryIds);
            const canEditThis = canEditDraft && EDITABLE_STATUSES.includes(inv.status) && inTerritory;
            const supervisorReadiness = evaluateSupervisorSubmissionReadiness(inv);
            const supervisorReadinessReason = 'reason' in supervisorReadiness ? supervisorReadiness.reason : '';
            const latestHistory = inv.history.at(-1);
            const latestStamp = splitPortalTimestamp(latestHistory?.occurredAtIso || latestHistory?.at || inv.updatedAt);
            return (
              <div key={inv.id} className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">{inv.invoiceCode} — {customer?.fullName || inv.customerId}{inv.revision > 1 && <span className="text-xs text-[var(--text-muted)]"> (نسخه {inv.revision})</span>}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      فروشنده: {inv.salespersonUserName}{inv.registeredByUserId && ` — ثبت توسط ${inv.registeredByUserName}`} — مبلغ نهایی: {formatPortalMoney(inv.finalAmount)} — پرداخت‌شده: {formatPortalMoney(inv.paidAmount)} — باقیمانده: {formatPortalMoney(inv.remainingAmount)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">آخرین اقدام: {latestHistory?.byUserName || 'سیستم'} — تاریخ: {latestStamp.date} — ساعت: {latestStamp.time}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[inv.status]}`}>{STATUS_LABELS[inv.status]}</span>
                </div>
                {noApproverFound && (
                  <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1 inline-block">
                    ⚠ صف استثنا — هیچ سرپرست یا جانشین فعالی برای تأیید یافت نشد؛ نیازمند رسیدگی دستی (اصلاح زنجیره یا انتصاب سرپرست جدید).
                  </p>
                )}
                {(() => {
                  const coordCase = coordinationCases.find((c) => c.invoiceId === inv.id);
                  if (!coordCase) return null;
                  return (
                    <p className="mt-1.5 text-xs text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded-lg px-2 py-1 inline-block">
                      وضعیت هماهنگی: {COORD_CASE_STATUS_LABELS[coordCase.status] || coordCase.status}
                      {coordCase.assignedCoordinatorUserName ? ` — مسئول: ${coordCase.assignedCoordinatorUserName}` : ''}
                    </p>
                  );
                })()}
                {actionErrors[inv.id] && (
                  <p className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1">{actionErrors[inv.id]}</p>
                )}

                <div className="flex gap-2 flex-wrap mt-2">
                  <button onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)} className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg min-h-[36px]">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} جزئیات
                  </button>
                  {canEditThis && (
                    <button onClick={() => startEdit(inv)} className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg min-h-[36px]">
                      <Pencil className="w-3.5 h-3.5" /> {inv.status === 'returned_for_correction' ? 'اصلاح و ارسال مجدد' : 'ویرایش'}
                    </button>
                  )}
                  {['draft', 'awaiting_registration_review'].includes(inv.status) && canSubmitToSupervisor && inTerritory && (
                    <button
                      onClick={() => handleSubmitToSupervisor(inv)}
                      disabled={!supervisorReadiness.ok}
                      title={supervisorReadiness.ok ? 'ارسال مستقیم به سرپرست مربوط به Snapshot فاکتور' : supervisorReadinessReason}
                      className="min-h-11 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >ارسال مستقیم به سرپرست</button>
                  )}
                  {canApproveThisSupervisorStep && (
                    <button onClick={() => handleApproveSupervisorInvoice(inv)} className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg min-h-[36px]">تأیید سرپرست</button>
                  )}
                  {(inv.status === 'registered' || inv.status === 'partial_payment' || inv.status === 'awaiting_financial_confirmation' || inv.status === 'awaiting_registration_review' || inv.status === 'awaiting_supervisor_approval') && canReturn && inTerritory && (
                    <button onClick={() => handleReturn(inv)} className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg min-h-[36px]">عودت به فروشنده</button>
                  )}
                  {RECALLABLE_STATUSES.includes(inv.status) && canRecall
                    && (inv.registrationMode === 'on_behalf' ? inv.registeredByUserId === currentUser.id : inv.salespersonUserId === currentUser.id) && (
                    <button onClick={() => handleRecall(inv)} className="flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-lg min-h-[36px]">
                      <Undo2 className="w-3.5 h-3.5" /> پس‌گرفتن برای اصلاح
                    </button>
                  )}
                </div>

                {PAYMENT_FORM_VISIBLE_STATUSES.includes(inv.status) && canRecordPayment && inTerritory && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                    <input type="number" placeholder="مبلغ پرداخت اعلامی" value={pf.amount} onChange={(e) => setPaymentForms({ ...paymentForms, [inv.id]: { ...pf, amount: e.target.value } })} className="border border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-sm w-40" />
                    <select value={pf.method} onChange={(e) => setPaymentForms({ ...paymentForms, [inv.id]: { ...pf, method: e.target.value as DeclaredPaymentMethod } })} className="border border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-sm">
                      <option value="card_to_card">کارت به کارت</option><option value="cash">نقدی</option><option value="gateway">درگاه (نیازمند اتصال)</option><option value="other">سایر</option>
                    </select>
                    <input placeholder="شماره پیگیری" value={pf.trackingNumber} onChange={(e) => setPaymentForms({ ...paymentForms, [inv.id]: { ...pf, trackingNumber: e.target.value } })} className="border border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-sm w-40" />
                    <button onClick={() => handleAddPayment(inv)} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg">ثبت پرداخت اعلامی</button>
                    {correctingPaymentIds[inv.id] && <span className="text-xs text-amber-700 dark:text-amber-300">جایگزین ردیف {correctingPaymentIds[inv.id]}</span>}
                    <button disabled title="این عملیات نیازمند اتصال درگاه پرداخت واقعی است — در این فاز پیاده‌سازی نشده" className="text-xs bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 px-3 py-1.5 rounded-lg cursor-not-allowed">
                      ارسال لینک پرداخت (نیازمند اتصال درگاه)
                    </button>
                  </div>
                )}

                {(inv.status === 'returned_to_salesperson' || inv.status === 'returned_for_correction') && inv.history.at(-1)?.note && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400">دلیل عودت: {inv.history.at(-1)?.note}</div>
                )}

                {isExpanded && (
                  <div className="mt-3 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-primary)]">
                    <div>
                      <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">ردیف‌های فاکتور</div>
                      <table className="w-full">
                        <thead><tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700"><th className="py-1 text-right">نام</th><th className="py-1 text-right">نوع</th><th className="py-1 text-right">منشأ</th><th className="py-1 text-right">تعداد</th><th className="py-1 text-right">قیمت واحد</th><th className="py-1 text-right">تخفیف</th><th className="py-1 text-right">جمع</th></tr></thead>
                        <tbody>
                          {inv.lineItems.map((li) => (
                            <tr key={li.id} className="border-b border-slate-100 dark:border-slate-700 dark:text-slate-300">
                              <td className="py-1">{li.name}</td>
                              <td className="py-1">{li.itemType === 'goods' ? 'کالا' : 'خدمت'}</td>
                              <td className="py-1">{SOURCE_LABELS[li.sourceType]}{li.promotionId ? ` (${li.promotionId})` : ''}</td>
                              <td className="py-1">{li.quantity}</td>
                              <td className="py-1">{formatPortalAmount(li.unitPrice)}</td>
                              <td className="py-1">{formatPortalAmount(li.discount)}</td>
                              <td className="py-1">{formatPortalAmount(li.lineTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {inv.declaredPayments.length > 0 && (() => {
                      // بند ۲/۹ مأموریت تکمیل فلو فاکتور: پرداخت اعلامی، تأییدشده، ردشده و مانده
                      // چهار مفهوم مستقل‌اند — هرگز نباید با هم مخلوط شوند.
                      const summary = computeApprovedPaymentSummary(inv.finalAmount, inv.declaredPayments);
                      const rejectedTotal = inv.declaredPayments.filter((p) => p.status === 'rejected').reduce((s, p) => s + p.amount, 0);
                      return (
                      <div>
                        <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">پرداخت‌های اعلامی و تصمیم مالی</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-slate-600 dark:text-slate-300">
                          <span>اعلامی: {formatPortalMoney(summary.declaredTotal)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">تأییدشده: {formatPortalMoney(summary.approvedTotal)}</span>
                          <span className="text-red-600 dark:text-red-400">ردشده: {formatPortalMoney(rejectedTotal)}</span>
                          <span>مانده: {formatPortalMoney(summary.remainingAmount)}</span>
                        </div>
                        <div className="space-y-1">
                          {inv.declaredPayments.map((p) => {
                            const paymentStamp = combinePortalDateTime(p.date, p.time, p.recordedAt);
                            return (
                            <div key={p.id} className="text-slate-600 dark:text-slate-300">
                              {formatPortalMoney(p.amount)} — تاریخ: {paymentStamp.date} — ساعت: {paymentStamp.time} — روش: {p.method}
                              {p.status !== 'declared' && (
                                <span> — تصمیم: {p.status === 'approved' ? `تأیید (${formatPortalMoney(p.approvedAmount)})` : p.status === 'rejected' ? 'رد' : p.status === 'needs_correction' ? 'نیاز به اصلاح' : p.status === 'suspicious' ? 'مشکوک' : 'در انتظار بررسی'} توسط {p.financialApproverUserName}{p.financialDecisionReason ? ` — ${p.financialDecisionReason}` : ''}{p.supersededByPaymentId ? ' — دارای نسخه اصلاحی' : ''}</span>
                              )}
                              {inv.status === 'returned_for_correction' && ['needs_correction', 'suspicious', 'rejected'].includes(p.status) && !p.supersededByPaymentId && <button onClick={() => { setCorrectingPaymentIds({ ...correctingPaymentIds, [inv.id]: p.id }); setPaymentForms({ ...paymentForms, [inv.id]: { amount: String(p.amount), method: p.method, trackingNumber: p.trackingNumber || '' } }); }} className="mr-2 text-indigo-600 dark:text-indigo-300 underline">اصلاح این ردیف</button>}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })()}

                    {inv.registrationSheetImageUrl && (
                      <div>
                        <div className="mb-1 font-semibold text-slate-600 dark:text-slate-300">تصویر برگه ثبتی</div>
                        <a href={inv.registrationSheetImageUrl} target="_blank" rel="noreferrer" className="inline-block text-indigo-600 underline dark:text-indigo-300">
                          مشاهده تصویر برگه
                        </a>
                      </div>
                    )}

                    <div>
                      <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">تاریخچه</div>
                      <div className="space-y-0.5">
                        {inv.history.map((h) => { const stamp = splitPortalTimestamp(h.occurredAtIso || h.at); return (
                          <div key={h.id} className="text-slate-500 dark:text-slate-400">تاریخ: {stamp.date} — ساعت: {stamp.time} — {h.byUserName}: {h.action}{h.note ? ` — ${h.note}` : ''}</div>
                        ); })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
