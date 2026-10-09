"use client";

// f(x)'s T2 (ui-jobs 309 step 8): the card's `cells`, `notes` and `price`
// slots, read when the card opens. Collateral, Debt and the debt ratio; the
// oracle price and the fee in the price row. A rebalance's or a pool-wide
// liquidation's tick and pool totals are not the position's: the explanation
// states them, and the position's part is its ledger's "This rebalance" or
// "This liquidation" row. A liquidation's split (what reached the liquidator,
// what the protocol kept, the debt repaid) stands as notes.
//
// Every row that moves the position states it before → after: getPosition and
// getPositionDebtRatio at block − 1 and at the block (/api/chain/fx/event-state,
// read when the row is opened). That is the only per-position figure a
// rebalance has, and the only debt ratio an operate has. Until the read lands
// an operate keeps the stored after-figures the timeline carries.
//
//   operate      — collateral, debt, debt ratio; the fee (the event's
//                  protocolFees where the old manager emitted one, else the
//                  caller's schedule at the block times the amounts) and the
//                  oracle price in the price row.
//   liquidation  — the position before → after; notes for what reached the
//                  liquidator (token units) and its stETH worth, what the
//                  protocol kept, the debt repaid and any debt left unpaid.
//   rebalance    — the position's change.

import type { FxContext } from "@/lib/shared/types/event-shape";
import type { ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import {
  reconstructTransition,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { EventNotes, NoteLine, useStatCells, type ChainTruthCellStat } from "@/components/shared/chain-truth-cells";
import type { EventCardOpened } from "@/components/shared/event-card";
import type { EventCellHead } from "@/components/shared/event-cells";
import type { EventCardPrice, EventPriceFigure } from "@/components/shared/event-price-row";
import {
  debtDeltaProv,
  protocolFeesProv,
  liqCollsProv,
  liqDebtRepaidProv,
  liqDebtTotalProv,
  impliedDebtAfterProv,
  chainAfterProv,
  chainBeforeProv,
  chainChangeProv,
  debtSincePreviousProv,
  snapOraclePriceProv,
  transferPartyProv,
  rowStateProv,
  rowChangeProv,
  wstethRateProv,
  stethEquivalentProv,
  protocolShareProv,
  unpaidDebtProv,
  feeScheduleProv,
  inTxFundingProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { formatExact, formatNumber, formatTinyNonZero } from "@/lib/utils/format";
import { fxBeforeAfter, useFxEventStateRead, type FxSide } from "@/lib/fx/use-event-state";
import { fxRowFees, fxFeePct } from "@/lib/fx/row-figures";
import { fxCollMoved, fxFundingText, fxRowFunding } from "@/lib/fx/in-tx-funding";
import { formatDate } from "@/lib/date";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { useFxLedgerCells } from "./fx-ledger";

export interface FxCellsProps {
  ctx: FxContext;
  txHash?: string;
  blockNumber?: number;
  /** The pool's rate-normalized unit symbol (stETH / WBTC). */
  normalizedSymbol: string;
  /** Rebalance rows: how many rebalance rows of this position share the block
   *  (the block read then covers them together). */
  blockPeers?: number;
}

const fmt = (human?: string | null): string => (human == null ? "—" : formatNumber(Number(human)));
const pct = (r: number): string => `${(r * 100).toFixed(1)}%`;
const DUST = 1e-12;

/** The reconstructed implied-debt BEFORE this event (after − change) — the
 *  same indexed lane as the after-figure, re-summarized for the inversion. */
const impliedDebtBeforeProv = (coords: FxCoords): Provenance => ({
  ...impliedDebtAfterProv(coords),
  summary:
    "Event-implied fxUSD debt before this event — the implied debt after it minus this event's debt delta. Funding and rebalances move the real debt between events with no per-position log, so this is the replay lane.",
  formula: "implied debt after − debt change",
});

/** A before → after pair from the row read, as a grid stat. */
/** Collateral worth less than this at the row's price is dust: what a
 *  liquidation leaves behind. A debt ratio over it (131.7% on 0.006 stETH
 *  against 21.3 fxUSD) says nothing about the position, so the tile says
 *  "dust left" in its place. */
export const FX_DUST_USD = 100;

function readStat(
  label: string,
  side: "coll" | "debt" | "ratio",
  symbol: string,
  before: FxSide | null,
  after: FxSide | null,
  coords: FxCoords,
  price?: number | null,
): ChainTruthStat | null {
  const isDust = (s: FxSide | null) =>
    s?.colls != null &&
    s.colls > 0 &&
    (s.colls < 1e-9 || (price != null && price > 0 && s.colls * price < FX_DUST_USD));
  const pick = (s: FxSide | null) =>
    s == null ? null : side === "coll" ? s.colls : side === "debt" ? s.debts : isDust(s) ? null : s.ratio;
  if (side === "ratio" && isDust(after)) {
    return {
      label,
      value: "dust left",
      display: "dust left",
      symbol: "",
      prov: rowStateProv(side, "after", symbol, coords),
      sub: <>collateral under ${FX_DUST_USD} at the row&rsquo;s price</>,
    };
  }
  const a = pick(after);
  const b = pick(before);
  if (a == null) return null;
  const afterProv = rowStateProv(side, "after", symbol, coords);
  const beforeProv = rowStateProv(side, "before", symbol, coords);
  if (side === "ratio") {
    const transition: ChainTruthTransition | undefined =
      b != null && b > 0 && Math.abs(a - b) > 1e-9
        ? {
            before: pct(b),
            beforeExact: formatExact(b * 100),
            beforeProv,
            change: `${a >= b ? "+" : "−"}${(Math.abs(a - b) * 100).toFixed(1)} pts`,
            changeExact: `${a >= b ? "+" : "−"}${formatExact(Math.abs(a - b) * 100)}`,
            changeProv: rowChangeProv("ratio", symbol, coords),
            shownAsIs: true,
          }
        : undefined;
    return { label, value: formatExact(a * 100), display: pct(a), symbol: "", prov: afterProv, transition };
  }
  return {
    label,
    value: String(a),
    ...(a === 0 ? { display: "0" } : {}),
    symbol,
    prov: afterProv,
    transition:
      b != null
        ? reconstructTransition({
            after: String(a),
            change: String(a - b),
            changeProv: rowChangeProv(side, symbol, coords),
            beforeProv,
          })
        : undefined,
  };
}

/** The cells to come while the position is read at the block. */
export const FX_HEADS: EventCellHead[] = [
  { kind: "ledger", side: "collateral", label: "Collateral" },
  { kind: "ledger", side: "debt", label: "Debt" },
  { kind: "stat", label: "Debt ratio" },
];

/** The opened card: getPosition and getPositionDebtRatio at block − 1 and at
 *  the block (/api/chain/fx/event-state). */
export function useFxOpened({
  ctx,
  txHash,
  blockNumber,
  normalizedSymbol,
  blockPeers,
  price: price0,
}: FxCellsProps & { price?: EventCardPrice }): EventCardOpened {
  const { value: state, settled } = useFxEventStateRead(ctx, blockNumber, txHash);
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const tokenSym = meta?.tokenSymbol ?? ctx.poolSymbol;
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const { before, after } = fxBeforeAfter(state, blockNumber);
  const rate = after?.rate ?? before?.rate ?? null;
  // The cells that open into the Lifetime flows ledgers, where the page has
  // them; while the model is on its way, the cells that will open stand as
  // placeholder rows.
  const ledgerCells = useFxLedgerCells();
  const focus = useFlowFocus();
  const flowsPending = !!focus && !focus.model;
  const ledgers = ledgerCells != null || flowsPending;
  const toCells = useStatCells();
  const collLedger = ledgers ? { ledger: "collateral" as const } : {};
  const debtLedger = ledgers ? { ledger: "debt" as const } : {};
  const stats: ChainTruthCellStat[] = [];
  const figures: EventPriceFigure[] = [];
  const notes: ReactNode[] = [];
  const keyed = (key: string, s: ChainTruthStat | null, inputs?: string[]): ChainTruthCellStat | null =>
    s ? { ...s, key, ...(inputs ? { inputs } : {}) } : null;

  // "= 1.748 stETH at 1.192 stETH per wstETH" beside a wstETH amount.
  const stethSub = (tokenAmount: number, what: string) =>
    rate != null && tokenSym !== normalizedSymbol ? (
      <>
        ={" "}
        <Prov info={stethEquivalentProv(what, coords)} value={formatExact(tokenAmount * rate)}>
          {formatNumber(tokenAmount * rate)}
        </Prov>{" "}
        {normalizedSymbol} at{" "}
        <Prov info={wstethRateProv(coords)} value={formatExact(rate)}>
          {rate.toFixed(4)}
        </Prov>{" "}
        {normalizedSymbol} per {tokenSym}
      </>
    ) : undefined;

  // Ownership rows are zero-delta: the Transfer log's holders, as notes.
  if (ctx.eventType === "transfer") {
    const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
    const isMint = ctx.transferFrom === "0x0000000000000000000000000000000000000000";
    return {
      cells: { none: "An ownership transfer moves no balance" },
      notes: (
        <EventNotes>
          <NoteLine label={isMint ? "From · mint" : "From"}>
            <Prov info={transferPartyProv("from", coords)} value={isMint ? "0x0" : short(ctx.transferFrom)}>
              {isMint ? "0x0" : short(ctx.transferFrom)}
            </Prov>
            {!isMint && ctx.transferFromSince != null && ctx.transferAt != null ? (
              <span className="font-normal text-rb-500">
                {" "}
                held it from {formatDate(ctx.transferFromSince)} to {formatDate(ctx.transferAt)}
              </span>
            ) : null}
          </NoteLine>
          <NoteLine label="To · new holder">
            <Prov info={transferPartyProv("to", coords)} value={short(ctx.transferTo)}>
              {short(ctx.transferTo)}
            </Prov>
          </NoteLine>
        </EventNotes>
      ),
      price: price0,
    };
  }

  const poolLiq = ctx.eventType === "liquidation" && ctx.poolWide === true;
  if (ctx.eventType === "tickRebalance" || poolLiq) {
    // The position's change at the block; the tick's or the pool's totals
    // are the explanation's.
    const tag = blockPeers && blockPeers > 1 ? ` · this block (${blockPeers} rebalances)` : "";
    const px = poolLiq ? (before?.minPrice ?? null) : null;
    const coll = readStat(`Collateral${tag}`, "coll", normalizedSymbol, before, after, coords);
    const debt = readStat(`Debt${tag}`, "debt", "fxUSD", before, after, coords);
    for (const s of [
      keyed("collateral", coll ? { ...coll, ...collLedger } : null),
      keyed("debt", debt ? { ...debt, ...debtLedger } : null),
      keyed("ratio", readStat(`Debt ratio${tag}`, "ratio", normalizedSymbol, before, after, coords, px), [
        "collateral",
        "debt",
      ]),
    ])
      if (s) stats.push(poolLiq ? { ...s, readableLabel: true } : s);
    const cells = toCells(stats);
    return {
      // The position's read at the block is out: its cells stand as
      // placeholder rows until it lands.
      cells: !settled && (!coll || !debt) ? { pending: FX_HEADS } : cells,
      price: price0,
    };
  }

  if (ctx.eventType === "liquidation") {
    const sent = Number(ctx.liqColls ?? "0") || 0;
    const steth = stethSub(sent, "Collateral to the liquidator");
    notes.push(
      <NoteLine key="sent" label="Collateral to the liquidator">
        <Prov info={liqCollsProv(tokenSym, coords)} value={fmt(ctx.liqColls)}>
          {fmt(ctx.liqColls)} {tokenSym}
        </Prov>
        {steth && <span className="font-normal text-rb-500"> {steth}</span>}
      </NoteLine>,
    );
    const sentNorm = tokenSym === normalizedSymbol ? sent : rate != null ? sent * rate : null;
    if (before?.colls != null && after?.colls != null && sentNorm != null) {
      const kept = before.colls - after.colls - sentNorm;
      if (kept > DUST)
        notes.push(
          <NoteLine key="kept" label="Kept by the protocol">
            <Prov info={protocolShareProv(normalizedSymbol, coords)} value={String(kept)}>
              {formatTinyNonZero(kept)} {normalizedSymbol}
            </Prov>
            {state?.expenseRatio != null && (
              <span className="font-normal text-rb-500">
                {" "}
                {Math.round(state.expenseRatio * 100)}% of the liquidation bonus
              </span>
            )}
          </NoteLine>,
        );
    }
    notes.push(
      <NoteLine key="fxusd" label="fxUSD debt repaid">
        <Prov info={liqDebtRepaidProv("fxusd", coords)} value={fmt(ctx.liqFxusdDebts)}>
          {fmt(ctx.liqFxusdDebts)} fxUSD
        </Prov>
      </NoteLine>,
    );
    const stable = Number(ctx.liqStableDebts ?? "0") || 0;
    if (stable !== 0)
      notes.push(
        <NoteLine key="stable" label="Stable debt repaid">
          <Prov info={liqDebtRepaidProv("stable", coords)} value={fmt(ctx.liqStableDebts)}>
            {fmt(ctx.liqStableDebts)} USDC
          </Prov>
        </NoteLine>,
      );
    const debtBefore = before?.debts ?? (ctx.debtBefore != null ? Number(ctx.debtBefore) : null);
    const repaid = (Number(ctx.liqFxusdDebts ?? "0") || 0) + stable;
    if (ctx.emptiesPosition && debtBefore != null && debtBefore - repaid > 1e-9)
      notes.push(
        <NoteLine key="unpaid" label="Debt left unpaid · spread over other positions">
          <Prov info={unpaidDebtProv(coords)} value={String(debtBefore - repaid)}>
            {formatNumber(debtBefore - repaid)} fxUSD
          </Prov>
        </NoteLine>,
      );
  } else {
    // Operate: the fee in the price row — the event's field where the old
    // manager emitted one, else the caller's schedule at the block.
    if (ctx.protocolFees != null && Number(ctx.protocolFees) !== 0) {
      figures.push({
        key: "fee",
        label: "Protocol fee",
        symbol: tokenSym,
        text: fmt(ctx.protocolFees),
        info: protocolFeesProv(tokenSym, coords),
        value: fmt(ctx.protocolFees),
      });
    } else if (state?.fees) {
      for (const f of fxRowFees(ctx, state.fees)) {
        if (f.amount <= 0) continue;
        const sym = f.symbol === "token" ? tokenSym : "fxUSD";
        figures.push({
          key: `fee-${f.leg}`,
          label: `Fee · ${fxFeePct(f.ratio)} ${f.leg}`,
          symbol: sym,
          text: formatNumber(f.amount),
          info: feeScheduleProv(state.fees.caller, coords),
          value: String(f.amount),
          title: state.fees.custom ? "Schedule set for the caller" : "Pool default schedule",
        });
      }
    }
  }

  // The position on chain after the event (getPosition at the block): the
  // collateral and the debt with their before → after. The row read gives the
  // before; until it lands an operate keeps the stored figures.
  const collAfter = after?.colls ?? (ctx.collAfter != null ? Number(ctx.collAfter) : null);
  const debtAfter = after?.debts ?? (ctx.debtAfter != null ? Number(ctx.debtAfter) : null);
  if (collAfter != null && debtAfter != null) {
    const collBefore = before?.colls ?? (ctx.collBefore != null ? Number(ctx.collBefore) : null);
    const coll = Number(ctx.collDelta ?? "0") || 0;
    // Funding the pool booked at the start of this transaction lands in the
    // row's before → after (lib/fx/in-tx-funding.ts).
    const funding =
      ctx.eventType === "operate" && !ctx.isOpen && (blockPeers ?? 1) <= 1
        ? fxRowFunding(
            fxCollMoved(ctx),
            tokenSym !== normalizedSymbol ? rate : null,
            before?.colls ?? null,
            after?.colls ?? null,
          )
        : null;
    const moved =
      ctx.eventType === "operate" && coll !== 0 ? stethSub(Math.abs(coll), `The ${tokenSym} moved`) : undefined;
    const collSub =
      funding != null && funding > 0 && (tokenSym === normalizedSymbol || rate != null) ? (
        <>
          {moved ? <>{moved}; </> : null}
          includes{" "}
          <Prov info={inTxFundingProv(normalizedSymbol, coords)} value={formatExact(funding)}>
            {fxFundingText(funding)}
          </Prov>{" "}
          {normalizedSymbol} of funding booked at the start of this transaction
        </>
      ) : (
        moved
      );
    stats.push({
      key: "collateral",
      label: "Collateral",
      value: String(collAfter),
      symbol: normalizedSymbol,
      prov: after
        ? rowStateProv("coll", "after", normalizedSymbol, coords)
        : chainAfterProv("coll", normalizedSymbol, coords),
      changed: collBefore == null || Math.abs(collAfter - collBefore) > 0,
      transition:
        collBefore != null
          ? reconstructTransition({
              after: String(collAfter),
              change: String(collAfter - collBefore),
              changeProv: before
                ? rowChangeProv("coll", normalizedSymbol, coords)
                : chainChangeProv("coll", normalizedSymbol, coords),
              beforeProv: before
                ? rowStateProv("coll", "before", normalizedSymbol, coords)
                : chainBeforeProv("coll", normalizedSymbol, coords, true),
            })
          : undefined,
      sub: collSub,
      ...collLedger,
    });
    const debtBefore = before?.debts ?? (ctx.debtBefore != null ? Number(ctx.debtBefore) : null);
    stats.push({
      key: "debt",
      label: "Debt",
      value: String(debtAfter),
      symbol: "fxUSD",
      prov: after
        ? rowStateProv("debt", "after", normalizedSymbol, coords)
        : chainAfterProv("debt", normalizedSymbol, coords),
      changed: debtBefore == null || Math.abs(debtAfter - debtBefore) > 0 || Boolean(ctx.debtSincePrevious),
      transition:
        debtBefore != null
          ? reconstructTransition({
              after: String(debtAfter),
              change: String(debtAfter - debtBefore),
              changeProv: before
                ? rowChangeProv("debt", normalizedSymbol, coords)
                : ctx.eventType === "liquidation"
                  ? chainChangeProv("debt", normalizedSymbol, coords)
                  : debtDeltaProv(coords),
              beforeProv: before
                ? rowStateProv("debt", "before", normalizedSymbol, coords)
                : chainBeforeProv("debt", normalizedSymbol, coords, ctx.eventType === "liquidation"),
            })
          : undefined,
      ...(ctx.debtSincePrevious
        ? {
            interestSincePrevious: {
              value: ctx.debtSincePrevious,
              prov: debtSincePreviousProv(coords),
              label: "Moved since previous event (funding, rebalances)",
            },
          }
        : {}),
      ...debtLedger,
    });
    const ratio = keyed(
      "ratio",
      readStat(
        "Debt ratio",
        "ratio",
        normalizedSymbol,
        before,
        after,
        coords,
        // Dust is what a liquidation leaves: only its rows test for it.
        ctx.eventType === "liquidation" && ctx.oraclePrice != null ? Number(ctx.oraclePrice) : null,
      ),
      ["collateral", "debt"],
    );
    if (ratio) stats.push(ratio);
  } else {
    // The replay lane — labeled event-implied so it is never read as the
    // position's current debt.
    stats.push({
      key: "debt",
      label: "Debt after · event-implied",
      value: fmt(ctx.impliedDebtAfter),
      symbol: "fxUSD",
      prov: impliedDebtAfterProv(coords),
      transition: reconstructTransition({
        after: ctx.impliedDebtAfter,
        change: ctx.debtDelta,
        changeProv: ctx.eventType === "liquidation" ? liqDebtTotalProv(coords) : debtDeltaProv(coords),
        beforeProv: impliedDebtBeforeProv(coords),
      }),
    });
  }
  const cells = toCells(ctx.eventType === "liquidation" ? stats.map((s) => ({ ...s, readableLabel: true })) : stats);

  // The same-tx PositionSnapshot's oracle price — USD per normalized unit at
  // this event's block — in the price row.
  const oracle = ctx.oraclePrice != null ? Number(ctx.oraclePrice) : null;
  const price: EventCardPrice | undefined =
    (oracle != null && oracle > 0) || figures.length > 0
      ? {
          gas: price0?.gas,
          prices: [
            ...(price0?.prices ?? []),
            ...(oracle != null && oracle > 0
              ? [
                  {
                    symbol: normalizedSymbol,
                    usd: oracle,
                    info: snapOraclePriceProv(normalizedSymbol, coords),
                    value: fmt(ctx.oraclePrice),
                    title: `Oracle price, USD per ${normalizedSymbol}, at this event's block`,
                  },
                ]
              : []),
          ],
          figures: [...(price0?.figures ?? []), ...figures],
        }
      : price0;
  return {
    cells,
    notes: notes.length ? <EventNotes>{notes}</EventNotes> : undefined,
    price,
  };
}
