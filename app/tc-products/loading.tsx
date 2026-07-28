import { SupplierProductsPageSkeleton } from "@/components/Skeletons";

/**
 * Route-level loading UI. Reuses the supplier page's skeleton unchanged — the
 * two pages share the same shell (sidebar, header, filter bar, table card), so
 * a second near-identical skeleton would be duplication for no benefit.
 */
export default function Loading() {
  return <SupplierProductsPageSkeleton />;
}
