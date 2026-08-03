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
 *
 * PRESENTATION. This is a bottom sheet, not a centred dialog, so it opens the
 * same way Quick View and the cart do. The spec grid above the table is Quick
 * View's — same `SPEC_ICON` map, same `splitSupplierSize`, imported rather than
 * copied so the two panels cannot drift apart.
 *
 * The grid is filled ENTIRELY from the row the table already holds; nothing here
 * fetches. WIDTH / PROFILE / RIM / LOAD-SPEED are decomposed from the row's own
 * `sizeFull` ("215/55 R18 99H" → 215 / 55 / 18 / 99H) — values already present,
 * just concatenated. WARRANTY has no source on a tc-products row (it lives on
 * the Magento product, behind a fetch) so it shows "-" rather than a guess.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  XMarkIcon,
  TruckIcon,
  InformationCircleIcon,
  ArrowsPointingOutIcon,
  CheckBadgeIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { getCachedSupplierProducts, type CachedSupplierProduct } from "@/services/cache";
import { SPEC_ICON, splitSupplierSize } from "@/components/QuickViewModal";

/** Quick View's icons, plus the three cells that only exist on this panel. */
const ICON = {
  ...SPEC_ICON,
  "TYRE SIZE": ArrowsPointingOutIcon,
  RUNFLAT: CheckBadgeIcon,
  ORIGIN: GlobeAltIcon,
};

export interface CheckSupplierProduct {
  itemCode: string;
  brand: string;
  size: string;
  sizeFull?: string;
  pattern?: string;
  /** Unit price off the tc-products row, shown under the product name. */
  price?: number;
  year?: number;
  /** Country of origin, with its flag emoji when the row carries one. */
  country?: string;
  flag?: string;
  runflat?: boolean;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compare loosely on case/spacing only — never on partial text. */
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Shown when the row carries no value. Never a made-up default. */
const UNKNOWN = "-";

/**
 * RunFlat, rendered the way the tc-products table renders it: "Runflat" or "-".
 *
 * NOT "Yes"/"No". A tc row's `runflat` is derived as `label !== ""`, so `false`
 * means "the attribute is absent", not "this tyre is not runflat" — printing
 * "No" would assert something the data never said, and would contradict the
 * table this panel opens from, which shows "-" for the same row.
 *
 * The supplier feed types the field `boolean | string | number` and, measured
 * across all 8,251 cached rows, only ever holds "" (5,762), null (2,159),
 * "Runflat" (244) or "RunFlat" (86) — there is no explicit negative in it
 * either. So both sides collapse to the same two states.
 */
function runflatText(v: boolean | string | number | undefined | null): string {
  if (v === undefined || v === null || v === "") return UNKNOWN;
  if (typeof v === "boolean") return v ? "Runflat" : UNKNOWN;
  const s = String(v).trim().toLowerCase();
  if (["0", "n", "no", "false"].includes(s)) return UNKNOWN;
  if (["1", "y", "yes", "true", "runflat"].includes(s)) return "Runflat";
  return String(v).trim();
}

/** One spec cell, styled exactly as Quick View's. */
function SpecCell({ label, value, info }: { label: string; value: string; info?: boolean }) {
  const Icon = ICON[label as keyof typeof ICON];
  return (
    <div className="bg-white border border-slate-200 rounded-lg py-2 px-1.5 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors">
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && (
          <span className="w-3.5 h-3.5 rounded-full bg-[#008b47]/10 text-[#008b47] flex items-center justify-center shrink-0">
            <Icon className="w-2 h-2 stroke-[2.5]" />
          </span>
        )}
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="text-xs font-bold text-slate-900 truncate w-full flex items-center justify-center gap-0.5">
        <span className="truncate">{value}</span>
        {info && <InformationCircleIcon className="w-3 h-3 text-slate-400 shrink-0" />}
      </div>
    </div>
  );
}

export default function CheckSupplierModal({
  product,
  onCloseAction,
}: {
  product: CheckSupplierProduct;
  onCloseAction: () => void;
}) {
  const [rows, setRows] = useState<CachedSupplierProduct[] | null>(null);

  /* Mount hidden, slide up on the next tick, slide down before unmount. */
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const handleClose = () => {
    setIsClosing(true);
    closeTimer.current = setTimeout(onCloseAction, 500);
  };

  useEffect(() => {
    let alive = true;
    void getCachedSupplierProducts()
      .then((all) => {
        if (!alive) return;
        const sku = norm(product.itemCode);
        const bySku = sku ? all.filter((r) => norm(r.sku) === sku) : [];
        const brand = norm(product.brand);
        const size = norm(product.size);
        const byAttrs =
          brand && size
            ? all.filter((r) => norm(r.brand) === brand && norm(r.size) === size)
            : [];

        /* Both predicates above are UNCHANGED. What changed is that a SKU hit no
           longer returns early and throws the brand+size set away.

           That early return was why the table only ever showed `competitor`
           rows: a supplier-source record's sku looks like
           "TYR-STEC-M9-18055_MEZ", never a storefront "TCKL-…" code, so a SKU
           match ALWAYS lands on a competitor row — and discarding brand+size
           discarded the only route by which a supplier row can match at all.

           Unioning them (SKU hits first, then brand+size, deduped by id so a
           record satisfying both appears once) is what puts Supplier and
           Competitor records in the same table. */
        const merged = [
          ...new Map([...bySku, ...byAttrs].map((r) => [String(r.id), r])).values(),
        ];
        setRows(merged);
      })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [product.itemCode, product.brand, product.size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Cheapest first — the reason to open this panel at all. */
  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0)),
    [rows],
  );

  /* ── Spec grid, all of it off the row already in hand ── */
  const parts = useMemo(
    () => splitSupplierSize(product.sizeFull || product.size || ""),
    [product.sizeFull, product.size],
  );

  /* The pattern usually already carries the brand ("AC Delco ACD-27-44 12V
     44AH"), so prefixing it again reads as a stutter. */
  const displayName = (() => {
    const brand = (product.brand || "").trim();
    const pattern = (product.pattern || "").trim();
    if (!pattern) return brand || product.itemCode;
    if (!brand || pattern.toLowerCase().startsWith(brand.toLowerCase())) return pattern;
    return `${brand} ${pattern}`;
  })();

  const row1 = [
    { label: "WIDTH", value: parts.width ? `${parts.width} mm` : UNKNOWN },
    { label: "PROFILE", value: parts.profile || UNKNOWN },
    { label: "RIM SIZE", value: parts.rim ? `R${parts.rim}` : UNKNOWN },
    { label: "LOAD/SPEED", value: parts.load || UNKNOWN },
  ];

  const row2 = [
    { label: "BRAND", value: product.brand || UNKNOWN },
    { label: "PATTERN", value: product.pattern || UNKNOWN },
    { label: "TYRE SIZE", value: product.sizeFull || product.size || UNKNOWN, info: true },
    { label: "YEAR", value: product.year && product.year > 0 ? String(product.year) : UNKNOWN },
  ];

  // RUNFLAT is a boolean on the row, so "No" is a real answer, not a missing one.
  // ORIGIN is the row's country (with its flag). WARRANTY lives on the Magento
  // product, not on a tc-products row, so it is a dash rather than an assumed
  // "1 Year Warranty".
  const row3 = [
    { label: "RUNFLAT", value: runflatText(product.runflat) },
    { label: "ORIGIN", value: [product.flag, product.country].filter(Boolean).join(" ") || UNKNOWN },
    { label: "WARRANTY", value: UNKNOWN },
    { label: "SKU", value: product.itemCode || UNKNOWN },
  ];

  const loading = rows === null;
  const empty = !loading && sorted.length === 0;
  const shown = isOpen && !isClosing;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-500 ease-out ${
        shown ? "opacity-100 bg-slate-900/50 backdrop-blur-sm" : "opacity-0 bg-black/0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Check supplier"
    >
      <div
        className={`relative w-full max-w-full bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 flex flex-col overflow-hidden max-h-[92vh] transition-transform duration-500 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
            <TruckIcon className="w-4 h-4 text-slate-400" />
            Supplier availability
          </h2>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          {/* Brand chip, product name, price */}
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-black uppercase text-[#008b47] tracking-widest flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#008b47]" />
                {product.brand || "—"} TIRES
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 leading-tight">{displayName}</h1>
            {product.price !== undefined && product.price > 0 && (
              <p className="mt-1 text-lg font-black text-slate-900">
                AED <span className="text-[#008b47]">{money(product.price)}</span>
                <span className="ml-1.5 text-[11px] font-semibold text-slate-400">per tyre</span>
              </p>
            )}
          </div>

          {/* Product Specifications */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Product Specifications
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {row1.map((s) => <SpecCell key={s.label} {...s} />)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {row2.map((s) => <SpecCell key={s.label} {...s} />)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {row3.map((s) => <SpecCell key={s.label} {...s} />)}
            </div>
          </div>

          {/* Supplier rows */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
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
              <div className="overflow-x-auto">
                {/* The SAME five fields as the section above, so the operator can
                    read straight down each column and compare. */}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="text-left py-2 px-5">Brand</th>
                      <th className="text-left py-2 px-3">Tyre Size</th>
                      <th className="text-left py-2 px-3">RunFlat</th>
                      <th className="text-left py-2 px-3">Origin</th>
                      <th className="text-left py-2 px-5">Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={`${r.id}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="py-2 px-5 font-bold text-slate-800">
                          <span className="inline-flex items-center gap-1.5">
                            {r.brand || "-"}
                            {/* Same badge the removed Type column used, so the two
                                record kinds stay distinguishable now they share a table. */}
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              r.product_source === "competitor"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}>
                              {r.product_source || "supplier"}
                            </span>
                            {/* WHO the record came from. Without it two listings of
                                the same tyre from different sites (tyrescart vs
                                pitstop) render as identical rows, because none of
                                the five columns is a field that differs between
                                them. */}
                            {r.source_name && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-white text-slate-500 border border-slate-200">
                                {r.source_name}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700">{r.size || "-"}</td>
                        <td className="py-2 px-3 text-slate-600">{runflatText(r.runflat)}</td>
                        <td className="py-2 px-3 text-slate-600">{r.country || "-"}</td>
                        <td className="py-2 px-5 text-slate-500">{r.year || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
