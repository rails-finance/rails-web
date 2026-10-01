"use client";

// Market notes as spine markers (rails-ops TO-DO-ui-jobs item 118), in the
// phone spine view (`SpineNoteGap`) and the desktop list view (`ListNoteGap`).
//
// A closed note is a MARKER in the gap between the two events it sits
// between: a hollow diamond on the line with a direction arrow beside it, in
// the spine's neutral ink (a price fall is bad for a borrower and good for
// others, so no green or red). Several notes in one gap (a Types of event
// filter hid the events between them) stack in date order, one target apart.
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
// DESKTOP. The marker sits on the join between two rows, in the bare line
// their padding leaves, and takes no row height; its target is 28 × 64px so it
// clears the event glyphs above and below. A click opens the note's row and
// panel in place; the row's node is the diamond, filled, and a click on it
// puts the note back to a marker. Notes open independently of each other and
// of the event cards. Display's "Open all market notes" shows every note as
// its header row, and the diamonds do nothing until it is turned off.
//
// The marker is a sibling of the rows and the segments' buttons, never inside
// one.

import { useLayoutEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { useTimelineScale } from "@/components/shared/activity-timeline";
import {
  LiveNoteGroupRow,
  liveGroupMarkerText,
  MarketNoteRow,
  noteMarkerText,
} from "@/components/shared/market-note-row";
import {
  SPINE_LINE_OVERSHOOT,
  spineLineKey,
  spineLineStyle,
  useExtendLineAbove,
  useSpineView,
} from "@/components/shared/mobile-spine";
import { PulsingDot, SPINE_COLORS, type SpineTip } from "@/components/shared/spine-column";
import { isLiveNoteGroup, type LiveNoteGroup, type MarketNote } from "@/lib/shared/market-note";
import { formatDate } from "@/lib/date";

/** The marker's tap target: 44px tall on the phone, 64px wide. */
const TARGET = 44;
/** A plain gap's growth for one marker: 44px of bare line in all. */
const GROWTH = 20;
/** The caption's own padding below it, inside the segment above the gap. */
const CAPTION_PAD = 10;
/** A note's line: dotted and neutral, since the account did nothing here. */
const NOTE_LINE = spineLineKey(true, SPINE_COLORS.default);

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
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" className="block shrink-0">
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

const MARKER_CLASS =
  "group/mk absolute z-20 flex w-16 items-center gap-0.5 rounded-lg pl-[14px] text-rb-500 hover:text-foreground focus-visible:outline-2 focus-visible:outline-teal-500";

/** One closed marker, with its tooltip on hover and keyboard focus. */
function Marker({ note, top, onOpen }: { note: GapItem; top: number; onOpen: () => void }) {
  const { tip } = markerText(note);
  return (
    <button
      type="button"
      data-note-marker={note.id}
      aria-expanded={false}
      aria-label={markerLabel(note)}
      onClick={onOpen}
      className={MARKER_CLASS}
      style={{ left: "calc(50% - 22px)", top, height: TARGET }}
    >
      <Diamond filled={false} />
      <Direction note={note} />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-md border border-rb-200 bg-raised px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-md transition-opacity group-hover/mk:opacity-100 group-focus-visible/mk:opacity-100 dark:border-rb-700"
      >
        {tip}
      </span>
    </button>
  );
}

/** A run of closed markers in one gap. The gap grows by `GROWTH` for the
 *  first and a full target for each further one; the line that ends in the
 *  gap is lengthened by the same amount. */
function MarkerSlot({
  notes,
  onOpen,
  head,
}: {
  notes: GapItem[];
  onOpen: (note: GapItem) => void;
  /** In the head slot, above the newest event: nothing stands above it, so
   *  the slot draws its own line (and the tip's dot, when it holds the tip). */
  head: boolean;
}) {
  const scale = useTimelineScale();
  const ref = useRef<HTMLDivElement>(null);
  const n = notes.length;
  const height = head ? TARGET * n : GROWTH + TARGET * (n - 1);
  useExtendLineAbove(ref, height, !head);
  // The bare line the markers share runs from the caption above to the next
  // node: centre the stack on it.
  const regionTop = -(CAPTION_PAD + scale.cardPad);
  const regionHeight = height + CAPTION_PAD + 2 * scale.cardPad + 8 + 16 + 4;
  const centre = (i: number) =>
    head ? TARGET * i + TARGET / 2 : regionTop + regionHeight / 2 + (i - (n - 1) / 2) * TARGET;
  return (
    <div ref={ref} className="relative" style={{ height }}>
      {notes.map((note, i) => (
        <Marker key={note.id} note={note} top={centre(i) - TARGET / 2} onOpen={() => onOpen(note)} />
      ))}
    </div>
  );
}

/** An open note: the filled diamond on the line with the note's figure beside
 *  it, then the note row with its panel open. */
function OpenNote({ note, datePrefix, onClose }: { note: GapItem; datePrefix: string | null; onClose: () => void }) {
  const { tip } = markerText(note);
  return (
    <div data-note-open={note.id} className="relative isolate pb-2">
      <div
        aria-hidden
        data-spine-line=""
        className="absolute left-1/2 -z-10 w-px -translate-x-1/2"
        style={{ top: "calc(var(--card-pad) + 24px)", bottom: SPINE_LINE_OVERSHOOT, ...spineLineStyle(NOTE_LINE) }}
      />
      <div className="relative" style={{ height: TARGET }}>
        <button
          type="button"
          data-note-marker={note.id}
          aria-expanded
          aria-label={markerLabel(note)}
          onClick={onClose}
          className={MARKER_CLASS}
          style={{ left: "calc(50% - 22px)", top: 0, height: TARGET }}
        >
          <Diamond filled />
          <Direction note={note} />
        </button>
        <span
          aria-hidden
          className="absolute whitespace-nowrap text-xs leading-5 text-foreground"
          style={{ left: "calc(50% + 44px)", top: 12 }}
        >
          {tip}
        </span>
      </div>
      <div data-spine-card={noteOpenId(note)}>
        {isLiveNoteGroup(note) ? (
          <LiveNoteGroupRow group={note} />
        ) : (
          <MarketNoteRow note={note} datePrefix={datePrefix} defaultOpen />
        )}
      </div>
    </div>
  );
}

/** The notes in one gap of the spine view, closed ones as markers and the open
 *  one as its row. `head` is the slot above the newest event (the live notes),
 *  whose line and tip dot it draws. */
export function SpineNoteGap({
  notes,
  datePrefixFor,
  head,
}: {
  notes: GapItem[];
  datePrefixFor: (note: MarketNote) => string | null;
  head?: { tip: SpineTip | null };
}) {
  const spine = useSpineView();
  const scale = useTimelineScale();
  const ref = useRef<HTMLDivElement>(null);
  // Focus follows the tap: opening a marker moves it to the note's header,
  // closing returns it to the marker.
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    const want = focusNext.current;
    if (!want || !ref.current) return;
    focusNext.current = null;
    const target = ref.current.querySelector<HTMLElement>(want);
    target?.focus({ preventScroll: true });
  });
  if (!spine) return null;

  const toggle = (note: GapItem, opening: boolean) => {
    focusNext.current = opening ? openFocusSelector(note) : `[data-note-marker="${CSS.escape(note.id)}"]`;
    if (ref.current) spine.toggle(noteOpenId(note), ref.current);
  };

  // Closed notes side by side share one slot; the open one breaks the run.
  const groups: ({ open: false; notes: GapItem[] } | { open: true; note: GapItem })[] = [];
  for (const note of notes) {
    if (spine.openId === noteOpenId(note)) groups.push({ open: true, note });
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
      // A gap between two rows cancels the list's own 8px so its growth is
      // what the markers ask for; the head slot keeps it.
      className={`relative flex flex-col ${head ? "" : "-mt-2"}`}
      style={{ "--card-pad": `${scale.cardPad}px`, paddingTop: tip ? 22 : 0 } as React.CSSProperties}
    >
      {head && (
        <div
          aria-hidden
          className="absolute left-1/2 w-px -translate-x-1/2"
          style={{ top: tip ? 16 : 0, bottom: SPINE_LINE_OVERSHOOT, ...spineLineStyle(NOTE_LINE) }}
        />
      )}
      {tip && (
        <div aria-hidden className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
          <PulsingDot side={tip} />
        </div>
      )}
      {groups.map((g) =>
        g.open ? (
          <OpenNote
            key={g.note.id}
            note={g.note}
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

// ── The desktop list view ─────────────────────────────────────────────────

/** The desktop marker's target: 28px tall, so it clears the glyphs above and
 *  below it, and 64px wide. */
const LIST_TARGET = 28;
/** How far the last closed marker's centre sits above the slot's bottom, so
 *  above the next row's node: a slot follows its gap's rows with the list's
 *  8px gap cancelled, and the next node's halo starts 24px below the slot's
 *  end (the gap, the next row's padding and its column's 16px top padding,
 *  less the 4px halo). */
const LIST_FIRST_CENTRE = 12;
/** The open row's node: 32px below its column's top (ListNodeControl). */
const LIST_NODE_Y = 32;
/** A closed marker sits where the node of its open row will stand, so a
 *  marker opens and closes under the pointer (Miles, 30 Sep 2026): a closed
 *  slot takes the height the open row's header takes above its node. Where
 *  the first marker's centre sits below its slot's top: between two rows the
 *  open row starts 8px down (its `pt-2`), then the row's padding; in the
 *  head slot, at the slot's top. Markers after the first step by the same
 *  distance, less the 12px a closed run leaves below its last marker. */
const listFirstCentre = (cardPad: number, head: boolean) => (head ? 0 : 8) + cardPad + LIST_NODE_Y;
const listStep = (cardPad: number) => 8 + cardPad + LIST_NODE_Y - LIST_FIRST_CENTRE;
/** The spine's x in a row: the centre of the `w-2/5` column inside the row's
 *  `--card-pad`. */
const LIST_SPINE_X = "calc(var(--card-pad) + (100% - 2 * var(--card-pad)) * 0.2)";
const LIST_MARKER_CLASS =
  "group/mk absolute z-20 flex w-16 items-center gap-0.5 rounded-lg pl-[14px] text-rb-500 hover:text-foreground focus-visible:outline-2 focus-visible:outline-teal-500";
/** The tooltip, drawn from `data-tip` as generated content so it adds no text
 *  to the page: the open row's diamond sits inside the note row, and a text
 *  node there would read as part of the row's header. */
const LIST_TIP_CLASS =
  "after:content-[attr(data-tip)] after:pointer-events-none after:absolute after:left-full after:top-1/2 after:ml-1.5 after:-translate-y-1/2 after:whitespace-nowrap after:rounded-md after:border after:border-rb-200 after:bg-raised after:px-2 after:py-1 after:text-xs after:font-medium after:text-foreground after:opacity-0 after:shadow-md after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100 dark:after:border-rb-700";

/** One closed desktop marker. */
function ListMarker({ note, top, onOpen }: { note: GapItem; top: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-note-marker={note.id}
      aria-expanded={false}
      aria-label={markerLabel(note)}
      onClick={onOpen}
      data-tip={markerText(note).tip}
      className={`${LIST_MARKER_CLASS} ${LIST_TIP_CLASS}`}
      style={{ left: `calc(${LIST_SPINE_X} - 22px)`, top, height: LIST_TARGET }}
    >
      <Diamond filled={false} />
      <Direction note={note} />
    </button>
  );
}

/** The filled diamond over an open note's node, which puts it back to a
 *  marker. Inert while "Open all market notes" is on. */
function ListNodeControl({ note, openAll, onClose }: { note: GapItem; openAll: boolean; onClose: () => void }) {
  return (
    <button
      type="button"
      data-note-marker={note.id}
      aria-expanded
      aria-disabled={openAll || undefined}
      aria-label={markerLabel(note)}
      onClick={openAll ? undefined : onClose}
      data-tip={markerText(note).tip}
      className={`${LIST_MARKER_CLASS} ${LIST_TIP_CLASS} ${openAll ? "cursor-default" : ""}`}
      // The column's node is centred 16px + half a glyph below its top.
      style={{ left: "calc(50% - 22px)", top: LIST_NODE_Y - LIST_TARGET / 2, height: LIST_TARGET }}
    >
      <span aria-hidden className="block h-4 w-4 shrink-0" />
    </button>
  );
}

/** The markers in one gap of the desktop list view, closed notes as markers
 *  and open ones as their rows.
 *
 *  Between two rows a gap takes no height for one marker and one target for
 *  each further one, and lengthens the line that ends in it by the same. In
 *  the head slot (`head`, above the newest row) or on a list whose events are
 *  all filtered out, nothing stands above the markers to draw the line, so the
 *  gap draws its own, and the tip's dot when it holds the tip.
 *
 *  Below 640px the rows' spine column is hidden, so the timeline draws notes
 *  as rows there and never mounts this. */
export function ListNoteGap({
  notes,
  datePrefixFor,
  openIds,
  openAll,
  onToggle,
  head,
}: {
  notes: GapItem[];
  datePrefixFor: (note: MarketNote) => string | null;
  /** The notes opened from their markers. */
  openIds: ReadonlySet<string>;
  /** "Open all market notes": every note shows its header row. */
  openAll: boolean;
  onToggle: (note: GapItem) => void;
  /** The gap draws its own line: `tip` the dot above it, `above` a row above
   *  it whose line reaches it, `below` a row below it to reach. */
  head?: { tip: SpineTip | null; above: boolean; below: boolean };
}) {
  const scale = useTimelineScale();
  const ref = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    const want = focusNext.current;
    if (!want || !ref.current) return;
    focusNext.current = null;
    ref.current.querySelector<HTMLElement>(want)?.focus({ preventScroll: true });
  });

  const toggle = (note: GapItem, opening: boolean) => {
    // Focus follows the click: opening a marker moves it to the note's
    // header, closing returns it to the marker.
    focusNext.current = opening ? openFocusSelector(note) : `[data-note-marker="${CSS.escape(note.id)}"]`;
    onToggle(note);
  };

  const groups: ({ open: false; notes: GapItem[] } | { open: true; note: GapItem; panel: boolean })[] = [];
  for (const note of notes) {
    const panel = openIds.has(note.id);
    if (panel || openAll) groups.push({ open: true, note, panel });
    else {
      const last = groups[groups.length - 1];
      if (last && !last.open) last.notes.push(note);
      else groups.push({ open: false, notes: [note] });
    }
  }

  const tip = head?.tip ?? null;
  const padTop = tip ? 22 : 0;
  const lastGroupClosed = groups.length > 0 && !groups[groups.length - 1].open;
  return (
    <div
      ref={ref}
      data-note-gap={head ? "head" : ""}
      data-anatomy={head ? "L5" : "L7"}
      // Between two rows the gap cancels the list's own 8px, so one marker
      // takes no height at all.
      className={`relative hidden flex-col sm:flex ${head ? "" : "-mt-2"}`}
      style={{ "--card-pad": `${scale.cardPad}px`, paddingTop: padTop } as React.CSSProperties}
    >
      {head && (
        <div
          aria-hidden
          className="absolute w-px -translate-x-1/2"
          style={{
            left: LIST_SPINE_X,
            top: tip ? 16 : head.above ? 0 : padTop + listFirstCentre(scale.cardPad, true),
            bottom: head.below ? "calc(-1 * var(--card-pad) - 28px)" : lastGroupClosed ? -LIST_FIRST_CENTRE : 0,
            ...spineLineStyle(NOTE_LINE),
          }}
        />
      )}
      {tip && (
        <div aria-hidden className="absolute top-0 z-20 -translate-x-1/2" style={{ left: LIST_SPINE_X }}>
          <PulsingDot side={tip} />
        </div>
      )}
      {groups.map((g, gi) =>
        g.open ? (
          <div key={g.note.id} className={head ? "" : "pt-2"}>
            {isLiveNoteGroup(g.note) ? (
              // The group opens to its lines, each closed, whether its marker
              // or "Open all" opened it.
              <LiveNoteGroupRow
                group={g.note}
                nodeControl={<ListNodeControl note={g.note} openAll={openAll} onClose={() => toggle(g.note, false)} />}
              />
            ) : (
              <MarketNoteRow
                // Remounts when a marker opens it, so the panel opens with it.
                key={g.panel ? "panel" : "row"}
                note={g.note}
                datePrefix={datePrefixFor(g.note)}
                defaultOpen={g.panel}
                nodeControl={<ListNodeControl note={g.note} openAll={openAll} onClose={() => toggle(g.note, false)} />}
              />
            )}
          </div>
        ) : (
          <ListMarkerSlot
            key={g.notes[0].id}
            notes={g.notes}
            head={!!head}
            last={gi === groups.length - 1}
            onOpen={(note) => toggle(note, true)}
          />
        ),
      )}
    </div>
  );
}

/** A run of closed desktop markers. Between rows it takes one target of height
 *  per marker after the first. In the head slot it takes one per marker, but
 *  the last run there stops short so its last marker sits as far above the
 *  next node as a marker between two rows does. */
function ListMarkerSlot({
  notes,
  head,
  last,
  onOpen,
}: {
  notes: GapItem[];
  head: boolean;
  last: boolean;
  onOpen: (note: GapItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { cardPad } = useTimelineScale();
  const n = notes.length;
  const first = listFirstCentre(cardPad, head);
  const step = listStep(cardPad);
  // A run stops LIST_FIRST_CENTRE below its last marker, which between rows
  // is `step` a marker; in the head slot a run with more after it takes a
  // whole step for each.
  const height = head && !last ? step * n : first + step * (n - 1) - LIST_FIRST_CENTRE;
  useExtendLineAbove(ref, height, !head && height > 0, "[data-list-line]");
  const centre = (i: number) => first + i * step;
  return (
    <div ref={ref} className="relative" style={{ height }}>
      {notes.map((note, i) => (
        <ListMarker key={note.id} note={note} top={centre(i) - LIST_TARGET / 2} onOpen={() => onOpen(note)} />
      ))}
    </div>
  );
}
