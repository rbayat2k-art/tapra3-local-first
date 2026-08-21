import { describe, expect, it } from 'vitest';
import { customerImportReasonLabel } from './CustomerImportView';
import {
  customerEventLabel,
  customerEventSummary,
  customerSourceLabel,
  customerSourceName,
} from './SaasCustomersView';

describe('customer operational labels', () => {
  it('does not expose unknown backend event or source codes', () => {
    expect(customerEventLabel('future_internal_event')).toBe('رویداد مشتری');
    expect(customerSourceLabel('future_internal_source')).toBe('منبع ثبت‌شده');
  });

  it('presents known sales events and development data in Persian', () => {
    expect(customerEventLabel('sales_invoice_created')).toBe('ایجاد صورتحساب فروش');
    expect(customerEventLabel('sales_lead_created')).toBe('ایجاد سرنخ فروش');
    expect(customerEventSummary('sales_lead_created', 'Lead فروش برای مشتری ایجاد شد.')).toBe('سرنخ فروش برای مشتری ایجاد شد.');
    expect(customerEventSummary('sales_payment_recorded', 'Payment declared for Sales Invoice.')).toBe('پرداخت صورتحساب فروش اعلام شد.');
    expect(customerSourceName('Deterministic development seed')).toBe('دادهٔ پایدار محیط توسعه');
  });

  it('does not expose unknown import classifier codes', () => {
    expect(customerImportReasonLabel('internal_classifier_code')).toBe('نیازمند بررسی دستی');
  });
});
