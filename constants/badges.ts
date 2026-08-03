/**
 * Badge class maps for product tables — one place to manage them.
 *
 * IMPORTANT: there are deliberately TWO sets, because the pages genuinely
 * differ today and this refactor must not change any pixels:
 *
 *   - `*_TAILWIND` — raw utility classes, used by /supplier-products.
 *   - `*_SEMANTIC` — the `badge-*` classes defined in globals.css, used by
 *     /tc-products.
 *
 * They are NOT interchangeable: the semantic maps also omit the duplicated
 * ALL-CAPS category keys the Tailwind map carries. Collapsing them into one map
 * would restyle one page, so both live here until someone decides which wins.
 * Migrating a page is then a one-line import swap.
 */

export type BadgeClassMap = Record<string, string>;

export const NO_API_FIELD = '—';

/* ─── Category badges ─────────────────────────────────────── */

/** Raw Tailwind variant — /supplier-products. Includes ALL-CAPS duplicates
 *  because that page can receive either casing from the feed. */
export const CATEGORY_BADGES_TAILWIND: BadgeClassMap = {
  Premium: 'bg-purple-50 text-purple-700 border-purple-200/70',
  Quality: 'bg-blue-50 text-blue-700 border-blue-200/70',
  Budget: 'bg-amber-50 text-amber-700 border-amber-200/70',
  'Mid-Range': 'bg-teal-50 text-teal-700 border-teal-200/70',
  'Tier 1': 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  'Tier 2': 'bg-sky-50 text-sky-700 border-sky-200/70',
  'Tier 3': 'bg-amber-50 text-amber-700 border-amber-200/70',
  PREMIUM: 'bg-purple-50 text-purple-700 border-purple-200/70',
  QUALITY: 'bg-blue-50 text-blue-700 border-blue-200/70',
  BUDGET: 'bg-amber-50 text-amber-700 border-amber-200/70',
  'MID-RANGE': 'bg-teal-50 text-teal-700 border-teal-200/70',
};

/** Semantic variant — /tc-products. Classes live in globals.css. */
export const CATEGORY_BADGES_SEMANTIC: BadgeClassMap = {
  Premium: 'badge-cat-premium',
  Quality: 'badge-cat-quality',
  Budget: 'badge-cat-budget',
  'Mid-Range': 'badge-cat-midrange',
  'Tier 1': 'badge-cat-tier1',
  'Tier 2': 'badge-cat-tier2',
  'Tier 3': 'badge-cat-tier3',
};

/* ─── Brand badges ────────────────────────────────────────── */

/** Raw Tailwind variant — /supplier-products. */
export const BRAND_BADGES_TAILWIND: BadgeClassMap = {
  Bridgestone: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  Habilead: 'bg-teal-50 text-teal-800 border-teal-200/70',
  Kumho: 'bg-indigo-50 text-indigo-800 border-indigo-200/70',
  Michelin: 'bg-sky-50 text-sky-800 border-sky-200/70',
  Continental: 'bg-orange-50 text-orange-800 border-orange-200/70',
};

/** Semantic variant — /tc-products. */
export const BRAND_BADGES_SEMANTIC: BadgeClassMap = {
  Bridgestone: 'badge-brand-emerald',
  Habilead: 'badge-brand-teal',
  Kumho: 'badge-brand-indigo',
  Michelin: 'badge-brand-sky',
  Continental: 'badge-brand-orange',
};

/* ─── Offer badges ────────────────────────────────────────── */

export const OFFER_COLOR_PALETTE = [
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/80', dot: 'bg-amber-500' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80', dot: 'bg-emerald-500' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200/80', dot: 'bg-indigo-500' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/80', dot: 'bg-purple-500' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/80', dot: 'bg-rose-500' },
  { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/80', dot: 'bg-sky-500' },
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200/80', dot: 'bg-teal-500' },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/80', dot: 'bg-orange-500' },
  { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200/80', dot: 'bg-violet-500' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200/80', dot: 'bg-cyan-500' },
];

export function getOfferBadgeStyle(offer: string, offerOptions?: string[]) {
  if (!offer || offer === NO_API_FIELD) {
    return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' };
  }
  let index = -1;
  if (offerOptions && offerOptions.length > 0) {
    index = offerOptions.indexOf(offer);
  }
  if (index === -1) {
    let hash = 0;
    for (let i = 0; i < offer.length; i++) {
      hash = offer.charCodeAt(i) + ((hash << 5) - hash);
    }
    index = Math.abs(hash);
  }
  return OFFER_COLOR_PALETTE[index % OFFER_COLOR_PALETTE.length];
}
