"use client";

import React, { useState } from "react";
import {
  XMarkIcon,
  ShoppingBagIcon,
  InformationCircleIcon,
  TruckIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

export interface QuickViewProduct {
  id: number | string;
  itemCode: string;
  brand: string;
  pattern: string;
  size: string;
  sizeFull?: string;
  cost: number;
  country?: string;
  year?: number;
  category?: string;
  runflat?: boolean;
  fittingPrice?: number;
  source?: string;
}

interface QuickViewModalProps {
  product: QuickViewProduct;
  onClose: () => void;
  onAddToCart?: (product: QuickViewProduct, qty: number) => void;
}

/** Utility to parse tyre size components (Width, Profile, Rim Size, Load/Speed) */
function parseTyreSizeDetails(sizeStr: string = "", pattern: string = "") {
  const combined = `${sizeStr} ${pattern}`.trim();
  
  // Width: e.g. "165" from "165/65 R14"
  const widthMatch = combined.match(/\b(\d{3})\b/);
  const width = widthMatch ? `${widthMatch[1]} mm` : "-";

  // Profile / Aspect ratio: e.g. "65" from "165/65"
  const profileMatch = combined.match(/\d{3}\/(\d{2})/);
  const profile = profileMatch ? profileMatch[1] : "-";

  // Rim size: e.g. "R14" or "14"
  const rimMatch = combined.match(/R\s*(\d{2})/i) || combined.match(/\b(\d{2})\b/);
  const rimSize = rimMatch ? `R${rimMatch[1]}` : "-";

  // Load/Speed rating: e.g. "79T" or "99H" or "91W"
  const loadSpeedMatch = combined.match(/\b(\d{2,3}[A-Z])\b/i);
  const loadSpeed = loadSpeedMatch ? loadSpeedMatch[1].toUpperCase() : "-";

  return { width, profile, rimSize, loadSpeed };
}

export default function QuickViewModal({
  product,
  onClose,
  onAddToCart,
}: QuickViewModalProps) {
  const [selectedQty, setSelectedQty] = useState<number>(4);
  const [selectedImgIndex, setSelectedImgIndex] = useState<number>(0);

  const specs = parseTyreSizeDetails(product.sizeFull || product.size, product.pattern);
  const fullSizeText = product.sizeFull || product.size || "-";
  const unitPrice = product.cost || 0;
  const setOf2Price = unitPrice * 2;
  const setOf4Price = unitPrice * 4;
  const totalPrice = unitPrice * selectedQty;

  // Split spec rows matching exact screenshot layout:
  // Row 1 (4 cols): Width, Profile, Rim Size, Load/Speed
  const row1 = [
    { label: "WIDTH", value: specs.width },
    { label: "PROFILE", value: specs.profile },
    { label: "RIM SIZE", value: specs.rimSize },
    { label: "LOAD/SPEED", value: specs.loadSpeed },
  ];

  // Row 2 (4 cols): Brand, Pattern, Size, Year
  const row2 = [
    { label: "BRAND", value: product.brand || "Sailun" },
    { label: "PATTERN", value: product.pattern || "Atrezzo Eco" },
    { label: "SIZE", value: fullSizeText, info: true },
    { label: "YEAR", value: product.year ? String(product.year) : "2024" },
  ];

  // Row 3 (3 cols): Warranty, Country, SKU
  const row3 = [
    { label: "WARRANTY", value: "3 Years Warranty" },
    { label: "COUNTRY", value: product.country || "China" },
    { label: "SKU", value: product.itemCode || "TCKL-18431" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Backdrop overlay click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-Up Bottom Sheet Modal Container covering wide screen */}
      <div className="relative w-full max-w-[95vw] lg:max-w-7xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 animate-in slide-in-from-bottom duration-300 max-h-[94vh] flex flex-col p-6 sm:p-8 border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Quick View</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Side: Product Image Card & Thumbnails */}
            <div className="lg:col-span-4 flex flex-col items-center">
              <div className="w-full bg-white border border-slate-200 rounded-2xl p-5 relative shadow-2xs overflow-hidden flex flex-col items-center">
                
                {/* Top Green Banner */}
                <div className="w-full bg-[#008b47] text-white text-xs font-black uppercase tracking-wider py-2 px-3 text-center rounded-t-xl absolute top-0 inset-x-0">
                  FREE WHEEL ALIGNMENT
                </div>

                {/* Ribbon Angle In Stock Badge */}
                <div className="absolute top-9 right-0 bg-slate-900 text-white text-[10px] font-black py-1 px-3.5 uppercase tracking-wider z-10 shadow-md flex items-center rounded-l-md">
                  <span>In Stock</span>
                  <span className="absolute bottom-[-4px] right-0 w-0 h-0 border-t-[4px] border-t-slate-900 border-r-[4px] border-r-transparent"></span>
                </div>

                {/* Main Realistic Tyre SVG */}
                <div className="w-full h-64 sm:h-72 mt-8 flex items-center justify-center p-4">
                  <svg className="w-56 h-56 text-slate-900 drop-shadow-xl" viewBox="0 0 100 100" fill="none">
                    {/* Outer Tread */}
                    <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#0f172a" strokeWidth="3" />
                    <circle cx="50" cy="50" r="41" fill="#334155" />
                    {/* Tread Grooves */}
                    {[...Array(16)].map((_, i) => (
                      <line
                        key={i}
                        x1="50"
                        y1="5"
                        x2="50"
                        y2="9"
                        stroke="#0f172a"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        transform={`rotate(${i * 22.5} 50 50)`}
                      />
                    ))}
                    {/* Sidewall */}
                    <circle cx="50" cy="50" r="34" fill="#1e293b" />
                    <circle cx="50" cy="50" r="31" stroke="#475569" strokeWidth="1" />
                    {/* Alloy Rim */}
                    <circle cx="50" cy="50" r="23" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="21" fill="#f8fafc" />
                    {/* Spokes */}
                    {[...Array(7)].map((_, i) => (
                      <path
                        key={i}
                        d="M 50 50 L 50 28"
                        stroke="#94a3b8"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        transform={`rotate(${i * (360 / 7)} 50 50)`}
                      />
                    ))}
                    {/* Center Cap */}
                    <circle cx="50" cy="50" r="9" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="4" fill="#38bdf8" />
                  </svg>
                </div>

                {/* Thumbnails Row */}
                <div className="flex items-center gap-3 mt-4">
                  {[0, 1].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImgIndex(idx)}
                      className={`w-14 h-14 rounded-xl border-2 p-1 bg-white transition-all flex items-center justify-center ${
                        selectedImgIndex === idx
                          ? "border-[#008b47] ring-2 ring-emerald-500/20"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <svg className="w-9 h-9 text-slate-800" viewBox="0 0 100 100" fill="none">
                        <circle cx="50" cy="50" r="42" fill="#1e293b" />
                        <circle cx="50" cy="50" r="24" fill="#e2e8f0" />
                        <circle cx="50" cy="50" r="8" fill="#0f172a" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side: Specs & Pricing */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              
              {/* Brand Header Logo & Title */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-black uppercase text-[#008b47] tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#008b47]"></span>
                    {product.brand || "SAILUN"} TIRES
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                  {product.brand || "Sailun"} {product.pattern || "165/65 R14 79T Atrezzo Eco 2024"}
                </h1>
              </div>

              {/* Product Specifications Section */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Product Specifications
                </h3>
                
                {/* Row 1: 4 Columns (Width, Profile, Rim Size, Load/Speed) */}
                <div className="grid grid-cols-4 gap-3">
                  {row1.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200/90 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-[#008b47] text-[9px] font-extrabold flex items-center justify-center">
                          ✓
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate w-full">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Row 2: 4 Columns (Brand, Pattern, Size, Year) */}
                <div className="grid grid-cols-4 gap-3">
                  {row2.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200/90 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-[#008b47] text-[9px] font-extrabold flex items-center justify-center">
                          ✓
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate w-full flex items-center justify-center gap-0.5">
                        <span>{item.value}</span>
                        {item.info && <InformationCircleIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Row 3: 3 Columns (Warranty, Country, SKU) */}
                <div className="grid grid-cols-3 gap-3">
                  {row3.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200/90 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-2xs hover:border-[#008b47]/50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 text-[#008b47] text-[9px] font-extrabold flex items-center justify-center">
                          ✓
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate w-full">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

              </div>

              {/* Fitted Price Box */}
              <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
                  <span>Fitted Price</span>
                  <InformationCircleIcon className="w-4 h-4 text-slate-400" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-1.5">
                      <span>AED {unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-xs font-semibold text-slate-500">/ Per Pcs</span>
                    </div>
                    <div className="text-xs font-bold text-slate-700 mt-1 flex gap-4">
                      <span>Set of 2: <strong className="text-slate-900">AED {setOf2Price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                      <span>Set of 4: <strong className="text-slate-900">AED {setOf4Price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                  </div>

                  {/* Actions: Qty Select + Add to Cart Button */}
                  <div className="flex items-center gap-3 flex-1 max-w-sm ml-auto">
                    <select
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(Number(e.target.value))}
                      className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#008b47] cursor-pointer shadow-2xs"
                    >
                      {[1, 2, 4, 6, 8].map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        if (onAddToCart) onAddToCart(product, selectedQty);
                      }}
                      className="flex-1 h-11 bg-[#008b47] hover:bg-[#00753c] text-white font-extrabold rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                    >
                      <ShoppingBagIcon className="w-4 h-4 stroke-2" />
                      <span>Add to Cart - AED {totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </button>
                  </div>
                </div>

                {/* Split Payment Logos / Text */}
                <div className="flex items-center gap-2 pt-0.5 text-[11px] text-slate-600 font-bold">
                  <span>Split in 4 Payment with</span>
                  <span className="px-2 py-0.5 bg-teal-100 text-teal-900 font-black rounded text-[10px]">tabby</span>
                  <span className="px-2 py-0.5 bg-pink-100 text-pink-900 font-black rounded text-[10px]">tamara</span>
                </div>
              </div>

              {/* Bottom Feature Badges Bar */}
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#008b47] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <TruckIcon className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Fast Shipping & Installation</h4>
                    <p className="text-[10px] sm:text-xs text-slate-600 leading-tight mt-0.5">We deliver and install most orders on the same day.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#008b47] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <WrenchScrewdriverIcon className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Free Wheel Balancing</h4>
                    <p className="text-[10px] sm:text-xs text-slate-600 leading-tight mt-0.5">Free wheel balancing included with every tyre installation.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#008b47] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <ShieldCheckIcon className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Always Authentic</h4>
                    <p className="text-[10px] sm:text-xs text-slate-600 leading-tight mt-0.5">We only sell 100% authentic products backed by warranty.</p>
                  </div>
                </div>
              </div>

              {/* View Full Details Link */}
              <div className="flex items-center justify-start pt-0.5">
                <button
                  onClick={onClose}
                  className="text-[#008b47] hover:text-[#00753c] text-xs font-extrabold flex items-center gap-1 hover:underline underline-offset-2 transition-colors"
                >
                  <span>View Full Details</span>
                  <span>→</span>
                </button>
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
