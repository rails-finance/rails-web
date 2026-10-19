"use client";

// f(x) position card, the tick-tree analog of the MakerDAO vault card. It is a
// slot builder (rails-ops TO-DO-position-card 322, ui-jobs 307):
// `useFxCardSlots` turns the position's view and the page's reads into one
// `PositionCardSlots` object and the shared `PositionCard`
// (components/shared/position-card.tsx) draws it, on the position page and the
// listing, open and closed.
//
// f(x) socializes funding charges, tick rebalances and bad-debt write-offs
// across every position with NO per-position event, so the CURRENT state here
// is the SETTLED lane: the pool's own getPosition / getPositionDebtRatio
// views, swept server-side at a named head block. Settled amounts are
// RATE-NORMALIZED 1e18 units (stETH-equivalent for the wstETH pool) and the
// card labels them with the normalized symbol, never the deposit token's. USD
// is the settled collateral × the pool's oracle price, and names the block
// that price was read at. Debt is fxUSD, rendered as fxUSD and never equated
// to dollars, so the Debt headline carries no USD line.
//
// The event-implied debt (Σ of the events' deltas) rides along ONLY as the
// reconciliation rows: implied vs settled, the difference being the socialized
// lane (funding / rebalances / write-offs). They are always surfaced, never
// hidden: wsteth-285 shows implied 25,178 fxUSD against settled 0. They are
// panel rows on an open card and on a closed one.

import { ListingTag } from "@/components/shared/listing-tag";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Prov } from "@/components/shared/provenance";
import {
  settledCollateralProv,
  settledDebtProv,
  settledDebtRatioProv,
  fxPositionUsdProv,
  impliedDebtProv,
  socializedDebtProv,
  lifetimeCollateralDriftProv,
  anchorPriceProv,
  poolLineProv,
  triggerPriceProv,
  oracleLegAtProv,
  anchorUsdProv,
  minRatioProv,
  minTriggerPriceProv,
  rebalanceClearedProv,
  otherDebtMovesProv,
  socializedCollTakenProv,
  fundingTakenProv,
  positionTickProv,
  ticksAboveProv,
  lifetimeInTxFundingProv,
  lifetimeCollateralMovedProv,
  leftUnpaidProv,
  badDebtAddedProv,
} from "@/lib/fx/event-provenance";
import { useFxPoolTerms, useFxPricesAt, type FxPoolTerms } from "@/lib/fx/use-event-state";
import { fxBlocksChange } from "@/lib/fx/socialized-reads";
import type { FxNoTxParts } from "@/lib/fx/no-tx-parts";
import type { FxInTxFunding } from "@/lib/fx/in-tx-funding";
import { FX_LIQUIDATION_RULE } from "@/lib/fx/row-figures";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import { formatDate } from "@/lib/date";
import { FX_POOLS, fxPositionSlug } from "@/lib/fx/asset-catalog";
import { fxPositionContent } from "@/lib/fx/position-content";
import { formatExact, formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { TokenFigure } from "@/components/shared/token-figure";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import { summariseFxDrift, type FxDriftResult } from "@/lib/sources/api/fx-drift";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { FxMenuRows } from "./fx-menu-rows";

const DUST = 1e-9;

/** The card view IS the listing summary: the settled lane, the implied lane
 *  and the activity meta all arrive on one row (no extra chain merge here). */
export type FxPositionView = FxPositionSummary;

const short = (a: string | null): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** The socialized rows a detail page holds (rebalances and pool-wide
 *  liquidations), with the position read at each of their blocks
 *  (lib/fx/socialized-reads.tsx), for the card's split. */
export interface FxRebalanceRows {
  blocks: number[];
  firstTs: number;
  lastTs: number;
  /** How many of the rows are pool-wide liquidations, and redemptions. */
  liquidations?: number;
  redemptions?: number;
  /** Blocks that also carry one of the position's own events: a block read
   *  there mixes the two, so the split is not stated. */
  ownEventBlocks: number[];
  reads?: Record<string, FxStateAt> | null;
  /** What moved the debt without a transaction, part by part
   *  (lib/fx/no-tx-parts.ts). */
  parts?: FxNoTxParts | null;
}

/** A panel figure in a token: compact, with the token's 16 px icon in place
 *  of its ticker; `children` is the traced figure (its \`Prov\`). */
function PanelToken({ symbol, value, children }: { symbol: string; value: number; children: ReactNode }) {
  return (
    <TokenFigure symbol={symbol} figure={`${formatExact(Math.abs(value))} ${symbol}`}>
      {children}
    </TokenFigure>
  );
}

/** What the socialized rows took from the position: Σ over their blocks of
 *  getPosition at block − 1 less at the block, collateral and debt. Null until
 *  every block has read, or where a block also holds an own event. */
function socializedTaken(rows?: FxRebalanceRows): { coll: number; debt: number } | null {
  if (!rows || rows.blocks.length === 0 || !rows.reads) return null;
  if (rows.blocks.some((b) => rows.ownEventBlocks.includes(b))) return null;
  const c = fxBlocksChange(rows.reads, rows.blocks);
  return c ? { coll: -c.coll, debt: -c.debt } : null;
}

/** "rebalances", "liquidations" or "rebalances and liquidations". */
function rowsNoun(rows: FxRebalanceRows): string {
  const liq = rows.liquidations ?? 0;
  const red = rows.redemptions ?? 0;
  const reb = rows.blocks.length - liq - red;
  const parts = [reb > 0 ? "rebalances" : null, liq > 0 ? "liquidations" : null, red > 0 ? "redemptions" : null].filter(
    (p): p is string => p != null,
  );
  return parts.length <= 1 ? (parts[0] ?? "rebalances") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const dateSpan = (a: number, b: number): string =>
  formatDate(a) === formatDate(b) ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`;

/** THE DEBT RECONCILIATION: the debt the position's transactions add up to,
 *  and what moved it without the owner's transaction. On a detail page that is
 *  what the rebalance rows cleared (read per row) and the rest, which is other
 *  positions' bad debt added through the debt index. */
function debtReconciliationRows(v: FxPositionView, rows?: FxRebalanceRows): PositionPanelRow[] {
  const taken = socializedTaken(rows);
  const cleared = taken?.debt ?? null;
  const impliedTip =
    "The debt this position's transactions add up to: the sum of every debt move its events carry, from the pool's deploy block. The pool's settled figure above is the true debt; the gap between the two is what the pool moved.";
  const movedTip =
    "The part of the debt the pool moved with no transaction of this position's: rebalances and redemptions that cleared it, write-offs, and other positions' bad debt added through the pool's debt index. Each figure is read from the pool before and after the block.";
  if (v.activity.eventCount === 0) {
    // Chain-only position: the contract minted it via a path that emits no
    // Operate, so there is nothing to reconcile against.
    return [
      {
        id: "recorded-events",
        label: "Recorded events",
        value:
          "none: this position was created by a path that logs nothing; only the pool's current figures describe it",
        tip: "A chain-only position: the pool minted it by a path that emits no Operate event, so there is no event record to check the pool's figures against.",
      },
    ];
  }
  const implied: PositionPanelRow = {
    id: "debt-implied",
    label: "Transactions add up to",
    value: <Prov info={impliedDebtProv()}>{formatCompact(v.impliedDebt.amount)}</Prov>,
    asset: { symbol: "fxUSD", figure: `${formatExact(v.impliedDebt.amount)} fxUSD` },
    tip: impliedTip,
  };
  if (v.settled.debts == null) {
    return [
      {
        ...implied,
        asset: undefined,
        value: (
          <>
            <PanelToken symbol="fxUSD" value={v.impliedDebt.amount}>
              <Prov info={impliedDebtProv()}>{formatCompact(v.impliedDebt.amount)}</Prov>
            </PanelToken>
            , awaiting the pool&apos;s figure
          </>
        ),
      },
    ];
  }
  const diff = v.socializedDebt ?? v.impliedDebt.amount - v.settled.debts;
  if (Math.abs(diff) <= 1e-9) return [implied];
  const moved = (value: ReactNode): PositionPanelRow => ({
    id: "debt-moved",
    label: "Moved by the pool",
    value,
    tip: movedTip,
  });
  const n = rows ? new Set(rows.blocks).size : 0;
  const parts = rows?.parts;
  if (parts && parts.badDebt > -0.0005) {
    // One name for the bucket everywhere ("moved by the pool"), and
    // each part that is there named with its figure.
    const items: ReactNode[] = [];
    const span = (p: { firstTs: number; lastTs: number }) => ` (${dateSpan(p.firstTs, p.lastTs)})`;
    if (parts.rebalances && parts.rebalances.debt > 0.0005)
      items.push(
        <span key="reb">
          <PanelToken symbol="fxUSD" value={parts.rebalances.debt}>
            <Prov info={rebalanceClearedProv(parts.rebalances.rows)}>
              <AmountText value={parts.rebalances.debt} format="compact" />
            </Prov>
          </PanelToken>{" "}
          cleared by rebalances{span(parts.rebalances)}
        </span>,
      );
    if (parts.redemptions && parts.redemptions.debt > 0.0005)
      items.push(
        <span key="red">
          <PanelToken symbol="fxUSD" value={parts.redemptions.debt}>
            <Prov info={rebalanceClearedProv(parts.redemptions.rows, "redemption")}>
              <AmountText value={parts.redemptions.debt} format="compact" />
            </Prov>
          </PanelToken>{" "}
          by redemptions{span(parts.redemptions)}
        </span>,
      );
    if (parts.poolLiquidations && parts.poolLiquidations.debt > 0.0005)
      items.push(
        <span key="pliq">
          <PanelToken symbol="fxUSD" value={parts.poolLiquidations.debt}>
            <Prov info={rebalanceClearedProv(parts.poolLiquidations.rows, "pool-wide liquidation")}>
              <AmountText value={parts.poolLiquidations.debt} format="compact" />
            </Prov>
          </PanelToken>{" "}
          by a pool-wide liquidation that repaid{" "}
          <PanelToken symbol="fxUSD" value={parts.poolLiquidations.poolRepaid ?? 0}>
            <AmountText value={parts.poolLiquidations.poolRepaid ?? 0} format="compact" />
          </PanelToken>
          across the pool and wrote off the rest{span(parts.poolLiquidations)}
        </span>,
      );
    if (parts.leftUnpaid > 0.0005)
      items.push(
        <span key="unpaid">
          <PanelToken symbol="fxUSD" value={parts.leftUnpaid}>
            <Prov info={leftUnpaidProv()}>
              <AmountText value={parts.leftUnpaid} format="compact" />
            </Prov>
          </PanelToken>{" "}
          written off at this position&apos;s liquidation
        </span>,
      );
    if (parts.badDebt > 0.0005)
      items.push(
        <span key="bad">
          <PanelToken symbol="fxUSD" value={parts.badDebt}>
            <Prov info={badDebtAddedProv()}>
              +<AmountText value={parts.badDebt} format="compact" />
            </Prov>
          </PanelToken>{" "}
          of other positions&apos; bad debt
        </span>,
      );
    return [
      implied,
      moved(
        items.map((it, i) => (
          <span key={i}>
            {i > 0 ? (i === items.length - 1 ? " and " : ", ") : ""}
            {it}
          </span>
        )),
      ),
    ];
  }
  if (cleared != null && rows && cleared > 0) {
    // settled = implied − cleared + other  →  other = cleared − diff
    const other = cleared - diff;
    return [
      implied,
      moved(
        <>
          <PanelToken symbol="fxUSD" value={cleared}>
            <Prov info={rebalanceClearedProv(n)}>
              <AmountText value={cleared} format="compact" />
            </Prov>
          </PanelToken>{" "}
          cleared by {rowsNoun(rows)} ({dateSpan(rows.firstTs, rows.lastTs)})
          {Math.abs(other) > 0.005 ? (
            <>
              {" and "}
              <PanelToken symbol="fxUSD" value={Math.abs(other)}>
                <Prov info={otherDebtMovesProv()}>
                  {other > 0 ? "+" : "−"}
                  <AmountText value={Math.abs(other)} format="compact" />
                </Prov>
              </PanelToken>{" "}
              {other > 0
                ? "of other positions' bad debt"
                : v.everLiquidated
                  ? "left unpaid at liquidation and spread over other positions, net"
                  : "by other pool-wide changes"}
            </>
          ) : null}
        </>,
      ),
    ];
  }
  return [
    implied,
    moved(
      <>
        <PanelToken symbol="fxUSD" value={diff}>
          <Prov info={socializedDebtProv(diff >= 0 ? "cleared" : "accrued", v.settled.block)}>
            {diff >= 0 ? "" : "+"}
            <AmountText value={Math.abs(diff)} format="compact" />
          </Prov>
        </PanelToken>{" "}
        {diff >= 0 ? "cleared, net (the timeline names each part)" : "of other positions' bad debt"}
      </>,
    ),
  ];
}

/** Under the debt ratio: the anchor price it is read at, the min price the
 *  pool's lines are judged at (both read at the settled block), the lines, and
 *  the min price at which this position reaches each. Panel rows, in two
 *  groups: the prices the ratio is read at, then the tick and the lines. */
function ratioRows(
  v: FxPositionView,
  terms: FxPoolTerms | null,
  px: { anchor: number; min: number; block: number; tick?: number | null; ticksAbove?: number | null } | null,
): [PositionPanelRow[], PositionPanelRow[]] {
  const { colls, debts, debtRatio } = v.settled;
  if (colls == null || debts == null || debtRatio == null || colls <= 0 || debtRatio <= 0) return [[], []];
  const anchor = px?.anchor ?? debts / (colls * debtRatio);
  const sym = v.normalizedSymbol;
  const pctLine = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;
  const fall = (p: number, from: number) => `−${((1 - p / from) * 100).toFixed(1)}%`;
  const minRatio = px ? debts / (colls * px.min) : null;
  const prices: PositionPanelRow[] = [
    {
      id: "anchor-price",
      label: "Anchor price",
      value: (
        <>
          <Prov info={px ? oracleLegAtProv("anchor", sym, px.block) : anchorPriceProv(sym, v.settled.block)}>
            {formatCompactUsd(anchor)}
          </Prov>{" "}
          per {sym}
          {v.settled.block != null ? (
            <>
              {" "}
              · settled @ <BlockRef block={v.settled.block} />
            </>
          ) : null}
        </>
      ),
      tip: `The oracle's anchor price in USD per ${sym}, read at the settled block. The debt ratio divides by it, so the debt over the collateral's value at this price is the ratio.`,
    },
  ];
  if (px && minRatio != null)
    prices.push({
      id: "ratio-at-min",
      label: "Ratio at the min price",
      value: (
        <>
          <Prov info={minRatioProv(px.block)}>{(minRatio * 100).toFixed(1)}%</Prov> at{" "}
          <Prov info={oracleLegAtProv("min", sym, px.block)}>{formatCompactUsd(px.min)}</Prov>
        </>
      ),
      tip: "The debt ratio judged at the oracle's min price, the price the pool's lines are judged at. It sits at or above the ratio at the anchor price.",
    });

  const lines: PositionPanelRow[] = [];
  if (px?.tick != null) {
    lines.push({
      id: "tick",
      label: "Tick",
      value: (
        <>
          <Prov info={positionTickProv(sym, px.block)} value={String(px.tick)}>
            #{px.tick}
          </Prov>{" "}
          ·{" "}
          <Link
            href={`/ethereum/fx/pools?pool=${v.pool}&tick=${px.tick}#tick-${v.pool}-${px.tick}`}
            className="text-blue-500 hover:underline"
          >
            find it on the pools page
          </Link>
        </>
      ),
      tip: "The tick the position's debt sits in, read from the pool at the settled block. Ticks group positions by debt-to-collateral ratio; rebalances and redemptions work one tick at a time.",
    });
    if (terms) {
      lines.push({
        id: "redemption",
        label: "Redemption",
        value: terms.redeemAllowed ? "open now" : "closed now (opens only while fxUSD trades below its peg)",
        tip: "Whether the pool lets fxUSD be redeemed for collateral now. Redemption takes from the highest-ratio ticks first.",
      });
      if (px.ticksAbove != null)
        lines.push({
          id: "ticks-above",
          label: "Debt ticks above",
          value:
            px.ticksAbove === 0 ? (
              "none, this position's tick is the top one"
            ) : (
              <Prov info={ticksAboveProv(px.block)} value={String(px.ticksAbove)}>
                {px.ticksAbove}
              </Prov>
            ),
          tip: "How many debt ticks sit above this position's tick. A redemption starts at the top tick and walks down, so these come before it.",
        });
    }
  }
  if (terms) {
    lines.push(
      {
        id: "rebalance-line",
        label: "Rebalances from",
        value: <Prov info={poolLineProv("rebalance", terms.block)}>{pctLine(terms.rebalanceRatio)}</Prov>,
        tip: "The pool's rebalance line: from this debt ratio a keeper can rebalance the position's tick, read from the pool.",
      },
      {
        id: "liquidation-line",
        label: "Liquidates from",
        value: <Prov info={poolLineProv("liquidate", terms.block)}>{pctLine(terms.liquidateRatio)}</Prov>,
        tip: "The pool's liquidation line: from this debt ratio a keeper can liquidate the position, read from the pool.",
      },
    );
    const basis = px && minRatio != null ? "min" : "anchor";
    const reachTip = (what: string) =>
      `The ${basis} price at which this position's debt ratio reaches the ${what} line, with the fall from today's. It holds collateral and debt where they are now; funding keeps taking collateral, which raises this price slowly.`;
    if (px && minRatio != null) {
      if (minRatio >= terms.rebalanceRatio)
        lines.push({
          id: "rebalance-at",
          label: "Rebalances at",
          value: "at or past the rebalance line now",
          tip: reachTip("rebalance"),
        });
      else {
        const rb = debts / (colls * terms.rebalanceRatio);
        const lq = debts / (colls * terms.liquidateRatio);
        lines.push(
          {
            id: "rebalance-at",
            label: "Rebalances at",
            value: (
              <>
                <Prov info={minTriggerPriceProv(pctLine(terms.rebalanceRatio), sym)}>{formatCompactUsd(rb)}</Prov> min
                price ({fall(rb, px.min)})
              </>
            ),
            tip: reachTip("rebalance"),
          },
          {
            id: "liquidation-at",
            label: "Liquidates at",
            value: (
              <>
                <Prov info={minTriggerPriceProv(pctLine(terms.liquidateRatio), sym)}>{formatCompactUsd(lq)}</Prov> min
                price ({fall(lq, px.min)})
              </>
            ),
            tip: reachTip("liquidation"),
          },
        );
      }
    } else if (debtRatio >= terms.rebalanceRatio) {
      lines.push({
        id: "rebalance-at",
        label: "Rebalances at",
        value: "at or past the rebalance line now",
        tip: reachTip("rebalance"),
      });
    } else {
      const at = anchor * (debtRatio / terms.rebalanceRatio);
      lines.push({
        id: "rebalance-at",
        label: "Rebalances at",
        value: (
          <>
            <Prov info={triggerPriceProv(pctLine(terms.rebalanceRatio), sym)}>{formatCompactUsd(at)}</Prov> anchor price
            ({fall(at, anchor)})
          </>
        ),
        tip: reachTip("rebalance"),
      });
    }
  }
  return [prices, lines];
}

/** THE COLLATERAL-SIDE RECONCILIATION: funding is charged on collateral (the
 *  pool's collateral index), never on debt, so a funding-only position shows
 *  0 fxUSD socialized on the debt side and its whole funding bill HERE: the
 *  sum of the socialized lane's collateral drift over the position's quiet
 *  stretches (archive getPosition at each of its event boundaries; the
 *  last stretch ends at the same settled sweep the collateral figure comes
 *  from). Present once the intervals have arrived; while a long history is
 *  still being read, the row says how much of the life it covers. */
function collateralDriftRow(
  v: FxPositionView,
  drift: FxDriftResult,
  rows?: FxRebalanceRows,
  /** Funding the pool booked inside the position's own transactions
   *  (lib/fx/in-tx-funding.ts): with the drift between them it is the whole
   *  collateral gap. */
  inTx?: FxInTxFunding | null,
): PositionPanelRow | null {
  if (drift.intervals.length === 0) return null;
  const s = summariseFxDrift(drift);
  const taken = s.complete ? socializedTaken(rows) : null;
  const inside = s.complete && inTx && inTx.total > DUST ? inTx : null;
  const between = -s.collsDrift;
  const insideNote = inside ? (
    <>
      {" "}
      (
      <PanelToken symbol={v.normalizedSymbol} value={between}>
        <Prov info={lifetimeCollateralDriftProv(v.normalizedSymbol, s.intervals, s.complete, drift.headBlock)}>
          {formatCompact(Math.abs(between))}
        </Prov>
      </PanelToken>{" "}
      between the transactions and{" "}
      <PanelToken symbol={v.normalizedSymbol} value={inside.total}>
        <Prov info={lifetimeInTxFundingProv(v.normalizedSymbol, inTx?.reads ?? 0)}>
          {formatCompact(Math.abs(inside.total))}
        </Prov>
      </PanelToken>{" "}
      inside {inside.rows.length === 1 ? "one of them" : `${inside.rows.length} of them`})
    </>
  ) : null;
  const funding = taken ? between - taken.coll + (inside?.total ?? 0) : null;
  const row = (value: ReactNode): PositionPanelRow => ({
    id: "collateral-moved",
    label: "Collateral moved by the pool",
    value,
    tip: "Collateral the pool took or added with no transaction of this position's: funding, which it charges on collateral, and tick rebalances. Summed over the quiet stretches between the position's events, each read from the pool at its two ends.",
  });
  // Funding and the rows apart: the rows' blocks read one by one, funding the
  // remainder of the drift (never below zero; if it is, the row keeps the
  // two together).
  if (taken && rows && funding != null && funding >= -DUST && Math.abs(s.collsDrift) > DUST) {
    const n = rows.blocks.length;
    return row(
      <>
        {rowsNoun(rows)} took{" "}
        <PanelToken symbol={v.normalizedSymbol} value={Math.abs(taken.coll)}>
          <Prov info={socializedCollTakenProv(v.normalizedSymbol, n)}>
            <AmountText value={Math.abs(taken.coll)} format="compact" />
          </Prov>
        </PanelToken>{" "}
        and funding took{" "}
        <PanelToken symbol={v.normalizedSymbol} value={funding}>
          <Prov info={fundingTakenProv(v.normalizedSymbol)}>{formatCompact(Math.abs(funding))}</Prov>
        </PanelToken>
        {insideNote}
      </>,
    );
  }
  const scope = s.complete
    ? "without a transaction"
    : `over the latest ${s.intervals} stretch${s.intervals === 1 ? "" : "es"} read so far`;
  const prov = lifetimeCollateralDriftProv(v.normalizedSymbol, s.intervals, s.complete, drift.headBlock);
  if (Math.abs(s.collsDrift) <= DUST && !inside) {
    return row(
      <>
        <PanelToken symbol={v.normalizedSymbol} value={0}>
          <Prov info={prov}>{formatCompact(0)}</Prov>
        </PanelToken>{" "}
        of funding or rebalance movement {scope}
      </>,
    );
  }
  if (inside) {
    return row(
      <>
        funding and rebalances took{" "}
        <PanelToken symbol={v.normalizedSymbol} value={between + inside.total}>
          <Prov info={lifetimeCollateralMovedProv(v.normalizedSymbol, drift.headBlock)}>
            {formatCompact(Math.abs(between + inside.total))}
          </Prov>
        </PanelToken>
        {insideNote}
      </>,
    );
  }
  return row(
    <>
      funding and rebalances {s.collsDrift < 0 ? "took" : "added"}{" "}
      <PanelToken symbol={v.normalizedSymbol} value={Math.abs(s.collsDrift)}>
        <Prov info={prov}>
          <AmountText value={Math.abs(s.collsDrift)} format="compact" />
        </Prov>
      </PanelToken>{" "}
      {scope}
    </>,
  );
}

/** The settled collateral in USD. On the detail page it is valued at the
 *  anchor price of the settled block (read with the min leg beside it), so
 *  the debt divided by it is the debt ratio; the listing values it at the
 *  oracle's anchor leg at the block the pool's totals were swept at, and falls
 *  back to the sweep's stored min-price reading. */
export interface FxListingPrice {
  anchor: number;
  block: number;
}

function collateralUsd(
  v: FxPositionView,
  px: { anchor: number; block: number } | null,
  listing?: FxListingPrice | null,
): ReactNode | null {
  const cell = (usd: number, info: ReturnType<typeof anchorUsdProv>) => (
    <Prov info={info}>
      <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
    </Prov>
  );
  if (v.settled.colls == null) return null;
  if (px) return cell(v.settled.colls * px.anchor, anchorUsdProv(v.normalizedSymbol, px.block));
  if (listing) return cell(v.settled.colls * listing.anchor, anchorUsdProv(v.normalizedSymbol, listing.block));
  if (v.settled.collUsd == null || v.oracle.priceUsd == null) return null;
  return cell(v.settled.collUsd, fxPositionUsdProv(v.normalizedSymbol, v.oracle.priceBlock));
}

export interface FxPositionCardProps {
  v: FxPositionView;
  /** `detail` on the position page, `listing` inside a listing row. */
  surface: "detail" | "listing";
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: ReactNode;
  /** Copy-this-view control, forwarded to the shell: the page's
   *  `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The per-interval socialized drift (the position page's fetch): gives the
   *  panel its collateral reconciliation row. */
  drift?: FxDriftResult | null;
  /** The detail page's rebalance rows: the debt rows split what they
   *  cleared from the rest. */
  rebalanceRows?: FxRebalanceRows;
  /** Funding booked inside the position's own transactions. */
  inTxFunding?: FxInTxFunding | null;
  /** Lines at the foot of the card (the holder, the loans this NFT has
   *  carried). */
  bodyExtra?: ReactNode;
  /** The listing's price for this pool (FxListing). */
  listingPx?: FxListingPrice | null;
  /** The card ⋮'s export shapes (Copy Position, Markdown, CSV). */
  exports?: PositionCardExports | null;
}

export function useFxCardSlots({
  v,
  surface,
  explanation,
  viewHref,
  drift,
  rebalanceRows,
  inTxFunding,
  bodyExtra,
  listingPx,
  exports,
}: FxPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const poolMeta = FX_POOLS[v.pool];
  const terms = useFxPoolTerms(detail ? v.pool : null);
  // The oracle's anchor and min legs at the settled block (detail page only).
  const pxRead = useFxPricesAt(v.pool, v.positionId, detail && v.status === "open" ? v.settled.block : null, true);
  const px =
    pxRead?.anchorPrice != null && pxRead.minPrice != null && v.settled.block != null
      ? {
          anchor: Number(pxRead.anchorPrice) / 1e18,
          min: Number(pxRead.minPrice) / 1e18,
          block: v.settled.block,
          tick: pxRead.tick ?? null,
          ticksAbove: pxRead.ticksAbove ?? null,
        }
      : null;

  const closed = v.status === "closed";
  // Pre-sweep rows: the settled read has not landed, so the lifecycle is not
  // asserted either way.
  const status: PositionCardStatus | null = closed
    ? v.everLiquidated
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" }
    : v.status === "unknown"
      ? { word: "Unsettled", tone: "caution" }
      : null;

  // The detail page draws the owner on the wallet row above the card
  // (ui-jobs 228); the listing card keeps it.
  const poolLabel = (
    <span>
      {poolMeta.tokenSymbol} pool
      <span className="ml-2 font-normal tabular-nums text-rb-400">Position #{v.positionId}</span>
    </span>
  );
  const tag = detail ? undefined : <ListingTag market={poolMeta.tokenSymbol} id={v.positionId} />;
  // The listing keeps the owner on the left and the pool and position at the right end.
  const identity = detail ? (
    <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">{poolLabel}</span>
  ) : v.owner ? (
    <WalletPill wallet={v.owner} ensName={null} filterProtocol="fx" bookmarkProtocol="fx" />
  ) : (
    <span className="text-xs font-normal tabular-nums text-rb-400">{short(v.owner)}</span>
  );

  const counters = {
    lastActivityAt: v.activity.lastTs,
    // The summary's eventCount is operates + liquidations; the shared pill
    // claims "excludes liquidations", so the liquidations come off here —
    // the liquidations have a badge beside it.
    eventCount: v.activity.eventCount - v.liquidationCount,
    liquidationCount: v.liquidationCount,
    ...(detail ? { liquidationRule: FX_LIQUIDATION_RULE, order: "age-last" as const } : {}),
  };
  const common = { status, identity, counters };

  // Settled getPosition read: NORMALIZED units, labeled with the normalized
  // symbol (stETH-equivalent on the wstETH pool), never the deposit token's.
  const collateralValue =
    v.settled.colls != null ? (
      <Prov info={settledCollateralProv(v.normalizedSymbol, v.settled.block)}>
        <AssetAmount
          value={v.settled.colls}
          symbol={v.normalizedSymbol}
          exact={formatUnitsExact(v.settled.collsRaw, 18)}
        />
      </Prov>
    ) : null;
  const debtValue =
    v.settled.debts != null ? (
      <Prov info={settledDebtProv(v.settled.block)}>
        <AssetAmount value={v.settled.debts} symbol="fxUSD" exact={formatUnitsExact(v.settled.debtsRaw, 18)} />
      </Prov>
    ) : null;

  // The collateral and debt reconciliation rows, in panel order.
  const driftRow = detail && drift ? collateralDriftRow(v, drift, rebalanceRows, inTxFunding) : null;
  const debtRows = detail ? debtReconciliationRows(v, rebalanceRows) : [];

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  if (closed) {
    // Closed: the settled lane has emptied, so the heads carry the settled
    // zeros (there is no peak aggregate on the summary) and the reconciliation
    // rows sit in the closed card's panel: a closed position's
    // implied-vs-settled gap is the socialized burn / write-off story.
    heads = [
      {
        id: "final-collateral",
        label: CARD_VOCAB.finalCollateral,
        value: collateralValue,
      },
      {
        id: "final-debt",
        label: CARD_VOCAB.finalDebt,
        value: debtValue,
      },
    ];
    outcome = {
      word: v.everLiquidated ? "Liquidated" : "Closed",
      dates: v.activity.lastTs ? [{ at: v.activity.lastTs }] : undefined,
    };
  } else {
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value: collateralValue,
        usd: collateralUsd(v, px, listingPx),
      },
      // fxUSD is not pinned to a dollar, so the debt carries no USD line.
      { id: "debt", label: CARD_VOCAB.debt, value: debtValue },
      {
        id: "debt-ratio",
        label: "Debt ratio",
        labelTip:
          "The position's debt divided by its collateral's value at the oracle's anchor price, read from the pool in the same settled sweep.",
        // getPositionDebtRatio, 0–1 scaled to a percentage: the pool's own
        // risk figure.
        value:
          v.settled.debtRatio != null ? (
            <Prov info={settledDebtRatioProv(v.settled.block)}>{(v.settled.debtRatio * 100).toFixed(1)}%</Prov>
          ) : null,
      },
    ];
  }

  if (!detail) return { ...common, heads, surface: "listing", menu: null, tag, outcome };

  const detailCommon = {
    ...common,
    heads,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: closed
      ? fxPositionContent({ status: v.everLiquidated ? "liquidated" : "closed", pool: poolMeta.tokenSymbol, terms })
      : fxPositionContent({
          status: "open",
          pool: poolMeta.tokenSymbol,
          terms,
          colls: v.settled.colls,
          normalizedSymbol: v.normalizedSymbol,
        }),
    menu: {
      leading: () => (
        <FxMenuRows
          positionId={v.positionId}
          nftUrl={`https://opensea.io/item/ethereum/${poolMeta.address}/${v.positionId}`}
          pagePath={`/ethereum/fx/${fxPositionSlug(v.pool, v.positionId)}`}
        />
      ),
      exports: exports ?? null,
    },
    foot: bodyExtra ? (
      <div className="mt-3 border-t border-rb-300/40 pt-3 dark:border-rb-700/40">{bodyExtra}</div>
    ) : undefined,
  };
  if (outcome) return { ...detailCommon, outcome, panel: [[...(driftRow ? [driftRow] : []), ...debtRows], []] };

  const [prices, lines] = ratioRows(v, terms, px);
  return {
    ...detailCommon,
    outcome: undefined,
    panel: [[...(driftRow ? [driftRow] : []), ...debtRows, ...prices], lines],
  };
}

export function FxPositionCard(props: FxPositionCardProps) {
  return <PositionCard slots={useFxCardSlots(props)} />;
}

/** Build a card view from the listing summary row (identity: the summary
 *  already carries the settled + implied lanes the card asserts). */
export function viewFromSummary(s: FxPositionSummary): FxPositionView {
  return s;
}
