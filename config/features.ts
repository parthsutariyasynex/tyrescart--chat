/**
 * Centralized Feature Flag System.
 *
 * Every toggleable feature in the application is controlled from this single
 * file. Values are read from environment variables so the same codebase can
 * power multiple Vercel projects (e.g. tyrescart and klevertire) with
 * different feature sets — no code changes, only different env-var values.
 *
 * ADDING A NEW FLAG
 * 1. Add a new `NEXT_PUBLIC_FEATURE_*` env var in Vercel (or `.env.local`).
 * 2. Add one line to the `features` object below.
 * That's it — no other file needs to know how flags are resolved.
 *
 * CONVENTION
 * - Client-readable flags use `NEXT_PUBLIC_FEATURE_*` so Next.js inlines
 *   them into the client bundle at build time.
 * - Server-only flags (e.g. API route gates) use `FEATURE_*` without the
 *   public prefix — they never reach the browser.
 * - Default is `true` (opt-out model): everything is ON unless explicitly
 *   set to `"false"` in the environment.
 */

/* ── helper ─────────────────────────────────────────────────── */

/**
 * Parse an env value into a boolean.
 *
 * `undefined` / missing → `defaultValue` (normally `true`).
 * `"false"`, `"0"`, `"no"`, `"off"` → `false`.
 * Anything else → `true`.
 */
function envBool(value: unknown, defaultValue = true): boolean {
  if (value === undefined || value === null || value === "")
    return defaultValue;
  const str = String(value).trim().toLowerCase();
  if (str === "false" || str === "0" || str === "no" || str === "off")
    return false;
  if (str === "true" || str === "1" || str === "yes" || str === "on")
    return true;
  return defaultValue;
}

/* ── feature flags ──────────────────────────────────────────── */

export const features = {
  /* ── Pages + Sidebar nav ── */
  dashboard: envBool(process.env.NEXT_PUBLIC_FEATURE_DASHBOARD),
  supplierProducts: envBool(process.env.NEXT_PUBLIC_FEATURE_SUPPLIER_PRODUCTS),
  tcProducts: envBool(process.env.NEXT_PUBLIC_FEATURE_TC_PRODUCTS),
  products: envBool(process.env.NEXT_PUBLIC_FEATURE_PRODUCTS),
  chat: envBool(process.env.NEXT_PUBLIC_FEATURE_CHAT),

  /* ── Header action buttons + their modals ── */
  bookInquiry: envBool(process.env.NEXT_PUBLIC_FEATURE_BOOK_INQUIRY),
  quotation: envBool(process.env.NEXT_PUBLIC_FEATURE_QUOTATION),
  tyresGuide: envBool(process.env.NEXT_PUBLIC_FEATURE_TYRES_GUIDE),
  exportCsv: envBool(process.env.NEXT_PUBLIC_FEATURE_EXPORT),
  copyResult: envBool(process.env.NEXT_PUBLIC_FEATURE_COPY_RESULT),

  /* ── Table row action buttons + their modals ── */
  cart: envBool(process.env.NEXT_PUBLIC_FEATURE_CART),
  wishlist: envBool(process.env.NEXT_PUBLIC_FEATURE_WISHLIST),
  whatsapp: envBool(process.env.NEXT_PUBLIC_FEATURE_WHATSAPP),
  checkSupplier: envBool(process.env.NEXT_PUBLIC_FEATURE_CHECK_SUPPLIER),
  costHistory: envBool(process.env.NEXT_PUBLIC_FEATURE_COST_HISTORY),
  quickView: envBool(process.env.NEXT_PUBLIC_FEATURE_QUICK_VIEW),

  /* ── Sidebar sync-all ── */
  sync: envBool(process.env.NEXT_PUBLIC_FEATURE_SYNC),

  /* ── Server-only: API routes ── */
  graphqlProxy: envBool(process.env.FEATURE_GRAPHQL_PROXY),
} as const;

export type FeatureKey = keyof typeof features;

/**
 * Check whether a feature is enabled. Convenience wrapper around `features[key]`.
 *
 * @example
 * if (!isFeatureEnabled("cart")) return null;
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return features[key];
}

/**
 * Map from sidebar `NavItem.href` to the feature key that gates it.
 * Used by `Sidebar.tsx` to filter navigation items.
 */
export const NAV_FEATURE_MAP: Record<string, FeatureKey> = {
  "/dashboard": "dashboard",
  "/supplier-products": "supplierProducts",
  "/tc-products": "tcProducts",
  "/products": "products",
  "/tyreschat": "chat",
};

/**
 * Returns the first enabled page href for the root redirect.
 * Falls back to "/dashboard" if nothing is enabled (edge case).
 */
export function getDefaultRoute(): string {
  const ordered: { href: string; key: FeatureKey }[] = [
    { href: "/dashboard", key: "dashboard" },
    { href: "/supplier-products", key: "supplierProducts" },
    { href: "/tc-products", key: "tcProducts" },
    { href: "/products", key: "products" },
    { href: "/tyreschat", key: "chat" },
  ];
  for (const { href, key } of ordered) {
    if (features[key]) return href;
  }
  return "/dashboard";
}
