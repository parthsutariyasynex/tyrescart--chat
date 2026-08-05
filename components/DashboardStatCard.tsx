"use client";

/**
 * One summary tile: icon, title, value, comparison line and trend chip.
 *
 * Used for all of the top-row cards, real and demo alike, so they stay visually
 * identical and a new metric is one array entry rather than another block of
 * markup.
 */

import type { ComponentType } from "react";
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, MinusSmallIcon } from "@heroicons/react/24/outline";
import type { Trend } from "@/services/dashboardData";
import { Skeleton } from "@/components/Skeletons";

/** Icon tint per card, kept here so the palette stays consistent. */
export type StatTone = "emerald" | "sky" | "violet" | "amber" | "rose" | "slate" | "indigo" | "teal";

const TONE: Record<StatTone, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
  indigo: "bg-indigo-50 text-indigo-600",
  teal: "bg-teal-50 text-teal-600",
};

const TREND: Record<Trend, { cls: string; Icon: ComponentType<{ className?: string }> }> = {
  up: { cls: "bg-emerald-50 text-emerald-700", Icon: ArrowTrendingUpIcon },
  down: { cls: "bg-rose-50 text-rose-700", Icon: ArrowTrendingDownIcon },
  flat: { cls: "bg-slate-100 text-slate-600", Icon: MinusSmallIcon },
};

export interface DashboardStatCardProps {
  title: string;
  value: string;
  comparison: string;
  trend: Trend;
  delta: string;
  icon: ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** Badges the tile as illustrative — see `services/dashboardData.ts`. */
  isDemo?: boolean;
  loading?: boolean;
}

export default function DashboardStatCard({
  title,
  value,
  comparison,
  trend,
  delta,
  icon: Icon,
  tone = "emerald",
  isDemo = false,
  loading = false,
}: DashboardStatCardProps) {
  const t = TREND[trend];

  if (loading) {
    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-6 w-28 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="group bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-start justify-between gap-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300/80">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold text-slate-500 truncate">{title}</p>
          {isDemo && (
            <span
              title="No backend endpoint exists for this figure — it is illustrative."
              className="px-1 py-px rounded text-[8px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/70 shrink-0"
            >
              Demo
            </span>
          )}
        </div>

        <h3 className="mt-1 text-xl font-extrabold text-slate-900 tracking-tight truncate">{value}</h3>

        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${t.cls}`}>
            <t.Icon className="w-3 h-3 shrink-0" />
            {delta}
          </span>
          <span className="text-[10px] text-slate-400 truncate">{comparison}</span>
        </div>
      </div>

      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${TONE[tone]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}
