import { User, Customer, CustomerSalesOperationStatus } from '../types';
import { getJalaliNow } from './persianDate';
import { normalizePhone } from './customerIdentity';

// Sales module helpers (گام اول: مشتری). All hierarchy here is driven purely by
// User.salesSupervisorId, which is completely independent of the treasury
// approvalChain/allowedApproverIds chain — never mix the two.

// Returns the ids of every customer visible to currentUser: customers whose
// activityLog contains at least one entry made by currentUser or by anyone
// below currentUser in the sales supervisor chain (salesSupervisorId).
// Admins see every customer.
export function getVisibleCustomerIds(currentUser: User, allUsers: User[], allCustomers: Customer[]): string[] {
  if (!currentUser) return [];
  if (currentUser.role === 'admin') return allCustomers.map((c) => c.id);

  const subordinateIds = new Set<string>([currentUser.id]);
  let added = true;
  while (added) {
    added = false;
    for (const u of allUsers) {
      if (u.salesSupervisorId && subordinateIds.has(u.salesSupervisorId) && !subordinateIds.has(u.id)) {
        subordinateIds.add(u.id);
        added = true;
      }
    }
  }

  // پروفایل‌های isAbsorbed (جذب‌شده در یک ادغام) دیگر به‌عنوان رکورد مستقل قابل‌مشاهده/قفل‌شدنی
  // نیستند — تاریخچه‌شان از طریق پروفایل مادر در دسترس می‌ماند، نه از طریق این لیست.
  return allCustomers
    .filter((c) => !c.isAbsorbed)
    .filter((c) => (c.activityLog || []).some((log) => subordinateIds.has(log.salespersonId)))
    .map((c) => c.id);
}

// زیرشاخهٔ سلسله‌مراتب فروش (خودِ کاربر + هر کسی که مستقیم/غیرمستقیم salesSupervisorId او را
// اشاره می‌کند) — بازاستفاده‌شده در src/utils/leadAssignment.ts برای قلمرو تخصیص/انتقال Lead،
// تا زنجیرهٔ salesSupervisorId فقط یک‌بار پیاده‌سازی شود.
export function getSubordinateUserIds(currentUser: User, allUsers: User[]): string[] {
  const subordinateIds = new Set<string>([currentUser.id]);
  let added = true;
  while (added) {
    added = false;
    for (const u of allUsers) {
      if (u.salesSupervisorId && subordinateIds.has(u.salesSupervisorId) && !subordinateIds.has(u.id)) {
        subordinateIds.add(u.id);
        added = true;
      }
    }
  }
  return Array.from(subordinateIds);
}

// Global lookup by phone (phone1/phone2 یا phoneEntries) — intentionally NOT restricted by
// hierarchy visibility, since the whole point of the dynamic ownership lock is to let ANY
// salesperson discover that a phone number already belongs to an in-progress customer, even
// one they otherwise couldn't see in their own customer list. اگر شماره به پروفایلی متعلق باشد
// که در یک ادغام جذب شده، شفاف به پروفایل مادر Resolve می‌شود (طبق مستندات: «سوابق به پروفایل
// مادر متصل می‌شوند»)، نه اینکه پروفایل جذب‌شده مستقل نمایش داده شود.
export function findCustomerByPhone(phone: string, allCustomers: Customer[]): Customer | undefined {
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  const normalized = normalizePhone(trimmed);

  const direct = allCustomers.find(
    (c) => c.phone1 === trimmed || c.phone2 === trimmed || (c.phoneEntries || []).some((e) => e.normalizedValue === normalized)
  );
  if (!direct) return undefined;
  if (!direct.isAbsorbed || !direct.mergedIntoCustomerId) return direct;

  // Resolve به ریشهٔ نهایی زنجیرهٔ ادغام (با محافظ چرخه) — اگر ریشه پیدا نشد یا چرخه بود،
  // به‌جای شکست کامل، همان پروفایل جذب‌شده را برمی‌گرداند تا کاربر چیزی گم نکند.
  const visited = new Set<string>();
  let current = direct;
  while (current.isAbsorbed && current.mergedIntoCustomerId && !visited.has(current.id)) {
    visited.add(current.id);
    const mother = allCustomers.find((c) => c.id === current.mergedIntoCustomerId);
    if (!mother) break;
    current = mother;
  }
  return current;
}

// currentActiveSalespersonId is deliberately not a stored field (per the design) — it's
// always derived from activityLog at read time, so it can never drift out of sync.
export function getCurrentActiveSalespersonId(customer: Customer): string | null {
  const activeEntry = (customer.activityLog || []).find((log) => log.status === 'active');
  return activeEntry ? activeEntry.salespersonId : null;
}

// محاسبه‌شده (نه ذخیره‌شده) — «آزاد/چرخه فعال» از activityLog طبق منطق موجود؛ pending_action/
// overdue_no_action/completed فقط وقتی فعلاً 'free' است از salesOperationStatusOverride خوانده
// می‌شود (زیرساخت فاز ۱؛ صف کامل Lead/سررسید در فاز بعد این مقدار را واقعاً مدیریت می‌کند).
export function getCustomerSalesOperationStatus(customer: Customer): CustomerSalesOperationStatus {
  if (getCurrentActiveSalespersonId(customer) !== null) return 'active_cycle';
  return customer.salesOperationStatusOverride || 'free';
}

// A customer is free to start a new sale cycle only when no 'active' entry exists yet, AND
// (اصلاح فاز ۱ CRM) شکایت فعال/در دورهٔ انتظار یا محدودیت صریح «ممنوع از تماس» هم مانع می‌شود —
// هم در UI هم در سطح Handler باید دوباره چک شود. «بدون اقدام» فروشنده (pending_action/
// overdue_no_action) و «ممنوع از تماس» مشتری دو مفهوم کاملاً مستقل‌اند، اینجا قاطی نمی‌شوند.
export function canStartNewSale(customer: Customer): { ok: true } | { ok: false; reason: string } {
  if (getCurrentActiveSalespersonId(customer) !== null) {
    return { ok: false, reason: 'یک چرخهٔ فروش فعال دیگر روی این مشتری در حال انجام است.' };
  }
  if (customer.complaintStatus === 'active') {
    return { ok: false, reason: 'مشتری دارای شکایت فعال است و تا پایان رسیدگی از چرخهٔ فروش خارج شده است.' };
  }
  if (customer.complaintStatus === 'cooldown') {
    return { ok: false, reason: 'مشتری در دورهٔ انتظار پس از رسیدگی به شکایت است و هنوز آزاد نشده.' };
  }
  if (customer.contactPermissionStatus === 'do_not_contact') {
    return { ok: false, reason: 'این مشتری در وضعیت «ممنوع از تماس» است.' };
  }
  return { ok: true };
}

// Appends a new 'active' activityLog entry for salespersonId. No-ops (returns the
// customer unchanged) if canStartNewSale is false — callers must check canStartNewSale
// first and surface its reason instead of calling this blindly.
export function startNewSaleCycle(customer: Customer, salespersonId: string): Customer {
  if (canStartNewSale(customer).ok === false) return customer;
  return {
    ...customer,
    activityLog: [
      ...(customer.activityLog || []),
      { id: `actlog_${customer.id}_${Date.now()}`, salespersonId, startedAt: getJalaliNow(), status: 'active' as const }
    ]
  };
}

// Manual/test-only closing of the currently active cycle (real "invoice completed" logic
// arrives in the next phase). Only the owning salesperson should be allowed to call this —
// enforced by the caller (CustomersView) checking getCurrentActiveSalespersonId first.
export function closeSaleCycle(customer: Customer, salespersonId: string): Customer {
  const activeId = getCurrentActiveSalespersonId(customer);
  if (activeId !== salespersonId) return customer;
  return {
    ...customer,
    activityLog: (customer.activityLog || []).map((log) =>
      log.status === 'active' && log.salespersonId === salespersonId ? { ...log, status: 'completed' as const } : log
    )
  };
}
