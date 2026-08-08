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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  TruckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { fetchSupplierProductsGraphQL } from "@/services/graphql";
import { searchWithAspectRimFallback } from "@/services/searchFilter";
import type { SupplierProductItem } from "@/services/types";
import { buildRowString, stripLoadIndex } from "@/services/productFormatter";
import CostHistoryModal from "@/components/CostHistoryModal";
import { CATEGORY_BADGES_SEMANTIC } from "@/constants/badges";
import Pagination from "@/components/Pagination";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDateDDMM(rawDate?: string): string {
  if (!rawDate || !rawDate.trim()) return "-";
  const str = rawDate.trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const monthStr =
      MONTH_NAMES[d.getMonth()] || String(d.getMonth() + 1).padStart(2, "0");
    return `${day}-${monthStr}`;
  }
  const match =
    str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) ||
    str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    if (match[1].length === 4) {
      const day = match[3].padStart(2, "0");
      const monthIdx = parseInt(match[2], 10) - 1;
      const monthStr = MONTH_NAMES[monthIdx] || match[2].padStart(2, "0");
      return `${day}-${monthStr}`;
    } else {
      const day = match[1].padStart(2, "0");
      const monthIdx = parseInt(match[2], 10) - 1;
      const monthStr = MONTH_NAMES[monthIdx] || match[2].padStart(2, "0");
      return `${day}-${monthStr}`;
    }
  }
  return str;
}

/**
 * A supplier feed row as this modal consumes it.
 *
 * `SupplierProductItem` is the shared shape, but rows reaching here also carry
 * aliases the UI reads — `pattern`/`name` for the tyre pattern (the shared type
 * only has `product_name`), `qty`, and a plain `source`. They are optional
 * because which one is present depends on the feed the row came from.
 */
type SupplierRow = SupplierProductItem & {
  pattern?: string;
  name?: string;
  qty?: number | string;
  source?: string;
  category?: string;
  fitting_price?: number | string;
  date?: string;
};

/** Read a row column chosen at runtime. The sort field is a string set by a
 *  header click, so it cannot be narrowed to `keyof SupplierRow`. */
function readField(row: SupplierRow, field: string): unknown {
  if (field === "category") return row.category || row.brand_category;
  return (row as unknown as Record<string, unknown>)[field];
}

/**
 * Columns the tokenized search reads — the same `searchWithAspectRimFallback`
 * the product pages use, so comma-separated OR clauses ("kumho, hankook") and
 * the width-omitted size fallback ("55R16") behave identically here.
 */
const SEARCH_FIELDS = [
  "brand",
  "product_name",
  "pattern",
  "name",
  "sku",
  "source_name",
  "product_source",
  "source",
  "country",
  "size",
] as const;

/** Numeric tokens go to the size only — same rule as the pages. */
const SEARCH_SIZE_FIELDS = ["size"] as const;

/**
 * Plain-substring pass, UNIONed with the tokenized one above.
 *
 * Needed because the tokenizer routes any all-digit token to the size fields,
 * so a cost ("241"), a year ("2026") or a qty could never reach its own column
 * no matter which fields were listed. Union, never replacement: the tokenized
 * matches keep their order and the substring-only extras follow.
 */
const GLOBAL_SEARCH_FIELDS = [
  ...SEARCH_FIELDS,
  "cost",
  "price",
  "set_price",
  "fitting_price",
  "year",
  "qty",
  "runflat",
  "date",
] as const;

export interface CheckSupplierProduct {
  itemCode: string;
  brand: string;
  size: string;
  sizeFull?: string;
  pattern?: string;
  /** Unit price off the tc-products row, shown under the product name. */
  price?: number;
  /** The row's Set of 4 total. Shown only when the row carries one — never
   *  recomputed here, so this panel cannot disagree with the tc-products cell. */
  setOf4Price?: number;
  /** Promotion label off the tc-products row, e.g. "Buy 3 Get 1 Free". Shown in
   *  the header only when it holds a real promotion — see `validOffer`. */
  offer?: string;
  year?: number;
  /** Country of origin, with its flag emoji when the row carries one. */
  country?: string;
  flag?: string;
  runflat?: boolean;
}

const money = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Compare loosely on case/spacing only — never on partial text. */
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Shown when the row carries no value. Never a made-up default. */
const UNKNOWN = "-";

/**
 * The offer label to show, or "" when the product carries no promotion.
 *
 * tc-products renders its NO_API_FIELD em-dash for offerless products, so a
 * bare truthiness check would print "Offer: —" on every tyre without one. The
 * placeholders below are all treated as "no offer".
 */
function validOffer(offer: string | undefined | null): string {
  const trimmed = String(offer ?? "").trim();
  const placeholder = ["", "-", "—", "–", "n/a", "none", "no offer"];
  return placeholder.includes(trimmed.toLowerCase()) ? "" : trimmed;
}

function runflatText(v: boolean | string | number | undefined | null): string {
  if (v === undefined || v === null || v === "") return UNKNOWN;
  if (typeof v === "boolean") return v ? "Runflat" : UNKNOWN;
  const s = String(v).trim().toLowerCase();
  if (["0", "n", "no", "false"].includes(s)) return UNKNOWN;
  if (["1", "y", "yes", "true", "runflat"].includes(s)) return "Runflat";
  return String(v).trim();
}

export default function CheckSupplierModal({
  product,
  onCloseAction,
}: {
  product: CheckSupplierProduct;
  onCloseAction: () => void;
}) {
  const [rows, setRows] = useState<SupplierRow[] | null>(null);
  const [sortField, setSortField] = useState<string>("cost");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [costHistoryItem, setCostHistoryItem] = useState<SupplierRow | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** Filters the rows in this popup only. Not debounced: the list is capped at
   *  one API page, so filtering is cheap enough to run on every keystroke. */
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  /* Mount hidden, slide up on the next tick, slide down before unmount. */
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    closeTimer.current = setTimeout(onCloseAction, 500);
  }, [onCloseAction]);

  useEffect(() => {
    let alive = true;
    const searchBrand = product.brand ? product.brand.trim() : undefined;
    const searchSize = product.size ? product.size.trim() : undefined;

    // Fetch supplier/competitor items matching this product's brand and size from GraphQL API
    void fetchSupplierProductsGraphQL({
      brand: searchBrand,
      size: searchSize,
      pageSize: 100,
    })
      .then((res) => {
        if (!alive) return;
        setCurrentPage(1);
        const all = res.items || [];
        const sku = norm(product.itemCode);
        const bySku = sku ? all.filter((r) => norm(r.sku) === sku) : [];
        const brand = norm(product.brand);
        const size = norm(product.size);
        const byAttrs =
          brand && size
            ? all.filter(
                (r) => norm(r.brand) === brand && norm(r.size) === size,
              )
            : [];

        const matched = [
          ...new Map(
            [...bySku, ...byAttrs].map((r) => [String(r.id), r]),
          ).values(),
        ];
        setRows(
          matched.length > 0
            ? matched
            : all.filter(
                (r) => norm(r.brand) === brand || norm(r.size) === size,
              ),
        );
      })
      .catch(() => {
        if (alive) {
          setCurrentPage(1);
          setRows([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [product.itemCode, product.brand, product.size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim();
    if (!q) return rows;

    const tokenMatched = searchWithAspectRimFallback(
      rows,
      q,
      SEARCH_FIELDS,
      SEARCH_SIZE_FIELDS,
    );
    const needle = q.toLowerCase();
    const already = new Set(tokenMatched);
    const extra = rows.filter((r) => {
      if (already.has(r)) return false;
      return GLOBAL_SEARCH_FIELDS.some((f) => {
        const v = readField(r, f);
        if (v === null || v === undefined || v === "") return false;
        if (String(v).toLowerCase().includes(needle)) return true;
        // "241" should find a cost stored as 241 and rendered "241.00".
        return typeof v === "number" && v.toFixed(2).includes(needle);
      });
    });
    return extra.length ? [...tokenMatched, ...extra] : tokenMatched;
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!filtered.length) return [];
    const dir = sortOrder === "asc" ? 1 : -1;
    // Same code-unit ordering the `<` / `>` comparison gave — NOT localeCompare,
    // which collates accents and case differently.
    const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    const numeric =
      sortField === "cost" ||
      sortField === "qty" ||
      sortField === "year" ||
      sortField === "fitting_price";
    return [...filtered].sort((a, b) => {
      if (sortField === "year") {
        const getYear = (r: SupplierRow) => {
          const val = readField(r, "year");
          const num = Number(val);
          if (!isNaN(num) && num > 0) return num;
          if (product.year) {
            const pNum = Number(product.year);
            if (!isNaN(pNum) && pNum > 0) return pNum;
          }
          return 0;
        };
        const yA = getYear(a);
        const yB = getYear(b);
        if (yA === yB) return 0;
        if (yA === 0) return 1;
        if (yB === 0) return -1;
        return dir * (yA - yB);
      }
      if (sortField === "date") {
        const getDate = (r: SupplierRow) => {
          const dStr = String(
            readField(r, "date") || readField(r, "created_at") || "",
          );
          const t = new Date(dStr).getTime();
          return isNaN(t) ? 0 : t;
        };
        const dA = getDate(a);
        const dB = getDate(b);
        if (dA === dB) return 0;
        if (dA === 0) return 1;
        if (dB === 0) return -1;
        return dir * (dA - dB);
      }
      if (sortField === "source") {
        const pick = (r: SupplierRow) =>
          String(
            readField(r, "source_name") ||
              readField(r, "product_source") ||
              readField(r, "source") ||
              "",
          );
        return dir * cmp(pick(a), pick(b));
      }
      if (numeric) {
        return (
          dir *
          ((Number(readField(a, sortField)) || 0) -
            (Number(readField(b, sortField)) || 0))
        );
      }
      if (sortField === "runflat") {
        return (
          dir *
          ((readField(a, sortField) ? 1 : 0) -
            (readField(b, sortField) ? 1 : 0))
        );
      }
      return (
        dir *
        cmp(
          String(readField(a, sortField) ?? "").toLowerCase(),
          String(readField(b, sortField) ?? "").toLowerCase(),
        )
      );
    });
  }, [filtered, sortField, sortOrder, product.year]);

  const totalPages = Math.ceil(sorted.length / pageSize);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const copyRowData = (item: SupplierRow) => {
    const rowString = buildRowString({
      brand: item.brand,
      pattern: item.pattern || item.name,
      size: item.size,
      sizeFull: item.size,
      year: item.year,
      country: item.country,
      // Coerced: the feed sends qty as a string on some rows, and the formatter
      // takes a number. Under `any` this mismatch passed through unnoticed.
      qty: item.qty == null ? null : Number(item.qty) || 0,
      cost: Number(item.cost) || 0,
    });
    navigator.clipboard.writeText(rowString);
    showToast(`Copied product details to clipboard!`);
  };



  const displayName = (() => {
    const brand = (product.brand || "").trim();
    const pattern = (product.pattern || "").trim();
    const raw = !pattern
      ? brand || product.itemCode
      : !brand || pattern.toLowerCase().startsWith(brand.toLowerCase())
        ? pattern
        : `${brand} ${pattern}`;

    // Remove load index / speed rating (e.g. 97/95R, 89V, 91V, 109/107T)
    return raw
      .replace(/\b\d{2,3}(?:\/\d{2,3})?[A-Za-z]\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  })();

  /** "" when the product has no promotion — keeps the header segment out. */
  const offerLabel = validOffer(product.offer);

  const loading = rows === null;
  const empty = !loading && sorted.length === 0;
  const shown = isOpen && !isClosing;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-500 ease-out ${
        shown
          ? "opacity-100 bg-slate-900/50 backdrop-blur-sm"
          : "opacity-0 bg-black/0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Check supplier"
    >
      <div
        className={`relative w-full max-w-full bg-slate-50 rounded-t-2xl shadow-2xl border-t border-slate-200 flex flex-col overflow-hidden h-[90vh] max-h-[90vh] transition-transform duration-500 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h2 className="text-xs font-bold text-slate-500 tracking-tight flex items-center gap-1 shrink-0">
              <TruckIcon className="w-3.5 h-3.5 text-slate-400" />
              Supplier availability
            </h2>
            <span className="text-slate-300 font-light shrink-0">|</span>
            {/* Brand | Product | Price | Offer — one line beside the title. The
                price and offer segments, separator included, appear only when
                the selected product actually carries a value, so no empty
                divider or "Offer:" placeholder is ever left behind. */}
            <div className="flex items-center gap-2 min-w-0 flex-wrap text-xs">
              <span className="font-black uppercase text-[#008b47] tracking-wider flex items-center gap-1 shrink-0 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-[#008b47]" />
                {product.brand || "—"} TIRES
              </span>
              <span className="text-slate-300 font-light shrink-0">|</span>
              <span className="font-extrabold text-slate-900 truncate max-w-xl text-sm">
                {displayName}
              </span>
              {product.price !== undefined && product.price > 0 && (
                <>
                  <span className="text-slate-300 font-light shrink-0">|</span>
                  <span className="font-black text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-xs shrink-0">
                    AED{" "}
                    <span className="text-[#008b47] font-mono">
                      {money(product.price)}
                    </span>
                    <span className="ml-1 text-[10px] font-semibold text-slate-500">
                      per Tire
                    </span>
                  </span>
                </>
              )}
              {product.setOf4Price !== undefined && product.setOf4Price > 0 && (
                <>
                  <span className="text-slate-300 font-light shrink-0">|</span>
                  <span className="font-black text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-xs shrink-0 whitespace-nowrap">
                    <span className="text-[10px] font-semibold text-slate-500">
                      Set of 4:
                    </span>{" "}
                    AED{" "}
                    <span className="text-[#008b47] font-mono">
                      {money(product.setOf4Price)}
                    </span>
                  </span>
                </>
              )}
              {offerLabel && (
                <>
                  <span className="text-slate-300 font-light shrink-0">|</span>
                  <span className="font-bold bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-full text-[11px] shrink-0 whitespace-nowrap">
                    <span className="text-[10px] font-semibold text-amber-600">
                      Offer:
                    </span>{" "}
                    {offerLabel}
                  </span>
                </>
              )}

              {/* Search sits on the same header line, straight after the product
                  data. It filters ONLY the rows in this popup and issues no
                  request — it re-filters what was already fetched for this
                  tyre. Hidden until there is something to filter. */}
              {!loading && rows !== null && rows.length > 0 && (
                <>
                  <span className="text-slate-300 font-light shrink-0">|</span>
                  <div className="relative shrink-0 w-64 sm:w-80">
                    <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search supplier, size, origin...."
                      aria-label="Search supplier rows"
                      className="h-10 w-full pl-9 pr-9 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => handleSearchChange("")}
                        title="Clear search"
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-500 shrink-0 whitespace-nowrap">
                    {search.trim()
                      ? `${sorted.length} of ${rows.length}`
                      : `${rows.length} rows`}
                  </span>
                </>
              )}
            </div>
          </div>

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
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 relative">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="absolute top-2 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg animate-in fade-in duration-150">
              {toastMessage}
            </div>
          )}

          {/* Supplier rows table */}
          <div
            className="border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
            style={{ minHeight: Math.min(pageSize, 15) * 34 + 80 }}
          >
            {loading ? (
              <div
                className="p-3 space-y-2 flex flex-col justify-start"
                style={{ minHeight: Math.min(pageSize, 15) * 34 + 32 }}
              >
                <div
                  className="skeleton h-7 rounded-lg w-full mb-1"
                  aria-hidden="true"
                />
                {Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton h-7 rounded-lg w-full"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : empty ? (
              <div
                className="py-14 text-center px-6 flex flex-col items-center justify-center"
                style={{ minHeight: Math.min(pageSize, 15) * 34 + 32 }}
              >
                {/* Two different empties: nothing was found for this tyre at all,
                    versus rows exist but the search excluded them. Saying "no
                    supplier stocks this tyre" while a filter is on would be wrong. */}
                {search.trim() && rows !== null && rows.length > 0 ? (
                  <>
                    <p className="text-sm font-semibold text-slate-500">
                      No row matches “{search.trim()}”.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="mt-2 text-xs font-semibold text-[#008b47] hover:underline cursor-pointer"
                    >
                      Clear search to see all {rows.length} rows
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-500">
                      No supplier stocks this tyre.
                    </p>
                    <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                      Nothing in the synced supplier catalogue matches this SKU,
                      or this brand and size. If the supplier feed has not been
                      synced on this device yet, run Sync on the Supplier page
                      first.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div
                className="overflow-x-auto overflow-y-hidden flex-1"
                style={{ minHeight: Math.min(pageSize, 15) * 34 + 32 }}
              >
                <table className="w-full text-xs text-left border-collapse">
                  <colgroup>
                    <col className="w-[8.5%]" />
                    <col className="w-[6.5%]" />
                    <col className="w-[7.5%]" />
                    <col className="w-[8%]" />
                    <col className="w-[20%]" />
                    <col className="w-[11.5%]" />
                    <col className="w-[5.5%]" />
                    <col className="w-[6.5%]" />
                    <col className="w-[4%]" />
                    <col className="w-[4.5%]" />
                    <col className="w-[6.5%]" />
                    <col className="w-[7.5%]" />
                    <col className="w-[5.5%]" />
                    <col className="w-[4.5%]" />
                  </colgroup>
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                    <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                      <th
                        onClick={() => handleSort("source")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Source{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("product_source")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Type{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("category")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Category{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("brand")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Brand{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("pattern")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Tyre Pattern{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("size")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Size{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("runflat")}
                        className="py-2 px-3 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        RunFlat{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("country")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Countries{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("year")}
                        className="py-2 px-3 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Year{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("qty")}
                        className="py-2 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Qty{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("cost")}
                        className="py-2 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Cost{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("fitting_price")}
                        className="py-2 px-3 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Fitting Price{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th
                        onClick={() => handleSort("date")}
                        className="py-2 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap"
                      >
                        Date{" "}
                        <span className="ml-0.5 opacity-50 font-normal">
                          ↑↓
                        </span>
                      </th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {paginatedRows.map((r, i) => {
                      const runflatVal = runflatText(r.runflat);

                      return (
                        <tr
                          key={`${r.id}-${i}`}
                          onClick={() => copyRowData(r)}
                          title="Click row to copy details"
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer border-b border-slate-100 last:border-0"
                        >
                          {/* Source */}
                          <td className="py-1.5 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200 uppercase whitespace-nowrap inline-block">
                              {r.source_name || r.source || "—"}
                            </span>
                          </td>

                          {/* Type */}
                          <td className="py-1.5 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded uppercase whitespace-nowrap inline-block">
                              {r.product_source || "supplier"}
                            </span>
                          </td>

                          {/* Category */}
                          <td className="py-1.5 px-3 whitespace-nowrap">
                            {(() => {
                              const cat = (
                                r.category ||
                                r.brand_category ||
                                ""
                              ).trim();
                              return cat ? (
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase whitespace-nowrap inline-block ${
                                    CATEGORY_BADGES_SEMANTIC[cat] ||
                                    CATEGORY_BADGES_SEMANTIC[
                                      cat.toUpperCase()
                                    ] ||
                                    "badge-cat-default"
                                  }`}
                                >
                                  {cat}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal text-xs">
                                  —
                                </span>
                              );
                            })()}
                          </td>

                          {/* Brand */}
                          <td className="py-1.5 px-3 text-xs font-semibold text-slate-800 whitespace-nowrap">
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase whitespace-nowrap inline-block bg-slate-100 text-slate-700">
                              {r.brand || product.brand || "—"}
                            </span>
                          </td>

                          {/* Tyre Pattern */}
                          <td className="py-1.5 px-3 text-xs font-bold text-slate-900 max-w-md">
                            <span className="line-clamp-2">
                              {r.pattern ||
                                r.product_name ||
                                r.name ||
                                product.pattern ||
                                "—"}
                            </span>
                          </td>

                          {/* Size */}
                          <td className="py-1.5 px-3 text-xs font-mono text-slate-700 whitespace-nowrap">
                            {stripLoadIndex(r.size || product.size || "") ||
                              "—"}
                          </td>

                          {/* RunFlat */}
                          <td className="py-1.5 px-3 text-center whitespace-nowrap">
                            {runflatVal === "Runflat" ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200 whitespace-nowrap inline-block">
                                Runflat
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Countries */}
                          <td className="py-1.5 px-3 whitespace-nowrap text-xs font-semibold text-slate-700">
                            {r.country || product.country || (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Year */}
                          <td className="py-1.5 px-3 text-center text-xs font-medium text-slate-600 whitespace-nowrap">
                            {r.year && Number(r.year) > 0 ? (
                              r.year
                            ) : (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Qty */}
                          <td className="py-1.5 px-2 text-center whitespace-nowrap">
                            {r.qty === 0 || r.qty === "0" ? (
                              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-red-50 text-red-600 text-[11px] font-extrabold border border-red-200/60 font-mono">
                                0
                              </span>
                            ) : r.qty ? (
                              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-extrabold border border-emerald-200/60 font-mono">
                                {r.qty}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Cost */}
                          <td className="py-1.5 px-3 text-right whitespace-nowrap">
                            {r.cost || r.price ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCostHistoryItem(r);
                                }}
                                title="View cost history"
                                className="inline-flex items-center justify-end gap-1 text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap rounded px-1 -mx-1 hover:text-emerald-700 hover:underline decoration-dotted underline-offset-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors cursor-pointer"
                                dir="ltr"
                              >
                                <span className="whitespace-nowrap">
                                  {money(Number(r.cost || r.price))}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Fitting Price */}
                          <td className="py-1.5 px-3 text-center whitespace-nowrap">
                            {r.fitting_price ? (
                              <div
                                className="inline-flex items-center justify-center gap-1 text-xs font-medium text-slate-500 font-mono whitespace-nowrap"
                                dir="ltr"
                              >
                                <span className="whitespace-nowrap">
                                  {money(Number(r.fitting_price))}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-1.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                            {r.date ||
                            (r as unknown as { created_at?: string })
                              .created_at ? (
                              formatDateDDMM(
                                r.date ||
                                  (r as unknown as { created_at?: string })
                                    .created_at,
                              )
                            ) : (
                              <span className="text-slate-400 font-medium">
                                -
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-1.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyRowData(r);
                                }}
                                title="Copy row data"
                                className="p-1 rounded text-slate-400 hover:text-[#008b47] hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <ClipboardDocumentIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !empty && totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                pageSizeOptions={[15, 30, 50, 100]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Cost History Modal */}
      {costHistoryItem && (
        <CostHistoryModal
          key={String(costHistoryItem.id)}
          product={{
            id: costHistoryItem.id,
            brand: costHistoryItem.brand || product.brand,
            size: costHistoryItem.size || product.size,
            sizeFull: costHistoryItem.size || product.sizeFull,
            pattern:
              costHistoryItem.pattern ||
              costHistoryItem.name ||
              product.pattern,
            itemCode: costHistoryItem.sku || product.itemCode,
            cost: Number(costHistoryItem.cost) || 0,
            productType: costHistoryItem.product_source || "supplier",
            country: costHistoryItem.country || product.country,
            year: costHistoryItem.year || product.year,
          }}
          onCloseAction={() => setCostHistoryItem(null)}
        />
      )}
    </div>
  );
}
