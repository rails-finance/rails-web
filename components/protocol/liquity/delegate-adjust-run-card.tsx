"use client";

import { useContext, useId, useState } from "react";
import type { ReactNode } from "react";

import { EventCard } from "@/components/shared/event-card";
import { CountChip } from "@/components/shared/count-chip";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { GroupFrame, GroupNumbersContext, groupMenuWords, groupRangeText } from "@/components/shared/group-frame";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import type { Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { troveWords } from "@/lib/liquity/event-templates";

/**
 * Delegate-adjust run card — one row standing in for a stretch of consecutive
 * batch-manager rate adjustments (setBatchManagerAnnualInterestRate), the same
 * de-noising treatment RedemptionRunCard gives redemption touches: the events
 * are the delegate's automation, not the owner acting, and no single tick
 * matters — only where the rate went. The header carries the net movement
 * (first adjusted rate → last), and since the member events are already in the
 * client's timeline payload the row expands in place to the individual cards.
 *
 * It draws as every group does (`group-frame.tsx`): the bracket, no node of
 * its own, the dotted segment for the members not drawn, and its ⋮ to show
 * them; its words are "Adjusted" with the count's chip after it (ui-jobs
 * 331), the delegate named in the spoken label alone. The spine's flank carries the rate after the
 * last change in the pink delegate pill, its arrow the way the members moved
 * the rate (`moves`).
 */
export interface DelegateAdjustRunCardProps {
  count: number;
  /** The delegate's rate after the chronologically FIRST adjust of the run (%). */
  fromRate?: number;
  /** The delegate's rate after the chronologically LAST adjust of the run (%). */
  toRate?: number;
  /** Which way the members moved the rate: every change up, every change
   *  down, or "both" otherwise (changes both ways, or none that moved it). */
  moves?: "up" | "down" | "both";
  /** The delegate's display name — only when every member names the same one. */
  managerName?: string;
  /** Chronological bounds of the run (either display order). */
  firstTimestamp: number;
  lastTimestamp: number;
  isLast?: boolean;
  /** The run's member cards, rendered when expanded. */
  children: ReactNode;
}

export function DelegateAdjustRunCard({
  count,
  fromRate,
  toRate,
  moves,
  managerName,
  firstTimestamp,
  lastTimestamp,
  isLast,
  children,
}: DelegateAdjustRunCardProps) {
  const [open, setOpen] = useState(false);

  const [fromTs, toTs] =
    firstTimestamp <= lastTimestamp ? [firstTimestamp, lastTimestamp] : [lastTimestamp, firstTimestamp];
  const sameDay = shortDate(fromTs) === shortDate(toTs) && shortDateYear(fromTs) === shortDateYear(toTs);
  const range = sameDay
    ? `${shortDate(fromTs)} ${shortDateYear(fromTs)}`
    : `${shortDate(fromTs)} ${shortDateYear(fromTs)} – ${shortDate(toTs)} ${shortDateYear(toTs)}`;

  const toggle = () => setOpen((v) => !v);
  const membersId = useId();

  const rateProv = (which: "first" | "last", ts: number): Provenance => ({
    kind: "chain",
    summary: troveWords("run_rate_summary", { which: troveWords(which === "first" ? "run_first" : "run_last") }),
    inputs: [
      {
        label: troveWords("run_rate_input", { which: troveWords(which === "first" ? "run_first" : "run_last") }),
        value: `${shortDate(ts)} ${shortDateYear(ts)}`,
        kind: "chain",
        note: troveWords("run_rate_note", { count }),
      },
    ],
  });

  const hasMovement = fromRate != null && toRate != null;

  // The run's words, as T1 states them: no asset moved, so the spine draws
  // no node and the words stand (set C gives the spine the rate).
  const words = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center text-sm font-medium text-rb-500">
        {troveWords("run_adjusted")}
        <CountChip count={count} />
      </span>
      <span className="evt-meta ml-auto inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-rb-500">{range}</span>
      </span>
    </div>
  );
  const numberRange = useContext(GroupNumbersContext);
  const rangeText = groupRangeText(numberRange);
  // The group opens from its row's ⋮ ("Show 48 grouped events") and closes
  // from a member's ("Hide …"); the range rides the items' sub-line.
  const words2 = groupMenuWords(count, rangeText);
  const showMenu = { ...words2.show, show: () => !open && toggle() };
  const hide = { ...words2.hide, hide: () => open && toggle() };
  // No asset moved: the members' % glyph, the rate after the last change on
  // its flank, and the words stand; the batch manager acted, so the line runs
  // dotted.
  const column: SpineColumnProps = {
    icon: "rate-change",
    rateSpan: toRate != null ? [fromRate ?? 0, toRate] : undefined,
    rateMoves: moves,
    rateTone: "delegate",
    rateProv: toRate != null ? { info: rateProv("last", toTs), value: `${toRate.toFixed(2)}%` } : undefined,
    dotted: true,
    isLast: !!isLast,
  };

  const spokenRange = sameDay
    ? formatDate(fromTs)
    : troveWords("run_range_days", { from: formatDate(fromTs), to: formatDate(toTs) });
  const movement = hasMovement
    ? troveWords("run_movement", { from: `${fromRate.toFixed(2)}%`, to: `${toRate.toFixed(2)}%` })
    : "";
  const by = managerName ? troveWords("run_by", { manager: managerName }) : "";
  const countText = troveWords(count === 1 ? "run_count_one" : "run_count_many", {
    count: count.toLocaleString("en-US"),
  });

  return (
    <GroupFrame
      open={open}
      show={showMenu.show}
      hide={hide}
      membersId={membersId}
      range={numberRange}
      closed={
        <EventCard
          avatar={null}
          groupMenu={showMenu}
          slots={{
            spine: column,
            head: { row: <div className="pl-5 pt-4 pb-3">{words}</div> },
            caption: "",
            cells: { none: troveWords("run_cells_none") },
            ledgers: { none: troveWords("run_ledgers_none") },
            // On a phone the words open beneath the caption as the card.
            notes: <div className="px-5 pt-4 pb-3">{words}</div>,
            explainer: { body: null },
            learnMore: null,
          }}
          // On a phone the caption carries the word, the count's chip and the
          // range, and the words open beneath it as the card.
          phoneCaption={
            <>
              {troveWords("run_adjusted")}
              <CountChip count={count} /> {troveWords("run_phone_caption", { range })}
            </>
          }
          spokenCaption={troveWords("run_spoken", { range: spokenRange })}
          label={troveWords("run_label", { count_text: countText, by, range: spokenRange, movement })}
          group="words"
        />
      }
      members={children}
    />
  );
}
