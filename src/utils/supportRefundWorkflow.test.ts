import { describe, expect, it } from 'vitest';
import { PaymentRequest, SupportCase, SupportTransactionRow } from '../types';
import {
  canApproveSupportRefundRow,
  canCloseSupportCase,
  canRevokeUnsentSupportApproval,
  findExistingRefundRequest,
  validateSupportRefundSubmission
} from './supportRefundWorkflow';

const row = (id: string, status: SupportTransactionRow['status'], patch: Partial<SupportTransactionRow> = {}): SupportTransactionRow => ({
  id,
  invoiceCode: `INV-${id}`,
  invoiceDate: '1405/05/18',
  totalInvoiceAmount: 10_000_000,
  customerRefundShebaNumber: 'IR000000000000000000000000',
  finalRefundAmount: 10_000_000,
  status,
  ...patch
});

const supportCase = (transactions: SupportTransactionRow[]): SupportCase => ({
  id: 'case-1', trackingCode: 'S50001', createdAt: '1405/05/18 10:00:00',
  operatorId: 'support-1', operatorName: 'کارشناس', customerFullName: 'مشتری',
  customerPhone: '09120000000', province: 'تهران', city: 'تهران', contactType: 'تلفنی',
  reasonForContact: 'انصراف و عودت وجه', complaintStatus: 'in_review', priority: 'normal',
  attachments: [], transactions, timeline: [], status: 'in_review'
});

const request = (sourceSupportTransactionId: string): PaymentRequest => ({
  id: 'req-1', trackingCode: 'S50001-1', title: 'عودت', requestType: 'customer_refund',
  companyId: '', companyName: '', costCenterId: '', costCenterName: '', amount: 10_000_000,
  amountInWords: '', destinationCardNumber: '', destinationAccountName: '', description: '',
  requestorId: 'support-1', requestorName: 'کارشناس', requestorPhone: '', currentApproverId: 'treasury-1',
  currentApproverName: 'خزانه', currentApproverPhone: '', status: 'pending_approval',
  createdAt: '1405/05/18 10:00:00', updatedAt: '1405/05/18 10:00:00', initialAttachments: [],
  timeline: [], sourceSupportTransactionId
});

describe('support refund workflow integrity', () => {
  it('approves only an untouched pending row', () => {
    expect(canApproveSupportRefundRow(row('1', 'pending_financial_approval'))).toBe(true);
    expect(canApproveSupportRefundRow(row('1', 'pending_financial_approval', { paymentRequestId: 'req-1' }))).toBe(false);
    expect(canApproveSupportRefundRow(row('1', 'approved_pending_send'))).toBe(false);
  });

  it('revokes approval only before a treasury request exists', () => {
    expect(canRevokeUnsentSupportApproval(row('1', 'approved_pending_send'))).toBe(true);
    expect(canRevokeUnsentSupportApproval(row('1', 'approved_pending_send', { paymentRequestId: 'req-1' }))).toBe(false);
    expect(canRevokeUnsentSupportApproval(row('1', 'financial_approved'))).toBe(false);
  });

  it('keeps a case open until every row is paid or finally rejected', () => {
    expect(canCloseSupportCase(supportCase([row('1', 'paid'), row('2', 'financial_rejected')]))).toBe(true);
    expect(canCloseSupportCase(supportCase([row('1', 'financial_approved')]))).toBe(false);
    expect(canCloseSupportCase(supportCase([]))).toBe(false);
  });

  it('finds a refund request even if its status later changes', () => {
    expect(findExistingRefundRequest([{ ...request('row-1'), status: 'cancelled' }], 'row-1')?.id).toBe('req-1');
  });

  it('blocks a second payment request for the same support transaction', () => {
    const target = supportCase([row('row-1', 'approved_pending_send')]);
    const result = validateSupportRefundSubmission(target, ['row-1'], [request('row-1')]);
    expect(result.ok).toBe(false);
    expect(result.eligibleRowIds).toEqual([]);
    expect(result.errors.join(' ')).toContain('قبلاً درخواست عودت');
  });

  it('rejects mixed invalid batches atomically and deduplicates selected ids', () => {
    const target = supportCase([
      row('ready', 'approved_pending_send'),
      row('pending', 'pending_financial_approval')
    ]);
    const result = validateSupportRefundSubmission(target, ['ready', 'ready', 'pending'], []);
    expect(result.ok).toBe(false);
    expect(result.eligibleRowIds).toEqual(['ready']);
    expect(result.errors).toHaveLength(1);
  });

  it('accepts an entirely valid batch', () => {
    const target = supportCase([row('one', 'approved_pending_send'), row('two', 'approved_pending_send')]);
    expect(validateSupportRefundSubmission(target, ['one', 'two'], [])).toEqual({
      ok: true, eligibleRowIds: ['one', 'two'], errors: []
    });
  });
});
