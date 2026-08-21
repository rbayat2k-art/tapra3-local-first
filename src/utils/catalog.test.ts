import { describe, it, expect } from 'vitest';
import {
  applyCatalogRevision, isPromotionSellable, toVisibleProductView,
  validateNonNegativeCatalogNumbers, validateUniqueCatalogCode, withCatalogMetadata
} from './catalog';
import type { Product, Promotion } from '../types';
import { splitPromotionIntoLineItems } from './salesInvoice';

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'promo_1', code: 'PR-1', title: 'test', version: 1, coreItems: [], basePrice: 100, discountAmount: 0,
    finalPrice: 100, status: 'active', createdAt: 'x', createdByUserId: 'u', createdByUserName: 'u', ...overrides
  };
}

describe('isPromotionSellable', () => {
  it('rejects an expired promotion (endDate before today)', () => {
    const result = isPromotionSellable(makePromotion({ endDate: '1402/09/30' }), '1403/05/10');
    expect(result.ok).toBe(false);
  });
  it('rejects a promotion marked inactive/expired by status', () => {
    const result = isPromotionSellable(makePromotion({ status: 'expired' }), '1403/05/10');
    expect(result.ok).toBe(false);
  });
  it('rejects a promotion that has not started yet', () => {
    const result = isPromotionSellable(makePromotion({ startDate: '1403/06/01' }), '1403/05/10');
    expect(result.ok).toBe(false);
  });
  it('allows an active promotion within its date range', () => {
    const result = isPromotionSellable(makePromotion({ startDate: '1403/04/01', endDate: '1403/12/29' }), '1403/05/10');
    expect(result.ok).toBe(true);
  });
  it('normalizes legacy Persian digits before comparing portal dates', () => {
    const result = isPromotionSellable(makePromotion({ startDate: '۱۴۰۳/۰۴/۰۱', endDate: '۱۴۰۵/۱۲/۲۹' }), '1405/05/10');
    expect(result.ok).toBe(true);
  });
});

describe('toVisibleProductView — hidden purchase price', () => {
  const product: Product = {
    id: 'p1', code: 'P-1', name: 'test', category: 'cat', unit: 'unit', quantity: 1,
    purchasePrice: 1000, salePrice: 1500, isActive: true
  };
  it('hides purchasePrice when the caller lacks view_purchase_price', () => {
    const view = toVisibleProductView(product, false);
    expect(view.purchasePrice).toBeUndefined();
    expect(view.salePrice).toBe(1500);
  });
  it('exposes purchasePrice when the caller has view_purchase_price', () => {
    const view = toVisibleProductView(product, true);
    expect(view.purchasePrice).toBe(1000);
  });
});

describe('catalog governance helpers', () => {
  it('rejects duplicate codes case-insensitively while allowing the current record', () => {
    const records = [{ id: 'p1', code: 'P-001' }];
    expect(validateUniqueCatalogCode(records, 'p-001')).toContain('قبلاً');
    expect(validateUniqueCatalogCode(records, 'p-001', 'p1')).toBeNull();
  });

  it('rejects negative or invalid monetary and quantity values', () => {
    expect(validateNonNegativeCatalogNumbers({ salePrice: -1 })).toContain('salePrice');
    expect(validateNonNegativeCatalogNumbers({ salePrice: 0, quantity: 4 })).toBeNull();
  });

  it('creates an append-only revision with actor, reason and previous snapshot', () => {
    const existing = withCatalogMetadata({
      id: 'p1', code: 'P-1', name: 'کالا', category: 'آزمایشی', unit: 'عدد', quantity: 1,
      purchasePrice: 100, salePrice: 150, isActive: true
    } as Product);
    const result = applyCatalogRevision({
      existing, patch: { salePrice: 190 }, actor: { id: 'u1', fullName: 'مدیر کالا' },
      reason: 'اصلاح قیمت مصوب', changedAt: '1405/05/18 10:11:12'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.version).toBe(2);
    expect(result.record.salePrice).toBe(190);
    expect(result.record.revisionHistory).toHaveLength(1);
    expect(result.record.revisionHistory?.[0].snapshot.salePrice).toBe(150);
  });

  it('requires a reason and does not create empty revisions', () => {
    const existing = withCatalogMetadata(makePromotion());
    expect(applyCatalogRevision({ existing, patch: { finalPrice: 50 }, actor: { id: 'u', fullName: 'u' }, reason: '', changedAt: 'x' }).ok).toBe(false);
    expect(applyCatalogRevision({ existing, patch: { finalPrice: 100 }, actor: { id: 'u', fullName: 'u' }, reason: 'بدون تغییر', changedAt: 'x' }).ok).toBe(false);
  });

  it('keeps promotion final customer price independent from base and discount values', () => {
    const existing = withCatalogMetadata(makePromotion({ basePrice: 100, discountAmount: 10, finalPrice: 70 }));
    const result = applyCatalogRevision({
      existing, patch: { basePrice: 120, discountAmount: 5, finalPrice: 73 },
      actor: { id: 'u', fullName: 'u' }, reason: 'مصوبه قیمت مستقل', changedAt: 'x'
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.finalPrice).toBe(73);
  });

  it('does not mutate an already-created invoice line snapshot when catalog price changes', () => {
    const product: Product = { id:'p1', code:'P-1', name:'کالا', category:'تست', unit:'عدد', quantity:3, purchasePrice:60, salePrice:100, isActive:true };
    const promotion = makePromotion({ coreItems:[{ itemType:'goods', itemId:'p1', itemName:'کالا', quantity:1 }], finalPrice:90 });
    const invoiceLines = splitPromotionIntoLineItems(promotion, [product], []);
    const revised = applyCatalogRevision({ existing:withCatalogMetadata(product), patch:{ salePrice:250 }, actor:{ id:'u', fullName:'مدیر' }, reason:'افزایش قیمت', changedAt:'x' });
    expect(revised.ok).toBe(true);
    expect(invoiceLines[0].unitPrice).toBe(100);
    expect(invoiceLines[0].lineTotal).toBe(90);
    expect(invoiceLines[0].promotionVersion).toBe(1);
  });
});
