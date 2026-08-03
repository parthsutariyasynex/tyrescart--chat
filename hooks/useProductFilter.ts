"use client";

import { useMemo } from "react";
import {
  searchWithAspectRimFallback,
  SEARCHABLE_FIELDS,
  DEFAULT_SIZE_FIELDS,
} from "@/services/searchFilter";

export function matchesSizeInput(item: { size?: string; sizeFull?: string }, s: string): boolean {
  const sizeVal = item.sizeFull || item.size || "";
  if (!s || !sizeVal) return false;
  const needle = s.toLowerCase();
  const plainNeedle = s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const plainItem = sizeVal.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return sizeVal.toLowerCase().includes(needle) || plainItem.includes(plainNeedle);
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
