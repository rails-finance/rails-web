"use client";

// SparkLend event detail — adapter onto the shared ChainTruthDetail grid, at
// V3 parity. The touched reserve's resulting on-chain balance after this event,
// replayed from the per-reserve deltas, with the before→after transition traced
// through the log's raw uint256 (origin envelope) — plus the pooled-account
// basket: every reserve's running balance after this event, since a SparkLend
// wallet supplies/borrows many reserves and one axis alone understates the
// account. A liquidation shows both sides (collateral seized + debt cleared).
// USD rides the captured oracle-at-block prices (mig 092 — SparkLend's own
// IAaveOracle read at the EVENT's block, never today's price): the
// after-balance USD chip on each priced stat, and the at-block price footnote
// pill under the grid. A block the price walk hasn't reached keeps the card
// token-only. Where the index valued the row (decision 0033) the balances are
// the chain's, interest included, with the interest since the lane's previous
// move under the value.
//
// RULE (rails-ops TO-DO-ui-jobs §47, §213): once the account read lands, the
// account block's Collateral and Debt cells state every reserve, and the grid
// gives way for the event's own reserve; the basket gives way to those cells,
// the interest line runs from the two reads, and the price chip lists every
// price the USD figures use. While the read is pending or where it failed, the
// grid, the basket and the captured price stand.

import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import type { SparkContext, SparkSnapshotItem } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  supplyAfterProv,
  debtAfterProv,
  assetsDeltaProv,
  transferDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  supplyBeforeProv,
  debtBeforeProv,
  atBlockPriceProv,
  snapshotUsdProv,
  liqLegUsdProv,
  liqPremiumProv,
  rowChainBalanceProv,
  rowInterestProv,
  type SparkCoords,
} from "@/lib/spark/event-provenance";
import {
  LiquidationForensics,
  buildLiquidationForensics,
  AtBlockPriceFootnote,
  type AtBlockPricePill,
} from "@/components/shared/liquidation-forensics";
import { formatNumber } from "@/lib/utils/format";
import type { V3Coords } from "@/lib/aave-v3/event-provenance";
import { SPARK_POOL_IDENTITY } from "@/lib/spark/pool-identity";
import { SparkAccountState } from "./spark-account-state";
import { StatSubline } from "@/components/shared/state-transition";
import { AmountText } from "@/components/shared/amount-text";
import {
  StateInterestLine,
  statePricePills,
  type TouchedLeg,
} from "@/components/protocol/aave-v3/aave-v3-position-state";
import { findReserve, legHeld } from "@/lib/aave-v3/position-state";
import { useSparkEventState } from "./use-spark-event-state";

export interface SparkEventDetailProps {
  ctx: SparkContext;
  txHash?: string;
  blockNumber?: number;
  /** With `market`, the grid adds the account before → after, read at blocks
   *  N−1 and N (SparkAccountState). */
  wallet?: string;
  market?: "spark";
  reserveAddress?: string;
  previous?: { blockNumber: number; txHash: string };
}

/** Interest below this reads as "<0.000001" and says nothing; the line is left
 *  out under it (a supplied wstETH balance earns about 1e-14 a block). */
const INTEREST_FLOOR = 0.000001;

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** A row whose balance before is exactly zero opens the lane: "before" reads
 *  0, not the after − change float residue (0xf00a…c853's first supply read
 *  0.00000000000000022 wstETH; the spToken's balanceOf at the block before is
 *  0). */
const opensLane = (before: string | undefined): boolean => before != null && before !== "" && Number(before) === 0;

/** The after-balance USD chip payload — after × the reserve's captured
 *  at-block oracle price (spark_historic_prices, mig 092: SparkLend's own
 *  IAaveOracle read at the EVENT's block, never today's price). Undefined
 *  until the price walk reaches the block (token-only render — partial fill
 *  is a safe state) and for a zeroed balance (a $0 chip would restate the 0
 *  beside it). */
function usdOf(
  after: string | undefined,
  price: { usd: number } | undefined,
  prov: (amount: string, priceUsd: number) => Provenance,
): { value: number; prov: Provenance } | undefined {
  if (!price || after == null) return undefined;
  const n = Number(after);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return { value: n * price.usd, prov: prov(after, price.usd) };
}

/** The pooled-account basket after this event — one line per reserve with a
 *  running balance, each traced to its own replay. Rendered only when the
 *  account spans more than the touched reserve (otherwise the stat grid above
 *  already says everything). */
function BasketList({
  label,
  items,
  coords,
  side,
}: {
  label: string;
  items: SparkSnapshotItem[];
  coords: SparkCoords;
  side: "supply" | "debt";
}) {
  if (items.length === 0) return null;
  const provOf = side === "supply" ? supplyAfterProv : debtAfterProv;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-rb-500">{label}</div>
      <div className="mt-1 space-y-0.5 text-xs tabular-nums">
        {items.map((it) => (
          <div key={it.address ?? it.symbol} className="flex items-baseline justify-between gap-3">
            {it.decimalsUnread ? (
              <TokenAmountNotLoaded address={it.address} label={it.symbol} />
            ) : (
              <>
                <span className="text-rb-500">{it.symbol}</span>
                <Prov info={provOf(it.symbol, coords)}>
                  <span className="text-foreground/80">{fmt(it.amount)}</span>
                </Prov>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SparkEventDetail({
  ctx,
  txHash,
  blockNumber,
  wallet,
  market,
  reserveAddress,
  previous,
}: SparkEventDetailProps) {
  const coords: SparkCoords = { txHash, blockNumber };
  const read = useSparkEventState({ ctx, wallet, market, blockNumber, txHash, reserveAddress, previous });
  const v3Coords: V3Coords = { txHash, blockNumber, wallet, stateRead: "chain-at-block", pool: SPARK_POOL_IDENTITY };
  const stats: ChainTruthStat[] = [];
  // Once the account read lands, its Collateral and Debt cells state every
  // reserve with its exact before → after; the grid gives way for the event's
  // own reserve so the balance is stated once (rails-ops TO-DO-ui-jobs §47,
  // §213). While the read is pending, or where it failed, the grid states it.
  const ready = read.status === "ready" && read.state && read.raw ? read.raw : undefined;
  const touched: TouchedLeg[] = [];
  // The interest a given-way stat carried (since its balance last moved),
  // drawn under the grid where the previous read is not in hand.
  const laneLines: (NonNullable<ChainTruthStat["interestSincePrevious"]> & {
    symbol: string;
    side: "supply" | "debt";
  })[] = [];
  const push = (s: ChainTruthStat, reserve: string | undefined, symbol: string, side: "supply" | "debt") => {
    const r = ready ? findReserve(ready, reserve, symbol) : undefined;
    if (r && r.decimals != null && legHeld(side === "supply" ? r.supply : r.debt)) {
      touched.push({ reserve: r.reserve, side });
      if (s.interestSincePrevious) laneLines.push({ ...s.interestSincePrevious, symbol, side });
      return;
    }
    stats.push(s);
  };
  // A row the index valued at the chain balance (decision 0033) carries its
  // own receipts and the interest since the lane's previous move.
  const chain = ctx.balanceBasis === "chain";
  const afterProv = (sym: string, side: "supply" | "debt"): Provenance =>
    chain
      ? rowChainBalanceProv(sym, side, "after", coords, {
          raw: side === "supply" ? ctx.raw?.supplyAfter : ctx.raw?.debtAfter,
          scaled: side === "supply" ? ctx.raw?.supplyScaledAfter : ctx.raw?.debtScaledAfter,
          index: side === "supply" ? ctx.raw?.supplyIndex : ctx.raw?.debtIndex,
        })
      : side === "supply"
        ? supplyAfterProv(sym, coords, ctx.raw?.supplyAfter)
        : debtAfterProv(sym, coords, ctx.raw?.debtAfter);
  const beforeProv = (sym: string, side: "supply" | "debt"): Provenance =>
    chain
      ? rowChainBalanceProv(sym, side, "before", coords, {
          raw: side === "supply" ? ctx.raw?.supplyBefore : ctx.raw?.debtBefore,
          index: side === "supply" ? ctx.raw?.supplyIndex : ctx.raw?.debtIndex,
        })
      : side === "supply"
        ? supplyBeforeProv(sym, coords)
        : debtBeforeProv(sym, coords);
  const interestOf = (sym: string, side: "supply" | "debt"): ChainTruthStat["interestSincePrevious"] => {
    const v = side === "supply" ? ctx.supplyInterestSincePrevious : ctx.debtInterestSincePrevious;
    return v && Math.abs(Number(v)) >= INTEREST_FLOOR
      ? { value: v, prov: rowInterestProv(sym, side, coords) }
      : undefined;
  };

  if (ctx.eventType === "liquidation") {
    const collSym = ctx.collateralSymbol ?? "—";
    push(
      {
        label: "Collateral",
        value: fmt(ctx.supplyAfter),
        symbol: collSym,
        prov: afterProv(collSym, "supply"),
        usd: usdOf(ctx.supplyAfter, ctx.collateralPrice, (a, p) =>
          snapshotUsdProv(collSym, "supply", coords, { amount: a, priceUsd: p }),
        ),
        // `assetsDelta` on a liquidation is the seized collateral (negative).
        transition: reconstructTransition({
          after: ctx.supplyAfter,
          change: ctx.assetsDelta,
          changeProv: seizedCollateralProv(
            collSym,
            coords,
            ctx.raw?.liquidatedCollateralAmount,
            ctx.origin?.liquidatedCollateralAmount,
          ),
          beforeProv: beforeProv(collSym, "supply"),
        }),
        interestSincePrevious: interestOf(collSym, "supply"),
      },
      ctx.collateralAsset,
      collSym,
      "supply",
    );
    push(
      {
        label: "Borrowed",
        value: fmt(ctx.debtAfter),
        symbol: ctx.reserveSymbol,
        prov: afterProv(ctx.reserveSymbol, "debt"),
        usd: usdOf(ctx.debtAfter, ctx.debtPrice, (a, p) =>
          snapshotUsdProv(ctx.reserveSymbol, "debt", coords, { amount: a, priceUsd: p }),
        ),
        // `debtDelta` is the debt the liquidator repaid (negative).
        transition: reconstructTransition({
          after: ctx.debtAfter,
          change: ctx.debtDelta,
          changeProv: debtRepaidProv(ctx.reserveSymbol, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover),
          beforeProv: beforeProv(ctx.reserveSymbol, "debt"),
        }),
        interestSincePrevious: interestOf(ctx.reserveSymbol, "debt"),
      },
      reserveAddress,
      ctx.reserveSymbol,
      "debt",
    );
  } else if (ctx.side === "supply") {
    // A transfer's change traces to the BalanceTransfer derivation (value ×
    // index), not a Pool log's own amount param — same reconstruction, its
    // own vocabulary entry.
    const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
    push(
      {
        label: "Supplied",
        value: fmt(ctx.supplyAfter),
        symbol: ctx.reserveSymbol,
        prov: afterProv(ctx.reserveSymbol, "supply"),
        usd: usdOf(ctx.supplyAfter, ctx.price, (a, p) =>
          snapshotUsdProv(ctx.reserveSymbol, "supply", coords, { amount: a, priceUsd: p }),
        ),
        transition: reconstructTransition({
          after: ctx.supplyAfter,
          change: ctx.assetsDelta,
          changeProv: isTransfer
            ? transferDeltaProv(ctx.reserveSymbol, ctx.eventType === "transfer_in" ? "in" : "out", coords)
            : assetsDeltaProv(ctx.reserveSymbol, "supply", coords, ctx.raw?.amount, ctx.origin?.amount),
          beforeProv: beforeProv(ctx.reserveSymbol, "supply"),
          opening: opensLane(ctx.supplyBefore),
        }),
        interestSincePrevious: interestOf(ctx.reserveSymbol, "supply"),
      },
      reserveAddress,
      ctx.reserveSymbol,
      "supply",
    );
  } else {
    push(
      {
        label: "Borrowed",
        value: fmt(ctx.debtAfter),
        symbol: ctx.reserveSymbol,
        prov: afterProv(ctx.reserveSymbol, "debt"),
        usd: usdOf(ctx.debtAfter, ctx.price, (a, p) =>
          snapshotUsdProv(ctx.reserveSymbol, "debt", coords, { amount: a, priceUsd: p }),
        ),
        transition: reconstructTransition({
          after: ctx.debtAfter,
          change: ctx.assetsDelta,
          changeProv: assetsDeltaProv(ctx.reserveSymbol, "debt", coords, ctx.raw?.amount, ctx.origin?.amount),
          beforeProv: beforeProv(ctx.reserveSymbol, "debt"),
          opening: opensLane(ctx.debtBefore),
        }),
        interestSincePrevious: interestOf(ctx.reserveSymbol, "debt"),
      },
      reserveAddress,
      ctx.reserveSymbol,
      "debt",
    );
  }

  // Basket only when the account spans more reserves than the stat grid shows —
  // the multi-reserve composition is the added information.
  const supplies = ctx.allSupplies ?? [];
  const debts = ctx.allDebts ?? [];
  const showBasket = !ready && supplies.length + debts.length > 1;

  // Liquidations gain the valued two-leg forensics beneath the snapshot grid,
  // once the oracle-price walk has priced both legs at this block.
  const forensics =
    ctx.eventType === "liquidation"
      ? buildLiquidationForensics(ctx, coords, { atBlockPriceProv, liqLegUsdProv, liqPremiumProv })
      : undefined;

  // Ordinary events gain the at-block price footnote pill for the touched
  // reserve — the read the USD chip above derives from. Liquidations carry
  // their two pills inside the forensics block instead.
  const ctxPills: AtBlockPricePill[] =
    ctx.eventType !== "liquidation" && ctx.price
      ? [
          {
            symbol: ctx.reserveSymbol,
            priceUsd: ctx.price.usd,
            priceProv: atBlockPriceProv(ctx.reserveSymbol, coords, ctx.price.usd),
          },
        ]
      : [];
  // Once the account read has priced the account, the chip lists every price
  // the card's USD figures use.
  const readPills = ready?.sources.market ? statePricePills(ready, v3Coords, touched) : [];
  const pricePills = readPills.length > 0 ? readPills : ctxPills;

  return (
    <div>
      {stats.length > 0 && <ChainTruthDetail stats={stats} />}
      {read.status === "ready" && read.state && read.raw ? (
        <SparkAccountState
          state={read.state}
          raw={read.raw}
          coords={v3Coords}
          isLiquidation={ctx.eventType === "liquidation"}
          touched={touched}
        />
      ) : read.status === "loading" ? (
        <div className="px-5 pb-2 text-xs text-rb-500" data-spark-account-state="loading">
          Reading the account before and after this transaction…
        </div>
      ) : read.status === "unavailable" && !read.lasting ? (
        <div className="px-5 pb-2 text-xs text-rb-500" data-spark-account-state="unread">
          The account before and after this transaction was not read. Reload to try again.
        </div>
      ) : null}
      {ready && read.prevRaw && (
        <div className="px-5 pb-1">
          <StateInterestLine here={ready} prev={read.prevRaw} coords={v3Coords} />
        </div>
      )}
      {ready &&
        !read.prevRaw &&
        laneLines.map((l) => (
          <div key={`${l.side}:${l.symbol}`} className="px-5 pb-1">
            <StatSubline>
              {l.side === "debt" ? "Interest on the debt" : "Supply interest"} since this balance last moved:{" "}
              <Prov info={l.prov} value={l.value} symbol={l.symbol}>
                <span title={l.value}>
                  <AmountText value={Number(l.value)} />
                </span>
              </Prov>{" "}
              {l.symbol}
            </StatSubline>
          </div>
        ))}
      {ready && previous && read.prevUnread && (
        <div className="px-5 pb-1">
          <StatSubline>
            Supply interest on the collateral is left out: the position after the previous event was not read.
          </StatSubline>
        </div>
      )}
      {forensics && (
        <LiquidationForensics
          {...forensics}
          seizedLabel="Seized, to the liquidator"
          clearedLabel="Debt repaid by the liquidator"
          premiumLabel="Liquidator's premium over the debt"
        />
      )}
      {pricePills.length > 0 && (
        <div className="px-5 pb-2">
          <AtBlockPriceFootnote pills={pricePills} />
        </div>
      )}
      {showBasket && (
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-rb-200/60 pt-3 dark:border-rb-500/20">
          <BasketList label="All supplied · after" items={supplies} coords={coords} side="supply" />
          <BasketList label="All borrowed · after" items={debts} coords={coords} side="debt" />
        </div>
      )}
    </div>
  );
}
