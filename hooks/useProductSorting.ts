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
        // Year joins date in opening DESCENDING. Ascending put year 0 — rows
        // with no year, which render "-" — at the top of the first click, so
        // sorting by Year showed a page of blanks instead of 2026 first.
        setSortAsc(column === "date" || column === "dateKey" || column === "year" ? false : true);
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

        /* Year: numeric DESC first, then date DESC inside the same year.

           Falling through to the generic branch below was wrong twice over.

           1. No tie-break. Equal years hit `if (aVal === bVal) return 0`, so
              order inside a year came from whatever order the rows arrived in,
              not the date — the visible bug (2026 listed 04 Aug, 06 Aug,
              05 Aug).
           2. `year` is `string | number` — the feed sends "2025" as a string
              while other paths coerce it to a number. For a string/number pair
              of the SAME year the generic branch returns 1 in both directions
              (cmp(a,b) === cmp(b,a) === 1), so it is not antisymmetric and the
              relative order of those rows is undefined. No year inversion was
              reproduced from this in testing, but the comparator is invalid and
              the engine is free to order such rows arbitrarily.

           `Number(...) || 0` normalises both shapes; a missing or unparseable
           year becomes 0 and sorts last under DESC. The date tie-break is
           always newest-first, independent of the column's asc/desc toggle. */
        if (sortColumn === "year") {
          const aYear = Number(a.year) || 0;
          const bYear = Number(b.year) || 0;
          if (aYear !== bYear) return sortAsc ? aYear - bYear : bYear - aYear;

          const aKey = a.dateKey !== undefined && a.dateKey !== 0 ? a.dateKey : parseDateSortKey(a.date, a.year);
          const bKey = b.dateKey !== undefined && b.dateKey !== 0 ? b.dateKey : parseDateSortKey(b.date, b.year);
          return bKey - aKey;
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
