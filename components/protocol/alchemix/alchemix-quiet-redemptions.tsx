"use client";

// Redemptions that cleared nothing from this position and took nothing from
// it, said once in the place their rows would have stood. A redemption belongs
// to the whole line, so a position with no debt set aside carries every one of
// them on its timeline and none of them changes it (eth-aleth/776 carried 53).
// The members stay one click away, under the sentence.

import type { ReactNode } from "react";

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";

function range(events: AlchemistEvent[]): string {
  const stamps = events.map((e) => e.timestamp);
  const from = Math.min(...stamps);
  const to = Math.max(...stamps);
  const a = `${shortDate(from)} ${shortDateYear(from)}`;
  const b = `${shortDate(to)} ${shortDateYear(to)}`;
  return a === b ? a : `${a} to ${b}`;
}

export function AlchemixQuietRedemptions({
  events,
  isFirst,
  isLast,
  children,
}: {
  events: AlchemistEvent[];
  isFirst?: boolean;
  isLast?: boolean;
  children: ReactNode;
}) {
  const n = events.length;
  const sym = events[0]?.context.data.syntheticSymbol ?? "";
  const sentence =
    n === 1
      ? `A redemption on the ${sym} line while this position had no debt set aside for repayment. It did not change the position.`
      : `${n.toLocaleString("en-US")} redemptions on the ${sym} line while this position had no debt set aside for repayment. None of them changed it.`;
  return (
    <NoteRowShell
      icon="no-change"
      isFirst={isFirst}
      isLast={isLast}
      label={sentence}
      marker={{ attr: "data-quiet-redemptions", value: events[0]?.id ?? "" }}
      header={
        <span className="text-xs leading-relaxed text-rb-500">
          <span className="tabular-nums">{range(events)}</span> · {sentence}
        </span>
      }
    >
      <div className="space-y-2 px-2 py-2">{children}</div>
    </NoteRowShell>
  );
}
