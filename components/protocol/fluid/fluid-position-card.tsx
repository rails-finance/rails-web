"use client";

// Fluid position card — the NFT-keyed analog of the MakerDAO vault card, as a
// slot builder for the shared position card (rails-ops TO-DO-position-card
// 322): `fluidCardSlots` turns the position's view and the page's live
// resolver read into one `PositionCardSlots` object, and `PositionCard`
// (components/shared/position-card.tsx) draws it on the position page and in
// the listing row.
//
// A Fluid position is a factory-minted ERC721 living in ONE vault (one
// collateral/debt pair), so the card carries two figures — and TWO
// deliberately distinguishable lanes behind them. The settled overlay (the
// vault resolver's own math at a stamped block: liquidations + accrued
// interest applied) is the primary figure when present; the Σ replay lane
// (operate deltas + liquidation attributions, interest-blind between events)
// is the fallback, and each lane's provenance names its basis. The Σ replay
// rides in the panel as "from events". Smart-vault legs have no ERC20 symbol
// (the "token" is a Fluid DEX pool) — they render as shares; no USD is
// asserted at this depth.

import { ListingTag } from "@/components/shared/listing-tag";
import type { ReactNode } from "react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Prov } from "@/components/shared/provenance";
import { settledNowProv, positionSigmaProv, peakLegProv, accruedInterestProv } from "@/lib/fluid/event-provenance";
import { fluidLegHolds } from "@/lib/fluid/explainer-clauses";
import {
  fluidRatioProv,
  liveSettledProv,
  vaultConfigProv,
  fluidLiqPriceProv,
  liveBorrowRateProv,
} from "@/lib/fluid/live-provenance";
import { pct } from "@/components/shared/ratio-bar";
import { fluidPositionContent } from "@/lib/fluid/position-content";
import { pairLabel, poolShareLabel, vaultKindLabel } from "@/lib/fluid/asset-catalog";
import { formatNumber, formatExact } from "@/lib/utils/format";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import { AmountText } from "@/components/shared/amount-text";
import { TokenFigure } from "@/components/shared/token-figure";
import { FluidMenuRows } from "./fluid-menu-rows";
import { PanelFigure } from "@/components/shared/position-card-panel";

export interface FluidPositionView {
  nftId: string;
  /** The vault contract (the collateral/debt pair this position lives in). */
  vault: string;
  /** Display pair, e.g. "wstETH / USDC" (smart legs read "DEX shares"). */
  pair: string;
  vaultKindLabel: string;
  supplySymbol: string | null;
  borrowSymbol: string | null;
  /** A smart leg's DEX pool composition from the indexed roster — names the
   *  shares on listing rows, where no chain read runs. */
  supplyPoolPair: [string, string] | null;
  borrowPoolPair: [string, string] | null;
  status: "open" | "closed";
  wasLiquidated: boolean;
  /** The engine itself emptied the position (vs sweeps in the record that the
   *  owner later closed out) — keys the terminal pane's closure attribution. */
  fullyLiquidated: boolean;
  /** Σ replay lane (operate deltas + liquidation attributions), human-readable. */
  colNet: string;
  debtNet: string;
  /** Settled overlay at the stamped block (resolver truth: liquidations +
   *  accrued interest applied) — null when the worker hasn't refreshed it. */
  settled: { supply: string; borrow: string; updatedBlock: number | null } | null;
  owner: string | null;
  eventCount: number;
  /** Distinct transactions of the position's own (sweeps excluded) — what the
   *  meta's title asserts; eventCount includes the sweeps done TO it. */
  txCount: number;
  liquidationCount: number;
  /** Highest recorded per-leg amounts (closed cards). */
  peakCol: string;
  peakDebt: string;
  /** Which lane the peaks come from — see FluidPositionSummary.peakBasis. */
  peakBasis: "chain" | "events";
  lastActivityAt: number | null;
}

/** A leg's display name, by lane: the API symbol, else the pool pair the
 *  chain read names (a smart leg's shares said as what they are shares OF),
 *  else the indexed roster's pool pair — the listing lane, where no chain
 *  read runs — else bare shares. */
export function fluidLegName(
  v: FluidPositionView,
  side: "supply" | "borrow",
  chain?: FluidPositionChainResponse | null,
): string {
  const sym = side === "supply" ? v.supplySymbol : v.borrowSymbol;
  // The chain read names a TOKEN leg the index left blank too (its ERC-20
  // meta rides the same resolver call), not only the smart legs' pools.
  const chainSym = chain && chain.found ? (side === "supply" ? chain.supplySymbol : chain.borrowSymbol) : null;
  const pool = chain && chain.found ? (side === "supply" ? chain.supplyPoolPair : chain.borrowPoolPair) : null;
  const rosterPool = side === "supply" ? v.supplyPoolPair : v.borrowPoolPair;
  return sym ?? chainSym ?? poolShareLabel(pool) ?? poolShareLabel(rosterPool) ?? "DEX shares";
}

/** The pair as the detail surfaces say it — pool-named smart legs included. */
export function fluidPairText(v: FluidPositionView, chain?: FluidPositionChainResponse | null): string {
  return `${fluidLegName(v, "supply", chain)} / ${fluidLegName(v, "borrow", chain)}`;
}

/** One leg's figure, by lane strength: the page's LIVE resolver read at head
 *  when it landed, the worker's stamped settled overlay next, the Σ replay
 *  last — each wrapped in the provenance that names its basis. Null (a dash)
 *  where the leg holds nothing. */
function legFigure(v: FluidPositionView, side: "supply" | "borrow", chain?: FluidPositionChainResponse | null) {
  const sym = fluidLegName(v, side, chain);
  const sigma = side === "supply" ? v.colNet : v.debtNet;
  const settled = v.settled ? (side === "supply" ? v.settled.supply : v.settled.borrow) : null;
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  const exact = live != null ? (side === "supply" ? live.supplyExact : live.borrowExact) : (settled ?? sigma);
  const amount = Number(exact);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const prov =
    live != null
      ? liveSettledProv(side, sym, live.blockNumber)
      : settled != null
        ? settledNowProv(side, sym, v.settled?.updatedBlock)
        : positionSigmaProv(side, sym);
  return (
    <Prov info={prov}>
      <AssetAmount value={amount} symbol={sym} exact={exact} />
    </Prov>
  );
}

const SIGMA_TIP =
  "What the position's recorded operations and liquidation attributions add up to, before interest. The headline is the vault's settled figure, which includes the interest.";

/** A panel row for the Σ replay of one leg, beside the settled headline: the
 *  events' sum, and the gap between the two lanes stated as the interest it
 *  is (the replay carries every operate and liquidation amount and no
 *  interest). The gap is read off the same two figures the card shows; it
 *  drops when it rounds to nothing at the displayed precision (a smart leg's
 *  share count accrues none) or runs negative. Null where the card has no
 *  settled figure to set it against. */
function sigmaRow(
  v: FluidPositionView,
  side: "supply" | "borrow",
  chain?: FluidPositionChainResponse | null,
): PositionPanelRow | null {
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  if (!v.settled && !live) return null;
  const sym = fluidLegName(v, side, chain);
  const sigma = side === "supply" ? v.colNet : v.debtNet;
  const n = Number(sigma);
  if (!Number.isFinite(n) || n <= 0) return null;
  const headline = Number(
    live != null
      ? side === "supply"
        ? live.supplyExact
        : live.borrowExact
      : side === "supply"
        ? v.settled?.supply
        : v.settled?.borrow,
  );
  const gap = Number.isFinite(headline) ? headline - n : NaN;
  const showGap = Number.isFinite(gap) && gap > 0 && formatNumber(gap) !== "0";
  const sigmaFig = (
    <TokenFigure symbol={sym} figure={`${formatExact(n)} ${sym}`}>
      <Prov info={positionSigmaProv(side, sym)} value={formatExact(n)}>
        <AmountText value={n} format="compact" />
      </Prov>
    </TokenFigure>
  );
  return {
    id: `events-${side === "supply" ? "collateral" : "debt"}`,
    label: side === "supply" ? "Collateral from events" : "Debt from events",
    tip: SIGMA_TIP,
    value: showGap ? (
      <>
        {sigmaFig} +{" "}
        <TokenFigure symbol={sym} figure={`${formatExact(gap)} ${sym}`}>
          <Prov info={accruedInterestProv(side, sym)} value={formatExact(gap)}>
            <AmountText value={gap} format="compact" />
          </Prov>
        </TokenFigure>{" "}
        interest
      </>
    ) : (
      sigmaFig
    ),
  };
}

export interface FluidPositionCardProps {
  v: FluidPositionView;
  /** `detail` on the position page (receipts, panel, (i)); `listing` in a row. */
  surface?: "detail" | "listing";
  /** The page's live resolver read — upgrades the leg figures from the
   *  worker's stamped overlay to the head-block settled state, and brings the
   *  Position ratio headline and the panel's risk rows. */
  chain?: FluidPositionChainResponse | null;
  /** The live read is still out: the Position ratio head waits for it. */
  chainPending?: boolean;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: ReactNode;
  /** Copy-this-view control, the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes (`fluidExports`). */
  exports?: PositionCardExports | null;
}

/** Fluid's slots for the shared position card: the headlines, the panel, the
 *  tag, the ⋮ and the counters, from the position's view and the page's live
 *  resolver read. */
export function fluidCardSlots({
  v,
  surface = "listing",
  chain = null,
  chainPending = false,
  explanation,
  viewHref,
  exports,
}: FluidPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const pairText = fluidPairText(v, chain);
  // The position type and the share pair are labels the figures do not carry
  // (ui-jobs 270 item 6): the pair, the NFT and the vault kind.
  const typeLabel = (
    <span className="text-xs font-semibold text-rb-500">
      {pairText}
      <span className="ml-2 font-normal tabular-nums text-rb-400">
        #{v.nftId} · {v.vaultKindLabel}
      </span>
    </span>
  );
  // The listing names the owner and the vault kind on the left and the pair
  // and NFT at the right end; the position page's wallet row names the owner.
  const identity = detail ? (
    typeLabel
  ) : (
    <span className="contents">
      {v.owner ? (
        <WalletPill wallet={v.owner} ensName={null} filterProtocol="fluid" bookmarkProtocol="fluid" />
      ) : (
        <span className="font-normal tabular-nums text-rb-400">—</span>
      )}
      <span className="text-xs font-normal tabular-nums text-rb-400">{v.vaultKindLabel}</span>
    </span>
  );
  const tag = detail ? undefined : <ListingTag market={pairText} id={v.nftId} />;
  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    liquidationCount: v.liquidationCount,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const closed = v.status === "closed";
  const status: PositionCardStatus | null = closed
    ? v.wasLiquidated
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" }
    : null;
  const common = { status, identity, counters };

  if (closed) {
    // The settled figures have gone to zero, so the headline is what each leg
    // held at its height: the per-leg MAX of the rows' settled balances (the
    // replay's while a row is unread; no USD).
    const peakCol = Number(v.peakCol);
    const peakDebt = Number(v.peakDebt);
    const colName = fluidLegName(v, "supply", chain);
    const debtName = fluidLegName(v, "borrow", chain);
    const peakCoords = { vault: v.vault, pairLabel: pairText, nftId: v.nftId };
    const heads: PositionCardHead[] = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value:
          Number.isFinite(peakCol) && peakCol > 0 ? (
            <Prov info={peakLegProv("supply", colName, peakCoords, v.peakBasis)}>
              <AssetAmount value={peakCol} symbol={colName} exact={v.peakCol} />
            </Prov>
          ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value:
          Number.isFinite(peakDebt) && peakDebt > 0 ? (
            <Prov info={peakLegProv("borrow", debtName, peakCoords, v.peakBasis)}>
              <AssetAmount value={peakDebt} symbol={debtName} exact={v.peakDebt} />
            </Prov>
          ) : null,
      },
    ];
    const outcome = {
      word: status?.word ?? "Closed",
      dates: v.lastActivityAt != null ? [{ at: v.lastActivityAt }] : undefined,
      footnote:
        Number.isFinite(peakCol) && peakCol > 0 && Number.isFinite(peakDebt) && peakDebt > 0 ? (
          <div className="text-xs text-rb-500 mt-0.5">each peak at its own date</div>
        ) : undefined,
    };
    if (!detail) return { ...common, surface: "listing", menu: null, tag, heads, outcome };
    return {
      ...common,
      surface: "detail",
      heads,
      outcome,
      explainer: { body: explanation ?? null, viewHref },
      learnMore: fluidPositionContent({
        status: "closed",
        wasLiquidated: v.wasLiquidated,
        peakBasis: v.peakBasis,
      }),
      menu: fluidMenu(v, exports),
    };
  }

  const live = chain && chain.found && !chain.chainStale ? chain : null;
  // One rule with the pane below (fluidLegHolds): ε on the Σ replay, `> 0` on a
  // chain figure, so the card and the prose can never disagree about the debt.
  const hasDebt =
    live != null
      ? fluidLegHolds(live.borrow, "chain")
      : fluidLegHolds(v.settled?.borrow ?? v.debtNet, v.settled ? "chain" : "flows");

  // Position ratio: debt ÷ (collateral × the vault oracle's liquidate price),
  // the engine's own figure. Only with live debt against live collateral.
  const riskLive =
    live != null &&
    !live.isEmpty &&
    live.ratio != null &&
    live.borrow > 0 &&
    live.supply > 0 &&
    live.oraclePriceLiquidateDebtPerCol != null
      ? live
      : null;
  const colName = fluidLegName(v, "supply", chain);
  const debtName = fluidLegName(v, "borrow", chain);

  const heads: PositionCardHead[] = [
    { id: "collateral", label: CARD_VOCAB.collateral, value: legFigure(v, "supply", chain) },
    { id: "debt", label: CARD_VOCAB.debt, value: legFigure(v, "borrow", chain) },
  ];
  if (riskLive) {
    heads.push({
      id: "position-ratio",
      label: "Position ratio",
      labelTip:
        "Debt divided by collateral at the vault oracle's liquidate price, the figure Fluid's liquidation engine compares with the vault's risk lines.",
      value: <Prov info={fluidRatioProv(colName, debtName, riskLive.vault, pairText)}>{pct(riskLive.ratio!)}</Prov>,
    });
  } else if (detail && chainPending && hasDebt) {
    // The third slot waits for the read to land, so the row does not jump.
    heads.push({ id: "position-ratio", label: "Position ratio", value: null, pending: true });
  }

  if (!detail) return { ...common, surface: "listing", menu: null, tag, heads };

  const left = [sigmaRow(v, "supply", chain), sigmaRow(v, "borrow", chain)].filter(
    (r): r is PositionPanelRow => r != null,
  );
  const right: PositionPanelRow[] = [];
  if (riskLive) {
    // Headroom to the borrow gate, in the debt leg's unit (token or shares;
    // dimensionally sound either way: price is debt-leg per col-leg).
    const headroom = Math.max(
      0,
      riskLive.supply * riskLive.oraclePriceLiquidateDebtPerCol! * riskLive.collateralFactor - riskLive.borrow,
    );
    const colSym = riskLive.supplySymbol ?? poolShareLabel(riskLive.supplyPoolPair) ?? "DEX shares";
    const debtSym = riskLive.borrowSymbol ?? poolShareLabel(riskLive.borrowPoolPair) ?? "DEX shares";
    if (riskLive.borrowRatePct != null) {
      right.push({
        id: "borrow-rate",
        label: "Borrow rate",
        tip: "The vault's current borrow rate, annual, read from the vault on chain at the latest block. It floats with how heavily the vault is used.",
        value: <Prov info={liveBorrowRateProv(riskLive.vault, pairText)}>{riskLive.borrowRatePct.toFixed(2)}%</Prov>,
      });
    }
    right.push(
      {
        id: "borrow-room",
        label: "Room to the borrow limit",
        tip: "How much more debt the position can take before it reaches the vault's borrow limit (its collateral factor), where Fluid stops lending. Read from the vault on chain at the latest block.",
        value: (
          <>
            <TokenFigure symbol={debtSym} figure={`${formatExact(headroom)} ${debtSym}`}>
              <Prov info={fluidLiqPriceProv(colSym, debtSym, riskLive.vault, pairText)}>
                <AmountText value={headroom} format="compact" />
              </Prov>
            </TokenFigure>{" "}
            to the{" "}
            <Prov
              info={vaultConfigProv("Collateral factor (borrow gate)", "collateralFactor", riskLive.vault, pairText)}
            >
              <PanelFigure>{pct(riskLive.collateralFactor)}</PanelFigure>
            </Prov>{" "}
            limit
          </>
        ),
      },
      {
        id: "liquidates-above",
        label: "Liquidates above",
        tip: "The ratio above which Fluid can liquidate the position: the vault's liquidation threshold, read from its settings on chain at the latest block.",
        value: (
          <Prov info={vaultConfigProv("Liquidation threshold", "liquidationThreshold", riskLive.vault, pairText)}>
            {pct(riskLive.liquidationThreshold)}
          </Prov>
        ),
      },
    );
  }

  return {
    ...common,
    surface: "detail",
    heads,
    panel: [left, right],
    explainer: { body: explanation ?? null, viewHref },
    learnMore: fluidPositionContent({ status: "open", hasDebt }),
    menu: fluidMenu(v, exports),
  };
}

/** The ⋮: the NFT with a copy, the link to this page, then the export shapes. */
function fluidMenu(v: FluidPositionView, exports?: PositionCardExports | null) {
  return {
    leading: () => <FluidMenuRows nftId={v.nftId} pagePath={`/ethereum/fluid/${v.nftId}`} />,
    exports: exports ?? null,
  };
}

/** The Fluid position card: its slots, drawn by the shared card. */
export function FluidPositionCard(props: FluidPositionCardProps) {
  return <PositionCard slots={fluidCardSlots(props)} />;
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: FluidPositionSummary): FluidPositionView {
  return {
    nftId: s.nftId,
    vault: s.vault,
    pair: pairLabel(s.supplySymbol, s.borrowSymbol, s.supplyPoolPair, s.borrowPoolPair),
    vaultKindLabel: vaultKindLabel(s.vaultType),
    supplySymbol: s.supplySymbol,
    borrowSymbol: s.borrowSymbol,
    supplyPoolPair: s.supplyPoolPair ?? null,
    borrowPoolPair: s.borrowPoolPair ?? null,
    status: s.status,
    wasLiquidated: s.wasLiquidated,
    fullyLiquidated: s.fullyLiquidated,
    colNet: s.colNet,
    debtNet: s.debtNet,
    settled: s.settled,
    owner: s.owner,
    eventCount: s.eventCount,
    txCount: s.txCount,
    liquidationCount: s.liquidationCount,
    peakCol: s.peakCol,
    peakDebt: s.peakDebt,
    peakBasis: s.peakBasis,
    lastActivityAt: s.lastActivityAt,
  };
}
