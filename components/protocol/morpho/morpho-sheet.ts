// Morpho Blue's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the
// card's `sheet` slot, laid out as the shared sheet
// (components/shared/event-sheet.tsx) from the figures the cells state
// (morpho-cells.tsx) and the market read at the event's block
// (lib/morpho/use-market-at-block.ts).
//
// One collateral and one loan token per market, and no dollar on the page:
// each row and total states its token. Collateral: the event's row, the
// collateral before it, the total after. Debt: the debt at the previous event,
// the interest since, the debt before, the event's row, the total after (the
// Base sweep carries principal alone: the before and the total). Risk: the LTV
// against the market's LLTV and how far the collateral price can fall; Limits:
// what can still be borrowed and the borrow rate; the LLTV and the oracle
// price as parameters. Each Risk and Limits value swaps to its move across the
// event, both sides at the one oracle price. A lender's position draws one
// side, Supplied, and no panels. A position that both lends and borrows keeps
// the cells.

import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText, type SwapFigure } from "@/components/shared/change-swap-value";
import {
  assetsDeltaProv,
  atBlockOraclePriceProv,
  borrowedAfterProv,
  borrowedBeforeProv,
  collateralAfterProv,
  collateralBeforeProv,
  debtAfterProv,
  debtBeforeProv,
  debtChangeProv,
  interestSincePreviousProv,
  liqClearedValueProv,
  liqPriceUsedProv,
  morphoBorrowRateAtBlockProv,
  morphoHealthAtEventProv,
  suppliedAfterProv,
  suppliedBeforeProv,
  supplyAfterProv,
  supplyBeforeProv,
  supplyChangeProv,
  supplyGapSincePreviousProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import {
  fmtMorphoAmount,
  fmtMorphoPrice,
  subDecimal,
  type MorphoAtBlock,
  type MorphoHealthMove,
} from "@/lib/morpho/use-market-at-block";
import { MORPHO_WORDS, PROSE } from "@/lib/morpho/event-templates";
import { soleFlowAddress } from "@/lib/shared/format-event";

const { fillText } = PROSE;

const num = (s: string | undefined): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};
const DUST = 1e-6;
/** "−1.25" for a fall, "1.25" for a rise: the event row's figure. */
const signed = (n: number) => `${n < 0 ? "−" : ""}${fmtMorphoAmount(Math.abs(n))}`;
/** The exact signed figure a receipt keys on. */
const exact = (s: string) => (s.startsWith("-") ? `−${s.slice(1)}` : `+${s}`);
const pctText = (f: number) => `${(f * 100).toFixed(1)}%`;
/** A fall as a percent: one place under 10%, whole above, ">99%" short of all. */
const fallText = (f: number) => {
  const p = f * 100;
  if (p >= 99.5) return ">99%";
  return `${p < 10 ? p.toFixed(1) : Math.round(p).toString()}%`;
};
const pts = (a: number) => `${a.toFixed(2)} pts`;

/** A figure's move across the event: after less before, both at one price. */
const acrossProv = (what: string, formula: string, price: MorphoHealthMove): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what} across this event — the figure after it less the figure before it, the position's collateral and debt either side of the event both valued at the market oracle's price at the end of block ${price.priceBlock}, so the move is the event's alone.`,
  formula,
});

/** How far the collateral price can fall before the LTV reaches the LLTV. */
const fallProv = (
  collSym: string,
  loanSym: string,
  coords: MorphoCoords,
  m: MorphoHealthMove,
  hf: number,
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `Collateral can fall — how far the market oracle's ${collSym} price can fall, the ${loanSym} debt held, before the position's LTV reaches the market's LLTV: one less one over the health factor after this event, with the collateral valued at the oracle's price at the end of block ${m.priceBlock}.`,
  formula: "1 − 1 ÷ health factor; health factor = collateral × price × LLTV ÷ debt",
  inputs: [
    { label: "health factor", value: String(hf), kind: "chain-derived", note: "after the event" },
    { label: "collateral", value: `${m.collAfter} ${collSym}`, kind: "chain", note: "row, after the event" },
    { label: "debt", value: `${m.debtAfter} ${loanSym}`, kind: "chain", note: "row, after the event" },
    { label: "price", value: `${m.price} ${loanSym}`, kind: "chain", note: `oracle, block ${m.priceBlock}` },
    { label: "LLTV", value: String(m.lltv), kind: "chain", note: "market params" },
    ...(coords.blockNumber != null
      ? [{ label: "block", value: String(coords.blockNumber), kind: "chain" as const, note: "event block" }]
      : []),
  ],
});

/** What the position can still borrow: collateral × price × LLTV − debt. */
const borrowableProv = (collSym: string, loanSym: string, m: MorphoHealthMove): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The ${loanSym} the position could still borrow after this event: its ${collSym} collateral valued at the market oracle's price at the end of block ${m.priceBlock}, times the market's LLTV, less its debt. Morpho Blue has one line per market, so the LLTV is the borrow cap.`,
  formula: "collateral × price × LLTV − debt",
  inputs: [
    { label: "collateral", value: `${m.collAfter} ${collSym}`, kind: "chain", note: "row, after the event" },
    { label: "price", value: `${m.price} ${loanSym}`, kind: "chain", note: `oracle, block ${m.priceBlock}` },
    { label: "LLTV", value: String(m.lltv), kind: "chain", note: "market params" },
    { label: "debt", value: `${m.debtAfter} ${loanSym}`, kind: "chain", note: "row, after the event" },
  ],
});

/** The market's LLTV, read with its params at the event's block. */
const lltvAtBlockProv = (coords: MorphoCoords, lltv: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "LLTV — the market's liquidation loan-to-value: the lltv field of its immutable params (Morpho.idToMarketParams), fixed when the market was created. Debt above LLTV × the collateral's value is liquidatable; there is no separate borrow threshold.",
  via: "Morpho.idToMarketParams(id).lltv · 1e18-scaled",
  inputs: [
    { label: "lltv", value: String(lltv), kind: "chain", note: "market params" },
    ...(coords.marketId ? [{ label: "market", value: coords.marketId, kind: "chain" as const }] : []),
  ],
});

/** The debt once the previous event had run: before this one less the
 *  interest between. */
const debtLastProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} owed at the last event — what the position owed once its previous event had run: the debt just before this event less the interest accrued between the two, which is the previous row's debt after.`,
  formula: "debt before − interest since the previous event",
  inputs: [
    { label: "debt before", kind: "chain-derived", pclass: "indexed", note: `${sym} owed just before this event` },
    { label: "interest", kind: "chain-derived", pclass: "indexed", note: "accrued since the previous event" },
    ...(coords.blockNumber != null
      ? [{ label: "block", value: String(coords.blockNumber), kind: "chain" as const, note: "event block" }]
      : []),
  ],
});

/** The supply once the previous event had run: before this one less the
 *  move between. */
const supplyLastProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supplied at the last event — the position's supply once its previous event had run: the supply just before this event less what it earned between the two, which is the previous row's supply after.`,
  formula: "supply before − move since the previous event",
});

export interface MorphoSheetArgs {
  ctx: MorphoContext;
  coords: MorphoCoords;
  flows: AssetFlow[] | undefined;
  /** The event's word ("Supply Collateral"), naming its rows. */
  label: string;
  read: MorphoAtBlock;
  move: MorphoHealthMove | null;
}

/** The sheet of a Morpho Blue event; `undefined` where the cells stand (a
 *  position that lends and borrows), `null` while the market read is out. */
export function morphoSheet({ ctx, coords, flows, label, read, move }: MorphoSheetArgs): EventSheet | null | undefined {
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const collAddr = soleFlowAddress(flows, collSym);
  const loanAddr = soleFlowAddress(flows, loanSym);
  const lenderEv = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  const borrowerHeld =
    num(ctx.collateralAfter) > 0 || num(ctx.debtAfter ?? ctx.borrowedAfter) > DUST || num(ctx.debtBefore) > DUST;
  const supplyHeld = ctx.suppliedAfter != null && (num(ctx.suppliedAfter) > 0 || num(ctx.supplyBefore) > 0);
  if ((lenderEv && borrowerHeld) || (!lenderEv && supplyHeld)) return undefined;

  if (lenderEv) return { sides: [suppliedSide(ctx, coords, label, loanAddr)], panels: [] };

  const collMoved = ctx.side === "collateral";
  const liq = ctx.eventType === "liquidation";

  // ── Collateral ──
  const collRows: SheetRow[] = [];
  if (collMoved)
    collRows.push({
      key: "event",
      label: liq ? MORPHO_WORDS.sheet_seized : label,
      amount: {
        text: signed(num(ctx.assetsDelta)),
        symbol: collSym,
        address: collAddr,
        info: assetsDeltaProv(collSym, "collateral", coords, ctx.eventType),
        value: exact(ctx.assetsDelta),
      },
      tip: liq
        ? fillText(MORPHO_WORDS.tip_coll_seized, { symbol: collSym })
        : fillText(MORPHO_WORDS.tip_coll_event, { symbol: collSym }),
    });
  const collBefore =
    ctx.collateralAfter != null
      ? collMoved
        ? subDecimal(ctx.collateralAfter, ctx.assetsDelta)
        : ctx.collateralAfter
      : undefined;
  const collSide: SheetSide = {
    side: "collateral",
    icons: [collSym],
    carry: [],
    before:
      collBefore != null && !ctx.isOpen
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: fmtMorphoAmount(collBefore),
              symbol: collSym,
              address: collAddr,
              info: collateralBeforeProv(collSym, coords),
              value: collBefore,
            },
            tip: fillText(MORPHO_WORDS.tip_coll_before, { symbol: collSym }),
          }
        : undefined,
    rows: collRows,
    total:
      ctx.collateralAfter != null
        ? {
            text: `${fmtMorphoAmount(ctx.collateralAfter)} ${collSym}`,
            info: collateralAfterProv(collSym, coords),
            value: ctx.collateralAfter,
          }
        : { none: MORPHO_WORDS.sheet_not_loaded },
    totalTip: fillText(MORPHO_WORDS.tip_coll_total, { symbol: collSym }),
  };

  // ── Debt ──
  const debtMoved = ctx.eventType === "borrow" || ctx.eventType === "repay" || liq;
  const debtSide =
    ctx.debtAfter != null
      ? owedSide(ctx, coords, label, loanAddr, debtMoved)
      : borrowedSide(ctx, coords, label, loanAddr, debtMoved);

  // ── Risk and Limits ──
  if (read.status === "loading") return null;
  const missing = { none: read.status === "miss" ? MORPHO_WORDS.sheet_no_read : MORPHO_WORDS.sheet_unread };
  const lltv = read.status === "ok" ? read.lltv : null;
  const risk: SheetStat[] = [];
  const limits: SheetStat[] = [];
  const ltvLabel = lltv != null ? fillText(MORPHO_WORDS.sheet_ltv, { lltv: pctText(lltv) }) : MORPHO_WORDS.sheet_lltv;
  if (move) {
    const vals = (side: "before" | "after") => ({
      collateral: String(side === "before" ? move.collBefore : move.collAfter),
      debt: String(side === "before" ? move.debtBefore : move.debtAfter),
      price: move.price,
      priceBlock: move.priceBlock,
      lltv: move.lltv,
      liquidation: move.liquidationPrice,
    });
    // LTV after, and its move in points where both sides carry debt.
    const ltvFig = (l: number | null): SwapFigure | { none: string } =>
      l == null
        ? { none: MORPHO_WORDS.sheet_no_debt }
        : {
            text: l > 0 && l < 0.001 ? "<0.1%" : pctText(l),
            info: morphoHealthAtEventProv("LTV", "after", collSym, loanSym, coords, vals("after")),
            value: String(l),
          };
    risk.push({
      key: "ltv",
      label: ltvLabel,
      tip: MORPHO_WORDS.tip_ltv,
      value: ltvFig(move.ltvAfter),
      change:
        move.ltvAfter != null && move.ltvBefore != null
          ? {
              text: changeText((move.ltvAfter - move.ltvBefore) * 100, pts),
              info: acrossProv("The LTV's move", "LTV after − LTV before", move),
            }
          : null,
    });
    const fall = (hf: number | null) => (hf == null ? null : 1 - 1 / hf);
    const fAfter = fall(move.hfAfter);
    const fBefore = fall(move.hfBefore);
    risk.push({
      key: "collateral-can-fall",
      label: MORPHO_WORDS.sheet_fall,
      tip: fillText(MORPHO_WORDS.tip_fall, { symbol: collSym }),
      value:
        fAfter == null
          ? { none: MORPHO_WORDS.sheet_no_debt }
          : fAfter <= 0
            ? { none: MORPHO_WORDS.sheet_past_line }
            : {
                text: fallText(fAfter),
                info: fallProv(collSym, loanSym, coords, move, move.hfAfter!),
                value: String(fAfter),
              },
      change:
        fAfter != null && fBefore != null && fAfter > 0 && fBefore > 0
          ? {
              text: changeText((fAfter - fBefore) * 100, pts),
              info: acrossProv("How far the collateral can fall, its move", "fall after − fall before", move),
            }
          : null,
    });
    const room = (c: number, d: number) => Math.max(0, c * move.price * move.lltv - d);
    const roomAfter = room(move.collAfter, move.debtAfter);
    const roomBefore = room(move.collBefore, move.debtBefore);
    limits.push({
      key: "borrowable",
      label: MORPHO_WORDS.sheet_borrowable,
      tip: MORPHO_WORDS.tip_borrowable,
      value: {
        text: `${fmtMorphoAmount(roomAfter)} ${loanSym}`,
        info: borrowableProv(collSym, loanSym, move),
        value: String(roomAfter),
      },
      change:
        move.collBefore > 0 || move.debtBefore > 0
          ? {
              text: changeText(roomAfter - roomBefore, (a) => `${fmtMorphoAmount(a)} ${loanSym}`),
              info: acrossProv("What the position can still borrow, its move", "still borrowable after − before", move),
            }
          : null,
    });
  } else {
    // The Base sweep states principal alone, so the figures that need the debt
    // with its interest at the block stand unread.
    risk.push(
      { key: "ltv", label: ltvLabel, tip: MORPHO_WORDS.tip_ltv, value: missing },
      {
        key: "collateral-can-fall",
        label: MORPHO_WORDS.sheet_fall,
        tip: fillText(MORPHO_WORDS.tip_fall, { symbol: collSym }),
        value: missing,
      },
    );
    limits.push({
      key: "borrowable",
      label: MORPHO_WORDS.sheet_borrowable,
      tip: MORPHO_WORDS.tip_borrowable,
      value: missing,
    });
  }
  const apr = read.status === "ok" ? read.at.borrowApr : null;
  limits.push({
    key: "rate",
    label: MORPHO_WORDS.sheet_rate,
    tip: MORPHO_WORDS.tip_rate,
    value:
      read.status === "ok" && apr != null
        ? {
            text: `${(apr * 100).toFixed(2)}% APR`,
            info: morphoBorrowRateAtBlockProv(coords, read.at.block, apr),
            value: String(apr),
          }
        : { none: MORPHO_WORDS.sheet_no_read },
  });

  // The market's parameters: its LLTV and the oracle price the panels use.
  const price = move?.price ?? (read.status === "ok" && read.prev.price > 0 ? read.prev.price : null);
  const priceBlock = move?.priceBlock ?? (read.status === "ok" ? read.prev.block : null);
  const params: SheetStat[] = [
    {
      key: "lltv",
      label: MORPHO_WORDS.sheet_lltv,
      tip: MORPHO_WORDS.tip_lltv,
      value: lltv != null ? { text: pctText(lltv), info: lltvAtBlockProv(coords, lltv), value: String(lltv) } : missing,
    },
    {
      key: "oracle",
      label: MORPHO_WORDS.sheet_oracle,
      tip: fillText(MORPHO_WORDS.tip_oracle, { symbol: collSym }),
      value:
        price != null && priceBlock != null
          ? {
              text: `${fmtMorphoPrice(price)} ${loanSym}`,
              info: move?.liquidationPrice
                ? liqPriceUsedProv(collSym, loanSym, coords, price, priceBlock)
                : atBlockOraclePriceProv(collSym, loanSym, coords, price),
              value: String(price),
            }
          : missing,
    },
  ];

  return {
    sides: [collSide, debtSide],
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}

/** The debt as the index states it: borrow shares at the market's totals. */
function owedSide(
  ctx: MorphoContext,
  coords: MorphoCoords,
  label: string,
  addr: string | undefined,
  moved: boolean,
): SheetSide {
  const sym = ctx.loanSymbol;
  const after = ctx.debtAfter!;
  const amount = (text: string, info: Provenance, value: string) => ({ text, symbol: sym, address: addr, info, value });
  const rows: SheetRow[] = [];
  if (moved) {
    const change = ctx.debtChange ?? (ctx.debtBefore != null ? subDecimal(after, ctx.debtBefore) : null);
    if (change != null)
      rows.push({
        key: "event",
        label: ctx.eventType === "liquidation" ? MORPHO_WORDS.sheet_cleared : label,
        amount: amount(signed(num(change)), debtChangeProv(sym, coords), exact(change)),
        tip: ctx.eventType === "liquidation" ? MORPHO_WORDS.tip_debt_cleared : MORPHO_WORDS.tip_debt_event,
      });
    else if (ctx.eventType === "liquidation" && ctx.loanRepaid != null)
      rows.push({
        key: "event",
        label: MORPHO_WORDS.sheet_cleared,
        amount: amount(
          signed(-num(ctx.loanRepaid)),
          liqClearedValueProv(sym, coords, { amount: ctx.loanRepaid }),
          `−${ctx.loanRepaid}`,
        ),
        tip: MORPHO_WORDS.tip_debt_cleared,
      });
  }
  const carry: SheetSide["carry"] = [];
  const before = ctx.debtBefore;
  if (before != null && !ctx.isOpen && (num(before) > DUST || num(after) > DUST)) {
    const interest = ctx.interestSincePrevious;
    const last = interest ? subDecimal(before, interest) : before;
    carry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: amount(fmtMorphoAmount(last), debtLastProv(sym, coords), last),
      tip: fillText(MORPHO_WORDS.tip_debt_last, { symbol: sym }),
    });
    if (interest)
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        amount: amount(signed(num(interest)), interestSincePreviousProv(sym, coords), exact(interest)),
        tip: MORPHO_WORDS.tip_debt_interest,
      });
  }
  return {
    side: "debt",
    icons: [sym],
    carry,
    before:
      carry.length > 0 && before != null
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: amount(fmtMorphoAmount(before), debtBeforeProv(sym, coords), before),
            tip: fillText(MORPHO_WORDS.tip_debt_before, { symbol: sym }),
          }
        : undefined,
    rows,
    total: { text: `${fmtMorphoAmount(after)} ${sym}`, info: debtAfterProv(sym, coords), value: after },
    totalTip: fillText(MORPHO_WORDS.tip_debt_total, { symbol: sym }),
  };
}

/** The debt as the Base sweep states it: the borrowed principal. */
function borrowedSide(
  ctx: MorphoContext,
  coords: MorphoCoords,
  label: string,
  addr: string | undefined,
  moved: boolean,
): SheetSide {
  const sym = ctx.loanSymbol;
  const after = ctx.borrowedAfter;
  const stated = moved && ctx.side === "loan";
  const before = after != null ? (stated ? subDecimal(after, ctx.assetsDelta) : after) : undefined;
  return {
    side: "debt",
    icons: [sym],
    carry: [],
    before:
      before != null && !ctx.isOpen
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: fmtMorphoAmount(before),
              symbol: sym,
              address: addr,
              info: borrowedBeforeProv(sym, coords),
              value: before,
            },
            tip: fillText(MORPHO_WORDS.tip_borrowed_before, { symbol: sym }),
          }
        : undefined,
    rows: stated
      ? [
          {
            key: "event",
            label,
            amount: {
              text: signed(num(ctx.assetsDelta)),
              symbol: sym,
              address: addr,
              info: assetsDeltaProv(sym, "loan", coords, ctx.eventType),
              value: exact(ctx.assetsDelta),
            },
            tip: fillText(MORPHO_WORDS.tip_borrowed_event, { symbol: sym }),
          },
        ]
      : [],
    total:
      after != null
        ? { text: `${fmtMorphoAmount(after)} ${sym}`, info: borrowedAfterProv(sym, coords), value: after }
        : { none: MORPHO_WORDS.sheet_not_loaded },
    totalTip: fillText(MORPHO_WORDS.tip_borrowed_total, { symbol: sym }),
  };
}

/** A lender's one side: the supply, at the market's totals where the row
 *  carries them, else the principal. */
function suppliedSide(ctx: MorphoContext, coords: MorphoCoords, label: string, addr: string | undefined): SheetSide {
  const sym = ctx.loanSymbol;
  const after = ctx.suppliedAfter;
  const amount = (text: string, info: Provenance, value: string) => ({ text, symbol: sym, address: addr, info, value });
  const base = { side: "collateral" as const, name: MORPHO_WORDS.sheet_supplied, icons: [sym] };
  if (after != null && ctx.supplyBefore != null) {
    const before = ctx.supplyBefore;
    const change = ctx.supplyChange ?? subDecimal(after, before);
    const gap = ctx.supplyGapSincePrevious;
    const carry: SheetSide["carry"] = [];
    if (!ctx.isOpen && (num(before) > 0 || gap)) {
      const last = gap ? subDecimal(before, gap) : before;
      carry.push({
        key: "last",
        label: SHEET_WORDS.last,
        amount: amount(fmtMorphoAmount(last), supplyLastProv(sym), last),
        tip: fillText(MORPHO_WORDS.tip_supply_last, { symbol: sym }),
      });
      if (gap)
        carry.push({
          key: "interest",
          label: SHEET_WORDS.interest,
          amount: amount(signed(num(gap)), supplyGapSincePreviousProv(sym, coords), exact(gap)),
          tip: MORPHO_WORDS.tip_supply_interest,
        });
    }
    return {
      ...base,
      carry,
      before:
        carry.length > 0
          ? {
              key: "before",
              label: SHEET_WORDS.before,
              amount: amount(fmtMorphoAmount(before), supplyBeforeProv(sym, coords), before),
              tip: fillText(MORPHO_WORDS.tip_supply_before, { symbol: sym }),
            }
          : undefined,
      rows: [
        {
          key: "event",
          label,
          amount: amount(signed(num(change)), supplyChangeProv(sym, coords), exact(change)),
          tip: MORPHO_WORDS.tip_supply_event,
        },
      ],
      total: { text: `${fmtMorphoAmount(after)} ${sym}`, info: supplyAfterProv(sym, coords), value: after },
      totalTip: fillText(MORPHO_WORDS.tip_supply_total, { symbol: sym }),
    };
  }
  const before = after != null ? subDecimal(after, ctx.assetsDelta) : undefined;
  return {
    ...base,
    carry: [],
    before:
      before != null && !ctx.isOpen
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: amount(fmtMorphoAmount(before), suppliedBeforeProv(sym, coords), before),
            tip: fillText(MORPHO_WORDS.tip_supplied_before, { symbol: sym }),
          }
        : undefined,
    rows: [
      {
        key: "event",
        label,
        amount: amount(
          signed(num(ctx.assetsDelta)),
          assetsDeltaProv(sym, "loan", coords, ctx.eventType),
          exact(ctx.assetsDelta),
        ),
        tip: fillText(MORPHO_WORDS.tip_supplied_event, { symbol: sym }),
      },
    ],
    total:
      after != null
        ? { text: `${fmtMorphoAmount(after)} ${sym}`, info: suppliedAfterProv(sym, coords), value: after }
        : { none: MORPHO_WORDS.sheet_not_loaded },
    totalTip: fillText(MORPHO_WORDS.tip_supplied_total, { symbol: sym }),
  };
}
