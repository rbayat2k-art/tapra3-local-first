import React, { useState } from 'react';
import {
  SalesInvoice, ProductFulfillmentCase, ServiceFulfillmentCase, User, SystemRole, SystemPermission,
  ServiceCoordinationOutcome, ServiceCustomerConfirmationMethod, ServiceFulfillmentEvidenceType
} from '../types';
import {
  markProductReadyForDispatch, dispatchProductCase, markProductDelivered,
  assignServiceCaseToProjectManager, assignServiceCaseToEmployee, reassignServiceCaseEmployee,
  startServiceCase, recordServiceCoordination, holdServiceCase, resumeServiceCase,
  submitServiceCaseForConfirmation, approveServiceCaseCompletion, returnServiceCaseForCorrection,
  closeServiceCase, computeInvoiceFulfillmentStatus, PRODUCT_FULFILLMENT_LABELS, SERVICE_FULFILLMENT_LABELS
} from '../utils/fulfillment';
import { getEffectiveUserPermissions, hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { getJalaliNowWithSeconds } from '../utils/persianDate';
import { CheckCircle2, Clock3, History, PackageCheck, Search, Truck, UserRoundCheck } from 'lucide-react';

interface FulfillmentCasesViewProps {
  salesInvoices: SalesInvoice[];
  onUpdateSalesInvoices: (invoices: SalesInvoice[]) => void;
  productFulfillmentCases: ProductFulfillmentCase[];
  onUpdateProductFulfillmentCases: (cases: ProductFulfillmentCase[]) => void;
  serviceFulfillmentCases: ServiceFulfillmentCase[];
  onUpdateServiceFulfillmentCases: (cases: ServiceFulfillmentCase[]) => void;
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

type CaseDraft = {
  note?: string;
  coordinationOutcome?: ServiceCoordinationOutcome;
  evidenceType?: ServiceFulfillmentEvidenceType | '';
  evidenceTitle?: string;
  evidenceReference?: string;
  confirmationMethod?: ServiceCustomerConfirmationMethod;
  confirmationReference?: string;
  employeeId?: string;
  closureTarget?: 'failed' | 'cancelled';
};

const TERMINAL_SERVICE_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const confirmationLabels: Record<ServiceCustomerConfirmationMethod, string> = {
  otp: 'کد OTP', recorded_phone: 'تماس ضبط‌شده', managerial: 'تأیید مدیریتی', not_required: 'برای این خدمت لازم نیست'
};

const coordinationLabels: Record<ServiceCoordinationOutcome, string> = {
  contacted: 'تماس موفق', callback_requested: 'درخواست تماس مجدد', unreachable: 'عدم دسترسی', documents_required: 'منتظر مدرک مشتری'
};

const evidenceLabels: Record<ServiceFulfillmentEvidenceType, string> = {
  note: 'یادداشت', document: 'مدرک', image: 'تصویر', contract: 'قرارداد', activation_code: 'کد فعال‌سازی', customer_confirmation: 'تأیید مشتری'
};

export const FulfillmentCasesView: React.FC<FulfillmentCasesViewProps> = ({
  salesInvoices, onUpdateSalesInvoices, productFulfillmentCases, onUpdateProductFulfillmentCases,
  serviceFulfillmentCases, onUpdateServiceFulfillmentCases, users, currentUser, roles, effectivePermissions, impersonatorAdmin
}) => {
  const [drafts, setDrafts] = useState<Record<string, CaseDraft>>({});
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const canDispatch = hasPermission(effectivePermissions, ['dispatch_product_case']);
  const canDeliver = hasPermission(effectivePermissions, ['deliver_product_case']);
  const canManageServiceAssignment = hasPermission(effectivePermissions, ['manage_service_fulfillment_assignment']);
  const canExecuteService = hasPermission(effectivePermissions, ['execute_service_fulfillment_case']);

  const updateDraft = (caseId: string, patch: Partial<CaseDraft>) => {
    setDrafts((current) => ({ ...current, [caseId]: { ...current[caseId], ...patch } }));
  };
  const showResult = (ok: boolean, text: string) => setFeedback({ kind: ok ? 'success' : 'error', text });

  if (!currentUser) return null;
  if (!canDispatch && !canDeliver && !canManageServiceAssignment && !canExecuteService) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">دسترسی لازم برای کارتابل اجرای کالا/خدمت را ندارید.</div>;
  }

  const actor = { id: currentUser.id, fullName: currentUser.fullName };
  const nowIso = () => new Date().toISOString();
  const employeeUsers = users.filter((user) => {
    if (user.isActive === false) return false;
    // Admin inherits every permission for emergency support, but is not an operational
    // service specialist and must never appear as a normal assignment target.
    if (user.role === 'admin') return false;
    return getEffectiveUserPermissions(user, roles).includes('execute_service_fulfillment_case');
  });

  const eligibleEmployees = (kase: ServiceFulfillmentCase) => employeeUsers.filter((employee) => {
    if (!kase.responsibleUnit || !employee.responsibleUnits?.length) return true;
    return employee.responsibleUnits.includes(kase.responsibleUnit);
  });

  const persistCases = (
    products: ProductFulfillmentCase[], services: ServiceFulfillmentCase[], touchedInvoiceId: string,
    auditAction: string, auditDetails: string
  ): boolean => {
    const invoice = salesInvoices.find((item) => item.id === touchedInvoiceId);
    let updatedInvoices = salesInvoices;
    if (invoice && (invoice.status === 'fulfillment_in_progress' || invoice.status === 'completed')) {
      const nextStatus = computeInvoiceFulfillmentStatus(touchedInvoiceId, products, services);
      if (nextStatus !== invoice.status) {
        updatedInvoices = salesInvoices.map((item) => item.id === touchedInvoiceId
          ? { ...item, status: nextStatus, updatedAt: getJalaliNowWithSeconds() }
          : item);
      }
    }
    const tx = storage.saveCustomerIdentityTransaction({
      productFulfillmentCases: products,
      serviceFulfillmentCases: services,
      salesInvoices: updatedInvoices
    });
    if (tx.ok === false) {
      showResult(false, `خطا در ذخیره‌سازی: ${tx.error}`);
      return false;
    }
    logAudit({ action: auditAction, effectiveUser: currentUser, impersonatorAdmin, roles, targetId: touchedInvoiceId, details: auditDetails });
    onUpdateProductFulfillmentCases(products);
    onUpdateServiceFulfillmentCases(services);
    if (updatedInvoices !== salesInvoices) onUpdateSalesInvoices(updatedInvoices);
    showResult(true, 'تغییر با موفقیت ثبت شد و در تاریخچه پرونده باقی ماند.');
    return true;
  };

  const replaceServiceCase = (next: ServiceFulfillmentCase, action: string, details: string) => {
    const services = serviceFulfillmentCases.map((item) => item.id === next.id ? next : item);
    if (persistCases(productFulfillmentCases, services, next.invoiceId, action, details)) {
      setDrafts((current) => ({ ...current, [next.id]: {} }));
    }
  };

  const handleReadyForDispatch = (kase: ProductFulfillmentCase) => {
    if (!canDispatch && !isAdmin) return showResult(false, 'مجوز هماهنگی ارسال کالا را ندارید.');
    const result = markProductReadyForDispatch(kase, actor, nowIso());
    if (result.ok === false) return showResult(false, result.reason);
    persistCases(productFulfillmentCases.map((item) => item.id === kase.id ? result.case : item), serviceFulfillmentCases, kase.invoiceId, 'product_case_ready_for_dispatch', kase.invoiceCode);
  };

  const handleDispatch = (kase: ProductFulfillmentCase) => {
    if (!canDispatch && !isAdmin) return showResult(false, 'مجوز ارسال کالا را ندارید.');
    const result = dispatchProductCase(kase, actor, actor, nowIso());
    if (result.ok === false) return showResult(false, result.reason);
    persistCases(productFulfillmentCases.map((item) => item.id === kase.id ? result.case : item), serviceFulfillmentCases, kase.invoiceId, 'product_case_dispatched', kase.invoiceCode);
  };

  const handleDeliver = (kase: ProductFulfillmentCase) => {
    if (!canDeliver && !isAdmin) return showResult(false, 'مجوز تحویل کالا را ندارید.');
    const result = markProductDelivered(kase, actor, actor, nowIso());
    if (result.ok === false) return showResult(false, result.reason);
    persistCases(productFulfillmentCases.map((item) => item.id === kase.id ? result.case : item), serviceFulfillmentCases, kase.invoiceId, 'product_case_delivered', kase.invoiceCode);
  };

  const handleClaimForPm = (kase: ServiceFulfillmentCase) => {
    if (!canManageServiceAssignment && !isAdmin) return showResult(false, 'مجوز دریافت پروندهٔ خدمت را ندارید.');
    const result = assignServiceCaseToProjectManager(kase, actor, actor, nowIso(), isAdmin, currentUser.responsibleUnits);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, 'service_case_assigned_to_pm', kase.invoiceCode);
  };

  const handleAssignEmployee = (kase: ServiceFulfillmentCase, reassign = false) => {
    if (!canManageServiceAssignment && !isAdmin) return showResult(false, 'مجوز ارجاع پروندهٔ خدمت را ندارید.');
    const draft = drafts[kase.id] || {};
    const employee = eligibleEmployees(kase).find((item) => item.id === draft.employeeId);
    if (!employee) return showResult(false, 'کارشناس مجاز اجرا را انتخاب کنید.');
    const result = reassign
      ? reassignServiceCaseEmployee(kase, employee, draft.note || '', actor, nowIso(), isAdmin)
      : assignServiceCaseToEmployee(kase, employee, actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, reassign ? 'service_case_reassigned' : 'service_case_assigned_to_employee', `${kase.invoiceCode} → ${employee.fullName}`);
  };

  const handleStart = (kase: ServiceFulfillmentCase) => {
    if (!canExecuteService && !isAdmin) return showResult(false, 'مجوز اجرای پروندهٔ خدمت را ندارید.');
    const result = startServiceCase(kase, actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, 'service_case_started', kase.invoiceCode);
  };

  const handleCoordination = (kase: ServiceFulfillmentCase) => {
    const draft = drafts[kase.id] || {};
    const result = recordServiceCoordination(kase, draft.coordinationOutcome || 'contacted', draft.note || '', actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, 'service_case_coordination_recorded', `${kase.invoiceCode} — ${draft.coordinationOutcome || 'contacted'}`);
  };

  const handleHold = (kase: ServiceFulfillmentCase) => {
    const result = holdServiceCase(kase, drafts[kase.id]?.note || '', actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, 'service_case_waiting', kase.invoiceCode);
  };

  const handleResume = (kase: ServiceFulfillmentCase) => {
    const result = resumeServiceCase(kase, drafts[kase.id]?.note || '', actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, 'service_case_resumed', kase.invoiceCode);
  };

  const handleSubmit = (kase: ServiceFulfillmentCase) => {
    const draft = drafts[kase.id] || {};
    const result = submitServiceCaseForConfirmation(kase, {
      completionNote: draft.note || '',
      evidenceType: draft.evidenceType || undefined,
      evidenceTitle: draft.evidenceTitle,
      evidenceReference: draft.evidenceReference,
      customerConfirmationMethod: draft.confirmationMethod || 'not_required',
      customerConfirmationReference: draft.confirmationReference
    }, actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, 'service_case_submitted_for_confirmation', kase.invoiceCode);
  };

  const handleManagerDecision = (kase: ServiceFulfillmentCase, approve: boolean) => {
    const note = drafts[kase.id]?.note || '';
    const result = approve
      ? approveServiceCaseCompletion(kase, note, actor, nowIso(), isAdmin)
      : returnServiceCaseForCorrection(kase, note, actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, approve ? 'service_case_completed' : 'service_case_returned_for_correction', kase.invoiceCode);
  };

  const handleClose = (kase: ServiceFulfillmentCase) => {
    const draft = drafts[kase.id] || {};
    const result = closeServiceCase(kase, draft.closureTarget || 'failed', draft.note || '', actor, nowIso(), isAdmin);
    if (result.ok === false) return showResult(false, result.reason);
    replaceServiceCase(result.case, `service_case_${draft.closureTarget || 'failed'}`, kase.invoiceCode);
  };

  const normalizedSearch = search.trim().toLocaleLowerCase('fa');
  const matchesSearch = (invoiceCode: string, name: string, assignee?: string) => !normalizedSearch
    || `${invoiceCode} ${name} ${assignee || ''}`.toLocaleLowerCase('fa').includes(normalizedSearch);

  const pmResponsibleUnits = currentUser.responsibleUnits;
  const isCaseInPmUnit = (kase: ServiceFulfillmentCase) => isAdmin || !pmResponsibleUnits?.length
    || !kase.responsibleUnit || pmResponsibleUnits.includes(kase.responsibleUnit);

  const visibleServiceCases = serviceFulfillmentCases.filter((kase) => {
    const terminal = TERMINAL_SERVICE_STATUSES.has(kase.status);
    if ((tab === 'closed') !== terminal) return false;
    const inScope = isAdmin
      || (canManageServiceAssignment && ((kase.status === 'pending_assignment' && isCaseInPmUnit(kase)) || kase.projectManagerUserId === currentUser.id))
      || (canExecuteService && kase.assignedEmployeeUserId === currentUser.id);
    return inScope && matchesSearch(kase.invoiceCode, kase.serviceName, kase.assignedEmployeeUserName);
  });

  const visibleProductCases = productFulfillmentCases.filter((kase) => {
    const terminal = kase.status === 'delivered';
    if ((tab === 'closed') !== terminal) return false;
    return (isAdmin || canDispatch || canDeliver) && matchesSearch(kase.invoiceCode, kase.productName, kase.assignedDeliveryUserName);
  });

  const renderTimeline = (kase: ServiceFulfillmentCase) => (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <History className="h-4 w-4" /> تاریخچه تغییرناپذیر ({kase.timeline.length})
      </summary>
      <div className="mt-3 space-y-2">
        {[...kase.timeline].reverse().map((event) => (
          <div key={event.id} className="rounded-md border-r-2 border-indigo-400 bg-white px-3 py-2 text-xs dark:bg-slate-900">
            <div className="font-medium text-slate-700 dark:text-slate-200">{event.title}</div>
            <div className="mt-1 text-slate-500 dark:text-slate-400">
              {event.jalaliDate && event.timeWithSeconds ? `${event.jalaliDate} ${event.timeWithSeconds}` : event.timestamp}
              {event.actorUserName ? ` — ${event.actorUserName}` : ''}
            </div>
            {event.note && <div className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">شرح: {event.note}</div>}
          </div>
        ))}
      </div>
    </details>
  );

  const renderManagerControls = (kase: ServiceFulfillmentCase) => {
    if (!canManageServiceAssignment && !isAdmin) return null;
    const draft = drafts[kase.id] || {};
    if (kase.status === 'pending_assignment') {
      return <button onClick={() => handleClaimForPm(kase)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">دریافت پرونده</button>;
    }
    if (kase.status === 'assigned_to_project_manager') {
      return (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select value={draft.employeeId || ''} onChange={(event) => updateDraft(kase.id, { employeeId: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
            <option value="">انتخاب کارشناس اجرا</option>
            {eligibleEmployees(kase).map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
          </select>
          <button onClick={() => handleAssignEmployee(kase)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white">ارجاع به کارشناس</button>
        </div>
      );
    }
    if (kase.status === 'awaiting_confirmation') {
      return (
        <div className="space-y-2">
          <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div>شرح اجرا: {kase.completionNote}</div>
            <div className="mt-1">تأیید مشتری: {confirmationLabels[kase.customerConfirmationMethod || 'not_required']}{kase.customerConfirmationReference ? ` — ${kase.customerConfirmationReference}` : ''}</div>
            {(kase.completionEvidence || []).map((evidence) => <div key={evidence.id} className="mt-1">مدرک: {evidence.title}{evidence.reference ? ` — ${evidence.reference}` : ''}</div>)}
          </div>
          <textarea value={draft.note || ''} onChange={(event) => updateDraft(kase.id, { note: event.target.value })} placeholder="یادداشت تأیید یا دلیل اجباری عودت" className="min-h-20 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleManagerDecision(kase, true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white">تأیید تکمیل</button>
            <button onClick={() => handleManagerDecision(kase, false)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white">عودت برای اصلاح</button>
          </div>
        </div>
      );
    }
    if (['assigned_to_employee', 'in_progress', 'waiting'].includes(kase.status)) {
      return (
        <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">تخصیص مجدد یا بستن مدیریتی</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select value={draft.employeeId || ''} onChange={(event) => updateDraft(kase.id, { employeeId: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              <option value="">کارشناس جدید</option>
              {eligibleEmployees(kase).filter((employee) => employee.id !== kase.assignedEmployeeUserId).map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
            </select>
            <select value={draft.closureTarget || 'failed'} onChange={(event) => updateDraft(kase.id, { closureTarget: event.target.value as 'failed' | 'cancelled' })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              <option value="failed">شکست اجرا</option><option value="cancelled">لغو پرونده</option>
            </select>
            <textarea value={draft.note || ''} onChange={(event) => updateDraft(kase.id, { note: event.target.value })} placeholder="دلیل اجباری" className="min-h-16 rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800 sm:col-span-2" />
            <button onClick={() => handleAssignEmployee(kase, true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white">ثبت تخصیص مجدد</button>
            <button onClick={() => handleClose(kase)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white">ثبت وضعیت پایانی</button>
          </div>
        </details>
      );
    }
    return null;
  };

  const renderEmployeeControls = (kase: ServiceFulfillmentCase) => {
    if ((!canExecuteService && !isAdmin) || (!isAdmin && kase.assignedEmployeeUserId !== currentUser.id)) return null;
    const draft = drafts[kase.id] || {};
    if (kase.status === 'assigned_to_employee') {
      return <button onClick={() => handleStart(kase)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">شروع اجرا</button>;
    }
    if (kase.status === 'waiting') {
      return (
        <div className="space-y-2">
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">دلیل انتظار: {kase.waitReason}</div>
          <textarea value={draft.note || ''} onChange={(event) => updateDraft(kase.id, { note: event.target.value })} placeholder="شرح اجباری ادامه کار" className="min-h-16 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <button onClick={() => handleResume(kase)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">ادامه اجرا</button>
        </div>
      );
    }
    if (kase.status === 'in_progress') {
      return (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={draft.coordinationOutcome || 'contacted'} onChange={(event) => updateDraft(kase.id, { coordinationOutcome: event.target.value as ServiceCoordinationOutcome })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              {Object.entries(coordinationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button onClick={() => handleCoordination(kase)} className="rounded-lg border border-blue-500 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-300">ثبت نتیجه تماس</button>
          </div>
          <textarea value={draft.note || ''} onChange={(event) => updateDraft(kase.id, { note: event.target.value })} placeholder="شرح نتیجه تماس، دلیل انتظار یا شرح نهایی اجرا (اجباری)" className="min-h-20 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={draft.evidenceType || ''} onChange={(event) => updateDraft(kase.id, { evidenceType: event.target.value as ServiceFulfillmentEvidenceType | '' })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              <option value="">بدون مدرک ضمیمه</option>
              {Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={draft.evidenceTitle || ''} onChange={(event) => updateDraft(kase.id, { evidenceTitle: event.target.value })} placeholder="عنوان مدرک" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            <input value={draft.evidenceReference || ''} onChange={(event) => updateDraft(kase.id, { evidenceReference: event.target.value })} placeholder="کد/نشانی مرجع" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            <select value={draft.confirmationMethod || 'not_required'} onChange={(event) => updateDraft(kase.id, { confirmationMethod: event.target.value as ServiceCustomerConfirmationMethod })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              {Object.entries(confirmationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={draft.confirmationReference || ''} onChange={(event) => updateDraft(kase.id, { confirmationReference: event.target.value })} placeholder="مرجع تأیید مشتری" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleHold(kase)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white">ثبت انتظار</button>
            <button onClick={() => handleSubmit(kase)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white">ارسال نتیجه برای تأیید مدیر</button>
          </div>
        </div>
      );
    }
    if (kase.status === 'awaiting_confirmation') return <div className="text-xs text-slate-500 dark:text-slate-400">نتیجه برای مدیر پروژه ارسال شده و دیگر توسط کارشناس قابل ویرایش نیست.</div>;
    return null;
  };

  return (
    <div className="space-y-5" dir="rtl">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white"><Truck className="h-5 w-5" /> اجرای کالا و خدمت</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">پرونده‌ها شخصی، دلیل‌دار و دارای تاریخچهٔ تغییرناپذیرند؛ تکمیل خدمت نیازمند تأیید مدیر مالک است.</p>
        </div>
        <label className="relative block w-full lg:w-80">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو در کد فاکتور، قلم و کارشناس" className="w-full rounded-xl border border-slate-300 bg-white py-2 pr-9 pl-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </label>
      </header>

      {feedback && <div role="status" className={`rounded-xl border p-3 text-sm ${feedback.kind === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'}`}>{feedback.text}</div>}

      <div className="flex gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <button onClick={() => setTab('open')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'open' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Clock3 className="ml-1 inline h-4 w-4" />پرونده‌های باز</button>
        <button onClick={() => setTab('closed')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'closed' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><CheckCircle2 className="ml-1 inline h-4 w-4" />پرونده‌های بسته</button>
      </div>

      {visibleProductCases.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><PackageCheck className="h-4 w-4" />پرونده‌های کالا</h3>
          {visibleProductCases.map((kase) => (
            <article key={kase.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-700 dark:text-slate-200">
                <div className="font-semibold">{kase.invoiceCode} — {kase.productName}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">تعداد: {kase.quantity} — {PRODUCT_FULFILLMENT_LABELS[kase.status]}</div>
              </div>
              {tab === 'open' && <div className="flex flex-wrap gap-2">
                {kase.status === 'pending_coordination' && (canDispatch || isAdmin) && <button onClick={() => handleReadyForDispatch(kase)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white">آماده‌سازی ارسال</button>}
                {kase.status === 'ready_for_dispatch' && (canDispatch || isAdmin) && <button onClick={() => handleDispatch(kase)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white">ثبت ارسال</button>}
                {kase.status === 'dispatched' && (canDeliver || isAdmin) && <button onClick={() => handleDeliver(kase)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white">تحویل به مشتری</button>}
              </div>}
            </article>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><UserRoundCheck className="h-4 w-4" />پرونده‌های خدمت ({visibleServiceCases.length})</h3>
        {visibleServiceCases.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">پرونده‌ای در این نما وجود ندارد.</div>}
        {visibleServiceCases.map((kase) => (
          <article key={kase.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-100">{kase.invoiceCode} — {kase.serviceName}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>تعداد: {kase.quantity}</span><span>وضعیت: {SERVICE_FULFILLMENT_LABELS[kase.status]}</span>
                  {kase.responsibleUnit && <span>واحد: {kase.responsibleUnit}</span>}
                  {kase.projectManagerUserName && <span>مدیر: {kase.projectManagerUserName}</span>}
                  {kase.assignedEmployeeUserName && <span>کارشناس: {kase.assignedEmployeeUserName}</span>}
                </div>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs ${TERMINAL_SERVICE_STATUSES.has(kase.status) ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : kase.status === 'waiting' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'}`}>{SERVICE_FULFILLMENT_LABELS[kase.status]}</span>
            </div>
            {kase.closureReason && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">دلیل بسته‌شدن: {kase.closureReason}</div>}
            {tab === 'open' && <div className="mt-4 space-y-3">{renderManagerControls(kase)}{renderEmployeeControls(kase)}</div>}
            {renderTimeline(kase)}
          </article>
        ))}
      </section>
    </div>
  );
};
