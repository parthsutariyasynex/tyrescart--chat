'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  ShoppingBagIcon,
  ChatBubbleLeftRightIcon,
  TruckIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';
import SidebarSyncButton from '@/components/SidebarSyncButton';
import { features, NAV_FEATURE_MAP } from '@/config/features';

export interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  // { name: 'Dashboard', icon: HomeIcon, href: '/dashboard' },
  { name: 'Supplier', icon: TruckIcon, href: '/supplier-products' },
  { name: 'TC', icon: BuildingStorefrontIcon, href: '/tc-products' },
  { name: 'Products', icon: ShoppingBagIcon, href: '/products' },
  { name: 'Chat', icon: ChatBubbleLeftRightIcon, href: '/tyreschat' },
];

export interface SidebarProps {
  /** Optional accent override. Normally derived from the route — see
   *  {@link ORANGE_ROUTES}. */
  theme?: 'emerald' | 'orange';
}

/** Routes that used to pass `theme="orange"` when each page rendered its own
 *  Sidebar. The Sidebar now renders once in the root layout, so it can't be
 *  given a per-page prop — the same mapping is derived from the path instead,
 *  which keeps every route's accent exactly as it was. */
const ORANGE_ROUTES = ['/dashboard', '/products'];

export default function Sidebar({ theme }: SidebarProps = {}) {
  const pathname = usePathname();

  const resolvedTheme =
    theme ?? (ORANGE_ROUTES.some((r) => pathname?.startsWith(r)) ? 'orange' : 'emerald');

  const activeStyles = resolvedTheme === 'orange'
    ? { text: 'text-orange-500 bg-orange-50 font-semibold', bar: 'bg-orange-500' }
    : { text: 'text-emerald-600 bg-emerald-50 font-semibold', bar: 'bg-emerald-600' };

  return (
    <aside className="w-[68px] flex-none bg-white border-r border-slate-200 flex flex-col items-center justify-between py-3 z-30 shadow-xs">
      <div className="flex flex-col items-center gap-6 w-full">
        {/* Logo Badge */}
        <Link
          href="/supplier-products"
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

        {/* Centralized Navigation Items */}
        <nav className="flex flex-col gap-2 w-full px-2">
          {NAV_ITEMS.filter((item) => {
            const flagKey = NAV_FEATURE_MAP[item.href];
            return !flagKey || features[flagKey];
          }).map((item) => {
            const Icon = item.icon;
            // Active route comes from the pathname only — the Sidebar renders once
            // in the root layout and has no per-page props to read.
            const isActive =
              pathname === item.href || (item.href === '/products' && pathname?.startsWith('/products'));

            return (
              <Link
                key={item.name}
                href={item.href}
                title={item.name}
                className={`w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none ${
                  isActive
                    ? activeStyles.text
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {isActive && (
                  <span className={`absolute top-0 left-1/2 -translate-x-1/2 h-1 w-6 ${activeStyles.bar} rounded-b-full`} />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-1 tracking-tight">{item.name}</span>
              </Link>
            );
          })}

          {/* Shared Sidebar Sync Button */}
          <SidebarSyncButton />
        </nav>
      </div>

      {/* User Profile Avatar at Bottom Left */}
      <div className="flex flex-col items-center gap-2 pt-2 border-t border-slate-100 w-full">
        <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs shadow-inner">
          KL
        </div>
        <span className="text-[9px] text-slate-500 font-medium truncate max-w-[60px]">Klever</span>
      </div>
    </aside>
  );
}
