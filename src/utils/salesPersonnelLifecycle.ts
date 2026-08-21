import {
  User, SalesBranch, SalesChain, SalesOrgAssignment, SalesOrgAssignmentEvent, SalesOrgAssignmentEventType,
  SalespersonTransferRequest, Lead, SystemRole
} from '../types';
import { validateSalesAssignment, getSingleActiveSalesAssignmentStrict, buildSalesHierarchySnapshot } from './salesOrgStructure';
import { drainLeadsToPool } from './leadAssignment';
import { formatIsoAsJalaliDisplay } from './persianDate';

// هویت یک اقدام‌کننده — «مؤثر» (کسی که در آن لحظه به‌عنوان او در سیستم کار می‌شود، شاید زیر
// Impersonation) در برابر «واقعی» (ادمینی که واقعاً پشت کیبورد است، اگر Impersonation در جریان
// باشد؛ وگرنه همان مؤثر). بدهی #B مأموریت تکمیل چرخهٔ عمر: بدون این تفکیک، اقدام انجام‌شده زیر
// نیابت به‌اشتباه فقط به‌نام کاربر نیابت‌شده ثبت می‌شد.
export interface ActorContext {
  effective: { id: string; fullName: string };
  real: { id: string; fullName: string } | null;
}

// ============================================================
// Domain Service چرخهٔ عمر نیروی فروش (بند ۲۱ AGENTS.md، docs/SALES_PERSONNEL_LIFECYCLE_AND_
// HIERARCHY_CHANGE.md) — کاملاً خالص، بدون localStorage/alert. هر تابع محاسبات را کامل در
// حافظه انجام می‌دهد و آرایه‌های به‌روزشده را برمی‌گرداند؛ Handler در کامپوننت مسئول است که
// نتیجه را (فقط در صورت ok:true) با storage.saveCustomerIdentityTransaction به‌صورت اتمیک
// بنویسد و logAudit را صدا بزند — دقیقاً همان الگوی customerIdentity.ts.
// ============================================================

function makeEvent(
  type: SalesOrgAssignmentEventType, userId: string, actor: ActorContext, nowIso: string, correlationId: string,
  extra: Partial<SalesOrgAssignmentEvent> = {}
): SalesOrgAssignmentEvent {
  const display = formatIsoAsJalaliDisplay(nowIso);
  const [jalaliDate, timeWithSeconds] = display.split(' - ');
  const realActor = actor.real || actor.effective;
  return {
    id: `soae_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type, userId, actorUserId: actor.effective.id, actorUserName: actor.effective.fullName,
    timestamp: display, occurredAtIso: nowIso, jalaliDate, timeWithSeconds,
    realActorUserId: realActor.id, effectiveUserId: actor.effective.id,
    correlationId, ...extra
  };
}

// ------------------------------------------------------------
// ۱. درخواست انتقال — فقط سرپرست مستقیم فعلی فروشنده می‌تواند بسازد. خودِ این تابع نقش/Permission
// درخواست‌کننده را چک نمی‌کند (مسئولیت Handler)، ولی رابطهٔ «سرپرست مستقیم همین لحظه» را چک
// می‌کند: انتصاب فعال فروشنده باید directManagerUserId برابر requester.id داشته باشد.
// ------------------------------------------------------------
export function createSalespersonTransferRequest(
  params: {
    salespersonUserId: string; reason: string; fullDescription: string;
    attachment?: { fileName: string; url: string };
  },
  requester: { id: string; fullName: string },
  allUsers: User[], allAssignments: SalesOrgAssignment[], allBranches: SalesBranch[], allChains: SalesChain[],
  existingRequests: SalespersonTransferRequest[], nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { ok: true; request: SalespersonTransferRequest; event: SalesOrgAssignmentEvent } | { ok: false; reason: string } {
  const actor: ActorContext = { effective: requester, real: realActor };
  if (!params.reason.trim()) return { ok: false, reason: 'ثبت دلیل درخواست انتقال الزامی است.' };
  if (!params.fullDescription.trim()) return { ok: false, reason: 'ثبت شرح کامل درخواست انتقال الزامی است.' };

  const salesperson = allUsers.find((u) => u.id === params.salespersonUserId);
  if (!salesperson) return { ok: false, reason: 'فروشنده یافت نشد.' };
  if (salesperson.isActive === false) return { ok: false, reason: 'فروشندهٔ غیرفعال قابل انتقال نیست.' };

  const currentActive = getSingleActiveSalesAssignmentStrict(params.salespersonUserId, allAssignments);
  if (currentActive.ok === false) return currentActive;
  if (!currentActive.assignment) return { ok: false, reason: 'این کاربر هیچ انتصاب فعالی در سازمان فروش ندارد.' };
  if (currentActive.assignment.salesRoleId !== 'role_salesperson') {
    return { ok: false, reason: 'فقط جایگاه «فروشنده» از طریق این فلو جابه‌جا می‌شود؛ تغییر سرپرست/مدیر مسیر دیگری دارد.' };
  }
  if (currentActive.assignment.directManagerUserId !== requester.id) {
    return { ok: false, reason: 'فقط سرپرست مستقیم فعلی این فروشنده می‌تواند درخواست انتقال ثبت کند.' };
  }

  const currentBranch = allBranches.find((b) => b.id === currentActive.assignment!.salesBranchIds[0]);
  const currentChainId = currentActive.assignment!.salesChainIds?.[0];
  const currentChain = currentChainId ? allChains.find((c) => c.id === currentChainId) : undefined;

  const id = `sptr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const code = `TRF-${String(existingRequests.length + 1).padStart(4, '0')}`;
  // مقصد عمداً اینجا تعیین نمی‌شود — طبق سند مرجع، فقط مدیر کاربران فروش/ادمین در لحظهٔ تأیید
  // شعبه/زنجیرهٔ مقصد و زمان اثرگذاری را تعیین می‌کند (reviewSalespersonTransferRequest).
  const request: SalespersonTransferRequest = {
    id, code, salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName,
    currentAssignmentSnapshot: {
      salesBranchId: currentBranch?.id || '', salesBranchName: currentBranch?.name || '',
      salesChainId: currentChain?.id, salesChainName: currentChain?.name
    },
    requestedBySupervisorUserId: requester.id, requestedBySupervisorName: requester.fullName,
    reason: params.reason.trim(), fullDescription: params.fullDescription.trim(), attachment: params.attachment,
    requestedAt: formatIsoAsJalaliDisplay(nowIso), status: 'pending'
  };
  const event = makeEvent('transfer_requested', salesperson.id, actor, nowIso, `corr_${id}`, {
    reason: params.reason.trim(), description: params.fullDescription.trim(), relatedRequestId: id, transferRequestId: id,
    attachment: params.attachment
  });
  return { ok: true, request, event };
}

// ------------------------------------------------------------
// ۲. بررسی درخواست — فقط مدیر کاربران فروش/ادمین (چک Permission مسئولیت Handler است). رد فقط
// نیاز به توضیح دارد. تأیید همان لحظه‌ای است که مقصد (شعبه+زنجیرهٔ کامل) و زمان اثرگذاری
// (اکنون/آینده) تعیین/اعتبارسنجی می‌شود — طبق سند مرجع، سرپرست هرگز مقصد را انتخاب نمی‌کند.
// این تابع فقط وضعیت/فیلدهای درخواست را می‌چرخاند؛ اجرای واقعی مسئولیت
// executeSalespersonTransfer/executeDueSalespersonTransfers است — چیزی روی Assignment/Lead/
// User نمی‌نویسد.
// ------------------------------------------------------------
export function reviewSalespersonTransferRequest(
  request: SalespersonTransferRequest,
  decision: { type: 'reject'; reviewNote: string } | { type: 'approve'; targetBranchId: string; targetSalesChainId: string; effectiveAtIso: string; reviewNote?: string },
  reviewer: { id: string; fullName: string },
  allBranches: SalesBranch[], allChains: SalesChain[], nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { ok: true; request: SalespersonTransferRequest; event: SalesOrgAssignmentEvent } | { ok: false; reason: string } {
  const actor: ActorContext = { effective: reviewer, real: realActor };
  const now = formatIsoAsJalaliDisplay(nowIso);
  if (request.status !== 'pending') return { ok: false, reason: 'فقط درخواست در وضعیت در انتظار بررسی قابل تصمیم‌گیری است.' };

  if (decision.type === 'reject') {
    if (!decision.reviewNote.trim()) return { ok: false, reason: 'برای رد درخواست، ثبت توضیح الزامی است.' };
    const event = makeEvent('transfer_rejected', request.salespersonUserId, actor, nowIso, `corr_${request.id}`, {
      reason: decision.reviewNote.trim(), relatedRequestId: request.id, transferRequestId: request.id
    });
    return { ok: true, request: { ...request, status: 'rejected', reviewedByUserId: reviewer.id, reviewedByUserName: reviewer.fullName, reviewedAt: now, reviewNote: decision.reviewNote.trim() }, event };
  }

  const targetBranch = allBranches.find((b) => b.id === decision.targetBranchId);
  if (!targetBranch || !targetBranch.isActive) return { ok: false, reason: 'شعبهٔ مقصد یافت نشد یا غیرفعال است — مقصد ناقص قابل تأیید نیست.' };
  const targetChain = allChains.find((c) => c.id === decision.targetSalesChainId);
  if (!targetChain || !targetChain.isActive) return { ok: false, reason: 'زنجیرهٔ مقصد یافت نشد یا غیرفعال است — مقصد ناقص قابل تأیید نیست.' };
  if (targetChain.salesBranchId !== decision.targetBranchId) return { ok: false, reason: 'زنجیرهٔ انتخاب‌شده متعلق به شعبهٔ مقصد نیست.' };
  if (new Date(decision.effectiveAtIso).getTime() < new Date(nowIso).getTime()) {
    return { ok: false, reason: 'زمان اثرگذاری نمی‌تواند در گذشته باشد (Backdate ممنوع است).' };
  }

  // این Event فقط «تصمیم بررسی» (تعیین مقصد و زمان) را ثبت می‌کند، نه اجرای واقعی انتقال —
  // even در حالت «اکنون»، انتصاب واقعی را executeSalespersonTransfer با Event مستقل خودش
  // (assignment_closed/assignment_started) می‌سازد؛ اینجا زودتر از موعد assignment_started
  // نمی‌سازیم چون هنوز هیچ انتصابی وجود ندارد.
  const event = makeEvent('transfer_scheduled', request.salespersonUserId, actor, nowIso, `corr_${request.id}`, {
    reason: decision.reviewNote?.trim(), relatedRequestId: request.id, transferRequestId: request.id,
    newBranchId: decision.targetBranchId,
    description: `مقصد تعیین شد: شعبهٔ ${targetBranch.name} / زنجیرهٔ ${targetChain.name} — اثرگذاری: ${formatIsoAsJalaliDisplay(decision.effectiveAtIso)}`
  });

  return {
    ok: true,
    event,
    request: {
      ...request, status: 'approved', reviewedByUserId: reviewer.id, reviewedByUserName: reviewer.fullName, reviewedAt: now,
      reviewNote: decision.reviewNote?.trim(), targetBranchId: decision.targetBranchId, targetSalesChainId: decision.targetSalesChainId,
      effectiveAtIso: decision.effectiveAtIso
    }
  };
}

// درخواست تأییدشده‌ای که زمان اثرگذاری آینده دارد را به‌عنوان «زمان‌بندی‌شده» علامت می‌زند تا
// UI/کارتابل آن را جدا از تأییدشده‌های آماده اجرا نشان دهد؛ اجرای واقعی همچنان با
// executeDueSalespersonTransfers انجام می‌شود.
export function markTransferScheduled(
  request: SalespersonTransferRequest, now: string
): { ok: true; request: SalespersonTransferRequest } | { ok: false; reason: string } {
  if (request.status !== 'approved') return { ok: false, reason: 'فقط درخواست تأییدشده قابل زمان‌بندی است.' };
  if (!request.effectiveAtIso) return { ok: false, reason: 'این درخواست هنوز مقصد/زمان اثرگذاری ندارد.' };
  if (new Date(request.effectiveAtIso).getTime() <= new Date(now).getTime()) {
    return { ok: false, reason: 'زمان اثرگذاری این درخواست همین حالا رسیده — باید بلافاصله اجرا شود، نه زمان‌بندی.' };
  }
  return { ok: true, request: { ...request, status: 'scheduled' } };
}

interface TransferBundle {
  updatedUsers: User[];
  updatedAssignments: SalesOrgAssignment[];
  updatedLeads: Lead[];
  updatedRequest: SalespersonTransferRequest;
  events: SalesOrgAssignmentEvent[];
}

// ------------------------------------------------------------
// ۳. اجرای اتمیک یک انتقال — کل منطق در حافظه محاسبه می‌شود؛ Handler فقط در صورت ok:true یک
// تراکنش localStorage واحد می‌نویسد (شکست هر مرحله همه‌چیز را Rollback می‌کند چون هیچ نوشتنی
// تا اینجا انجام نشده). Idempotent با requestId: اگر درخواست از قبل oldAssignmentId/
// newAssignmentId دارد (یعنی قبلاً اجرا شده)، بدون اثر دوم fail می‌شود.
// ------------------------------------------------------------
export function executeSalespersonTransfer(
  request: SalespersonTransferRequest,
  allUsers: User[], allAssignments: SalesOrgAssignment[], allLeads: Lead[],
  allBranches: SalesBranch[], allChains: SalesChain[], allRoles: SystemRole[],
  executor: { id: string; fullName: string }, nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { ok: true; bundle: TransferBundle } | { ok: false; reason: string; failedRequest: SalespersonTransferRequest } {
  const actor: ActorContext = { effective: executor, real: realActor };
  const now = formatIsoAsJalaliDisplay(nowIso);
  const correlationId = `corr_${request.id}`;
  if (request.oldAssignmentId || request.newAssignmentId || request.status === 'executed') {
    return { ok: false, reason: 'این درخواست قبلاً اجرا شده — Retry اثر دوم نمی‌سازد.', failedRequest: request };
  }
  if (request.status !== 'approved' && request.status !== 'scheduled') {
    return { ok: false, reason: 'فقط درخواست تأییدشده/زمان‌بندی‌شده قابل اجراست.', failedRequest: request };
  }

  const fail = (reason: string): { ok: false; reason: string; failedRequest: SalespersonTransferRequest } => ({
    ok: false, reason, failedRequest: { ...request, status: 'failed', failureReason: reason }
  });

  const salesperson = allUsers.find((u) => u.id === request.salespersonUserId);
  if (!salesperson) return fail('فروشنده یافت نشد.');
  if (salesperson.isActive === false) return fail('فروشندهٔ غیرفعال قابل انتقال نیست.');

  const currentActive = getSingleActiveSalesAssignmentStrict(request.salespersonUserId, allAssignments);
  if (currentActive.ok === false) return fail(currentActive.reason);
  if (!currentActive.assignment) return fail('این فروشنده هیچ انتصاب فعالی ندارد.');
  const oldAssignment = currentActive.assignment;

  const targetBranch = allBranches.find((b) => b.id === request.targetBranchId);
  if (!targetBranch || !targetBranch.isActive) return fail('شعبهٔ مقصد یافت نشد یا غیرفعال است.');
  const targetChain = allChains.find((c) => c.id === request.targetSalesChainId);
  if (!targetChain || !targetChain.isActive) return fail('زنجیرهٔ مقصد یافت نشد یا غیرفعال است.');
  if (targetChain.salesBranchId !== request.targetBranchId) return fail('زنجیرهٔ انتخاب‌شده متعلق به شعبهٔ مقصد نیست.');

  // سرپرست جدید = دارندهٔ فعال جایگاه سرپرست همان زنجیرهٔ مقصد. مقصد بدون سرپرست فعال ناقص است.
  const newSupervisorAssignment = allAssignments.find((a) =>
    a.isActive && a.salesRoleId === 'role_sales_supervisor' && (a.salesChainIds || []).includes(targetChain.id)
  );
  if (!newSupervisorAssignment) return fail('زنجیرهٔ مقصد سرپرست فعالی ندارد — مقصد ناقص است.');
  const newSupervisor = allUsers.find((u) => u.id === newSupervisorAssignment.userId && u.isActive !== false);
  if (!newSupervisor) return fail('سرپرست زنجیرهٔ مقصد یافت نشد یا غیرفعال است.');

  const validation = validateSalesAssignment(
    {
      userId: request.salespersonUserId, salesRoleId: 'role_salesperson',
      salesBranchIds: [targetBranch.id], salesChainIds: [targetChain.id], directManagerUserId: newSupervisor.id,
      validFrom: now, isActive: true, changedByUserId: executor.id
    },
    request.salespersonUserId,
    allAssignments.map((a) => (a.id === oldAssignment.id ? { ...a, isActive: false } : a)),
    allUsers, allBranches, allRoles
  );
  if (validation.ok === false) return fail(validation.reason);

  // ۱-۲. تخلیهٔ Lead/Callback/شماره‌های باز — هرگز مستقیم به فروشندهٔ دیگر، فقط به مخزن تخلیه‌شده.
  const { updatedLeads, drainedLeadIds } = drainLeadsToPool(
    allLeads, request.salespersonUserId, salesperson.fullName, `انتقال فروشنده (${request.code})`,
    executor, now, request.id
  );

  // ۳. انتصاب قبلی validTo می‌گیرد.
  const closedOldAssignment: SalesOrgAssignment = {
    ...oldAssignment, isActive: false, validTo: now, closeReason: 'transfer', closedByUserId: executor.id,
    changedByUserId: executor.id, changedAt: now
  };

  // ۴. انتصاب جدید در همان لحظه validFrom می‌گیرد.
  const newAssignmentId = `sassign_${request.salespersonUserId}_${Date.now()}`;
  const newAssignment: SalesOrgAssignment = {
    id: newAssignmentId, userId: request.salespersonUserId, salesRoleId: 'role_salesperson',
    salesBranchIds: [targetBranch.id], salesChainIds: [targetChain.id], directManagerUserId: newSupervisor.id,
    validFrom: now, isActive: true, changedByUserId: executor.id, changedAt: now, transferRequestId: request.id
  };

  const updatedAssignments = allAssignments.map((a) => (a.id === oldAssignment.id ? closedOldAssignment : a)).concat(newAssignment);

  // ۱۰. Mirror قدیمی User.salesSupervisorId فقط بعد از موفقیت کل عملیات.
  const updatedUsers = allUsers.map((u) => (u.id === request.salespersonUserId ? { ...u, salesSupervisorId: newSupervisor.id } : u));

  // Snapshot کامل زنجیره قدیم/جدید برای Auditپذیری کامل — best-effort: اگر زنجیرهٔ قدیم/جدید
  // به هر دلیل کامل Resolve نشود (مثلاً دادهٔ Demo ناقص)، Snapshot فقط undefined می‌ماند و
  // خودِ انتقال را متوقف نمی‌کند؛ این فیلد تکمیلیِ گزارش است، نه شرط صحت انتقال.
  const oldHierarchySnapshot = buildSalesHierarchySnapshot(request.salespersonUserId, allAssignments, allUsers, allBranches, now, allChains);
  const newHierarchySnapshot = buildSalesHierarchySnapshot(request.salespersonUserId, updatedAssignments, updatedUsers, allBranches, now, allChains);

  const events: SalesOrgAssignmentEvent[] = [
    makeEvent('assignment_closed', request.salespersonUserId, actor, nowIso, correlationId, {
      before: oldAssignment, after: closedOldAssignment, transferRequestId: request.id, relatedRequestId: request.id, reason: 'transfer',
      oldAssignmentId: oldAssignment.id, oldBranchId: oldAssignment.salesBranchIds[0],
      oldHierarchySnapshot: oldHierarchySnapshot.ok === true ? oldHierarchySnapshot.snapshot : undefined
    }),
    makeEvent('assignment_started', request.salespersonUserId, actor, nowIso, correlationId, {
      after: newAssignment, transferRequestId: request.id, relatedRequestId: request.id,
      oldAssignmentId: oldAssignment.id, newAssignmentId, oldBranchId: oldAssignment.salesBranchIds[0], newBranchId: targetBranch.id,
      oldHierarchySnapshot: oldHierarchySnapshot.ok === true ? oldHierarchySnapshot.snapshot : undefined,
      newHierarchySnapshot: newHierarchySnapshot.ok === true ? newHierarchySnapshot.snapshot : undefined
    }),
    makeEvent('queue_drained', request.salespersonUserId, actor, nowIso, correlationId, {
      transferRequestId: request.id, relatedRequestId: request.id, reason: `${drainedLeadIds.length} Lead به مخزن تخلیه‌شده برگشت`,
      oldAssignmentId: oldAssignment.id, newAssignmentId, description: `شناسه‌های Lead تخلیه‌شده: ${drainedLeadIds.join('، ') || '—'}`
    })
  ];

  const updatedRequest: SalespersonTransferRequest = {
    ...request, status: 'executed', executedAt: now,
    oldAssignmentId: oldAssignment.id, newAssignmentId,
    drainedLeadIds, drainedLeadCount: drainedLeadIds.length
  };

  return { ok: true, bundle: { updatedUsers, updatedAssignments, updatedLeads, updatedRequest, events } };
}

// ------------------------------------------------------------
// ۴. اجرای دستهٔ انتقال‌های سررسیده — چون Worker واقعی زمان‌بندی‌شده در این Prototype وجود ندارد
// (محدودیت صریح، مستندشده)، این تابع در لحظهٔ Init برنامه و هر Refresh دادهٔ سازمان فروش صدا
// زده می‌شود؛ فقط درخواست‌های approved/scheduled با effectiveAtIso <= اکنون را اجرا می‌کند.
// ------------------------------------------------------------
export function executeDueSalespersonTransfers(
  requests: SalespersonTransferRequest[],
  allUsers: User[], allAssignments: SalesOrgAssignment[], allLeads: Lead[],
  allBranches: SalesBranch[], allChains: SalesChain[], allRoles: SystemRole[],
  executor: { id: string; fullName: string }, nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { updatedUsers: User[]; updatedAssignments: SalesOrgAssignment[]; updatedLeads: Lead[]; updatedRequests: SalespersonTransferRequest[]; events: SalesOrgAssignmentEvent[]; executedCount: number } {
  let users = allUsers, assignments = allAssignments, leads = allLeads;
  let updatedRequests = requests;
  const events: SalesOrgAssignmentEvent[] = [];
  let executedCount = 0;

  const due = requests.filter((r) =>
    (r.status === 'approved' || r.status === 'scheduled') && !!r.effectiveAtIso &&
    new Date(r.effectiveAtIso).getTime() <= new Date(nowIso).getTime()
  );

  for (const request of due) {
    const result = executeSalespersonTransfer(request, users, assignments, leads, allBranches, allChains, allRoles, executor, nowIso, realActor);
    if (result.ok === true) {
      users = result.bundle.updatedUsers;
      assignments = result.bundle.updatedAssignments;
      leads = result.bundle.updatedLeads;
      events.push(...result.bundle.events);
      updatedRequests = updatedRequests.map((r) => (r.id === request.id ? result.bundle.updatedRequest : r));
      executedCount += 1;
    } else {
      updatedRequests = updatedRequests.map((r) => (r.id === request.id ? result.failedRequest : r));
    }
  }

  return { updatedUsers: users, updatedAssignments: assignments, updatedLeads: leads, updatedRequests, events, executedCount };
}

// ------------------------------------------------------------
// ۵. غیرفعال‌سازی نیروی فروش — Login را می‌بندد (User.isActive=false)، انتصاب فعال را می‌بندد،
// صف باز را با همان منطق «تخلیه‌شده» برمی‌گرداند. هیچ رکورد دیگری (فاکتور/تماس/Lead بسته/
// پورسانت/Audit) لمس یا حذف نمی‌شود.
// ------------------------------------------------------------
export function deactivateSalesUser(
  targetUser: User, allAssignments: SalesOrgAssignment[], allLeads: Lead[],
  reason: string, executor: { id: string; fullName: string }, nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { ok: true; updatedUser: User; updatedAssignments: SalesOrgAssignment[]; updatedLeads: Lead[]; events: SalesOrgAssignmentEvent[] } | { ok: false; reason: string } {
  const actor: ActorContext = { effective: executor, real: realActor };
  const now = formatIsoAsJalaliDisplay(nowIso);
  const correlationId = `corr_deact_${targetUser.id}_${Date.now()}`;
  if (!reason.trim()) return { ok: false, reason: 'ثبت دلیل غیرفعال‌سازی الزامی است.' };
  if (targetUser.isActive === false) return { ok: false, reason: 'این کاربر از قبل غیرفعال است.' };

  const activeResult = getSingleActiveSalesAssignmentStrict(targetUser.id, allAssignments);
  if (activeResult.ok === false) return activeResult;

  const updatedUser: User = { ...targetUser, isActive: false };

  let updatedAssignments = allAssignments;
  const events: SalesOrgAssignmentEvent[] = [];
  if (activeResult.assignment) {
    const closed: SalesOrgAssignment = {
      ...activeResult.assignment, isActive: false, validTo: now, closeReason: 'deactivation',
      closedByUserId: executor.id, changedByUserId: executor.id, changedAt: now
    };
    updatedAssignments = allAssignments.map((a) => (a.id === activeResult.assignment!.id ? closed : a));
    events.push(makeEvent('assignment_closed', targetUser.id, actor, nowIso, correlationId, {
      before: activeResult.assignment, after: closed, reason,
      oldAssignmentId: activeResult.assignment.id, oldBranchId: activeResult.assignment.salesBranchIds[0]
    }));
  }

  const { updatedLeads, drainedLeadIds } = drainLeadsToPool(allLeads, targetUser.id, targetUser.fullName, reason, executor, now);
  events.push(makeEvent('user_deactivated', targetUser.id, actor, nowIso, correlationId, { reason, after: { userId: targetUser.id } as Partial<SalesOrgAssignment> }));
  if (drainedLeadIds.length > 0) {
    events.push(makeEvent('queue_drained', targetUser.id, actor, nowIso, correlationId, {
      reason: `${drainedLeadIds.length} Lead به مخزن تخلیه‌شده برگشت`, description: `شناسه‌های Lead تخلیه‌شده: ${drainedLeadIds.join('، ')}`
    }));
  }

  return { ok: true, updatedUser, updatedAssignments, updatedLeads, events };
}

// ------------------------------------------------------------
// ۶. اصلاح انتصاب پیش از اولین استفادهٔ مؤثر — فقط درجا (همان id)، با Audit before/after. اگر
// immutableAfterFirstBusinessUse=true باشد، رد می‌شود (باید close+create شود، نه ویرایش مستقیم).
// ------------------------------------------------------------
export function correctUnusedSalesAssignment(
  assignment: SalesOrgAssignment,
  changes: { salesBranchIds?: string[]; salesChainIds?: string[]; directManagerUserId?: string },
  reason: string, effectiveActor: { id: string; fullName: string }, nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { ok: true; updatedAssignment: SalesOrgAssignment; event: SalesOrgAssignmentEvent } | { ok: false; reason: string } {
  const actor: ActorContext = { effective: effectiveActor, real: realActor };
  const now = formatIsoAsJalaliDisplay(nowIso);
  if (!reason.trim()) return { ok: false, reason: 'ثبت دلیل اصلاح الزامی است.' };
  if (assignment.immutableAfterFirstBusinessUse === true) {
    return { ok: false, reason: 'این انتصاب پس از اولین استفادهٔ مؤثر قفل شده — فقط بستن و ساخت انتصاب تازه مجاز است، نه ویرایش مستقیم.' };
  }
  const before = { ...assignment };
  const updatedAssignment: SalesOrgAssignment = {
    ...assignment,
    salesBranchIds: changes.salesBranchIds ?? assignment.salesBranchIds,
    salesChainIds: changes.salesChainIds ?? assignment.salesChainIds,
    directManagerUserId: changes.directManagerUserId ?? assignment.directManagerUserId,
    changedByUserId: effectiveActor.id, changedAt: now
  };
  const event = makeEvent('correct_before_use', assignment.userId, actor, nowIso, `corr_correct_${assignment.id}_${Date.now()}`, {
    reason, before, after: updatedAssignment, oldAssignmentId: assignment.id,
    oldBranchId: before.salesBranchIds[0], newBranchId: updatedAssignment.salesBranchIds[0]
  });
  return { ok: true, updatedAssignment, event };
}

// ------------------------------------------------------------
// ۷. اصلاح اضطراری انتصاب استفاده‌شده — فقط Super Admin (چک نقش مسئولیت Handler است، این تابع
// isSuperAdmin را به‌عنوان ورودی صریح می‌گیرد تا مسیر بدون این پرچم هرگز اجرا نشود). نامه/دلیل/
// شرح کامل اجباری. الگوی close+create — Snapshot/رکورد قدیمی هرگز بازنویسی نمی‌شود.
// ------------------------------------------------------------
export function emergencyCorrectSalesAssignment(
  assignment: SalesOrgAssignment, changes: { salesBranchIds: string[]; salesChainIds: string[]; directManagerUserId?: string },
  params: { letterReference: string; reason: string; fullDescription: string; requestedByUserId: string },
  isSuperAdmin: boolean, effectiveActor: { id: string; fullName: string }, nowIso: string,
  realActor: { id: string; fullName: string } | null = null
): { ok: true; closedAssignment: SalesOrgAssignment; newAssignment: SalesOrgAssignment; event: SalesOrgAssignmentEvent } | { ok: false; reason: string } {
  const actor: ActorContext = { effective: effectiveActor, real: realActor };
  const now = formatIsoAsJalaliDisplay(nowIso);
  if (!isSuperAdmin) return { ok: false, reason: 'اصلاح اضطراری انتصاب استفاده‌شده فقط برای ادمین اصلی مجاز است.' };
  if (!params.letterReference.trim()) return { ok: false, reason: 'ثبت مرجع نامهٔ رسمی الزامی است.' };
  if (!params.reason.trim()) return { ok: false, reason: 'ثبت دلیل الزامی است.' };
  if (!params.fullDescription.trim()) return { ok: false, reason: 'ثبت شرح کامل الزامی است.' };
  if (!params.requestedByUserId.trim()) return { ok: false, reason: 'ثبت درخواست‌کنندهٔ اصلاح الزامی است.' };
  if (assignment.isActive !== true) return { ok: false, reason: 'فقط انتصاب فعال قابل اصلاح اضطراری است.' };

  const closedAssignment: SalesOrgAssignment = {
    ...assignment, isActive: false, validTo: now, closeReason: 'emergency_correction',
    closedByUserId: effectiveActor.id, changedByUserId: effectiveActor.id, changedAt: now
  };
  const newAssignmentId = `sassign_${assignment.userId}_${Date.now()}`;
  const newAssignment: SalesOrgAssignment = {
    ...assignment,
    id: newAssignmentId,
    salesBranchIds: changes.salesBranchIds, salesChainIds: changes.salesChainIds,
    directManagerUserId: changes.directManagerUserId ?? assignment.directManagerUserId,
    validFrom: now, validTo: undefined, isActive: true,
    immutableAfterFirstBusinessUse: false, firstBusinessEventAt: undefined, firstBusinessEventType: undefined, firstBusinessEventId: undefined,
    changedByUserId: effectiveActor.id, changedAt: now
  };
  const event = makeEvent('emergency_correction', assignment.userId, actor, nowIso, `corr_emerg_${assignment.id}_${Date.now()}`, {
    before: assignment, after: newAssignment,
    reason: `${params.reason.trim()} — نامه: ${params.letterReference.trim()} — درخواست‌کننده: ${params.requestedByUserId} — شرح: ${params.fullDescription.trim()}`,
    description: params.fullDescription.trim(),
    oldAssignmentId: assignment.id, newAssignmentId,
    oldBranchId: assignment.salesBranchIds[0], newBranchId: changes.salesBranchIds[0]
  });
  return { ok: true, closedAssignment, newAssignment, event };
}

// ------------------------------------------------------------
// علامت‌گذاری «اولین استفادهٔ مؤثر» — هر Handler عملیاتی (تخصیص/اقدام Lead، تماس، Callback،
// فاکتور، تأیید، هماهنگی، ارسال، فعال‌سازی، پشتیبانی، عودت، رویداد مالی/پورسانت) که مستقیماً
// به یک SalesOrgAssignment فعال ارجاع دارد باید بعد از موفقیت خودش این تابع را صدا بزند. Login/
// مشاهده/ایجاد خودِ انتصاب هرگز این تابع را صدا نمی‌زند — این خودِ تعریف «استفادهٔ مؤثر» است.
// Idempotent: اگر قبلاً قفل شده، بدون تغییر برمی‌گردد (اولین رویداد همیشه همان می‌ماند).
// ------------------------------------------------------------
export function markSalesAssignmentBusinessUse(
  assignment: SalesOrgAssignment, eventType: string, eventId: string, now: string
): SalesOrgAssignment {
  if (assignment.immutableAfterFirstBusinessUse === true) return assignment;
  return { ...assignment, immutableAfterFirstBusinessUse: true, firstBusinessEventAt: now, firstBusinessEventType: eventType, firstBusinessEventId: eventId };
}

// نسخهٔ روی کل آرایه — نقطهٔ واحدی که Handlerهای عملیاتی واقعی (تماس/Lead، ثبت/ارسال فاکتور،
// تأیید سرپرست و...) بعد از موفقیت خودشان صدا می‌زنند تا نتیجه را در همان تراکنش اتمیک خودشان
// (saveCustomerIdentityTransaction) کنار داده اصلی بگنجانند. اگر کاربر انتصاب فعال نداشت، یا
// بیش از یک انتصاب فعال هم‌زمان داشت (دادهٔ ناسازگار)، یا از قبل قفل بود، آرایه بدون تغییر
// (همان Reference قبلی) برمی‌گردد — Idempotent و بی‌اثر روی موارد غیرعادی، نه Throw.
export function applyBusinessUseLock(
  assignments: SalesOrgAssignment[], userId: string, eventType: string, eventId: string, now: string
): SalesOrgAssignment[] {
  const activeResult = getSingleActiveSalesAssignmentStrict(userId, assignments);
  if (activeResult.ok === false || !activeResult.assignment) return assignments;
  const updated = markSalesAssignmentBusinessUse(activeResult.assignment, eventType, eventId, now);
  if (updated === activeResult.assignment) return assignments;
  return assignments.map((a) => (a.id === updated.id ? updated : a));
}
