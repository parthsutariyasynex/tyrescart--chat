"use client";

import { useState, useCallback } from "react";

export interface Product {
  id: number;
  itemCode: string;
  brand: string;
  size: string;
  sizeFull?: string;
  pattern: string;
  cost: number;
  fittingPrice: number;
  qty: number;
  country: string;
  year: string | number;
  category?: string;
  productType?: string;
  speedRating?: string;
  loadIndex?: string;
  runflat?: boolean;
  source?: string;
  offerTag?: string;
  offers?: string[];
  supplier?: string;
  date?: string;
  dateKey?: number;
  [key: string]: any;
}

export function parseDateSortKey(dateVal?: any, yearVal?: any): number {
  if (typeof dateVal === "number" && dateVal !== 0) return dateVal;

  if (dateVal && typeof dateVal === "string") {
    const raw = dateVal.trim();
    if (raw) {
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        return Number(isoMatch[1]) * 10000 + Number(isoMatch[2]) * 100 + Number(isoMatch[3]);
      }
      const parsed = Date.parse(raw);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }

  const y = Number(yearVal);
  if (!isNaN(y) && y > 0) {
    return y * 10000;
  }

  return 0;
}

export function useProductSorting<T extends Record<string, any>>(
  defaultColumn: keyof T | null = "date",
  defaultAsc: boolean = false
) {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(defaultColumn);
  const [sortAsc, setSortAsc] = useState<boolean>(defaultAsc);

  const handleSort = useCallback(
    (column: keyof T) => {
      if (sortColumn === column) {
        setSortAsc((prev) => !prev);
      } else {
        setSortColumn(column);
        setSortAsc(column === "date" || column === "dateKey" ? false : true);
      }
    },
    [sortColumn]
  );

  const sortItems = useCallback(
    (items: T[]): T[] => {
      if (!sortColumn) return items;

      return [...items].sort((a, b) => {
        // Special date sorting: compares full date (latest first by default).
        // If year is same, sorts by exact date within that year.
        if (sortColumn === "date" || sortColumn === "dateKey") {
          const aKey = a.dateKey !== undefined && a.dateKey !== 0 ? a.dateKey : parseDateSortKey(a.date, a.year);
          const bKey = b.dateKey !== undefined && b.dateKey !== 0 ? b.dateKey : parseDateSortKey(b.date, b.year);

          if (aKey === bKey) return 0;
          return sortAsc ? aKey - bKey : bKey - aKey;
        }

        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        return sortAsc ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
      });
    },
    [sortColumn, sortAsc]
  );

  return {
    sortColumn,
    sortAsc,
    setSortColumn,
    setSortAsc,
    handleSort,
    sortItems,
  };
}
