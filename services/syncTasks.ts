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
import { consumeManualSync, recordCostChanges } from "./costHistory";
import {
  syncAllSupplierProducts,
  getSupplierSyncState,
  syncAllTcProducts,
  type CachedSupplierProduct,
} from "./cache";

/** Stable ids so components can subscribe without importing the definitions. */
export const SYNC_TASK = {
  supplierProducts: "supplierProducts",
  tcProducts: "tcProducts",
  products: "products",
  tyresChat: "tyresChat",
} as const;

export type KnownSyncTaskId = (typeof SYNC_TASK)[keyof typeof SYNC_TASK];

const nf = (n: number) => n.toLocaleString();

/* ─────────────────────────────────────────────────────────────
   Supplier products — latest stock only (~8.3k rows, ~9 requests)
───────────────────────────────────────────────────────────── */
const supplierProductsTask: SyncTaskDefinition = {
  id: SYNC_TASK.supplierProducts,
  label: "Supplier products",
  async run({ onProgress, onBatch, signal }) {
    // Stamps this generation. Rows carrying an older stamp are cursor-deleted
    // when the pass completes, which is also what purges the historical rows a
    // pre-latest-only cache still holds.
    const syncBatch = Date.now();

    // Manual runs additionally record cost history. Consumed (not just read) so
    // a later automatic run of this task records nothing.
    const isManual = consumeManualSync(SYNC_TASK.supplierProducts);
    const seenRows: CachedSupplierProduct[] = [];

    const forward = (batch: CachedSupplierProduct[]) => {
      onBatch(batch);
      // Buffer rather than write per batch: the comparison needs each product's
      // previous cost, and reading that once beats reading it per batch.
      if (isManual) seenRows.push(...batch);
    };

    // ONE pass. There used to be a latest-first phase ahead of the full
    // catalogue, because the LATEST? view sat behind ~50k historical rows and
    // would otherwise show an empty table for a minute. Now that the sync itself
    // only ever fetches `is_latest: 1`, that phase would fetch exactly the same
    // rows twice — so it is gone, not skipped.
    const result = await syncAllSupplierProducts({ syncBatch, onProgress, onBatch: forward });
    if (signal.aborted) return "Sync cancelled.";

    // After the catalogue is persisted, so history can never reference a row the
    // store does not have. Failure here must not fail the sync — the rows are
    // already saved and history is supplementary.
    if (isManual && seenRows.length) {
      await recordCostChanges(seenRows).catch((e) =>
        console.warn("[syncTasks] cost history not recorded:", e),
      );
    }

    // Same three messages as before; each now also reports whether the pass
    // actually finished, so a run that dropped pages lands on "partial" instead
    // of claiming the catalogue is synced.
    if (result.complete) {
      return { complete: true, message: `Synced all ${nf(result.items)} supplier products.` };
    }
    if (result.aborted) {
      return {
        complete: false,
        message: `Sync stopped early: ${nf(result.written)} of ${nf(result.total)} products. Previous data kept.`,
      };
    }
    return {
      complete: false,
      message: `Synced ${nf(result.written)} of ${nf(result.total)} — ${result.failedPages.length} page${result.failedPages.length === 1 ? "" : "s"} failed.`,
    };
  },
};


/* ─────────────────────────────────────────────────────────────
   TC products (~7.8k rows, ~79 requests)

   Same shape as the supplier task so the page can observe it identically, but a
   different scale and storage model: one cache record per PAGE rather than per
   product, and no generation cleanup — a page write replaces its own entry.

   `force` is not a parameter because `SyncTaskDefinition.run` takes none. The
   task decides like the supplier one does: nothing cached → fetch everything;
   something cached → let the read-through TTL decide per page, so a background
   run costs zero requests when the cache is fresh. A manual Sync stays on the
   page's own loader with `maxAgeMs: 0`, which is what makes "Refresh" mean
   refresh regardless of this task.
───────────────────────────────────────────────────────────── */
const tcProductsTask: SyncTaskDefinition = {
  id: SYNC_TASK.tcProducts,
  label: "TC products",
  async run({ onProgress, onBatch, signal }) {
    const result = await syncAllTcProducts({
      // Always hit the network, like the supplier full pass. This task runs on a
      // cold cache (nothing to reuse) or from a Sync button (where the point IS
      // fresh data) — never as idle revalidation, since the page no longer
      // auto-syncs a populated cache.
      force: true,
      onProgress,
      // The manager's channel is `unknown[]`; one element per page keeps the
      // page number attached so a re-delivered batch overwrites its slot
      // instead of duplicating rows.
      onBatch: (batch) => onBatch([batch]),
      signal,
    });

    if (result.aborted) {
      return {
        complete: false,
        message: `Sync stopped early: ${nf(result.items)} of ${nf(result.total)} TC products. Previous data kept.`,
      };
    }
    if (result.complete) {
      return { complete: true, message: `Synced all ${nf(result.items)} TC products.` };
    }
    return {
      complete: false,
      message: `Synced ${nf(result.items)} of ${nf(result.total)} — ${result.failedPages.length} page${result.failedPages.length === 1 ? "" : "s"} failed.`,
    };
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
    const res = await syncModule("products");
    // Reports completeness rather than assuming it: this task used to fetch a
    // single 24-row page and return a bare string, which the manager mapped to
    // "completed" — so `isAllSynced()` could call the application synced over
    // 24 of 8,524 products.
    if (res.complete) {
      return { complete: true, message: `Synced all ${nf(res.total || res.synced)} products.` };
    }
    return {
      complete: false,
      message: `Synced ${nf(res.synced)} of ${nf(res.total)} — ${res.failedPages.length} page${res.failedPages.length === 1 ? "" : "s"} failed.`,
    };
  },
};

const tyresChatTask: SyncTaskDefinition = {
  id: SYNC_TASK.tyresChat,
  label: "Chat shortcuts",
  async run() {
    const res = await syncModule("tyresChat");
    // Reports completeness rather than assuming it: a bare string return is
    // mapped to "completed" by the manager, so a truncated or failed fetch used
    // to count toward `isAllSynced()`.
    if (res.complete) {
      return { complete: true, message: `Synced all ${nf(res.total)} chat shortcuts.` };
    }
    return {
      complete: false,
      message: `Synced ${nf(res.synced)} of ${nf(res.total)} chat shortcuts.`,
    };
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


/* tc has NO auto-resume, deliberately.
   Requirement: tc-products and /products auto-sync only when IndexedDB is
   completely empty, and never otherwise — so an interrupted run is NOT picked
   back up on the next app start. It leaves a partial cache, which the page
   renders as-is; the user completes it with the Sync button. `tcProducts:syncState`
   is still written by the sync and is diagnostic only (inspect it in DevTools to
   see whether the last run finished). supplier-products keeps its resume path:
   its catalogue is 319k rows over ~3,200 requests, where losing a half-finished
   run to a stray reload is a materially different cost. */

/** Idempotent — safe to call from multiple entry points and across fast refresh. */
export function registerSyncTasks(): void {
  syncManager.registerTask(supplierProductsTask);
  syncManager.registerTask(tcProductsTask);
  syncManager.registerTask(productsTask);
  syncManager.registerTask(tyresChatTask);
}

// Register on import so the manager knows its tasks before any UI mounts.
registerSyncTasks();
