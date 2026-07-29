import type { Metadata } from "next";
import { Roboto_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ToastProvider";
import DbInit from "@/components/DbInit";
import ServiceWorker from "@/components/ServiceWorker";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const mono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TyresCart POS — Point of Sale",
  description:
    "TyresCart point-of-sale: browse tyre products and chat shortcuts, powered by Magento GraphQL.",
  icons: {
    icon: "/favicon-color.png",
    shortcut: "/favicon-color.png",
    apple: "/favicon-color.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${mono.variable}`}>
        <DbInit />
        <ServiceWorker />
        <ToastProvider>
          {/*
            The Sidebar lives HERE, above the route boundary, so navigation
            never destroys it. It used to be rendered inside each page, which
            meant every route change unmounted and rebuilt the chrome — the
            sidebar DOM node was replaced and, while the route's loading.tsx
            was showing, disappeared from the document entirely. That read as a
            full page reload even though navigation was already client-side
            (the JS context survives; no document request is made).

            Everything below is the per-route content area: pages render their
            own <main>, and each route's loading.tsx now paints inside this
            frame instead of replacing it.
          */}
          <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex min-w-0 overflow-hidden">{children}</div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}