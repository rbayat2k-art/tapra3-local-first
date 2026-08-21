import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData, LOCAL_USERS} from './seed';
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

describe('self-service personnel profile change workflow', () => {
  it('keeps the personnel record unchanged until HR approves the versioned request', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const requester = LOCAL_USERS.find((user) => !user.isAdmin && user.personnelId)!;
    const admin = LOCAL_USERS.find((user) => user.isAdmin)!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: requester.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);
    const before = await service.loadState();
    const personnel = before.personnel.find((person) => person.id === requester.personnelId)!;
    const originalCity = personnel.city;

    const submitted = await service.submitOwnProfileChange({requestedValues: {city: 'شیراز'}, reason: 'اصلاح شهر محل سکونت'});
    expect(submitted.personnel.find((person) => person.id === personnel.id)?.city).toBe(originalCity);
    const request = submitted.personnelProfileChangeRequests[0];
    expect(request.status).toBe('submitted');
    expect(request.beforeValues.city).toBe(originalCity);
    expect(request.requestedValues.city).toBe('شیراز');

    await storage.put('sessions', {...session!, activeUserId: admin.id, actingAdminUserId: undefined});
    const approved = await service.reviewProfileChangeRequest(request.id, 'approved', 'مدارک محل سکونت بررسی شد', request.version);
    expect(approved.personnel.find((person) => person.id === personnel.id)?.city).toBe('شیراز');
    expect(approved.personnelProfileChangeRequests[0].status).toBe('approved');
    expect(approved.audits.map((audit) => audit.action)).toEqual(expect.arrayContaining([
      'organization.personnel.profile_change_requested',
      'organization.personnel.profile_change_approved',
    ]));
  });

  it('rejects a second pending request from the same user', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const requester = LOCAL_USERS.find((user) => !user.isAdmin && user.personnelId)!;
    const session = await storage.get<FoundationSession>('sessions', 'active-session');
    await storage.put('sessions', {...session!, activeUserId: requester.id, actingAdminUserId: undefined});
    const service = new LocalFoundationService(storage);
    await service.submitOwnProfileChange({requestedValues: {city: 'شیراز'}, reason: 'اصلاح شهر محل سکونت'});
    await expect(service.submitOwnProfileChange({requestedValues: {province: 'فارس'}, reason: 'اصلاح استان محل سکونت'})).rejects.toThrow('یک درخواست تغییر در انتظار بررسی دارید');
  });
});
