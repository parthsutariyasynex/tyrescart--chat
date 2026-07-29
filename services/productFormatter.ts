/**
 * Product copy/clipboard formatting — the single source of truth for the
 * "copy row" string used by the product tables.
 *
 * Centralised because `/supplier-products` and `/tc-products` had byte-identical
 * copies of this logic. The format is deliberately frozen: users paste these
 * lines into quotes and spreadsheets, so changing the separator, the field
 * order, or the empty-value handling would silently break their workflow.
 *
 * Shape (fields joined by " - ", empties dropped):
 *   category - brand - pattern - size - year - country - qty - cost
 * e.g. "Motorcycle Tyres - Michelin - Michelin 100/80 R17 52H Scorcher 11 2023
 *       - 100/80 R17 52H - 2023 - 0 - 1,075.00"
 */

/**
 * Minimum shape a row must have to be formatted. Structural, so both pages'
 * local `Product` interfaces satisfy it without importing a shared type.
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
}

/**
 * One product as a single clipboard line.
 *
 * Preserved verbatim from the original inline implementations — including the
 * quirks: `qty` falls back to 0 (not dropped) via `??`, `country` is skipped
 * when it is literally "-", and `cost` is always rendered with two decimals
 * even when zero.
 */
export function buildRowString(item: FormattableProduct): string {
  const formattedCost = (item.cost || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const parts = [
    item.category || '',
    item.brand || '',
    item.pattern || '',
    item.sizeFull || item.size || '',
    item.year && item.year > 0 ? item.year : '',
    item.country && item.country !== '-' ? item.country : '',
    item.qty ?? 0,
    formattedCost,
  ].filter((val) => val !== '' && val !== undefined && val !== null);
  return parts.join(' - ');
}

/**
 * Many products as one clipboard payload — exactly as if the row copy had been
 * used on each, joined by newlines. Same formatter, so bulk and single output
 * can never drift apart.
 */
export function buildBulkCopyString(items: readonly FormattableProduct[]): string {
  return items.map(buildRowString).join('\n');
}
