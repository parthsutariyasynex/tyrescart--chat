/**
 * TC Products data layer — fetchers only.
 *
 * Every GraphQL query STRING lives in `services/queries.ts`, the project's
 * single source of truth for query text; this module just executes them against
 * the existing `/api/graphql` proxy route (which it does not modify) and shapes
 * the result. `tcProductsQuery` is a separate builder from `productsQuery`
 * deliberately — /products uses the latter, and widening it would change that
 * page's payload.
 *
 * ATTRIBUTE LABELS
 * Magento returns brand / tyre_size / runflat / oem_marking / year / country as
 * option IDs (`brand: 1358`), not text. `customAttributeMetadata` maps them to
 * labels ("Pirelli"), so the page fetches those maps ONCE and resolves every
 * row locally — no per-row lookup.
 */
import {
  tcProductsQuery,
  tcAttributeLabelsQuery,
  type TcProductsQueryVars,
} from '@/services/queries';

export interface TcApiProduct {
  uid: string;
  sku: string;
  name: string;
  stock_status: string | null;
  url_key: string | null;
  /** Option IDs — resolve through {@link TcAttributeLabels}. */
  brand: number | null;
  tyre_size: number | null;
  runflat: number | null;
  /** OEM approval marking (e.g. "* MOE", "* ZP"). The attribute is
   *  `oem_marking`, NOT `oem` — 274 options, null on non-OE-fitment tyres. */
  oem_marking: number | null;
  year: number | null;
  country: number | null;
  /** Free-text on this store, e.g. "107V". */
  load_index: string | null;
  image: { url: string | null; label: string | null } | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number | null; currency: string | null };
      final_price: { value: number | null; currency: string | null };
    };
  } | null;
  categories: { id: number; uid: string; name: string; url_key: string }[] | null;
}

export interface TcProductsResponse {
  total_count: number;
  page_info: { current_page: number; page_size: number; total_pages: number };
  items: TcApiProduct[];
}

/** attribute_code → (option id → label). */
export type TcAttributeLabels = Record<string, Record<string, string>>;

const ENDPOINT = '/api/graphql';

/** POST a query from services/queries.ts through the app's existing proxy route. */
async function execute<T>(query: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data?.errors?.[0]?.message || data?.detail || data?.title || `GraphQL HTTP error ${res.status}`;
    throw new Error(msg);
  }
  // A 200 can still carry field-level errors while returning usable data (e.g.
  // one product missing stock). Log and keep going rather than discarding the
  // whole page.
  if (data?.errors?.length) console.warn('[tc-products] GraphQL field errors:', data.errors);
  if (!data?.data) throw new Error(data?.errors?.[0]?.message || 'Empty GraphQL response');
  return data.data as T;
}

export async function fetchTcProducts(params: TcProductsQueryVars = {}): Promise<TcProductsResponse> {
  const data = await execute<{ products: TcProductsResponse }>(tcProductsQuery(params));
  return (
    data.products ?? {
      total_count: 0,
      page_info: { current_page: 1, page_size: 0, total_pages: 1 },
      items: [],
    }
  );
}

export async function fetchTcAttributeLabels(): Promise<TcAttributeLabels> {
  const data = await execute<{
    customAttributeMetadata: {
      items:
        | { attribute_code: string; attribute_options: { value: string; label: string }[] | null }[]
        | null;
    };
  }>(tcAttributeLabelsQuery());

  const out: TcAttributeLabels = {};
  for (const item of data.customAttributeMetadata?.items ?? []) {
    if (!item?.attribute_code) continue;
    const map: Record<string, string> = {};
    for (const opt of item.attribute_options ?? []) map[String(opt.value)] = opt.label;
    out[item.attribute_code] = map;
  }
  return out;
}

/** Resolve an option id to its label, or '' when unknown/absent. */
export function labelOf(labels: TcAttributeLabels, attribute: string, id: number | null): string {
  if (id === null || id === undefined) return '';
  return labels[attribute]?.[String(id)] ?? '';
}
