"use client";

/**
 * The app's ONE sync button.
 *
 * Replaces two divergent implementations: `HeaderSyncButton` + `useSync` (used by
 * /products, /dashboard, chat — with a 30s "already synced" gate and its own
 * in-flight ref) and hand-rolled buttons on supplier-products and tc-products
 * (each with their own `pageSyncing` state, `syncInFlight` ref and toast
 * wording). Same click, same guards, same feedback everywhere now.
 *
 * FLOW — every button goes through the manager:
 *   click → syncManager.start(task) → the registered task in `syncTasks.ts`
 *
 * That keeps one code path for the 8-worker pool, per-page retry and the
 * IndexedDB cache. It also means the button cannot start a second run: `start()`
 * dedupes synchronously, so a click during a run joins it instead of queueing a
 * duplicate pass. Nothing here fetches, caches or maps anything itself.
 *
 * NOT carried over from `useSync`: the 30-second "already synced" refusal. It
 * silently swallowed legitimate clicks, and the in-flight dedupe plus the short
 * cooldown below cover what it was guarding against.
 */

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { useSyncTask } from "@/hooks/useSyncManager";
import { syncManager, type SyncTaskId } from "@/services/syncManager";
import { SYNC_TASK } from "@/services/syncTasks";
import { markManualSync } from "@/services/costHistory";

/** Which task a route's Sync button runs. */
const ROUTE_TASK: { prefix: string; task: SyncTaskId }[] = [
  { prefix: "/supplier-products", task: SYNC_TASK.supplierProducts },
  { prefix: "/tc-products", task: SYNC_TASK.tcProducts },
  { prefix: "/tyreschat", task: SYNC_TASK.tyresChat },
  // Keep last: "/products" is a prefix of nothing else here, but ordering makes
  // the intent explicit if a "/products-something" route ever appears.
  { prefix: "/products", task: SYNC_TASK.products },
];

function taskForPath(pathname: string | null): SyncTaskId | null {
  if (!pathname) return null;
  return ROUTE_TASK.find(({ prefix }) => pathname.startsWith(prefix))?.task ?? null;
}

/** Minimum gap between two accepted clicks for the same task. */
const SYNC_COOLDOWN_MS = 3000;

/**
 * Module-level so the cooldown survives a remount and is shared by every button
 * pointing at the same task — a component-local ref would reset on navigation.
 */
const lastRunAt = new Map<SyncTaskId, number>();

interface SyncButtonProps {
  /** Defaults to the task mapped from the current route. */
  task?: SyncTaskId;
  title?: string;
  /** Accent of the spinner while running. */
  tone?: "emerald" | "orange";
  className?: string;
}

export default function SyncButton({ task, title, tone = "emerald", className = "" }: SyncButtonProps) {
  const pathname = usePathname();
  const resolved = task ?? taskForPath(pathname);

  // A route with no data of its own (/dashboard) gets a disabled button rather
  // than the old silent no-op, which looked broken.
  if (!resolved) {
    return (
      <button
        type="button"
        disabled
        title="Nothing to sync on this page"
        aria-label="Nothing to sync on this page"
        className={`p-2 text-slate-300 cursor-not-allowed focus:outline-none ${className}`}
      >
        <DatabaseZap className="w-5 h-5" />
      </button>
    );
  }

  return <ActiveSyncButton task={resolved} title={title} tone={tone} className={className} />;
}

function ActiveSyncButton({
  task,
  title,
  tone,
  className,
}: Required<Pick<SyncButtonProps, "task" | "tone" | "className">> & { title?: string }) {
  const { toast } = useToast();
  const state = useSyncTask(task);
  const [clicked, setClicked] = useState(false);

  const running = state.status === "running" || clicked;
  const label = title ?? "Sync this page";

  const onClick = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast("Offline: cannot sync without an internet connection.", "warning");
      return;
    }
    if (syncManager.isRunning(task)) {
      toast("Sync already in progress…", "warning");
      return;
    }
    const since = Date.now() - (lastRunAt.get(task) ?? 0);
    if (since < SYNC_COOLDOWN_MS) {
      toast("Sync just ran — give it a moment.", "warning");
      return;
    }

    // Local flag as well as the task status: `setClicked` renders immediately,
    // while the manager's "running" snapshot only arrives on its first patch.
    setClicked(true);
    lastRunAt.set(task, Date.now());
    try {
      // Cost history is recorded on MANUAL syncs only — a history point should
      // mean "the price was X when we re-checked". The task cannot see how it
      // was triggered (`run` takes no arguments), so the trigger publishes it
      // here and the task consumes it.
      markManualSync(task);
      await syncManager.start(task);
      const done = syncManager.getTask(task);
      if (done?.status === "error") toast(done.error || "Sync failed. Please try again.", "error");
      else toast(done?.message || "Sync complete.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sync failed. Please try again.", "error");
    } finally {
      setClicked(false);
      lastRunAt.set(task, Date.now());
    }
  }, [task, toast]);

  return (
    <button
      type="button"
      onClick={(e) => {
        void onClick();
        e.currentTarget.blur();
      }}
      disabled={running}
      title={label}
      aria-label={label}
      className={`p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 focus:outline-none ${className}`}
    >
      <DatabaseZap
        className={`w-5 h-5 ${running ? `animate-pulse ${tone === "orange" ? "text-orange-500" : "text-emerald-600"}` : ""}`}
      />
    </button>
  );
}
