import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, LocalUser, OperationalRecord, OperationalRecordHistory, SnapshotManifest, UserNotification} from './model';
import {FOUNDATION_STORES} from './model';
import {purchaseAllocationTotal, purchaseRequestTotal, purchaseRequestValidationErrors, readPurchaseRequestPayload} from './purchaseRequest';
import {ERP_MODULES} from './erpCatalog';
import {createSeedData} from './seed';
import {LocalFoundationService, type OperationalRecordInput} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {canRevealTreasuryBeneficiaryCard, isTreasuryRecordVisibleToUser, treasuryRequesterName} from './TreasuryExecutionUi';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  private failingStore?: FoundationStoreName;
  private beforeNextReadwrite?: () => void;
  failNextPut(store: FoundationStoreName) {this.failingStore = store;}
  revokeRoleBeforeNextReadwrite(userId:string,roleId:string){this.beforeNextReadwrite=()=>{const user=this.stores.get('users')?.get(userId) as LocalUser;this.stores.get('users')!.set(userId,{...user,roleIds:user.roleIds.filter((id)=>id!==roleId),roleId:user.roleId===roleId?'role-purchase-requester':user.roleId});};}
  async transaction<T>(stores: FoundationStoreName[], mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    if(mode==='readwrite'&&this.beforeNextReadwrite){const mutate=this.beforeNextReadwrite;this.beforeNextReadwrite=undefined;mutate();}
    const snapshot = mode === 'readwrite' ? new Map(stores.map((store) => [store, new Map([...(this.stores.get(store) ?? new Map())].map(([id, value]) => [id, structuredClone(value)]))])) : undefined;
    const tx: StorageTransaction = {
      get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,
      getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],
      put: async <V>(store: FoundationStoreName, value: V) => {if (this.failingStore === store) {this.failingStore = undefined; throw new Error(`injected ${store} failure`);} this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},
      delete: async (store: FoundationStoreName, id: IDBValidKey) => {this.stores.get(store)!.delete(id);},
      clear: async (store: FoundationStoreName) => {this.stores.get(store)!.clear();},
    };
    try {return await work(tx);} catch (error) {if (snapshot) for (const [store, values] of snapshot) this.stores.set(store, values); throw error;}
  }
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');}
  async importSnapshot(_snapshot: SnapshotManifest): Promise<void> {throw new Error('not used');}
}

const purchaseVersion = async (storage: MemoryStorage, id = 'demo-purchase-request-1') => (await storage.get<OperationalRecord>('purchase_requests', id))!.version;

describe('multi-branch purchase request', () => {
  it('projects financial and general-ledger records by current permission and strips bank/receipt secrets from view-only access', async () => {
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    const session=(await storage.get<FoundationSession>('sessions','active-session'))!;
    const financialRecord:OperationalRecord={id:'journal-sensitive-test',moduleId:'journal-entry',domain:'accounting',trackingCode:'JRN-SEC-1',title:'سند آزمایشی کنترل دسترسی',description:'metadata',status:'journal_draft',priority:'normal',companyId:'company-tapra-main',unitId:'unit-finance',assigneeUserId:'persona-advance-accounting',createdByActorId:'actor-advance-accounting',createdByUserId:'persona-advance-accounting',updatedByActorId:'actor-advance-accounting',version:1,payload:{safeCategory:'general-ledger',beneficiaryCardNumber:'6219861000002222',bankName:'بانک محرمانه',paymentReference:'PAY-SECRET',receipt:{id:'receipt-secret',fileName:'receipt.pdf',mimeType:'application/pdf',size:20,dataUrl:'data:application/pdf;base64,SECRET'}},createdAt:'2026-08-26T10:00:00.000Z',updatedAt:'2026-08-26T10:00:00.000Z'};
    const purchaseSensitive:OperationalRecord={...financialRecord,id:'purchase-sensitive-test',moduleId:'purchase-request',domain:'procurement',trackingCode:'PR-SEC-1',assigneeUserId:'persona-purchase-approver',createdByActorId:'actor-purchase-requester',createdByUserId:'persona-purchase-requester',amountRial:'95000000'};
    const advanceSensitive:OperationalRecord={...financialRecord,id:'advance-sensitive-test',moduleId:'employee-advance',domain:'hr',trackingCode:'ADV-SEC-1',assigneeUserId:'persona-advance-accounting',createdByActorId:'actor-seller',createdByUserId:'persona-seller',ownerPersonnelId:'personnel-arman',amountRial:'50000000',payload:{...financialRecord.payload,beneficiaryUserId:'persona-seller',beneficiaryPersonnelId:'personnel-arman',branchUnitId:'unit-branch-central',unitId:'unit-sales'}};
    await storage.put('journal_entries',financialRecord);
    await storage.put('purchase_requests',purchaseSensitive);
    await storage.put('employee_advances',advanceSensitive);
    await storage.put('projections',{id:'projection-general-ledger-sensitive',kind:'general-ledger',rebuiltAt:financialRecord.createdAt,version:1,data:{accountNumber:'IR-SECRET',balanceRial:99000000}});
    await storage.put('workflow_history',{id:'history-journal-sensitive',recordId:financialRecord.id,moduleId:financialRecord.moduleId,sequence:1,eventType:'created',actorId:financialRecord.createdByActorId,actorName:'حسابدار',effectiveUserId:financialRecord.createdByUserId,snapshot:{beneficiaryCardNumber:'6219861000002222',receipt:{dataUrl:'data:application/pdf;base64,SECRET'}},occurredAt:financialRecord.createdAt} satisfies OperationalRecordHistory);

    await storage.put('sessions',{...session,activeUserId:'persona-user-manager',actingAdminUserId:undefined});
    let state=await service.loadState();
    expect(state.operationalRecords.some((record)=>[financialRecord.id,purchaseSensitive.id,advanceSensitive.id].includes(record.id))).toBe(false);
    expect(state.projections.find((item)=>item.id==='projection-general-ledger-sensitive')?.data).toEqual({});

    const viewer=(await storage.get<LocalUser>('users','persona-user-manager'))!;
    await storage.put('users',{...viewer,roleIds:[...viewer.roleIds,'role-executive-mis']});
    state=await service.loadState();
    const projected=state.operationalRecords.find((record)=>record.id===financialRecord.id)!;
    expect(projected.payload.safeCategory).toBe('general-ledger');
    expect(projected.amountRial).toBeUndefined();
    expect(JSON.stringify(projected.payload)).not.toMatch(/SECRET|6219861000002222|بانک محرمانه|PAY-SECRET|dataUrl/);
    expect(JSON.stringify(state.operationalHistory.find((item)=>item.recordId===financialRecord.id)?.snapshot)).not.toMatch(/SECRET|6219861000002222|dataUrl/);
    const projectedPurchase=state.operationalRecords.find((record)=>record.id===purchaseSensitive.id)!;
    expect(projectedPurchase.amountRial).toBeUndefined();
    expect(JSON.stringify(projectedPurchase.payload)).not.toMatch(/SECRET|6219861000002222|بانک محرمانه|PAY-SECRET|dataUrl/);
    expect(state.operationalRecords.some((record)=>record.id===advanceSensitive.id)).toBe(false);

    await storage.put('sessions',{...session,activeUserId:'persona-advance-accounting',actingAdminUserId:undefined});
    state=await service.loadState();
    const full=state.operationalRecords.find((record)=>record.id===financialRecord.id)!;
    expect(full.payload.beneficiaryCardNumber).toBe('6219861000002222');
    expect(JSON.stringify(full.payload)).toContain('data:application/pdf;base64,SECRET');
    await storage.put('sessions',{...session,activeUserId:'persona-purchase-approver',actingAdminUserId:undefined});
    state=await service.loadState();
    expect(state.operationalRecords.find((record)=>record.id===purchaseSensitive.id)?.amountRial).toBe('95000000');
    expect(JSON.stringify(state.operationalRecords.find((record)=>record.id===purchaseSensitive.id)?.payload)).toContain('data:application/pdf;base64,SECRET');
  });

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
    await expect(service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'تأیید درخواست', await purchaseVersion(storage))).rejects.toThrow();

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    await expect(service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.needs_correction', 'دور زدن مسیر اختصاصی')).rejects.toThrow('مسیر اختصاصی');
    const decisionVersion = await purchaseVersion(storage);
    const beforeDecision = await service.loadState();
    storage.failNextPut('treasury_executions');
    await expect(service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'اقلام و تقسیم مالی شعب بررسی شد؛ پرداخت طبق سهم هر شعبه انجام شود', decisionVersion)).rejects.toThrow('injected treasury_executions failure');
    const rolledBack = await service.loadState();
    expect(rolledBack.operationalRecords.find((item) => item.id === 'demo-purchase-request-1')?.status).toBe('submitted');
    expect(rolledBack.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === 'demo-purchase-request-1')).toHaveLength(0);
    expect(rolledBack.operationalHistory).toEqual(beforeDecision.operationalHistory);
    expect(rolledBack.audits).toEqual(beforeDecision.audits);
    state = await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'اقلام و تقسیم مالی شعب بررسی شد؛ پرداخت طبق سهم هر شعبه انجام شود', decisionVersion);
    expect(state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1')?.status).toBe('sent_to_treasury');
    const payments = state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === 'demo-purchase-request-1');
    expect(payments).toHaveLength(2);
    expect(payments.map((item) => item.amountRial)).toEqual([undefined, undefined]);
    const storedPayments = (await storage.getAll<OperationalRecord>('treasury_executions')).filter((item) => item.relatedRecordId === 'demo-purchase-request-1');
    expect(storedPayments.map((item) => item.amountRial).sort()).toEqual(['100000000', '65000000'].sort());
    expect(new Set(payments.map((item) => item.branchUnitId)).size).toBe(2);
    expect(payments.every((item) => item.assigneeUserId === 'persona-treasury-executor')).toBe(true);
    expect(payments.every((item) => item.payload.initialRequesterUserId === 'persona-purchase-requester')).toBe(true);
    expect(payments.every((item) => treasuryRequesterName(item, state) === 'پریسا جوادی')).toBe(true);
    await expect(service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'نسخه قدیمی', decisionVersion)).rejects.toThrow('هم‌زمان تغییر کرده');

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
    let state = await service.decidePurchaseRequest('demo-purchase-request-1', 'needs_correction', '', 'شماره پیش‌فاکتور و توضیح ردیف دوم اصلاح شود', await purchaseVersion(storage));
    let request = state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1');
    expect(request?.status).toBe('needs_correction');
    expect(request?.assigneeUserId).toBe('persona-purchase-requester');

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    state = await service.loadState();
    expect(state.operationalRecords.find((item) => item.id === 'demo-purchase-request-1')?.assigneeUserId).toBe('persona-purchase-approver');

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    state = await service.decidePurchaseRequest('demo-purchase-request-1', 'rejected', '', 'خرید با سیاست مصوب شرکت سازگار نیست', await purchaseVersion(storage));
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
    let state = await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'پرداخت سهم‌های تأییدشده انجام شود', await purchaseVersion(storage));
    const treasuryRecord = state.operationalRecords.find((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === 'demo-purchase-request-1')!;

    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});
    expect(treasuryRecord.status).toBe('queued');
    expect(ERP_MODULES.find((item) => item.id === 'treasury-execution')?.workflow.transitions.some((item) => item.to === 'claimed')).toBe(false);
    state = await service.recordTreasuryPayment(treasuryRecord.id, {paidAt: '2026-08-20', paymentReference: '', note: 'پرداخت از حساب عملیاتی شرکت'}, treasuryRecord.version);
    const paid = state.operationalRecords.find((item) => item.id === treasuryRecord.id)!;
    expect(paid.status).toBe('payment_recorded');
    expect((paid.payload.payment as {paymentReference: string; receipt?: unknown}).paymentReference).toBe('');
    expect((paid.payload.payment as {financialDocumentNumber: string}).financialDocumentNumber).toMatch(/^PAY-2026-\d{4}$/);
    expect((paid.payload.payment as {fiscalPeriod: string}).fiscalPeriod).toBe('2026-08');
    expect((paid.payload.payment as {paymentReference: string; receipt?: unknown}).receipt).toBeUndefined();
    expect(state.operationalRecords.find((item) => item.id === paid.relatedRecordId)).toBeUndefined();
    const source = await storage.get<OperationalRecord>('purchase_requests', paid.relatedRecordId!);
    expect(readPurchaseRequestPayload(source!.payload).lines).toHaveLength(2);

    state = await service.reviseTreasuryPayment(treasuryRecord.id, {paidAt: '2026-08-21', paymentReference: 'TRX-CORRECTED', note: 'اصلاح شماره پیگیری', receipt: {id: 'receipt-1', fileName: 'receipt.png', mimeType: 'image/png', size: 24, dataUrl: 'data:image/png;base64,iVBORw0KGgo='}}, 'شماره پیگیری قبلی اشتباه بود', paid.version);
    const revised = state.operationalRecords.find((item) => item.id === treasuryRecord.id)!;
    expect(revised.status).toBe('payment_recorded');
    expect((revised.payload.payment as {paymentReference: string}).paymentReference).toBe('TRX-CORRECTED');
    expect((revised.payload.payment as {financialDocumentNumber: string}).financialDocumentNumber).toBe((paid.payload.payment as {financialDocumentNumber: string}).financialDocumentNumber);
    expect((revised.payload.payment as {fiscalPeriod: string}).fiscalPeriod).toBe('2026-08');
    expect(revised.payload.paymentHistory).toHaveLength(1);

    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await expect(service.revertTreasuryPayment(treasuryRecord.id, 'بازگشت غیرمجاز', revised.version)).rejects.toThrow('فقط مجری خزانه تعیین‌شده');
    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});
    state = await service.revertTreasuryPayment(treasuryRecord.id, 'پرداخت برای حساب اشتباه ثبت شده بود', revised.version);
    const reverted = state.operationalRecords.find((item) => item.id === treasuryRecord.id)!;
    expect(reverted.status).toBe('queued');
    expect(reverted.payload.payment).toBeUndefined();
    expect(reverted.payload.paymentHistory).toHaveLength(2);
    expect(state.operationalHistory.filter((item) => item.recordId === treasuryRecord.id).sort((a, b) => a.sequence - b.sequence).at(-1)?.toState).toBe('queued');
  });

  it('does not mutate purchase workflow when the approver role is revoked immediately before the write transaction', async () => {
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    const session=(await storage.get<FoundationSession>('sessions','active-session'))!;
    await storage.put('sessions',{...session,activeUserId:'persona-purchase-requester',actingAdminUserId:undefined});
    await service.transitionOperationalRecord('purchase-request','demo-purchase-request-1','purchase-request.submitted');
    await storage.put('sessions',{...session,activeUserId:'persona-purchase-approver',actingAdminUserId:undefined});
    const before=await storage.get<OperationalRecord>('purchase_requests','demo-purchase-request-1');
    const beforeHistory=await storage.getAll('workflow_history');
    storage.revokeRoleBeforeNextReadwrite('persona-purchase-approver','role-purchase-approver');
    await expect(service.decidePurchaseRequest('demo-purchase-request-1','approve_and_forward','persona-treasury-executor','تأیید نباید پس از لغو نقش ثبت شود',before!.version)).rejects.toThrow('دسترسی یا محدوده');
    expect(await storage.get<OperationalRecord>('purchase_requests','demo-purchase-request-1')).toEqual(before);
    expect(await storage.getAll('workflow_history')).toEqual(beforeHistory);
  });

  it('closes a multi-allocation obligation only after every unique payment and reopens it atomically on reversal', async () => {
    const storage = new MemoryStorage(); await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    const service = new LocalFoundationService(storage);
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    let state = await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'پرداخت سهم‌های مصوب', await purchaseVersion(storage));
    let payments = state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === 'demo-purchase-request-1').sort((a,b)=>a.id.localeCompare(b.id));
    await storage.put('sessions', {...session!, activeUserId: 'persona-treasury-executor', actingAdminUserId: undefined});

    state = await service.recordTreasuryPayment(payments[0].id, {paidAt:'2026-08-26',paymentReference:' ref ۱۲۳ ',note:'سهم اول'}, payments[0].version);
    let source = (await storage.get<OperationalRecord>('purchase_requests', 'demo-purchase-request-1'))!;
    expect(source.status).toBe('sent_to_treasury');
    expect(source.payload.financialPaymentProgress).toMatchObject({obligationCount:2,paidCount:1,complete:false});
    payments = state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === source.id).sort((a,b)=>a.id.localeCompare(b.id));
    const pending = payments.find((item)=>item.status==='queued')!;
    await expect(service.recordTreasuryPayment(pending.id,{paidAt:'2026-08-26',paymentReference:'REF123',note:'تکراری'},pending.version)).rejects.toThrow('قبلاً');
    expect((await service.loadState()).operationalRecords.find((item)=>item.id===pending.id)?.status).toBe('queued');

    storage.failNextPut('purchase_requests');
    await expect(service.recordTreasuryPayment(pending.id,{paidAt:'2026-08-26',paymentReference:'REF124',note:'شکست آزمایشی'},pending.version)).rejects.toThrow('injected');
    state = await service.loadState();
    expect(state.operationalRecords.find((item)=>item.id===pending.id)?.status).toBe('queued');
    expect((await storage.get<OperationalRecord>('purchase_requests', source.id))?.status).toBe('sent_to_treasury');

    state = await service.recordTreasuryPayment(pending.id,{paidAt:'2026-08-26',paymentReference:'REF124',note:'سهم دوم'},pending.version);
    source = (await storage.get<OperationalRecord>('purchase_requests', source.id))!;
    const secondPaid = state.operationalRecords.find((item)=>item.id===pending.id)!;
    expect(source.status).toBe('paid');
    expect(source.payload.financialPaymentProgress).toMatchObject({obligationCount:2,paidCount:2,totalRial:'165000000',paidRial:'165000000',complete:true});
    await expect(service.recordTreasuryPayment(pending.id,{paidAt:'2026-08-26',paymentReference:'REF125',note:'نسخه قدیمی'},pending.version)).rejects.toThrow('هم‌زمان تغییر کرده');

    state = await service.revertTreasuryPayment(secondPaid.id,'رسید سهم دوم نیازمند ثبت مجدد است',secondPaid.version);
    source = (await storage.get<OperationalRecord>('purchase_requests', source.id))!;
    expect(source.status).toBe('sent_to_treasury');
    expect(source.payload.financialPaymentProgress).toMatchObject({obligationCount:2,paidCount:1,complete:false});
  });

  it('allows next-day treasury follow-up once per day and delivers an unread notification to active treasury executors', async () => {
    const storage = new MemoryStorage(); await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    const service = new LocalFoundationService(storage);
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-requester', actingAdminUserId: undefined});
    await service.transitionOperationalRecord('purchase-request', 'demo-purchase-request-1', 'purchase-request.submitted');
    await storage.put('sessions', {...session!, activeUserId: 'persona-purchase-approver', actingAdminUserId: undefined});
    await service.decidePurchaseRequest('demo-purchase-request-1', 'approve_and_forward', 'persona-treasury-executor', 'پرداخت سهم‌های تأییدشده انجام شود', await purchaseVersion(storage));

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
    const storedHistory = await storage.getAll<OperationalRecordHistory>('workflow_history');
    expect(storedHistory.some((item) => item.recordId === 'demo-purchase-request-1' && item.eventType === 'comment' && item.reason?.includes('پیگیری'))).toBe(true);
  });
});
