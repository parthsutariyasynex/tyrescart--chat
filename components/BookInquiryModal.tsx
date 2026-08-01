"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
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
  updateInquiry,
} from "@/services/inquiryStorage";
import { createCrmBookingGraphQL, fetchCrmCustomerByPhoneGraphQL } from "@/services/graphql";
import type { CrmCustomer } from "@/services/types";

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
  /** CRM record for the searched phone. null = looked up and not on file. */
  const [crmCustomer, setCrmCustomer] = useState<CrmCustomer | null>(null);
  /**
   * CRM status of the phone currently typed in the FORM (separate from the
   * search box). undefined = not checked yet, null = checked and not on file.
   */
  const [phoneCheck, setPhoneCheck] = useState<{
    phone: string;
    customer: CrmCustomer | null;
    loading: boolean;
  } | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Custom Dropdown Open States (replacing native HTML select elements to eliminate browser blue highlights)
  const [isFormStatusOpen, setIsFormStatusOpen] = useState(false);

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

  /**
   * Check the typed phone against the CRM, 600ms after typing stops.
   *
   * Debounced so a 10-digit number costs one request, not ten. Read-only — it
   * calls `crmCustomerByPhone` and never the mutation. The number is sent
   * verbatim because the endpoint matches it exactly: "0501234567" and
   * "501234567" are different customers upstream.
   */
  useEffect(() => {
    const p = phone.trim();
    let alive = true;
    // Below 7 digits there is nothing worth asking about, and the endpoint only
    // accepts a phone, so an incomplete number is left unchecked. Both state
    // writes are deferred: a synchronous setState in an effect body cascades.
    const tooShort = p.replace(/[^\d]/g, "").length < 7;
    const spinner = setTimeout(() => {
      if (!alive) return;
      setPhoneCheck(tooShort ? undefined : { phone: p, customer: null, loading: true });
    }, 0);
    if (tooShort) return () => { alive = false; clearTimeout(spinner); };
    const timer = setTimeout(() => {
      void fetchCrmCustomerByPhoneGraphQL(p)
        .then((c) => {
          if (alive) {
            setPhoneCheck({ phone: p, customer: c, loading: false });
            /* Reported as a toast, not inline: an inline line under the field
               pushes the rest of the form down each time the lookup resolves.
               The toast is out of flow, so the layout never moves. */
            setToastMessage(
              c
                ? `\u26A0 Customer already added${c.name ? ` - ${c.name}` : ""} (CRM #${c.entity_id})`
                : "\u2713 New customer - will be created on submit",
            );
          }
        })
        .catch(() => { if (alive) setPhoneCheck(undefined); });
    }, 600);
    return () => { alive = false; clearTimeout(spinner); clearTimeout(timer); };
  }, [phone]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 500);
  };

  /**
   * The list is NOT loaded from storage.
   *
   * It is empty until a phone search returns CRM bookings, and those live only in
   * `crmCustomer` state — never localStorage, never IndexedDB. Closing the modal
   * or reloading clears it, which is intended: `crmCustomerByPhone` is the only
   * CRM read the schema offers and it requires an exact phone, so there is
   * nothing to list until the operator supplies one.
   */
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      // Prefill from the row the modal was opened on — the product's own size.
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

        /* No local row is written. The CRM is the only store, so the list is
           refreshed by re-reading the customer we just filed against — the new
           booking then appears through the same crmCustomerByPhone path as
           everything else in the table. */
        const submittedPhone = phone.trim();
        const refreshed = await fetchCrmCustomerByPhoneGraphQL(submittedPhone).catch(() => null);
        if (refreshed) {
          setCrmCustomer(refreshed);
          setSearchQuery(submittedPhone);
          setCurrentPage(1);
        }
        setToastMessage(
          res.message ||
            `Enquiry ${res.booking?.entity_id ?? ""} created in the CRM.`.replace("  ", " "),
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

  // Search customer: filters the inquiry list AND auto-loads matching customer details into form
  const handleSearchCustomer = (overrideQuery?: string) => {
    const q = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();
    const queryName = name.trim();
    const queryPhone = phone.trim();
    const targetQuery = q || queryName || queryPhone;

    if (!targetQuery) {
      setToastMessage("Please enter a Customer Name or Mobile Number to search.");
      return;
    }

    // Filter the right-side Inquiry Table
    setSearchQuery(targetQuery);
    setCurrentPage(1);

    // Check local inquiries list
    const qLower = targetQuery.toLowerCase();
    const matches = inquiries.filter((item) =>
      item.name.toLowerCase().includes(qLower) ||
      item.phone.toLowerCase().includes(qLower) ||
      (item.vehiclePlateNumber && item.vehiclePlateNumber.toLowerCase().includes(qLower))
    );

    /* Search FILTERS the list; it does not populate the form. Loading a
       customer's details into the form is the Edit button's job only, so a
       search can never quietly overwrite something half-typed. */
    if (matches.length > 0) setErrors({});

    const digits = targetQuery.replace(/[^\d]/g, "");
    if (digits.length >= 7) {
      void fetchCrmCustomerByPhoneGraphQL(targetQuery)
        .then((c) => {
          // Only feeds the list (via crmRows). The form is left alone.
          setCrmCustomer(c);
          if (c) {
            setToastMessage(`Found CRM customer record & inquiries for "${c.name ?? targetQuery}".`);
          } else if (matches.length > 0) {
            setToastMessage(`Found ${matches.length} matching inquiry.`);
          } else {
            setToastMessage(`No record found for "${targetQuery}".`);
          }
        })
        .catch(() => {
          if (matches.length > 0) {
            setToastMessage(`Found ${matches.length} matching inquiry.`);
          } else {
            setToastMessage(`No record found for "${targetQuery}".`);
          }
        });
    } else if (matches.length > 0) {
      setToastMessage(`Found ${matches.length} matching inquiry! Customer details loaded into form.`);
    } else {
      setToastMessage(`No inquiry found matching "${targetQuery}".`);
    }
  };




  // Filtered dataset
  /**
   * The searched customer's CRM bookings, shaped as list rows.
   *
   * The table is otherwise a localStorage mirror — it only ever showed enquiries
   * submitted from THIS browser, so one filed by another member of staff, from
   * another device, or directly through the API was invisible here. There is no
   * list query on the schema (`crmBookings`, `crmCustomerList` and friends do not
   * exist), so a full CRM-backed table is not possible; what IS possible is
   * showing the bookings that come back with a looked-up customer.
   *
   * These rows are read-only: edit and delete act on the local store, and there
   * is no update or delete mutation to push such a change back.
   */
  const crmRows: (Inquiry & { fromCrm: true })[] = useMemo(() => {
    if (!crmCustomer?.bookings?.length) return [];
    return crmCustomer.bookings.map((b, i) => ({
      id: `CRM-${String(b.entity_id ?? i)}`,
      fromCrm: true as const,
      name: crmCustomer.name ?? "",
      phone: crmCustomer.phone ?? "",
      email: crmCustomer.email ?? "",
      tireSize1: b.tire_size_1 ?? "",
      tireSize2: "",
      vehiclePlateNumber: b.vehicle?.plant_number ?? "",
      make: b.vehicle?.make ?? "",
      model: b.vehicle?.model ?? "",
      year: b.vehicle?.year ?? "",
      note: b.detail ?? b.notes ?? "",
      // The CRM's status is a numeric code with no published mapping, so it is
      // not forced into the local Pending/Contacted/Closed vocabulary.
      status: "Pending" as Inquiry["status"],
      createdAt: b.enquiry_date ?? "",
      crmBookingId: b.entity_id ?? undefined,
      crmCustomerId: crmCustomer.entity_id ?? undefined,
      crmStatus: b.status == null ? null : String(b.status),
      crmPriority: b.priority == null ? null : String(b.priority),
      crmEnquiryDate: b.enquiry_date ?? null,
    }));
  }, [crmCustomer]);

  const filteredInquiries = useMemo(() => {
    // CRM rows first, then local ones — with anything already mirrored locally
    // dropped so a booking filed from this browser is not listed twice.
    // CRM rows only. Nothing from localStorage reaches the table.
    return crmRows.filter((item) => {
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
  }, [crmRows, searchQuery, statusFilter]);

  // Pagination logic
  const totalPages = Math.ceil(filteredInquiries.length / pageSize) || 1;
  const paginatedInquiries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInquiries.slice(start, start + pageSize);
  }, [filteredInquiries, currentPage, pageSize]);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-500 ease-out ${
        isAnimatedOpen && !isClosing ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Slide-Up Bottom Container (Full Width like CostHistoryModal & QuickViewModal) */}
      <div
        className={`relative bg-white w-full max-w-full border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ease-out max-h-[90vh] rounded-none ${
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
                Book Inquiry
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

        {/* Body Split View (pb-28 guarantees zero layout shift when dropdown popovers open) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-28 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50">
          
          {/* Left Column: Form Section */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between min-h-[580px]">
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
                        className={`w-full pl-8 ${phoneCheck?.loading ? "pr-8" : "pr-3"} py-1.5 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all ${
                          errors.phone
                            ? "border-red-300 focus:ring-red-500/20"
                            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                        }`}
                      />
                      {phoneCheck?.loading && (
                        <ArrowPathIcon className="w-4 h-4 absolute right-2.5 top-2.5 text-emerald-600 animate-spin pointer-events-none" />
                      )}
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

                {/* Custom Color-Coded Status Dropdown (Zero Browser Blue) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsFormStatusOpen(!isFormStatusOpen)}
                      className={`w-full flex items-center justify-between pl-8 pr-3 py-2 text-xs rounded-lg border font-extrabold transition-all shadow-2xs cursor-pointer ${
                        status === "Pending"
                          ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100/80"
                          : status === "Contacted"
                          ? "bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100/80"
                          : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/80"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {status}
                      </span>
                      <ChevronDownIcon className={`w-4 h-4 transition-transform text-slate-500 ${isFormStatusOpen ? "rotate-180 text-slate-700" : ""}`} />
                    </button>

                    {/* Colored Dot Indicator */}
                    <span
                      className={`absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none ${
                        status === "Pending"
                          ? "bg-amber-500"
                          : status === "Contacted"
                          ? "bg-teal-500"
                          : "bg-emerald-500"
                      }`}
                    />

                    {/* Popover Menu */}
                    {isFormStatusOpen && (
                      <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-40 animate-in fade-in zoom-in-95 duration-100">
                        {[
                          { val: "Pending", bg: "bg-amber-50 text-amber-800 hover:bg-amber-100/80", dot: "bg-amber-500" },
                          { val: "Contacted", bg: "bg-teal-50 text-teal-800 hover:bg-teal-100/80", dot: "bg-teal-500" },
                          { val: "Closed", bg: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80", dot: "bg-emerald-500" },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => {
                              setStatus(opt.val as Inquiry["status"]);
                              setIsFormStatusOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center justify-between transition-colors ${
                              status === opt.val ? `${opt.bg} border-l-4 ${opt.val === 'Pending' ? 'border-l-amber-500' : opt.val === 'Contacted' ? 'border-l-teal-500' : 'border-l-emerald-500'}` : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                              {opt.val}
                            </span>
                            {status === opt.val && <span className="font-extrabold text-emerald-600">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
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
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between min-h-[580px]">
            <div>
              {/* Search & Filter Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchCustomer(searchQuery);
                        }
                      }}
                      placeholder="Search name, phone, plate, ID..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchCustomer(searchQuery)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-300" />
                    Search
                  </button>
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

              {/* Inquiry Table (min-h-[320px] pb-12 ensures downward popover fits comfortably) */}
              <div className="overflow-x-auto min-h-[320px] pb-12 rounded-lg border border-slate-200">
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
                            {/* CRM-sourced rows are tinted and badged: they are
                                read-only, since the schema has no update or
                                delete mutation to push a change back. */}
                            <span className={`font-mono font-bold px-1.5 py-0.5 rounded border text-[11px] ${
                              "fromCrm" in item
                                ? "text-sky-700 bg-sky-50 border-sky-200/60"
                                : "text-emerald-700 bg-emerald-50 border-emerald-200/60"
                            }`}>
                              {item.id}
                            </span>
                            {"fromCrm" in item && (
                              <span className="ml-1 px-1 py-0.5 rounded bg-sky-100 text-sky-700 text-[8px] font-extrabold uppercase tracking-wide">
                                CRM
                              </span>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.createdAt && !Number.isNaN(Date.parse(item.createdAt))
                                ? new Date(item.createdAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
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

                          {/* Status. CRM rows show a read-only badge: the schema has
                              no updateCrmBookingStatus, so an editable control here
                              could not persist anything. */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            {/* Read-only: every row comes from the CRM, and the
                                schema has no updateCrmBookingStatus to persist a
                                change. The editable dropdown is gone rather than
                                left to silently do nothing. */}
                            <span
                              title="Status is managed in the CRM — no update mutation is available"
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-[11px] font-bold cursor-default"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              {item.crmStatus ? `Status ${item.crmStatus}` : "—"}
                            </span>
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
                              {/* Delete removed: the schema has no deleteCrmBooking
                                  or cancelCrmBooking, so the control could only ever
                                  have removed a local copy while leaving the CRM
                                  record in place. */}
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
