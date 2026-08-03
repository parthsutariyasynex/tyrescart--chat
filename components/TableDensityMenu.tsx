"use client";

import React, { useState, useRef, useEffect } from "react";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";

export type TableDensity = "compact" | "comfortable" | "breathable";

interface TableDensityMenuProps {
  density: TableDensity;
  onDensityChange: (density: TableDensity) => void;
}

export default function TableDensityMenu({
  density,
  onDensityChange,
}: TableDensityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: { key: TableDensity; label: string }[] = [
    { key: "compact", label: "Compact (44px)" },
    { key: "comfortable", label: "Standard (54px)" },
    { key: "breathable", label: "Breathable (64px)" },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Density"
        aria-label="Density"
        className="h-9 w-9 flex items-center justify-center text-slate-600 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer"
      >
        <AdjustmentsHorizontalIcon className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-40">
          {options.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onDensityChange(item.key);
                setIsOpen(false);
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
            >
              <span>{item.label}</span>
              {density === item.key && <span className="text-emerald-600 font-bold">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
