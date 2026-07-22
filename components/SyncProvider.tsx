"use client";

/**
 * Global sync-overlay state. Mounted ONCE in the root layout, so the
 * "Point Of Sales is syncing..." popup lives above the router and is not tied
 * to page mounts or route changes.
 *
 * The overlay appears EXACTLY ONCE per browser tab session — for the initial
 * app sync (whichever page loads first) — and never again: not on route
 * changes, re-renders, later syncs, OR page reloads (the completed flag is
 * persisted in sessionStorage). A safety timeout guarantees it can never get
 * stuck on screen.
 *
 * The overlay UI/animation itself (SyncingOverlay) is unchanged — only WHEN it
 * shows is controlled here.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import SyncingOverlay from "./SyncingOverlay";

const SESSION_KEY = "pos:initialSyncDone";
// Hard cap so the popup can never stay up (e.g. if a data load stalls or errors).
const SAFETY_HIDE_MS = 6000;

interface SyncOverlayContextValue {
  /** True once the initial POS sync has completed for this app session. */
  isInitialSyncCompleted: boolean;
  /**
   * Show the one-time initial sync overlay. Returns true only the FIRST time
   * per browser session, so navigation/reloads never re-show the popup.
   */
  requestInitialSyncOverlay: (step: string) => boolean;
  /** Hide the overlay and mark the initial sync as completed. */
  completeInitialSync: () => void;
}

const SyncOverlayContext = createContext<SyncOverlayContextValue | null>(null);

export function useSyncOverlay(): SyncOverlayContextValue {
  const ctx = useContext(SyncOverlayContext);
  if (!ctx) {
    throw new Error("useSyncOverlay must be used within <SyncProvider>");
  }
  return ctx;
}

/** Has the initial sync already run in this browser tab session? */
function alreadyDoneThisSession(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState("Products");
  const [isInitialSyncCompleted, setIsInitialSyncCompleted] = useState(false);
  // Refs mirror the flags for atomic check-and-set with no render dependency.
  const initialShownRef = useRef(false);
  const initialCompletedRef = useRef(false);

  const completeInitialSync = useCallback(() => {
    // Only the initial sync completion hides the overlay, and only once. After
    // that this is a no-op, so no later load/refresh can re-show or re-hide it.
    if (initialCompletedRef.current) return;
    initialCompletedRef.current = true;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* sessionStorage unavailable → still fine, just not persisted */
    }
    setVisible(false);
    setIsInitialSyncCompleted(true);
  }, []);

  const requestInitialSyncOverlay = useCallback((nextStep: string) => {
    if (initialShownRef.current) return false; // already handled this mount
    initialShownRef.current = true;
    // Already shown earlier in this browser session (e.g. before a reload) →
    // never show it again.
    if (alreadyDoneThisSession()) {
      initialCompletedRef.current = true;
      setIsInitialSyncCompleted(true);
      return false;
    }
    setStep(nextStep);
    setVisible(true);
    return true;
  }, []);

  // Safety net: once the overlay is showing, force-hide it after a hard cap so a
  // stalled/failed data load can never leave the popup stuck on screen.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => completeInitialSync(), SAFETY_HIDE_MS);
    return () => clearTimeout(t);
  }, [visible, completeInitialSync]);

  return (
    <SyncOverlayContext.Provider
      value={{
        isInitialSyncCompleted,
        requestInitialSyncOverlay,
        completeInitialSync,
      }}
    >
      {children}
      <SyncingOverlay isSyncing={visible} syncStep={step} />
    </SyncOverlayContext.Provider>
  );
}
