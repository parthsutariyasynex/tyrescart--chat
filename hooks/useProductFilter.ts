"use client";

import { useMemo } from "react";
import {
  searchWithAspectRimFallback,
  matchesSearch,
  matchesAspectRim,
  parseAspectRim,
  SEARCHABLE_FIELDS,
  DEFAULT_SIZE_FIELDS,
} from "@/services/searchFilter";

/** Both spellings of the size a row can carry: tc has `sizeFull`
 *  ("225/40 R18 92Y"), the supplier feed only `size` ("225/40 R18"). */
const SIZE_BOX_FIELDS = ["sizeFull", "size"] as const;

/**
 * Size-box predicate.
 *
 * Delegates to `searchFilter`, which normalises BOTH sides to digits
 * (`toNumericOnly`) before comparing. That normalisation is the whole point: a
 * size has many spellings — "225/40R18", "225/40 R18", "22540R18", "2254018" —
 * and they must all collapse to the same "2254018".
 *
 * This previously did its own `replace(/[^a-zA-Z0-9]/g, "")` substring test,
 * which stripped punctuation but KEPT letters, so "225/40 R18" reduced to
 * "22540r18" and the digits-only query "2254018" could never match — the "r"
 * sat in the middle of it. Anything typed without the R silently returned zero
 * rows.
 */
export function matchesSizeInput(item: { size?: string; sizeFull?: string }, s: string): boolean {
  if (!s.trim()) return false;
  // Width-omitted queries ("40R18", "4018") mean aspect+rim, not a width prefix.
  const ar = parseAspectRim(s);
  if (ar) return matchesAspectRim(item, ar.aspect, ar.rim, SIZE_BOX_FIELDS);
  return matchesSearch(item, s, SIZE_BOX_FIELDS, SIZE_BOX_FIELDS);
}

/**
 * Plain case-insensitive substring test across explicitly-named fields.
 *
 * Deliberately dumber than `matchesSearch`: no tokenizing, no size
 * normalisation, no year/rim special-casing. That intelligence is what makes
 * "2254018" find a 225/40 R18, but it also routes ANY all-digit token to the
 * size fields alone — so a price like "469" or a qty like "1" could never
 * match, because those never reach a non-size field. This runs alongside it
 * (never instead of it) to cover the plain "does this text appear anywhere"
 * case.
 */
function matchesGlobalFields(
  row: Record<string, unknown>,
  fields: readonly string[],
  needle: string,
): boolean {
  for (const field of fields) {
    const v = row[field];
    if (v === null || v === undefined || v === "") continue;
    if (String(v).toLowerCase().includes(needle)) return true;
    // Price columns render with 2 decimals ("469.00") while the record holds
    // 469, so the displayed form has to be searchable too or typing what is
    // literally on screen finds nothing.
    if (typeof v === "number" && v.toFixed(2).includes(needle)) return true;
  }
  return false;
}

export interface FilterOptions<T> {
  allProducts: T[];
  searchQuery: string;
  categoryFilter?: string;
  brandInput?: string;
  sizeInput?: string;
  yearInput?: string;
  qtyInput?: string;
  minPriceInput?: string;
  maxPriceInput?: string;
  offerFilter?: string;
  supplierFilter?: string;
  searchFields?: readonly string[];
  searchSizeFields?: readonly string[];
  /**
   * Opt-in: fields the search box should ALSO match as a plain substring,
   * UNIONed with the normal tokenized search rather than replacing it.
   *
   * Omitted (the default) means the search behaves exactly as before, so pages
   * that don't pass this — /supplier-products, /products — are untouched.
   */
  globalSearchFields?: readonly string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useProductFilter<T extends Record<string, any>>({
  allProducts,
  searchQuery,
  categoryFilter = "ALL",
  brandInput = "",
  sizeInput = "",
  yearInput = "",
  qtyInput = "",
  minPriceInput = "",
  maxPriceInput = "",
  offerFilter = "ALL",
  supplierFilter = "ALL",
  searchFields = SEARCHABLE_FIELDS,
  searchSizeFields = DEFAULT_SIZE_FIELDS,
  globalSearchFields,
}: FilterOptions<T>): T[] {
  return useMemo(() => {
    let result: T[] = allProducts;

    // 1. Search Query with aspect rim fallback
    if (searchQuery && searchQuery.trim()) {
      const trimmed = searchQuery.trim();
      const tokenMatched = searchWithAspectRimFallback(
        result,
        trimmed,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        searchFields as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        searchSizeFields as any
      );

      if (globalSearchFields && globalSearchFields.length) {
        /* UNION, not replacement: keep every row the tokenized search found,
           then add rows matching the raw text in any listed field. Additive by
           design — no query that worked before returns fewer rows now.
           Ordering here is irrelevant: the caller sorts afterwards. */
        const needle = trimmed.toLowerCase();
        const already = new Set<T>(tokenMatched);
        const extra = result.filter(
          (row) => !already.has(row) && matchesGlobalFields(row, globalSearchFields, needle),
        );
        result = extra.length ? [...tokenMatched, ...extra] : tokenMatched;
      } else {
        result = tokenMatched;
      }
    }

    // 2. Category exact match (supports category & brand_category)
    if (categoryFilter !== "ALL") {
      result = result.filter((item) => {
        const cat = item.category || item.brand_category;
        return cat === categoryFilter;
      });
    }

    // 3. Supplier / Source exact match (supports supplier, source, source_name, product_source)
    if (supplierFilter !== "ALL") {
      result = result.filter((item) => {
        const src = item.supplier || item.source || item.source_name || item.product_source;
        return src === supplierFilter;
      });
    }

    // 4. Brand partial match (supports token overlap e.g. "ACCELERA TIRES" vs "ACCELERA")
    if (brandInput && brandInput.trim()) {
      const brands = brandInput
        .split(",")
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean);
      if (brands.length) {
        result = result.filter((item) => {
          if (!item.brand) return false;
          const itemBrand = String(item.brand).toLowerCase();
          return brands.some((b) => {
            if (itemBrand.includes(b) || b.includes(itemBrand)) return true;
            const bTokens = b.split(/\s+/).filter((t) => t.length > 2);
            const itemTokens = itemBrand.split(/\s+/).filter((t) => t.length > 2);
            return bTokens.some((bt) => itemTokens.includes(bt));
          });
        });
      }
    }

    // 5. Size match (comma separated)
    if (sizeInput && sizeInput.trim()) {
      const sizes = sizeInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (sizes.length) {
        result = result.filter((item) =>
          sizes.some((sz) => matchesSizeInput(item, sz))
        );
      }
    }

    // 6. Year match (supports number conversion and null/0 fallback for supplier feeds)
    if (yearInput && yearInput.trim()) {
      const years = yearInput
        .split(",")
        .map((y) => parseInt(y.trim(), 10))
        .filter((y) => !isNaN(y));
      if (years.length) {
        result = result.filter((item) => {
          if (item.year === undefined || item.year === null) return true;
          const yNum = Number(item.year);
          if (yNum === 0) return true;
          return years.includes(yNum);
        });
      }
    }

    // 7. Qty minimum threshold (supports qty, quantity, stock, tyre_marking)
    if (qtyInput && qtyInput.trim() && !isNaN(Number(qtyInput))) {
      const n = Number(qtyInput);
      result = result.filter((item) => {
        const itemQty = Number(item.qty ?? item.quantity ?? item.stock ?? item.tyre_marking ?? 0);
        return itemQty >= n;
      });
    }

    // 8. Price range — matched against every price the table DISPLAYS
    //
    //    Was `item.price ?? item.cost ?? 0`, which read one field and missed
    //    the other columns entirely. Two things that broke:
    //
    //    a) Fitting Price and Set of 4 were never considered.
    //    b) A row with no price at all collapsed to 0, and `0 <= max` is true,
    //       so a Max-only filter returned every price-less row (measured: Max
    //       200 returned 2,137 supplier rows, ~1,877 of them rendering 0.00).
    //
    //    Hence `> 0` rather than `!= null`: on this feed a 0 means "no value"
    //    (fitting_price is populated on 1 row in 8,248), so a zero must not
    //    participate — it is not a tyre that costs nothing.
    const minPrice = parseFloat(minPriceInput || "");
    const maxPrice = parseFloat(maxPriceInput || "");
    const hasMin = !isNaN(minPrice);
    const hasMax = !isNaN(maxPrice);
    if (hasMin || hasMax) {
      result = result.filter((item) => {
        // Set of 4 is deliberately NOT here. It is always ~4x the unit price,
        // so including it made every row clear any low Min (Min 300 still
        // returned all 8,524 tc rows) — the range only means something when it
        // is read against per-tyre prices.
        const prices = [item.price, item.cost, item.fittingPrice]
          .map(Number)
          .filter((v) => Number.isFinite(v) && v > 0);

        // ONE pass over the values, so a single field has to satisfy both
        // bounds. Applying min and max as separate filters would let a row
        // through on cost=50 for the max and setOf4=5000 for the min.
        return prices.some(
          (v) => (!hasMin || v >= minPrice) && (!hasMax || v <= maxPrice),
        );
      });
    }

    // 9. Offer filter (supports offer & offers)
    if (offerFilter !== "ALL") {
      result = result.filter((item) => {
        const off = item.offer || item.offers;
        return off === offerFilter;
      });
    }

    return result;
  }, [
    allProducts,
    searchQuery,
    categoryFilter,
    brandInput,
    sizeInput,
    yearInput,
    qtyInput,
    minPriceInput,
    maxPriceInput,
    offerFilter,
    supplierFilter,
    searchFields,
    searchSizeFields,
    globalSearchFields,
  ]);
}
