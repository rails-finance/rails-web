"use client";

// Consecutive market notes as one row, in the phone list view of a timeline
// that opts in (ChainTruthTimeline `phoneNoteRun`). Closed, the row names how
// many notes it holds and the dates they span; open, it draws each note's own
// row. A single note, the desktop markers and the phone spine view are
// unchanged.

import { useState, type ReactNode } from "react";
import { useTimelineScale } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import type { MarketNote } from "@/lib/shared/market-note";

/** A timeline's words for a run of its notes: "Savings Rate changes". */
export interface PhoneNoteRunWords {
  many: string;
}

const stamp = (ts: number) => `${shortDate(ts)} ${shortDateYear(ts)}`;

export function PhoneNoteRun({
  notes,
  words,
  renderNote,
}: {
  notes: MarketNote[];
  words: PhoneNoteRunWords;
  renderNote: (note: MarketNote, i: number) => ReactNode;
}) {
  const scale = useTimelineScale();
  const [open, setOpen] = useState(false);
  const times = notes.map((n) => n.to.timestamp).filter((t) => t > 0);
  const span =
    times.length > 0
      ? Math.min(...times) === Math.max(...times)
        ? stamp(Math.min(...times))
        : `${stamp(Math.min(...times))} – ${stamp(Math.max(...times))}`
      : null;
  const label = `${notes.length} ${words.many}${span ? `, ${span}` : ""}`;
  return (
    <div data-phone-note-run={notes.length}>
      <div style={{ padding: scale.cardPad }}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="group/evt relative flex w-full cursor-pointer items-center rounded-xl bg-note px-5 py-3 text-left text-sm text-rb-500 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500"
        >
          <span className="min-w-0 grow pr-8">{label}</span>
          <ExpandChevron isOpen={open} group="evt" className="absolute right-0 top-1/2 mr-5 -translate-y-1/2" />
        </button>
      </div>
      {open && notes.map((n, i) => renderNote(n, i))}
    </div>
  );
}
