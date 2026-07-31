"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  XMarkIcon,
  ShoppingBagIcon,
  InformationCircleIcon,
  TruckIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  ViewfinderCircleIcon,
  BoltIcon,
  TagIcon,
  Squares2X2Icon,
  ArrowsPointingOutIcon,
  CalendarDaysIcon,
  GlobeAltIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

/** One icon per spec cell, as the storefront shows — not a repeated tick. */
const SPEC_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  WIDTH: ArrowsRightLeftIcon,
  PROFILE: ArrowsUpDownIcon,
  "RIM SIZE": ViewfinderCircleIcon,
  "LOAD/SPEED": BoltIcon,
  BRAND: TagIcon,
  PATTERN: Squares2X2Icon,
  SIZE: ArrowsPointingOutIcon,
  YEAR: CalendarDaysIcon,
  WARRANTY: ShieldCheckIcon,
  COUNTRY: GlobeAltIcon,
  SKU: DocumentTextIcon,
};
import { fetchTcQuickViewCached, fetchTcQuickViewMatchesCached } from "@/services/cache";
import type { TcAttributeItem, TcQuickViewProduct } from "@/services/types";

/** Case/whitespace-insensitive compare. Everything else must be identical. */
function sameValue(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) !== "" && norm(a) === norm(b);
}

/**
 * Decompose the SUPPLIER FEED's own size string into its parts.
 *
 * This is not guesswork and not a substitute for Magento — it only runs when
 * Magento has no product for the row, and every value it returns is already
 * present in the feed, just concatenated: "185/65 R14 79T" carries width 185,
 * profile 65, rim 14 and load index 79T.
 *
 * Deliberately strict. A component absent from the string comes back empty
 * rather than inferred: "185 R14" is a full-profile van size with NO aspect
 * ratio and no load index, so profile and load stay blank. Exotic motorcycle
 * notations ("2.75-10", "MH90-21") match nothing at all and yield nothing.
 */
function splitSupplierSize(raw: string): {
  width: string; profile: string; rim: string; load: string;
} {
  const empty = { width: "", profile: "", rim: "", load: "" };
  const v = (raw || "").trim();
  if (!v) return empty;
  //  width  [/profile]  [speed letters]  [-|R]  rim  [C]  [load+speed]
  const m = v.match(
    /^(\d{2,3})\s*(?:\/\s*(\d{2,3}))?\s*[A-Z]{0,2}\s*[-R]?\s*(\d{2}(?:\.\d)?)\s*C?\s*(\d{2,3}(?:\/\d{2,3})?[A-Z]{1,2})?/i,
  );
  if (!m) return empty;
  return {
    width: m[1] ?? "",
    profile: m[2] ?? "",
    rim: m[3] ?? "",
    load: (m[4] ?? "").toUpperCase(),
  };
}

/** Shown when the API has no value. Never a made-up default. */
const UNKNOWN = "-";

/**
 * Read one attribute from `custom_attributesV2`, whatever shape it arrives in.
 *
 * Select attributes return `selected_options: [{label, value}]`, free-text ones a
 * plain `value`. Handling only one shape silently drops the other — which is why
 * LOAD/SPEED (free text) came back empty while the select fields worked.
 *
 * Some attributes return a single SPACE as their label (`runflat`, `oem_marking`,
 * `ev`), so labels are trimmed or the grid fills with blank boxes.
 */
function readAttr(items: (TcAttributeItem | null)[] | null | undefined, code: string): string {
  const a = (items ?? []).find((x) => x?.code === code);
  if (!a) return "";
  if (a.value !== null && a.value !== undefined && String(a.value).trim() !== "") {
    return String(a.value).trim();
  }
  return (a.selected_options ?? [])
    .map((o) => (o?.label ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export interface QuickViewProduct {
  id: number | string;
  itemCode: string;
  brand: string;
  pattern: string;
  size: string;
  sizeFull?: string;
  cost: number;
  country?: string;
  year?: number;
  category?: string;
  runflat?: boolean;
  fittingPrice?: number;
  source?: string;
  image?: string;
}

interface QuickViewModalProps {
  product: QuickViewProduct;
  onClose: () => void;
  onAddToCart?: (product: QuickViewProduct, qty: number) => void;
}

export default function QuickViewModal({
  product,
  onClose,
  onAddToCart,
}: QuickViewModalProps) {
  const [selectedQty, setSelectedQty] = useState<number>(4);
  const [selectedImgIndex, setSelectedImgIndex] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  /** undefined = still loading, null = no storefront product for this sku. */
  const [detail, setDetail] = useState<TcQuickViewProduct | null | undefined>(undefined);

  /**
   * Full detail from the live `products` query, cache-first — SKU first, then an
   * exact brand + pattern + size match. When neither resolves, the panel falls
   * back to the supplier row's own fields and shows "-" for what is genuinely
   * unknown, rather than inventing values.
   */
  useEffect(() => {
    let alive = true;

    /**
     * 1. SKU. 2. If that misses, brand + pattern + size — accepted ONLY when
     *    exactly one candidate matches all three exactly.
     *
     * Deliberately never fuzzy. `search` narrows the field, then every candidate
     * is re-checked attribute-by-attribute; two products sharing a brand, pattern
     * and size (they differ only by load index) are ambiguous, so neither is
     * used. Showing another tyre's images, warranty or price would be worse than
     * showing a dash.
     */
    async function resolve(): Promise<TcQuickViewProduct | null> {
      const sku = (product.itemCode || "").trim();
      if (sku) {
        const bySku = await fetchTcQuickViewCached(sku).catch(() => null);
        if (bySku) return bySku;
      }

      const brand = (product.brand || "").trim();
      const pattern = (product.pattern || "").trim();
      const size = (product.size || "").trim();
      // All three are required: two of them cannot identify one product.
      if (!brand || !pattern || !size) return null;

      const candidates = await fetchTcQuickViewMatchesCached(
        `${brand} ${size} ${pattern}`,
      ).catch(() => [] as TcQuickViewProduct[]);

      const exact = candidates.filter((c) => {
        const items = c.custom_attributesV2?.items;
        return (
          sameValue(readAttr(items, "brand"), brand) &&
          sameValue(readAttr(items, "pattern"), pattern) &&
          sameValue(readAttr(items, "tyre_size"), size)
        );
      });

      return exact.length === 1 ? exact[0] : null;
    }

    void resolve()
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [product.itemCode, product.brand, product.pattern, product.size]);

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
      onClose();
    }, 700); // 700ms ultra-smooth slow closing duration
  };

  const attrs = detail?.custom_attributesV2?.items;
  const loading = detail === undefined;

  /** API value first, then the supplier row, then "-". Never a literal. */
  const pick = (code: string, rowValue?: string | number | null) => {
    const fromApi = readAttr(attrs, code);
    if (fromApi) return fromApi;
    const v = rowValue === null || rowValue === undefined ? "" : String(rowValue).trim();
    return v || UNKNOWN;
  };

  // PROFILE is `height` and LOAD/SPEED is `load_index` — the codes do not match
  // the on-screen labels, which is why both looked absent.
  //
  // Magento first. When it has no product for this row, the same four values are
  // recovered from the supplier feed's own size string rather than left blank —
  // they are the feed's data, only concatenated. Anything the string does not
  // actually contain stays empty and renders "-".
  const fromSize = useMemo(
    () => splitSupplierSize(product.sizeFull || product.size || ""),
    [product.sizeFull, product.size],
  );
  const specWidth = readAttr(attrs, "width") || fromSize.width;
  const specProfile = readAttr(attrs, "height") || fromSize.profile;
  const specRim = readAttr(attrs, "rim") || fromSize.rim;
  const specLoad = readAttr(attrs, "load_index") || fromSize.load;

  const apiSize = readAttr(attrs, "tyre_size");
  const fullSizeText = apiSize
    ? [apiSize, specLoad].filter(Boolean).join(" ")
    : (product.sizeFull || product.size || UNKNOWN);

  const priceRange = detail?.price_range?.minimum_price;
  const apiPrice = priceRange?.final_price?.value ?? priceRange?.regular_price?.value ?? 0;
  const currency = priceRange?.final_price?.currency ?? priceRange?.regular_price?.currency ?? "AED";
  // The storefront's own price when it has one, otherwise the supplier's cost.
  const unitPrice = apiPrice > 0 ? apiPrice : (product.cost || 0);
  const setOf2Price = unitPrice * 2;
  const setOf4Price = unitPrice * 4;
  const totalPrice = unitPrice * selectedQty;
  const priceHeading = readAttr(attrs, "price_included_text") || "Price";

  // Offer banner and stock badge render only when the API actually says so.
  const offerLabel = readAttr(attrs, "offers");
  // "1" on products enrolled in the BNPL programme; absent otherwise.
  const splitPayment = readAttr(attrs, "tabby_payment") === "1";
  const inStock = detail?.stock_status === "IN_STOCK";

  const gallery = useMemo(() => {
    const urls = [detail?.image?.url, ...((detail?.media_gallery ?? []).map((g) => g?.url))]
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    return [...new Set(urls)];
  }, [detail]);

  const tyreImgSrc = gallery[selectedImgIndex] ?? gallery[0] ?? product.image ?? "";
  const displayName = detail?.name || [product.brand, product.pattern].filter(Boolean).join(" ") || product.itemCode;

  // Split spec rows matching exact screenshot layout:
  // Row 1 (4 cols): Width, Profile, Rim Size, Load/Speed
  const row1 = [
    { label: "WIDTH", value: specWidth ? `${specWidth} mm` : UNKNOWN },
    { label: "PROFILE", value: specProfile || UNKNOWN },
    { label: "RIM SIZE", value: specRim ? `R${specRim}` : UNKNOWN },
    { label: "LOAD/SPEED", value: specLoad || UNKNOWN },
  ];

  // Row 2 (4 cols): Brand, Pattern, Size, Year
  const row2 = [
    { label: "BRAND", value: pick("brand", product.brand) },
    { label: "PATTERN", value: pick("pattern", product.pattern) },
    { label: "SIZE", value: fullSizeText, info: true },
    { label: "YEAR", value: pick("year", product.year && product.year > 0 ? product.year : "") },
  ];

  // Row 3 (3 cols): Warranty, Country, SKU
  const row3 = [
    // Warranty exists only on the storefront product — the supplier feed has no
    // such field, so it is "-" rather than an assumed "3 Years Warranty".
    { label: "WARRANTY", value: pick("warranty_period") },
    { label: "COUNTRY", value: pick("country", product.country) },
    { label: "SKU", value: detail?.sku || product.itemCode || UNKNOWN },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-700 ease-out ${
        isOpen && !isClosing ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop overlay click to close */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Slower Smooth Slide-Up (Open) & Slide-Down (Close) Container (700ms duration) */}
      <div
        className={`relative w-full max-w-full bg-white rounded-none shadow-2xl border-t border-slate-200 overflow-hidden z-10 transition-all duration-700 ease-out max-h-[95vh] flex flex-col p-6 sm:p-8 ${
          isOpen && !isClosing
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        }`}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5 shrink-0 px-2 sm:px-4">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Quick View</h2>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-7xl mx-auto">
            
            {/* Left Side: Product Image Card & Thumbnails */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full bg-white border border-slate-200/90 rounded-none p-5 relative shadow-2xs overflow-hidden flex flex-col items-center">
                
                {/* Promo banner — the API's own `offers` label, and only when
                    there is one. It used to read FREE WHEEL ALIGNMENT on every
                    product regardless. */}
                {offerLabel && (
                  <div className="w-full bg-[#008b47] text-white text-xs font-black uppercase tracking-wider py-2 px-3 text-center rounded-none absolute top-0 inset-x-0">
                    {offerLabel}
                  </div>
                )}

                {/* Stock badge — driven by `stock_status`, not always-on. */}
                {inStock && (
                <div className="absolute top-9 right-0 bg-slate-900 text-white text-[10px] font-black py-1 px-3.5 uppercase tracking-wider z-10 shadow-md flex items-center rounded-l-none">
                  <span>In Stock</span>
                  <span className="absolute bottom-[-4px] right-0 w-0 h-0 border-t-[4px] border-t-slate-900 border-r-[4px] border-r-transparent"></span>
                </div>
                )}

                {/* Tyre Image */}
                <div className="w-full h-64 mt-6 flex items-center justify-center p-2">
                  {loading ? (
                    <div className="skeleton w-52 h-52 rounded-none" aria-hidden="true" />
                  ) : tyreImgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tyreImgSrc}
                      alt={detail?.image?.label || displayName}
                      className="w-52 h-52 object-contain filter drop-shadow-md transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">No image available</span>
                  )}
                </div>

                {/* Thumbnails — one per image the API actually returned. Was two
                    buttons showing the same picture. */}
                {gallery.length > 1 && (
                  <div className="flex items-center gap-3 mt-4">
                    {gallery.map((url, idx) => (
                      <button
                        key={url}
                        onClick={() => setSelectedImgIndex(idx)}
                        className={`w-14 h-14 rounded-none border-2 p-1 bg-white transition-all flex items-center justify-center ${
                          selectedImgIndex === idx
                            ? "border-[#008b47] ring-2 ring-emerald-500/20"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-9 h-9 object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Specs & Pricing */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              
              {/* Brand Header Logo & Title */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-black uppercase text-[#008b47] tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#008b47]"></span>
                    {pick("brand", product.brand)}
                  </span>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {displayName}
                </h1>
              </div>

              {/* Product Specifications Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Product Specifications
                </h3>
                
                {/* Row 1: 4 Columns (Width, Profile, Rim Size, Load/Speed) */}
                <div className="grid grid-cols-4 gap-2.5">
                  {row1.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200/90 rounded-none py-2.5 px-2 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {(() => {
                          const Icon = SPEC_ICON[item.label];
                          return Icon ? (
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-[#008b47] flex items-center justify-center shrink-0">
                              <Icon className="w-2.5 h-2.5 stroke-[2.5]" />
                            </span>
                          ) : null;
                        })()}
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-900 truncate w-full">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Row 2: 4 Columns (Brand, Pattern, Size, Year) */}
                <div className="grid grid-cols-4 gap-2.5">
                  {row2.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200/90 rounded-none py-2.5 px-2 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {(() => {
                          const Icon = SPEC_ICON[item.label];
                          return Icon ? (
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-[#008b47] flex items-center justify-center shrink-0">
                              <Icon className="w-2.5 h-2.5 stroke-[2.5]" />
                            </span>
                          ) : null;
                        })()}
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 truncate w-full flex items-center justify-center gap-0.5">
                        <span>{item.value}</span>
                        {item.info && <InformationCircleIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Row 3: 3 Columns (Warranty, Country, SKU) */}
                <div className="grid grid-cols-3 gap-2.5">
                  {row3.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200/90 rounded-none py-2.5 px-2 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {(() => {
                          const Icon = SPEC_ICON[item.label];
                          return Icon ? (
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-[#008b47] flex items-center justify-center shrink-0">
                              <Icon className="w-2.5 h-2.5 stroke-[2.5]" />
                            </span>
                          ) : null;
                        })()}
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-900 truncate w-full">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

              </div>

              {/* Fitted Price Box */}
              <div className="bg-slate-50/90 border border-slate-200/80 rounded-none p-4 flex flex-col gap-3">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
                  <span>{priceHeading}</span>
                  <InformationCircleIcon className="w-3.5 h-3.5 text-slate-400" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight flex items-baseline gap-1">
                      <span>{currency} {unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-xs font-semibold text-slate-500">/ Per Pcs</span>
                    </div>
                    {/* Set of 2 is fixed; the second entry follows the qty selector,
                        exactly as the storefront does (qty 1 -> "Set of 1"). */}
                    <div className="text-xs font-semibold text-slate-600 mt-0.5 flex gap-4">
                      <span>Set of 2 : <strong className="text-slate-900">{currency} {setOf2Price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                      {selectedQty !== 2 && (
                        <span>Set of {selectedQty} : <strong className="text-slate-900">{currency} {totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Actions: Qty Select + Add to Cart Button */}
                  <div className="flex items-center gap-2 flex-1 max-w-sm ml-auto">
                    <select
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(Number(e.target.value))}
                      className="h-11 px-3 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#008b47] cursor-pointer shadow-2xs"
                    >
                      {[1, 2, 4, 6, 8].map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        if (onAddToCart) onAddToCart(product, selectedQty);
                      }}
                      className="flex-1 h-11 bg-[#008b47] hover:bg-[#00753c] text-white font-extrabold rounded-none shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                    >
                      <ShoppingBagIcon className="w-4 h-4 stroke-2" />
                      <span>Add to Cart - {currency} {totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </button>
                  </div>
                </div>

                {/* Split-payment row — shown only when the product's own
                    `tabby_payment` attribute is set. */}
                {splitPayment && (
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <span>Split in 4 Payment with</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#3BFFC3] text-slate-900 text-[10px] font-extrabold tracking-tight">
                      tabby
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#7B61FF] text-white text-[10px] font-extrabold tracking-tight">
                      tamara
                    </span>
                  </div>
                )}

              </div>

              {/* Bottom Feature Badges Bar */}
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-none p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#008b47] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <TruckIcon className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Fast Shipping & Installation</h4>
                    <p className="text-[10px] text-slate-600 leading-tight mt-0.5">We deliver and install most orders on the same day.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#008b47] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <WrenchScrewdriverIcon className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Free Wheel Balancing</h4>
                    <p className="text-[10px] text-slate-600 leading-tight mt-0.5">Free wheel balancing included with every tyre installation.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#008b47] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <ShieldCheckIcon className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Always Authentic</h4>
                    <p className="text-[10px] text-slate-600 leading-tight mt-0.5">We only sell 100% authentic products backed by warranty.</p>
                  </div>
                </div>
              </div>

              {/* View Full Details — the storefront URL built from the API's own
                  `url_key`. Rendered only when Magento resolved a product, since
                  there is no page to link to otherwise. */}
              {detail?.url_key && (
                <div className="flex items-center justify-start pt-0.5">
                  <a
                    href={`https://www.tyrescart.com/en/${detail.url_key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#008b47] hover:text-[#00753c] text-xs font-bold flex items-center gap-1 hover:underline underline-offset-2 transition-colors"
                  >
                    <span>View Full Details</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              )}

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
