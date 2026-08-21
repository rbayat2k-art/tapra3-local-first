import { describe, expect, it } from 'vitest';
import { DeclaredPayment, SalesFinancialReviewCase, SalesInvoice, User } from '../types';
import {
  claimFinancialReviewCase, createFinancialReviewCase, decideFinancialPayment,
  ensureFinancialReviewCases, releaseSuspiciousFinancialHold, returnFinancialCaseForCorrection
} from './salesFinancialReview';
import { replaceDeclaredPaymentForCorrection } from './salesInvoice';

const NOW = '2026-08-09T10:20:30.000Z';
const reviewer: User = { id: 'fin1', username: 'fin1', fullName: 'مالی یک', phone: '09120000001', email: 'fin1@test.local', role: 'member', roleId: 'role_sales_payment_approver', roleTitle: 'مسئول مالی', password: 'x', isActive: true };
const reviewer2: User = { ...reviewer, id: 'fin2', username: 'fin2', fullName: 'مالی دو' };
const actor = { effective: { id: reviewer.id, fullName: reviewer.fullName }, real: undefined };

function payment(id: string, amount: number, status: DeclaredPayment['status'] = 'declared'): DeclaredPayment {
  return { id, amount, date: '1405/05/18', time: '10:20:30', method: 'card_to_card', recordedByUserId: 'seller', recordedByUserName: 'فروشنده', recordedAt: NOW, status };
}

function invoice(payments: DeclaredPayment[] = [payment('p1', 600), payment('p2', 400)], finalAmount = 1000): SalesInvoice {
  return {
    id: 'inv1', invoiceCode: 'INV-1', revision: 1, customerId: 'c1', salespersonUserId: 'seller', salespersonUserName: 'فروشنده',
    lineItems: [{ id: 'li1', itemType: 'goods', name: 'کالا', quantity: 1, unitPrice: finalAmount, discount: 0, lineTotal: finalAmount, sourceType: 'manual_addition' }],
    subtotal: finalAmount, totalDiscount: 0, finalAmount, paidAmount: payments.reduce((s, p) => s + p.amount, 0), remainingAmount: 0,
    status: 'awaiting_financial_confirmation', declaredPayments: payments, history: [], createdAt: NOW, updatedAt: NOW,
    registrationMode: 'direct', saleOrigin: 'digital_queue', supervisorApproval: { approverUserId: 'sup', approverUserName: 'سرپرست', snapshotSupervisorUserId: 'sup', isSuccessor: false, approvedAt: NOW }
  };
}

function activeCase(inv: SalesInvoice = invoice()): SalesFinancialReviewCase {
  return { ...createFinancialReviewCase(inv, NOW, 'manual_assignment'), status: 'in_progress', assignedReviewerUserId: reviewer.id, assignedReviewerUserName: reviewer.fullName };
}

describe('sales financial review vertical slice', () => {
  it('supports manual, shared claim and balanced distribution without duplicate cases', () => {
    const inv = invoice();
    expect(createFinancialReviewCase(inv, NOW, 'manual_assignment').status).toBe('pending_assignment');
    const shared = createFinancialReviewCase(inv, NOW, 'shared_claim');
    expect(claimFinancialReviewCase(shared, actor, NOW).ok).toBe(true);

    const busy = { ...activeCase(), id: 'busy', assignedReviewerUserId: reviewer.id };
    const balanced = createFinancialReviewCase({ ...inv, id: 'inv2', invoiceCode: 'INV-2' }, NOW, 'balanced_assignment', [reviewer, reviewer2], [busy]);
    expect(balanced.assignedReviewerUserId).toBe(reviewer2.id);

    const once = ensureFinancialReviewCases([inv], [], NOW, 'manual_assignment', [reviewer]);
    const twice = ensureFinancialReviewCases([inv], once, NOW, 'manual_assignment', [reviewer]);
    expect(twice).toHaveLength(1);
  });

  it('does not finalize while even one payment row is undecided', () => {
    const inv = invoice([payment('p1', 1000), payment('p2', 100)], 1000);
    const result = decideFinancialPayment(activeCase(inv), inv, 'p1', 'approved', 1000, undefined, actor, NOW, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.status).toBe('awaiting_financial_confirmation');
      expect(result.case.status).toBe('in_progress');
    }
  });

  it('rejects approved amount greater than the declared row', () => {
    const inv = invoice();
    const result = decideFinancialPayment(activeCase(inv), inv, 'p1', 'approved', 601, undefined, actor, NOW, []);
    expect(result.ok).toBe(false);
  });

  it('does not overwrite a payment decision that is already terminal', () => {
    const inv = invoice();
    const first = decideFinancialPayment(activeCase(inv), inv, 'p1', 'approved', 600, undefined, actor, NOW, []);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = decideFinancialPayment(first.case, first.invoice, 'p1', 'rejected', undefined, 'تلاش برای بازنویسی', actor, NOW, first.overpayments);
    expect(second.ok).toBe(false);
  });

  it('freezes suspicious invoice and only manager-style release resets the row with history', () => {
    const inv = invoice();
    const suspicious = decideFinancialPayment(activeCase(inv), inv, 'p1', 'suspicious', undefined, 'شماره پیگیری تکراری', actor, NOW, []);
    expect(suspicious.ok).toBe(true);
    if (!suspicious.ok) return;
    expect(suspicious.invoice.status).toBe('financial_suspicious_hold');
    expect(suspicious.case.status).toBe('suspicious_hold');
    const released = releaseSuspiciousFinancialHold(suspicious.case, suspicious.invoice, 'p1', 'بانک اصالت را تأیید کرد', actor, NOW);
    expect(released.ok).toBe(true);
    if (released.ok) {
      expect(released.invoice.status).toBe('awaiting_financial_confirmation');
      expect(released.invoice.declaredPayments[0].status).toBe('declared');
      expect(released.invoice.declaredPayments[0].financialHistory?.at(-1)?.note).toContain('رفع توقف مدیر');
    }
  });

  it('allocates exact invoice amount and opens an idempotent overpayment case for excess', () => {
    const inv = invoice([payment('p1', 1200)], 1000);
    const first = decideFinancialPayment(activeCase(inv), inv, 'p1', 'approved', 1000, undefined, actor, NOW, []);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.invoice.status).toBe('financial_confirmed');
    expect(first.overpayments).toHaveLength(1);
    expect(first.overpayments[0].excessAmount).toBe(200);
    const duplicateAttempt = decideFinancialPayment(activeCase(inv), inv, 'p1', 'approved', 1000, undefined, actor, NOW, first.overpayments);
    expect(duplicateAttempt.ok).toBe(true);
    if (duplicateAttempt.ok) expect(duplicateAttempt.overpayments).toHaveLength(1);
  });

  it('returns with reason, full description and problematic row to the correct owner route', () => {
    const inv = invoice();
    const result = returnFinancialCaseForCorrection(activeCase(inv), inv, { reason: 'کسری', description: 'ردیف اول با فایل بانک تطبیق ندارد', paymentIds: ['p1'] }, actor, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.status).toBe('returned_for_correction');
      expect(result.invoice.history.at(-1)?.destination).toBe('salesperson');
      expect(result.invoice.history.at(-1)?.correctedFields).toContain('payment:p1');
      expect(result.case.status).toBe('returned_for_correction');
    }
  });

  it('corrects payment through append-only lineage instead of deletion', () => {
    const old = payment('p1', 900, 'needs_correction');
    const returned = { ...invoice([old], 1000), status: 'returned_for_correction' as const };
    const replacement = payment('p2', 1000);
    const result = replaceDeclaredPaymentForCorrection(returned, 'p1', replacement, { effective: { id: 'seller', fullName: 'فروشنده' }, real: undefined }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.declaredPayments).toHaveLength(2);
      expect(result.invoice.declaredPayments[0].status).toBe('needs_correction');
      expect(result.invoice.declaredPayments[0].supersededByPaymentId).toBe('p2');
      expect(result.invoice.declaredPayments[1].correctsPaymentId).toBe('p1');
      expect(result.invoice.paidAmount).toBe(1000);
    }
  });
});
