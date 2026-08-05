"use client";

/**
 * The section shell every dashboard panel sits in.
 *
 * One component owns the card chrome, the heading row, and the three states a
 * panel can be in (loading / error / empty), so no panel re-implements them and
 * they cannot drift apart. Panels pass their own content for the loaded state.
 *
 * `isDemo` renders the badge that marks a panel with no backend. It is on the
 * shell rather than per-panel so it looks identical everywhere and cannot be
 * forgotten — see the note at the top of `services/dashboardData.ts`.
 */

import type { ReactNode } from "react";
import { ExclamationTriangleIcon, InboxIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "@/components/Skeletons";

export interface DashboardCardProps {
  title: string;
  subtitle?: string;
  /** Buttons / filters shown on the right of the heading row. */
  action?: ReactNode;
  /** Marks the panel as illustrative because it has no data source. */
  isDemo?: boolean;
  loading?: boolean;
  error?: string | null;
  /** When true (and not loading/error), the empty state replaces `children`. */
  empty?: boolean;
  emptyLabel?: string;
  /** Skeleton rows drawn while loading. */
  skeletonRows?: number;
  /** Removes the body padding — tables manage their own. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function DashboardCard({
  title,
  subtitle,
  action,
  isDemo = false,
  loading = false,
  error = null,
  empty = false,
  emptyLabel = "Nothing to show yet",
  skeletonRows = 4,
  flush = false,
  className = "",
  children,
}: DashboardCardProps) {
  return (
    <section
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col overflow-hidden transition-shadow hover:shadow-sm ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
            <span className="truncate">{title}</span>
            {isDemo && (
              <span
                title="No backend endpoint exists for this section — the figures are illustrative."
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/70 shrink-0"
              >
                Demo data
              </span>
            )}
          </h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </header>

      <div className={`flex-1 min-h-0 min-w-0 ${flush ? "" : "p-5"}`}>
        {loading ? (
          <div className={`space-y-2 ${flush ? "p-5" : ""}`} aria-busy="true">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className={`py-10 text-center ${flush ? "px-5" : ""}`}>
            <ExclamationTriangleIcon className="w-7 h-7 mx-auto text-rose-400" />
            <p className="mt-2 text-xs font-semibold text-slate-600">Could not load this section</p>
            <p className="mt-0.5 text-[11px] text-slate-400 max-w-xs mx-auto">{error}</p>
          </div>
        ) : empty ? (
          <div className={`py-10 text-center ${flush ? "px-5" : ""}`}>
            <InboxIcon className="w-7 h-7 mx-auto text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-500">{emptyLabel}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
