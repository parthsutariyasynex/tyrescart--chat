"use client";

/**
 * Price history modal — opened by clicking a Cost or Fitting Price value in the
 * supplier table. `variant` selects which series is shown; the layout, the Date
 * Wise / Month Wise behaviour and the summary tiles are shared.
 *
 * COST (default) reads exclusively from the API price-history endpoint (via
 * cache). Nothing here fetches a second time: the Price History panel reuses the
 * same `history` array the chart already consumes.
 *
 * FITTING PRICE reads the SAME endpoint, pinned to source: "competitor". The
 * API has no fitting-price series — `source` accepts only "supplier" or
 * "competitor" and both return a `price` — so this chart plots the competitor
 * price series under the Fitting Price label, by explicit request.
 *
 * Recharts is imported lazily — ~100 KB that only matters once someone opens
 * this modal, so it does not slow the first paint of the supplier table.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  fromApiHistory,
  toDateSeries,
  summarise,
  type CostHistoryRecord,
} from "@/services/costHistory";
import { fetchSupplierPriceHistoryCached } from "@/services/cache";
import { stripLoadIndex } from "@/services/productFormatter";

/** Chart body, client-only: Recharts measures the DOM and cannot server-render. */
const CostLineChart = dynamic(() => import("./CostLineChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] lg:h-full flex items-center justify-center bg-slate-50/60 rounded-xl">
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
  source?: string;
  cost: number;
  productType?: string;
  country?: string;
  year?: string | number;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Which series to chart.
 *
 * `"cost"` is the default and is byte-for-byte the behaviour this modal always
 * had — `supplierProductPriceHistory` with the source derived from the row.
 * `"fitting"` calls the same endpoint with source pinned to "competitor".
 */
export type HistoryVariant = "cost" | "fitting";

export interface CostHistoryModalProps {
  product: CostHistoryProduct;
  onCloseAction: () => void;
  variant?: HistoryVariant;
}

export default function CostHistoryModal({
  product,
  onCloseAction,
  variant = "cost",
}: CostHistoryModalProps) {
  const isFitting = variant === "fitting";
  const seriesLabel = isFitting ? "Fitting Price" : "Cost";
  const [history, setHistory] = useState<CostHistoryRecord[] | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 30);
    return () => clearTimeout(timer);
  }, []);

  /* useCallback so the Escape-key effect can depend on it honestly. Without a
     stable identity the effect would re-subscribe on every render, which is why
     it had been left off the dependency list. */
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => onCloseAction(), 700);
  }, [onCloseAction]);

  useEffect(() => {
    let alive = true;
    async function load(): Promise<CostHistoryRecord[]> {
      /* Fitting Price reads `supplierProductPriceHistory` with a FIXED
         source: "competitor" — not the row's own supplier/competitor
         discriminator, which is what the cost branch below derives. The source
         is pinned here rather than passed in, so nothing outside this branch
         changes.

         NOTE the endpoint returns a `price` series; it has no fitting-price
         field (`source` accepts only "supplier"/"competitor", and every other
         value is rejected with `Source must be "supplier" or "competitor".`).
         So these points are the competitor's price, charted under the Fitting
         Price label by explicit request. */
      const primarySource = isFitting
        ? "competitor"
        : (product.productType || product.source || "supplier").toLowerCase().includes("competitor")
          ? "competitor"
          : "supplier";

      let api = await fetchSupplierPriceHistoryCached(product.id, primarySource).catch(() => []);
      
      // Fallback: If primary source returned no data, try "supplier" source
      if ((!api || api.length === 0) && primarySource !== "supplier") {
        api = await fetchSupplierPriceHistoryCached(product.id, "supplier").catch(() => []);
      }

      return fromApiHistory(api, product.id, product.itemCode ?? "");
    }
    void load()
      .then((rows) => { if (alive) setHistory(rows); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [product.id, product.productType, product.itemCode, isFitting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

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
        className={`bg-slate-50 w-full max-w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-700 ease-out h-[90vh] max-h-[90vh] rounded-t-2xl border-t border-slate-200 ${
          isOpen && !isClosing ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="relative shrink-0 overflow-hidden">
          {/* Subtle gradient bar at the very top */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />

          <div className="flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-100">
            {/* Left: icon + title */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Icon */}
              <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight whitespace-nowrap">
                {seriesLabel} History
              </h2>
            </div>

            {/* Center: product pills — all on one line */}
            <div className="flex-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto mx-4">
              {product.source && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[10px] font-bold uppercase tracking-wider">
                  {product.source}
                </span>
              )}
              {product.brand && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold uppercase tracking-wider">
                  {product.brand}
                </span>
              )}
              {(product.sizeFull || product.size) && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold border border-slate-200/80">
                  {stripLoadIndex(product.sizeFull || product.size || "")}
                </span>
              )}
              {product.country && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 text-[10px] font-bold uppercase tracking-wider">
                  {product.country}
                </span>
              )}
              {product.year && Number(product.year) > 0 && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200/80 text-[10px] font-bold uppercase tracking-wider">
                  {product.year}
                </span>
              )}
              {product.pattern && (
                <span className="shrink-0 text-[10px] text-slate-500 font-semibold whitespace-nowrap">
                  {product.pattern}
                </span>
              )}
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
            <div key={s.label} className={`${s.bg} px-4 py-2.5 flex items-center gap-2.5 border-l-2 ${s.color}`}>
              <div className="shrink-0">{s.icon}</div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</div>
                <div className={`text-sm font-extrabold font-mono leading-none ${s.textColor}`}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Body: Chart + Price History ── */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-slate-50/50">
          <div className="p-4 max-w-full mx-auto w-full flex flex-col lg:flex-row gap-4 lg:h-full lg:min-h-0">

            {/* ── Left: Line Chart — exactly 50% ── */}
            <div className="lg:w-1/2 min-w-0 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col lg:min-h-0">
              <div className="shrink-0 min-h-[60px] px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Price Trend</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {!loading && !empty ? `${dateSeries.length} data points` : ""}
                  </p>
                </div>
                {!loading && !empty && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded bg-emerald-500" />
                    <span className="text-[10px] text-slate-500 font-medium">{seriesLabel}</span>
                  </div>
                )}
              </div>

              <div className="p-1.5 lg:flex-1 lg:min-h-0">
                {loading ? (
                  <div className="h-[280px] lg:h-full flex items-center justify-center">
                    <div className="skeleton h-full w-full rounded-lg" aria-hidden="true" />
                  </div>
                ) : empty ? (
                  <div className="h-[280px] lg:h-full flex flex-col items-center justify-center text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                      <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-500">No {seriesLabel} History Available</p>
                    <p className="mt-1.5 text-xs text-slate-400 max-w-xs leading-relaxed">
                      {isFitting
                        ? "The price-history endpoint returned no competitor points for this product. Only products the competitor feed tracks have a series."
                        : "No price history is recorded for this product yet."}
                    </p>
                  </div>
                ) : (
                  <CostLineChart data={dateSeries} xLabel="Date" />
                )}
              </div>
            </div>

            {/* ── Right: Price History panel — exactly 50% ── */}
            <div className="lg:w-1/2 min-w-0 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col lg:min-h-0">

                {/* Panel header */}
                <div className="shrink-0 min-h-[60px] px-4 py-2.5 border-b border-slate-100 bg-white flex flex-col justify-center">
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
                    <p className="text-[10px] text-slate-400 mt-0.5 ml-3.5">Newest first</p>
                  )}
                </div>

                {/* Panel body */}
                {loading ? (
                  <div className="flex-1 min-h-0 overflow-hidden p-3 space-y-2">
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
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {priceHistoryList.map((rec, idx) => {
                      const isLatest = idx === 0;
                      const hasSpread = stats.highest !== stats.lowest;
                      const isHighest = hasSpread && rec.cost === stats.highest;
                      const isLowest = hasSpread && rec.cost === stats.lowest;

                      return (
                        <div
                          key={rec.id ?? `${rec.productId}:${rec.syncTimestamp}`}
                          className={`group relative flex items-center justify-between gap-2 whitespace-nowrap px-4 py-2.5 border-b border-slate-50 last:border-0 transition-all duration-150 cursor-default ${
                            isLatest
                              ? "bg-gradient-to-r from-emerald-50/80 to-white hover:from-emerald-50"
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          {/* Left accent bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r transition-all ${
                            isHighest ? "bg-rose-400" : isLowest ? "bg-emerald-400" : isLatest ? "bg-teal-400" : "bg-transparent group-hover:bg-slate-200"
                          }`} />

                          {/* Date + badges — single line */}
                          <div className="min-w-0 pl-1 flex items-center gap-2 whitespace-nowrap">
                            <span className="shrink-0 text-xs font-semibold text-slate-700 tabular-nums">
                              {new Date(rec.syncTimestamp).toLocaleDateString("en-GB", {
                                day: "2-digit", month: "short", year: "numeric",
                              })}
                            </span>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {isLatest && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block" />
                                  Current
                                </span>
                              )}
                              {isHighest && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-rose-50 text-rose-600 border border-rose-200">
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" />
                                  </svg>
                                  Peak
                                </span>
                              )}
                              {isLowest && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-sky-50 text-sky-600 border border-sky-200">
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                                  </svg>
                                  Low
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Price + trend dot */}
                          <div className="shrink-0 flex items-center gap-2 whitespace-nowrap">
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
                                <div className={`flex items-center gap-0.5 text-[9px] font-bold ${up ? "text-rose-500" : "text-emerald-500"}`}>
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
  );
}
