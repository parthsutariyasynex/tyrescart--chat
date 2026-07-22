import type { Metadata } from "next";
import { Roboto_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ToastProvider";
import { SyncProvider } from "@/components/SyncProvider";
import DbInit from "@/components/DbInit";
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
        <ToastProvider>
          <SyncProvider>{children}</SyncProvider>
        </ToastProvider>
      </body>
    </html>
  );
}