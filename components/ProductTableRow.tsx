"use client";

import React from "react";
import {
  BookmarkIcon,
  ShoppingCartIcon,
  TruckIcon,
  ClockIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { getOfferBadgeStyle, NO_API_FIELD } from "@/constants/badges";
import { features } from "@/config/features";

function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.99c-.002 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c-.001 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662a11.87 11.87 0 005.71 1.454h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  );
}

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
  onCopyRow,
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
          <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase whitespace-nowrap inline-block bg-slate-100 text-slate-700">
            {item.brand || "-"}
          </span>
        </td>
      )}

      {/* Category Column */}
      {!hiddenColumns.has("category") && (
        <td className={`${cellPaddingClass} whitespace-nowrap`}>
          {item.category ? (
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold tracking-normal rounded-full border uppercase whitespace-nowrap inline-block ${
                categoryBadges[item.category] || "badge-cat-default"
              }`}
            >
              {item.category}
            </span>
          ) : (
            <span className="text-slate-400 font-normal text-xs">-</span>
          )}
        </td>
      )}

      {/* Size Column */}
      {!hiddenColumns.has("size") && (
        <td className={cellPaddingClass}>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-100/80 text-slate-700 border border-slate-200/80 font-mono whitespace-nowrap">
            {displayTyreSize(item) || "-"}
          </span>
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
          <span className="line-clamp-2">{item.pattern || "-"}</span>
        </td>
      )}

      {/* TC Specific: OEM Column */}
      {type === "tc" && !hiddenColumns.has("oem") && (
        <td className={`${cellPaddingClass} text-center text-xs text-slate-400 font-medium`}>
          {item.oem || "-"}
        </td>
      )}

      {/* TC Specific: Runflat Column */}
      {type === "tc" && !hiddenColumns.has("runflat") && (
        <td className={`${cellPaddingClass} text-center whitespace-nowrap`}>
          {item.runflat ? (
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 whitespace-nowrap inline-block">
              Runflat
            </span>
          ) : (
            <span className="text-slate-400 font-medium">-</span>
          )}
        </td>
      )}

      {/* Origin Country Column */}
      {!hiddenColumns.has("origin") && (
        <td className={`${cellPaddingClass} whitespace-nowrap`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
            {item.country && item.country.trim() ? item.country : <span className="text-slate-400 font-medium">-</span>}
          </div>
        </td>
      )}

      {/* Production Year Column */}
      {!hiddenColumns.has("year") && (
        <td className={`${cellPaddingClass} text-center text-xs font-semibold text-slate-700`}>
          {item.year && item.year > 0 ? item.year : <span className="text-slate-400 font-medium">-</span>}
        </td>
      )}

      {/* Quantity Column */}
      {!hiddenColumns.has("qty") && (
        <td className={`${cellPaddingClass} text-center`}>
          {item.qty === 0 ? (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-red-50 text-red-600 text-[11px] font-extrabold border border-red-200/60 font-mono">
              0
            </span>
          ) : (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-extrabold border border-emerald-200/60 font-mono">
              {item.qty}
            </span>
          )}
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
          <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-800 border border-slate-200/80 font-mono">
            {item.supplier || "-"}
          </span>
        </td>
      )}

      {/* Supplier Specific: Date Column */}
      {type === "supplier" && !hiddenColumns.has("date") && (
        <td className={`${cellPaddingClass} text-center text-xs text-slate-500 font-medium whitespace-nowrap`}>
          {item.date || "-"}
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
          {item.offer === NO_API_FIELD ? (
            <span className="text-xs text-slate-400 font-medium">{NO_API_FIELD}</span>
          ) : (() => {
            const style = getOfferBadgeStyle(item.offer, offerOptions);
            return (
              <span
                title={item.offer}
                className={`inline-block max-w-full truncate px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border shadow-2xs ${style.bg} ${style.text} ${style.border}`}
              >
                {item.offer}
              </span>
            );
          })()}
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

          {onCopyRow && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyRow(item);
              }}
              title="Copy row details"
              aria-label="Copy row details"
              className="w-6 h-6 aspect-square shrink-0 flex items-center justify-center rounded-md border transition-colors active:opacity-80 bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-emerald-600 hover:border-emerald-300"
            >
              <DocumentDuplicateIcon className="w-3 h-3" />
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
