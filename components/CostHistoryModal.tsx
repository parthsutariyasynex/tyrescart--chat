"use client";

/**
 * Cost History modal — opened by clicking a Cost value in the supplier table.
 *
 * Reads exclusively from the API price-history endpoint (via cache). Nothing
 * here fetches a second time: the Price History panel reuses the same
 * `history` array the chart already consumes.
 *
 * Recharts is imported lazily — ~100 KB that only matters once someone opens
 * this modal, so it does not slow the first paint of the supplier table.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  fromApiHistory,
  toDateSeries,
  summarise,
  type CostHistoryRecord,
} from "@/services/costHistory";
import { fetchSupplierPriceHistoryCached } from "@/services/cache";

/** Chart body, client-only: Recharts measures the DOM and cannot server-render. */
const CostLineChart = dynamic(() => import("./CostLineChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] flex items-center justify-center bg-slate-50/60 rounded-xl">
      <div className="skeleton h-full w-full rounded-xl" aria-hidden="true" />
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
  cost: number;
  productType?: string;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface CostHistoryModalProps {
  product: CostHistoryProduct;
  onCloseAction: () => void;
}

export default function CostHistoryModal({
  product,
  onCloseAction,
}: CostHistoryModalProps) {
  const [history, setHistory] = useState<CostHistoryRecord[] | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 30);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => onCloseAction(), 700);
  };

  useEffect(() => {
    let alive = true;
    async function load(): Promise<CostHistoryRecord[]> {
      const source = (product.productType || "supplier").toLowerCase().includes("competitor")
        ? "competitor"
        : "supplier";
      const api = await fetchSupplierPriceHistoryCached(product.id, source).catch(() => []);
      return fromApiHistory(api, product.id, product.itemCode ?? "");
    }
    void load()
      .then((rows) => { if (alive) setHistory(rows); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [product.id, product.productType, product.itemCode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dateSeries = useMemo(() => toDateSeries(history ?? []), [history]);
  const stats = useMemo(() => summarise(history ?? []), [history]);

  const priceHistoryList = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history].sort((a, b) => b.syncTimestamp - a.syncTimestamp);
  }, [history]);

  const loading = history === null;
  const empty = !loading && (history?.length ?? 0) === 0;

  const STAT_CARDS = [
    {
      label: "Current Price",
      value: money(empty ? product.cost : stats.current),
      color: "border-slate-400",
      textColor: "text-slate-900",
      bg: "bg-white",
      icon: (
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Highest",
      value: empty ? "—" : money(stats.highest),
      color: "border-rose-400",
      textColor: "text-rose-600",
      bg: "bg-rose-50/40",
      icon: (
        <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      label: "Lowest",
      value: empty ? "—" : money(stats.lowest),
      color: "border-emerald-400",
      textColor: "text-emerald-600",
      bg: "bg-emerald-50/40",
      icon: (
        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      ),
    },
    {
      label: "Average",
      value: empty ? "—" : money(stats.average),
      color: "border-violet-400",
      textColor: "text-violet-700",
      bg: "bg-violet-50/30",
      icon: (
        <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "Last Updated",
      value: stats.lastUpdated
        ? new Date(stats.lastUpdated).toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
          })
        : "—",
      color: "border-sky-400",
      textColor: "text-sky-700",
      bg: "bg-sky-50/30",
      icon: (
        <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-700 ease-out ${
        isOpen && !isClosing
          ? "opacity-100 bg-black/50 backdrop-blur-sm"
          : "opacity-0 bg-black/0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cost history"
    >
      <div
        className={`bg-white w-full max-w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-700 ease-out max-h-[90vh] rounded-t-2xl ${
          isOpen && !isClosing ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="relative shrink-0 overflow-hidden">
          {/* Subtle gradient bar at the very top */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />

          <div className="flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              {/* Icon */}
              <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                <svg className="w-4.5 h-4.5 text-white w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>

              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">
                  Cost History
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  {product.brand && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold uppercase tracking-wider">
                      {product.brand}
                    </span>
                  )}
                  {(product.sizeFull || product.size) && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold border border-slate-200/80">
                      {product.sizeFull || product.size}
                    </span>
                  )}
                  {product.pattern && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[24rem] font-medium">
                      {product.pattern}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              title="Close"
              aria-label="Close"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all focus:outline-none hover:scale-105 active:scale-95"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-100 border-b border-slate-100">
          {STAT_CARDS.map((s) => (
            <div key={s.label} className={`${s.bg} px-4 py-3 flex items-start gap-2.5 border-l-2 ${s.color}`}>
              <div className="mt-0.5 shrink-0">{s.icon}</div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</div>
                <div className={`text-sm font-extrabold font-mono leading-none ${s.textColor}`}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Body: Chart + Price History ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="px-5 py-5 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-4 h-full">

            {/* ── Left: Line Chart (70%) ── */}
            <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-1 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Price Trend</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {!loading && !empty ? `${dateSeries.length} data points` : ""}
                  </p>
                </div>
                {!loading && !empty && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded bg-emerald-500" />
                    <span className="text-[10px] text-slate-500 font-medium">Cost</span>
                  </div>
                )}
              </div>

              <div className="px-2 py-3">
                {loading ? (
                  <div className="h-[280px] flex items-center justify-center">
                    <div className="skeleton h-full w-full rounded-lg" aria-hidden="true" />
                  </div>
                ) : empty ? (
                  <div className="h-[280px] flex flex-col items-center justify-center text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                      <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-500">No Cost History Available</p>
                    <p className="mt-1.5 text-xs text-slate-400 max-w-xs leading-relaxed">
                      Cost history is recorded during a manual Sync. Press Sync to capture
                      this product&apos;s first data point.
                    </p>
                  </div>
                ) : (
                  <CostLineChart data={dateSeries} xLabel="Date" />
                )}
              </div>
            </div>

            {/* ── Right: Price History panel (30%) ── */}
            <div className="lg:w-[30%] shrink-0 flex flex-col">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col overflow-hidden flex-1">

                {/* Panel header */}
                <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                      <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Price History
                      </h3>
                    </div>
                    {!loading && !empty && (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {priceHistoryList.length} records
                      </span>
                    )}
                  </div>
                  {!loading && !empty && (
                    <p className="text-[10px] text-slate-400 mt-1 ml-3.5">Newest first</p>
                  )}
                </div>

                {/* Panel body */}
                {loading ? (
                  <div className="flex-1 p-3 space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="skeleton rounded-lg"
                        style={{ height: 52, opacity: 1 - i * 0.12 }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                ) : empty ? (
                  <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                      <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">No records yet</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                    {priceHistoryList.map((rec, idx) => {
                      const isLatest = idx === 0;
                      const hasSpread = stats.highest !== stats.lowest;
                      const isHighest = hasSpread && rec.cost === stats.highest;
                      const isLowest = hasSpread && rec.cost === stats.lowest;

                      return (
                        <div
                          key={rec.id ?? `${rec.productId}:${rec.syncTimestamp}`}
                          className={`group relative flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-50 last:border-0 transition-all duration-150 cursor-default ${
                            isLatest
                              ? "bg-gradient-to-r from-emerald-50/80 to-white hover:from-emerald-50"
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          {/* Left accent bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r transition-all ${
                            isHighest ? "bg-rose-400" : isLowest ? "bg-emerald-400" : isLatest ? "bg-teal-400" : "bg-transparent group-hover:bg-slate-200"
                          }`} />

                          {/* Date + badges */}
                          <div className="min-w-0 pl-1">
                            <span className="text-xs font-semibold text-slate-700 tabular-nums">
                              {new Date(rec.syncTimestamp).toLocaleDateString("en-GB", {
                                day: "2-digit", month: "short", year: "numeric",
                              })}
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              {isLatest && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block" />
                                  Current
                                </span>
                              )}
                              {isHighest && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-rose-50 text-rose-600 border border-rose-200">
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" />
                                  </svg>
                                  Peak
                                </span>
                              )}
                              {isLowest && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-sky-50 text-sky-600 border border-sky-200">
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                                  </svg>
                                  Low
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Price + trend dot */}
                          <div className="shrink-0 text-right">
                            <div className={`text-sm font-extrabold font-mono tabular-nums ${
                              isHighest ? "text-rose-600"
                                : isLowest ? "text-sky-600"
                                : isLatest ? "text-slate-900"
                                : "text-slate-600"
                            }`}>
                              {money(rec.cost)}
                            </div>
                            {/* Subtle change from previous */}
                            {idx < priceHistoryList.length - 1 && (() => {
                              const prev = priceHistoryList[idx + 1].cost;
                              const diff = rec.cost - prev;
                              if (diff === 0) return null;
                              const up = diff > 0;
                              return (
                                <div className={`flex items-center justify-end gap-0.5 mt-0.5 text-[9px] font-bold ${up ? "text-rose-500" : "text-emerald-500"}`}>
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3"
                                      d={up ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                  </svg>
                                  {Math.abs(diff).toFixed(2)}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
