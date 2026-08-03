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
}

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
}: FilterOptions<T>): T[] {
  return useMemo(() => {
    let result: T[] = allProducts;

    // 1. Search Query with aspect rim fallback
    if (searchQuery && searchQuery.trim()) {
      result = searchWithAspectRimFallback(
        result,
        searchQuery.trim(),
        searchFields as any,
        searchSizeFields as any
      );
    }

    // 2. Category exact match
    if (categoryFilter !== "ALL") {
      result = result.filter((item) => item.category === categoryFilter);
    }

    // 3. Supplier / Source exact match
    if (supplierFilter !== "ALL") {
      result = result.filter((item) => item.supplier === supplierFilter || item.source === supplierFilter);
    }

    // 4. Brand partial match (comma separated)
    if (brandInput && brandInput.trim()) {
      const brands = brandInput
        .split(",")
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean);
      if (brands.length) {
        result = result.filter(
          (item) =>
            item.brand &&
            brands.some((b) => item.brand.toLowerCase().includes(b))
        );
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

    // 6. Year match
    if (yearInput && yearInput.trim()) {
      const years = yearInput
        .split(",")
        .map((y) => parseInt(y.trim(), 10))
        .filter((y) => !isNaN(y));
      if (years.length) {
        result = result.filter((item) => item.year && years.includes(item.year));
      }
    }

    // 7. Qty minimum threshold
    if (qtyInput && qtyInput.trim() && !isNaN(Number(qtyInput))) {
      const n = Number(qtyInput);
      result = result.filter((item) => (item.qty ?? 0) >= n);
    }

    // 8. Price / Cost range
    const minPrice = parseFloat(minPriceInput || "");
    const maxPrice = parseFloat(maxPriceInput || "");
    if (!isNaN(minPrice)) {
      result = result.filter((item) => {
        const p = item.price ?? item.cost ?? 0;
        return p >= minPrice;
      });
    }
    if (!isNaN(maxPrice)) {
      result = result.filter((item) => {
        const p = item.price ?? item.cost ?? 0;
        return p <= maxPrice;
      });
    }

    // 9. Offer filter
    if (offerFilter !== "ALL") {
      result = result.filter((item) => item.offer === offerFilter);
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
  ]);
}
