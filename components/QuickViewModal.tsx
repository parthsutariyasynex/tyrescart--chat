"use client";

import React, { useState } from "react";
import {
  XMarkIcon,
  ShoppingBagIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  TruckIcon,
  ShieldCheckIcon,
  SparklesIcon,
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

  const specGrid = [
    { label: "WIDTH", value: specs.width, icon: "📐" },
    { label: "PROFILE", value: specs.profile, icon: "⭕" },
    { label: "RIM SIZE", value: specs.rimSize, icon: "⚙️" },
    { label: "LOAD/SPEED", value: specs.loadSpeed, icon: "⚡" },
    { label: "BRAND", value: product.brand || "-", icon: "🏷️" },
    { label: "PATTERN", value: product.pattern || "-", icon: "🎨" },
    { label: "SIZE", value: fullSizeText, icon: "📏", info: true },
    { label: "YEAR", value: product.year ? String(product.year) : "2024", icon: "📅" },
    { label: "WARRANTY", value: "3 Years Warranty", icon: "🛡️" },
    { label: "COUNTRY", value: product.country || "China", icon: "🌍" },
    { label: "SKU", value: product.itemCode || "-", icon: "📦" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop overlay click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Centered Modal Container */}
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100 bg-white">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quick View</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Side: Product Image & Badges */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-4 relative shadow-2xs overflow-hidden flex flex-col items-center">
                
                {/* Top Banner */}
                <div className="w-full bg-emerald-600 text-white text-[11px] font-extrabold uppercase tracking-wider py-1.5 px-3 text-center rounded-t-xl absolute top-0 inset-x-0">
                  FREE WHEEL ALIGNMENT
                </div>

                {/* In Stock Badge */}
                <div className="absolute top-8 right-3 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-xs uppercase tracking-wider z-10 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  In Stock
                </div>

                {/* Main Image Container */}
                <div className="w-full h-64 mt-6 flex items-center justify-center p-4">
                  <svg className="w-48 h-48 text-slate-800 drop-shadow-md" viewBox="0 0 64 64" fill="none" stroke="currentColor">
                    <circle cx="32" cy="32" r="26" strokeWidth="5" className="text-slate-800" fill="#1e293b" />
                    <circle cx="32" cy="32" r="16" strokeWidth="2.5" className="text-slate-400" fill="#f8fafc" />
                    <circle cx="32" cy="32" r="6" fill="#64748b" />
                    <path d="M32 6 v6 M32 52 v6 M6 32 h6 M52 32 h6 M14 14 l4 4 M46 46 l4 4 M14 50 l4 -4 M46 18 l4 -4" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Thumbnails Row */}
                <div className="flex items-center gap-3 mt-4">
                  {[0, 1].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImgIndex(idx)}
                      className={`w-14 h-14 rounded-xl border-2 p-1 bg-slate-50 transition-all flex items-center justify-center ${
                        selectedImgIndex === idx
                          ? "border-emerald-600 ring-2 ring-emerald-500/20"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <svg className="w-8 h-8 text-slate-700" viewBox="0 0 64 64" fill="none" stroke="currentColor">
                        <circle cx="32" cy="32" r="24" strokeWidth="4" className="text-slate-800" fill="#1e293b" />
                        <circle cx="32" cy="32" r="12" strokeWidth="2" className="text-slate-400" fill="#f8fafc" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side: Product Specs & Pricing */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              
              {/* Brand Header & Title */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black tracking-wider uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                    {product.brand || "TYRE"}
                  </span>
                </div>
                <h1 className="text-xl lg:text-2xl font-extrabold text-slate-900 leading-tight">
                  {product.brand} {product.pattern} {product.size} {product.year ? product.year : ""}
                </h1>
              </div>

              {/* Product Specifications Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Product Specifications
                </h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {specGrid.map((spec, i) => (
                    <div
                      key={i}
                      className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 flex flex-col items-center text-center hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center">
                          ✓
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {spec.label}
                        </span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-800 truncate w-full flex items-center justify-center gap-1">
                        <span>{spec.value}</span>
                        {spec.info && <InformationCircleIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fitted Price & Cart Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  <span>Fitted Price</span>
                  <InformationCircleIcon className="w-4 h-4 text-slate-400" />
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      AED {unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-xs font-medium text-slate-500 ml-1">/ Per Pcs</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-600 mt-1 flex gap-4">
                      <span>Set of 2: <strong className="text-slate-900">AED {setOf2Price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                      <span>Set of 4: <strong className="text-slate-900">AED {setOf4Price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center gap-3 pt-2">
                  <select
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(Number(e.target.value))}
                    className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs cursor-pointer"
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
                    className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md hover:shadow-emerald-600/20 transition-all active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
                  >
                    <ShoppingBagIcon className="w-4 h-4 stroke-2" />
                    <span>Add to Cart - AED {totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </button>
                </div>

                {/* Split Payment Logos / Text */}
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                  <span>Split in 4 Payment with</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">tabby</span>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold rounded text-[10px]">tamara</span>
                </div>
              </div>

              {/* Bottom Feature Badges */}
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <TruckIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 leading-tight">Fast Shipping & Installation</h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">We deliver and install most orders on the same day.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <WrenchScrewdriverIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 leading-tight">Free Wheel Balancing</h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Free wheel balancing included with every tyre installation.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheckIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 leading-tight">Always Authentic</h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">We only sell 100% authentic products backed by warranty.</p>
                  </div>
                </div>

                {/* View Full Details Link */}
                <div className="flex justify-[flex-end] pt-1">
                  <button
                    onClick={onClose}
                    className="text-emerald-700 hover:text-emerald-800 text-xs font-bold flex items-center gap-1 hover:underline underline-offset-2 transition-colors ml-auto"
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
    </div>
  );
}
