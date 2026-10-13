"use client";

// Fluid's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the card's
// `sheet` slot for an operate or a liquidation, from the before→after figures
// the cells state (fluid-cells.tsx), laid out as the shared sheet
// (components/shared/event-sheet.tsx).
//
// One collateral token and one debt token per vault, and no dollar anywhere:
// a Fluid vault's oracle prices the collateral in the debt token, so the rows
// state each leg in its token and each side's total is the leg after the
// event in its token. Per side: the leg after the previous event on the page
// ("Last event"), the interest since it, the leg before this event, the
// event's move, the total. Risk: the position ratio (the debt over the
// collateral at the vault oracle's price at this block) and how far that
// price can fall before the ratio reaches the liquidation threshold. Limits:
// what the position can still borrow and the borrow rate. The breakdown holds
// the vault's collateral factor, liquidation threshold and liquidation
// penalty. Each Risk and Limits value swaps to its change since the previous
// event on the page.
//
// The page's live read (position-view.tsx) hands the vault's terms and each
// row's previous event through `FluidSheetProvider`; of the terms, the event
// rows carry only the penalty read at their block.

import { createContext, useContext, type ReactNode } from "react";
import type { FluidContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import { reconstructTransition, type ChainTruthTransition } from "@/components/shared/chain-truth-event";
import {
  colAfterProv,
  colBeforeProv,
  colDeltaProv,
  debtAfterProv,
  debtBeforeProv,
  debtDeltaProv,
  interestSincePreviousProv,
  liqPenaltyAtBlockProv,
  liqSettledProv,
  type FluidCoords,
} from "@/lib/fluid/event-provenance";
import { vaultConfigProv } from "@/lib/fluid/live-provenance";
import { formatNumber } from "@/lib/utils/format";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { AssetFlow } from "@/lib/shared/types/event-shape";
import { settledTransition } from "./fluid-cells";

/** The vault's terms, from the page's live read at the latest block. */
export interface FluidSheetTerms {
  vault: string;
  /** The block the live read answered at. */
  block: number;
  collateralFactor: number;
  liquidationThreshold: number;
  liquidationPenalty: number;
}

export interface FluidSheetFacts {
  terms: FluidSheetTerms | null;
  /** Each row's previous balance-bearing row on the page, by event id. */
  previous: Map<string, PreviousRow>;
  /** Each leg's token contract by symbol, from the flows of the page's rows,
   *  for the rows of an event that did not move that token. */
  addresses: Record<string, string>;
}

/** What the sheet reads off the previous row. */
export interface PreviousRow {
  ctx: FluidContext;
  txHash: string;
  blockNumber: number;
}

const FluidSheetContext = createContext<FluidSheetFacts | null>(null);

export function FluidSheetProvider({ value, children }: { value: FluidSheetFacts; children: ReactNode }) {
  return <FluidSheetContext.Provider value={value}>{children}</FluidSheetContext.Provider>;
}

export const useFluidSheetFacts = () => useContext(FluidSheetContext);

const isLiq = (c: FluidContext) => c.eventType === "liquidated" || c.eventType === "absorbed";
const isNftMove = (c: FluidContext) => c.eventType === "mint" || c.eventType === "transfer";

/** A row's legs after it: the settled reads on a liquidation, else the
 *  operate's after figures. */
const afterOf = (c: FluidContext) =>
  isLiq(c) ? { col: c.liqSupplyAfter, debt: c.liqBorrowAfter } : { col: c.colAfter, debt: c.debtAfter };

/** Each row's previous balance-bearing row, from the page's rows in any order:
 *  ordered by block, then by the log index the id ends with. */
export function previousRows(
  events: { id: string; txHash: string; blockNumber: number; context: { data: FluidContext } }[],
): Map<string, PreviousRow> {
  // An id reads "kind:txHash:logIndex:nft".
  const logIndex = (id: string) => {
    const parts = id.split(":");
    const at = parts.findIndex((p) => /^(0x)?[0-9a-f]{64}$/i.test(p));
    const n = at >= 0 ? Number(parts[at + 1]) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const sorted = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
  const out = new Map<string, PreviousRow>();
  let last: PreviousRow | null = null;
  for (const e of sorted) {
    const c = e.context.data;
    if (isNftMove(c)) continue;
    if (last) out.set(e.id, last);
    const a = afterOf(c);
    if (a.col != null || a.debt != null) last = { ctx: c, txHash: e.txHash, blockNumber: e.blockNumber };
  }
  return out;
}

/** Each leg's token contract by symbol, where a row's flows name it. */
export function legAddresses(
  events: { flows: AssetFlow[]; context: { data: FluidContext } }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of events)
    for (const sym of [e.context.data.supplySymbol, e.context.data.borrowSymbol]) {
      if (!sym || out[sym]) continue;
      const a = soleFlowAddress(e.flows, sym);
      if (a) out[sym] = a;
    }
  return out;
}

const WORDS = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  payback: "Repay",
  seized: "Seized",
  cleared: "Debt cleared",
  absorbed: "Absorbed",
  ratio: "Position ratio",
  fall: "Collateral can fall",
  fall_caption: (debt: string) => `Before liquidation, with the collateral priced in ${debt}.`,
  borrowable: "Still borrowable",
  rate: "Borrow rate",
  factor: "Collateral factor",
  threshold: "Liquidation threshold",
  penalty: "Liquidation penalty",
  no_debt: "No debt",
  liquidatable: "At or above the threshold",
  none: "None",
  unread: "Not read on this page",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  colEvent: (sym: string) =>
    `The ${sym} this operation moved on the collateral leg, the signed amount the vault's LogOperate event carries.`,
  debtEvent: (sym: string) =>
    `The ${sym} this operation borrowed or paid back, the signed amount the vault's LogOperate event carries.`,
  liqCol: (sym: string) =>
    `The ${sym} this liquidation took from the position: the vault's settled collateral at the block before less the same read at this block.`,
  liqDebt: (sym: string) =>
    `The ${sym} debt this liquidation cleared: the vault's settled debt at the block before less the same read at this block.`,
  last: (side: Side, sym: string) =>
    `The ${sym} ${side} the position held after its previous event on this page, as that row states it.`,
  interest: (side: Side, sym: string) =>
    `The ${sym} interest the ${side} ${side === "collateral" ? "earned" : "accrued"} since the previous event: the ${side} just before this event less the ${side} just after the previous one, both read from the vault.`,
  before: (side: Side, sym: string) =>
    `The ${sym} ${side} just before this event: the figure after it less this event's change.`,
  liqBefore: (side: Side, sym: string) =>
    `The ${sym} ${side} just before this liquidation, the vault's settled figure at the block before.`,
  total: (side: Side, sym: string) =>
    `The position's ${side} after this event, in ${sym}, as the vault reckons it at this block.`,
  ratio: (col: string, debt: string) =>
    `The debt as a share of the collateral's value after this event, the ${col} priced in ${debt} by the vault's oracle at this block.`,
  fall: (col: string, debt: string) =>
    `How far the ${col} price in ${debt} can fall before the position ratio reaches the vault's liquidation threshold: one less the ratio over the threshold.`,
  borrowable: (debt: string) =>
    `What the position could still borrow, in ${debt}: the collateral's value at this block's oracle price times the vault's collateral factor, less the debt.`,
  rate: "The vault's yearly borrow rate at this event's block, which floats with how much of the vault is borrowed.",
  factor:
    "The share of the collateral's value the vault lends against, from the vault's configuration as the page reads it at the latest block.",
  threshold:
    "The position ratio above which the vault can liquidate the position, from the vault's configuration as the page reads it at the latest block.",
  penaltyAtBlock:
    "The bonus the vault hands a liquidator, as a share of the debt cleared, read from the vault at this block.",
  penaltyHead:
    "The bonus the vault hands a liquidator, as a share of the debt cleared, from the vault's configuration as the page reads it at the latest block.",
};

type Side = "collateral" | "debt";

const num = (s: string | undefined | null): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const pct2 = (f: number) => `${(f * 100).toFixed(2)}%`;
const pts = (f: number) => `${(f * 100).toFixed(2)} pts`;

/** What a figure became since the previous event: after less after then. */
const sinceProv = (what: string): Provenance => ({
  kind: "derived",
  summary: `${what} since the previous event — the figure once this event had run, less the figure once the previous event on this page had run.`,
  formula: "after − after the previous event",
});

/** The position ratio at one row's after-state and price. */
const ratioOf = (col: number | null, debt: number | null, price: number | null): number | null =>
  col != null && debt != null && price != null && col > 0 && debt > 0 && price > 0 ? debt / (col * price) : null;

const ratioProv = (
  colSym: string,
  debtSym: string,
  coords: FluidCoords,
  vals: { col: string; debt: string; price: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The position's ratio after this event — its ${debtSym} debt over its ${colSym} collateral times the vault oracle's price at this block, the quantity Fluid's liquidation engine compares with the vault's risk lines.`,
  formula: "debt ÷ (collateral × oracle price)",
  inputs: [
    { label: "debt", value: `${vals.debt} ${debtSym}`, kind: "chain", pclass: "state", note: "after this event" },
    { label: "collateral", value: `${vals.col} ${colSym}`, kind: "chain", pclass: "state", note: "after this event" },
    {
      label: "oracle price",
      value: `${vals.price} ${debtSym}`,
      kind: "chain",
      pclass: "oracle",
      note: `vault oracle${coords.blockNumber != null ? ` at block ${coords.blockNumber}` : ""}`,
    },
  ],
});

/** One side's panel. */
function sheetSide(args: {
  side: Side;
  sym: string;
  address?: string;
  ctx: FluidContext;
  coords: FluidCoords;
  opening: boolean;
  prev: PreviousRow | undefined;
}): SheetSide | null {
  const { side, sym, address, ctx, coords, opening, prev } = args;
  const chain = ctx.balanceBasis === "chain";
  const liq = isLiq(ctx);
  const afterStr = liq
    ? side === "collateral"
      ? ctx.liqSupplyAfter
      : ctx.liqBorrowAfter
    : side === "collateral"
      ? ctx.colAfter
      : ctx.debtAfter;
  const after = num(afterStr);
  if (after == null) return null;
  const fig = (n: number) => formatNumber(n);
  const signed = (n: number) => `${n < 0 ? "−" : "+"}${fig(Math.abs(n))}`;

  // The event's move and the before figure, with the cells' receipts.
  let t: ChainTruthTransition | undefined;
  let change: number | null = null;
  let before: number | null = null;
  if (liq) {
    const b = side === "collateral" ? ctx.liqSupplyBefore : ctx.liqBorrowBefore;
    t = settledTransition(side, sym, b, afterStr, coords);
    before = num(b);
    if (before != null) change = after - before;
  } else {
    const delta = side === "collateral" ? ctx.colDelta : ctx.debtDelta;
    t = reconstructTransition({
      after: afterStr,
      change: delta,
      changeProv:
        side === "collateral"
          ? colDeltaProv(sym, coords, ctx.raw?.colAmt)
          : debtDeltaProv(sym, coords, ctx.raw?.debtAmt),
      beforeProv: side === "collateral" ? colBeforeProv(sym, coords, chain) : debtBeforeProv(sym, coords, chain),
      opening,
    });
    const d = num(delta);
    change = d != null && d !== 0 ? d : null;
    before = opening ? 0 : change != null ? after - change : after;
  }

  const rows: SheetRow[] = [];
  if (change != null && change !== 0 && t)
    rows.push({
      key: "event",
      label: liq
        ? ctx.eventType === "absorbed"
          ? WORDS.absorbed
          : side === "collateral"
            ? WORDS.seized
            : WORDS.cleared
        : side === "collateral"
          ? change > 0
            ? WORDS.deposit
            : WORDS.withdraw
          : change > 0
            ? WORDS.borrow
            : WORDS.payback,
      amount: { text: signed(change), symbol: sym, address, info: t.changeProv, value: t.changeExact },
      tip: liq
        ? side === "collateral"
          ? TIPS.liqCol(sym)
          : TIPS.liqDebt(sym)
        : side === "collateral"
          ? TIPS.colEvent(sym)
          : TIPS.debtEvent(sym),
    });

  // The carry layer: the previous row's after figure and the interest since.
  const carry: SheetSide["carry"] = [];
  if (!opening && prev) {
    const prevCoords: FluidCoords = { ...coords, txHash: prev.txHash, blockNumber: prev.blockNumber };
    const pc = prev.ctx;
    const pChain = pc.balanceBasis === "chain";
    const pStr = side === "collateral" ? afterOf(pc).col : afterOf(pc).debt;
    const p = num(pStr);
    if (p != null && p > 0)
      carry.push({
        key: "last",
        label: SHEET_WORDS.last,
        amount: {
          text: fig(p),
          symbol: sym,
          address,
          info: isLiq(pc)
            ? liqSettledProv(side, "after", sym, prevCoords)
            : side === "collateral"
              ? colAfterProv(sym, prevCoords, pc.raw?.colAfter, pChain)
              : debtAfterProv(sym, prevCoords, pc.raw?.debtAfter, pChain),
          value: pStr,
        },
        tip: TIPS.last(side, sym),
      });
  }
  const interestStr = side === "collateral" ? ctx.colInterestSincePrevious : ctx.debtInterestSincePrevious;
  const interest = num(interestStr);
  if (!opening && interest != null && interest !== 0)
    carry.push({
      key: "interest",
      label: SHEET_WORDS.interest,
      amount: {
        text: fig(interest),
        symbol: sym,
        address,
        info: interestSincePreviousProv(side, sym, coords),
        value: interestStr,
      },
      tip: TIPS.interest(side, sym),
    });
  const beforeRow: SheetRow | undefined =
    carry.length > 0 && before != null
      ? {
          key: "before",
          label: SHEET_WORDS.before,
          amount: {
            text: fig(before),
            symbol: sym,
            address,
            info:
              t?.beforeProv ??
              (side === "collateral" ? colBeforeProv(sym, coords, chain) : debtBeforeProv(sym, coords, chain)),
            value: t?.beforeExact,
          },
          tip: liq ? TIPS.liqBefore(side, sym) : TIPS.before(side, sym),
        }
      : undefined;

  return {
    side,
    icons: [sym],
    carry,
    before: beforeRow,
    rows,
    total: {
      text: `${fig(after)} ${sym}`,
      info: liq
        ? liqSettledProv(side, "after", sym, coords)
        : side === "collateral"
          ? colAfterProv(sym, coords, ctx.raw?.colAfter, chain)
          : debtAfterProv(sym, coords, ctx.raw?.debtAfter, chain),
      value: afterStr,
    },
    totalTip: TIPS.total(side, sym),
  };
}

/** The sheet of one Fluid event; undefined for the kinds the cells state (an
 *  NFT move, a row with no balance). */
export function fluidSheet({
  ctx,
  coords,
  opening,
  facts,
  eventId,
  addresses,
}: {
  ctx: FluidContext;
  coords: FluidCoords;
  opening: boolean;
  facts: FluidSheetFacts | null;
  eventId: string;
  addresses: { collateral?: string; debt?: string };
}): EventSheet | undefined {
  if (isNftMove(ctx)) return undefined;
  const colSym = ctx.supplySymbol ?? "DEX shares";
  const debtSym = ctx.borrowSymbol ?? "DEX shares";
  const prev = facts?.previous.get(eventId);
  // Every operate of the opening transaction is marked opening; only the
  // first, with no row before it, starts from zero.
  const opens = opening && !prev;
  const col = sheetSide({
    side: "collateral",
    sym: colSym,
    address: addresses.collateral ?? facts?.addresses[colSym],
    ctx,
    coords,
    opening: opens,
    prev,
  });
  const debt = sheetSide({
    side: "debt",
    sym: debtSym,
    address: addresses.debt ?? facts?.addresses[debtSym],
    ctx,
    coords,
    opening: opens,
    prev,
  });
  if (!col || !debt) return undefined;

  // Risk and Limits, at the vault oracle's price at this block and the
  // vault's terms from the page's live read.
  const terms = facts?.terms ?? null;
  const a = afterOf(ctx);
  const colAfter = num(a.col);
  const debtAfter = num(a.debt);
  const price = ctx.oraclePriceAtBlock?.debtPerCol ?? null;
  const ratio = ratioOf(colAfter, debtAfter, price);
  const pa = prev ? afterOf(prev.ctx) : null;
  const prevPrice = prev?.ctx.oraclePriceAtBlock?.debtPerCol ?? null;
  const prevRatio = pa ? ratioOf(num(pa.col), num(pa.debt), prevPrice) : null;
  const noDebt = debtAfter != null && debtAfter <= 0;
  const termProv = (what: string, field: string): Provenance => {
    const p = vaultConfigProv(what, field, terms?.vault ?? ctx.vault, coords.pairLabel);
    return terms ? { ...p, source: { block: terms.block } } : p;
  };

  const ratioStat: SheetStat = {
    key: "position-ratio",
    label: WORDS.ratio,
    tip: TIPS.ratio(colSym, debtSym),
    value:
      ratio != null && price != null
        ? {
            text: pct2(ratio),
            info: ratioProv(colSym, debtSym, coords, { col: a.col!, debt: a.debt!, price }),
            value: pct2(ratio),
          }
        : { none: noDebt ? WORDS.no_debt : WORDS.unread },
    change:
      ratio != null && prevRatio != null
        ? {
            text: changeText(ratio - prevRatio, pts),
            info: sinceProv("The position ratio's change, in percentage points"),
          }
        : null,
  };

  const lt = terms && terms.liquidationThreshold > 0 ? terms.liquidationThreshold : null;
  const fallOf = (r: number | null) => (r != null && lt != null && r < lt ? 1 - r / lt : null);
  const fall = fallOf(ratio);
  const fallPrev = fallOf(prevRatio);
  const fallProv: Provenance | undefined =
    ratio != null && lt != null
      ? {
          kind: "chain-derived",
          pclass: "state",
          summary: `Collateral can fall — how far the ${colSym} price in ${debtSym} can fall before the position ratio after this event reaches the vault's liquidation threshold: one less the ratio over the threshold. The threshold is the vault's configuration as the page reads it at the latest block.`,
          formula: "1 − ratio ÷ liquidation threshold",
          inputs: [
            {
              label: "position ratio",
              value: pct2(ratio),
              kind: "chain-derived",
              pclass: "state",
              note: "after this event",
            },
            {
              label: "liquidation threshold",
              value: pct2(lt),
              kind: "chain",
              pclass: "state",
              note: `configs.liquidationThreshold${terms ? ` at block ${terms.block}` : ""}`,
            },
          ],
        }
      : undefined;
  const fallStat: SheetStat = {
    key: "collateral-can-fall",
    label: WORDS.fall,
    tip: TIPS.fall(colSym, debtSym),
    value:
      fall != null && fallProv
        ? { text: `${(fall * 100).toFixed(fall < 0.1 ? 1 : 0)}%`, info: fallProv }
        : { none: noDebt ? WORDS.no_debt : ratio != null && lt != null ? WORDS.liquidatable : WORDS.unread },
    change:
      fall != null && fallPrev != null
        ? {
            text: changeText(fall - fallPrev, (x) => `${(x * 100).toFixed(0)} pts`),
            info: sinceProv("The fall's change, in percentage points"),
          }
        : null,
  };

  const cf = terms && terms.collateralFactor > 0 ? terms.collateralFactor : null;
  const roomOf = (c: number | null, d: number | null, p: number | null) =>
    c != null && d != null && p != null && cf != null ? Math.max(0, c * p * cf - d) : null;
  const room = roomOf(colAfter, debtAfter, price);
  const roomPrev = pa ? roomOf(num(pa.col), num(pa.debt), prevPrice) : null;
  const borrowStat: SheetStat = {
    key: "borrowable",
    label: WORDS.borrowable,
    tip: TIPS.borrowable(debtSym),
    value:
      colAfter != null && colAfter <= 0
        ? { none: WORDS.none }
        : room != null && price != null && cf != null
          ? {
              text: `${formatNumber(room)} ${debtSym}`,
              info: {
                kind: "chain-derived",
                pclass: "state",
                summary: `Still borrowable — the ${colSym} collateral after this event times the vault oracle's price at this block and the vault's collateral factor, less the ${debtSym} debt: what an operation could borrow before the vault refuses it. The collateral factor is the vault's configuration as the page reads it at the latest block.`,
                formula: "collateral × oracle price × collateral factor − debt",
                inputs: [
                  {
                    label: "collateral",
                    value: `${a.col} ${colSym}`,
                    kind: "chain",
                    pclass: "state",
                    note: "after this event",
                  },
                  {
                    label: "oracle price",
                    value: `${price} ${debtSym}`,
                    kind: "chain",
                    pclass: "oracle",
                    note: "at this block",
                  },
                  {
                    label: "collateral factor",
                    value: pct2(cf),
                    kind: "chain",
                    pclass: "state",
                    note: `configs.collateralFactor${terms ? ` at block ${terms.block}` : ""}`,
                  },
                  {
                    label: "debt",
                    value: `${a.debt} ${debtSym}`,
                    kind: "chain",
                    pclass: "state",
                    note: "after this event",
                  },
                ],
              },
            }
          : { none: WORDS.unread },
    change:
      room != null && roomPrev != null
        ? {
            text: changeText(room - roomPrev, (x) => `${formatNumber(x)} ${debtSym}`),
            info: sinceProv("Still borrowable's change"),
          }
        : null,
  };
  // The borrow rate at the event's block is on no row the page reads.
  const rateStat: SheetStat = { key: "borrow-rate", label: WORDS.rate, tip: TIPS.rate, value: { none: WORDS.unread } };

  const atBlockPenalty = ctx.oraclePriceAtBlock?.liquidationPenaltyPct;
  const breakdown: SheetStat[] = [
    {
      key: "collateral-factor",
      label: WORDS.factor,
      tip: TIPS.factor,
      value:
        cf != null
          ? { text: pct2(cf), info: termProv("Collateral factor (borrow gate)", "collateralFactor") }
          : { none: WORDS.unread },
    },
    {
      key: "liquidation-threshold",
      label: WORDS.threshold,
      tip: TIPS.threshold,
      value:
        lt != null
          ? { text: pct2(lt), info: termProv("Liquidation threshold", "liquidationThreshold") }
          : { none: WORDS.unread },
    },
    atBlockPenalty != null
      ? {
          key: "liquidation-penalty",
          label: WORDS.penalty,
          tip: TIPS.penaltyAtBlock,
          value: { text: `${atBlockPenalty.toFixed(2)}%`, info: liqPenaltyAtBlockProv(coords, atBlockPenalty) },
        }
      : {
          key: "liquidation-penalty",
          label: WORDS.penalty,
          tip: TIPS.penaltyHead,
          value:
            terms && terms.liquidationPenalty > 0
              ? { text: pct2(terms.liquidationPenalty), info: termProv("Liquidation penalty", "liquidationPenalty") }
              : { none: WORDS.unread },
        },
  ];

  return {
    sides: [col, debt],
    panels: [
      { panel: "risk", rows: [ratioStat, fallStat], caption: fall != null ? WORDS.fall_caption(debtSym) : undefined },
      { panel: "limits", rows: [borrowStat, rateStat], breakdown },
    ],
  };
}
