/**
 * Product enrichment — derive structured tyre fields from the Magento
 * storefront `products` payload, WITHOUT any extra API call.
 *
 * The storefront feed has no top-level brand/size/year, but it carries them:
 *   • brand → the "Brand" category child   (category id 4 → e.g. "Michelin")
 *   • size  → the "Tyre Size" category child (id 6, url_key starts with a digit,
 *             e.g. "195/80 R15" → url_key "195-80-r15"); falls back to the name
 *   • year  → the trailing 4-digit year in the product name ("… 2026")
 *
 * Verified coverage across the live catalogue (5,774 tyres):
 *   brand 100% · size 99.5% (94% category + 5.5% name) · year 99.9%.
 *
 * The enriched object keeps every original ProductItem field (image,
 * price_range, stock_status, uid …) so the existing card UI is unaffected.
 */
import type { ProductItem } from "./types";

export interface EnrichedProduct extends ProductItem {
  /** Brand name from the Brand category (e.g. "Michelin"); "" if not a tyre. */
  brand: string;
  /** Canonical size string (e.g. "195/80 R15"); "" if not derivable. */
  size: string;
  /** Digits-only size for normalized matching (e.g. "1958015"). */
  plain_size: string;
  /** 4-digit production year parsed from the name (e.g. "2026"); "" if absent. */
  year: string;
  /** Flattened final price for client-side sorting. */
  price: number;
  /** Stock status ("IN_STOCK" / "OUT_OF_STOCK" / …). */
  stock: string;
}

/**
 * Structural / root category labels that are never a brand or a size.
 * Excludes the Tyres/Brand/Size labels AND non-car roots (motorcycle tyres,
 * wheels, batteries) that would otherwise be mistaken for a brand on products
 * that carry no Brand taxonomy.
 */
const STRUCTURAL_URL_KEYS = new Set([
  "tyres", "brand", "size",
  "motorcycle-tyres", "car-wheels", "wheels", "car-battery", "batteries",
]);

/** A size category's url_key starts with a digit ("195-80-r15"); a brand's doesn't ("michelin"). */
const isSizeCategory = (c: { url_key?: string }) => /^\d/.test(c.url_key ?? "");

/** Fallback size parser from the product name — covers standard + flotation (33X/12.5 R18) formats. */
const SIZE_IN_NAME = /(\d[\d.\/xX]*\s*[ZR]{0,2}\s*R\s*\d{2}C?)/i;

const YEAR_IN_NAME = /\b(20\d{2})\b/;

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function deriveBrand(cats: ProductItem["categories"]): string {
  // Only derive a brand when the "Brand" taxonomy is actually present — this
  // avoids mislabeling products that have only a root category (e.g. a
  // motorcycle tyre whose sole category is "Motorcycle Tyres") as that label.
  const hasBrandLabel = (cats ?? []).some((c) => c.url_key === "brand");
  if (!hasBrandLabel) return "";
  const brandCat = (cats ?? []).find(
    (c) => c.url_key && !STRUCTURAL_URL_KEYS.has(c.url_key) && !isSizeCategory(c),
  );
  return brandCat?.name ?? "";
}

function deriveSize(cats: ProductItem["categories"], name: string): string {
  const sizeCat = (cats ?? []).find(isSizeCategory);
  if (sizeCat?.name) return sizeCat.name;
  const m = name.match(SIZE_IN_NAME);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

/** Enrich a single storefront product with derived structured fields. */
export function enrichProduct(p: ProductItem): EnrichedProduct {
  const size = deriveSize(p.categories, p.name ?? "");
  const min = p.price_range?.minimum_price;
  return {
    ...p,
    brand: deriveBrand(p.categories),
    size,
    plain_size: digitsOnly(size),
    year: (p.name ?? "").match(YEAR_IN_NAME)?.[1] ?? "",
    price: min?.final_price?.value ?? min?.regular_price?.value ?? 0,
    stock: p.stock_status ?? "",
  };
}

/** Enrich a batch of storefront products. */
export function enrichProducts(items: ProductItem[]): EnrichedProduct[] {
  return items.map(enrichProduct);
}
