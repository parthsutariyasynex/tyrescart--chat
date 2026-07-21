import type { Metadata } from "next";

// Route-scoped metadata — applies ONLY to /tyre_guide/chat and overrides the
// root title ("TyresCart POS — Point of Sale") for this page only.
export const metadata: Metadata = {
  title: "Tyre Chat Shortcuts",
};

export default function TyreChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
