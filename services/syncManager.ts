/**
 * Global sync manager — a module-scope singleton that owns every long-running
 * sync in the app.
 *
 * WHY THIS EXISTS
 * Sync used to be owned by the page that started it: the supplier page
 * registered a refresher, held the in-flight latch in a `useRef`, and tracked
 * progress in component state. Navigating away unmounted all of that. The
 * in-flight promise kept running (it's just async JS) but nothing was left to
 * observe it — progress vanished, the duplicate-click guard died with the
 * component, and a second sync could be started from the next page.
 *
 * This module lives outside React. Route changes mount and unmount components;
 * they do not touch this. A sync ends when it completes, fails, or is
 * explicitly cancelled — never because a component went away.
 *
 * DESIGN
 * - Tasks are registered by id, so adding `products` / `categories` /
 *   `inventory` later is a `registerSyncTask()` call and nothing else.
 * - State is a plain immutable snapshot; React binds to it through
 *   `useSyncExternalStore` (see `hooks/useSyncManager.ts`). No Provider is
 *   needed, so any component at any depth can read status without prop
 *   drilling and without being inside a subtree.
 * - Deduplication is synchronous: `start()` returns the in-flight promise
 *   rather than launching a second run.
 */

export type SyncTaskId = string;

export type SyncTaskStatus = "idle" | "running" | "completed" | "error" | "cancelled";

export interface SyncProgress {
  loaded: number;
  total: number;
}

export interface SyncTaskState {
  id: SyncTaskId;
  label: string;
  status: SyncTaskStatus;
  progress: SyncProgress | null;
  /** Short human-readable outcome, e.g. "Synced all 318,668 supplier products." */
  message: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Increments on every completed run — lets observers react to "a new run finished". */
  runCount: number;
}

/** Handed to a task's `run`, so tasks report progress without knowing about React. */
export interface SyncTaskContext {
  onProgress: (loaded: number, total: number) => void;
  /** Streams rows/items to observers as they are persisted. */
  onBatch: (batch: unknown[]) => void;
  /** Aborts when `cancel(id)` is called. Tasks should check it between units of work. */
  signal: AbortSignal;
}

export interface SyncTaskDefinition {
  id: SyncTaskId;
  label: string;
  /** Resolve with an optional message to show on success. */
  run: (ctx: SyncTaskContext) => Promise<string | void>;
  /**
   * Keep this task out of {@link SyncManager.startAll}.
   *
   * For tasks scoped to what a page is currently showing (e.g. "refresh the
   * visible page of supplier rows"): a full application sync already refreshes
   * that data wholesale, so running it too would just be a redundant request
   * against state the user isn't necessarily looking at.
   */
  excludeFromStartAll?: boolean;
}

type Listener = () => void;
type BatchListener = (taskId: SyncTaskId, batch: unknown[]) => void;

const idleState = (id: SyncTaskId, label: string): SyncTaskState => ({
  id,
  label,
  status: "idle",
  progress: null,
  message: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  runCount: 0,
});

class SyncManager {
  private definitions = new Map<SyncTaskId, SyncTaskDefinition>();
  private inFlight = new Map<SyncTaskId, Promise<void>>();
  private controllers = new Map<SyncTaskId, AbortController>();
  private listeners = new Set<Listener>();
  private batchListeners = new Set<BatchListener>();

  /** Immutable snapshot. Replaced wholesale on every change so
   *  `useSyncExternalStore` sees a new reference and re-renders. */
  private snapshot: Readonly<Record<SyncTaskId, SyncTaskState>> = {};

  /* ── Registration ───────────────────────────────────────────────── */

  /** Register (or replace) a task. Safe to call repeatedly — module reloads in
   *  dev re-run registration, and a duplicate must not wipe live state. */
  registerTask(def: SyncTaskDefinition): void {
    this.definitions.set(def.id, def);
    if (!this.snapshot[def.id]) {
      this.snapshot = { ...this.snapshot, [def.id]: idleState(def.id, def.label) };
      this.emit();
    }
  }

  getRegisteredIds(): SyncTaskId[] {
    return [...this.definitions.keys()];
  }

  /* ── Reads ──────────────────────────────────────────────────────── */

  getSnapshot = (): Readonly<Record<SyncTaskId, SyncTaskState>> => this.snapshot;

  getTask = (id: SyncTaskId): SyncTaskState | undefined => this.snapshot[id];

  isRunning = (id: SyncTaskId): boolean => this.snapshot[id]?.status === "running";

  isAnyRunning = (): boolean =>
    Object.values(this.snapshot).some((t) => t.status === "running");

  /* ── Subscriptions ──────────────────────────────────────────────── */

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  /** Subscribe to streamed batches — used by a mounted page to append rows live.
   *  Batches emitted while no page is mounted are simply dropped; the data is
   *  already in IndexedDB, so a later mount reads it from there. */
  subscribeToBatches = (fn: BatchListener): (() => void) => {
    this.batchListeners.add(fn);
    return () => { this.batchListeners.delete(fn); };
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private patch(id: SyncTaskId, partial: Partial<SyncTaskState>) {
    const current = this.snapshot[id];
    if (!current) return;
    this.snapshot = { ...this.snapshot, [id]: { ...current, ...partial } };
    this.emit();
  }

  /* ── Running ────────────────────────────────────────────────────── */

  /**
   * Start a task, or return the in-flight promise if it is already running.
   *
   * The dedupe check and the `inFlight` write happen in the same synchronous
   * block, so two calls in one tick cannot both launch — the second always
   * observes the first's entry.
   */
  start(id: SyncTaskId): Promise<void> {
    const existing = this.inFlight.get(id);
    if (existing) return existing;

    const def = this.definitions.get(id);
    if (!def) return Promise.reject(new Error(`Unknown sync task "${id}"`));

    const controller = new AbortController();
    this.controllers.set(id, controller);

    this.patch(id, {
      status: "running",
      progress: null,
      message: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    });

    const ctx: SyncTaskContext = {
      onProgress: (loaded, total) => {
        // Skip no-op updates so a chatty task can't storm React with renders.
        const p = this.snapshot[id]?.progress;
        if (p && p.loaded === loaded && p.total === total) return;
        this.patch(id, { progress: { loaded, total } });
      },
      onBatch: (batch) => {
        for (const fn of this.batchListeners) fn(id, batch);
      },
      signal: controller.signal,
    };

    const promise = (async () => {
      try {
        const message = await def.run(ctx);
        if (controller.signal.aborted) {
          this.patch(id, {
            status: "cancelled",
            finishedAt: Date.now(),
            message: "Sync cancelled.",
          });
          return;
        }
        this.patch(id, {
          status: "completed",
          finishedAt: Date.now(),
          message: typeof message === "string" ? message : null,
          runCount: (this.snapshot[id]?.runCount ?? 0) + 1,
        });
      } catch (err) {
        this.patch(id, {
          status: controller.signal.aborted ? "cancelled" : "error",
          finishedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        });
        console.error(`[syncManager] task "${id}" failed:`, err);
      } finally {
        this.inFlight.delete(id);
        this.controllers.delete(id);
      }
    })();

    this.inFlight.set(id, promise);
    return promise;
  }

  /** Start every registered task, deduping each. Resolves when all settle. */
  startAll(): Promise<void> {
    const ids = this.getRegisteredIds().filter(
      (id) => !this.definitions.get(id)?.excludeFromStartAll,
    );
    return Promise.all(ids.map((id) => this.start(id).catch(() => { }))).then(() => void 0);
  }

  /** Request cancellation. The task observes `ctx.signal` and stops at its next
   *  checkpoint; state moves to "cancelled" when it actually unwinds. */
  cancel(id: SyncTaskId): void {
    this.controllers.get(id)?.abort();
  }

  cancelAll(): void {
    for (const id of this.controllers.keys()) this.cancel(id);
  }
}

/**
 * The singleton. Module scope in the browser means one instance per tab that
 * outlives every component — which is the whole point.
 *
 * In dev, Next's fast refresh can re-evaluate a module and would otherwise
 * create a second manager while a sync is mid-flight, losing its state. Pinning
 * it to globalThis keeps one instance across reloads.
 */
declare global {
  var __tyrescartSyncManager: SyncManager | undefined;
}

export const syncManager: SyncManager =
  globalThis.__tyrescartSyncManager ?? (globalThis.__tyrescartSyncManager = new SyncManager());
