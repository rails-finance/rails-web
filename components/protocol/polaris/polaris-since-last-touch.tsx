"use client";

// Polaris — "Since its last touch": the live window's two causes, side by side.
// ----------------------------------------------------------------------------
// Between two of a CDP's own touches its stated figures do not move, so exactly
// two things changed what it is worth at the market's own feed — the feed, and
// the protocol's pending legs — and they add up to the whole move. That is
// what this row states: the feed, one line per protocol leg (largest first,
// dust left out), and the total under a rule, every figure receipted, no
// percentage and no colour (lib/polaris/since-last-touch.ts carries the why).
// Where the last touch is the open, the row says "Since its open": the one
// window where a statement over the CDP's whole life is a fact.
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
import { formatExact } from "@/lib/utils/format";
import { formatPethPrice } from "@/components/protocol/polaris/polaris-position-card";
import { formatDuration } from "@/lib/date";
import {
  polarisProtocolLegs,
  polarisSinceLabel,
  signedFigure,
  type PolarisProtocolLeg,
  type PolarisProtocolLegKey,
  type PolarisSinceLastTouch,
} from "@/lib/polaris/since-last-touch";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatPeth } from "@/lib/polaris/figure-format";

const Signed = ({ value, unit }: { value: number; unit: string }) => (
  <span className="font-semibold text-foreground tabular-nums">
    {value >= 0 ? "+" : "−"}
    <AmountText value={Math.abs(value)} format="compact" /> {unit}
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
}: {
  window: PolarisSinceLastTouch;
  market: "usdp" | "goldp";
  stable: string;
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

  const priceNowInput = {
    label: `pETH in ${stable} now`,
    value: formatExact(w.to.pethInDebt),
    kind: "chain-derived" as const,
    pclass: "oracle" as const,
    note: "the feed the pETH legs are valued at",
  };
  const pendingNote = "pending until the CDP's next touch settles it into the stated figures";
  /** One receipt per protocol leg: its getter, valued at the feed now. */
  const legProv = (key: PolarisProtocolLegKey): Provenance => {
    switch (key) {
      case "psm":
        return {
          kind: "chain-derived",
          pclass: "state",
          summary:
            `This CDP's net PSM share — its pro-rata share of every PSM mint and redemption since that touch, valued ` +
            `at the feed now; its two sides can move in opposite directions. The docs call these the peg-defence fees. ` +
            `It is ${pendingNote}.`,
          formula: "mintRedeemCollChange × price − mintRedeemDebtChange",
          inputs: [
            {
              label: "net PSM share, collateral side",
              value: formatExact(w.raw.psmColl),
              kind: "chain",
              pclass: "state",
              note: "getCDPMintRedeemCollChange(id), in pETH",
            },
            {
              label: "net PSM share, debt side",
              value: formatExact(w.raw.psmDebt),
              kind: "chain",
              pclass: "state",
              note: `getCDPMintRedeemDebtChange(id), in ${stable}`,
            },
            priceNowInput,
          ],
        };
      case "reward":
        return {
          kind: "chain-derived",
          pclass: "state",
          summary:
            `This CDP's pETH reward — the pETH the protocol has distributed to it in proportion to its debt since ` +
            `that touch, valued at the feed now. The docs call it the pETH yield to minters. It is ${pendingNote}.`,
          formula: "bcTokenGain × price",
          inputs: [
            {
              label: "pETH reward",
              value: formatExact(w.raw.reward),
              kind: "chain",
              pclass: "state",
              note: "getCDPBcTokenGain(id), in pETH",
            },
            priceNowInput,
          ],
        };
      case "interest":
        return {
          kind: "chain",
          pclass: "state",
          summary: `Interest charged — the interest accrued on the debt since that touch, ${pendingNote}.`,
          formula: "− accruedInterest",
          inputs: [
            {
              label: "interest charged",
              value: formatExact(-w.legs.interest),
              kind: "chain",
              pclass: "state",
              note: `getCDPAccruedInterest(id), in ${stable}`,
            },
          ],
        };
      case "stabilityGain":
        return {
          kind: "chain",
          pclass: "state",
          summary: `The stability gain — the Protocol Safety Rate's credit against the debt since that touch, ${pendingNote}.`,
          formula: "accruedStables",
          inputs: [
            {
              label: "stability gain",
              value: formatExact(w.legs.stabilityGain),
              kind: "chain",
              pclass: "state",
              note: `getCDPAccruedStables(id), in ${stable}`,
            },
          ],
        };
      case "settle":
        return {
          kind: "derived",
          summary:
            `The debt below zero — the pending legs clear more than the debt, and the next touch settles the debt to ` +
            `zero, so this part is taken back out.`,
          formula: "min(0, entireDebt)",
          inputs: [
            {
              label: "entire debt",
              value: formatExact(w.legs.settle),
              kind: "chain",
              pclass: "state",
              note: `getCDPEntireDebt(id), in ${stable}`,
            },
          ],
        };
    }
  };

  const totalProv: Provenance = {
    kind: "derived",
    summary:
      `The whole change in this CDP's equity at the feed since its ${w.sinceOpen ? "open" : "last touch"}: the feed's ` +
      `effect plus the protocol's legs. The holder did nothing inside this window, so no other cause exists. Equity ` +
      `here is a valuation at a block.`,
    formula: "(entireColl × price now − max(0, entireDebt)) − (coll × price at the touch − debt)",
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
        note: "getCDPEntireColl × previewPrice − getCDPEntireDebt (zero at or below zero) at the head block",
      },
    ],
  };

  const legs = polarisProtocolLegs(w);
  const since = polarisSinceLabel(w);
  const feedLegs = [
    ["bonding curve", w.from.curve, w.to.curve, " ETH"],
    ["ETH/USD", w.from.ethUsd, w.to.ethUsd, ""],
    ...(market === "goldp" ? [["XAU/USD", w.from.xauUsd, w.to.xauUsd, ""]] : []),
  ] as Array<[string, number | undefined, number | undefined, string]>;
  const feedLegText = feedLegs
    .filter(([, a, b]) => a != null && b != null)
    .map(([name, a, b, unit]) => `${name} ${formatPethPrice(a as number)} → ${formatPethPrice(b as number)}${unit}`)
    .join(", ");
  // The docs' names beside ours (content/polaris/event-prose.yaml, `words`).
  const legDetail = (l: PolarisProtocolLeg): string =>
    l.key === "psm"
      ? POLARIS_WORDS.docs_psm
      : l.key === "reward"
        ? `${formatPeth(w.raw.reward)} pETH ${POLARIS_WORDS.docs_reward}`
        : "";

  const Row = ({
    label,
    detail,
    value,
    leg,
    indent,
  }: {
    label: string;
    detail: ReactNode;
    value: ReactNode;
    leg?: string;
    indent?: boolean;
  }) => (
    <div className={`flex items-baseline justify-between gap-x-3 ${indent ? "py-1 pl-3" : "py-1.5"}`} data-leg={leg}>
      <span className="min-w-0">
        <span className="text-foreground">{label}</span> <span className="text-rb-500">{detail}</span>
      </span>
      <span className="shrink-0">{value}</span>
    </div>
  );

  return (
    <NoteRowShell
      icon="live-window"
      label={`${since} — ${signedFigure(w.total, stable)}`}
      marker={{ attr: "data-live-window", value: "polaris-since-touch" }}
      header={
        <>
          <span className="text-sm text-foreground">{since}</span>
          {/* The closed row names its figure: a bare number read as nothing. */}
          <span className="text-xs text-rb-500">change in equity at the feed</span>
          {/* An ECHO of the "Change in equity at the feed" receipt below, not a
              second receipt for the same figure: one fact, stated where the row
              is closed and again where it opens. */}
          <Prov echo info={totalProv} value={formatExact(w.total)}>
            <span className="text-sm">
              <Signed value={w.total} unit={stable} />
            </span>
          </Prov>
          {/* The block is a link to the touch's block on the chain's explorer,
              chrome rather than a figure of this row. */}
          <span className="ml-auto text-xs text-rb-500" data-prov-exempt="">
            from block <BlockRef block={w.from.block} /> · {elapsed} ago
          </span>
        </>
      }
    >
      <div className="px-5 pb-3 pt-1 text-xs">
        <Row
          label="The feed:"
          leg="feed"
          detail={
            <>
              pETH {formatPethPrice(w.from.pethInDebt)} → {formatPethPrice(w.to.pethInDebt)} {stable}
              {feedLegText ? ` (${feedLegText})` : ""}, on the collateral stated then
            </>
          }
          value={
            <Prov info={feedProv} value={formatExact(w.feed)}>
              <Signed value={w.feed} unit={stable} />
            </Prov>
          }
        />
        {legs.length > 0 && (
          <div className="pt-1.5 text-foreground">The protocol&rsquo;s legs, pending until the next touch:</div>
        )}
        {legs.map((l) => (
          <Row
            key={l.key}
            leg={l.key}
            indent
            label={l.name.charAt(0).toUpperCase() + l.name.slice(1)}
            detail={legDetail(l)}
            value={
              <Prov info={legProv(l.key)} value={formatExact(l.value)}>
                <Signed value={l.value} unit={stable} />
              </Prov>
            }
          />
        ))}
        <div className="mt-1 border-t border-rb-300/40 pt-1 dark:border-rb-700/40">
          <Row
            label="Change in equity at the feed"
            leg="total"
            detail=""
            value={
              <Prov info={totalProv} value={formatExact(w.total)}>
                <Signed value={w.total} unit={stable} />
              </Prov>
            }
          />
        </div>

        <p className="mt-1 text-[11px] leading-snug text-rb-400">
          {w.sinceOpen
            ? "This CDP has had no touch since its open, and its stated collateral and debt change only at a touch, so these lines are the whole of what moved its equity at the feed over its life. Its first touch writes the protocol’s legs into the stated figures."
            : "A CDP’s stated collateral and debt change only at a touch, so these lines are the whole of what moved its equity at the feed since the last one. The next touch writes the protocol’s legs into the stated figures."}
        </p>
      </div>
    </NoteRowShell>
  );
}
