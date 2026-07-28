"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  ShoppingBagIcon,
  TruckIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  ArrowPathIcon,
  CircleStackIcon,
  UserGroupIcon,
  WifiIcon,
  ArrowsPointingOutIcon
} from "@heroicons/react/24/outline";
import SidebarSyncButton from "@/components/SidebarSyncButton";
import HeaderSyncButton from "@/components/HeaderSyncButton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { countCachedSupplierProducts } from "@/services/cache";

export default function DashboardPage() {
  const pathname = usePathname();
  const isOnline = useOnlineStatus();
  const [supplierCount, setSupplierCount] = useState<number | null>(null);

  useEffect(() => {
    countCachedSupplierProducts().then(setSupplierCount).catch(() => setSupplierCount(0));
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">
      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="w-[68px] flex-none bg-white border-r border-gray-200 flex flex-col items-center justify-between py-3 z-20 shadow-xs">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Badge */}
          <Link
            href="/dashboard"
            title="TyresCart POS"
            className="flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <Image
              src="/favicon-color.png"
              alt="TyresCart"
              width={40}
              height={40}
              priority
              className="w-10 h-10 object-contain rounded-xl"
            />
          </Link>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-2 w-full px-2">
            {[
              { name: "Dashboard", icon: HomeIcon, href: "/dashboard" },
              { name: "Products", icon: ShoppingBagIcon, href: "/products" },
              { name: "Chat", icon: ChatBubbleLeftRightIcon, href: "/tyre_guide/chat" },
              { name: "Supplier", icon: TruckIcon, href: "/supplier-products" },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={item.name}
                  className={`w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none ${
                    isActive
                      ? "text-orange-500 bg-orange-50 font-semibold"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />
                  )}
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] mt-1 tracking-tight">{item.name}</span>
                </Link>
              );
            })}

            {/* Sidebar Sync */}
            <SidebarSyncButton />
          </nav>
        </div>

        {/* User Profile Avatar at Bottom Left */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-gray-100 w-full">
          <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs shadow-inner">
            KL
          </div>
          <span className="text-[9px] text-gray-500 font-medium truncate max-w-[60px]">Klever</span>
        </div>
      </aside>

      {/* 2. MAIN DASHBOARD CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        {/* TOP HEADER BAR */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 shadow-xs">
          <div>
            <h1 className="text-lg font-bold text-gray-800 tracking-tight">Dashboard Overview</h1>
            <p className="text-xs text-gray-500">TyresCart POS Analytics & Control Panel</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else if (document.exitFullscreen) {
                  document.exitFullscreen();
                }
              }}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Fullscreen"
            >
              <ArrowsPointingOutIcon className="w-5 h-5" />
            </button>

            <HeaderSyncButton title="Sync Dashboard" />

            {isOnline ? (
              <div className="h-7 w-[95px] inline-flex items-center justify-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 rounded-full text-xs font-semibold border border-emerald-200 shadow-2xs whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <WifiIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online</span>
              </div>
            ) : (
              <div className="h-7 w-[95px] inline-flex items-center justify-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 rounded-full text-xs font-semibold border border-rose-200 shadow-2xs whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <WifiIcon className="w-3.5 h-3.5 text-rose-600" />
                <span>Offline</span>
              </div>
            )}
          </div>
        </header>

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
    </div>
  );
}