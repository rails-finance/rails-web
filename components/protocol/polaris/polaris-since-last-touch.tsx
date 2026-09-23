"use client";

// Polaris — "Since its last touch": the live window's two causes, side by side.
// ----------------------------------------------------------------------------
// Between two of a CDP's own touches its stated figures do not move, so exactly
// two things changed what it is worth at the market's own feed — the feed, and
// the protocol's own pending legs — and they add up to the whole move. That is
// what this row states: three rows and a rule, every figure receipted, no
// percentage and no colour (lib/polaris/since-last-touch.ts carries the why).
//
// IT IS A TIMELINE ROW, pinned in the head slot (rails-ops TO-DO-ui-jobs §44).
// Every window between two touches is already told on the spine, between the
// two events that bracket it; this is the one window with no second touch yet,
// so it is told the same way, at the end that is now. It is NOT a market note:
// a note happened to every holder at once, this is this CDP's own window — so
// it keeps every note exclusion (out of the event options, the filters and the
// boundary histogram) and takes none of the notes toggle. See ChainTruthTimeline's
// `liveWindow` prop for the whole of that contract.
//
// The frame is <NoteRowShell>'s, shared with the market-note row. The glyph
// keeps the note's register — hollow, neutral ink — for the same reason the
// note has it: the holder did nothing inside the window, which is what lets
// its two causes be stated as facts rather than apportioned. It is a square
// where the note's is a diamond, because on a CDP carrying both the two rows
// stand side by side in the head slot.
//
// It renders only where the window IS a fact — `polarisSinceLastTouch` returns
// null otherwise, and the slot draws nothing.

import type { ReactNode } from "react";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatCompact, formatExact } from "@/lib/utils/format";
import { formatPethPrice } from "@/components/protocol/polaris/polaris-position-card";
import { formatDuration } from "@/lib/date";
import { polarisProtocolLegNames, signedFigure, type PolarisSinceLastTouch } from "@/lib/polaris/since-last-touch";

const DUST = 1e-9;

const Signed = ({ value, unit }: { value: number; unit: string }) => (
  <span className="font-semibold text-foreground tabular-nums">
    {value >= 0 ? "+" : "−"}
    {formatCompact(Math.abs(value))} {unit}
  </span>
);

/** The feed's own legs at one end, as receipt inputs. Stated, never split into
 *  shares of the figure: apportioning one price move between three
 *  multiplicative legs is a choice of index, not a fact of the chain. */
function feedLegInputs(w: PolarisSinceLastTouch, market: "usdp" | "goldp") {
  const ends: Array<[string, number | undefined, number | undefined]> = [
    ["bonding-curve price", w.from.curve, w.to.curve],
    ["ETH/USD medianiser", w.from.ethUsd, w.to.ethUsd],
    ...(market === "goldp"
      ? ([["XAU/USD medianiser", w.from.xauUsd, w.to.xauUsd]] as Array<
          [string, number | undefined, number | undefined]
        >)
      : []),
  ];
  return ends
    .filter(([, a, b]) => a != null && b != null)
    .map(([label, a, b]) => ({
      label,
      value: `${formatCompact(a as number)} → ${formatCompact(b as number)}`,
      kind: "chain-derived" as const,
      pclass: "oracle" as const,
      note: "a leg of previewPrice(); the feed's move is not apportioned between the legs",
    }));
}

export function PolarisSinceLastTouchRow({
  window: w,
  market,
  stable,
  isFirst = false,
}: {
  window: PolarisSinceLastTouch;
  market: "usdp" | "goldp";
  stable: string;
  /** The spine terminus the timeline's head slot decides (see `liveWindow`). */
  isFirst?: boolean;
}) {
  // formatDuration reads a bare number as unix SECONDS, which is what both ends carry.
  const elapsed = formatDuration(w.from.timestamp, w.to.timestamp);

  const feedProv: Provenance = {
    kind: "chain-derived",
    pclass: "oracle",
    summary:
      `What the market's own price feed did to the collateral — the figure this CDP stated at its last touch. The CDP's stated ` +
      `collateral does not change between touches, so this is the whole of the feed's effect: the pETH price in ` +
      `${stable} at the end of the touch's block (the oracle-at-block lane's previewPrice()) against the same feed ` +
      `read at the head block, times the collateral the chain recorded at that touch.`,
    formula: "coll (at the touch) × (previewPrice now − previewPrice at the touch)",
    inputs: [
      {
        label: "collateral at the touch",
        value: formatExact(w.collAtTouch),
        kind: "chain",
        pclass: "state",
        note: "getCDP(id).coll — the slot written at the last touch",
      },
      {
        label: `pETH in ${stable} at the touch`,
        value: formatExact(w.from.pethInDebt),
        kind: "chain-derived",
        pclass: "oracle",
        note: `previewPrice() at the end of block ${w.from.block.toLocaleString("en-US")}`,
      },
      {
        label: `pETH in ${stable} now`,
        value: formatExact(w.to.pethInDebt),
        kind: "chain-derived",
        pclass: "oracle",
        note: `previewPrice() at block ${w.to.block.toLocaleString("en-US")}`,
      },
      ...feedLegInputs(w, market),
    ],
  };

  const protocolProv: Provenance = {
    kind: "chain-derived",
    pclass: "state",
    summary:
      `Everything the protocol has done to this CDP since that touch — valued at the feed now. Each leg is its own ` +
      `getter on the cdpManager, pending until the CDP's next touch settles it into the stated figures: interest ` +
      `charged on the debt, the Protocol Safety Rate's stability gain against it, the pETH reward on the debt, and ` +
      `the CDP's pro-rata share of every PSM mint and redemption since — which moves both sides at once.`,
    formula: "(mintRedeemCollChange + bcTokenGain) × price − accruedInterest − mintRedeemDebtChange + accruedStables",
    inputs: [
      ...(Math.abs(w.raw.psmColl) > DUST || Math.abs(w.raw.psmDebt) > DUST
        ? [
            {
              label: "PSM share, collateral leg",
              value: formatExact(w.raw.psmColl),
              kind: "chain" as const,
              pclass: "state" as const,
              note: "getCDPMintRedeemCollChange(id), in pETH",
            },
            {
              label: "PSM share, debt leg",
              value: formatExact(w.raw.psmDebt),
              kind: "chain" as const,
              pclass: "state" as const,
              note: `getCDPMintRedeemDebtChange(id), in ${stable}`,
            },
          ]
        : []),
      ...(Math.abs(w.raw.reward) > DUST
        ? [
            {
              label: "pETH reward",
              value: formatExact(w.raw.reward),
              kind: "chain" as const,
              pclass: "state" as const,
              note: "getCDPBcTokenGain(id) — the bonding curve's yield on the debt",
            },
          ]
        : []),
      ...(Math.abs(w.legs.interest) > DUST
        ? [
            {
              label: "interest charged",
              value: formatExact(w.legs.interest),
              kind: "chain" as const,
              pclass: "state" as const,
              note: `getCDPAccruedInterest(id), in ${stable}`,
            },
          ]
        : []),
      ...(Math.abs(w.legs.stabilityGain) > DUST
        ? [
            {
              label: "stability gain",
              value: formatExact(w.legs.stabilityGain),
              kind: "chain" as const,
              pclass: "state" as const,
              note: `getCDPAccruedStables(id) — the Protocol Safety Rate's receipt, against the debt`,
            },
          ]
        : []),
      {
        label: `pETH in ${stable} now`,
        value: formatExact(w.to.pethInDebt),
        kind: "chain-derived",
        pclass: "oracle",
        note: "the feed the pETH legs are valued at",
      },
    ],
  };

  const totalProv: Provenance = {
    kind: "derived",
    summary:
      `The whole change in this CDP's equity at the feed since its last touch — the feed's effect plus the ` +
      `protocol's, which is all of it: the holder did nothing inside this window, so no other cause exists. Equity ` +
      `here is a valuation at a block, not a profit; naming a profit would need a price for the holder's own ` +
      `deposits, which is a choice about basis rather than a fact of the chain.`,
    formula: "(entireColl × price now − entireDebt) − (coll × price at the touch − debt)",
    inputs: [
      {
        label: "equity at the touch",
        value: formatExact(w.equityAtTouch),
        kind: "derived",
        note: "the stated slots at that block, at that block's feed",
      },
      {
        label: "equity now",
        value: formatExact(w.equityNow),
        kind: "chain-derived",
        pclass: "state",
        note: "getCDPEntireColl × previewPrice − getCDPEntireDebt at the head block",
      },
    ],
  };

  const legNames = polarisProtocolLegNames(w);

  const Row = ({ label, detail, value }: { label: string; detail: ReactNode; value: ReactNode }) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <span className="min-w-0">
        <span className="text-foreground">{label}</span> <span className="text-rb-500">{detail}</span>
      </span>
      <span className="shrink-0">{value}</span>
    </div>
  );

  return (
    <NoteRowShell
      icon="live-window"
      isFirst={isFirst}
      label={`Since its last touch — ${signedFigure(w.total, stable)}`}
      marker={{ attr: "data-live-window", value: "polaris-since-touch" }}
      header={
        <>
          <span className="text-sm text-foreground">Since its last touch</span>
          {/* An ECHO of the "Change in equity at the feed" receipt below, not a
              second receipt for the same figure: one fact, stated where the row
              is closed and again where it opens. */}
          <Prov echo info={totalProv} value={formatExact(w.total)}>
            <span className="text-sm">
              <Signed value={w.total} unit={stable} />
            </span>
          </Prov>
          <span className="ml-auto text-xs text-rb-500">
            block {w.from.block.toLocaleString("en-US")} · {elapsed} ago
          </span>
        </>
      }
    >
      <div className="px-5 pb-3 pt-1 text-xs">
        <Row
          label="The feed"
          detail={
            <>
              pETH {formatPethPrice(w.from.pethInDebt)} → {formatPethPrice(w.to.pethInDebt)} {stable}, on the collateral
              stated then
            </>
          }
          value={
            <Prov info={feedProv} value={formatExact(w.feed)}>
              <Signed value={w.feed} unit={stable} />
            </Prov>
          }
        />
        <Row
          label="The protocol"
          detail={legNames.length > 0 ? legNames.join(", ") : "the legs pending since that touch"}
          value={
            <Prov info={protocolProv} value={formatExact(w.protocol)}>
              <Signed value={w.protocol} unit={stable} />
            </Prov>
          }
        />
        <div className="mt-1 border-t border-rb-300/40 pt-1 dark:border-rb-700/40">
          <Row
            label="Change in equity at the feed"
            detail=""
            value={
              <Prov info={totalProv} value={formatExact(w.total)}>
                <Signed value={w.total} unit={stable} />
              </Prov>
            }
          />
        </div>

        <p className="mt-1 text-[11px] leading-snug text-rb-400">
          A CDP&rsquo;s stated collateral and debt do not change between its own touches, so these two are the whole of
          what moved it — no basis is chosen and nothing is a profit. The protocol&rsquo;s legs settle into the stated
          figures at the next touch.
        </p>
      </div>
    </NoteRowShell>
  );
}
