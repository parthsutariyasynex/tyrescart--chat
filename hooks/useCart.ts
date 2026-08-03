"use client";

/**
 * React binding for the persisted cart.
 *
 * Same shape as `useSyncManager`: `useSyncExternalStore` over a module
 * singleton, no Provider. The cart has to be readable from the products table,
 * a header badge and (later) a checkout screen, none of which share a subtree —
 * a Provider would force one on them for no benefit.
 *
 *   const { lines, count, has, add, remove } = useCart();
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cartStore, type CartLine } from "@/services/cartStore";

export type { CartLine };

/**
 * Live cart contents plus the mutators.
 *
 * Hydration is kicked off on first mount; until it resolves the store reports
 * an empty cart, then re-renders once. That is a deliberate trade: rendering
 * instantly from an empty mirror beats blocking first paint on an IndexedDB
 * read, and the correction lands within a frame or two.
 */
export function useCart() {
  useEffect(() => {
    void cartStore.hydrate();
  }, []);

  const lines = useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot,
  );

  const has = useCallback((id: number) => lines.some((l) => l.id === id), [lines]);

  return {
    lines,
    count: lines.length,
    totalQty: lines.reduce((n, l) => n + l.qty, 0),
    totalPrice: lines.reduce((n, l) => n + l.price * l.qty, 0),
    has,
    add: cartStore.add,
    setQty: cartStore.setQty,
    setPrice: cartStore.setPrice,
    remove: cartStore.remove,
    clear: cartStore.clear,
  };
}

/** Just the line count — for a header badge that shouldn't re-render on every field change. */
export function useCartCount(): number {
  useEffect(() => {
    void cartStore.hydrate();
  }, []);
  return useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.count(),
    () => 0,
  );
}
