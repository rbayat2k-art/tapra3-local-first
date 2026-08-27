import {
  FOUNDATION_DB_NAME,
  FOUNDATION_SCHEMA_VERSION,
  FOUNDATION_SEED_VERSION,
  FOUNDATION_STORES,
  type EncryptedSnapshot,
  type FoundationStoreName,
  type SnapshotManifest,
} from './model';

export interface StorageTransaction {
  get<T>(store: FoundationStoreName, id: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: FoundationStoreName): Promise<T[]>;
  put<T>(store: FoundationStoreName, value: T): Promise<void>;
  delete(store: FoundationStoreName, id: IDBValidKey): Promise<void>;
  clear(store: FoundationStoreName): Promise<void>;
}

export interface StorageAdapter {
  transaction<T>(
    stores: FoundationStoreName[],
    mode: IDBTransactionMode,
    work: (transaction: StorageTransaction) => Promise<T>,
  ): Promise<T>;
  get<T>(store: FoundationStoreName, id: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: FoundationStoreName): Promise<T[]>;
  put<T>(store: FoundationStoreName, value: T): Promise<void>;
  delete(store: FoundationStoreName, id: IDBValidKey): Promise<void>;
  replaceAll(stores: Record<FoundationStoreName, unknown[]>): Promise<void>;
  exportSnapshot(): Promise<SnapshotManifest>;
  importSnapshot(snapshot: SnapshotManifest): Promise<void>;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('خطا در عملیات پایگاه داده محلی.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('عملیات پایگاه داده محلی لغو شد.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('عملیات پایگاه داده محلی ناموفق بود.'));
  });
}

function createStore(database: IDBDatabase, name: FoundationStoreName): IDBObjectStore {
  return database.createObjectStore(name, {keyPath: 'id'});
}

export class IndexedDBAdapter implements StorageAdapter {
  private databasePromise?: Promise<IDBDatabase>;

  constructor(private readonly databaseName = FOUNDATION_DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, FOUNDATION_SCHEMA_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of FOUNDATION_STORES) {
          if (database.objectStoreNames.contains(storeName)) continue;
          const store = createStore(database, storeName);
          if (storeName === 'audit_events') {
            store.createIndex('occurredAt', 'occurredAt');
            store.createIndex('actorId', 'actorId');
            store.createIndex('category', 'category');
          }
          if (storeName === 'domain_events') store.createIndex('aggregateId', 'aggregateId');
          if (storeName === 'notifications') {
            store.createIndex('userId', 'userId');
            store.createIndex('createdAt', 'createdAt');
            store.createIndex('dedupeKey', 'dedupeKey');
          }
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('بازکردن پایگاه داده محلی ممکن نشد.'));
      request.onblocked = () => reject(new Error('تب دیگری مانع ارتقای پایگاه داده محلی شده است.'));
    });
    return this.databasePromise;
  }

  async transaction<T>(
    stores: FoundationStoreName[],
    mode: IDBTransactionMode,
    work: (transaction: StorageTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.open();
    const nativeTransaction = database.transaction(stores, mode);
    const done = transactionDone(nativeTransaction);
    const api: StorageTransaction = {
      get: <V>(store: FoundationStoreName, id: IDBValidKey) =>
        requestAsPromise(nativeTransaction.objectStore(store).get(id)) as Promise<V | undefined>,
      getAll: <V>(store: FoundationStoreName) =>
        requestAsPromise(nativeTransaction.objectStore(store).getAll()) as Promise<V[]>,
      put: async <V>(store: FoundationStoreName, value: V) => {
        await requestAsPromise(nativeTransaction.objectStore(store).put(value));
      },
      delete: async (store: FoundationStoreName, id: IDBValidKey) => {
        await requestAsPromise(nativeTransaction.objectStore(store).delete(id));
      },
      clear: async (store: FoundationStoreName) => {
        await requestAsPromise(nativeTransaction.objectStore(store).clear());
      },
    };

    try {
      const result = await work(api);
      await done;
      return result;
    } catch (error) {
      try { nativeTransaction.abort(); } catch { /* transaction already completed or aborted */ }
      throw error;
    }
  }

  get<T>(store: FoundationStoreName, id: IDBValidKey): Promise<T | undefined> {
    return this.transaction([store], 'readonly', (transaction) => transaction.get<T>(store, id));
  }

  getAll<T>(store: FoundationStoreName): Promise<T[]> {
    return this.transaction([store], 'readonly', (transaction) => transaction.getAll<T>(store));
  }

  put<T>(store: FoundationStoreName, value: T): Promise<void> {
    return this.transaction([store], 'readwrite', (transaction) => transaction.put(store, value));
  }

  delete(store: FoundationStoreName, id: IDBValidKey): Promise<void> {
    return this.transaction([store], 'readwrite', (transaction) => transaction.delete(store, id));
  }

  async replaceAll(stores: Record<FoundationStoreName, unknown[]>): Promise<void> {
    await this.transaction([...FOUNDATION_STORES], 'readwrite', async (transaction) => {
      await Promise.all(FOUNDATION_STORES.map((store) => transaction.clear(store)));
      await Promise.all(FOUNDATION_STORES.flatMap((store) => stores[store].map((value) => transaction.put(store, value))));
    });
  }

  async exportSnapshot(): Promise<SnapshotManifest> {
    const stores = await this.transaction([...FOUNDATION_STORES], 'readonly', async (transaction) => {
      const entries = await Promise.all(FOUNDATION_STORES.map(async (store) => [store, await transaction.getAll(store)] as const));
      return Object.fromEntries(entries) as Record<FoundationStoreName, unknown[]>;
    });
    const exportedAt = new Date().toISOString();
    const payload = {
      format: 'tapra2-local-snapshot' as const,
      schemaVersion: FOUNDATION_SCHEMA_VERSION,
      seedVersion: FOUNDATION_SEED_VERSION,
      exportedAt,
      stores,
    };
    return {...payload, checksum: await sha256(JSON.stringify(payload))};
  }

  async importSnapshot(snapshot: SnapshotManifest): Promise<void> {
    validateSnapshotShape(snapshot);
    const {checksum, ...payload} = snapshot;
    const actualChecksum = await sha256(JSON.stringify(payload));
    if (checksum !== actualChecksum) throw new Error('صحت فایل پشتیبان تأیید نشد؛ فایل ممکن است تغییر کرده باشد.');
    const stores = Object.fromEntries(FOUNDATION_STORES.map((store) => [store, snapshot.stores[store] ?? []])) as Record<FoundationStoreName, unknown[]>;
    const meta = (stores.meta as Array<{id?: unknown; value?: unknown}>).filter((item) => item.id !== 'schemaVersion');
    stores.meta = [...meta, {id: 'schemaVersion', value: FOUNDATION_SCHEMA_VERSION}];
    await this.replaceAll(stores);
  }
}

export function validateSnapshotShape(value: unknown): asserts value is SnapshotManifest {
  if (!value || typeof value !== 'object') throw new Error('ساختار فایل پشتیبان معتبر نیست.');
  const snapshot = value as Partial<SnapshotManifest>;
  if (snapshot.format !== 'tapra2-local-snapshot') throw new Error('این فایل، پشتیبان معتبر شاهراه نیست.');
  if (snapshot.schemaVersion !== FOUNDATION_SCHEMA_VERSION && snapshot.schemaVersion !== 11) throw new Error('نسخه این پشتیبان با نسخه فعلی سازگار نیست.');
  if (!snapshot.stores || typeof snapshot.stores !== 'object') throw new Error('داده‌های فایل پشتیبان ناقص است.');
  for (const store of FOUNDATION_STORES) {
    if (snapshot.schemaVersion === 11 && (store === 'projects' || store === 'chat_preferences')) continue;
    if (!Array.isArray(snapshot.stores[store])) throw new Error(`بخش ${store} در فایل پشتیبان وجود ندارد.`);
  }
  if (typeof snapshot.checksum !== 'string') throw new Error('کد صحت فایل پشتیبان وجود ندارد.');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encryptSnapshot(snapshot: SnapshotManifest, password: string): Promise<EncryptedSnapshot> {
  if (password.length < 8) throw new Error('رمز پشتیبان باید حداقل ۸ نویسه باشد.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 210_000;
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations, hash: 'SHA-256'},
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(JSON.stringify(snapshot)));
  return {
    format: 'tapra2-local-snapshot-encrypted', version: 1, algorithm: 'AES-GCM', iterations,
    salt: bytesToBase64(salt), iv: bytesToBase64(iv), cipherText: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSnapshot(envelope: EncryptedSnapshot, password: string): Promise<SnapshotManifest> {
  if (envelope.format !== 'tapra2-local-snapshot-encrypted') throw new Error('فایل رمزگذاری‌شده معتبر نیست.');
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      {name: 'PBKDF2', salt, iterations: envelope.iterations, hash: 'SHA-256'},
      material,
      {name: 'AES-GCM', length: 256},
      false,
      ['decrypt'],
    );
    const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, base64ToBytes(envelope.cipherText));
    const snapshot = JSON.parse(new TextDecoder().decode(decrypted));
    validateSnapshotShape(snapshot);
    return snapshot;
  } catch {
    throw new Error('رمز نادرست است یا فایل رمزگذاری‌شده آسیب دیده است.');
  }
}
