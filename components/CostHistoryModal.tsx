"use client";

/**
 * Cost History modal — opened by clicking a Cost value in the supplier table.
 *
 * Reads exclusively from IndexedDB (`costHistory`), which is written only by a
 * manual sync from the live API. Nothing here fetches, and nothing here invents
 * a data point: with no records for a product it says so rather than drawing an
 * empty axis or a placeholder series.
 *
 * Recharts is imported lazily. It is ~100 KB that only matters once someone
 * opens this modal, and pulling it into the supplier page's bundle would slow
 * the first paint of a table that most sessions never click through.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  getCostHistory,
  toDateSeries,
  toMonthSeries,
  summarise,
  type CostHistoryRecord,
} from "@/services/costHistory";

/** Chart body, client-only: Recharts measures the DOM and cannot server-render. */
const CostLineChart = dynamic(() => import("./CostLineChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] flex items-center justify-center">
      <div className="skeleton h-full w-full rounded-lg" aria-hidden="true" />
    </div>
  ),
});

export interface CostHistoryProduct {
  id: string | number;
  brand: string;
  size: string;
  sizeFull?: string;
  pattern?: string;
  itemCode?: string;
  /** Cost currently on the row — shown while history loads, and as a fallback. */
  cost: number;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Tab = "date" | "month";

export default function CostHistoryModal({
  product,
  onClose,
}: {
  product: CostHistoryProduct;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<CostHistoryRecord[] | null>(null);
  const [tab, setTab] = useState<Tab>("date");

  // Reading an external store (IndexedDB) into state is the sanctioned effect
  // use. `setHistory(null)` is NOT done here — resetting state in an effect body
  // is what triggers a cascading render; the modal is keyed on product.id by its
  // parent, so a different product mounts a fresh component with history=null.
  useEffect(() => {
    let alive = true;
    void getCostHistory(product.id)
      .then((rows) => { if (alive) setHistory(rows); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [product.id]);

  // Escape closes, matching the drawer and column modal on this page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dateSeries = useMemo(() => toDateSeries(history ?? []), [history]);
  const monthSeries = useMemo(() => toMonthSeries(history ?? []), [history]);
  const stats = useMemo(() => summarise(history ?? []), [history]);

  const series = tab === "date" ? dateSeries : monthSeries;
  const loading = history === null;
  const empty = !loading && (history?.length ?? 0) === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cost history"
    >
      <div
        className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200/80 bg-white">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">Cost History</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              {product.brand && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold uppercase tracking-wide">
                  {product.brand}
                </span>
              )}
              {(product.sizeFull || product.size) && (
                <span className="font-mono font-semibold text-slate-600">
                  {product.sizeFull || product.size}
                </span>
              )}
              {product.pattern && (
                <span className="text-slate-400 truncate max-w-[22rem]">{product.pattern}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* ── Summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-200/70 border-b border-slate-200/80">
          {[
            { label: "Current", value: money(empty ? product.cost : stats.current), tone: "text-slate-900" },
            { label: "Highest", value: empty ? "—" : money(stats.highest), tone: "text-rose-600" },
            { label: "Lowest", value: empty ? "—" : money(stats.lowest), tone: "text-emerald-600" },
            { label: "Average", value: empty ? "—" : money(stats.average), tone: "text-slate-700" },
            {
              label: "Last Updated",
              value: stats.lastUpdated
                ? new Date(stats.lastUpdated).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                  })
                : "—",
              tone: "text-slate-700",
            },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</div>
              <div className={`mt-0.5 text-sm font-extrabold font-mono ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="px-5 pt-4">
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg">
            {([["date", "Date Wise"], ["month", "Month Wise"]] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors focus:outline-none ${
                  tab === key ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Chart ── */}
        <div className="px-5 pb-5 pt-3 overflow-y-auto">
          {loading ? (
            <div className="h-[280px] flex items-center justify-center">
              <div className="skeleton h-full w-full rounded-lg" aria-hidden="true" />
            </div>
          ) : empty ? (
            <div className="h-[280px] flex flex-col items-center justify-center text-center">
              <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                  d="M3 17l6-6 4 4 8-8M21 7v6h-6" />
              </svg>
              <p className="text-sm font-semibold text-slate-500">No Cost History Available.</p>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Cost history is recorded during a manual Sync. Press Sync to capture this
                product&apos;s first data point.
              </p>
            </div>
          ) : series.length === 1 ? (
            // One point cannot draw a trend; say so rather than render a lone dot
            // on an axis that implies a line.
            <div className="h-[280px] flex flex-col items-center justify-center text-center">
              <p className="text-2xl font-extrabold font-mono text-slate-900">{money(series[0].cost)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Recorded {series[0].label}</p>
              <p className="mt-2 text-xs text-slate-400 max-w-sm">
                Only one price point so far — the trend line appears once the cost changes on a
                future sync.
              </p>
            </div>
          ) : (
            <CostLineChart data={series} xLabel={tab === "date" ? "Date" : "Month"} />
          )}
        </div>
      </div>
    </div>
  );
}
