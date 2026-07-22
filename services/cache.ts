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
  idbPutAll,
  idbSetMeta,
  idbGetMeta,
  STORE_PRODUCT_QUERIES,
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
