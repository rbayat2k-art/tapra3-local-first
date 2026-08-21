import { PaymentRequest, RequestStatus } from '../types';

// The minimal, treasury-safe projection of a PaymentRequest that originated from another
// unit (e.g. support refunds). Treasury must NEVER receive the raw source record (e.g. a
// full SupportCase) — only this transform's output. Forbidden fields (complaint text, call
// details, complaint reason, call history, customer satisfaction, internal support notes,
// the full SupportCase timeline) are not present on this type at all, so they cannot leak
// even by accident — there's nothing to destructure.
export interface TreasuryPaymentSourceView {
  requestTrackingCode: string;
  sourceType: PaymentRequest['sourceType'];
  sourceReferenceCode: string; // reference code of the source record/transaction only — never its details
  beneficiaryName: string;
  amount: number;
  bankInfo: {
    cardNumber?: string;
    sheba?: string;
    bankName?: string;
  };
  issuingUnitName: string;
  status: RequestStatus;
  referredAt?: string;
  paidAt?: string;
}

// Pure transform — call this instead of ever passing a PaymentRequest (let alone a
// SupportCase) directly into treasury-facing UI/props.
export function toTreasuryPaymentSourceView(request: PaymentRequest): TreasuryPaymentSourceView {
  const paidStep = request.timeline.find((t) => t.action === 'paid' || t.action === 'emergency_paid');
  const referredStep = request.timeline.find((t) => t.action === 'referred_for_payment' || t.action === 'forwarded');
  return {
    requestTrackingCode: request.trackingCode,
    sourceType: request.sourceType,
    sourceReferenceCode: request.sourceReferenceId || request.sourceSupportCaseTrackingCode || request.sourceUnitId || '—',
    beneficiaryName: request.destinationAccountName,
    amount: request.amount,
    bankInfo: {
      cardNumber: request.destinationCardNumber,
      sheba: request.destinationSheba,
      bankName: request.destinationBankName
    },
    issuingUnitName: request.sourceUnitName || 'خدمات پس از فروش',
    status: request.status,
    referredAt: referredStep?.timestamp,
    paidAt: paidStep?.timestamp
  };
}

// Requests treasury is allowed to see as "support-refund sourced" — filter first, then
// transform each through toTreasuryPaymentSourceView before rendering.
export function getTreasuryVisibleSourceRequests(requests: PaymentRequest[]): PaymentRequest[] {
  return requests.filter((r) => r.sourceType === 'support_refund');
}
