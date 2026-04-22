const DB_NAME = "finclair";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbCache: IDBDatabase | null = null;

function open(): Promise<IDBDatabase> {
  if (dbCache) return Promise.resolve(dbCache);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      dbCache = req.result;
      dbCache.onclose = () => {
        dbCache = null;
      };
      resolve(dbCache);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function removeItem(key: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllKeys(): Promise<string[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clear(): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
