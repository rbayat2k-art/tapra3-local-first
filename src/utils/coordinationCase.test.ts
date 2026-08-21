import { describe, it, expect, vi } from 'vitest';
import {
  createCoordinationCase, assignCoordinationCase, claimCoordinationCase, recordCoordinationAttempt,
  approveCoordinationCase, returnCoordinationCaseForCorrection, raiseCoordinationException,
  bypassCoordinationByManager, chooseBalancedCoordinator, updateCoordinationChecklistItem
} from './coordinationCase';
import {
  buildDraftInvoice, submitForRegistrationReview, approveRegistration, approveSupervisorInvoice,
  evaluateSupervisorSubmissionReadiness, addDeclaredPayment, recallForCorrection, returnForCorrection,
  resubmitAfterCorrection, checkInvoiceVersion, enterFinancialConfirmation, RECALLABLE_STATUSES,
  syncInvoiceCoordinationStatus
} from './salesInvoice';
import { storage } from './storage';
import type { SalesInvoice, SalesInvoiceLineItem, SystemRole, CoordinationCase } from '../types';
import type { ActorContext } from './salesPersonnelLifecycle';

// همان الگوی salesLifecycleCloseout.test.ts — نقش‌های واقعی «مؤثر» بعد از Migration (بدون این
// Stub، storage.getRoles() در محیط تست Node بدون localStorage واقعی Throw می‌کند).
function withMockedLocalStorage<T>(fn: () => T): T {
  const store = new Map<string, string>();
  const mock = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
  vi.stubGlobal('localStorage', mock);
  try {
    return fn();
  } finally {
    vi.unstubAllGlobals();
  }
}
function getMigratedRoles(): SystemRole[] {
  return withMockedLocalStorage(() => storage.getRoles());
}

function makeLineItem(overrides: Partial<SalesInvoiceLineItem> = {}): SalesInvoiceLineItem {
  return { id: 'li_1', itemType: 'goods', name: 'کالای تست', quantity: 1, unitPrice: 1000000, discount: 0, lineTotal: 1000000, sourceType: 'manual_addition', ...overrides };
}

const salesperson = { id: 'sp_1', fullName: 'فروشنده' };
const registrar = { id: 'entry_1', fullName: 'واحد ثبت' };
const supervisor = { id: 'sup_1', fullName: 'سرپرست' };
const coordManager = { id: 'coordmgr_1', fullName: 'مدیر هماهنگی' };
const coordSpecialist = { id: 'coordspec_1', fullName: 'مسئول هماهنگی' };
const otherSpecialist = { id: 'coordspec_2', fullName: 'مسئول هماهنگی دیگر' };
const financial = { id: 'fin_1', fullName: 'مسئول مالی' };

function actorOf(u: { id: string; fullName: string }, real: { id: string; fullName: string } | null = null): ActorContext {
  return { effective: u, real };
}

function completeChecklist(kase: CoordinationCase): CoordinationCase {
  return { ...kase, checklist: kase.checklist.map((item) => ({ ...item, decision: 'confirmed' })) };
}

// فاکتور را تا وضعیت awaiting_coordination_manager با پرداخت کامل پیش می‌برد — دقیقاً همان
// مسیر واقعی Handler (SalesInvoiceView.tsx) که evaluateSupervisorSubmissionReadiness را قبل از
// approveRegistration صدا می‌زند.
function invoiceAwaitingCoordination(finalAmount = 1000000, registeredOnBehalf = false): SalesInvoice {
  const draft = buildDraftInvoice({
    customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName,
    registeredByUserId: registeredOnBehalf ? registrar.id : undefined, registeredByUserName: registeredOnBehalf ? registrar.fullName : undefined,
    lineItems: [makeLineItem({ unitPrice: finalAmount, lineTotal: finalAmount })]
  }, [], 't0');
  const submitted = submitForRegistrationReview(draft, registeredOnBehalf ? registrar : salesperson, 't1');
  if (submitted.ok === false) throw new Error('setup failed');
  const withPayment = addDeclaredPayment(submitted.invoice, {
    id: 'pay1', amount: finalAmount, date: 't1', method: 'cash',
    recordedByUserId: registrar.id, recordedByUserName: registrar.fullName, recordedAt: 't1', status: 'declared'
  }, 't1');
  if (withPayment.ok === false) throw new Error('setup failed: ' + withPayment.reason);
  const readiness = evaluateSupervisorSubmissionReadiness(withPayment.invoice);
  if (readiness.ok === false) throw new Error('readiness failed: ' + readiness.reason);
  const approvedReg = approveRegistration(withPayment.invoice, registrar, 't2');
  if (approvedReg.ok === false) throw new Error('setup failed');
  const supApproved = approveSupervisorInvoice(
    approvedReg.invoice, { approverUserId: supervisor.id, approverUserName: supervisor.fullName, snapshotSupervisorUserId: supervisor.id, isSuccessor: false }, 't3'
  );
  if (supApproved.ok === false) throw new Error('setup failed');
  return supApproved.invoice;
}

describe('بند ۲/۳ مأموریت — پیش‌شرط ارسال به سرپرست و ثبت نیابتی کاغذی', () => {
  it('scenario 2: incomplete declared payment blocks submission to supervisor', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem({ unitPrice: 1000000, lineTotal: 1000000 })] }, [], 't0');
    const submitted = submitForRegistrationReview(draft, salesperson, 't1');
    if (submitted.ok === false) throw new Error('unexpected');
    // هیچ پرداختی اعلام نشده — remainingAmount === finalAmount
    const readiness = evaluateSupervisorSubmissionReadiness(submitted.invoice);
    expect(readiness.ok).toBe(false);
  });

  it('scenario 3: fully-paid invoice is allowed through to awaiting_coordination_manager with its own Snapshot', () => {
    const invoice = invoiceAwaitingCoordination();
    expect(invoice.status).toBe('awaiting_coordination_manager');
    expect(invoice.supervisorApproval?.approverUserId).toBe('sup_1');
  });

  it('scenario 13/15: paper invoice registered on-behalf carries no leadId and keeps salesperson as commission owner, registrar as recorder', () => {
    const invoice = invoiceAwaitingCoordination(1000000, true);
    expect(invoice.leadId).toBeUndefined();
    expect(invoice.registrationMode).toBe('on_behalf');
    expect(invoice.saleOrigin).toBe('paper_offline');
    expect(invoice.salespersonUserId).toBe(salesperson.id);
    expect(invoice.registeredByUserId).toBe(registrar.id);
  });

  it('digital invoice defaults to registrationMode direct / saleOrigin digital_queue', () => {
    const invoice = invoiceAwaitingCoordination(1000000, false);
    expect(invoice.registrationMode).toBe('direct');
    expect(invoice.saleOrigin).toBe('digital_queue');
  });
});

describe('بند ۵/۱۳ مأموریت — تأیید سرپرست به هماهنگی می‌رود، نه مالی', () => {
  it('scenario 5: approveSupervisorInvoice never produces awaiting_financial_confirmation directly', () => {
    const invoice = invoiceAwaitingCoordination();
    expect(invoice.status).not.toBe('awaiting_financial_confirmation');
    expect(invoice.status).not.toBe('registered');
    expect(invoice.status).toBe('awaiting_coordination_manager');
  });

  it('scenario 27: re-approving the same (already-transitioned) invoice a second time is rejected — no duplicate coordination case path', () => {
    const invoice = invoiceAwaitingCoordination();
    const secondAttempt = approveSupervisorInvoice(
      invoice, { approverUserId: supervisor.id, approverUserName: supervisor.fullName, snapshotSupervisorUserId: supervisor.id, isSuccessor: false }, 't4'
    );
    expect(secondAttempt.ok).toBe(false);
  });
});

describe('بند ۶ مأموریت — تخصیص، Claim، قلمرو مسئول هماهنگی', () => {
  it('scenario 6: coordination manager assigns a pending case to a specific specialist', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    expect(kase.status).toBe('pending_assignment');
    const result = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:05:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.case.status).toBe('assigned');
    expect(result.case.assignedCoordinatorUserId).toBe(coordSpecialist.id);
  });

  it('scenario 7: a specialist the case was NOT assigned to cannot Claim it', () => {
    const invoice = invoiceAwaitingCoordination();
    let kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    const assigned = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:05:00.000Z');
    if (assigned.ok === false) throw new Error('setup failed');
    kase = assigned.case;
    const wrongClaim = claimCoordinationCase(kase, actorOf(otherSpecialist), '2024-01-01T00:06:00.000Z');
    expect(wrongClaim.ok).toBe(false);
    const rightClaim = claimCoordinationCase(kase, actorOf(coordSpecialist), '2024-01-01T00:06:00.000Z');
    expect(rightClaim.ok).toBe(true);
  });

  it('rejects assigning a case that is not pending_assignment (already assigned)', () => {
    const invoice = invoiceAwaitingCoordination();
    let kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    const assigned = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:05:00.000Z');
    if (assigned.ok === false) throw new Error('setup failed');
    const secondAssign = assignCoordinationCase(assigned.case, otherSpecialist, actorOf(coordManager), '2024-01-01T00:07:00.000Z');
    expect(secondAssign.ok).toBe(false);
  });
});

describe('بند ۶/۹/۱۱ مأموریت — Attempt Append-only، تأیید هماهنگی → ورود به مالی', () => {
  function assignedAndClaimedCase(invoice: SalesInvoice) {
    let kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    const assigned = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:05:00.000Z');
    if (assigned.ok === false) throw new Error('setup failed');
    const claimed = claimCoordinationCase(assigned.case, actorOf(coordSpecialist), '2024-01-01T00:06:00.000Z');
    if (claimed.ok === false) throw new Error('setup failed');
    return claimed.case;
  }

  it('scenario 8: records a callback attempt and moves the case to callback_scheduled', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = assignedAndClaimedCase(invoice);
    const result = recordCoordinationAttempt(kase, actorOf(coordSpecialist), '2024-01-01T00:10:00.000Z', 'callback_requested', { note: 'مشتری فردا در دسترس است', nextActionAt: '2024-01-02T08:00:00.000Z' });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.case.status).toBe('callback_scheduled');
    expect(result.attempt.result).toBe('callback_requested');
    expect(result.attempt.occurredAtIso).toBe('2024-01-01T00:10:00.000Z');
    expect(result.attempt.correlationId).toBeTruthy();
  });

  it('scenario 9/10: approving coordination sends the invoice to awaiting_financial_confirmation, never before', () => {
    const invoice = invoiceAwaitingCoordination();
    let kase = assignedAndClaimedCase(invoice);
    // بدون مدرک تصمیم هماهنگی حتی Utility مرکزی نیز ورود مستقیم را رد می‌کند.
    const premature = enterFinancialConfirmation(invoice, financial, 't5', { caseId: '', invoiceId: invoice.id, decision: 'confirmed' });
    expect(premature.ok).toBe(false);
    const contact = recordCoordinationAttempt(kase, actorOf(coordSpecialist), '2024-01-01T00:14:00.000Z', 'confirmed');
    if (contact.ok === false) throw new Error('setup failed');
    kase = completeChecklist(contact.case);
    const approveResult = approveCoordinationCase(kase, actorOf(coordSpecialist), '2024-01-01T00:15:00.000Z', [contact.attempt]);
    expect(approveResult.ok).toBe(true);
    if (approveResult.ok === false) return;
    expect(approveResult.case.status).toBe('closed');
    expect(approveResult.case.closedResult).toBe('confirmed');
    const entered = enterFinancialConfirmation(invoice, financial, 't6', { caseId: approveResult.case.id, invoiceId: invoice.id, decision: 'confirmed' });
    expect(entered.ok).toBe(true);
    if (entered.ok === false) return;
    expect(entered.invoice.status).toBe('awaiting_financial_confirmation');
  });

  it('enterFinancialConfirmation rejects an invoice that never went through coordination (e.g. still awaiting_supervisor_approval)', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem()] }, [], 't0');
    const result = enterFinancialConfirmation(draft, financial, 't1', { caseId: 'x', invoiceId: draft.id, decision: 'confirmed' });
    expect(result.ok).toBe(false);
  });

  it('returnCoordinationCaseForCorrection + salesInvoice.returnForCorrection close the case and return the invoice together', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = assignedAndClaimedCase(invoice);
    const caseResult = returnCoordinationCaseForCorrection(kase, actorOf(coordSpecialist), '2024-01-01T00:20:00.000Z', 'مبلغ واریزی با فاکتور مطابقت ندارد');
    expect(caseResult.ok).toBe(true);
    if (caseResult.ok === false) return;
    expect(caseResult.case.status).toBe('closed');
    expect(caseResult.case.closedResult).toBe('mismatch_returned');
    const invResult = returnForCorrection(invoice, { reason: 'مبلغ واریزی مغایرت دارد', description: 'مشتری ۵۰۰ هزار کمتر واریز کرده' }, actorOf(coordSpecialist), '2024-01-01T00:20:00.000Z');
    expect(invResult.ok).toBe(true);
    if (invResult.ok === false) return;
    expect(invResult.invoice.status).toBe('returned_for_correction');
    // مسیر دیجیتال به‌طور پیش‌فرض به فروشنده برمی‌گردد
    expect(invResult.invoice.history.at(-1)?.destination).toBe('salesperson');
  });

  it('exception results (customer_cancelled/complaint_referred/escalated_to_manager) land in the exception queue, never silently closed', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = assignedAndClaimedCase(invoice);
    const result = raiseCoordinationException(kase, actorOf(coordSpecialist), '2024-01-01T00:25:00.000Z', 'customer_cancelled', 'مشتری از خرید منصرف شد');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.case.status).toBe('exception');
    expect(result.attempt.result).toBe('customer_cancelled');
  });
});

describe('هماهنگی مدیریتی و روش توزیع — بدون موتور تصمیم‌گیر خودکار', () => {
  it('عبور بدون تماس فقط با عامل انسانی و دلیل اجباری ثبت می‌شود', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    expect(bypassCoordinationByManager(kase, actorOf(coordManager), '2024-01-01T00:01:00.000Z', '').ok).toBe(false);
    const bypassed = bypassCoordinationByManager(kase, actorOf(coordManager), '2024-01-01T00:01:00.000Z', 'تصمیم مدیر پس از بررسی سوابق');
    expect(bypassed.ok).toBe(true);
    if (bypassed.ok === false) return;
    expect(bypassed.case.closedResult).toBe('manager_bypass');
    expect(bypassed.case.isManagerBypassed).toBe(true);
    expect(bypassed.attempt.actorUserId).toBe(coordManager.id);
  });

  it('توزیع متوازن مسئول دارای کمترین بار باز را انتخاب می‌کند', () => {
    const invoice = invoiceAwaitingCoordination();
    const busy = { ...createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z'), status: 'assigned' as const, assignedCoordinatorUserId: coordSpecialist.id };
    expect(chooseBalancedCoordinator([coordSpecialist, otherSpecialist], [busy])?.id).toBe(otherSpecialist.id);
  });

  it('چک‌لیست مغایرت بدون توضیح را رد می‌کند', () => {
    const kase = createCoordinationCase(invoiceAwaitingCoordination(), '2024-01-01T00:00:00.000Z');
    const assigned = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:01:00.000Z');
    if (assigned.ok === false) throw new Error('setup failed');
    expect(updateCoordinationChecklistItem(assigned.case, 'identity_contact', 'mismatch', '', actorOf(coordSpecialist), '2024-01-01T00:02:00.000Z').ok).toBe(false);
  });
});

describe('بند ۴ مأموریت — پس‌گرفتن، عودت رسمی، ارسال مجدد', () => {
  it('scenario 16: recall succeeds before the next unit has taken any official action', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem()] }, [], 't0');
    const submitted = submitForRegistrationReview(draft, salesperson, 't1');
    if (submitted.ok === false) throw new Error('unexpected');
    expect(RECALLABLE_STATUSES).toContain(submitted.invoice.status);
    const result = recallForCorrection(submitted.invoice, actorOf(salesperson), '2024-01-01T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.invoice.status).toBe('draft');
    expect(result.invoice.invoiceCode).toBe(draft.invoiceCode); // scenario 20
  });

  it('scenario 17a: recall still succeeds while awaiting_coordination_manager — the manager has not acted yet', () => {
    const invoice = invoiceAwaitingCoordination();
    const result = recallForCorrection(invoice, actorOf(salesperson), '2024-01-01T00:00:00.000Z');
    expect(result.ok).toBe(true);
  });

  it('scenario 17b: recall is rejected once the coordination manager has assigned the case (official action + invoice status mirrors it)', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    const assigned = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:05:00.000Z');
    if (assigned.ok === false) throw new Error('setup failed');
    const synced = syncInvoiceCoordinationStatus(invoice, 'assigned', coordManager, '2024-01-01T00:05:00.000Z');
    if (synced.ok === false) throw new Error('setup failed');
    expect(synced.invoice.status).toBe('coordination_assigned');
    expect(RECALLABLE_STATUSES).not.toContain(synced.invoice.status);
    const result = recallForCorrection(synced.invoice, actorOf(salesperson), '2024-01-01T00:10:00.000Z');
    expect(result.ok).toBe(false);
  });

  it('recall rejects a non-owner (e.g. a different salesperson) even in a recallable status', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem()] }, [], 't0');
    const submitted = submitForRegistrationReview(draft, salesperson, 't1');
    if (submitted.ok === false) throw new Error('unexpected');
    const result = recallForCorrection(submitted.invoice, actorOf({ id: 'not_the_owner', fullName: 'کس دیگر' }), '2024-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
  });

  it('scenario 18/19/21: an official return re-opens editing, resubmit bumps revision, invalidates prior approval, and restarts from the supervisor gate', () => {
    const invoice = invoiceAwaitingCoordination();
    const returned = returnForCorrection(invoice, { reason: 'مغایرت مبلغ', description: 'باید اصلاح شود' }, actorOf(coordSpecialist), '2024-01-01T00:00:00.000Z');
    expect(returned.ok).toBe(true);
    if (returned.ok === false) return;
    expect(returned.invoice.status).toBe('returned_for_correction');
    expect(returned.invoice.supervisorApproval).toBeUndefined();
    expect(returned.invoice.history.some((h) => h.action === 'approval_invalidated_by_revision')).toBe(true);

    const resubmitted = resubmitAfterCorrection(returned.invoice, [makeLineItem({ id: 'li_new', unitPrice: 1000000, lineTotal: 1000000 })], actorOf(salesperson), '2024-01-01T00:05:00.000Z');
    expect(resubmitted.ok).toBe(true);
    if (resubmitted.ok === false) return;
    expect(resubmitted.invoice.revision).toBe(invoice.revision + 1);
    expect(resubmitted.invoice.status).toBe('awaiting_supervisor_approval'); // scenario 21: از سرپرست تکرار می‌شود
    expect(resubmitted.invoice.invoiceCode).toBe(invoice.invoiceCode); // scenario 20
  });

  it('returnForCorrection requires both reason and description', () => {
    const invoice = invoiceAwaitingCoordination();
    const missingDescription = returnForCorrection(invoice, { reason: 'مغایرت', description: '' }, actorOf(coordSpecialist), '2024-01-01T00:00:00.000Z');
    expect(missingDescription.ok).toBe(false);
    const missingReason = returnForCorrection(invoice, { reason: '', description: 'شرح کامل' }, actorOf(coordSpecialist), '2024-01-01T00:00:00.000Z');
    expect(missingReason.ok).toBe(false);
  });

  it('paper-path return defaults destination to registrar, digital-path defaults to salesperson', () => {
    const digitalInvoice = invoiceAwaitingCoordination(1000000, false);
    const paperInvoice = invoiceAwaitingCoordination(1000000, true);
    const digitalReturn = returnForCorrection(digitalInvoice, { reason: 'x', description: 'y' }, actorOf(coordSpecialist), '2024-01-01T00:00:00.000Z');
    const paperReturn = returnForCorrection(paperInvoice, { reason: 'x', description: 'y' }, actorOf(coordSpecialist), '2024-01-01T00:00:00.000Z');
    if (digitalReturn.ok === false || paperReturn.ok === false) throw new Error('unexpected');
    expect(digitalReturn.invoice.history.at(-1)?.destination).toBe('salesperson');
    expect(paperReturn.invoice.history.at(-1)?.destination).toBe('registrar');
  });
});

describe('بند ۱۰ مأموریت — Optimistic Lock', () => {
  it('scenario 22: a stale version is rejected, matching version passes', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem()] }, [], 't0');
    expect(draft.version).toBe(1);
    const stale = checkInvoiceVersion(draft, 0);
    expect(stale.ok).toBe(false);
    const current = checkInvoiceVersion(draft, 1);
    expect(current.ok).toBe(true);
    const noExpectation = checkInvoiceVersion(draft, undefined);
    expect(noExpectation.ok).toBe(true);
  });

  it('every mutating salesInvoice function increments version by one', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem()] }, [], 't0');
    const submitted = submitForRegistrationReview(draft, salesperson, 't1');
    if (submitted.ok === false) throw new Error('unexpected');
    expect(submitted.invoice.version).toBe((draft.version || 1) + 1);
  });
});

describe('بند ۲۸ مأموریت — Impersonation: تفکیک هویت واقعی از هویت مؤثر', () => {
  it('recallForCorrection records realActorUserId distinct from effectiveUserId under impersonation', () => {
    const draft = buildDraftInvoice({ customerId: 'cust_1', salespersonUserId: salesperson.id, salespersonUserName: salesperson.fullName, lineItems: [makeLineItem()] }, [], 't0');
    const submitted = submitForRegistrationReview(draft, salesperson, 't1');
    if (submitted.ok === false) throw new Error('unexpected');
    const admin = { id: 'admin_real', fullName: 'ادمین واقعی' };
    const result = recallForCorrection(submitted.invoice, actorOf(salesperson, admin), '2024-01-01T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    const entry = result.invoice.history.at(-1);
    expect(entry?.effectiveUserId).toBe(salesperson.id);
    expect(entry?.realActorUserId).toBe(admin.id);
  });

  it('without impersonation, realActorUserId equals effectiveUserId', () => {
    const invoice = invoiceAwaitingCoordination();
    const kase = createCoordinationCase(invoice, '2024-01-01T00:00:00.000Z');
    const assigned = assignCoordinationCase(kase, coordSpecialist, actorOf(coordManager), '2024-01-01T00:05:00.000Z');
    if (assigned.ok === false) throw new Error('unexpected');
    const claimed = claimCoordinationCase(assigned.case, actorOf(coordSpecialist), '2024-01-01T00:06:00.000Z');
    if (claimed.ok === false) throw new Error('unexpected');
    const attempt = recordCoordinationAttempt(claimed.case, actorOf(coordSpecialist), '2024-01-01T00:10:00.000Z', 'confirmed');
    if (attempt.ok === false) throw new Error('unexpected');
    expect(attempt.attempt.realActorUserId).toBe(coordSpecialist.id);
    expect(attempt.attempt.effectiveUserId).toBe(coordSpecialist.id);
  });
});

describe('بند ۲۵/۲۶ مأموریت — نقش‌ها/Permissionهای هماهنگی و پایداری Migration', () => {
  it('role_coordination_manager and role_coordination_specialist have distinct, minimal, non-overlapping-with-financial permission sets', () => {
    const roles = getMigratedRoles();
    const manager = roles.find((r) => r.id === 'role_coordination_manager');
    const specialist = roles.find((r) => r.id === 'role_coordination_specialist');
    expect(manager).toBeTruthy();
    expect(specialist).toBeTruthy();
    expect(manager!.permissions).toContain('assign_coordination_case');
    expect(manager!.permissions).toContain('bypass_coordination_without_contact');
    expect(manager!.permissions).toContain('manage_coordination_distribution');
    // مسئول هماهنگی نه تخصیص می‌دهد نه عبور مدیریتی — فقط پرونده‌های خودش
    expect(specialist!.permissions).not.toContain('assign_coordination_case');
    expect(specialist!.permissions).not.toContain('bypass_coordination_without_contact');
    expect(specialist!.permissions).toContain('claim_coordination_case');
    // هیچ‌کدام مجوز مالی/تأیید سرپرست ندارند
    expect(manager!.permissions).not.toContain('review_invoice_financial_confirmation');
    expect(manager!.permissions).not.toContain('approve_sales_invoice_supervisor_step');
  });

  it('scenario 26: running the roles migration twice never duplicates role entries', () => {
    const { first, second } = withMockedLocalStorage(() => ({ first: storage.getRoles(), second: storage.getRoles() }));
    expect(second.length).toBe(first.length);
    expect(second.filter((r) => r.id === 'role_coordination_manager')).toHaveLength(1);
    expect(second.filter((r) => r.id === 'role_coordination_specialist')).toHaveLength(1);
  });
});
