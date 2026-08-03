"use client";

/**
 * Cart panel — line-item table shown when Add to Cart is pressed.
 * Refactored into a modern side-by-side split layout:
 * - Left side (8 cols): Scrollable Cart Items table
 * - Right side (4 cols): Order Summary & Checkout actions card
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { XMarkIcon, TrashIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";
import { useCart } from "@/hooks/useCart";

/** UAE standard rate. Single source for every VAT figure below. */
const VAT_RATE = 0.05;

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface CartModalProps {
  onCloseAction: () => void;
  /** Called by Proceed to Checkout. Omit to disable the button. */
  onCheckoutAction?: (total: number) => void;
}

export default function CartModal({ onCloseAction, onCheckoutAction }: CartModalProps) {
  const { lines, setQty, remove, clear } = useCart();

  /* Bottom sheet mount hidden, slide up on the next tick, slide down before unmount */
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 30);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    closeTimer.current = setTimeout(onCloseAction, 700);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
    const vat = subtotal * VAT_RATE;
    return { subtotal, vat, grand: subtotal + vat };
  }, [lines]);

  const canCheckout = typeof onCheckoutAction === "function" && lines.length > 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-700 ease-out ${
        isOpen && !isClosing
          ? "opacity-100 bg-black/50 backdrop-blur-sm"
          : "opacity-0 bg-black/0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cart"
    >
      <div
        className={`bg-slate-50 w-full max-w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-700 ease-out h-[85vh] max-h-[680px] rounded-t-2xl border-t border-slate-200 ${
          isOpen && !isClosing ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBagIcon className="w-5 h-5" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Cart Line Items
              {lines.length > 0 && (
                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {lines.length} item{lines.length === 1 ? "" : "s"}
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Side-by-Side Content Body */}
        <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-5 h-full min-h-0">
            
            {/* Left Panel: Table of Line Items (Takes remaining space 1fr) */}
            <div className="flex flex-col bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden" style={{height: '100%'}}>
              <div className="overflow-auto flex-1" style={{maxHeight: '100%'}}>
                <table className="w-full text-sm border-collapse min-w-[650px]">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-[#4a3f3a] text-white text-xs font-semibold">
                      <th className="text-left py-2.5 px-3 font-semibold">Description</th>
                      <th className="text-center py-2.5 px-3 font-semibold w-[90px]">Qty</th>
                      <th className="text-center py-2.5 px-3 font-semibold w-[130px]">Price (excl. VAT)</th>
                      <th className="text-center py-2.5 px-3 font-semibold w-[130px]">Price (incl. VAT)</th>
                      <th className="text-right py-2.5 px-3 font-semibold w-[120px]">Row Total</th>
                      <th className="text-center py-2.5 px-3 font-semibold w-[70px]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-400 text-xs font-semibold">
                          Your cart is empty.
                        </td>
                      </tr>
                    ) : (
                      lines.map((l) => (
                        <tr key={l.id} className="bg-sky-50/30 hover:bg-sky-50/60 transition-colors">
                          <td className="p-2 border-b border-slate-100">
                            <input
                              readOnly
                              value={[l.brand, l.name, l.size].filter(Boolean).join(" ")}
                              className="w-full h-9 px-3 text-[13px] text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none font-medium truncate"
                            />
                          </td>
                          <td className="p-2 border-b border-slate-100">
                            <input
                              type="number"
                              min={1}
                              value={l.qty}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                setQty(l.id, Number.isFinite(n) && n > 0 ? n : 1);
                              }}
                              aria-label="Qty"
                              className="w-full h-9 px-2 text-[13px] text-slate-800 bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
                            />
                          </td>
                          <td className="p-2 border-b border-slate-100">
                            <input
                              readOnly
                              value={money(l.price)}
                              className="w-full h-9 px-2 text-[13px] text-slate-600 bg-slate-50/80 border border-slate-200 rounded-lg text-center focus:outline-none"
                            />
                          </td>
                          <td className="p-2 border-b border-slate-100">
                            <input
                              readOnly
                              value={money(l.price * (1 + VAT_RATE))}
                              className="w-full h-9 px-2 text-[13px] text-slate-600 bg-slate-50/80 border border-slate-200 rounded-lg text-center focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right font-bold text-slate-800 whitespace-nowrap">
                            AED {money(l.price * l.qty)}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-center">
                            <button
                              type="button"
                              onClick={() => remove(l.id)}
                              title="Remove"
                              aria-label="Remove"
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors focus:outline-none cursor-pointer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Panel: Compact Order Summary & Checkout Actions (310px width) */}
            <div className="flex flex-col bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs justify-between">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
                  <span>Order Summary</span>
                  <span className="text-xs font-semibold text-slate-500">
                    {lines.length} {lines.length === 1 ? "Item" : "Items"}
                  </span>
                </h3>

                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between items-center">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-800">AED {money(totals.subtotal)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span>VAT ({VAT_RATE * 100}%)</span>
                    <span className="font-semibold text-slate-700">AED {money(totals.vat)}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                    <span className="text-sm font-extrabold text-slate-900">Grand Total</span>
                    <span className="text-lg font-black text-emerald-600">
                      AED {money(totals.grand)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-2.5">
                <button
                  type="button"
                  onClick={() => onCheckoutAction?.(totals.grand)}
                  disabled={!canCheckout}
                  title={
                    lines.length === 0
                      ? "Add an item first"
                      : canCheckout
                        ? "Proceed to Checkout"
                        : "Checkout is not wired to an order API yet"
                  }
                  className={`w-full h-11 text-xs font-extrabold rounded-xl text-white transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 ${
                    canCheckout
                      ? "bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-emerald-600/20"
                      : "bg-emerald-600 opacity-40 cursor-not-allowed active:scale-100"
                  }`}
                >
                  Proceed to Checkout
                </button>

                <button
                  type="button"
                  onClick={() => clear()}
                  disabled={lines.length === 0}
                  className={`w-full h-9 text-xs font-semibold rounded-lg border transition-all active:scale-[0.98] inline-flex items-center justify-center gap-1.5 ${
                    lines.length
                      ? "border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 cursor-pointer"
                      : "border-slate-200 text-slate-300 opacity-50 cursor-not-allowed active:scale-100"
                  }`}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Clear Cart
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
