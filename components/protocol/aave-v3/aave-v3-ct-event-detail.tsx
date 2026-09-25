"use client";

// Aave V3 event detail (ON-CHAIN VALUES tier) — adapter onto the shared
// ChainTruthDetail grid. Each stat is a balance the event moved: a liquidation
// shows both sides (collateral seized + debt cleared), a swap both legs.
//
// Two lanes, decided by whether the card carries its market:
//   • Ethereum (Core / Prime / EtherFi) reads the position state around the
//     event's transaction when the card opens (rails-ops TO-DO-ui-jobs §19): the
//     touched balance's exact before → after, interest included, and the whole
//     account beneath the grid (AaveV3PositionStateBlock). While that is read,
//     and where it cannot be, a stat shows the event's own change and no balance.
//     RULE (§47): one statement of a balance. Once the read lands and the block
//     draws the reserve's row, the grid's cell for it gives way — the row carries
//     the same before/after/change receipts plus the collateral switch, and the
//     event's own change keeps its receipt on the header.
//   • Base and Seamless keep the principal replayed from the per-reserve deltas,
//     before → after.
// USD rides the oracle price at the event's block — the at-block read on the
// Ethereum lane, the captured price (mig 092) on the principal lane — and the
// captured price's footnote pill sits under the grid. A block with no price
// keeps the card token-only.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { AaveV3SwapLegAction, AaveV3SwapPoolEvent } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import {
  ChainTruthDetail,
  chainTruthDeltaValue,
  reconstructTransition,
  type ChainTruthStat,
} from "@/components/shared/chain-truth-event";
import {
  supplyAfterProv,
  debtAfterProv,
  assetsDeltaProv,
  transferDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  writtenOffDebtProv,
  supplyBeforeProv,
  debtBeforeProv,
  atBlockPriceProv,
  snapshotUsdProv,
  swapLegNet,
  swapLegProv,
  swapLegSign,
  liqLegUsdProv,
  liqPremiumProv,
  liqBonusRefProv,
  exactBalanceProv,
  exactBalanceChangeProv,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import {
  LiquidationForensics,
  buildLiquidationForensics,
  AtBlockPriceFootnote,
  type AtBlockPricePill,
} from "@/components/shared/liquidation-forensics";
import { signedAmount } from "./aave-v3-ct-event-header";
import { AaveV3PositionStateBlock, exactLeg, exactUsd, reserveSymbol } from "./aave-v3-position-state";
import { formatCompact, formatNumber } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import { findReserve, groupExact, humanOf, legChange, legHeld } from "@/lib/aave-v3/position-state";

export interface AaveV3CtEventDetailProps {
  ctx: AaveV3Context;
  txHash?: string;
  blockNumber?: number;
  /** The position's owner. */
  wallet?: string;
  /** The served market key. Set on Ethereum only; its presence selects the
   *  position-state lane (see AaveV3CtEventCard). */
  market?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** A row behind a ParaSwap swap card, by the index action it was. */
const SWAP_ROW_LABEL: Record<AaveV3SwapPoolEvent["action"], string> = {
  transfer_out: "Sent",
  supply: "Supply",
  borrow: "Borrow",
  repay: "Repay",
};

/** The after-balance USD chip payload — after × the reserve's captured
 *  at-block oracle price. Undefined until the price walk reaches the block
 *  (token-only render — partial fill is a safe state) and for a zeroed
 *  balance (a $0 chip would restate the 0 beside it). */
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

/** One balance a stat reads. */
interface Axis {
  label: string;
  symbol: string;
  /** The reserve's address, where the context carries it. */
  reserve?: string;
  side: "supply" | "debt";
  /** The event's own signed change on this axis, in token units. */
  change: string | null;
  changeProv: Provenance;
  /** The principal lane: the replayed after-balance, its raw sum, and the
   *  captured at-block price. */
  principalAfter?: string;
  principalRawAfter?: string;
  price?: { usd: number };
}

export function AaveV3CtEventDetail({ ctx, txHash, blockNumber, wallet, market }: AaveV3CtEventDetailProps) {
  const coords: V3Coords = {
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  const state = useAaveV3PositionState({ wallet, market, block: blockNumber, txHash });
  const ready = state?.status === "ready" ? state.data : undefined;
  // The position-state receipts also name the owner.
  const stateCoords: V3Coords = wallet ? { ...coords, wallet: wallet.toLowerCase() } : coords;

  /** The axis' stat, or null where the position block below states the balance. */
  const statFor = (a: Axis): ChainTruthStat | null => {
    if (!state) {
      return {
        label: a.label,
        value: fmt(a.principalAfter),
        symbol: a.symbol,
        prov:
          a.side === "supply"
            ? supplyAfterProv(a.symbol, coords, a.principalRawAfter)
            : debtAfterProv(a.symbol, coords, a.principalRawAfter),
        usd: usdOf(a.principalAfter, a.price, (amount, priceUsd) =>
          snapshotUsdProv(a.symbol, a.side, coords, { amount, priceUsd }),
        ),
        transition: reconstructTransition({
          after: a.principalAfter,
          change: a.change,
          changeProv: a.changeProv,
          beforeProv: a.side === "supply" ? supplyBeforeProv(a.symbol, coords) : debtBeforeProv(a.symbol, coords),
        }),
      };
    }
    const r = ready ? findReserve(ready, a.reserve, a.symbol) : undefined;
    if (!ready || !r || r.decimals == null) {
      // Loading, unavailable, or a reserve the answer does not list: the event's
      // own change, the same figure and receipt the header carries.
      const n = Number(a.change ?? "0");
      return {
        label: a.label,
        value: chainTruthDeltaValue(n, false),
        display: `${n < 0 ? "−" : "+"}${formatCompact(Math.abs(n))}`,
        symbol: a.symbol,
        address: a.reserve,
        prov: a.changeProv,
      };
    }
    const sym = reserveSymbol(r);
    const leg = a.side === "supply" ? r.supply : r.debt;
    // The block below draws a row for every reserve it holds on this side
    // (ReserveList's filter). Where it draws this one, that row is the balance's
    // one statement and the grid says nothing about it.
    if (legHeld(leg)) return null;
    const before = humanOf(leg.before, r.decimals);
    const after = humanOf(leg.after, r.decimals);
    const moved = legChange(leg, r.decimals);
    const sign = moved.sign < 0 ? "−" : "+";
    return {
      label: a.label,
      value: groupExact(after),
      symbol: a.symbol,
      address: r.reserve,
      prov: exactBalanceProv(
        sym,
        a.side,
        "after",
        stateCoords,
        exactLeg(leg, "after", r.decimals, ready.blockTimestamp),
      ),
      usd: exactUsd(ready, r, a.side, "after", stateCoords),
      transition:
        moved.sign === 0
          ? undefined
          : {
              before: formatCompact(Number(before)),
              beforeExact: groupExact(before),
              beforeProv: exactBalanceProv(
                sym,
                a.side,
                "before",
                stateCoords,
                exactLeg(leg, "before", r.decimals, ready.blockTimestamp),
              ),
              change: `${sign}${formatCompact(Number(moved.magnitude))}`,
              changeExact: `${sign}${groupExact(moved.magnitude)}`,
              changeProv: exactBalanceChangeProv(sym, a.side, stateCoords, {
                before: groupExact(before),
                after: groupExact(after),
              }),
            },
    };
  };

  const stats: ChainTruthStat[] = [];
  const push = (s: ChainTruthStat | null) => {
    if (s) stats.push(s);
  };
  const sym = ctx.reserveSymbol ?? "—";

  if (ctx.eventType === "liquidation") {
    const collSym = ctx.collateralSymbol ?? "—";
    // Seized collateral reduces the supply balance (change negative).
    push(
      statFor({
        label: "Collateral",
        symbol: collSym,
        reserve: ctx.collateralAsset,
        side: "supply",
        change: ctx.liquidatedCollateralAmount != null ? String(-Number(ctx.liquidatedCollateralAmount)) : null,
        changeProv: seizedCollateralProv(
          collSym,
          coords,
          ctx.raw?.liquidatedCollateralAmount,
          ctx.origin?.liquidatedCollateralAmount,
        ),
        principalAfter: ctx.supplyAfter,
        principalRawAfter: ctx.raw?.supplyAfter,
        price: ctx.collateralPrice,
      }),
    );
    // Debt covered reduces the borrowed balance (change negative).
    push(
      statFor({
        label: "Borrowed",
        symbol: sym,
        reserve: ctx.reserve,
        side: "debt",
        change: ctx.debtToCover != null ? String(-Number(ctx.debtToCover)) : null,
        changeProv: debtRepaidProv(sym, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover),
        principalAfter: ctx.debtAfter,
        principalRawAfter: ctx.raw?.debtAfter,
        price: ctx.debtPrice,
      }),
    );
  } else if (ctx.eventType === "swap" && ctx.swap) {
    // Both reserves the swap moved, given then received, each on its own axis
    // (an aToken leg the supplied balance, a repay or borrow the debt).
    const s = ctx.swap;
    const legStat = (
      symbol: string,
      reserve: string | undefined,
      action: AaveV3SwapLegAction,
      after: string | undefined,
      rawAfter: string | undefined,
      amount: string | undefined,
      price: { usd: number } | undefined,
      changeProv: Provenance,
    ): ChainTruthStat | null => {
      const debt = action === "repay" || action === "borrow";
      return statFor({
        label: debt ? "Borrowed" : "Supplied",
        symbol,
        reserve,
        side: debt ? "debt" : "supply",
        change: String(swapLegSign(action) * Math.abs(Number(amount ?? "0"))),
        changeProv,
        principalAfter: after,
        principalRawAfter: rawAfter,
        price,
      });
    };
    const givenDebt = s.givenAction === "repay";
    const given = legStat(
      sym,
      ctx.reserve,
      s.givenAction,
      givenDebt ? ctx.debtAfter : ctx.supplyAfter,
      givenDebt ? ctx.raw?.debtAfter : ctx.raw?.supplyAfter,
      ctx.amount,
      ctx.price,
      swapLegProv(sym, s.givenAction, coords, ctx.raw?.amount, ctx.origin?.amount, s.kind, swapLegNet(s, "given"), s),
    );
    const rSym = s.receivedSymbol ?? "—";
    const receivedDebt = s.receivedAction === "repay" || s.receivedAction === "borrow";
    const received: ChainTruthStat | null =
      // A withdraw and swap's bought token left the position: its figure is the
      // Trade's (or a ParaSwap adapter's Swapped log), with no balance to move.
      s.receivedAction === "trade"
        ? {
            label: s.kind === "supply_from_swap" ? "Sold" : "Bought",
            value: fmt(s.receivedAmount),
            symbol: rSym,
            address: s.receivedAsset,
            prov: swapLegProv(rSym, "trade", coords, s.raw.receivedAmount, undefined, s.kind, undefined, s),
          }
        : legStat(
            rSym,
            s.receivedAsset,
            s.receivedAction,
            receivedDebt ? s.receivedDebtAfter : s.receivedSupplyAfter,
            receivedDebt ? s.raw.receivedDebtAfter : s.raw.receivedSupplyAfter,
            s.receivedAmount,
            s.receivedPrice,
            swapLegProv(
              rSym,
              s.receivedAction,
              coords,
              s.raw.receivedAmount,
              s.receivedOrigin,
              undefined,
              swapLegNet(s, "received"),
            ),
          );
    // A supply from a swap lists what it sold before the balance it supplied (D2).
    for (const leg of s.kind === "supply_from_swap" ? [received, given] : [given, received]) push(leg);
    // Where a leftover nets into a leg (§15 D4), every row behind the figures
    // above is listed with its own amount.
    for (const e of s.events ?? []) {
      const eSym = e.symbol ?? "—";
      stats.push({
        label: e.leftover ? (e.action === "repay" ? "Repaid back" : "Supplied back") : SWAP_ROW_LABEL[e.action],
        value: fmt(e.amount),
        symbol: eSym,
        address: e.asset,
        prov:
          e.action === "transfer_out"
            ? transferDeltaProv(eSym, "out", coords)
            : assetsDeltaProv(eSym, e.action === "supply" ? "supply" : "debt", coords, e.raw, e.origin),
      });
    }
  } else if (
    ctx.eventType === "supply" ||
    ctx.eventType === "withdraw" ||
    ctx.eventType === "transfer_in" ||
    ctx.eventType === "transfer_out"
  ) {
    // A transfer's change traces to the BalanceTransfer derivation (value ×
    // index), not a Pool log's own amount param — same reconstruction, its
    // own vocabulary entry.
    const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
    push(
      statFor({
        label: "Supplied",
        symbol: sym,
        reserve: ctx.reserve,
        side: "supply",
        change: String(signedAmount(ctx)),
        changeProv: isTransfer
          ? transferDeltaProv(sym, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : assetsDeltaProv(sym, "supply", coords, ctx.raw?.amount, ctx.origin?.amount),
        principalAfter: ctx.supplyAfter,
        principalRawAfter: ctx.raw?.supplyAfter,
        price: ctx.price,
      }),
    );
  } else {
    // A borrow, a repay, or a write-off: one debt-axis reserve. The write-off's
    // change traces to the DeficitCreated log rather than a Pool `amount`
    // param; the reconstruction is the same.
    const writtenOff = ctx.eventType === "bad_debt_written_off";
    push(
      statFor({
        label: "Borrowed",
        symbol: sym,
        reserve: ctx.reserve,
        side: "debt",
        change: String(signedAmount(ctx)),
        changeProv: writtenOff
          ? writtenOffDebtProv(sym, coords, ctx.raw?.amount, ctx.origin?.amount)
          : assetsDeltaProv(sym, "debt", coords, ctx.raw?.amount, ctx.origin?.amount),
        principalAfter: ctx.debtAfter,
        principalRawAfter: ctx.raw?.debtAfter,
        price: ctx.price,
      }),
    );
  }

  // Liquidations gain the valued two-leg forensics beneath the snapshot grid,
  // once the oracle-price walk has priced both legs at this block.
  const built =
    ctx.eventType === "liquidation"
      ? buildLiquidationForensics(ctx, coords, { atBlockPriceProv, liqLegUsdProv, liqPremiumProv })
      : undefined;
  // The Base index lanes carry the seized reserve's bonus at the block; the
  // premium reads against it. The Ethereum lanes never stored it.
  const bonus = ctx.liquidationBonusAtBlock;
  const forensics =
    built && bonus
      ? {
          ...built,
          premiumReference: {
            label: "Bonus at block",
            value: `+${((bonus.bonusBps - 10000) / 100).toFixed(2)}%${bonus.protocolFeeBps > 0 ? ` (${bonus.protocolFeeBps / 100}% of it to the protocol)` : ""}`,
            prov: liqBonusRefProv(coords, bonus),
          },
        }
      : built;

  // Ordinary events gain the at-block price footnote pill for the touched
  // reserve — the read the USD chip above derives from. Liquidations carry
  // their two pills inside the forensics block instead.
  const pricePills: AtBlockPricePill[] = [
    ...(ctx.eventType !== "liquidation" && ctx.price && ctx.reserveSymbol
      ? [
          {
            symbol: ctx.reserveSymbol,
            priceUsd: ctx.price.usd,
            priceProv: atBlockPriceProv(ctx.reserveSymbol, coords, ctx.price.usd),
          },
        ]
      : []),
    // A swap's received reserve carries its own at-block price.
    ...(ctx.swap?.receivedPrice && ctx.swap.receivedSymbol
      ? [
          {
            symbol: ctx.swap.receivedSymbol,
            priceUsd: ctx.swap.receivedPrice.usd,
            priceProv: atBlockPriceProv(ctx.swap.receivedSymbol, coords, ctx.swap.receivedPrice.usd),
          },
        ]
      : []),
  ];

  return (
    <>
      {stats.length > 0 && <ChainTruthDetail stats={stats} />}
      {state?.status === "loading" && (
        <div className="px-5 pb-2 text-xs text-rb-500" data-position-state="loading">
          Reading the position at this block…
        </div>
      )}
      {state?.status === "unavailable" && (
        <div
          className="px-5 pb-2 text-sm text-rb-500"
          data-position-state="unavailable"
          data-position-code={state.code}
        >
          Position state isn&rsquo;t available for this event.
        </div>
      )}
      {ready && <AaveV3PositionStateBlock state={ready} coords={stateCoords} />}
      {forensics && <LiquidationForensics {...forensics} />}
      {pricePills.length > 0 && (
        <div className="px-5 pb-2">
          <AtBlockPriceFootnote pills={pricePills} />
        </div>
      )}
    </>
  );
}
