"use client";

// Market notes as spine markers (rails-ops TO-DO-ui-jobs item 118): one gap
// component (`NoteGap`) at both widths, its sizes set per breakpoint.
//
// A closed note is a MARKER in the gap between the two events it sits
// between: a hollow diamond on the line with a direction arrow beside it, in
// the spine's neutral ink (a rate rise is bad for a borrower and good for a
// supplier, so no green or red). Several notes in one gap (a Types of event
// filter hid the events between them) stack in date order: one target apart
// on a phone, one open row apart from 640px.
// A marker stays when a filter hides the events either side of it: it
// describes the market, not the account.
//
// PHONE. The tap target is 44 × 64px, and a gap holding markers grows by about
// 20px, plus one target per extra marker, so the target clears the captions
// around it. A tap opens the note in place, row and panel together, and the
// diamond stays on the line filled, with the note's figure beside it; a tap on
// it puts the note back to a marker. Notes share the spine view's one open id
// with the event cards (`note:<id>`), so opening a note closes an open card
// and the reverse.
//
// DESKTOP. A closed marker's slot takes the height of the note's open header
// row, and the marker sits where that row's node stands, so the spine keeps
// its rhythm whether notes are shown as markers or rows, and the diamond does
// not move as the note opens and closes (Miles, 18 Oct 2026, superseding the
// 30 Sep sizing; rails-ops architecture/market-notes.md §10). Its target is
// 28 × 64px. A click opens the note's row and panel in place; the row's node
// is the diamond, filled, and a click on it puts the note back to a marker.
// The phone keeps its short gap above. Notes open independently of each other
// and of the event cards. Display's "Open all market notes" shows every note as
// its header row, and the diamonds do nothing until it is turned off.
//
// The marker is a sibling of the rows and the segments' buttons, never inside
// one. The list's line runs behind the markers (`SpineLine`), so a gap draws
// no line of its own.

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { useTimelineScale } from "@/components/shared/activity-timeline";
import {
  LiveNoteGroupRow,
  liveGroupMarkerText,
  MarketNoteRow,
  noteMarkerText,
} from "@/components/shared/market-note-row";
import { isPhoneViewport, useSpineView } from "@/components/shared/mobile-spine";
import { PulsingDot, type SpineTip } from "@/components/shared/spine-column";
import { isLiveNoteGroup, type LiveNoteGroup, type MarketNote } from "@/lib/shared/market-note";
import { formatDate } from "@/lib/date";

/** The phone marker's tap target: 44px tall, 64px wide. */
const TARGET = 44;
/** A plain gap's growth for one marker on a phone: 44px of bare line in all. */
const GROWTH = 20;
/** The caption's padding below it, inside the segment above the gap. */
const CAPTION_PAD = 10;

/** What a gap holds: a note, or the head slot's live notes as one card. The
 *  group takes one marker, one open state and one row, as a note does. */
export type GapItem = MarketNote | LiveNoteGroup;

export const noteOpenId = (item: GapItem) => `note:${item.id}`;

const markerText = (item: GapItem) => (isLiveNoteGroup(item) ? liveGroupMarkerText(item) : noteMarkerText(item));

function markerLabel(item: GapItem): string {
  if (isLiveNoteGroup(item)) return liveGroupMarkerText(item).spoken;
  const note = item;
  const when = note.live ? "now" : note.to.timestamp > 0 ? formatDate(note.to.timestamp) : null;
  const title = (note.kind === "vault-terms" && note.title) || "Market note";
  return `${title}${when ? `, ${when}` : ""}: ${noteMarkerText(note).spoken}`;
}

/** Where focus lands when an item opens: the note's header, or the group's
 *  first line. */
const openFocusSelector = (item: GapItem) =>
  isLiveNoteGroup(item)
    ? `[data-live-note-group] [role="button"]`
    : `[data-market-note="${CSS.escape(item.id)}"] [role="button"]`;

function Diamond({ filled }: { filled: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="block shrink-0"
      data-spine-node="marker"
    >
      <rect
        x={3}
        y={3}
        width={10}
        height={10}
        transform="rotate(45 8 8)"
        fill={filled ? "currentColor" : "var(--background)"}
        stroke="currentColor"
        strokeWidth={1.25}
      />
    </svg>
  );
}

function Direction({ note }: { note: GapItem }) {
  // A group draws the direction its notes share, and none where they part.
  let rising: boolean;
  if (isLiveNoteGroup(note)) {
    const ups = note.notes.filter((n) => n.to.value >= n.from.value).length;
    if (ups !== 0 && ups !== note.notes.length) return null;
    rising = ups > 0;
  } else {
    if (note.kind === "vault-terms") return null;
    rising = note.to.value >= note.from.value;
  }
  const Icon = rising ? ArrowUpRight : ArrowDownRight;
  return <Icon size={14} strokeWidth={2} className="block shrink-0 text-rb-500" aria-hidden="true" />;
}

/** The desktop marker's target: 28px tall, so it clears the glyphs above and
 *  below it, and 64px wide. */
const LIST_TARGET = 28;
/** The open row's node: 32px below its column's top. */
const LIST_NODE_Y = 32;
/** The open row's header panel (note-row-shell.tsx): its 16px top padding
 *  (`pt-4`), the 28px line of marks (24px marks in 2px chips) and its 12px
 *  bottom padding (`pb-3`). */
const NOTE_HEADER = 16 + 28 + 12;
/** The live group's card at rest (`LiveNoteGroupRow`, market-note-row.tsx):
 *  its title line (16px top padding, a 16px `text-xs` line, 4px below), one
 *  40px line per note (`py-1.5` around the 28px marks) and its 6px bottom
 *  padding (`pb-1.5`). */
const GROUP_TITLE = 16 + 16 + 4;
const GROUP_LINE = 12 + 28;
const GROUP_FOOT = 6;
/** From 640px a closed marker's slot is its open row at rest, and the marker
 *  stands on that row's node (Miles, 18 Oct 2026). Between two rows the open
 *  row starts 8px down (its `pt-2`), then the row's padding either side of the
 *  header panel: 72px at the timeline's 4px card padding. In the head slot
 *  the row starts at the slot's top: 64px. Exported for the head slot's
 *  reservation while the live notes load. */
export const noteRowHeight = (cardPad: number, head: boolean) => (head ? 0 : 8) + 2 * cardPad + NOTE_HEADER;
/** The slot one item takes from 640px: a note's row, or the live group's card
 *  with its lines. */
const itemHeight = (item: GapItem, cardPad: number, head: boolean) =>
  isLiveNoteGroup(item)
    ? (head ? 0 : 8) + 2 * cardPad + GROUP_TITLE + GROUP_LINE * item.notes.length + GROUP_FOOT
    : noteRowHeight(cardPad, head);
/** The open row's node centre below its top, the `pt-2` included. */
const noteNodeY = (cardPad: number, head: boolean) => (head ? 0 : 8) + cardPad + LIST_NODE_Y;

/** A marker's box, per width: `--mk-top-p`/`--mk-top-d` set its top on a
 *  phone and from 640px. Centred on the spine: the row's middle on a phone,
 *  the 2/5 column's centre from 640px (`--spine-x`). The tooltip is drawn
 *  from `data-tip` as generated content, so it adds no text to the page: the
 *  open row's diamond sits inside the note row, and a text node there would
 *  read as part of the row's header. */
const MARKER_CLASS =
  "group/mk absolute z-20 flex w-16 items-center gap-0.5 rounded-lg pl-[14px] text-rb-500 hover:text-foreground focus-visible:outline-2 focus-visible:outline-teal-500 " +
  "left-[calc(50%-22px)] top-[var(--mk-top-p)] h-11 sm:left-[calc(var(--spine-x)-22px)] sm:top-[var(--mk-top-d)] sm:h-7 " +
  "after:content-[attr(data-tip)] after:pointer-events-none after:absolute after:left-full after:top-1/2 after:ml-1.5 after:-translate-y-1/2 after:whitespace-nowrap after:rounded-md after:border after:border-rb-200 after:bg-raised after:px-2 after:py-1 after:text-xs after:font-medium after:text-foreground after:opacity-0 after:shadow-md after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100 dark:after:border-rb-700 " +
  // On a phone the tip stands above the marker and takes no room until shown.
  "max-sm:after:hidden max-sm:after:left-0 max-sm:after:top-auto max-sm:after:bottom-full max-sm:after:mb-1 max-sm:after:ml-0 max-sm:after:translate-y-0 max-sm:hover:after:block max-sm:focus-visible:after:block";

/** The spine's x in a row from 640px: the centre of the 2/5 column inside the
 *  row's `--card-pad`. */
const SPINE_X = "calc(var(--card-pad) + (100% - 2 * var(--card-pad)) * 0.2)";

/** The notes in one gap of the timeline, closed ones as markers and open ones
 *  as their rows, at both widths.
 *
 *  A phone holds one note open, sharing the timeline's one open id with the
 *  cards (`note:<id>`), and opens a note to its row and panel together.
 *  Desktop notes open independently from their markers (`openIds`), and
 *  Display's "Open all market notes" (`openAll`) shows every note as its
 *  header row with the diamonds inert. The click reads the viewport at the
 *  moment of the click to choose.
 *
 *  `head` is the slot above the newest row: `tip` draws the tip's dot above
 *  the markers. */
export function NoteGap({
  notes,
  datePrefixFor,
  openIds,
  openAll,
  onToggle,
  head,
}: {
  notes: GapItem[];
  datePrefixFor: (note: MarketNote) => string | null;
  /** The notes opened from their markers on desktop. */
  openIds: ReadonlySet<string>;
  /** "Open all market notes": every note shows its header row. */
  openAll: boolean;
  onToggle: (note: GapItem) => void;
  head?: { tip: SpineTip | null };
}) {
  const phone = useSpineView();
  const ref = useRef<HTMLDivElement>(null);
  // Focus follows the click: opening a marker moves it to the note's header,
  // closing returns it to the marker.
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    const want = focusNext.current;
    if (!want || !ref.current) return;
    focusNext.current = null;
    ref.current.querySelector<HTMLElement>(want)?.focus({ preventScroll: true });
  });

  const phoneOpen = (note: GapItem) => phone?.openId === noteOpenId(note);
  const toggle = (note: GapItem, opening: boolean) => {
    focusNext.current = opening ? openFocusSelector(note) : `[data-note-marker="${CSS.escape(note.id)}"]`;
    if (opening) {
      if (phone && isPhoneViewport() && ref.current) phone.toggle(noteOpenId(note), ref.current);
      else onToggle(note);
      return;
    }
    if (phoneOpen(note) && phone && ref.current) phone.toggle(noteOpenId(note), ref.current);
    if (openIds.has(note.id)) onToggle(note);
  };

  // Closed notes side by side share one slot; an open one breaks the run.
  const groups: ({ open: false; notes: GapItem[] } | { open: true; note: GapItem; panel: boolean })[] = [];
  for (const note of notes) {
    const panel = phoneOpen(note) || openIds.has(note.id);
    if (panel || openAll) groups.push({ open: true, note, panel });
    else {
      const last = groups[groups.length - 1];
      if (last && !last.open) last.notes.push(note);
      else groups.push({ open: false, notes: [note] });
    }
  }

  const tip = head?.tip ?? null;
  return (
    <div
      ref={ref}
      data-note-gap={head ? "head" : ""}
      data-anatomy={head ? "L5" : "L7"}
      // Between two rows the gap cancels the list's 8px, so its growth is what
      // the markers ask for; the head slot keeps it.
      className={`relative flex flex-col ${head ? "" : "-mt-2"}`}
      style={{ "--spine-x": SPINE_X, paddingTop: tip ? 22 : 0 } as CSSProperties}
    >
      {tip && (
        <div aria-hidden className="absolute left-1/2 top-0 z-20 -translate-x-1/2 sm:left-[var(--spine-x)]">
          <PulsingDot side={tip} />
        </div>
      )}
      {groups.map((g) =>
        g.open ? (
          <OpenNote
            key={g.note.id}
            note={g.note}
            panel={g.panel}
            head={!!head}
            openAll={openAll}
            datePrefix={isLiveNoteGroup(g.note) ? null : datePrefixFor(g.note)}
            onClose={() => toggle(g.note, false)}
          />
        ) : (
          <MarkerSlot key={g.notes[0].id} notes={g.notes} head={!!head} onOpen={(note) => toggle(note, true)} />
        ),
      )}
    </div>
  );
}

/** A run of closed markers in one gap, sized per width. On a phone the gap
 *  grows by `GROWTH` for the first marker and a full target for each further
 *  one, the stack centred on the bare line between the caption above and the
 *  next node. From 640px each marker takes its open row's height (the live
 *  group's, its card's) and stands on that row's node, in the head slot as
 *  between two rows. */
function MarkerSlot({ notes, head, onOpen }: { notes: GapItem[]; head: boolean; onOpen: (note: GapItem) => void }) {
  const { cardPad } = useTimelineScale();
  const n = notes.length;
  const heightP = head ? TARGET * n : GROWTH + TARGET * (n - 1);
  const regionTop = -(CAPTION_PAD + cardPad);
  const regionHeight = heightP + CAPTION_PAD + 2 * cardPad + 8 + 16 + 4;
  const centreP = (i: number) =>
    head ? TARGET * i + TARGET / 2 : regionTop + regionHeight / 2 + (i - (n - 1) / 2) * TARGET;
  const tops = notes.map((_, i) => notes.slice(0, i).reduce((y, note) => y + itemHeight(note, cardPad, head), 0));
  const heightD = tops[n - 1] + itemHeight(notes[n - 1], cardPad, head);
  const centreD = (i: number) => tops[i] + noteNodeY(cardPad, head);
  return (
    <div
      className="relative h-[var(--slot-h-p)] sm:h-[var(--slot-h-d)]"
      style={{ "--slot-h-p": `${heightP}px`, "--slot-h-d": `${heightD}px` } as CSSProperties}
    >
      {notes.map((note, i) => (
        <button
          key={note.id}
          type="button"
          data-note-marker={note.id}
          aria-expanded={false}
          aria-label={markerLabel(note)}
          onClick={() => onOpen(note)}
          data-tip={markerText(note).tip}
          className={MARKER_CLASS}
          style={
            {
              "--mk-top-p": `${centreP(i) - TARGET / 2}px`,
              "--mk-top-d": `${centreD(i) - LIST_TARGET / 2}px`,
            } as CSSProperties
          }
        >
          <Diamond filled={false} />
          <Direction note={note} />
        </button>
      ))}
    </div>
  );
}

/** An open note. On a phone: the filled diamond on the line with the note's
 *  figure beside it, then the note row with its panel open. From 640px: the
 *  note row, its node the filled diamond, under which the same control puts
 *  the note back to a marker (inert while "Open all market notes" is on). */
function OpenNote({
  note,
  panel,
  head,
  openAll,
  datePrefix,
  onClose,
}: {
  note: GapItem;
  panel: boolean;
  head: boolean;
  openAll: boolean;
  datePrefix: string | null;
  onClose: () => void;
}) {
  const { tip } = markerText(note);
  const { cardPad } = useTimelineScale();
  // From 640px the control lies over the row's node.
  const nodeTop = noteNodeY(cardPad, head) - LIST_TARGET / 2;
  const inert = openAll && !panel;
  return (
    <div data-note-open={note.id} className={`relative max-sm:pb-2 ${head ? "" : "sm:pt-2"}`}>
      <button
        type="button"
        data-note-marker={note.id}
        aria-expanded
        aria-disabled={inert || undefined}
        aria-label={markerLabel(note)}
        onClick={inert ? undefined : onClose}
        data-tip={tip}
        className={`${MARKER_CLASS}${inert ? " cursor-default" : ""}`}
        style={{ "--mk-top-p": "0px", "--mk-top-d": `${nodeTop}px` } as CSSProperties}
      >
        <span className="contents sm:hidden">
          <Diamond filled />
          <Direction note={note} />
        </span>
        <span aria-hidden className="hidden h-4 w-4 shrink-0 sm:block" />
      </button>
      {/* The caption beside the diamond wraps inside the row on a phone: a
          long one ("5 market notes since the last event") takes a second line
          and the slot grows to hold it. */}
      <div className="sm:hidden" style={{ minHeight: TARGET, paddingTop: 12, paddingLeft: "calc(50% + 44px)" }}>
        <span aria-hidden className="block text-xs leading-5 text-foreground">
          {tip}
        </span>
      </div>
      <div data-spine-card={noteOpenId(note)}>
        {isLiveNoteGroup(note) ? (
          // The group opens to its lines, each closed.
          <LiveNoteGroupRow group={note} opened />
        ) : (
          <MarketNoteRow
            // Remounts when a marker opens it, so the panel opens with it.
            key={panel ? "panel" : "row"}
            note={note}
            datePrefix={datePrefix}
            defaultOpen={panel}
            opened
          />
        )}
      </div>
    </div>
  );
}
