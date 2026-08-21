import { PaymentRequest, SupportCase, SupportTransactionRow } from '../types';

export interface SupportRefundSubmissionCheck {
  ok: boolean;
  eligibleRowIds: string[];
  errors: string[];
}

export function findExistingRefundRequest(
  requests: PaymentRequest[],
  supportTransactionId: string
): PaymentRequest | undefined {
  return requests.find((request) => request.sourceSupportTransactionId === supportTransactionId);
}

export function canApproveSupportRefundRow(row: SupportTransactionRow): boolean {
  return row.status === 'pending_financial_approval' && !row.paymentRequestId;
}

export function canRevokeUnsentSupportApproval(row: SupportTransactionRow): boolean {
  return row.status === 'approved_pending_send' && !row.paymentRequestId;
}

export function canCloseSupportCase(supportCase: SupportCase): boolean {
  if (supportCase.transactions.length === 0) return false;
  return supportCase.transactions.every((row) =>
    row.status === 'paid' || row.status === 'financial_rejected'
  );
}

export function validateSupportRefundSubmission(
  supportCase: SupportCase,
  requestedRowIds: string[],
  requests: PaymentRequest[]
): SupportRefundSubmissionCheck {
  const uniqueIds = Array.from(new Set(requestedRowIds));
  const eligibleRowIds: string[] = [];
  const errors: string[] = [];

  for (const rowId of uniqueIds) {
    const row = supportCase.transactions.find((candidate) => candidate.id === rowId);
    if (!row) {
      errors.push(`ردیف ${rowId} در پرونده وجود ندارد.`);
      continue;
    }
    if (row.status !== 'approved_pending_send') {
      errors.push(`فاکتور ${row.invoiceCode} در وضعیت آماده ارسال به خزانه نیست.`);
      continue;
    }
    if (row.paymentRequestId) {
      errors.push(`فاکتور ${row.invoiceCode} قبلاً به درخواست پرداخت ${row.paymentRequestTrackingCode || row.paymentRequestId} متصل شده است.`);
      continue;
    }
    const duplicate = findExistingRefundRequest(requests, row.id);
    if (duplicate) {
      errors.push(`برای فاکتور ${row.invoiceCode} قبلاً درخواست عودت ${duplicate.trackingCode} ساخته شده است.`);
      continue;
    }
    eligibleRowIds.push(row.id);
  }

  return {
    ok: errors.length === 0 && eligibleRowIds.length > 0,
    eligibleRowIds,
    errors
  };
}
