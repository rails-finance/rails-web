"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { GroupButton, GroupFrame, groupButtonWords } from "@/components/shared/group-frame";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { UsersGlyph } from "./liquity-event-header";
import { SpineSegment, useSpineView } from "@/components/shared/mobile-spine";
import { formatDate } from "@/lib/date";

/**
 * Delegate-adjust run card — one row standing in for a stretch of consecutive
 * batch-manager rate adjustments (setBatchManagerAnnualInterestRate), the same
 * de-noising treatment RedemptionRunCard gives redemption touches: the events
 * are the delegate's automation, not the owner acting, and no single tick
 * matters — only where the rate went. The header carries the net movement
 * (first adjusted rate → last), and since the member events are already in the
 * client's timeline payload the row expands in place to the individual cards.
 *
 * Visual grammar is the folder register every collapsed run now draws in
 * (see TimelineRunCard's `folder`): the folder glyph in the spine's left
 * flank wearing a pink percent mark, a dot on the line, the count in a pill —
 * plus this card's own vocabulary, the pink delegate pill with the people
 * glyph and the net rate movement. The direction the rate-change glyph used
 * to carry lives in that pill (first rate → last). On mobile the glyph moves
 * into the header and the expanded members are held by a dashed rail.
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
  isFirst?: boolean;
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
  isFirst,
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
  const spineView = useSpineView();
  const membersId = useId();

  const rateProv = (which: "first" | "last", ts: number): Provenance => ({
    kind: "chain",
    summary: `The delegate's annual interest rate after the ${which} adjustment of this run — the rate the contract logged at that adjustment. Open the run to see each event's receipt.`,
    inputs: [
      {
        label: `${which} adjustment`,
        value: `${shortDate(ts)} ${shortDateYear(ts)}`,
        kind: "chain",
        note: `one of the ${count} events collapsed into this row`,
      },
    ],
  });

  const hasMovement = fromRate != null && toRate != null;

  // In the phone spine view (`spine`) the header is the opened card: not a
  // control, and without the narrow-width stand-ins the segment draws.
  // The run's words, as T1 states them: no asset moved, so the spine draws
  // no node and the words stand (set C gives the spine the rate).
  const words = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-sm font-medium text-rb-500">Adjusted</span>
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
      <span className="evt-meta ml-auto inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-rb-500">{range}</span>
      </span>
    </div>
  );
  const iconColumn = <SpineColumn icon="none" undrawn isFirst={isFirst} isLast={!!isLast} />;
  const button = (
    <GroupButton open={open} onClick={toggle} controls={membersId}>
      {groupButtonWords(count, open)}
    </GroupButton>
  );

  if (spineView) {
    const spokenRange = sameDay ? formatDate(fromTs) : `${formatDate(fromTs)} to ${formatDate(toTs)}`;
    const movement = hasMovement ? `: ${fromRate.toFixed(2)}% to ${toRate.toFixed(2)}%` : "";
    const by = managerName ? ` by ${managerName}` : "";
    const countText = `${count.toLocaleString("en-US")} rate ${count === 1 ? "adjustment" : "adjustments"}`;
    return (
      <GroupFrame
        open={open}
        banded={false}
        button={button}
        membersId={membersId}
        members={children}
        closed={
          <SpineSegment
            caption={<>Adjusted &middot; {range}</>}
            spokenCaption={`Adjusted, ${spokenRange}`}
            label={`${countText}${by}, ${spokenRange}${movement}`}
            open={spineView.openId === membersId}
            onToggle={(anchor) => spineView.toggle(membersId, anchor)}
            iconColumn={iconColumn}
            card={<div className="rounded-xl bg-raised px-5 pt-4 pb-3">{words}</div>}
          />
        }
      />
    );
  }

  return (
    <GroupFrame
      open={open}
      banded={false}
      button={button}
      membersId={membersId}
      members={children}
      closed={
        <EventCard
          avatar={null}
          iconColumn={iconColumn}
          header={<div className="pl-5 pt-4 pb-3">{words}</div>}
          hideDetailChevron
        />
      }
    />
  );
}
