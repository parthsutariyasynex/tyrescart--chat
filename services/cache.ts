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

import { fetchSupplierProductsGraphQL, fetchTyresChatGraphQL } from "./graphql";
import type {
  FetchSupplierProductsParams,
  SupplierProductsResponse,
  TyresChatItem,
  TyresChatQueryVars,
} from "./types";

interface CachedProductQuery extends SupplierProductsResponse {
  key: string;
  ts: number;
}

interface ReadThroughCallbacks<T> {
  onFresh?: (data: T) => void;
  onError?: (err: Error) => void;
}

/**
 * Supplier products, cache-first. The cache key is the query signature
 * (brand + size + page), so each filter/page combination is cached separately.
 * Returns the cached response (or null) synchronously-ish; fresh data arrives
 * via `onFresh`.
 */
export async function getProductsCached(
  params: FetchSupplierProductsParams,
  { onFresh, onError }: ReadThroughCallbacks<SupplierProductsResponse> = {},
): Promise<SupplierProductsResponse | null> {
  const key = JSON.stringify(params);
  const cached = await idbGet<CachedProductQuery>(STORE_PRODUCT_QUERIES, key).catch(() => null);

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
 * TyresChat shortcuts, cache-first. Stored as a full list in the `tyresChat`
 * store. Returns the cached items (possibly empty) immediately.
 */
export async function getTyresChatCached(
  params: TyresChatQueryVars,
  { onFresh, onError }: ReadThroughCallbacks<TyresChatItem[]> = {},
): Promise<TyresChatItem[]> {
  const cached = await idbGetAll<TyresChatItem>(STORE_TYRES_CHAT).catch(() => []);

  fetchTyresChatGraphQL(params)
    .then(async (res) => {
      if (res.items?.length) {
        // Replace the list so removed items don't linger.
        await idbClear(STORE_TYRES_CHAT).catch(() => {});
        await idbPutAll(STORE_TYRES_CHAT, res.items).catch((e) =>
          console.error("[cache] failed to write tyresChat to IndexedDB:", e),
        );
        await idbSetMeta("tyresChat:lastSync", Date.now()).catch(() => {});
        onFresh?.(res.items);
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
