"use client";

// The market notes in one gap of the timeline, each drawn as its collapsed row
// (Miles, 20 Oct 2026, ui-jobs 399: the collapsed row is the view; a bare
// marker with a blank right side is not). The row's node is the hollow
// diamond, its chevron opens its panel, or a group's lines, in place.
//
// What a gap holds: a note, the head slot's live notes as one card, a run of
// same-kind rate notes as one group row (`noteRuns`, lib/shared/market-note.ts),
// or Polaris's PSM trades between two touches as one row (ui-jobs 402).
// A note stays a note: these rows sit beside the event rows and are counted
// in nothing. The "Market notes" switch in Display hides them all.
//
// Below 640px a rate note or a run draws as an event row does, its node and
// pill on the spine and its words as the caption under them (ui-jobs 403).
// Any other row's spine cell is hidden there (app/globals.css, `.spine-row`),
// so the gap draws the diamond on the line above that card.

import { useMemo, type CSSProperties } from "react";

import {
  LiveNoteGroupRow,
  MarketNoteRow,
  noteActor,
  noteGlyphOf,
  noteSpine,
  NoteRunRow,
} from "@/components/shared/market-note-row";
import { PolarisPsmGapRow } from "@/components/protocol/polaris/polaris-psm-gap-row";
import { isPsmGapNote } from "@/lib/polaris/psm-gap";
import { ProtocolChangeRow } from "@/components/shared/protocol-change-row";
import {
  isProtocolChangeGroup,
  isProtocolChangeNote,
  protocolChangeGroup,
  type ProtocolChangeGroup,
  type ProtocolChangeNote,
} from "@/lib/shared/protocol-change-note";
import { PulsingDot, SpineColumn, type SpineTip } from "@/components/shared/spine-column";
import {
  isLiveNoteGroup,
  isNoteRun,
  noteRuns,
  type LiveNoteGroup,
  type MarketNote,
  type NoteRun,
} from "@/lib/shared/market-note";

/** What a gap holds: a note, the head slot's live notes as one card, a run
 *  of rate notes as one group row, or a protocol change (ui-jobs 448). */
export type GapItem = MarketNote | LiveNoteGroup | NoteRun | ProtocolChangeNote | ProtocolChangeGroup;

/** A gap's items with each run of same-kind rate notes as one `NoteRun` and
 *  the protocol changes standing together as one row. */
function withRuns(items: readonly GapItem[]): GapItem[] {
  const out: GapItem[] = [];
  let pending: MarketNote[] = [];
  let changes: ProtocolChangeNote[] = [];
  const flush = () => {
    out.push(...noteRuns(pending), ...(changes.length ? [protocolChangeGroup(changes)] : []));
    pending = [];
    changes = [];
  };
  for (const item of items) {
    if (isProtocolChangeNote(item)) {
      if (pending.length) flush();
      changes.push(item);
    } else if (isProtocolChangeGroup(item) || isLiveNoteGroup(item) || isNoteRun(item)) {
      flush();
      out.push(item);
    } else {
      if (changes.length) flush();
      pending.push(item);
    }
  }
  flush();
  return out;
}

/** A note row's height at rest from 640px: the header panel (16px top
 *  padding, a 28px line, 12px bottom) inside the row's padding either side.
 *  The head slot reserves it while the live notes load. */
const NOTE_HEADER = 16 + 28 + 12;
export const noteRowHeight = (cardPad: number) => 2 * cardPad + NOTE_HEADER;

/** The spine's x in a row from 640px: the centre of the 2/5 column inside the
 *  row's `--card-pad`. */
const SPINE_X = "calc(var(--card-pad) + (100% - 2 * var(--card-pad)) * 0.2)";

/** The row's node on a phone, where the row's spine cell is hidden: the
 *  hollow diamond on the line. A rate note and a run are timeline rows at
 *  both widths (`NoteRowShell`'s T1 shape), whose own cell stands on a phone,
 *  so they take none. */
function PhoneNode({ item }: { item: GapItem }) {
  if (isProtocolChangeNote(item) || isProtocolChangeGroup(item)) return null;
  if (!isLiveNoteGroup(item) && (noteSpine(item) || isPsmGapNote(item))) return null;
  return (
    <div aria-hidden className="pb-1 pt-2 sm:hidden" data-note-phone-node="">
      <SpineColumn icon="market" isLast={false} tip={null} bare actor={noteActor(item)} noteGlyph={noteGlyphOf(item)} />
    </div>
  );
}

/** The notes in one gap, each as its collapsed row. `head` is the slot above
 *  the newest row: `tip` draws the tip's dot above the first. */
export function NoteGap({
  notes: given,
  datePrefixFor,
  head,
}: {
  notes: GapItem[];
  datePrefixFor: (note: MarketNote) => string | null;
  head?: { tip: SpineTip | null };
}) {
  const notes = useMemo(() => withRuns(given), [given]);
  const tip = head?.tip ?? null;
  return (
    <div
      data-note-gap={head ? "head" : ""}
      data-anatomy={head ? "L5" : "L7"}
      className="relative flex flex-col gap-2"
      style={{ "--spine-x": SPINE_X, paddingTop: tip ? 22 : 0 } as CSSProperties}
    >
      {tip && (
        <div aria-hidden className="absolute left-1/2 top-0 z-20 -translate-x-1/2 sm:left-[var(--spine-x)]">
          <PulsingDot side={tip} />
        </div>
      )}
      {notes.map((item) => (
        <div key={item.id} data-note-item={item.id}>
          <PhoneNode item={item} />
          {isProtocolChangeGroup(item) ? (
            <ProtocolChangeRow group={item} />
          ) : isProtocolChangeNote(item) ? (
            <ProtocolChangeRow group={protocolChangeGroup([item])} />
          ) : isLiveNoteGroup(item) ? (
            <LiveNoteGroupRow group={item} />
          ) : isNoteRun(item) ? (
            <NoteRunRow run={item} />
          ) : isPsmGapNote(item) ? (
            <PolarisPsmGapRow note={item} />
          ) : (
            <MarketNoteRow note={item} datePrefix={datePrefixFor(item)} />
          )}
        </div>
      ))}
    </div>
  );
}
