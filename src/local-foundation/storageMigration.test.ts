import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {
  FOUNDATION_SCHEMA_VERSION,
  FOUNDATION_STORES,
  type FoundationStoreName,
  type LocalUser,
  type MetaRecord,
  type OperationalRecord,
  type OperationalRecordHistory,
} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import {IndexedDBAdapter} from './storage';

const PREVIOUS_SCHEMA_VERSION = 9;

function createVersionNineDatabase(databaseName: string): Promise<void> {
  const seed = createSeedData() as Record<FoundationStoreName, unknown[]>;
  const previousStores = FOUNDATION_STORES.filter((store) => store !== 'recruitment_cases');
  const preservedUser = {...(seed.users as LocalUser[])[0], name: 'نام ویرایش‌شده و حفظ‌شده کاربر'};
  seed.users = [preservedUser, ...(seed.users as LocalUser[]).slice(1)];
  seed.meta = [
    {id: 'schemaVersion', value: PREVIOUS_SCHEMA_VERSION},
    {id: 'seedVersion', value: 'schema-9-before-recruitment'},
    {id: 'custom-user-preference', value: 'keep-me'},
  ] satisfies MetaRecord[];
  seed.workflow_history = [];

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, PREVIOUS_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of previousStores) {
        const store = database.createObjectStore(storeName, {keyPath: 'id'});
        for (const value of seed[storeName]) store.put(structuredClone(value));
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDB schema 9 to schema 10 migration', () => {
  it('adds all five recruitment cases, preserves user data, and creates no orphan recruitment history', async () => {
    const databaseName = `tapra2-schema-upgrade-${crypto.randomUUID()}`;
    await createVersionNineDatabase(databaseName);

    const storage = new IndexedDBAdapter(databaseName);
    const service = new LocalFoundationService(storage);
    const state = await service.initialize();

    expect(FOUNDATION_SCHEMA_VERSION).toBe(10);
    expect(state.users.find((user) => user.id === 'persona-product-owner')?.name).toBe('نام ویرایش‌شده و حفظ‌شده کاربر');
    expect(await storage.get<MetaRecord>('meta', 'custom-user-preference')).toEqual({id: 'custom-user-preference', value: 'keep-me'});

    const recruitmentCases = await storage.getAll<OperationalRecord>('recruitment_cases');
    expect(recruitmentCases).toHaveLength(5);
    expect(new Set(recruitmentCases.map((record) => record.id)).size).toBe(5);

    const recruitmentIds = new Set(recruitmentCases.map((record) => record.id));
    const recruitmentHistory = (await storage.getAll<OperationalRecordHistory>('workflow_history'))
      .filter((history) => history.moduleId === 'recruitment-case');
    expect(recruitmentHistory.length).toBeGreaterThanOrEqual(5);
    expect(recruitmentHistory.every((history) => recruitmentIds.has(history.recordId))).toBe(true);

    const versionRequest = indexedDB.open(databaseName);
    const actualVersion = await new Promise<number>((resolve, reject) => {
      versionRequest.onsuccess = () => { const version = versionRequest.result.version; versionRequest.result.close(); resolve(version); };
      versionRequest.onerror = () => reject(versionRequest.error);
    });
    expect(actualVersion).toBe(10);
  });
});
