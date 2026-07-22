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
import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { syncPage, syncAll, isPageRecentlySynced } from "@/services/syncService";

export function useSync() {
  const pathname = usePathname();
  // useRouter is intentionally read but NOT used to navigate/refresh — sync must
  // keep the user exactly where they are (no router.refresh(), no push/replace).
  const router = useRouter();
  void router;

  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

  /** Header Sync — detects the current route and syncs only that page's data. */
  const handlePageSync = useCallback(async () => {
    if (isSyncing) {
      toast("Point Of Sales is already syncing.", "warning");
      return;
    }
    if (isOffline()) {
      toast("Offline mode: Cannot sync without internet connection.", "warning");
      return;
    }
    if (await isPageRecentlySynced(pathname, 30000)) {
      toast("Point Of Sales is already synced.", "warning");
      return;
    }
    setIsSyncing(true);
    try {
      await syncPage(pathname);
      toast("Point Of Sales synced.", "success");
    } catch (err) {
      console.error("[sync] page sync failed:", err);
      toast("Sync failed. Please try again.", "error");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, pathname, toast]);

  /** Sidebar Sync — full application sync across every module. */
  const handleFullSync = useCallback(async () => {
    if (isSyncing) {
      toast("Point Of Sales is already syncing.", "warning");
      return;
    }
    if (isOffline()) {
      toast("Offline mode: Cannot sync without internet connection.", "warning");
      return;
    }
    setIsSyncing(true);
    try {
      await syncAll();
      toast("All data synced.", "success");
    } catch (err) {
      console.error("[sync] full sync failed:", err);
      toast("Sync failed. Please try again.", "error");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, toast]);

  return { isSyncing, handlePageSync, handleFullSync };
}
