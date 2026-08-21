import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, OperationalRecord, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {isEmployeeAdvanceVisible, readEmployeeAdvancePayload} from './employeeAdvance';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  async transaction<T>(stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {const tx: StorageTransaction = {get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],put: async <V>(store: FoundationStoreName, value: V) => {this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},delete: async (store, id) => {this.stores.get(store)!.delete(id);},clear: async (store) => {this.stores.get(store)!.clear();}}; return work(tx);}
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');} async importSnapshot(): Promise<void> {throw new Error('not used');}
}

async function setup() {const storage = new MemoryStorage(); await storage.replaceAll(createSeedData()); const session = await storage.get<FoundationSession>('sessions', 'active-session'); return {storage, session: session!, service: new LocalFoundationService(storage)};}
const login = (storage: MemoryStorage, session: FoundationSession, activeUserId: string) => storage.put('sessions', {...session, activeUserId, actingAdminUserId: undefined});

describe('employee advance workflow', () => {
  it('routes a normal signed request through branch, accounting, main approver and treasury', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '60000000', note: 'درخواست مساعده ماه جاری', signatureAccepted: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    expect(advance.status).toBe('branch_review'); expect(advance.assigneeUserId).toBe('persona-advance-branch-manager');

    await login(storage, session, 'persona-advance-branch-manager'); state = await service.decideEmployeeAdvance(advance.id, 'approve'); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('accounting_review'); expect(advance.assigneeUserId).toBe('persona-advance-accounting');
    await login(storage, session, 'persona-advance-accounting'); state = await service.decideEmployeeAdvance(advance.id, 'approve'); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('final_review'); expect(advance.assigneeUserId).toBe('persona-sales-advance-approver');
    await login(storage, session, 'persona-sales-advance-approver'); state = await service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', '', '75000000'); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('sent_to_treasury'); expect(advance.amountRial).toBe('75000000');
    const payment = state.operationalRecords.find((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === advance.id)!;
    expect(payment.assigneeUserId).toBe('persona-treasury-executor'); expect(payment.payload.beneficiaryCardNumber).toBe(readEmployeeAdvancePayload(advance).cardNumber);

    await login(storage, session, 'persona-treasury-executor'); state = await service.recordTreasuryPayment(payment.id, {paidAt: '2026-08-20', paymentReference: '', note: ''});
    expect(state.operationalRecords.find((item) => item.id === advance.id)?.status).toBe('paid');
  });

  it('skips branch manager for a proxy request approved at creation and permits own approval', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-sales-advance-approver');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-sales-advance-approver', amountRial: '90000000', note: '', signatureAccepted: true, approveAtCreation: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-sales-advance-approver')!;
    expect(advance.status).toBe('accounting_review'); expect(readEmployeeAdvancePayload(advance).selfApprovedAt).toBeTruthy();
    await login(storage, session, 'persona-advance-accounting'); state = await service.decideEmployeeAdvance(advance.id, 'approve'); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('sent_to_treasury');
    expect(state.operationalHistory.filter((item) => item.recordId === advance.id).some((item) => item.toState === 'branch_review')).toBe(false);
  });

  it('keeps requests private outside beneficiary, assignee and scoped approval roles', async () => {
    const {storage, session, service} = await setup(); await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '10000000', note: '', signatureAccepted: true});
    const advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    expect(isEmployeeAdvanceVisible(advance, state)).toBe(true);
    await login(storage, session, 'persona-purchase-requester'); state = await service.loadState(); expect(isEmployeeAdvanceVisible(advance, state)).toBe(false);
  });

  it('lets the requester save a signed version before the branch decision without losing the workflow assignee', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '60000000', note: 'نسخه اولیه', signatureAccepted: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    const firstVersion = advance.version;
    state = await service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId: 'personnel-arman', amountRial: '65000000', note: 'نسخه اصلاحی قبل از بررسی', signatureAccepted: true});
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('branch_review');
    expect(advance.assigneeUserId).toBe('persona-advance-branch-manager');
    expect(advance.amountRial).toBe('65000000');
    expect(advance.description).toBe('نسخه اصلاحی قبل از بررسی');
    expect(advance.version).toBe(firstVersion + 1);
    expect(state.operationalHistory.some((item) => item.recordId === advance.id && item.eventType === 'corrected')).toBe(true);
  });

  it('returns a corrected request to the exact reviewer stage and blocks unrelated or late edits', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '60000000', note: '', signatureAccepted: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;

    await login(storage, session, 'persona-advance-branch-manager');
    state = await service.decideEmployeeAdvance(advance.id, 'approve');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'needs_correction', 'مبلغ و توضیحات اصلاح شود');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('needs_correction');

    await login(storage, session, 'persona-purchase-requester');
    await expect(service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId: 'personnel-arman', amountRial: '62000000', note: 'غیرمجاز', signatureAccepted: true})).rejects.toThrow('فقط درخواست‌کننده');

    await login(storage, session, 'persona-seller');
    state = await service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId: 'personnel-arman', amountRial: '62000000', note: 'مدارک و مبلغ اصلاح شد', signatureAccepted: true});
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('accounting_review');
    expect(advance.assigneeUserId).toBe('persona-advance-accounting');

    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'approve');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-sales-advance-approver');
    state = await service.decideEmployeeAdvance(advance.id, 'approve_to_treasury');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-seller');
    await expect(service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId: 'personnel-arman', amountRial: '70000000', note: '', signatureAccepted: true})).rejects.toThrow('ویرایش مساعده فقط');
  });

  it('lets the active scoped branch manager decide an older request even when its saved assignee is stale', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '60000000', note: 'رکورد قدیمی شعبه', signatureAccepted: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    await storage.put('employee_advances', {...advance, assigneeUserId: 'persona-product-owner'});

    await login(storage, session, 'persona-advance-branch-manager');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', 'بررسی و تأیید مدیر شعبه');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('accounting_review');
    expect(advance.assigneeUserId).toBe('persona-advance-accounting');
    expect(state.operationalHistory.some((item) => item.recordId === advance.id && item.actorId === 'actor-advance-branch-manager')).toBe(true);
  });

  it('lets the accounting reviewer decide a request at the accounting stage even when its saved assignee is stale', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '60000000', note: '', signatureAccepted: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    await login(storage, session, 'persona-advance-branch-manager');
    state = await service.decideEmployeeAdvance(advance.id, 'approve');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await storage.put('employee_advances', {...advance, assigneeUserId: 'persona-product-owner'});

    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', 'کنترل حسابداری انجام شد');
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('final_review');
    expect(advance.assigneeUserId).toBe('persona-sales-advance-approver');
  });
});
