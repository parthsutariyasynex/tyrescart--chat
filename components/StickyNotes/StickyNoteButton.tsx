"use client";

/**
 * Header trigger for the sticky notes feature.
 *
 * Labeled "Sticky Note" button (matches the styling of the other labeled
 * header buttons — `components/HeaderBookInquiry.tsx` — rather than being a
 * bare icon like the Fullscreen toggle, so it reads as a named action, not
 * just a stray pencil glyph): creates a new floating note — it opens
 * immediately since a just-created note is never in `closedIds` (see
 * `StickyNotesProvider`).
 *
 * Caret + count badge, shown once at least one note has actually been
 * SAVED with real content: opens "My Notes", a list of every saved note
 * (open or closed) — a freshly created, never-edited placeholder (title
 * still "New note", content still empty) does NOT appear here, since it has
 * nothing to find/edit yet and would otherwise bury real notes under a pile
 * of blanks from repeated Add-Sticky-Note clicks. Notes load closed by
 * default (nothing floats on a fresh page load), so this list is the normal
 * way to get to a specific note — clicking one opens (or just brings to
 * front, if already open) exactly that note, rather than every note
 * reappearing at once.
 *
 * Dropdown styling matches `components/TableDensityMenu.tsx` (the existing
 * small button + absolutely-positioned panel pattern in this app), including
 * its click-outside-to-close behavior.
 */

import { useEffect, useRef, useState } from "react";
import { PencilSquareIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import {
  useStickyNotes,
  DEFAULT_NOTE_TITLE,
} from "./StickyNotesProvider";
import type { KleverStickyNote } from "@/services/types";

/** True for a note that is still exactly what `addNote` created — no custom
 *  title, no content — i.e. nothing the user has actually written yet. */
function isUnsavedPlaceholder(note: KleverStickyNote): boolean {
  const titleIsDefault = !note.title || note.title === DEFAULT_NOTE_TITLE;
  const contentIsEmpty = !note.content || note.content.trim() === "";
  return titleIsDefault && contentIsEmpty;
}

export default function StickyNoteButton() {
  const { notes, closedIds, addNote, reopenNote } = useStickyNotes();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const savedNotes = notes.filter((n) => !isUnsavedPlaceholder(n));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => void addNote()}
        title="Add Sticky Note"
        aria-label="Add Sticky Note"
        className="h-9 flex items-center gap-1.5 px-2.5 2xl:px-3.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-xs hover:shadow-violet-600/20 transition-all active:scale-[0.98] shrink-0 cursor-pointer"
      >
        <PencilSquareIcon className="w-4 h-4 shrink-0" />
        <span className="whitespace-nowrap">Sticky Note</span>
      </button>

      {/* Always mounted — same fixed footprint whether or not there is
          anything to show — so the header never reflows the moment a note
          goes from unsaved to saved (or the last saved note is deleted).
          Only the badge number and the enabled state change inside it. */}
      <button
        type="button"
        onClick={() => savedNotes.length > 0 && setIsOpen((prev) => !prev)}
        disabled={savedNotes.length === 0}
        title="My Notes"
        aria-label="My Notes"
        className={`relative h-9 w-6 flex items-center justify-center rounded-lg border transition-colors ${
          savedNotes.length > 0
            ? "border-slate-200 bg-white text-slate-500 hover:border-violet-500 hover:text-violet-600 cursor-pointer"
            : "border-slate-100 bg-white text-slate-200 cursor-default"
        }`}
      >
        <ChevronDownIcon className="w-3.5 h-3.5" />
        {savedNotes.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
            {savedNotes.length}
          </span>
        )}
      </button>

      {isOpen && savedNotes.length > 0 && (
        <div className="absolute right-0 top-full mt-1.5 w-60 max-h-80 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-40">
          <div className="px-3.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            My Notes
          </div>
          {savedNotes.map((n) => {
            const isOpenNote = !closedIds.has(n.note_id);
            return (
              <button
                key={n.note_id}
                type="button"
                onClick={() => {
                  reopenNote(n.note_id);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="truncate">{n.title || "Untitled"}</span>
                <span
                  className={`shrink-0 font-bold ${isOpenNote ? "text-slate-400" : "text-emerald-600"}`}
                >
                  {isOpenNote ? "Focus" : "Open"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
