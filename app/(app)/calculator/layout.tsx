import type { Metadata } from "next";

// Route-scoped metadata — overrides the root title for /calculator only.
export const metadata: Metadata = {
  title: "Tyre Price Calculator",
};

export default function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
