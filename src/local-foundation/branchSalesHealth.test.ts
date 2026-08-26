import {describe, expect, it} from 'vitest';
import {branchHealthInsight, salesStructureHealthInsight} from './branchSalesHealth';
import {createSeedData} from './seed';
import {FOUNDATION_STORES, type FoundationState, type FoundationStoreName, type LocalUser, type OrganizationalUnit, type PersonnelRecord, type SalesStructure, type SnapshotManifest} from './model';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  private failStore?: FoundationStoreName;
  failNextPut(store: FoundationStoreName) {this.failStore = store;}
  async transaction<T>(stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const snapshot = new Map(stores.map((store) => [store, new Map([...this.stores.get(store)!].map(([key, value]) => [key, structuredClone(value)]))]));
    const tx: StorageTransaction = {
      get: async <V>(store: FoundationStoreName, id: IDBValidKey) => this.stores.get(store)?.get(id) as V | undefined,
      getAll: async <V>(store: FoundationStoreName) => [...(this.stores.get(store)?.values() ?? [])] as V[],
      put: async <V>(store: FoundationStoreName, value: V) => {if (this.failStore === store) {this.failStore = undefined; throw new Error(`injected failure: ${store}`);} this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));},
      delete: async (store: FoundationStoreName, id: IDBValidKey) => {this.stores.get(store)!.delete(id);},
      clear: async (store: FoundationStoreName) => {this.stores.get(store)!.clear();},
    };
    try {return await work(tx);} catch (error) {for (const [store, values] of snapshot) this.stores.set(store, values); throw error;}
  }
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, id));}
  getAll<T>(store: FoundationStoreName) {return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store));}
  put<T>(store: FoundationStoreName, value: T) {return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.transaction([store], 'readwrite', (tx) => tx.delete(store, id));}
  async replaceAll(stores: Record<FoundationStoreName, unknown[]>) {for (const store of FOUNDATION_STORES) {this.stores.get(store)!.clear(); for (const value of stores[store]) this.stores.get(store)!.set((value as {id: IDBValidKey}).id, structuredClone(value));}}
  async exportSnapshot(): Promise<SnapshotManifest> {throw new Error('not used');}
  async importSnapshot(_snapshot: SnapshotManifest): Promise<void> {throw new Error('not used');}
}

function stateSlice(): Pick<FoundationState, 'units' | 'users' | 'personnel' | 'salesStructures' | 'roles' | 'workflows'> {
  const seed = createSeedData();
  return {
    units: seed.organizational_units as OrganizationalUnit[],
    users: seed.users as LocalUser[],
    personnel: seed.personnel as PersonnelRecord[],
    salesStructures: seed.sales_structures as SalesStructure[],
    roles: seed.security_roles as FoundationState['roles'],
    workflows: seed.workflow_definitions as FoundationState['workflows'],
  };
}

describe('branch and sales structure health', () => {
  it('keeps the staffed central branch healthy and flags an unmanaged branch', () => {
    const state = stateSlice();
    const central = state.units.find((item) => item.id === 'unit-branch-central')!;
    const poonak = state.units.find((item) => item.id === 'unit-branch-poonak')!;
    expect(branchHealthInsight(central, state).issues).toEqual([]);
    expect(branchHealthInsight(poonak, state).issues).toContain('missing-manager');
  });

  it('separates a healthy route from a route that merely has no active sellers yet', () => {
    const state = stateSlice();
    const assigned = state.salesStructures.find((item) => item.id === 'sales-structure-saadat-a')!;
    const waiting = state.salesStructures.find((item) => item.id === 'sales-structure-saadat-b')!;
    expect(salesStructureHealthInsight(assigned, state).issues).toEqual([]);
    expect(salesStructureHealthInsight(assigned, state).withoutActiveSellers).toBe(false);
    expect(salesStructureHealthInsight(waiting, state).issues).toEqual([]);
    expect(salesStructureHealthInsight(waiting, state).withoutActiveSellers).toBe(true);
  });

  it('detects an inactive route with a seller assigned to a different branch and supervisor', () => {
    const state = stateSlice();
    const original = state.salesStructures.find((item) => item.id === 'sales-structure-saadat-a')!;
    const structure = {...original, status: 'inactive' as const};
    const seller = state.personnel.find((item) => item.salesStructureId === original.id)!;
    const personnel = state.personnel.map((item) => item.id === seller.id ? {...item, salesBranchUnitId: 'unit-branch-poonak', branchUnitId: 'unit-branch-poonak', salesSupervisorPersonnelId: 'personnel-callcenter-b'} : item);
    expect(salesStructureHealthInsight(structure, {...state, personnel}).issues).toEqual(expect.arrayContaining([
      'seller-branch-mismatch',
      'seller-supervisor-mismatch',
      'inactive-with-active-sellers',
    ]));
  });
});

describe('sales structure mutation safety', () => {
  it('rejects assigning an active but unqualified account as branch manager', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const service = new LocalFoundationService(storage);
    const state = await service.loadState();
    const branch = state.units.find((item) => item.id === 'unit-branch-poonak')!;
    await expect(service.updateUnit(branch.id, branch.updatedAt, {name: branch.name, type: branch.type, parentId: branch.parentId, managerUserId: 'persona-product-owner', description: branch.description})).rejects.toThrow('نقش مصوب مرحله بررسی شعبه');
  });

  it('rejects a stale edit token after another window updates the route', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const service = new LocalFoundationService(storage);
    const current = (await service.loadState()).salesStructures.find((item) => item.id === 'sales-structure-saadat-b')!;
    const input = {branchUnitId: current.branchUnitId, salesVicePersonnelId: current.salesVicePersonnelId ?? '', salesManagerPersonnelId: current.salesManagerPersonnelId, seniorSupervisorPersonnelId: current.seniorSupervisorPersonnelId, callCenterSupervisorPersonnelId: current.callCenterSupervisorPersonnelId};
    await service.updateSalesStructure(current.id, current.updatedAt, input);
    await expect(service.updateSalesStructure(current.id, current.updatedAt, input)).rejects.toThrow('پنجره دیگری');
  });

  it('rolls back the route status when its audit write fails', async () => {
    const storage = new MemoryStorage();
    await storage.replaceAll(createSeedData());
    const service = new LocalFoundationService(storage);
    const current = (await service.loadState()).salesStructures.find((item) => item.id === 'sales-structure-saadat-b')!;
    storage.failNextPut('audit_events');
    await expect(service.setSalesStructureStatus(current.id, current.updatedAt, 'inactive')).rejects.toThrow('injected failure');
    expect((await storage.get<SalesStructure>('sales_structures', current.id))?.status).toBe('active');
  });
});
