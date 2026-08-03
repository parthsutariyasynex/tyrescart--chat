/**
 * Offline-first cart — persisted in IndexedDB, readable synchronously.
 *
 * WHY THIS EXISTS
 * The cart was a `Set<number>` in React state, so it died on every refresh and
 * on every navigation away from the products page. For a POS that is a real
 * failure: an operator halfway through a sale loses it to an accidental reload
 * or a flaky connection.
 *
 * DESIGN — mirrors `syncManager`, deliberately
 * A module-scope singleton holding an in-memory mirror of the `cart` object
 * store, hydrated once at startup. Components read the mirror synchronously
 * through `useSyncExternalStore`; every mutation writes to IndexedDB AND
 * updates the mirror, then notifies subscribers.
 *
 * Reading from a mirror rather than awaiting IndexedDB per render is what lets
 * a cart badge render on first paint with no loading flicker. Writes are
 * fire-and-forget against the DB — the UI has already moved on, and a failed
 * write is logged rather than thrown, because losing one line is better than
 * breaking the sale.
 *
 * NOTE: this is Phase 3 (cart only). Orders and the offline outbox are Phase 4
 * and will add their own stores at DB v6.
 */

import { idbGetAll, idbPut, idbDelete, idbClear, STORE_CART } from "./db";

/** One cart line. `id` is the product id, so add-to-cart upserts by construction. */
export interface CartLine {
  id: number;
  sku: string;
  name: string;
  brand: string;
  size: string;
  /** Unit price at the time it was added — NOT re-read later, so a price change
   *  upstream can't silently alter a cart the operator already quoted. */
  price: number;
  qty: number;
  /** When the line was first added (ms epoch). */
  addedAt: number;
}

type Listener = () => void;

class CartStore {
  private lines: readonly CartLine[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;

  /* ── Reads (synchronous, from the mirror) ─────────────────── */

  getSnapshot = (): readonly CartLine[] => this.lines;

  /** Stable empty array for SSR — a new [] each call would loop useSyncExternalStore. */
  getServerSnapshot = (): readonly CartLine[] => EMPTY;

  has = (id: number): boolean => this.lines.some((l) => l.id === id);

  count = (): number => this.lines.length;

  totalQty = (): number => this.lines.reduce((n, l) => n + l.qty, 0);

  totalPrice = (): number => this.lines.reduce((n, l) => n + l.price * l.qty, 0);

  isHydrated = (): boolean => this.hydrated;

  /* ── Subscription ─────────────────────────────────────────── */

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private setLines(next: CartLine[]) {
    this.lines = next;
    this.emit();
  }

  /* ── Hydration ────────────────────────────────────────────── */

  /**
   * Load the persisted cart into the mirror. Idempotent and safe to call from
   * several components at once — concurrent callers await the same promise.
   */
  hydrate = (): Promise<void> => {
    if (this.hydrated) return Promise.resolve();
    if (this.hydrating) return this.hydrating;

    this.hydrating = idbGetAll<CartLine>(STORE_CART)
      .then((rows) => {
        // Oldest first, so the cart reads in the order things were scanned.
        this.setLines([...rows].sort((a, b) => a.addedAt - b.addedAt));
      })
      .catch((e) => {
        // An unreadable cart must not break the page — start empty.
        console.warn("[cart] could not hydrate from IndexedDB:", e);
      })
      .finally(() => {
        this.hydrated = true;
        this.hydrating = null;
      });

    return this.hydrating;
  };

  /* ── Mutations ────────────────────────────────────────────── */

  /** Add a product, or bump its quantity if already present. */
  add = (line: Omit<CartLine, "qty" | "addedAt">, qty = 1): void => {
    const existing = this.lines.find((l) => l.id === line.id);
    const next: CartLine = existing
      ? { ...existing, qty: existing.qty + qty }
      : { ...line, qty, addedAt: Date.now() };

    this.setLines(
      existing ? this.lines.map((l) => (l.id === next.id ? next : l)) : [...this.lines, next],
    );
    void idbPut(STORE_CART, next).catch((e) => console.error("[cart] add failed to persist:", e));
  };

  /** Set an exact quantity; 0 or less removes the line. */
  setQty = (id: number, qty: number): void => {
    if (qty <= 0) return this.remove(id);
    const existing = this.lines.find((l) => l.id === id);
    if (!existing) return;
    const next = { ...existing, qty };
    this.setLines(this.lines.map((l) => (l.id === id ? next : l)));
    void idbPut(STORE_CART, next).catch((e) => console.error("[cart] setQty failed to persist:", e));
  };

  /** Set an exact price for a cart item line. */
  setPrice = (id: number, price: number): void => {
    const existing = this.lines.find((l) => l.id === id);
    if (!existing) return;
    const next = { ...existing, price: Math.max(0, price) };
    this.setLines(this.lines.map((l) => (l.id === id ? next : l)));
    void idbPut(STORE_CART, next).catch((e) => console.error("[cart] setPrice failed to persist:", e));
  };

  remove = (id: number): void => {
    this.setLines(this.lines.filter((l) => l.id !== id));
    void idbDelete(STORE_CART, id).catch((e) => console.error("[cart] remove failed to persist:", e));
  };

  clear = (): void => {
    this.setLines([]);
    void idbClear(STORE_CART).catch((e) => console.error("[cart] clear failed to persist:", e));
  };
}

const EMPTY: readonly CartLine[] = Object.freeze([]);

/**
 * The singleton. Pinned to globalThis so Next's dev fast refresh can't fork it
 * mid-session and strand a half-populated mirror — same reasoning as syncManager.
 */
declare global {
  var __tyrescartCartStore: CartStore | undefined;
}

export const cartStore: CartStore =
  globalThis.__tyrescartCartStore ?? (globalThis.__tyrescartCartStore = new CartStore());
