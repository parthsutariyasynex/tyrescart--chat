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
// v4: DROPS the five supplierProducts indexes (brand/size/year/source_name/
// is_latest). They were never read — the supplier page filters in memory over
// the already-loaded array — but IndexedDB maintained all five on every put,
// costing ~5 extra index writes per row (~1.6M on a 318k-row sync). Removing
// them is purely a write-throughput win; no read path changes.
// v5: adds the `cart` store for offline-first cart persistence. Purely
// additive — no existing store is touched, so a user's synced catalogue
// survives the upgrade untouched. (Phase 4 will add `orders`/`outbox` at v6;
// they are NOT created here because empty speculative stores are just dead
// schema.)
const DB_VERSION = 5;

export const STORE_PRODUCT_QUERIES = "productQueries";
export const STORE_SUPPLIER_PRODUCTS = "supplierProducts";
export const STORE_TYRES_CHAT = "tyresChat";
export const STORE_CART = "cart";
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
      // The version-change transaction — needed to reach existing stores so we
      // can alter their indexes during an upgrade.
      const tx = req.transaction!;

      if (!db.objectStoreNames.contains(STORE_PRODUCT_QUERIES)) {
        db.createObjectStore(STORE_PRODUCT_QUERIES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_TYRES_CHAT)) {
        db.createObjectStore(STORE_TYRES_CHAT, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SUPPLIER_PRODUCTS)) {
        // Fresh install: keyPath only. Deliberately NO secondary indexes — see
        // the v4 note on DB_VERSION. Ordering is carried by the `sort_seq`
        // field on each record, sorted at read time.
        db.createObjectStore(STORE_SUPPLIER_PRODUCTS, { keyPath: "id" });
      } else {
        // Upgrading from v3: drop the never-read indexes. Records are left
        // untouched, so a user's existing catalogue survives the upgrade (it
        // just has no `sort_seq` until their next full sync — read-time
        // ordering handles that case).
        const store = tx.objectStore(STORE_SUPPLIER_PRODUCTS);
        for (const name of ["brand", "size", "year", "source_name", "is_latest"]) {
          if (store.indexNames.contains(name)) store.deleteIndex(name);
        }
      }
      if (!db.objectStoreNames.contains(STORE_CART)) {
        // One record per cart line, keyed by product id so add-to-cart is an
        // upsert and quantities can't duplicate a line.
        db.createObjectStore(STORE_CART, { keyPath: "id" });
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

/**
 * Upsert many records in one transaction.
 *
 * A per-request `onerror` swallows individual row failures (bad/duplicate key,
 * unclonable value) via `preventDefault()`, which stops that one error from
 * bubbling up and aborting the transaction. Without it a single malformed row
 * discards the whole batch — up to 800 products during a supplier sync.
 */
export async function idbPutAll<T>(store: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    items.forEach((it) => {
      const req = os.put(it);
      req.onerror = (ev) => {
        console.warn(`[db] skipped one row in "${store}":`, req.error?.message);
        ev.preventDefault(); // keep the transaction alive
      };
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Read up to `count` records whose key is greater than `after`.
 *
 * The paged alternative to {@link idbGetAll}. `getAll()` on a large store forces
 * V8 to structured-clone EVERY record before the promise resolves — measured on
 * the supplier catalogue: 4.6–7.2s for 319,429 rows, during which nothing can
 * render. Walking the store in key-ordered pages costs the same total work but
 * delivers the first rows in milliseconds and lets the caller yield to the event
 * loop between pages.
 *
 * `IDBKeyRange.lowerBound(after, true)` is exclusive, so passing the last key of
 * the previous page walks the store without gaps or repeats. Mixed key types are
 * fine: IndexedDB orders all numbers before all strings, and this always advances
 * from the last key it actually saw.
 */
export async function idbGetPage<T>(
  store: string,
  after: IDBValidKey | null,
  count: number,
): Promise<T[]> {
  const db = await openDB();
  return new Promise<T[]>((resolve, reject) => {
    const os = db.transaction(store, "readonly").objectStore(store);
    const range = after === null ? null : IDBKeyRange.lowerBound(after, true);
    const req = os.getAll(range, count);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

/** Number of records in a store. Cheap — does not deserialize the values. */
export async function idbCount(store: string): Promise<number> {
  const db = await openDB();
  return new Promise<number>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).count();
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Cursor-delete every record failing `keep`, returning how many were removed.
 *
 * Used to retire rows left over from a previous sync WITHOUT clearing the store
 * up front: a full sync stamps each row it writes with the current batch id,
 * then calls this to drop anything still carrying an older stamp. Walking a
 * cursor keeps memory flat (one record at a time) no matter how large the store
 * is, and — critically — the old catalogue stays readable the whole time, so a
 * sync that dies halfway leaves the user with data rather than an empty store.
 */
export async function idbDeleteWhere<T>(
  store: string,
  keep: (value: T) => boolean,
): Promise<number> {
  const db = await openDB();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).openCursor();
    let removed = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return; // exhausted — tx.oncomplete resolves
      if (!keep(cursor.value as T)) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve(removed);
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
