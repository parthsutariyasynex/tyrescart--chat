"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import HeaderBookInquiry from "@/components/HeaderBookInquiry";
import { features } from "@/config/features";

export interface HeaderActionsProps {
  badge?: React.ReactNode;
  onCopyResult?: () => void;
  hasActiveFilter?: boolean;
  onCreateQuote?: () => void;
  onExportCSV?: () => void;
  onChat?: () => void;
  onTyresGuide?: () => void;
}

type ActionKey =
  | "badge"
  | "copyResult"
  | "bookInquiry"
  | "createQuote"
  | "chat"
  | "tyresGuide"
  | "export";

/**
 * PAGE ACTION CONFIG — the one place to edit when a page's action set changes.
 * Route prefix -> which of the 7 possible actions apply there. Matched with
 * `startsWith`, same as the `ROUTE_TASK` table in `components/SyncButton.tsx`,
 * so a route with no exact entry still resolves sensibly and a future
 * sub-route inherits its parent's config automatically.
 *
 * Reasoning per route (checked against what each page actually passes into
 * this component today — an action left out here already had no working
 * handler on that page, so hiding it removes a dead click, not a live one):
 *   /dashboard           no result set to copy/export; Book Inquiry, Create
 *                        Quote and Chat are wired and useful anywhere.
 *   /products            same reasoning, plus the items badge it renders.
 *   /tc-products,
 *   /supplier-products   full data tables — every action applies.
 *   /tyre_guide/chat     this header treats "Chat" and "Tyres Guide" as two
 *                        doors to the SAME destination, so being on it hides
 *                        both rather than leaving one as a self-link. Create
 *                        Quote and Copy Result DO apply — the page already had
 *                        an unwired `isQuotationModalOpen` + `<QuotationModal>`
 *                        and a per-card copy, just no header trigger for
 *                        either; Export stays hidden (no CSV concept here).
 *
 * "Book Inquiry" and "Create Quotation" are modals opened from every page, not
 * routes of their own — there is no URL that IS the booking or quoting screen,
 * so "hide the trigger while on that page" has no route to attach to today.
 * Giving such a route an entry here later (omitting "bookInquiry" /
 * "createQuote") is the entire change needed then — nothing else to touch.
 */
const PAGE_ACTIONS: { prefix: string; show: readonly ActionKey[] }[] = [
  {
    prefix: "/supplier-products",
    show: [
      "badge",
      "copyResult",
      "bookInquiry",
      "createQuote",
      "chat",
      "tyresGuide",
      "export",
    ],
  },
  {
    prefix: "/tc-products",
    show: [
      "badge",
      "copyResult",
      "bookInquiry",
      "createQuote",
      "chat",
      "tyresGuide",
      "export",
    ],
  },
  {
    prefix: "/tyreschat",
    show: ["badge", "bookInquiry", "copyResult", "createQuote"],
  },
  {
    prefix: "/dashboard",
    show: ["bookInquiry", "createQuote", "chat", "tyresGuide"],
  },
  // Keep last: "/products" is a prefix of nothing else here, but ordering
  // makes the intent explicit if a "/products-something" route ever appears.
  {
    prefix: "/products",
    show: ["badge", "bookInquiry", "createQuote", "chat", "tyresGuide"],
  },
];

/** Unlisted route fallback: show everything — an unmapped page is never LESS
 *  visible than it was before this config existed. */
const DEFAULT_SHOW: readonly ActionKey[] = [
  "badge",
  "copyResult",
  "bookInquiry",
  "createQuote",
  "chat",
  "tyresGuide",
  "export",
];

function visibleActions(pathname: string | null): Set<ActionKey> {
  if (!pathname) return new Set(DEFAULT_SHOW);
  const entry = PAGE_ACTIONS.find(({ prefix }) => pathname.startsWith(prefix));
  return new Set(entry ? entry.show : DEFAULT_SHOW);
}

/**
 * Shared Header Action Buttons component across TC Products, Supplier Products, etc.
 * Keeps Copy Result, Book Inquiry, Create Quote, Chat, Tyres Guide, and Export buttons 100% unified.
 *
 * Which buttons actually render is decided by `PAGE_ACTIONS` above, keyed off
 * the current route — hidden ones are simply not rendered (not `display:none`),
 * so the remaining buttons reflow with no leftover gap.
 */
export default function HeaderActions({
  badge,
  onCopyResult,
  hasActiveFilter = false,
  onCreateQuote,
  onExportCSV,
  onChat,
  onTyresGuide,
}: HeaderActionsProps) {
  const pathname = usePathname();
  const visible = visibleActions(pathname);

  return (
    <div className="flex items-center gap-1.5 2xl:gap-2.5 shrink-0">
      {/* Items count badge — fixed width wrapper prevents layout shift on text change */}
      {visible.has("badge") && badge !== undefined && (
        <div className="min-w-[96px] flex items-center justify-center shrink-0">
          {badge}
        </div>
      )}

      {/* Copy Result — present and enabled on every page. */}
      {features.copyResult && visible.has("copyResult") && (
        <button
          type="button"
          onClick={onCopyResult}
          title={
            hasActiveFilter ? "Copy All Search Results" : "Copy Search Results"
          }
          aria-label="Copy Result"
          className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3 text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-lg shadow-2xs transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <ClipboardDocumentIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="whitespace-nowrap">Copy Result</span>
        </button>
      )}

      {/* Book Inquiry Button */}
      {features.bookInquiry && visible.has("bookInquiry") && (
        <HeaderBookInquiry />
      )}

      {/* Create Quote Button */}
      {features.quotation && visible.has("createQuote") && (
        <button
          type="button"
          onClick={onCreateQuote}
          title="Create Quote"
          aria-label="Create Quote"
          className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs hover:shadow-indigo-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <DocumentTextIcon className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Create Quote</span>
        </button>
      )}

      {/* Chat Button / Popup Toggle */}
      {features.chat &&
        visible.has("chat") &&
        (onChat ? (
          <button
            type="button"
            onClick={onChat}
            title="Chat Shortcuts"
            aria-label="Chat Shortcuts"
            className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-xs hover:shadow-sky-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Chat</span>
          </button>
        ) : (
          <Link
            href="/tyreschat"
            title="Chat Shortcuts"
            aria-label="Chat Shortcuts"
            className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-xs hover:shadow-sky-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Chat</span>
          </Link>
        ))}

      {/* Tyres Guide */}
      {features.tyresGuide && visible.has("tyresGuide") && (
        <button
          type="button"
          onClick={onTyresGuide}
          title="Tyres Guide"
          aria-label="Tyres Guide"
          className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-xs hover:shadow-amber-500/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <BookOpenIcon className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Tyres Guide</span>
        </button>
      )}

      {/* Export — present and enabled on every page. */}
      {features.exportCsv && visible.has("export") && (
        <button
          type="button"
          onClick={onExportCSV}
          title="Export CSV"
          aria-label="Export"
          className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs hover:shadow-emerald-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          <span className="whitespace-nowrap">Export</span>
        </button>
      )}
    </div>
  );
}
