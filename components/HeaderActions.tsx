'use client';

import React from 'react';
import Link from 'next/link';
import {
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import HeaderBookInquiry from '@/components/HeaderBookInquiry';

export interface HeaderActionsProps {
  onCopyResult?: () => void;
  hasActiveFilter?: boolean;
  onCreateQuote?: () => void;
  onExportCSV?: () => void;
  showBookInquiry?: boolean;
  showChat?: boolean;
  showTyresGuide?: boolean;
}

/**
 * Shared Header Action Buttons component across TC Products, Supplier Products, etc.
 * Keeps Copy Result, Book Inquiry, Create Quote, Chat, Tyres Guide, and Export buttons 100% unified.
 */
export default function HeaderActions({
  onCopyResult,
  hasActiveFilter = false,
  onCreateQuote,
  onExportCSV,
  showBookInquiry = true,
  showChat = true,
  showTyresGuide = true,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      {/* Copy All Search Results Button */}
      {onCopyResult && (
        <button
          type="button"
          onClick={onCopyResult}
          title={hasActiveFilter ? "Copy All Search Results" : "Copy Search Results"}
          aria-label="Copy Result"
          className="h-9 flex items-center gap-2 px-3 text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-lg shadow-2xs transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <ClipboardDocumentIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="whitespace-nowrap">Copy Result</span>
        </button>
      )}

      {/* Book Inquiry Button */}
      {showBookInquiry && <HeaderBookInquiry />}

      {/* Create Quote Button */}
      {onCreateQuote && (
        <button
          type="button"
          onClick={onCreateQuote}
          title="Create Quote"
          aria-label="Create Quote"
          className="h-9 flex items-center gap-1.5 px-3.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs hover:shadow-indigo-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <DocumentTextIcon className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Create Quote</span>
        </button>
      )}

      {/* Chat */}
      {showChat && (
        <Link
          href="/tyre_guide/chat"
          title="Chat"
          aria-label="Chat"
          className="h-9 flex items-center gap-1.5 px-3.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-xs hover:shadow-sky-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Chat</span>
        </Link>
      )}

      {/* Tyres Guide Button */}
      {showTyresGuide && (
        <button
          type="button"
          title="Tyres Guide"
          aria-label="Tyres Guide"
          className="h-9 flex items-center gap-1.5 px-3.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-xs hover:shadow-amber-500/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Tyres Guide</span>
        </button>
      )}

      {/* Export Button */}
      {onExportCSV && (
        <button
          type="button"
          onClick={onExportCSV}
          className="h-9 flex items-center gap-2 px-3.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-all hover:shadow-emerald-600/20 active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="whitespace-nowrap">Export</span>
        </button>
      )}
    </div>
  );
}
