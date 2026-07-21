"use client";

import React from "react";
import Image from "next/image";

interface SyncingOverlayProps {
  isSyncing: boolean;
  syncStep?: string;
}

export default function SyncingOverlay({
  isSyncing,
  syncStep = "TyresChat",
}: SyncingOverlayProps) {
  if (!isSyncing) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-300">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center border border-gray-100/80 animate-in fade-in zoom-in-95 duration-200">
        {/* Official TyresCart Logo Badge */}
        <div className="w-24 h-24 mb-4 relative flex items-center justify-center p-3 rounded-2xl bg-white border border-gray-100 shadow-md">
          <Image
            src="/favicon-color.png"
            alt="TyresCart"
            width={80}
            height={80}
            priority
            className="w-16 h-16 object-contain animate-pulse"
          />
        </div>

        {/* Title */}
        <h2 className="text-base font-bold text-gray-900 mb-1">
          Point Of Sales <span className="text-orange-500">is syncing...</span>
        </h2>

        {/* Subtitle */}
        <p className="text-xs text-gray-500 mb-6">
          Syncing: <span className="font-semibold text-gray-700">{syncStep}</span>
        </p>

        {/* Footer */}
        <p className="text-[10px] text-gray-400 mt-2 font-medium">
          Powered by TyresCart POS
        </p>
      </div>
    </div>
  );
}
