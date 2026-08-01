'use client';

import { useState } from 'react';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import BookInquiryModal from '@/components/BookInquiryModal';

interface HeaderBookInquiryProps {
  className?: string;
  variant?: 'emerald' | 'slate';
}

/**
 * Reusable Book Inquiry header button component for top page headers.
 */
export default function HeaderBookInquiry({
  className = '',
  variant = 'emerald',
}: HeaderBookInquiryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const baseStyle =
    variant === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-emerald-600/20'
      : 'bg-slate-800 hover:bg-slate-900 text-white shadow-xs';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`h-9 flex items-center gap-1.5 px-3.5 text-xs font-bold rounded-lg transition-all active:scale-[0.98] cursor-pointer ${baseStyle} ${className}`}
        title="Book Inquiry"
      >
        <CalendarDaysIcon className="w-4 h-4" />
        <span>Book Inquiry</span>
      </button>

      <BookInquiryModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialProduct={null}
      />
    </>
  );
}
