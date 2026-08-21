import {
  Customer, CustomerPhoneEntry, CustomerNameEntry, CustomerAddressEntry, CustomerMergeRequest, CustomerMergeEvent, CustomerSplitEvent,
  CustomerSnapshot, CustomerMatchReason, CustomerMergeMatchType, ClaimedPurchase, ClaimedPurchaseStatus, SystemPermission,
  CustomerStatusChangeEvent, CustomerContactStatus, CustomerEntryConflict, CustomerValueSource, AttachmentFile
} from '../types';

// ============================================================
// موتور تطبیق/ادغام/جداسازی پروفایل یکپارچه مشتری (فاز ۱ CRM) — کاملاً خالص.
// هیچ localStorage/alert/logAudit داخل این فایل نیست؛ هر تابع فقط ورودی می‌گیرد و خروجی
// ساختاریافته برمی‌گرداند. ذخیره‌سازی/Audit مسئولیت Handler در کامپوننت فراخواننده است
// (الگوی src/utils/batchCalculations.ts و src/utils/orgHierarchy.ts همین پروژه).
// ============================================================

// --- نرمال‌سازی ---

export function normalizePhone(raw: string): string {
  if (!raw) return '';
  const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const digits = faToEn(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0098')) return '0' + digits.slice(4);
  if (digits.startsWith('98') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.length === 10 && digits.startsWith('9')) return '0' + digits;
  return digits;
}

export function normalizeName(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[‌​]/g, ' ') // نیم‌فاصله/ZWSP -> فاصله
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeAddress(raw?: string, province?: string, city?: string, postalCode?: string): string {
  const parts = [province, city, raw, postalCode].filter(Boolean).join(' ');
  return normalizeName(parts);
}

// --- ابزار داخلی مقایسه/استخراج مقدار اصلی ---

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp: number[] = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bl; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[bl];
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 100 : Math.round((1 - dist / maxLen) * 100);
}

function getAllNormalizedPhones(c: Customer): string[] {
  const fromEntries = (c.phoneEntries || []).map((e) => e.normalizedValue);
  const legacy = [c.phone1, c.phone2].filter((p): p is string => !!p).map((p) => normalizePhone(p));
  return Array.from(new Set([...fromEntries, ...legacy].filter(Boolean)));
}

function getPrimaryPhoneValue(c: Customer): string {
  const entry = c.phoneEntries?.find((e) => e.isCurrentPrimary) || c.phoneEntries?.[0];
  return entry?.value || c.phone1 || '';
}

function getPrimaryNameValue(c: Customer): string {
  const entry = c.nameEntries?.find((e) => e.isCurrentPrimary) || c.nameEntries?.[0];
  return entry?.value || c.fullName || '';
}

function getPrimaryAddressValue(c: Customer): string {
  const entry = c.addressEntries?.find((e) => e.isCurrentPrimary) || c.addressEntries?.[0];
  return entry?.address || c.address || '';
}

// --- آستانه‌های قابل‌تنظیم (بدون عدد جادویی پنهان در منطق) ---
export const NAME_ADDRESS_CONFLICT_THRESHOLD = 40; // زیر این امتیاز، با شماره یکسان = تعارض جدی
export const SIMILARITY_SUGGESTION_THRESHOLD = 90; // بالای این، با شماره متفاوت = فقط پیشنهاد Merge

// --- بخش ۱-الف: تفکیک Import/ورود اطلاعات از Merge ---

export interface IncomingCustomerData {
  phone: string;
  name?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
}

export type IncomingCustomerDataResolution =
  | { action: 'attach_to_existing'; targetCustomerId: string }
  | { action: 'create_new' }
  | { action: 'conflict_needs_review'; conflictingCustomerIds: string[]; reason: string };

// ورود/افزودن اطلاعات جدید — هرگز «ساخت پروفایل تکراری و بعد Merge» نیست. یا به پروفایل فعال
// یکتای موجود بدون تعارض متصل می‌شود (attach_to_existing)، یا پروفایل تازه ساخته می‌شود، یا (اگر
// بیش از یک پروفایل فعال یا تعارض جدی نام/آدرس باشد) متوقف و به کارتابل تعارض ارجاع می‌شود.
export function resolveIncomingCustomerData(
  incoming: IncomingCustomerData,
  allCustomers: Customer[]
): IncomingCustomerDataResolution {
  const normalizedPhone = normalizePhone(incoming.phone);
  if (!normalizedPhone) return { action: 'create_new' };

  const activeMatches = allCustomers.filter((c) => !c.isAbsorbed && getAllNormalizedPhones(c).includes(normalizedPhone));

  if (activeMatches.length === 0) return { action: 'create_new' };

  if (activeMatches.length > 1) {
    return {
      action: 'conflict_needs_review',
      conflictingCustomerIds: activeMatches.map((c) => c.id),
      reason: 'بیش از یک پروفایل فعال با این شماره یافت شد'
    };
  }

  const match = activeMatches[0];
  const nameScore = incoming.name ? similarityRatio(normalizeName(incoming.name), normalizeName(getPrimaryNameValue(match))) : 100;
  const addressScore = incoming.address
    ? similarityRatio(
        normalizeAddress(incoming.address, incoming.province, incoming.city, incoming.postalCode),
        normalizeAddress(getPrimaryAddressValue(match), match.province, match.city, match.postalCode)
      )
    : 100;
  const nameConflict = !!incoming.name && nameScore < NAME_ADDRESS_CONFLICT_THRESHOLD;
  const addressConflict = !!incoming.address && addressScore < NAME_ADDRESS_CONFLICT_THRESHOLD;

  if (nameConflict || addressConflict) {
    return {
      action: 'conflict_needs_review',
      conflictingCustomerIds: [match.id],
      reason: `تعارض جدی در ${nameConflict ? 'نام' : 'آدرس'} با پروفایل موجود (شمارهٔ یکسان)`
    };
  }

  return { action: 'attach_to_existing', targetCustomerId: match.id };
}

// زیرساخت Import گروهی (UI آپلود فایل به فاز بعد موکول است) — یک ردیف متعارض بقیهٔ ردیف‌های
// سالم را متوقف نمی‌کند؛ هر ردیف کاملاً مستقل پردازش می‌شود.
export interface ImportRowInput extends IncomingCustomerData {
  rowIndex: number;
}
export interface ImportRowResult {
  rowIndex: number;
  outcome: 'created' | 'attached' | 'conflict' | 'error';
  customerId?: string;
  conflictReason?: string;
  errorMessage?: string;
}
export interface ImportResultSummary {
  createdCount: number;
  attachedCount: number;
  conflictCount: number;
  errorCount: number;
  rows: ImportRowResult[];
}

export function resolveIncomingCustomerDataBatch(rows: ImportRowInput[], allCustomers: Customer[]): ImportResultSummary {
  const rowResults: ImportRowResult[] = [];
  let createdCount = 0;
  let attachedCount = 0;
  let conflictCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      const resolution = resolveIncomingCustomerData(row, allCustomers);
      if (resolution.action === 'create_new') {
        createdCount++;
        rowResults.push({ rowIndex: row.rowIndex, outcome: 'created' });
      } else if (resolution.action === 'attach_to_existing') {
        attachedCount++;
        rowResults.push({ rowIndex: row.rowIndex, outcome: 'attached', customerId: resolution.targetCustomerId });
      } else {
        conflictCount++;
        rowResults.push({ rowIndex: row.rowIndex, outcome: 'conflict', conflictReason: resolution.reason });
      }
    } catch (err) {
      errorCount++;
      rowResults.push({ rowIndex: row.rowIndex, outcome: 'error', errorMessage: err instanceof Error ? err.message : 'خطای ناشناخته' });
    }
  }

  return { createdCount, attachedCount, conflictCount, errorCount, rows: rowResults };
}

// --- بخش ۱-ب: امتیاز تشابه برای درخواست Merge دستی ---

export interface MatchScoreResult {
  overallScore: number;
  matchType: CustomerMergeMatchType;
  reasons: CustomerMatchReason[];
}

export function computeMatchScore(a: Customer, b: Customer): MatchScoreResult {
  const aPhones = getAllNormalizedPhones(a);
  const bPhones = getAllNormalizedPhones(b);
  const sharedPhone = aPhones.some((p) => bPhones.includes(p));
  const nameScore = similarityRatio(normalizeName(getPrimaryNameValue(a)), normalizeName(getPrimaryNameValue(b)));
  const addressScore = similarityRatio(
    normalizeAddress(getPrimaryAddressValue(a), a.province, a.city, a.postalCode),
    normalizeAddress(getPrimaryAddressValue(b), b.province, b.city, b.postalCode)
  );

  const reasons: CustomerMatchReason[] = [
    { field: 'phone', score: sharedPhone ? 100 : 0, note: sharedPhone ? 'شماره تماس مشترک' : 'بدون شماره تماس مشترک' },
    { field: 'name', score: nameScore, note: `شباهت نام ${nameScore}٪` },
    { field: 'address', score: addressScore, note: `شباهت آدرس ${addressScore}٪` }
  ];

  if (sharedPhone) {
    const overallScore = Math.round((nameScore + addressScore) / 2 * 0.5 + 50);
    return { overallScore, matchType: 'exact_phone_similarity', reasons };
  }

  const overallScore = Math.round((nameScore + addressScore) / 2);
  return { overallScore, matchType: 'name_address_similarity', reasons };
}

export interface MergeCandidate {
  customer: Customer;
  overallScore: number;
  matchType: CustomerMergeMatchType;
  reasons: CustomerMatchReason[];
}

// پروفایل‌های isAbsorbed حذف می‌شوند؛ فقط شمارهٔ یکسان یا شباهت نام/آدرس بالای آستانه پیشنهاد می‌شود
// — شباهت نام/آدرس به‌تنهایی (بدون شماره مشترک) هرگز زیر آستانه پیشنهاد نمی‌سازد.
export function findMergeCandidates(target: Customer, allCustomers: Customer[]): MergeCandidate[] {
  return allCustomers
    .filter((c) => c.id !== target.id && !c.isAbsorbed)
    .map((c) => ({ customer: c, ...computeMatchScore(target, c) }))
    .filter((r) => r.matchType === 'exact_phone_similarity' || r.overallScore >= SIMILARITY_SUGGESTION_THRESHOLD)
    .sort((a, b) => b.overallScore - a.overallScore);
}

// زنجیرهٔ mergedIntoCustomerId را با محافظ چرخه تا ریشهٔ نهایی Resolve می‌کند.
export function resolveRootProfile(
  customerId: string,
  allCustomers: Customer[]
): { ok: true; rootId: string } | { ok: false; errorCode: 'CYCLE_DETECTED' | 'NOT_FOUND'; message: string } {
  const byId = new Map(allCustomers.map((c) => [c.id, c]));
  const visited = new Set<string>();
  let currentId = customerId;

  while (true) {
    if (visited.has(currentId)) {
      return { ok: false, errorCode: 'CYCLE_DETECTED', message: 'چرخه در زنجیرهٔ ادغام (mergedIntoCustomerId) شناسایی شد.' };
    }
    if (visited.size > 200) {
      return { ok: false, errorCode: 'CYCLE_DETECTED', message: 'حداکثر عمق مجاز زنجیرهٔ ادغام رد شد.' };
    }
    visited.add(currentId);
    const current = byId.get(currentId);
    if (!current) return { ok: false, errorCode: 'NOT_FOUND', message: `پروفایل ${currentId} یافت نشد.` };
    if (!current.isAbsorbed || !current.mergedIntoCustomerId) return { ok: true, rootId: currentId };
    currentId = current.mergedIntoCustomerId;
  }
}

// --- Snapshot نسخه‌دار (فقط برای Audit/Drift، نه بازیابی) ---

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function buildSnapshot(c: Customer, schemaVersion: number, operationId: string, capturedAt: string): CustomerSnapshot {
  const identityValueIds = {
    phoneEntryIds: (c.phoneEntries || []).map((e) => e.id),
    nameEntryIds: (c.nameEntries || []).map((e) => e.id),
    addressEntryIds: (c.addressEntries || []).map((e) => e.id)
  };
  const relatedRecordIds = {
    activityLogIds: (c.activityLog || []).map((e) => e.id).filter((id): id is string => !!id),
    claimedPurchaseIds: [] as string[] // ادعاهای خرید موجودیت مستقل‌اند؛ در سطح فراخواننده (در صورت نیاز) پر می‌شود
  };
  const statusesAtCapture = {
    identityStatus: c.identityStatus,
    financialStatus: c.financialStatus,
    complaintStatus: c.complaintStatus,
    contactPermissionStatus: c.contactPermissionStatus,
    salesOperationStatusOverride: c.salesOperationStatusOverride,
    satisfactionStatus: c.satisfactionStatus
  };
  const hashSource = JSON.stringify({
    fullName: c.fullName, phone1: c.phone1, phone2: c.phone2, identityValueIds
  });
  return {
    schemaVersion,
    customerId: c.id,
    capturedAt,
    baseProfile: {
      fullName: c.fullName, phone1: c.phone1, phone2: c.phone2,
      address: c.address, province: c.province, city: c.city, postalCode: c.postalCode, createdAt: c.createdAt
    },
    identityValueIds,
    relatedRecordIds,
    statusesAtCapture,
    operationId,
    hash: simpleHash(hashSource)
  };
}

// --- بخش ۱-ب / Merge اجرایی (کپی‌محور — نه Snapshot-restore محور) ---

export interface MergeExecutionResult {
  updatedCustomers: Customer[];
  event: CustomerMergeEvent;
}
export type MergeExecutionOutcome = { ok: true; data: MergeExecutionResult } | { ok: false; errorCode: string; message: string };

// پس از بررسی‌های ایمنی، Entry های هر پروفایل جذب‌شده روی مادر «کپی» می‌شوند (نه منتقل) —
// پروفایل جذب‌شده هیچ فیلدی از دست نمی‌دهد، فقط isAbsorbed/mergedIntoCustomerId می‌گیرد؛
// نسخهٔ اصلی Entry هایش دست‌نخورده روی خودش می‌ماند (خودش «Backup زنده» است).
export function executeMerge(
  request: CustomerMergeRequest,
  allCustomers: Customer[],
  existingMergeEvents: CustomerMergeEvent[],
  executor: { id: string; fullName: string },
  now: string
): MergeExecutionOutcome {
  if (request.status !== 'pending') {
    return { ok: false, errorCode: 'REQUEST_NOT_PENDING', message: 'این درخواست ادغام دیگر در وضعیت «در انتظار» نیست.' };
  }
  if (existingMergeEvents.some((e) => e.idempotencyKey === request.idempotencyKey)) {
    return { ok: false, errorCode: 'DUPLICATE_IDEMPOTENCY_KEY', message: 'این درخواست ادغام قبلاً اجرا شده است.' };
  }

  const uniqueIds = Array.from(new Set(request.profileIds));
  if (uniqueIds.length !== request.profileIds.length) {
    return { ok: false, errorCode: 'DUPLICATE_PROFILE_IDS', message: 'شناسه‌های تکراری در فهرست پروفایل‌های ادغام وجود دارد.' };
  }
  if (uniqueIds.length < 2) {
    return { ok: false, errorCode: 'INSUFFICIENT_PROFILES', message: 'برای ادغام حداقل به دو پروفایل مستقل نیاز است.' };
  }
  if (!uniqueIds.includes(request.motherProfileId)) {
    return { ok: false, errorCode: 'INVALID_MOTHER_PROFILE', message: 'پروفایل مادر باید عضو فهرست پروفایل‌های ادغام باشد.' };
  }

  const byId = new Map(allCustomers.map((c) => [c.id, c]));
  for (const id of uniqueIds) {
    const c = byId.get(id);
    if (!c) return { ok: false, errorCode: 'PROFILE_NOT_FOUND', message: `پروفایل ${id} یافت نشد.` };
    if (c.isAbsorbed) return { ok: false, errorCode: 'PROFILE_ALREADY_ABSORBED', message: `پروفایل ${id} قبلاً در یک ادغام دیگر جذب شده است.` };
  }

  const mother = byId.get(request.motherProfileId)!;
  const absorbedIds = uniqueIds.filter((id) => id !== request.motherProfileId);

  const transferredValueIds = {
    phoneEntryIds: [] as string[], nameEntryIds: [] as string[], addressEntryIds: [] as string[],
    activityLogIds: [] as string[], claimedPurchaseIds: [] as string[]
  };

  let updatedMother: Customer = {
    ...mother,
    phoneEntries: [...(mother.phoneEntries || [])],
    nameEntries: [...(mother.nameEntries || [])],
    addressEntries: [...(mother.addressEntries || [])],
    activityLog: [...(mother.activityLog || [])]
  };

  const beforeSnapshot: CustomerSnapshot[] = [];

  for (const absorbedId of absorbedIds) {
    const absorbed = byId.get(absorbedId)!;
    beforeSnapshot.push(buildSnapshot(absorbed, 1, request.id, now));

    for (const entry of absorbed.phoneEntries || []) {
      if (!updatedMother.phoneEntries!.some((e) => e.id === entry.id)) {
        updatedMother.phoneEntries!.push({ ...entry, isCurrentPrimary: false });
        transferredValueIds.phoneEntryIds.push(entry.id);
      }
    }
    for (const entry of absorbed.nameEntries || []) {
      if (!updatedMother.nameEntries!.some((e) => e.id === entry.id)) {
        updatedMother.nameEntries!.push({ ...entry, isCurrentPrimary: false });
        transferredValueIds.nameEntryIds.push(entry.id);
      }
    }
    for (const entry of absorbed.addressEntries || []) {
      if (!updatedMother.addressEntries!.some((e) => e.id === entry.id)) {
        updatedMother.addressEntries!.push({ ...entry, isCurrentPrimary: false });
        transferredValueIds.addressEntryIds.push(entry.id);
      }
    }
    for (const entry of absorbed.activityLog || []) {
      const entryId = entry.id || `${absorbed.id}_${entry.startedAt}_${entry.salespersonId}`;
      if (!updatedMother.activityLog!.some((e) => (e.id || '') === entryId)) {
        updatedMother.activityLog!.push({ ...entry, id: entryId });
        transferredValueIds.activityLogIds.push(entryId);
      }
    }
  }

  updatedMother.updatedAt = now;
  updatedMother.version = (mother.version || 0) + 1;

  const afterSnapshot = buildSnapshot(updatedMother, 1, request.id, now);

  const updatedCustomers = allCustomers.map((c) => {
    if (c.id === mother.id) return updatedMother;
    if (absorbedIds.includes(c.id)) return { ...c, isAbsorbed: true, mergedIntoCustomerId: mother.id, updatedAt: now };
    return c;
  });

  const event: CustomerMergeEvent = {
    id: `merge_evt_${request.id}`,
    mergeRequestId: request.id,
    idempotencyKey: request.idempotencyKey,
    motherProfileId: mother.id,
    mergedProfileIds: absorbedIds,
    transferredValueIds,
    motherProfileReason: request.motherProfileReason,
    executedByUserId: executor.id,
    executedByUserName: executor.fullName,
    executedAt: now,
    beforeSnapshot,
    afterSnapshot
  };

  return { ok: true, data: { updatedCustomers, event } };
}

// --- پیش‌نمایش و اجرای Split ---

export interface SplitPreview {
  safeToRemoveEntryIds: { phoneEntryIds: string[]; nameEntryIds: string[]; addressEntryIds: string[] };
  needsDestinationEntryIds: { phoneEntryIds: string[]; nameEntryIds: string[]; addressEntryIds: string[] };
  driftedEntryIds: { phoneEntryIds: string[]; nameEntryIds: string[]; addressEntryIds: string[] };
  hasDrift: boolean;
}
export type SplitPreviewOutcome = { ok: true; data: SplitPreview } | { ok: false; errorCode: string; message: string };

// Entry هایی که id‌شان در transferredValueIds هست ولی از زمان Merge روی مادر تغییر نکرده‌اند
// «امن برای حذف از مادر»‌اند (نسخهٔ اصلی‌شان دست‌نخورده روی پروفایل جذب‌شده هست). Entry هایی که
// بعد از Merge مستقیماً به مادر اضافه شدند (در afterSnapshot زمان Merge نبودند) نیاز به تعیین
// مقصد دارند. اگر مقدار یک Entry منتقل‌شده روی مادر نسبت به نسخهٔ اصلی‌اش تغییر کرده باشد
// (Drift)، به‌جای سکوت هشدار صریح برمی‌گردد.
export function previewSplit(event: CustomerMergeEvent, allCustomers: Customer[]): SplitPreviewOutcome {
  const mother = allCustomers.find((c) => c.id === event.motherProfileId);
  if (!mother) return { ok: false, errorCode: 'MOTHER_NOT_FOUND', message: 'پروفایل مادر یافت نشد.' };

  const absorbedProfiles = event.mergedProfileIds
    .map((id) => allCustomers.find((c) => c.id === id))
    .filter((c): c is Customer => !!c);

  const originalPhoneById = new Map<string, CustomerPhoneEntry>();
  const originalNameById = new Map<string, { value: string }>();
  const originalAddressById = new Map<string, { address: string }>();
  for (const absorbed of absorbedProfiles) {
    for (const e of absorbed.phoneEntries || []) originalPhoneById.set(e.id, e);
    for (const e of absorbed.nameEntries || []) originalNameById.set(e.id, e);
    for (const e of absorbed.addressEntries || []) originalAddressById.set(e.id, e);
  }

  const motherPhoneIds = (mother.phoneEntries || []).map((e) => e.id);
  const motherNameIds = (mother.nameEntries || []).map((e) => e.id);
  const motherAddressIds = (mother.addressEntries || []).map((e) => e.id);

  const transferredSet = {
    phone: new Set(event.transferredValueIds.phoneEntryIds),
    name: new Set(event.transferredValueIds.nameEntryIds),
    address: new Set(event.transferredValueIds.addressEntryIds)
  };
  const afterMerge = event.afterSnapshot.identityValueIds;

  const safeToRemoveEntryIds = {
    phoneEntryIds: motherPhoneIds.filter((id) => transferredSet.phone.has(id)),
    nameEntryIds: motherNameIds.filter((id) => transferredSet.name.has(id)),
    addressEntryIds: motherAddressIds.filter((id) => transferredSet.address.has(id))
  };
  const needsDestinationEntryIds = {
    phoneEntryIds: motherPhoneIds.filter((id) => !afterMerge.phoneEntryIds.includes(id)),
    nameEntryIds: motherNameIds.filter((id) => !afterMerge.nameEntryIds.includes(id)),
    addressEntryIds: motherAddressIds.filter((id) => !afterMerge.addressEntryIds.includes(id))
  };

  const driftedEntryIds = {
    phoneEntryIds: (mother.phoneEntries || [])
      .filter((e) => transferredSet.phone.has(e.id))
      .filter((e) => { const orig = originalPhoneById.get(e.id); return !!orig && orig.value !== e.value; })
      .map((e) => e.id),
    nameEntryIds: (mother.nameEntries || [])
      .filter((e) => transferredSet.name.has(e.id))
      .filter((e) => { const orig = originalNameById.get(e.id); return !!orig && orig.value !== e.value; })
      .map((e) => e.id),
    addressEntryIds: (mother.addressEntries || [])
      .filter((e) => transferredSet.address.has(e.id))
      .filter((e) => { const orig = originalAddressById.get(e.id); return !!orig && orig.address !== e.address; })
      .map((e) => e.id)
  };
  const hasDrift = driftedEntryIds.phoneEntryIds.length > 0 || driftedEntryIds.nameEntryIds.length > 0 || driftedEntryIds.addressEntryIds.length > 0;

  return { ok: true, data: { safeToRemoveEntryIds, needsDestinationEntryIds, driftedEntryIds, hasDrift } };
}

export interface SplitExecutionResult {
  updatedCustomers: Customer[];
  splitEvent: CustomerSplitEvent;
}
export type SplitExecutionOutcome = { ok: true; data: SplitExecutionResult } | { ok: false; errorCode: string; message: string };

export function executeSplit(
  event: CustomerMergeEvent,
  allCustomers: Customer[],
  existingSplitEvents: CustomerSplitEvent[],
  requester: { id: string },
  decider: { id: string; fullName: string },
  reason: string,
  destinationChoices: Record<string, string>,
  idempotencyKey: string,
  now: string
): SplitExecutionOutcome {
  if (!reason.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر دلیل جداسازی الزامی است.' };
  if (existingSplitEvents.some((e) => e.idempotencyKey === idempotencyKey)) {
    return { ok: false, errorCode: 'DUPLICATE_IDEMPOTENCY_KEY', message: 'این جداسازی قبلاً اجرا شده است.' };
  }
  if (existingSplitEvents.some((e) => e.originalMergeEventId === event.id)) {
    return { ok: false, errorCode: 'ALREADY_SPLIT', message: 'این عملیات ادغام قبلاً جداسازی شده است.' };
  }

  const preview = previewSplit(event, allCustomers);
  if (preview.ok === false) return preview;

  const { safeToRemoveEntryIds, needsDestinationEntryIds } = preview.data;
  const allNeedsDestIds = [
    ...needsDestinationEntryIds.phoneEntryIds, ...needsDestinationEntryIds.nameEntryIds, ...needsDestinationEntryIds.addressEntryIds
  ];
  const missingDestination = allNeedsDestIds.filter((id) => !destinationChoices[id]);
  if (missingDestination.length > 0) {
    return {
      ok: false,
      errorCode: 'MISSING_DESTINATION',
      message: `برای ${missingDestination.length} مورد اطلاعات ثبت‌شده پس از ادغام، مقصد مشخص نشده است — ابتدا مقصد را برای همهٔ موارد تعیین کنید.`
    };
  }

  const byId = new Map(allCustomers.map((c) => [c.id, c]));
  const mother = byId.get(event.motherProfileId);
  if (!mother) return { ok: false, errorCode: 'MOTHER_NOT_FOUND', message: 'پروفایل مادر یافت نشد.' };

  let finalMother: Customer = {
    ...mother,
    phoneEntries: (mother.phoneEntries || []).filter((e) => !safeToRemoveEntryIds.phoneEntryIds.includes(e.id)),
    nameEntries: (mother.nameEntries || []).filter((e) => !safeToRemoveEntryIds.nameEntryIds.includes(e.id)),
    addressEntries: (mother.addressEntries || []).filter((e) => !safeToRemoveEntryIds.addressEntryIds.includes(e.id)),
    activityLog: (mother.activityLog || []).filter((e) => !event.transferredValueIds.activityLogIds.includes(e.id || '')),
    updatedAt: now,
    version: (mother.version || 0) + 1
  };

  const restoredById = new Map<string, Customer>();
  for (const absorbedId of event.mergedProfileIds) {
    const p = byId.get(absorbedId);
    if (p) restoredById.set(absorbedId, { ...p, isAbsorbed: false, mergedIntoCustomerId: undefined, updatedAt: now });
  }

  // توزیع اطلاعات ثبت‌شدهٔ بعد از Merge طبق انتخاب صریح مدیر داده
  for (const entryId of needsDestinationEntryIds.phoneEntryIds) {
    const destId = destinationChoices[entryId];
    const entry = finalMother.phoneEntries?.find((e) => e.id === entryId);
    if (!entry || destId === mother.id) continue;
    finalMother = { ...finalMother, phoneEntries: finalMother.phoneEntries!.filter((e) => e.id !== entryId) };
    const dest = restoredById.get(destId);
    if (dest) restoredById.set(destId, { ...dest, phoneEntries: [...(dest.phoneEntries || []), entry] });
  }
  for (const entryId of needsDestinationEntryIds.nameEntryIds) {
    const destId = destinationChoices[entryId];
    const entry = finalMother.nameEntries?.find((e) => e.id === entryId);
    if (!entry || destId === mother.id) continue;
    finalMother = { ...finalMother, nameEntries: finalMother.nameEntries!.filter((e) => e.id !== entryId) };
    const dest = restoredById.get(destId);
    if (dest) restoredById.set(destId, { ...dest, nameEntries: [...(dest.nameEntries || []), entry] });
  }
  for (const entryId of needsDestinationEntryIds.addressEntryIds) {
    const destId = destinationChoices[entryId];
    const entry = finalMother.addressEntries?.find((e) => e.id === entryId);
    if (!entry || destId === mother.id) continue;
    finalMother = { ...finalMother, addressEntries: finalMother.addressEntries!.filter((e) => e.id !== entryId) };
    const dest = restoredById.get(destId);
    if (dest) restoredById.set(destId, { ...dest, addressEntries: [...(dest.addressEntries || []), entry] });
  }

  const finalRestoredProfiles = Array.from(restoredById.values());

  const updatedCustomers = allCustomers.map((c) => {
    if (c.id === mother.id) return finalMother;
    const restored = finalRestoredProfiles.find((p) => p.id === c.id);
    return restored || c;
  });

  const splitEvent: CustomerSplitEvent = {
    id: `split_evt_${event.id}_${idempotencyKey.slice(0, 8)}`,
    originalMergeEventId: event.id,
    idempotencyKey,
    requestedByUserId: requester.id,
    requestedAt: now,
    decidedByUserId: decider.id,
    decidedByUserName: decider.fullName,
    decidedAt: now,
    reason,
    restoredProfileIds: event.mergedProfileIds,
    postMergeDataDestinations: destinationChoices,
    afterSnapshot: finalRestoredProfiles.map((p) => buildSnapshot(p, 1, event.id, now))
  };

  return { ok: true, data: { updatedCustomers, splitEvent } };
}

// --- View Modelهای حداقلی (الگوی src/utils/treasurySourceView.ts) ---

export interface CustomerSearchResultView {
  id: string;
  displayName: string;
  displayPhone: string;
  displayAddress?: string;
  identityStatus?: string;
  hasActiveComplaint?: boolean;
}

// وجود پروفایل مشابه همیشه قابل مشاهده است؛ تلفن/آدرس فقط با مجوز مربوطه کامل نمایش داده
// می‌شوند وگرنه Mask می‌شوند — این تنها مسیر تغذیهٔ نتایج جست‌وجو/مقایسه است، هرگز Customer خام.
export function toCustomerSearchResultView(customer: Customer, effectivePermissions: SystemPermission[] | null): CustomerSearchResultView {
  const hasPerm = (p: SystemPermission) => effectivePermissions === null || effectivePermissions.includes(p);
  const primaryPhone = getPrimaryPhoneValue(customer);
  const maskedPhone = primaryPhone.length >= 5
    ? `${primaryPhone.slice(0, 3)}•••••${primaryPhone.slice(-2)}`
    : primaryPhone ? '•••••' : '';

  return {
    id: customer.id,
    displayName: getPrimaryNameValue(customer) || 'بدون نام ثبت‌شده',
    displayPhone: hasPerm('view_customer_contact_fields') ? primaryPhone : maskedPhone,
    displayAddress: hasPerm('view_customer_address') ? getPrimaryAddressValue(customer) : undefined,
    identityStatus: customer.identityStatus,
    hasActiveComplaint: hasPerm('view_customer_complaint_summary') ? customer.complaintStatus === 'active' : undefined
  };
}

export interface PurchaseClaimFinancialView {
  id: string;
  customerDisplayName: string;
  claimedAmount: number;
  claimedDescription?: string;
  evidenceCount: number;
  evidenceAttachments: AttachmentFile[];
  submittedAt: string;
}

// مسئول مالی هرگز پروفایل کامل نمی‌بیند — فقط این خروجی حداقلی. مدرک ادعای خرید استثناست: کار
// اصلی این نقش دقیقاً بررسی همین مدرک است، پس evidenceAttachments کامل (نه فقط تعداد) در خروجی
// می‌آید؛ هیچ فیلد دیگری از پروفایل/شکایت/آدرس مشتری اینجا راه پیدا نمی‌کند.
export function toPurchaseClaimFinancialView(claim: ClaimedPurchase, customer: Customer | undefined): PurchaseClaimFinancialView {
  return {
    id: claim.id,
    customerDisplayName: customer ? getPrimaryNameValue(customer) || 'بدون نام ثبت‌شده' : 'مشتری نامشخص',
    claimedAmount: claim.claimedAmount,
    claimedDescription: claim.claimedDescription,
    evidenceCount: claim.evidenceAttachments?.length || 0,
    evidenceAttachments: claim.evidenceAttachments || [],
    submittedAt: claim.submittedAt
  };
}

// View Model مقایسهٔ Candidate در پنل درخواست ادغام — هرگز Customer خام؛ همان مسیر Mask جست‌وجو
// (toCustomerSearchResultView) را بازاستفاده می‌کند، پس داشتن صرفاً request_customer_merge کافی
// نیست برای دیدن شمارهٔ/آدرس کامل — دقیقاً مثل نتایج جست‌وجوی سراسری مجوز جداگانه لازم دارد.
export interface CustomerComparisonView extends CustomerSearchResultView {
  overallScore: number;
  matchType: CustomerMergeMatchType;
  reasons: CustomerMatchReason[];
}
export function toCustomerComparisonView(candidate: MergeCandidate, effectivePermissions: SystemPermission[] | null): CustomerComparisonView {
  const view = toCustomerSearchResultView(candidate.customer, effectivePermissions);
  return { ...view, overallScore: candidate.overallScore, matchType: candidate.matchType, reasons: candidate.reasons };
}

// ============================================================
// بخش «Handler خالص» — هر Decision زیر دقیقاً چیزی است که یک Handler کامپوننت باید انجام دهد:
// ۱) کنترل Permission ۲) کنترل وضعیت جاری (Stale/قبلاً تصمیم‌گیری‌شده) ۳) محاسبهٔ خالص نتیجه.
// بدون localStorage/logAudit/alert — Handler واقعی در کامپوننت فقط این تابع را صدا می‌زند، نتیجه
// را برای Audit استفاده می‌کند، و فقط در موفقیت Transaction را اجرا می‌کند (ترتیب صحیح Audit).
// این توابع به‌طور مستقیم و بدون رندر کامپوننت قابل تست‌اند — رفع نقطهٔ کور «فقط hasPermission
// تست شده، نه خود Handler».
// ============================================================

export type PermissionDeniedOutcome = { ok: false; errorCode: 'PERMISSION_DENIED'; message: string };

function requirePermission(effectivePermissions: SystemPermission[] | null, permission: SystemPermission): { ok: true } | PermissionDeniedOutcome {
  const has = effectivePermissions === null || effectivePermissions.includes(permission);
  if (!has) return { ok: false, errorCode: 'PERMISSION_DENIED', message: 'شما مجوز لازم برای این عملیات را ندارید.' };
  return { ok: true };
}

// --- انتخاب مقدار اصلی (فقط مدیر داده/ادمین) ---

export type PrimaryValueEntryType = 'name' | 'phone' | 'address';

export interface SelectPrimaryValueResult {
  updatedCustomer: Customer;
  statusChangeEvent: CustomerStatusChangeEvent;
}
export type SelectPrimaryValueOutcome = { ok: true; data: SelectPrimaryValueResult } | { ok: false; errorCode: string; message: string };

// مقدار قبلی هرگز حذف نمی‌شود — فقط isCurrentPrimary روی همهٔ Entry های همان نوع بازتوزیع
// می‌شود؛ فیلدهای سازگاری قدیمی (fullName/phone1/address/province/city/postalCode) همگام
// می‌شوند؛ version/updatedAt به‌روزرسانی می‌شود؛ یک CustomerStatusChangeEvent برای Timeline/Audit
// ساخته می‌شود (مقدار قبلی، مقدار جدید، دلیل، کاربر، زمان).
export function selectCustomerPrimaryValue(
  customer: Customer,
  entryType: PrimaryValueEntryType,
  entryId: string,
  reason: string,
  actor: { id: string; fullName: string },
  now: string
): SelectPrimaryValueOutcome {
  if (!reason.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر دلیل انتخاب مقدار اصلی الزامی است.' };

  if (entryType === 'name') {
    const entries = customer.nameEntries || [];
    const target = entries.find((e) => e.id === entryId);
    if (!target) return { ok: false, errorCode: 'ENTRY_NOT_FOUND', message: 'مقدار مورد نظر یافت نشد.' };
    const oldPrimary = entries.find((e) => e.isCurrentPrimary);
    if (oldPrimary?.id === entryId) return { ok: false, errorCode: 'ALREADY_PRIMARY', message: 'این مقدار همین الان به‌عنوان مقدار اصلی ثبت است.' };
    const updatedEntries: CustomerNameEntry[] = entries.map((e) => ({ ...e, isCurrentPrimary: e.id === entryId }));
    const event: CustomerStatusChangeEvent = {
      id: `statuschg_${customer.id}_${Date.now()}`,
      field: 'primaryNameEntryId', oldValue: oldPrimary?.value, newValue: target.value, reason,
      changedByUserId: actor.id, changedByName: actor.fullName, changedAt: now
    };
    const updatedCustomer: Customer = {
      ...customer, nameEntries: updatedEntries, fullName: target.value,
      updatedAt: now, version: (customer.version || 0) + 1,
      statusChangeHistory: [...(customer.statusChangeHistory || []), event]
    };
    return { ok: true, data: { updatedCustomer, statusChangeEvent: event } };
  }

  if (entryType === 'phone') {
    const entries = customer.phoneEntries || [];
    const target = entries.find((e) => e.id === entryId);
    if (!target) return { ok: false, errorCode: 'ENTRY_NOT_FOUND', message: 'مقدار مورد نظر یافت نشد.' };
    const oldPrimary = entries.find((e) => e.isCurrentPrimary);
    if (oldPrimary?.id === entryId) return { ok: false, errorCode: 'ALREADY_PRIMARY', message: 'این مقدار همین الان به‌عنوان مقدار اصلی ثبت است.' };
    const updatedEntries: CustomerPhoneEntry[] = entries.map((e) => ({ ...e, isCurrentPrimary: e.id === entryId }));
    const event: CustomerStatusChangeEvent = {
      id: `statuschg_${customer.id}_${Date.now()}`,
      field: 'primaryPhoneEntryId', oldValue: oldPrimary?.value, newValue: target.value, reason,
      changedByUserId: actor.id, changedByName: actor.fullName, changedAt: now
    };
    const updatedCustomer: Customer = {
      ...customer, phoneEntries: updatedEntries, phone1: target.value,
      updatedAt: now, version: (customer.version || 0) + 1,
      statusChangeHistory: [...(customer.statusChangeHistory || []), event]
    };
    return { ok: true, data: { updatedCustomer, statusChangeEvent: event } };
  }

  const entries = customer.addressEntries || [];
  const target = entries.find((e) => e.id === entryId);
  if (!target) return { ok: false, errorCode: 'ENTRY_NOT_FOUND', message: 'مقدار مورد نظر یافت نشد.' };
  const oldPrimary = entries.find((e) => e.isCurrentPrimary);
  if (oldPrimary?.id === entryId) return { ok: false, errorCode: 'ALREADY_PRIMARY', message: 'این مقدار همین الان به‌عنوان مقدار اصلی ثبت است.' };
  const updatedEntries: CustomerAddressEntry[] = entries.map((e) => ({ ...e, isCurrentPrimary: e.id === entryId }));
  const event: CustomerStatusChangeEvent = {
    id: `statuschg_${customer.id}_${Date.now()}`,
    field: 'primaryAddressEntryId', oldValue: oldPrimary?.address, newValue: target.address, reason,
    changedByUserId: actor.id, changedByName: actor.fullName, changedAt: now
  };
  const updatedCustomer: Customer = {
    ...customer, addressEntries: updatedEntries,
    address: target.address, province: target.province, city: target.city, postalCode: target.postalCode,
    updatedAt: now, version: (customer.version || 0) + 1,
    statusChangeHistory: [...(customer.statusChangeHistory || []), event]
  };
  return { ok: true, data: { updatedCustomer, statusChangeEvent: event } };
}

export function decideSelectPrimaryValue(
  customer: Customer, entryType: PrimaryValueEntryType, entryId: string, reason: string,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): SelectPrimaryValueOutcome {
  const perm = requirePermission(effectivePermissions, 'select_customer_primary_value');
  if (perm.ok === false) return perm;
  return selectCustomerPrimaryValue(customer, entryType, entryId, reason, actor, now);
}

// --- نتیجهٔ تماس (واحد شنود) — فقط contactStatus، هرگز contactPermissionStatus/complaintStatus/
// financialStatus/مقدار اصلی را تغییر نمی‌دهد، چون این تابع فقط همین یک فیلد را دستکاری می‌کند ---

export interface UpdateContactStatusResult {
  updatedCustomer: Customer;
  statusChangeEvent: CustomerStatusChangeEvent;
}
export type UpdateContactStatusOutcome = { ok: true; data: UpdateContactStatusResult } | { ok: false; errorCode: string; message: string };

export function updateCustomerContactStatus(
  customer: Customer, newStatus: CustomerContactStatus, reason: string,
  actor: { id: string; fullName: string }, now: string
): UpdateContactStatusOutcome {
  if (!reason.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر توضیح/دلیل نتیجهٔ تماس الزامی است.' };
  const oldValue = customer.contactStatus;
  if (oldValue === newStatus) return { ok: false, errorCode: 'NO_CHANGE', message: 'این مقدار همین الان ثبت‌شده است.' };
  const event: CustomerStatusChangeEvent = {
    id: `statuschg_${customer.id}_${Date.now()}`,
    field: 'contactStatus', oldValue, newValue: newStatus, reason,
    changedByUserId: actor.id, changedByName: actor.fullName, changedAt: now
  };
  const updatedCustomer: Customer = {
    ...customer, contactStatus: newStatus, updatedAt: now,
    statusChangeHistory: [...(customer.statusChangeHistory || []), event]
  };
  return { ok: true, data: { updatedCustomer, statusChangeEvent: event } };
}

export function decideUpdateContactStatus(
  customer: Customer, newStatus: CustomerContactStatus, reason: string,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): UpdateContactStatusOutcome {
  const perm = requirePermission(effectivePermissions, 'update_customer_contact_status');
  if (perm.ok === false) return perm;
  return updateCustomerContactStatus(customer, newStatus, reason, actor, now);
}

// --- تصمیم ادغام (مدیر داده/ادمین) ---

export interface MergeApprovalResult extends MergeExecutionResult {
  updatedRequest: CustomerMergeRequest;
}
export type MergeApprovalOutcome = { ok: true; data: MergeApprovalResult } | { ok: false; errorCode: string; message: string };

export function decideMergeApproval(
  request: CustomerMergeRequest, allCustomers: Customer[], existingMergeEvents: CustomerMergeEvent[],
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): MergeApprovalOutcome {
  const perm = requirePermission(effectivePermissions, 'approve_reject_customer_merge');
  if (perm.ok === false) return perm;
  const outcome = executeMerge(request, allCustomers, existingMergeEvents, actor, now);
  if (outcome.ok === false) return outcome;
  const updatedRequest: CustomerMergeRequest = { ...request, status: 'approved', decidedByUserId: actor.id, decidedByUserName: actor.fullName, decidedAt: now };
  return { ok: true, data: { ...outcome.data, updatedRequest } };
}

export interface MergeRejectionResult { updatedRequest: CustomerMergeRequest }
export type MergeRejectionOutcome = { ok: true; data: MergeRejectionResult } | { ok: false; errorCode: string; message: string };

export function decideMergeRejection(
  request: CustomerMergeRequest, note: string,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): MergeRejectionOutcome {
  const perm = requirePermission(effectivePermissions, 'approve_reject_customer_merge');
  if (perm.ok === false) return perm;
  if (request.status !== 'pending') return { ok: false, errorCode: 'REQUEST_NOT_PENDING', message: 'این درخواست دیگر در وضعیت «در انتظار» نیست.' };
  if (!note.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر دلیل رد الزامی است.' };
  const updatedRequest: CustomerMergeRequest = { ...request, status: 'rejected', decidedByUserId: actor.id, decidedByUserName: actor.fullName, decidedAt: now, decisionNote: note };
  return { ok: true, data: { updatedRequest } };
}

// --- تصمیم Split (مدیر داده/ادمین) ---

export function decideSplitExecution(
  event: CustomerMergeEvent, allCustomers: Customer[], existingSplitEvents: CustomerSplitEvent[],
  effectivePermissions: SystemPermission[] | null, requester: { id: string }, decider: { id: string; fullName: string },
  reason: string, destinationChoices: Record<string, string>, idempotencyKey: string, now: string
): SplitExecutionOutcome {
  const perm = requirePermission(effectivePermissions, 'split_customer_merge');
  if (perm.ok === false) return perm;
  return executeSplit(event, allCustomers, existingSplitEvents, requester, decider, reason, destinationChoices, idempotencyKey, now);
}

// --- ورود/افزودن اطلاعات به پروفایل موجود (Attach بدون تعارض) — تابع خالص مشترک بین مسیر
// ثبت مستقیم فروشنده (CustomersView) و تعیین‌تکلیف Conflict توسط مدیر داده ---

export function attachIncomingValuesToCustomer(
  target: Customer,
  incoming: { phone?: string; name?: string; address?: string; province?: string; city?: string; postalCode?: string },
  source: CustomerValueSource,
  recordedBy: { id: string; fullName: string },
  now: string
): Customer {
  const normalizedIncomingPhone = incoming.phone ? normalizePhone(incoming.phone) : '';
  const phoneAlreadyRecorded = !incoming.phone || (target.phoneEntries || []).some((e) => e.normalizedValue === normalizedIncomingPhone);
  const newPhoneEntry: CustomerPhoneEntry | null = incoming.phone && !phoneAlreadyRecorded ? {
    id: `phone_${target.id}_${Date.now()}`, value: incoming.phone, normalizedValue: normalizedIncomingPhone,
    source, recordedAt: now, recordedByUserId: recordedBy.id, recordedByName: recordedBy.fullName,
    isCustomerConfirmed: false, isCurrentPrimary: false
  } : null;

  const normalizedIncomingName = incoming.name ? normalizeName(incoming.name) : '';
  const nameAlreadyRecorded = !incoming.name || (target.nameEntries || []).some((e) => e.normalizedValue === normalizedIncomingName);
  const newNameEntry: CustomerNameEntry | null = incoming.name && !nameAlreadyRecorded ? {
    id: `name_${target.id}_${Date.now()}`, value: incoming.name, normalizedValue: normalizedIncomingName,
    source, recordedAt: now, recordedByUserId: recordedBy.id, recordedByName: recordedBy.fullName,
    isCustomerConfirmed: false, isCurrentPrimary: false
  } : null;

  const normalizedIncomingAddress = incoming.address ? normalizeAddress(incoming.address, incoming.province, incoming.city, incoming.postalCode) : '';
  const addressAlreadyRecorded = !incoming.address || (target.addressEntries || []).some((e) => e.normalizedValue === normalizedIncomingAddress);
  const newAddressEntry: CustomerAddressEntry | null = incoming.address && !addressAlreadyRecorded ? {
    id: `address_${target.id}_${Date.now()}`, address: incoming.address, province: incoming.province, city: incoming.city, postalCode: incoming.postalCode,
    normalizedValue: normalizedIncomingAddress, source, recordedAt: now,
    recordedByUserId: recordedBy.id, recordedByName: recordedBy.fullName, isCustomerConfirmed: false, isCurrentPrimary: false
  } : null;

  return {
    ...target,
    phoneEntries: newPhoneEntry ? [...(target.phoneEntries || []), newPhoneEntry] : target.phoneEntries,
    nameEntries: newNameEntry ? [...(target.nameEntries || []), newNameEntry] : target.nameEntries,
    addressEntries: newAddressEntry ? [...(target.addressEntries || []), newAddressEntry] : target.addressEntries,
    updatedAt: now
  };
}

// --- تعیین‌تکلیف تعارض ورود اطلاعات (فقط مدیر داده/ادمین) ---

export interface ConflictAttachResult { updatedCustomer: Customer; updatedConflict: CustomerEntryConflict }
export type ConflictAttachOutcome = { ok: true; data: ConflictAttachResult } | { ok: false; errorCode: string; message: string };

export function decideConflictResolutionAttach(
  conflict: CustomerEntryConflict, target: Customer,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): ConflictAttachOutcome {
  const perm = requirePermission(effectivePermissions, 'review_customer_entry_conflict');
  if (perm.ok === false) return perm;
  if (conflict.status !== 'pending') return { ok: false, errorCode: 'CONFLICT_NOT_PENDING', message: 'این تعارض قبلاً بررسی شده است.' };
  const updatedCustomer = attachIncomingValuesToCustomer(
    target,
    { phone: conflict.incomingPhone, name: conflict.incomingName, address: conflict.incomingAddress },
    'data_manager_correction', actor, now
  );
  const updatedConflict: CustomerEntryConflict = { ...conflict, status: 'resolved_attached', resolvedByUserId: actor.id, resolvedByUserName: actor.fullName, resolvedAt: now };
  return { ok: true, data: { updatedCustomer, updatedConflict } };
}

export interface ConflictCreateNewResult { newCustomer: Customer; updatedConflict: CustomerEntryConflict }
export type ConflictCreateNewOutcome = { ok: true; data: ConflictCreateNewResult } | { ok: false; errorCode: string; message: string };

export function decideConflictResolutionCreateNew(
  conflict: CustomerEntryConflict,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): ConflictCreateNewOutcome {
  const perm = requirePermission(effectivePermissions, 'review_customer_entry_conflict');
  if (perm.ok === false) return perm;
  if (conflict.status !== 'pending') return { ok: false, errorCode: 'CONFLICT_NOT_PENDING', message: 'این تعارض قبلاً بررسی شده است.' };
  const newId = `cust_${Date.now()}`;
  const newCustomer: Customer = {
    id: newId, fullName: conflict.incomingName, phone1: conflict.incomingPhone, address: conflict.incomingAddress,
    createdAt: now, updatedAt: now, version: 1,
    identityStatus: 'complete', financialStatus: 'reconciled', contactStatus: 'needs_recall',
    contactPermissionStatus: 'allowed', complaintStatus: 'none', satisfactionStatus: 'unknown',
    phoneEntries: conflict.incomingPhone ? [{
      id: `phone_${newId}_0`, value: conflict.incomingPhone, normalizedValue: normalizePhone(conflict.incomingPhone),
      source: 'data_manager_correction', recordedAt: now, recordedByUserId: actor.id, recordedByName: actor.fullName,
      isCustomerConfirmed: false, isCurrentPrimary: true
    }] : [],
    nameEntries: conflict.incomingName ? [{
      id: `name_${newId}_0`, value: conflict.incomingName, normalizedValue: normalizeName(conflict.incomingName),
      source: 'data_manager_correction', recordedAt: now, recordedByUserId: actor.id, recordedByName: actor.fullName,
      isCustomerConfirmed: false, isCurrentPrimary: true
    }] : [],
    addressEntries: conflict.incomingAddress ? [{
      id: `address_${newId}_0`, address: conflict.incomingAddress, normalizedValue: normalizeAddress(conflict.incomingAddress),
      source: 'data_manager_correction', recordedAt: now, recordedByUserId: actor.id, recordedByName: actor.fullName,
      isCustomerConfirmed: false, isCurrentPrimary: true
    }] : []
  };
  const updatedConflict: CustomerEntryConflict = { ...conflict, status: 'resolved_new_profile', resolvedByUserId: actor.id, resolvedByUserName: actor.fullName, resolvedAt: now };
  return { ok: true, data: { newCustomer, updatedConflict } };
}

export interface ConflictDismissResult { updatedConflict: CustomerEntryConflict }
export type ConflictDismissOutcome = { ok: true; data: ConflictDismissResult } | { ok: false; errorCode: string; message: string };

export function decideConflictResolutionDismiss(
  conflict: CustomerEntryConflict, note: string,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): ConflictDismissOutcome {
  const perm = requirePermission(effectivePermissions, 'review_customer_entry_conflict');
  if (perm.ok === false) return perm;
  if (conflict.status !== 'pending') return { ok: false, errorCode: 'CONFLICT_NOT_PENDING', message: 'این تعارض قبلاً بررسی شده است.' };
  if (!note.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر دلیل رد این ورودی الزامی است.' };
  const updatedConflict: CustomerEntryConflict = { ...conflict, status: 'resolved_dismissed', resolvedByUserId: actor.id, resolvedByUserName: actor.fullName, resolvedAt: now, resolutionNote: note };
  return { ok: true, data: { updatedConflict } };
}

// --- ادعای خرید — مرحلهٔ داده (فقط مدیر داده/ادمین، بدون اختیار تأیید نهایی مبلغ) ---

export interface PurchaseClaimDataDecisionResult { updatedClaim: ClaimedPurchase }
export type PurchaseClaimDataDecisionOutcome = { ok: true; data: PurchaseClaimDataDecisionResult } | { ok: false; errorCode: string; message: string };

export function decideReviewPurchaseClaimData(
  claim: ClaimedPurchase, decision: 'refer_to_financial' | 'reject', note: string | undefined,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): PurchaseClaimDataDecisionOutcome {
  const perm = requirePermission(effectivePermissions, 'review_customer_purchase_claim_data');
  if (perm.ok === false) return perm;
  if (claim.status !== 'pending_data_review') return { ok: false, errorCode: 'CLAIM_NOT_PENDING_DATA_REVIEW', message: 'این ادعا دیگر در مرحلهٔ بررسی داده نیست.' };
  if (decision === 'reject' && !note?.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر دلیل رد الزامی است.' };
  const nextStatus: ClaimedPurchaseStatus = decision === 'reject' ? 'rejected' : 'pending_financial_review';
  const updatedClaim: ClaimedPurchase = {
    ...claim, status: nextStatus,
    dataManagerResult: { decision: decision === 'reject' ? 'rejected' : 'approved', byUserId: actor.id, byUserName: actor.fullName, at: now, note }
  };
  return { ok: true, data: { updatedClaim } };
}

// --- ادعای خرید — مرحلهٔ مالی — finalConfirmedAmount فقط اینجا مقداردهی می‌شود ---

export interface PurchaseClaimFinancialDecisionResult { updatedClaim: ClaimedPurchase }
export type PurchaseClaimFinancialDecisionOutcome = { ok: true; data: PurchaseClaimFinancialDecisionResult } | { ok: false; errorCode: string; message: string };

export function decideReviewPurchaseClaimFinancial(
  claim: ClaimedPurchase, decision: 'confirm' | 'reject' | 'close_unverified', confirmedAmount: number | undefined, note: string | undefined,
  effectivePermissions: SystemPermission[] | null, actor: { id: string; fullName: string }, now: string
): PurchaseClaimFinancialDecisionOutcome {
  const perm = requirePermission(effectivePermissions, 'review_customer_purchase_claim_financial');
  if (perm.ok === false) return perm;
  if (claim.status !== 'pending_financial_review') return { ok: false, errorCode: 'CLAIM_NOT_PENDING_FINANCIAL_REVIEW', message: 'این ادعا دیگر در مرحلهٔ بررسی مالی نیست.' };
  if (decision === 'confirm' && (!confirmedAmount || confirmedAmount <= 0)) {
    return { ok: false, errorCode: 'INVALID_AMOUNT', message: 'مبلغ تأییدشده باید عددی معتبر و بزرگ‌تر از صفر باشد.' };
  }
  if (decision === 'reject' && !note?.trim()) return { ok: false, errorCode: 'REASON_REQUIRED', message: 'ذکر دلیل رد الزامی است.' };

  if (decision === 'confirm') {
    const updatedClaim: ClaimedPurchase = {
      ...claim, status: 'confirmed', finalConfirmedAmount: confirmedAmount,
      financialResult: { decision: 'approved', byUserId: actor.id, byUserName: actor.fullName, at: now, confirmedAmount }
    };
    return { ok: true, data: { updatedClaim } };
  }
  const nextStatus: ClaimedPurchaseStatus = decision === 'reject' ? 'rejected' : 'unverified_closed';
  const updatedClaim: ClaimedPurchase = {
    ...claim, status: nextStatus,
    financialResult: { decision: 'rejected', byUserId: actor.id, byUserName: actor.fullName, at: now, note: note || (decision === 'close_unverified' ? 'بسته‌شده بدون تأیید' : undefined) }
  };
  return { ok: true, data: { updatedClaim } };
}

// ============================================================
// Timeline یکپارچهٔ پروفایل — View Model کاملاً محاسبه‌شده و Permission-Aware؛ activityLog و
// statusChangeHistory (که خودِ Customer است) را با رویدادهای مجموعه‌های مستقل (Conflict/Merge/
// Split/ادعای خرید) ترکیب می‌کند. اطلاعات ادغام/تعارض فقط با view_customer_identity_audit و
// اطلاعات ادعای خرید فقط با یکی از دو مجوز بررسی ادعا نمایش داده می‌شوند — نه اینکه صرفاً پنهان
// شوند در UI، اصلاً به آرایهٔ خروجی اضافه نمی‌شوند.
// ============================================================

export interface CustomerTimelineEntry {
  timestamp: string;
  type:
    | 'profile_created' | 'value_added' | 'status_changed' | 'sale_cycle'
    | 'conflict_created' | 'conflict_resolved' | 'merge_requested' | 'merge_decided' | 'split_executed'
    | 'claim_submitted' | 'claim_data_reviewed' | 'claim_financial_reviewed';
  title: string;
  detail?: string;
}

const STATUS_FIELD_LABELS: Record<string, string> = {
  financialStatus: 'وضعیت مالی', complaintStatus: 'وضعیت شکایت', contactPermissionStatus: 'مجوز تماس',
  salesOperationStatusOverride: 'وضعیت عملیات فروش', contactStatus: 'نتیجهٔ تماس',
  primaryNameEntryId: 'مقدار اصلی نام', primaryPhoneEntryId: 'مقدار اصلی شماره', primaryAddressEntryId: 'مقدار اصلی آدرس'
};
const CONFLICT_STATUS_LABELS: Record<string, string> = {
  resolved_attached: 'اتصال به پروفایل موجود', resolved_new_profile: 'ایجاد پروفایل مستقل جدید', resolved_dismissed: 'رد ورودی'
};

export interface CustomerTimelineContext {
  mergeRequests: CustomerMergeRequest[];
  splitEvents: CustomerSplitEvent[];
  entryConflicts: CustomerEntryConflict[];
  claimedPurchases: ClaimedPurchase[];
}

export function buildCustomerTimeline(
  customer: Customer,
  context: CustomerTimelineContext,
  effectivePermissions: SystemPermission[] | null,
  userNameById: (id: string) => string
): CustomerTimelineEntry[] {
  const hasPerm = (p: SystemPermission) => effectivePermissions === null || effectivePermissions.includes(p);
  const canSeeContact = hasPerm('view_customer_contact_fields');
  const canSeeAddress = hasPerm('view_customer_address');
  const canSeeAudit = hasPerm('view_customer_identity_audit');
  const canSeeClaims = hasPerm('review_customer_purchase_claim_data') || hasPerm('review_customer_purchase_claim_financial');

  const items: CustomerTimelineEntry[] = [
    { timestamp: customer.createdAt, type: 'profile_created', title: 'ایجاد پروفایل مشتری' }
  ];

  for (const e of customer.nameEntries || []) {
    items.push({ timestamp: e.recordedAt, type: 'value_added', title: `افزودن نام: ${e.value}`, detail: e.recordedByName });
  }
  for (const e of customer.phoneEntries || []) {
    items.push({ timestamp: e.recordedAt, type: 'value_added', title: canSeeContact ? `افزودن شمارهٔ تماس: ${e.value}` : 'افزودن شمارهٔ تماس', detail: e.recordedByName });
  }
  for (const e of customer.addressEntries || []) {
    items.push({ timestamp: e.recordedAt, type: 'value_added', title: canSeeAddress ? `افزودن آدرس: ${e.address}` : 'افزودن آدرس', detail: e.recordedByName });
  }

  for (const ev of customer.statusChangeHistory || []) {
    items.push({
      timestamp: ev.changedAt, type: 'status_changed',
      title: `تغییر ${STATUS_FIELD_LABELS[ev.field] || ev.field}: ${ev.oldValue ? `${ev.oldValue} ← ` : ''}${ev.newValue}`,
      detail: `${ev.reason} — ${ev.changedByName}`
    });
  }

  for (const log of customer.activityLog || []) {
    items.push({
      timestamp: log.startedAt, type: 'sale_cycle',
      title: `چرخهٔ فروش ${log.status === 'active' ? 'آغازشده' : 'تکمیل‌شده'} — ${userNameById(log.salespersonId)}`,
      detail: log.invoiceId ? `شناسهٔ فاکتور: ${log.invoiceId}` : undefined
    });
  }

  if (canSeeAudit) {
    for (const c of context.entryConflicts.filter((c) => c.conflictingCustomerIds.includes(customer.id))) {
      items.push({ timestamp: c.submittedAt, type: 'conflict_created', title: `ایجاد تعارض ورود اطلاعات — ثبت‌شده توسط ${c.submittedByUserName}`, detail: c.reason });
      if (c.status !== 'pending' && c.resolvedAt) {
        items.push({ timestamp: c.resolvedAt, type: 'conflict_resolved', title: `تعیین‌تکلیف تعارض: ${CONFLICT_STATUS_LABELS[c.status] || c.status}`, detail: c.resolutionNote || (c.resolvedByUserName ? `توسط ${c.resolvedByUserName}` : undefined) });
      }
    }
    for (const r of context.mergeRequests.filter((r) => r.profileIds.includes(customer.id))) {
      items.push({ timestamp: r.requestedAt, type: 'merge_requested', title: `درخواست ادغام (${r.requestNumber}) — ${r.requesterName}`, detail: r.motherProfileReason });
      if (r.status !== 'pending' && r.decidedAt) {
        items.push({ timestamp: r.decidedAt, type: 'merge_decided', title: `${r.status === 'approved' ? 'تأیید' : 'رد'} ادغام (${r.requestNumber})`, detail: r.decisionNote || r.decidedByUserName });
      }
    }
    for (const s of context.splitEvents.filter((s) => s.restoredProfileIds.includes(customer.id))) {
      items.push({ timestamp: s.decidedAt, type: 'split_executed', title: `جداسازی (Split) توسط ${s.decidedByUserName}`, detail: s.reason });
    }
  }

  if (canSeeClaims) {
    for (const claim of context.claimedPurchases.filter((cl) => cl.customerId === customer.id)) {
      items.push({ timestamp: claim.submittedAt, type: 'claim_submitted', title: `ثبت ادعای خرید — ${claim.submittedByUserName}`, detail: `مبلغ ادعاشده: ${claim.claimedAmount.toLocaleString('fa-IR')} ریال` });
      if (claim.dataManagerResult) {
        items.push({ timestamp: claim.dataManagerResult.at, type: 'claim_data_reviewed', title: `بررسی دادهٔ ادعای خرید: ${claim.dataManagerResult.decision === 'approved' ? 'ارجاع به مالی' : 'رد'}`, detail: claim.dataManagerResult.note || claim.dataManagerResult.byUserName });
      }
      if (claim.financialResult) {
        items.push({
          timestamp: claim.financialResult.at, type: 'claim_financial_reviewed',
          title: `نتیجهٔ مالی ادعای خرید: ${claim.financialResult.decision === 'approved' ? 'تأییدشده' : 'ردشده/بسته‌شده'}`,
          detail: claim.financialResult.confirmedAmount ? `مبلغ نهایی: ${claim.financialResult.confirmedAmount.toLocaleString('fa-IR')} ریال` : claim.financialResult.note
        });
      }
    }
  }

  return items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}
