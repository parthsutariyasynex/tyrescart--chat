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
  year: string;
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
  [key: string]: any;
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
        setSortAsc(true);
      }
    },
    [sortColumn]
  );

  const sortItems = useCallback(
    (items: T[]): T[] => {
      if (!sortColumn) return items;

      return [...items].sort((a, b) => {
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
