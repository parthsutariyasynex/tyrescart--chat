"use client";

/**
 * Shared state for the floating Sticky Note overlay.
 *
 * Mounted ONCE in `app/(app)/layout.tsx` (same reasoning as `<Sidebar />`
 * there) so the notes and their positions survive client-side navigation
 * between pages instead of remounting — a note being dragged, or mid-edit,
 * must not reset when the route changes.
 *
 * The Klever Sticky Note API is the ONLY store — there is no IndexedDB /
 * localStorage fallback, so a failed request is surfaced via toast rather
 * than silently kept in local state only.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/components/ToastProvider";
import {
  fetchKleverStickyNotesGraphQL,
  createKleverStickyNoteGraphQL,
  updateKleverStickyNoteGraphQL,
  deleteKleverStickyNoteGraphQL,
} from "@/services/graphql";
import type { KleverStickyNote, KleverStickyNoteInput } from "@/services/types";

export const DEFAULT_NOTE_WIDTH = 260;
export const DEFAULT_NOTE_HEIGHT = 220;
/** The title `addNote` gives a brand-new note. Shared with
 *  `StickyNoteButton`'s "My Notes" list so it can tell an untouched
 *  placeholder apart from a note the user actually wrote something into. */
export const DEFAULT_NOTE_TITLE = "New note";
export const NOTE_COLORS = [
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
  "orange",
  "grey",
] as const;

interface StickyNotesContextValue {
  notes: KleverStickyNote[];
  loading: boolean;
  /** Which note currently renders above the others. Session-only — not a
   *  persisted field, just drag/click stacking order. */
  frontId: number | null;
  bringToFront: (note_id: number) => void;
  addNote: () => Promise<void>;
  /** Edit save — title/content/color. Persists straight to the Klever
   *  Sticky Note API (the only store; never IndexedDB/localStorage), same
   *  as every other field. `silent` skips the "Note saved." toast — used by
   *  the 5-second auto-sync in `StickyNoteCard` so a continuously-typing
   *  note doesn't spam a toast every cycle; the manual Sync/Save controls
   *  still call this without `silent` for their explicit confirmation. */
  saveNote: (
    note_id: number,
    input: KleverStickyNoteInput,
    opts?: { silent?: boolean },
  ) => Promise<void>;
  /** Fire-and-forget position/size persistence, called on drag/resize end. */
  moveNote: (note_id: number, pos_x: number, pos_y: number) => void;
  resizeNote: (note_id: number, width: number, height: number) => void;
  toggleCollapsed: (note_id: number) => void;
  removeNote: (note_id: number) => Promise<void>;
  /** Which notes are NOT currently shown as a floating card. Every note
   *  fetched on load starts in here (see the mount effect below) — with many
   *  notes, having all of them pop up as floating cards on every refresh was
   *  exactly the clutter problem reported, so the default is closed and the
   *  user opens the ones they want from `StickyNoteButton`'s "My Notes"
   *  list. Session-only, not persisted (touches no API field): a fresh
   *  reload/login always starts everything closed again, same as any other
   *  load. A brand-new note from `addNote` is never added here, so it opens
   *  immediately. */
  closedIds: Set<number>;
  closeNote: (note_id: number) => void;
  /** Opens one specific note (removes it from `closedIds` if present) and
   *  brings it to front. Safe to call on a note that is already open — it
   *  just brings it to front, so the "My Notes" list can use one action for
   *  both "open this" and "find this among several open notes". */
  reopenNote: (note_id: number) => void;
}

const StickyNotesContext = createContext<StickyNotesContextValue | null>(null);

export function useStickyNotes() {
  const ctx = useContext(StickyNotesContext);
  if (!ctx)
    throw new Error("useStickyNotes must be used inside StickyNotesProvider");
  return ctx;
}

export function StickyNotesProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<KleverStickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [frontId, setFrontId] = useState<number | null>(null);
  const [closedIds, setClosedIds] = useState<Set<number>>(new Set());
  const placementCount = useRef(0);

  const reload = useCallback(async () => {
    try {
      const res = await fetchKleverStickyNotesGraphQL({ pageSize: 200 });
      setNotes(res.items ?? []);
    } catch (err) {
      console.warn("Failed to load sticky notes:", err);
      toast(
        err instanceof Error ? err.message : "Failed to load sticky notes.",
        "error",
      );
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchKleverStickyNotesGraphQL({ pageSize: 200 });
        if (!cancelled) {
          const items = res.items ?? [];
          setNotes(items);
          // Everything from a fresh load starts closed — see the doc on
          // `closedIds` above. Only notes opened via `reopenNote` (from the
          // "My Notes" list) or created via `addNote` this session show up.
          setClosedIds(new Set(items.map((n) => n.note_id)));
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Failed to load sticky notes:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchNote = useCallback(
    (note_id: number, patch: Partial<KleverStickyNote>) => {
      setNotes((prev) =>
        prev.map((n) => (n.note_id === note_id ? { ...n, ...patch } : n)),
      );
    },
    [],
  );

  /** Persist a partial update. Optimistic — the caller already applied the
   *  same patch locally, so this only reconciles with the server's response
   *  and reports a failure; it does not roll back a position/size change
   *  (rare failure, and reverting mid-drag would be jarring). */
  const persist = useCallback(
    async (
      note_id: number,
      input: KleverStickyNoteInput,
      onError: string,
    ): Promise<boolean> => {
      try {
        const updated = await updateKleverStickyNoteGraphQL(note_id, input);
        patchNote(note_id, updated);
        return true;
      } catch (err) {
        toast(err instanceof Error ? err.message : onError, "error");
        return false;
      }
    },
    [patchNote, toast],
  );

  const addNote = useCallback(async () => {
    const step = placementCount.current++;
    const offset = (step % 6) * 28;
    const color = NOTE_COLORS[step % NOTE_COLORS.length];
    try {
      const created = await createKleverStickyNoteGraphQL({
        title: DEFAULT_NOTE_TITLE,
        content: "",
        color,
        pos_x: 120 + offset,
        pos_y: 100 + offset,
        width: DEFAULT_NOTE_WIDTH,
        height: DEFAULT_NOTE_HEIGHT,
        is_collapsed: false,
      });
      setNotes((prev) => [...prev, created]);
      setFrontId(created.note_id);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to create note.",
        "error",
      );
    }
  }, [toast]);

  const saveNote = useCallback(
    async (
      note_id: number,
      input: KleverStickyNoteInput,
      opts?: { silent?: boolean },
    ) => {
      patchNote(note_id, input);
      const ok = await persist(note_id, input, "Failed to save note.");
      if (ok && !opts?.silent) toast("Note saved.", "success");
    },
    [patchNote, persist, toast],
  );

  const moveNote = useCallback(
    (note_id: number, pos_x: number, pos_y: number) => {
      patchNote(note_id, { pos_x, pos_y });
      void persist(note_id, { pos_x, pos_y }, "Failed to save note position.");
    },
    [patchNote, persist],
  );

  const resizeNote = useCallback(
    (note_id: number, width: number, height: number) => {
      patchNote(note_id, { width, height });
      void persist(note_id, { width, height }, "Failed to save note size.");
    },
    [patchNote, persist],
  );

  const toggleCollapsed = useCallback(
    (note_id: number) => {
      const note = notes.find((n) => n.note_id === note_id);
      if (!note) return;
      const next = !note.is_collapsed;
      patchNote(note_id, { is_collapsed: next });
      void persist(
        note_id,
        { is_collapsed: next },
        "Failed to save note state.",
      );
    },
    [notes, patchNote, persist],
  );

  const removeNote = useCallback(
    async (note_id: number) => {
      const snapshot = notes;
      setNotes((prev) => prev.filter((n) => n.note_id !== note_id));
      try {
        await deleteKleverStickyNoteGraphQL(note_id);
      } catch (err) {
        toast(
          err instanceof Error ? err.message : "Failed to delete note.",
          "error",
        );
        setNotes(snapshot);
        // Reconcile with the server rather than trusting the restored
        // snapshot, in case the delete partially succeeded upstream.
        void reload();
      }
    },
    [notes, reload, toast],
  );

  const bringToFront = useCallback((note_id: number) => {
    setFrontId(note_id);
  }, []);

  const closeNote = useCallback((note_id: number) => {
    setClosedIds((prev) => new Set(prev).add(note_id));
  }, []);

  const reopenNote = useCallback((note_id: number) => {
    setClosedIds((prev) => {
      if (!prev.has(note_id)) return prev;
      const next = new Set(prev);
      next.delete(note_id);
      return next;
    });
    bringToFront(note_id);
  }, [bringToFront]);

  return (
    <StickyNotesContext.Provider
      value={{
        notes,
        loading,
        frontId,
        bringToFront,
        addNote,
        saveNote,
        moveNote,
        resizeNote,
        toggleCollapsed,
        removeNote,
        closedIds,
        closeNote,
        reopenNote,
      }}
    >
      {children}
    </StickyNotesContext.Provider>
  );
}
