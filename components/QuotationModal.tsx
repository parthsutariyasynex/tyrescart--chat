"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { KleverQuoteHistory } from "@/services/types";
import { XMarkIcon, ClockIcon, ChevronDownIcon, CheckIcon, ShoppingCartIcon, TrashIcon, PlusIcon, MinusIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { useCart } from "@/hooks/useCart";

const COUNTRY_OPTIONS = [
  { label: "--Please Select--", value: "" },
  { label: "United Arab Emirates", value: "United Arab Emirates" },
  { label: "Saudi Arabia", value: "Saudi Arabia" },
  { label: "Oman", value: "Oman" },
  { label: "Kuwait", value: "Kuwait" },
  { label: "Qatar", value: "Qatar" },
  { label: "Bahrain", value: "Bahrain" },
];

const INSTALLER_OPTIONS = [
  { label: "-- Select Installer --", value: "" },
  { label: "Dubai Main Branch", value: "Dubai Main Branch" },
  { label: "Abu Dhabi Hub", value: "Abu Dhabi Hub" },
  { label: "Sharjah Service Center", value: "Sharjah Service Center" },
];

const ORDER_FROM_OPTIONS = [
  { label: "Manual", value: "Manual" },
  { label: "Website", value: "Website" },
  { label: "POS", value: "POS" },
];

const STATUS_OPTIONS = [
  { label: "Draft", value: "Draft" },
  { label: "Pending", value: "Pending" },
  { label: "Approved", value: "Approved" },
  { label: "Cancelled", value: "Cancelled" },
];

function CustomSelect({
  name,
  value,
  onChange,
  options,
  placeholder = "--Select--",
}: {
  name: string;
  value: string;
  onChange: (e: any) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between transition-all cursor-pointer ${
          isOpen
            ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 text-slate-800 font-medium"
            : "border-slate-300 hover:border-slate-400 text-slate-700"
        }`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-emerald-600" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-emerald-200/90 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange({ target: { name, value: opt.value } });
                  setIsOpen(false);
                }}
                className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                  isSelected
                    ? "bg-emerald-100/90 text-emerald-900 font-semibold border-l-3 border-emerald-500"
                    : "text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-800 font-normal"
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <CheckIcon className="w-3.5 h-3.5 text-emerald-700 stroke-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface QuotationModalProps {
  /** Activity rows for the history panel. Optional: the Quotation module is
   *  write-only — there is no query to read history back — so this stays empty
   *  until a caller feeds it rows returned by addKleverQuoteHistory. */
  history?: KleverQuoteHistory[];
  isOpen: boolean;
  onClose: () => void;
  onSave?: (quotationData: any) => void;
}

export default function QuotationModal({
  isOpen,
  onClose,
  onSave,
  history = [],
}: QuotationModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isSlideOpen, setIsSlideOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cart = useCart();

  // Form State
  const [formData, setFormData] = useState({
    customerName: "",
    date: new Date().toISOString().split("T")[0],
    phone: "",
    email: "",
    city: "",
    country: "United Arab Emirates",
    vatNo: "",
    plate: "",
    make: "",
    model: "",
    year: "",
    paidAmount: "",
    installer: "",
    orderFrom: "Manual",
    status: "Draft",
    orderNumber: "",
    address: "",
    notes: "",
    convertedToOrder: "No",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      const t = setTimeout(() => setIsSlideOpen(true), 30);
      return () => clearTimeout(t);
    } else {
      setIsSlideOpen(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setIsSlideOpen(false);
    closeTimer.current = setTimeout(onClose, 500);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!mounted) return null;
  if (!isOpen && !isClosing) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckout = () => {
    if (onSave) {
      onSave({
        ...formData,
        items: cart.lines,
        totalPrice: cart.totalPrice,
      });
    }

    // Reset Form Fields to Initial State
    setFormData({
      customerName: "",
      date: new Date().toISOString().split("T")[0],
      phone: "",
      email: "",
      city: "",
      country: "United Arab Emirates",
      vatNo: "",
      plate: "",
      make: "",
      model: "",
      year: "",
      paidAmount: "",
      installer: "",
      orderFrom: "Manual",
      status: "Draft",
      orderNumber: "",
      address: "",
      notes: "",
      convertedToOrder: "No",
    });

    // Clear Cart Items
    cart.clear();

    handleClose();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-end justify-center transition-all duration-500 ease-out ${
        isSlideOpen && !isClosing
          ? "opacity-100 bg-black/50 backdrop-blur-sm"
          : "opacity-0 bg-black/0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quotation-title"
    >
      <div
        className={`bg-slate-50 w-full max-w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ease-out max-h-[90vh] rounded-t-2xl border-t border-slate-200 ${
          isSlideOpen && !isClosing ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Toolbar */}
        <div className="bg-white px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
              <h1 id="quotation-title" className="text-base font-bold text-slate-900 tracking-tight">
                Create Quotation
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                {cart.count} {cart.count === 1 ? "item" : "items"}
              </span>
            </div>
          </div>

          <div className="flex items-center ml-auto">
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Close"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body with Side-by-Side Dual Pane Layout */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            
            {/* Left Column: Cart Line Items Table Panel */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex flex-col justify-between min-w-0">
              <div className="flex flex-col min-w-0">
                <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 mb-3 shrink-0">
                  <span className="flex items-center gap-2">
                    <ShoppingCartIcon className="w-4 h-4 text-emerald-600" />
                    <span>Cart Line Items ({cart.count})</span>
                  </span>
                </h2>

                {/* Table container */}
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs border-collapse min-w-[450px]">
                    <thead>
                      <tr className="sticky top-0 z-10 bg-[#433732] text-white font-semibold">
                        <th className="text-left py-3 px-3 font-medium">Description</th>
                        <th className="text-center py-3 px-2 font-medium w-[70px]">Qty</th>
                        <th className="text-center py-3 px-2 font-medium w-[110px]">Price (excl)</th>
                        <th className="text-right py-3 px-3 font-medium w-[110px]">Total</th>
                        <th className="text-center py-3 px-2 font-medium w-[50px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.lines.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                            Your cart is empty.
                          </td>
                        </tr>
                      ) : (
                        cart.lines.map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3">
                              <input
                                readOnly
                                value={[l.brand, l.name, l.size].filter(Boolean).join(" ")}
                                className="w-full h-8 px-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none truncate"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min={1}
                                value={l.qty === 0 ? "" : l.qty}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "") {
                                    cart.setQty(l.id, 0);
                                  } else {
                                    const n = parseInt(val, 10);
                                    if (!isNaN(n)) {
                                      const newQty = Math.max(0, n);
                                      cart.setQty(l.id, newQty);
                                      const baseUnit = l.unitPrice && l.unitPrice > 0 ? l.unitPrice : (l.qty > 0 ? l.price / l.qty : l.price);
                                      if (baseUnit > 0) {
                                        cart.setPrice(l.id, baseUnit * newQty);
                                      }
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  if (!l.qty || l.qty < 1) {
                                    cart.setQty(l.id, 1);
                                    const baseUnit = l.unitPrice || l.price || 0;
                                    if (baseUnit > 0) cart.setPrice(l.id, baseUnit);
                                  }
                                }}
                                className="w-full h-8 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="any"
                                min={0}
                                value={l.price === 0 ? "" : l.price}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "") {
                                    cart.setPrice(l.id, 0);
                                  } else {
                                    const inputVal = parseFloat(val);
                                    if (!isNaN(inputVal)) {
                                      cart.setPrice(l.id, Math.max(0, inputVal));
                                    }
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const val = (e.target as HTMLInputElement).value;
                                    const inputVal = parseFloat(val);
                                    if (!isNaN(inputVal) && inputVal > 0) {
                                      const baseUnit = l.unitPrice || (l.qty > 0 && l.price > 0 ? l.price / l.qty : inputVal);
                                      if (baseUnit > 0) {
                                        const newQty = Math.round(inputVal / baseUnit);
                                        if (newQty >= 1) {
                                          cart.setQty(l.id, newQty);
                                          cart.setPrice(l.id, baseUnit * newQty);
                                        }
                                      }
                                    }
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                className="w-full h-8 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                              AED {(l.price * l.qty).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => cart.remove(l.id)}
                                className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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

                {/* Summary Strip & Action Buttons directly below Cart Table */}
                <div className="shrink-0 pt-3 mt-3 border-t border-slate-100 flex flex-col gap-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-500">Items: </span>
                        <span className="font-bold text-slate-900">{cart.count}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500">Subtotal: </span>
                        <span className="font-extrabold text-slate-900">
                          AED {cart.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500">VAT (5%): </span>
                        <span className="font-extrabold text-slate-900">
                          AED {(cart.totalPrice * 0.05).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div className="pl-3 border-l border-slate-300">
                      <span className="font-bold text-slate-900">Grand Total: </span>
                      <span className="font-extrabold text-emerald-600 text-sm">
                        AED {(cart.totalPrice * 1.05).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Buttons directly under summary */}
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => cart.clear()}
                      disabled={cart.count === 0}
                      className="h-8 px-3 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      Clear Cart
                    </button>
                    <button
                      type="submit"
                      form="quotation-form"
                      className="h-8 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <CheckIcon className="w-3.5 h-3.5 stroke-2" />
                      <span>Sent Quotation</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Customer Information Form Panel */}
            <form id="quotation-form" onSubmit={(e) => { e.preventDefault(); handleCheckout(); }} className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col">
              <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 shrink-0">
                Customer Information
              </h2>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                {/* Row 1 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleChange}
                    placeholder="Enter Customer Name"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Phone Number"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Row 2 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="City"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Country
                  </label>
                  <CustomSelect
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    options={COUNTRY_OPTIONS}
                    placeholder="--Please Select--"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    VAT No
                  </label>
                  <input
                    type="text"
                    name="vatNo"
                    value={formData.vatNo}
                    onChange={handleChange}
                    placeholder="VAT No"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Plate
                  </label>
                  <input
                    type="text"
                    name="plate"
                    value={formData.plate}
                    onChange={handleChange}
                    placeholder="Plate Number"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Row 3 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Make
                  </label>
                  <input
                    type="text"
                    name="make"
                    value={formData.make}
                    onChange={handleChange}
                    placeholder="Make"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="Model"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Year
                  </label>
                  <input
                    type="text"
                    name="year"
                    value={formData.year}
                    onChange={handleChange}
                    placeholder="Year"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Paid Amount
                  </label>
                  <input
                    type="text"
                    name="paidAmount"
                    value={formData.paidAmount}
                    onChange={handleChange}
                    placeholder="Paid Amount"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Row 4 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Installer
                  </label>
                  <CustomSelect
                    name="installer"
                    value={formData.installer}
                    onChange={handleChange}
                    options={INSTALLER_OPTIONS}
                    placeholder="-- Select Installer --"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Order From
                  </label>
                  <CustomSelect
                    name="orderFrom"
                    value={formData.orderFrom}
                    onChange={handleChange}
                    options={ORDER_FROM_OPTIONS}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status
                  </label>
                  <CustomSelect
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    options={STATUS_OPTIONS}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Order Number
                  </label>
                  <input
                    type="text"
                    name="orderNumber"
                    value={formData.orderNumber}
                    onChange={handleChange}
                    placeholder="Order Number"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-500 focus:outline-none cursor-not-allowed"
                    readOnly
                  />
                </div>

                {/* Row 5: Textareas */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address
                  </label>
                  <textarea
                    name="address"
                    rows={2}
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Customer Address"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors resize-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes / Terms
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Notes / Terms"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors resize-none"
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
