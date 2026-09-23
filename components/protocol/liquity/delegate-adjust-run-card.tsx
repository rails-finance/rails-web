"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Folder, FolderOpen, Percent } from "lucide-react";

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { useLinkedHover } from "@/hooks/useLinkedHover";
import { UsersGlyph } from "./liquity-event-header";

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
  // Folder node + header hover as one control (see TimelineRunCard).
  const { lit, bind } = useLinkedHover<"header" | "folder">();

  const folderMark = <Percent size={10} strokeWidth={2.5} className="text-pink-500" />;

  // Both rates are single member events' own log values (stateAfter), not
  // aggregates — the receipt names which member each one is; the members hold
  // the leaves once the run is expanded.
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

  const header = (
    <div
      className={`group/run cursor-pointer rounded-xl transition-colors px-5 pt-4 pb-3${lit ? " bg-raised" : ""}`}
      onClick={toggle}
      {...bind("header")}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${count} consecutive delegate rate adjustments — ${open ? "collapse" : "expand"} the run`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* On mobile the spine column is hidden, so the folder glyph moves
            into the header — the same hand-off TimelineRunCard's folder makes. */}
        <span className="sm:hidden relative mr-0.5 inline-flex text-rb-500" aria-hidden>
          {open ? <FolderOpen size={16} strokeWidth={1.75} /> : <Folder size={16} strokeWidth={1.75} />}
          <span className="absolute -right-1.5 -bottom-1 inline-flex rounded-full bg-background p-px">
            {folderMark}
          </span>
        </span>
        <span className="text-sm font-medium text-rb-500">
          Adjusted<span className="sm:hidden"> ×{count.toLocaleString("en-US")}</span>
        </span>
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
        <span className="ml-auto inline-flex items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-rb-500">{range}</span>
          <ExpandChevron isOpen={open} group="run" />
        </span>
      </div>
    </div>
  );

  return (
    <>
      <EventCard
        avatar={<div className="hidden sm:block" />}
        iconColumn={
          <SpineColumn
            icon="folder"
            folderOpen={open}
            folderMark={folderMark}
            folderCount={count}
            onFolderToggle={toggle}
            folderLit={lit}
            folderHover={bind("folder")}
            spine="dotted"
            isFirst={isFirst}
            isLast={!!isLast && !open}
          />
        }
        header={header}
        hideDetailChevron
      />
      {open && (
        <div className="relative flex flex-col gap-2 ml-1 pl-2 sm:contents">
          {/* The rail draws with the spine's own dash (1px wide, 6px period);
              rgb(101 115 140) = rb-500, the spine's default tint. */}
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-px sm:hidden"
            style={{
              backgroundImage: "linear-gradient(to bottom, rgb(101 115 140) 50%, transparent 50%)",
              backgroundSize: "1px 6px",
            }}
          />
          {children}
        </div>
      )}
    </>
  );
}
