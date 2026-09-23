"use client";

// How a Moonwell timeline collapses its noise — one spec, both deployments.
// ----------------------------------------------------------------------------
// Lifted verbatim out of the Ethereum wallet page when the Base explorer gained
// a timeline, so the two cannot drift on what counts as noise or how it sums.
//
// MEMBERSHIP is the signature fact, not the event kind: an event whose
// transaction the wallet signed itself (`txFrom` = the wallet) never joins a
// run, whatever its kind — and a third-party event joins regardless of kind.
// Kind-based ownness guesses wrong exactly where it matters: a seize is a
// `transfer_out` on the borrower that the borrower never signed. The
// noise-kind list survives only as the guard where the filler had no `txFrom`.
// (The same predicate the anchored render cut uses — design note: rails-ops
// reference/timeline-attention-budget.md.) So a run is a stretch of
// third-party events, broken only by the wallet's own actions — the
// cross-protocol "owner actions never collapse" rule, held by signature.
//
// What the run's INSIDE shows took three wrong versions to settle:
//
//   1. grouped by KIND across the wallet's WHOLE history (one "Liquidated
//      ×500" row, one "Repaid ×500" row) — hid that those spans overlap: a
//      reader could not tell they were largely the SAME stretch of the
//      wallet's life;
//   2. a time-first outer run, its members re-bucketed by KIND across the
//      whole run — the same mistake one level down: "Liquidated ×596" implying
//      a sequence when the liquidations interleaved with repays and seizes
//      the whole way through;
//   3. literal same-kind streaks plus scattered repeats by COUNTERPARTY — but
//      the churn's repeating motif (repay leg, liquidation, two seize
//      transfers) never streaks, so everything hit the scattered pass, and
//      with ONE keeper doing all of it "by counterparty" degenerates into
//      "by kind": version 2 again, in the common case.
//
// Resolution (the attention-budget note's 2026-09-01 revision): chronology is
// the one promise a timeline makes, and it wins inside the run too. The run
// renders DIRECTLY as folders of ~100 consecutive events in TRUE order
// (`renderRunFolders` — a transaction never splits across folders: a
// liquidation with its repay leg and seize transfers is one act). There is no
// wrapper row above them: an "Activity ×2,000" parent was tried and dropped
// the same day — its aggregate line was just the sum of the folders beneath
// it, and expanding a wrapper to reveal folders was one level of ceremony
// more than the reader needs. Each folder's header carries the chunk-scoped
// aggregate pairs — each with its member count riding inline, muted, after
// the pair — and its own tight date range, and the folder glyph rides the
// SPINE (open while expanded) — so the sequence of
// dated folder nodes paints the churn's rhythm before anything is expanded.
// A folder whose members are all one kind takes that kind's own register
// (member noun, tone, warning pill) and wears the kind's mark on the folder
// glyph;
// a stretch of 4–100 third-party events is simply one folder — same grammar,
// no special case.

import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Undo2 } from "lucide-react";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import {
  renderRunFolders,
  DANGER_FOLDER_BADGE,
  MIXED_FOLDER_BADGE,
  type RunFolderMeta,
} from "@/lib/shared/run-folders";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import type { BaseActivityEvent, MoonwellEventType } from "@/lib/shared/types/event-shape";
import type { FolderRegisterEntry, ServedFolder, ServedFolderRegister } from "@/lib/shared/timeline-folder";
import { MIN_ACTIVITY_RUN, isThirdParty } from "@/lib/moonwell/timeline-membership";

/** What one kind contributes to a header — the verb, the summed figures, and
 *  the visual register a folder of ONLY this kind takes. */
interface KindSpec {
  eventType: MoonwellEventType;
  memberNoun: string;
  aggregatesOf: (events: BaseActivityEvent[]) => RunAggregate[];
  tone: "caution" | "danger" | "neutral";
  spineIcon: "custody" | "warning";
  warningLabel?: string;
  muted: boolean;
  /** Corner mark a homogeneous folder wears on its folder glyph. */
  folderBadge: ReactNode;
}

/** Per-symbol Σ of assetsDelta — works for both repay-kind members and
 *  liquidation-kind members: a liquidation's own row carries the debt IT
 *  repaid in the same field. */
function repaidBySymbol(events: BaseActivityEvent[]): Map<string, number> {
  return sumBySymbol(
    events
      .filter(isMoonwellEvent)
      .map((e) => ({ symbol: e.context.data.marketSymbol, amount: e.context.data.assetsDelta })),
  );
}

function repaidAggregate(events: BaseActivityEvent[]): RunAggregate[] {
  return [...repaidBySymbol(events)].map(([symbol, value]) => ({
    verb: "Repaid",
    value,
    symbol,
    provWhat: "Debt repaid",
  }));
}

/** Per symbol, the larger of two Σs — never their sum. A liquidation's debt
 *  leg is ALSO a RepayBorrow (Compound-v2-fork liquidateBorrow() calls
 *  repayBorrowFresh() internally, emitting its own log), so a repay-kind row
 *  and a liquidation-kind row can name the SAME real repayment; adding their
 *  Σs would count it twice. Every liquidation observed on this market carries
 *  a same-tx repay row for the identical amount, so the repay-only Σ already
 *  contains the liquidation's contribution whenever the two are in step —
 *  `max` (not subtraction) is what stays correct even where they are not
 *  (a liquidation whose companion repay row this fetch does not hold), the
 *  same defensive shape `lib/moonwell/economics.ts`'s `repaid -=
 *  liquidatedDebt` carve-out uses for the position's lifetime totals. */
function maxBySymbol(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const symbol of new Set([...a.keys(), ...b.keys()]))
    out.set(symbol, Math.max(a.get(symbol) ?? 0, b.get(symbol) ?? 0));
  return out;
}

const LIQUIDATION_SPEC: KindSpec = {
  eventType: "liquidation",
  memberNoun: "liquidation",
  aggregatesOf: (events) => {
    const seized = sumBySymbol(
      events.filter(isMoonwellEvent).map((e) => ({
        symbol: e.context.data.collateralSymbol ? `m${e.context.data.collateralSymbol}` : undefined,
        amount: e.context.data.seizeTokens,
      })),
    );
    return [
      ...repaidAggregate(events),
      ...[...seized].map(([symbol, value]) => ({
        verb: "Seized",
        value,
        symbol,
        iconSymbol: symbol.slice(1),
        provWhat: "Collateral seized",
      })),
    ];
  },
  tone: "danger",
  spineIcon: "warning",
  warningLabel: "Liquidations",
  muted: false,
  folderBadge: DANGER_FOLDER_BADGE,
};

const REPAY_SPEC: KindSpec = {
  eventType: "repay",
  memberNoun: "repayment",
  aggregatesOf: repaidAggregate,
  tone: "neutral",
  spineIcon: "custody",
  muted: true,
  folderBadge: <Undo2 size={10} strokeWidth={2.5} className="text-rb-500" />,
};

/** Build one direction's transfer spec — "Sent"/"Received" share everything
 *  but the event kind, the verb, and the glyph. */
function transferSpec(direction: "transfer_in" | "transfer_out"): KindSpec {
  const verb = direction === "transfer_in" ? "Received" : "Sent";
  return {
    eventType: direction,
    memberNoun: "transfer",
    aggregatesOf: (events) => {
      const sums = sumBySymbol(
        events
          .filter(isMoonwellEvent)
          .map((e) => ({ symbol: `m${e.context.data.marketSymbol}`, amount: e.context.data.mTokensDelta })),
      );
      return [...sums].map(([symbol, value]) => ({
        verb,
        value,
        symbol,
        iconSymbol: symbol.slice(1),
        provWhat: `mTokens ${direction === "transfer_in" ? "received" : "sent"}`,
      }));
    },
    tone: "neutral",
    spineIcon: "custody",
    muted: true,
    folderBadge:
      direction === "transfer_in" ? (
        <ArrowDownLeft size={10} strokeWidth={2.5} className="text-rb-500" />
      ) : (
        <ArrowUpRight size={10} strokeWidth={2.5} className="text-rb-500" />
      ),
  };
}

// Fixed display order: most severe first, then the two transfer directions.
const KIND_SPECS: KindSpec[] = [
  LIQUIDATION_SPEC,
  REPAY_SPEC,
  transferSpec("transfer_out"),
  transferSpec("transfer_in"),
];

const earliest = (events: BaseActivityEvent[]) => events.reduce((a, b) => (a.timestamp < b.timestamp ? a : b));
const latest = (events: BaseActivityEvent[]) => events.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));

/** Split members into the four kind buckets, plus a count of anything else —
 *  membership is by signature, so a third-party event of some other kind
 *  still rides the run; it contributes its count to the header, just not an
 *  aggregate pair. */
function bucketByKind(events: BaseActivityEvent[]): {
  buckets: Map<MoonwellEventType, BaseActivityEvent[]>;
  other: number;
} {
  const buckets = new Map<MoonwellEventType, BaseActivityEvent[]>(KIND_SPECS.map((spec) => [spec.eventType, []]));
  let other = 0;
  for (const e of events) {
    const bucket = isMoonwellEvent(e) ? buckets.get(e.context.data.eventType) : undefined;
    if (bucket) bucket.push(e);
    else other++;
  }
  return { buckets, other };
}

/** Attach a member count to a verb group, riding the LAST pair with value > 0
 *  (the card skips zero-value pairs, so a count on one would vanish with it).
 *  The count names how many member events feed the group behind it; a
 *  homogeneous folder needs none — its spine ×N pill already says so. */
function withCount(pairs: RunAggregate[], count: number): RunAggregate[] {
  const i = pairs.map((p) => p.value > 0).lastIndexOf(true);
  return i < 0 ? pairs : pairs.map((p, idx) => (idx === i ? { ...p, count } : p));
}

/** The mixed-set header's aggregate pairs, over any member set (the whole run
 *  or one folder). "Repaid" merges the standalone-repay lane with the
 *  liquidations' own repaid legs via `maxBySymbol`, NOT concatenation: a
 *  liquidation's debt leg is ALSO a RepayBorrow, so summing both Σs would
 *  count the same real repayment twice (see maxBySymbol's own comment). Each
 *  group carries the count of the members behind it, inline on its last
 *  nonzero pair — the repaid count rides the repay bucket only, since where
 *  the Σ comes solely from liquidations' own repay legs the liquidation
 *  count already rides Seized and a second count here would double it. */
function activityAggregates(buckets: Map<MoonwellEventType, BaseActivityEvent[]>): RunAggregate[] {
  const repayMembers = buckets.get("repay") ?? [];
  const liquidationMembers = buckets.get("liquidation") ?? [];
  const combinedRepaid = maxBySymbol(repaidBySymbol(repayMembers), repaidBySymbol(liquidationMembers));
  const repaidPairs = [...combinedRepaid].map(([symbol, value]) => ({
    verb: "Repaid",
    value,
    symbol,
    provWhat: "Debt repaid",
  }));
  return [
    ...(repayMembers.length ? withCount(repaidPairs, repayMembers.length) : repaidPairs),
    ...(liquidationMembers.length
      ? withCount(
          LIQUIDATION_SPEC.aggregatesOf(liquidationMembers).filter((a) => a.verb === "Seized"),
          liquidationMembers.length,
        )
      : []),
    ...KIND_SPECS.filter((spec) => spec.eventType !== "liquidation" && spec.eventType !== "repay").flatMap((spec) => {
      const members = buckets.get(spec.eventType) ?? [];
      return members.length ? withCount(spec.aggregatesOf(members), members.length) : [];
    }),
  ];
}

/** One folder: a chronological slice of the run, rendered as its own
 *  top-level timeline row, header scoped to its own members. A folder of ONE
 *  kind takes that kind's register (member noun, tone, warning pill, folder
 *  mark);
 *  a mixed folder stays the quiet "Events" row wearing the shared two-way
 *  mark, its per-kind counts riding inline on the aggregate pairs (see
 *  `activityAggregates`/`withCount`) — the "other" bucket has no aggregate
 *  group to ride, so it alone still gets its own `extraHeader` pill in the
 *  same register. */
function folderCard(events: BaseActivityEvent[], folder: RunFolderMeta): ReactNode {
  const { buckets, other } = bucketByKind(events);
  const present = KIND_SPECS.filter((spec) => (buckets.get(spec.eventType)?.length ?? 0) > 0);
  const solo = other === 0 && present.length === 1 ? present[0] : undefined;
  return (
    <TimelineRunCard
      key={folder.key}
      count={events.length}
      memberNoun={solo ? solo.memberNoun : "event"}
      aggregates={solo ? solo.aggregatesOf(events) : activityAggregates(buckets)}
      tone={solo ? solo.tone : "neutral"}
      spineIcon={solo ? solo.spineIcon : "custody"}
      warningLabel={solo?.warningLabel}
      muted={solo ? solo.muted : true}
      folder
      folderBadge={solo ? solo.folderBadge : MIXED_FOLDER_BADGE}
      extraHeader={
        solo ? undefined : other > 0 ? (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap text-rb-500 bg-rb-500/10">
            {other.toLocaleString("en-US")} other
          </span>
        ) : undefined
      }
      firstTimestamp={earliest(events).timestamp}
      lastTimestamp={latest(events).timestamp}
      isFirst={folder.isFirst}
      isLast={folder.isLast}
    >
      {folder.children}
    </TimelineRunCard>
  );
}

/** A served folder of more than one kind — `folderCard`'s quiet "Events" row. */
const MIXED_FOLDER: FolderRegisterEntry = {
  memberNoun: "event",
  tone: "neutral",
  spineIcon: "custody",
  muted: true,
  folderBadge: MIXED_FOLDER_BADGE,
};

/**
 * How a folder the Moonwell Base ROUTE served draws (leg C of `0019`,
 * lib/moonwell-base/timeline-folders.ts) — `folderCard`'s register read off the
 * wire instead of off the members: a folder whose members are all one of the
 * four kinds takes that kind's words, tone and corner mark, anything else is
 * the mixed row. The route sends one constant `kind`, so the test is the
 * folder's own `counts` and `other`, exactly the buckets `folderCard` counts.
 */
export const MOONWELL_FOLDER_REGISTER: ServedFolderRegister = (folder: ServedFolder): FolderRegisterEntry => {
  const solo =
    folder.other === 0 && folder.counts.length === 1
      ? KIND_SPECS.find((spec) => spec.eventType === folder.counts[0].key)
      : undefined;
  if (!solo) return MIXED_FOLDER;
  return {
    memberNoun: solo.memberNoun,
    tone: solo.tone,
    spineIcon: solo.spineIcon,
    warningLabel: solo.warningLabel,
    muted: solo.muted,
    folderBadge: solo.folderBadge,
  };
};

// Module-scope so the timeline's row memo keeps a stable identity.
export const MOONWELL_ACTIVITY_RUNS: TimelineRunSpec[] = [
  {
    match: isThirdParty,
    min: MIN_ACTIVITY_RUN,
    // The folders ARE the run's presentation — siblings on the timeline, no
    // wrapper row (see the header comment); renderRunFolders holds the shared
    // run→folders step every protocol's spec now uses.
    render: (run, meta) => renderRunFolders(run, meta, MIN_ACTIVITY_RUN, folderCard),
  },
];
