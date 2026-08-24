import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, LocalUser, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData, LOCAL_USERS, SECURITY_ROLES} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(
    FOUNDATION_STORES.map((store) => [store, new Map()]),
  );

  async transaction<T>(stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const api: StorageTransaction = {
      get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,
      getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],
      put: async <V>(store: FoundationStoreName, value: V) => {this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},
      delete: async (store: FoundationStoreName, id: IDBValidKey) => {this.stores.get(store)!.delete(id);},
      clear: async (store: FoundationStoreName) => {this.stores.get(store)!.clear();},
    };
    return work(api);
  }

  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');}
  async importSnapshot(_snapshot: SnapshotManifest): Promise<void> {throw new Error('not used');}
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
    expect(seller.roleId).toBe('role-sales-seller');
    expect(seller.roleIds).toContain('role-sales-seller');
    expect(seller.permissions).toContain('foundation.dashboard.view');
    expect(seller.permissions).toContain('sales.sale.create');
  });

  it('persists a denied role permission for only one user and records the change in Audit', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const admin = LOCAL_USERS.find((user) => user.isAdmin)!;
    const target = LOCAL_USERS.find((user) => user.roleId === 'role-sales-seller')!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: admin.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);

    const updated = await service.updateUser(target.id, {
      ...userInput(target),
      permissionDenials: ['foundation.dashboard.view'],
      permissionGrants: ['foundation.audit.view'],
    });

    const saved = updated.users.find((user) => user.id === target.id)!;
    expect(saved.permissionDenials).toEqual(['foundation.dashboard.view']);
    expect(saved.permissionGrants).toEqual(['foundation.audit.view']);
    expect(saved.permissions).not.toContain('foundation.dashboard.view');
    expect(saved.permissions).toContain('foundation.audit.view');
    expect(SECURITY_ROLES.find((role) => role.id === target.roleId)?.permissions).toContain('foundation.dashboard.view');
    expect(updated.audits.some((audit) => audit.action === 'organization.user.permission_overrides_changed' && audit.effectiveUserId === target.id)).toBe(true);
  });

  it('requires role-assignment authority to change a user role or its individual permissions', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const actor = LOCAL_USERS.find((user) => user.roleId === 'role-user-manager')!;
    const target = LOCAL_USERS.find((user) => user.roleId === 'role-sales-seller')!;
    await storage.put('users', {...actor, permissionDenials: ['organization.roles.assign']});
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: actor.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);

    await expect(service.updateUser(target.id, {
      ...userInput(target),
      permissionDenials: ['foundation.dashboard.view'],
    })).rejects.toThrow('مجوز انتساب نقش و ریزمجوز');
  });
});
