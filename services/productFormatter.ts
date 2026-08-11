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
  /** Fitting price as the tables render it. Two spellings because the pages
   *  pass mapped rows and CheckSupplierModal passes raw feed fields. */
  fittingPrice?: number;
  fitting_price?: number | string;
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

/** Units in a set — a full set of tyres for one car. */
export const SET_OF_4_UNITS = 4;

/**
 * Strips trailing load index and speed rating (e.g. "97/95R", "91V", "99H XL") from a tyre size string.
 */
export function stripLoadIndex(sizeStr: string): string {
  if (!sizeStr) return "";
  return sizeStr
    .replace(/\s+\d{2,3}(?:\/\d{2,3})?[A-Za-z]{1,2}(?:\s+XL)?\s*$/i, "")
    .trim();
}

/**
 * How many units a customer actually PAYS for to drive away with four tyres,
 * given the row's promotion. Used only to derive the Set of 4 figure — the
 * per-unit Price column is untouched.
 *
 * Keyed off the `offer` LABEL because that is the only offer information the
 * row carries (`offers` itself is an option id, resolved to text via
 * `tcAttributeLabelsQuery`). Compared case- and whitespace-insensitively so a
 * label edited in the Magento admin ("Buy 3 Get 1 free", double space) still
 * matches rather than silently reverting to full price.
 *
 * Anything unrecognised — no offer, `NO_API_FIELD`, or a promo that is not a
 * free-tyre deal ("Free Wheel Alignment", "Top Savings", "Price Slashed"…) —
 * falls back to the full four units. That fallback is deliberate: a promo whose
 * mechanics we cannot read must never quietly discount the displayed price.
 *
 * NOTE: of the 8 promotions configured on this store, only "Buy 3 Get 1 Free"
 * exists today; "Buy 2 Get 2 Free" is handled in advance for when it is added.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH. It lives here rather than on the TC
 * Products page so that every screen showing a Set of 4 figure — the TC table,
 * CSV export, Quick View, the Check Supplier header, the clipboard string —
 * computes it identically. Do not re-implement it anywhere.
 */
/**
 * Calculates the number of payable units for a given quantity under an offer.
 * For "Buy 3 Get 1 Free": 1 free item per 4 items (free = floor(qty / 4)).
 * For "Buy 2 Get 2 Free": 2 free items per 4 items (free = floor(qty / 4) * 2).
 */
export function calculatePayableQty(selectedQty: number, offerLabel?: string | null): number {
  if (selectedQty <= 0) return 0;
  const o = (offerLabel || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (o === "buy 3 get 1 free") {
    const freeItems = Math.floor(selectedQty / 4);
    return selectedQty - freeItems;
  }
  if (o === "buy 2 get 2 free") {
    const freeItems = Math.floor(selectedQty / 4) * 2;
    return selectedQty - freeItems;
  }
  return selectedQty;
}

export function setOfFourPaidUnits(offerLabel: string): number {
  return calculatePayableQty(SET_OF_4_UNITS, offerLabel);
}

/** The Set of 4 total for a unit price under a given promotion. */
export function setOfFourPrice(unitPrice: number, offerLabel?: string | null): number {
  return unitPrice * setOfFourPaidUnits(offerLabel ?? "");
}

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

  /* Availability is tested on the VALUE, not on the key: supplier rows carry
     `price: 0` rather than omitting it, so an `in`/undefined check would call a
     price "available" and copy AED 0.00 over a Cost the table is displaying. */
  const hasPrice = Number(item.price) > 0;
  const hasSetOf4 = Number(item.setOf4Price) > 0;

  /* Both spellings: the pages pass MAPPED rows (`fittingPrice`), the Check
     Supplier popup passes raw feed fields (`fitting_price`). */
  const fitting = Number(item.fittingPrice ?? item.fitting_price) || 0;

  /* Unchanged when a real Price exists. Fitting Price only joins the chain as a
     last resort, for supplier rows that have neither Price nor Cost. */
  const unitPrice = hasPrice ? Number(item.price) : Number(item.cost) || fitting || 0;
  const setTotal = hasSetOf4
    ? Number(item.setOf4Price)
    : setOfFourPrice(unitPrice, item.offer);

  const offer = offerLabel(item.offer);

  /* Assembled as a line list so the omitted Offer line leaves no blank behind. */
  const lines = [firstLine, `Price per Tire: AED ${money(unitPrice)}`];
  if (offer) lines.push(`Offer: ${offer}`);
  /* Supplier rows have no Price and no Set of 4, and a set total derived from a
     COST is not a customer-facing figure — those rows copy Cost and Fitting
     Price only. A row with either real value keeps the line exactly as before,
     including the tc case where Set of 4 is computed from Price. */
  if (hasPrice || hasSetOf4) {
    lines.push(`Set of 4 Price: AED ${money(setTotal)}`);
  }

  /* Supplier rows only — a row with a real Price and Set of 4 is untouched.
     Skipped when it already IS the unit price, so the same number is never
     printed twice. */
  if (!hasPrice && !hasSetOf4 && fitting > 0 && fitting !== unitPrice) {
    lines.push(`Fitting Price: AED ${money(fitting)}`);
  }

  return lines.join('\n');
}

/**
 * Formats multiple products for bulk clipboard copy.
 */
export function buildBulkCopyString(items: readonly FormattableProduct[]): string {
  return items.map(buildRowString).join('\n\n');
}
