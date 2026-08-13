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

export const NO_API_FIELD = "—";

/* ─── Category badges ─────────────────────────────────────── */

/** Raw Tailwind variant — /supplier-products. Includes ALL-CAPS duplicates
 *  because that page can receive either casing from the feed. */
export const CATEGORY_BADGES_TAILWIND: BadgeClassMap = {
  Premium: "bg-purple-50 text-purple-700 border-purple-200/70",
  Quality: "bg-blue-50 text-blue-700 border-blue-200/70",
  Budget: "bg-amber-50 text-amber-700 border-amber-200/70",
  "Mid-Range": "bg-teal-50 text-teal-700 border-teal-200/70",
  "Tier 1": "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  "Tier 2": "bg-sky-50 text-sky-700 border-sky-200/70",
  "Tier 3": "bg-amber-50 text-amber-700 border-amber-200/70",
  PREMIUM: "bg-purple-50 text-purple-700 border-purple-200/70",
  QUALITY: "bg-blue-50 text-blue-700 border-blue-200/70",
  BUDGET: "bg-amber-50 text-amber-700 border-amber-200/70",
  "MID-RANGE": "bg-teal-50 text-teal-700 border-teal-200/70",
};

/** Semantic variant — /tc-products and /supplier-products. Classes live in globals.css. */
export const CATEGORY_BADGES_SEMANTIC: BadgeClassMap = {
  Premium: "badge-cat-premium",
  Quality: "badge-cat-quality",
  Budget: "badge-cat-budget",
  "Mid-Range": "badge-cat-midrange",
  "Tier 1": "badge-cat-tier1",
  "Tier 2": "badge-cat-tier2",
  "Tier 3": "badge-cat-tier3",
  PREMIUM: "badge-cat-premium",
  QUALITY: "badge-cat-quality",
  BUDGET: "badge-cat-budget",
  "MID-RANGE": "badge-cat-midrange",
  "TIER 1": "badge-cat-tier1",
  "TIER 2": "badge-cat-tier2",
  "TIER 3": "badge-cat-tier3",
};

/* ─── Brand badges ────────────────────────────────────────── */

/** Raw Tailwind variant — /supplier-products. */
export const BRAND_BADGES_TAILWIND: BadgeClassMap = {
  Bridgestone: "bg-emerald-50 text-emerald-800 border-emerald-200/70",
  Habilead: "bg-teal-50 text-teal-800 border-teal-200/70",
  Kumho: "bg-indigo-50 text-indigo-800 border-indigo-200/70",
  Michelin: "bg-sky-50 text-sky-800 border-sky-200/70",
  Continental: "bg-orange-50 text-orange-800 border-orange-200/70",
};

/** Semantic variant — /tc-products. */
/**
 * Type column badge: Supplier = teal, Competitor = indigo.
 *
 * Returns SEMANTIC class names, not Tailwind utilities — the colours live in
 * globals.css beside the category pills, which is where this project keeps
 * theme-wide rules. The two badges then share one solid-fill treatment.
 *
 * Matched case-insensitively because the two tables feed it differently:
 * /supplier-products renders the LABEL ("Supplier") while the Check Supplier
 * popup renders the raw discriminator ("supplier"). Anything else keeps the
 * previous neutral slate, so an unexpected value is never mis-coloured.
 */
export function productTypeBadge(type: string | undefined | null): string {
  switch (
    String(type ?? "")
      .trim()
      .toLowerCase()
  ) {
    case "supplier":
      return "badge-type-supplier";
    case "competitor":
      return "badge-type-competitor";
    case "authorized":
    case "official":
      return "badge-type-authorized";
    case "parallel":
    case "import":
      return "badge-type-parallel";
    default:
      return "badge-type-default";
  }
}

export const BRAND_BADGES_SEMANTIC: BadgeClassMap = {
  Bridgestone: "badge-brand-emerald",
  Habilead: "badge-brand-teal",
  Kumho: "badge-brand-indigo",
  Michelin: "badge-brand-sky",
  Continental: "badge-brand-orange",
};

/* ─── Offer badges ────────────────────────────────────────── */

export const OFFER_COLOR_PALETTE = [
  {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
  },
  {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
  },
  {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200/80",
    dot: "bg-indigo-500",
  },
  {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200/80",
    dot: "bg-purple-500",
  },
  {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
  },
  {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200/80",
    dot: "bg-sky-500",
  },
  {
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200/80",
    dot: "bg-teal-500",
  },
  {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200/80",
    dot: "bg-orange-500",
  },
  {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200/80",
    dot: "bg-violet-500",
  },
  {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200/80",
    dot: "bg-cyan-500",
  },
];

export const KNOWN_OFFER_STYLES: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  "buy 3 get 1 free": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
  },
  "buy 3 get 1": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
  },
  "free wheel alignment": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
  },
  "free alignment": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
  },
  "free fitting": {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200/80",
    dot: "bg-sky-500",
  },
  "free balancing": {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200/80",
    dot: "bg-indigo-500",
  },
};

export function getOfferBadgeStyle(
  offer: string | undefined | null,
  offerOptions?: string[],
) {
  if (!offer || offer === NO_API_FIELD) {
    return {
      bg: "bg-slate-50",
      text: "text-slate-500",
      border: "border-slate-200",
      dot: "bg-slate-400",
    };
  }
  const norm = offer.trim().toLowerCase();
  if (KNOWN_OFFER_STYLES[norm]) {
    return KNOWN_OFFER_STYLES[norm];
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

/* ─── Brand logos ──────────────────────────────────────────── */

/**
 * Brand mark filenames, keyed by NORMALISED brand name.
 *
 * Generated from the files already present in `public/mgs_brand`; no logo is
 * fetched or added at runtime. Keyed by the normalised name rather than the raw
 * label so the two feeds agree without duplicate entries — /supplier-products
 * sends "Matrax Tyres" and /tc-products sends "Matrax", and both reduce to
 * `matrax`.
 *
 * Only the filename is stored. Magento buckets its media by the first two
 * characters of the filename (`kumho.png` -> `/k/u/kumho.png`), verified true
 * for all 440 files, so `brandLogoUrl` derives the folders instead of anyone
 * maintaining them by hand.
 *
 * Where a brand had several files (105 of them did — `kumho` had 6), one was
 * picked by: PNG first, then the un-suffixed base name, then the shortest.
 */
export const BRAND_LOGO_FILES: Record<string, string> = {
  accelera: "accelera.png",
  altenzo: "altenzo-logo.jpg",
  amaron: "amaron_logo_0.jpg",
  americanracing: "american-racing_1_.png",
  annaite: "annaite-logo_1.jpg",
  apollo: "apollo-tyres.png",
  aptany: "aptany.png",
  arduzza: "arduzza_2_.png",
  arivo: "arivo_1.jpg",
  armstrong: "armstrong-logo.png",
  arroyo: "arroyo-logo.png",
  asimco: "asimco_1_.jpg",
  atlander: "atlander-tyres_1.jpg",
  atlas: "atlas.jpg",
  atturo: "atturo.png",
  austone: "austone-tires.png",
  bearway: "bearway-logo.jpg",
  bfgoodrich: "bfgoodrich.png",
  bigbull: "big-bull_1_.png",
  bosch: "bosch_1_.png",
  bridgestone: "bridgestone-tyres-shop.png",
  ceros: "ceros.png",
  charmhoo: "charmhoo-logo.png",
  compasal: "compasal_1.jpg",
  constancy: "constancy.jpg",
  continental: "continental.png",
  crossleader: "crossleader-tyres-shop.png",
  cst: "cst_1_.jpg",
  dagenite: "dagenite_1_.jpg",
  deestone: "deestone.png",
  doublecoin: "double-coin.jpg",
  doublestar: "double-star-tyres-shop.png",
  dunlop: "dunlop.png",
  duracell: "duracell_1_.jpg",
  duraman: "duraman-tyres_1.jpg",
  falken: "falken.png",
  fiamm: "fiamm_1_.jpg",
  forceland: "forceland_1_.png",
  forceum: "forceum_1.jpg",
  fortune: "fortune-logo.jpg",
  fpower: "fpower_1_.png",
  fuel: "fuel_1_.png",
  gepormax: "gepormax.jpg",
  gfx: "gfx_1_.jpg",
  giti: "giti-tyres-shop.png",
  goodyear: "goodyear-tyres-shop.png",
  gripmax: "gripmax-logo.jpg",
  habilead: "habilead.png",
  hankook: "hankook-tyres-shop.png",
  headway: "headway-logo.jpg",
  hilo: "hilo.png",
  honour: "honour-logo.jpg",
  ilink: "ilink-logo.jpg",
  kapsen: "kapsen-logo.jpg",
  kingboss: "kingboss.png",
  kmcwheels: "kmc_wheels_1_.png",
  kumho: "kumho.png",
  kustone: "kustone_1.jpg",
  landsail: "landsail-tyres-shop.png",
  landspider: "land-spider_1.jpg",
  lanvigator: "lanvigator_1.jpg",
  laufenn: "laufenn-logo.png",
  leao: "leao-logo_1.png",
  linglong: "linglong_1.jpg",
  longway: "longway_1.jpg",
  marshal: "marshal.jpg",
  mastercraft: "master-craft.png",
  matrax: "matrax-tyres.png",
  maxtrek: "maxtrek-logo.jpg",
  maxxis: "maxxis.png",
  maxzez: "maxzez_1_.jpg",
  metzeler: "metzeler-logo_1_.png",
  michelin: "michelin.png",
  mileking: "mileking-tyre_1.jpg",
  motegiracing: "motegi_racing_logo_1_.png",
  mrf: "mrf-tyres.png",
  nankang: "nankang.png",
  neolin: "neolin.jpg",
  nexen: "nexen.png",
  niche: "niche_1_.png",
  otani: "otani.jpg",
  petlas: "petlas_1.jpg",
  pirelli: "pirelli.png",
  prinx: "prinx-tires-logo.jpg",
  radar: "radar.png",
  rauffan: "rauffan.jpg",
  roadking: "roadking.png",
  roadstone: "roadstone.png",
  roadx: "roadx-logo.png",
  rockblade: "rockblade_1.jpg",
  rotalla: "rotalla-logo.jpg",
  rotiform: "rotiform_1_.png",
  sailun: "sailun-logo_1.jpg",
  seam: "seam-tyre-logo.png",
  sensus: "sensus.jpg",
  solite: "solite_1_.jpg",
  sonix: "sonix_1.jpg",
  sunny: "sunny.jpg",
  tbb: "tbb-logo.jpg",
  teraflex: "teraflex_1.png",
  toyo: "toyo.png",
  tracmax: "tracmax-tyres.jpg",
  varta: "varta_1_.jpg",
  venom: "venom.png",
  vision: "vision_1_.jpg",
  vitour: "vitour-logo.jpg",
  volcan: "volcan_1_.png",
  vredestein: "vredestein.png",
  wanli: "wanli-logo.jpg",
  warrior: "warrior-logo.png",
  windforce: "windforce-logo_1.png",
  winrun: "winrun.png",
  yokohama: "yokohama-tyre-shop.png",
  yomar: "yomar.png",
  zelda: "zelda.jpg",
  zeta: "zeta-logo.jpg",
  zextour: "zextour-logo.jpg",
};

/**
 * Manual corrections, keyed the same way as BRAND_LOGO_FILES.
 *
 * The generated map strips filler words ("logo", "tyre(s)", "tire(s)", "shop")
 * from BOTH sides so "Matrax Tyres" finds matrax-tyres.png. That is wrong for a
 * brand whose real name contains one of those words — "General Tire" reduces to
 * "general", which could collide with an unrelated file. Add an entry here to
 * force a specific file, or an empty string to suppress the logo entirely.
 *
 * Empty today: of the 202 brands, only "TBB Tires" matched via filler-stripping
 * ("TBB" + "Tires" -> tbb-logo.jpg), which is correct. Kept as the escape hatch
 * for when new brands or files arrive.
 */
export const BRAND_LOGO_OVERRIDES: Record<string, string> = {};

/** Same normalisation the map was generated with — see BRAND_LOGO_FILES. */
function normaliseBrandKey(brand: string): string {
  const filler = /\b(logo|logos|tyre|tyres|tire|tires|shop|brand)\b/g;
  return brand
    .toLowerCase()
    .replace(filler, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Public URL of a brand's logo, or null when there is no file for it.
 *
 * null is the normal case for 83 of the 202 brands — callers must keep their
 * existing text label as the fallback rather than rendering a broken image.
 */
export function brandLogoUrl(brand: string | undefined | null): string | null {
  const key = normaliseBrandKey(String(brand ?? ""));
  if (!key) return null;
  const override = BRAND_LOGO_OVERRIDES[key];
  if (override === "") return null;
  const file = override || BRAND_LOGO_FILES[key];
  if (!file) return null;
  // Magento buckets media by the filename's first two characters.
  return `/mgs_brand/${file.slice(0, 1).toLowerCase()}/${file.slice(1, 2).toLowerCase()}/${file}`;
}
