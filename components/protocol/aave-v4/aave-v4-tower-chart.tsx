"use client";

// Multi-asset Aave V4 dual-tower chart — a V4-only tower chart (no V3
// livePositions branch, no protocolLabel switch).
//
// Renders one collateral tower (blue) + one debt tower (green) per spoke.
// Withdrawn / repaid amounts render as hatched segments on top of the active
// segments so the chart tells the lifetime story; the Display dropdown collapses
// back to current-state-only.

import { useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  type TowerSegment,
  type BreakdownRow,
  DualTowerChart,
  fmt,
  LIQUIDATION_PATTERN,
  REPAID_PATTERN,
  WITHDRAWN_PATTERN,
} from "@/components/shared/economics-chart-primitives";
import { FilterDropdown, DisplaySettingsIcon, type FilterOption } from "@/components/shared/filter-dropdown";
import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import type { ReserveStats } from "@/lib/aave-v4/spoke-cards";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { fmtUsd } from "@/lib/aave-v4/format";
import { accumProv, chainTruthProv, livePriceInput } from "@/lib/aave-v4/position-provenance";
import { oraclePriceSource, type OraclePriceMap } from "@/lib/aave-v4/use-oracle-prices";
import {
  NO_PRICE_HINT,
  noPriceProv,
  partialLabel,
  partialSumProv,
  pricesHaveLoaded,
  UNPRICED_DUST_TOKENS,
} from "@/lib/aave-v4/unpriced";
import type { AaveV4PriceSource } from "@/lib/shared/types/protocols/aave-v4";
import type { Provenance } from "@/components/shared/provenance";

// Lifetime-flow provenance is added up over this position's events on the
// spoke. The current-balance rows come from the spoke's read, so they stay
// constants.
//
// The two price legs are different sources and say so. An OUTFLOW is valued at
// the price stored for its block, which since server migration 314 is what
// Aave's oracle answered there (`iaave-oracle`); where no row sits at that
// block the reserve's nearest earlier row stands in, and a reserve with no
// stored price contributes nothing. A HOLDING is valued at the live map the
// page assembled — Aave's oracle at head where the oracle registry covers the
// asset, an off-chain market price where it does not. A per-asset holding
// receipt names the source that answered for THAT asset (livePriceInput); the
// cross-asset aggregates below span both, so they keep the `offchain` kind of
// their weakest case.
//
// RULE: Rails never invents a price (rails-ops TO-DO-ui-jobs §40). A holding
// whose asset no source covers gets NO USD leg: no tower segment, no place in
// a USD total, a breakdown row in the asset's units reading "no price source",
// and a "(partial)" total that names it.
const HOLDING_PRICE_NOTE =
  "the live price: Aave's oracle where it covers the asset, an off-chain market price otherwise";
const OUTFLOW_PRICE_NOTE =
  "each outflow at the price stored for its block — what Aave's oracle answered there, so the figure stays at the value the tokens left at";

const depositedProv = () =>
  accumProv("Total collateral deposited over the position's life", {
    formula: "collateral × holding price + Σ(outflow × outflow price)",
    inputs: [
      {
        label: "collateral",
        kind: "chain",
        note: "the balance the spoke reports, plus each withdrawn or liquidated outflow",
      },
      { label: "holding price", kind: "offchain", note: HOLDING_PRICE_NOTE },
      { label: "outflow price", kind: "chain", pclass: "oracle", note: OUTFLOW_PRICE_NOTE },
    ],
  });
const borrowedProv = () =>
  accumProv("Total borrowed over the position's life", {
    formula: "debt × holding price + Σ(outflow × outflow price)",
    inputs: [
      {
        label: "debt",
        kind: "chain",
        note: "the balance the spoke reports, plus each repaid or liquidated outflow",
      },
      { label: "holding price", kind: "offchain", note: HOLDING_PRICE_NOTE },
      { label: "outflow price", kind: "chain", pclass: "oracle", note: OUTFLOW_PRICE_NOTE },
    ],
  });
// The current rows: the spoke's read where the chain overlay answered, and the
// position's replayed net where it did not (see `netSupply` / `netDebt`
// below) — the receipt says both, so a row is never claimed to be a live read
// it might not be.
const CURRENT_COLL_PROV: Provenance = {
  ...chainTruthProv("Current collateral", "net supply"),
  summary:
    "Current collateral — what the spoke contract answers for this position at the latest block, carrying the interest accrued up to it. Where that read is unavailable the row falls back to the position's supplies less what has been withdrawn or liquidated.",
};
const CURRENT_DEBT_PROV: Provenance = {
  ...chainTruthProv("Current debt", "net debt"),
  summary:
    "Current debt — what the spoke contract answers for this position at the latest block, carrying the interest accrued up to it. Where that read is unavailable the row falls back to the position's draws less what has been repaid or liquidated.",
};

// Receipts for the per-row USD hints. The two row families price differently
// (see the totals derivation below): outflows are valued at price-at-the-time
// so a closed position's history stays fixed; current holdings use the live
// price, since "what's it worth now" is a current-price question. The token
// amount is traced by the row's receipt.
const flowUsdHintProv = (symbol: string): Provenance => ({
  kind: "derived",
  summary: `${symbol} outflow value in USD — each event's amount at the price stored for its block, added up. The figure stays at what the tokens were worth as they left.`,
  formula: "Σ(flow amount × price at the event's block)",
  inputs: [{ label: "price", kind: "chain", pclass: "oracle", note: OUTFLOW_PRICE_NOTE }],
});
const currentUsdHintProv = (symbol: string, source: AaveV4PriceSource | null): Provenance => ({
  kind: "derived",
  summary: `${symbol} value in USD — the row's token balance at the live price, so it is what the balance is worth now.`,
  formula: "amount × live price",
  inputs: [livePriceInput(source)],
});
const flowProv = (label: string): Provenance =>
  accumProv(`${label} over the position's life`, {
    formula: "Σ(flow amount × price)",
    inputs: [
      {
        label: "flow amount",
        kind: "chain",
        pclass: "indexed",
        note: "the amount each of the position's events moved",
      },
      { label: "price", kind: "chain", pclass: "oracle", note: OUTFLOW_PRICE_NOTE },
    ],
  });

const CHART_HEIGHT = 180;

// Lifetime USD totals (the breakdown-legend figures) live in
// lib/aave-v4/lifetime-totals.ts so the page footnote can quote them without
// pulling this chart module — the chart loads as a lazy chunk.

const COLLATERAL_FADED = "rgba(59,130,246,0.2)";
const DEBT_GREEN_FADED = "rgba(74, 222, 128,0.2)";

// Below this USD value, lifetime flows (withdrawn / repaid / liquidated) don't
// earn a breakdown row or a hatched segment. Kept low ($0.01) so test-sized
// positions where a few cents moved still tell the full story — anything
// truly zero is already filtered upstream.
const LIFETIME_DUST_USD = 0.01;

interface AssetRow {
  symbol: string;
  // Lifetime totals — drive the historical-view side bars and breakdown rows.
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  liquidatedCollateral: number;
  // Lifetime OUTFLOW value in USD at price-at-the-time (each event valued at its
  // block price). Drives every historical USD figure so a settled position's
  // flows stay fixed instead of drifting with today's market. Current holdings
  // (netSupplyUsd / netDebtUsd) stay on live prices — see below.
  withdrawnUsd: number;
  repaidUsd: number;
  liquidatedDebtUsd: number;
  liquidatedCollateralUsd: number;
  // Current state — drives the solid tower segments and the "In Protocol" /
  // "Current Debt" totals. Sourced from chain-state when present, otherwise
  // derived from lifetime fields.
  netSupply: number;
  netDebt: number;
  /** null when no source prices this asset — the row then has no USD leg. */
  price: number | null;
  /** Which feed answered for the asset, for the row's USD receipt. */
  priceSource: AaveV4PriceSource | null;
  netSupplyUsd: number | null;
  netDebtUsd: number | null;
  isClosed: boolean;
  hasHistoricActivity: boolean;
}

/** An asset row a price was found for — the only kind that can draw a tower
 *  segment or join a USD total. */
type PricedRow = AssetRow & { price: number; netSupplyUsd: number; netDebtUsd: number };

const isPriced = (r: AssetRow): r is PricedRow => r.price != null;

function AaveChartDisplayMenu({
  hideHistorical,
  onToggleHistorical,
  hasHistory,
  hideUsd,
  onToggleHideUsd,
  hideSurplus,
  onToggleHideSurplus,
  hasSurplus,
  grouped,
  onToggleGroup,
  canGroup,
}: {
  hideHistorical: boolean;
  onToggleHistorical: () => void;
  hasHistory: boolean;
  hideUsd: boolean;
  onToggleHideUsd: () => void;
  hideSurplus?: boolean;
  onToggleHideSurplus?: () => void;
  hasSurplus?: boolean;
  grouped?: boolean;
  onToggleGroup?: () => void;
  canGroup?: boolean;
}) {
  const options: FilterOption[] = [
    ...(canGroup ? [{ key: "group-assets", label: "Group assets" }] : []),
    { key: "hide-usd-values", label: "Hide USD values" },
    ...(hasHistory ? [{ key: "hide-historical", label: "Hide inactive / repaid" }] : []),
    ...(hasSurplus ? [{ key: "hide-surplus", label: "Hide surplus collateral" }] : []),
  ];
  const visible = new Set<string>();
  if (grouped) visible.add("group-assets");
  if (hideUsd) visible.add("hide-usd-values");
  if (hideHistorical) visible.add("hide-historical");
  if (hideSurplus) visible.add("hide-surplus");
  return (
    <FilterDropdown
      label="Display"
      options={options}
      selected={visible}
      onSelect={() => {}}
      multi
      minimal
      align="right"
      variant="ghost"
      triggerIcon={<DisplaySettingsIcon size={14} />}
      onToggle={(key) => {
        if (key === "group-assets") onToggleGroup?.();
        if (key === "hide-historical") onToggleHistorical();
        if (key === "hide-usd-values") onToggleHideUsd();
        if (key === "hide-surplus") onToggleHideSurplus?.();
      }}
    />
  );
}

export interface AaveV4TowerChartProps {
  reserves: ReserveStats[];
  prices?: Record<string, PriceEntry | number>;
  /** The oracle map behind `prices`, read only for its per-asset `source` so a
   *  holding's USD receipt can name the feed that answered for that asset. */
  oraclePrices?: OraclePriceMap | null;
  /** Symbols whose individual liquidation can't trigger a basket liq at base
   *  state — rendered with a softer blue so the prominent blue answers
   *  "what's bearing the risk?". */
  surplusSymbols?: Set<string>;
  hideSurplus?: boolean;
  onToggleHideSurplus?: () => void;
  /** Section heading rendered on the chart's toolbar row, left of the Display
   *  control — lets the host panel title the section without spending a row of
   *  its own row (the V2 trove treatment; the spoke page passes "Lifetime flows"). */
  title?: React.ReactNode;
}

export function AaveV4TowerChart({
  reserves,
  prices,
  oraclePrices,
  surplusSymbols,
  hideSurplus,
  onToggleHideSurplus,
  title,
}: AaveV4TowerChartProps) {
  const [hideHistorical, setHideHistorical] = useState(false);
  const [hideUsd, setHideUsd] = useState(true);
  // null = follow the auto-default (group when there's anything to merge); once
  // the reader toggles "Group assets" this pins their choice.
  const [groupOverride, setGroupOverride] = useState<boolean | null>(null);

  const allRows: AssetRow[] = reserves
    .filter(
      (r) =>
        r.supplied > 0 ||
        r.borrowed > 0 ||
        r.liquidatedDebt > 0 ||
        r.liquidatedCollateral > 0 ||
        (r.currentSupplied ?? 0) > 0 ||
        (r.currentBorrowed ?? 0) > 0,
    )
    .map((r) => {
      // Current state from the live chain read when available; otherwise reconcile
      // lifetime flows including liquidation seizures / debt clears.
      const netSupply = r.currentSupplied ?? Math.max(0, r.supplied - r.withdrawn - r.liquidatedCollateral);
      const netDebt = r.currentBorrowed ?? Math.max(0, r.borrowed - r.repaid - r.liquidatedDebt);
      // No source, no price — and no dollar figure anywhere downstream of it.
      const price = resolvePrice(r.symbol, prices);
      const hasHistoricActivity =
        r.supplied > 0 ||
        r.borrowed > 0 ||
        r.withdrawn > 0 ||
        r.repaid > 0 ||
        r.liquidatedDebt > 0 ||
        r.liquidatedCollateral > 0;
      return {
        symbol: r.symbol,
        supplied: r.supplied,
        withdrawn: r.withdrawn,
        borrowed: r.borrowed,
        repaid: r.repaid,
        liquidatedDebt: r.liquidatedDebt,
        liquidatedCollateral: r.liquidatedCollateral,
        withdrawnUsd: r.withdrawnUsd,
        repaidUsd: r.repaidUsd,
        liquidatedDebtUsd: r.liquidatedDebtUsd,
        liquidatedCollateralUsd: r.liquidatedCollateralUsd,
        netSupply,
        netDebt,
        price,
        priceSource: oraclePriceSource(r.symbol, oraclePrices),
        netSupplyUsd: price == null ? null : netSupply * price,
        netDebtUsd: price == null ? null : netDebt * price,
        // An unpriced row can't be measured against a USD dust floor, so its
        // balances are judged in tokens.
        isClosed:
          price == null
            ? netSupply <= UNPRICED_DUST_TOKENS && netDebt <= UNPRICED_DUST_TOKENS
            : netSupply * price < LIFETIME_DUST_USD && netDebt * price < LIFETIME_DUST_USD,
        hasHistoricActivity,
      };
    });

  if (allRows.length === 0) return null;

  const activeRows = allRows.filter((r) => !r.isClosed);
  const pricedRows = activeRows.filter(isPriced);

  const isSurplus = (sym: string) => surplusSymbols?.has(sym) ?? false;

  const supplyAssetsAll = pricedRows
    .filter((r) => r.netSupplyUsd > 0.01)
    .sort((a, b) => b.netSupplyUsd - a.netSupplyUsd);
  const debtAssets = pricedRows.filter((r) => r.netDebtUsd > 0.01).sort((a, b) => b.netDebtUsd - a.netDebtUsd);

  const supplyAssets = hideSurplus ? supplyAssetsAll.filter((r) => !isSurplus(r.symbol)) : supplyAssetsAll;

  // Before the price map has answered, every row resolves to null and nothing
  // is known to be unpriced — the towers wait (the ghost placeholder below)
  // rather than announce a gap that the next render may fill.
  const priced = pricesHaveLoaded(prices);

  // The holdings no price covers. They draw no segment and enter no total;
  // they get a breakdown row in the asset's units and their names go on every
  // total they are missing from.
  const unpricedRows = priced ? activeRows.filter((r) => r.price == null) : [];
  const unpricedSupplyAll = unpricedRows.filter((r) => r.netSupply > UNPRICED_DUST_TOKENS);
  const unpricedSupply = hideSurplus ? unpricedSupplyAll.filter((r) => !isSurplus(r.symbol)) : unpricedSupplyAll;
  const unpricedDebt = unpricedRows.filter((r) => r.netDebt > UNPRICED_DUST_TOKENS);
  const unpricedSupplySymbols = unpricedSupply.map((r) => r.symbol);
  const unpricedDebtSymbols = unpricedDebt.map((r) => r.symbol);

  const totalSupplyUsd = supplyAssets.reduce((s, r) => s + r.netSupplyUsd, 0);
  const totalDebtUsd = debtAssets.reduce((s, r) => s + r.netDebtUsd, 0);
  // Outflows are valued at price-at-the-time (accumulated per event upstream in
  // calculateAaveEconomics), not the current price — so a closed position's flow
  // history stays fixed. Current holdings (netSupplyUsd / netDebtUsd) keep live
  // prices, since "what's it worth now" is a current-price question.
  const totalWithdrawnUsd = allRows.reduce((s, r) => s + r.withdrawnUsd, 0);
  const totalRepaidUsd = allRows.reduce((s, r) => s + r.repaidUsd, 0);
  const totalLiquidatedCollUsd = allRows.reduce((s, r) => s + r.liquidatedCollateralUsd, 0);
  const totalLiquidatedDebtUsd = allRows.reduce((s, r) => s + r.liquidatedDebtUsd, 0);
  // Lifetime side-bar totals = current balance + everything that has left the
  // position (withdrawn / repaid / liquidated). Anchor to the chain-state
  // `netSupply` / `netDebt` rather than the event-derived gross `r.supplied` /
  // `r.borrowed`: gross cumulative double-counts capital re-deposited after a
  // loop, and counts capital that left through an un-indexed aggregator-wrapper
  // withdrawal (the same drift the chain-state path exists to correct). That
  // inflation made the side bar shoot far above the tower and broke the
  // breakdown math. Reconstructing from net + flows keeps the bar true to the
  // tower, so "Deposited − Withdrawn = In Protocol" reconciles and the bar
  // cannot exceed the tower's segment sum.
  // Deposited/Borrowed = current holding (live price) + outflows (price-at-the-
  // time). Deriving it this way keeps the reconciliation invariant intact
  // (Deposited − Withdrawn − Liquidated = In Protocol) while the departed capital
  // is valued at what it was worth when it left, not today.
  // The lifetime aggregate ignores the hide-surplus toggle, so its own missing
  // list is the surplus-included one.
  const totalDepositedUsd = allRows.reduce(
    (s, r) => s + (r.netSupplyUsd ?? 0) + r.withdrawnUsd + r.liquidatedCollateralUsd,
    0,
  );
  const totalBorrowedUsd = allRows.reduce((s, r) => s + (r.netDebtUsd ?? 0) + r.repaidUsd + r.liquidatedDebtUsd, 0);
  const depositedExcluded = unpricedSupplyAll.map((r) => r.symbol);
  const borrowedExcluded = unpricedDebtSymbols;

  // Per-asset flow arrays feed the hatched segments, the breakdown rows, and the
  // side-bar totals from a single `usd` — valued at price-at-the-time.
  const withdrawnAssets = allRows
    .map((r) => ({ symbol: r.symbol, amount: r.withdrawn, usd: r.withdrawnUsd }))
    .filter((r) => r.usd > LIFETIME_DUST_USD)
    .sort((a, b) => b.usd - a.usd);
  const repaidAssets = allRows
    .map((r) => ({ symbol: r.symbol, amount: r.repaid, usd: r.repaidUsd }))
    .filter((r) => r.usd > LIFETIME_DUST_USD)
    .sort((a, b) => b.usd - a.usd);
  const liquidatedCollAssets = allRows
    .map((r) => ({ symbol: r.symbol, amount: r.liquidatedCollateral, usd: r.liquidatedCollateralUsd }))
    .filter((r) => r.usd > LIFETIME_DUST_USD)
    .sort((a, b) => b.usd - a.usd);
  const liquidatedDebtAssets = allRows
    .map((r) => ({ symbol: r.symbol, amount: r.liquidatedDebt, usd: r.liquidatedDebtUsd }))
    .filter((r) => r.usd > LIFETIME_DUST_USD)
    .sort((a, b) => b.usd - a.usd);

  const hasLive =
    supplyAssets.length > 0 || debtAssets.length > 0 || unpricedSupply.length > 0 || unpricedDebt.length > 0;
  const hasHistory =
    totalWithdrawnUsd > LIFETIME_DUST_USD ||
    totalRepaidUsd > LIFETIME_DUST_USD ||
    totalLiquidatedCollUsd > LIFETIME_DUST_USD ||
    totalLiquidatedDebtUsd > LIFETIME_DUST_USD;
  const isLiveView = hideHistorical && (hasLive || !hasHistory);

  // Suppress the debt tower for pure supply-side wallets. In live view that
  // means no current debt; in historical view it means no debt-side activity
  // ever (raw token amounts, so an unresolved price for the borrow asset
  // doesn't collapse a liquidated position back to a "supply only" chart).
  const hasHistoricDebt = allRows.some((r) => r.borrowed > 0 || r.repaid > 0 || r.liquidatedDebt > 0);
  // Frozen to the historical shape regardless of the toggle: a wallet that ever
  // held debt keeps its debt tower (now muted) in live view rather than
  // collapsing to a single-tower layout.
  const supplyOnly = !hasHistoricDebt && debtAssets.length === 0 && unpricedDebt.length === 0;

  // Asset grouping: collapse any single category (active collateral, active
  // debt, withdrawn, repaid, liquidated) that holds ≥2 assets into one block,
  // so multi-asset spokes stop fragmenting into a noisy stack. The merge is
  // per-category — a category with one asset still renders per-asset (keeping
  // its icon + native amount), so single-asset positions and the "one repaid +
  // one still-collateral" shape look identical whether grouped or not. Active
  // collateral keeps its surplus / risk-bearing split (≤2 blocks) since that's
  // the one risk-relevant distinction. Auto-on whenever anything is mergeable;
  // the Display menu's "Group assets" flips back to the full per-asset view.
  const nonSurplusSupply = supplyAssets.filter((r) => !isSurplus(r.symbol));
  const surplusSupply = supplyAssets.filter((r) => isSurplus(r.symbol));
  // Frozen to the full category set so grouping (and therefore the active
  // segments' positions) is identical whether or not flows are muted.
  const categoryCounts = [
    nonSurplusSupply.length,
    surplusSupply.length,
    debtAssets.length,
    withdrawnAssets.length,
    liquidatedCollAssets.length,
    repaidAssets.length,
    liquidatedDebtAssets.length,
  ];
  const canGroup = categoryCounts.some((c) => c >= 2);
  const grouped = canGroup && (groupOverride ?? true);

  // Direction arrow: → for assets moving into the protocol (supply, repay,
  // debt-cleared); ← for assets moving out (withdraw, borrow, coll-liquidated).
  // Replaces explicit "supplied/withdrawn/borrowed/repaid" wording.
  const dirArrow = (dir: "in" | "out") =>
    dir === "in" ? (
      <ArrowRight className="w-3 h-3 text-rb-500 shrink-0" />
    ) : (
      <ArrowLeft className="w-3 h-3 text-rb-500 shrink-0" />
    );

  const tipBody = (symbol: string | undefined, usd: number, dir: "in" | "out") => (
    <div className="flex items-center gap-1.5">
      {symbol && <TokenChipIcon symbol={symbol} size={14} filterable={false} />}
      {symbol && <span>{aaveV4DisplaySymbol(symbol)}</span>}
      {dirArrow(dir)}
      <span className="ml-auto tabular-nums">{fmtUsd(usd).title}</span>
    </div>
  );

  // Tooltip for a merged block: the category total, then the per-asset
  // constituents that were merged in (capped, with an "+N more" overflow).
  const mergedTip = (items: { symbol: string; usd: number }[], total: number, dir: "in" | "out") => (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 font-medium">
        {dirArrow(dir)}
        <span className="ml-auto tabular-nums">{fmtUsd(total).title}</span>
      </div>
      {items.slice(0, 6).map((i) => (
        <div key={i.symbol} className="flex items-center gap-1.5 text-rb-500">
          <TokenChipIcon symbol={i.symbol} size={12} filterable={false} />
          <span>{aaveV4DisplaySymbol(i.symbol)}</span>
          <span className="ml-auto tabular-nums">{fmtUsd(i.usd).title}</span>
        </div>
      ))}
      {items.length > 6 && <div className="text-rb-500">+{items.length - 6} more</div>}
    </div>
  );

  // Active collateral / debt: one merged block when grouped & ≥2, else per-asset.
  // Priced rows only — a segment is a USD height, and an unpriced holding has
  // none to draw.
  const activeSegs = (
    assets: PricedRow[],
    usdOf: (r: PricedRow) => number,
    colorClass: string,
    keyPrefix: string,
    mergedLabel: string,
    dir: "in" | "out",
  ): TowerSegment[] => {
    if (grouped && assets.length >= 2) {
      const total = assets.reduce((s, r) => s + usdOf(r), 0);
      return [
        {
          key: `${keyPrefix}-grp`,
          label: mergedLabel,
          value: total,
          colorClass,
          tooltip: mergedTip(
            assets.map((r) => ({ symbol: r.symbol, usd: usdOf(r) })),
            total,
            dir,
          ),
        },
      ];
    }
    return assets.map((r) => ({
      key: `${keyPrefix}-${r.symbol}`,
      label: aaveV4DisplaySymbol(r.symbol),
      value: usdOf(r),
      colorClass,
      tooltip: tipBody(r.symbol, usdOf(r), dir),
    }));
  };

  // Lifetime-flow (withdrawn / repaid / liquidated) hatched segments: one merged
  // block when grouped & ≥2, else one hatched segment per asset (reversed so the
  // largest sits nearest the active segments, as before).
  const flowSegs = (
    items: { symbol: string; amount: number; usd: number }[],
    pattern: CSSProperties,
    keyPrefix: string,
    mergedLabel: string,
    dir: "in" | "out",
  ): TowerSegment[] => {
    if (grouped && items.length >= 2) {
      const total = items.reduce((s, i) => s + i.usd, 0);
      return [
        {
          key: `${keyPrefix}-grp`,
          label: mergedLabel,
          value: total,
          colorClass: "",
          patternStyle: pattern,
          tooltip: mergedTip(items, total, dir),
        },
      ];
    }
    return [...items].reverse().map((i) => ({
      key: `${keyPrefix}-${i.symbol}`,
      label: `${aaveV4DisplaySymbol(i.symbol)} ${mergedLabel.toLowerCase()}`,
      value: i.usd,
      colorClass: "",
      patternStyle: pattern,
      tooltip: tipBody(i.symbol, i.usd, dir),
    }));
  };

  // Lifetime-flow segments are always built (so the tower's segment count,
  // gaps and scale never change between views) and tagged `hidden` in live
  // view — the primitive paints them `visibility: hidden` in place, so the
  // active segments stay pinned where the historical view drew them
  // rather than rescaling to fill the freed height.
  const markHidden = (segs: TowerSegment[]): TowerSegment[] => segs.map((s) => ({ ...s, hidden: isLiveView }));

  const collSegments: TowerSegment[] = [
    ...activeSegs(nonSurplusSupply, (r) => r.netSupplyUsd, "bg-blue-500", "coll", "Collateral", "in"),
    ...activeSegs(surplusSupply, (r) => r.netSupplyUsd, "bg-blue-500/60", "coll-surplus", "Surplus collateral", "in"),
    ...markHidden(flowSegs(liquidatedCollAssets, LIQUIDATION_PATTERN, "coll-liquidated", "Liquidated", "out")),
    ...markHidden(flowSegs(withdrawnAssets, WITHDRAWN_PATTERN, "coll-withdrawn", "Withdrawn", "out")),
  ];

  const debtSegments: TowerSegment[] = [
    ...activeSegs(debtAssets, (r) => r.netDebtUsd, "bg-green-400", "debt", "Debt", "out"),
    ...markHidden(flowSegs(liquidatedDebtAssets, LIQUIDATION_PATTERN, "debt-liquidated", "Liquidated", "in")),
    ...markHidden(flowSegs(repaidAssets, REPAID_PATTERN, "debt-repaid", "Repaid", "in")),
  ];

  const collPeak = collSegments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  const debtPeak = debtSegments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  // Merge the historic-view side-bar totals into the scale so a lifetime bar can
  // never paint above the chart. With the reconciled totals above this is ~a
  // no-op (bar ≈ tower), but it also covers the hide-surplus case (collPeak
  // drops below the still-full deposited total) and the brief pre-price-
  // hydration render where per-asset prices haven't streamed in yet.
  // Side-bar max is merged in regardless of view so the tower scale is frozen
  // across the toggle; the bars themselves render `hidden` in live view (column
  // width still reserved → no horizontal shift of the tower).
  const sideBarMax = Math.max(totalDepositedUsd, totalBorrowedUsd);
  const towerMax = Math.max(collPeak, debtPeak, sideBarMax) * 1.08;

  const collSideBar =
    totalDepositedUsd > 0
      ? { heightPct: (totalDepositedUsd / towerMax) * CHART_HEIGHT, color: COLLATERAL_FADED, hidden: isLiveView }
      : undefined;
  const debtSideBar =
    totalBorrowedUsd > 0
      ? { heightPct: (totalBorrowedUsd / towerMax) * CHART_HEIGHT, color: DEBT_GREEN_FADED, hidden: isLiveView }
      : undefined;

  // Breakdown-row counterparts to the segment builders: merge a category into a
  // single USD row when grouped & ≥2 (no icon — the row is a sum across assets),
  // else per-asset rows with the native amount + icon as before.
  const flowRows = (
    items: { symbol: string; amount: number; usd: number }[],
    pattern: CSSProperties,
    mergedLabel: string,
  ): BreakdownRow[] => {
    const prov = flowProv(mergedLabel);
    if (grouped && items.length >= 2) {
      const total = items.reduce((s, i) => s + i.usd, 0);
      return [{ sign: "−", label: mergedLabel, amount: fmtUsd(total).display, swatchStyle: pattern, prov }];
    }
    return items.map((i) => ({
      sign: "−",
      label:
        mergedLabel === "Liquidated" ? `${aaveV4DisplaySymbol(i.symbol)} liquidated` : aaveV4DisplaySymbol(i.symbol),
      amount: fmt(i.amount),
      usdHint: hideUsd ? undefined : fmtUsd(i.usd).display,
      usdProv: hideUsd ? undefined : flowUsdHintProv(aaveV4DisplaySymbol(i.symbol)),
      usdExact: hideUsd ? undefined : fmtUsd(i.usd).title,
      swatchStyle: pattern,
      icon: <TokenChipIcon symbol={i.symbol} size={14} filterable={false} />,
      prov,
    }));
  };

  // A total the unpriced holdings emptied has no figure to state: "< $0.01"
  // would read as a value it measured. An em dash says there is none, and the
  // "(partial)" label and the receipt say why.
  const totalAmount = (usd: number, excluded: string[]) =>
    excluded.length > 0 && usd < LIFETIME_DUST_USD ? "—" : fmtUsd(usd).display;

  // The unpriced holdings on a side: always per-asset (a sum can't absorb a row
  // that has no USD), no swatch (there is no segment for one to point at), and
  // "no price source" where the USD hint would be — shown whether or not USD
  // hints are hidden, because it is the statement that there is no figure, not
  // a figure.
  const unpricedCurrentRows = (
    assets: AssetRow[],
    nativeOf: (r: AssetRow) => number,
    prov: Provenance,
  ): BreakdownRow[] =>
    assets.map((r) => ({
      sign: "",
      label: aaveV4DisplaySymbol(r.symbol),
      amount: fmt(nativeOf(r)),
      usdHint: NO_PRICE_HINT,
      usdProv: noPriceProv(r.symbol),
      icon: <TokenChipIcon symbol={r.symbol} size={14} filterable={false} />,
      prov,
    }));

  const currentRows = (
    assets: PricedRow[],
    unpriced: AssetRow[],
    nativeOf: (r: AssetRow) => number,
    usdOf: (r: PricedRow) => number,
    swatchClass: string,
    mergedLabel: string,
    prov: Provenance,
  ): BreakdownRow[] => {
    const excluded = unpriced.map((r) => r.symbol);
    const tail = unpricedCurrentRows(unpriced, nativeOf, prov);
    if (grouped && assets.length >= 2) {
      const total = assets.reduce((s, r) => s + usdOf(r), 0);
      return [
        {
          sign: "",
          label: partialLabel(mergedLabel, excluded),
          amount: totalAmount(total, excluded),
          swatchClass,
          prov: partialSumProv(prov, mergedLabel, excluded),
        },
        ...tail,
      ];
    }
    return [
      ...[...assets].reverse().map((r) => ({
        sign: "",
        label: aaveV4DisplaySymbol(r.symbol),
        amount: fmt(nativeOf(r)),
        usdHint: hideUsd ? undefined : fmtUsd(usdOf(r)).display,
        usdProv: hideUsd ? undefined : currentUsdHintProv(aaveV4DisplaySymbol(r.symbol), r.priceSource),
        usdExact: hideUsd ? undefined : fmtUsd(usdOf(r)).title,
        swatchClass,
        icon: <TokenChipIcon symbol={r.symbol} size={14} filterable={false} />,
        prov,
      })),
      ...tail,
    ];
  };

  // Denomination rule: the "(all time)" aggregate is denominated in the side's
  // token only when the WHOLE side speaks one symbol — then it carries the
  // chip; a multi-asset side's USD aggregate stays chip-less.
  const oneSideSymbol = (lists: { symbol: string }[][]) => {
    const set = new Set(lists.flat().map((i) => i.symbol));
    return set.size === 1 ? [...set][0] : null;
  };
  const collSideSymbol = oneSideSymbol([withdrawnAssets, liquidatedCollAssets, supplyAssets, unpricedSupply]);
  const debtSideSymbol = oneSideSymbol([repaidAssets, liquidatedDebtAssets, debtAssets, unpricedDebt]);

  const currentCollLabel = supplyOnly ? "Currently Supplied" : "Current Collateral";

  const collRows: BreakdownRow[] = [
    ...(!isLiveView
      ? [
          {
            sign: "",
            label: partialLabel("Deposited (all time)", depositedExcluded),
            amount: totalAmount(totalDepositedUsd, depositedExcluded),
            swatchStyle: { backgroundColor: COLLATERAL_FADED },
            icon: collSideSymbol ? <TokenChipIcon symbol={collSideSymbol} size={14} filterable={false} /> : undefined,
            prov: partialSumProv(depositedProv(), "Deposited (all time)", depositedExcluded),
          } as BreakdownRow,
        ]
      : []),
    ...(!isLiveView ? flowRows(withdrawnAssets, WITHDRAWN_PATTERN, "Withdrawn") : []),
    ...(!isLiveView ? flowRows(liquidatedCollAssets, LIQUIDATION_PATTERN, "Liquidated") : []),
    ...currentRows(
      supplyAssets,
      unpricedSupply,
      (r) => r.netSupply,
      (r) => r.netSupplyUsd,
      "bg-blue-500",
      "Combined Collateral",
      CURRENT_COLL_PROV,
    ),
    {
      sign: "",
      // Parity with Liquity's "Current Collateral" total for borrow positions;
      // a never-borrowed wallet has nothing collateralised, so it reads as a
      // plain supply balance instead.
      label: partialLabel(currentCollLabel, unpricedSupplySymbols),
      amount: totalAmount(totalSupplyUsd, unpricedSupplySymbols),
      isResult: true,
      prov: partialSumProv(CURRENT_COLL_PROV, currentCollLabel, unpricedSupplySymbols),
    },
  ];

  const debtRows: BreakdownRow[] = [
    ...(!isLiveView
      ? [
          {
            sign: "",
            label: partialLabel("Borrowed (all time)", borrowedExcluded),
            amount: totalAmount(totalBorrowedUsd, borrowedExcluded),
            swatchStyle: { backgroundColor: DEBT_GREEN_FADED },
            icon: debtSideSymbol ? <TokenChipIcon symbol={debtSideSymbol} size={14} filterable={false} /> : undefined,
            prov: partialSumProv(borrowedProv(), "Borrowed (all time)", borrowedExcluded),
          } as BreakdownRow,
        ]
      : []),
    ...(!isLiveView ? flowRows(repaidAssets, REPAID_PATTERN, "Repaid") : []),
    ...(!isLiveView ? flowRows(liquidatedDebtAssets, LIQUIDATION_PATTERN, "Liquidated") : []),
    ...currentRows(
      debtAssets,
      unpricedDebt,
      (r) => r.netDebt,
      (r) => r.netDebtUsd,
      "bg-green-400",
      "Debt",
      CURRENT_DEBT_PROV,
    ),
    {
      sign: "",
      label: partialLabel("Current Debt", unpricedDebtSymbols),
      amount: totalAmount(totalDebtUsd, unpricedDebtSymbols),
      isResult: true,
      prov: partialSumProv(CURRENT_DEBT_PROV, "Current Debt", unpricedDebtSymbols),
    },
  ];

  const placeholderClass =
    "w-16 sm:w-20 rounded-sm border border-dashed border-rb-400 dark:border-rb-500/60 bg-rb-100/40 dark:bg-rb-800/40";
  const ghostTower = <div className={placeholderClass} style={{ height: CHART_HEIGHT }} />;
  // Labelled ghost for the pure supply-side case — the dashed tower stands in
  // for the absent debt side, with a faded "No debt" so the emptiness reads as
  // intentional rather than a loading gap. Sized to match the collateral tower's
  // filled height (never taller): debt is always ≤ collateral, so a full-height
  // ghost beside a shorter supply tower read as illogically large. Clamped to a
  // floor so the "No debt" label stays legible when collateral is tiny. Both
  // towers are bottom-aligned, so the shorter ghost shares the baseline.
  const collTowerPx = towerMax > 0 ? Math.min(CHART_HEIGHT, (collPeak / towerMax) * CHART_HEIGHT) : CHART_HEIGHT;
  const ghostDebtHeight = Math.max(40, collTowerPx);
  const ghostDebtTower = (
    <div className={`${placeholderClass} flex items-center justify-center`} style={{ height: ghostDebtHeight }}>
      <span className="text-[11px] font-medium text-rb-500/60 select-none">No debt</span>
    </div>
  );
  const collPlaceholder = collSegments.length === 0 ? ghostTower : undefined;
  const debtPlaceholder = debtSegments.length === 0 ? ghostTower : undefined;

  const hasToolbarRow = title != null || hasLive || hasHistory;
  return (
    <div>
      {hasToolbarRow && (
        // Toolbar row: the host's section title on the left, the Display
        // control on the right. The chart below pulls up underneath it (-mt-7
        // matching the row's min-h), so the towers' empty top band shares this
        // line — title left, control right, towers centered. The row stays
        // hit-testable above the chart (z-10) but only on its actual children,
        // so tower-top tooltips still hover through the middle.
        <div className="pointer-events-none relative z-10 flex min-h-[28px] items-center justify-between gap-2">
          <div className="min-w-0 pointer-events-auto">{title}</div>
          {(hasLive || hasHistory) && (
            <div className="pointer-events-auto flex justify-end gap-1.5">
              <AaveChartDisplayMenu
                hideHistorical={hideHistorical}
                onToggleHistorical={() => setHideHistorical((v) => !v)}
                hasHistory={hasHistory}
                hideUsd={hideUsd}
                onToggleHideUsd={() => setHideUsd((v) => !v)}
                hideSurplus={hideSurplus}
                onToggleHideSurplus={onToggleHideSurplus}
                hasSurplus={(surplusSymbols?.size ?? 0) > 0}
                grouped={grouped}
                onToggleGroup={() => setGroupOverride(!grouped)}
                canGroup={canGroup}
              />
            </div>
          )}
        </div>
      )}
      <DualTowerChart
        left={{
          segments: collSegments,
          breakdownRows: collRows,
          sideBar: collSideBar,
          placeholder: collPlaceholder,
          sideBarTooltip: collSideBar ? (
            <div className="flex items-center gap-1.5">
              <span>Deposited (all time)</span>
              {dirArrow("in")}
              <span className="ml-auto tabular-nums">{fmtUsd(totalDepositedUsd).title}</span>
            </div>
          ) : undefined,
        }}
        right={
          supplyOnly
            ? // Pure supply-side wallet: keep the dual-tower footprint with a
              // ghost debt tower (dashed outline) so the chart stays centered
              // instead of collapsing left. No breakdown rows on the debt side.
              {
                segments: [],
                breakdownRows: [],
                placeholder: ghostDebtTower,
              }
            : {
                segments: debtSegments,
                breakdownRows: debtRows,
                sideBar: debtSideBar,
                placeholder: debtPlaceholder,
                sideBarTooltip: debtSideBar ? (
                  <div className="flex items-center gap-1.5">
                    <span>Borrowed (all time)</span>
                    {dirArrow("out")}
                    <span className="ml-auto tabular-nums">{fmtUsd(totalBorrowedUsd).title}</span>
                  </div>
                ) : undefined,
              }
        }
        height={CHART_HEIGHT}
        maxValue={towerMax}
        className={hasToolbarRow ? "-mt-7 mb-6" : "mt-2 mb-6"}
      />
    </div>
  );
}
