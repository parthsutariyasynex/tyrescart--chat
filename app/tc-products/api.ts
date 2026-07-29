/**
 * TC Products data layer — a thin re-export surface for the page.
 *
 * The implementation moved DOWN a layer: query strings live in
 * `services/queries.ts`, the raw fetchers in `services/graphql.ts` (beside the
 * storefront/supplier/chat ones), and the cache-first wrappers plus the
 * background catalogue sync in `services/cache.ts`.
 *
 * WHY: the sync task in `services/syncTasks.ts` runs this page's load, and
 * services must not import from `app/`. Keeping one implementation there — and
 * re-exporting it here — means the page and the background sync share the same
 * fetchers, the same cache keys and the same TTL, instead of two parallel copies
 * that could drift or double-fetch.
 *
 * This module keeps only what is page-specific: the label lookup helper.
 */

export {
  fetchTcProductsCached,
  fetchTcAttributeLabelsCached,
  getTcProductsLastSyncTime,
  getCachedTcPages,
  syncAllTcProducts,
  tcPageVars,
  TC_CACHE_KEY_PREFIX,
  TC_PAGE_SIZE,
} from '@/services/cache';

export { fetchTcProductsGraphQL as fetchTcProducts } from '@/services/graphql';

export type {
  TcApiProduct,
  TcProductsResponse,
  TcAttributeLabels,
  TcProductsBatch,
} from '@/services/types';

import type { TcAttributeLabels } from '@/services/types';

/**
 * Resolve an option id to its label, or '' when unknown/absent.
 *
 * An empty string rather than the raw id: showing "1358" where a brand belongs
 * would look like data, and the table's `NO_API_FIELD` placeholder makes a
 * missing value explicit instead.
 */
export function labelOf(labels: TcAttributeLabels, attribute: string, id: number | null): string {
  if (id === null || id === undefined) return '';
  return labels[attribute]?.[String(id)] ?? '';
}
