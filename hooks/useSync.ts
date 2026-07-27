"use client";

/**
 * Shared sync hook used by both Sync buttons. Centralizes the loading state and
 * the sync orchestration so components contain no sync logic themselves.
 *
 *   const { handlePageSync } = useSync();  // Header  → current page only
 *   const { handleFullSync } = useSync();  // Sidebar → whole application
 *
 * Both buttons give feedback through the shared toast system: the original
 * offline / "already synced" warnings, plus a success toast on completion. The
 * toast UI/logic lives in ToastProvider and is not modified.
 *
 * Guarantees: no window.location.reload(), no router.refresh(), no redirect.
 */
import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { syncPage, syncAll, isPageRecentlySynced } from "@/services/syncService";

/** Minimum gap between two accepted syncs from the same button, in ms. */
const SYNC_COOLDOWN_MS = 3000;

export function useSync() {
  const pathname = usePathname();
  // useRouter is intentionally read but NOT used to navigate/refresh — sync must
  // keep the user exactly where they are (no router.refresh(), no push/replace).
  const router = useRouter();
  void router;

  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  // SYNCHRONOUS in-flight guard. `isSyncing` alone cannot stop a double-click:
  // setState is async, so two clicks dispatched before React re-renders both
  // read `isSyncing === false` and both fire a sync. A ref flips immediately,
  // in the same tick, so the second click always loses. The state is still kept
  // — it drives the spinner and the `disabled` attribute.
  const inFlight = useRef(false);
  // Timestamp of the last accepted sync, for the post-completion cooldown.
  const lastRunAt = useRef(0);

  const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

  /**
   * Shared gate for every sync entry point. Returns false when the click should
   * be ignored, having already shown the appropriate toast.
   */
  const claim = useCallback((): boolean => {
    if (inFlight.current) {
      toast("Point Of Sales is already syncing.", "warning");
      return false;
    }
    if (Date.now() - lastRunAt.current < SYNC_COOLDOWN_MS) {
      toast("Just synced — please wait a moment before syncing again.", "warning");
      return false;
    }
    if (isOffline()) {
      toast("Offline mode: Cannot sync without internet connection.", "warning");
      return false;
    }
    inFlight.current = true;
    setIsSyncing(true);
    return true;
  }, [toast]);

  /** Release the gate and start the cooldown. Always runs, success or failure. */
  const release = useCallback(() => {
    lastRunAt.current = Date.now();
    inFlight.current = false;
    setIsSyncing(false);
  }, []);

  /** Header Sync — detects the current route and syncs only that page's data. */
  const handlePageSync = useCallback(async () => {
    if (!claim()) return;
    try {
      // The 30s "already synced" check runs AFTER the gate is claimed, so a
      // second click during the await can't slip past it.
      if (await isPageRecentlySynced(pathname, 30000)) {
        toast("Point Of Sales is already synced.", "warning");
        return;
      }
      await syncPage(pathname);
      toast("Point Of Sales synced.", "success");
    } catch (err) {
      console.error("[sync] page sync failed:", err);
      toast("Sync failed. Please try again.", "error");
    } finally {
      release();
    }
  }, [claim, release, pathname, toast]);

  /** Sidebar Sync — full application sync across every module. */
  const handleFullSync = useCallback(async () => {
    if (!claim()) return;
    try {
      await syncAll();
      toast("All data synced.", "success");
    } catch (err) {
      console.error("[sync] full sync failed:", err);
      toast("Sync failed. Please try again.", "error");
    } finally {
      release();
    }
  }, [claim, release, toast]);

  return { isSyncing, handlePageSync, handleFullSync };
}
