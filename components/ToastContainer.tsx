"use client";

import React from "react";

export interface ToastItem {
  id: number;
  msg: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
}

export default function ToastContainer({ toasts }: ToastContainerProps) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-bold flex items-center gap-2 pointer-events-auto border border-slate-700 transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
