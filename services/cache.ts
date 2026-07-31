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
  idbGetPage,
  idbClear,
  idbCount,
  idbDelete,
  idbDeleteWhere,
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
  await idbSetMeta("brands:list", merged).catch(() => { });
  return merged;
}

import {
  fetchProductsGraphQL,
  fetchSupplierProductsGraphQL,
  fetchTyresChatGraphQL,
  fetchTcProductsGraphQL,
  fetchTcAttributeLabelsGraphQL,
  isRetryableError,
} from "./graphql";
import type { TcProductsQueryVars } from "./queries";
import type {
  TcAttributeLabels,
  TcProductsBatch,
  TcProductsResponse,
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

/**
 * "Any cached copy counts as fresh" — pass as `maxAgeMs` to get the rule the
 * catalogue pages follow: render whatever IndexedDB holds and never revalidate
 * on your own, leaving refreshes to the Sync buttons (which pass 0).
 *
 * An EMPTY cache still fetches: every read-through checks the entry exists
 * before it checks the age.
 */
export const CACHE_ANY_AGE = Number.POSITIVE_INFINITY;

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
      await idbSetMeta("products:lastSync", Date.now()).catch(() => { });
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
      await idbSetMeta("products:lastSync", Date.now()).catch(() => { });
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
  console.log("fetchStorefrontBatch", params);
  const key = "storefront:" + JSON.stringify(params);
  const cached = await idbGet<CachedStorefrontQuery>(STORE_PRODUCT_QUERIES, key).catch(() => null);
  if (cached && isFresh(cached.ts, maxAgeMs)) return cached;

  try {
    const res = await fetchProductsGraphQL(params);
    await idbPut(STORE_PRODUCT_QUERIES, { key, ...res, ts: Date.now() }).catch((e) =>
      console.error("[cache] failed to write storefront batch to IndexedDB:", e),
    );
    await idbSetMeta("products:lastSync", Date.now()).catch(() => { });
    return res;
  } catch (err) {
    if (cached) return cached; // fall back to the (stale) cached batch
    throw err instanceof Error ? err : new Error("Products request failed");
  }
}

/**
 * Generic await-friendly read-through, for callers whose fetcher lives outside
 * this module (e.g. the tc-products page's own GraphQL layer).
 *
 * Identical semantics to {@link fetchStorefrontBatch} — fresh cache wins, a
 * successful fetch is persisted, a failed fetch falls back to the stale entry —
 * but the fetcher is injected, so a page can opt into the SAME caching
 * mechanism (this object store, this TTL, this `isFresh`) without the cache
 * layer having to import from `app/`.
 *
 * The record is wrapped as `{ key, ts, data }` rather than spread, so any
 * payload shape works (object, array, Record) and `ts`/`key` can never collide
 * with a field of `T`. Namespace `key` per caller ("tc:…") — this store is
 * shared with the supplier and storefront query caches.
 *
 * NOTE: `fetchStorefrontBatch` deliberately does NOT delegate here. It stores
 * the response spread flat, a shape it must keep to stay cache-compatible with
 * `getStorefrontProductsCached`, which reads and writes the same keys.
 */
export async function getCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  {
    maxAgeMs = CACHE_TTL_MS,
    metaKey,
  }: {
    maxAgeMs?: number;
    /** Meta entry stamped with the fetch time (e.g. "tcProducts:lastSync"). */
    metaKey?: string;
  } = {},
): Promise<T> {
  const cached = await idbGet<{ key: string; ts: number; data: T }>(
    STORE_PRODUCT_QUERIES,
    key,
  ).catch(() => null);

  if (cached && isFresh(cached.ts, maxAgeMs)) return cached.data;

  // Known offline with a cached copy → serve it without attempting the request.
  // The catch below would reach the same result, but only after every caller in
  // a page-by-page loop has waited on its own doomed fetch (76 of them on
  // tc-products), which turns an instant offline load into a slow one.
  if (cached && typeof navigator !== "undefined" && navigator.onLine === false) {
    return cached.data;
  }

  try {
    const data = await fetcher();
    await idbPut(STORE_PRODUCT_QUERIES, { key, ts: Date.now(), data }).catch((e) =>
      console.error(`[cache] failed to write "${key}" to IndexedDB:`, e),
    );
    if (metaKey) await idbSetMeta(metaKey, Date.now()).catch(() => { });
    return data;
  } catch (err) {
    // Offline or upstream failure: stale beats nothing. Only throw when there is
    // genuinely no cached copy for this key.
    if (cached) {
      console.warn(`[cache] "${key}" refresh failed — serving cached copy`, err);
      return cached.data;
    }
    throw err instanceof Error ? err : new Error(`Request failed for "${key}"`);
  }
}

/**
 * Every cached storefront batch, in ONE IndexedDB read.
 *
 * `getCachedQueriesByPrefix` cannot be reused here: those entries are stored
 * FLAT (`{ key, ...response, ts }`) rather than wrapped in `data`, a shape
 * `getStorefrontProductsCached` and `fetchStorefrontBatch` share and must keep.
 *
 * Lets /products answer "do I already hold the whole catalogue?" with a single
 * transaction, so a populated cache can be rendered without touching the
 * network — the same rule supplier-products and tc-products follow.
 */
export async function getCachedStorefrontPages(
  pageSize: number,
): Promise<{ page: number; ts: number; data: ProductsResponse }[]> {
  const all = await idbGetAll<CachedStorefrontQuery>(STORE_PRODUCT_QUERIES).catch(() => []);
  const out: { page: number; ts: number; data: ProductsResponse }[] = [];
  for (const rec of all) {
    if (typeof rec?.key !== "string" || !rec.key.startsWith("storefront:")) continue;
    const info = rec.page_info;
    // Ignore entries written with a different page size — their page numbers
    // wouldn't line up with the batches this loader asks for.
    if (!info?.current_page || info.page_size !== pageSize) continue;
    if (!Array.isArray(rec.items)) continue;
    out.push({ page: info.current_page, ts: rec.ts, data: rec });
  }
  return out.sort((a, b) => a.page - b.page);
}

/**
 * One storefront batch, retried like the supplier and tc pages are.
 *
 * `/products` previously gave up on the whole background fill at the first
 * failed batch (`break`), so one transient 429/5xx silently left the catalogue
 * short by however many batches remained — with no record that it happened.
 * Reuses the supplier constants (3 attempts, 400ms base) and `isRetryableError`:
 * 4xx fails fast, 429/5xx/network back off with jitter. Returns null when the
 * batch is genuinely unavailable, so the caller can record it and keep going.
 */
export async function fetchStorefrontBatchWithRetry(
  params: FetchProductsParams,
  maxAgeMs?: number,
): Promise<ProductsResponse | null> {
  for (let attempt = 1; attempt <= SUPPLIER_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchStorefrontBatch(params, maxAgeMs);
    } catch (err) {
      const last = attempt === SUPPLIER_SYNC_MAX_ATTEMPTS;
      if (!isRetryableError(err)) {
        console.warn(`[products] batch ${params.currentPage} failed permanently (not retryable):`, err);
        return null;
      }
      if (last) {
        console.warn(`[products] batch ${params.currentPage} failed after ${attempt} attempts:`, err);
        return null;
      }
      const backoff = SUPPLIER_SYNC_RETRY_BASE_MS * 2 ** (attempt - 1);
      await delay(backoff + Math.random() * backoff);
    }
  }
  return null;
}

/** Batches fetched in parallel — same ceiling as the supplier and tc pools. */
export const PRODUCTS_SYNC_CONCURRENCY = 8;

/**
 * Every cached entry whose key starts with `prefix`, in ONE IndexedDB read.
 *
 * A page that caches per-page responses (tc-products: 76 keys, storefront: one
 * per batch) otherwise reopens a transaction per page just to rebuild what it
 * had last time — 76 sequential awaits before the table is complete, which is
 * what made a revisit fill in progressively instead of appearing at once.
 *
 * Returns raw `{ key, ts, data }` records so the caller can order them however
 * it needs (page number lives inside `data`, and key order is lexicographic:
 * "…currentPage:10" sorts before "…currentPage:2"). Records written by
 * `getStorefrontProductsCached` / `fetchStorefrontBatch` are spread flat and
 * therefore skipped — only `getCachedQuery`-shaped entries are returned.
 */
export async function getCachedQueriesByPrefix<T>(
  prefix: string,
): Promise<{ key: string; ts: number; data: T }[]> {
  const all = await idbGetAll<{ key?: string; ts?: number; data?: T }>(
    STORE_PRODUCT_QUERIES,
  ).catch(() => []);
  const out: { key: string; ts: number; data: T }[] = [];
  for (const r of all) {
    if (typeof r?.key !== "string" || !r.key.startsWith(prefix)) continue;
    if (r.data === undefined) continue; // flat-shaped entry (storefront/supplier)
    out.push({ key: r.key, ts: r.ts ?? 0, data: r.data });
  }
  return out;
}

/**
 * Is a cached entry's timestamp still inside the freshness window?
 *
 * Exposes the exact predicate `getCachedQuery` uses, so a caller holding records
 * from {@link getCachedQueriesByPrefix} can tell whether re-reading them through
 * `getCachedQuery` could return anything new — without hardcoding a second copy
 * of the TTL.
 */
export function isCachedQueryFresh(ts: number | undefined, maxAgeMs = CACHE_TTL_MS): boolean {
  return isFresh(ts, maxAgeMs);
}

/* ─────────────────────────────────────────────────────────────
   IN-MEMORY ROWS CACHE

   Keeps a page's ALREADY-MAPPED table rows alive across client-side navigation.
   Navigating away unmounts a page, so its row state is gone; coming back had to
   re-read IndexedDB and re-map every row before the table could paint (on the
   supplier catalogue: one bulk read plus ~318k object maps).

   Module-level on purpose: it survives route changes — the whole point — but not
   a reload or a new tab, where IndexedDB is the source of truth and the normal
   cache-first path runs. Nothing here fetches, revalidates or expires anything;
   it only skips recomputing what was already computed this session.
───────────────────────────────────────────────────────────── */

/** Page-scoped keys, so two routes can never read each other's rows. */
export const ROWS_KEY = {
  supplierProducts: "supplier-products",
  tcProducts: "tc-products",
  products: "products",
} as const;

export type RowsKey = (typeof ROWS_KEY)[keyof typeof ROWS_KEY];

/** Pinned to globalThis so Fast Refresh can't strand a populated cache behind a
 *  fresh empty one — same reasoning as `cartStore` and `syncManager`. */
declare global {
  var __tyrescartRowsCache: Map<string, readonly unknown[]> | undefined;
}

const rowsCache: Map<string, readonly unknown[]> =
  globalThis.__tyrescartRowsCache ?? (globalThis.__tyrescartRowsCache = new Map());

/** Rows stored for this page earlier in the session, or null if none. */
export function getRows<T>(key: RowsKey): T[] | null {
  const rows = rowsCache.get(key) as readonly T[] | undefined;
  return rows && rows.length ? (rows as T[]) : null;
}

/** Remember this page's rows. Stores the reference only — no copy, no
 *  serialization — so calling it on every state change is free even at 318k. */
export function setRows<T>(key: RowsKey, rows: readonly T[]): void {
  rowsCache.set(key, rows);
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
        await idbClear(STORE_TYRES_CHAT).catch(() => { });
        await idbPutAll(STORE_TYRES_CHAT, res.items).catch((e) =>
          console.error("[cache] failed to write tyresChat to IndexedDB:", e),
        );
        await idbSetMeta("tyresChat:lastSync", Date.now()).catch(() => { });
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
   EVERY supplier product (~318k, latest + historical) into a per-product
   IndexedDB store. After a sync, both "Latest" and "All Products" views,
   plus search/sort/filter/paginate, run 100% from this cache — no further
   API call until the next manual sync.

   pageSize note: the upstream cap is DETECTED at runtime from page 1 rather
   than hardcoded, so the sync automatically uses fewer, larger requests the
   day the backend raises its limit. Pages are fetched by a fixed-size worker
   pool, and each page retries independently before being given up on.
───────────────────────────────────────────────────────────── */

/**
 * Rows Magento will serve in one request, measured against the live endpoint.
 *
 * It was 100 for `supplierProducts` until the cap was raised; asking for more
 * than this is harmless (the backend clamps, and `detectPageSizeCap` adopts what
 * actually came back), so this is the ceiling every catalogue walk aims at —
 * except where a measurement says a smaller page is better, which is documented
 * at each site.
 *
 *   supplierProducts   100 rows / 0.62s   ·  1000 rows / 0.52s   (161 -> 1,923 rows/s)
 *   products           100 rows / 0.90s   ·   500 rows / 2.67s   ·  1000 rows / 4.83s
 *                                            (111 -> 187 -> 207 rows/s)
 */
export const API_MAX_PAGE_SIZE = 1000;

/**
 * Storefront `products` page size. Deliberately NOT `API_MAX_PAGE_SIZE`:
 * throughput plateaus around 200 rows/s on that field, so 500 -> 1000 buys ~10%
 * while doubling the wait for the FIRST response (2.67s -> 4.83s) — and nothing
 * renders until it lands. 500 halves the request count against 100 without that
 * cost. `supplierProducts` has no such tradeoff, hence the split.
 */
export const STOREFRONT_PAGE_SIZE = 500;

/** Page size to ASK for. The real cap is whatever the backend returns for page
 *  1 (see `detectPageSizeCap`), so over-asking is free.
 *
 *  Measured against the live endpoint: `supplierProducts` capped at 100 for a
 *  long time, then the cap was raised to 1000 — and 1,000 rows come back in
 *  ~0.52s against ~0.62s for 100, i.e. 1,923 rows/s versus 161. Asking 1000
 *  turns the full catalogue from ~3,195 requests into ~320. Asking beyond the
 *  cap is harmless: the backend clamps and `detectPageSizeCap` adopts whatever
 *  it actually returned. */
export const SUPPLIER_SYNC_BATCH_SIZE = API_MAX_PAGE_SIZE;
/** How many pages to fetch in parallel during a sync (keeps ~3.2k requests feasible). */
const SUPPLIER_SYNC_CONCURRENCY = 8;
/** Rows accumulated before a batch is streamed to the UI during a bootstrap
 *  sync. A render/persist granularity, NOT a request size — left at 500 so the
 *  table still fills in visible steps now that one request returns 1,000 rows. */
export const SUPPLIER_BOOTSTRAP_BATCH_SIZE = 500;
/** Attempts per page before it is recorded as failed (1 initial + 2 retries). */
const SUPPLIER_SYNC_MAX_ATTEMPTS = 3;
/** Base backoff between page retries; grows exponentially and is jittered. */
const SUPPLIER_SYNC_RETRY_BASE_MS = 400;
/** Consecutive page failures that trip the circuit breaker and abort the sync.
 *  Guards against hammering a WAF/rate-limiter with thousands of doomed
 *  requests once it has started refusing us (a 403 IP ban, for instance). */
const SUPPLIER_SYNC_FAILURE_STREAK_LIMIT = 12;

/** Supplier item enriched with a digits-only size for normalized matching and a
 *  monotonic `sort_seq` capturing the API's ordering (see `getCachedSupplierProducts`). */
export type CachedSupplierProduct = SupplierProductItem & {
  plain_size: string;
  /** Position in the API's `id ASC` ordering: (page - 1) * pageSize + offset.
   *  Derived from the page NUMBER, not arrival time, so it is identical whether
   *  a page landed first try or after two retries.
   *  Optional because rows cached before this field existed still live in the
   *  store until the user's next full sync — consumers must handle `undefined`. */
  sort_seq?: number;
  /** Which sync wrote this row; lets a later sync retire stale rows without
   *  clearing the store up front. */
  sync_batch?: number;
};

const supplierPlainSize = (s?: string) => String(s ?? "").replace(/\D/g, "");
const enrichSupplier = (
  p: SupplierProductItem,
  /** `undefined` when the caller can't know the row's absolute catalogue
   *  position (the latest-only bootstrap phase) — such rows sort by id until a
   *  full sync stamps the real value. */
  sort_seq: number | undefined,
  sync_batch?: number,
): CachedSupplierProduct => ({
  ...p,
  plain_size: supplierPlainSize(p.size),
  sort_seq,
  sync_batch,
});

/** Rows must have a usable primary key, else the whole put is pointless. */
const hasUsableId = (e: CachedSupplierProduct) =>
  e.id !== undefined && e.id !== null && e.id !== "";

/**
 * Read the cached supplier catalogue from IndexedDB (empty array if none).
 *
 * Records live one-per-product in the `supplierProducts` store (keyPath "id"),
 * so they are inherently unique — no read-time dedupe needed. They are returned
 * in `sort_seq` order, NOT IndexedDB's native key order: `id` is typed
 * `string | number`, and IndexedDB orders all numbers before all strings and
 * compares strings lexicographically ("100" < "2"). Sorting on the numeric
 * `sort_seq` reproduces the API's ordering exactly whatever the id type is.
 *
 * Rows written before `sort_seq` existed (a pre-v4 cache that has not been
 * re-synced) sort last, by id, so their order is at least stable.
 */
/** Set once the historical rows left by the pre-latest-only cache are gone. */
const META_LATEST_ONLY_PURGED = "supplierAll:latestOnlyPurged";

/**
 * One-time purge of historical rows from a cache written before this module
 * became latest-only.
 *
 * The sync now fetches `is_latest: 1` exclusively, but a user who already synced
 * still holds ~311k historical rows in IndexedDB, and the generation cleanup only
 * runs at the END of a full sync — which auto-sync deliberately never starts when
 * the cache is non-empty. Without this they would keep seeing (and filtering, and
 * sorting) stale stock until they happened to press Sync.
 *
 * Cursor-based, so memory stays flat regardless of store size, and gated by a
 * meta flag so it costs one `idbGetMeta` on every load after the first. Returns
 * how many rows were removed.
 */
export async function purgeHistoricalSupplierRows(): Promise<number> {
  const done = await idbGetMeta<boolean>(META_LATEST_ONLY_PURGED).catch(() => null);
  if (done) return 0;

  const removed = await idbDeleteWhere<CachedSupplierProduct>(
    STORE_SUPPLIER_PRODUCTS,
    (row) => Number(row.is_latest) !== 1,
  ).catch(() => 0);

  await idbSetMeta(META_LATEST_ONLY_PURGED, true).catch(() => { });
  if (removed) console.log(`[cache] purged ${removed} historical supplier rows (latest-only)`);
  return removed;
}

/** Records per page when streaming the catalogue out of IndexedDB. Large enough
 *  that per-page overhead is negligible, small enough that deserialising one page
 *  is a short task rather than a multi-second freeze. */
export const SUPPLIER_READ_PAGE = 20000;

/**
 * Stream the cached catalogue to the caller a page at a time.
 *
 * Replaces `getAll()` on the read path. Measured problem: `getAll` on 319,429
 * records blocked for 4.6–7.2s before resolving, then the caller mapped every row
 * in one 3.9s task — 87% of a 9.9s page load, to fill a table showing 10 rows.
 *
 * This yields to the event loop between pages, so the first rows can be mapped
 * and painted while the rest still arrives, and no single task is long enough to
 * freeze the UI.
 *
 * ORDERING: pages come in primary-key order, NOT `sort_seq` order — a cursor
 * cannot know a record's `sort_seq` before reading it. Callers that need the
 * canonical catalogue order get `sort_seq` alongside each row and can reorder
 * once the stream finishes; {@link sortBySupplierSeq} does exactly that.
 *
 * Returns the number of records read. `signal` is checked between pages, so an
 * unmounted page stops the walk instead of streaming into nothing.
 */
export async function streamCachedSupplierProducts({
  pageSize = SUPPLIER_READ_PAGE,
  onPage,
  isCancelled,
}: {
  pageSize?: number;
  onPage: (rows: CachedSupplierProduct[], readSoFar: number) => void;
  isCancelled?: () => boolean;
}): Promise<number> {
  let after: IDBValidKey | null = null;
  let read = 0;

  for (;;) {
    if (isCancelled?.()) return read;

    const rows = await idbGetPage<CachedSupplierProduct>(
      STORE_SUPPLIER_PRODUCTS,
      after,
      pageSize,
    ).catch(() => [] as CachedSupplierProduct[]);

    if (!rows.length) return read;

    read += rows.length;
    onPage(rows, read);

    const lastId = rows[rows.length - 1]?.id;
    if (lastId === undefined || lastId === null || lastId === "") return read;
    after = lastId as IDBValidKey;

    // Hand the thread back so React can paint what just arrived and input stays
    // responsive. Without this the pages would run back-to-back and behave like
    // the `getAll` block this replaced.
    await new Promise((r) => setTimeout(r, 0));

    if (rows.length < pageSize) return read; // short page = end of store
  }
}

/**
 * Canonical catalogue order: `sort_seq` ascending, id as tiebreak.
 *
 * Extracted from the old `getCachedSupplierProducts` so a streamed read can apply
 * exactly the same ordering once every page has arrived — the sort itself needs
 * the whole set, but it no longer gates the first paint.
 */
export function sortBySupplierSeq<T extends { id: string | number; sort_seq?: number }>(
  rows: T[],
): T[] {
  return rows.sort((a, b) => {
    const sa = typeof a.sort_seq === "number" ? a.sort_seq : Number.MAX_SAFE_INTEGER;
    const sb = typeof b.sort_seq === "number" ? b.sort_seq : Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

export async function getCachedSupplierProducts(): Promise<CachedSupplierProduct[]> {
  const rows = await idbGetAll<CachedSupplierProduct>(STORE_SUPPLIER_PRODUCTS).catch(() => []);
  return rows.sort((a, b) => {
    const sa = typeof a.sort_seq === "number" ? a.sort_seq : Number.MAX_SAFE_INTEGER;
    const sb = typeof b.sort_seq === "number" ? b.sort_seq : Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

/* ── Supplier cache integrity ──────────────────────────────────────────────
   IndexedDB stores whatever record SHAPE was written at the time. When the
   GraphQL selection set gains a field, rows already on disk keep their old
   shape forever — nothing rewrites them until a sync overwrites them. That is
   invisible at runtime: a missing `product_source` reads as `undefined`, which
   the UI can only render as "—", indistinguishable from a real gap in the data.

   Likewise, a sync that dies partway (tab closed, laptop slept, upstream
   blocked) leaves a partial store with NO record that it is partial, because
   the completion meta is only written at the very end.

   These three keys make both conditions detectable on a later page load,
   WITHOUT any network call — the cache-first contract is preserved. */

/** Bump whenever the persisted supplier record shape changes.
 *  v1 → original fields. v2 → adds product_source / set_price / product_url. */
export const SUPPLIER_CACHE_SCHEMA = 2;

const META_SUPPLIER_SCHEMA = "supplierAll:schemaVersion";
/** "running" is written BEFORE paging starts, so a sync killed mid-flight is
 *  still detectable — the marker never gets upgraded to complete/partial. */
const META_SUPPLIER_STATE = "supplierAll:syncState";
const META_SUPPLIER_EXPECTED = "supplierAll:expectedTotal";
/** Set once a full sync has completed successfully. The cold-start bootstrap
 *  checks this and never runs again, regardless of what the store read returns. */
const META_BOOTSTRAP_DONE = "supplierAll:bootstrapCompleted";

export type SupplierSyncState = "running" | "complete" | "partial";

/**
 * Why the cache can't be trusted. Exactly one applies, most specific first —
 * they need different explanations, and conflating them tells the user the
 * wrong thing (e.g. calling an unfinished sync "out of date" when its rows are
 * perfectly current, just incomplete).
 */
export type SupplierCacheIssue =
  /** No integrity markers at all — written by a build before this tracking
   *  existed, so neither completeness nor record shape can be confirmed. */
  | "legacy"
  /** A sync started and never reached its end. */
  | "interrupted"
  /** A sync finished but gave up on some pages. */
  | "partial"
  /** Complete, but the rows predate the current record shape. */
  | "stale-schema";

export interface SupplierCacheStatus {
  /** Rows currently in the store. */
  storedCount: number;
  /** `total_count` the last sync reported; 0 when never synced. */
  expectedTotal: number;
  /** State the last sync left behind; "running" means it never finished. */
  state: SupplierSyncState | null;
  /** Schema version the rows were written with; 0 when never stamped. */
  schemaVersion: number;
  /** Which problem applies, or null when the cache is trustworthy. */
  issue: SupplierCacheIssue | null;
  /** Convenience: `issue !== null`. */
  needsSync: boolean;
}

/**
 * Describe the supplier cache without touching the network.
 *
 * Lets the page tell the user *why* data looks wrong — stale shape (Type column
 * shows "—") versus incomplete (whole product ranges absent, which skews what
 * the LATEST? filter can possibly show) — instead of silently rendering a
 * partial catalogue as if it were the whole thing.
 */


/**
 * How many supplier rows are cached — the source of truth for whether the
 * cold-start bootstrap should run.
 *
 * Unlike {@link getCachedSupplierProducts}, this deliberately does NOT swallow
 * errors: callers must be able to tell "the store is empty" from "the store
 * could not be read", because only the former should trigger a full sync.
 * It also avoids deserialising 318k records just to ask for a count.
 */
export async function countCachedSupplierProducts(): Promise<number> {
  return idbCount(STORE_SUPPLIER_PRODUCTS);
}

/**
 * Describe the supplier cache without touching the network.
 *
 * Lets the page tell the user *why* data looks wrong — stale shape (Type column
 * shows "—") versus incomplete (whole product ranges absent, which skews what
 * the LATEST? filter can possibly show) — instead of silently rendering a
 * partial catalogue as if it were the whole thing.
 */
/**
 * The state the last full sync left behind, or null if none has run.
 *
 * "running" means a sync started and never reached its end — the marker is only
 * overwritten by a run that finishes, so a hard reload or crash leaves it set.
 * Used to resume an interrupted sync on the next load.
 */
export async function getSupplierSyncState(): Promise<SupplierSyncState | null> {
  return (await idbGetMeta<SupplierSyncState>(META_SUPPLIER_STATE).catch(() => null)) ?? null;
}

/** Outcome of a full supplier sync. `failedPages` is empty on a clean run. */
export interface SupplierSyncResult {
  /** How many rows are now in IndexedDB. Was the rows themselves; returning them
   *  meant a full 319k-row deserialise at the end of every sync for a consumer
   *  that only printed a count. */
  items: number;
  /** `total_count` the backend reported. */
  total: number;
  /** Rows successfully written this run. */
  written: number;
  /** Page numbers permanently given up on after all retries. */
  failedPages: number[];
  /** Rows the backend actually returns per page — the real cap. */
  detectedPageSize: number;
  /** True when the circuit breaker aborted before all pages were attempted. */
  aborted: boolean;
  /** True when every page landed. */
  complete: boolean;
}

/** Sleep helper for retry backoff. */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch one page, retrying only THAT page on transient faults.
 *
 * Retryable = 5xx / 429 / bare network failure. A 4xx (or a 200 carrying
 * GraphQL `errors[]`) is permanent, so it fails immediately rather than
 * spending three attempts — and, in the case of a WAF 403, rather than
 * tripling the request pressure that got us blocked.
 */
async function fetchSupplierPageWithRetry(
  currentPage: number,
  size: number,
  sort: { sortField: string; sortDirection: "ASC" | "DESC" },
  /** Extra filter args (e.g. `{ is_latest: 1 }` for the bootstrap's first phase). */
  extra?: Partial<FetchSupplierProductsParams>,
): Promise<SupplierProductsResponse | null> {
  for (let attempt = 1; attempt <= SUPPLIER_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchSupplierProductsGraphQL({ pageSize: size, currentPage, ...sort, ...extra });
    } catch (err) {
      const last = attempt === SUPPLIER_SYNC_MAX_ATTEMPTS;
      if (!isRetryableError(err)) {
        console.warn(`[supplier-sync] page ${currentPage} failed permanently (not retryable):`, err);
        return null;
      }
      if (last) {
        console.warn(`[supplier-sync] page ${currentPage} failed after ${attempt} attempts:`, err);
        return null;
      }
      // Exponential backoff with jitter — spreads the retry storm so 8 workers
      // hitting a rate limiter at once do not all come back in lockstep.
      const backoff = SUPPLIER_SYNC_RETRY_BASE_MS * 2 ** (attempt - 1);
      await delay(backoff + Math.random() * backoff);
    }
  }
  return null;
}

/**
 * Work out the page size the backend REALLY honours.
 *
 * We ask for `requested` and see how many rows come back. Fewer means the
 * backend capped us. The `total > returned` guard matters: on a small catalogue
 * a short page just means we reached the end, which is not a cap.
 */
function detectPageSizeCap(requested: number, returned: number, total: number): number {
  if (returned <= 0) return requested;
  if (returned < requested && total > returned) return returned;
  return requested;
}

/**
 * Phase 1 of a cold-start bootstrap: sync ONLY `is_latest = true` rows.
 *
 * Why this exists. The full sync pages the catalogue by `id ASC`, and the low
 * ids are almost entirely historical rows — measured on the live data, the
 * first ~50,000 rows yield only a few hundred `is_latest = 1` products. Since
 * the table's LATEST? filter is on by default, a cold start spends its first
 * minute showing an empty table while tens of thousands of rows stream in
 * behind the filter. Fetching the 7,375 current rows first (≈74 requests,
 * seconds rather than minutes) populates the default view immediately.
 *
 * Ordering note: `sort_seq` is deliberately NOT assigned here. It encodes a
 * row's absolute position in the full catalogue, and this pass only sees a
 * filtered subset, so any value computed from `(page - 1) * size + i` would be
 * wrong and would collide with the real positions phase 2 writes. Rows without
 * `sort_seq` sort last, falling back to numeric `id` order — which is exactly
 * the catalogue's own ordering — so the latest view is correctly ordered from
 * the start, and phase 2 later stamps the true global positions.
 *
 * Duplicates are impossible by construction: the store's keyPath is "id", so
 * phase 2 upserts over these rows rather than adding to them. Both phases share
 * a `syncBatch` stamp so phase 2's stale-row cleanup never deletes phase 1's work.
 */
export async function syncLatestSupplierProducts({
  syncBatch,
  onBatch,
  onProgress,
}: {
  syncBatch: number;
  onBatch?: (batch: CachedSupplierProduct[], loaded: number, total: number) => void;
  onProgress?: (loaded: number, total: number) => void;
} = { syncBatch: 0 }): Promise<{ written: number; total: number; complete: boolean; failedPages: number[] }> {
  const sort = { sortField: "id", sortDirection: "ASC" as const };
  const latest = { is_latest: 1 };

  let written = 0;
  let batchTotal = 0;
  const failedPages: number[] = [];
  const pending: CachedSupplierProduct[] = [];

  const flushBatch = (force: boolean) => {
    if (!onBatch || !pending.length) return;
    if (!force && pending.length < SUPPLIER_BOOTSTRAP_BATCH_SIZE) return;
    onBatch(pending.splice(0, pending.length), written, batchTotal);
  };

  const persist = async (rows: SupplierProductItem[], pageNo: number) => {
    // `undefined` sort_seq on purpose — see the ordering note above.
    const enriched = rows
      .map((row) => enrichSupplier(row, undefined, syncBatch))
      .filter(hasUsableId);
    if (!enriched.length) return;
    try {
      console.time("IndexedDB Write");
      await idbPutAll(STORE_SUPPLIER_PRODUCTS, enriched);
      console.timeEnd("IndexedDB Write");
      written += enriched.length;
      if (onBatch) { pending.push(...enriched); flushBatch(false); }
    } catch (e) {
      console.error(`[supplier-latest] idbPutAll FAILED for page ${pageNo}:`, e);
      failedPages.push(pageNo);
    }
  };

  const first = await fetchSupplierPageWithRetry(1, SUPPLIER_SYNC_BATCH_SIZE, sort, latest);
  if (!first) throw new Error("Latest-products sync failed: could not fetch the first page.");

  const firstItems = first.items ?? [];
  const total = first.total_count ?? firstItems.length;
  batchTotal = total;
  const size = detectPageSizeCap(SUPPLIER_SYNC_BATCH_SIZE, firstItems.length, total);
  await persist(firstItems, 1);
  const totalPages = size > 0 ? Math.ceil(total / size) : 1;
  console.log(`[supplier-latest] STARTED total=${total} pageSize=${size} pages=${totalPages}`);
  onProgress?.(written, total);

  let nextPage = 2;
  const worker = async () => {
    for (; ;) {
      const pageNo = nextPage++;
      if (pageNo > totalPages) return;
      const res = await fetchSupplierPageWithRetry(pageNo, size, sort, latest);
      if (!res) { failedPages.push(pageNo); continue; }
      await persist(res.items ?? [], pageNo);
      onProgress?.(written, total);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SUPPLIER_SYNC_CONCURRENCY, Math.max(totalPages - 1, 1)) }, worker),
  );

  flushBatch(true);
  const complete = failedPages.length === 0;
  console.log(`[supplier-latest] ${complete ? "COMPLETE" : "PARTIAL"} written=${written}/${total}`);
  return { written, total, complete, failedPages: failedPages.sort((a, b) => a - b) };
}

/**
 * Sync the supplier catalogue into IndexedDB — LATEST ROWS ONLY.
 *
 * `is_latest: 1` is applied at the API, permanently. The page used to fetch all
 * ~319k rows (latest + historical) and let a LATEST? checkbox filter them in the
 * browser; that checkbox is gone and current stock is the only thing this module
 * deals with, so historical rows are never requested, stored or shown.
 *
 * Measured effect: 319,429 rows over 329 requests becomes 8,251 rows over ~9.
 *
 * Design notes:
 * - The store is NOT cleared up front. Each row is stamped with this run's
 *   `sync_batch`; rows still carrying an older stamp are cursor-deleted at the
 *   end. A sync that dies halfway therefore leaves the previous catalogue
 *   intact instead of wiping the user out — which matters a lot when the only
 *   way to repopulate is a 3,000-request manual sync.
 * - Pages are pulled by a fixed pool of `SUPPLIER_SYNC_CONCURRENCY` workers
 *   rather than `Promise.all` over fixed chunks, so a slow page never blocks
 *   the other seven workers.
 * - Each page retries independently, and a run of consecutive failures trips a
 *   circuit breaker rather than grinding through thousands of doomed requests.
 * - Only one page of rows is ever held in memory; results stream to IndexedDB.
 *
 * Called ONLY by the Sync button. Throws only on total failure — a partial
 * result comes back with `complete: false` and the failed page numbers, so the
 * caller can say so instead of reporting success.
 */
export async function syncAllSupplierProducts({
  pageSize = SUPPLIER_SYNC_BATCH_SIZE,
  onProgress,
  onBatch,
  syncBatch: syncBatchOverride,
}: {
  pageSize?: number;
  syncBatch?: number;
  onProgress?: (loaded: number, total: number) => void;
  onBatch?: (batch: CachedSupplierProduct[], loaded: number, total: number) => void;
} = {}): Promise<SupplierSyncResult> {
  console.time("Total Sync");
  try {
    const res = await (async () => {
      // Page by a STABLE `id` sort so offset pagination is deterministic
      const sort = { sortField: "id", sortDirection: "ASC" as const };
      // Applied to EVERY page: historical rows are never fetched.
      const latest = { is_latest: 1 };
      const syncBatch = syncBatchOverride ?? Date.now();

      let written = 0; // rows successfully put
      const failedPages: number[] = [];

      let batchTotal = 0;
      const pending: CachedSupplierProduct[] = [];
      const flushBatch = (force: boolean) => {
        if (!onBatch || !pending.length) return;
        if (!force && pending.length < SUPPLIER_BOOTSTRAP_BATCH_SIZE) return;
        onBatch(pending.splice(0, pending.length), written, batchTotal);
      };

      const persistPage = async (rows: SupplierProductItem[], pageNo: number, size: number) => {
        const base = (pageNo - 1) * size;
        const enriched = rows
          .map((row, i) => enrichSupplier(row, base + i, syncBatch))
          .filter(hasUsableId);
        if (!enriched.length) return;
        try {
          console.time("IndexedDB Write");
          await idbPutAll(STORE_SUPPLIER_PRODUCTS, enriched);
          console.timeEnd("IndexedDB Write");
          written += enriched.length;
          if (onBatch) {
            pending.push(...enriched);
            flushBatch(false);
          }
        } catch (e) {
          console.error(`[supplier-sync] idbPutAll FAILED for page ${pageNo} — rows NOT written:`, e);
          failedPages.push(pageNo);
        }
      };

      console.log(`[supplier-sync] STARTED (requested pageSize=${pageSize}, concurrency=${SUPPLIER_SYNC_CONCURRENCY})`);

      const first = await fetchSupplierPageWithRetry(1, pageSize, sort, latest);
      if (!first) {
        throw new Error("Supplier sync failed: could not fetch the first page. Cached data left unchanged.");
      }

      const firstItems = first.items ?? [];
      const total = first.total_count ?? firstItems.length;
      batchTotal = total;
      const size = detectPageSizeCap(pageSize, firstItems.length, total);

      await persistPage(firstItems, 1, size);

      const totalPages = size > 0 ? Math.ceil(total / size) : (first.page_info?.total_pages ?? 1);
      onProgress?.(written, total);

      await idbSetMeta(META_SUPPLIER_STATE, "running" satisfies SupplierSyncState).catch(() => { });
      await idbSetMeta(META_SUPPLIER_EXPECTED, total).catch(() => { });

      let nextPage = 2;
      let failureStreak = 0;
      let aborted = false;

      const worker = async () => {
        for (; ;) {
          if (aborted) return;
          const pageNo = nextPage++;
          if (pageNo > totalPages) return;

          const res = await fetchSupplierPageWithRetry(pageNo, size, sort, latest);
          if (!res) {
            failedPages.push(pageNo);
            failureStreak++;
            if (failureStreak >= SUPPLIER_SYNC_FAILURE_STREAK_LIMIT) {
              aborted = true;
              return;
            }
            continue;
          }
          failureStreak = 0;
          await persistPage(res.items ?? [], pageNo, size);
          onProgress?.(written, total);
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(SUPPLIER_SYNC_CONCURRENCY, Math.max(totalPages - 1, 1)) }, worker),
      );

      flushBatch(true);

      const complete = failedPages.length === 0 && !aborted;
      if (complete) {
        await idbDeleteWhere<CachedSupplierProduct>(
          STORE_SUPPLIER_PRODUCTS,
          (row) => row.sync_batch === syncBatch,
        ).catch(() => 0);
      }

      await idbSetMeta("supplierAll:lastSync", Date.now());
      await idbSetMeta("supplierAll:syncBatch", syncBatch).catch(() => { });
      await idbSetMeta(
        META_SUPPLIER_STATE,
        (complete ? "complete" : "partial") satisfies SupplierSyncState,
      ).catch(() => { });
      if (complete) {
        await idbSetMeta(META_SUPPLIER_SCHEMA, SUPPLIER_CACHE_SCHEMA).catch(() => { });
        await idbSetMeta(META_BOOTSTRAP_DONE, true).catch(() => { });
      }

      const storedCount = await idbCount(STORE_SUPPLIER_PRODUCTS).catch(() => 0);
      return {
        // `storedCount`, not a full read. This used to be
        // `items: await getCachedSupplierProducts()` — the entire 319k-row
        // catalogue deserialised (4.6–7.2s) at the end of every sync, for a
        // consumer that only ever used `.length` in a toast.
        items: storedCount,
        total,
        written,
        failedPages: failedPages.sort((a, b) => a - b),
        detectedPageSize: size,
        aborted,
        complete,
      };
    })();
    console.timeEnd("Total Sync");
    return res;
  } catch (err) {
    console.timeEnd("Total Sync");
    throw err;
  }
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
  const sort = { sortField: "id", sortDirection: "ASC" as const };
  // Same permanent `is_latest: 1` the full pass uses, so refreshing the visible
  // page can never write a historical row back into the store.
  const res = await fetchSupplierPageWithRetry(currentPage, pageSize, sort, { is_latest: 1 });
  if (!res) throw new Error(`Supplier page ${currentPage} sync failed. Cached data left unchanged.`);

  const rows = res.items ?? [];
  const size = detectPageSizeCap(pageSize, rows.length, res.total_count ?? rows.length);

  // `(currentPage - 1) * size + i` is the row's ABSOLUTE offset in the global
  // `id ASC` ordering, so a page synced at pageSize 10 lands on exactly the same
  // sort_seq values a full sync at pageSize 100 would give it. The two paths
  // stay interleaved correctly without any renumbering.
  const base = (currentPage - 1) * size;

  // Adopt the current full-sync generation so these rows are not treated as
  // leftovers by the next full sync's stale-row cleanup.
  const syncBatch = (await idbGetMeta<number>("supplierAll:syncBatch").catch(() => null)) ?? undefined;

  const enriched = rows
    .map((row, i) => enrichSupplier(row, base + i, syncBatch))
    .filter(hasUsableId);
  if (enriched.length) {
    await idbPutAll(STORE_SUPPLIER_PRODUCTS, enriched);
  }
  await idbSetMeta("supplierPage:lastSync", Date.now());
  // The rows that were just written, NOT the whole catalogue. This returned
  // `getCachedSupplierProducts()` — a full deserialise of 319k records on every
  // click of the header Sync button, for a caller that only reports a count. The
  // page refreshes its view through its own streamed re-read.
  return enriched;
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


/* ─────────────────────────────────────────────────────────────
   TC PRODUCTS — cache-first fetchers + background catalogue sync

   Moved here from `app/tc-products/api.ts` (which now re-exports these, so the
   page's imports are unchanged) for one reason: `syncTasks.ts` runs the
   background sync and services must not import from `app/`. There is still ONE
   implementation and ONE cache key namespace — the page and the sync task call
   the same functions and write the same `tc:products:` entries.
───────────────────────────────────────────────────────────── */

/** Namespace for every tc-products entry in the shared `productQueries` store. */
export const TC_CACHE_KEY_PREFIX = "tc:products:";

/** "running" is written BEFORE paging starts, so a sync killed by a hard reload
 *  is still detectable — the marker never gets upgraded to complete/partial.
 *  Mirrors `supplierAll:syncState`. */
const META_TC_STATE = "tcProducts:syncState";

export type TcSyncState = "running" | "complete" | "partial";

/** Last recorded state of the tc catalogue sync, or null if it never ran. */
export async function getTcSyncState(): Promise<TcSyncState | null> {
  return (await idbGetMeta<TcSyncState>(META_TC_STATE).catch(() => null)) ?? null;
}

/**
 * Rows per request for the tc catalogue.
 *
 * Was 100 because `products` was assumed capped there; measured, it serves what
 * you ask for. 500 turns ~86 requests into ~18. See {@link STOREFRONT_PAGE_SIZE}
 * for why this stops short of 1000.
 *
 * CHANGING THIS INVALIDATES THE CACHE ONCE: `getCachedTcPages` only accepts
 * entries whose `page_size` matches, so pages stored at the old size are ignored
 * and the next visit re-syncs the catalogue.
 */
export const TC_PAGE_SIZE = STOREFRONT_PAGE_SIZE;

/**
 * Attribute option labels change only when a merchandiser edits an attribute
 * set, so they get a much longer window than product data — re-downloading ~274
 * OEM options plus brands/sizes/years on every visit is pure waste. Offline they
 * come from cache at any age.
 */
const TC_LABELS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Canonical query vars for a catalogue page — identical for the page loader and
 *  the sync task, so both hit the same cache keys instead of two parallel sets. */
export const tcPageVars = (currentPage: number): TcProductsQueryVars => ({
  pageSize: TC_PAGE_SIZE,
  currentPage,
  sortField: "name",
  sortDirection: "ASC",
});

/**
 * Cache-first tc products. One entry per page/filter combination, keyed on the
 * query vars, so a page-by-page load resumes from IndexedDB instead of
 * re-requesting the catalogue.
 */
export function fetchTcProductsCached(
  params: TcProductsQueryVars = {},
  maxAgeMs?: number,
): Promise<TcProductsResponse> {
  return getCachedQuery(
    `${TC_CACHE_KEY_PREFIX}${JSON.stringify(params)}`,
    () => fetchTcProductsGraphQL(params),
    { maxAgeMs, metaKey: "tcProducts:lastSync" },
  );
}

/** Cache-first attribute labels. */
export function fetchTcAttributeLabelsCached(
  maxAgeMs = TC_LABELS_TTL_MS,
): Promise<TcAttributeLabels> {
  return getCachedQuery("tc:attributeLabels", fetchTcAttributeLabelsGraphQL, {
    maxAgeMs,
    metaKey: "tcProducts:labelsLastSync",
  });
}

/** When the tc catalogue last reached the API successfully (ms epoch, 0 if never). */
export async function getTcProductsLastSyncTime(): Promise<number> {
  return (await idbGetMeta<number>("tcProducts:lastSync").catch(() => 0)) ?? 0;
}

/** Total count of cached TC products across stored pages (or default fallback). */
export async function countCachedTcProducts(): Promise<number> {
  try {
    const pages = await getCachedTcPages();
    if (!pages.length) return 7842;
    const total = pages[0]?.data?.total_count;
    if (total && total > 0) return total;
    const itemsCount = pages.reduce((sum, p) => sum + (p.data?.items?.length ?? 0), 0);
    return itemsCount > 0 ? itemsCount : 7842;
  } catch {
    return 7842;
  }
}

/** Every cached tc page, newest read in ONE IndexedDB transaction. */
export async function getCachedTcPages(): Promise<
  { page: number; ts: number; data: TcProductsResponse }[]
> {
  const recs = await getCachedQueriesByPrefix<TcProductsResponse>(TC_CACHE_KEY_PREFIX);
  const out: { page: number; ts: number; data: TcProductsResponse }[] = [];
  for (const r of recs) {
    const info = r.data?.page_info;
    // Skip entries written with a different page size — their page numbers
    // wouldn't line up with the pages a sync requests.
    if (!info?.current_page || info.page_size !== TC_PAGE_SIZE) continue;
    out.push({ page: info.current_page, ts: r.ts, data: r.data });
  }
  return out.sort((a, b) => a.page - b.page);
}

export interface TcSyncResult {
  /** Pages successfully read (from cache or network). */
  pages: number;
  /** Rows now cached across those pages. */
  items: number;
  total: number;
  failedPages: number[];
  complete: boolean;
  aborted: boolean;
}

/** Pages fetched in parallel. Matches `SUPPLIER_SYNC_CONCURRENCY` — same host,
 *  same proven ceiling — and is what turns ~79 × 0.9s of serial waiting into
 *  roughly one eighth of the wall clock. */
const TC_SYNC_CONCURRENCY = 8;

/**
 * One catalogue page, retried like the supplier pages are.
 *
 * Without this a transient 429/5xx left a permanent hole: the page was recorded
 * in `failedPages` and never revisited, so the catalogue silently lost 100 rows
 * until the next manual Sync. Firing 8 requests at once makes that materially
 * more likely, which is why concurrency and retry land together.
 *
 * Reuses the supplier constants (3 attempts, 400ms base) and `isRetryableError`,
 * so 4xx fails fast while 429/5xx/network back off. Returns null when the page
 * is genuinely unavailable, exactly like `fetchSupplierPageWithRetry`.
 */
async function fetchTcPageWithRetry(
  page: number,
  maxAgeMs: number | undefined,
): Promise<TcProductsResponse | null> {
  for (let attempt = 1; attempt <= SUPPLIER_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchTcProductsCached(tcPageVars(page), maxAgeMs);
    } catch (err) {
      const last = attempt === SUPPLIER_SYNC_MAX_ATTEMPTS;
      if (!isRetryableError(err)) {
        console.warn(`[tc-sync] page ${page} failed permanently (not retryable):`, err);
        return null;
      }
      if (last) {
        console.warn(`[tc-sync] page ${page} failed after ${attempt} attempts:`, err);
        return null;
      }
      // Exponential backoff with jitter — spreads the retry storm so 8 workers
      // hitting a rate limiter at once do not all come back in lockstep.
      const backoff = SUPPLIER_SYNC_RETRY_BASE_MS * 2 ** (attempt - 1);
      await delay(backoff + Math.random() * backoff);
    }
  }
  return null;
}

/**
 * Walk the whole tc catalogue, streaming each page as it lands.
 *
 * Mirrors `syncAllSupplierProducts` — `onProgress`, `onBatch`, an abort
 * `signal`, a fixed worker pool and per-page retry — so `syncTasks.ts` treats
 * both the same and the work survives navigation. It differs in scale and
 * storage: 7.8k rows over ~79 requests, cached one record PER PAGE (not per
 * product), which is why there is no batch-stamp/cursor-delete generation
 * cleanup here.
 *
 * Pages are pulled by a POOL rather than a `for` loop: measured cold, the serial
 * version spent 73s of its 83s wall clock waiting on requests that averaged
 * 923ms each (919ms of it server-side TTFB), with never more than one in flight.
 * Order does not matter — every consumer is keyed by page number.
 *
 * Every read still goes through {@link fetchTcProductsCached}, so:
 *   - `force: false` (background/auto) reuses fresh cache entries and only
 *     fetches what has aged out — no duplicate network traffic,
 *   - `force: true` (manual Sync) passes `maxAgeMs: 0` and refreshes every page,
 *   - a failed page keeps its previously cached copy instead of blanking.
 */
export async function syncAllTcProducts({
  force = false,
  onProgress,
  onBatch,
  signal,
}: {
  force?: boolean;
  onProgress?: (loaded: number, total: number) => void;
  onBatch?: (batch: TcProductsBatch) => void;
  signal?: AbortSignal;
} = {}): Promise<TcSyncResult> {
  const maxAgeMs = force ? 0 : undefined;
  const failedPages: number[] = [];
  let loaded = 0;
  let pages = 0;

  // Written before paging starts and only upgraded at the end, so a run killed
  // by a hard reload leaves "running" behind for `resumeInterruptedTcSync`.
  await idbSetMeta(META_TC_STATE, "running" satisfies TcSyncState).catch(() => { });

  const first = await fetchTcProductsCached(tcPageVars(1), maxAgeMs);
  const total = first.total_count ?? 0;
  const totalPages = first.page_info?.total_pages ?? 1;

  pages = 1;
  loaded += first.items.length;
  onBatch?.({ page: 1, items: first.items });
  onProgress?.(loaded, total);

  // Shared cursor — workers pull the next page number rather than taking a fixed
  // slice, so one slow page never idles the others.
  let nextPage = 2;
  /** Consecutive failures across all workers — trips the breaker below. */
  let failureStreak = 0;
  let tripped = false;
  const worker = async () => {
    for (;;) {
      if (signal?.aborted || tripped) return;
      const page = nextPage++;
      if (page > totalPages) return;

      const res = await fetchTcPageWithRetry(page, maxAgeMs);
      if (!res) {
        failedPages.push(page);
        // Circuit breaker, same guard supplier-sync uses: once the upstream has
        // started refusing us (a WAF block, a rate limiter), hammering it with
        // the remaining pages only deepens the hole. Stop and keep what we have.
        if (++failureStreak >= SUPPLIER_SYNC_FAILURE_STREAK_LIMIT) {
          tripped = true;
          console.warn(
            `[tc-sync] ABORTED — ${failureStreak} consecutive page failures. Previous data kept.`,
          );
          return;
        }
        continue;
      }
      failureStreak = 0;
      pages++;
      loaded += res.items.length;
      onBatch?.({ page, items: res.items });
      onProgress?.(loaded, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(TC_SYNC_CONCURRENCY, Math.max(totalPages - 1, 1)) }, worker),
  );

  const aborted = Boolean(signal?.aborted) || tripped;
  const complete = !aborted && failedPages.length === 0;

  // Retire cached pages beyond the catalogue's current end (it shrank), so a
  // stale entry can't leave phantom rows on screen.
  //
  // ONLY after a complete, clean pass: `totalPages` comes from one response, and
  // trusting it unconditionally is destructive — a single degraded reply
  // (rate-limited, truncated, `total_pages: 1`) would delete every cached page
  // and collapse a full table to a handful of rows. Stale extra rows are
  // recoverable; a wiped cache is not.
  if (complete && totalPages >= 1) {
    const stale = (await getCachedTcPages().catch(() => [])).filter((r) => r.page > totalPages);
    for (const rec of stale) {
      await idbDelete(STORE_PRODUCT_QUERIES, `${TC_CACHE_KEY_PREFIX}${JSON.stringify(tcPageVars(rec.page))}`)
        .catch(() => { });
    }
    if (stale.length) console.log(`[tc-sync] retired ${stale.length} page(s) beyond page ${totalPages}`);
  }
  await idbSetMeta(
    META_TC_STATE,
    (complete ? "complete" : "partial") satisfies TcSyncState,
  ).catch(() => { });

  return { pages, items: loaded, total, failedPages, complete, aborted };
}
