import React, { useState } from 'react';
import { User, SystemRole, SystemPermission, Lead, SalesOrgAssignment, SalesBranch, SalesChain, SalespersonTransferRequest, SalesArchivedNote, SalesOrgAssignmentEvent } from '../types';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { getJalaliNow, jalaliDateTimeToIso, isoToJalaliDateTimeParts, getJalaliMonthLength, formatIsoAsJalaliDisplay } from '../utils/persianDate';
import { getSingleActiveSalesAssignmentStrict } from '../utils/salesOrgStructure';
import {
  createSalespersonTransferRequest, reviewSalespersonTransferRequest, executeSalespersonTransfer,
  deactivateSalesUser
} from '../utils/salesPersonnelLifecycle';
import { Users2, GitBranch, Archive, Send, CheckCircle2, XCircle, PlayCircle, UserX, StickyNote, History } from 'lucide-react';

const EVENT_TYPE_LABELS: Record<string, string> = {
  create: 'ایجاد انتصاب', correct_before_use: 'اصلاح پیش از استفاده', transfer_requested: 'درخواست انتقال ثبت شد',
  transfer_rejected: 'درخواست انتقال رد شد', transfer_scheduled: 'مقصد/زمان انتقال تعیین شد',
  queue_drained: 'تخلیهٔ صف', assignment_closed: 'انتصاب قبلی بسته شد', assignment_started: 'انتصاب جدید فعال شد',
  user_deactivated: 'غیرفعال‌سازی کاربر', emergency_correction: 'اصلاح اضطراری'
};

interface SalesPersonnelLifecycleViewProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  leads: Lead[];
  onUpdateLeads: (leads: Lead[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

type SectionId = 'my_hierarchy' | 'request_transfer' | 'review_inbox' | 'archived_workspace';

function defaultJalaliPick(): { y: string; m: string; d: string; hh: string; mm: string } {
  const p = isoToJalaliDateTimeParts(new Date().toISOString());
  return { y: String(p.year), m: String(p.month), d: String(p.day), hh: String(p.hour).padStart(2, '0'), mm: String(p.minute).padStart(2, '0') };
}

export const SalesPersonnelLifecycleView: React.FC<SalesPersonnelLifecycleViewProps> = ({
  users, onUpdateUsers, leads, onUpdateLeads, currentUser, roles, effectivePermissions, impersonatorAdmin
}) => {
  const [assignments, setAssignments] = useState<SalesOrgAssignment[]>(() => storage.getSalesOrgAssignments());
  const [branches] = useState<SalesBranch[]>(() => storage.getSalesBranches());
  const [chains] = useState<SalesChain[]>(() => storage.getSalesChains());
  const [requests, setRequests] = useState<SalespersonTransferRequest[]>(() => storage.getSalespersonTransferRequests());
  const [archivedNotes, setArchivedNotes] = useState<SalesArchivedNote[]>(() => storage.getSalesArchivedNotes());
  const [events, setEvents] = useState<SalesOrgAssignmentEvent[]>(() => storage.getSalesOrgAssignmentEvents());

  const [transferSalespersonId, setTransferSalespersonId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferDescription, setTransferDescription] = useState('');
  // پیام خطای کنار فیلد (بدهی #C — نه alert) + بنر نتیجه بعد از موفقیت
  const [requestFormErrors, setRequestFormErrors] = useState<{ salesperson?: string; reason?: string; description?: string; general?: string }>({});
  const [requestResultMessage, setRequestResultMessage] = useState<string | null>(null);

  const [reviewTargetBranchId, setReviewTargetBranchId] = useState<Record<string, string>>({});
  const [reviewTargetChainId, setReviewTargetChainId] = useState<Record<string, string>>({});
  const [reviewEffectiveMode, setReviewEffectiveMode] = useState<Record<string, 'now' | 'later'>>({});
  // انتخابگر شمسی زمان اثرگذاری (بدهی #۴ مأموریت اصلاح پذیرش) — سال/ماه/روز/ساعت:دقیقه به تقویم
  // شمسی؛ تبدیل به Timestamp استاندارد فقط با jalaliDateTimeToIso (persianDate.ts) انجام می‌شود،
  // هیچ Formatter/Parser تکراری اینجا نوشته نشده.
  const [reviewJalaliPick, setReviewJalaliPick] = useState<Record<string, { y: string; m: string; d: string; hh: string; mm: string }>>({});
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  // پیام خطای کنار فیلد به‌ازای هر درخواست (بدهی #C) + بنر نتیجه/Timeline بعد از تأیید یا رد
  const [reviewFormErrors, setReviewFormErrors] = useState<Record<string, { branch?: string; datetime?: string; general?: string }>>({});
  const [reviewResultMessage, setReviewResultMessage] = useState<Record<string, string>>({});
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);

  const [deactivateReason, setDeactivateReason] = useState<Record<string, string>>({});
  const [archivedNote, setArchivedNote] = useState<Record<string, string>>({});

  // بدهی #B: هویت واقعی زیر Impersonation — اگر ادمین به‌جای کاربر دیگر عمل می‌کند، این همان
  // ادمین واقعی است، نه کسی که در آن لحظه به‌عنوان او کار می‌شود.
  const realActorParam = impersonatorAdmin ? { id: impersonatorAdmin.id, fullName: impersonatorAdmin.fullName } : null;

  const isAdminUser = currentUser?.role === 'admin';
  const canRequestTransfer = hasPermission(effectivePermissions, ['request_salesperson_transfer']);
  const canReviewTransfer = hasPermission(effectivePermissions, ['review_salesperson_transfer']);
  const canManageSalesUsers = hasPermission(effectivePermissions, ['manage_sales_users']);
  const canViewArchived = hasPermission(effectivePermissions, ['view_archived_sales_workspace']);
  const canAddArchivedNote = hasPermission(effectivePermissions, ['add_archived_sales_note']);

  if (!currentUser) return null;

  const myActiveAssignment = getSingleActiveSalesAssignmentStrict(currentUser.id, assignments);
  const hasMyHierarchy = myActiveAssignment.ok === true && !!myActiveAssignment.assignment;

  const availableSections: { id: SectionId; label: string; icon: typeof Users2 }[] = [
    ...(hasMyHierarchy ? [{ id: 'my_hierarchy' as SectionId, label: 'سلسله‌مراتب من', icon: GitBranch }] : []),
    ...(canRequestTransfer ? [{ id: 'request_transfer' as SectionId, label: 'درخواست انتقال', icon: Send }] : []),
    ...(canReviewTransfer ? [{ id: 'review_inbox' as SectionId, label: 'کارتابل مدیر کاربران فروش', icon: Users2 }] : []),
    ...(canViewArchived ? [{ id: 'archived_workspace' as SectionId, label: 'نمای بایگانی‌شده', icon: Archive }] : [])
  ];
  const [activeSection, setActiveSection] = useState<SectionId | null>(availableSections[0]?.id || null);

  if (availableSections.length === 0) {
    return <div className="p-6 text-slate-500 dir-rtl" dir="rtl">دسترسی لازم برای چرخهٔ عمر نیروی فروش را ندارید.</div>;
  }

  function refreshAll() {
    setAssignments(storage.getSalesOrgAssignments());
    setRequests(storage.getSalespersonTransferRequests());
    setArchivedNotes(storage.getSalesArchivedNotes());
    setEvents(storage.getSalesOrgAssignmentEvents());
  }

  // --- بند ۲۱: فروشندگانی که سرپرست مستقیم فعلیِ همین کاربر هستند — لیست انتخاب درخواست انتقال.
  const mySubordinateSalespeople = assignments.filter((a) =>
    a.isActive && a.salesRoleId === 'role_salesperson' && a.directManagerUserId === currentUser.id
  ).map((a) => users.find((u) => u.id === a.userId)).filter((u): u is User => !!u && u.isActive !== false);

  const handleCreateTransferRequest = () => {
    setRequestResultMessage(null);
    const fieldErrors: typeof requestFormErrors = {};
    if (!transferSalespersonId) fieldErrors.salesperson = 'انتخاب فروشنده الزامی است.';
    if (!transferReason.trim()) fieldErrors.reason = 'ثبت دلیل انتقال الزامی است.';
    if (!transferDescription.trim()) fieldErrors.description = 'ثبت شرح کامل الزامی است.';
    if (Object.keys(fieldErrors).length > 0) { setRequestFormErrors(fieldErrors); return; }

    const nowIso = new Date().toISOString();
    const result = createSalespersonTransferRequest(
      { salespersonUserId: transferSalespersonId, reason: transferReason, fullDescription: transferDescription },
      { id: currentUser.id, fullName: currentUser.fullName },
      users, assignments, branches, chains, requests, nowIso, realActorParam
    );
    if (result.ok === false) {
      logAudit({ action: 'salesperson_transfer_requested', effectiveUser: currentUser, impersonatorAdmin, roles, details: `رد شد: ${result.reason}` });
      setRequestFormErrors({ general: result.reason });
      return;
    }
    const updatedRequests = [...requests, result.request];
    const tx = storage.saveCustomerIdentityTransaction({
      salespersonTransferRequests: updatedRequests,
      salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), result.event]
    });
    if (tx.ok === false) { setRequestFormErrors({ general: 'خطا در ذخیره‌سازی: ' + tx.error }); return; }
    setRequestFormErrors({});
    refreshAll();
    logAudit({ action: 'salesperson_transfer_requested', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: result.request.id, details: `${result.request.code} — ${result.request.salespersonUserName}` });
    setRequestResultMessage(`درخواست انتقال ${result.request.code} ثبت شد و به کارتابل مدیر کاربران فروش رفت.`);
    setTransferSalespersonId(''); setTransferReason(''); setTransferDescription('');
  };

  const handleReject = (request: SalespersonTransferRequest) => {
    setReviewResultMessage((p) => ({ ...p, [request.id]: '' }));
    if (!isAdminUser && !canReviewTransfer) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'مجوز بررسی درخواست انتقال را ندارید.' } })); return; }
    if (!rejectNote[request.id]?.trim()) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'برای رد درخواست، ثبت دلیل الزامی است.' } })); return; }
    const nowIso = new Date().toISOString();
    const result = reviewSalespersonTransferRequest(
      request, { type: 'reject', reviewNote: rejectNote[request.id] || '' },
      { id: currentUser.id, fullName: currentUser.fullName }, branches, chains, nowIso, realActorParam
    );
    if (result.ok === false) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: result.reason } })); return; }
    const updatedRequests = requests.map((r) => (r.id === request.id ? result.request : r));
    const tx = storage.saveCustomerIdentityTransaction({
      salespersonTransferRequests: updatedRequests,
      salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), result.event]
    });
    if (tx.ok === false) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'خطا در ذخیره‌سازی: ' + tx.error } })); return; }
    setReviewFormErrors((p) => ({ ...p, [request.id]: {} }));
    refreshAll();
    logAudit({ action: 'salesperson_transfer_rejected', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: request.id, details: request.code });
    setReviewResultMessage((p) => ({ ...p, [request.id]: `درخواست ${request.code} رد شد.` }));
  };

  const handleApprove = (request: SalespersonTransferRequest) => {
    setReviewResultMessage((p) => ({ ...p, [request.id]: '' }));
    if (!isAdminUser && !canReviewTransfer) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'مجوز بررسی درخواست انتقال را ندارید.' } })); return; }
    const targetBranchId = reviewTargetBranchId[request.id];
    const targetChainId = reviewTargetChainId[request.id];
    if (!targetBranchId || !targetChainId) { setReviewFormErrors((p) => ({ ...p, [request.id]: { branch: 'شعبه و زنجیرهٔ مقصد را انتخاب کنید.' } })); return; }
    const mode = reviewEffectiveMode[request.id] || 'now';
    const nowIso = new Date().toISOString();
    let effectiveAtIso = nowIso;
    if (mode === 'later') {
      const pick = reviewJalaliPick[request.id] || defaultJalaliPick();
      const y = Number(pick.y), m = Number(pick.m), d = Number(pick.d), hh = Number(pick.hh), mm = Number(pick.mm);
      if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) { setReviewFormErrors((p) => ({ ...p, [request.id]: { datetime: 'تاریخ و ساعت اثرگذاری را کامل انتخاب کنید.' } })); return; }
      effectiveAtIso = jalaliDateTimeToIso(y, m, d, hh, mm, 0);
    }

    const reviewResult = reviewSalespersonTransferRequest(
      request, { type: 'approve', targetBranchId, targetSalesChainId: targetChainId, effectiveAtIso },
      { id: currentUser.id, fullName: currentUser.fullName }, branches, chains, nowIso, realActorParam
    );
    if (reviewResult.ok === false) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: reviewResult.reason } })); return; }
    setReviewFormErrors((p) => ({ ...p, [request.id]: {} }));

    if (mode === 'now') {
      const execResult = executeSalespersonTransfer(
        reviewResult.request, users, assignments, leads, branches, chains, roles,
        { id: currentUser.id, fullName: currentUser.fullName }, nowIso, realActorParam
      );
      if (execResult.ok === false) {
        const failedList = requests.map((r) => (r.id === request.id ? execResult.failedRequest : r));
        const tx = storage.saveCustomerIdentityTransaction({
          salespersonTransferRequests: failedList,
          salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), reviewResult.event]
        });
        if (tx.ok === true) refreshAll();
        logAudit({ action: 'salesperson_transfer_execution_failed', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: request.id, details: execResult.reason });
        setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'تأیید ثبت شد اما اجرای فوری شکست خورد: ' + execResult.reason } }));
        return;
      }
      const tx = storage.saveCustomerIdentityTransaction({
        users: execResult.bundle.updatedUsers, salesOrgAssignments: execResult.bundle.updatedAssignments,
        leads: execResult.bundle.updatedLeads, salespersonTransferRequests: requests.map((r) => (r.id === request.id ? execResult.bundle.updatedRequest : r)),
        salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), reviewResult.event, ...execResult.bundle.events]
      });
      if (tx.ok === false) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'خطا در ذخیره‌سازی: ' + tx.error } })); return; }
      onUpdateUsers(execResult.bundle.updatedUsers);
      onUpdateLeads(execResult.bundle.updatedLeads);
      refreshAll();
      logAudit({ action: 'salesperson_transfer_executed', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: request.id, details: `${execResult.bundle.updatedRequest.code} — ${execResult.bundle.updatedRequest.drainedLeadCount ?? 0} Lead تخلیه شد` });
      setReviewResultMessage((p) => ({ ...p, [request.id]: `انتقال ${execResult.bundle.updatedRequest.code} با موفقیت تأیید و بلافاصله اجرا شد — ${execResult.bundle.updatedRequest.drainedLeadCount ?? 0} Lead تخلیه شد.` }));
    } else {
      const updated = requests.map((r) => (r.id === request.id ? { ...reviewResult.request, status: 'scheduled' as const } : r));
      const tx = storage.saveCustomerIdentityTransaction({
        salespersonTransferRequests: updated,
        salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), reviewResult.event]
      });
      if (tx.ok === false) { setReviewFormErrors((p) => ({ ...p, [request.id]: { general: 'خطا در ذخیره‌سازی: ' + tx.error } })); return; }
      refreshAll();
      logAudit({ action: 'salesperson_transfer_scheduled', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: request.id, details: `${reviewResult.request.code} — اثرگذاری: ${effectiveAtIso}` });
      setReviewResultMessage((p) => ({ ...p, [request.id]: `انتقال ${reviewResult.request.code} تأیید و برای ${formatIsoAsJalaliDisplay(effectiveAtIso)} زمان‌بندی شد.` }));
    }
  };

  const handleDeactivate = (targetUser: User) => {
    if (!isAdminUser && !canManageSalesUsers) { alert('مجوز غیرفعال‌سازی کاربران فروش را ندارید.'); return; }
    const reason = deactivateReason[targetUser.id] || '';
    const result = deactivateSalesUser(targetUser, assignments, leads, reason, { id: currentUser.id, fullName: currentUser.fullName }, new Date().toISOString(), realActorParam);
    if (result.ok === false) { alert(result.reason); return; }
    const tx = storage.saveCustomerIdentityTransaction({
      users: users.map((u) => (u.id === targetUser.id ? result.updatedUser : u)),
      salesOrgAssignments: assignments.map((a) => result.updatedAssignments.find((ua) => ua.id === a.id) || a),
      leads: result.updatedLeads,
      salesOrgAssignmentEvents: [...storage.getSalesOrgAssignmentEvents(), ...result.events]
    });
    if (tx.ok === false) { alert('خطا در ذخیره‌سازی: ' + tx.error); return; }
    onUpdateUsers(users.map((u) => (u.id === targetUser.id ? result.updatedUser : u)));
    onUpdateLeads(result.updatedLeads);
    refreshAll();
    logAudit({ action: 'sales_user_deactivated', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: targetUser.id, details: reason });
    alert(`${targetUser.fullName} غیرفعال شد؛ Login بسته شد، هیچ سابقه‌ای حذف نشد.`);
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const scheduledRequests = requests.filter((r) => r.status === 'scheduled' || (r.status === 'approved'));
  const decidedRequests = requests.filter((r) => ['rejected', 'executed', 'failed'].includes(r.status));
  const inactiveSalesUsers = users.filter((u) => u.isActive === false && !!u.roleId && roles.find((r) => r.id === u.roleId)?.domain === 'sales');

  return (
    <div className="space-y-6 dir-rtl" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users2 className="w-5 h-5" /> چرخهٔ عمر نیروی فروش</h2>
        <p className="text-sm text-slate-500 mt-1">انتقال فروشنده، زنجیرهٔ ثابت داخل شعبه، غیرفعال‌سازی و نمای بایگانی‌شده — طبق سند مرجع چرخهٔ عمر نیروی فروش.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {availableSections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${activeSection === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <s.icon className="w-4 h-4" /> {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'my_hierarchy' && myActiveAssignment.ok && myActiveAssignment.assignment && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 max-w-md">
          <h3 className="font-semibold text-slate-700 text-sm mb-2">زنجیرهٔ فعال فعلی من</h3>
          <p className="text-sm"><span className="text-slate-500">شعبه: </span>{branches.find((b) => b.id === myActiveAssignment.assignment!.salesBranchIds[0])?.name || '—'}</p>
          <p className="text-sm"><span className="text-slate-500">زنجیره/تیم: </span>{chains.find((c) => c.id === myActiveAssignment.assignment!.salesChainIds?.[0])?.name || '—'}</p>
          <p className="text-sm"><span className="text-slate-500">سرپرست مستقیم: </span>{users.find((u) => u.id === myActiveAssignment.assignment!.directManagerUserId)?.fullName || '—'}</p>
          <p className="text-sm"><span className="text-slate-500">از تاریخ: </span>{myActiveAssignment.assignment.validFrom}</p>
        </div>
      )}

      {activeSection === 'request_transfer' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 w-full max-w-lg">
          <h3 className="font-semibold text-slate-700 text-sm">درخواست انتقال یکی از فروشندگان زیرمجموعهٔ من</h3>
          <div>
            <select
              value={transferSalespersonId}
              onChange={(e) => { setTransferSalespersonId(e.target.value); setRequestFormErrors((p) => ({ ...p, salesperson: undefined })); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm min-h-[44px] ${requestFormErrors.salesperson ? 'border-rose-400' : 'border-slate-300'}`}
            >
              <option value="">-- انتخاب فروشنده --</option>
              {mySubordinateSalespeople.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
            {requestFormErrors.salesperson && <p className="text-xs text-rose-600 mt-1">{requestFormErrors.salesperson}</p>}
          </div>
          <div>
            <textarea
              placeholder="دلیل انتقال (اجباری)" value={transferReason}
              onChange={(e) => { setTransferReason(e.target.value); setRequestFormErrors((p) => ({ ...p, reason: undefined })); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm ${requestFormErrors.reason ? 'border-rose-400' : 'border-slate-300'}`} rows={2}
            />
            {requestFormErrors.reason && <p className="text-xs text-rose-600 mt-1">{requestFormErrors.reason}</p>}
          </div>
          <div>
            <textarea
              placeholder="شرح کامل (اجباری)" value={transferDescription}
              onChange={(e) => { setTransferDescription(e.target.value); setRequestFormErrors((p) => ({ ...p, description: undefined })); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm ${requestFormErrors.description ? 'border-rose-400' : 'border-slate-300'}`} rows={3}
            />
            {requestFormErrors.description && <p className="text-xs text-rose-600 mt-1">{requestFormErrors.description}</p>}
          </div>
          <p className="text-xs text-slate-400">مقصد و زمان اثرگذاری را شما تعیین نمی‌کنید — مدیر کاربران فروش در بررسی درخواست، مقصد کامل را تعیین می‌کند.</p>
          {requestFormErrors.general && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{requestFormErrors.general}</p>}
          {requestResultMessage && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{requestResultMessage}</p>}
          <button onClick={handleCreateTransferRequest} className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px]">
            <Send className="w-4 h-4" /> ثبت درخواست انتقال
          </button>
        </div>
      )}

      {activeSection === 'review_inbox' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <h3 className="font-semibold text-slate-700 text-sm">درخواست‌های در انتظار بررسی ({pendingRequests.length})</h3>
            {pendingRequests.length === 0 && <p className="text-sm text-slate-400">درخواستی در انتظار نیست.</p>}
            {pendingRequests.map((r) => {
              const branchId = reviewTargetBranchId[r.id] || '';
              const availableChains = chains.filter((c) => c.salesBranchId === branchId && c.isActive);
              const errs = reviewFormErrors[r.id] || {};
              const isTimelineOpen = expandedTimelineId === r.id;
              const timelineEvents = events.filter((e) => e.relatedRequestId === r.id || e.transferRequestId === r.id).sort((a, b) => (a.occurredAtIso || a.timestamp) < (b.occurredAtIso || b.timestamp) ? -1 : 1);
              return (
                <div key={r.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold">{r.code} — {r.salespersonUserName}</span>
                    <span className="text-slate-500">درخواست‌کننده: {r.requestedBySupervisorName}</span>
                  </div>
                  <p className="text-xs text-slate-500">مبدأ: {r.currentAssignmentSnapshot.salesBranchName} / {r.currentAssignmentSnapshot.salesChainName || '—'}</p>
                  <p className="text-xs"><span className="text-slate-500">دلیل: </span>{r.reason}</p>
                  <p className="text-xs"><span className="text-slate-500">شرح: </span>{r.fullDescription}</p>
                  <button onClick={() => setExpandedTimelineId(isTimelineOpen ? null : r.id)} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
                    <History className="w-3 h-3" /> {isTimelineOpen ? 'بستن جزئیات/Timeline' : `مشاهده جزئیات/Timeline (${timelineEvents.length})`}
                  </button>
                  {isTimelineOpen && (
                    <div className="bg-slate-50 rounded-lg p-2 space-y-1">
                      {timelineEvents.length === 0 && <p className="text-[11px] text-slate-400">هنوز رویدادی ثبت نشده.</p>}
                      {timelineEvents.map((e) => (
                        <p key={e.id} className="text-[11px] text-slate-600">
                          {EVENT_TYPE_LABELS[e.type] || e.type} — {e.jalaliDate || '—'} {e.timeWithSeconds || ''} — عامل: {e.actorUserName}{e.reason ? ` — ${e.reason}` : ''}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                    <div>
                      <select value={branchId} onChange={(e) => { setReviewTargetBranchId((p) => ({ ...p, [r.id]: e.target.value })); setReviewTargetChainId((p) => ({ ...p, [r.id]: '' })); setReviewFormErrors((p) => ({ ...p, [r.id]: { ...p[r.id], branch: undefined } })); }} className={`w-full border rounded-lg px-2 py-2 text-xs min-h-[44px] ${errs.branch ? 'border-rose-400' : 'border-slate-300'}`}>
                        <option value="">-- شعبهٔ مقصد --</option>
                        {branches.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <select value={reviewTargetChainId[r.id] || ''} onChange={(e) => setReviewTargetChainId((p) => ({ ...p, [r.id]: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-xs min-h-[44px]">
                      <option value="">-- زنجیرهٔ مقصد --</option>
                      {availableChains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={reviewEffectiveMode[r.id] || 'now'} onChange={(e) => setReviewEffectiveMode((p) => ({ ...p, [r.id]: e.target.value as 'now' | 'later' }))} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-xs min-h-[44px]">
                      <option value="now">اثرگذاری: اکنون</option>
                      <option value="later">اثرگذاری: آینده</option>
                    </select>
                  </div>
                  {errs.branch && <p className="text-xs text-rose-600">{errs.branch}</p>}
                  {(reviewEffectiveMode[r.id] === 'later') && (() => {
                    const pick = reviewJalaliPick[r.id] || defaultJalaliPick();
                    const setField = (patch: Partial<typeof pick>) => setReviewJalaliPick((p) => ({ ...p, [r.id]: { ...pick, ...patch } }));
                    const yearNum = Number(pick.y) || Number(defaultJalaliPick().y);
                    const monthNum = Number(pick.m) || 1;
                    const daysInMonth = getJalaliMonthLength(yearNum, monthNum);
                    const previewIso = pick.y && pick.m && pick.d ? jalaliDateTimeToIso(yearNum, monthNum, Number(pick.d) || 1, Number(pick.hh) || 0, Number(pick.mm) || 0, 0) : null;
                    return (
                      <div className="space-y-1">
                        {/* عرض ۳۶۰px: دو ستون به‌جای پنج ستون تا هیچ فیلدی له/بریده نشود؛ از sm به بالا پنج ستون در یک ردیف */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                          <input type="number" inputMode="numeric" placeholder="سال" value={pick.y} onChange={(e) => setField({ y: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-xs w-full min-h-[44px]" />
                          <select value={pick.m} onChange={(e) => setField({ m: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-xs w-full min-h-[44px]">
                            <option value="">ماه</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                          </select>
                          <select value={pick.d} onChange={(e) => setField({ d: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-xs w-full min-h-[44px]">
                            <option value="">روز</option>
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{String(d).padStart(2, '0')}</option>)}
                          </select>
                          <select value={pick.hh} onChange={(e) => setField({ hh: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-xs w-full min-h-[44px]">
                            <option value="">ساعت</option>
                            {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</option>)}
                          </select>
                          <select value={pick.mm} onChange={(e) => setField({ mm: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2 text-xs w-full min-h-[44px]">
                            <option value="">دقیقه</option>
                            {Array.from({ length: 60 }, (_, i) => i).map((mnt) => <option key={mnt} value={String(mnt).padStart(2, '0')}>{String(mnt).padStart(2, '0')}</option>)}
                          </select>
                        </div>
                        {previewIso && <p className="text-[11px] text-slate-400">اثرگذاری در: {formatIsoAsJalaliDisplay(previewIso)} (به‌وقت تهران)</p>}
                        {errs.datetime && <p className="text-xs text-rose-600">{errs.datetime}</p>}
                      </div>
                    );
                  })()}

                  {errs.general && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{errs.general}</p>}
                  {reviewResultMessage[r.id] && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{reviewResultMessage[r.id]}</p>}

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button onClick={() => handleApprove(r)} className="flex items-center justify-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-medium min-h-[44px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> تأیید
                    </button>
                    <input placeholder="دلیل رد (برای رد اجباری)" value={rejectNote[r.id] || ''} onChange={(e) => setRejectNote((p) => ({ ...p, [r.id]: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-2 text-xs flex-1 min-w-[140px] min-h-[44px]" />
                    <button onClick={() => handleReject(r)} className="flex items-center justify-center gap-1 bg-rose-600 text-white px-3 py-2 rounded-lg text-xs font-medium min-h-[44px]">
                      <XCircle className="w-3.5 h-3.5" /> رد
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-700 text-sm mb-2">زمان‌بندی‌شده / تأییدشدهٔ در انتظار اجرا ({scheduledRequests.length})</h3>
            <div className="space-y-1">
              {scheduledRequests.map((r) => (
                <p key={r.id} className="text-xs text-slate-500 break-words">{r.code} — {r.salespersonUserName} ← {branches.find((b) => b.id === r.targetBranchId)?.name} / {chains.find((c) => c.id === r.targetSalesChainId)?.name} — اثرگذاری: {r.effectiveAtIso ? formatIsoAsJalaliDisplay(r.effectiveAtIso) : '—'}</p>
              ))}
              {scheduledRequests.length === 0 && <p className="text-xs text-slate-400">موردی نیست.</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1.5"><PlayCircle className="w-4 h-4" /> تاریخچهٔ تصمیم‌ها ({decidedRequests.length})</h3>
            <div className="space-y-1">
              {decidedRequests.map((r) => (
                <p key={r.id} className="text-xs text-slate-500 break-words">{r.code} — {r.salespersonUserName} — وضعیت: {r.status}{r.failureReason ? ` (${r.failureReason})` : ''}</p>
              ))}
            </div>
          </div>

          {canManageSalesUsers && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5"><UserX className="w-4 h-4" /> غیرفعال‌سازی نیروی فروش</h3>
              {users.filter((u) => u.isActive !== false && !!u.roleId && roles.find((r) => r.id === u.roleId)?.domain === 'sales').map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                  <span className="text-sm flex-1 min-w-[140px]">{u.fullName} ({u.roleTitle})</span>
                  <input placeholder="دلیل ترک کار" value={deactivateReason[u.id] || ''} onChange={(e) => setDeactivateReason((p) => ({ ...p, [u.id]: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[140px]" />
                  <button onClick={() => handleDeactivate(u)} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium">غیرفعال‌سازی</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === 'archived_workspace' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5"><Archive className="w-4 h-4" /> نیروی فروش غیرفعال ({inactiveSalesUsers.length})</h3>
          {inactiveSalesUsers.length === 0 && <p className="text-sm text-slate-400">کاربر غیرفعالی وجود ندارد.</p>}
          {inactiveSalesUsers.map((u) => {
            const closedAssignments = assignments.filter((a) => a.userId === u.id).sort((a, b) => (a.changedAt > b.changedAt ? -1 : 1));
            return (
              <div key={u.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-bold">{u.fullName} <span className="text-xs text-slate-400 font-normal">({u.roleTitle})</span></p>
                <div className="text-xs text-slate-500 space-y-0.5">
                  {closedAssignments.map((a) => (
                    <p key={a.id}>{a.validFrom} تا {a.validTo || '—'} — شعبه: {branches.find((b) => b.id === a.salesBranchIds[0])?.name || '—'} — علت پایان: {a.closeReason || '—'}</p>
                  ))}
                </div>
                {(() => {
                  const notesForUser = archivedNotes.filter((n) => n.targetUserId === u.id).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
                  return notesForUser.length > 0 && (
                    <div className="text-xs text-slate-500 space-y-0.5 bg-slate-50 rounded-lg p-2">
                      {notesForUser.map((n) => (
                        <p key={n.id}>«{n.note}» — {n.authorUserName} — {n.createdAt}</p>
                      ))}
                    </div>
                  );
                })()}
                {canAddArchivedNote && (
                  <div className="flex items-center gap-2 pt-1">
                    <input placeholder="یادداشت مدیریتی (Append-only)" value={archivedNote[u.id] || ''} onChange={(e) => setArchivedNote((p) => ({ ...p, [u.id]: e.target.value }))} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <button
                      onClick={() => {
                        const noteText = archivedNote[u.id]?.trim();
                        if (!noteText) return;
                        const newNote: SalesArchivedNote = {
                          id: `sanote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                          targetUserId: u.id, note: noteText,
                          authorUserId: currentUser.id, authorUserName: currentUser.fullName,
                          createdAt: getJalaliNow()
                        };
                        const updatedNotes = [...archivedNotes, newNote];
                        storage.saveSalesArchivedNotes(updatedNotes);
                        setArchivedNotes(updatedNotes);
                        logAudit({ action: 'archived_sales_note_added', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: u.id, details: noteText });
                        setArchivedNote((p) => ({ ...p, [u.id]: '' }));
                      }}
                      className="flex items-center gap-1 bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                    >
                      <StickyNote className="w-3.5 h-3.5" /> ثبت یادداشت
                    </button>
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
