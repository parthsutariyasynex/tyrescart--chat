/**
 * Centralized sync orchestration (no UI, no React).
 *
 * Two entry points are used by the UI via the `useSync` hook:
 *   - syncPage(pathname) → refresh ONLY the module for the current route
 *   - syncAll()          → refresh every module (full application sync)
 *
 * Neither reloads the browser, calls router.refresh(), nor redirects. They only
 * re-run data fetches:
 *   - For a mounted page that registered a live refresher, we call it so the
 *     on-screen React state updates in place.
 *   - For modules with no mounted page, we refresh their IndexedDB cache at the
 *     data layer, so the data is fresh the next time the user navigates there.
 */
import {
  STOREFRONT_PAGE_SIZE,
  syncAllSupplierProducts,
  getStorefrontProductsCached,
  getTyresChatCached,
  isProductsRecentlySynced,
  isTyresChatRecentlySynced,
  isSupplierProductsRecentlySynced,
} from "./cache";
import type { ProductsResponse, TyresChatItem } from "./types";
import { fetchTyresChatGraphQL } from "./graphql";

export type SyncModule = "products" | "orders" | "customers" | "tyresChat" | "supplierProducts";

/* ── Route → module map (longest matching prefix wins) ── */
const ROUTE_MODULES: { prefix: string; module: SyncModule }[] = [
  { prefix: "/supplier-products", module: "supplierProducts" },
  { prefix: "/products", module: "products" },
  { prefix: "/dashboard/orders", module: "orders" },
  { prefix: "/dashboard/customers", module: "customers" },
  { prefix: "/tyreschat", module: "tyresChat" },
  { prefix: "/dashboard", module: "products" },
];

export function moduleForPath(pathname: string | null | undefined): SyncModule | null {
  if (!pathname) return null;
  const match = ROUTE_MODULES
    .filter((r) => pathname.startsWith(r.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ? match.module : null;
}

/* ── Live refresher registry ──
   Mounted pages register a callback that re-fetches their own data and updates
   their React state. Keyed by module; a Set supports multiple mounts and clean
   unregistration on unmount. */
type Refresher = () => Promise<void> | void;
const registry = new Map<SyncModule, Set<Refresher>>();

/** Register a page's live refresher. Returns an unregister function. */
export function registerModuleSync(mod: SyncModule, fn: Refresher): () => void {
  let set = registry.get(mod);
  if (!set) {
    set = new Set();
    registry.set(mod, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

/* ── Data-layer module sync ──
   Refreshes a module's IndexedDB cache even when its page isn't mounted. */
function runCached(
  start: (cbs: { onFresh: () => void; onError: (e: Error) => void }) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    start({ onFresh: done, onError: done });
    // Safety net: never hang the sync spinner if no callback fires.
    setTimeout(done, 10000);
  });
}

/** What a module sync actually managed to load. */
export interface ModuleSyncOutcome {
  /** false when at least one page failed or fewer rows landed than the API reports. */
  complete: boolean;
  synced: number;
  total: number;
  failedPages: number[];
}

/** Nothing to page — the module either has no paging loop or ran a mounted
 *  page's own refresher, both of which are all-or-nothing. */
const WHOLE: ModuleSyncOutcome = { complete: true, synced: 0, total: 0, failedPages: [] };

/**
 * One page of storefront products, resolved with the FRESH response.
 *
 * `getStorefrontProductsCached` is callback-shaped — it returns any stale entry
 * immediately and delivers the network result through `onFresh` — so a paging
 * loop has to await the callback rather than the returned promise. Same
 * function, same cache key scheme, same IndexedDB writes as before; this only
 * adapts it to something a loop can sequence. `maxAgeMs: 0` keeps the existing
 * "an explicit sync always hits GraphQL" rule.
 */
function fetchProductsPage(currentPage: number, pageSize: number): Promise<ProductsResponse | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res: ProductsResponse | null) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    void getStorefrontProductsCached(
      { search: "", pageSize, currentPage, sortField: "name", sortDirection: "ASC" },
      { maxAgeMs: 0, onFresh: (res) => done(res), onError: () => done(null) },
    );
    // Same safety net as `runCached`, per page rather than per sync.
    setTimeout(() => done(null), 30000);
  });
}

/**
 * Sync EVERY storefront product, not just the first page.
 *
 * This used to be a single `pageSize: 24, currentPage: 1` request that reported
 * success — 24 of 8,524 rows. Page 1 establishes `total_count`, then the
 * remaining pages are fetched in order. A page that fails is recorded and the
 * pass continues, so one bad page cannot discard the rest; the outcome then
 * reports `complete: false` so the task is not marked fully synced.
 *
 * `STOREFRONT_PAGE_SIZE` (500) is the measured optimum for this endpoint —
 * throughput plateaus around 200 rows/s, so a larger page just delays the first
 * response.
 */
async function syncAllStorefrontProducts(): Promise<ModuleSyncOutcome> {
  const pageSize = STOREFRONT_PAGE_SIZE;
  const failedPages: number[] = [];

  const first = await fetchProductsPage(1, pageSize);
  if (!first) return { complete: false, synced: 0, total: 0, failedPages: [1] };

  const total = first.total_count ?? 0;
  let synced = first.items?.length ?? 0;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;

  for (let page = 2; page <= totalPages; page++) {
    const res = await fetchProductsPage(page, pageSize);
    if (!res) {
      failedPages.push(page);
      continue;
    }
    synced += res.items?.length ?? 0;
  }

  return { complete: failedPages.length === 0 && synced >= total, synced, total, failedPages };
}

/**
 * Sync EVERY chat shortcut, sized from the API's own `total_count`.
 *
 * This used to be a fixed `pageSize: 200` request that reported success
 * unconditionally — fine while the dataset is 84 rows, silently truncating the
 * moment it passes 200, with nothing to surface it.
 *
 * Deliberately ONE request sized to `total_count` rather than a page loop:
 * `getTyresChatCached` clears the store and rewrites it on every call, so
 * looping pages through it would wipe each previous page and leave only the
 * last. Sizing the single request keeps that atomic replace intact — a failed
 * sync cannot leave the cache half-populated — while still being driven by
 * `total_count` instead of a hardcoded guess.
 */
async function syncAllTyresChat(): Promise<ModuleSyncOutcome> {
  // Cheap count probe; `items` is discarded.
  const head = await fetchTyresChatGraphQL({ pageSize: 1 }).catch(() => null);
  if (!head) return { complete: false, synced: 0, total: 0, failedPages: [1] };

  const total = head.total_count ?? 0;
  if (total === 0) return { complete: true, synced: 0, total: 0, failedPages: [] };

  const items = await new Promise<TyresChatItem[] | null>((resolve) => {
    let settled = false;
    const done = (v: TyresChatItem[] | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    void getTyresChatCached(
      { pageSize: total },
      { maxAgeMs: 0, onFresh: (rows) => done(rows), onError: () => done(null) },
    );
    setTimeout(() => done(null), 30000);
  });

  if (!items) return { complete: false, synced: 0, total, failedPages: [1] };
  const synced = items.length;
  return { complete: synced >= total, synced, total, failedPages: synced >= total ? [] : [1] };
}

const MODULE_DATA_SYNC: Record<SyncModule, () => Promise<ModuleSyncOutcome>> = {
  products: () => syncAllStorefrontProducts(),
  tyresChat: () => syncAllTyresChat(),
  supplierProducts: async () => {
    // The FULL catalogue, not `syncSupplierProductsPage()` — that fetches a
    // single default-sized page, so anything routed through this map would have
    // silently synced one page and reported success.
    await syncAllSupplierProducts();
    return WHOLE;
  },
  // No dedicated data modules yet — ready for when these pages land.
  orders: async () => {
    console.info("[sync] orders module not implemented yet — skipping");
    return WHOLE;
  },
  customers: async () => {
    console.info("[sync] customers module not implemented yet — skipping");
    return WHOLE;
  },
};

async function refreshModule(mod: SyncModule): Promise<ModuleSyncOutcome> {
  const refreshers = registry.get(mod);

  /* Products always pages the whole catalogue, mounted or not. A mounted page's
     refresher only reloads the slice it is showing, so relying on it would make
     a full sync mean different things depending on which route happened to be
     open. The refresher still runs afterwards, so an open /products updates in
     place — the existing contract is kept, just no longer used INSTEAD of the
     data-layer pass. Other modules are untouched. */
  if (mod === "products" || mod === "tyresChat") {
    const outcome = await MODULE_DATA_SYNC[mod]();
    if (refreshers && refreshers.size > 0) {
      await Promise.all([...refreshers].map((fn) => Promise.resolve(fn())));
    }
    return outcome;
  }

  if (refreshers && refreshers.size > 0) {
    // A page is mounted → update its live view directly.
    await Promise.all([...refreshers].map((fn) => Promise.resolve(fn())));
    return WHOLE;
  }
  // No page mounted → refresh the data cache at the source.
  await MODULE_DATA_SYNC[mod]();
  return WHOLE;
}

/**
 * Refresh ONE module and nothing else.
 *
 * Exported for the global sync manager's task definitions. Going through
 * `refreshModule` preserves the existing contract: if a page for that module is
 * mounted, its live refresher runs so on-screen state updates in place;
 * otherwise the IndexedDB cache is refreshed at the data layer. Calling the
 * data-layer sync directly instead would leave mounted pages showing stale
 * state after a sync.
 */
export async function syncModule(mod: SyncModule): Promise<ModuleSyncOutcome> {
  return refreshModule(mod);
}

/** Header Sync: refresh ONLY the current route's module. */
export async function syncPage(pathname: string | null | undefined): Promise<void> {
  const mod = moduleForPath(pathname);
  if (!mod) {
    // Unmapped route → nothing to sync here. No-op rather than crash.
    console.info(`[sync] no sync module for route "${pathname ?? "unknown"}" — nothing to refresh.`);
    return;
  }
  await refreshModule(mod);
}

/**
 * Route-aware "recently synced" check — mirrors the previous per-page throttle
 * so the Header Sync button can keep its original "already synced" toast.
 */
export async function isPageRecentlySynced(
  pathname: string | null | undefined,
  maxAgeMs = 30000,
): Promise<boolean> {
  const mod = moduleForPath(pathname);
  if (mod === "products") return isProductsRecentlySynced(maxAgeMs);
  if (mod === "tyresChat") return isTyresChatRecentlySynced(maxAgeMs);
  if (mod === "supplierProducts") return isSupplierProductsRecentlySynced(maxAgeMs);
  return false;
}

/** Sidebar Sync: refresh every module (full application sync). */
export async function syncAll(): Promise<void> {
  const modules: SyncModule[] = ["products", "orders", "customers", "tyresChat", "supplierProducts"];
  await Promise.all(modules.map((m) => refreshModule(m)));
}
