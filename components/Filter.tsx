"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  XMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

// Offer Badge color helper if offer dropdown is displayed
const OFFER_COLOR_PALETTE = [
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/80', dot: 'bg-amber-500' },
  { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/80', dot: 'bg-sky-500' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/80', dot: 'bg-rose-500' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/80', dot: 'bg-purple-500' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200/80', dot: 'bg-indigo-500' },
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200/80', dot: 'bg-teal-500' },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/80', dot: 'bg-orange-500' },
  { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200/80', dot: 'bg-pink-500' },
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/80', dot: 'bg-blue-500' },
  { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200/80', dot: 'bg-violet-500' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200/80', dot: 'bg-cyan-500' },
];

function getOfferBadgeStyle(offer: string, offerOptions?: string[]) {
  if (!offer || offer === '-') {
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

export interface FilterProps {
  // Supplier filter (optional)
  showSupplierFilter?: boolean;
  supplierFilter?: string;
  setSupplierFilter?: (val: string) => void;
  supplierOptions?: string[];

  // Category filter
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  categoryOptions: string[];

  // Brand filter
  brandInput: string;
  setBrandInput: (val: string) => void;
  brandOptions: string[];

  // Search filter
  searchQuery: string;
  setSearchQuery: (val: string) => void;

  // Size filter
  sizeInput: string;
  setSizeInput: (val: string) => void;

  // Year filter
  yearInput: string;
  setYearInput: (val: string) => void;

  // Qty filter
  qtyInput: string;
  setQtyInput: (val: string) => void;

  // Price Range filter
  minPriceInput: string;
  setMinPriceInput: (val: string) => void;
  maxPriceInput: string;
  setMaxPriceInput: (val: string) => void;

  // Offers filter (optional)
  showOfferFilter?: boolean;
  offerFilter?: string;
  setOfferFilter?: (val: string) => void;
  offerOptions?: string[];

  // Action Callbacks
  onSearch: () => void;
  onReset: () => void;
}

export default function Filter({
  showSupplierFilter = false,
  supplierFilter = "ALL",
  setSupplierFilter,
  supplierOptions = [],

  categoryFilter,
  setCategoryFilter,
  categoryOptions,

  brandInput,
  setBrandInput,
  brandOptions,

  searchQuery,
  setSearchQuery,

  sizeInput,
  setSizeInput,

  yearInput,
  setYearInput,

  qtyInput,
  setQtyInput,

  minPriceInput,
  setMinPriceInput,

  maxPriceInput,
  setMaxPriceInput,

  showOfferFilter = false,
  offerFilter = "ALL",
  setOfferFilter,
  offerOptions = [],

  onSearch,
  onReset,
}: FilterProps) {
  // Popover open states
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);

  // Popover search states
  const [supplierSearch, setSupplierSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [offerSearch, setOfferSearch] = useState("");

  // Popover references
  const supplierRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const offerRef = useRef<HTMLDivElement>(null);

  // Click outside and keydown listeners
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (supplierRef.current && !supplierRef.current.contains(target)) {
        setIsSupplierOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(target)) {
        setIsCategoryOpen(false);
      }
      if (brandRef.current && !brandRef.current.contains(target)) {
        setIsBrandOpen(false);
      }
      if (offerRef.current && !offerRef.current.contains(target)) {
        setIsOfferOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSupplierOpen(false);
        setIsCategoryOpen(false);
        setIsBrandOpen(false);
        setIsOfferOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Multi-brand selection helpers & parsing
  const brandInputRef = useRef<HTMLInputElement>(null);

  const brandParts = brandInput.split(",").map((s) => s.trim());
  let completedBrands: string[] = [];
  let brandTypingText = "";

  if (brandInput.endsWith(",")) {
    completedBrands = brandParts.filter(Boolean);
    brandTypingText = "";
  } else if (brandParts.length > 1) {
    completedBrands = brandParts.slice(0, -1).filter(Boolean);
    brandTypingText = brandParts[brandParts.length - 1] || "";
  } else {
    const exactMatch = brandOptions.find(
      (b) => b.toLowerCase() === (brandParts[0] || "").toLowerCase()
    );
    if (exactMatch) {
      completedBrands = [exactMatch];
      brandTypingText = "";
    } else {
      completedBrands = [];
      brandTypingText = brandParts[0] || "";
    }
  }

  const filteredBrandOptions = brandOptions.filter((b) => {
    if (!brandTypingText.trim()) return true;
    return b.toLowerCase().includes(brandTypingText.trim().toLowerCase());
  });

  const handleRemoveBrand = (brandToRemove: string) => {
    const remaining = completedBrands.filter(
      (b) => b.toLowerCase() !== brandToRemove.toLowerCase()
    );
    const newStr =
      remaining.length > 0
        ? remaining.join(", ") + ", " + brandTypingText
        : brandTypingText;
    setBrandInput(newStr);
    onSearch();
  };

  const handleBrandTyping = (text: string) => {
    const newStr =
      completedBrands.length > 0
        ? completedBrands.join(", ") + ", " + text
        : text;
    setBrandInput(newStr);
    onSearch();
  };

  return (
    <section className="shrink-0 bg-white border border-slate-200/90 rounded-xl p-3 sm:p-4 shadow-2xs relative z-30">
      <div className="flex flex-wrap items-end gap-2 sm:gap-2.5">
        {/* Supplier (Optional) */}
        {showSupplierFilter && setSupplierFilter && (
          <div ref={supplierRef} className="flex flex-col w-[95px] sm:w-[105px] xl:w-[115px] shrink-0 relative">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Supplier
            </label>
            <button
              type="button"
              onClick={() => {
                setIsSupplierOpen(!isSupplierOpen);
                setIsCategoryOpen(false);
                setIsBrandOpen(false);
                setIsOfferOpen(false);
              }}
              className="h-10 bg-white border border-slate-200 rounded-lg px-2.5 sm:px-3 flex items-center justify-between text-xs sm:text-sm font-medium text-slate-700 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs transition-all cursor-pointer"
            >
              <span className="truncate">{supplierFilter === "ALL" ? "All" : supplierFilter}</span>
              <svg
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 ml-1.5 shrink-0 transition-transform ${isSupplierOpen ? "rotate-180 text-emerald-600" : ""
                  }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isSupplierOpen && (
              <div className="absolute left-0 top-full mt-1.5 min-w-full w-full bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                <div className="px-1.5 pb-1.5 pt-0.5 border-b border-slate-100 sticky top-0 bg-white z-10">
                  <div className="relative flex items-center">
                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full h-7 pl-7 pr-6 bg-slate-50 border border-slate-200/80 rounded-md text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    {supplierSearch && (
                      <button
                        type="button"
                        onClick={() => setSupplierSearch("")}
                        className="absolute right-1.5 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSupplierFilter("ALL");
                    onSearch();
                    setIsSupplierOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${supplierFilter === "ALL"
                      ? "text-emerald-700 bg-emerald-50/80 font-bold"
                      : "text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <span>All</span>
                  {supplierFilter === "ALL" && <span className="text-emerald-600 font-bold">✓</span>}
                </button>
                {supplierOptions
                  .filter((s) => s.toLowerCase() !== "all" && (!supplierSearch.trim() || s.toLowerCase().includes(supplierSearch.trim().toLowerCase())))
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSupplierFilter(s);
                        onSearch();
                        setIsSupplierOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${supplierFilter === s
                          ? "text-emerald-700 bg-emerald-50/80 font-bold"
                          : "text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      <span className="truncate">{s}</span>
                      {supplierFilter === s && <span className="text-emerald-600 font-bold">✓</span>}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Category */}
        <div ref={categoryRef} className="flex flex-col w-[95px] sm:w-[110px] xl:w-[120px] shrink-0 relative">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Category
          </label>
          <button
            type="button"
            onClick={() => {
              setIsCategoryOpen(!isCategoryOpen);
              setIsSupplierOpen(false);
              setIsBrandOpen(false);
              setIsOfferOpen(false);
            }}
            className="h-10 bg-white border border-slate-200 rounded-lg px-2.5 sm:px-3 flex items-center justify-between text-xs sm:text-sm font-medium text-slate-700 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs transition-all cursor-pointer"
          >
            <span className="truncate">{categoryFilter === "ALL" ? "All" : categoryFilter}</span>
            <svg
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 ml-1.5 shrink-0 transition-transform ${isCategoryOpen ? "rotate-180 text-emerald-600" : ""
                }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isCategoryOpen && (
            <div className="absolute left-0 top-full mt-1.5 min-w-full w-full bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
              <div className="px-1.5 pb-1.5 pt-0.5 border-b border-slate-100 sticky top-0 bg-white z-10">
                <div className="relative flex items-center">
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full h-7 pl-7 pr-6 bg-slate-50 border border-slate-200/80 rounded-md text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  {categorySearch && (
                    <button
                      type="button"
                      onClick={() => setCategorySearch("")}
                      className="absolute right-1.5 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter("ALL");
                  onSearch();
                  setIsCategoryOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${categoryFilter === "ALL"
                    ? "text-emerald-700 bg-emerald-50/80 font-bold"
                    : "text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <span>All</span>
                {categoryFilter === "ALL" && <span className="text-emerald-600 font-bold">✓</span>}
              </button>
              {categoryOptions
                .filter((c) => c.toLowerCase() !== "all" && (!categorySearch.trim() || c.toLowerCase().includes(categorySearch.trim().toLowerCase())))
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(c);
                      onSearch();
                      setIsCategoryOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${categoryFilter === c
                        ? "text-emerald-700 bg-emerald-50/80 font-bold"
                        : "text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    <span className="truncate">{c}</span>
                    {categoryFilter === c && <span className="text-emerald-600 font-bold">✓</span>}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Brand */}
        <div ref={brandRef} className="relative flex flex-col w-[110px] sm:w-[130px] xl:w-[145px] shrink-0">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Brand
          </label>
          <div
            onClick={() => brandInputRef.current?.focus()}
            className="h-10 w-full bg-white border border-slate-200 rounded-lg pl-2 pr-1.5 flex items-center focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 shadow-2xs transition-all relative cursor-text overflow-hidden"
          >
            <div
              className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {completedBrands.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs shrink-0 whitespace-nowrap"
                >
                  <span>{b}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBrand(b);
                    }}
                    className="hover:bg-emerald-200/70 rounded-full p-0.5 transition-colors text-emerald-800"
                    title={`Remove ${b}`}
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <input
                ref={brandInputRef}
                type="text"
                value={brandTypingText}
                onFocus={() => {
                  setIsBrandOpen(true);
                  setIsSupplierOpen(false);
                  setIsCategoryOpen(false);
                  setIsOfferOpen(false);
                }}
                onChange={(e) => {
                  handleBrandTyping(e.target.value);
                  setIsBrandOpen(true);
                  setIsSupplierOpen(false);
                  setIsCategoryOpen(false);
                  setIsOfferOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !brandTypingText && completedBrands.length > 0) {
                    handleRemoveBrand(completedBrands[completedBrands.length - 1]);
                  }
                }}
                placeholder={completedBrands.length > 0 ? "Add..." : "Brand"}
                className="flex-1 min-w-[50px] bg-transparent text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none border-none p-0 h-7 whitespace-nowrap"
              />
            </div>

            <div className="shrink-0 pl-1 flex items-center bg-white">
              {brandInput ? (
                <XMarkIcon
                  onClick={(e) => {
                    e.stopPropagation();
                    setBrandInput("");
                    onSearch();
                  }}
                  className="w-4 h-4 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                  title="Clear brand search"
                />
              ) : (
                <ChevronDownIcon
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBrandOpen(!isBrandOpen);
                    setIsSupplierOpen(false);
                    setIsCategoryOpen(false);
                    setIsOfferOpen(false);
                  }}
                  className="w-4 h-4 text-slate-400 cursor-pointer hover:text-slate-600 transition-colors"
                />
              )}
            </div>
          </div>

          {isBrandOpen && (
            <div className="absolute left-0 top-full mt-1.5 min-w-full max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  setBrandInput("");
                  onSearch();
                  setIsBrandOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${
                  !brandInput.trim()
                    ? "text-emerald-700 bg-emerald-50/80 font-bold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>All Brands</span>
                {!brandInput.trim() && <span className="text-emerald-600 font-bold">✓</span>}
              </button>
              {filteredBrandOptions.map((b) => {
                const isSelected = completedBrands.some(
                  (cb) => cb.toLowerCase() === b.toLowerCase()
                );

                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      let newBrands: string[];
                      if (isSelected) {
                        newBrands = completedBrands.filter(
                          (cb) => cb.toLowerCase() !== b.toLowerCase()
                        );
                      } else {
                        newBrands = [...completedBrands, b];
                      }
                      setBrandInput(
                        newBrands.length > 0 ? newBrands.join(", ") + ", " : ""
                      );
                      onSearch();
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${
                      isSelected
                        ? "text-emerald-700 bg-emerald-50/80 font-bold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{b}</span>
                    {isSelected && <span className="text-emerald-600 font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex flex-col flex-1 min-w-[120px] sm:min-w-[140px]">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Search
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="searchInput"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch();
              }}
              placeholder="Query..."
              className="search-field h-10 w-full pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Size */}
        <div className="flex flex-col flex-1 min-w-[120px] sm:min-w-[140px]">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Size
          </label>
          <input
            type="text"
            value={sizeInput}
            onChange={(e) => {
              setSizeInput(e.target.value);
              onSearch();
            }}
            placeholder="Size..."
            className="h-10 w-full bg-white border border-slate-200 rounded-lg px-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
          />
        </div>

        {/* Year */}
        <div className="flex flex-col w-[65px] sm:w-[75px] xl:w-[85px] shrink-0">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Year
          </label>
          <input
            type="text"
            value={yearInput}
            onChange={(e) => {
              setYearInput(e.target.value);
              onSearch();
            }}
            placeholder="Year..."
            className="h-10 w-full bg-white border border-slate-200 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
          />
        </div>

        {/* Qty */}
        <div className="flex flex-col w-[60px] sm:w-[70px] xl:w-[75px] shrink-0">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Qty
          </label>
          <input
            type="text"
            value={qtyInput}
            onChange={(e) => {
              setQtyInput(e.target.value);
              onSearch();
            }}
            placeholder="Qty..."
            className="h-10 w-full bg-white border border-slate-200 rounded-lg px-2 sm:px-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
          />
        </div>

        {/* Price Range */}
        <div className="flex flex-col w-full sm:w-[170px] lg:w-[190px] xl:w-[220px] shrink-0">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Price Range
          </label>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={minPriceInput}
              onChange={(e) => {
                setMinPriceInput(e.target.value);
                onSearch();
              }}
              placeholder="Min"
              className="h-10 w-full min-w-0 bg-white border border-slate-200 rounded-lg px-2 sm:px-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
            />
            <span className="text-slate-400 text-xs font-semibold shrink-0">-</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={maxPriceInput}
              onChange={(e) => {
                setMaxPriceInput(e.target.value);
                onSearch();
              }}
              placeholder="Max"
              className="h-10 w-full min-w-0 bg-white border border-slate-200 rounded-lg px-2 sm:px-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Offers Dropdown (Optional) */}
        {showOfferFilter && setOfferFilter && (
          <div ref={offerRef} className="flex flex-col w-full sm:w-[140px] lg:w-[160px] shrink-0 relative">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Offers
            </label>
            <button
              type="button"
              onClick={() => {
                setIsOfferOpen(!isOfferOpen);
                setIsSupplierOpen(false);
                setIsCategoryOpen(false);
                setIsBrandOpen(false);
              }}
              className="h-10 bg-white border border-slate-200 rounded-lg px-2.5 sm:px-3 flex items-center justify-between text-xs sm:text-sm font-medium text-slate-700 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs transition-all cursor-pointer"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                {offerFilter !== "ALL" && (
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${getOfferBadgeStyle(offerFilter, offerOptions).dot
                      }`}
                  />
                )}
                <span className="truncate">
                  {offerFilter === "ALL" ? "All Offers" : offerFilter}
                </span>
              </div>
              <ChevronDownIcon
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 ml-1.5 shrink-0 transition-transform ${isOfferOpen ? "rotate-180 text-emerald-600" : ""
                  }`}
              />
            </button>

            {isOfferOpen && (
              <div className="absolute left-0 top-full mt-1.5 min-w-full w-full bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                <div className="px-1.5 pb-1.5 pt-0.5 border-b border-slate-100 sticky top-0 bg-white z-10">
                  <div className="relative flex items-center">
                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={offerSearch}
                      onChange={(e) => setOfferSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full h-7 pl-7 pr-6 bg-slate-50 border border-slate-200/80 rounded-md text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                    {offerSearch && (
                      <button
                        type="button"
                        onClick={() => setOfferSearch("")}
                        className="absolute right-1.5 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOfferFilter("ALL");
                    onSearch();
                    setIsOfferOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${offerFilter === "ALL"
                      ? "text-emerald-700 bg-emerald-50/80 font-bold"
                      : "text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    <span>All Offers</span>
                  </div>
                  {offerFilter === "ALL" && <span className="text-emerald-600 font-bold">✓</span>}
                </button>

                {offerOptions
                  .filter((off) => off.toLowerCase() !== "all" && (!offerSearch.trim() || off.toLowerCase().includes(offerSearch.trim().toLowerCase())))
                  .map((off) => {
                    const style = getOfferBadgeStyle(off, offerOptions);
                    return (
                      <button
                        key={off}
                        type="button"
                        onClick={() => {
                          setOfferFilter(off);
                          onSearch();
                          setIsOfferOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${offerFilter === off
                            ? "text-emerald-700 bg-emerald-50/80 font-bold"
                            : "text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className="truncate">{off}</span>
                      </div>
                      {offerFilter === off && <span className="text-emerald-600 font-bold ml-2">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 self-end ml-auto sm:ml-0">
          {/* Search button */}
          <button
            type="button"
            onClick={onSearch}
            title="Search"
            className="h-10 w-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <MagnifyingGlassIcon className="w-4 h-4" />
          </button>

          {/* Reset button */}
          <button
            type="button"
            onClick={onReset}
            title="Reset filters"
            className="h-10 w-10 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
