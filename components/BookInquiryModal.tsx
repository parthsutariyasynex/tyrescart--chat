"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  PlusCircleIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  TruckIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  Inquiry,
  getInquiries,
  addInquiry,
  updateInquiry,
  deleteInquiry,
} from "@/services/inquiryStorage";
import { createCrmBookingGraphQL } from "@/services/graphql";

interface BookInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProduct?: {
    brand?: string;
    size?: string;
    pattern?: string;
  } | null;
}

export default function BookInquiryModal({
  isOpen,
  onClose,
  initialProduct,
}: BookInquiryModalProps) {
  // Inquiry list state
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingInquiry, setViewingInquiry] = useState<Inquiry | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tireSize1, setTireSize1] = useState("");
  const [tireSize2, setTireSize2] = useState("");
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Inquiry["status"]>("Pending");

  // Validation state
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  /** True while `createCrmBooking` is in flight. Blocks a second submit — the
   *  mutation has no delete counterpart, so a double-click would file two
   *  enquiries that can only be removed from the Magento admin. */
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Filter state
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Animation states matching QuickViewModal / CostHistoryModal
  const [isAnimatedOpen, setIsAnimatedOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Both branches are deferred: a synchronous setState in an effect body
    // triggers a cascading render. The 30ms open delay is what lets the
    // enter transition play from its starting position.
    const timer = setTimeout(() => {
      if (isOpen) {
        setIsClosing(false);
        setIsAnimatedOpen(true);
      } else {
        setIsAnimatedOpen(false);
      }
    }, isOpen ? 30 : 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  // Load inquiries when the modal opens. localStorage is an external store, so
  // reading it here is the sanctioned use of an effect — deferred by a microtask
  // so the write does not happen synchronously in the effect body.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setInquiries(getInquiries());
      // Prefill from the row the modal was opened on — the product's own size,
      // never a sample value.
      if (initialProduct?.size) setTireSize1(initialProduct.size);
    });
    return () => { alive = false; };
  }, [isOpen, initialProduct]);

  // Toast notification timer
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setTireSize1(initialProduct?.size || "");
    setTireSize2("");
    setVehiclePlateNumber("");
    setMake("");
    setModel("");
    setYear("");
    setNote("");
    setStatus("Pending");
    setEditingId(null);
    setCustomerSearchQuery("");
    setSearchQuery("");
    setErrors({});
  };

  // Populate form for editing
  const handleEdit = (inquiry: Inquiry) => {
    setEditingId(inquiry.id);
    setName(inquiry.name || "");
    setPhone(inquiry.phone || "");
    setEmail(inquiry.email || "");
    setTireSize1(inquiry.tireSize1 || "");
    setTireSize2(inquiry.tireSize2 || "");
    setVehiclePlateNumber(inquiry.vehiclePlateNumber || "");
    setMake(inquiry.make || "");
    setModel(inquiry.model || "");
    setYear(inquiry.year || "");
    setNote(inquiry.note || "");
    setStatus(inquiry.status || "Pending");
    setErrors({});
  };

  // Handle Submit (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Validation
    const newErrors: { name?: string; phone?: string } = {};
    if (!name.trim()) newErrors.name = "Customer name is required.";
    if (!phone.trim()) newErrors.phone = "Phone number is required.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (editingId) {
      const updated = updateInquiry(editingId, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        tireSize1: tireSize1.trim(),
        tireSize2: tireSize2.trim(),
        vehiclePlateNumber: vehiclePlateNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        note: note.trim(),
        status,
      });
      setInquiries(updated);
      setToastMessage(`Inquiry ${editingId} updated successfully!`);
    } else {
      /* A NEW enquiry is filed in the CRM first. Only once the mutation confirms
         it do we mirror it locally, stamped with the ids the API returned — so
         the list can never show an enquiry the CRM does not have. Blank fields
         are omitted by the mutation builder rather than sent as empty strings,
         which would blank out data already on the customer's record. */
      setSubmitting(true);
      try {
        const res = await createCrmBookingGraphQL({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          tire_size_1: tireSize1.trim(),
          tire_size_2: tireSize2.trim(),
          plant_number: vehiclePlateNumber.trim(),
          make: make.trim(),
          model: model.trim(),
          year: year.trim(),
          note: note.trim(),
        });

        if (!res.success) {
          setToastMessage(res.message || "The CRM rejected this enquiry.");
          setSubmitting(false);
          return;
        }

        const created = addInquiry({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          tireSize1: tireSize1.trim(),
          tireSize2: tireSize2.trim(),
          vehiclePlateNumber: vehiclePlateNumber.trim(),
          make: make.trim(),
          model: model.trim(),
          year: year.trim(),
          note: note.trim(),
          status,
          // Straight from the mutation's response — never generated locally.
          crmBookingId: res.booking?.entity_id ?? undefined,
          crmCustomerId: res.customer?.entity_id ?? undefined,
          crmStatus: res.booking?.status ?? null,
          crmPriority: res.booking?.priority ?? null,
          crmEnquiryDate: res.booking?.enquiry_date ?? null,
        });
        setInquiries(getInquiries());
        setToastMessage(
          res.message ||
            `Enquiry ${res.booking?.entity_id ?? created.id} created in the CRM.`,
        );
      } catch (err) {
        setToastMessage(
          err instanceof Error ? err.message : "Could not reach the CRM. Please try again.",
        );
        setSubmitting(false);
        return; // keep the form filled so nothing typed is lost
      }
      setSubmitting(false);
    }

    resetForm();
  };

  // Search customer: filters the right-side inquiry list table
  const handleSearchCustomer = (overrideQuery?: string) => {
    const q = (overrideQuery !== undefined ? overrideQuery : customerSearchQuery).trim();
    const queryName = name.trim();
    const queryPhone = phone.trim();
    const targetQuery = q || queryName || queryPhone;

    if (!targetQuery) {
      setErrors({
        name: "Enter Name or Phone to search",
        phone: "Enter Name or Phone to search",
      });
      setToastMessage("Please enter a Customer Name or Mobile Number in the search box.");
      return;
    }

    // Filter the right-side Inquiry Table
    setSearchQuery(targetQuery);
    setCurrentPage(1);

    // Check if matching customer inquiry exists
    const qLower = targetQuery.toLowerCase();
    const matches = inquiries.filter((item) =>
      item.name.toLowerCase().includes(qLower) ||
      item.phone.toLowerCase().includes(qLower) ||
      (item.vehiclePlateNumber && item.vehiclePlateNumber.toLowerCase().includes(qLower))
    );

    if (matches.length > 0) {
      setErrors({});
      setToastMessage(`Found ${matches.length} matching record(s) in list! Click Edit (✏️) to fill form.`);
    } else {
      setToastMessage(`No customer found matching "${targetQuery}".`);
    }
  };

  // Handle Delete
  const handleDelete = (id: string) => {
    if (window.confirm(`Are you sure you want to delete inquiry ${id}?`)) {
      const updated = deleteInquiry(id);
      setInquiries(updated);
      setToastMessage(`Inquiry ${id} deleted.`);
      if (editingId === id) resetForm();
    }
  };

  // Handle Quick Status Update
  const handleStatusChange = (id: string, newStatus: Inquiry["status"]) => {
    const updated = updateInquiry(id, { status: newStatus });
    setInquiries(updated);
    setToastMessage(`Inquiry ${id} status updated to ${newStatus}.`);
  };

  // Filtered dataset
  const filteredInquiries = useMemo(() => {
    return inquiries.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.phone.toLowerCase().includes(q) ||
        (item.vehiclePlateNumber && item.vehiclePlateNumber.toLowerCase().includes(q)) ||
        (item.tireSize1 && item.tireSize1.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "ALL" || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [inquiries, searchQuery, statusFilter]);

  // Pagination logic
  const totalPages = Math.ceil(filteredInquiries.length / pageSize) || 1;
  const paginatedInquiries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInquiries.slice(start, start + pageSize);
  }, [filteredInquiries, currentPage, pageSize]);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-400 ease-in-out ${
        isAnimatedOpen && !isClosing ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Slide-Up Bottom Container (Full Width like CostHistoryModal & QuickViewModal) */}
      <div
        className={`relative bg-white w-full max-w-full border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden transition-all duration-400 ease-in-out max-h-[90vh] rounded-none ${
          isAnimatedOpen && !isClosing
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Toast Notification (Zero Layout Shift) */}
        {toastMessage && (
          <div className="absolute top-3.5 right-16 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700/80 backdrop-blur-xs transition-all">
            <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white font-bold cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Header (Bright Light SaaS Theme) */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <CalendarDaysIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                Book Inquiry Management
                <span className="text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full font-bold">
                  {inquiries.length} Total
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Log customer tire inquiries, vehicle details, and track follow-up statuses
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body Split View */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50">
          
          {/* Left Column: Form Section */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {editingId ? (
                    <>
                      <PencilSquareIcon className="w-4 h-4 text-emerald-600" />
                      Edit Inquiry <span className="text-xs font-mono text-emerald-600 font-bold">({editingId})</span>
                    </>
                  ) : (
                    <>
                      <PlusCircleIcon className="w-4 h-4 text-emerald-600" />
                      New Customer Inquiry
                    </>
                  )}
                </h3>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Name & Phone (Required) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Customer Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                        placeholder="e.g. Ahmed Al-Mansoor"
                        className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all ${
                          errors.name
                            ? "border-red-300 focus:ring-red-500/20"
                            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                        }`}
                      />
                    </div>
                    {errors.name && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" /> {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <PhoneIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                        }}
                        placeholder="+971 50 123 4567"
                        className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all ${
                          errors.phone
                            ? "border-red-300 focus:ring-red-500/20"
                            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                        }`}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" /> {errors.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <div className="relative">
                    <EnvelopeIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Tire Sizes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tire Size 1</label>
                    <input
                      type="text"
                      value={tireSize1}
                      onChange={(e) => setTireSize1(e.target.value)}
                      placeholder="e.g. 265/65 R17"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tire Size 2 (Rear)</label>
                    <input
                      type="text"
                      value={tireSize2}
                      onChange={(e) => setTireSize2(e.target.value)}
                      placeholder="e.g. 285/60 R18"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Vehicle Plate & Make */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Plate Number</label>
                    <div className="relative">
                      <TruckIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={vehiclePlateNumber}
                        onChange={(e) => setVehiclePlateNumber(e.target.value)}
                        placeholder="e.g. A-54321"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white uppercase font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Make</label>
                    <input
                      type="text"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      placeholder="e.g. Toyota"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Model & Year */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. Land Cruiser"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Year</label>
                    <input
                      type="text"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="e.g. 2023"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Status Dropdown with Dynamic Status Colors */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as Inquiry["status"])}
                      className={`w-full appearance-none pl-8 pr-8 py-2 text-xs rounded-lg border font-bold cursor-pointer focus:outline-none transition-all shadow-2xs ${
                        status === "Pending"
                          ? "bg-amber-50 text-amber-800 border-amber-300 focus:ring-amber-500/20 focus:border-amber-500"
                          : status === "Contacted"
                          ? "bg-blue-50 text-blue-800 border-blue-300 focus:ring-blue-500/20 focus:border-blue-500"
                          : "bg-emerald-50 text-emerald-800 border-emerald-300 focus:ring-emerald-500/20 focus:border-emerald-500"
                      }`}
                    >
                      <option value="Pending" className="bg-white text-amber-800 font-bold">Pending</option>
                      <option value="Contacted" className="bg-white text-blue-800 font-bold">Contacted</option>
                      <option value="Closed" className="bg-white text-emerald-800 font-bold">Closed</option>
                    </select>
                    {/* Status Dot Indicator */}
                    <span
                      className={`absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none ${
                        status === "Pending"
                          ? "bg-amber-500"
                          : status === "Contacted"
                          ? "bg-blue-500"
                          : "bg-emerald-500"
                      }`}
                    />
                    <ChevronDownIcon className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                  </div>
                </div>

                {/* Note textarea */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Inquiry Note</label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter any additional request details, fitment specs, or callback times..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                {/* Search Existing Customer Bar at Bottom of Form */}
                <div className="pt-2 border-t border-slate-100 mt-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Search Existing Customer (Name / Mobile No)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchCustomer(customerSearchQuery);
                          }
                        }}
                        placeholder="Type Name or Phone Number to search..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-700 transition-all font-medium text-slate-800"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearchCustomer(customerSearchQuery)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-300" />
                      Search
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {submitting ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircleIcon className="w-4 h-4" />
                    )}
                    {submitting ? "Saving to CRM…" : editingId ? "Update Inquiry" : "Save Inquiry"}
                  </button>

                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Inquiry List Section */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              {/* Search & Filter Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search name, phone, plate, ID..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                {/* Filter Status Pills */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                  {["ALL", "Pending", "Contacted", "Closed"].map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setStatusFilter(st);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                        statusFilter === st
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inquiry Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2.5">Inquiry ID</th>
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Tire Size(s)</th>
                      <th className="px-3 py-2.5">Plate</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedInquiries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          <ClockIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="font-semibold text-xs">No inquiries found</p>
                          <p className="text-[11px] text-slate-400">
                            Try adjusting search filters or fill the form on the left.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedInquiries.map((item) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            editingId === item.id ? "bg-emerald-50/50" : ""
                          }`}
                        >
                          {/* ID & Date */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 text-[11px]">
                              {item.id}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(item.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                          </td>

                          {/* Customer Name & Phone */}
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-slate-800">{item.name}</div>
                            <div className="text-[11px] font-mono text-slate-500">{item.phone}</div>
                          </td>

                          {/* Tire Sizes */}
                          <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                            {item.tireSize1 ? (
                              <div className="font-semibold text-slate-700">{item.tireSize1}</div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                            {item.tireSize2 && (
                              <div className="text-[10px] text-slate-400 font-normal">
                                Rear: {item.tireSize2}
                              </div>
                            )}
                          </td>

                          {/* Plate */}
                          <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                            {item.vehiclePlateNumber ? (
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold border border-slate-200">
                                {item.vehiclePlateNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Status Badge & Dropdown */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <div className="relative inline-flex items-center">
                              <select
                                value={item.status}
                                onChange={(e) =>
                                  handleStatusChange(item.id, e.target.value as Inquiry["status"])
                                }
                                className={`appearance-none text-[11px] font-extrabold pl-5 pr-5 py-0.5 rounded-full border cursor-pointer focus:outline-none transition-all shadow-2xs ${
                                  item.status === "Pending"
                                    ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100/80"
                                    : item.status === "Contacted"
                                    ? "bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100/80"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/80"
                                }`}
                              >
                                <option value="Pending" className="bg-white text-amber-800 font-bold">Pending</option>
                                <option value="Contacted" className="bg-white text-blue-800 font-bold">Contacted</option>
                                <option value="Closed" className="bg-white text-emerald-800 font-bold">Closed</option>
                              </select>
                              {/* Dot indicator */}
                              <span
                                className={`absolute left-2 w-1.5 h-1.5 rounded-full pointer-events-none ${
                                  item.status === "Pending"
                                    ? "bg-amber-500"
                                    : item.status === "Contacted"
                                    ? "bg-blue-500"
                                    : "bg-emerald-500"
                                }`}
                              />
                              {/* Chevron icon */}
                              <ChevronDownIcon className="w-3 h-3 absolute right-1.5 pointer-events-none text-slate-400" />
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setViewingInquiry(item)}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                                title="View Details"
                              >
                                <EyeIcon className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Edit Inquiry"
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete Inquiry"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing <strong className="text-slate-800">{paginatedInquiries.length}</strong> of{" "}
                <strong className="text-slate-800">{filteredInquiries.length}</strong> inquiries
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="font-mono px-2 py-0.5 text-xs text-slate-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* View Details Inner Modal */}
        {viewingInquiry && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  Inquiry Detail <span className="font-mono text-emerald-600">({viewingInquiry.id})</span>
                </h4>
                <button
                  onClick={() => setViewingInquiry(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">NAME</span>
                    <span className="font-bold text-slate-800">{viewingInquiry.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">PHONE</span>
                    <span className="font-mono font-bold text-slate-800">{viewingInquiry.phone}</span>
                  </div>
                </div>

                {viewingInquiry.email && (
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">EMAIL</span>
                    <span className="text-slate-700 font-medium">{viewingInquiry.email}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">TIRE SIZE 1</span>
                    <span className="font-mono font-bold text-slate-800">{viewingInquiry.tireSize1 || "-"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">TIRE SIZE 2</span>
                    <span className="font-mono font-bold text-slate-800">{viewingInquiry.tireSize2 || "-"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">MAKE</span>
                    <span className="font-medium text-slate-800">{viewingInquiry.make || "-"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">MODEL</span>
                    <span className="font-medium text-slate-800">{viewingInquiry.model || "-"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">YEAR</span>
                    <span className="font-medium text-slate-800">{viewingInquiry.year || "-"}</span>
                  </div>
                </div>

                {viewingInquiry.vehiclePlateNumber && (
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px]">PLATE NUMBER</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block">
                      {viewingInquiry.vehiclePlateNumber}
                    </span>
                  </div>
                )}

                {viewingInquiry.note && (
                  <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
                    <span className="text-amber-800 font-bold block text-[10px]">INQUIRY NOTE</span>
                    <p className="text-slate-700 text-xs mt-0.5 whitespace-pre-wrap">{viewingInquiry.note}</p>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setViewingInquiry(null)}
                  className="px-4 py-1.5 bg-slate-900 text-white font-semibold text-xs rounded-lg hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
