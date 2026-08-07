import { redirect } from "next/navigation";
import { getDefaultRoute } from "@/config/features";

export default function Home() {
  redirect(getDefaultRoute());
}
