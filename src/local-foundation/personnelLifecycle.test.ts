import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {todayIsoDate, toIsoDate} from './PersianDate';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  async transaction<T>(stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {const tx: StorageTransaction = {get: async <V>(store, id) => this.stores.get(store)?.get(id) as V | undefined,getAll: async <V>(store) => [...(this.stores.get(store)?.values() ?? [])] as V[],put: async <V>(store, value) => {this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},delete: async (store, id) => {this.stores.get(store)!.delete(id);},clear: async (store) => {this.stores.get(store)!.clear();}}; return work(tx);}
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');} async importSnapshot(): Promise<void> {throw new Error('not used');}
}

async function setup() {const storage = new MemoryStorage(); await storage.replaceAll(createSeedData()); return {storage, service: new LocalFoundationService(storage)};}
async function switchActiveUser(storage: MemoryStorage, activeUserId: string) {const session = await storage.get<FoundationSession>('sessions', 'active-session'); await storage.put('sessions', {...session!, activeUserId, actingAdminUserId: undefined, switchedAt: new Date().toISOString(), version: (session?.version ?? 0) + 1});}

describe('personnel employment lifecycle', () => {
  it('lets a direct supervisor submit a review request without changing employment, login, roles or panel access', async () => {
    const {storage, service} = await setup();
    await switchActiveUser(storage, 'persona-callcenter-a');
    const before = await service.loadState();
    const beforeUser = before.users.find((item) => item.id === 'persona-laleh')!;
    const state = await service.submitPersonnelEndRequest('personnel-laleh', {effectiveDate: todayIsoDate(), departureInitiator: 'employee', reason: 'اعلام عدم تمایل پرسنل به ادامه همکاری'});
    const personnel = state.personnel.find((item) => item.id === 'personnel-laleh')!;
    const user = state.users.find((item) => item.id === 'persona-laleh')!;
    const request = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === personnel.id)!;
    expect(personnel.employmentStatus).toBe('active');
    expect(personnel.endDate).toBeUndefined();
    expect(user.status).toBe('active');
    expect(user.roleIds).toEqual(beforeUser.roleIds);
    expect(request.status).toBe('requested');
    expect(request.payload.requestHasOperationalEffect).toBe(false);
    expect(request.payload.currentWaitingFor).toBe('بررسی منابع انسانی');
  });

  it('does not let personnel submit their own employment-end request', async () => {
    const {storage, service} = await setup();
    await switchActiveUser(storage, 'persona-laleh');
    await expect(service.submitPersonnelEndRequest('personnel-laleh', {effectiveDate: todayIsoDate(), departureInitiator: 'employee', reason: 'ثبت درخواست توسط خود پرسنل'})).rejects.toThrow('خودش');
  });

  it('allows the requester to withdraw before HR execution and preserves an audit record', async () => {
    const {storage, service} = await setup();
    await switchActiveUser(storage, 'persona-callcenter-a');
    let state = await service.submitPersonnelEndRequest('personnel-laleh', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'درخواست بررسی ادامه همکاری'});
    const request = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === 'personnel-laleh')!;
    state = await service.cancelPersonnelEndRequest('personnel-laleh', 'موضوع مدیریتی برطرف شد', request.version);
    expect(state.personnel.find((item) => item.id === 'personnel-laleh')?.employmentStatus).toBe('active');
    expect(state.users.find((item) => item.id === 'persona-laleh')?.status).toBe('active');
    expect(state.operationalRecords.find((item) => item.id === request.id)?.status).toBe('cancelled');
    expect(state.operationalHistory.some((item) => item.recordId === request.id && item.reason === 'موضوع مدیریتی برطرف شد')).toBe(true);
  });

  it('changes the user panel only after HR approves an immediate execution', async () => {
    const {storage, service} = await setup();
    await switchActiveUser(storage, 'persona-callcenter-a');
    let state = await service.submitPersonnelEndRequest('personnel-laleh', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'تصمیم مستند سازمان برای قطع همکاری'});
    const request = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === 'personnel-laleh')!;
    await switchActiveUser(storage, 'persona-hr-manager');
    state = await service.approvePersonnelEndRequest(request.id, request.version, 'بررسی منابع انسانی تکمیل و تاریخ اجرا تأیید شد');
    expect(state.personnel.find((item) => item.id === 'personnel-laleh')?.employmentStatus).toBe('ended');
    expect(state.users.find((item) => item.id === 'persona-laleh')?.status).toBe('inactive');
    expect(state.operationalRecords.find((item) => item.id === request.id)?.status).toBe('offboarding');
  });

  it('ends employment and disables login without deleting either record', async () => {
    const {service} = await setup();
    const state = await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'پایان همکاری آزمایشی', handoffNotes: 'تحویل کامل کارها'});
    const personnel = state.personnel.find((item) => item.id === 'personnel-arman')!;
    const user = state.users.find((item) => item.id === 'persona-seller')!;
    expect(personnel.employmentStatus).toBe('ended');
    expect(personnel.lifecycleHistory?.at(-1)?.kind).toBe('employment_ended');
    expect(user.status).toBe('inactive');
    expect(state.personnel.some((item) => item.id === personnel.id)).toBe(true);
    const offboarding = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === personnel.id);
    expect(offboarding?.payload.accountClosureStatus).toBe('disabled');
    expect(offboarding?.payload.assetClearanceStatus).toBe('clear');
  });

  it('keeps a future termination scheduled and the login active until its effective date', async () => {
    const {service} = await setup(); const future = new Date(); future.setDate(future.getDate() + 2);
    const state = await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: toIsoDate(future), departureInitiator: 'organization', reason: 'پایان قرارداد در آینده'});
    expect(state.personnel.find((item) => item.id === 'personnel-arman')?.employmentStatus).toBe('ending_scheduled');
    expect(state.users.find((item) => item.id === 'persona-seller')?.status).toBe('active');
  });

  it('rehire uses the same dossier and explicitly replaces old access roles', async () => {
    const {service} = await setup();
    await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'پایان دوره قبلی'});
    const state = await service.rehirePersonnel('personnel-arman', {effectiveDate: todayIsoDate(), reason: 'شروع دوره تازه', employmentType: 'تمام‌وقت', unitId: 'unit-sales', positionId: 'position-sales-manager', branchUnitId: 'unit-branch-central', roleIds: ['role-sales-seller']});
    const personnel = state.personnel.find((item) => item.id === 'personnel-arman')!;
    const user = state.users.find((item) => item.id === 'persona-seller')!;
    expect(personnel.personnelCode).toBe('P-3001');
    expect(personnel.employmentStatus).toBe('active');
    expect(user.status).toBe('active');
    expect(user.roleIds).toEqual(['role-sales-seller']);
    expect(personnel.lifecycleHistory?.map((event) => event.kind)).toEqual(expect.arrayContaining(['employment_ended', 'rehired']));
  });

  it('blocks manual account activation while employment is ended', async () => {
    const {service} = await setup();
    await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'پایان همکاری'});
    await expect(service.setUserStatus('persona-seller', 'active')).rejects.toThrow('بازگشت به همکاری');
  });

  it('closes an exit dossier only after financial and organizational clearance', async () => {
    const {service} = await setup();
    let state = await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator: 'employee', reason: 'پایان همکاری با تسویه کامل', handoffNotes: 'تحویل کارها ثبت شد'});
    let offboarding = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === 'personnel-arman')!;
    await expect(service.completeOffboarding(offboarding.id, offboarding.version, 'بستن پرونده')).rejects.toThrow('تسویه مالی');

    state = await service.updateOffboardingClearance(offboarding.id, offboarding.version, 'financial', true, 'بدهی مالی کنترل و تسویه شد');
    offboarding = state.operationalRecords.find((item) => item.id === offboarding.id)!;
    await expect(service.completeOffboarding(offboarding.id, offboarding.version, 'بستن پرونده')).rejects.toThrow('تسویه سازمانی');

    state = await service.updateOffboardingClearance(offboarding.id, offboarding.version, 'organizational', true, 'تحویل کار و دسترسی‌های سازمانی کنترل شد');
    offboarding = state.operationalRecords.find((item) => item.id === offboarding.id)!;
    state = await service.completeOffboarding(offboarding.id, offboarding.version, 'همه مراحل تسویه تکمیل شد');
    offboarding = state.operationalRecords.find((item) => item.id === offboarding.id)!;
    expect(offboarding.status).toBe('completed');
    expect(offboarding.payload.currentWaitingFor).toBe('پرونده خروج بسته شده');
  });
});

describe('asset custody with local OTP', () => {
  it('requires both employee and asset officer confirmations and never persists plaintext OTP', async () => {
    const {service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'لپ‌تاپ آزمایشی', description: 'دارایی تست چرخه تحویل', payload: {serialNumber: 'QA-001'}});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'لپ‌تاپ آزمایشی')!;
    const challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    const transferBefore = challenge.state.operationalRecords.find((record) => record.id === challenge.transferId)!;
    expect(transferBefore.status).toBe('submitted');
    expect(JSON.stringify(transferBefore)).not.toContain(challenge.employeeOtp);
    expect(JSON.stringify(transferBefore)).not.toContain(challenge.officerOtp);

    state = await service.confirmAssetCustodyOtp(challenge.transferId, 'employee', challenge.employeeOtp);
    expect(state.operationalRecords.find((record) => record.id === challenge.transferId)?.status).toBe('approved');
    state = await service.confirmAssetCustodyOtp(challenge.transferId, 'officer', challenge.officerOtp);
    expect(state.operationalRecords.find((record) => record.id === challenge.transferId)?.status).toBe('completed');
    const deliveredAsset = state.operationalRecords.find((record) => record.id === asset.id)!;
    expect(deliveredAsset.payload.custodianPersonnelId).toBe('personnel-arman');
    expect(JSON.stringify(state.audits)).not.toContain(challenge.employeeOtp);
    expect(JSON.stringify(state.audits)).not.toContain(challenge.officerOtp);
  });

  it('keeps a returned asset in inventory after two-sided confirmation', async () => {
    const {service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'تلفن سازمانی آزمایشی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'تلفن سازمانی آزمایشی')!;
    let challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await service.confirmAssetCustodyOtp(challenge.transferId, 'employee', challenge.employeeOtp);
    await service.confirmAssetCustodyOtp(challenge.transferId, 'officer', challenge.officerOtp);
    challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'return'});
    await service.confirmAssetCustodyOtp(challenge.transferId, 'employee', challenge.employeeOtp);
    state = await service.confirmAssetCustodyOtp(challenge.transferId, 'officer', challenge.officerOtp);
    const returnedAsset = state.operationalRecords.find((record) => record.id === asset.id)!;
    expect(returnedAsset.payload.custodianPersonnelId).toBeNull();
    expect(returnedAsset.payload.custodyStatus).toBe('returned');
  });

  it('opens offboarding asset clearance and clears it only after confirmed return', async () => {
    const {service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'مانیتور خروج آزمایشی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'مانیتور خروج آزمایشی')!;
    let challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await service.confirmAssetCustodyOtp(challenge.transferId, 'employee', challenge.employeeOtp);
    await service.confirmAssetCustodyOtp(challenge.transferId, 'officer', challenge.officerOtp);
    state = await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'خروج همراه با دارایی'});
    let offboarding = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === 'personnel-arman')!;
    expect(offboarding.payload.assetClearanceStatus).toBe('pending');
    expect(offboarding.payload.pendingAssetIds).toContain(asset.id);
    challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'return'});
    await service.confirmAssetCustodyOtp(challenge.transferId, 'employee', challenge.employeeOtp);
    state = await service.confirmAssetCustodyOtp(challenge.transferId, 'officer', challenge.officerOtp);
    offboarding = state.operationalRecords.find((item) => item.id === offboarding.id)!;
    expect(offboarding.payload.assetClearanceStatus).toBe('clear');
    expect(offboarding.payload.pendingAssetIds).toEqual([]);
  });

  it('allows a user to request return only for an asset currently assigned to their own dossier', async () => {
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'تبلت خودخدمتی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'تبلت خودخدمتی')!;
    let delivery = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await service.confirmAssetCustodyOtp(delivery.transferId, 'employee', delivery.employeeOtp);
    await service.confirmAssetCustodyOtp(delivery.transferId, 'officer', delivery.officerOtp);
    await switchActiveUser(storage, 'persona-seller');

    const ownReturn = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'return', notes: 'عودت از حساب کاربری من'});
    expect(ownReturn.state.operationalRecords.find((record) => record.id === ownReturn.transferId)?.ownerPersonnelId).toBe('personnel-arman');
    await expect(service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-ilia', action: 'return'})).rejects.toThrow('مجوز');
  });

  it('lets a user report a problem only for their own assigned asset', async () => {
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'لپ‌تاپ گزارش خرابی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'لپ‌تاپ گزارش خرابی')!;
    const delivery = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await service.confirmAssetCustodyOtp(delivery.transferId, 'employee', delivery.employeeOtp);
    await service.confirmAssetCustodyOtp(delivery.transferId, 'officer', delivery.officerOtp);
    await switchActiveUser(storage, 'persona-seller');

    state = await service.reportOwnAssetIssue({assetRecordId: asset.id, issueType: 'damage', description: 'صفحه‌نمایش دستگاه روشن نمی‌شود.'});
    const report = state.operationalRecords.find((record) => record.moduleId === 'asset-maintenance' && record.relatedRecordId === asset.id);
    expect(report?.ownerPersonnelId).toBe('personnel-arman');
    expect(report?.status).toBe('submitted');
    expect(report?.payload.selfService).toBe(true);
  });
});
