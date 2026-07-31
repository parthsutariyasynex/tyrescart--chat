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
  fromApiHistory,
  toDateSeries,
  toMonthSeries,
  summarise,
  type CostHistoryRecord,
} from "@/services/costHistory";
import { fetchSupplierPriceHistoryCached } from "@/services/cache";

/** Chart body, client-only: Recharts measures the DOM and cannot server-render. */
const CostLineChart = dynamic(() => import("./CostLineChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] flex items-center justify-center">
      <div className="skeleton h-full w-full rounded-none" aria-hidden="true" />
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
  /** The feed's `product_source` discriminator, "Supplier" or "Competitor".
   *  Selects which series the API returns: our cost, or a competitor's price. */
  productType?: string;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Tab = "date" | "month";

export interface CostHistoryModalProps {
  product: CostHistoryProduct;
  onCloseAction: () => void;
}

export default function CostHistoryModal({
  product,
  onCloseAction,
}: CostHistoryModalProps) {
  const [history, setHistory] = useState<CostHistoryRecord[] | null>(null);
  const [tab, setTab] = useState<Tab>("date");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  useEffect(() => {
    // Trigger smooth slow open slide-up after mount
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onCloseAction();
    }, 700); // 700ms ultra-smooth slow closing duration
  };

  // Reading an external store (IndexedDB) into state is the sanctioned effect
  // use. `setHistory(null)` is NOT done here — resetting state in an effect body
  // is what triggers a cascading render; the modal is keyed on product.id by its
  // parent, so a different product mounts a fresh component with history=null.
  useEffect(() => {
    let alive = true;

    /**
     * `supplierProductPriceHistory` is the authoritative series — real observed
     * prices, not just the points this browser happened to record during a manual
     * sync. `source` follows the row's own discriminator, so a competitor row
     * charts the competitor's price and a supplier row charts our cost.
     *
     * IndexedDB stays the fallback: it is what the chart used before the endpoint
     * existed, and it keeps the chart working offline. Only consulted when the
     * API returns nothing, so real history always wins.
     */
    async function load(): Promise<CostHistoryRecord[]> {
      const source = (product.productType || "supplier").toLowerCase().includes("competitor")
        ? "competitor"
        : "supplier";

      const api = await fetchSupplierPriceHistoryCached(product.id, source).catch(() => []);
      if (api.length) return fromApiHistory(api, product.id, product.itemCode ?? "");

      return getCostHistory(product.id).catch(() => []);
    }

    void load()
      .then((rows) => { if (alive) setHistory(rows); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [product.id, product.productType, product.itemCode]);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dateSeries = useMemo(() => toDateSeries(history ?? []), [history]);
  const monthSeries = useMemo(() => toMonthSeries(history ?? []), [history]);
  const stats = useMemo(() => summarise(history ?? []), [history]);

  const series = tab === "date" ? dateSeries : monthSeries;
  const loading = history === null;
  const empty = !loading && (history?.length ?? 0) === 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-700 ease-out ${
        isOpen && !isClosing ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cost history"
    >
      <div
        className={`bg-white w-full max-w-full border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden transition-all duration-700 ease-out max-h-[92vh] rounded-none ${
          isOpen && !isClosing
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200/80 bg-white shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Cost History Graph</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {product.brand && (
                <span className="px-2 py-0.5 rounded-none bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold uppercase tracking-wide">
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
            onClick={handleClose}
            title="Close"
            aria-label="Close"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors focus:outline-none"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-200/70 border-b border-slate-200/80 shrink-0">
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
            <div key={s.label} className="bg-white px-5 py-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</div>
              <div className={`mt-0.5 text-base font-extrabold font-mono ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="px-6 pt-5 shrink-0 max-w-7xl mx-auto w-full">
          <div className="inline-flex p-0.5 bg-slate-100 rounded-none">
            {([["date", "Date Wise"], ["month", "Month Wise"]] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-xs font-extrabold rounded-none transition-colors focus:outline-none ${
                  tab === key ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Chart Area ── */}
        <div className="px-6 pb-6 pt-3 overflow-y-auto flex-1 max-w-7xl mx-auto w-full">
          {loading ? (
            <div className="h-[320px] flex items-center justify-center">
              <div className="skeleton h-full w-full rounded-none" aria-hidden="true" />
            </div>
          ) : empty ? (
            <div className="h-[320px] flex flex-col items-center justify-center text-center">
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
            <div className="h-[320px] flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-extrabold font-mono text-slate-900">{money(series[0].cost)}</p>
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
