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
// token-only. Current debt WITH interest (needs the reserve index) is a layer.

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
  type SparkCoords,
} from "@/lib/spark/event-provenance";
import {
  LiquidationForensics,
  buildLiquidationForensics,
  AtBlockPriceFootnote,
  type AtBlockPricePill,
} from "@/components/shared/liquidation-forensics";
import { formatNumber } from "@/lib/utils/format";

export interface SparkEventDetailProps {
  ctx: SparkContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

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
            <span className="text-rb-500">{it.symbol}</span>
            <Prov info={provOf(it.symbol, coords)}>
              <span className="text-foreground/80">{fmt(it.amount)}</span>
            </Prov>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SparkEventDetail({ ctx, txHash, blockNumber }: SparkEventDetailProps) {
  const coords: SparkCoords = { txHash, blockNumber };
  const stats: ChainTruthStat[] = [];

  if (ctx.eventType === "liquidation") {
    const collSym = ctx.collateralSymbol ?? "—";
    stats.push({
      label: "Collateral",
      value: fmt(ctx.supplyAfter),
      symbol: collSym,
      prov: supplyAfterProv(collSym, coords, ctx.raw?.supplyAfter),
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
        beforeProv: supplyBeforeProv(collSym, coords),
      }),
    });
    stats.push({
      label: "Borrowed",
      value: fmt(ctx.debtAfter),
      symbol: ctx.reserveSymbol,
      prov: debtAfterProv(ctx.reserveSymbol, coords, ctx.raw?.debtAfter),
      usd: usdOf(ctx.debtAfter, ctx.debtPrice, (a, p) =>
        snapshotUsdProv(ctx.reserveSymbol, "debt", coords, { amount: a, priceUsd: p }),
      ),
      // `debtDelta` is the debt the liquidator repaid (negative).
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.debtDelta,
        changeProv: debtRepaidProv(ctx.reserveSymbol, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover),
        beforeProv: debtBeforeProv(ctx.reserveSymbol, coords),
      }),
    });
  } else if (ctx.side === "supply") {
    // A transfer's change traces to the BalanceTransfer derivation (value ×
    // index), not a Pool log's own amount param — same reconstruction, its
    // own vocabulary entry.
    const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
    stats.push({
      label: "Supplied",
      value: fmt(ctx.supplyAfter),
      symbol: ctx.reserveSymbol,
      prov: supplyAfterProv(ctx.reserveSymbol, coords, ctx.raw?.supplyAfter),
      usd: usdOf(ctx.supplyAfter, ctx.price, (a, p) =>
        snapshotUsdProv(ctx.reserveSymbol, "supply", coords, { amount: a, priceUsd: p }),
      ),
      transition: reconstructTransition({
        after: ctx.supplyAfter,
        change: ctx.assetsDelta,
        changeProv: isTransfer
          ? transferDeltaProv(ctx.reserveSymbol, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : assetsDeltaProv(ctx.reserveSymbol, "supply", coords, ctx.raw?.amount, ctx.origin?.amount),
        beforeProv: supplyBeforeProv(ctx.reserveSymbol, coords),
      }),
    });
  } else {
    stats.push({
      label: "Borrowed",
      value: fmt(ctx.debtAfter),
      symbol: ctx.reserveSymbol,
      prov: debtAfterProv(ctx.reserveSymbol, coords, ctx.raw?.debtAfter),
      usd: usdOf(ctx.debtAfter, ctx.price, (a, p) =>
        snapshotUsdProv(ctx.reserveSymbol, "debt", coords, { amount: a, priceUsd: p }),
      ),
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.assetsDelta,
        changeProv: assetsDeltaProv(ctx.reserveSymbol, "debt", coords, ctx.raw?.amount, ctx.origin?.amount),
        beforeProv: debtBeforeProv(ctx.reserveSymbol, coords),
      }),
    });
  }

  // Basket only when the account spans more reserves than the stat grid shows —
  // the multi-reserve composition is the added information.
  const supplies = ctx.allSupplies ?? [];
  const debts = ctx.allDebts ?? [];
  const showBasket = supplies.length + debts.length > 1;

  // Liquidations gain the valued two-leg forensics beneath the snapshot grid,
  // once the oracle-price walk has priced both legs at this block.
  const forensics =
    ctx.eventType === "liquidation"
      ? buildLiquidationForensics(ctx, coords, { atBlockPriceProv, liqLegUsdProv, liqPremiumProv })
      : undefined;

  // Ordinary events gain the at-block price footnote pill for the touched
  // reserve — the read the USD chip above derives from. Liquidations carry
  // their two pills inside the forensics block instead.
  const pricePills: AtBlockPricePill[] =
    ctx.eventType !== "liquidation" && ctx.price
      ? [
          {
            symbol: ctx.reserveSymbol,
            priceUsd: ctx.price.usd,
            priceProv: atBlockPriceProv(ctx.reserveSymbol, coords, ctx.price.usd),
          },
        ]
      : [];

  return (
    <div>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
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
