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
  getStorefrontProductsCached,
  getTyresChatCached,
  isProductsRecentlySynced,
  isTyresChatRecentlySynced,
  isSupplierProductsRecentlySynced,
  syncAllSupplierProducts,
  syncSupplierProductsPage,
} from "./cache";

export type SyncModule = "products" | "orders" | "customers" | "tyresChat" | "supplierProducts";

/* ── Route → module map (longest matching prefix wins) ── */
const ROUTE_MODULES: { prefix: string; module: SyncModule }[] = [
  { prefix: "/supplier-products", module: "supplierProducts" },
  { prefix: "/products", module: "products" },
  { prefix: "/dashboard/orders", module: "orders" },
  { prefix: "/dashboard/customers", module: "customers" },
  { prefix: "/tyre_guide/chat", module: "tyresChat" },
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

const MODULE_DATA_SYNC: Record<SyncModule, () => Promise<void>> = {
  products: () =>
    runCached((cbs) =>
      getStorefrontProductsCached(
        { search: "", pageSize: 24, currentPage: 1, sortField: "name", sortDirection: "ASC" },
        // Explicit sync → always hit GraphQL, never short-circuit on fresh cache.
        { ...cbs, maxAgeMs: 0 },
      ),
    ),
  tyresChat: () => runCached((cbs) => getTyresChatCached({ pageSize: 200 }, { ...cbs, maxAgeMs: 0 })),
  supplierProducts: async () => {
    await syncSupplierProductsPage();
  },
  // No dedicated data modules yet — ready for when these pages land.
  orders: async () => {
    console.info("[sync] orders module not implemented yet — skipping");
  },
  customers: async () => {
    console.info("[sync] customers module not implemented yet — skipping");
  },
};

async function refreshModule(mod: SyncModule): Promise<void> {
  const refreshers = registry.get(mod);
  if (refreshers && refreshers.size > 0) {
    // A page is mounted → update its live view directly.
    await Promise.all([...refreshers].map((fn) => Promise.resolve(fn())));
  } else {
    // No page mounted → refresh the data cache at the source.
    await MODULE_DATA_SYNC[mod]();
  }
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
export async function syncModule(mod: SyncModule): Promise<void> {
  await refreshModule(mod);
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
