import {describe, expect, it} from 'vitest';
import type {AuditEvent, FoundationSession, FoundationStoreName, LocalUser, OperationalRecord, OrganizationalUnit, PersonnelRecord, SnapshotManifest, WorkflowDefinition} from './model';
import {FOUNDATION_SEED_VERSION, FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService, type PersonnelInput} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {isEmployeeAdvanceVisible, personnelAdvanceEligibility, readEmployeeAdvancePayload} from './employeeAdvance';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  private failingStore?: FoundationStoreName;
  private beforeNextReadwrite?: () => void;
  failNextPut(store: FoundationStoreName) {this.failingStore = store;}
  revokeRoleBeforeNextReadwrite(userId: string, roleId: string) {
    this.beforeNextReadwrite = () => {
      const user = this.stores.get('users')?.get(userId) as LocalUser;
      this.stores.get('users')!.set(userId, {...user, roleIds:user.roleIds.filter((id)=>id!==roleId), roleId:user.roleId===roleId?'role-employee-advance-requester':user.roleId});
    };
  }
  async transaction<T>(stores: FoundationStoreName[], mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    if (mode === 'readwrite' && this.beforeNextReadwrite) {const mutate=this.beforeNextReadwrite;this.beforeNextReadwrite=undefined;mutate();}
    const snapshot = mode === 'readwrite' ? new Map(stores.map((store) => [store, new Map([...(this.stores.get(store) ?? new Map())].map(([id, value]) => [id, structuredClone(value)]))])) : undefined;
    const tx: StorageTransaction = {get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],put: async <V>(store: FoundationStoreName, value: V) => {if (this.failingStore === store) {this.failingStore = undefined; throw new Error(`injected ${store} failure`);} this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},delete: async (store, id) => {this.stores.get(store)!.delete(id);},clear: async (store) => {this.stores.get(store)!.clear();}};
    try {return await work(tx);} catch (error) {if (snapshot) for (const [store, values] of snapshot) this.stores.set(store, values); throw error;}
  }
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');} async importSnapshot(): Promise<void> {throw new Error('not used');}
}

async function setup() {const storage = new MemoryStorage(); await storage.replaceAll(createSeedData()); const session = await storage.get<FoundationSession>('sessions', 'active-session'); return {storage, session: session!, service: new LocalFoundationService(storage)};}
const login = (storage: MemoryStorage, session: FoundationSession, activeUserId: string) => storage.put('sessions', {...session, activeUserId, actingAdminUserId: undefined});
const editablePersonnel = (person: PersonnelRecord): PersonnelInput => {const {id:_id,companyId:_companyId,linkedUserId:_linkedUserId,movements:_movements,salesCompensationHistory:_salesCompensationHistory,lifecycleHistory:_lifecycleHistory,pendingLifecycleChange:_pendingLifecycleChange,createdAt:_createdAt,updatedAt:_updatedAt,...input}=person;return input;};

describe('employee advance workflow', () => {
  it('limits the v1.34 repair to untouched seed rows and preserves explicit local organization and access changes idempotently', async () => {
    const storage = new MemoryStorage();
    const legacy = createSeedData();
    const changedAt = '2026-08-26T09:30:00.000Z';
    legacy.meta = legacy.meta.map((record) => record.id === 'seedVersion' ? {...record, value:'complete-local-erp-v1.33-advance-core'} : record);
    legacy.organizational_units = legacy.organizational_units.map((unit) => unit.id === 'unit-human-resources'
      ? {...unit,managerUserId:'persona-personnel-reviewer',updatedAt:changedAt}
      : unit);
    legacy.personnel = legacy.personnel.map((person) => person.id === 'personnel-personnel-reviewer'
      ? {...person,unitId:'unit-administration',positionId:'position-supervisor',managerPersonnelId:'personnel-purchase-approver',updatedAt:changedAt}
      : person);
    legacy.users = legacy.users.map((user) => user.id === 'persona-support-agent'
      ? {...user,status:'inactive' as const,managerUserId:'persona-hr-manager',roleIds:user.roleIds.filter((roleId)=>roleId!=='role-employee-advance-requester')}
      : user);
    const supportBefore = structuredClone(legacy.users.find((user)=>user.id==='persona-support-agent')!);
    const unitBefore = structuredClone(legacy.organizational_units.find((unit)=>unit.id==='unit-human-resources')!);
    const personnelBefore = structuredClone(legacy.personnel.find((person)=>person.id==='personnel-personnel-reviewer')!);
    legacy.audit_events = [...legacy.audit_events, {
      id:'audit-local-support-access',sequence:999,companyId:supportBefore.companyId,category:'authorization',action:'organization.user.updated',actorId:'actor-product-owner',actorName:'مدیر سامانه',effectiveUserId:supportBefore.id,occurredAt:changedAt,summary:'تغییر صریح نقش و وضعیت محلی',outcome:'success',correlationId:'correlation-local-support-access',metadata:{userId:supportBefore.id,removedRoleIds:'role-employee-advance-requester'},
    } satisfies AuditEvent];
    await storage.replaceAll(legacy);
    const service = new LocalFoundationService(storage);
    await service.initialize();
    expect(await storage.get<LocalUser>('users',supportBefore.id)).toEqual(supportBefore);
    expect(await storage.get<OrganizationalUnit>('organizational_units',unitBefore.id)).toEqual(unitBefore);
    expect(await storage.get<PersonnelRecord>('personnel',personnelBefore.id)).toEqual(personnelBefore);
    await service.initialize();
    expect(await storage.get<LocalUser>('users',supportBefore.id)).toEqual(supportBefore);
    expect(await storage.get<OrganizationalUnit>('organizational_units',unitBefore.id)).toEqual(unitBefore);
    expect(await storage.get<PersonnelRecord>('personnel',personnelBefore.id)).toEqual(personnelBefore);
  });

  it('adds the requester role to an existing v1.32 database without resetting local data', async () => {
    const storage = new MemoryStorage();
    const legacy = createSeedData();
    legacy.security_roles = legacy.security_roles.filter((role) => role.id !== 'role-employee-advance-requester');
    legacy.users = legacy.users.map((user) => user.id === 'persona-laleh' ? {...user, name: 'نام کاربر حفظ‌شده'} : user);
    legacy.meta = legacy.meta.map((record) => record.id === 'seedVersion'
      ? {...record, value: 'complete-local-erp-v1.32-formal-letters'}
      : record);
    expect(legacy.security_roles).toHaveLength(89);
    await storage.replaceAll(legacy);

    const service = new LocalFoundationService(storage);
    const migrated = await service.initialize();
    expect(migrated.roles.filter((role) => role.id === 'role-employee-advance-requester')).toHaveLength(1);
    expect(migrated.roles.find((role) => role.id === 'role-employee-advance-requester')?.name).toBe('درخواست‌کننده مساعده');
    expect(migrated.users.find((user) => user.id === 'persona-laleh')?.name).toBe('نام کاربر حفظ‌شده');
    expect(migrated.users.find((user) => user.id === 'persona-personnel-reviewer')?.roleIds).toContain('role-employee-advance-requester');
    expect(migrated.users.find((user) => user.id === 'persona-support-agent')?.status).toBe('active');
    expect(migrated.personnel.find((person) => person.id === 'personnel-personnel-reviewer')?.branchUnitId).toBeUndefined();
    expect(migrated.units.find((unit) => unit.id === 'unit-human-resources')?.managerUserId).toBe('persona-hr-manager');
    expect(migrated.units.find((unit) => unit.id === 'unit-branch-poonak')?.managerUserId).toBe('persona-sales-senior-poonak');
    expect(migrated.workflows.find((workflow) => workflow.moduleId === 'employee-advance')?.transitions.some((transition) => transition.id === 'employee-advance.accounting_review.direct')).toBe(true);
    expect((await storage.get<{id:string;value:string}>('meta', 'seedVersion'))?.value).toBe(FOUNDATION_SEED_VERSION);

    const rerun = await service.initialize();
    expect(rerun.roles.filter((role) => role.id === 'role-employee-advance-requester')).toHaveLength(1);
    expect(rerun.users.find((user) => user.id === 'persona-laleh')?.name).toBe('نام کاربر حفظ‌شده');
    expect(rerun.users.find((user) => user.id === 'persona-personnel-reviewer')?.roleIds.filter((roleId) => roleId === 'role-employee-advance-requester')).toHaveLength(1);
  });

  it('keeps eligibility independent from access and lets HR suspend it with an effective window', () => {
    const base = {advanceEligibilityStatus:'eligible' as const};
    expect(personnelAdvanceEligibility(base, '2026-08-27').allowed).toBe(true);
    expect(personnelAdvanceEligibility({advanceEligibilityStatus:'suspended',advanceEligibilityReason:'تعلیق موقت',advanceEligibilityEffectiveFrom:'2026-08-20',advanceEligibilityEffectiveUntil:'2026-08-30'}, '2026-08-27').allowed).toBe(false);
    expect(personnelAdvanceEligibility({advanceEligibilityStatus:'suspended',advanceEligibilityReason:'تعلیق موقت',advanceEligibilityEffectiveFrom:'2026-08-20',advanceEligibilityEffectiveUntil:'2026-08-30'}, '2026-08-31').allowed).toBe(true);
    expect(personnelAdvanceEligibility({advanceEligibilityStatus:'ineligible',advanceEligibilityReason:'عدم استحقاق'}, '2026-08-27').allowed).toBe(false);
  });

  it('supports an individually assignable requester role while personnel ineligibility always wins', async () => {
    const {storage, session, service} = await setup();
    const seller = await storage.get<LocalUser>('users', 'persona-seller');
    expect(seller).toBeTruthy();
    await storage.put('users', {...seller!,roleId:'role-workflow-admin',roleIds:['role-workflow-admin'],permissionGrants:[],permissionDenials:[]});
    await login(storage, session, 'persona-seller');
    await expect(service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'بدون نقش مستقل',signatureAccepted:true})).rejects.toThrow('مجوز ثبت درخواست مساعده');

    await storage.put('users', {...seller!,roleId:'role-employee-advance-requester',roleIds:['role-employee-advance-requester'],permissionGrants:[],permissionDenials:[]});
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'با نقش مستقل',signatureAccepted:true});
    expect(state.operationalRecords.some((item)=>item.moduleId==='employee-advance'&&item.ownerPersonnelId==='personnel-arman')).toBe(true);

    const person = await storage.get<PersonnelRecord>('personnel', 'personnel-arman');
    await storage.put('personnel', {...person!,advanceEligibilityStatus:'ineligible',advanceEligibilityReason:'مصوبه منابع انسانی'});
    const existing = (await storage.getAll<OperationalRecord>('employee_advances')).find((item)=>item.ownerPersonnelId==='personnel-arman');
    if (existing) await storage.delete('employee_advances', existing.id);
    await expect(service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'با وجود منع',signatureAccepted:true})).rejects.toThrow('مصوبه منابع انسانی');
    state = await service.loadState();
    expect(state.operationalRecords.filter((item)=>item.moduleId==='employee-advance'&&item.ownerPersonnelId==='personnel-arman')).toHaveLength(0);
  });

  it('persists HR eligibility changes through the personnel service with an auditable reason', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-product-owner');
    const before = await service.loadState();
    const person = before.personnel.find((item)=>item.id==='personnel-arman')!;
    const state = await service.updatePersonnel(person.id, person.updatedAt, {...editablePersonnel(person),advanceEligibilityStatus:'suspended',advanceEligibilityReason:'تعلیق تا پایان بررسی',advanceEligibilityEffectiveFrom:'2026-08-27',advanceEligibilityEffectiveUntil:'2026-09-10'});
    const updated = state.personnel.find((item)=>item.id===person.id)!;
    expect(updated.advanceEligibilityStatus).toBe('suspended');
    expect(updated.advanceEligibilityReason).toBe('تعلیق تا پایان بررسی');
    expect(state.audits.some((item)=>item.metadata?.personnelId===person.id&&item.summary.includes('استحقاق مساعده'))).toBe(true);
  });

  it('fails closed for every generic employee-advance mutation path', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-product-owner');
    const before = await service.loadState();
    const record = before.operationalRecords.find((item) => item.moduleId === 'employee-advance')!;
    await expect(service.createOperationalRecord('employee-advance', {title: 'دورزدن مسیر'})).rejects.toThrow('مسیر اختصاصی');
    await expect(service.updateOperationalRecord('employee-advance', record.id, record.version, {title: 'دورزدن مسیر'})).rejects.toThrow('مسیر اختصاصی');
    await expect(service.transitionOperationalRecord('employee-advance', record.id, 'submit')).rejects.toThrow('مسیر اختصاصی');
    await expect(service.assignOperationalRecord('employee-advance', record.id, 'persona-system-admin', 'ارجاع آزمایشی')).rejects.toThrow('مسیر اختصاصی');
    const after = await service.loadState();
    expect(after.operationalRecords.find((item) => item.id === record.id)).toEqual(record);
    expect(after.operationalHistory).toEqual(before.operationalHistory);
  });

  it('routes a normal signed request through branch, accounting, main approver and treasury', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '60000000', note: 'درخواست مساعده ماه جاری', signatureAccepted: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    expect(advance.status).toBe('branch_review'); expect(advance.assigneeUserId).toBe('persona-advance-branch-manager');

    await login(storage, session, 'persona-advance-branch-manager'); state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('accounting_review'); expect(advance.assigneeUserId).toBe('persona-advance-accounting');
    await login(storage, session, 'persona-advance-accounting'); state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('final_review'); expect(advance.assigneeUserId).toBe('persona-sales-advance-approver');
    await login(storage, session, 'persona-sales-advance-approver'); state = await service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', '', '75000000', advance.version); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('sent_to_treasury'); expect(advance.amountRial).toBe('75000000');
    const payment = state.operationalRecords.find((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === advance.id)!;
    expect(payment.assigneeUserId).toBe('persona-treasury-executor');
    expect(payment.payload.beneficiaryCardNumber).toBeUndefined();
    const storedPayment = await storage.get<OperationalRecord>('treasury_executions', payment.id);
    expect(storedPayment?.payload.beneficiaryCardNumber).toBe(readEmployeeAdvancePayload(advance).cardNumber);

    await login(storage, session, 'persona-treasury-executor'); state = await service.recordTreasuryPayment(payment.id, {paidAt: '2026-08-20', paymentReference: '', note: ''}, payment.version);
    expect(state.operationalRecords.find((item) => item.id === advance.id)?.status).toBe('paid');
  });

  it('routes a headquarters employee directly to accounting and then through final approval and treasury', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-personnel-reviewer');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-personnel-reviewer',amountRial:'5000000',note:'مساعده پرسنل ستادی',signatureAccepted:true});
    let advance = state.operationalRecords.find((item)=>item.moduleId==='employee-advance'&&item.ownerPersonnelId==='personnel-personnel-reviewer')!;
    expect(advance.status).toBe('accounting_review');
    expect(advance.assigneeUserId).toBe('persona-advance-accounting');
    expect(readEmployeeAdvancePayload(advance).branchReviewSkipped).toBe(true);
    expect(readEmployeeAdvancePayload(advance).branchReviewSkippedReason).toContain('ستادی');

    state = await service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId:'personnel-personnel-reviewer',amountRial:'6000000',note:'اصلاح قبل از نخستین تصمیم',signatureAccepted:true});
    advance = state.operationalRecords.find((item)=>item.id===advance.id)!;
    expect(advance.status).toBe('accounting_review');
    expect(advance.assigneeUserId).toBe('persona-advance-accounting');

    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version);
    advance = state.operationalRecords.find((item)=>item.id===advance.id)!;
    expect(advance.status).toBe('final_review');
    expect(advance.assigneeUserId).toBe('persona-sales-advance-approver');
    await login(storage, session, 'persona-sales-advance-approver');
    state = await service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', '', undefined, advance.version);
    advance = state.operationalRecords.find((item)=>item.id===advance.id)!;
    expect(advance.status).toBe('sent_to_treasury');
    expect(state.operationalRecords.find((item)=>item.moduleId==='treasury-execution'&&item.relatedRecordId===advance.id)?.assigneeUserId).toBe('persona-treasury-executor');
  });

  it('uses the configured local manager for the Poonak branch', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-callcenter-poonak');
    const state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-callcenter-poonak',amountRial:'12000000',note:'مساعده شعبه پونک',signatureAccepted:true});
    const advance = state.operationalRecords.find((item)=>item.moduleId==='employee-advance'&&item.ownerPersonnelId==='personnel-callcenter-poonak')!;
    expect(advance.status).toBe('branch_review');
    expect(advance.assigneeUserId).toBe('persona-sales-senior-poonak');
    expect(readEmployeeAdvancePayload(advance).branchReviewSkipped).toBe(false);
  });

  it('rolls back the final decision with its treasury handoff and rejects a stale retry', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'atomic advance',signatureAccepted:true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    await login(storage, session, 'persona-advance-branch-manager');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-sales-advance-approver');
    const before = await service.loadState();
    storage.failNextPut('treasury_executions');
    await expect(service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', 'atomic handoff', undefined, advance.version)).rejects.toThrow('injected treasury_executions failure');
    const rolledBack = await service.loadState();
    expect(rolledBack.operationalRecords.find((item) => item.id === advance.id)?.status).toBe('final_review');
    expect(rolledBack.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === advance.id)).toHaveLength(0);
    expect(rolledBack.operationalHistory).toEqual(before.operationalHistory);
    expect(rolledBack.audits).toEqual(before.audits);
    state = await service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', 'atomic handoff', undefined, advance.version);
    const completed = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(completed.status).toBe('sent_to_treasury');
    expect(state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === advance.id)).toHaveLength(1);
    await expect(service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', 'stale retry', undefined, advance.version)).rejects.toThrow('هم‌زمان تغییر کرده');
  });

  it('fails closed when the current reviewer role is revoked after the page check but before the write transaction', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'race revocation',signatureAccepted:true});
    const advance = state.operationalRecords.find((item)=>item.moduleId==='employee-advance'&&item.createdByUserId==='persona-seller')!;
    const before = await storage.get<OperationalRecord>('employee_advances', advance.id);
    const beforeHistory = await storage.getAll('workflow_history');
    await login(storage, session, 'persona-advance-branch-manager');
    storage.revokeRoleBeforeNextReadwrite('persona-advance-branch-manager','role-advance-branch-manager');
    await expect(service.decideEmployeeAdvance(advance.id,'approve','تأیید هم‌زمان نامعتبر',undefined,advance.version)).rejects.toThrow('دسترسی، نقش یا محدوده');
    expect(await storage.get<OperationalRecord>('employee_advances',advance.id)).toEqual(before);
    expect(await storage.getAll('workflow_history')).toEqual(beforeHistory);
  });

  it('skips branch manager for a proxy request approved at creation and permits own approval', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-sales-advance-approver');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-sales-advance-approver', amountRial: '90000000', note: '', signatureAccepted: true, approveAtCreation: true});
    let advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-sales-advance-approver')!;
    expect(advance.status).toBe('accounting_review'); expect(readEmployeeAdvancePayload(advance).selfApprovedAt).toBeTruthy();
    await login(storage, session, 'persona-advance-accounting'); state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version); advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('sent_to_treasury');
    expect(state.operationalHistory.filter((item) => item.recordId === advance.id).some((item) => item.toState === 'branch_review')).toBe(false);
  });

  it('enforces a published self-approval prohibition at creation', async () => {
    const {storage, session, service} = await setup();
    const workflow = (await storage.getAll<WorkflowDefinition>('workflow_definitions')).find((item) => item.moduleId === 'employee-advance')!;
    await storage.put('workflow_definitions', {
      ...workflow,
      approvalStages: workflow.approvalStages?.map((stage) => stage.stateId === 'final_review' ? {...stage, allowSelfApproval:false} : stage),
    });
    await login(storage, session, 'persona-sales-advance-approver');
    await expect(service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-sales-advance-approver',amountRial:'90000000',note:'',signatureAccepted:true,approveAtCreation:true}))
      .rejects.toThrow('تأیید درخواست خود');
  });

  it('keeps requests private outside beneficiary, assignee and scoped approval roles', async () => {
    const {storage, session, service} = await setup(); await login(storage, session, 'persona-seller');
    let state = await service.createEmployeeAdvance({beneficiaryPersonnelId: 'personnel-arman', amountRial: '10000000', note: '', signatureAccepted: true});
    const advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    expect(isEmployeeAdvanceVisible(advance, state)).toBe(true);
    await login(storage, session, 'persona-purchase-requester'); state = await service.loadState(); expect(isEmployeeAdvanceVisible(advance, state)).toBe(false);
  });

  it('allows only one open advance for a personnel and allocates a stable tracking number inside the write transaction', async () => {
    const {storage, session, service} = await setup();
    await login(storage, session, 'persona-seller');
    const state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'10000000',note:'first open request',signatureAccepted:true});
    const created = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-seller')!;
    expect(created.trackingCode).toMatch(/^ADV-\d{4}-\d{4}$/);
    await expect(service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'20000000',note:'duplicate open request',signatureAccepted:true})).rejects.toThrow('یک درخواست مساعده باز');
    const after = await service.loadState();
    expect(after.operationalRecords.filter((item) => item.moduleId === 'employee-advance' && item.ownerPersonnelId === 'personnel-arman' && !['paid','rejected','cancelled'].includes(item.status))).toHaveLength(1);
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
    state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'needs_correction', 'مبلغ و توضیحات اصلاح شود', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('needs_correction');

    await login(storage, session, 'persona-purchase-requester');
    await expect(service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId: 'personnel-arman', amountRial: '62000000', note: 'غیرمجاز', signatureAccepted: true})).rejects.toThrow('درخواست مساعده پیدا نشد');

    await login(storage, session, 'persona-seller');
    state = await service.updateEmployeeAdvance(advance.id, advance.version, {beneficiaryPersonnelId: 'personnel-arman', amountRial: '62000000', note: 'مدارک و مبلغ اصلاح شد', signatureAccepted: true});
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('accounting_review');
    expect(advance.assigneeUserId).toBe('persona-advance-accounting');

    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await login(storage, session, 'persona-sales-advance-approver');
    state = await service.decideEmployeeAdvance(advance.id, 'approve_to_treasury', '', undefined, advance.version);
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
    state = await service.decideEmployeeAdvance(advance.id, 'approve', 'بررسی و تأیید مدیر شعبه', undefined, advance.version);
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
    state = await service.decideEmployeeAdvance(advance.id, 'approve', '', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    await storage.put('employee_advances', {...advance, assigneeUserId: 'persona-product-owner'});

    await login(storage, session, 'persona-advance-accounting');
    state = await service.decideEmployeeAdvance(advance.id, 'approve', 'کنترل حسابداری انجام شد', undefined, advance.version);
    advance = state.operationalRecords.find((item) => item.id === advance.id)!;
    expect(advance.status).toBe('final_review');
    expect(advance.assigneeUserId).toBe('persona-sales-advance-approver');
  });

  it('blocks employee self-service on a proxy-only branch route but keeps authorized proxy registration available', async () => {
    const {storage, session, service} = await setup();
    const workflow = (await storage.getAll<WorkflowDefinition>('workflow_definitions')).find((item) => item.moduleId === 'employee-advance')!;
    await storage.put('workflow_definitions', {
      ...workflow,
      routeVariants:[{
        id:'central-proxy-only', title:'ثبت نیابتی شعبه سعادت‌آباد', branchUnitIds:['unit-branch-central'], priority:100,
        status:'active' as const, allowSelfSubmission:false, approvalStages:workflow.approvalStages!,
      }],
    });

    await login(storage, session, 'persona-seller');
    await expect(service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'',signatureAccepted:true})).rejects.toThrow('ثبت مستقیم مساعده برای این شعبه غیرفعال است');

    await login(storage, session, 'persona-sales-advance-approver');
    const state = await service.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'ثبت نیابتی مجاز',signatureAccepted:true,approveAtCreation:true});
    const advance = state.operationalRecords.find((item) => item.moduleId === 'employee-advance' && item.createdByUserId === 'persona-sales-advance-approver')!;
    expect(advance.workflowRouteId).toBe('central-proxy-only');
    expect(advance.status).toBe('accounting_review');
  });
});
