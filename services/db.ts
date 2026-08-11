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
 *                        with an index on `year` (descending initial sort — see v7 note)
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
// survives the upgrade untouched.
// v6: adds `costHistory` — one record per observed cost CHANGE per product,
// written only by a manual sync. Additive as well: the catalogue, cart and
// cached queries all survive the upgrade. It carries a `productId` index because
// the chart reads one product's history at a time, and a full scan of a store
// that grows with every price change would defeat the point.
// v7: re-adds ONE index on `supplierProducts.year`, so the default table order
// (latest year first) comes from the index instead of an in-memory sort. This
// store is now bounded to the latest-only catalogue (~8,251 rows, not the 318k
// v4 was optimizing for), so one index costs a small fraction of what v4
// removed.
//
// Before creating the index, every EXISTING record's `year` is coerced to a
// plain number. Measured live: 95.4% of rows stored it as a STRING ("2024"),
// and 4.6% had no `year` field at all. Indexing that as-is would have been
// actively wrong two ways: an index silently EXCLUDES any record missing its
// keyed field, so the 382 yearless rows would vanish from every indexed read;
// and IndexedDB orders all numbers before all strings, so the string-typed
// majority would sort as one block after any numeric leftovers instead of
// interleaving by year. Coercing to `Number(year) || 0` first (0 for missing/
// invalid — the same convention `dateSortKey` already uses elsewhere in this
// app) fixes both: every row gets a real key, and undated rows group at one
// end instead of scattering. `enrichSupplier` applies the same coercion at
// write time, so every future sync keeps the index correct without another
// migration.
// v8: adds `fittingPriceHistory`, the same one-record-per-CHANGE shape as
// costHistory but for the fitting price. It is a SEPARATE store rather than a
// column on costHistory so the cost series cannot shift by a single byte:
// existing records are never read, rewritten or re-keyed by this upgrade.
// Needed because the API has no fitting-price history — `PriceHistoryItem`
// exposes only `date` and `price`, and no fittingPriceHistory root field
// exists (12 candidate names probed, all rejected) — so the only way to build
// a series is to observe `fitting_price` on each manual sync.
const DB_VERSION = 8;

export const STORE_PRODUCT_QUERIES = "productQueries";
export const STORE_SUPPLIER_PRODUCTS = "supplierProducts";
export const STORE_TYRES_CHAT = "tyresChat";
export const STORE_CART = "cart";
export const STORE_COST_HISTORY = "costHistory";
export const STORE_FITTING_HISTORY = "fittingPriceHistory";
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
        // Fresh install: no existing rows to normalize, and `enrichSupplier`
        // already writes a clean numeric `year` going forward, so the index
        // can be created immediately.
        const store = db.createObjectStore(STORE_SUPPLIER_PRODUCTS, { keyPath: "id" });
        store.createIndex("year", "year", { unique: false });
      } else {
        // Upgrading from an earlier version: drop the v3 indexes if they
        // somehow survived (v4 already removed them for everyone, but this
        // stays idempotent for a DB that skipped straight from v3).
        const store = tx.objectStore(STORE_SUPPLIER_PRODUCTS);
        for (const name of ["brand", "size", "source_name", "is_latest"]) {
          if (store.indexNames.contains(name)) store.deleteIndex(name);
        }
        if (store.indexNames.contains("year")) store.deleteIndex("year");

        // v7: normalize every existing record's `year` to a plain number
        // BEFORE indexing it — see the DB_VERSION comment above for why.
        // `cursor.update` inside the same versionchange transaction; no
        // record is added, removed or has any other field touched.
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            store.createIndex("year", "year", { unique: false });
            return;
          }
          const rec = cursor.value as { year?: unknown };
          const numericYear = Number(rec.year) || 0;
          if (typeof rec.year !== "number" || rec.year !== numericYear) {
            cursor.update({ ...rec, year: numericYear });
          }
          cursor.continue();
        };
      }
      if (!db.objectStoreNames.contains(STORE_CART)) {
        // One record per cart line, keyed by product id so add-to-cart is an
        // upsert and quantities can't duplicate a line.
        db.createObjectStore(STORE_CART, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_COST_HISTORY)) {
        // Auto-incrementing key: a product legitimately has many records over
        // time, so nothing here is unique per product. The `productId` index is
        // what the chart queries.
        const hist = db.createObjectStore(STORE_COST_HISTORY, {
          keyPath: "id",
          autoIncrement: true,
        });
        hist.createIndex("productId", "productId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_FITTING_HISTORY)) {
        // Mirrors costHistory exactly — auto-increment key because a product has
        // many observations, `productId` index because the chart reads one
        // product at a time.
        const fit = db.createObjectStore(STORE_FITTING_HISTORY, {
          keyPath: "id",
          autoIncrement: true,
        });
        fit.createIndex("productId", "productId", { unique: false });
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

/**
 * All records matching `value` on `index`, without scanning the store.
 *
 * Used by the cost-history chart, which needs one product's records out of a
 * store that accumulates a row per price change across the whole catalogue.
 */
export async function idbGetAllByIndex<T>(
  store: string,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDB();
  return new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Every record in a store, ordered by `index` — no value filter, unlike
 * {@link idbGetAllByIndex}. `descending` reverses the result; IndexedDB itself
 * only walks an index ascending, so "descending" here is one O(n) `.reverse()`
 * on the array `getAll()` already returned, not a comparator sort.
 *
 * `getAll()` still clones every record into memory in one call — the same cost
 * `idbGetPage` was built to avoid for a 319k-row store. This is fine only
 * because the caller's store is bounded (the supplier catalogue is latest-only
 * now, ~8,251 rows); a store that can still grow into the hundreds of
 * thousands should keep using the paged reader instead.
 */
export async function idbGetAllByIndexOrdered<T>(
  store: string,
  index: string,
  descending = false,
): Promise<T[]> {
  const db = await openDB();
  return new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index(index).getAll();
    req.onsuccess = () => {
      const rows = (req.result as T[]) ?? [];
      resolve(descending ? rows.reverse() : rows);
    };
    req.onerror = () => reject(req.error);
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
