"use client";

/**
 * The one page header.
 *
 * Every route rendered its own `<header>` — five copies of the same shell, the
 * same trailing Fullscreen / Sync / Online trio, and the same Book Inquiry
 * button, differing only in a few classes and props. A change to any of them
 * meant editing five files, which is how they drifted apart in the first place.
 *
 * This component owns the shell and the trailing controls. Everything a page
 * genuinely does differently — its title, count badge, search box, action
 * buttons — arrives as props, so no page needs its own header markup again.
 *
 * PIXEL PARITY. The two shells that existed are preserved exactly rather than
 * unified, because unifying them would restyle three pages:
 *   `plain`  — /dashboard, /products, /tyre_guide/chat  (gap-4, gray borders)
 *   `sticky` — /supplier-products, /tc-products          (sticky, backdrop blur)
 * The right-hand cluster keeps its per-variant gap too: gap-3 vs gap-2.5.
 */

import type { ReactNode } from "react";
import { OnlineStatusBadge, FullscreenButton } from "@/components/HeaderUtilities";
import SyncButton from "@/components/SyncButton";
import HeaderBookInquiry from "@/components/HeaderBookInquiry";
import { features } from "@/config/features";
import type { SyncTaskId } from "@/services/syncManager";

/** Standard unified header shell across all pages to prevent navigation layout shift. */
const SHELL = {
  plain:
    "sticky top-0 z-20 h-16 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs",
  sticky:
    "sticky top-0 z-20 h-16 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs",
} as const;

/** Unified Right-hand cluster spacing across all header variants. */
const ACTION_GAP = { plain: "gap-3", sticky: "gap-3" } as const;

export interface HeaderProps {
  variant?: keyof typeof SHELL;

  /** Page title, e.g. "TC Products". Omit when `left` supplies the whole side. */
  title?: string;
  /** Small line under the title. Only /dashboard-style pages use one. */
  subtitle?: string;
  /** Pill beside the title — the "8,526 items" / "Total: 84" counters. */
  badge?: ReactNode;

  /** Replaces the title block entirely. Used by pages that lead with a search box. */
  left?: ReactNode;
  /** Search / filter area. Rendered in the left slot, after `left`. */
  search?: ReactNode;

  /** Page-specific buttons, rendered before the shared trailing controls. */
  actions?: ReactNode;
  /** Anything else, rendered after the trailing controls. */
  children?: ReactNode;

  /* ── shared trailing controls ── */
  /** `false` hides the Book Inquiry button; otherwise picks its accent. */
  bookInquiry?: false | "default" | "emerald";
  fullscreenTone?: "gray" | "slate";
  /** Omit to let SyncButton map the task from the route, as it already does. */
  syncTask?: SyncTaskId;
  syncTitle?: string;
  syncTone?: "emerald" | "orange";
  isOnline: boolean;
  onlineVariant?: "fixed" | "auto";
}

export default function Header({
  variant = "plain",
  title,
  subtitle,
  badge,
  left,
  search,
  actions,
  children,
  bookInquiry = "default",
  fullscreenTone = "gray",
  syncTask,
  syncTitle,
  syncTone,
  isOnline,
  onlineVariant = "fixed",
}: HeaderProps) {
  return (
    <header className={SHELL[variant]}>
      {/* ── Left / Search Section ── */}
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        {left ?? (
          <div className="flex items-center gap-3 shrink-0">
            {title && (
              <h1
                className={
                  variant === "sticky"
                    ? "text-lg font-bold text-slate-900 tracking-tight whitespace-nowrap"
                    : "text-lg font-bold text-gray-800 tracking-tight whitespace-nowrap"
                }
              >
                {title}
              </h1>
            )}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">{subtitle}</p>}
            {badge}
          </div>
        )}
        {search}
      </div>

      {/* ── Right Section ── */}
      <div className={`flex items-center ${ACTION_GAP[variant]} shrink-0`}>
        {actions}
        {features.bookInquiry && bookInquiry !== false &&
          (bookInquiry === "emerald" ? <HeaderBookInquiry variant="emerald" /> : <HeaderBookInquiry />)}
        <FullscreenButton tone={fullscreenTone} />
        <SyncButton {...(syncTask ? { task: syncTask } : {})} title={syncTitle} tone={syncTone} />
        <OnlineStatusBadge isOnline={isOnline} variant={onlineVariant} />
        {children}
      </div>
    </header>
  );
}
