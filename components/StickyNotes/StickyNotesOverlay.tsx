"use client";

/**
 * Floating layer for every sticky note.
 *
 * `fixed inset-0 pointer-events-none` spans the viewport without taking part
 * in document flow — it cannot shift any existing layout — and lets clicks
 * pass through everywhere EXCEPT the notes themselves (each card re-enables
 * `pointer-events-auto`). Mounted once in `app/(app)/layout.tsx`, above the
 * route boundary, so it — and any note mid-drag — survives page navigation.
 */

import { useStickyNotes } from "./StickyNotesProvider";
import StickyNoteCard from "./StickyNoteCard";

export default function StickyNotesOverlay() {
  const { notes, loading, closedIds } = useStickyNotes();

  if (loading || notes.length === 0) return null;

  const visible = notes.filter((note) => !closedIds.has(note.note_id));
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {visible.map((note) => (
        <StickyNoteCard key={note.note_id} note={note} />
      ))}
    </div>
  );
}
