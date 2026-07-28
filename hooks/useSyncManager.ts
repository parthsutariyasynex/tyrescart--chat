"use client";

/**
 * React bindings for the global {@link syncManager}.
 *
 * Deliberately NOT a Context provider. The manager is a module singleton that
 * must outlive every component, so there is no tree for a Provider to own —
 * and a Provider would add a "must be rendered inside X" failure mode for
 * something any component should be able to read. `useSyncExternalStore` is
 * React's supported way to subscribe to exactly this kind of external store:
 * it handles tearing, StrictMode double-subscribe, and SSR via the third
 * argument.
 *
 *   const { status, progress } = useSyncTask(SYNC_TASK.supplierProducts);
 *   const busy = useAnySyncRunning();
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  syncManager,
  type SyncTaskId,
  type SyncTaskState,
} from "@/services/syncManager";
// Importing for the side effect: registers every task before any UI reads state.
import "@/services/syncTasks";

/** Stable placeholder for a task that hasn't registered yet (or on the server),
 *  so hooks always return a usable object and callers need no null checks. */
const UNKNOWN: SyncTaskState = {
  id: "",
  label: "",
  status: "idle",
  progress: null,
  message: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  runCount: 0,
};

/** Live state for one task. Re-renders only when that task's slice changes. */
export function useSyncTask(id: SyncTaskId): SyncTaskState {
  const getClient = useCallback(() => syncManager.getTask(id) ?? UNKNOWN, [id]);
  // Server render has no manager state; returning the idle placeholder keeps
  // markup identical on both sides and avoids a hydration mismatch.
  const getServer = useCallback(() => UNKNOWN, []);
  return useSyncExternalStore(syncManager.subscribe, getClient, getServer);
}

/** True while ANY registered sync is running — for the sidebar spinner. */
export function useAnySyncRunning(): boolean {
  const getClient = useCallback(() => syncManager.isAnyRunning(), []);
  const getServer = useCallback(() => false, []);
  return useSyncExternalStore(syncManager.subscribe, getClient, getServer);
}

/**
 * Subscribe to batches streamed by a running task.
 *
 * The callback is held in a ref so a caller can pass an inline closure without
 * resubscribing on every render. Batches emitted while nothing is mounted are
 * dropped by design — they are already persisted in IndexedDB, so a later mount
 * reads them from there.
 */
export function useSyncBatches<T>(
  id: SyncTaskId,
  onBatch: (batch: T[]) => void,
): void {
  // Latest-callback ref, refreshed in an effect rather than during render —
  // writing to a ref while rendering is unsafe under concurrent rendering.
  const cb = useRef(onBatch);
  useEffect(() => { cb.current = onBatch; });

  useEffect(() => {
    return syncManager.subscribeToBatches((taskId, batch) => {
      if (taskId === id) cb.current(batch as T[]);
    });
  }, [id]);
}

/**
 * Run `fn` when a task transitions into `completed`.
 *
 * Keyed on `runCount` rather than the status string so a page that mounts while
 * a task is already finished doesn't immediately re-fire, and so two successive
 * runs both trigger.
 */
export function useOnSyncComplete(id: SyncTaskId, fn: () => void): void {
  const { status, runCount } = useSyncTask(id);
  const cb = useRef(fn);
  useEffect(() => { cb.current = fn; });
  const seen = useRef<number | null>(null);

  // Baseline the run counter AT MOUNT, not on the first "completed" sighting.
  // Deferring it swallowed the very case this hook exists for: mount while a
  // sync is running, and the completion that follows is the first `completed`
  // observation — so it was treated as "joined late" and never fired.
  useEffect(() => {
    if (seen.current === null) seen.current = syncManager.getTask(id)?.runCount ?? 0;
  }, [id]);

  useEffect(() => {
    if (status !== "completed" || seen.current === null) return;
    // Equal counts mean this run already finished before we mounted.
    if (runCount !== seen.current) {
      seen.current = runCount;
      cb.current();
    }
  }, [status, runCount]);
}

export { syncManager };
