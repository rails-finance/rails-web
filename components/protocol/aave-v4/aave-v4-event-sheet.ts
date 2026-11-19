// Aave V4's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330), laid out as
// the shared sheet (components/shared/event-sheet.tsx) from the event's spoke
// snapshot (allSupplies / allDebts with each asset's price at this block), the
// previous event's snapshot on the same spoke, and the spoke's
// getUserAccountData read either side of the block (use-health-factor-around).
//
// Per side: the total after the previous event ("Last event"), each asset's
// interest since it at this block's price, the market move between them (the
// rest of the change in the total), the total before this event, the asset the
// event moved, every asset held, and the total after. Risk: the health factor
// and how far the collateral's value can fall before it reaches 1. Limits: the
// loan to value and what can still be borrowed; the collateral factor the
// health factor weighs the collateral by as the liquidation threshold. A
// collateral toggle moves no balance and keeps its cell.

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
import type { AaveV4Context, AaveV4PriceSource } from "@/lib/shared/types/protocols/aave-v4";
import type { AaveV4SnapshotItem } from "@/lib/shared/types/event-shape";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import { amountsUsd, cellOf, marketMoveUsd, type PricedAmount } from "@/lib/shared/sheet-usd-rows";
import { priceText } from "@/lib/shared/shown-usd";
import { aaveV4PriceNote } from "@/lib/aave-v4/price-notes";
import { UNPRICED_DUST_TOKENS } from "@/lib/aave-v4/unpriced";
import { fmtV4Amount, hfLabelV4, HF_CAP } from "@/lib/aave-v4/format";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { hfOf, premiumAt, type HealthFactorAround } from "@/lib/aave-v4/use-health-factor-around";
import {
  chainBalanceProv,
  deltaProv,
  healthFactorAtBlockProv,
  interestSincePreviousProv,
  isOnChainPriceSource,
  snapshotProv,
  type EventProvDetail,
} from "@/lib/aave-v4/position-provenance";

const WORDS = {
  health: "Health factor",
  fall: "Collateral can fall",
  fall_caption: "Before liquidation, if the debt’s value holds.",
  no_debt: "No debt",
  liquidatable: "Below 1",
  one_asset: "One asset on both sides",
  ltv: "LTV",
  borrowable: "Remaining borrowing power",
  threshold: "Collateral factor",
  unread: "Not read on this page",
  no_read: "Not available at this block",
  no_price: (syms: string[]) => `No price at this block for ${syms.join(", ")}`,
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  event: (sym: string, side: FlowSide) =>
    `The ${sym} this event moved on the ${side === "collateral" ? "supplied" : "borrowed"} side: the spoke's balance after it less the balance before, at the ${sym} price at this block.`,
  last: (side: FlowSide) =>
    `The ${side}'s total in dollars once the previous event on this spoke had run, from that event's balances at that block's prices.`,
  interest: (side: FlowSide) =>
    `The interest every asset on this side ${side === "collateral" ? "earned" : "accrued"} since the previous event on this spoke, at the prices at this block.`,
  interestAsset: (sym: string, side: FlowSide) =>
    `The interest ${side === "collateral" ? "earned on" : "accrued on"} ${sym} since the previous event: the balance before this event less the balance after that one, at the ${sym} price at this block.`,
  market: (side: FlowSide) =>
    `The change the prices made to the dollar value of the ${side} held between the previous event and this one.`,
  before: (side: FlowSide) => `The ${side}'s total in dollars just before this event, at the prices at this block.`,
  asset: (sym: string, side: FlowSide) =>
    `The ${sym} ${side === "collateral" ? "supplied" : "owed"} after this event, from the spoke's snapshot, at the ${sym} price at this block.`,
  repaid: "The assets this position once borrowed on this spoke and owes none of after this event.",
  total: (side: FlowSide) =>
    `The ${side}'s total in dollars after this event: every asset's balance on the spoke at its price at this block. Where the side holds one asset, its amount stands beside the dollars.`,
  health:
    "The spoke's health factor for the position at the end of this event's block, from getUserAccountData: the collateral weighted by its collateral factors, divided by the debt; below 1.0 the position can be liquidated.",
  fall: "How far the collateral's total value can fall, the debt's value held, before the health factor reaches 1: one less one over the health factor.",
  ltv: "Loan to value: the debt's dollar value as a share of the supplied assets' dollar value after this event, at the prices at this block.",
  borrowable:
    "What the position can still borrow in dollars before its health factor reaches 1: the debt times the health factor less one, or with no debt the collateral times its collateral factor.",
  threshold:
    "The collateral factor the spoke weighs this position's collateral by, each asset's factor weighted by its value, from getUserAccountData at the end of this event's block.",
};

type Side = "supply" | "debt";
type Price = { usd: number; source: AaveV4PriceSource; block?: number };
type Holding = { symbol: string; amount: string; price?: Price };

/** Exact decimal arithmetic on the wire's decimal strings: a − b. */
function decSub(a: string, b: string): string {
  const frac = (s: string) => (s.split(".")[1] ?? "").length;
  const d = Math.max(frac(a), frac(b));
  const units = (s: string) => {
    const neg = s.startsWith("-");
    const [i, f = ""] = s.replace(/^-/, "").split(".");
    const v = BigInt((i || "0") + f.padEnd(d, "0"));
    return neg ? -v : v;
  };
  const diff = units(a) - units(b);
  const neg = diff < BigInt(0);
  const abs = (neg ? -diff : diff).toString().padStart(d + 1, "0");
  const int = abs.slice(0, abs.length - d);
  const fr = d > 0 ? abs.slice(abs.length - d).replace(/0+$/, "") : "";
  return `${neg ? "-" : ""}${int}${fr ? `.${fr}` : ""}`;
}

/** An asset's price at an event's block: the snapshot row's, else the event's
 *  primary price for the asset it moved. */
function priceOf(ctx: AaveV4Context, item: Holding): Price | undefined {
  const p = rawPriceOf(ctx, item);
  // An on-chain read only: a $1 pin or an off-chain aggregate is no price.
  return p && isOnChainPriceSource(p.source) ? p : undefined;
}
function rawPriceOf(ctx: AaveV4Context, item: Holding): Price | undefined {
  if (item.price) return item.price;
  if (ctx.eventType === "liquidation") {
    if (item.symbol === ctx.collateralSymbol) return ctx.collateralPrice;
    if (item.symbol === ctx.reserveSymbol) return ctx.debtPrice;
    return undefined;
  }
  return item.symbol === ctx.reserveSymbol ? ctx.price : undefined;
}

/** The asset an event moved on a side, with its balances either side. */
function movedOn(ctx: AaveV4Context, leg: Side): { symbol: string; before: string; after: string } | null {
  const liq = ctx.eventType === "liquidation";
  if (leg === "supply") {
    const sym = liq
      ? ctx.collateralSymbol
      : ctx.eventType === "supply" || ctx.eventType === "withdraw"
        ? ctx.reserveSymbol
        : undefined;
    return sym ? { symbol: sym, before: ctx.supplyBefore ?? "0", after: ctx.supplyAfter ?? "0" } : null;
  }
  const sym = liq || ctx.eventType === "borrow" || ctx.eventType === "repay" ? ctx.reserveSymbol : undefined;
  return sym ? { symbol: sym, before: ctx.debtBefore ?? "0", after: ctx.debtAfter ?? "0" } : null;
}

type Moved = { symbol: string; before: string; after: string; src: AaveV4Context };

/** Every asset an event moved on a side: its own, and on a position swap the
 *  received leg's (lib/aave-v4/swaps.ts). */
function movesOn(ctx: AaveV4Context, leg: Side): Moved[] {
  const received = ctx.swap?.received.context?.data as AaveV4Context | undefined;
  return [ctx, received].flatMap((c) => {
    const m = c ? movedOn(c, leg) : null;
    return m && c ? [{ ...m, src: c }] : [];
  });
}

/** A side's holdings after an event: the snapshot, or the moved asset alone
 *  where the event carries no snapshot. */
function holdingsOf(ctx: AaveV4Context, leg: Side): Holding[] {
  const snap: AaveV4SnapshotItem[] | undefined = leg === "supply" ? ctx.allSupplies : ctx.allDebts;
  if (snap) return snap.filter((s) => Number(s.amount) > 0);
  const m = movedOn(ctx, leg);
  return m && Number(m.after) > 0 ? [{ symbol: m.symbol, amount: m.after }] : [];
}

// Each dollar cell is its rows' cents, shown to the dollar, each price named
// with its read and block (lib/shared/sheet-usd-rows.ts, ui-jobs 743).
const VIA = "the spoke's snapshot around the event · each asset's amount × its price at its block";
/** A holding's amount at its price, named by its read and block. */
const pricedOf = (sym: string, amount: number, p: Price | undefined, block: number | undefined): PricedAmount => ({
  symbol: sym,
  amount,
  price: p?.usd ?? null,
  block: p?.block ?? block ?? null,
  ...(p
    ? { priceNote: aaveV4PriceNote(p.source as Parameters<typeof aaveV4PriceNote>[0], sym, p.block ?? block ?? null) }
    : {}),
});

/** Dollars over a list of holdings, each at its price as shown: an asset with
 *  no price above dust is named and leaves the sum with no figure (RULE: Rails
 *  never invents a price, lib/aave-v4/unpriced.ts). */
function sumOf(ctx: AaveV4Context, items: Holding[], what: string, block: number | undefined) {
  const legs: PricedAmount[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const n = Number(item.amount);
    if (!(n > 0)) continue;
    const p = priceOf(ctx, item);
    const sym = aaveV4DisplaySymbol(item.symbol);
    if (p) legs.push(pricedOf(sym, n, p, block));
    else if (n > UNPRICED_DUST_TOKENS) {
      missing.push(sym);
      legs.push(pricedOf(sym, n, undefined, block));
    }
  }
  const cell = amountsUsd(what, legs, { amountNote: "the balance in the spoke's snapshot", via: VIA });
  return { cell, usd: cell.usd, missing };
}

/** A price as the sub-rows print it. */
const priceNote = (p: Price | undefined) => (p ? priceText(p.usd) : undefined);

const sinceProv = (what: string): Provenance => ({
  kind: "derived",
  summary: `${what} since the previous event. The figure once this event had run, less the figure once the previous event on this spoke had run.`,
  formula: "after − after the previous event",
});

function sheetSide({
  ctx,
  prev,
  prevBlock,
  side,
  coord,
  label,
  address,
  hf,
  repaid,
}: {
  ctx: AaveV4Context;
  prev: AaveV4Context | undefined;
  prevBlock?: number;
  side: FlowSide;
  coord: EventProvDetail;
  label: string;
  address?: string;
  hf: HealthFactorAround;
  repaid?: string[];
}): { side: SheetSide; usd: number | null } {
  const leg: Side = side === "collateral" ? "supply" : "debt";
  const after = holdingsOf(ctx, leg);
  const moves = movesOn(ctx, leg);
  const moved = moves[0] ?? null;
  const chain = ctx.balanceBasis === "chain";

  // The event's rows: each asset it moved on this side.
  const rows: SheetRow[] = [];
  for (const moved of moves) {
    const delta = decSub(moved.after, moved.before);
    const n = Number(delta);
    if (n !== 0) {
      const sym = aaveV4DisplaySymbol(moved.symbol);
      const p = priceOf(moved.src, { symbol: moved.symbol, amount: moved.after });
      const abs = delta.replace(/^-/, "");
      rows.push({
        key: `event-${sym}`,
        label,
        amount: {
          text: `${n < 0 ? "−" : ""}${fmtV4Amount(abs)}`,
          symbol: moved.symbol,
          address: moved.src === ctx ? address : undefined,
          info: deltaProv({ ...coord, asset: sym }),
          value: `${n < 0 ? "−" : "+"}${abs}`,
        },
        usd: cellOf(
          amountsUsd(`The ${sym} this event moved, in USD`, [pricedOf(sym, n, p, coord.blockNumber)], {
            amountNote: "the balance after the event less the balance before it",
            via: VIA,
          }),
        ),
        tip: TIPS.event(sym, side),
      });
    }
  }

  // The balances just before this event: the snapshot, with the moved asset
  // at its before-balance.
  const beforeItems: Holding[] = after.map((h) => {
    const m = moves.find((x) => x.symbol === h.symbol);
    return m ? { ...h, amount: m.before } : h;
  });
  for (const m of moves)
    if (!after.some((h) => h.symbol === m.symbol) && Number(m.before) > 0) {
      const fromSnap = (leg === "supply" ? ctx.allSupplies : ctx.allDebts)?.find((s) => s.symbol === m.symbol);
      beforeItems.push({
        symbol: m.symbol,
        amount: m.before,
        price: fromSnap?.price ?? priceOf(m.src, { symbol: m.symbol, amount: m.before }),
      });
    }

  // The carry-forward layer, from the previous event's snapshot on this spoke.
  const carry: SheetSide["carry"] = [];
  let beforeRow: SheetRow | undefined;
  // A side that held nothing then and nothing before this event has no carry.
  const prevItems = prev ? holdingsOf(prev, leg) : [];
  if (prev && (prevItems.length > 0 || beforeItems.some((h) => Number(h.amount) > 0))) {
    const last = sumOf(prev, prevItems, `The ${side} once the previous event on this spoke had run, in USD`, prevBlock);
    const beforeSum = sumOf(ctx, beforeItems, `The ${side} just before this event, in USD`, coord.blockNumber);
    carry.push({
      key: "last",
      label: SHEET_WORDS.last,
      usd: cellOf(last.cell),
      tip: TIPS.last(side),
    });
    // Interest per asset: the balance before this event less the balance after
    // the previous one; no event moved the shares between them.
    const legs: PricedAmount[] = [];
    let complete = true;
    const sub: SheetRow[] = [];
    for (const h of beforeItems) {
      const then = prevItems.find((x) => x.symbol === h.symbol);
      if (!then) {
        complete = false;
        continue;
      }
      const gain = decSub(h.amount, then.amount);
      const g = Number(gain);
      if (!(g > 0)) continue;
      const sym = aaveV4DisplaySymbol(h.symbol);
      const p = priceOf(ctx, h);
      const leg1 = pricedOf(sym, g, p, coord.blockNumber);
      legs.push(leg1);
      sub.push({
        key: `interest-${sym}`,
        label: sym,
        note: priceNote(p),
        amount: {
          text: fmtV4Amount(gain),
          symbol: h.symbol,
          address: moved && h.symbol === moved.symbol ? address : undefined,
          info: interestSincePreviousProv({ ...coord, asset: sym }, leg),
          value: gain,
        },
        usd: cellOf(
          amountsUsd(`Interest on ${sym} since the previous event, in USD`, [leg1], {
            amountNote: "the balance before this event less the balance once the previous one had run",
            via: VIA,
          }),
        ),
        tip: TIPS.interestAsset(sym, side),
      });
    }
    const interestCell =
      sub.length > 0
        ? amountsUsd(`Interest on the ${side} since the previous event, in USD`, legs, {
            amountNote: "the balance before this event less the balance once the previous one had run",
            via: VIA,
          })
        : null;
    if (interestCell)
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        // An asset not held at the previous event leaves the interest unstated.
        usd: complete ? cellOf(interestCell) : undefined,
        tip: TIPS.interest(side),
        sub,
      });
    // The market move: the rest of the change in the total, which the prices
    // made; the difference of the totals' shown products.
    if (complete) {
      const move = marketMoveUsd(
        `Market move on the ${side} since the previous event`,
        beforeSum.cell,
        last.cell,
        interestCell,
      );
      if (move.usd == null || Math.abs(move.usd) >= 0.005)
        carry.push({
          key: "market",
          label: SHEET_WORDS.market,
          usd: cellOf(move),
          tip: TIPS.market(side),
        });
    }
    if (carry.length > 0)
      beforeRow = {
        key: "before",
        label: SHEET_WORDS.before,
        usd: cellOf(beforeSum.cell),
        tip: TIPS.before(side),
      };
  }

  /** A balance after the event, with its receipt. */
  const amountAfter = (h: Holding): SheetRow["amount"] => {
    const sym = aaveV4DisplaySymbol(h.symbol);
    const mv = moves.find((m) => m.symbol === h.symbol);
    const isMoved = mv != null;
    const raw = mv?.src.raw;
    const detail = { ...coord, asset: sym };
    return {
      text: fmtV4Amount(h.amount),
      symbol: h.symbol,
      address: moved?.symbol === h.symbol ? address : undefined,
      info:
        isMoved && chain
          ? chainBalanceProv(
              "Balance after this event",
              detail,
              leg,
              leg === "supply"
                ? {
                    value: raw?.supplyAfter,
                    shares: raw?.supplySharesAfter,
                    a: raw?.hubAddedAssets,
                    b: raw?.hubAddedShares,
                  }
                : { value: raw?.debtAfter, shares: raw?.drawnSharesAfter, a: raw?.hubDrawnIndex },
              leg === "debt" ? premiumAt(hf, "after") : undefined,
            )
          : snapshotProv(
              "Balance after this event",
              { ...detail, raw: isMoved ? raw?.[leg === "supply" ? "supplyAfter" : "debtAfter"] : undefined },
              leg,
            ),
      value: h.amount,
    };
  };
  // With the breakdown, every asset the side holds after the event.
  const assets: SheetRow[] = after.map((h) => {
    const sym = aaveV4DisplaySymbol(h.symbol);
    const p = priceOf(ctx, h);
    return {
      key: `asset-${sym}`,
      label: sym,
      note: priceNote(p),
      amount: amountAfter(h),
      usd: cellOf(
        amountsUsd(`The ${sym} after this event, in USD`, [pricedOf(sym, Number(h.amount), p, coord.blockNumber)], {
          amountNote: "the balance in the spoke's snapshot",
          via: VIA,
        }),
      ),
      tip: TIPS.asset(sym, side),
    };
  });

  const total = sumOf(ctx, after, `The ${side} after this event, in USD`, coord.blockNumber);
  // Where the spoke's snapshot shows one asset held after the event, or none
  // after it emptied the one it moved, the total states its amount (decision
  // 0042, point 9). Without a snapshot the side's other assets are unknown.
  const snapped = (leg === "supply" ? ctx.allSupplies : ctx.allDebts) != null;
  const sole: Holding | undefined = !snapped
    ? undefined
    : after.length === 1
      ? after[0]
      : after.length === 0 && moved && Number(moved.before) > 0
        ? { symbol: moved.symbol, amount: "0" }
        : undefined;
  return {
    usd: total.missing.length === 0 ? total.usd : null,
    side: {
      side,
      icons: after.map((h) => h.symbol),
      carry,
      before: beforeRow,
      rows,
      assets,
      ...(side === "debt" ? { repaid, repaidTip: TIPS.repaid } : {}),
      total: total.missing.length === 0 ? cellOf(total.cell) : { none: WORDS.no_price(total.missing) },
      totalAmount: sole && amountAfter(sole),
      totalTip: TIPS.total(side),
    },
  };
}

/** The loan to value from a snapshot's two sums, in percent. */
function ltvOf(ctx: AaveV4Context): number | null {
  const c = sumOf(ctx, holdingsOf(ctx, "supply"), "Supplied", undefined);
  const d = sumOf(ctx, holdingsOf(ctx, "debt"), "Owed", undefined);
  if (c.usd == null || d.usd == null || !(c.usd > 0)) return null;
  return (d.usd / c.usd) * 100;
}

/** The sheet for an Aave V4 event. `undefined` for a collateral toggle (its
 *  cell stands); `null` while the spoke's read around the block is pending. */
export function aaveV4Sheet({
  ctx,
  prev,
  prevBlock,
  coord,
  label,
  address,
  hf,
  repaid,
}: {
  ctx: AaveV4Context;
  /** The previous event on this spoke, whose snapshot the carry layer reads. */
  prev?: AaveV4Context;
  /** That event's block, which its snapshot's prices stand at. */
  prevBlock?: number;
  coord: EventProvDetail;
  /** The event's word ("Supply"), naming its rows. */
  label: string;
  /** The moved reserve's contract, from the event's flows. */
  address?: string;
  hf: HealthFactorAround;
  /** The assets the position once owed on this spoke and owes none of after the event. */
  repaid?: string[];
}): EventSheet | null | undefined {
  if (ctx.eventType === "collateral_toggle") return undefined;
  if (hf.status === "loading") return null;

  const coll = sheetSide({ ctx, prev, prevBlock, side: "collateral", coord, label, address, hf });
  const debt = sheetSide({ ctx, prev, prevBlock, side: "debt", coord, label, address, hf, repaid });

  // Risk: the spoke's health factor at the end of the block, and the fall it
  // leaves the collateral before it reaches 1.
  const read = hf.status === "ok" ? hf.after : null;
  const h = read ? hfOf(read.wad) : null;
  const supplied = holdingsOf(ctx, "supply");
  const owed = holdingsOf(ctx, "debt");
  const sameAsset = supplied.length === 1 && owed.length === 1 && supplied[0].symbol === owed[0].symbol;
  const drop = !sameAsset && h != null && h >= 1 && h < HF_CAP ? (1 - 1 / h) * 100 : null;
  const hfText = hfLabelV4(h);
  const risk: SheetStat[] = [
    {
      key: "health-factor",
      label: WORDS.health,
      tip: TIPS.health,
      value: !read
        ? { none: WORDS.no_read }
        : read.wad == null
          ? { none: WORDS.no_debt }
          : { text: hfText, info: healthFactorAtBlockProv("after", coord, read), value: hfText },
    },
    {
      key: "collateral-can-fall",
      label: WORDS.fall,
      tip: TIPS.fall,
      value:
        drop != null
          ? {
              text: `${drop.toFixed(0)}%`,
              info: {
                kind: "chain-derived",
                summary:
                  "Collateral can fall. How far the collateral's total value can fall, the debt's value held, before the health factor reaches 1 and the position can be liquidated; one less one over the health factor after this event.",
                formula: "1 − 1 ÷ health factor",
                inputs: [{ label: "health factor", value: hfText, kind: "chain", pclass: "state" }],
              },
            }
          : {
              none: !read
                ? WORDS.no_read
                : sameAsset
                  ? WORDS.one_asset
                  : h == null
                    ? WORDS.no_debt
                    : h < 1
                      ? WORDS.liquidatable
                      : "—",
            },
    },
  ];

  // Limits: the loan to value from the snapshot's sums, and the room left
  // before a health factor of 1.
  const ltv = ltvOf(ctx);
  const ltvPrev = prev ? ltvOf(prev) : null;
  const cf = read?.collateralFactor ?? null;
  const allCollateral = read?.collateralCount != null && read.collateralCount === supplied.length;
  const room =
    h != null && debt.usd != null && debt.usd > 0
      ? { usd: Math.max(0, debt.usd * (h - 1)), how: "debt" as const }
      : read && read.wad == null && cf != null && allCollateral && coll.usd != null
        ? { usd: coll.usd * cf, how: "collateral" as const }
        : null;
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
              info: {
                kind: "derived",
                summary:
                  "Loan to value after this event. The debt's dollar value divided by the supplied assets' dollar value, each from the spoke's snapshot at the prices at this block.",
                via: "debt USD ÷ supplied USD",
                formula: "Σ(debt × price) ÷ Σ(supplied × price)",
              },
            }
          : { none: "—" },
      change:
        ltv != null && ltvPrev != null
          ? {
              text: changeText(ltv - ltvPrev, (x) => `${x.toFixed(2)} pts`),
              info: sinceProv("LTV change, in percentage points"),
            }
          : null,
    },
    {
      key: "borrowable",
      label: WORDS.borrowable,
      tip: TIPS.borrowable,
      value: room
        ? {
            text: sheetUsd(room.usd),
            value: room.usd.toFixed(2),
            info:
              room.how === "debt"
                ? {
                    kind: "derived",
                    summary:
                      "Remaining borrowing power. What the position can borrow before its health factor reaches 1: the debt in dollars times the health factor less one, the health factor from the spoke at the end of this event's block.",
                    formula: "debt USD × (health factor − 1)",
                    inputs: [
                      { label: "debt", value: sheetUsd(debt.usd ?? 0), kind: "chain-derived", pclass: "oracle" },
                      { label: "health factor", value: hfText, kind: "chain", pclass: "state" },
                    ],
                  }
                : {
                    kind: "derived",
                    summary:
                      "Remaining borrowing power. With no debt, the collateral in dollars times the collateral factor the spoke weighs it by, from getUserAccountData at the end of this event's block.",
                    formula: "collateral USD × collateral factor",
                    inputs: [
                      { label: "collateral", value: sheetUsd(coll.usd ?? 0), kind: "chain-derived", pclass: "oracle" },
                      {
                        label: "collateral factor",
                        value: `${((cf ?? 0) * 100).toFixed(2)}%`,
                        kind: "chain",
                        pclass: "state",
                      },
                    ],
                  },
          }
        : { none: read ? WORDS.unread : WORDS.no_read },
    },
  ];
  const params: SheetStat[] = [
    {
      key: "liquidation-threshold",
      label: WORDS.threshold,
      tip: TIPS.threshold,
      value:
        cf != null && read
          ? {
              text: `${(cf * 100).toFixed(2)}%`,
              info: {
                kind: "chain",
                pclass: "state",
                summary: `Collateral factor. The collateral factor the spoke weighs this position's collateral by, each asset's weighted by its value: getUserAccountData's avgCollateralFactor at the end of block ${read.block.toLocaleString("en-US")}.`,
                via: `GET /api/chain/aave-v4/health-factor · spoke getUserAccountData @ block ${read.block} · avgCollateralFactor`,
              },
            }
          : { none: read ? "No collateral" : WORDS.no_read },
    },
  ];

  return {
    sides: [coll.side, debt.side],
    panels: [
      { panel: "risk", rows: risk, caption: drop != null ? WORDS.fall_caption : undefined },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
