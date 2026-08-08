"use client";

/**
 * Sidebar (left menu) Sync button. Triggers a FULL application sync across every
 * registered task. Styled to match the sidebar nav items.
 *
 * Contains no sync logic and owns no sync state: it dispatches to the global
 * `syncManager` and reads status back from it. That is what lets a sync survive
 * navigation — this button unmounting (or a different page mounting its own
 * sidebar) has no effect on work already in flight, and the spinner picks the
 * run back up wherever the user lands.
 */
import { DatabaseZap } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { useAnySyncRunning, useOnSyncComplete, syncManager } from "@/hooks/useSyncManager";
import { SYNC_TASK } from "@/services/syncTasks";
import { features } from "@/config/features";

export default function SidebarSyncButton({ label = "Sync" }: { label?: string }) {
  const isSyncing = useAnySyncRunning();
  const { toast } = useToast();

  // Report the supplier catalogue's outcome wherever the user happens to be
  // when it lands — it is the long one, and the run may well have started on a
  // different page.
  useOnSyncComplete(SYNC_TASK.supplierProducts, () => {
    const msg = syncManager.getTask(SYNC_TASK.supplierProducts)?.message;
    if (msg) toast(msg, "success");
  });

  if (!features.sync) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        if (isSyncing) {
          toast("Point Of Sales is already syncing.", "warning");
        } else if (typeof navigator !== "undefined" && !navigator.onLine) {
          toast("Offline mode: Cannot sync without internet connection.", "warning");
        } else if (syncManager.isAllSynced()) {
          // Every task a full sync would run has already finished with complete
          // data, so starting them again would repeat the whole catalogue for
          // nothing. A partial, failed or cancelled task leaves this false, so
          // those stay retryable.
          toast("Application is already synced.", "info");
        } else {
          // Fire-and-forget on purpose: the manager owns the lifecycle, and
          // awaiting here would tie it to this component. Duplicate clicks are
          // deduped inside `start()`, synchronously.
          void syncManager.startAll();
        }
        // Action, not a page — drop focus so it doesn't look "selected".
        e.currentTarget.blur();
      }}
      disabled={isSyncing}
      title="Sync all data"
      aria-label="Sync all data"
      className="w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-50"
    >
      <DatabaseZap className={`w-5 h-5 ${isSyncing ? "animate-pulse text-orange-500" : ""}`} />
      <span className="text-[10px] mt-1 tracking-tight">{label}</span>
    </button>
  );
}
