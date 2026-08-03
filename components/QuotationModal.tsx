"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { KleverQuoteHistory } from "@/services/types";
import { XMarkIcon, ClockIcon, ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";

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

  // Calculate totals if items are provided

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
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 id="quotation-title" className="text-xl font-bold text-slate-900 tracking-tight">
              New Quotation
            </h1>
          </div>

          <div className="flex items-center ml-auto">
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        {/* Two-column body. The OUTER wrapper no longer scrolls — each panel
            scrolls on its own, so the history list and the form move
            independently and the sheet height stays put. `min-h-0` is what lets
            a flex/grid child actually shrink and scroll. */}
        <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-4 sm:gap-6 h-full min-h-0">

            {/* ── Quotation History (35%) ──
                First in source order, so it stacks ABOVE the form on
                mobile/tablet and sits left from `lg` up. */}
            <aside className="flex flex-col min-h-0 max-h-[40vh] lg:max-h-none bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden">
              <h2 className="shrink-0 text-sm font-bold text-slate-800 border-b border-slate-100 px-5 py-3.5">
                Quotation History
              </h2>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10">
                    <ClockIcon className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-500">
                      No quotation history available.
                    </p>
                  </div>
                ) : (
                  <ol className="relative border-l border-slate-200 ml-1.5 space-y-4">
                    {history.map((h, i) => (
                      <li key={h.history_id ?? i} className="ml-4">
                        <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-white" />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-bold text-slate-800">
                            {h.action || "—"}
                          </span>
                          {h.status && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold uppercase tracking-wide">
                              {h.status}
                            </span>
                          )}
                        </div>
                        {h.comment && (
                          <p className="mt-0.5 text-[11px] text-slate-600 break-words">{h.comment}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {[h.changed_by, h.created_at].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </aside>

            {/* ── Form (65%) — moved verbatim, nothing inside changed ── */}
            <div className="min-h-0 overflow-y-auto space-y-6">
          {/* Customer Information Card */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 mb-5 flex items-center justify-between">
              <span>Customer Information</span>
            </h2>

            {/* 4-column Form Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
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
                <p className="text-[10px] text-slate-400 mt-1">
                  Enabled Installers from the store locator
                </p>
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
                <p className="text-[10px] text-slate-400 mt-1">
                  Will be set automatically when the quote is converted to an order
                </p>
              </div>

              {/* Row 5: Textareas */}
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address
                </label>
                <textarea
                  name="address"
                  rows={3}
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Customer Address"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors resize-none"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes / Terms
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Notes / Terms"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Row 6: Converted to Order */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">Converted to Order</span>
              <span className="text-slate-500">{formData.convertedToOrder}</span>
            </div>
          </div>

            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
