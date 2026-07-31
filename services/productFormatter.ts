/**
 * Product copy/clipboard formatting — single source of truth for copying product data.
 *
 * Output format:
 * {{Product Name}} {{Origin}}
 * Price per Tire: AED {{Price}}
 * Set Of 4 Price: AED {{Set of 4 Price}}
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

  const cost = item.cost || 0;
  const pricePerTire = cost.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const setOf4Price = (cost * 4).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${firstLine}\nPrice per Tire: AED ${pricePerTire}\nSet Of 4 Price: AED ${setOf4Price}`;
}

/**
 * Formats multiple products for bulk clipboard copy.
 */
export function buildBulkCopyString(items: readonly FormattableProduct[]): string {
  return items.map(buildRowString).join('\n\n');
}
