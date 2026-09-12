import Sidebar from "@/components/Sidebar";
import { StickyNotesProvider } from "@/components/StickyNotes/StickyNotesProvider";
import StickyNotesOverlay from "@/components/StickyNotes/StickyNotesOverlay";
import { features } from "@/config/features";

/**
 * Chrome for every route EXCEPT /login. Split out of the root layout so a
 * standalone route (no Sidebar, full-bleed design) can sit alongside these
 * without also getting the app shell — route groups don't affect the URL,
 * only which layout wraps them.
 *
 * `StickyNotesProvider`/`StickyNotesOverlay` are mounted here, above the
 * route boundary, for the same reason `<Sidebar />` is: a note being dragged
 * or mid-edit must not remount when client-side navigation swaps `children`.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex min-w-0 overflow-hidden">{children}</div>
    </div>
  );

  if (!features.stickyNotes) return shell;

  return (
    <StickyNotesProvider>
      {shell}
      <StickyNotesOverlay />
    </StickyNotesProvider>
  );
}
