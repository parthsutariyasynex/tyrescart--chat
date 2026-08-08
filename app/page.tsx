import { redirect } from "next/navigation";

export default function Home() {
  // redirect("/dashboard");
  // Kept explicit through the development merge: `getDefaultRoute()` resolves to
  // "/dashboard" while NEXT_PUBLIC_FEATURE_DASHBOARD is true, which would have
  // undone d014143 ("Hide Dashboard from sidebar navigation").
  redirect("/supplier-products");
}
