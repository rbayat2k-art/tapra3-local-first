import { CatalogRevision, Product, Promotion, ServiceCatalogItem, User } from '../types';
import { toLatinDigits } from './operationalFormat';

// ============================================================
// کاتالوگ کالا/خدمت/پروموشن — کاملاً خالص. مسئولیت این فایل فقط دو قاعدهٔ کسب‌وکاری است که
// در چند جا (پنل مدیریت، ثبت فاکتور) باید یکسان اعمال شوند: انقضای پروموشن و مخفی‌سازی قیمت خرید.
// ============================================================

export function isPromotionSellable(promotion: Promotion, todayDate: string): { ok: true } | { ok: false; reason: string } {
  const today = toLatinDigits(todayDate);
  const endDate = promotion.endDate ? toLatinDigits(promotion.endDate) : undefined;
  const startDate = promotion.startDate ? toLatinDigits(promotion.startDate) : undefined;
  if (promotion.status !== 'active') return { ok: false, reason: 'پروموشن غیرفعال یا منقضی است.' };
  if (endDate && endDate < today) return { ok: false, reason: 'پروموشن منقضی شده است.' };
  if (startDate && startDate > today) return { ok: false, reason: 'پروموشن هنوز شروع نشده است.' };
  return { ok: true };
}

// فروشنده فقط قیمت فروش و اطلاعات مجاز را می‌بیند — قیمت خرید هرگز بدون مجوز صریح در خروجی نیست.
export interface VisibleProductView {
  id: string; code: string; name: string; category: string; salePrice: number; purchasePrice?: number; isActive: boolean;
}
export function toVisibleProductView(product: Product, canViewPurchasePrice: boolean): VisibleProductView {
  return {
    id: product.id, code: product.code, name: product.name, category: product.category,
    salePrice: product.salePrice, purchasePrice: canViewPurchasePrice ? product.purchasePrice : undefined,
    isActive: product.isActive
  };
}

type VersionedCatalogRecord = Product | ServiceCatalogItem | Promotion;

const VERSION_FIELDS = new Set([
  'version', 'updatedAt', 'updatedByUserId', 'updatedByUserName', 'revisionHistory'
]);

export function validateUniqueCatalogCode<T extends { id: string; code: string }>(
  records: T[],
  code: string,
  currentId?: string
): string | null {
  const normalized = code.trim().toLocaleUpperCase('en-US');
  if (!normalized) return 'کد الزامی است.';
  if (records.some((record) => record.id !== currentId && record.code.trim().toLocaleUpperCase('en-US') === normalized)) {
    return 'این کد قبلاً استفاده شده است.';
  }
  return null;
}

export function validateNonNegativeCatalogNumbers(values: Record<string, number>): string | null {
  const invalid = Object.entries(values).find(([, value]) => !Number.isFinite(value) || value < 0);
  return invalid ? `${invalid[0]} باید عددی صفر یا بزرگ‌تر باشد.` : null;
}

function snapshotCatalogRecord(record: VersionedCatalogRecord): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== 'revisionHistory')
      .map(([key, value]) => [key, Array.isArray(value)
        ? value.map((item) => (item && typeof item === 'object' ? { ...item } : item))
        : value])
  );
}

export function applyCatalogRevision<T extends VersionedCatalogRecord>(params: {
  existing: T;
  patch: Partial<T>;
  actor: Pick<User, 'id' | 'fullName'>;
  reason: string;
  changedAt: string;
}): { ok: true; record: T; changedFields: string[] } | { ok: false; error: string } {
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: 'دلیل ویرایش برای Audit الزامی است.' };

  const changedFields = Object.keys(params.patch).filter((key) => {
    if (VERSION_FIELDS.has(key)) return false;
    return JSON.stringify(params.existing[key as keyof T]) !== JSON.stringify(params.patch[key as keyof T]);
  });
  if (changedFields.length === 0) return { ok: false, error: 'هیچ تغییری برای ذخیره وجود ندارد.' };

  const currentVersion = Math.max(1, params.existing.version || 1);
  const revision: CatalogRevision = {
    version: currentVersion,
    changedAt: params.changedAt,
    changedByUserId: params.actor.id,
    changedByUserName: params.actor.fullName,
    reason,
    changedFields,
    snapshot: snapshotCatalogRecord(params.existing)
  };
  return {
    ok: true,
    changedFields,
    record: {
      ...params.existing,
      ...params.patch,
      version: currentVersion + 1,
      updatedAt: params.changedAt,
      updatedByUserId: params.actor.id,
      updatedByUserName: params.actor.fullName,
      revisionHistory: [...(params.existing.revisionHistory || []), revision]
    } as T
  };
}

export function withCatalogMetadata<T extends VersionedCatalogRecord>(record: T): T {
  if (record.version && record.version > 0 && Array.isArray(record.revisionHistory)) return record;
  return {
    ...record,
    version: Math.max(1, record.version || 1),
    revisionHistory: record.revisionHistory || []
  };
}
