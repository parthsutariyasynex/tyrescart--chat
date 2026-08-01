'use client';

import { useState } from 'react';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import BookInquiryModal from '@/components/BookInquiryModal';

/**
 * Global Book Inquiry trigger — rendered once inside the Sidebar so the
 * button is visible on every page without each page managing its own state.
 */
export default function SidebarBookInquiry() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Book Inquiry"
        className="w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none text-emerald-600 hover:bg-emerald-50"
      >
        <CalendarDaysIcon className="w-5 h-5" />
        <span className="text-[10px] mt-1 tracking-tight font-medium">Inquiry</span>
      </button>

      <BookInquiryModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialProduct={null}
      />
    </>
  );
}
