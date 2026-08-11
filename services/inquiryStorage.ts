export interface Inquiry {
  /** Local row id, generated here. The CRM's own ids are the `crm*` fields. */
  id: string;
  /** Booking entity_id returned by `createCrmBooking`. Absent = local only. */
  crmBookingId?: string | number;
  /** CRM customer entity_id returned by `createCrmBooking`, when it succeeded. */
  crmCustomerId?: string | number;
  /** Status text as the CRM reported it, e.g. "Pending". */
  crmStatus?: string | null;
  crmPriority?: string | null;
  crmEnquiryDate?: string | null;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  tireSize1?: string;
  tireSize2?: string;
  vehiclePlateNumber?: string;
  make?: string;
  model?: string;
  year?: string;
  note?: string;
  status: "Pending" | "Contacted" | "Closed";
  createdAt: string;
}

const STORAGE_KEY = "tc_book_inquiries_v2";

export function getInquiries(): Inquiry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Remove the Book Inquiry store entirely.
 *
 * Book Inquiry is backend-only: the list comes from `crmRecentBookings` and
 * `crmCustomerByPhone`, and nothing is written locally any more. Records left
 * by earlier builds are deleted rather than kept around as a stale shadow copy.
 */
export function clearInquiries(): void {
  if (typeof window === "undefined") return;
  try {
    // The current key AND the retired one. A device that ran an earlier build
    // still holds records under `tc_book_inquiries_v1`; removing only the
    // current key would leave those behind forever, since nothing reads or
    // rewrites them any more.
    for (const key of [STORAGE_KEY, "tc_book_inquiries_v1"]) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error("Error clearing inquiries from localStorage", err);
  }
}

export function saveInquiries(inquiries: Inquiry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inquiries));
  } catch (err) {
    console.error("Error saving inquiries to localStorage", err);
  }
}

export function addInquiry(data: Omit<Inquiry, "id" | "createdAt" | "status"> & { status?: Inquiry["status"] }): Inquiry {
  const list = getInquiries();
  const nextNum = list.length > 0
    ? Math.max(...list.map((i) => parseInt(i.id.replace(/\D/g, "") || "1000", 10))) + 1
    : 1001;
  const newInquiry: Inquiry = {
    ...data,
    id: `INQ-${nextNum}`,
    status: data.status || "Pending",
    createdAt: new Date().toISOString(),
  };
  const updated = [newInquiry, ...list];
  saveInquiries(updated);
  return newInquiry;
}

export function updateInquiry(id: string, data: Partial<Inquiry>): Inquiry[] {
  const list = getInquiries();
  const updated = list.map((item) => (item.id === id ? { ...item, ...data } : item));
  saveInquiries(updated);
  return updated;
}

export function deleteInquiry(id: string): Inquiry[] {
  const list = getInquiries();
  const updated = list.filter((item) => item.id !== id);
  saveInquiries(updated);
  return updated;
}
