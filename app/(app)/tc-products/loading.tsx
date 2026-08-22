import { SupplierProductsPageSkeleton } from "@/components/Skeletons";

/**
 * Route-level loading UI. Reuses the supplier page's CONTENT skeleton — the two
 * pages share the same content shape (header, filter bar, table card), so a
 * second near-identical skeleton would be duplication for no benefit. Neither
 * skeleton draws the sidebar: that lives in the root layout and must stay
 * visible for the whole transition.
 */
export default function Loading() {
  return <SupplierProductsPageSkeleton />;
}
