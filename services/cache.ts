/**
 * Cache-first (read-through) data access on top of the GraphQL client.
 *
 * Pattern per call:
 *   1. Return whatever is in IndexedDB immediately (instant paint / offline).
 *   2. Fire the live GraphQL request in the background.
 *   3. On success → update IndexedDB + call `onFresh` so the UI refreshes.
 *   4. On failure → keep the cached data; call `onError` for the caller to
 *      decide whether to surface it (only matters when there was no cache).
 */
import {
  idbGet,
  idbPut,
  idbGetAll,
  idbClear,
  idbDelete,
  idbPutAll,
  idbSetMeta,
  idbGetMeta,
  STORE_PRODUCT_QUERIES,
  STORE_SUPPLIER_PRODUCTS,
  STORE_TYRES_CHAT,
} from "./db";

/**
 * Known supplier brands, derived dynamically from real product data (the API
 * has no brand facet). Persisted in IndexedDB so the list stays stable and
 * grows as more products are seen across pages/sessions.
 */
export async function getKnownBrands(): Promise<string[]> {
  const list = await idbGetMeta<string[]>("brands:list").catch(() => null);
  return list ?? [];
}

/** Merge new brands into the persisted set; returns the sorted union. */
export async function addKnownBrands(brands: (string | undefined)[]): Promise<string[]> {
  const existing = await getKnownBrands();
  const set = new Set(existing);
  for (const b of brands) {
    const t = (b ?? "").trim();
    if (t) set.add(t);
  }
  const merged = Array.from(set).sort((a, b) => a.localeCompare(b));
  await idbSetMeta("brands:list", merged).catch(() => {});
  return merged;
}

import {
  fetchProductsGraphQL,
  fetchSupplierProductsGraphQL,
  fetchTyresChatGraphQL,
} from "./graphql";
import type {
  FetchProductsParams,
  FetchSupplierProductsParams,
  ProductsResponse,
  SupplierProductItem,
  SupplierProductsResponse,
  TyresChatItem,
  TyresChatQueryVars,
} from "./types";

interface CachedProductQuery extends SupplierProductsResponse {
  key: string;
  ts: number;
}

interface CachedStorefrontQuery extends ProductsResponse {
  key: string;
  ts: number;
}

interface ReadThroughCallbacks<T> {
  onFresh?: (data: T) => void;
  onError?: (err: Error) => void;
  /**
   * Freshness window in ms. If the cached entry is younger than this, it is
   * served as-is and NO background GraphQL request is made — the call becomes
   * fully offline (image URLs and all data come straight from IndexedDB).
   * Defaults to {@link CACHE_TTL_MS}. Pass `0` to force a refresh every time.
   */
  maxAgeMs?: number;
}

/**
 * Default freshness window. Within this age a cached query is served without
 * any network call, so revisiting a page/filter you've already loaded makes
 * zero GraphQL requests. A manual Sync (Header/Sidebar button) always bypasses
 * this — it calls the fetchers directly, not through the cache.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** True when a cache timestamp is within the freshness window. */
const isFresh = (ts: number | undefined, maxAgeMs: number): boolean =>
  typeof ts === "number" && maxAgeMs > 0 && Date.now() - ts < maxAgeMs;

/**
 * Supplier products, cache-first. The cache key is the query signature
 * (brand + size + page), so each filter/page combination is cached separately.
 * Returns the cached response (or null) synchronously-ish; fresh data arrives
 * via `onFresh`.
 */
export async function getProductsCached(
  params: FetchSupplierProductsParams,
  { onFresh, onError, maxAgeMs = CACHE_TTL_MS }: ReadThroughCallbacks<SupplierProductsResponse> = {},
): Promise<SupplierProductsResponse | null> {
  const key = JSON.stringify(params);
  const cached = await idbGet<CachedProductQuery>(STORE_PRODUCT_QUERIES, key).catch(() => null);

  // Fresh-enough cache → serve it and skip the GraphQL call entirely.
  if (cached && isFresh(cached.ts, maxAgeMs)) return cached;

  fetchSupplierProductsGraphQL(params)
    .then(async (res) => {
      await idbPut(STORE_PRODUCT_QUERIES, { key, ...res, ts: Date.now() }).catch((e) =>
        console.error("[cache] failed to write products to IndexedDB:", e),
      );
      await idbSetMeta("products:lastSync", Date.now()).catch(() => {});
      onFresh?.(res);
    })
    .catch((err) => {
      console.warn("[cache] products refresh failed — using cached data", err);
      onError?.(err instanceof Error ? err : new Error("Products request failed"));
    });

  return cached;
}

/**
 * Storefront products (default Magento `products` query), cache-first.
 *
 * Same read-through pattern as {@link getProductsCached} but backed by the
 * stock `products` field (priced, storefront-visible catalog with real
 * images) instead of the store-specific `supplierProducts` feed. Cache keys
 * are namespaced with a `storefront:` prefix so they never collide with
 * supplierProducts entries sharing the same object store.
 */
export async function getStorefrontProductsCached(
  params: FetchProductsParams,
  { onFresh, onError, maxAgeMs = CACHE_TTL_MS }: ReadThroughCallbacks<ProductsResponse> = {},
): Promise<ProductsResponse | null> {
  const key = "storefront:" + JSON.stringify(params);
  const cached = await idbGet<CachedStorefrontQuery>(STORE_PRODUCT_QUERIES, key).catch(() => null);

  // Fresh-enough cache → serve it (image URLs included) and skip GraphQL. This
  // is what makes revisiting a page load images with no network call at all.
  if (cached && isFresh(cached.ts, maxAgeMs)) return cached;

  fetchProductsGraphQL(params)
    .then(async (res) => {
      await idbPut(STORE_PRODUCT_QUERIES, { key, ...res, ts: Date.now() }).catch((e) =>
        console.error("[cache] failed to write storefront products to IndexedDB:", e),
      );
      await idbSetMeta("products:lastSync", Date.now()).catch(() => {});
      onFresh?.(res);
    })
    .catch((err) => {
      console.warn("[cache] storefront products refresh failed — using cached data", err);
      onError?.(err instanceof Error ? err : new Error("Products request failed"));
    });

  return cached;
}

/**
 * Storefront products, cache-first, **await-friendly** (returns the data
 * directly instead of via callbacks). Built for background batch loading, where
 * a loop fetches page 2, 3, … sequentially and appends each batch:
 *
 *   for (let p = 1; p <= totalPages; p++)
 *     const batch = await fetchStorefrontBatch({ ...params, currentPage: p });
 *
 * Fresh cache (within `maxAgeMs`) is returned with no network call. Otherwise
 * it fetches, writes the batch to IndexedDB (keyed per params like
 * {@link getStorefrontProductsCached}), and returns the fresh data. If the
 * fetch fails but a cached batch exists, the cached batch is returned rather
 * than throwing, so a flaky page never aborts the whole run.
 */
export async function fetchStorefrontBatch(
  params: FetchProductsParams,
  maxAgeMs = CACHE_TTL_MS,
): Promise<ProductsResponse> {
  const key = "storefront:" + JSON.stringify(params);
  const cached = await idbGet<CachedStorefrontQuery>(STORE_PRODUCT_QUERIES, key).catch(() => null);
  if (cached && isFresh(cached.ts, maxAgeMs)) return cached;

  try {
    const res = await fetchProductsGraphQL(params);
    await idbPut(STORE_PRODUCT_QUERIES, { key, ...res, ts: Date.now() }).catch((e) =>
      console.error("[cache] failed to write storefront batch to IndexedDB:", e),
    );
    await idbSetMeta("products:lastSync", Date.now()).catch(() => {});
    return res;
  } catch (err) {
    if (cached) return cached; // fall back to the (stale) cached batch
    throw err instanceof Error ? err : new Error("Products request failed");
  }
}

/**
 * TyresChat shortcuts, cache-first. Stored as a full list in the `tyresChat`
 * store. Returns the cached items (possibly empty) immediately.
 */
export async function getTyresChatCached(
  params: TyresChatQueryVars,
  { onFresh, onError, maxAgeMs = CACHE_TTL_MS }: ReadThroughCallbacks<TyresChatItem[]> = {},
): Promise<TyresChatItem[]> {
  // IndexedDB getAll() returns records in PRIMARY-KEY (id) order, NOT in the
  // API's sort_order. Re-order by sort_order so cached reads render in the same
  // sequence the API intends (prevents "stale-looking" order on the first paint).
  const bySortOrder = (a: TyresChatItem, b: TyresChatItem) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);

  const cachedRaw = await idbGetAll<TyresChatItem>(STORE_TYRES_CHAT).catch(() => []);
  const cached = [...cachedRaw].sort(bySortOrder);
  console.log("[tyresChat sync] IndexedDB records BEFORE sync:", cachedRaw.length);

  // Fresh-enough cache → serve it and skip the GraphQL call entirely. Freshness
  // is tracked via the `tyresChat:lastSync` meta (records have no per-row ts).
  const lastSync = await getTyresChatLastSyncTime().catch(() => 0);
  if (cached.length > 0 && isFresh(lastSync, maxAgeMs)) return cached;

  fetchTyresChatGraphQL(params)
    .then(async (res) => {
      if (res.items?.length) {
        console.log("[tyresChat sync] API records:", res.items.length);
        // Clear old records first, then insert the fresh API list (keyPath "id"
        // guarantees no duplicates). This replaces any stale cache entirely.
        await idbClear(STORE_TYRES_CHAT).catch(() => {});
        await idbPutAll(STORE_TYRES_CHAT, res.items).catch((e) =>
          console.error("[cache] failed to write tyresChat to IndexedDB:", e),
        );
        await idbSetMeta("tyresChat:lastSync", Date.now()).catch(() => {});
        const after = await idbGetAll<TyresChatItem>(STORE_TYRES_CHAT).catch(() => []);
        console.log("[tyresChat sync] IndexedDB records AFTER sync:", after.length);
        // Hand the fresh list to the UI in sort_order sequence.
        onFresh?.([...res.items].sort(bySortOrder));
      }
    })
    .catch((err) => {
      console.warn("[cache] tyresChat refresh failed — using cached data", err);
      onError?.(err instanceof Error ? err : new Error("TyresChat request failed"));
    });

  return cached;
}

/* ─────────────────────────────────────────────────────────────
   FULL supplier catalogue — MANUAL SYNC ONLY. The Sync button fetches
   EVERY supplier product (~318k, latest + historical), and the whole
   set is persisted as ONE IndexedDB record. After a sync, both "Latest"
   and "All Products" views, plus search/sort/filter/paginate, run 100%
   from this cache — no further API call until the next manual sync.

   pageSize note: supplierProducts caps `pageSize` at 100 upstream, so
   SUPPLIER_SYNC_BATCH_SIZE is clamped to 100 and pages are fetched with
   bounded concurrency to keep the ~3.2k-request sync tractable.
───────────────────────────────────────────────────────────── */

/** Configurable sync batch size. NOTE: supplierProducts hard-caps pageSize at
 *  100 upstream (a request for 500/1000 still returns only 100 rows), so this is
 *  clamped to 100 at call time and has no effect until the BACKEND raises the cap. */
export const SUPPLIER_SYNC_BATCH_SIZE = 500;
/** How many pages to fetch in parallel during a sync (keeps ~3.2k requests feasible). */
const SUPPLIER_SYNC_CONCURRENCY = 8;

/** Supplier item enriched with a digits-only size for normalized matching. */
export type CachedSupplierProduct = SupplierProductItem & { plain_size: string };

const supplierPlainSize = (s?: string) => String(s ?? "").replace(/\D/g, "");
const enrichSupplier = (p: SupplierProductItem): CachedSupplierProduct => ({
  ...p,
  plain_size: supplierPlainSize(p.size),
});

/**
 * Read the cached supplier catalogue from IndexedDB (empty array if none).
 * Records live one-per-product in the dedicated `supplierProducts` store
 * (keyPath "id"), so they are inherently unique — no read-time dedupe needed.
 */
export async function getCachedSupplierProducts(): Promise<CachedSupplierProduct[]> {
  return idbGetAll<CachedSupplierProduct>(STORE_SUPPLIER_PRODUCTS).catch(() => []);
}

/**
 * Sync the ENTIRE supplier catalogue (all ~318k rows, latest + historical) into
 * IndexedDB. No `is_latest` filter — the client filters "Latest" vs "All" later.
 * Pages are fetched in bounded-concurrency batches (pageSize clamped to the
 * upstream max of 100) and written PER PRODUCT into the dedicated
 * `supplierProducts` object store (keyPath "id"), so records are inherently
 * deduped by id (last write wins) and no giant in-memory array is held.
 * `onProgress` reports the running count. Called ONLY by the Sync button.
 */
export async function syncAllSupplierProducts({
  pageSize = SUPPLIER_SYNC_BATCH_SIZE,
  onProgress,
}: {
  pageSize?: number;
  onProgress?: (loaded: number, total: number) => void;
} = {}): Promise<CachedSupplierProduct[]> {
  const size = Math.min(pageSize, 100); // supplierProducts caps pageSize at 100
  // Page by a STABLE `id` sort so offset pagination is deterministic (the
  // default `price` sort has thousands of ties → duplicated/skipped rows).
  const sort = { sortField: "id", sortDirection: "ASC" as const };

  // Fresh full sync: wipe the store so removed products don't linger, then
  // stream each batch in. Dedup is handled by the store's keyPath "id".
  await idbClear(STORE_SUPPLIER_PRODUCTS).catch((e) =>
    console.error("[supplier-sync] idbClear FAILED:", e),
  );

  let written = 0; // rows successfully put (running progress count)
  // Persist one batch of rows straight into the per-product store. Skips rows
  // with no usable `id` key so a single bad row can't abort the transaction.
  const persistBatch = async (rows: SupplierProductItem[]) => {
    const enriched = rows
      .map(enrichSupplier)
      .filter((e) => e.id !== undefined && e.id !== null && e.id !== "");
    if (!enriched.length) return;
    try {
      await idbPutAll(STORE_SUPPLIER_PRODUCTS, enriched);
      written += enriched.length;
    } catch (e) {
      console.error("[supplier-sync] idbPutAll FAILED — batch NOT written:", e);
    }
  };

  console.log(`[supplier-sync] syncAllSupplierProducts() STARTED (pageSize=${size}, concurrency=${SUPPLIER_SYNC_CONCURRENCY})`);

  // Page 1 — establishes total_count / total_pages (NO is_latest → all products).
  const first = await fetchSupplierProductsGraphQL({ pageSize: size, currentPage: 1, ...sort });
  await persistBatch(first.items ?? []);
  const total = first.total_count ?? written;
  const totalPages = first.page_info?.total_pages ?? 1;
  console.log(`[supplier-sync] total_count=${total} totalPages=${totalPages} | page 1 fetched=${first.items?.length ?? 0} written=${written}`);
  onProgress?.(written, total);

  // Remaining pages — fetched in parallel chunks; each chunk is written as it
  // arrives so a long sync persists incrementally (survives interruption).
  for (let start = 2; start <= totalPages; start += SUPPLIER_SYNC_CONCURRENCY) {
    const pages: number[] = [];
    for (let pg = start; pg < start + SUPPLIER_SYNC_CONCURRENCY && pg <= totalPages; pg++) pages.push(pg);
    const results = await Promise.all(
      pages.map((pg) =>
        fetchSupplierProductsGraphQL({ pageSize: size, currentPage: pg, ...sort }).catch((err) => {
          console.warn(`[supplier-sync] page ${pg}/${totalPages} failed — skipping:`, err);
          return null;
        }),
      ),
    );
    const chunkItems: SupplierProductItem[] = [];
    for (const r of results) if (r?.items) chunkItems.push(...r.items);
    await persistBatch(chunkItems);
    onProgress?.(written, total);
    if (start % 500 < SUPPLIER_SYNC_CONCURRENCY) {
      console.log(`[supplier-sync] checkpoint @ page ~${start}: written ${written}/${total}`);
    }
  }

  await idbSetMeta("supplierAll:lastSync", Date.now());
  // Drop the legacy single-blob caches now that the per-product store is canonical.
  await idbDelete(STORE_PRODUCT_QUERIES, "supplier:all").catch(() => {});
  await idbDelete(STORE_PRODUCT_QUERIES, "supplier:latest:all").catch(() => {});

  // Read-back verification — never assume the writes persisted. If we fetched
  // rows but the store is empty, FAIL LOUDLY (so the UI shows "Sync failed"
  // instead of a false success) and surface the real cause in the log.
  const stored = await idbGetAll<CachedSupplierProduct>(STORE_SUPPLIER_PRODUCTS).catch(() => []);
  console.log(`[supplier-sync] COMPLETED. read-back: store="${STORE_SUPPLIER_PRODUCTS}" count=${stored.length} written=${written} total=${total}`);
  if (written > 0 && stored.length === 0) {
    throw new Error(`Supplier cache did not persist: wrote ${written} rows but store "${STORE_SUPPLIER_PRODUCTS}" is empty (idbPutAll failed — see console).`);
  }

  return stored;
}

/* NOTE: the supplier catalogue uses MANUAL sync only (IndexedDB-first). There is
   deliberately NO cache-first/stale-while-revalidate accessor here — the page
   reads getCachedSupplierProducts() on load and fetches ONLY via the Sync button
   (syncAllSupplierProducts). No TTL, no isFresh() gate, no background refresh. */

export async function syncSupplierProductsPage({
  pageSize = 50,
  currentPage = 1,
}: {
  pageSize?: number;
  currentPage?: number;
} = {}): Promise<CachedSupplierProduct[]> {
  const size = Math.min(pageSize, 100);
  const sort = { sortField: "id", sortDirection: "ASC" as const };
  const res = await fetchSupplierProductsGraphQL({ pageSize: size, currentPage, ...sort });
  const rows = res.items ?? [];
  const enriched = rows
    .map(enrichSupplier)
    .filter((e) => e.id !== undefined && e.id !== null && e.id !== "");
  if (enriched.length) {
    await idbPutAll(STORE_SUPPLIER_PRODUCTS, enriched);
  }
  await idbSetMeta("supplierPage:lastSync", Date.now());
  const stored = await idbGetAll<CachedSupplierProduct>(STORE_SUPPLIER_PRODUCTS).catch(() => []);
  return stored;
}

export async function isSupplierProductsRecentlySynced(maxAgeMs = 30000): Promise<boolean> {
  const lastSync = await getSupplierAllLastSyncTime();
  if (!lastSync) return false;
  return Date.now() - lastSync < maxAgeMs;
}

export async function getSupplierAllLastSyncTime(): Promise<number> {
  const ts = await idbGetMeta<number>("supplierAll:lastSync").catch(() => null);
  return ts ?? 0;
}

export async function getProductsLastSyncTime(): Promise<number> {
  const ts = await idbGetMeta<number>("products:lastSync").catch(() => null);
  return ts ?? 0;
}

export async function isProductsRecentlySynced(maxAgeMs = 30000): Promise<boolean> {
  const lastSync = await getProductsLastSyncTime();
  if (!lastSync) return false;
  return Date.now() - lastSync < maxAgeMs;
}

export async function getTyresChatLastSyncTime(): Promise<number> {
  const ts = await idbGetMeta<number>("tyresChat:lastSync").catch(() => null);
  return ts ?? 0;
}

export async function isTyresChatRecentlySynced(maxAgeMs = 30000): Promise<boolean> {
  const lastSync = await getTyresChatLastSyncTime();
  if (!lastSync) return false;
  return Date.now() - lastSync < maxAgeMs;
}
