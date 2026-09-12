"use client";

/**
 * One floating, draggable sticky note.
 *
 * Drag (header) and resize (corner handle) both use the Pointer Events API
 * (`onPointerDown`/`onPointerMove`/`onPointerUp` + `setPointerCapture`) so
 * mouse and touch share the exact same code path — there is no separate
 * touch handler.
 *
 * Position/size are NOT duplicated into local state: while a drag/resize is
 * in flight, a local override (`dragPos`/`dragSize`) is rendered instead of
 * the note's persisted `pos_x`/`pos_y`/`width`/`height`; on pointer-up the
 * override is handed to `moveNote`/`resizeNote` (which updates the shared
 * note through the API) and cleared, so the next render reads the same
 * value back from the note itself — no drift, no flicker.
 *
 * Title/content/color are different: they only persist when the user
 * explicitly clicks Save (footer) or Sync (header) — no background timer,
 * by design. Both go straight to the same Klever Sticky Note API — never
 * IndexedDB or any browser storage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  MinusIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  CheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useStickyNotes, NOTE_COLORS } from "./StickyNotesProvider";
import type { KleverStickyNote } from "@/services/types";

/**
 * Solid (no `/opacity`) header + a visibly-tinted card body per color.
 * `orange` previously used `bg-orange-50` / `bg-orange-200/90` — Tailwind's
 * orange-50 reads as almost pure white and the `/90` alpha made the header
 * look washed out/see-through on top of it, unlike the other colors where
 * the tint is more obviously present at the same shade numbers. Bumped one
 * step darker (100/300) and dropped the opacity so it renders as a clearly
 * solid orange, and dropped the same stray opacity from every other color
 * for a consistent, fully-opaque header across the board.
 */
const COLOR_STYLES: Record<
  string,
  { bg: string; header: string; ring: string }
> = {
  yellow: {
    bg: "bg-yellow-50",
    header: "bg-yellow-200",
    ring: "ring-yellow-500",
  },
  blue: { bg: "bg-blue-50", header: "bg-blue-200", ring: "ring-blue-500" },
  green: {
    bg: "bg-emerald-50",
    header: "bg-emerald-200",
    ring: "ring-emerald-500",
  },
  pink: { bg: "bg-pink-50", header: "bg-pink-200", ring: "ring-pink-500" },
  purple: {
    bg: "bg-purple-50",
    header: "bg-purple-200",
    ring: "ring-purple-500",
  },
  orange: {
    bg: "bg-orange-100",
    header: "bg-orange-300",
    ring: "ring-orange-500",
  },
  grey: {
    bg: "bg-slate-100",
    header: "bg-slate-300",
    ring: "ring-slate-500",
  },
};
const FALLBACK_COLOR = "yellow";

const MIN_WIDTH = 200;
const MIN_HEIGHT = 160;
const COLLAPSED_HEIGHT = 40;
const EDGE_MARGIN = 60; // keep at least this much of the note reachable on-screen
const MIN_SPIN_MS = 800; // floor so the Sync spinner is clearly visible on fast responses

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function StickyNoteCard({ note }: { note: KleverStickyNote }) {
  const {
    moveNote,
    resizeNote,
    toggleCollapsed,
    saveNote,
    removeNote,
    bringToFront,
    frontId,
    closeNote,
  } = useStickyNotes();

  const color =
    note.color && COLOR_STYLES[note.color] ? note.color : FALLBACK_COLOR;
  const styles = COLOR_STYLES[color];

  const [title, setTitleState] = useState(note.title ?? "");
  const [content, setContentState] = useState(note.content ?? "");
  const [editColor, setEditColorState] = useState(color);

  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const editColorRef = useRef(editColor);
  const syncingRef = useRef(false);

  const setTitle = useCallback((val: string) => {
    titleRef.current = val;
    setTitleState(val);
  }, []);

  const setContent = useCallback((val: string) => {
    contentRef.current = val;
    setContentState(val);
  }, []);

  const setEditColor = useCallback((val: string) => {
    editColorRef.current = val;
    setEditColorState(val);
  }, []);

  const noteTitle = note.title ?? "";
  const noteContent = note.content ?? "";

  const dirty =
    title.trim() !== noteTitle.trim() ||
    content.trim() !== noteContent.trim() ||
    editColor !== color;

  const lastNoteIdRef = useRef(note.note_id);

  // Re-sync the edit buffer when a note mounts or when the backend updates
  // the record (unless the user has unsaved typing in progress).
  useEffect(() => {
    const isNewNote = lastNoteIdRef.current !== note.note_id;
    if (isNewNote || !dirty) {
      lastNoteIdRef.current = note.note_id;
      titleRef.current = noteTitle;
      contentRef.current = noteContent;
      editColorRef.current = color;
      setTitleState(noteTitle);
      setContentState(noteContent);
      setEditColorState(color);
    }
  }, [note.note_id, noteTitle, noteContent, color, dirty]);

  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await Promise.all([
        saveNote(note.note_id, {
          title: titleRef.current,
          content: contentRef.current,
          color: editColorRef.current,
          pos_x: note.pos_x ?? undefined,
          pos_y: note.pos_y ?? undefined,
          width: note.width ?? undefined,
          height: note.height ?? undefined,
          is_collapsed: note.is_collapsed ?? undefined,
        }),
        new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS)),
      ]);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, [
    note.note_id,
    note.pos_x,
    note.pos_y,
    note.width,
    note.height,
    note.is_collapsed,
    saveNote,
  ]);

  // Auto-sync unsaved changes every 5 seconds via existing API
  useEffect(() => {
    if (!dirty || syncing) return;

    const timer = setInterval(() => {
      void handleSync();
    }, 5000);

    return () => clearInterval(timer);
  }, [dirty, syncing, handleSync]);

  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragSize, setDragSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const dragState = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeState = useRef<{
    w: number;
    h: number;
    startX: number;
    startY: number;
  } | null>(null);
  // Mirrors the latest dragPos/dragSize outside React state so pointer-up can
  // read the final value and call moveNote/resizeNote as a plain function
  // call — calling them from inside a setState updater (as this used to)
  // updates StickyNotesProvider while React is still processing this
  // component's own state update, which React warns about and does not
  // guarantee applies correctly.
  const lastDragPos = useRef<{ x: number; y: number } | null>(null);
  const lastDragSize = useRef<{ w: number; h: number } | null>(null);

  const baseX = note.pos_x ?? 80;
  const baseY = note.pos_y ?? 80;
  const baseW = note.width ?? 260;
  const baseH = note.height ?? 220;

  const x = dragPos?.x ?? baseX;
  const y = dragPos?.y ?? baseY;
  const w = dragSize?.w ?? baseW;
  const h = note.is_collapsed ? COLLAPSED_HEIGHT : (dragSize?.h ?? baseH);

  function handleHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    bringToFront(note.note_id);
    dragState.current = {
      x: baseX,
      y: baseY,
      startX: e.clientX,
      startY: e.clientY,
    };
  }

  function handleHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const { x: ox, y: oy, startX, startY } = dragState.current;
    const maxX = Math.max(0, window.innerWidth - EDGE_MARGIN);
    const maxY = Math.max(0, window.innerHeight - EDGE_MARGIN);
    const nextX = clamp(ox + (e.clientX - startX), -(w - EDGE_MARGIN), maxX);
    const nextY = clamp(oy + (e.clientY - startY), 0, maxY);
    lastDragPos.current = { x: nextX, y: nextY };
    setDragPos({ x: nextX, y: nextY });
  }

  function handleHeaderPointerUp() {
    if (!dragState.current) return;
    dragState.current = null;
    const finalPos = lastDragPos.current;
    lastDragPos.current = null;
    setDragPos(null);
    if (finalPos)
      moveNote(note.note_id, Math.round(finalPos.x), Math.round(finalPos.y));
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeState.current = {
      w: baseW,
      h: baseH,
      startX: e.clientX,
      startY: e.clientY,
    };
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeState.current) return;
    const { w: ow, h: oh, startX, startY } = resizeState.current;
    const nextW = Math.max(MIN_WIDTH, ow + (e.clientX - startX));
    const nextH = Math.max(MIN_HEIGHT, oh + (e.clientY - startY));
    lastDragSize.current = { w: nextW, h: nextH };
    setDragSize({ w: nextW, h: nextH });
  }

  function handleResizePointerUp() {
    if (!resizeState.current) return;
    resizeState.current = null;
    const finalSize = lastDragSize.current;
    lastDragSize.current = null;
    setDragSize(null);
    if (finalSize)
      resizeNote(
        note.note_id,
        Math.round(finalSize.w),
        Math.round(finalSize.h),
      );
  }

  async function handleDelete() {
    if (!window.confirm("Delete this sticky note? This cannot be undone."))
      return;
    await removeNote(note.note_id);
  }

  return (
    <div
      className={`absolute rounded-lg border border-black/10 shadow-lg flex flex-col overflow-hidden select-none pointer-events-auto ${styles.bg}`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: frontId === note.note_id ? 50 : 30,
      }}
      onPointerDownCapture={() => bringToFront(note.note_id)}
    >
      {/* Header / drag handle. The title input lives HERE (visible whether
          expanded or collapsed) rather than stopPropagation()-ing its own
          pointerdown to stay editable — that would swallow the drag gesture
          almost everywhere in the header, since the input fills nearly all
          of it. Instead its pointerdown is left to bubble up to this div's
          own handlers below, so a press-and-drag anywhere (including on the
          input) still drags the note, while a plain click still focuses the
          input and places the caret as normal (that happens as part of the
          browser's own handling of the click, not blocked by capturing
          pointer events for what happens after). The one trade-off: click-
          and-drag TEXT SELECTION inside the title no longer works (the note
          drags instead) — typing, backspace, and click-to-place-caret are
          unaffected. */}
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-grab active:cursor-grabbing touch-none ${styles.header}`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="min-w-0 flex-1 cursor-grab bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-500/70"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void handleSync()}
            disabled={syncing}
            title={
              syncing
                ? "Syncing..."
                : dirty
                ? "Sync unsaved changes"
                : "Sync note now"
            }
            aria-label="Sync note"
            className={`rounded p-1 transition-colors ${
              syncing
                ? "text-blue-600 bg-blue-100/70 cursor-wait"
                : "text-slate-700 hover:bg-black/10 cursor-pointer"
            }`}
          >
            <ArrowPathIcon
              className={`h-3.5 w-3.5 ${syncing ? "animate-spin text-blue-600 font-bold" : ""}`}
            />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleCollapsed(note.note_id)}
            title={note.is_collapsed ? "Expand" : "Minimize"}
            aria-label={note.is_collapsed ? "Expand note" : "Minimize note"}
            className="rounded p-1 text-slate-600 hover:bg-black/10 hover:text-slate-900 cursor-pointer"
          >
            {note.is_collapsed ? (
              <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
            ) : (
              <MinusIcon className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => closeNote(note.note_id)}
            title="Close (hide for now — does not delete; reopen from the Sticky Note button in the header)"
            aria-label="Close note"
            className="rounded p-1 text-slate-600 hover:bg-black/10 hover:text-slate-900 cursor-pointer"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!note.is_collapsed && (
        <>
          {/* Color picker */}
          <div className="flex items-center gap-1.5 border-b border-black/5 px-2 py-1.5">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Set color ${c}`}
                onClick={() => {
                  setEditColor(c);
                  void saveNote(note.note_id, { color: c });
                }}
                className={`h-3.5 w-3.5 rounded-full border border-black/10 cursor-pointer ${COLOR_STYLES[c].header} ${
                  editColor === c
                    ? `ring-2 ring-offset-1 ${COLOR_STYLES[c].ring}`
                    : ""
                }`}
              />
            ))}
          </div>

          {/* Content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a note…"
            className="min-h-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-500/70"
          />

          {/* Delete (destructive, confirmed) + Save */}
          <div className="flex items-center justify-between border-t border-black/5 px-2 py-1.5">
            <button
              type="button"
              onClick={handleDelete}
              title="Delete note"
              aria-label="Delete note"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-100 cursor-pointer"
            >
              <TrashIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={!dirty || syncing}
              onClick={() => void handleSync()}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                dirty && !syncing
                  ? "cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700"
                  : "cursor-not-allowed bg-black/5 text-slate-400"
              }`}
            >
              <CheckIcon className="h-3 w-3" />
              Save
            </button>
          </div>

          {/* Resize handle */}
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            title="Resize"
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
          >
            <svg viewBox="0 0 16 16" className="h-full w-full text-black/25">
              <path
                d="M14 14L2 14M14 14L14 2M14 14L7 14M14 14L14 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
