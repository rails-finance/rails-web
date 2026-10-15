"use client";

// The Aave family's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330), from
// the position read around the event's transaction and the read around the
// previous one: the figures the cells state (aave-family-cells.tsx), laid out
// as the shared sheet (components/shared/event-sheet.tsx).
//
// Per side: the Pool's total after the previous transaction ("Last event"),
// each reserve's interest since it at this block's price, the market move
// between them (the rest of the change in the Pool's total), the Pool's total
// before this transaction, each reserve the transaction moved, and the total
// after. Risk: the health factor and how far the collateral's value can fall
// before it reaches 1. Limits: the loan to value and what can still be
// borrowed; the weighted max LTV, the liquidation threshold and the eMode
// category as parameters.

import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import { fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import {
  accountRatioProv,
  borrowableProv,
  currentLtvProv,
  exactBalanceChangeProv,
  exactBalanceProv,
  prevEventInterestProv,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import {
  baseToUsd,
  big,
  borrowableBase,
  bpsPct,
  groupExact,
  humanOf,
  interestSincePrevious,
  legChange,
  priceText,
  wadToNumber,
  type AaveV3AccountSide,
  type AaveV3PositionState,
  type AaveV3PositionStateReserve,
} from "@/lib/aave-v3/position-state";
import { emodeFigure, exactLeg, exactUsd, hfFigure, isDustRow, reserveSymbol } from "./aave-v3-position-state";
import { sideFacts, sideUsd } from "./aave-family-cells";

const WORDS = {
  health: "Health factor",
  fall: "Collateral can fall",
  fall_caption: "Before liquidation, if the debt’s value holds.",
  no_debt: "No debt",
  liquidatable: "At or below 1",
  one_asset: "One asset on both sides",
  ltv: "LTV",
  borrowable: "Still borrowable",
  max_ltv: "Max LTV",
  threshold: "Liquidation threshold",
  emode: "eMode",
  unread: "Not available at this block",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  event: (sym: string, side: FlowSide) =>
    `The ${sym} this transaction moved on the ${side === "collateral" ? "supplied" : "borrowed"} side, read from the Pool before and after it, at the oracle's ${sym} price at this block.`,
  last: (side: FlowSide) =>
    `The ${side === "collateral" ? "collateral" : "debt"}'s total in dollars once the previous transaction on this timeline had run, read from the Pool at that block.`,
  interest: (side: FlowSide) =>
    `The interest every reserve on this side ${side === "collateral" ? "earned" : "accrued"} since the previous event, at the oracle's prices at this block.`,
  interestAsset: (sym: string) =>
    `The interest on ${sym} since the previous event, at the oracle's ${sym} price at this block.`,
  market: (side: FlowSide) =>
    `The change the oracle's prices made to the dollar value of the ${side === "collateral" ? "collateral" : "debt"} held between the previous event and this one.`,
  before: (side: FlowSide) =>
    `The ${side === "collateral" ? "collateral" : "debt"}'s total in dollars just before this transaction, read from the Pool at the oracle's prices at this block.`,
  asset: (sym: string) =>
    `The ${sym} owed after this transaction, read from the Pool, at the oracle's ${sym} price at this block.`,
  repaid: "The assets this account once borrowed and owes none of after this event.",
  total: (side: FlowSide) =>
    `The ${side === "collateral" ? "collateral" : "debt"}'s total in dollars after this transaction, read from the Pool at the oracle's prices at this block.`,
  health:
    "The Pool's health factor for the account after this transaction: the collateral times the weighted liquidation threshold, divided by the debt; at or below 1 the position can be liquidated.",
  fall: "How far the collateral's total value can fall, the debt's value held, before the health factor reaches 1: one less one over the health factor.",
  ltv: "The debt's dollar value as a share of the collateral's after this transaction, at the oracle's prices at this block.",
  borrowable:
    "What the account can still borrow in dollars before it reaches its max LTV: the max LTV times the collateral, less the debt.",
  max_ltv:
    "The share of the collateral the account can borrow against, each reserve's LTV weighted by its dollar value, from the Pool's configuration at this block.",
  threshold:
    "The share of the collateral above which the debt makes the position liquidatable, each reserve's threshold weighted by its dollar value, from the Pool's configuration at this block.",
  emode:
    "The efficiency-mode category the account had chosen; a reserve in it is borrowed against at the category's LTV and liquidation threshold.",
};

type Leg = "supply" | "debt";
const ZERO = BigInt(0);
const legOf = (r: AaveV3PositionStateReserve, leg: Leg) => (leg === "supply" ? r.supply : r.debt);
const priceOf = (r: AaveV3PositionStateReserve): number | null =>
  r.priceBase != null ? Number(humanOf(r.priceBase, 8)) : null;
const priceWords = (r: AaveV3PositionStateReserve, raws: string[]): string | null =>
  r.priceBase != null && r.decimals != null
    ? `$${priceText(
        r.priceBase,
        raws.map((raw) => ({ raw, decimals: r.decimals! })),
      )}`
    : null;
const pts = (a: number) => `${a.toFixed(2)} pts`;

/** What a figure became since the previous event: after less after then. */
const sinceProv = (what: string): Provenance => ({
  kind: "derived",
  summary: `${what} since the previous event — the figure once this transaction had run, less the figure once the previous transaction on this timeline had run.`,
  formula: "after − after the previous event",
});

/** A token amount's dollars at the oracle's price at this block. */
const atBlockUsdProv = (sym: string, what: string, amount: string, price: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what}, in US dollars — the amount times the oracle's price for ${sym} at this block.`,
  formula: "amount × price",
  inputs: [
    { label: "amount", value: `${amount} ${sym}`, kind: "chain-derived", pclass: "indexed" },
    { label: `${sym} price`, value: `$${price}`, kind: "chain", pclass: "oracle" },
  ],
});

/** The current loan to value of one account side. */
const ltvOf = (a: AaveV3AccountSide): number | null => {
  const coll = baseToUsd(a.totalCollateralBase);
  return coll > 0 ? (baseToUsd(a.totalDebtBase) / coll) * 100 : null;
};

/** One side's panel. */
function sheetSide(
  state: AaveV3PositionState,
  prev: AaveV3PositionState | undefined,
  coords: V3Coords,
  prevCoords: V3Coords,
  side: FlowSide,
  label: string,
  eventTs: number | undefined,
  repaid: string[] | undefined,
): SheetSide {
  const leg: Leg = side === "collateral" ? "supply" : "debt";
  const reserves = state.reserves.filter((r) => r.decimals != null);
  const facts = sideFacts(state, side);
  const usd = sideUsd(side, state, coords, facts, eventTs);

  // The transaction's rows: each reserve it moved on this side.
  const moved = reserves.filter((r) => legChange(legOf(r, leg), r.decimals!).sign !== 0);
  const rows: SheetRow[] = moved.map((r) => {
    const sym = reserveSymbol(r);
    const l = legOf(r, leg);
    const c = legChange(l, r.decimals!);
    const before = humanOf(l.before, r.decimals!);
    const after = humanOf(l.after, r.decimals!);
    const p = priceOf(r);
    const signed = `${c.sign < 0 ? "−" : ""}${fmtPositionAmount(c.magnitude)}`;
    return {
      key: `event-${sym}`,
      label: moved.length > 1 ? `${label} · ${sym}` : label,
      amount: {
        text: signed,
        symbol: sym,
        address: r.reserve,
        info: exactBalanceChangeProv(sym, leg, coords, { before: groupExact(before), after: groupExact(after) }),
        value: `${c.sign < 0 ? "−" : "+"}${groupExact(c.magnitude)}`,
      },
      usd:
        p != null
          ? {
              text: sheetUsd(c.sign * Number(c.magnitude) * p),
              info: atBlockUsdProv(sym, `The ${sym} this transaction moved`, groupExact(c.magnitude), p),
            }
          : undefined,
      tip: TIPS.event(sym, side),
    };
  });

  // The carry-forward layer, where the previous transaction was read.
  const carry: SheetSide["carry"] = [];
  let beforeRow: SheetRow | undefined;
  const fresh = !!prev && prev.txHash.toLowerCase() !== state.txHash.toLowerCase();
  if (fresh && usd?.before) {
    const prevFacts = sideFacts(prev!, side);
    const prevUsd = sideUsd(side, prev!, prevCoords, prevFacts, undefined);
    const lastUsd = prevFacts.offSupply ? prevFacts.held : prevFacts.after;
    if (prevUsd && lastUsd != null)
      carry.push({
        key: "last",
        label: SHEET_WORDS.last,
        usd: { text: prevUsd.after.text, info: prevUsd.after.prov, value: prevUsd.after.value },
        tip: TIPS.last(side),
      });
    // Interest per reserve, at this block's price.
    const since = interestSincePrevious(state, prev);
    const parts = (side === "collateral" ? since?.collateral : since?.debt) ?? [];
    let interestUsd = 0;
    let interestPriced = true;
    const sub: SheetRow[] = parts.map((part) => {
      const r = reserves.find((x) => x.reserve === part.reserve)!;
      const p = r ? priceOf(r) : null;
      const v = p != null ? Number(part.interest) * p : null;
      if (v == null) interestPriced = false;
      else interestUsd += v;
      return {
        key: `interest-${part.symbol}`,
        label: part.symbol,
        note: r ? (priceWords(r, [legOf(r, leg).before]) ?? undefined) : undefined,
        amount: {
          text: fmtPositionAmount(part.interest),
          symbol: part.symbol,
          address: r?.reserve,
          info: prevEventInterestProv(part.symbol, leg, coords),
          value: part.interest,
        },
        usd:
          v != null
            ? {
                text: sheetUsd(v),
                info: atBlockUsdProv(
                  part.symbol,
                  `Interest on ${part.symbol} since the previous event`,
                  part.interest,
                  p!,
                ),
              }
            : undefined,
        tip: TIPS.interestAsset(part.symbol),
      };
    });
    if (sub.length > 0)
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        usd: interestPriced
          ? {
              text: sheetUsd(interestUsd),
              info: {
                kind: "chain-derived",
                pclass: "oracle",
                summary: `Interest on the ${side} since the previous event, in US dollars — every reserve's interest at its oracle price at this block, added up.`,
                formula: "Σ interest × price",
              },
            }
          : undefined,
        tip: TIPS.interest(side),
        sub,
      });
    // The market move: the rest of the change in the Pool's total, which the
    // prices moved; its receipt names each reserve's price at both blocks.
    const beforeUsd = facts.offSupply ? facts.heldBefore : facts.before;
    if (lastUsd != null && beforeUsd != null && interestPriced) {
      const move = beforeUsd - lastUsd - interestUsd;
      const held = reserves.filter((r) => big(legOf(r, leg).before) > ZERO);
      if (Math.abs(move) >= 0.005)
        carry.push({
          key: "market",
          label: SHEET_WORDS.market,
          usd: {
            text: sheetUsd(move, true),
            info: {
              kind: "chain-derived",
              pclass: "oracle",
              summary: `Market move on the ${side} since the previous event — the Pool's total before this transaction, less its total once the previous transaction had run and the interest since, all in US dollars: the change the oracle's prices made to the balances held between the two. No token moved.`,
              formula: "before this event − last event − interest since",
              inputs: held.flatMap((r) => {
                const sym = reserveSymbol(r);
                const then = prev!.reserves.find((x) => x.reserve === r.reserve);
                const p = priceOf(r);
                const pThen = then ? priceOf(then) : null;
                return [
                  ...(pThen != null
                    ? [
                        {
                          label: `${sym} price at the previous event`,
                          value: `$${pThen}`,
                          kind: "chain" as const,
                          pclass: "oracle" as const,
                        },
                      ]
                    : []),
                  ...(p != null
                    ? [
                        {
                          label: `${sym} price at this event`,
                          value: `$${p}`,
                          kind: "chain" as const,
                          pclass: "oracle" as const,
                        },
                      ]
                    : []),
                ];
              }),
            },
          },
          tip: TIPS.market(side),
        });
    }
  }
  if (usd?.before && carry.length > 0)
    beforeRow = {
      key: "before",
      label: SHEET_WORDS.before,
      usd: { text: usd.before.text, info: usd.before.prov, value: usd.before.value },
      tip: TIPS.before(side),
    };

  // With the breakdown, the Debt side lists every reserve it owes.
  const owed = reserves.filter((r) => big(legOf(r, leg).after) > ZERO);
  const assets: SheetRow[] | undefined =
    side === "debt"
      ? owed
          .filter((r) => moved.includes(r) || !isDustRow(r, leg))
          .map((r) => {
            const sym = reserveSymbol(r);
            const after = humanOf(legOf(r, leg).after, r.decimals!);
            const u = exactUsd(state, r, leg, "after", coords);
            return {
              key: `asset-${sym}`,
              label: sym,
              note: priceWords(r, [legOf(r, leg).after]) ?? undefined,
              amount: {
                text: fmtPositionAmount(after),
                symbol: sym,
                address: r.reserve,
                info: exactBalanceProv(
                  sym,
                  leg,
                  "after",
                  coords,
                  exactLeg(legOf(r, leg), "after", r.decimals!, state.blockTimestamp),
                ),
                value: groupExact(after),
              },
              usd: u ? { text: sheetUsd(u.value), info: u.prov, value: u.exact } : undefined,
              tip: TIPS.asset(sym),
            };
          })
      : undefined;
  const icons = owed.filter((r) => moved.includes(r) || !isDustRow(r, leg)).map(reserveSymbol);

  return {
    side,
    icons,
    carry,
    before: beforeRow,
    rows,
    ...(side === "debt" ? { assets, repaid, repaidTip: TIPS.repaid } : {}),
    total: usd ? { text: usd.after.text, info: usd.after.prov, value: usd.after.value } : { none: WORDS.unread },
    totalTip: TIPS.total(side),
  };
}

/** The sheet, from the read around this transaction and the previous one. */
export function aaveFamilySheet({
  state,
  prev,
  coords,
  label,
  eventTs,
  repaid,
  balancesOnly = false,
}: {
  state: AaveV3PositionState;
  prev: AaveV3PositionState | undefined;
  coords: V3Coords;
  /** The event's word ("Supply"), naming its rows. */
  label: string;
  eventTs?: number;
  /** The assets the account once owed and owes none of after the event. */
  repaid?: string[];
  /** A block shared with another of the owner's transactions: the sides
   *  alone, no Risk or Limits panel (`blocksSharedByTransactions`). */
  balancesOnly?: boolean;
}): EventSheet {
  const fresh = !!prev && prev.txHash.toLowerCase() !== state.txHash.toLowerCase();
  const prevCoords: V3Coords = { ...coords, txHash: prev?.txHash, blockNumber: prev?.block };
  const sides = (["collateral", "debt"] as const).map((side) =>
    sheetSide(state, prev, coords, prevCoords, side, label, eventTs, side === "debt" ? repaid : undefined),
  );

  const acc = state.account;
  const prevAcc = fresh ? prev!.account : null;
  if (balancesOnly) return { sides, panels: [] };
  if (!acc)
    return {
      sides,
      panels: [
        {
          panel: "risk",
          rows: [{ key: "health-factor", label: WORDS.health, tip: TIPS.health, value: { none: WORDS.unread } }],
        },
        { panel: "limits", rows: [{ key: "ltv", label: WORDS.ltv, tip: TIPS.ltv, value: { none: WORDS.unread } }] },
      ],
    };
  const a = acc.after;
  const hf = a.healthFactor != null ? wadToNumber(a.healthFactor) : null;
  const hfPrev = prevAcc?.after.healthFactor != null ? wadToNumber(prevAcc.after.healthFactor) : null;
  const hfFig = hfFigure(a, "after", coords);

  // How far the collateral's value can fall, the debt's held, before the
  // health factor reaches 1: 1 − 1 ÷ HF.
  const supplied = state.reserves.filter((r) => big(r.supply.after) > ZERO);
  const owed = state.reserves.filter((r) => big(r.debt.after) > ZERO);
  const sameAsset = supplied.length === 1 && owed.length === 1 && supplied[0].reserve === owed[0].reserve;
  const dropOf = (h: number | null) => (h != null && h > 1 && h < 100 ? (1 - 1 / h) * 100 : null);
  const drop = sameAsset ? null : dropOf(hf);
  const dropPrev = dropOf(hfPrev);
  const dropProv: Provenance = {
    kind: "chain-derived",
    summary:
      "Collateral can fall — how far the collateral's total value can fall, the debt's value held, before the health factor reaches 1 and the position can be liquidated: one less one over the health factor after this transaction.",
    formula: "1 − 1 ÷ health factor",
    inputs: [{ label: "health factor", value: hfFig.text, kind: "chain-derived", pclass: "state" }],
  };

  const risk: SheetStat[] = [
    {
      key: "health-factor",
      label: WORDS.health,
      tip: TIPS.health,
      value: { text: hfFig.text, info: hfFig.prov, value: hfFig.value },
      change:
        hf != null && hfPrev != null && hf < 100 && hfPrev < 100
          ? { text: changeText(hf - hfPrev, (x) => x.toFixed(2)), info: sinceProv("Health factor change") }
          : null,
    },
    {
      key: "collateral-can-fall",
      label: WORDS.fall,
      tip: TIPS.fall,
      value:
        drop != null
          ? { text: `${drop.toFixed(0)}%`, info: dropProv }
          : { none: sameAsset ? WORDS.one_asset : hf == null ? WORDS.no_debt : hf <= 1 ? WORDS.liquidatable : "—" },
      change:
        drop != null && dropPrev != null
          ? {
              text: changeText(drop - dropPrev, (x) => `${x.toFixed(0)} pts`),
              info: sinceProv("The fall's change, in percentage points"),
            }
          : null,
    },
  ];
  const ltv = ltvOf(a);
  const ltvPrev = prevAcc ? ltvOf(prevAcc.after) : null;
  const room = borrowableBase(a);
  const roomUsd = baseToUsd(room.toString());
  const roomPrev = prevAcc ? baseToUsd(borrowableBase(prevAcc.after).toString()) : null;
  const hasCollateral = big(a.totalCollateralBase) > ZERO;
  const inEmode = !!state.emode && (state.emode.before !== 0 || state.emode.after !== 0);
  const limits: SheetStat[] = [
    {
      key: "ltv",
      label: WORDS.ltv,
      tip: TIPS.ltv,
      value:
        ltv != null
          ? {
              text: `${ltv.toFixed(2)}%`,
              value: `${ltv.toFixed(2)}%`,
              info: currentLtvProv("after", coords, {
                debtUsd: baseToUsd(a.totalDebtBase),
                collateralUsd: baseToUsd(a.totalCollateralBase),
              }),
            }
          : { none: "—" },
      change:
        ltv != null && ltvPrev != null
          ? { text: changeText(ltv - ltvPrev, pts), info: sinceProv("LTV change, in percentage points") }
          : null,
    },
    {
      key: "borrowable",
      label: WORDS.borrowable,
      tip: TIPS.borrowable,
      value: hasCollateral
        ? {
            text: room === ZERO ? "$0" : fmtPositionUsd(roomUsd),
            value: roomUsd.toFixed(2),
            info: borrowableProv(coords, {
              ltvBps: a.ltvBps,
              collateralUsd: baseToUsd(a.totalCollateralBase),
              debtUsd: baseToUsd(a.totalDebtBase),
              resultUsd: roomUsd,
            }),
          }
        : { none: "None" },
      change:
        hasCollateral && roomPrev != null
          ? { text: changeText(roomUsd - roomPrev, (x) => sheetUsd(x)), info: sinceProv("Still borrowable change") }
          : null,
    },
  ];
  const params: SheetStat[] = hasCollateral
    ? [
        {
          key: "max-ltv",
          label: WORDS.max_ltv,
          tip: TIPS.max_ltv,
          value: {
            text: bpsPct(a.ltvBps),
            info: accountRatioProv("ltv", "after", coords, { bps: a.ltvBps, emode: inEmode }),
          },
        },
        {
          key: "liquidation-threshold",
          label: WORDS.threshold,
          tip: TIPS.threshold,
          value: {
            text: bpsPct(a.liquidationThresholdBps),
            info: accountRatioProv("lt", "after", coords, { bps: a.liquidationThresholdBps, emode: inEmode }),
          },
        },
        ...(inEmode && state.emode
          ? [
              (() => {
                const f = emodeFigure(state, state.emode!.after, "after", coords);
                return {
                  key: "emode",
                  label: WORDS.emode,
                  tip: TIPS.emode,
                  value: { text: f.text, info: f.prov, value: f.value },
                };
              })(),
            ]
          : []),
      ]
    : [];
  return {
    sides,
    panels: [
      { panel: "risk", rows: risk, caption: drop != null ? WORDS.fall_caption : undefined },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
