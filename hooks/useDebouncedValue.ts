"use client";

/**
 * Debounce a value — the shared version of the inline pattern /products already
 * used for its search box (`searchQuery` → `debouncedSearch`, 400ms).
 *
 * WHY THE PRODUCT PAGES NEED IT
 * The filter/sort memo on supplier-products and tc-products runs over the whole
 * loaded catalogue. Measured on the live supplier cache (319,429 rows), one
 * keystroke cost 2,494–2,626 ms of blocked main thread, so a six-character query
 * spent ~15 seconds recomputing results nobody asked for — the intermediate
 * ones are thrown away as soon as the next character lands.
 *
 * Debouncing collapses that to ONE recompute per pause in typing. The input
 * itself stays bound to the raw state, so typing never feels laggy; only the
 * expensive derived work waits.
 *
 * NOT `useDeferredValue`: that keeps the UI responsive but still runs the memo
 * for every intermediate value, because a synchronous memo inside render cannot
 * be interrupted. The goal here is to do less work, not to reprioritise it.
 */

import { useEffect, useState } from "react";

/** Matches the delay /products has used for its search box. */
export const FILTER_DEBOUNCE_MS = 400;

export function useDebouncedValue<T>(value: T, delayMs: number = FILTER_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
