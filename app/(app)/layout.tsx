import Sidebar from "@/components/Sidebar";

/**
 * Chrome for every route EXCEPT /login. Split out of the root layout so a
 * standalone route (no Sidebar, full-bleed design) can sit alongside these
 * without also getting the app shell — route groups don't affect the URL,
 * only which layout wraps them.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
