"use client";

import React, { useState, useRef, useEffect } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  setPageSize?: (size: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  setPageSize,
  pageSizeOptions = [15, 30, 50, 100],
}: PaginationProps) {
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  // Click outside listener for Page Size dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node)) {
        setIsPageSizeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (totalPages <= 0) return null;

  return (
    <div className={`px-5 py-3 flex items-center ${pageSize && setPageSize ? "justify-between" : "justify-end"} border-t border-slate-100 bg-white`}>
      {/* Left: Show N entries/page (if pageSize and setPageSize provided) */}
      {pageSize !== undefined && setPageSize && (
        <div
          ref={pageSizeRef}
          className="relative inline-flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/90 shadow-2xs"
        >
          <span className="text-slate-400 font-medium">Show</span>
          <button
            type="button"
            onClick={() => setIsPageSizeOpen((prev) => !prev)}
            className="h-6 px-2 flex items-center gap-1 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-100 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
          >
            <span>{pageSize}</span>
            <svg
              className={`w-3 h-3 text-slate-400 transition-transform ${isPageSizeOpen ? "rotate-180 text-emerald-600" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <span className="text-slate-500">entries</span>

          {isPageSizeOpen && (
            <div className="absolute left-0 bottom-full mb-1.5 w-16 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
              {pageSizeOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setPageSize(size);
                    onPageChange(1);
                    setIsPageSizeOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center justify-between transition-colors ${
                    pageSize === size
                      ? "text-emerald-700 bg-emerald-50/80 font-bold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>{size}</span>
                  {pageSize === size && <span className="text-emerald-600 font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Right: Previous / page numbers / Next */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Previous
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum = i + 1;
            if (totalPages > 5) {
              if (currentPage > 3 && currentPage < totalPages - 1) {
                pageNum = currentPage - 2 + i;
              } else if (currentPage >= totalPages - 1) {
                pageNum = totalPages - 4 + i;
              }
            }
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                className={`w-7 h-7 text-xs font-semibold rounded-lg flex items-center justify-center transition-all ${
                  currentPage === pageNum
                    ? "bg-emerald-600 text-white font-bold shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Next
        </button>
      </div>
    </div>
  );
}
