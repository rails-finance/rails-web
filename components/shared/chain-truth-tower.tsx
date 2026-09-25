"use client";

// <ChainTruthTower> — the shared economics section for the chain-state tier
// (MakerDAO, Morpho, Spark). It renders the one faithful artifact a borrow
// position has: its debt split into PRINCIPAL vs ACCRUED INTEREST/FEE, beside the
// collateral backing it. Each protocol feeds the same normalized
// ChainTruthTowerData (lib/shared/chain-truth-economics) via its own settle logic.
//
// Both bar modes go through the SAME DualTowerChart primitive the reference
// towers (Liquity, Aave) use — centred bars flanked by breakdown tables — so the
// chain-state tier matches the gold-standard layout. What differs is the scale:
//   • valued (Maker, has the OSM price) → USD, ONE shared scale across both
//     towers, so collateral and debt heights are directly comparable.
//   • token (Morpho, amounts-only) → each tower normalised to its OWN base, so a
//     small-magnitude collateral (0.1 BTC) doesn't vanish beside a 6k USDC debt.
//     Heights are NOT comparable across the two — different units.
//
// Lifetime flows are the DEFAULT view (matching the reference towers — Liquity's
// trove economics, Aave V4): the gross history a side can show FAITHFULLY —
// hatched reverse-diagonal for voluntary exits (withdrawn / repaid),
// forward-diagonal for liquidated, and a faded side bar for the all-time inflow —
// with a "Hide inactive / repaid" Display toggle back to the clean current-state
// principal/interest split. A feeder only populates flows that
// reconcile with the chain (flowsReconcile; e.g. Maker's debt-side DAI history needs a
// per-block rate it doesn't capture, so it leaves them empty). When NEITHER side
// carries flows, the toggle is replaced by an explicit "no lifetime flows" note
// (data.flowsNote or a generic default) — a missing control is never left
// unexplained.
//
// When there is neither a price NOR a same-token interest split to show (Spark:
// multi-reserve, amounts-only, no current-with-interest read), comparative bars
// across different tokens would imply a magnitude relationship that doesn't
// exist — so the gated path renders a principal list + an explicit note instead.
//
// A stability-pool deposit draws on the same tower (rails-ops decision 0022):
// the eventless gap between a side's last event and its state read may sit on
// either side and may take away (`eventlessGains` / `eventlessLosses`), and a
// side holding several tokens draws one bar per token (`bars`). All three are
// opt-in; a feeder that sets none renders as before.

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChartColumnBig, ChevronDown } from "lucide-react";
import {
  DualTowerChart,
  formatCompactUsd,
  formatUsdValue,
  LIQUIDATION_PATTERN,
  REDEMPTION_PATTERN,
  REPAID_PATTERN,
  WITHDRAWN_PATTERN,
  type TowerSide,
  type TowerSegment,
  type BreakdownRow,
} from "@/components/shared/economics-chart-primitives";
import { FilterDropdown, DisplaySettingsIcon, type FilterOption } from "@/components/shared/filter-dropdown";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { CTRL_GHOST, CTRL_OFF, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import {
  COLLAPSE_KEY_ATTR,
  COLLAPSED_ATTR,
  collapseScript,
  isFlowsCollapsed,
  setFlowsCollapsed,
} from "@/lib/shared/flows-collapse-store";
import { formatCompact, formatNumber } from "@/lib/utils/format";
import {
  type ChainTruthTowerData,
  type TowerLine,
  type TowerSideData,
  lineScalar,
} from "@/lib/shared/chain-truth-economics";

// ── Colour grammar (shared with the Aave reference tower) ────────────────────
const COLL_SOLID = "bg-blue-500"; // collateral held
const DEBT_SOLID = "bg-green-400"; // debt principal
const FEE_SOLID = "bg-green-400/55"; // accrued interest / stability fee — the lighter, stacked portion of debt
const COLL_GAIN = "bg-blue-500/55"; // eventless gains on the left side — the same lighter portion, in its hue
const COLL_FADED = "rgba(59,130,246,0.2)"; // collateral all-time inflow side bar
const DEBT_FADED = "rgba(74,222,128,0.2)"; // debt all-time inflow side bar
// Claimable (collateral side, e.g. Liquity V2 liquidation surplus) — the same
// solid-plus-ring treatment the Liquity V2 trove's bespoke tower used for
// still-withdrawable, no-longer-live balances.
const CLAIMABLE_SOLID = "bg-blue-700 ring-1 ring-inset ring-green-400";
const TOWER_H = 180;

/** A flow line's hatch: the bucket's default (liquidation / exit) unless the
 *  line tags its mechanic — another party's act on the position (a Liquity V2
 *  redemption, either leg of a Polaris PSM share) draws the pink checker, in
 *  the segment and in its breakdown swatch alike. `"redeemed"` is a debt or
 *  collateral leg an actual redemption moved; `"external"` is the same
 *  mechanic in a direction "redeemed" would misname (a PSM mint-share
 *  inflow is another party's act too, but calling it "redeemed" would be
 *  wrong) — both draw the same pink checker. */
function flowPattern(l: TowerLine, bucketDefault: CSSProperties): CSSProperties {
  return l.flowKind === "redeemed" || l.flowKind === "external" ? REDEMPTION_PATTERN : bucketDefault;
}

/** Format a line for tooltips: USD when valued, else token amount + symbol. */
function lineText(l: TowerLine, valued: boolean): string {
  return valued ? formatCompactUsd(lineScalar(l, valued)) : `${formatNumber(l.amount)} ${l.symbol}`;
}

/** Receipt for a row's USD hint — the row's token amount at the price the
 *  protocol uses for that token now. A tower is only `valued` when every
 *  contributing line is priced (the feeders' per-total guard, priceKind
 *  "chain-derived"): the protocol's oracle, or a stablecoin's $1 face where
 *  the protocol reckons it so (Maker's DAI, the Liquity family's debt). */
function usdHintProv(l: TowerLine): Provenance {
  return {
    kind: "chain-derived",
    summary: `${l.symbol} value in USD — the row's ${l.symbol} amount multiplied by the price the protocol uses for ${l.symbol} now.`,
    formula: "amount × price",
    inputs: [
      { label: "amount", value: `${formatNumber(l.amount)} ${l.symbol}`, kind: l.prov.kind, note: "this row" },
      { label: "price", kind: "chain-derived", pclass: "oracle", note: "the protocol's price now" },
    ],
  };
}

// ── Group assets (display-only transform) ────────────────────────────────────
// Collapses a bucket's per-asset lines into one merged line where the merge is
// faithful: same symbol → token amounts sum; cross-symbol only when the tower
// is valued AND every line is priced (the merged row shows the USD sum). An
// unvalued cross-symbol bucket never merges — a token sum across assets would
// invent a figure no chain read supports (chain-truth charter). The feeder
// contract (lib/shared/chain-truth-economics) is untouched: this runs over the
// side data before buildSide, and per-bucket sums are preserved, so towerMax
// and the scale are identical grouped or ungrouped.

type DisplayLine = TowerLine & {
  /** The per-asset lines this row merges — drives the breakdown tooltip. */
  mergedParts?: TowerLine[];
  /** Caption for a cross-symbol merged row ("3 assets"); symbol rows caption
   *  by symbol as before. */
  mergedLabel?: string;
};

/** Receipt for a merged row — the result-row voice: the sum is computed in the
 *  browser over rows that each carry their own receipt when ungrouped. */
function mergedProv(label: string, parts: TowerLine[], valued: boolean): Provenance {
  return {
    kind: "chain-derived",
    summary: `${label} — the ${parts.length} rows merged into this one, added together. With "Group assets" off, each row shows separately with its receipt.`,
    formula: valued && parts.some((p) => p.symbol !== parts[0].symbol) ? "Σ amount × price" : "Σ amount",
    inputs: parts.slice(0, 6).map((p) => ({
      label: p.symbol,
      value: `${formatNumber(p.amount)} ${p.symbol}`,
      kind: p.prov.kind,
      note: "its receipt shows when ungrouped",
    })),
  };
}

/** The one contract address a set of lines all name — or undefined the moment
 *  they disagree or any of them is silent.
 *
 *  Same single-match rule as soleFlowAddress (lib/shared/format-event.ts), and
 *  for the same reason: the whole letter-glyph problem exists BECAUSE a symbol
 *  is not an identifier, so a merged row that picked one address out of several
 *  would reintroduce the mistake a layer down. A plausible-but-wrong brand mark
 *  is worse than a truthful letter. */
function soleAddress(lines: TowerLine[]): string | undefined {
  const first = lines[0]?.address;
  if (!first) return undefined;
  return lines.every((l) => l.address?.toLowerCase() === first.toLowerCase()) ? first : undefined;
}

/** Merge one bucket (≥2 lines, same flow caption) where faithful; otherwise
 *  return it unchanged. */
function mergeBucket(lines: TowerLine[], valued: boolean, keyPrefix: string): DisplayLine[] {
  if (lines.length < 2) return lines;
  const sameSymbol = lines.every((l) => l.symbol === lines[0].symbol);
  const allPriced = lines.every((l) => l.usd != null);
  const label = lines[0].flowLabel ?? (sameSymbol ? lines[0].symbol : `${lines.length} assets`);
  if (sameSymbol) {
    return [
      {
        key: `${keyPrefix}-merged`,
        symbol: lines[0].symbol,
        amount: lines.reduce((s, l) => s + l.amount, 0),
        usd: allPriced ? lines.reduce((s, l) => s + (l.usd ?? 0), 0) : null,
        // Same symbol does not settle the identity — two lines can share one
        // and name different contracts — so the merged row keeps an address
        // only where every part named the same one.
        address: soleAddress(lines),
        prov: mergedProv(label, lines, valued),
        flowLabel: lines[0].flowLabel,
        flowKind: lines[0].flowKind,
        mergedParts: lines,
      },
    ];
  }
  if (valued && allPriced) {
    return [
      {
        key: `${keyPrefix}-merged`,
        // A cross-symbol row names no one token, so it carries neither a symbol
        // nor an address — and draws no chip at all (the denomination rule).
        symbol: "",
        amount: 0,
        usd: lines.reduce((s, l) => s + (l.usd ?? 0), 0),
        prov: mergedProv(label, lines, valued),
        flowLabel: lines[0].flowLabel,
        flowKind: lines[0].flowKind,
        mergedParts: lines,
        mergedLabel: `${lines.length} assets`,
      },
    ];
  }
  return lines;
}

/** Whether a bucket would actually merge — the "Group assets" menu gate. */
function bucketMergeable(lines: TowerLine[], valued: boolean): boolean {
  if (lines.length < 2) return false;
  return lines.every((l) => l.symbol === lines[0].symbol) || (valued && lines.every((l) => l.usd != null));
}

/** Sub-bucket a flow array by its effective caption so distinct mechanics
 *  ("Redeemed" vs "Repaid") never merge into one row. */
function flowBuckets(lines: TowerLine[]): TowerLine[][] {
  const map = new Map<string, TowerLine[]>();
  for (const l of lines) {
    const k = l.flowLabel ?? "";
    const arr = map.get(k) ?? [];
    arr.push(l);
    map.set(k, arr);
  }
  return [...map.values()];
}

function groupSide(side: TowerSideData, valued: boolean): TowerSideData {
  const flows = (lines: TowerLine[], prefix: string) =>
    flowBuckets(lines).flatMap((b, i) => mergeBucket(b, valued, `${prefix}-${i}`));
  return {
    ...side,
    current: mergeBucket(side.current, valued, "current"),
    exited: flows(side.exited, "exited"),
    liquidated: flows(side.liquidated, "liq"),
    received: side.received ? flows(side.received, "recv") : side.received,
    claimable: side.claimable ? flows(side.claimable, "claim") : side.claimable,
    costs: side.costs ? flows(side.costs, "cost") : side.costs,
    ...(side.bars ? { bars: side.bars.map((b) => groupSide(b, valued)) } : {}),
    // interest, the eventless lines and lifetimeInflow never merge.
  };
}

function sideCanGroup(side: TowerSideData, valued: boolean): boolean {
  return (
    (side.bars ?? []).some((b) => sideCanGroup(b, valued)) ||
    bucketMergeable(side.current, valued) ||
    flowBuckets(side.exited).some((b) => bucketMergeable(b, valued)) ||
    flowBuckets(side.liquidated).some((b) => bucketMergeable(b, valued)) ||
    flowBuckets(side.received ?? []).some((b) => bucketMergeable(b, valued)) ||
    flowBuckets(side.claimable ?? []).some((b) => bucketMergeable(b, valued)) ||
    flowBuckets(side.costs ?? []).some((b) => bucketMergeable(b, valued))
  );
}

/** Tooltip for a merged segment/row — the Aave V4 shape: the total, then up to
 *  six per-asset lines (icon + symbol + amount, each through the tipFigure()
 *  echo so hovering never churns the receipts list), then an overflow count. */
function mergedTipNode(l: DisplayLine, valued: boolean) {
  const parts = l.mergedParts ?? [];
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 font-medium">
        <span>{l.mergedLabel ?? l.symbol}</span>
        <span className="ml-auto tabular-nums">
          {valued && l.usd != null ? formatCompactUsd(l.usd) : `${formatNumber(l.amount)} ${l.symbol}`}
        </span>
      </div>
      {parts.slice(0, 6).map((p) => (
        <div key={p.key} className="flex items-center gap-1.5 text-rb-500">
          <TokenChipIcon symbol={p.symbol} address={p.address} size={12} filterable={false} />
          <span>{p.symbol}</span>
          <span className="ml-auto">{tipFigure(p, valued)}</span>
        </div>
      ))}
      {parts.length > 6 && <div className="text-rb-500">+{parts.length - 6} more</div>}
    </div>
  );
}

/** What the side holds NOW, split into the principal and accrued-interest
 *  segments the tower stacks. `current` lines carry the net event principal
 *  once an interest split engages (borrowed − repaid − liquidated), and that
 *  net can be BELOW zero: repayments have covered more than was ever drawn,
 *  and what is still owed is accrued interest alone (an Aave V3 wallet owing
 *  0.004 USDe on a −9.053 principal and +9.057 accrued, 2026-09-10). The
 *  balance is principal + accrued, so the clamp at zero belongs to that SUM —
 *  clamping each leg on its own printed the accrued figure as the debt held
 *  ("Current debt $9" over a header reading "< $0.01"). A negative principal
 *  draws no segment; the interest segment is the whole of what is held.
 *
 *  Eventless lines (decision 0022) move the same balance: gains join the
 *  upper portion beside interest, and losses come out of the principal, so
 *  `principal` is what the events record less what has left since. */
function heldSplit(side: TowerSideData, valued: boolean) {
  const signed = side.current.reduce((s, l) => s + lineScalar(l, valued), 0);
  const accrued = side.interest && side.interest.amount > 0 ? Math.max(0, lineScalar(side.interest, valued)) : 0;
  const gains = eventlessTotal(side.eventlessGains, valued);
  const losses = eventlessTotal(side.eventlessLosses, valued);
  const total = Math.max(0, signed + accrued + gains - losses);
  const principal = Math.max(0, signed - losses);
  return { principal, interest: total - principal, total };
}

function eventlessTotal(lines: TowerLine[] | undefined, valued: boolean): number {
  return (lines ?? []).reduce((s, l) => s + Math.max(0, lineScalar(l, valued)), 0);
}

/** A side as the bars it draws: its `bars` when it splits by token, else itself. */
function sideParts(side: TowerSideData): TowerSideData[] {
  return side.bars ?? [side];
}

/** Per-side scalars used for scaling. `base` is the height reference: the taller
 *  of the stacked total (current + interest + flows) and the all-time inflow. */
function sideScalars(side: TowerSideData, valued: boolean) {
  const sc = (l: TowerLine) => Math.max(0, lineScalar(l, valued));
  const held = heldSplit(side, valued);
  const current = held.principal;
  const interest = held.interest;
  const exited = side.exited.reduce((s, l) => s + sc(l), 0);
  const liquidated = side.liquidated.reduce((s, l) => s + sc(l), 0);
  // Claimable is a real, separately-held balance (Liquity V2's liquidation
  // surplus) — it grows the stack like `current`. `costs` never does: its
  // value is already inside `current`/`interest` (the same non-double-
  // counting rule `received` follows).
  const claimable = (side.claimable ?? []).reduce((s, l) => s + sc(l), 0);
  // A loss since the last event has left the held balance (heldSplit carves it
  // out of `current`), so it stacks beside the realised outflows.
  const losses = eventlessTotal(side.eventlessLosses, valued);
  const stack = current + interest + claimable + exited + liquidated + losses;
  // Received-by-transfer is inflow that isn't a fresh deposit — it grows the
  // reference bar so it still matches the stack (deposited + received = current
  // + exited + liquidated), but it never joins the stacked segments (its value
  // is already inside `current`).
  const received = (side.received ?? []).reduce((s, l) => s + sc(l), 0);
  const inflow = side.lifetimeInflow + received;
  return { stack, inflow, base: Math.max(stack, inflow) };
}

/** Build one TowerSide. `toTV` maps a raw scalar (USD or token) into tower-value
 *  units the shared `towerMax` scales; `flowColor`/`exitPattern` carry the side's
 *  hatched-flow grammar; `hideHistorical` collapses the lifetime history back to
 *  the current-state split. */
function buildSide(
  side: TowerSideData,
  opts: {
    solid: string;
    /** Swatch of the eventless-gain segment and rows. */
    gainSolid: string;
    flowColor: string;
    exitPattern: CSSProperties;
    exitLabel: string;
    inflowLabel: string;
    withInterest: boolean;
    /** Legend caption for the interest segment (default "Accrued interest") —
     *  a feeder whose eventless accrual is not interest names its own
     *  mechanic (f(x): "Socialized accrual"). */
    interestLabel?: string;
    valued: boolean;
    resultLabel: string;
    toTV: (scalar: number) => number;
    towerMax: number;
    hideHistorical: boolean;
    height: number;
  },
): TowerSide {
  const {
    solid,
    flowColor,
    exitPattern,
    exitLabel,
    inflowLabel,
    withInterest,
    valued,
    resultLabel,
    toTV,
    towerMax,
    hideHistorical,
    height,
  } = opts;
  const sc = (l: TowerLine) => Math.max(0, lineScalar(l, valued));
  const interestLine = withInterest && side.interest && side.interest.amount > 0 ? side.interest : null;
  const receivedLines = side.received ?? [];
  const receivedTotal = receivedLines.reduce((s, l) => s + sc(l), 0);
  // The faded inflow bar spans real deposits + custody received by transfer.
  const totalInflow = side.lifetimeInflow + receivedTotal;
  const hasFlows =
    !hideHistorical &&
    (side.exited.length > 0 || side.liquidated.length > 0 || side.lifetimeInflow > 0 || receivedLines.length > 0);

  // A row's displayed denomination decides its token chip (the design-grammar
  // rule): token-denominated rows carry the chip; USD-sum and cross-symbol
  // merged rows don't.
  const chip = (symbol: string, address?: string) => (
    <TokenChipIcon symbol={symbol} address={address} size={14} filterable={false} />
  );
  const rowTip = (l: TowerLine, suffix = "") =>
    (l as DisplayLine).mergedParts ? mergedTipNode(l as DisplayLine, valued) : tip(l, valued, suffix);

  // ── Segments (bottom → top): current solids, claimable, interest, the
  //    eventless gains and losses, then hatched flows. Claimable sits directly beside current — both are
  //    solid, currently-held balances (Liquity V2: the position's live
  //    balance and its still-withdrawable liquidation surplus). ──
  const gainLines = side.eventlessGains ?? [];
  const lossLines = side.eventlessLosses ?? [];
  const gainTotal = eventlessTotal(gainLines, valued);
  // A loss since the last event is carved out of what the events record, so
  // the solid draws what is held now and the loss takes its own segment.
  const recorded = side.current.reduce((s, l) => s + sc(l), 0);
  const lossTotal = eventlessTotal(lossLines, valued);
  const carve = lossTotal > 0 && recorded > 0 ? Math.max(0, recorded - lossTotal) / recorded : 1;
  const segments: TowerSegment[] = side.current.map((l) => ({
    key: l.key,
    label: (l as DisplayLine).mergedLabel ?? l.symbol,
    value: toTV(sc(l) * carve),
    colorClass: solid,
    tooltip: rowTip(l),
  }));
  const claimableLines = side.claimable ?? [];
  claimableLines.forEach((line) => {
    const l = line as DisplayLine;
    segments.push({
      key: l.key,
      label: l.mergedLabel ?? l.flowLabel ?? "Claimable",
      value: toTV(sc(l)),
      colorClass: CLAIMABLE_SOLID,
      tooltip: rowTip(l),
    });
  });
  if (interestLine) {
    segments.push({
      key: "interest",
      label: "Accrued",
      value: toTV(heldSplit(side, valued).interest - gainTotal),
      colorClass: FEE_SOLID,
      tooltip: tip(interestLine, valued, " accrued"),
    });
  }
  gainLines.forEach((l, i) =>
    segments.push({
      key: `gain-${l.key}-${i}`,
      label: l.flowLabel ?? l.symbol,
      value: toTV(sc(l)),
      colorClass: opts.gainSolid,
      tooltip: rowTip(l),
    }),
  );
  lossLines.forEach((l, i) =>
    segments.push({
      key: `loss-${l.key}-${i}`,
      label: l.flowLabel ?? l.symbol,
      value: toTV(sc(l)),
      colorClass: "",
      patternStyle: flowPattern(l, LIQUIDATION_PATTERN),
      tooltip: rowTip(l),
    }),
  );
  const flowSegs = (lines: TowerLine[], pattern: CSSProperties, prefix: string): TowerSegment[] =>
    lines.map((l, i) => ({
      key: `${prefix}-${l.key}-${i}`,
      label: (l as DisplayLine).mergedLabel ?? l.symbol,
      value: toTV(sc(l)),
      colorClass: "",
      patternStyle: flowPattern(l, pattern),
      tooltip: rowTip(l),
      hidden: hideHistorical,
    }));
  segments.push(...flowSegs(side.liquidated, LIQUIDATION_PATTERN, "liq"));
  segments.push(...flowSegs(side.exited, exitPattern, "exit"));

  // ── Faded all-time inflow side bar (reference height) ──
  // Height spans deposits + received-by-transfer, so it still matches the stack.
  const sideBar =
    totalInflow > 0
      ? { heightPct: (toTV(totalInflow) / towerMax) * height, color: flowColor, hidden: hideHistorical }
      : undefined;

  // ── Breakdown rows ──
  // Display compact ("11M"); the exact figure rides the tooltip + provenance
  // trace (view-tiers.md — compact is the one-step readability leeway the tier
  // allows). USD (valued) rows are already compact via formatCompactUsd.
  const fmt = (l: TowerLine) =>
    valued && l.usd != null ? formatCompactUsd(l.usd) : `${formatCompact(l.amount)} ${l.symbol}`;
  const fmtExact = (l: TowerLine): string | undefined =>
    valued && l.usd != null ? undefined : `${formatNumber(l.amount)} ${l.symbol}`;
  // The denomination rule: a row about ONE token carries the chip (even when
  // its figure displays as USD); a cross-symbol merged row has no single token
  // and stays chip-less.
  const flowIcon = (l: TowerLine) => (l.symbol ? chip(l.symbol, l.address) : undefined);
  // The (all time) row is denominated in the side's token only when the whole
  // side speaks ONE symbol.
  const sideLines = [
    ...side.current,
    ...(side.received ?? []),
    ...side.exited,
    ...side.liquidated,
    ...gainLines,
    ...lossLines,
    side.interest,
  ]
    .flatMap((l) => (l ? [l] : []))
    .concat((side.current as DisplayLine[]).flatMap((l) => l.mergedParts ?? []))
    .filter((l) => l.symbol);
  const sideSymbols = new Set(sideLines.map((l) => l.symbol));
  const sideSymbol = sideSymbols.size === 1 ? [...sideSymbols][0] : null;
  // …and the row's chip is that token's only when the side also names ONE
  // address. A side speaking one symbol over two contracts has no single mark
  // to draw, and guessing which of them the summed figure belongs to would be
  // exactly the mistake the letter glyph exists to avoid.
  const sideAddress = sideSymbol ? soleAddress(sideLines) : undefined;
  const rows: BreakdownRow[] = [];
  if (hasFlows && side.lifetimeInflow > 0) {
    rows.push({
      sign: "",
      label: `${inflowLabel} (all time)`,
      amount: valued ? formatCompactUsd(side.lifetimeInflow) : formatCompact(side.lifetimeInflow),
      exact: valued ? undefined : formatNumber(side.lifetimeInflow),
      icon: sideSymbol ? chip(sideSymbol, sideAddress) : undefined,
      swatchStyle: { backgroundColor: flowColor },
      prov: {
        kind: "chain-derived",
        summary: valued
          ? `${inflowLabel} over the position's life — every inflow the position's events record, added up per token and valued at the price the protocol uses for that token now.`
          : `${inflowLabel} over the position's life — every inflow the position's events record, added up.`,
        formula: "Σ inflows",
      },
    });
  }
  // "+ Received by transfer" — inflow that isn't a deposit, so it sits between
  // the all-time inflow and the outflows and reads with a "+", the collateral
  // mirror of the debt side's accrued-interest line. Faded flow swatch by
  // default (it is part of the same inflow reference the top bar shows) —
  // unless the line tags its own mechanic (a Polaris PSM mint share), in
  // which case its swatch carries the same pink checker its outflow
  // counterpart does; the aggregate faded reference BAR above still can't
  // carry a per-line pattern without new geometry in the shared shell, so it
  // stays the flat faded colour.
  if (hasFlows)
    receivedLines.forEach((l) =>
      rows.push({
        sign: "+",
        label: l.flowLabel ?? "Received by transfer",
        amount: fmt(l),
        exact: fmtExact(l),
        icon: flowIcon(l),
        swatchStyle: flowPattern(l, { backgroundColor: flowColor }),
        prov: l.prov,
        indent: true,
      }),
    );
  if (hasFlows)
    side.exited.forEach((l) =>
      rows.push({
        sign: "−",
        label: l.flowLabel ?? exitLabel,
        amount: fmt(l),
        exact: fmtExact(l),
        icon: flowIcon(l),
        swatchStyle: flowPattern(l, exitPattern),
        prov: l.prov,
        indent: true,
      }),
    );
  if (hasFlows)
    side.liquidated.forEach((l) =>
      rows.push({
        sign: "−",
        label: l.flowLabel ?? "Liquidated",
        amount: fmt(l),
        exact: fmtExact(l),
        icon: flowIcon(l),
        swatchStyle: flowPattern(l, LIQUIDATION_PATTERN),
        prov: l.prov,
        indent: true,
      }),
    );
  const hintUsd = (l: TowerLine) => (valued && l.usd != null ? l.usd : null);
  side.current.forEach((line) => {
    const l = line as DisplayLine;
    if (l.mergedParts && !l.symbol) {
      // Cross-symbol merged row — only exists when every part is priced, so
      // its one faithful figure is the USD sum. No chip (no single token).
      rows.push({
        sign: "",
        label: l.mergedLabel ?? `${l.mergedParts.length} assets`,
        amount: formatCompactUsd(l.usd ?? 0),
        exact: formatUsdValue(l.usd ?? 0),
        swatchClass: solid,
        prov: l.prov,
      });
      return;
    }
    rows.push({
      sign: "",
      label: l.symbol,
      amount: formatCompact(l.amount),
      exact: formatNumber(l.amount),
      symbol: l.symbol,
      icon: chip(l.symbol, l.address),
      usdHint: hintUsd(l) != null ? formatCompactUsd(hintUsd(l)!) : undefined,
      usdProv: hintUsd(l) != null ? usdHintProv(l) : undefined,
      usdExact: hintUsd(l) != null ? formatUsdValue(hintUsd(l)!) : undefined,
      swatchClass: solid,
      prov: l.prov,
    });
  });
  // Claimable rows — right after the current-balance row(s), same solid
  // grammar (a "+" row like `received`, since it's not a fresh deposit but a
  // separately-held claim). Never gated by hideHistorical: like `current`,
  // it's a real balance sitting there right now.
  claimableLines.forEach((line) => {
    const l = line as DisplayLine;
    rows.push({
      sign: "",
      label: l.mergedLabel ?? l.flowLabel ?? "Claimable",
      amount: fmt(l),
      exact: fmtExact(l),
      icon: flowIcon(l),
      swatchClass: CLAIMABLE_SOLID,
      prov: l.prov,
    });
  });
  if (interestLine) {
    rows.push({
      sign: "+",
      label: opts.interestLabel ?? "Accrued interest",
      amount: formatCompact(interestLine.amount),
      exact: formatNumber(interestLine.amount),
      symbol: interestLine.symbol,
      usdHint: hintUsd(interestLine) != null ? formatCompactUsd(hintUsd(interestLine)!) : undefined,
      usdProv: hintUsd(interestLine) != null ? usdHintProv(interestLine) : undefined,
      usdExact: hintUsd(interestLine) != null ? formatUsdValue(hintUsd(interestLine)!) : undefined,
      swatchClass: FEE_SOLID,
      prov: interestLine.prov,
      indent: true,
    });
  }
  // Eventless rows — the gap since the last event, beside Accrued interest:
  // gains add to what the events record, losses take from it. Never gated by
  // hideHistorical; like interest, they are how the held figure is reached.
  const eventlessRow = (l: TowerLine, sign: string, swatch: Partial<BreakdownRow>): BreakdownRow => ({
    sign,
    label: l.flowLabel ?? l.symbol,
    amount: formatCompact(l.amount),
    exact: formatNumber(l.amount),
    symbol: l.symbol,
    icon: flowIcon(l),
    usdHint: hintUsd(l) != null ? formatCompactUsd(hintUsd(l)!) : undefined,
    usdProv: hintUsd(l) != null ? usdHintProv(l) : undefined,
    usdExact: hintUsd(l) != null ? formatUsdValue(hintUsd(l)!) : undefined,
    ...swatch,
    prov: l.prov,
    indent: true,
  });
  gainLines.forEach((l) => rows.push(eventlessRow(l, "+", { swatchClass: opts.gainSolid })));
  lossLines.forEach((l) => rows.push(eventlessRow(l, "−", { swatchStyle: flowPattern(l, LIQUIDATION_PATTERN) })));
  // Cost rows (Liquity V2: upfront + delegate fees) — further accrual sitting
  // beside Accrued interest, same FEE_SOLID swatch and indent, each its own
  // legend row. Historical-only (like the other flow rows): their value is
  // already inside `current`/`interest`, so they never touch the bar or the
  // result-row sum below — a pure decomposition of the cost of carry.
  const costLines = side.costs ?? [];
  if (hasFlows)
    costLines.forEach((line) => {
      const l = line as DisplayLine;
      rows.push({
        sign: "+",
        label: l.mergedLabel ?? l.flowLabel ?? l.symbol,
        amount: formatCompact(l.amount),
        exact: formatNumber(l.amount),
        symbol: l.symbol,
        usdHint: hintUsd(l) != null ? formatCompactUsd(hintUsd(l)!) : undefined,
        usdProv: hintUsd(l) != null ? usdHintProv(l) : undefined,
        usdExact: hintUsd(l) != null ? formatUsdValue(hintUsd(l)!) : undefined,
        swatchClass: FEE_SOLID,
        prov: l.prov,
        indent: true,
      });
    });
  // Result row only where the sum is meaningful: USD, or single-token principal +
  // accrued. Never sum across different reserves. Claimable is a real held
  // balance, so it joins the total; costs never do (already inside current/interest).
  const claimableTotal = claimableLines.reduce((s, l) => s + sc(l), 0);
  if (valued) {
    const total = heldSplit(side, valued).total + claimableTotal;
    rows.push({
      sign: "",
      label: resultLabel,
      amount: formatCompactUsd(total),
      exact: formatUsdValue(total),
      isResult: true,
      prov: {
        kind: "chain-derived",
        summary: withInterest
          ? `${resultLabel} in USD — the value of what the position owes now. Each token amount owed${interestLine ? ", including the interest built up," : ""} is multiplied by the price the protocol uses for that token, and the results are added.`
          : `${resultLabel} in USD — the value of what the position holds now. Each token amount held, including any surplus still to claim, is multiplied by the price the protocol uses for that token, and the results are added.`,
        formula: "Σ amount × price",
      },
    });
  } else if (interestLine) {
    const tot = heldSplit(side, false).total + claimableTotal;
    rows.push({
      sign: "",
      label: resultLabel,
      amount: `${formatCompact(tot)} ${interestLine.symbol}`,
      exact: `${formatNumber(tot)} ${interestLine.symbol}`,
      // Token-denominated result (single symbol by construction) — carries the
      // chip; only USD result rows go chip-less (denomination rule).
      icon: chip(interestLine.symbol, interestLine.address),
      isResult: true,
      prov: {
        kind: "chain-derived",
        summary: `${resultLabel} (${interestLine.symbol}) — the principal and the ${(opts.interestLabel ?? "Accrued interest").toLowerCase()} above, added together in ${interestLine.symbol}.`,
        formula: "principal + accrued",
      },
    });
  } else if (sideSymbol && (gainLines.length > 0 || lossLines.length > 0)) {
    const tot = heldSplit(side, false).total + claimableTotal;
    rows.push({
      sign: "",
      label: resultLabel,
      amount: `${formatCompact(tot)} ${sideSymbol}`,
      exact: `${formatNumber(tot)} ${sideSymbol}`,
      icon: chip(sideSymbol, sideAddress),
      isResult: true,
      prov: {
        kind: "chain-derived",
        summary: `${resultLabel} (${sideSymbol}) — the balance the position's events record, plus what it has gained and less what it has lost since its last event, in ${sideSymbol}.`,
        formula: "recorded + gains − losses",
      },
    });
  }

  return {
    segments,
    breakdownRows: rows,
    sideBar,
    placeholder: segments.length === 0 ? <EmptyTower label={`No ${resultLabel.toLowerCase()}`} /> : undefined,
  };
}

/** A line's figure alone, wrapped in its receipt echo — the merged breakdown's
 *  per-asset rows, which draw their own icon and symbol beside it. */
function tipFigure(l: TowerLine, valued: boolean, suffix = "") {
  // `echo`: the tooltip mounts only while its segment is hovered, and the same
  // figure already holds a permanent receipt via its breakdown row — a transient
  // primary here would make the receipts list churn on hover.
  return (
    <Prov info={l.prov} echo>
      <span className="tabular-nums">
        {lineText(l, valued)}
        {suffix}
      </span>
    </Prov>
  );
}

/** A per-asset segment's tooltip: the token's mark, then the figure. A valued
 *  tower prints the figure in USD with no symbol, so without the mark a hover
 *  on WETH's withdrawn segment read "$10.5M" and named nothing; the mark is
 *  what the hover has to say which asset it is. The side bar's lifetime total
 *  is a sum and does not come through here. */
function tip(l: TowerLine, valued: boolean, suffix = "") {
  const figure = tipFigure(l, valued, suffix);
  if (!l.symbol) return figure;
  return (
    <span className="inline-flex items-center gap-1.5">
      <TokenChipIcon symbol={l.symbol} address={l.address} size={12} filterable={false} />
      {figure}
    </span>
  );
}

/** The dual tower itself — used by both valued (Maker) and token (Morpho) modes. */
function ChainTruthTowerChart({ data, hideHistorical }: { data: ChainTruthTowerData; hideHistorical: boolean }) {
  const valued = data.valued;
  const collParts = sideParts(data.collateral);
  const debtParts = sideParts(data.debt);
  const c = collParts.map((s) => sideScalars(s, valued));
  const d = debtParts.map((s) => sideScalars(s, valued));
  // valued: one shared scale (comparable heights). token: each bar to its own
  // base = 100, so neither tower vanishes against the other's unit.
  const towerMax = valued ? Math.max(...c.map((x) => x.base), ...d.map((x) => x.base), 1) * 1.08 : 100;
  const toTV = (base: number) => (valued ? (x: number) => x : (x: number) => (base > 0 ? (x / base) * 100 : 0));

  type SideOpts = Omit<Parameters<typeof buildSide>[1], "toTV" | "towerMax" | "hideHistorical" | "height">;
  // One bar per part; a side of several parts reads as one table beneath them.
  const build = (parts: TowerSideData[], scalars: { base: number }[], opts: SideOpts): TowerSide => {
    const [first, ...rest] = parts.map((p, i) =>
      buildSide(p, { ...opts, toTV: toTV(scalars[i].base), towerMax, hideHistorical, height: TOWER_H }),
    );
    if (rest.length === 0) return first;
    return {
      segments: first.segments,
      sideBar: first.sideBar,
      breakdownRows: [first, ...rest].flatMap((b) => b.breakdownRows),
      additionalBars: rest.map((b) => ({ segments: b.segments, sideBar: b.sideBar })),
      placeholder: [first, ...rest].every((b) => b.placeholder) ? first.placeholder : undefined,
    };
  };

  const left = build(collParts, c, {
    solid: COLL_SOLID,
    gainSolid: COLL_GAIN,
    flowColor: COLL_FADED,
    exitPattern: WITHDRAWN_PATTERN,
    exitLabel: "Withdrawn",
    inflowLabel: data.collateralInflowLabel ?? "Deposited",
    withInterest: false,
    valued,
    resultLabel: data.collateralTitle ?? "Collateral",
  });
  const right = build(debtParts, d, {
    solid: DEBT_SOLID,
    gainSolid: FEE_SOLID,
    flowColor: DEBT_FADED,
    exitPattern: REPAID_PATTERN,
    exitLabel: "Repaid",
    inflowLabel: data.debtInflowLabel ?? "Borrowed",
    withInterest: true,
    interestLabel: data.interestLabel,
    valued,
    resultLabel: data.debtTitle ?? "Current debt",
  });
  return <DualTowerChart left={left} right={right} height={TOWER_H} maxValue={towerMax} className="mb-1" />;
}

// ── Gated path (Spark): no faithful interest, multi-token → no bars ──────────
//
// When there's no price AND no interest split, comparative bars across different
// reserves would imply a magnitude relationship that doesn't exist (you can't
// compare WETH to USDC by height without a price). So the economics degrade
// to a labelled principal list plus an explicit note that the interest
// decomposition — the actual economics — isn't read at this tier yet.

function ReserveList({ lines }: { lines: TowerLine[] }) {
  if (lines.length === 0) return <span className="text-[11px] text-rb-400">None</span>;
  return (
    <div className="space-y-1.5">
      {lines.map((l) => (
        <div key={l.key} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-rb-500">
            <TokenChipIcon symbol={l.symbol} address={l.address} size={14} filterable={false} />
            {l.symbol}
          </span>
          <Prov info={l.prov}>
            <span className="text-sm tabular-nums text-foreground">{formatCompact(l.amount)}</span>
          </Prov>
        </div>
      ))}
    </div>
  );
}

function GatedEconomics({ data }: { data: ChainTruthTowerData }) {
  // A collateral-side interest split in list mode: the current lines already
  // INCLUDE the accrual (there is no stack to re-add it), so it renders as an
  // inclusion annotation — the position-card caption's grammar — never as a
  // summable row. The debt side needs no twin: debt-side interest switches the
  // tower into bar mode (showBars), so it cannot reach this list.
  const collInterest = data.collateral.interest;
  // A protocol with no debt axis (debtAxisAbsent) renders the claim side alone
  // — an empty "Debt · principal — None" column would assert a borrowable axis
  // the protocol never offers for this position kind.
  const showDebtColumn = !(data.debtAxisAbsent && data.debt.current.length === 0);
  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 gap-6 ${showDebtColumn ? "sm:grid-cols-2" : ""}`}>
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-rb-500">
            {data.collateralListLabel ?? data.collateralTitle ?? "Collateral"}
          </span>
          <ReserveList lines={sideParts(data.collateral).flatMap((s) => s.current)} />
          {collInterest != null && collInterest.amount > 0 && (
            <div className="text-[11px] text-rb-500">
              incl.{" "}
              <Prov info={collInterest.prov}>
                <span className="tabular-nums">
                  {formatCompact(collInterest.amount)} {collInterest.symbol}
                </span>
              </Prov>{" "}
              interest earned
            </div>
          )}
        </div>
        {showDebtColumn && (
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-rb-500">
              {data.debtListLabel ?? data.debtTitle ?? "Debt · principal"}
            </span>
            <ReserveList lines={sideParts(data.debt).flatMap((s) => s.current)} />
          </div>
        )}
      </div>
      {data.interestNote && (
        <p className="rounded-md bg-sunken px-3 py-2 text-[11px] leading-snug text-rb-400">{data.interestNote}</p>
      )}
    </div>
  );
}

// ── Shared shell ─────────────────────────────────────────────────────────────

function EmptyTower({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-20 items-center justify-center rounded-md border border-dashed border-rb-300/50 px-4 text-[11px] text-rb-400 dark:border-rb-700/50">
      {label}
    </div>
  );
}

/** Whether any side carries a chain-state lifetime history worth a toggle. */
function hasLifetime(data: ChainTruthTowerData): boolean {
  const any = (s: TowerSideData) => s.exited.length > 0 || s.liquidated.length > 0 || s.lifetimeInflow > 0;
  return sideParts(data.collateral).some(any) || sideParts(data.debt).some(any);
}

/** Whether one side's lines all speak ONE token — the condition under which
 *  token-mode bars can't mislead. Stacking mixed tokens by amount would invent
 *  a magnitude relationship no chain read supports (the Spark gated-list case);
 *  a single-symbol side stacks faithfully in its own unit. A side drawn as
 *  `bars` qualifies when every bar does. */
function sideMonoSymbol(s: TowerSideData): boolean {
  if (s.bars) return s.bars.every(sideMonoSymbol);
  const syms = new Set(
    [
      ...s.current,
      ...(s.received ?? []),
      ...s.exited,
      ...s.liquidated,
      ...(s.eventlessGains ?? []),
      ...(s.eventlessLosses ?? []),
      ...(s.interest ? [s.interest] : []),
    ]
      .filter((l) => l.amount > 0)
      .map((l) => l.symbol),
  );
  return syms.size <= 1;
}

export interface ChainTruthTowerProps {
  data: ChainTruthTowerData;
  /** Section eyebrow — defaults to "Lifetime flows". */
  title?: string;
  /** The Explanation pane under the tower — the V2/V4 grammar where the chart
   *  narrates its own figures (a status lead + bullets built from the same
   *  data the bars draw, see `<proto>EconomicsExplanation` beside each
   *  `compute*Economics`). Omit and the foot renders no Explanation. */
  explanation?: ReactNode;
  /** The tower's "?" FAQ — rendered at the foot of the Explanation pane. */
  learnMore?: LearnMoreContent | null;
  /** Inline content riding the heading-button row (the V2 trove tower's
   *  right-aligned redemption net-outcome strip). Same slot the position
   *  card's context line uses. */
  rowExtra?: ReactNode;
  /** PUT THIS TOWER AWAY, AND REMEMBER IT PER PROTOCOL (ui-jobs 61). Given a
   *  protocol's roster id, the heading becomes the button that collapses the
   *  panel to its own header row, a chevron rides the top right, and the state
   *  is stored under that id — so every position page in the protocol opens
   *  the way the reader left the last one (lib/shared/flows-collapse-store.ts).
   *
   *  OPT-IN, and null is the default: the other ~28 surfaces that draw this
   *  tower keep the plain eyebrow and no chevron, and a surface that belongs to
   *  no protocol — the home page's live example frame, which is inert — passes
   *  null explicitly rather than borrowing an id that is not its own. */
  collapseKey?: string | null;
}

export function ChainTruthTower({
  data,
  title = "Lifetime flows",
  explanation,
  learnMore,
  rowExtra,
  collapseKey = null,
}: ChainTruthTowerProps) {
  // Lifetime-first, matching the reference towers: the all-time flows render by
  // default, and the Display menu's "Hide inactive / repaid" collapses to the
  // current-state principal/interest split.
  const [hideHistorical, setHideHistorical] = useState(false);
  // null = follow the auto-default (group whenever anything can merge); a
  // "Group assets" toggle pins the reader's choice (the Aave V4 default).
  const [groupOverride, setGroupOverride] = useState<boolean | null>(null);
  // Collapsed, per protocol (ui-jobs 61). `settled` is false until the effect
  // below has read the store, and while it is false React writes NO collapsed
  // attribute: the server cannot know the answer, so the pre-paint script owns
  // the attribute for those first frames and React takes it over afterwards.
  // Rendering "0" from the server and letting the script overwrite it would put
  // the two in a fight that hydration could win.
  const [collapsed, setCollapsed] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!collapseKey) return;
    setCollapsed(isFlowsCollapsed(collapseKey));
    setSettled(true);
  }, [collapseKey]);
  const bodyId = useId();
  const registry = useReceiptRegistry();
  const holds = (s: TowerSideData) =>
    s.current.some((l) => l.amount > 0) || (s.eventlessGains ?? []).some((l) => l.amount > 0);
  const hasDebt = sideParts(data.debt).some(holds) || (data.debt.interest?.amount ?? 0) > 0;
  const hasColl = sideParts(data.collateral).some(holds);

  // Bars only render where they can't mislead: USD-stacked (valued), a
  // same-token principal/interest split, or lifetime flows on sides that each
  // speak ONE token (token-mode stories — every side stacks in its own unit).
  // Otherwise the gated list is shown.
  const showBars =
    data.valued ||
    (data.debt.interest?.amount ?? 0) > 0 ||
    (hasLifetime(data) && sideMonoSymbol(data.collateral) && sideMonoSymbol(data.debt));
  const lifetimeAvailable = showBars && hasLifetime(data);
  // A terminal life (nothing current on either side) still renders when its
  // lifetime story is drawable — once a position closes, the flows ARE the
  // story. Without drawable flows there is nothing to show; feeders that never
  // populate flows are unaffected.
  if (!hasDebt && !hasColl && !lifetimeAvailable) return null;
  const canGroup = showBars && (sideCanGroup(data.collateral, data.valued) || sideCanGroup(data.debt, data.valued));
  const grouped = canGroup && (groupOverride ?? true);
  const chartData: ChainTruthTowerData = grouped
    ? { ...data, collateral: groupSide(data.collateral, data.valued), debt: groupSide(data.debt, data.valued) }
    : data;

  return (
    // The tower is its own receipts scope: every traced line — breakdown rows,
    // the gated reserve lists — registers here, for the page-level inspector.
    <ProvReceiptsScope registry={registry}>
      <section
        // Padding matches the position card's px-5 py-4 (the V2 trove
        // compaction), so the stacked panels read as one family.
        // data-skel-section feeds the skeleton memory layer (skeleton-size-recorder).
        data-skel-section="detail-economics"
        {...(collapseKey ? { [COLLAPSE_KEY_ATTR]: collapseKey } : {})}
        {...(collapseKey && settled ? { [COLLAPSED_ATTR]: collapsed ? "1" : "0" } : {})}
        suppressHydrationWarning
        className="rounded-2xl bg-raised px-5 py-4"
      >
        {/* Pre-paint: the stored state applied before the browser paints, so a
            tower the reader put away does not flash open on the way to
            hydration. Reads its key off this section — see
            lib/shared/flows-collapse-store.ts. */}
        {collapseKey && <script dangerouslySetInnerHTML={{ __html: collapseScript() }} suppressHydrationWarning />}
        {/* Toolbar row: title left, legend + Lifetime-flows control right. The
          chart below pulls up underneath it (-mt-7 matching the row's min-h),
          so the towers' empty top band shares this line — title left, controls
          right, towers centered. The row stays hit-testable above the chart
          (z-10) but only on its actual children, so tower-top tooltips still
          hover through the middle.

          COLLAPSIBLE (ui-jobs 61): the title becomes the button that puts the
          panel away and the chevron takes the top right, which is where the
          Display control stood — so the Display control moves down onto the
          first row of the body, still right-aligned and still inside the
          towers' empty top band once the chart pulls up under it. */}
        <div className="pointer-events-none relative z-10 flex min-h-[28px] items-center justify-between gap-2">
          {collapseKey ? (
            <button
              type="button"
              onClick={() => {
                const next = !collapsed;
                setCollapsed(next);
                setSettled(true);
                setFlowsCollapsed(collapseKey, next);
              }}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              className={`${CTRL_GHOST} ${CTRL_OFF} pointer-events-auto -ml-2 h-7 min-w-0 gap-1.5 rounded-md px-2`}
            >
              <ChartColumnBig size={14} aria-hidden />
              <span className={`${OVERLAY_HEADING} truncate`}>{title}</span>
            </button>
          ) : (
            <span className={`${OVERLAY_HEADING} pointer-events-auto min-w-0 text-rb-500`}>{title}</span>
          )}
          {/* No corner color key — the flank-table swatches are the one legend
              (design-grammar rule; neither reference tower carries one). */}
          <div className="pointer-events-auto flex items-center gap-3">
            {collapseKey ? (
              <button
                type="button"
                onClick={() => {
                  const next = !collapsed;
                  setCollapsed(next);
                  setSettled(true);
                  setFlowsCollapsed(collapseKey, next);
                }}
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
                className={`${CTRL_GHOST} ${CTRL_OFF} h-7 w-7 rounded-md`}
              >
                <ChevronDown size={16} className={collapsed ? "" : "rotate-180"} aria-hidden />
              </button>
            ) : (
              <TowerDisplayControls
                lifetimeAvailable={lifetimeAvailable}
                canGroup={canGroup}
                grouped={grouped}
                hideHistorical={hideHistorical}
                showBars={showBars}
                flowsNote={data.flowsNote}
                onGroup={() => setGroupOverride((v) => !(v ?? true))}
                onHideHistorical={() => setHideHistorical((v) => !v)}
              />
            )}
          </div>
        </div>
        <div id={bodyId} {...(collapseKey ? { "data-flows-body": "" } : {})}>
          {collapseKey && (
            <div className="pointer-events-none relative z-10 flex min-h-[28px] items-center justify-end gap-3">
              <div className="pointer-events-auto flex items-center gap-3">
                <TowerDisplayControls
                  lifetimeAvailable={lifetimeAvailable}
                  canGroup={canGroup}
                  grouped={grouped}
                  hideHistorical={hideHistorical}
                  showBars={showBars}
                  flowsNote={data.flowsNote}
                  onGroup={() => setGroupOverride((v) => !(v ?? true))}
                  onHideHistorical={() => setHideHistorical((v) => !v)}
                />
              </div>
            </div>
          )}
          {/* Bars pull up under the toolbar row; the gated reserve LIST keeps its
            own row (text would collide with the title). */}
          <div className={showBars ? "-mt-7" : "mt-3"}>
            {showBars ? (
              <ChainTruthTowerChart data={chartData} hideHistorical={hideHistorical} />
            ) : (
              <GatedEconomics data={data} />
            )}
          </div>
          <ProvenanceInfoTabs className="mt-3" explanation={explanation} learnMore={learnMore} rowExtra={rowExtra} />
        </div>
      </section>
    </ProvReceiptsScope>
  );
}

/** The tower's Display menu — "Group assets" / "Hide inactive / repaid" — and
 *  the sentence that stands in its place where this position cannot draw
 *  lifetime flows. Lifted out of the toolbar row because the collapsible
 *  variant renders it a row lower (ui-jobs 61), and one copy is what keeps the
 *  two rows saying the same thing. */
function TowerDisplayControls({
  lifetimeAvailable,
  canGroup,
  grouped,
  hideHistorical,
  showBars,
  flowsNote,
  onGroup,
  onHideHistorical,
}: {
  lifetimeAvailable: boolean;
  canGroup: boolean;
  grouped: boolean;
  hideHistorical: boolean;
  showBars: boolean;
  flowsNote?: string;
  onGroup: () => void;
  onHideHistorical: () => void;
}) {
  return (
    <>
      {(lifetimeAvailable || canGroup) && (
        <FilterDropdown
          label="Display"
          options={[
            ...(canGroup ? [{ key: "group-assets", label: "Group assets" } satisfies FilterOption] : []),
            ...(lifetimeAvailable
              ? [{ key: "hide-historical", label: "Hide inactive / repaid" } satisfies FilterOption]
              : []),
          ]}
          selected={new Set([...(grouped ? ["group-assets"] : []), ...(hideHistorical ? ["hide-historical"] : [])])}
          onSelect={() => {}}
          multi
          minimal
          align="right"
          variant="ghost"
          triggerIcon={<DisplaySettingsIcon size={14} />}
          onToggle={(key) => {
            if (key === "group-assets") onGroup();
            if (key === "hide-historical") onHideHistorical();
          }}
        />
      )}
      {showBars && !lifetimeAvailable && (
        // Where the reference towers would show lifetime flows, this
        // position can't — say so in the toggle's place rather than
        // leaving the missing control unexplained.
        <span
          className="text-[10px] text-rb-400"
          title={
            flowsNote ??
            "Lifetime flows aren't shown: the events on record for this position don't add up to its current balance, so an all-time total would be incomplete."
          }
        >
          No lifetime flows
        </span>
      )}
    </>
  );
}
