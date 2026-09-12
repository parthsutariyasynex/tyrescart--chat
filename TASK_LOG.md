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
