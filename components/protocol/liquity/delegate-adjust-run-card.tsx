"use client";

import { useContext, useId, useState } from "react";
import type { ReactNode } from "react";

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { GroupFrame, GroupNumbersContext, groupMenuWords, groupRangeText } from "@/components/shared/group-frame";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { UsersGlyph } from "@/components/shared/rate-pill";
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
 * them; its words are the pink delegate pill with the people glyph and the
 * net rate movement (first rate → last).
 */
export interface DelegateAdjustRunCardProps {
  count: number;
  /** The delegate's rate after the chronologically FIRST adjust of the run (%). */
  fromRate?: number;
  /** The delegate's rate after the chronologically LAST adjust of the run (%). */
  toRate?: number;
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
      <span className="text-sm font-medium text-rb-500">{troveWords("run_adjusted")}</span>
      {hasMovement && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-700 dark:text-pink-400 text-xs font-bold">
          <UsersGlyph />
          <Prov value={`${fromRate.toFixed(2)}%`} info={rateProv("first", fromTs)}>
            <span>{fromRate.toFixed(2)}%</span>
          </Prov>
          <span aria-hidden="true">→</span>
          <Prov value={`${toRate.toFixed(2)}%`} info={rateProv("last", toTs)}>
            <span>{toRate.toFixed(2)}%</span>
          </Prov>
        </span>
      )}
      {managerName && <span className="text-sm font-bold text-pink-500">{managerName}</span>}
      <span className="text-sm text-rb-500">({count.toLocaleString("en-US")})</span>
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
  // No asset moved: the members' % glyph alone, no flank, and the words
  // stand; the batch manager acted, so the line runs dotted.
  const column = <SpineColumn icon="rate-change" dotted isLast={!!isLast} />;

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
      closed={
        <EventCard
          avatar={null}
          iconColumn={column}
          groupMenu={showMenu}
          header={<div className="pl-5 pt-4 pb-3">{words}</div>}
          // On a phone the caption carries the word, the count and the range,
          // and the words open beneath it as the card.
          phoneCaption={troveWords("run_phone_caption", { count: count.toLocaleString("en-US"), range })}
          spokenCaption={troveWords("run_spoken", { range: spokenRange })}
          label={troveWords("run_label", { count_text: countText, by, range: spokenRange, movement })}
          detail={<div className="px-5 pt-4 pb-3">{words}</div>}
          group="words"
        />
      }
      members={children}
    />
  );
}
