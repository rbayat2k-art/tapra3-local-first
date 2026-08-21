import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, OperationalRecord, OperationalRecordHistory, SnapshotManifest, UserNotification} from './model';
import {FOUNDATION_STORES} from './model';
import {purchaseAllocationTotal, purchaseRequestTotal, purchaseRequestValidationErrors, readPurchaseRequestPayload} from './purchaseRequest';
import {ERP_MODULES} from './erpCatalog';
import {createSeedData} from './seed';
import {LocalFoundationService, type OperationalRecordInput} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {canRevealTreasuryBeneficiaryCard, isTreasuryRecordVisibleToUser, treasuryRequesterName} from './TreasuryExecutionUi';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  async transaction<T>(stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const tx: StorageTransaction = {
      get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,
      getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],
      put: async <V>(store: FoundationStoreName, value: V) => {this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},
      delete: async (store: FoundationStoreName, id: IDBValidKey) => {this.stores.get(store)!.delete(id);},
      clear: async (store: FoundationStoreName) => {this.stores.get(store)!.clear();},
    };
    return work(tx);
  }
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');}
  async importSnapshot(_snapshot: SnapshotManifest): Promise<void> {throw new Error('not used');}
}

describe('multi-branch purchase request', () => {
  it('calculates the amount from lines and requires exact allocation by branch and cost center', () => {
    const seed = createSeedData();
    const state = {
      units: seed.organizational_units,
    } as Parameters<typeof purchaseRequestValidationErrors>[0];
    const record = (seed.purchase_requests as OperationalRecord[])[0];
    const payload = readPurchaseRequestPayload(record.payload);
    expect(purchaseRequestTotal(payload)).toBe(165000000n);
    expect(purchaseAllocationTotal(payload)).toBe(165000000n);
    expect(purchaseRequestValidationErrors(state, {
      title: record.title, description: record.description, priority: record.priority,
      dueAt: undefined, payload: record.payload,
    } as OperationalRecordInput)).toEqual([]);
    payload.allocations[0].amountRial = '1';
    const errors = purchaseRequestValidationErrors(state, {title: record.title, description: record.description, dueAt: record.dueAt, payload: payload as unknown as OperationalRecord['payload']});
    expect(errors).toContain('مجموع سهم شعب و مراکز هزینه باید دقیقاً با مجموع ردیف‌های خرید برابر باشد.');
  });

  it('keeps needed date optional and requires valid beneficiary card details', () => {
    const seed = createSeedData();
    const state = {units: seed.organizational_units} as Parameters<typeof purchaseRequestValidationErrors>[0];
    const record = (seed.purchase_requests as OperationalRecord[])[0];
    const payload = readPurchaseRequestPayload(record.payload);
    expect(payload.quotationAttachments).toHaveLength(1);
    expect(purchaseRequestValidationErrors(state, {title: record.title, description: record.description, dueAt: undefined, payload: payload as unknown as OperationalRecord['payload']})).toEqual([]);
    payload.beneficiaryCardNumber = '123'; payload.beneficiaryLastName = '';
    const errors = purchaseRequestValidationErrors(state, {title: record.title, description: record.description, dueAt: undefined, payload: payload as unknown as OperationalRecord['payload']});
    expect(errors).toContain('شماره کارت دریافت‌کننده الزامی است و باید دقیقاً ۱۶ رقم باشد.');
    expect(errors).toContain('نام خانوادگی صاحب کارت الزامی است.');
  });

  it('enforces maker/checker and routes an approved request directly to the selected payment user', async () => {
    const storage = new MemoryStorage(); await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    const service = new LocalFoundationService(storage);
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    let state = await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    expect(state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1')?.status).toBe('submitted');
    await expect(service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'تأیید درخواست')).rejects.toThrow();

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    state = await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'اقلام و تقسیم مالی شعب بررسی شد؛ پرداخت طبق سهم هر شعبه انجام شود');
    expect(state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1')?.status).toBe('sent_to_treasury');
    const payments = state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === 'demo-purchase-request-1');
    expect(payments).toHaveLength(2);
    expect(payments.map((item) => item.amountRial).sort()).toEqual(['100000000', '65000000'].sort());
    expect(new Set(payments.map((item) => item.branchUnitId)).size).toBe(2);
    expect(payments.every((item) => item.assigneeUserId === 'persona-treasury-executor')).toBe(true);
    expect(payments.every((item) => item.payload.initialRequesterUserId === 'persona-purchase-requester')).toBe(true);
    expect(payments.every((item) => treasuryRequesterName(item, state) === 'پریسا جوادی')).toBe(true);

    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});
    state = await service.loadState();
    expect(payments.every((item) => isTreasuryRecordVisibleToUser(item, state))).toBe(true);
    expect(payments.every((item) => canRevealTreasuryBeneficiaryCard(item, state))).toBe(true);
    expect(isTreasuryRecordVisibleToUser({...payments[0], assigneeUserId: 'persona-branch-approver'}, state)).toBe(false);
    expect(canRevealTreasuryBeneficiaryCard({...payments[0], assigneeUserId: 'persona-branch-approver'}, state)).toBe(false);

    await storage.put('sessions', {...session!, activeUserId: 'persona-product-owner', actingAdminUserId: undefined});
    state = await service.loadState();
    expect(isTreasuryRecordVisibleToUser({...payments[0], assigneeUserId: 'persona-branch-approver'}, state)).toBe(true);
    expect(canRevealTreasuryBeneficiaryCard(payments[0], state)).toBe(false);
  });

  it('returns correction to the requester and closes rejected requests', async () => {
    const storage = new MemoryStorage(); await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    const service = new LocalFoundationService(storage);
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    let state = await service.decidePurchaseRequest('demo-purchase-request-1', 'needs_correction', '', 'شماره پیش‌فاکتور و توضیح ردیف دوم اصلاح شود');
    let request = state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1');
    expect(request?.status).toBe('needs_correction');
    expect(request?.assigneeUserId).toBe('persona-purchase-requester');

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    state = await service.loadState();
    expect(state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1')?.assigneeUserId).toBe('persona-purchase-approver');

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    state = await service.decidePurchaseRequest('demo-purchase-request-1', 'rejected', '', 'خرید با سیاست مصوب شرکت سازگار نیست');
    request = state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1');
    expect(request?.status).toBe('rejected');
    expect(request?.assigneeUserId).toBe('persona-purchase-requester');
  });

  it('lets the assigned treasury executor register payment directly while reference and receipt stay optional', async () => {
    const storage = new MemoryStorage(); await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    const service = new LocalFoundationService(storage);
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    let state = await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'پرداخت سهم‌های تأییدشده انجام شود');
    const treasuryRecord = state.operationalRecords.find((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === 'demo-purchase-request-1')!;

    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});
    expect(treasuryRecord.status).toBe('queued');
    expect(ERP_MODULES.find((item) => item.id === 'treasury-execution')?.workflow.transitions.some((item) => item.to === 'claimed')).toBe(false);
    state = await service.recordTreasuryPayment(treasuryRecord.id, {paidAt: '2026-08-20', paymentReference: '', note: 'پرداخت از حساب عملیاتی شرکت'});
    const paid = state.operationalRecords.find((item) => item.id === treasuryRecord.id)!;
    expect(paid.status).toBe('payment_recorded');
    expect((paid.payload.payment as {paymentReference: string; receipt?: unknown}).paymentReference).toBe('');
    expect((paid.payload.payment as {paymentReference: string; receipt?: unknown}).receipt).toBeUndefined();
    const source = state.operationalRecords.find((item) => item.id === paid.relatedRecordId)!;
    expect(readPurchaseRequestPayload(source.payload).lines).toHaveLength(2);

    state = await service.reviseTreasuryPayment(treasuryRecord.id, {paidAt: '2026-08-21', paymentReference: 'TRX-CORRECTED', note: 'اصلاح شماره پیگیری', receipt: {id: 'receipt-1', fileName: 'receipt.png', mimeType: 'image/png', size: 24, dataUrl: 'data:image/png;base64,iVBORw0KGgo='}}, 'شماره پیگیری قبلی اشتباه بود');
    const revised = state.operationalRecords.find((item) => item.id === treasuryRecord.id)!;
    expect(revised.status).toBe('payment_recorded');
    expect((revised.payload.payment as {paymentReference: string}).paymentReference).toBe('TRX-CORRECTED');
    expect(revised.payload.paymentHistory).toHaveLength(1);

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await expect(service.revertTreasuryPayment(treasuryRecord.id, 'بازگشت غیرمجاز')).rejects.toThrow('فقط مجری خزانه تعیین‌شده');
    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});
    state = await service.revertTreasuryPayment(treasuryRecord.id, 'پرداخت برای حساب اشتباه ثبت شده بود');
    const reverted = state.operationalRecords.find((item) => item.id === treasuryRecord.id)!;
    expect(reverted.status).toBe('queued');
    expect(reverted.payload.payment).toBeUndefined();
    expect(reverted.payload.paymentHistory).toHaveLength(2);
    expect(state.operationalHistory.filter((item) => item.recordId === treasuryRecord.id).sort((a, b) => a.sequence - b.sequence).at(-1)?.toState).toBe('queued');
  });

  it('allows next-day treasury follow-up once per day and delivers an unread notification to active treasury executors', async () => {
    const storage = new MemoryStorage(); await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    const service = new LocalFoundationService(storage);
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'پرداخت سهم‌های تأییدشده انجام شود');

    const histories = await storage.getAll<OperationalRecordHistory>('workflow_history');
    for (const item of histories.filter((history) => history.recordId === 'demo-purchase-request-1' && history.toState === 'sent_to_treasury')) {
      await storage.put('workflow_history', {...item, occurredAt: '2000-01-01T08:00:00.000Z'});
    }

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    let state = await service.requestTreasuryFollowUp('demo-purchase-request-1');
    expect(state.notifications).toEqual([]);
    await expect(service.requestTreasuryFollowUp('demo-purchase-request-1')).rejects.toThrow('امروز قبلاً پیگیری ثبت شده است');

    const storedNotifications = await storage.getAll<UserNotification>('notifications');
    expect(storedNotifications).toHaveLength(1);
    expect(storedNotifications[0]).toMatchObject({userId: 'persona-treasury-executor', kind: 'treasury_follow_up', relatedRecordId: 'demo-purchase-request-1'});
    expect(storedNotifications[0].readAt).toBeUndefined();

    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});
    state = await service.loadState();
    expect(state.notifications).toHaveLength(1);
    state = await service.markNotificationRead(storedNotifications[0].id);
    expect(state.notifications[0].readAt).toBeTruthy();
    expect(state.operationalHistory.some((item) => item.recordId === 'demo-purchase-request-1' && item.eventType === 'comment' && item.reason?.includes('پیگیری'))).toBe(true);
  });
});
