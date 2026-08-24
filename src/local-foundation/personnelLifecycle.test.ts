import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, LocalUser, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {todayIsoDate, toIsoDate} from './PersianDate';
import {permissionFor} from './erpCatalog';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  private failPutStore?: FoundationStoreName;
  failNextPut(store: FoundationStoreName) {this.failPutStore = store;}
  async transaction<T>(stores: FoundationStoreName[], mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const working: Map<FoundationStoreName, Map<IDBValidKey, unknown>> = mode === 'readwrite'
      ? new Map([...this.stores.entries()].map(([store, values]) => [store, stores.includes(store) ? new Map([...values].map(([id, value]) => [id, structuredClone(value)])) : values]))
      : this.stores;
    const tx: StorageTransaction = {
      get: async <V>(store, id) => working.get(store)?.get(id) as V | undefined,
      getAll: async <V>(store) => [...(working.get(store)?.values() ?? [])] as V[],
      put: async <V>(store, value) => {
        if (this.failPutStore === store) {this.failPutStore = undefined; throw new Error(`injected ${store} failure`);}
        working.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));
      },
      delete: async (store, id) => {working.get(store)!.delete(id);},
      clear: async (store) => {working.get(store)!.clear();},
    };
    const result = await work(tx);
    if (mode === 'readwrite') for (const store of stores) this.stores.set(store, working.get(store)!);
    return result;
  }
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');} async importSnapshot(): Promise<void> {throw new Error('not used');}
}

async function setup() {const storage = new MemoryStorage(); await storage.replaceAll(createSeedData()); return {storage, service: new LocalFoundationService(storage)};}
async function switchActiveUser(storage: MemoryStorage, activeUserId: string) {const session = await storage.get<FoundationSession>('sessions', 'active-session'); await storage.put('sessions', {...session!, activeUserId, actingAdminUserId: undefined, switchedAt: new Date().toISOString(), version: (session?.version ?? 0) + 1});}
async function confirmAssetCustodyBoth(storage: MemoryStorage, service: LocalFoundationService, transferId: string) {
  await switchActiveUser(storage, 'persona-seller');
  const employeeChallenge = await service.issueAssetCustodyOtp(transferId, 'employee');
  await service.confirmAssetCustodyOtp(transferId, 'employee', employeeChallenge.otp);
  await switchActiveUser(storage, 'persona-product-owner');
  const officerChallenge = await service.issueAssetCustodyOtp(transferId, 'officer');
  const state = await service.confirmAssetCustodyOtp(transferId, 'officer', officerChallenge.otp);
  return {state, employeeOtp: employeeChallenge.otp, officerOtp: officerChallenge.otp};
}

describe('personnel employment lifecycle', () => {
  it('requires a distinct HR checker and blocks direct HR execution', async () => {
    const {storage, service} = await setup();
    await switchActiveUser(storage, 'persona-hr-operator');
    let state = await service.submitPersonnelEndRequest('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator:'organization', reason:'بررسی مستقل پایان همکاری'});
    const request = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === 'personnel-arman')!;
    await expect(service.approvePersonnelEndRequest(request.id, request.version, 'تأیید توسط همان ثبت‌کننده'))
      .rejects.toThrow('ثبت‌کننده درخواست');
    await expect(service.schedulePersonnelEnd('personnel-laleh', {effectiveDate: todayIsoDate(), departureInitiator:'organization', reason:'دورزدن درخواست'}))
      .rejects.toThrow('مسیر اضطراری ادمین');
  });

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
    const {storage, service} = await setup();
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
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'لپ‌تاپ آزمایشی', description: 'دارایی تست چرخه تحویل', payload: {serialNumber: 'QA-001'}});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'لپ‌تاپ آزمایشی')!;
    const challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    const transferBefore = challenge.state.operationalRecords.find((record) => record.id === challenge.transferId)!;
    expect(transferBefore.status).toBe('submitted');
    expect(JSON.stringify(transferBefore)).not.toContain(challenge.otp);

    const confirmation = await confirmAssetCustodyBoth(storage, service, challenge.transferId);
    state = confirmation.state;
    expect(state.operationalRecords.find((record) => record.id === challenge.transferId)?.status).toBe('completed');
    const deliveredAsset = state.operationalRecords.find((record) => record.id === asset.id)!;
    expect(deliveredAsset.payload.custodianPersonnelId).toBe('personnel-arman');
    expect(JSON.stringify(state.audits)).not.toContain(confirmation.employeeOtp);
    expect(JSON.stringify(state.audits)).not.toContain(confirmation.officerOtp);
  });

  it('keeps each party OTP expiry independent when the other party requests a new code', async () => {
    const {storage, service} = await setup();
    const state = await service.createOperationalRecord('fixed-asset', {title: 'دارایی آزمون انقضای مستقل'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'دارایی آزمون انقضای مستقل')!;
    const transfer = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await service.issueAssetCustodyOtp(transfer.transferId, 'officer');
    const beforeEmployeeIssue = await storage.get<{payload: Record<string, unknown>}>('asset_transfers', transfer.transferId);
    const officerExpiry = beforeEmployeeIssue!.payload.officerOtpExpiresAt;
    await switchActiveUser(storage, 'persona-seller');
    await service.issueAssetCustodyOtp(transfer.transferId, 'employee');
    const afterEmployeeIssue = await storage.get<{payload: Record<string, unknown>}>('asset_transfers', transfer.transferId);
    expect(afterEmployeeIssue!.payload.officerOtpExpiresAt).toBe(officerExpiry);
    expect(afterEmployeeIssue!.payload.employeeOtpExpiresAt).toBeTruthy();
  });

  it('rolls back transfer, asset and audit writes together when final custody persistence fails', async () => {
    const {storage, service} = await setup();
    const state = await service.createOperationalRecord('fixed-asset', {title: 'دارایی آزمون بازگشت تراکنش'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'دارایی آزمون بازگشت تراکنش')!;
    const transfer = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await switchActiveUser(storage, 'persona-seller');
    const employee = await service.issueAssetCustodyOtp(transfer.transferId, 'employee');
    await service.confirmAssetCustodyOtp(transfer.transferId, 'employee', employee.otp);
    await switchActiveUser(storage, 'persona-product-owner');
    const officer = await service.issueAssetCustodyOtp(transfer.transferId, 'officer');
    const auditsBefore = (await storage.getAll('audit_events')).length;
    storage.failNextPut('fixed_assets');
    await expect(service.confirmAssetCustodyOtp(transfer.transferId, 'officer', officer.otp)).rejects.toThrow('injected fixed_assets failure');
    const transferAfterFailure = await storage.get<{status: string}>('asset_transfers', transfer.transferId);
    const assetAfterFailure = await storage.get<{payload: Record<string, unknown>}>('fixed_assets', asset.id);
    expect(transferAfterFailure?.status).toBe('approved');
    expect(assetAfterFailure?.payload.custodianPersonnelId).toBeFalsy();
    expect((await storage.getAll('audit_events')).length).toBe(auditsBefore);
    const recovered = await service.confirmAssetCustodyOtp(transfer.transferId, 'officer', officer.otp);
    expect(recovered.operationalRecords.find((record) => record.id === transfer.transferId)?.status).toBe('completed');
  });

  it('prevents one actor from confirming both sides even when the employee also has the asset-manager role', async () => {
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'دارایی آزمون تفکیک تأیید'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'دارایی آزمون تفکیک تأیید')!;
    const seller = await storage.get<LocalUser>('users', 'persona-seller');
    await storage.put('users', {
      ...seller!,
      roleIds: [...seller!.roleIds, 'role-asset-manager'],
      permissions: [...new Set([...seller!.permissions, permissionFor('asset-transfer', 'create'), permissionFor('asset-transfer', 'approve')])],
    });
    await switchActiveUser(storage, 'persona-seller');
    const employeeChallenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    expect(employeeChallenge.party).toBe('employee');

    await switchActiveUser(storage, 'persona-product-owner');
    await expect(service.issueAssetCustodyOtp(employeeChallenge.transferId, 'employee')).rejects.toThrow('همان پرسنل');
    await expect(service.confirmAssetCustodyOtp(employeeChallenge.transferId, 'employee', employeeChallenge.otp)).rejects.toThrow('همان پرسنل');
    await switchActiveUser(storage, 'persona-seller');
    await service.confirmAssetCustodyOtp(employeeChallenge.transferId, 'employee', employeeChallenge.otp);

    await expect(service.issueAssetCustodyOtp(employeeChallenge.transferId, 'officer')).rejects.toThrow('مستقل');
    await expect(service.confirmAssetCustodyOtp(employeeChallenge.transferId, 'officer', '000000')).rejects.toThrow('مستقل');
    state = await service.loadState();
    const transfer = state.operationalRecords.find((record) => record.id === employeeChallenge.transferId)!;
    expect(transfer.payload.employeeConfirmedByUserId).toBe('persona-seller');
    expect(transfer.payload.officerConfirmed).toBe(false);
    expect(transfer.status).toBe('approved');
  });

  it('keeps a returned asset in inventory after two-sided confirmation', async () => {
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'تلفن سازمانی آزمایشی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'تلفن سازمانی آزمایشی')!;
    let challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await confirmAssetCustodyBoth(storage, service, challenge.transferId);
    await switchActiveUser(storage, 'persona-product-owner');
    challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'return'});
    state = (await confirmAssetCustodyBoth(storage, service, challenge.transferId)).state;
    const returnedAsset = state.operationalRecords.find((record) => record.id === asset.id)!;
    expect(returnedAsset.payload.custodianPersonnelId).toBeNull();
    expect(returnedAsset.payload.custodyStatus).toBe('returned');
  });

  it('opens offboarding asset clearance and clears it only after confirmed return', async () => {
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'مانیتور خروج آزمایشی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'مانیتور خروج آزمایشی')!;
    let challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await confirmAssetCustodyBoth(storage, service, challenge.transferId);
    await switchActiveUser(storage, 'persona-product-owner');
    state = await service.schedulePersonnelEnd('personnel-arman', {effectiveDate: todayIsoDate(), departureInitiator: 'organization', reason: 'خروج همراه با دارایی'});
    let offboarding = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === 'personnel-arman')!;
    expect(offboarding.payload.assetClearanceStatus).toBe('pending');
    expect(offboarding.payload.pendingAssetIds).toContain(asset.id);
    challenge = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'return'});
    state = (await confirmAssetCustodyBoth(storage, service, challenge.transferId)).state;
    offboarding = state.operationalRecords.find((item) => item.id === offboarding.id)!;
    expect(offboarding.payload.assetClearanceStatus).toBe('clear');
    expect(offboarding.payload.pendingAssetIds).toEqual([]);
  });

  it('allows a user to request return only for an asset currently assigned to their own dossier', async () => {
    const {storage, service} = await setup();
    let state = await service.createOperationalRecord('fixed-asset', {title: 'تبلت خودخدمتی'});
    const asset = state.operationalRecords.find((record) => record.moduleId === 'fixed-asset' && record.title === 'تبلت خودخدمتی')!;
    let delivery = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId: 'personnel-arman', action: 'delivery'});
    await confirmAssetCustodyBoth(storage, service, delivery.transferId);
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
    await confirmAssetCustodyBoth(storage, service, delivery.transferId);
    await switchActiveUser(storage, 'persona-seller');

    state = await service.reportOwnAssetIssue({assetRecordId: asset.id, issueType: 'damage', description: 'صفحه‌نمایش دستگاه روشن نمی‌شود.'});
    const report = state.operationalRecords.find((record) => record.moduleId === 'asset-maintenance' && record.relatedRecordId === asset.id);
    expect(report?.ownerPersonnelId).toBe('personnel-arman');
    expect(report?.status).toBe('submitted');
    expect(report?.payload.selfService).toBe(true);
  });
});
