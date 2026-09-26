"use client";

// The boundary card — the last node on the spine, after the oldest drawn row.
// ----------------------------------------------------------------------------
// Every timeline that draws fewer rows than the position has ends with this
// card, the same card on every protocol (rails-ops decision 0019). It sits on
// the spine like an event row, in the event rows' own shell, and says three
// things in the fact register:
//
//   • the header — "+N earlier events", the span they cover in the rows' own
//     date register at the right (where a row shows its date and time), and
//     in the row-number pill slot the RANGE of row numbers the card covers —
//     "N – 1", below the oldest drawn row — so the arithmetic closes on the
//     page (newest row = total, oldest drawn = N + 1);
//   • the body — those events by type (the protocol's own verbs, the filter
//     menu's) and by asset where the arm has them, each count in the
//     row-number pill's own style, the span in days, and the position at the
//     cut where the arm can state it, one line per lane in protocol units. A
//     line the arm cannot state is absent — never a zero;
//   • the small print — one statement: the list displays the most recent
//     1,000 events, the remaining N are accounted for here, and — where the
//     page's export menu can download the whole history in one answer
//     (`csvExport`) — that the complete timeline is a CSV away, in the "Copy
//     for LLM" menu in the row above the position card; otherwise, or as
//     well, Rails can produce it on request. The request opens the feedback
//     route the footer already uses; the page's path travels with it.
//
// No colour of Rails's own choosing: the paper/dark tokens the rows use.

import { useState } from "react";
import { useTimelineScale } from "@/components/shared/activity-timeline";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { StatCard } from "@/components/shared/state-transition";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { FeedbackModal } from "@/components/shared/feedback-modal";
import { actionLabel } from "@/lib/shared/event-filter-helpers";
import { formatCompact, shortDate, shortDateYear } from "@/lib/shared/format-event";
import { formatDate } from "@/lib/date";
import { explorerUrl } from "@/lib/shared/chains";
import { useChainId } from "@/lib/shared/chain-context";
import type { TimelineBoundary } from "@/lib/shared/timeline-boundary";

const n = (v: number) => v.toLocaleString("en-US");

/** The rows' own date register — "23 Mar '26" — so the card's span aligns
 *  with the dates on the rows above it. */
const rowDate = (unix: number) => `${shortDate(unix)} ${shortDateYear(unix)}`;

/** The row-number pill, as the rows draw it (chain-truth-event.tsx). */
const PILL = "inline-flex items-center rounded-full bg-sunken px-1.5 py-0.5 text-[9px] text-rb-500";

function longDate(unix: number): string {
  return formatDate(unix);
}

/** THE BOUNDARY WITHOUT THE CARD — the spine's `Layers` node, and nothing
 *  beside it in the protocol column.
 *
 *  Two callers, both in `chain-truth-timeline.tsx`, and the `kind` says which:
 *
 *  • `"cut"` — the omitted-events boundary, at whichever end of the list the
 *    sort puts the older one. The card is withheld here (Miles, 2026-09-11:
 *    "just the layer icon in the spine and no event at all in the protocol").
 *
 *    ⚠️ WHAT DIES WITH THE CARD, so nobody rediscovers it: the card's
 *    brought-forward balance line — "At block N, <date>, the position held X"
 *    — is stated NOWHERE else on the page. Nor are the by-type / by-asset
 *    histograms of the omitted events, or the span in days. The COUNT survives,
 *    in the toolbar's own count line ("Showing 1,000 of 107,656 events"), and
 *    so does the CSV: the card's sentence pointed at the export menu in the
 *    detail back row, which is still there. Miles accepted the loss twice —
 *    once under the flag, and again when the flag came off and it was taken on
 *    every family — on the ground that it is consistent with the cut itself
 *    eventually going away.
 *
 *    THE CARD SURVIVES IN EXACTLY ONE PLACE: a list with NO rows and a
 *    boundary (`chain-truth-timeline.tsx`, the empty branch). There the node
 *    would terminate nothing, so a lone glyph on a blank panel would state
 *    nothing at all.
 *
 *  • `"tip"` — the newest end of a list whose newest events are filtered out.
 *    The glyph stands where the pulsing dot would have stood and says the same
 *    thing the cut boundary says at the other end: the spine continues past
 *    the drawn rows.
 *
 *  • `"view"` — the OLDER end of the same list. A page can hide older events
 *    two ways and they are not the same thing: the WINDOW cut, which is what
 *    `"cut"` and the card speak for, and the VIEW — a filter, which hides them
 *    on a position that has no cut at all (Miles, 2026-09-11: a 38-event
 *    position with a day selected, "we need to add the layers icon at the
 *    bottom of the timeline to represent the past events"). Where both are
 *    true the cut's own statement stands and this one is withheld: two glyphs
 *    at one end would read as two different omissions.
 *
 *  It draws the row GEOMETRY `EventCard` draws — the same card padding, the
 *  same 2/5-width spine gutter at ≥sm — so the node lands on the column the
 *  rows' nodes land on. Below sm there is no spine anywhere on the page and
 *  this row draws nothing at all, which is the same silence every other spine
 *  node keeps there.
 *
 *  `tip={null}` refuses the pulsing dot outright: a boundary is never the tip,
 *  whichever end of the list it stands at. */
export function TimelineBoundaryRow({
  kind,
  isFirst,
  isLast,
}: {
  kind: "cut" | "tip" | "view";
  isFirst?: boolean;
  isLast: boolean;
}) {
  const scale = useTimelineScale();
  return (
    <div
      data-figure="timeline-boundary-row"
      data-boundary-row={kind}
      className="relative flex w-full items-start"
      style={{ "--card-pad": `${scale.cardPad}px`, padding: scale.cardPad } as React.CSSProperties}
    >
      <div className="hidden w-2/5 shrink-0 items-stretch justify-center self-stretch sm:flex">
        <SpineColumn icon="boundary" isFirst={isFirst} isLast={isLast} tip={null} />
      </div>
      <div className="min-w-0 grow" />
    </div>
  );
}

export interface TimelineBoundaryCardProps {
  boundary: TimelineBoundary;
  /** The page's protocol key — labels the type histogram with the same table
   *  the filter menu uses (`actionLabel`). */
  protocolKey: string;
  /** True when the page mounts the export menu with a whole-history fetch AND
   *  the position's total is within what that fetch can serve in one answer
   *  (`wholeHistoryExportable`, lib/shared/timeline-row-ceiling.ts) — the
   *  small print then names the CSV download. Absent or false: the request
   *  sentence alone. Never true on a vault holder page (no export menu). */
  csvExport?: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export function TimelineBoundaryCard({
  boundary: b,
  protocolKey,
  csvExport,
  isFirst,
  isLast,
}: TimelineBoundaryCardProps) {
  const chainId = useChainId();
  const { showEventNumbers } = useTimelineDisplay();
  // Open at rest: the body is the statement the card exists to make, and a
  // reader who has scrolled to the end of the list is here for it. Still a
  // row, so it closes like one.
  const [open, setOpen] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);

  const counted = b.omitted != null;
  const atLeast = b.lowerBound ? "at least " : "";
  const horizon = b.arm === "base" && !counted;
  const noun = b.omitted === 1 ? "event" : "events";

  const blockLink = (
    <a
      href={explorerUrl(chainId, "block", b.cutBlock)}
      target="_blank"
      rel="noopener noreferrer"
      className="link-external"
      onClick={(e) => e.stopPropagation()}
    >
      {n(b.cutBlock)}
    </a>
  );

  // ── Header: the count, the span at the right, the range pill ─────────────
  const label = b.pending
    ? "Earlier events"
    : horizon
      ? "Earlier events"
      : `+${atLeast}${n(b.omitted as number)} earlier ${noun}`;
  // The rows' own date register, in the rows' own slot: "21 Feb '23 – 23 Mar '26".
  const span =
    b.firstAt != null && b.cutAt != null
      ? `${rowDate(b.firstAt)} – ${rowDate(b.cutAt)}`
      : b.cutAt != null
        ? `to ${rowDate(b.cutAt)}`
        : horizon || b.pending
          ? `before block ${n(b.cutBlock)}`
          : `to block ${n(b.cutBlock)}`;
  // The range of row numbers the card stands for, read in the direction of
  // the list — which is newest-first, the only direction a timeline has now,
  // so it runs N – 1 and counts DOWN towards the oldest event.
  const range = counted ? `${n(b.omitted as number)} – 1` : null;
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4 pb-3">
      <span className="shrink-0 text-sm font-medium text-rb-500">{label}</span>
      {/* The same slot, the same register and the same pill gate as the rows'
          date, time and number — so the span aligns with the dates above it
          and the range pill lines up with the row-number pills. */}
      <span className="evt-meta ml-auto flex items-center gap-2 tabular-nums">
        <span className="text-xs text-rb-500">{span}</span>
        {showEventNumbers && range && (
          <span className={PILL} aria-label={`Rows ${range}`} data-boundary-range={range}>
            {range}
          </span>
        )}
      </span>
    </div>
  );

  // ── Body: the stats of the events before this point ──────────────────────
  const days = b.firstAt != null && b.cutAt != null ? Math.round((b.cutAt - b.firstAt) / 86400) : null;
  // Each count in the row-number pill's own style, after its label.
  const chips = (buckets: { key: string; count: number }[], labelOf: (k: string) => string) => (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
      {buckets.map((bk) => (
        <li key={bk.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-foreground">{labelOf(bk.key)}</span>
          <span className={PILL}>{n(bk.count)}</span>
        </li>
      ))}
    </ul>
  );
  const hasStats = counted && ((b.byType?.length ?? 0) > 0 || (b.byAsset?.length ?? 0) > 0 || days != null);
  const hasState = b.state != null && b.state.length > 0;

  const detail = (
    <div className="grid grid-cols-1 gap-2.5 px-5 py-2 sm:auto-rows-fr sm:grid-cols-2">
      {b.pending ? (
        <div className="text-sm text-rb-500 sm:col-span-2">
          {b.pending === "reading"
            ? `The events before block ${n(b.cutBlock)} are being counted in the index.`
            : `The events before block ${n(b.cutBlock)} could not be counted on this request.`}
        </div>
      ) : horizon ? (
        <div className="text-sm text-rb-500 sm:col-span-2">
          The record on this page starts at block {blockLink}; what came before it is not on this page.
        </div>
      ) : null}
      {b.byType && b.byType.length > 0 && (
        <StatCard label="By type">{chips(b.byType, (k) => actionLabel(k, protocolKey))}</StatCard>
      )}
      {b.byAsset && b.byAsset.length > 0 && <StatCard label="By asset">{chips(b.byAsset, (k) => k)}</StatCard>}
      {/* The day count alone: the two dates are the header's, in the rows'
          register, and stated once on the card. */}
      {days != null && (
        <StatCard label="Span">
          <div className="text-sm tabular-nums">
            <span className="text-foreground">
              {n(days)} {days === 1 ? "day" : "days"}
            </span>
          </div>
        </StatCard>
      )}
      {hasState && (
        <StatCard
          label={`At block ${n(b.cutBlock)}${b.cutAt != null ? `, ${longDate(b.cutAt)}` : ""}, the position held`}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm tabular-nums">
            {(b.state as NonNullable<typeof b.state>).map((l, i) => {
              const v = Number(l.value);
              const f = Number.isFinite(v) ? formatCompact(Math.abs(v)) : { display: l.value, title: l.value };
              return (
                <div key={`${i}:${l.label}`} className="contents">
                  <dt className="text-rb-500">{l.label}</dt>
                  <dd className="text-foreground" title={f.title}>
                    {v < 0 ? "−" : ""}
                    {f.display}
                    {l.unit ? ` ${l.unit}` : ""}
                  </dd>
                </div>
              );
            })}
          </dl>
        </StatCard>
      )}
    </div>
  );

  // ── Small print ──────────────────────────────────────────────────────────
  const explainer = (
    <div className="space-y-2 text-sm leading-relaxed text-rb-500">
      {b.pending ? (
        <p>
          The list holds every event from block {n(b.cutBlock)} onward, and each card on it is exact. The events before
          that block are {b.pending === "reading" ? "being counted" : "not counted on this request"}, so the lifetime
          figures above are not stated rather than reduced from this page alone.
        </p>
      ) : horizon ? (
        <p>
          The list holds every event from block {n(b.cutBlock)} onward, and the running balances on the cards are
          replayed from that block. Numbering starts from the first row on the page.
        </p>
      ) : (
        <p>
          The list holds every event from block {blockLink} onward. The {atLeast}
          {n(b.omitted as number)} events before it are accounted for here.
        </p>
      )}
      <p>
        {csvExport
          ? "The complete timeline can be downloaded as a CSV from the Copy for LLM menu above the position card, or Rails can produce it on "
          : "Rails can produce a complete timeline on "}
        <button
          type="button"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setRequestOpen(true);
          }}
        >
          request
        </button>
        .
      </p>
    </div>
  );

  return (
    // data-prov-exempt: the counts are index row counts (the "event numbers"
    // class the row-number pills and the toolbar's count line are exempted
    // under), and the state lines restate the oldest drawn row's own
    // before-figure, whose receipt sits on that row.
    <div data-figure="timeline-boundary" data-prov-exempt="" data-boundary-arm={b.arm}>
      <EventCard
        avatar={null}
        iconColumn={<SpineColumn icon="boundary" isFirst={isFirst} isLast={isLast} />}
        header={header}
        detail={hasStats || hasState || b.pending || horizon ? detail : <div className="px-5 py-2" />}
        detailOpen={open}
        onDetailToggle={setOpen}
        explainer={explainer}
      />
      {requestOpen && (
        <FeedbackModal
          onClose={() => setRequestOpen(false)}
          initialType="feature"
          initialTitle="Full history request"
        />
      )}
    </div>
  );
}
