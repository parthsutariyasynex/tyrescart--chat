"use client";

import React from "react";
import {
  BookmarkIcon,
  ShoppingCartIcon,
  TruckIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { getOfferBadgeStyle, NO_API_FIELD } from "@/constants/badges";
import { features } from "@/config/features";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

/**
 * Tyre size for DISPLAY ONLY — the bare size, without the Load Index / Speed
 * Rating ("97/95R", "83V", "105W").
 *
 * Nothing here touches the data: `item.size` and `item.sizeFull` are both left
 * exactly as mapped, so search, filters, sorting, CSV export, Quick View,
 * Book Inquiry and the quotation payloads all keep using the full value. This
 * only changes which of the two the Tyre Size CELL prints.
 *
 * `size` is already the bare size ("175 R13C") and `sizeFull` is that plus the
 * rating ("175 R13C 97/95R") — see `sizeFull: size && li ? ... : size` in
 * tc-products — so preferring `size` is the whole fix. The regex is a fallback
 * for a caller that supplies only `sizeFull`; it strips one trailing
 * load-index/speed token and nothing else, so a plain size passes through
 * untouched.
 */
function displayTyreSize(item: { size?: string; sizeFull?: string }): string {
  if (item.size) return item.size;
  return (item.sizeFull || "").replace(/\s+\d{2,3}(?:\/\d{2,3})?[A-Z]{1,2}\s*$/i, "").trim();
}

export interface ProductRowItem {
  id?: string | number;
  itemCode?: string;
  sku?: string;
  brand?: string;
  pattern?: string;
  size?: string;
  sizeFull?: string;
  category?: string;
  brand_category?: string;
  price?: number;
  setOf4Price?: number;
  cost?: number;
  qty?: number | string | null;
  country?: string;
  flag?: string;
  runflat?: string | number | boolean;
  warranty?: string;
  year?: number;
  offer?: string;
  hasOffer?: boolean;
  source?: string;
  status?: number | string | null;
  oem?: string;
  supplier?: string;
  date?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ProductTableRowProps<T extends ProductRowItem = ProductRowItem> {
  item: T;
  type: "tc" | "supplier";
  hiddenColumns: Set<string>;
  cellPaddingClass?: string;
  isSelected?: boolean;
  brandBadges?: Record<string, string>;
  categoryBadges: Record<string, string>;
  onCopyRow: (item: any) => void;
  onQuickView: (item: any) => void;
  onAddToCart?: (item: any) => void;
  onToggleList?: (item: any) => void;
  onShareWhatsApp?: (item: any) => void;
  onCheckSupplier?: (item: any) => void;
  onCostHistory?: (item: any) => void;
  inCart?: boolean;
  inList?: boolean;
  offerOptions?: string[];
}

export const ProductTableRow = React.memo(function ProductTableRow<T extends ProductRowItem = ProductRowItem>({
  item,
  type,
  hiddenColumns,
  cellPaddingClass = "py-0.5 px-2",
  isSelected = false,
  categoryBadges,
  onQuickView,
  onAddToCart,
  onToggleList,
  onShareWhatsApp,
  onCheckSupplier,
  onCostHistory,
  inCart = false,
  inList = false,
  offerOptions = [],
}: ProductTableRowProps<T>) {
  return (
    <tr
      className={`transition-colors duration-150 hover:bg-emerald-50/50 group ${
        isSelected ? "bg-emerald-50/70" : ""
      }`}
    >
      {/* Brand Column */}
      {!hiddenColumns.has("brand") && (
        <td className={`${cellPaddingClass} whitespace-nowrap`}>
          {item.brand && item.brand !== "-" ? (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase whitespace-nowrap inline-block bg-slate-100 text-slate-700">
              {item.brand}
            </span>
          ) : null}
        </td>
      )}

      {/* Category Column */}
      {!hiddenColumns.has("category") && (
        <td className={`${cellPaddingClass} whitespace-nowrap`}>
          {item.category && item.category !== "-" ? (
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold tracking-normal rounded-full border uppercase whitespace-nowrap inline-block ${
                categoryBadges[item.category] || "badge-cat-default"
              }`}
            >
              {item.category}
            </span>
          ) : null}
        </td>
      )}

      {/* Size Column */}
      {!hiddenColumns.has("size") && (
        <td className={cellPaddingClass}>
          {displayTyreSize(item) ? (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-100/80 text-slate-700 border border-slate-200/80 font-mono whitespace-nowrap">
              {displayTyreSize(item)}
            </span>
          ) : null}
        </td>
      )}

      {/* Name / Pattern Column — click ANYWHERE in cell to open Quick View */}
      {(!hiddenColumns.has("name") || !hiddenColumns.has("pattern")) && (
        <td
          className={`${cellPaddingClass} text-xs font-semibold text-slate-900 cursor-pointer hover:text-emerald-600 hover:bg-emerald-50/60 transition-colors`}
          onClick={(e) => {
            if (features.quickView) {
              e.stopPropagation();
              onQuickView(item);
            }
          }}
          title={features.quickView ? "Click to view details" : undefined}
        >
          <span className="line-clamp-2" title={item.pattern && item.pattern !== "-" ? item.pattern : undefined}>
            {item.pattern && item.pattern !== "-" ? item.pattern : ""}
          </span>
        </td>
      )}

      {/* TC Specific: Status Column */}
      {type === "tc" && !hiddenColumns.has("status") && (
        <td className={`${cellPaddingClass} text-center whitespace-nowrap`}>
          {item.status === 1 || String(item.status) === "1" ? (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 whitespace-nowrap inline-block">
              Enabled
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap inline-block">
              Disabled
            </span>
          )}
        </td>
      )}

      {/* TC Specific: Runflat Column */}
      {type === "tc" && !hiddenColumns.has("runflat") && (
        <td className={`${cellPaddingClass} text-center whitespace-nowrap`}>
          {item.runflat &&
          String(item.runflat).toLowerCase() !== "false" &&
          String(item.runflat) !== "0" &&
          String(item.runflat).toLowerCase() !== "no" &&
          String(item.runflat).toLowerCase() !== "-" ? (
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 whitespace-nowrap inline-block">
              Runflat
            </span>
          ) : null}
        </td>
      )}

      {/* Origin Country Column */}
      {!hiddenColumns.has("origin") && (
        <td className={`${cellPaddingClass} whitespace-nowrap`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
            {item.country && item.country.trim() && item.country !== "-" ? item.country : null}
          </div>
        </td>
      )}

      {/* Production Year Column */}
      {!hiddenColumns.has("year") && (
        <td className={`${cellPaddingClass} text-center text-xs font-semibold text-slate-700`}>
          {item.year && item.year > 0 ? item.year : null}
        </td>
      )}

      {/* Quantity Column */}
      {!hiddenColumns.has("qty") && (
        <td className={`${cellPaddingClass} text-center`}>
          {item.qty && Number(item.qty) > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-extrabold border border-emerald-200/60 font-mono">
              {item.qty}
            </span>
          ) : null}
        </td>
      )}

      {/* Price / Cost Column */}
      {type === "tc" && !hiddenColumns.has("price") && (
        <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
          {item.price && item.price > 0 ? (
            <div className="inline-flex items-center justify-end text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap" dir="ltr">
              <span>{item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ) : null}
        </td>
      )}

      {type === "supplier" && !hiddenColumns.has("cost") && (
        <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
          {item.cost && item.cost > 0 ? (
            <div className="inline-flex items-center justify-end text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap" dir="ltr">
              <span>{item.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ) : null}
        </td>
      )}

      {/* Supplier Specific: Supplier Name Column */}
      {type === "supplier" && !hiddenColumns.has("supplier") && (
        <td className={`${cellPaddingClass} whitespace-nowrap`}>
          {item.supplier && item.supplier !== "-" ? (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-800 border border-slate-200/80 font-mono">
              {item.supplier}
            </span>
          ) : null}
        </td>
      )}

      {/* Supplier Specific: Date Column */}
      {type === "supplier" && !hiddenColumns.has("date") && (
        <td className={`${cellPaddingClass} text-center text-xs text-slate-500 font-medium whitespace-nowrap`}>
          {item.date && item.date !== "-" ? item.date : null}
        </td>
      )}

      {/* TC Specific: Set of 4 Price Column */}
      {type === "tc" && !hiddenColumns.has("setOf4Price") && (
        <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
          {item.setOf4Price && item.setOf4Price > 0 ? (
            <div className="inline-flex items-center justify-end text-xs font-semibold text-slate-600 font-mono whitespace-nowrap" dir="ltr">
              <span>{item.setOf4Price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ) : null}
        </td>
      )}

      {/* TC Specific: Offer Column */}
      {type === "tc" && !hiddenColumns.has("offer") && (
        <td className={`${cellPaddingClass} text-center`}>
          {item.offer && item.offer !== NO_API_FIELD && item.offer !== "-" && item.offer !== "No Offer" ? (
            (() => {
              const style = getOfferBadgeStyle(item.offer, offerOptions);
              return (
                <span
                  title={item.offer}
                  className={`inline-block max-w-full truncate px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border shadow-2xs ${style.bg} ${style.text} ${style.border}`}
                >
                  {item.offer}
                </span>
              );
            })()
          ) : null}
        </td>
      )}

      {/* Action Buttons Column */}
      <td className={`${cellPaddingClass} text-center`}>
        <div className="flex items-center justify-center gap-1.5">
          {features.costHistory && type === "supplier" && onCostHistory && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCostHistory(item);
              }}
              title="Cost History"
              aria-label="Cost History"
              className="w-6 h-6 aspect-square shrink-0 flex items-center justify-center rounded-md border transition-colors active:opacity-80 bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300"
            >
              <ClockIcon className="w-3 h-3" />
            </button>
          )}

          {features.wishlist && onToggleList && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleList(item);
              }}
              title={inList ? "Remove from List" : "Add to List"}
              className={`w-6 h-6 aspect-square shrink-0 flex items-center justify-center rounded-md border transition-colors active:opacity-80 ${
                inList
                  ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-2xs"
                  : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              }`}
            >
              <BookmarkIcon className="w-3 h-3" />
            </button>
          )}

          {features.cart && onAddToCart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(item);
              }}
              title="Add to Cart"
              className={`w-6 h-6 aspect-square shrink-0 flex items-center justify-center rounded-md border transition-colors active:opacity-80 ${
                inCart
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                  : "bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              <ShoppingCartIcon className="w-3 h-3" />
            </button>
          )}

          {features.whatsapp && onShareWhatsApp && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShareWhatsApp(item);
              }}
              title="Copy details for WhatsApp"
              aria-label="Copy details for WhatsApp"
              className="w-6 h-6 aspect-square shrink-0 flex items-center justify-center rounded-md border transition-colors active:opacity-80 bg-white text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10"
            >
              <WhatsAppIcon className="w-3 h-3" />
            </button>
          )}



          {features.checkSupplier && onCheckSupplier && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCheckSupplier(item);
              }}
              title="Check Supplier"
              aria-label="Check Supplier"
              className="w-6 h-6 aspect-square shrink-0 flex items-center justify-center rounded-md border transition-colors active:opacity-80 bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            >
              <TruckIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

export default ProductTableRow;
