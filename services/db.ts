/**
 * Minimal IndexedDB wrapper (no dependencies).
 *
 * Backing store for the offline / instant-load POS cache. All calls are
 * browser-only — they reject on the server (or when IndexedDB is
 * unavailable), so callers should `.catch()` and fall back gracefully.
 *
 * Object stores:
 *   - productQueries   : cached storefront/query responses, keyed by query signature
 *   - supplierProducts : the full supplier catalogue, one record PER product (keyPath "id"),
 *                        with indexes on brand/size/year/source_name/is_latest
 *   - tyresChat        : cached tyresChat items, keyed by id
 *   - meta             : misc key/value (sync timestamps, etc.)
 */

const DB_NAME = "tyrescart-pos";
// v3: adds the per-product `supplierProducts` object store (+indexes). Bumping
// the version forces onupgradeneeded to run for anyone on v2 so the new store
// is created; without the bump, existing v2 DBs never get it and every
// supplierProducts transaction fails with NotFoundError.
const DB_VERSION = 3;

export const STORE_PRODUCT_QUERIES = "productQueries";
export const STORE_SUPPLIER_PRODUCTS = "supplierProducts";
export const STORE_TYRES_CHAT = "tyresChat";
export const STORE_META = "meta";

/**
 * Single memoized connection. We deliberately keep ONE long-lived connection
 * open (instead of open→close per operation) so:
 *   - Chrome DevTools ▸ Application ▸ IndexedDB shows the DB live (it only
 *     reliably renders databases that currently have an open connection), and
 *   - we avoid repeated open() overhead.
 * The promise is reset on close / version change so the next call reopens.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCT_QUERIES)) {
        db.createObjectStore(STORE_PRODUCT_QUERIES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_TYRES_CHAT)) {
        db.createObjectStore(STORE_TYRES_CHAT, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SUPPLIER_PRODUCTS)) {
        const store = db.createObjectStore(
          STORE_SUPPLIER_PRODUCTS,
          { keyPath: "id" }
        );

        store.createIndex("brand", "brand", { unique: false });
        store.createIndex("size", "size", { unique: false });
        store.createIndex("year", "year", { unique: false });
        store.createIndex("source_name", "source_name", { unique: false });
        store.createIndex("is_latest", "is_latest", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab triggers a version upgrade, release this connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // If the connection drops, allow the next call to reopen.
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn("[db] open blocked — close other tabs of this app");
  });

  // On failure, clear the cache so a later call retries.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

/**
 * Eagerly open (and keep) the database connection so `tyrescart-pos` appears in
 * DevTools immediately on app load. Safe to call on every mount; no-op on the
 * server or where IndexedDB is unavailable.
 */
export async function ensureDb(): Promise<void> {
  try {
    await openDB();
  } catch {
    /* SSR / unsupported → ignore */
  }
}

/** Read a single record by key. Returns null if missing. */
export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Read all records in a store. */
export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

/** Upsert a single record. */
export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Upsert many records in one transaction. */
export async function idbPutAll<T>(store: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    items.forEach((it) => os.put(it));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Wipe a store (e.g. before writing a fresh full list). */
export async function idbClear(store: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a single record by key. */
export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Set a meta value (sync timestamps, flags…). */
export async function idbSetMeta(key: string, value: unknown): Promise<void> {
  await idbPut(STORE_META, { key, value });
}

/** Get a meta value. */
export async function idbGetMeta<T>(key: string): Promise<T | null> {
  const rec = await idbGet<{ key: string; value: T }>(STORE_META, key);
  return rec ? rec.value : null;
}
