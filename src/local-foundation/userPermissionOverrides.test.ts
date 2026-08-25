import {describe, expect, it} from 'vitest';
import type {AuditEvent, FoundationSession, FoundationStoreName, LocalUser, RegistrationRequest, SecurityRole, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData, LOCAL_USERS, ORGANIZATIONAL_UNITS, SECURITY_ROLES} from './seed';
import {LocalFoundationService, userConcurrencyToken} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(
    FOUNDATION_STORES.map((store) => [store, new Map()]),
  );
  private writeQueue: Promise<void> = Promise.resolve();
  private failStore?: FoundationStoreName;

  failNextPut(store: FoundationStoreName) {this.failStore = store;}
  protected injectRaw(store: FoundationStoreName, value: {id: IDBValidKey} & Record<string,unknown>) {this.stores.get(store)!.set(value.id,structuredClone(value));}

  async transaction<T>(stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const execute = async () => {
      const snapshot = new Map(stores.map((store) => [store, new Map([...this.stores.get(store)!].map(([key, value]) => [key, structuredClone(value)]))]));
      const api: StorageTransaction = {
        get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,
        getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],
        put: async <V>(store: FoundationStoreName, value: V) => {if (this.failStore === store) {this.failStore = undefined; throw new Error(`injected failure: ${store}`);} this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},
        delete: async (store: FoundationStoreName, id: IDBValidKey) => {this.stores.get(store)!.delete(id);},
        clear: async (store: FoundationStoreName) => {this.stores.get(store)!.clear();},
      };
      try {return await work(api);} catch (error) {for (const [store, values] of snapshot) this.stores.set(store, values); throw error;}
    };
    if (_mode === 'readonly') return execute();
    const result = this.writeQueue.then(execute, execute);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');}
  async importSnapshot(_snapshot: SnapshotManifest): Promise<void> {throw new Error('not used');}
}

class MigrationRaceStorage extends MemoryStorage {
  private armed=true;
  override async transaction<T>(stores:FoundationStoreName[],mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{
    const result=await super.transaction(stores,mode,work);
    if(this.armed&&mode==='readonly'&&stores.length===FOUNDATION_STORES.length){this.armed=false;const person=createSeedData().personnel.find((item)=>item.id==='personnel-arman')!;this.injectRaw('personnel',{...person,firstName:'تغییر هم‌زمان بدون meta',updatedAt:'2026-08-25T12:00:00.000Z'});}
    return result;
  }
}

function userInput(user: LocalUser) {
  return {
    name: user.name,
    username: user.username,
    unitId: user.unitId!,
    positionId: user.positionId!,
    managerUserId: user.managerUserId,
    roleIds: user.roleIds,
  };
}

describe('per-user permission overrides', () => {
  it('prevents a delegated user manager from self-escalation and protected role assignment', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const actor = LOCAL_USERS.find((user) => user.id === 'persona-user-manager')!;
    const target = LOCAL_USERS.find((user) => user.id === 'persona-laleh')!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: actor.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);

    await expect(service.updateUser(actor.id, userConcurrencyToken(actor), {...userInput(actor), roleIds: [...actor.roleIds, 'role-system-admin']})).rejects.toThrow('نقش یا ریزمجوز خودش');
    await expect(service.updateUser(target.id, userConcurrencyToken(target), {...userInput(target), roleIds: ['role-system-admin']})).rejects.toThrow('فقط توسط ادمین اصلی');
    await expect(service.updateUser(target.id, userConcurrencyToken(target), {...userInput(target), permissionGrants: ['foundation.data.export']})).rejects.toThrow('مجوزهای سطح‌بالا');
  });

  it('keeps the undefined auditor policy read-only and without raw backup access', () => {
    const auditor = LOCAL_USERS.find((user) => user.id === 'persona-auditor')!;
    expect(auditor.permissions).not.toContain('foundation.audit.view');
    expect(auditor.permissions).not.toContain('foundation.data.export');
    expect(auditor.permissions).not.toContain('hr.employee_advance.create');
    expect(auditor.permissions).not.toContain('hr.employee_advance.transition');
  });

  it('returns a redacted application state for the provisional auditor role', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: 'persona-auditor', actingAdminUserId: undefined});
    const state = await new LocalFoundationService(storage).loadState();
    const serialized = JSON.stringify(state);
    const anotherUser = LOCAL_USERS.find((user) => user.id === 'persona-product-owner')!;
    expect(state.users.map((user) => user.id)).toEqual(['persona-auditor']);
    expect(serialized).not.toContain(anotherUser.passwordHash);
    expect(serialized).not.toContain('09121112233');
    expect(state.customers).toEqual([]);
    expect(state.operationalRecords).toEqual([]);
    expect(state.audits).toEqual([]);
    const signedIn = await new LocalFoundationService(storage).signIn('admin', 'Tapra2@123');
    expect(signedIn.activeUser.id).toBe('persona-product-owner');
  });

  it('separates HR role proposal from system-admin account activation', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const now = '2026-08-25T08:00:00.000Z';
    await storage.put('registration_requests', {id: 'registration-two-stage', trackingCode: 'REG-TEST', fullName: 'آزاده موسوی', mobile: '09123456789', secondaryMobile: '09123456780', nationalId: '0084573211', gender: 'female', province: 'تهران', city: 'تهران', address: 'نشانی آزمون کامل', bankName: 'ملت', cardNumber: '6104337812345678', requestedUsername: 'azadeh.test', selfDeclaration: {}, status: 'submitted', version: 1, createdAt: now, updatedAt: now});
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: 'persona-registration-reviewer', actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);
    const proposed = await service.reviewRegistration('registration-two-stage', 1, 'approved', 'هویت بررسی شد', ['role-sales-seller']);
    const approved = proposed.registrationRequests.find((item) => item.id === 'registration-two-stage')!;
    expect(approved.status).toBe('approved');
    expect(approved.proposedRoleIds).toEqual(['role-sales-seller']);
    expect(approved.linkedUserId).toBeUndefined();
    expect(proposed.users.some((user) => user.username === 'azadeh.test')).toBe(false);

    await storage.put('sessions', {...session!, activeUserId: 'persona-system-admin', actingAdminUserId: undefined});
    await expect(service.activateRegistration('registration-two-stage', 1, 'StrongPass123')).rejects.toThrow('تب دیگری');
    const activated = await service.activateRegistration('registration-two-stage', approved.version, 'StrongPass123');
    const final = activated.registrationRequests.find((item) => item.id === 'registration-two-stage')!;
    expect(final.status).toBe('activated');
    expect(final.activatedByUserId).toBe('persona-system-admin');
    expect(activated.users.find((user) => user.id === final.linkedUserId)?.roleIds).toEqual(['role-sales-seller']);
  });

  it('never lets one actor both propose and activate the same registration', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const now = '2026-08-25T08:00:00.000Z';
    await storage.put('registration_requests', {id:'registration-maker-checker',trackingCode:'REG-MC',fullName:'مهسا احمدی',mobile:'09123456769',secondaryMobile:'09123456760',nationalId:'0084573297',gender:'female',province:'تهران',city:'تهران',address:'نشانی آزمون کامل',bankName:'ملت',cardNumber:'6104337812345678',requestedUsername:'mahsa.mc',selfDeclaration:{},status:'submitted',version:1,createdAt:now,updatedAt:now});
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!,activeUserId:'persona-product-owner',actingAdminUserId:undefined});
    const service = new LocalFoundationService(storage);
    const reviewed = await service.reviewRegistration('registration-maker-checker',1,'approved','بررسی شد',['role-sales-seller']);
    const approved = reviewed.registrationRequests.find((item)=>item.id==='registration-maker-checker')!;
    await expect(service.activateRegistration('registration-maker-checker',approved.version,'StrongPass123')).rejects.toThrow('پیشنهاددهنده نقش');
  });

  it('blocks unsafe direct grants and protected capabilities hidden inside custom roles', async () => {
    const storage = new MemoryStorage();
    const seed = createSeedData();
    seed.security_roles.push({id:'role-custom-sensitive',name:'نقش سفارشی حساس',description:'',scope:'COMPANY',permissions:['foundation.data.manage'],status:'active',protected:false,version:1,createdAt:'2026-08-25T00:00:00.000Z',updatedAt:'2026-08-25T00:00:00.000Z'});
    await storage.replaceAll(seed);
    const actor = LOCAL_USERS.find((user) => user.id === 'persona-user-manager')!;
    const target = LOCAL_USERS.find((user) => user.id === 'persona-laleh')!;
    const session = await storage.get<FoundationSession>('sessions','active-session');
    await storage.put('sessions',{...session!,activeUserId:actor.id,actingAdminUserId:undefined});
    const service = new LocalFoundationService(storage);
    await expect(service.updateUser(target.id,userConcurrencyToken(target),{...userInput(target),permissionGrants:['organization.personnel.manage']})).rejects.toThrow('فقط برای مشاهده');
    await expect(service.updateUser(target.id,userConcurrencyToken(target),{...userInput(target),roleIds:['role-custom-sensitive']})).rejects.toThrow('فقط توسط ادمین اصلی');
  });

  it('ends a stale local session immediately when its user has become inactive', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const inactiveUser = LOCAL_USERS.find((user) => user.id === 'persona-support-agent')!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: inactiveUser.id, actingAdminUserId: undefined, signedOutAt: undefined});

    const state = await new LocalFoundationService(storage).loadState();

    expect(state.activeUser.id).toBe(inactiveUser.id);
    expect(state.activeUser.status).toBe('inactive');
    expect(state.session.signedOutAt).toBeTruthy();
  });

  it('migrates the legacy sales expert role to the official seller role without losing access', async () => {
    const storage = new MemoryStorage();
    const legacySeed = createSeedData();
    const officialSellerRole = legacySeed.security_roles.find((role) => role.id === 'role-sales-seller')!;
    legacySeed.security_roles.push({...officialSellerRole, id: 'role-seller', name: 'کارشناس فروش'});
    legacySeed.users = legacySeed.users.map((user) => user.id === 'persona-seller'
      ? {...user, roleId: 'role-seller', roleIds: ['role-seller']}
      : user);
    legacySeed.meta = legacySeed.meta.map((record) => record.id === 'seedVersion'
      ? {...record, value: 'complete-local-erp-v1.20-versioned-workflow-editing'}
      : record);
    await storage.replaceAll(legacySeed);

    const state = await new LocalFoundationService(storage).initialize();
    const seller = state.users.find((user) => user.id === 'persona-seller')!;
    expect(state.roles.some((role) => role.id === 'role-seller')).toBe(false);
    expect(seller.roleId).toBe('role-sales-manager');
    expect(seller.roleIds).toContain('role-sales-manager');
    expect(seller.permissions).toContain('foundation.dashboard.view');
    expect(seller.permissions).toContain('sales.sale.create');
  });

  it('does not re-add a removed sales role when an existing persona has a custom assignment', async () => {
    const storage = new MemoryStorage();
    const legacySeed = createSeedData();
    legacySeed.users = legacySeed.users.map((user) => user.id === 'persona-seller'
      ? {...user,roleId:'role-purchase-requester',roleIds:['role-purchase-requester'],permissionDenials:['sales.sale.create']}
      : user);
    legacySeed.meta = legacySeed.meta.map((record)=>record.id==='seedVersion'?{...record,value:'complete-local-erp-v1.29'}:record);
    await storage.replaceAll(legacySeed);
    const state = await new LocalFoundationService(storage).initialize();
    const migrated = state.users.find((user)=>user.id==='persona-seller')!;
    expect(migrated.roleIds).toContain('role-purchase-requester');
    expect(migrated.roleIds).not.toContain('role-sales-manager');
    expect(migrated.roleIds).not.toContain('role-sales-seller');
    expect(migrated.permissionDenials).toEqual(['sales.sale.create']);
    const afterSecondInitialize = await new LocalFoundationService(storage).initialize();
    const rerun = afterSecondInitialize.users.find((user)=>user.id==='persona-seller')!;
    expect(rerun.roleIds).toEqual(migrated.roleIds);
    expect(rerun.permissionDenials).toEqual(migrated.permissionDenials);
  });

  it('ignores legacy direct grants after upgrade instead of grandfathering sensitive access', async () => {
    const storage = new MemoryStorage();
    const seed = createSeedData();
    seed.users = seed.users.map((user) => user.id === 'persona-laleh'
      ? {...user, permissionGrants: ['foundation.audit.view']}
      : user);
    seed.meta = seed.meta.map((record) => record.id === 'seedVersion' ? {...record, value: 'complete-local-erp-v1.29'} : record);
    await storage.replaceAll(seed);
    const state = await new LocalFoundationService(storage).initialize();
    const target = state.users.find((user) => user.id === 'persona-laleh')!;
    expect(target.permissionGrants).toEqual([]);
    expect(target.permissionEntitlements?.some((item) => item.source === 'user-grant')).toBe(false);
    expect(target.permissions).not.toContain('foundation.audit.view');
  });

  it('aborts migration when any store changes after its snapshot even without a meta update', async () => {
    const storage=new MigrationRaceStorage();const seed=createSeedData();seed.meta=seed.meta.map((record)=>record.id==='seedVersion'?{...record,value:'complete-local-erp-v1.29'}:record);await storage.replaceAll(seed);
    await expect(new LocalFoundationService(storage).initialize()).rejects.toThrow('هنگام ارتقا');
    expect((await storage.getAll<{id:string;firstName:string}>('personnel')).find((person)=>person.id==='personnel-arman')?.firstName).toBe('تغییر هم‌زمان بدون meta');
  });

  it('uses caller concurrency tokens and rolls back access plus audit on storage failure', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: 'persona-product-owner', actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);
    const before = (await service.loadState()).users.find((user) => user.id === 'persona-laleh')!;
    const beforeAudits = await storage.getAll<AuditEvent>('audit_events');

    storage.failNextPut('audit_events');
    await expect(service.updateUser(before.id, userConcurrencyToken(before), {...userInput(before), name: 'نام تغییرکرده'})).rejects.toThrow('injected failure');
    expect(userConcurrencyToken((await storage.get<LocalUser>('users', before.id))!)).toBe(userConcurrencyToken(before));
    expect(await storage.getAll<AuditEvent>('audit_events')).toEqual(beforeAudits);

    await storage.put('users', {...before, name: 'تغییر هم‌زمان'});
    await expect(service.updateUser(before.id, userConcurrencyToken(before), {...userInput(before), name: 'ویرایش تب قدیمی'})).rejects.toThrow('تب دیگری');
  });

  it('uses caller role versions and deletes roles atomically against current assignments', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const session = await storage.get<FoundationSession>('sessions','active-session');
    await storage.put('sessions',{...session!,activeUserId:'persona-product-owner',actingAdminUserId:undefined});
    const now='2026-08-25T10:00:00.000Z';
    const role:SecurityRole={id:'role-test-removable',name:'نقش آزمایشی حذف',description:'',scope:'SELF',permissions:[],status:'active',protected:false,version:1,createdAt:now,updatedAt:now};
    await storage.put('security_roles',role);
    const service=new LocalFoundationService(storage);

    await storage.put('security_roles',{...role,description:'تغییر هم‌زمان',version:2,updatedAt:'2026-08-25T10:01:00.000Z'});
    await expect(service.setRoleStatus(role.id,1,'inactive')).rejects.toThrow('تب دیگری');
    await expect(service.deleteRole(role.id,1)).rejects.toThrow('تب دیگری');

    const current=(await storage.get<SecurityRole>('security_roles',role.id))!;
    storage.failNextPut('audit_events');
    await expect(service.deleteRole(role.id,current.version??1)).rejects.toThrow('injected failure');
    expect(await storage.get<SecurityRole>('security_roles',role.id)).toEqual(current);

    const target=(await service.loadState()).users.find((user)=>user.id==='persona-laleh')!;
    await storage.put('users',{...target,roleIds:[...target.roleIds,role.id]});
    await expect(service.deleteRole(role.id,current.version??1)).rejects.toThrow('تخصیص دارد');
    expect(await storage.get<SecurityRole>('security_roles',role.id)).toBeTruthy();
  });

  it('keeps password and status changes atomic and rejects stale user tokens', async () => {
    const storage=new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const session=await storage.get<FoundationSession>('sessions','active-session');
    await storage.put('sessions',{...session!,activeUserId:'persona-product-owner',actingAdminUserId:undefined});
    const service=new LocalFoundationService(storage);
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-laleh')!;
    storage.failNextPut('audit_events');
    await expect(service.setUserPassword(target.id,userConcurrencyToken(target),'SecurePass123')).rejects.toThrow('injected failure');
    expect(await storage.get<LocalUser>('users',target.id)).toEqual(target);
    await storage.put('users',{...target,name:'تغییر هم‌زمان'});
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive')).rejects.toThrow('تب دیگری');
  });

  it('finds ended personnel through the reverse legacy link before activating an account', async () => {
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());
    const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:'persona-product-owner',actingAdminUserId:undefined});
    const target=(await storage.get<LocalUser>('users','persona-seller'))!;
    await storage.put('users',{...target,personnelId:undefined,status:'inactive'});
    const personnel=(await storage.getAll<{id:string;linkedUserId?:string;employmentStatus:string}>('personnel')).find((person)=>person.linkedUserId===target.id)!;
    await storage.put('personnel',{...personnel,employmentStatus:'ended'});
    const current=(await storage.get<LocalUser>('users',target.id))!;
    await expect(new LocalFoundationService(storage).setUserStatus(current.id,userConcurrencyToken(current),'active')).rejects.toThrow('بازگشت به همکاری');
  });

  it('allocates unique personnel codes for two concurrent registration activations', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const now = '2026-08-25T09:00:00.000Z';
    const requests: RegistrationRequest[] = [
      {id:'registration-concurrent-a',trackingCode:'REG-CA',fullName:'آزاده یکم',mobile:'09125550001',secondaryMobile:'09125550002',nationalId:'0084573019',gender:'female',province:'تهران',city:'تهران',address:'نشانی کامل اول',bankName:'ملت',cardNumber:'6104337812345601',requestedUsername:'concurrent.a',selfDeclaration:{},status:'approved',proposedRoleIds:['role-sales-seller'],proposedByUserId:'persona-registration-reviewer',proposedAt:now,version:2,createdAt:now,updatedAt:now},
      {id:'registration-concurrent-b',trackingCode:'REG-CB',fullName:'آزاده دوم',mobile:'09125550003',secondaryMobile:'09125550004',nationalId:'0084573027',gender:'female',province:'تهران',city:'تهران',address:'نشانی کامل دوم',bankName:'ملت',cardNumber:'6104337812345602',requestedUsername:'concurrent.b',selfDeclaration:{},status:'approved',proposedRoleIds:['role-sales-seller'],proposedByUserId:'persona-registration-reviewer',proposedAt:now,version:2,createdAt:now,updatedAt:now},
    ];
    for (const request of requests) await storage.put('registration_requests', request);
    const session = await storage.get<FoundationSession>('sessions','active-session');
    await storage.put('sessions',{...session!,activeUserId:'persona-system-admin',actingAdminUserId:undefined});
    const service = new LocalFoundationService(storage);
    const [first, second] = await Promise.all(requests.map((request) => service.activateRegistration(request.id, request.version, 'StrongPass123')));
    const activatedIds = [
      first.registrationRequests.find((item) => item.id === requests[0].id)?.linkedPersonnelId,
      second.registrationRequests.find((item) => item.id === requests[1].id)?.linkedPersonnelId,
    ];
    const personnel = await storage.getAll<{id:string;personnelCode:string}>('personnel');
    const codes = personnel.filter((item) => activatedIds.includes(item.id)).map((item) => item.personnelCode);
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(2);
  });

  it('persists a denied role permission for only one user and records the change in Audit', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const admin = LOCAL_USERS.find((user) => user.isAdmin)!;
    const target = LOCAL_USERS.find((user) => user.id === 'persona-laleh')!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: admin.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);

    const updated = await service.updateUser(target.id, userConcurrencyToken(target), {
      ...userInput(target),
      permissionDenials: ['foundation.dashboard.view'],
      permissionGrants: [],
    });

    const saved = updated.users.find((user) => user.id === target.id)!;
    expect(saved.permissionDenials).toEqual(['foundation.dashboard.view']);
    expect(saved.permissionGrants).toEqual([]);
    expect(saved.permissions).not.toContain('foundation.dashboard.view');
    expect(saved.permissions).not.toContain('foundation.audit.view');
    expect(SECURITY_ROLES.find((role) => role.id === target.roleId)?.permissions).toContain('foundation.dashboard.view');
    expect(updated.audits.some((audit) => audit.action === 'organization.user.permission_overrides_changed' && audit.effectiveUserId === target.id)).toBe(true);
  });

  it('requires role-assignment authority to change a user role or its individual permissions', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const actor = LOCAL_USERS.find((user) => user.roleId === 'role-user-manager')!;
    const target = LOCAL_USERS.find((user) => user.id === 'persona-laleh')!;
    await storage.put('users', {...actor, permissionDenials: ['organization.roles.assign']});
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: actor.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);

    await expect(service.updateUser(target.id, userConcurrencyToken(target), {
      ...userInput(target),
      permissionDenials: ['foundation.dashboard.view'],
    })).rejects.toThrow('مجوز انتساب نقش و ریزمجوز');
  });

  it('rejects invalid organization parents, inactive managers and stale unit forms', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const admin = LOCAL_USERS.find((user) => user.isAdmin)!;
    const inactive = LOCAL_USERS.find((user) => user.status === 'inactive')!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: admin.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);
    const unit = ORGANIZATIONAL_UNITS.find((item) => item.type !== 'شعبه')!;

    await expect(service.createUnit({name: 'واحد آزمایشی', type: 'اداره', parentId: 'missing-unit', description: ''})).rejects.toThrow('واحد بالادست');
    await expect(service.createUnit({name: 'واحد آزمایشی', type: 'اداره', managerUserId: inactive.id, description: ''})).rejects.toThrow('حساب کاربری فعال');
    await expect(service.updateUnit(unit.id, 'stale-version', {name: unit.name, type: unit.type, parentId: unit.parentId, managerUserId: unit.managerUserId, description: unit.description})).rejects.toThrow('پنجره دیگری');
  });
});
