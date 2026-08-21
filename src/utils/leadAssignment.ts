import { Lead, LeadStatus, LeadTimelineEntry, RawContact, Campaign, User } from '../types';
import { getSubordinateUserIds } from './salesHierarchy';

// ============================================================
// موتور تخصیص/انتقال/تولید Lead (بند ۷-۹ مأموریت فروش) — کاملاً خالص، بدون localStorage/alert.
// قلمرو تخصیص از همان زنجیرهٔ salesSupervisorId موجود (salesHierarchy.ts) محاسبه می‌شود —
// یک منبع حقیقت واحد برای «چه کسی زیرمجموعهٔ چه کسی است»، نه یک زنجیرهٔ موازی جدید.
// ============================================================

const TERMINAL_LEAD_STATUSES: LeadStatus[] = ['closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked'];
export function isTerminalLeadStatus(status: LeadStatus): boolean {
  return TERMINAL_LEAD_STATUSES.includes(status);
}

export function generateLeadTrackingCode(existingLeads: Lead[]): string {
  const max = existingLeads.reduce((m, l) => {
    const match = /^LD-(\d+)$/.exec(l.trackingCode);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `LD-${String(max + 1).padStart(4, '0')}`;
}

// Lead فقط وقتی ساخته می‌شود که علاقهٔ خرید واقعی اعلام شده باشد — این تابع خودِ تصمیم را
// نمی‌گیرد (تصمیم با کاربر/قاعدهٔ کمپین است)، فقط رکورد Lead خالص را از یک RawContact می‌سازد.
export function buildLeadFromRawContact(
  rawContact: RawContact, campaign: Campaign | undefined, declaredInterest: string,
  actor: { id: string; fullName: string }, now: string, existingLeads: Lead[]
): Lead {
  const trackingCode = generateLeadTrackingCode(existingLeads);
  const id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id, trackingCode, rawContactId: rawContact.id, customerId: rawContact.linkedCustomerId,
    campaignId: campaign?.id, source: campaign?.name || 'دستی', declaredInterest, priority: 'normal',
    createdAt: now, createdByUserId: actor.id, createdByUserName: actor.fullName,
    status: 'new', hadFirstContact: false,
    timeline: [{ id: `${id}_t0`, type: 'created', title: 'Lead از مخزن داده خام ایجاد شد', actorUserId: actor.id, actorUserName: actor.fullName, timestamp: now }]
  };
}

// اختیار تخصیص/انتقال (بند ۸ مأموریت): مدیر داده و ادمین بدون محدودیت قلمرو (چون مدیر داده
// عمداً بیرون از زنجیرهٔ salesSupervisorId است — configure_lead_assignment نشانهٔ همین اختیار
// گسترده است)؛ نقش‌های سلسله‌مراتب فروش فقط در قلمرو زیرشاخهٔ خودشان (شامل خودشان)؛ فروشندهٔ
// ساده هرگز (باید مجوز ویژه بگیرد که در این نسخه به هیچ نقش پایه اعطا نشده). همین تابع هم برای
// «تخصیص اول» هم برای «انتقال» استفاده می‌شود — تفاوت انتقال بعد از اولین تماس در Handler اعمال می‌شود.
export function canAssignLeadTo(
  assigner: User, targetUserId: string, allUsers: User[], isUnrestrictedAssigner: boolean
): { ok: true } | { ok: false; reason: string } {
  if (isUnrestrictedAssigner) return { ok: true };
  const target = allUsers.find((u) => u.id === targetUserId);
  if (!target) return { ok: false, reason: 'کاربر مقصد یافت نشد.' };
  if (target.isActive === false) return { ok: false, reason: 'کاربر مقصد غیرفعال است — نمی‌توان Lead فعال به او تخصیص داد.' };
  const territory = getSubordinateUserIds(assigner, allUsers);
  if (!territory.includes(targetUserId)) {
    return { ok: false, reason: 'کاربر مقصد خارج از قلمرو سازمانی شماست.' };
  }
  return { ok: true };
}

// قبل از اولین تماس: هر مدیر مجاز (assign_sales_lead) می‌تواند Lead را جابه‌جا کند. بعد از
// اولین تماس ثبت‌شده: فقط با دلیل + مجوز اختصاصی reassign_sales_lead.
export function canTransferLead(
  lead: Lead, hasReassignPermission: boolean, reason: string | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!lead.hadFirstContact) return { ok: true };
  if (!hasReassignPermission) return { ok: false, reason: 'برای انتقال Lead بعد از اولین تماس، مجوز اختصاصی انتقال لازم است.' };
  if (!reason || !reason.trim()) return { ok: false, reason: 'برای انتقال Lead بعد از اولین تماس، ثبت دلیل الزامی است.' };
  return { ok: true };
}

export function assignLead(
  lead: Lead, targetUserId: string, targetUserName: string, actor: { id: string; fullName: string }, now: string, reason?: string
): Lead {
  const entry: LeadTimelineEntry = {
    id: `${lead.id}_t${lead.timeline.length}`, type: 'assigned',
    title: lead.currentOwnerUserId ? `Lead به ${targetUserName} منتقل شد` : `Lead به ${targetUserName} تخصیص یافت`,
    detail: reason, actorUserId: actor.id, actorUserName: actor.fullName, timestamp: now
  };
  return {
    ...lead, currentOwnerUserId: targetUserId, currentOwnerUserName: targetUserName,
    status: lead.status === 'new' ? 'pending_action' : lead.status,
    timeline: [...lead.timeline, entry]
  };
}

// تخلیهٔ صف یک فروشنده (مثلاً غیرفعال‌شده) — فقط Leadهای غیرنهایی (باز) منتقل می‌شوند؛
// Leadهای بسته/برد/باخت/شماره اشتباه دست‌نخورده در تاریخچهٔ فروشندهٔ قبلی می‌مانند.
export function drainSalespersonQueue(
  leads: Lead[], fromUserId: string, toUserId: string, toUserName: string, actor: { id: string; fullName: string }, now: string
): { updatedLeads: Lead[]; drainedCount: number } {
  let drainedCount = 0;
  const updatedLeads = leads.map((lead) => {
    if (lead.currentOwnerUserId !== fromUserId || isTerminalLeadStatus(lead.status)) return lead;
    drainedCount++;
    return assignLead(lead, toUserId, toUserName, actor, now, 'تخلیهٔ صف فروشندهٔ غیرفعال/خروجی');
  });
  return { updatedLeads, drainedCount };
}

// تخلیهٔ صف به مخزن «تخلیه‌شده» مدیر داده (بند ۲۱ AGENTS.md / چرخهٔ عمر نیروی فروش) — برخلاف
// drainSalespersonQueue بالا (که یک سرپرست صراحتاً یک جانشین مشخص را انتخاب می‌کند)، این تابع
// هرگز مستقیماً به فروشندهٔ دیگری واگذار نمی‌کند: مالک جاری خالی و distributionState برابر
// drained می‌شود؛ status/lastCallOutcome/callbackAt/actionDeadline/timeline دست‌نخورده می‌مانند —
// فقط یک رویداد timeline توضیحی اضافه می‌شود. مدیر داده بعداً دربارهٔ تخصیص مجدد تصمیم می‌گیرد.
export function drainLeadsToPool(
  leads: Lead[], fromUserId: string, fromUserName: string, reason: string,
  actor: { id: string; fullName: string }, now: string, transferRequestId?: string
): { updatedLeads: Lead[]; drainedLeadIds: string[] } {
  const drainedLeadIds: string[] = [];
  const updatedLeads = leads.map((lead) => {
    if (lead.currentOwnerUserId !== fromUserId || isTerminalLeadStatus(lead.status)) return lead;
    drainedLeadIds.push(lead.id);
    const entry: LeadTimelineEntry = {
      id: `${lead.id}_t${lead.timeline.length}`, type: 'drained_to_pool',
      title: `Lead از مالکیت ${fromUserName} خارج و به مخزن تخلیه‌شده برگردانده شد`,
      detail: reason, actorUserId: actor.id, actorUserName: actor.fullName, timestamp: now
    };
    return {
      ...lead,
      currentOwnerUserId: undefined, currentOwnerUserName: undefined,
      distributionState: 'drained' as const,
      drainedFromUserId: fromUserId, drainedFromUserName: fromUserName,
      drainReason: reason, drainedAt: now, drainedByUserId: actor.id, drainedByUserName: actor.fullName,
      transferRequestId,
      timeline: [...lead.timeline, entry]
    };
  });
  return { updatedLeads, drainedLeadIds };
}
