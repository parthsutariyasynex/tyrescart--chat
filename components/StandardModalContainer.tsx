"use client";

import React from "react";

/**
 * Standard Modal Container Configuration
 * Single source of truth for modal dimensions across the application.
 * Matches Create Quotation modal design reference:
 * - Fixed height: h-[90vh] max-h-[90vh]
 * - Full width: w-full max-w-full
 * - Rounded top corners: rounded-t-2xl border-t border-slate-200
 * - Fixed header/footer support via flex flex-col overflow-hidden
 */
export const STANDARD_MODAL_CARD_CLASS =
  "bg-slate-50 w-full max-w-full shadow-2xl flex flex-col overflow-hidden h-[90vh] max-h-[90vh] rounded-t-2xl border-t border-slate-200";

export interface StandardModalContainerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function StandardModalContainer({
  children,
  className = "",
  onClick,
}: StandardModalContainerProps) {
  return (
    <div
      className={`${STANDARD_MODAL_CARD_CLASS} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
