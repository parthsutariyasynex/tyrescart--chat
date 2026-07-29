"use client";

/**
 * Shared header utility controls — the Online/Offline badge and the Fullscreen
 * toggle, previously duplicated across five pages.
 *
 * WHY THERE ARE VARIANT PROPS
 * The five copies were NOT identical, so this refactor must not flatten them or
 * it would restyle pages:
 *   - Fullscreen: /supplier-products and /tc-products use `text-slate-400`,
 *     the others `text-gray-400`.
 *   - Online badge: /tyre_guide/chat uses an auto-width `flex … py-1` pill,
 *     the others a fixed `h-7 w-[95px] inline-flex justify-center` one.
 * Each page passes its own variant, so output stays byte-identical. Once
 * someone decides on a single look, drop the prop and the variants with it.
 */

import { WifiIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";

/* ─── Online / Offline badge ──────────────────────────────── */

export type OnlineBadgeVariant = "fixed" | "auto";

const BADGE_SHELL: Record<OnlineBadgeVariant, string> = {
  /** Fixed-width pill — /products, /supplier-products, /tc-products, /dashboard. */
  fixed: "h-7 w-[95px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-full text-xs font-semibold shadow-2xs whitespace-nowrap",
  /** Auto-width pill — /tyre_guide/chat. */
  auto: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow-2xs",
};

export function OnlineStatusBadge({
  isOnline,
  variant = "fixed",
}: {
  isOnline: boolean;
  variant?: OnlineBadgeVariant;
}) {
  const shell = BADGE_SHELL[variant];
  return isOnline ? (
    <div className={`${shell} text-emerald-700 bg-emerald-50 border border-emerald-200`}>
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      <WifiIcon className="w-3.5 h-3.5 text-emerald-600" />
      <span>Online</span>
    </div>
  ) : (
    <div className={`${shell} text-rose-700 bg-rose-50 border border-rose-200`}>
      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
      <WifiIcon className="w-3.5 h-3.5 text-rose-600" />
      <span>Offline</span>
    </div>
  );
}

/* ─── Fullscreen toggle ───────────────────────────────────── */

export type FullscreenTone = "slate" | "gray";

const TONE: Record<FullscreenTone, string> = {
  slate: "text-slate-400 hover:text-slate-600",
  gray: "text-gray-400 hover:text-gray-600",
};

export function FullscreenButton({ tone = "slate" }: { tone?: FullscreenTone }) {
  return (
    <button
      onClick={() => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }}
      className={`p-2 ${TONE[tone]} transition-colors`}
      title="Fullscreen"
    >
      <ArrowsPointingOutIcon className="w-5 h-5" />
    </button>
  );
}

/* ─── Convenience pairing ─────────────────────────────────── */

/**
 * Fullscreen + Online badge in the order every page already renders them.
 * Pages that interleave other controls between the two should use the
 * individual exports instead.
 */
export default function HeaderUtilities({
  isOnline,
  badgeVariant = "fixed",
  fullscreenTone = "slate",
}: {
  isOnline: boolean;
  badgeVariant?: OnlineBadgeVariant;
  fullscreenTone?: FullscreenTone;
}) {
  return (
    <>
      <FullscreenButton tone={fullscreenTone} />
      <OnlineStatusBadge isOnline={isOnline} variant={badgeVariant} />
    </>
  );
}
