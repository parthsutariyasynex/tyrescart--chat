# Task Log

This file is the running, task-by-task development log for this project.
Every development task gets one entry here, created before the change starts
and updated after it finishes. See `CLAUDE.md` → "Task Logging" for the rules
Claude Code follows when maintaining this file.

Never delete or overwrite a previous entry — new work gets a new Task ID,
appended at the end, in chronological order.

---

# Task #001 — Set up task-wise development logging system

Date: 2026-08-26
Status: Completed

## Requirement
Set up a permanent task-logging workflow for this project: a `TASK_LOG.md`
file in the project root that records every development task (requirement,
plan, files touched, what was implemented, testing performed, and final
status), plus rules in `CLAUDE.md` so Claude Code follows this process for
every future task automatically.

## Planned Changes
- Create `TASK_LOG.md` with this file's structure and a first entry
  documenting this setup task itself.
- Add a "Task Logging" section to `CLAUDE.md` with the rules Claude Code must
  follow before and after every development task.

## Files Affected
- `TASK_LOG.md` (new)
- `CLAUDE.md`

## Implementation
- Created `TASK_LOG.md` at the project root with a short header explaining its
  purpose and the task-entry format, followed by this entry as Task #001.
- Added a "Task Logging" section to `CLAUDE.md` (after "Known gaps") that
  directs Claude Code to create a `TASK_LOG.md` entry before starting any
  development task and update that same entry after finishing, using the
  exact task template and the numbering/no-delete/no-overwrite rules the user
  specified.

## Testing
- Verified no `TASK_LOG.md` existed previously (confirmed via `ls`), so this
  is a clean creation, not an overwrite of prior task history.
- Verified `CLAUDE.md`'s existing content and structure before appending, so
  the new section was added without altering any existing documentation.

## Issues / Notes
- No code in `app/`, `components/`, or `services/` was touched — this task is
  documentation/process only.

## Final Status
Completed

---

# Task #002 — Make the Tyres Guide modal properly responsive

Date: 2026-09-01
Status: Completed

## Requirement
The Tyres Guide modal did not lay out correctly at real screen sizes. At
~1292x684 the front/rear fitment chips overflowed their column, the
"Tyres Link" popup was wider than the column it lived in and was clipped by
the card, and the Search button was pushed out of the search bar. Make the
whole modal render properly from phone width up to large desktops.

## Planned Changes
- Chip content wraps instead of overflowing.
- Popup width follows its column instead of a fixed `w-72`/`w-80`.
- Move the inner Sizes / Matching Vehicles split from `md:` to `xl:`.
- Drop the fixed `min-h-[360px] max-h-[500px]` / `h-[580px]` boxes.
- Let the modal body scroll below `lg` where the panels stack.
- Give the vehicle table a `min-w` so its scroller engages on small screens.
- Header bar: search input on its own row on small screens.
- `Pagination`: wrap instead of overflowing.

## Files Affected
- `components/TyresGuideModal.tsx`
- `components/Pagination.tsx`

## Implementation
- **Fitment chips** (`SizeFitmentChip` + both call sites): the content row is
  now `flex-wrap … min-w-0 w-full` and the size pills got `break-words` plus a
  `text-[11px] sm:text-xs` step, so a staggered pair wraps onto a second line
  instead of spilling past the card edge. Button padding steps
  `px-3 sm:px-3.5 / py-2 sm:py-2.5`.
- **"Tyres Link" popup**: `w-72 sm:w-80` → `w-full min-w-[11rem]
  max-w-[calc(100vw-2rem)]`. The popup's offset parent is the chip, so it now
  always matches the column it lives in — it can no longer be wider than the
  scroll container that clips it. The existing above/below measuring logic is
  untouched.
- **Make-models popup**: widths capped for the narrow `xl` column
  (`w-[min(18rem,calc(100vw-2rem))] xl:w-[13.5rem] 2xl:w-72`, single-model
  `w-44 sm:w-56 xl:w-[11rem] 2xl:w-56`). The `idx % 3` left/centre/right
  alignment and the `grid-cols-3` logo grid were deliberately left alone —
  they are coupled, so changing the column count would misplace the arrow.
- **Inner split** moved from `md:grid-cols-2` to `xl:grid-cols-2` (and the
  Matching Vehicles column's `md:pl-4 / md:border-l / md:pt-0` to `xl:`). The
  left panel is only 40 % of the modal from `lg` up, so the old `md` split
  produced two ~190 px columns — the root cause of the chip/popup overflow.
- **Fluid heights**: the Matching Vehicles column lost `min-h-[360px]
  max-h-[500px]` (now `min-h-[220px] sm:min-h-[280px] xl:min-h-0`), and the
  "no fitments" empty state lost `h-[580px]` (now `flex-1 min-h-[280px]`).
- **Stacked layout below `lg`**: modal body is `overflow-y-auto
  lg:overflow-hidden`, the Selected Size card is `min-h-[320px] lg:min-h-0`
  and the table panel `min-h-[340px] lg:min-h-0`, so the stacked panels get a
  real height and the body scrolls instead of crushing them. Sheet height
  `h-[92vh]` → `h-[92dvh]` so mobile browser chrome doesn't eat the footer.
- **Search bar**: the tag pills + input now live in their own
  `flex-1 min-w-0 overflow-x-auto` inner div, with Clear and Search OUTSIDE
  it. Previously the whole row was the scroller, so once a Front tag was
  committed the Search button scrolled out of the visible card. The
  autocomplete dropdown was kept outside the new scroller (it is absolutely
  positioned against the card and would otherwise be clipped).
- **Vehicle table**: `min-w-[600px] lg:min-w-0` — below `lg` the existing
  `overflow-x-auto` wrapper scrolls instead of squeezing six columns; at `lg`+
  the table fits its panel so no scrollbar appears.
- **Header bar**: `flex-wrap` with the search field
  `order-last w-full sm:order-none sm:w-auto sm:flex-1`, so on phones it drops
  to its own full-width row instead of being squeezed to 240 px.
- **`components/Pagination.tsx`**: the footer row and the button group are
  `flex-wrap` with `justify-center sm:justify-between`, so the First/Previous/
  Next/Last group wraps instead of overflowing. This component is shared by
  the other pages, so the change is additive only.

## Testing
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new problems; the 2 errors (`QuotationModal.tsx`) and 2
  warnings (`ProductTableRow.tsx`, and `findMatchingSize` unused in
  `TyresGuideModal.tsx`) are all pre-existing and in code this task did not
  touch.
- **Live browser check** (headless Chrome over CDP against `npm run dev`,
  logged in with a locally minted session cookie): opened the modal on
  /products, searched `245/35 ZR19`, selected a staggered fitment chip and
  expanded a make logo, then measured at 1536x900, 1292x684, 1180x800,
  1024x768, 768x1000 and 390x844. At every width: no element inside the
  dialog extends past the viewport except inside an intentional horizontal
  scroller, `popupClipped: false` and `makeClipped: false` (both popups stay
  within their scroll ancestor's box), and the document never scrolls
  horizontally. Screenshots reviewed at each width.
- Before the fix the same measurement at 1292x684 showed the fitment chips
  and the Tyres Link popup escaping the Selected Size card, and the Search
  button clipped by the search-bar card.

## Issues / Notes
- The floating chat/avatar bubble from the page behind the modal paints over
  the modal's bottom-left "Show N entries" control. That is a pre-existing
  z-index conflict outside this modal, not a responsive-layout issue, and was
  left alone.
- The make-logo grid stays `grid-cols-3` at all widths on purpose: the models
  popup picks its horizontal alignment from `idx % 3`, so a responsive column
  count would need that logic reworked too. It fits at every width measured.
- The rear-size input's placeholder ("Add rear size (optional)") truncates in
  the narrowest columns; the field is inside the horizontal scroller, so the
  text is still reachable.

## Final Status
Completed

---

# Task #003 — Draggable floating Sticky Note UI (Klever Sticky Note API)

Date: 2026-09-12
Status: In Progress

## Requirement
Add a freely movable floating sticky-note overlay to the POS: drag anywhere
(mouse + touch), persist position/size through the existing Sticky Note API so
it survives refresh/login/device changes, support multiple independently
movable notes, edit/save/delete/minimize/expand, add a header button to create
a note. No IndexedDB/localStorage, no new backend/API logic, no mock/fallback
data — must inspect the real API first and use its exact field names.

## Planned Changes
- Inspect the existing Sticky Note API (there was no frontend code for it in
  this repo) via the Klever API docs the user linked
  (`/en/kleverapi/docs`, mod-6, `Klever_StickyNote` module) to get exact
  query/mutation names and field names.
- `services/types.ts` — add `KleverStickyNote`, `KleverStickyNoteInput`,
  `KleverStickyNotesQueryVars`, `KleverStickyNotesResult` types matching the
  API exactly.
- `services/queries.ts` — add `KLEVER_STICKY_NOTES_QUERY`,
  `CREATE_KLEVER_STICKY_NOTE`, `UPDATE_KLEVER_STICKY_NOTE`,
  `DELETE_KLEVER_STICKY_NOTE` GraphQL documents (variables-based, like
  `CREATE_KLEVER_QUOTE`).
- `services/graphql.ts` — add
  `fetchKleverStickyNotesGraphQL`/`createKleverStickyNoteGraphQL`/
  `updateKleverStickyNoteGraphQL`/`deleteKleverStickyNoteGraphQL` fetchers,
  reusing `executeGraphQLQuery` (goes through the existing `/api/graphql`
  proxy — no new backend route).
- `config/features.ts` — add a `stickyNotes` feature flag next to the other
  header-action flags.
- New `components/StickyNotes/StickyNotesProvider.tsx` — client context: loads
  notes on mount, exposes add/save/move/resize/toggleCollapsed/remove, all
  backed by the mutations above (no local persistence).
- New `components/StickyNotes/StickyNoteCard.tsx` — an individual floating
  note: Pointer Events–based drag (header) and resize (corner handle) so mouse
  and touch share one code path, editable title/content/color with an
  explicit Save, minimize/expand, delete.
- New `components/StickyNotes/StickyNotesOverlay.tsx` — renders all notes in a
  `fixed inset-0 pointer-events-none` layer (so it floats above content
  without affecting layout or blocking clicks between notes).
- New `components/StickyNotes/StickyNoteButton.tsx` — header "Add Sticky
  Note" button.
- `app/(app)/layout.tsx` — mount `StickyNotesProvider` + `StickyNotesOverlay`
  once, above the route boundary (same reasoning as `<Sidebar />`: a dragged
  note must not remount on navigation).
- `components/Header.tsx` — render `StickyNoteButton` as a new shared trailing
  control (same pattern as the existing Book Inquiry button), gated by
  `features.stickyNotes`.

## Files Affected
- `services/types.ts`
- `services/queries.ts`
- `services/graphql.ts`
- `config/features.ts`
- `.env.local` (added `NEXT_PUBLIC_FEATURE_STICKY_NOTES=true`, gitignored)
- `components/Header.tsx`
- `app/(app)/layout.tsx`
- `components/StickyNotes/StickyNotesProvider.tsx` (new)
- `components/StickyNotes/StickyNoteCard.tsx` (new)
- `components/StickyNotes/StickyNotesOverlay.tsx` (new)
- `components/StickyNotes/StickyNoteButton.tsx` (new)

## Implementation
- **Types/queries/fetchers** added exactly matching the live
  `Klever_StickyNote` module (query `kleverStickyNotes` →
  `{ items, total_count }`, `createKleverStickyNote`/`updateKleverStickyNote`/
  `deleteKleverStickyNote`, `KleverStickyNoteInput` with `pos_x`/`pos_y`/
  `width`/`height`/`is_collapsed`/`color` etc., all optional so an update
  sends only the fields it changes). No new backend fields — everything maps
  to what already exists.
- **`StickyNotesProvider`** (mounted once in `app/(app)/layout.tsx`, above the
  route boundary, next to `<Sidebar />`) loads all notes on mount and exposes
  add/save/move/resize/toggleCollapsed/remove, all backed by the mutations —
  no IndexedDB/localStorage anywhere.
- **`StickyNoteCard`**: drag (header strip) and resize (corner handle) via
  the Pointer Events API (`onPointerDown/Move/Up` + `setPointerCapture`), one
  code path for mouse and touch. Position/size are rendered from a local
  override while a drag/resize is in flight and handed to `moveNote`/
  `resizeNote` on pointer-up, which persists via `updateKleverStickyNote` and
  is not written on every pixel of movement.
- **`StickyNotesOverlay`**: `fixed inset-0 pointer-events-none` layer so
  floating notes sit above all page content without taking part in layout or
  blocking clicks between notes.
- **`StickyNoteButton`**: added to `components/Header.tsx` as a new shared
  trailing control (same pattern as the existing Book Inquiry button), gated
  by a new `features.stickyNotes` flag — shows on every page automatically,
  no per-page wiring needed.
- **Close vs. Delete split** (added after live testing surfaced it as a real
  problem — see Issues below): the header's **X** button now only sets local
  `dismissed` state (hides the card for the rest of this browser session,
  touches no API field, note reappears on reload) — it is labelled "Close"
  and no longer deletes anything. A separate **Delete** button (trash icon,
  red, in the footer next to Save) performs the actual
  `deleteKleverStickyNote` call, still behind a `window.confirm`. The title
  input was moved out of the header into the body for the same investigation
  (see below) — the header is now a plain draggable strip showing the title
  as static text, with only the Minimize/Expand and Close icons on it.

## Testing
- `npx tsc --noEmit` — clean, at every step.
- `npm run lint` — no new problems; the 2 errors (`QuotationModal.tsx`) and 2
  warnings (`ProductTableRow.tsx`, `TyresGuideModal.tsx`) are pre-existing,
  in files this task did not touch.
- **Live browser verification**, driven end-to-end over CDP (headless Chrome,
  `chrome-remote-interface`) against this project's own dev server (this
  machine had TWO unrelated Next dev servers running — port 3000 turned out
  to be a different project, `tyresworld-front-graphql`; this repo's own
  server was on port 3001, confirmed by `ps`/`lsof` before testing against
  it), logged in via `/api/auth/login`, against the real QA GraphQL backend
  (no mocks):
  - Add Sticky Note (header button) → `createKleverStickyNote`, 0 GraphQL
    errors, card renders floating above content.
  - Drag by the header → `updateKleverStickyNote(pos_x, pos_y)` → **reload →
    note restored at the exact dragged position** (120,100 → 360,260,
    confirmed via a fresh `kleverStickyNotes` query after reload).
  - Resize via the corner handle → same persistence pattern confirmed
    (260×220 → 340×284, survived reload).
  - Edit title/content/color + Save → persisted, confirmed present after
    reload; a "Note saved." toast appears; no error toast.
  - Minimize/Expand → collapses to a 40px header bar and back, confirmed via
    measured height.
  - Close (X) → note hidden from the DOM immediately, confirmed still
    present in the backend via a direct `kleverStickyNotes` query, and
    confirmed it reappears after a reload (i.e. genuinely non-destructive,
    session-only).
  - Delete (trash icon, footer) → confirm() dialog auto-accepted →
    `deleteKleverStickyNote` → gone from the DOM and confirmed gone after
    reload (real, permanent removal).
  - Multiple independent notes: created 2+ concurrently, each draggable
    without affecting the others.
  - Checked `console --errors` equivalent (CDP `Runtime.exceptionThrown` /
    console.error capture) after every step — 0 by the end (see bugs found
    and fixed, below).

## Issues / Notes
- **Two real bugs were found and fixed during this same live-testing pass**
  (not shipped, then found separately — testing caught them before this task
  was called done):
  1. The title `<input>` originally lived inside the draggable header and
     had to call `stopPropagation()` on pointerdown to stay editable — which
     swallowed the drag gesture almost everywhere in the header (only a few
     px of padding were left grabbable). Fixed by moving the title into the
     body and leaving the header a plain draggable strip with a static title
     label.
  2. `handleHeaderPointerUp`/`handleResizePointerUp` called `moveNote`/
     `resizeNote` (which update `StickyNotesProvider`'s state) **from inside**
     the functional updater passed to `setDragPos`/`setDragSize`. React logs
     "Cannot update a component while rendering a different component" for
     this and does not guarantee the update applies correctly. Fixed by
     mirroring the latest drag/resize value in a ref and calling
     `moveNote`/`resizeNote` as an ordinary call in the event handler instead.
- **Live/shared environment caveat**: this task's browser verification ran
  against the same QA Magento backend and the same dev server the user was
  actively testing against in their own browser at the same time (confirmed
  by seeing the user's own notes, e.g. a "Tyrscart" note with real content,
  appear mid-test). A handful of empty test notes from both this session's
  automated runs and the user's own manual testing were left in the QA
  `kleverStickyNotes` table — left alone deliberately rather than
  auto-deleted, since distinguishing "my test data" from "the user's
  in-progress testing" isn't reliable, and deleting someone's real note
  amid live testing is exactly the kind of action this project's own
  guidance treats as needing explicit confirmation. They can be removed via
  the new Delete button whenever convenient.
- Confirmed by a repo-wide search (before writing any code) that no
  sticky-note code, types, or GraphQL fields existed anywhere in this
  codebase — this is new frontend work against an already-live backend
  module, not a continuation.
- Exact API shape (query/mutation names, `KleverStickyNoteInput`/
  `KleverStickyNote` fields, `pos_x`/`pos_y`/`width`/`height`/`is_collapsed`,
  color enum, response wrappers) came from the Klever API docs page the user
  linked, not introspection (introspection is broken on this Magento build —
  see CLAUDE.md "Environment").
- **Follow-up (same day)**: after Close (X) shipped, the user asked how to
  get back to a note they had closed — Close only set local component state,
  so the only way back was a full page reload. Fixed by lifting the "closed"
  set out of `StickyNoteCard` into `StickyNotesProvider` (`closedIds: Set
  <number>`, `closeNote`/`reopenNote`), still session-only/not persisted
  (unchanged behavior otherwise — closing still touches no API field and a
  reload still brings everything back). `StickyNoteButton` now shows a small
  amber count badge + caret next to "Add Sticky Note" whenever at least one
  note is closed; clicking it opens a dropdown (styled to match
  `components/TableDensityMenu.tsx`'s existing button+panel+click-outside
  pattern) listing closed note titles with a "Reopen" action each. Re-verified
  live over CDP: create → close (hidden, badge shows "1") → open dropdown →
  Reopen → card reappears with no reload, 0 console errors.
- **Follow-up #2 (same day)**: user reported that refreshing the page opened
  *every* note as a floating card at once (clutter), and asked instead to be
  able to open one particular note to edit. This meant inverting the
  default: previously every note fetched on load started **open** (not in
  `closedIds`), so a page with several notes always popped all of them onto
  the screen on every login/reload — the "closed" tray only helped once you
  had explicitly closed one first.
  - `StickyNotesProvider`'s initial-load effect now seeds `closedIds` with
    every note id from that fetch, so a fresh load shows nothing floating.
    A note created via `addNote` this session is never added to
    `closedIds`, so it still opens immediately, as before.
  - `StickyNoteButton`'s dropdown ("My Notes", was "Closed notes") now lists
    **every** note, not just closed ones, each with "Open" (closed) or
    "Focus" (already open) — `reopenNote` already handled the "already open"
    case as a harmless bring-to-front, so no logic change there.
  - Live-verified over CDP end to end: fresh load → 0 floating cards, badge
    shows the true total count → create+save+close a marked note → reload →
    still 0 floating (the actual bug being fixed) → open that one specific
    note from "My Notes" → edit its content → Save → confirmed persisted
    both via a direct `kleverStickyNotes` API query and via a second fresh
    reload + reopen through the UI. 0 console errors. (The user's earlier,
    separate report that "edit after reopen doesn't update" did not
    reproduce under this test — likely was disorientation from several
    notes being open/overlapping at once before this fix, not a persistence
    bug; editing and saving a specifically-opened note works correctly.)
- **Follow-up #3 (same day)**: the "My Notes" list was cluttered with blank
  "New note" placeholders from repeated Add-Sticky-Note clicks that were
  never actually written into. User asked for the list to show only notes
  that were actually saved. Added `DEFAULT_NOTE_TITLE` export from
  `StickyNotesProvider` (the literal `addNote` already used) and an
  `isUnsavedPlaceholder()` check in `StickyNoteButton` — a note is excluded
  from "My Notes" (and the badge count) only while its title is still
  exactly the default AND its content is still empty; typing a real title or
  any content makes it appear. Live-verified: badge dropped from the raw
  total (e.g. 9) to the count of genuinely-written notes (2), and the
  dropdown listed only those two.
- **Follow-up #4 (same day)**: the "My Notes" caret+badge button was only
  rendered when `savedNotes.length > 0`, so the header's flex row reflowed
  (Fullscreen/Sync/Online shifted) the moment a note went from unsaved to
  saved (or the last saved note was deleted). Fixed by always mounting that
  button (same fixed padding/icon, so identical footprint) and only toggling
  the badge `<span>` and the enabled/disabled + color state inside it —
  matches this app's existing "fixed-width wrapper prevents layout shift"
  convention (see the items-count badge in `components/HeaderActions.tsx`).
  Live-verified over CDP: measured the Fullscreen button's `getBoundingClientRect().x`
  before and after creating+saving a new note — identical (1248px both
  times), 0 console errors.
- **Follow-up #5 (same day)**: the header trigger was an unlabeled icon-only
  button (matching `FullscreenButton`'s minimal style), and the user asked
  for a proper named button instead. Restyled to match
  `components/HeaderBookInquiry.tsx` exactly (`h-9 ... text-xs font-bold ...
  rounded-lg`, icon + `<span>` label), now reading "Sticky Note" with its own
  accent (`violet`, distinct from Book Inquiry/emerald, Create Quote/indigo,
  Chat/sky, Tyres Guide/amber). The "My Notes" caret+badge became a small
  square icon button (border, white bg) next to it rather than the previous
  bare muted chevron, so it doesn't look like a stray artifact next to a
  solid colored button. Screenshotted on `/dashboard` and `/tc-products` —
  reads correctly next to the other labeled header buttons on both.
- **Follow-up #6 (same day)**: an expanded note showed its title twice — once
  as the static header label added when the title input was moved out of the
  header (Follow-up bug-fix pass), and again as the title `<input>` right
  below it in the body. Fixed by only rendering the header's static title
  `<span>` while the note is collapsed (the one time the input itself isn't
  visible); the icon buttons now use `ml-auto` to stay right-aligned whether
  or not that span is present, instead of relying on the span's `flex-1` to
  push them over. Screenshotted both states — expanded shows the title once
  (in the input), collapsed shows it once (in the header).
- **Follow-up #7 (same day)**: user asked for the title to show IN the
  header (not below it in the body, where Follow-up #6's predecessor had
  moved it to solve the drag bug). Put the title `<input>` back in the
  header — this time WITHOUT `stopPropagation()` on its pointerdown, so the
  press still bubbles to the header's own drag handlers (a plain click still
  focuses the input and places the caret as a normal browser default action;
  only a click-AND-DRAG gesture across the title text now moves the note
  instead of selecting text — typing/backspace are unaffected). Removed the
  now-redundant body title input entirely, so there is exactly one title
  field, in the header, visible whether collapsed or expanded (the
  collapsed-only static `<span>` from Follow-up #6 is gone too — the input
  itself is now what shows in both states). Live-verified over CDP: only one
  `input[placeholder="Title"]` exists for the note; dragging by pressing
  directly on the title text still moves the card (confirmed a real position
  change after a drag started on the title); 0 console errors.
- **Follow-up #8 (same day)**: the "orange" note color looked transparent/
  washed out rather than a proper solid orange. Root cause: it used
  `bg-orange-50` (Tailwind's palest orange tint, close to white) for the
  card body plus `bg-orange-200/90` (a partial-alpha header) — both other
  colors' `-50`/`-200` shades read as visibly tinted, but orange's happens to
  be the palest of the set, so the `/90` transparency on top of it looked
  like the header wasn't really colored at all. Bumped orange one shade
  darker (`bg-orange-100` body, `bg-orange-300` header) and dropped the
  `/90` opacity from every color's header (all were technically translucent,
  orange just showed it) for a consistently solid, fully-opaque header
  across all seven colors. Verified via computed style: card
  `rgb(255,237,213)` (orange-100) and header `rgb(253,186,116)` (orange-300),
  both fully opaque; screenshotted — reads as a proper solid orange note.

## Final Status
Completed

---

# Task #004 — Tyres Guide fitment chips: single line, no wrap

Date: 2026-09-12
Status: Completed

## Requirement
On the Tyres Guide modal's "Selected Size"/"Suggested Size" fitment chips
(e.g. "245/35 ZR20 (front) / 305/30 ZR20 (rear)"), the front/rear size pair
was wrapping onto two lines inside its card at narrower widths. User wanted
it to always render on a single line (no wrap) — first with a smaller font,
then asked for the font to come back up a notch since the first pass read as
too small.

## Planned Changes
- `components/TyresGuideModal.tsx` — `SizeFitmentChip`'s two call sites
  (Selected Size, Suggested Size): change the content row from `flex-wrap`
  to `flex-nowrap` (+ an `overflow-x-auto` safety net in case a size pair is
  ever too long to fit at all, so it scrolls instead of wrapping or
  overflowing the card), and adjust the pill/separator font size and padding
  so the pair actually fits on one line at the widths this card renders at.

## Files Affected
- `components/TyresGuideModal.tsx`

## Implementation
- Row: `flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 w-full` →
  `flex flex-nowrap items-center gap-x-1.5 min-w-0 w-full overflow-x-auto`
  (both call sites — this exact string was byte-identical in both places,
  confirmed via `grep` count before using `replace_all`).
- Front/rear pills: `break-words` (which permitted wrapping) → `whitespace-
  nowrap shrink-0`; first pass also dropped `text-[11px] sm:text-xs` → `text-
  [10px]` and `px-2` → `px-1.5` to guarantee it fit in one line — the user
  found 10px too small, so bumped back to `text-[11px]` (fixed, no responsive
  step) with `px-2` restored, relying on the `overflow-x-auto` row as the
  fallback for any width where 11px genuinely doesn't fit, rather than
  shrinking the font further.
- Slash separator: `text-slate-600 text-xs` → `text-slate-600 text-[11px]
  shrink-0` (kept in step with the pills' final size).

## Testing
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new problems; the same 2 pre-existing errors
  (`QuotationModal.tsx`) and 2 warnings (`ProductTableRow.tsx`,
  `TyresGuideModal.tsx`'s unrelated unused `findMatchingSize`) as before this
  task.
- **Live browser check** (headless Chrome over CDP, logged in against the
  real dev server): opened Tyres Guide on `/tc-products`, searched a
  staggered size (`305/30 ZR20`), at a 480px viewport (matching the width in
  the user's screenshot) measured every visible chip row's `scrollWidth` vs
  `clientWidth` — identical for all of them (370px each, `overflowing:
  false`), confirming the 11px pass fits on one line with no wrap and no
  scroll needed. Screenshotted at 1600px and 480px.

## Issues / Notes
- While fixing this, noticed and corrected a **pre-existing ordering bug in
  this very file**: Task #003 (Sticky Note UI) had been inserted between
  Task #001 and Task #002 instead of appended after #002, violating this
  file's own "always appended at the end, in chronological order" rule.
  Reordered the three blocks (content byte-for-byte unchanged — verified via
  `diff` on sorted output before and after) so the file now reads #001 → #002
  → #003 → #004. No task content was deleted or altered, only its position
  in the file.

## Final Status
Completed

---

# Task #005 — Sticky Note: auto-sync every 5s + manual Sync button

Date: 2026-09-12
Status: Completed

## Requirement
User asked for a Sync button inside each sticky note, plus an automatic sync
every 5 seconds — explicitly to the real database (Klever Sticky Note API),
not IndexedDB or any browser storage.

## Planned Changes
- `components/StickyNotes/StickyNotesProvider.tsx` — `saveNote` gets an
  optional `{ silent?: boolean }` third argument so a background auto-sync
  can persist without popping a "Note saved." toast every cycle.
- `components/StickyNotes/StickyNoteCard.tsx` — a `setInterval(5000)` effect
  that pushes the current title/content/color to the API (via `saveNote`,
  silent) whenever they differ from the last-saved values, plus a manual
  "Sync" icon button in the note header (next to Minimize/Close) that does
  the same push immediately and does show the toast.

## Files Affected
- `components/StickyNotes/StickyNotesProvider.tsx`
- `components/StickyNotes/StickyNoteCard.tsx`

## Implementation
- `saveNote(note_id, input, opts?: { silent?: boolean })`: unchanged
  behavior except the success toast is skipped when `opts.silent` is true.
  Still the exact same `updateKleverStickyNoteGraphQL` call either way —
  auto-sync and the manual controls both go straight to the real API.
- `StickyNoteCard`: a `latestEdit` ref mirrors `{ title, content, editColor,
  dirty }` on every render. A single `setInterval(..., 5000)` — keyed only on
  `note.note_id`, so it is created ONCE per note and never torn down and
  restarted while typing — reads that ref every 5s and, only if `dirty`,
  calls `saveNote(..., { silent: true })`. Depending the effect on `[title,
  content, editColor]` directly was deliberately avoided: that would reset
  the interval on every keystroke, so the 5s timer would never actually
  elapse for a user who is continuously typing.
- Manual **Sync** button: `ArrowPathIcon`, header, next to Minimize/Close,
  only rendered when expanded. Disabled (and greyed) when nothing is dirty.
  Spins (`animate-spin`) while its own `handleSync()` call is in flight, and
  calls `saveNote` WITHOUT `silent`, so a deliberate click still gets the
  toast confirmation the existing Save button gives.
- Left the existing footer **Save** button exactly as it was — Sync doesn't
  replace it, it's an additional, faster/no-toast-spam path plus the
  automatic timer, per the user's "add a sync button" (not "rename Save").

## Testing
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new problems; same pre-existing issues as every prior
  task in this file.
- **Live browser check**, headless Chrome over CDP against the real dev
  server and the real QA GraphQL backend (no mocks): created a note, renamed
  its title via the header input, did NOT click Save/Sync — queried
  `kleverStickyNotes` directly and confirmed the new title was **absent**
  from the database. Waited 6 seconds, queried again — the title was **now
  present** (the 5s auto-sync fired) with **no** "Note saved." toast visible
  (silent, as intended). Then edited the content and clicked the new Sync
  button — confirmed the toast appeared this time, and a final direct API
  query showed the edited content persisted. Zero console errors throughout.

## Issues / Notes
- Auto-sync only covers title/content/color (the fields that otherwise
  require an explicit Save) — position/size already persist immediately on
  drag/resize release (`moveNote`/`resizeNote`, unchanged, not touched by
  this task).
- As a side benefit, this also shrinks the pre-existing risk that clicking
  Close (X) mid-edit loses unsaved typing (Close unmounts the card): now at
  most ~5 seconds of typing is ever at risk, not everything since the last
  manual Save.

## Final Status
Completed

---

# Task #006 — Sticky Note Sync button: spinner wasn't visible

Date: 2026-09-12
Status: Completed

## Requirement
User reported the Sync button (added in Task #005) doesn't visibly spin when
clicked, even though the earlier live test had confirmed the sync itself
completed correctly and persisted to the database.

## Planned Changes
- `components/StickyNotes/StickyNoteCard.tsx` — enforce a minimum visible
  spin duration in `handleSync()`, since the real round-trip against this
  backend resolves fast enough that the spinner was clearing before a human
  eye could register it (confirmed: the earlier CDP test's own screenshot
  window happened to catch it, but a real click-and-glance would not).

## Files Affected
- `components/StickyNotes/StickyNoteCard.tsx`

## Implementation
- Added `MIN_SPIN_MS = 600` alongside the other layout constants.
- `handleSync()` now `Promise.all([saveNote(...), sleep(MIN_SPIN_MS)])` — the
  actual API call and the timer run concurrently (the sync itself is not
  slowed down), but `syncing` only clears once BOTH have settled, so the
  icon spins for at least 600ms regardless of how fast the network responds.

## Testing
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new problems; same pre-existing issues as every prior
  task in this file.
- **Live browser check**, headless Chrome over CDP: clicked the Sync button
  and polled the icon's `animate-spin` class every 50ms — measured it
  staying applied for ~742ms (comfortably above the 600ms floor, plus
  polling overhead), i.e. now a clearly perceivable rotation rather than a
  flash too brief to notice.

## Final Status
Completed

---

# Task #007 — Sticky Note sync: remove the 5s auto-timer, click-only

Date: 2026-09-12
Status: Completed

## Requirement
User reversed the earlier auto-sync request (Task #005): sync should happen
ONLY when the Sync button is clicked — no background 5-second timer.

## Planned Changes
- `components/StickyNotes/StickyNoteCard.tsx` — remove the `setInterval`
  effect and its supporting `latestEdit` ref entirely; keep `handleSync`
  (with its Task #006 minimum-spin-duration fix) as the only way a
  title/content/color edit gets persisted, alongside the unchanged footer
  Save button.
- `components/StickyNotes/StickyNotesProvider.tsx` — `saveNote`'s `opts?:
  { silent?: boolean }` parameter was added solely for the auto-timer (so it
  wouldn't toast every 5s); with the timer gone no caller uses `silent`
  anymore, so removed it and reverted `saveNote` to its original two-argument
  form rather than leaving a dead, unused option in a shared context type.

## Files Affected
- `components/StickyNotes/StickyNoteCard.tsx`
- `components/StickyNotes/StickyNotesProvider.tsx`

## Implementation
- Deleted the `useEffect(() => { const id = setInterval(...) }, [note.note_id])`
  block and the `latestEdit` ref it read from.
- Updated the file-level doc comment and the Sync button's tooltip (was
  "Sync now (also auto-syncs every 5s while editing)") to drop every
  reference to the removed timer.
- `saveNote(note_id, input)` — back to exactly two arguments; the success
  toast is unconditional again (it always fires now, since the only callers
  left — Sync, Save, color-swatch clicks — all want the confirmation).

## Testing
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new problems; same pre-existing issues as every prior
  task in this file.
- **Live browser check**, headless Chrome over CDP against the real dev
  server and QA backend: created a note, renamed it via the header input,
  clicked nothing, and waited 9 seconds (well past the old 5s interval) — a
  direct `kleverStickyNotes` query confirmed the new title was **absent**
  from the database (no auto-sync fired). Then clicked the Sync button —
  the same query now found it present. Zero console errors. (One earlier
  test run hit a transient failure while the Next.js dev server was mid
  Fast-Refresh from these very edits — confirmed via console logs
  ("[Fast Refresh] rebuilding" / "done in 104ms") and unrelated to the
  change itself; re-ran once the dev server settled and it passed cleanly.)

## Final Status
Completed

# Task #008 — tc-products: sort arrow on RunFlat column header

Date: 2026-10-28
Status: Completed

## Requirement
Add the sort (↑↓) arrow and click-to-sort to the RunFlat header (`py-2.5 px-1 text-center whitespace-nowrap`) on /tc-products. No other changes.

## Planned Changes
- Make the RunFlat `<th>` sortable, matching the Status/Year headers.

## Files Affected
- app/(app)/tc-products/page.tsx

## Implementation
- RunFlat `<th>` now calls `handleSort('runflat')` and renders the same `↑↓` span, `cursor-pointer` and `hover:text-slate-900` as the other sortable headers. `runflat` is a boolean on the row, which the generic comparator in `hooks/useProductSorting.ts` already orders (No before Yes ascending).

## Testing
- `npx tsc --noEmit` passed with no errors. Not checked in a browser.

## Issues / Notes
- None.

## Final Status
Completed

# Task #009 — supplier-products: sort arrow on Runflat column header

Date: 2026-10-28
Status: Completed

## Requirement
Add the sort (↑↓) arrow and click-to-sort to the `py-2 px-2 text-center whitespace-nowrap` header on /supplier-products. No other changes.

## Planned Changes
- Make the Runflat `<th>` sortable, matching the Year/Qty headers.

## Files Affected
- app/(app)/supplier-products/page.tsx

## Implementation
- Runflat `<th>` now calls `handleSort("runflat")` and renders the same `↑↓` span, `cursor-pointer` and `hover:text-slate-900` as the other sortable headers. `runflat` is a boolean on the row, which the generic comparator in `hooks/useProductSorting.ts` already orders (No before Yes ascending).
- The Actions header shares the same classes but was left unsortable: it holds buttons, not a value.

## Testing
- `npx tsc --noEmit` passed with no errors. Not checked in a browser.

## Issues / Notes
- None.

## Final Status
Completed

# Task #010 — Create local environment file

Date: 2026-11-23
Status: Completed

## Requirement
Create an env file for the project. None existed, so the GraphQL proxy and the login route had no configuration.

## Planned Changes
- Create `.env.local` (gitignored via `.env*`) listing every variable the code reads, with the known non-secret values filled in and secrets left blank.

## Files Affected
- .env.local (new, not committed)

## Implementation
- Created `.env.local` covering every `process.env.*` the code reads (grepped app/, components/, config/, services/, hooks/, proxy.ts, instrumentation.ts, next.config.ts): GRAPHQL_ENDPOINT, KLEVER_API_KEY, GRAPHQL_BASIC_AUTH, AUTH_USERNAME, AUTH_PASSWORD, NEXT_PUBLIC_ENABLE_LOGIN, all 18 NEXT_PUBLIC_FEATURE_* flags and FEATURE_GRAPHQL_PROXY.
- Filled only non-secret values: GRAPHQL_ENDPOINT=https://qa.tyrescart.ae/graphql, login enabled, every flag `true` (matches the opt-out default). Secrets left blank.

## Testing
- `git check-ignore` confirms `.env.local` is ignored by the `.env*` rule; `git status` shows only TASK_LOG.md changed.
- Not run against the API: the secrets are blank, so the proxy and login cannot work until they are filled in.

## Issues / Notes
- KLEVER_API_KEY, GRAPHQL_BASIC_AUTH, AUTH_USERNAME and AUTH_PASSWORD must be filled in by the user.
- No committed `.env.example` exists even though code comments reference one; `.gitignore`'s `.env*` would also ignore it unless `!.env.example` is added.

## Final Status
Completed

# Task #011 — Tyre Price Calculator page

Date: 2026-11-23
Status: Completed

## Requirement
Add a calculator page reproducing the "TyresCart.ae – Tyre Price Calculator" spreadsheet the user provided: cost inputs (tyre, fitting, courier, other, tyres per order, VAT, card fee, Tabby/Tamara fee), totals, and a Price-vs-Margin table (1%–50%) for Credit/Debit Card and Tabby/Tamara. Add a sidebar nav item with a calculator icon, placed after Chat and before Sync.

## Planned Changes
- `services/priceCalculator.ts` — pure pricing math matching the spreadsheet's figures.
- `app/(app)/calculator/page.tsx` + `layout.tsx` — the page, using the shared Header.
- `components/Sidebar.tsx` — new nav item (heroicons `CalculatorIcon`) after Chat.
- `config/features.ts` — `calculator` flag + `NAV_FEATURE_MAP` entry so the nav link and the proxy.ts route gate stay in sync.
- A `node --test` file checking the math against values read off the spreadsheet.

## Files Affected
- services/priceCalculator.ts (new)
- services/priceCalculator.test.mts (new)
- app/(app)/calculator/page.tsx (new)
- app/(app)/calculator/layout.tsx (new — route title)
- components/Sidebar.tsx
- config/features.ts
- CLAUDE.md (route list + test command)
- .env.local (local only, gitignored — added NEXT_PUBLIC_FEATURE_CALCULATOR=true)

## Implementation
- `services/priceCalculator.ts`: pure functions, no imports. Price excl. VAT X = cost / (1 − margin − fee·(1+VAT)²); the gateway fee is charged on the price incl. VAT and VAT is charged on the fee, hence the squared term. Price incl. VAT = X·(1+VAT). "Order of 1" uses cost per tyre; "Order of N" uses the total order cost. Courier and Other costs are spread per order. A margin + fee share of 100% or more returns null, shown as "—".
- The Net Profit column reproduces the sheet exactly: price incl. VAT − fee incl. VAT − order cost × (1+VAT). This is a VAT-inclusive figure and is NOT margin × price excl. VAT (60.29 vs 51.71 at 1% / card). It is footnoted on the page.
- The page has a Cost Inputs table (blue editable cells, Inputs/Default tags, live totals), a Price vs Margin table for 1–50% (grouped Card / Tabby-Tamara headers that show the live fee %, an "Order of N" header that follows Tyres per Order, a sticky header, rows ≤10% tinted with an orange divider like the sheet), and a Reset button.
- The sheet's empty right-hand grid (navy / blue / brown headers) is implemented as "Price Check": enter a selling price per tyre incl. VAT to see order total, fee, cost, net profit and margin for both channels (`checkPrice`). This is an interpretation, since the sheet leaves that grid blank.
- Sidebar: "Calc" item with heroicons `CalculatorIcon`, after Chat and before Sync. Feature flag `calculator` (`NEXT_PUBLIC_FEATURE_CALCULATOR`, on by default) is in `NAV_FEATURE_MAP` and `getDefaultRoute`, so proxy.ts gates the route along with the nav link. The page also calls `notFound()` when the flag is off, like /tyreschat.
- The header Sync button renders disabled on this route (no sync task), the same as /dashboard.

## Testing
- `node --test services/priceCalculator.test.mts`: 4/4 pass. Covers 36 values read off the spreadsheet (margins 1, 2, 5, 10, 11, 15% × both channels × 3 columns), cost totals with courier/other, the impossible-margin null, and checkPrice round-trip.
- `npx tsc --noEmit`: no errors. `npx eslint` on the changed files: no errors.
- Live check: headless Chrome over CDP against the running dev server (1600×900, logged in). /calculator renders, title "Tyre Price Calculator", nav order Dashboard, Supplier, TC, Products, Chat, Calc, Sync all data; 50 rows; rows 1/10/15% match the sheet. After setting courier 40, tyres 2 and check price 1500: headers switch to "Order of 2", 1% card = 1,379.22 / 2,758.45 / 30.63, and Price Check card margin 8.78% / net 266.85 (verified by hand).
- `npm run build` not run.

## Issues / Notes
- The sheet's 4% row (1,401.00 / 5,604.00 / 230.43) does not follow its own formula, which gives 1,400.98 / 5,603.90 / 230.33. It looks like a hand-typed override in the source sheet. The page uses the formula.
- The Net Profit definition (VAT-inclusive) differs from the stated margin definition. It is kept to match the sheet; the business should confirm which is wanted.
- Inputs are not persisted; a reload resets to the defaults.

## Final Status
Completed

# Task #012 — Calculator: align with the source workbook's real formulas

Date: 2026-11-23
Status: Completed

## Requirement
The user supplied the source workbook (`Tyre-Price-Calculator 1.xlsx`). Make /calculator follow its actual cell formulas instead of the figures reverse-engineered from the screenshot in #011.

## Planned Changes
- Read every formula in the workbook (openpyxl, formulas + cached values).
- `services/priceCalculator.ts`: "Order of 1" = SUM(tyre, fitting, courier, other) / (1 − m − fee·(1+VAT)²) · (1+VAT). A one-tyre order carries the full courier/other cost; #011 wrongly spread it per tyre. Replace the invented `checkPrice` with the workbook's Quick Quote block (E4:G13).
- Page: replace the "Price Check" panel with Quick Quote (Target Margin % input); replace the ≤10% red band with the workbook's only conditional format, which highlights the row equal to the target margin (#FFD966, bold); use the workbook's exact fill colours.
- Tests: add cases from the workbook's own cached values.

## Files Affected
- services/priceCalculator.ts (rewritten)
- services/priceCalculator.test.mts (rewritten)
- app/(app)/calculator/page.tsx (rewritten)
- CLAUDE.md (test command description)

## Implementation
- Read the workbook with openpyxl (formulas and Excel's cached values). It has one sheet, "Price Calculator"; rows 19–68 all use the same formula (checked programmatically) and there are no hand-entered values.
- Bug fixed: "Order of 1" (C19/F19) is `SUM(C5:C8)/(1−m−fee·(1+VAT)²)·(1+VAT)`, so a single-tyre order carries the FULL courier + other cost. #011 used cost per tyre, which spread courier/other over N; that was wrong whenever courier or other was non-zero. "Order of N" (D19/G19 = C11/(…)·(1+VAT)·N) and Net Profit (E19/H19) were already right.
- Replaced #011's invented "Price Check" with the workbook's Quick Quote block (E4:G13): one Target Margin % input (default 9%; G5 is `=F5`, so Tabby/Tamara shows the same target read-only), then price per tyre excl./incl. VAT, gateway fee per tyre, net profit per tyre, order total, order total cost incl. VAT, gateway fee per order and net profit per order (`quickQuote`).
- Highlighting: the workbook's only conditional format is `ROUND($B19,4)=ROUND($F$5,4)` (fill #FFD966, bold). The ≤10% red band from #011 was removed. It was not in the workbook; the salmon block in the screenshot was most likely an Excel selection. Now the row equal to the target margin is highlighted.
- Every fill and font colour comes from the workbook's cell styles (#1F3864, #1F4E79, #843C0C, #3A3A3A, #5B9BD5, #2E75B6, #548235, #F4B183, #C55A11, #DDEBF7/#BDD7EE, #FCE4D6/#F8CBAD, #E2EFDA/#375623, input font #0000FF).
- Each function in priceCalculator.ts is annotated with the cells it implements.

## Testing
- `node --test services/priceCalculator.test.mts`: 6/6 pass. It checks the workbook's cached values (table rows 1/2/5/42/50 and all of Quick Quote F6:G13), courier/other handling in Order of 1, the screenshot rows at 1,250, and the unreachable-margin null.
- One-off cross-check script: all 300 cached table cells (C19:H68) vs `marginTable` at the workbook's inputs, max abs difference 0.
- `npx tsc --noEmit`, and `npx eslint` on the changed files: no errors.
- Live check (headless Chrome over CDP, dev server, logged in): with tyre 450 the page shows exactly the workbook's Quick Quote (e.g. card net profit per order 194.15, Tabby 212.99), row 1% 488.70 / 1,954.81 / 21.70 / 518.25 / 2,073.00 / 28.46, and the 9% row highlighted in #FFD966. With target 12% and courier 40, the highlight moves to 12% and 1% Order of 1 = 1,400.94 (= 1,290 / 0.96685 × 1.05).
- `npm run build` not run.

## Issues / Notes
- Correction to #011: its note that the sheet's 4% row was a "hand-typed override" was wrong. The workbook's formulas are uniform, so the 1,401.00 / 5,604.00 figures in the screenshot must come from a different copy of the file. The formula values (1,400.98 / 5,603.90) are correct.
- Default tyre cost stays 1,250 (the screenshot); the workbook file ships with 450. Only the starting value differs.
- The "Inputs"/"Default" tags next to the inputs appear in the screenshot but not in this workbook file; they were kept.
- The Net Profit definition (VAT-inclusive) still differs from the margin definition in the sheet's own subtitle. This is the workbook's formula, reproduced faithfully.

## Final Status
Completed

# Task #013 — Calculator: whole-number (rounded-up) values in Price vs Margin table

Date: 2026-11-23
Status: Completed

## Requirement
Show the Price vs Margin table values as integers, rounded UP (user's example: 5,430.02 → 5,431).

## Planned Changes
- `app/(app)/calculator/page.tsx`: display-only ceiling formatter for the table cells (Order of 1, Order of N, Net Profit, both channels). The math in `services/priceCalculator.ts` is unchanged.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Added `fmtCeil`: `Math.ceil(n − 1e-9)` formatted with en-US grouping and no decimals. The epsilon keeps float noise such as 5430.0000000001 from bumping an exact whole number up by one. A null or unreachable value still shows "—".
- All six Price vs Margin columns (Order of 1, Order of N, Net Profit × Card and Tabby/Tamara) use it. Display only: `services/priceCalculator.ts` and its tests are unchanged.
- Added "Table values are rounded up to the whole AED." to the footnote.
- The Quick Quote panel keeps 2 decimals (not part of the request).

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, dev server, default inputs): row 1% = 1,358 | 5,431 | 61 | 1,440 | 5,759 | 80 (from 1,357.50 | 5,430.02 | 60.29 | 1,439.58 | 5,758.33 | 79.05); highlighted 9% = 1,480 | 5,920 | 540 | 1,579 | 6,313 | 592; Quick Quote still shows 1,479.96 at 2 dp.

## Issues / Notes
- Net Profit is rounded UP as well (60.29 → 61), per the request applying to the table values. This slightly overstates the profit at the unrounded price.
- Each cell is rounded independently, so Order of N (5,431) is not 4 × Order of 1 (4 × 1,358 = 5,432).
- The table now shows whole numbers while the Quick Quote for the same margin shows decimals (1,480 vs 1,479.96).

## Final Status
Completed

# Task #014 — Calculator: whole-number (rounded-up) values in Quick Quote

Date: 2026-11-23
Status: Completed

## Requirement
Apply the same rounded-up whole-AED display from #013 to the Quick Quote (AED) panel.

## Planned Changes
- `app/(app)/calculator/page.tsx`: `QuoteRow` cells use `fmtCeil` instead of `fmt`. The Target Margin % input/display stays as-is.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- `QuoteRow` cells now render through `fmtCeil` (the #013 formatter). All 8 Quick Quote rows, both channels, show whole AED rounded up. Display only; the math is unchanged.
- The Target Margin % input and the Tabby/Tamara mirror ("9%") are unchanged.
- Updated the footnote and the `fmtCeil` doc comment to cover Quick Quote.
- Cost Inputs totals (Total Order Cost, Total Cost per Tyre) still use 2 decimals; not part of the request.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, dev server, default inputs, target 9%): Card / Tabby = price excl. VAT 1,410 / 1,503; incl. VAT 1,480 / 1,579; fee per tyre 33 / 118; net per tyre 135 / 148; order total 5,920 / 6,313; order cost 5,250 / 5,250; fee per order 131 / 471; net per order 540 / 592. These match the highlighted 9% table row (1,480 | 5,920 | 540 | 1,579 | 6,313 | 592).

## Issues / Notes
- Each line is rounded up independently, so the rows don't add up exactly, e.g. order total 5,920 − cost 5,250 − fee 131 = 539, displayed net 540 (unrounded: 539.31).

## Final Status
Completed

# Task #015 — Calculator: don't show "-0"

Date: 2026-11-23
Status: Completed

## Requirement
With all costs at 0, every rounded value on /calculator showed "-0" (Quick Quote and the Price vs Margin table). Show 0 instead.

## Planned Changes
- `app/(app)/calculator/page.tsx`: normalise negative zero in `fmtCeil`.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Root cause: `fmtCeil` (#013) computes `Math.ceil(n − 1e-9)`. For n = 0 that is `Math.ceil(-1e-9)`, which is -0 in JavaScript, and `Intl.NumberFormat` prints -0 as "-0". Any value in (−1, 0] did the same.
- Fix: `Math.ceil(n − 1e-9) || 0` (-0 is falsy, so it becomes 0). Real negatives (-1 and below) keep their sign.
- Applied the same guard to the 2-dp `fmt` used by the Cost Inputs totals: round to cents first, then `|| 0`, so -0 or -0.001 prints "0.00", not "-0.00".

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, dev server): with the user's inputs (all costs 0, tyres 0, VAT 4%), 0 cells on the page match /^-0(\.0+)?$/; table row 1% and Quick Quote all read "0". Then with tyre 100 × 4 and target 0%, the page still renders normally (net profit 1 / 2).

## Issues / Notes
- With all costs at 0 every price is 0, which is correct output for those inputs; no validation was added.

## Final Status
Completed

# Task #016 — Calculator: remove the Quick Quote (AED) panel

Date: 2026-11-23
Status: Completed

## Requirement
Remove the Quick Quote (AED) panel from /calculator.

## Planned Changes
- `app/(app)/calculator/page.tsx`: delete the Quick Quote section, its Target Margin % state and the `QuoteRow`/`ProfitCell`-style helpers. The table's target-margin highlight is driven by that input, so it goes too. Cost Inputs no longer shares a two-column grid.
- `services/priceCalculator.ts`: remove the now-unused `quickQuote` / `QuickQuote` / `DEFAULT_TARGET_MARGIN`.
- `services/priceCalculator.test.mts`: drop the Quick Quote test.

## Files Affected
- app/(app)/calculator/page.tsx
- services/priceCalculator.ts
- services/priceCalculator.test.mts

## Implementation
- Page: removed the Quick Quote section, the `targetRaw` state, `QuoteRow`, `sameMargin` and the yellow (#FFD966) target-margin row highlight from #012. The highlight was driven only by the Quick Quote's Target Margin % input. Reset now clears only the cost inputs. Cost Inputs is now a single `max-w-3xl` card (no two-column grid). Footnote and `fmtCeil` comment updated.
- Service: removed `quickQuote`, `QuickQuote` and `DEFAULT_TARGET_MARGIN`; the header comment notes that E4:G13 is intentionally not implemented.
- Test: dropped the Quick Quote (F6:G13) test. The unreachable-margin test now checks that `marginTable` yields null cells at 95% instead of calling `quickQuote`.

## Testing
- `npx tsc --noEmit` and `npx eslint` on the changed files: no errors. `node --test services/priceCalculator.test.mts`: 5/5 pass. A grep finds no remaining Quick Quote references in app/, components/ or services/.
- Live check (headless Chrome over CDP, dev server): /calculator has 2 tables (Cost Inputs, Price vs Margin), no "Quick Quote" text, no target input, 0 highlighted rows; row 1% unchanged at 1,358 | 5,431 | 61 | 1,440 | 5,759 | 80.

## Issues / Notes
- Reverses the Quick Quote part of #012. If it is wanted back, #012's entry and git history have the formulas (F6:G13) and the workbook-verified test values.

## Final Status
Completed

# Task #017 — Calculator: default Tyre Cost = 0

Date: 2026-11-23
Status: Completed

## Requirement
Make the Tyre Cost (per tyre) input default to 0 instead of 1,250.

## Planned Changes
- `services/priceCalculator.ts`: `DEFAULT_INPUTS.tyreCost` 1250 → 0 (the page and Reset both read it).
- `services/priceCalculator.test.mts`: tests that relied on the 1,250 default get explicit inputs.

## Files Affected
- services/priceCalculator.ts
- services/priceCalculator.test.mts

## Implementation
- `DEFAULT_INPUTS.tyreCost` changed from 1250 to 0. The page's initial state and the Reset button both use `DEFAULT_INPUTS`, so no page change was needed.
- Tests: added `SCREENSHOT_INPUTS` (defaults + tyre 1,250). The four tests that relied on the old default (cost totals with courier, Order-of-1 courier handling, screenshot rows, unreachable margin) now use it explicitly. New test: with the defaults every table cell is exactly +0 (not null and not -0; `assert.equal` uses Object.is).

## Testing
- `node --test services/priceCalculator.test.mts`: 6/6 pass. `npx tsc --noEmit` and `npx eslint` on the calculator files: no errors.
- Live check (headless Chrome over CDP, dev server): on load Tyre Cost = 0, row 1% = 0 | 0 | 0 | 0 | 0 | 0, Reset disabled; after typing 1250 the row is 1,358 | 5,431 | 61 | 1,440 | 5,759 | 80 and Reset is enabled; clicking Reset returns to 0 and all-zero rows.

## Issues / Notes
- With cost 0 the whole table reads 0 until a cost is entered, which is expected.

## Final Status
Completed

# Task #018 — Calculator: export to Excel (.xlsx)

Date: 2026-11-23
Status: Completed

## Requirement
Add an export of the Tyre Price Calculator to .xlsx format.

## Planned Changes
- Add `exceljs` (4.4.0, MIT) — styles + formulas. Not the npm `xlsx` 0.18.5 (abandoned on npm, known advisories, no styling in the community build). Loaded with a dynamic `import()` on click, so it isn't in the page's initial bundle.
- `services/calculatorExport.ts`: build a "Price Calculator" sheet in the source workbook's own layout (inputs B4:D14, table B16:H68, same fills/fonts/number formats). The inputs carry the current page values, and every computed cell is a live formula, so the file works as a calculator in Excel. Table formulas round up exactly like the page (`-INT(-(x − 1E-9))`), with values pre-computed by `priceCalculator.ts` so the file shows numbers before any recalculation.
- `app/(app)/calculator/page.tsx`: an "Export Excel" header button next to Reset, gated by the existing `exportCsv` feature flag (NEXT_PUBLIC_FEATURE_EXPORT).

## Files Affected
- services/calculatorExport.ts (new)
- app/(app)/calculator/page.tsx
- package.json / package-lock.json (exceljs ^4.4.0)
- CLAUDE.md (calculator route note)

## Implementation
- `services/calculatorExport.ts`: `buildCalculatorXlsx(inputs)` → ArrayBuffer, and `downloadCalculatorXlsx(inputs)` → Blob download named `Tyre-Price-Calculator-YYYY-MM-DD.xlsx`. exceljs is loaded with `await import("exceljs")` inside the call.
- Sheet "Price Calculator" uses the source workbook's layout. B1/B2 title and instructions. B4:C14 Cost Inputs: C5:C9 and C12:C14 are the page's current values (blue input fill, #0000FF font; C9 = the clamped tyre count); C10 `=C9*(C5+C6)+C7+C8`, C11 `=C10/C9`; "Inputs"/"Default" tags in D. B16 title, B17:B18 / C17:E17 / F17:H17 merged headers (fee % and "Order of N" are formulas on C9/C13/C14), and rows 19–68 for 1–50%.
- Table cells are live formulas, the workbook's own expressions wrapped as `IF(den<=0,"—",-INT(-((x)-1E-9)))`. That is the page's round-up (Math.ceil with the same epsilon) without CEILING.MATH, which needs the `_xlfn.` prefix and shows #NAME? in older readers. Net Profit is computed from the unrounded order price, as on the page. Each formula carries its pre-computed result; `calcProperties.fullCalcOnLoad` makes Excel recalculate on open.
- Fills, fonts and number formats are taken from the source workbook (#1F3864, #1F4E79, #843C0C, #5B9BD5, #2E75B6, #548235, #F4B183, #C55A11, #DDEBF7/#BDD7EE, #FCE4D6/#F8CBAD, #E2EFDA/#375623, #EDEDED); gridlines are off and the page is landscape, fit to width.
- Page: green "Export Excel" button before Reset, shown only when `features.exportCsv` (NEXT_PUBLIC_FEATURE_EXPORT) is on. It shows "Exporting…" while busy, then a success toast, or an error toast plus console.error.

## Testing
- `npx tsc --noEmit` and `npx eslint` (calculator page, calculatorExport.ts, priceCalculator.ts): no errors.
- Browser (headless Chrome over CDP, dev server): with tyre 1250, courier 40, other 20 the button produced `Tyre-Price-Calculator-2026-11-23.xlsx` (13,139 bytes) and the "Excel file downloaded" toast. The blob was captured by wrapping URL.createObjectURL; Chrome's own download also reported `completed`.
- Microsoft Excel (COM automation, CalculateFull): 0 error cells in B1:H70. C10 5,060.00 / C11 1,265.00; headers "Credit / Debit Card (2.1% fee)", "Order of 4 incl. VAT (AED)". Rows 1% / 9% / 50% are identical to the page (1,423 | 5,496 | 62 | 1,509 | 5,828 | 80, etc.). All 300 recalculated table cells equal the cached values the page wrote.
- Live formulas in Excel: setting C5=450, C7=C8=0 gives row 1% 489 | 1,955 | 22 | 519 | 2,073 | 29 and row 50% 991 | 3,964 | 1,987 | 1,121 | 4,482 | 2,258, which is the source workbook's cached values rounded up. C9=2 updates the header to "Order of 2" and D19 to 978.
- openpyxl: input fill/font, header and body fills, `#,##0` format and the merges B17:B18, C17:E17, F17:H17 confirmed.

## Issues / Notes
- `npm audit`: exceljs adds one MODERATE advisory via `uuid` (buffer bounds check in v3/v5/v6 when `buf` is passed; exceljs doesn't use that path). The other advisories, including a CRITICAL one on `next` 16.1.6, existed before this change and need a separate upgrade task.
- The export's appearance was checked through cell styles, not by eye: a PDF was rendered with Excel, but no PDF rasteriser is available here to view it.
- Typing 0 into Tyres per Order inside Excel gives #DIV/0!, as in the source workbook. The page clamps to 1 and exports the clamped value.

## Final Status
Completed

# Task #019 — Calculator: remove the "Inputs" / "Default" tag column

Date: 2026-11-24
Status: Completed

## Requirement
Remove the grey "Inputs" / "Default" labels shown in the third column of the Cost Inputs table on /calculator (user screenshot).

## Planned Changes
- `app/(app)/calculator/page.tsx`: drop the `tag` prop and its cell from `InputRow`, and the empty third cell from the header and total rows.
- `services/calculatorExport.ts`: drop the same tags (D5:D14) from the Excel export so the file keeps matching the page.

## Files Affected
- app/(app)/calculator/page.tsx
- services/calculatorExport.ts

## Implementation
- Page: removed the `tag` prop and its `<td>` from `InputRow`, the `tag="Inputs"/"Default"` props on all 10 input rows, and the empty third `<th>`/`<td>` from the header and the two total rows. Cost Inputs is now a 2-column table (label | AED value).
- Export: removed the tags written to D5:D14, the `tag` field on the row type and the unused `C.tag` colour. The input values in C5:C14 and the table formulas are unchanged.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator services/calculatorExport.ts`: no errors.
- Live check (headless Chrome over CDP, dev server): the Cost Inputs table has 2 columns and contains no "Inputs"/"Default" text (screenshot reviewed).
- Export captured from the page's Export Excel button: D5:D14 are all empty, C5:C14 still hold the inputs, and the D18 header and D19 formula are intact (openpyxl).

## Issues / Notes
- None.

## Final Status
Completed

# Task #020 — Calculator: restyle Price vs Margin table like /tc-products

Date: 2026-11-24
Status: Completed

## Requirement
Change the colours of the Price vs Margin table on /calculator. The user chose "Match the app": white rows with light grey (slate-50) stripes, a slate-800 header with white text, and green Net Profit figures, instead of the Excel sheet's blue/orange/green column fills. Mid-task the user refined this to: "use colour or hover style like tc-products this page table", which superseded the dark-header first pass.

## Planned Changes
- `app/(app)/calculator/page.tsx`: replace the workbook fills in the table header, sub-header and body cells (`TONES`, `ChannelCells`, margin column) with slate/white/emerald Tailwind classes, zebra rows and a hover state like the Supplier/TC tables. Data, rounding and layout unchanged.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- First pass (slate-800 header, zebra rows) was replaced at the user's request by the /tc-products table styling:
  - card: `bg-white rounded-xl border border-slate-200/90 shadow-2xs`
  - header: `bg-slate-50/90 backdrop-blur sticky top-0 border-b border-slate-200`, `text-[11px] font-bold uppercase tracking-wider` (slate-700 group row, slate-500 column row)
  - rows: `divide-y divide-slate-100`, `transition-colors duration-150 hover:bg-emerald-50/50`, no zebra
  - cells (from ProductTableRow): margin % as the slate tyre-size badge; Order of 1 = "Set of 4" style (`text-xs font-semibold text-slate-600 font-mono`); Order of N = "Price" style (`text-xs font-extrabold text-slate-900 font-mono`); Net Profit `text-emerald-700` (red-600 if negative)
- Removed the workbook `TONES` fills; `ChannelCells` no longer takes a tone. Extracted `ceilUp` so `fmtCeil` and the negative-profit check share the rounding. The section title changed from #1F3864 to slate-800.
- Column headings keep "(AED)"; Net Profit is shortened to "Net Profit / Order (AED)".

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, against the user's own running dev server on :3000; a second instance I started exited because the .next/dev lock was held): header background rgba(248,250,252,0.9) (slate-50/90), plain rows transparent over the white card, the hovered row (mouse moved over row 3) rgba(236,253,245,0.5) (emerald-50/50), Net Profit rgb(4,120,87) (emerald-700). Values unchanged: row 1% = 1,358 | 5,431 | 61 | 1,440 | 5,759 | 80. Screenshot reviewed.

## Issues / Notes
- Only the Price vs Margin table changed. The Cost Inputs table still uses the workbook colours (navy header, blue input cells), and the Excel export keeps the workbook look.

## Final Status
Completed

# Task #021 — Calculator: zebra rows and dark header in Price vs Margin table

Date: 2026-11-24
Status: Completed

## Requirement
Change the Price vs Margin table so the rows alternate dark/light, and show the header on a dark background.

## Planned Changes
- `app/(app)/calculator/page.tsx`: header rows → slate-800 / slate-700 with white/light text; body rows → `odd:bg-white even:bg-slate-100` zebra, keeping the emerald hover and the /tc-products cell styles from #020.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Header: group row `bg-slate-800` with white text, column row `bg-slate-700 text-slate-200`, and group dividers `border-slate-600`. The `bg-slate-50/90 backdrop-blur` light header from #020 was removed; the header stays sticky.
- Body: rows `odd:bg-white even:bg-slate-100`, dividers `divide-slate-200/70`. Hover is now opaque `hover:bg-emerald-50` (was /50) so it shows on grey rows too; Tailwind emits `hover:` after `odd:`/`even:`, so hover wins.
- Margin % badge background changed to white (border slate-300/80) so it stays visible on grey rows; the channel divider changed from slate-100 to slate-200 for the same reason.
- Cell typography (mono figures, bold Order of N, emerald Net Profit) is unchanged from #020.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, the user's running dev server): header rows rgb(30,41,59) / rgb(51,65,85) (slate-800/700); row 1 rgb(255,255,255); rows 2 and 4 rgb(241,245,249) (slate-100); hovered row 3 rgb(236,253,245) (emerald-50). Values unchanged (1% = 1,358 | 5,431 | 61 | 1,440 | 5,759 | 80). Screenshot reviewed.

## Issues / Notes
- The Cost Inputs table and the Excel export still use the workbook colours.

## Final Status
Completed

# Task #022 — Calculator: darker green row hover

Date: 2026-11-24
Status: Completed

## Requirement
Make the Price vs Margin row hover a darker green so the hovered row is clearly visible.

## Planned Changes
- `app/(app)/calculator/page.tsx`: row hover `bg-emerald-50` → `bg-emerald-200`; mark the row as a `group` and deepen the Net Profit text on hover (`group-hover:text-emerald-900`) so it stays readable on the darker fill.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Row: `hover:bg-emerald-50` → `hover:bg-emerald-200`, and `group` added to the `<tr>`.
- Net Profit cell: `group-hover:text-emerald-900` (and `group-hover:text-red-800` for a loss) so the figure keeps its contrast on the darker hover fill. Other cells (slate-600 / slate-900) already read clearly on emerald-200.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, the user's running dev server, mouse moved over row 3): hovered row rgb(167,243,208) (emerald-200), its Net Profit text rgb(6,78,59) (emerald-900); unhovered Net Profit stays rgb(4,120,87) (emerald-700); zebra rows unchanged (row 2 rgb(241,245,249)). Screenshot reviewed.

## Issues / Notes
- None.

## Final Status
Completed

# Task #023 — Calculator: click a row to keep it highlighted

Date: 2026-11-24
Status: Completed

## Requirement
When a Price vs Margin row is clicked, keep that row highlighted ("focused") in the same green as the hover, after the mouse moves away.

## Planned Changes
- `app/(app)/calculator/page.tsx`: `selectedMargin` state; clicking a row selects it, clicking it again clears it. The selected row uses the hover style (emerald-200 fill, emerald-900 Net Profit). Rows are keyboard-reachable (tabIndex, Enter/Space) with `aria-selected`. Reset also clears the selection.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- `selectedMargin` state (fraction or null) and `toggleRow`: clicking a row selects it, clicking the same row clears it, and clicking another row moves the selection. Only one row is selected at a time.
- The selected `<tr>` gets `bg-emerald-200` in place of `odd:bg-white even:bg-slate-100 hover:bg-emerald-200`. The zebra variants have higher specificity than a plain `bg-*` class, so they are swapped out rather than overridden.
- `ChannelCells` takes `selected` and applies the hover's deeper profit colour (`text-emerald-900`, or `text-red-800` for a loss) permanently while selected.
- Rows are `cursor-pointer`, `tabIndex={0}` and `aria-selected`; Enter/Space toggles, with a `focus-visible` emerald-600 outline for keyboard users.
- Reset now also clears the selection. The selection is keyed on the margin value, so it survives input changes (the table always has 1–50%).

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: no errors.
- Live check (headless Chrome over CDP, the user's running dev server, real mouse/key events): (1) click 5%, then move the mouse off the table → 5% stays rgb(167,243,208), aria-selected=true; (2) click 10% → only 10% highlighted; (3) click 10% again → nothing highlighted; (4) focus 8% and press Enter → 8% selected; (5) change tyre cost to 900 → 8% still selected. Screenshot of (1) reviewed.

## Issues / Notes
- The selection is in-memory only; a page reload clears it.

## Final Status
Completed

# Task #024 — Calculator: Outputs, Min. Margin and Constant blocks (new workbook layout)

Date: 2026-11-26
Status: Completed

## Requirement
Make the calculator match the user's updated workbook: a screenshot (13:03), then the actual file "Tyre-Price-Calculator 2.xlsx" (saved 15:00, so it is the source of truth for the formulas). The ask: keep Cost Inputs and the Price vs Margin table, and add the Outputs block (Order of 1 / Order of N incl. VAT, Margin Amount and Margin % per channel, and "Lowest Order of N Inc. VAT"), the Min. Margin % / Min. Margin Amount rows and the Constant block. Mid-task the user asked to remove the VAT / Card fee / Tabby fee rows from Cost Inputs.

## Planned Changes
- `services/priceCalculator.ts`: new inputs and a pure `sellingPriceSummary()`.
- `services/priceCalculator.test.mts`: fixtures from the screenshot.
- `app/(app)/calculator/page.tsx`: new blocks.
- `services/calculatorExport.ts`: the same blocks in the .xlsx as live formulas.

## Files Affected
- services/priceCalculator.ts
- services/priceCalculator.test.mts
- app/(app)/calculator/page.tsx
- services/calculatorExport.ts
- CLAUDE.md (test-command note: second workbook, Constant block)

## Implementation
- `priceCalculator.ts`:
  - `CalculatorInputs` gains `sellingPrice` (F8, an order of N incl. VAT, default 0), `minMarginRate` (default 0.05) and `minMarginAmount` (default 120).
  - New `marginAt`, `sellingPriceSummary` and the `MarginResult` / `SellingChannel` types.
  - The formulas are the workbook's own (F5:G11 of "Tyre-Price-Calculator 2.xlsx"):
    - Order of 1 = F8 / N. The workbook hard-codes `/4`; the page uses Tyres per Order.
    - Margin Amount = price/(1+VAT) − cost − price·fee·(1+VAT). Order of 1 uses SUM(C5:C8), like the table's C19.
    - Margin % = amount ÷ price excl. VAT. When the price is 0 it is null, where the workbook's IFERROR gives 0 / "-".
    - Lowest = MAX(cost/(1−min%−fee(1+VAT)²), (cost+minAmt)/(1−fee(1+VAT)²))·(1+VAT), and null when unreachable.
- Page:
  - Layout is Cost Inputs | Outputs + Min. Margin | Constant. Three columns at 2xl (middle column 1.35fr), two at lg.
  - Cards use `overflow-x-auto` so a narrow column scrolls instead of clipping.
  - Constant is the ONLY place VAT, card fee, Tabby fee and both minimums are edited. The rate rows were removed from Cost Inputs at the user's request, and the Min. Margin rows under Outputs are read-only copies.
  - The Order of N selling price is the blue input cell, and the Tabby column mirrors it.
  - Workbook colours: navy "Outputs" / Card headers, #843C0C Tabby header, bold #00B050 order labels, green fill on Order of 1 and Lowest.
  - Lowest shows 2 decimals, as the workbook does.
  - A negative margin shows in red.
- Export:
  - Constant block at I4:J9 (inputs).
  - C12:C14 removed, and every formula repointed from $C$12/$C$13/$C$14 to $J$5/$J$6/$J$7.
  - Outputs at E4:G11, using the workbook's formulas and its number formats (`#,##0.00;(#,##0.00);-`, `0.0%;(0.0%);-`).
  - Min. Margin at E13:F14 (=$J$8 / =$J$9).
  - Columns I and J added.
  - Fixed a temporal-dead-zone use of `pctLabel`, which is now declared before the Outputs block uses it.

## Testing
- `node --test services/priceCalculator.test.mts`: 10/10 pass, including 4 new tests. These cover the Outputs block at tyre 70 and price 430 (30.01 / 120.04 / 429.95 / 24.37 / 97.47 / 455.67, 29.3% / 23.8%), that the stricter minimum wins, that a 0 price gives a null margin %, and the table at tyre 70 (76.02 / 304.08 / 3.38 / 80.62 / 322.47 / 4.43).
- `npx tsc --noEmit` and eslint on the changed files: clean.
- Headless Chrome over CDP against the running dev server, with workbook 2's inputs (tyre 41, price 430). The page showed 107.50, 59.01 / 53.37, 57.6% / 52.1%, 236.04 / 213.47 and Lowest 305.27 / 323.52, identical to the values Excel cached in "Tyre-Price-Calculator 2.xlsx". Table 1% row: 45 / 179 / 2 / 48 / 189 / 3. No console errors.
- The first screenshot showed the Tabby column clipped at 1600px. Fixed (grid widths and overflow), re-shot, and the column is fully visible.
- Exported .xlsx (captured from the page), recalculated by Excel via COM:
  - F5:G11 and the table match the page.
  - Setting J5 to 6% updated the B16 title, F11 (308.31) and D19.
  - Setting F8 to 0 gave F7 "-" and F9 "(164.00)".

## Issues / Notes
- The workbook defines the minimums as inputs at F13:F14 and the rates at C12:C14, with no Constant block. The Constant block comes from the user's screenshot, and the user then removed the rate rows from Cost Inputs, so on the page and in the export the Constant block is the single source.
- The Outputs Margin Amount is excl. VAT, while the table's Net Profit is VAT-inclusive. Both are reproduced from the workbook as-is.
- Not committed or pushed.

## Final Status
Completed

# Task #025 — Calculator: Outputs "Order of 1" divides by 4, as in the xlsx

Date: 2026-11-26
Status: Completed

## Requirement
The user reported that the web output differs from "Tyre-Price-Calculator 2.xlsx". A 9-case comparison (the workbook recalculated by Excel vs the web math) found exactly one difference: the xlsx has `F5 = F8/4` (always ÷ 4), while the web divided by Tyres per Order. Asked which to use, the user chose "Match Excel exactly (÷ 4)".

## Planned Changes
- `services/priceCalculator.ts`: Outputs Order of 1 = selling price ÷ 4 (fixed).
- `app/(app)/calculator/page.tsx`: Outputs labels static "Order of 4" / "Lowest Order of 4", as in the xlsx.
- `services/calculatorExport.ts`: F5 `=F8/4`, static E8/E11 labels.
- `services/priceCalculator.test.mts`: a test for ÷ 4 at 2 tyres per order.

## Files Affected
- services/priceCalculator.ts
- services/priceCalculator.test.mts
- app/(app)/calculator/page.tsx
- services/calculatorExport.ts

## Implementation
- New export `OUTPUTS_ORDER_SIZE = 4`. `sellingPriceSummary` uses it for Order of 1 (price and margin) in place of Tyres per Order. A doc comment records why: the user chose to keep the xlsx's `F8/4`.
- Page: the Outputs labels are now "Order of 4 Incl. VAT" and "Lowest Order of 4 Inc. VAT" (static, as E8/E11 are plain text in the xlsx), and the footnote says Order of 1 = price ÷ 4. The Price vs Margin table still follows Tyres per Order, as its xlsx headers do (D18/G18 reference C9).
- Export: F5 `=F8/4`, and E8/E11 are plain text.

## Testing
- `node --test services/priceCalculator.test.mts`: 11/11 pass. The new test uses the Excel-recalculated xlsx at 2 tyres: Order of 1 130, margins −119.06 / −125.88.
- `npx tsc --noEmit` and eslint on the changed files: clean.
- Comparison script: copied "Tyre-Price-Calculator 2.xlsx", set 9 input cases through Excel COM, recalculated, and compared 22 cells per case (C10, C11, F5:G11, C28:H28) with the web module. Before the change, the 1-tyre and 2-tyre cases differed on F5:G7; after it, all 9 cases match on all 22 cells.
- Headless Chrome on the dev server (tyre 200, fitting 10, courier 30, 2 tyres, price 520): Order of 1 130.00; margins −119.06 / −125.88; −96.2% / −101.7%; Order of 4 margins 33.77 / 6.47; Lowest 612.69 / 649.33. No console errors.
- The exported .xlsx from that page, recalculated in Excel, gives the same values: F5 `=F8/4` = 130.00, F6 (119.06), F11 612.69, G11 649.33.

## Issues / Notes
- By the user's choice, Order of 1 is only meaningful at 4 tyres per order. At other counts it divides a C9-tyre order price by 4 but charges one tyre's full cost, exactly as the xlsx does.
- Not committed or pushed.

## Final Status
Completed

# Task #026 — Calculator: remove the intro line, Outputs footnote and table heading

Date: 2026-11-26
Status: Completed

## Requirement
Remove the lines the user marked on the calculator page: the italic intro line under the header ("Enter costs in the blue cells…"), the footnote under the Outputs block ("Type a selling price…") and the "Price vs Margin (1% – 50%)…" heading above the table.

## Planned Changes
- `app/(app)/calculator/page.tsx`: delete those three elements. The note below the table was not marked, so it stays.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Removed the intro `<p>`, the Outputs footnote `<p>` and the table's `<h2>` heading.
- Removed `vatLabel`, which only the heading used (eslint flagged it as unused).
- The Excel export is unchanged and keeps its own title, intro and heading cells (B1, B2, B16). Only the page was in scope.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: clean.
- Headless Chrome on the dev server (tyre 41, price 430): the three lines are gone, the blocks now start directly under the header, and the table follows straight after the Min. Margin card. Values are unchanged (Lowest 305.27 / 323.52) and there are no console errors. Screenshot reviewed.

## Issues / Notes
- Not committed or pushed.

## Final Status
Completed

# Task #027 — Calculator: colour each Price vs Margin column like the workbook

Date: 2026-11-26
Status: Completed

## Requirement
"Make a col on colour". Asked to clarify, the user chose "Each column its own colour", like the Excel workbook: Card columns in blue shades, Tabby/Tamara in orange shades, Net Profit in green, Margin % in grey, with headers and cells both coloured. Mid-task the user added "keep the row hover".

## Planned Changes
- `app/(app)/calculator/page.tsx`: workbook fills on the headers and body cells, with hover and the click-selected row still highlighting the whole row.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Group headers: Margin % #3A3A3A, Card #1F4E79, Tabby / Tamara #843C0C.
- Sub-headers: #5B9BD5 / #2E75B6 / #548235 (Card) and #F4B183 / #C55A11 / #548235 (Tabby). These are the xlsx's own C18:H18 fills.
- Body cells use the xlsx's C19:H19 fills and fonts:
  - Margin % #EDEDED
  - Card #DDEBF7 / #BDD7EE, text #1F4E79
  - Tabby #FCE4D6 / #F8CBAD, text #843C0C
  - Net Profit #E2EFDA, text #375623 (red-700 for a loss)
  - Defined in `CARD_COLS` / `BNPL_COLS` and passed to `ChannelCells` as `palette`.
- Row hover kept: the fill now lives on the cells, so each cell carries `group-hover:bg-emerald-200` and a hovered row turns fully emerald-200, as before. A clicked (selected) row swaps every cell to `bg-emerald-200` (`cellBg` helper), dropping the column fill rather than overriding it.
- The white/grey zebra rows (TASK_LOG #021) are replaced by the column colours. Rows are separated by white dividers.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: clean.
- Headless Chrome against the user's dev server: the headers rendered the new colours. The body cells had the right classes, but the dev server's CSS bundle was STALE. `#BDD7EE`, `#FCE4D6`, `#F8CBAD` and `group-hover:bg-emerald-200` were missing from the served CSS even after touching `app/globals.css` (mtime only, no content change). This is the Turbopack PostCSS worker of the running dev server (started 14:58), not the code.
- `npx tailwindcss -c tailwind.config.js -i app/globals.css` generates all of those classes, including `.group:hover .group-hover\:bg-emerald-200`.
- With that freshly generated CSS injected into the page (real mouse events over CDP): row 1% computed fills are #EDEDED, #DDEBF7, #BDD7EE, #E2EFDA, #FCE4D6, #F8CBAD, #E2EFDA, all as specified. The hovered row 2% and the clicked row 5% are emerald-200 on every cell, and unhovered rows keep their column colours. Screenshot reviewed. No console errors.

## Issues / Notes
- The user's running dev server must be restarted (`npm run dev`) to pick up the new classes. Until then, three body columns render white and the row hover does not show there.
- Not committed or pushed.

## Final Status
Completed

# Task #028 — Dev server served stale CSS: row hover and 3 column colours missing

Date: 2026-11-26
Status: Completed

## Requirement
After the user restarted the dev server (as advised in #027), the Price vs Margin row hover still did not work.

## Planned Changes
- No code change: find why the restarted server still lacked the classes, clear it, and document the trap in CLAUDE.md.

## Files Affected
- CLAUDE.md (Build & Development Commands: stale Tailwind CSS trap)

## Implementation
- Root cause: Turbopack's persistent dev cache (`.next/dev/cache/turbopack`, 400 MB). After the restart (new PIDs 22720 / 14908, 15:38) the served CSS had the SAME hash (`8b48e673`) and still lacked `bg-[#BDD7EE]`, `bg-[#FCE4D6]`, `bg-[#F8CBAD]` and `group-hover:bg-emerald-200`, although the page markup carried them and the Tailwind CLI generates them. Tailwind v3's content-file changes did not invalidate the cached CSS.
- Fix: stopped the dev server (PIDs 22720, 14908), deleted `.next/dev/cache/turbopack` (a regenerable build cache), and restarted `npm run dev` (now a background process of this session, ready in 2.7 s).
- CLAUDE.md: documented the symptom, the cause and the fix next to `npm run dev`.

## Testing
- Served CSS after the cache clear contains #BDD7EE, #FCE4D6 and #F8CBAD.
- Headless Chrome with real mouse events: row 1% fills are #EDEDED / #DDEBF7 / #BDD7EE / #E2EFDA / #FCE4D6 / #F8CBAD / #E2EFDA. The hovered row 2% and the clicked row 5% are emerald-200 on all 7 cells, and the other rows keep their column colours. No console errors.

## Issues / Notes
- The dev server now runs as a background process started by Claude Code, not in the user's terminal. The user can stop it and run `npm run dev` themselves at any time; the cleared cache stays cleared.
- Not committed or pushed.

## Final Status
Completed

# Task #029 — Calculator: click the Card / Tabby header to copy the selected row's prices

Date: 2026-11-26
Status: Completed

## Requirement
Clicking the "Credit / Debit Card" header in the Price vs Margin table copies the prices to the clipboard in this format:

    Credit Card Payment Price
    1 Tyre: AED 174.00
    4 Tyres: AED 533.00

## Planned Changes
- `services/priceCalculator.ts`: pure `paymentPriceText(title, orderOfOne, orderOfN, n)`.
- `services/priceCalculator.test.mts`: format test.
- `app/(app)/calculator/page.tsx`: Card and Tabby / Tamara group headers become copy buttons for the clicked (selected) row.

## Files Affected
- services/priceCalculator.ts
- services/priceCalculator.test.mts
- app/(app)/calculator/page.tsx

## Implementation
- `paymentPriceText` builds "<title>\n1 Tyre: AED x\n<N> Tyres: AED y".
  - Prices are rounded UP to the whole AED with the table's own rule (`Math.ceil(x − 1e-9) || 0`), shown with .00 and thousands separators, so the copied text always equals the figures on screen.
  - The singular "Tyre" is used when N = 1.
  - It returns null when a price is unreachable.
- Page:
  - The "Credit / Debit Card" and "Tabby / Tamara" group headers are now `<button>`s (`CopyHeaderButton`, with a clipboard icon and a hover tint) calling `copyPrices("card" | "bnpl")`.
  - The copied row is the clicked (selected) one. Titles are "Credit Card Payment Price" (as the user specified) and "Tabby / Tamara Payment Price" (same pattern; the user asked only for card).
  - Toasts:
    - success: "Copied card prices at 10% margin"
    - no row selected: "Click a margin row first, then the header to copy its prices"
    - unreachable margin: "No price is possible at this margin"
    - clipboard failure: "Could not copy to the clipboard"
  - Uses `navigator.clipboard.writeText` like the other pages. It needs a secure context, which localhost and the https Vercel domains are.

## Testing
- `node --test services/priceCalculator.test.mts`: 12/12 pass. The new test covers the user's exact sample (173.2 / 532.01 → "AED 174.00" / "AED 533.00"), thousands separators (AED 5,431.00), the singular at N = 1, and null.
- `npx tsc --noEmit` and eslint on the changed files: clean.
- Headless Chrome on the dev server, with real mouse clicks and `clipboard.writeText` stubbed to capture the text:
  1. Header click with no row selected: nothing copied, and the "Click a margin row first" toast appears.
  2. Select 10% (on screen 50 / 197 / 20 / 53 / 210 / 22), then click the Card header. Copied "Credit Card Payment Price\n1 Tyre: AED 50.00\n4 Tyres: AED 197.00".
  3. Click the Tabby header. Copied "Tabby / Tamara Payment Price\n1 Tyre: AED 53.00\n4 Tyres: AED 210.00".
  4. Success toasts shown, no console errors, screenshot reviewed.

## Issues / Notes
- The real OS clipboard was not exercised (headless Chrome has no focused clipboard), only the text handed to `navigator.clipboard.writeText`.
- Not committed or pushed.

## Final Status
Completed

# Task #030 — Calculator: copy from the row's cells (Card, Tabby, Margin % = both), not the header

Date: 2026-11-26
Status: Completed

## Requirement
- From the user's screenshot on #029: "Do not show here" (the copy icon/button on the Credit / Debit Card header) and "Show in this" (the Card body cells). Clicking a row's Card cells copies that row's card prices; the same for Tabby / Tamara.
- Mid-task the user added: clicking the Margin % cell copies the row with both blocks:

      Credit Card Payment Price
      1 Tyre: AED …
      4 Tyres: AED …

      Tabby/Tamara Payment Price
      1 Tyre: AED …
      4 Tyres: AED …

## Planned Changes
- `app/(app)/calculator/page.tsx`:
  - Headers back to plain text.
  - Card / Tabby cells copy their channel; the Margin % cell copies both.
  - A copy icon in the cells.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Removed `CopyHeaderButton`; the two group headers are plain text again.
- `copyPrices(row, "card" | "bnpl" | "both")` replaces the header-based copy:
  - It always selects the clicked row (never toggles off), so copying twice keeps the highlight.
  - "both" joins the card and Tabby blocks with one blank line.
  - Titles live in `PAYMENT_TITLES`: "Credit Card Payment Price" and "Tabby/Tamara Payment Price". The latter follows the user's new spelling, with no spaces around the slash, and the Tabby-cell copy uses it too.
  - Toasts read "Copied card + Tabby/Tamara prices at 3% margin" etc.; a null price gives "No price is possible at this margin".
- `ChannelCells` takes `onCopy` and `copyLabel` (tooltip). All three cells copy, and `stopPropagation` stops the row's toggle from undoing the selection. The Margin % cell does the same for "both".
- A copy icon (`ClipboardDocumentIcon`) shows in each channel's Order of 1 cell on the SELECTED row only. It is conditionally rendered with an inline `opacity: 0.7` instead of hover classes: the user's dev server served stale CSS again, so the first version's `opacity-0 group-hover:opacity-70` rendered as a fully visible icon on every row (see #028).
- Deselecting is now via keyboard (Enter/Space on a focused row) or Reset, since every cell click copies and selects.
- The paste in the request had blank lines between every line. The copy uses single line breaks inside a block, matching the user's first sample in #029, plus one blank line between the blocks.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: clean.
- Headless Chrome against the user's own dev server (port 3000, started 15:50; my extra server could not take the `.next/dev` lock), with real mouse clicks and `clipboard.writeText` stubbed. On row 3% (46 / 182 / 6 / 49 / 194 / 7):
  1. Margin % cell → "Credit Card Payment Price\n1 Tyre: AED 46.00\n4 Tyres: AED 182.00\n\nTabby/Tamara Payment Price\n1 Tyre: AED 49.00\n4 Tyres: AED 194.00", with the row selected.
  2. Margin % again → same text, row still selected.
  3. Card Order of N cell → card block only.
  4. Tabby Order of 1 cell → Tabby block only.
- The header has 0 buttons and 0 icons. Body icons: 0 before any click, 2 (one per channel) on the selected row. Toasts correct, no console errors, screenshot reviewed.
- An earlier run of the first version (before the Margin % request) also confirmed that the Card cells on 3% and 7% copied their own rows.

## Issues / Notes
- The real OS clipboard was not exercised (headless), only the text handed to `navigator.clipboard.writeText`.
- Not committed or pushed.

## Final Status
Completed

# Task #031 — Calculator: remove the note under the table and reduce the row height

Date: 2026-11-26
Status: Completed

## Requirement
- Remove the footnote below the Price vs Margin table ("Order of 1 carries the full courier and other cost; Order of 4 spreads it across the order. Net Profit per Order = … Table values are rounded up to the whole AED.").
- Mid-task the user added "reduse the col hight": make the table rows shorter.

## Planned Changes
- `app/(app)/calculator/page.tsx`:
  - Delete the footnote `<p>`.
  - Reduce the vertical padding of the table body cells.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Removed the footnote paragraph under the table.
- Table body cells (the Margin % cell and the three cells per channel): `py-2` → `py-1`. The header rows are unchanged.
  - Only classes the page already used are involved (`py-1` is on the input cells), so the stale dev CSS issue (#028) cannot leave a rule missing.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: clean.
- Headless Chrome against the user's running dev server:
  - The footnote text is gone, and the table still has 50 rows.
  - Body row height went from 42.1 px to 34.1 px, and the visible rows in the 70vh table box went from 13 to 16 (at 1600×900).
  - No console errors. Screenshot reviewed.

## Issues / Notes
- The row height is now set by the Margin % badge (`py-0.5` with a border). It can go lower by trimming the badge if wanted.
- Not committed or pushed.

## Final Status
Completed

# Task #032 — Calculator: remove the vertical padding from the table rows

Date: 2026-11-26
Status: Completed

## Requirement
"Remove the py-1 in the row" of the Price vs Margin table (screenshot): the body cells get no vertical padding.

## Planned Changes
- `app/(app)/calculator/page.tsx`: drop `py-1` from the 4 body-cell class lists (Margin % cell and the three channel cells). Headers unchanged.

## Files Affected
- app/(app)/calculator/page.tsx

## Implementation
- Removed `py-1` from the Margin % `<td>` and the three `ChannelCells` `<td>`s, so the body cells have no vertical padding. The row height now comes from the content: the Margin % badge (`py-0.5` with a border) is the tallest item.
- The `py-1` on the Cost Inputs / Outputs input cells (lines 137 and 340) is not part of this table and was left alone.

## Testing
- `npx tsc --noEmit` and `npx eslint app/(app)/calculator`: clean.
- Headless Chrome against the user's running dev server: body row height went from 34.1 px to 28.1 px (42.1 px before #031), and the visible rows went from 16 to 19 at 1600×900. No console errors. Screenshot reviewed: figures and badges are not clipped.

## Issues / Notes
- Not committed or pushed.

## Final Status
Completed
