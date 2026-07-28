/**
 * Sync task definitions — the actual work each sync performs.
 *
 * Registered against the {@link syncManager} singleton at import time, which is
 * what makes a sync page-independent: the work lives here, not in a component,
 * so navigating away cannot interrupt it or lose its progress.
 *
 * Adding a future sync (categories, inventory, orders…) means appending one
 * `registerSyncTask({ id, label, run })` below. Nothing in the UI changes —
 * the sidebar button runs everything registered, and any component can observe
 * the new task by id.
 */
import { syncManager, type SyncTaskDefinition } from "./syncManager";
import { syncModule } from "./syncService";
import {
  syncAllSupplierProducts,
  syncLatestSupplierProducts,
  countCachedSupplierProducts,
  getSupplierSyncState,
  type CachedSupplierProduct,
} from "./cache";

/** Stable ids so components can subscribe without importing the definitions. */
export const SYNC_TASK = {
  supplierProducts: "supplierProducts",
  products: "products",
  tyresChat: "tyresChat",
} as const;

export type KnownSyncTaskId = (typeof SYNC_TASK)[keyof typeof SYNC_TASK];

const nf = (n: number) => n.toLocaleString();

/* ─────────────────────────────────────────────────────────────
   Supplier products — the big one (~318k rows, ~3,187 requests)
───────────────────────────────────────────────────────────── */
const supplierProductsTask: SyncTaskDefinition = {
  id: SYNC_TASK.supplierProducts,
  label: "Supplier products",
  async run({ onProgress, onBatch, signal }) {
    // One stamp for both phases so the second phase's stale-row cleanup treats
    // the first phase's rows as part of the same generation.
    const syncBatch = Date.now();

    const forward = (batch: CachedSupplierProduct[]) => onBatch(batch);

    // A cold cache gets the current products first: they are what the default
    // LATEST? view shows, so the table fills in seconds rather than after the
    // whole catalogue. A warm cache skips straight to the full pass — those
    // rows are already on screen.
    const cachedCount = await countCachedSupplierProducts().catch(() => 0);
    if (cachedCount === 0) {
      await syncLatestSupplierProducts({ syncBatch, onProgress, onBatch: forward });
      if (signal.aborted) return "Sync cancelled.";
    }

    const result = await syncAllSupplierProducts({ syncBatch, onProgress, onBatch: forward });

    if (result.complete) return `Synced all ${nf(result.items.length)} supplier products.`;
    if (result.aborted) {
      return `Sync stopped early: ${nf(result.written)} of ${nf(result.total)} products. Previous data kept.`;
    }
    return `Synced ${nf(result.written)} of ${nf(result.total)} — ${result.failedPages.length} page${result.failedPages.length === 1 ? "" : "s"} failed.`;
  },
};

/* ─────────────────────────────────────────────────────────────
   Storefront products / Tyre chat shortcuts

   These two delegate to `syncModule`, which keeps the existing contract: a
   MOUNTED page's registered refresher runs (so its on-screen state updates in
   place), and only when no page is mounted does the data layer refresh the
   IndexedDB cache. Calling the cache functions directly here would sync the
   data but leave a mounted /products or /tyre_guide/chat showing stale rows.
───────────────────────────────────────────────────────────── */
const productsTask: SyncTaskDefinition = {
  id: SYNC_TASK.products,
  label: "Products",
  async run() {
    await syncModule("products");
    return "Products synced.";
  },
};

const tyresChatTask: SyncTaskDefinition = {
  id: SYNC_TASK.tyresChat,
  label: "Chat shortcuts",
  async run() {
    await syncModule("tyresChat");
    return "Chat shortcuts synced.";
  },
};

/**
 * Resume a catalogue sync that a hard page load killed.
 *
 * The manager is a JS-context singleton, so a full reload (F5, crash, restored
 * tab) destroys an in-flight run — client-side navigation does not. The run
 * leaves `supplierAll:syncState = "running"` in IndexedDB because only a
 * finished run overwrites that marker, which makes an interruption detectable
 * on the next load.
 *
 * This is NOT the auto-sync rule being widened: it only continues work the user
 * already started, and only when the marker proves a run was cut short. A
 * cleanly finished sync leaves "complete"/"partial" and is never resumed.
 * Resuming re-runs the full pass, which is safe — every write is an upsert
 * keyed on id.
 */
export async function resumeInterruptedSupplierSync(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (syncManager.isRunning(SYNC_TASK.supplierProducts)) return;

  const state = await getSupplierSyncState().catch(() => null);
  if (state !== "running") return;

  console.log("[syncTasks] previous supplier sync was interrupted — resuming");
  void syncManager.start(SYNC_TASK.supplierProducts);
}

/** Idempotent — safe to call from multiple entry points and across fast refresh. */
export function registerSyncTasks(): void {
  syncManager.registerTask(supplierProductsTask);
  syncManager.registerTask(productsTask);
  syncManager.registerTask(tyresChatTask);
}

// Register on import so the manager knows its tasks before any UI mounts.
registerSyncTasks();
