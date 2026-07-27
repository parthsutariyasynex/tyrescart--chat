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
  isRetryableError,
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

/** Page size to ASK for. The real cap is whatever the backend returns for page
 *  1 (see `detectPageSizeCap`) — historically 100, so requesting more is free
 *  and costs nothing if the cap stays put. */
export const SUPPLIER_SYNC_BATCH_SIZE = 500;
/** How many pages to fetch in parallel during a sync (keeps ~3.2k requests feasible). */
const SUPPLIER_SYNC_CONCURRENCY = 8;
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
  sort_seq: number,
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
export async function getCachedSupplierProducts(): Promise<CachedSupplierProduct[]> {
  const rows = await idbGetAll<CachedSupplierProduct>(STORE_SUPPLIER_PRODUCTS).catch(() => []);
  return rows.sort((a, b) => {
    const sa = typeof a.sort_seq === "number" ? a.sort_seq : Number.MAX_SAFE_INTEGER;
    const sb = typeof b.sort_seq === "number" ? b.sort_seq : Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

/** Outcome of a full supplier sync. `failedPages` is empty on a clean run. */
export interface SupplierSyncResult {
  /** Rows now in IndexedDB (the whole catalogue), in API order. */
  items: CachedSupplierProduct[];
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
): Promise<SupplierProductsResponse | null> {
  for (let attempt = 1; attempt <= SUPPLIER_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchSupplierProductsGraphQL({ pageSize: size, currentPage, ...sort });
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
 * Sync the ENTIRE supplier catalogue (all ~318k rows, latest + historical) into
 * IndexedDB. No `is_latest` filter — the client filters "Latest" vs "All" later.
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
}: {
  pageSize?: number;
  onProgress?: (loaded: number, total: number) => void;
} = {}): Promise<SupplierSyncResult> {
  // Page by a STABLE `id` sort so offset pagination is deterministic (the
  // default `price` sort has thousands of ties → duplicated/skipped rows).
  const sort = { sortField: "id", sortDirection: "ASC" as const };
  const syncBatch = Date.now();

  let written = 0; // rows successfully put (running progress count)
  const failedPages: number[] = [];

  // Persist one page of rows straight into the per-product store, stamping each
  // with its position in the API ordering. Rows with no usable `id` are skipped
  // — they could never be keyed, and IndexedDB would reject them anyway.
  const persistPage = async (rows: SupplierProductItem[], pageNo: number, size: number) => {
    const base = (pageNo - 1) * size;
    const enriched = rows
      .map((row, i) => enrichSupplier(row, base + i, syncBatch))
      .filter(hasUsableId);
    if (!enriched.length) return;
    try {
      await idbPutAll(STORE_SUPPLIER_PRODUCTS, enriched);
      written += enriched.length;
    } catch (e) {
      console.error(`[supplier-sync] idbPutAll FAILED for page ${pageNo} — rows NOT written:`, e);
      failedPages.push(pageNo);
    }
  };

  console.log(`[supplier-sync] STARTED (requested pageSize=${pageSize}, concurrency=${SUPPLIER_SYNC_CONCURRENCY})`);

  // ── Page 1: establishes total_count, page count, and the REAL page size ──
  const first = await fetchSupplierPageWithRetry(1, pageSize, sort);
  if (!first) {
    // Nothing at all came back — the old cache is still intact because we never
    // cleared it, so fail loudly and leave the user their previous catalogue.
    throw new Error("Supplier sync failed: could not fetch the first page. Cached data left unchanged.");
  }

  const firstItems = first.items ?? [];
  const total = first.total_count ?? firstItems.length;
  const size = detectPageSizeCap(pageSize, firstItems.length, total);
  if (size !== pageSize) {
    console.log(`[supplier-sync] backend capped pageSize ${pageSize} → ${size}`);
  }

  await persistPage(firstItems, 1, size);

  // Derive the page count from the size the backend ACTUALLY honoured.
  // `page_info.total_pages` is computed with the backend's own page size, so it
  // only agrees with ours when no capping happened — recomputing is safer.
  const totalPages = size > 0 ? Math.ceil(total / size) : (first.page_info?.total_pages ?? 1);
  console.log(`[supplier-sync] total_count=${total} pageSize=${size} totalPages=${totalPages} | page 1 written=${written}`);
  onProgress?.(written, total);

  // ── Remaining pages: worker pool over a shared page cursor ──
  // No per-chunk barrier — each worker takes the next page the moment it frees
  // up, so one slow request cannot stall the other workers.
  let nextPage = 2;
  let failureStreak = 0;
  let aborted = false;

  const worker = async () => {
    for (;;) {
      if (aborted) return;
      const pageNo = nextPage++;
      if (pageNo > totalPages) return;

      const res = await fetchSupplierPageWithRetry(pageNo, size, sort);
      if (!res) {
        failedPages.push(pageNo);
        failureStreak++;
        if (failureStreak >= SUPPLIER_SYNC_FAILURE_STREAK_LIMIT) {
          aborted = true;
          console.error(
            `[supplier-sync] ABORTED — ${failureStreak} consecutive page failures. ` +
            `Upstream looks unavailable or is rate-limiting us; not sending the remaining requests.`,
          );
          return;
        }
        continue;
      }
      failureStreak = 0;
      await persistPage(res.items ?? [], pageNo, size);
      onProgress?.(written, total);

      if (pageNo % 500 === 0) {
        console.log(`[supplier-sync] checkpoint @ page ${pageNo}/${totalPages}: written ${written}/${total}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SUPPLIER_SYNC_CONCURRENCY, Math.max(totalPages - 1, 1)) }, worker),
  );

  // ── Retire rows from previous syncs ──
  // Only safe on a CLEAN run: after a partial sync the rows we failed to
  // re-fetch are still valid cached data, and deleting them would turn a
  // recoverable gap into permanent loss.
  const complete = failedPages.length === 0 && !aborted;
  if (complete) {
    const removed = await idbDeleteWhere<CachedSupplierProduct>(
      STORE_SUPPLIER_PRODUCTS,
      (row) => row.sync_batch === syncBatch,
    ).catch((e) => {
      console.warn("[supplier-sync] stale-row cleanup failed (harmless, rows keep old stamps):", e);
      return 0;
    });
    if (removed) console.log(`[supplier-sync] retired ${removed} stale rows from earlier syncs`);
  } else {
    console.warn(
      `[supplier-sync] partial run — keeping rows from earlier syncs (${failedPages.length} pages missing)`,
    );
  }

  await idbSetMeta("supplierAll:lastSync", Date.now());
  // Publish this run's stamp so a later per-page sync can adopt the same
  // generation instead of writing rows the next cleanup would consider stale.
  await idbSetMeta("supplierAll:syncBatch", syncBatch).catch(() => { });
  // Drop the legacy single-blob caches now that the per-product store is canonical.
  await idbDelete(STORE_PRODUCT_QUERIES, "supplier:all").catch(() => { });
  await idbDelete(STORE_PRODUCT_QUERIES, "supplier:latest:all").catch(() => { });

  // Read-back verification — never assume the writes persisted. `idbCount` is
  // used instead of reading every row so the check itself stays cheap.
  const storedCount = await idbCount(STORE_SUPPLIER_PRODUCTS).catch(() => 0);
  console.log(
    `[supplier-sync] ${complete ? "COMPLETED" : "PARTIAL"}. read-back count=${storedCount} ` +
    `written=${written} total=${total} failedPages=${failedPages.length} aborted=${aborted}`,
  );
  if (written > 0 && storedCount === 0) {
    throw new Error(`Supplier cache did not persist: wrote ${written} rows but store "${STORE_SUPPLIER_PRODUCTS}" is empty (idbPutAll failed — see console).`);
  }

  return {
    items: await getCachedSupplierProducts(),
    total,
    written,
    failedPages: failedPages.sort((a, b) => a - b),
    detectedPageSize: size,
    aborted,
    complete,
  };
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
  const res = await fetchSupplierPageWithRetry(currentPage, pageSize, sort);
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
  return getCachedSupplierProducts();
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
