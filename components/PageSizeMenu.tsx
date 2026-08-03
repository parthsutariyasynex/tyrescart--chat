"use client";

import React, { useState, useRef, useEffect } from "react";

interface PageSizeMenuProps {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  options?: number[];
  position?: "top" | "bottom";
}

export default function PageSizeMenu({
  pageSize,
  onPageSizeChange,
  options = [15, 30, 50, 100],
  position = "top",
}: PageSizeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const dropdownPosClass =
    position === "bottom"
      ? "bottom-full mb-1.5 left-0"
      : "top-full mt-1.5 right-0";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-7 px-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
      >
        <span>{pageSize}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
            isOpen ? "rotate-180 text-emerald-600" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute ${dropdownPosClass} w-16 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100`}
        >
          {options.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                onPageSizeChange(size);
                setIsOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 text-xs font-semibold flex items-center justify-between transition-colors ${
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
  );
}
