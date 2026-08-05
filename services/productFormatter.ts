/**
 * Product copy/clipboard formatting — single source of truth for copying product data.
 *
 * Output format:
 * {{Product Name}} {{Origin}}
 * Price per Tire: AED {{Price}}
 * Offer: {{Offer}}              <- only when the product actually has one
 * Set of 4 Price: AED {{Set of 4 Price}}
 *
 * The Offer line is omitted entirely (no blank line left behind) when the
 * product carries no offer, so a no-offer product copies as exactly the three
 * lines it always did.
 */

export interface FormattableProduct {
  category?: string;
  brand?: string;
  pattern?: string;
  size?: string;
  sizeFull?: string;
  year?: number;
  country?: string;
  qty?: number | null;
  cost?: number;
  /** Unit price. Preferred over `cost` when present — tc-products sets both to
   *  the same value; supplier rows only have `cost`. */
  price?: number;
  /** The row's already-computed Set of 4 total, which is NOT always unit × 4:
   *  "Buy 2 Get 2 Free" pays for 2 and "Buy 3 Get 1 Free" for 3. Only
   *  tc-products computes it, so absence falls back to unit × 4. */
  setOf4Price?: number;
  /** Offer label, or a placeholder ("—") when the product has none. */
  offer?: string;
}

/** Units in a set when the row carries no precomputed Set of 4 total. */
const SET_OF_4_UNITS = 4;

/**
 * Placeholders that mean "no offer" rather than an offer named "—".
 * tc-products renders its NO_API_FIELD em-dash for offerless products, and a
 * hyphen/blank arrives from the other copy paths.
 */
const NO_OFFER_VALUES = new Set(['', '-', '—', '–', 'n/a', 'none', 'no offer']);

/** The offer label to print, or '' when the product has no offer at all. */
function offerLabel(offer: string | undefined | null): string {
  if (offer === undefined || offer === null) return '';
  const trimmed = String(offer).trim();
  return NO_OFFER_VALUES.has(trimmed.toLowerCase()) ? '' : trimmed;
}

/**
 * Formats a single product for clipboard copy.
 */
export function buildRowString(item: FormattableProduct): string {
  const brand = item.brand || '';
  const rawPattern = item.pattern || item.sizeFull || item.size || '';
  
  let productName = rawPattern;
  if (brand && !rawPattern.toLowerCase().startsWith(brand.toLowerCase())) {
    productName = `${brand} ${rawPattern}`.trim();
  }

  const origin = item.country && item.country !== '-' ? item.country.trim() : '';
  const firstLine = [productName, origin].filter(Boolean).join(' ');

  const money = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const unitPrice = item.price || item.cost || 0;
  const setTotal =
    typeof item.setOf4Price === 'number' && item.setOf4Price > 0
      ? item.setOf4Price
      : unitPrice * SET_OF_4_UNITS;

  const offer = offerLabel(item.offer);

  /* Assembled as a line list so the omitted Offer line leaves no blank behind. */
  const lines = [firstLine, `Price per Tire: AED ${money(unitPrice)}`];
  if (offer) lines.push(`Offer: ${offer}`);
  lines.push(`Set of 4 Price: AED ${money(setTotal)}`);

  return lines.join('\n');
}

/**
 * Formats multiple products for bulk clipboard copy.
 */
export function buildBulkCopyString(items: readonly FormattableProduct[]): string {
  return items.map(buildRowString).join('\n\n');
}
