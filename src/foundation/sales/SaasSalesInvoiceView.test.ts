import { describe, expect, it } from 'vitest';
import { toLineInput, type LineDraft } from './SaasSalesInvoiceView';

const draft = (overrides: Partial<LineDraft> = {}): LineDraft => ({
  itemType: 'goods', catalogReference: ' QA-GOODS-001 ', itemName: 'کالای نمونه',
  quantity: '2', unitPrice: '5000000', discountAmount: '0', ...overrides,
});

describe('sales invoice operational line adapter', () => {
  it('carries the business catalog reference needed for inventory resolution', () => {
    expect(toLineInput([draft()])).toEqual([expect.objectContaining({
      itemType: 'goods', catalogReference: 'QA-GOODS-001', itemName: 'کالای نمونه',
    })]);
  });

  it('does not send an inventory catalog reference for a service line', () => {
    expect(toLineInput([draft({ itemType: 'service', catalogReference: 'IGNORED' })]))
      .toEqual([expect.objectContaining({ itemType: 'service', catalogReference: undefined })]);
  });

  it('keeps unresolved goods valid while making their missing linkage explicit in the UI', () => {
    expect(toLineInput([draft({ catalogReference: '' })]))
      .toEqual([expect.objectContaining({ itemType: 'goods', catalogReference: undefined })]);
  });
});
