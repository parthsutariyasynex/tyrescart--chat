"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingBagIcon,
  TruckIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  CircleStackIcon,
} from "@heroicons/react/24/outline";
import Header from "@/components/Header";
import HeaderActions from "@/components/HeaderActions";
import QuotationModal from "@/components/QuotationModal";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { countCachedSupplierProducts } from "@/services/cache";

import ChatModal from "@/components/ChatModal";

export default function DashboardPage() {
  const isOnline = useOnlineStatus();
  const [supplierCount, setSupplierCount] = useState<number | null>(null);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState<boolean>(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState<boolean>(false);

  useEffect(() => {
    countCachedSupplierProducts().then(setSupplierCount).catch(() => setSupplierCount(0));
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">

      {/* 2. MAIN DASHBOARD CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        {/* TOP HEADER BAR */}
        <Header
          title="Dashboard"
          bookInquiry={false}
          syncTitle="Sync Dashboard"
          syncTone="orange"
          isOnline={isOnline}
          actions={
            <HeaderActions
              onCreateQuote={() => setIsQuotationModalOpen(true)}
              onChat={() => setIsChatModalOpen(true)}
            />
          }
        />

        {/* DASHBOARD BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Catalog Products</p>
                <h3 className="text-xl font-bold text-gray-900">7,673+</h3>
                <span className="text-[11px] text-emerald-600 font-medium mt-1 inline-block">Storefront Ready</span>
              </div>
              <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-xl flex items-center justify-center">
                <ShoppingBagIcon className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Supplier Products</p>
                <h3 className="text-xl font-bold text-gray-900">
                  {supplierCount !== null ? supplierCount.toLocaleString() : "..."}
                </h3>
                <span className="text-[11px] text-blue-600 font-medium mt-1 inline-block">IndexedDB Cached</span>
              </div>
              <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                <TruckIcon className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">TyresChat Assistant</p>
                <h3 className="text-xl font-bold text-gray-900">Active</h3>
                <span className="text-[11px] text-purple-600 font-medium mt-1 inline-block">AI Guidance</span>
              </div>
              <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-xl flex items-center justify-center">
                <ChatBubbleLeftRightIcon className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Sync Status</p>
                <h3 className="text-xl font-bold text-emerald-600">Active</h3>
                <span className="text-[11px] text-gray-500 font-medium mt-1 inline-block">Auto Background Sync</span>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center">
                <CircleStackIcon className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Link
              href="/products"
              className="group bg-white p-6 rounded-2xl border border-gray-100 shadow-xs hover:shadow-md hover:border-orange-200 transition-all flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <ShoppingBagIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                    Product Catalog
                  </h4>
                  <p className="text-xs text-gray-500">Browse, filter, and search POS Storefront Products</p>
                </div>
              </div>
              <span className="text-xs font-medium text-orange-500 bg-orange-50 px-3 py-1.5 rounded-lg group-hover:bg-orange-100 transition-colors">
                View Products &rarr;
              </span>
            </Link>

            <Link
              href="/supplier-products"
              className="group bg-white p-6 rounded-2xl border border-gray-100 shadow-xs hover:shadow-md hover:border-blue-200 transition-all flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <TruckIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    Supplier Products
                  </h4>
                  <p className="text-xs text-gray-500">Full supplier feed with competitor analysis</p>
                </div>
              </div>
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg group-hover:bg-blue-100 transition-colors">
                View Supplier &rarr;
              </span>
            </Link>
          </div>

          {/* Placeholder Section for Graphs & Charts */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center justify-center text-center min-h-[320px]">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mb-4">
              <ChartBarIcon className="w-8 h-8 stroke-1.5" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Analytics & Charts Dashboard</h3>
            <p className="text-xs text-gray-500 max-w-md">
              Graphs, sales metrics, and performance charts will be displayed here in the dashboard space.
            </p>
          </div>
        </div>
      </main>

      <QuotationModal
        isOpen={isQuotationModalOpen}
        onClose={() => setIsQuotationModalOpen(false)}
      />

      <ChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
      />
    </div>
  );
}