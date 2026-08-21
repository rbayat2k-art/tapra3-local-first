import { Customer, ImportJob } from '../types';
import { normalizePhone, resolveIncomingCustomerData, IncomingCustomerData } from './customerIdentity';

// ============================================================
// موتور Import مخزن داده خام (بند ۵-۶ مأموریت فروش) — عمداً یک لایهٔ نازک روی موتور تطبیق
// هویت موجود (customerIdentity.ts) است؛ هیچ منطق تطبیق شماره/نام/آدرس تکراری اینجا بازسازی
// نمی‌شود. مسئولیت این فایل فقط دو چیز است که مخصوص RawContact است و در customerIdentity.ts
// معنا ندارد: ۱) اعتبارسنجی شمارهٔ موبایل ایران، ۲) تشخیص شمارهٔ تکراری «در همان فایل».
// کاملاً خالص — بدون localStorage/alert؛ ذخیره‌سازی واقعی RawContact/Customer/ImportJob
// مسئولیت Handler در کامپوننت فراخواننده است (همان الگوی resolveIncomingCustomerData).
// ============================================================

export interface RawContactRowInput {
  rowIndex: number;
  phone: string;
  otherPhones?: string[];
  name?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  nationalCode?: string;
  purchaseHistory?: string;
  campaignId?: string;
  tags?: string[];
  notes?: string;
}

const IRAN_MOBILE_REGEX = /^09\d{9}$/;

export function isValidIranianMobile(normalized: string): boolean {
  return IRAN_MOBILE_REGEX.test(normalized);
}

// Idempotency Key تکراری یعنی این فایل/دسته قبلاً یک‌بار Import شده — بند ۶ مأموریت: «جلوگیری
// از Import مجدد همان Job». مقایسه دقیق رشته‌ای، بدون نرمال‌سازی — کلید را خودِ Handler می‌سازد.
export function isDuplicateImportJob(idempotencyKey: string, existingJobs: ImportJob[]): boolean {
  return existingJobs.some((j) => j.idempotencyKey === idempotencyKey);
}

export type RawContactRowDecision =
  | { rowIndex: number; outcome: 'invalid_phone'; normalizedPhone: string }
  | { rowIndex: number; outcome: 'duplicate_in_file'; normalizedPhone: string; firstSeenRowIndex: number }
  | { rowIndex: number; outcome: 'attached'; normalizedPhone: string; targetCustomerId: string }
  | { rowIndex: number; outcome: 'created'; normalizedPhone: string; willCreateCustomerProfile: boolean }
  | { rowIndex: number; outcome: 'conflict'; normalizedPhone: string; conflictingCustomerIds: string[]; reason: string }
  | { rowIndex: number; outcome: 'error'; normalizedPhone: string; errorMessage: string };

export interface RawContactImportOptions {
  // بند ۶ مأموریت: «شماره → هیچ پروفایلی → طبق تنظیم Import یا پروفایل ناقص ساخته شود یا در
  // مخزن خام بماند». پیش‌فرض false — تصمیم ساخت پروفایل هرگز خاموش/پیش‌فرض فعال نیست.
  createCustomerWhenNoMatch: boolean;
}

// یک ردیف بد/متعارض کل فایل را متوقف نمی‌کند — هر ردیف کاملاً مستقل پردازش می‌شود. شمارهٔ
// تکراری داخل همان فایل فقط یک‌بار از موتور تطبیق هویت عبور می‌کند (تا با پروفایل اشتباه دوبار
// Attach/ساخته نشود)؛ ردیف‌های بعدیِ همان شماره outcome='duplicate_in_file' می‌گیرند، اما خودشان
// به‌عنوان RawContact مستقل ذخیره می‌شوند — هیچ ردیفی هرگز فیزیکی حذف نمی‌شود.
export function resolveRawContactImportRows(
  rows: RawContactRowInput[],
  allCustomers: Customer[],
  options: RawContactImportOptions
): RawContactRowDecision[] {
  const decisions: RawContactRowDecision[] = [];
  const seenPhones = new Map<string, number>();

  for (const row of rows) {
    const normalizedPhone = normalizePhone(row.phone);
    if (!isValidIranianMobile(normalizedPhone)) {
      decisions.push({ rowIndex: row.rowIndex, outcome: 'invalid_phone', normalizedPhone });
      continue;
    }

    const firstSeenRowIndex = seenPhones.get(normalizedPhone);
    if (firstSeenRowIndex !== undefined) {
      decisions.push({ rowIndex: row.rowIndex, outcome: 'duplicate_in_file', normalizedPhone, firstSeenRowIndex });
      continue;
    }
    seenPhones.set(normalizedPhone, row.rowIndex);

    try {
      const incoming: IncomingCustomerData = {
        phone: row.phone, name: row.name, address: row.address,
        province: row.province, city: row.city, postalCode: row.postalCode
      };
      const resolution = resolveIncomingCustomerData(incoming, allCustomers);

      if (resolution.action === 'attach_to_existing') {
        decisions.push({ rowIndex: row.rowIndex, outcome: 'attached', normalizedPhone, targetCustomerId: resolution.targetCustomerId });
      } else if (resolution.action === 'conflict_needs_review') {
        decisions.push({
          rowIndex: row.rowIndex, outcome: 'conflict', normalizedPhone,
          conflictingCustomerIds: resolution.conflictingCustomerIds, reason: resolution.reason
        });
      } else {
        decisions.push({ rowIndex: row.rowIndex, outcome: 'created', normalizedPhone, willCreateCustomerProfile: options.createCustomerWhenNoMatch });
      }
    } catch (err) {
      decisions.push({ rowIndex: row.rowIndex, outcome: 'error', normalizedPhone, errorMessage: err instanceof Error ? err.message : 'خطای ناشناخته' });
    }
  }

  return decisions;
}
