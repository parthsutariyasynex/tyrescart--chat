"use client";

/**
 * Shared sync hook used by both Sync buttons. Centralizes the loading state and
 * the sync orchestration so components contain no sync logic themselves.
 *
 *   const { handlePageSync } = useSync();  // Header  → current page only
 *   const { handleFullSync } = useSync();  // Sidebar → whole application
 *
 * Toast behavior is intentionally UNCHANGED from the previous implementation:
 * only the original offline and "already synced" warning toasts are shown — no
 * new success/error toasts are created here. The toast UI/logic lives in
 * ToastProvider and is not modified.
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
    if (isSyncing) return;
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
    } catch (err) {
      // Keep the previous toast behavior (no error toast); just log so a failed
      // sync never surfaces as an unhandled runtime error.
      console.error("[sync] page sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, pathname, toast]);

  /** Sidebar Sync — full application sync across every module. */
  const handleFullSync = useCallback(async () => {
    if (isSyncing) return;
    if (isOffline()) {
      toast("Offline mode: Cannot sync without internet connection.", "warning");
      return;
    }
    setIsSyncing(true);
    try {
      await syncAll();
    } catch (err) {
      // Keep the previous toast behavior (no error toast); just log so a failed
      // sync never surfaces as an unhandled runtime error.
      console.error("[sync] full sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, toast]);

  return { isSyncing, handlePageSync, handleFullSync };
}
