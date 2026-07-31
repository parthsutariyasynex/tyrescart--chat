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

const STORAGE_KEY = "tc_book_inquiries_v1";

/**
 * Local mirror of enquiries submitted from this browser.
 *
 * Starts EMPTY. It previously shipped three invented customers ("Ahmed
 * Al-Mansoor", "Fatima Al-Zahra", "Mohammed Hassan") which were written into
 * localStorage on first load and were indistinguishable from real enquiries.
 *
 * This is a convenience list only — the CRM is the system of record, and
 * `createCrmBooking` is what actually files an enquiry. Rows here carry the
 * booking id the API returned, so the two can be reconciled.
 */
const SEED_INQUIRIES: Inquiry[] = [];

export function getInquiries(): Inquiry[] {
  if (typeof window === "undefined") return SEED_INQUIRIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_INQUIRIES));
      return SEED_INQUIRIES;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading inquiries from localStorage", err);
    return SEED_INQUIRIES;
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
