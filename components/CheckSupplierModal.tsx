"use client";

/**
 * Check Supplier — what the supplier feed holds for one tc-products row.
 *
 * Reads the already-synced supplier catalogue out of IndexedDB. No network call:
 * the rows are the same ones /supplier-products renders, so this works offline
 * and costs nothing beyond one read of a store that is ~8,251 rows since the
 * latest-only change.
 *
 * Matching is SKU first, then brand + size. That order matters: supplier rows
 * sourced from `tyrescart` carry the SAME `TCKL-…` sku as the storefront
 * product, so a SKU hit is exact. Everything else is matched on brand + size,
 * which is what an operator actually wants here — "who has this tyre, and at
 * what cost" — rather than a single guessed row.
 */

import { useEffect, useMemo, useState } from "react";
import { XMarkIcon, TruckIcon } from "@heroicons/react/24/outline";
import { getCachedSupplierProducts, type CachedSupplierProduct } from "@/services/cache";

export interface CheckSupplierProduct {
  itemCode: string;
  brand: string;
  size: string;
  sizeFull?: string;
  pattern?: string;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compare loosely on case/spacing only — never on partial text. */
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export default function CheckSupplierModal({
  product,
  onCloseAction,
}: {
  product: CheckSupplierProduct;
  onCloseAction: () => void;
}) {
  const [rows, setRows] = useState<CachedSupplierProduct[] | null>(null);
  const [matchedBy, setMatchedBy] = useState<"sku" | "brand+size" | null>(null);

  useEffect(() => {
    let alive = true;
    void getCachedSupplierProducts()
      .then((all) => {
        if (!alive) return;
        const sku = norm(product.itemCode);
        const bySku = sku ? all.filter((r) => norm(r.sku) === sku) : [];
        if (bySku.length) {
          setRows(bySku);
          setMatchedBy("sku");
          return;
        }
        const brand = norm(product.brand);
        const size = norm(product.size);
        const byAttrs =
          brand && size
            ? all.filter((r) => norm(r.brand) === brand && norm(r.size) === size)
            : [];
        setRows(byAttrs);
        setMatchedBy(byAttrs.length ? "brand+size" : null);
      })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [product.itemCode, product.brand, product.size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseAction(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCloseAction]);

  /** Cheapest first — the reason to open this panel at all. */
  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0)),
    [rows],
  );

  const loading = rows === null;
  const empty = !loading && sorted.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onCloseAction}
      role="dialog"
      aria-modal="true"
      aria-label="Check supplier"
    >
      <div
        className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200/80">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
              <TruckIcon className="w-4 h-4 text-slate-400" />
              Supplier availability
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
              <span className="font-bold text-slate-700">{product.brand}</span>
              <span className="font-mono">{product.sizeFull || product.size}</span>
              {product.pattern && <span className="truncate max-w-[20rem]">{product.pattern}</span>}
              <span className="font-mono text-slate-400">{product.itemCode}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseAction}
            title="Close"
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-lg" aria-hidden="true" />
              ))}
            </div>
          ) : empty ? (
            <div className="py-14 text-center px-6">
              <p className="text-sm font-semibold text-slate-500">No supplier stocks this tyre.</p>
              <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                Nothing in the synced supplier catalogue matches this SKU, or this brand and
                size. If the supplier feed has not been synced on this device yet, run Sync on
                the Supplier page first.
              </p>
            </div>
          ) : (
            <>
              <p className="px-5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {sorted.length} supplier row{sorted.length === 1 ? "" : "s"} · matched by{" "}
                {matchedBy === "sku" ? "SKU" : "brand + size"} · cheapest first
              </p>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="text-left py-2 px-5">Supplier</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Pattern</th>
                    <th className="text-left py-2 px-3">Year</th>
                    <th className="text-right py-2 px-3">Cost</th>
                    <th className="text-right py-2 px-5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={`${r.id}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="py-2 px-5 font-bold text-slate-800">{r.source_name || "-"}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          r.product_source === "competitor"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {r.product_source || "supplier"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 truncate max-w-[16rem]">{r.product_name || "-"}</td>
                      <td className="py-2 px-3 text-slate-500">{r.year || "-"}</td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-900">
                        {/* Competitor rows carry `price`, supplier rows `cost`. */}
                        {money(Number(r.product_source === "competitor" ? r.price : r.cost) || 0)}
                      </td>
                      <td className="py-2 px-5 text-right text-slate-400 font-mono">{r.date || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
