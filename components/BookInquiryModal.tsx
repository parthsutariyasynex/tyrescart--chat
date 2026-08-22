"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PencilIcon,
  EyeIcon,
  PlusIcon,
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
import { Inquiry, clearInquiries } from "@/services/inquiryStorage";
import {
  createCrmBookingGraphQL,
  fetchCrmCustomerByPhoneGraphQL,
  fetchCrmRecentBookingsGraphQL,
  updateCrmCustomerGraphQL,
  fetchCrmCustomersByPhoneGraphQL,
} from "@/services/graphql";
import type { CrmCustomer, CrmRecentBooking } from "@/services/types";
import { matchesSizeInput } from "@/hooks/useProductFilter";
import { idbGetAll, STORE_SUPPLIER_PRODUCTS } from "@/services/db";
import Pagination from "@/components/Pagination";

/** No external store to watch — `mounted` only ever flips via the server/client
 *  snapshot pair, so the subscription is a no-op. Module scope keeps its
 *  identity stable; a new closure each render would resubscribe endlessly. */
const subscribeNever = () => () => {};

interface BookInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProduct?: {
    brand?: string;
    size?: string;
    pattern?: string;
  } | null;
  sizeOptions?: string[];
}

export default function BookInquiryModal({
  isOpen,
  onClose,
  initialProduct,
  sizeOptions,
}: BookInquiryModalProps) {
  // Inquiry list state
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  /** The CRM's recent enquiries — `crmRecentBookings`. `null` = still loading. */
  const [recentBookings, setRecentBookings] = useState<
    CrmRecentBooking[] | null
  >(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** True only when the CUSTOMER column's edit icon opened the form.
   *  The Actions "Edit Inquiry" icon leaves it false, so that flow keeps
   *  the exact read-only behaviour it has today. */
  const [customerEditMode, setCustomerEditMode] = useState(false);
  /** True only when the CUSTOMER column's edit icon opened the form.
   *  The Actions "Edit Inquiry" icon leaves it false, so that flow keeps
   *  the exact read-only behaviour it has today. */
  const [viewingInquiry, setViewingInquiry] = useState<Inquiry | null>(null);

  // Separate Edit Customer Details popup state
  const [editingCustomerInquiry, setEditingCustomerInquiry] =
    useState<Inquiry | null>(null);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custCity, setCustCity] = useState("");
  const [custEntityId, setCustEntityId] = useState("");
  /** True while `updateCrmCustomer` is in flight — blocks a double submit. */
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [tireSize1, setTireSize1] = useState("");
  const [tireSize2, setTireSize2] = useState("");
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Inquiry["status"]>("Pending");

  // Size Autocomplete Suggestions state & refs
  const [loadedSizes, setLoadedSizes] = useState<string[]>([]);
  const [isFrontSizeOpen, setIsFrontSizeOpen] = useState(false);
  const [isRearSizeOpen, setIsRearSizeOpen] = useState(false);
  const frontSizeRef = useRef<HTMLDivElement>(null);
  const rearSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    idbGetAll<{ size?: string; sizeFull?: string }>(STORE_SUPPLIER_PRODUCTS)
      .then((items) => {
        const set = new Set<string>();
        items.forEach((p) => {
          const sz = p.size || p.sizeFull;
          if (sz) set.add(sz);
        });
        if (set.size > 0) {
          setLoadedSizes(Array.from(set).sort());
        }
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        frontSizeRef.current &&
        !frontSizeRef.current.contains(e.target as Node)
      ) {
        setIsFrontSizeOpen(false);
      }
      if (
        rearSizeRef.current &&
        !rearSizeRef.current.contains(e.target as Node)
      ) {
        setIsRearSizeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allAvailableSizes = useMemo(() => {
    const set = new Set<string>();
    if (sizeOptions) sizeOptions.forEach((s) => s && set.add(s));
    loadedSizes.forEach((s) => s && set.add(s));
    if (initialProduct?.size) set.add(initialProduct.size);
    return Array.from(set).sort();
  }, [sizeOptions, loadedSizes, initialProduct]);

  const matchingFrontSizes = useMemo(() => {
    const input = tireSize1.trim();
    if (!input || allAvailableSizes.length === 0) return [];
    const lower = input.toLowerCase();
    const results: string[] = [];
    for (const sz of allAvailableSizes) {
      if (!sz) continue;
      if (
        sz.toLowerCase().includes(lower) ||
        matchesSizeInput({ size: sz, sizeFull: sz }, input)
      ) {
        results.push(sz);
        if (results.length >= 12) break;
      }
    }
    return results;
  }, [tireSize1, allAvailableSizes]);

  const matchingRearSizes = useMemo(() => {
    const input = tireSize2.trim();
    if (!input || allAvailableSizes.length === 0) return [];
    const lower = input.toLowerCase();
    const results: string[] = [];
    for (const sz of allAvailableSizes) {
      if (!sz) continue;
      if (
        sz.toLowerCase().includes(lower) ||
        matchesSizeInput({ size: sz, sizeFull: sz }, input)
      ) {
        results.push(sz);
        if (results.length >= 12) break;
      }
    }
    return results;
  }, [tireSize2, allAvailableSizes]);

  // Validation state
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  /** True while `createCrmBooking` is in flight. Blocks a second submit — the
   *  mutation has no delete counterpart, so a double-click would file two
   *  enquiries that can only be removed from the Magento admin. */
  const [submitting, setSubmitting] = useState(false);
  /** CRM record for the searched phone. null = looked up and not on file. */
  /** Customers returned by the phone search. `crmCustomerByPhone` returns an
   *  ARRAY — one number can match several records — so the list is kept whole
   *  rather than collapsed to the first hit. */
  const [crmCustomers, setCrmCustomers] = useState<CrmCustomer[]>([]);
  /**
   * CRM status of the phone currently typed in the FORM (separate from the
   * search box). undefined = not checked yet, null = checked and not on file.
   */
  const [phoneCheck, setPhoneCheck] = useState<
    | {
        phone: string;
        customer: CrmCustomer | null;
        loading: boolean;
      }
    | undefined
  >(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  /**
   * The query a search was actually RUN for — set only by `handleSearchCustomer`
   * (Search button / Enter), never by typing.
   *
   * `searchQuery` is the raw input and changes on every keystroke; binding the
   * table to it made typing "050" filter the 15 already-loaded recent bookings
   * down to 10 without ever asking the backend, which reads as "missing rows".
   * The table reads THIS value instead, so the list only ever changes when a
   * search has actually been performed. Empty = no search yet, show the recent
   * bookings the modal opened with.
   */
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [isFormStatusOpen, setIsFormStatusOpen] = useState(false);

  // Animation states matching QuickViewModal / CostHistoryModal
  const [isAnimatedOpen, setIsAnimatedOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Animation states for inner viewingInquiry detail modal
  const [viewingInquiryAnimated, setViewingInquiryAnimated] = useState(false);
  const [viewingInquiryClosing, setViewingInquiryClosing] = useState(false);

  // Animation states for inner editingCustomerInquiry modal
  const [editingCustomerAnimated, setEditingCustomerAnimated] = useState(false);
  const [editingCustomerClosing, setEditingCustomerClosing] = useState(false);

  useEffect(() => {
    let raf1: number;
    let raf2: number;
    if (editingCustomerInquiry) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setEditingCustomerAnimated(true);
        });
      });
    } else {
      raf1 = requestAnimationFrame(() => {
        setEditingCustomerAnimated(false);
        setEditingCustomerClosing(false);
      });
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [editingCustomerInquiry]);

  const handleCloseEditCustomer = () => {
    setEditingCustomerClosing(true);
    setTimeout(() => {
      setEditingCustomerInquiry(null);
      setEditingCustomerClosing(false);
      setEditingCustomerAnimated(false);
    }, 250);
  };

  useEffect(() => {
    let raf1: number;
    let raf2: number;
    if (viewingInquiry) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setViewingInquiryAnimated(true);
        });
      });
    } else {
      // Deferred into a frame the cleanup already cancels: a synchronous
      // setState in an effect body cascades an extra render, and these only
      // reset state for a detail modal that is no longer on screen.
      raf1 = requestAnimationFrame(() => {
        setViewingInquiryAnimated(false);
        setViewingInquiryClosing(false);
      });
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [viewingInquiry]);

  const handleCloseViewingInquiry = () => {
    setViewingInquiryClosing(true);
    setTimeout(() => {
      setViewingInquiry(null);
      setViewingInquiryClosing(false);
      setViewingInquiryAnimated(false);
    }, 250);
  };

  useEffect(() => {
    let raf1: number;
    let raf2: number;
    if (isOpen) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsAnimatedOpen(true);
        });
      });
    } else {
      raf1 = requestAnimationFrame(() => {
        setIsAnimatedOpen(false);
      });
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
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
    if (editingId && !customerEditMode) {
      setPhoneCheck(undefined);
      return;
    }
    const p = phone.trim();
    let alive = true;
    // Below 7 digits there is nothing worth asking about, and the endpoint only
    // accepts a phone, so an incomplete number is left unchecked. Both state
    // writes are deferred: a synchronous setState in an effect body cascades.
    const tooShort = p.replace(/[^\d]/g, "").length < 7;
    const spinner = setTimeout(() => {
      if (!alive) return;
      setPhoneCheck(
        tooShort ? undefined : { phone: p, customer: null, loading: true },
      );
    }, 0);
    if (tooShort)
      return () => {
        alive = false;
        clearTimeout(spinner);
      };
    const timer = setTimeout(() => {
      void fetchCrmCustomerByPhoneGraphQL(p)
        .then((c) => {
          /* Result is reported INLINE under the phone field — the red
             "already exists" / green "available" lines below the input — not as
             a toast. One place to look, and it stays on screen instead of
             disappearing after 3s. */
          if (alive) setPhoneCheck({ phone: p, customer: c, loading: false });
        })
        .catch(() => {
          if (alive) setPhoneCheck(undefined);
        });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(spinner);
      clearTimeout(timer);
    };
  }, [phone, editingId, customerEditMode]);



  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      // Cleared here, at the end of the 500ms animation, rather than on the
      // next open. `isClosing` stays true while the modal animates out (isOpen
      // is still true until onClose lands), and something must reset it or the
      // reopened modal would never pass `isAnimatedOpen && !isClosing`.
      setIsClosing(false);
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
      setInquiries([]);
      /* Start every session with no search result. The modal is rendered
         unconditionally (`isOpen` only toggles visibility), so it never
         unmounts and this state would otherwise survive a close/reopen and
         show the PREVIOUS customer's rows before any new query is made. */
      setSearchQuery("");
      setSubmittedQuery("");
      setCrmCustomers([]);
      setCurrentPage(1);
      // Prefill from the row the modal was opened on — the product's own size.
      if (initialProduct?.size) setTireSize1(initialProduct.size);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, initialProduct]);

  /* Book Inquiry keeps nothing locally. Any records written by an earlier
     build are purged once, on mount, so the key cannot linger. */
  useEffect(() => {
    clearInquiries();
  }, []);

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
    setCity("");
    setTireSize1(initialProduct?.size || "");
    setTireSize2("");
    setVehiclePlateNumber("");
    setMake("");
    setModel("");
    setYear("");
    setNote("");
    setStatus("Pending");
    setEditingId(null);
    setCustomerEditMode(false);
    setSearchQuery("");
    setErrors({});
    setPhoneCheck(undefined);
  };

  // Populate form for editing
  const handleEdit = (inquiry: Inquiry, customerMode = false) => {
    setEditingId(inquiry.id);
    setCustomerEditMode(customerMode);
    setPhoneCheck(undefined);
    setName(inquiry.name || "");
    setPhone(inquiry.phone || "");
    setEmail(inquiry.email || "");
    setCity(inquiry.city || "");
    setTireSize1(inquiry.tireSize1 || "");
    setTireSize2(inquiry.tireSize2 || "");
    setVehiclePlateNumber(inquiry.vehiclePlateNumber || "");
    setMake(inquiry.make || "");
    setModel(inquiry.model || "");
    setYear(inquiry.year || "");
    setNote(inquiry.note || "");
    setStatus(inquiry.status || "Pending");
    setErrors({});

    if (inquiry.phone) {
      fetchCrmCustomerByPhoneGraphQL(inquiry.phone)
        .then((found) => {
          if (found) {
            if (found.area) setCity(found.area);
            if (found.email && !inquiry.email) setEmail(found.email);
            if (found.name && !inquiry.name) setName(found.name);
          }
        })
        .catch(() => null);
    }
  };

  // Pre-fill customer details for a NEW inquiry
  const handleNewInquiryForCustomer = (inquiry: Inquiry) => {
    setEditingId(null);
    setCustomerEditMode(false);
    setPhoneCheck(undefined);
    setName(inquiry.name || "");
    setPhone(inquiry.phone || "");
    setEmail(inquiry.email || "");
    setCity(inquiry.city || "");
    setTireSize1(initialProduct?.size || "");
    setTireSize2("");
    setVehiclePlateNumber(inquiry.vehiclePlateNumber || "");
    setMake(inquiry.make || "");
    setModel(inquiry.model || "");
    setYear(inquiry.year || "");
    setNote("");
    setStatus("Pending");
    setErrors({});
  };

  // Open separate Edit Customer Details modal
  const handleOpenEditCustomer = (item: Inquiry) => {
    setEditingCustomerInquiry(item);
    setCustName(item.name || "");
    setCustPhone(item.phone || "");
    setCustEmail(item.email || "");
    setCustCity(item.city || "");
    const initialEntityId = item.crmCustomerId
      ? String(item.crmCustomerId)
      : "";
    setCustEntityId(initialEntityId);

    if (item.phone) {
      fetchCrmCustomerByPhoneGraphQL(item.phone)
        .then((found) => {
          if (found) {
            if (found.entity_id) setCustEntityId(String(found.entity_id));
            if (found.area) setCustCity(found.area);
            if (found.email && !item.email) setCustEmail(found.email);
            if (found.name && !item.name) setCustName(found.name);
          }
        })
        .catch(() => null);
    }
  };

  // Open Inquiry Detail view modal with auto-resolution of CRM Customer entity_id
  const handleOpenViewingInquiry = (item: Inquiry) => {
    setViewingInquiry(item);
    if (!item.crmCustomerId && item.phone) {
      fetchCrmCustomerByPhoneGraphQL(item.phone)
        .then((found) => {
          if (found?.entity_id) {
            setViewingInquiry((prev) =>
              prev ? { ...prev, crmCustomerId: Number(found.entity_id) } : null,
            );
          }
        })
        .catch(() => null);
    }
  };

  /**
   * Save the Edit Customer Details form.
   *
   * Calls `updateCrmCustomer` — the CRM's own customer-edit mutation — and then
   * re-reads the list from the backend, so what appears in the table is what
   * the CRM stored, not a local patch. Nothing is written to localStorage.
   *
   * `entity_id` is required by the mutation. Rows returned by
   * `crmCustomerByPhone` already carry it as `crmCustomerId`; rows from
   * `crmRecentBookings` do not, so it is looked up by phone first.
   */
  const handleSaveCustomerDetails = async () => {
    if (!editingCustomerInquiry || savingCustomer) return;
    if (!custName.trim() || !custPhone.trim()) {
      setToastMessage("Customer name and phone are required.");
      return;
    }
    setSavingCustomer(true);
    try {
      let entityId = Number(
        custEntityId || editingCustomerInquiry.crmCustomerId || 0,
      );
      if (!entityId) {
        // Look the customer up by the phone the row was loaded with, NOT the
        // edited one — the edit may be changing the number itself.
        const found = await fetchCrmCustomerByPhoneGraphQL(
          editingCustomerInquiry.phone || custPhone,
        ).catch(() => null);
        entityId = Number(found?.entity_id ?? 0);
      }
      if (!entityId) {
        setToastMessage("Could not identify this customer in the CRM.");
        return;
      }

      const res = await updateCrmCustomerGraphQL({
        entity_id: entityId,
        name: custName.trim(),
        phone: custPhone.trim(),
        email: custEmail.trim(),
        city: custCity.trim(),
      });

      if (!res.success) {
        setToastMessage(res.message || "The CRM rejected this change.");
        return;
      }

      // Re-read from the backend so the list shows the stored values.
      const rows = await fetchCrmRecentBookingsGraphQL().catch(() => null);
      if (rows) setRecentBookings(rows);
      if (crmCustomers.length) {
        const refreshed = await fetchCrmCustomersByPhoneGraphQL(
          custPhone.trim(),
        ).catch(() => []);
        if (refreshed.length) setCrmCustomers(refreshed);
      }

      setToastMessage(res.message || "Customer details updated.");
      handleCloseEditCustomer();
    } catch (err) {
      setToastMessage(
        err instanceof Error ? err.message : "Could not reach the CRM.",
      );
    } finally {
      setSavingCustomer(false);
    }
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

    {
      /* ALWAYS a create — `createCrmBooking` — whether the form was opened blank
         or pre-filled from an existing row via the pencil.
         
         The pencil only copies a row's values into the form as a starting
         point; submitting files a NEW enquiry and leaves the original row
         untouched. No update mutation is called from here.

         Blank fields are omitted by the mutation builder rather than sent as
         empty strings, which would blank out data already on the customer's
         record. */
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

        const submittedPhone = phone.trim();
        /* Nothing is mirrored to localStorage. The CRM holds the enquiry, and
           the two refreshes below re-read it from there, so the row appears in
           the list from the backend rather than from a local copy. */

        const refreshed = await fetchCrmCustomersByPhoneGraphQL(
          submittedPhone,
        ).catch(() => []);
        if (refreshed.length) {
          setCrmCustomers(refreshed);
          setSearchQuery(submittedPhone);
          setCurrentPage(1);
        }

        // Also refresh recent CRM bookings list so the newly submitted booking appears in the main table
        void fetchCrmRecentBookingsGraphQL()
          .then((rows) => setRecentBookings(rows))
          .catch(() => null);
        setToastMessage(
          res.message ||
            `Enquiry ${res.booking?.entity_id ?? ""} created in the CRM.`.replace(
              "  ",
              " ",
            ),
        );
      } catch (err) {
        setToastMessage(
          err instanceof Error
            ? err.message
            : "Could not reach the CRM. Please try again.",
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
    const q = (
      overrideQuery !== undefined ? overrideQuery : searchQuery
    ).trim();
    const queryName = name.trim();
    const queryPhone = phone.trim();
    const targetQuery = q || queryName || queryPhone;

    if (!targetQuery) {
      setToastMessage(
        "Please enter a Customer Name or Mobile Number to search.",
      );
      return;
    }

    /* Commit the query. Only this — a Search click or Enter — switches the
       table over to backend results; typing alone never does. */
    setSearchQuery(targetQuery);
    setSubmittedQuery(targetQuery);
    setCurrentPage(1);

    // Check local inquiries list
    const qLower = targetQuery.toLowerCase();
    const matches = inquiries.filter(
      (item) =>
        item.name.toLowerCase().includes(qLower) ||
        item.phone.toLowerCase().includes(qLower) ||
        (item.vehiclePlateNumber &&
          item.vehiclePlateNumber.toLowerCase().includes(qLower)),
    );

    /* Search FILTERS the list; it does not populate the form. Loading a
       customer's details into the form is the Edit button's job only, so a
       search can never quietly overwrite something half-typed. */
    if (matches.length > 0) setErrors({});

    const digits = targetQuery.replace(/[^\d]/g, "");
    if (digits.length >= 1 || targetQuery.length >= 1) {
      void fetchCrmCustomersByPhoneGraphQL(targetQuery)
        .then((list) => {
          // Only feeds the list (via crmRows). The form is left alone.
          setCrmCustomers(list);
          const c = list[0];
          if (c) {
            /* Counted from the BOOKINGS, not the customers: a partial number
               matches many customers but only some of them have inquiries, and
               the table now shows bookings only. Naming list[0] alone read as
               "one customer found" when 615 had matched. */
            const bookingCount = list.reduce(
              (sum, cust) => sum + (cust.bookings?.length ?? 0),
              0,
            );
            setToastMessage(
              bookingCount === 0
                ? `Matched ${list.length} customer${list.length === 1 ? "" : "s"}, but none has an inquiry on record.`
                : list.length === 1
                  ? `Found ${bookingCount} inquiry${bookingCount === 1 ? "" : " records"} for "${c.name ?? targetQuery}".`
                  : `Found ${bookingCount} inquiries across ${list.length} customers.`,
            );
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
      setToastMessage(
        `Found ${matches.length} matching inquiry! Customer details loaded into form.`,
      );
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
  /* Load the CRM's recent enquiries every time the modal opens. */
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void fetchCrmRecentBookingsGraphQL()
      .then((rows) => {
        if (alive) setRecentBookings(rows);
      })
      .catch(() => {
        if (alive) setRecentBookings([]);
      });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  /**
   * `crmRecentBookings` shaped as list rows.
   *
   * This is what makes the table open POPULATED. Previously it could only ever
   * show enquiries belonging to a phone number someone had searched, because the
   * schema had no list query at all; `crmRecentBookings` now provides one, so an
   * enquiry filed by another member of staff, from another device, or straight
   * through the API is finally visible here.
   *
   * Read-only, like the phone-lookup rows: there is still no update or delete
   * mutation to push a change back.
   */
  /** A list row that still carries the raw CRM objects it was built from. */
  type CrmSearchRow = Inquiry & {
    fromCrm: true;
    /** The whole `crmCustomerByPhone` object, untouched. */
    crmCustomer?: CrmCustomer;
    /** The specific booking this row represents, untouched. */
    crmBooking?: NonNullable<CrmCustomer["bookings"]>[number] | undefined;
  };

  const recentRows: (Inquiry & { fromCrm: true })[] = useMemo(() => {
    if (!recentBookings?.length) return [];
    return recentBookings.map((b, i) => ({
      id: `CRM-${String(b.entity_id ?? i)}`,
      fromCrm: true as const,
      crmCustomerId: b.customer?.entity_id
        ? Number(b.customer.entity_id)
        : undefined,
      name: b.customer?.name ?? "",
      phone: b.customer?.phone ?? "",
      email: b.customer?.email ?? "",
      tireSize1: b.tire_size_1 ?? "",
      tireSize2: b.tire_size_2 ?? "",
      vehiclePlateNumber: b.vehicle?.plant_number ?? "",
      make: b.vehicle?.make ?? "",
      model: b.vehicle?.model ?? "",
      year: b.vehicle?.year ?? "",
      note: b.detail ?? "",
      // The CRM's status is a numeric code with no published mapping, so it is
      // not forced into the local Pending/Contacted/Closed vocabulary.
      status: "Pending" as Inquiry["status"],
      createdAt: b.enquiry_date ?? b.created_at ?? "",
      crmBookingId: b.entity_id ?? undefined,
      crmStatus: b.status == null ? null : String(b.status),
      crmPriority: b.priority == null ? null : String(b.priority),
      crmEnquiryDate: b.enquiry_date ?? null,
    }));
  }, [recentBookings]);

  /**
   * Rows for the phone search — built straight from the `crmCustomerByPhone`
   * response.
   *
   * The table renders `Inquiry`, so the fields it reads are still surfaced, but
   * the API objects are carried through UNCHANGED on `crmCustomer` / `crmBooking`
   * rather than being flattened away. Edit and view actions can then reach
   * `entity_id`, `area`, `vehicles`, `quoted_price`, `notes` and everything else
   * the response holds without a second lookup.
   */
  const crmRows: CrmSearchRow[] = useMemo(() => {
    if (!crmCustomers.length) return [];

    return crmCustomers.flatMap((customer): CrmSearchRow[] => {
      /* Fields every row of this customer shares. The response object itself is
         attached as `crmCustomer`, so entity_id / area / vehicles / status stay
         reachable for the edit and view actions. */
      const base = {
        fromCrm: true as const,
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        /* The CRM stores the city under `area` — `updateCrmCustomer` accepts a
           `city` input but reads it back as `area`. */
        city: customer.area ?? "",
        crmCustomerId: customer.entity_id ?? undefined,
        crmCustomer: customer,
        status: "Pending" as Inquiry["status"],
      };

      const bookings = customer.bookings ?? [];
      if (bookings.length) {
        return bookings.map((b, i) => ({
          ...base,
          id: `CRM-${String(b.entity_id ?? `${customer.entity_id}-${i}`)}`,
          tireSize1: b.tire_size_1 ?? "",
          tireSize2: b.tire_size_2 ?? "",
          vehiclePlateNumber:
            b.vehicle?.plant_number ??
            customer.vehicles?.[0]?.plant_number ??
            "",
          make: b.vehicle?.make ?? customer.vehicles?.[0]?.make ?? "",
          model: b.vehicle?.model ?? customer.vehicles?.[0]?.model ?? "",
          year: b.vehicle?.year ?? customer.vehicles?.[0]?.year ?? "",
          note: b.detail ?? b.notes ?? "",
          createdAt: b.enquiry_date ?? "",
          crmBookingId: b.entity_id ?? undefined,
          crmStatus: b.status == null ? null : String(b.status),
          crmPriority: b.priority == null ? null : String(b.priority),
          crmEnquiryDate: b.enquiry_date ?? null,
          crmBooking: b,
        }));
      }

      /* Customer is on file but has NO bookings — contribute a placeholder row 
         so the customer record is still visible and actionable in the table. */
      return [
        {
          ...base,
          id: `CRM-CUST-${String(customer.entity_id || Math.random())}`,
          tireSize1: "",
          tireSize2: "",
          vehiclePlateNumber: customer.vehicles?.[0]?.plant_number ?? "",
          make: customer.vehicles?.[0]?.make ?? "",
          model: customer.vehicles?.[0]?.model ?? "",
          year: customer.vehicles?.[0]?.year ?? "",
          note: customer.area ? `City: ${customer.area}` : "",
          createdAt: "",
          crmBookingId: undefined,
          crmStatus: null,
          crmPriority: null,
          crmEnquiryDate: null,
          crmBooking: undefined,
        },
      ];
    });
  }, [crmCustomers]);

  const allInquirySource = useMemo(() => {
    /* SEARCH IS BACKEND-ONLY, and the two sources are shown one at a time:

         no search yet  → `crmRecentBookings` (what the modal opens with)
         after a search → ONLY what `crmCustomerByPhone` returned

       They are not merged. Merging put the recent bookings back on screen
       alongside the results, so a search appeared to return rows the backend
       had not matched. Reset clears `submittedQuery` and the recent list
       returns.

       The localStorage mirror is deliberately not part of either source — a
       booking created here still appears because submit re-reads the customer
       from the CRM. */
    const rows = submittedQuery ? crmRows : recentRows;

    // Dedupe by id; a customer's booking can arrive from either source.
    const map = new Map<string, Inquiry>();
    rows.forEach((r) => map.set(r.id, r));
    return Array.from(map.values());
  }, [recentRows, crmRows, submittedQuery]);

  /**
   * "Customer found, but no inquiries" notice.
   *
   * A phone search can match customers who have no bookings at all — searching
   * "9750" returns Maha Ahmed (0509750309) with zero. Those must NOT become rows
   * (an inquiry list may only contain inquiries), but showing an empty table and
   * nothing else reads as "the search is broken", so the customer is reported
   * here instead.
   *
   * DERIVED, not stored: it is a function of the last search's results, so it
   * survives until the next search replaces `crmCustomers` and clears itself on
   * Reset — no extra state to keep in sync.
   */
  const noBookingsNotice = useMemo(() => {
    if (!submittedQuery) return null;
    if (!crmCustomers.length) return null;
    // Any real inquiry among the results means the table has rows to show.
    if (crmRows.length) return null;

    const first = crmCustomers[0];
    const label = String(first?.name ?? "").trim() || "Unnamed customer";
    const phoneLabel = String(first?.phone ?? "").trim();
    /* A partial number can match many customers who all have no bookings; name
       the first and count the rest rather than printing hundreds of names. */
    const others = crmCustomers.length - 1;
    return {
      name: label,
      phone: phoneLabel,
      others,
    };
  }, [submittedQuery, crmCustomers, crmRows]);

  /* 1. No client-side text filtering — `crmCustomerByPhone` has already done the
        matching, so re-filtering its rows here could only DROP results the
        backend deliberately returned (it matches on the customer's stored
        number, which may be spaced or prefixed: a search for "050" legitimately
        returns "971 50 508 4910"). The rows are shown exactly as returned. */
  const searchFilteredInquiries = allInquirySource;

  // 2. Count search-filtered items by status for tab badges
  const statusCounts = useMemo(() => {
    const counts = {
      ALL: searchFilteredInquiries.length,
      Pending: 0,
      Contacted: 0,
      Closed: 0,
    };
    for (const item of searchFilteredInquiries) {
      const st = String(item.status || "Pending").toLowerCase();
      if (st === "pending") counts.Pending++;
      else if (st === "contacted") counts.Contacted++;
      else if (st === "closed") counts.Closed++;
      else counts.Pending++;
    }
    return counts;
  }, [searchFilteredInquiries]);

  // 3. Apply status filter on search-filtered inquiries
  const filteredInquiries = useMemo(() => {
    if (statusFilter === "ALL") return searchFilteredInquiries;
    return searchFilteredInquiries.filter((item) => {
      const st = String(item.status || "Pending").toLowerCase();
      return st === statusFilter.toLowerCase();
    });
  }, [searchFilteredInquiries, statusFilter]);

  // Pagination logic
  const totalPages = Math.ceil(filteredInquiries.length / pageSize) || 1;
  const paginatedInquiries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInquiries.slice(start, start + pageSize);
  }, [filteredInquiries, currentPage, pageSize]);

  /* Client-only guard for the portal: `document` does not exist while
     rendering on the server. `useSyncExternalStore` gives the server snapshot
     (false) during SSR and hydration, then the client one (true) — the same
     result as a setState-on-mount effect, without the effect. */
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  if (!isOpen && !isClosing) return null;
  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-500 ease-out ${
        isAnimatedOpen && !isClosing
          ? "opacity-100"
          : "opacity-0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Slide-Up Bottom Container (Full Width like CostHistoryModal & QuickViewModal) */}
      <div
        className={`relative bg-slate-50 w-full max-w-full border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden transition-transform duration-500 ease-out h-[90vh] max-h-[90vh] rounded-t-2xl ${
          isAnimatedOpen && !isClosing ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Toast Notification (Zero Layout Shift) */}
        {toastMessage && (
          <div className="absolute top-3.5 right-16 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700/80 backdrop-blur-xs transition-all">
            <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-slate-400 hover:text-white font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header (Bright Light SaaS Theme) */}
        <div className="px-5 py-2 border-b border-slate-200/80 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <CalendarDaysIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                Book Inquiry
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Log customer tire inquiries, vehicle details, and track
                follow-up statuses
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-6 grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50/50 [&>*]:min-w-0">
          {/* Right Column: Form Section */}
          <div className="lg:col-span-5 lg:order-2 bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between min-h-[460px]">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {editingId ? (
                    <PencilSquareIcon className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <PlusCircleIcon className="w-4 h-4 text-emerald-600" />
                  )}
                  {editingId ? "Edit Inquiry" : "New Inquiry"}
                </h3>
              </div>

              <form
                autoComplete="off"
                onSubmit={handleSubmit}
                className="space-y-2.5"
              >
                {/* Name & Phone (Required) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Customer Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        autoComplete="off"
                        type="text"
                        value={name}
                        disabled={!!editingId}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (errors.name)
                            setErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                        placeholder="e.g. Ahmed Al-Mansoor"
                        className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all ${
                          errors.name
                            ? "border-red-300 focus:ring-red-500/20"
                            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                        } disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200`}
                      />
                    </div>
                    {errors.name && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" />{" "}
                        {errors.name}
                      </p>
                    )}
                  </div>

                  {/* <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <PhoneIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input autoComplete="off"
                        type="text"
                        value={phone}
                        disabled={!!editingId}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                        }}
                        placeholder="+971 50 123 4567"
                        className={`w-full pl-8 ${phoneCheck?.loading ? "pr-8" : "pr-3"} py-1.5 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all ${
                          errors.phone
                            ? "border-red-300 focus:ring-red-500/20"
                            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                        } disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200`}
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
                </div> */}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <PhoneIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />

                        <input
                          autoComplete="off"
                          type="text"
                          value={phone}
                          disabled={!!editingId}
                          onChange={(e) => {
                            setPhone(e.target.value);

                            // Reset phone check when number changes
                            if (phoneCheck) {
                              setPhoneCheck(undefined);
                            }

                            if (errors.phone) {
                              setErrors((prev) => ({
                                ...prev,
                                phone: undefined,
                              }));
                            }
                          }}
                          placeholder="+971 50 123 4567"
                          className={`w-full pl-8 ${
                            phoneCheck?.loading ? "pr-8" : "pr-3"
                          } py-1.5 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all ${
                            errors.phone
                              ? "border-red-300 focus:ring-red-500/20"
                              : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                          } disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200`}
                        />

                        {phoneCheck?.loading && (
                          <ArrowPathIcon className="w-4 h-4 absolute right-2.5 top-2.5 text-emerald-600 animate-spin pointer-events-none" />
                        )}
                      </div>

                      {/* Check Number Button */}
                      {/* {!editingId && (
                        <button
                          type="button"
                          onClick={handleCheckPhone}
                          disabled={!phone.trim() || phoneCheck?.loading}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {phoneCheck?.loading ? "Checking..." : "Check Number"}
                        </button>
                      )} */}
                    </div>

                    {/* Existing number */}
                    {!(!!editingId && !customerEditMode) && phoneCheck?.customer && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" />
                        This phone number already exists.
                      </p>
                    )}

                    {/* Available number */}
                    {!(!!editingId && !customerEditMode) &&
                      phoneCheck &&
                      !phoneCheck.loading &&
                      !phoneCheck.customer && (
                        <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                          ✓ This phone number is available.
                        </p>
                      )}

                    {errors.phone && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" />
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Email & City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <EnvelopeIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        autoComplete="off"
                        type="email"
                        value={email}
                        disabled={!!editingId}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      autoComplete="off"
                      type="text"
                      value={city}
                      disabled={!!editingId}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Riyadh, Jeddah"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200"
                    />
                  </div>
                </div>

                {/* Tire Sizes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div ref={frontSizeRef} className="relative">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Front Size
                    </label>
                    <input
                      autoComplete="off"
                      type="text"
                      value={tireSize1}
                      onChange={(e) => {
                        setTireSize1(e.target.value);
                        setIsFrontSizeOpen(true);
                      }}
                      onFocus={() => setIsFrontSizeOpen(true)}
                      placeholder="e.g. 265/65 R17"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                    {isFrontSizeOpen && matchingFrontSizes.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-emerald-200 rounded-lg shadow-xl z-[999] max-h-48 overflow-y-auto py-1">
                        {matchingFrontSizes.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              setTireSize1(sz);
                              setIsFrontSizeOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>{sz}</span>
                            {tireSize1 === sz && (
                              <span className="text-emerald-600 font-bold text-xs">
                                ✓
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div ref={rearSizeRef} className="relative">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rear Size
                    </label>
                    <input
                      autoComplete="off"
                      type="text"
                      value={tireSize2}
                      onChange={(e) => {
                        setTireSize2(e.target.value);
                        setIsRearSizeOpen(true);
                      }}
                      onFocus={() => setIsRearSizeOpen(true)}
                      placeholder="e.g. 285/60 R18"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                    {isRearSizeOpen && matchingRearSizes.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-emerald-200 rounded-lg shadow-xl z-[999] max-h-48 overflow-y-auto py-1">
                        {matchingRearSizes.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              setTireSize2(sz);
                              setIsRearSizeOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>{sz}</span>
                            {tireSize2 === sz && (
                              <span className="text-emerald-600 font-bold text-xs">
                                ✓
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Vehicle Plate & Make */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Plate Number
                    </label>
                    <div className="relative">
                      <TruckIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        autoComplete="off"
                        type="text"
                        value={vehiclePlateNumber}
                        onChange={(e) => setVehiclePlateNumber(e.target.value)}
                        placeholder="e.g. A-54321"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white uppercase font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Make
                    </label>
                    <input
                      autoComplete="off"
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Model
                    </label>
                    <input
                      autoComplete="off"
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. Land Cruiser"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Year
                    </label>
                    <input
                      autoComplete="off"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status
                  </label>
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
                      <span className="flex items-center gap-2">{status}</span>
                      <ChevronDownIcon
                        className={`w-4 h-4 transition-transform text-slate-500 ${isFormStatusOpen ? "rotate-180 text-slate-700" : ""}`}
                      />
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
                          {
                            val: "Pending",
                            bg: "bg-amber-50 text-amber-800 hover:bg-amber-100/80",
                            dot: "bg-amber-500",
                          },
                          {
                            val: "Contacted",
                            bg: "bg-teal-50 text-teal-800 hover:bg-teal-100/80",
                            dot: "bg-teal-500",
                          },
                          {
                            val: "Closed",
                            bg: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80",
                            dot: "bg-emerald-500",
                          },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => {
                              setStatus(opt.val as Inquiry["status"]);
                              setIsFormStatusOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center justify-between transition-colors ${
                              status === opt.val
                                ? `${opt.bg} border-l-4 ${opt.val === "Pending" ? "border-l-amber-500" : opt.val === "Contacted" ? "border-l-teal-500" : "border-l-emerald-500"}`
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${opt.dot}`}
                              />
                              {opt.val}
                            </span>
                            {status === opt.val && (
                              <span className="font-extrabold text-emerald-600">
                                ✓
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Note textarea */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Inquiry Note
                  </label>
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
                    {submitting
                      ? "Saving to CRM…"
                      : editingId
                        ? "Update Inquiry"
                        : "Create Inquiry"}
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

          {/* Left Column: Inquiry List Section */}
          <div className="lg:col-span-7 lg:order-1 bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between min-h-[460px]">
            <div>
              {/* Search & Filter Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      autoComplete="off"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearchCustomer(searchQuery);
                        }
                      }}
                      placeholder="Search Phone Number..."
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
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSubmittedQuery("");
                      setCrmCustomers([]);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-all shrink-0 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>

                {/* Filter Status Pills */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    {
                      key: "ALL",
                      label: "ALL",
                      activeBg: "bg-slate-900 text-white shadow-2xs",
                    },
                    {
                      key: "Pending",
                      label: "Pending",
                      activeBg: "bg-amber-500 text-white shadow-2xs",
                    },
                    {
                      key: "Contacted",
                      label: "Contacted",
                      activeBg: "bg-blue-600 text-white shadow-2xs",
                    },
                    {
                      key: "Closed",
                      label: "Closed",
                      activeBg: "bg-emerald-600 text-white shadow-2xs",
                    },
                  ].map((tab) => {
                    const isSelected = statusFilter === tab.key;
                    const count =
                      statusCounts[tab.key as keyof typeof statusCounts] ?? 0;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setStatusFilter(tab.key);
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? tab.activeBg
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                            isSelected
                              ? "bg-white/25 text-white"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer matched, but has no inquiries on record. Persists
                  until the next search — see `noBookingsNotice`. */}
              {noBookingsNotice && (
                <div
                  role="status"
                  className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900"
                >
                  <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-px text-amber-500" />
                  <span>
                    Customer found:{" "}
                    <span className="font-bold">{noBookingsNotice.name}</span>
                    {noBookingsNotice.phone && ` (${noBookingsNotice.phone})`}
                    {noBookingsNotice.others > 0 &&
                      ` and ${noBookingsNotice.others} other customer${
                        noBookingsNotice.others === 1 ? "" : "s"
                      }`}{" "}
                    — No inquiries found.
                  </span>
                </div>
              )}

              {/* Inquiry Table */}
              <div className="overflow-x-auto min-h-[200px] rounded-lg border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-0.5">Customer</th>
                      <th className="px-3 py-0.5">Tire Size(s)</th>
                      <th className="px-3 py-0.5">Plate</th>
                      <th className="px-3 py-0.5 text-center">Status</th>
                      <th className="px-3 py-0.5 text-center">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedInquiries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-slate-400"
                        >
                          <ClockIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="font-semibold text-xs">
                            No inquiries found
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Try adjusting search filters or fill the form on the
                            left.
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
                          {/* Customer Name & Phone */}
                          <td className="px-3 py-0.5">
                            <div className="flex items-center justify-between gap-1.5 group/cust">
                              <div>
                                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>{item.name}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {item.phone}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenEditCustomer(item)}
                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors shrink-0 cursor-pointer"
                                title="Edit Details"
                              >
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* Tire Sizes */}
                          <td className="px-3 py-0.5 font-mono text-[11px] whitespace-nowrap">
                            {item.tireSize1 ? (
                              <div className="font-semibold text-slate-700">
                                {item.tireSize1}
                              </div>
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
                          <td className="px-3 py-0.5 font-mono text-[11px] whitespace-nowrap">
                            {item.vehiclePlateNumber ? (
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold border border-slate-200">
                                {item.vehiclePlateNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-0.5 text-center whitespace-nowrap">
                            {(() => {
                              const st = item.status || "Pending";
                              const stLower = String(st).toLowerCase();
                              const badgeStyle =
                                stLower === "pending"
                                  ? "bg-amber-50 text-amber-700 border-amber-200/80"
                                  : stLower === "contacted"
                                    ? "bg-blue-50 text-blue-700 border-blue-200/80"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200/80";
                              const dotStyle =
                                stLower === "pending"
                                  ? "bg-amber-500"
                                  : stLower === "contacted"
                                    ? "bg-blue-500"
                                    : "bg-emerald-500";
                              return (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold shadow-2xs ${badgeStyle}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${dotStyle}`}
                                  />
                                  {st}
                                </span>
                              );
                            })()}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-0.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenViewingInquiry(item)}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                title="View Details"
                              >
                                <EyeIcon className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleEdit(item)}
                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title="Auto-Fill Details"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleNewInquiryForCustomer(item)}
                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title="New Inquiry for this Customer"
                              >
                                <PlusIcon className="w-4 h-4" />
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
            {filteredInquiries.length > 0 && (
              <div className="shrink-0 mt-1">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  pageSize={pageSize}
                  setPageSize={setPageSize}
                  pageSizeOptions={[15, 25, 50, 100]}
                />
              </div>
            )}
          </div>
        </div>

        {/* View Details Inner Modal with smooth entrance animation */}
        {viewingInquiry && (
          <div
            className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
              viewingInquiryAnimated && !viewingInquiryClosing
                ? "opacity-100"
                : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Backdrop click */}
            <div
              className="absolute inset-0"
              onClick={handleCloseViewingInquiry}
            />

            <div
              className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden z-10 transition-all duration-300 ease-out transform ${
                viewingInquiryAnimated && !viewingInquiryClosing
                  ? "scale-100 opacity-100 translate-y-0"
                  : "scale-95 opacity-0 translate-y-4"
              }`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-base font-bold text-slate-900">
                    Inquiry Detail
                  </h4>
                  <span className="px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-md">
                    {viewingInquiry.id}
                  </span>
                  {viewingInquiry.crmCustomerId && (
                    <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-md">
                      Entity #{viewingInquiry.crmCustomerId}
                    </span>
                  )}
                  {viewingInquiry.status && (
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                        String(viewingInquiry.status).toLowerCase() ===
                        "pending"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : String(viewingInquiry.status).toLowerCase() ===
                              "contacted"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {viewingInquiry.status}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleCloseViewingInquiry}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
                {/* Customer Information Block */}
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Customer Information
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Name
                      </span>
                      <span className="font-bold text-slate-900 text-sm">
                        {viewingInquiry.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Phone Number
                      </span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {viewingInquiry.phone}
                      </span>
                    </div>
                    {viewingInquiry.email && (
                      <div>
                        <span className="text-slate-500 text-[11px] block">
                          Email
                        </span>
                        <span className="text-slate-700 font-medium">
                          {viewingInquiry.email}
                        </span>
                      </div>
                    )}
                    {viewingInquiry.crmCustomerId && (
                      <div>
                        <span className="text-slate-500 text-[11px] block">
                          Entity ID
                        </span>
                        <span className="font-mono font-bold text-slate-800 bg-slate-200/70 px-1.5 py-0.5 rounded text-xs inline-block">
                          #{viewingInquiry.crmCustomerId}
                        </span>
                      </div>
                    )}
                    {viewingInquiry.city && (
                      <div>
                        <span className="text-slate-500 text-[11px] block">
                          City
                        </span>
                        <span className="text-slate-700 font-medium">
                          {viewingInquiry.city}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tire Specs Block */}
                <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200/60 space-y-2.5">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Tire Specifications
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Tire Size 1 (Front)
                      </span>
                      {viewingInquiry.tireSize1 ? (
                        <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-emerald-200/80 inline-block mt-0.5 shadow-2xs">
                          {viewingInquiry.tireSize1}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Tire Size 2 (Rear)
                      </span>
                      {viewingInquiry.tireSize2 ? (
                        <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-emerald-200/80 inline-block mt-0.5 shadow-2xs">
                          {viewingInquiry.tireSize2}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Vehicle Details Block */}
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Vehicle Details
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Make
                      </span>
                      <span className="font-semibold text-slate-800">
                        {viewingInquiry.make || null}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Model
                      </span>
                      <span className="font-semibold text-slate-800">
                        {viewingInquiry.model || null}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Year
                      </span>
                      <span className="font-semibold text-slate-800">
                        {viewingInquiry.year || null}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        Plate
                      </span>
                      {viewingInquiry.vehiclePlateNumber ? (
                        <span className="font-mono font-bold text-slate-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-300/80 inline-block text-[11px]">
                          {viewingInquiry.vehiclePlateNumber}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Inquiry Note */}
                {viewingInquiry.note && (
                  <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/80 space-y-1">
                    <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                      Inquiry Note
                    </span>
                    <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-wrap">
                      {viewingInquiry.note}
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end px-6 py-3.5 bg-slate-50/80 border-t border-slate-100">
                <button
                  onClick={handleCloseViewingInquiry}
                  className="px-5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Customer Details Modal */}
        {(editingCustomerInquiry || editingCustomerClosing) && (
          <div
            className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
              editingCustomerAnimated && !editingCustomerClosing
                ? "opacity-100"
                : "opacity-0 pointer-events-none"
            }`}
          >
            <div
              className="absolute inset-0"
              onClick={handleCloseEditCustomer}
            />

            <div
              className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden z-10 p-6 space-y-4 transition-all duration-300 ease-out transform ${
                editingCustomerAnimated && !editingCustomerClosing
                  ? "scale-100 opacity-100 translate-y-0"
                  : "scale-95 opacity-0 translate-y-4"
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-base font-bold text-slate-900">
                  Edit Details
                </h4>
                <button
                  type="button"
                  onClick={handleCloseEditCustomer}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      placeholder="e.g. Ahmed Al-Mansoor"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <PhoneIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <EnvelopeIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="email"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={custCity}
                    onChange={(e) => setCustCity(e.target.value)}
                    placeholder="e.g. Riyadh, Jeddah"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseEditCustomer}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomerDetails}
                  disabled={savingCustomer}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingCustomer ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
