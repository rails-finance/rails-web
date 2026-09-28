"use client";

// Market notes in the phone spine view (rails-ops TO-DO-ui-jobs item 118).
//
// A closed note is a MARKER in the gap between the two events it sits
// between: a hollow diamond on the line with a direction arrow beside it, in
// the spine's neutral ink (a price fall is bad for a borrower and good for
// others, so no green or red). Its tap target is 44 × 64px, and a gap holding
// markers grows by about 20px, plus one target per extra marker, so the target
// clears the captions around it. Several notes in one gap (a Types of event
// filter hid the events between them) stack in date order.
//
// A tap opens the note in place, row and panel together, and the diamond stays
// on the line filled, with the note's figure beside it; a tap on it puts the
// note back to a marker. Notes share the spine view's one open id with the
// event cards (`note:<id>`), so opening a note closes an open card and the
// reverse.
//
// The marker is a sibling of the segments' buttons, never inside one.

import { useLayoutEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { useTimelineScale } from "@/components/shared/activity-timeline";
import { MarketNoteRow, noteMarkerText } from "@/components/shared/market-note-row";
import {
  SPINE_LINE_OVERSHOOT,
  spineLineKey,
  spineLineStyle,
  useExtendLineAbove,
  useSpineView,
} from "@/components/shared/mobile-spine";
import { PulsingDot, SPINE_COLORS, type SpineTip } from "@/components/shared/spine-column";
import type { MarketNote } from "@/lib/shared/market-note";
import { formatDate } from "@/lib/date";

/** The marker's tap target: 44px tall on the phone, 64px wide. */
const TARGET = 44;
/** A plain gap's growth for one marker: 44px of bare line in all. */
const GROWTH = 20;
/** The caption's own padding below it, inside the segment above the gap. */
const CAPTION_PAD = 10;
/** A note's line: dotted and neutral, since the account did nothing here. */
const NOTE_LINE = spineLineKey(true, SPINE_COLORS.default);

export const noteOpenId = (note: MarketNote) => `note:${note.id}`;

function markerLabel(note: MarketNote): string {
  const when = note.live ? "now" : note.to.timestamp > 0 ? formatDate(note.to.timestamp) : null;
  return `Market note${when ? `, ${when}` : ""}: ${noteMarkerText(note).spoken}`;
}

function Diamond({ filled }: { filled: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" className="block shrink-0">
      <rect
        x={3.5}
        y={3.5}
        width={9}
        height={9}
        transform="rotate(45 8 8)"
        fill={filled ? "currentColor" : "var(--background)"}
        stroke="currentColor"
        strokeWidth={1.25}
      />
    </svg>
  );
}

function Direction({ note }: { note: MarketNote }) {
  if (note.kind === "vault-terms") return null;
  const Icon = note.to.value >= note.from.value ? ArrowUpRight : ArrowDownRight;
  return <Icon size={14} strokeWidth={2} className="block shrink-0 text-rb-500" aria-hidden="true" />;
}

const MARKER_CLASS =
  "group/mk absolute z-20 flex w-16 items-center gap-0.5 rounded-lg pl-[14px] text-rb-500 hover:text-foreground focus-visible:outline-2 focus-visible:outline-teal-500";

/** One closed marker, with its tooltip on hover and keyboard focus. */
function Marker({ note, top, onOpen }: { note: MarketNote; top: number; onOpen: () => void }) {
  const { tip } = noteMarkerText(note);
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
  notes: MarketNote[];
  onOpen: (note: MarketNote) => void;
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
function OpenNote({
  note,
  datePrefix,
  onClose,
}: {
  note: MarketNote;
  datePrefix: string | null;
  onClose: () => void;
}) {
  const { tip } = noteMarkerText(note);
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
        <MarketNoteRow note={note} datePrefix={datePrefix} defaultOpen />
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
  notes: MarketNote[];
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

  const toggle = (note: MarketNote, opening: boolean) => {
    focusNext.current = opening
      ? `[data-market-note="${CSS.escape(note.id)}"] [role="button"]`
      : `[data-note-marker="${CSS.escape(note.id)}"]`;
    if (ref.current) spine.toggle(noteOpenId(note), ref.current);
  };

  // Closed notes side by side share one slot; the open one breaks the run.
  const groups: ({ open: false; notes: MarketNote[] } | { open: true; note: MarketNote })[] = [];
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
            datePrefix={datePrefixFor(g.note)}
            onClose={() => toggle(g.note, false)}
          />
        ) : (
          <MarkerSlot key={g.notes[0].id} notes={g.notes} head={!!head} onOpen={(note) => toggle(note, true)} />
        ),
      )}
    </div>
  );
}
