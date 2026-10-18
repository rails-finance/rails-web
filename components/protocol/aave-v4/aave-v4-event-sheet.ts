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

import type { Provenance, ProvInput } from "@/components/shared/provenance";
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
import { UNPRICED_DUST_TOKENS } from "@/lib/aave-v4/unpriced";
import { fmtUnitPrice, fmtV4Amount, hfLabelV4, HF_CAP } from "@/lib/aave-v4/format";
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
  liquidatable: "At or below 1",
  one_asset: "One asset on both sides",
  ltv: "LTV",
  borrowable: "Still borrowable",
  max_ltv: "Max LTV",
  threshold: "Liquidation threshold",
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
    "The spoke's health factor for the position at the end of this event's block, from getUserAccountData: the collateral weighted by its collateral factors, divided by the debt; at or below 1 the position can be liquidated.",
  fall: "How far the collateral's total value can fall, the debt's value held, before the health factor reaches 1: one less one over the health factor.",
  ltv: "The debt's dollar value as a share of the supplied assets' dollar value after this event, at the prices at this block.",
  borrowable:
    "What the position can still borrow in dollars before its health factor reaches 1: the debt times the health factor less one, or with no debt the collateral times its collateral factor.",
  max_ltv:
    "The share of the collateral the position can borrow against; this page reads the spoke's collateral factor, which bounds borrowing at a health factor of 1, and no separate max LTV.",
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

/** A side's holdings after an event: the snapshot, or the moved asset alone
 *  where the event carries no snapshot. */
function holdingsOf(ctx: AaveV4Context, leg: Side): Holding[] {
  const snap: AaveV4SnapshotItem[] | undefined = leg === "supply" ? ctx.allSupplies : ctx.allDebts;
  if (snap) return snap.filter((s) => Number(s.amount) > 0);
  const m = movedOn(ctx, leg);
  return m && Number(m.after) > 0 ? [{ symbol: m.symbol, amount: m.after }] : [];
}

const priceInput = (sym: string, p: Price, what = `${sym} price`): ProvInput => ({
  label: what,
  value: `$${p.usd}`,
  kind: isOnChainPriceSource(p.source) ? "chain" : "offchain",
  pclass: isOnChainPriceSource(p.source) ? "oracle" : "offchain",
  note: p.source === "iaave-oracle" ? "Aave's oracle (getReservePrice)" : `price source · ${p.source}`,
});

/** A token amount's dollars at its price at this block. */
const atBlockUsdProv = (sym: string, what: string, amount: string, p: Price): Provenance => ({
  kind: isOnChainPriceSource(p.source) ? "chain-derived" : "derived",
  pclass: isOnChainPriceSource(p.source) ? "oracle" : "offchain",
  summary: `${what}, in US dollars — the amount times the ${sym} price at this block.`,
  formula: "amount × price",
  inputs: [{ label: "amount", value: `${amount} ${sym}`, kind: "chain-derived", pclass: "state" }, priceInput(sym, p)],
});

/** Dollars over a list of holdings; an asset with no price above dust is
 *  named and leaves the sum unstated (RULE: Rails never invents a price,
 *  lib/aave-v4/unpriced.ts). */
function sumOf(ctx: AaveV4Context, items: Holding[]) {
  let usd = 0;
  const missing: string[] = [];
  const priced: { item: Holding; price: Price }[] = [];
  for (const item of items) {
    const n = Number(item.amount);
    if (!(n > 0)) continue;
    const p = priceOf(ctx, item);
    if (p) {
      usd += n * p.usd;
      priced.push({ item, price: p });
    } else if (n > UNPRICED_DUST_TOKENS) missing.push(aaveV4DisplaySymbol(item.symbol));
  }
  return { usd, missing, priced };
}

/** A sum's receipt: each balance and its price. */
const sumProv = (summary: string, priced: { item: Holding; price: Price }[]): Provenance => {
  const onchain = priced.every((x) => isOnChainPriceSource(x.price.source));
  return {
    kind: onchain ? "chain-derived" : "derived",
    pclass: onchain ? "oracle" : "offchain",
    summary,
    formula: "Σ balance × price",
    inputs: priced.flatMap(({ item, price }) => {
      const sym = aaveV4DisplaySymbol(item.symbol);
      return [
        {
          label: `${sym} balance`,
          value: `${item.amount} ${sym}`,
          kind: "chain-derived" as const,
          pclass: "state" as const,
        },
        priceInput(sym, price),
      ];
    }),
  };
};

const priceNote = (p: Price | undefined) =>
  p ? (p.source === "stablecoin" ? `≈${fmtUnitPrice(p.usd)}` : fmtUnitPrice(p.usd)) : undefined;

const sinceProv = (what: string): Provenance => ({
  kind: "derived",
  summary: `${what} since the previous event — the figure once this event had run, less the figure once the previous event on this spoke had run.`,
  formula: "after − after the previous event",
});

function sheetSide({
  ctx,
  prev,
  side,
  coord,
  label,
  address,
  hf,
  repaid,
}: {
  ctx: AaveV4Context;
  prev: AaveV4Context | undefined;
  side: FlowSide;
  coord: EventProvDetail;
  label: string;
  address?: string;
  hf: HealthFactorAround;
  repaid?: string[];
}): { side: SheetSide; usd: number | null } {
  const leg: Side = side === "collateral" ? "supply" : "debt";
  const after = holdingsOf(ctx, leg);
  const moved = movedOn(ctx, leg);
  const chain = ctx.balanceBasis === "chain";

  // The event's row: the asset it moved on this side.
  const rows: SheetRow[] = [];
  if (moved) {
    const delta = decSub(moved.after, moved.before);
    const n = Number(delta);
    if (n !== 0) {
      const sym = aaveV4DisplaySymbol(moved.symbol);
      const p = priceOf(ctx, { symbol: moved.symbol, amount: moved.after });
      const abs = delta.replace(/^-/, "");
      rows.push({
        key: `event-${sym}`,
        label,
        amount: {
          text: `${n < 0 ? "−" : ""}${fmtV4Amount(abs)}`,
          symbol: moved.symbol,
          address,
          info: deltaProv({ ...coord, asset: sym }),
          value: `${n < 0 ? "−" : "+"}${abs}`,
        },
        usd: p
          ? { text: sheetUsd(n * p.usd), info: atBlockUsdProv(sym, `The ${sym} this event moved`, abs, p) }
          : undefined,
        tip: TIPS.event(sym, side),
      });
    }
  }

  // The balances just before this event: the snapshot, with the moved asset
  // at its before-balance.
  const beforeItems: Holding[] = after.map((h) =>
    moved && h.symbol === moved.symbol ? { ...h, amount: moved.before } : h,
  );
  if (moved && !after.some((h) => h.symbol === moved.symbol) && Number(moved.before) > 0) {
    const fromSnap = (leg === "supply" ? ctx.allSupplies : ctx.allDebts)?.find((s) => s.symbol === moved.symbol);
    beforeItems.push({ symbol: moved.symbol, amount: moved.before, price: fromSnap?.price });
  }

  // The carry-forward layer, from the previous event's snapshot on this spoke.
  const carry: SheetSide["carry"] = [];
  let beforeRow: SheetRow | undefined;
  // A side that held nothing then and nothing before this event has no carry.
  const prevItems = prev ? holdingsOf(prev, leg) : [];
  if (prev && (prevItems.length > 0 || beforeItems.some((h) => Number(h.amount) > 0))) {
    const last = sumOf(prev, prevItems);
    const beforeSum = sumOf(ctx, beforeItems);
    if (last.missing.length === 0)
      carry.push({
        key: "last",
        label: SHEET_WORDS.last,
        usd: {
          text: sheetUsd(last.usd),
          info: sumProv(
            `The ${side} once the previous event on this spoke had run, in US dollars — each asset's balance in that event's snapshot times its price at that block, added up.`,
            last.priced,
          ),
        },
        tip: TIPS.last(side),
      });
    // Interest per asset: the balance before this event less the balance after
    // the previous one; no event moved the shares between them.
    let interestUsd = 0;
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
      if (p) interestUsd += g * p.usd;
      else complete = false;
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
        usd: p
          ? {
              text: sheetUsd(g * p.usd),
              info: atBlockUsdProv(sym, `Interest on ${sym} since the previous event`, gain, p),
            }
          : undefined,
        tip: TIPS.interestAsset(sym, side),
      });
    }
    if (sub.length > 0)
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        usd: complete
          ? {
              text: sheetUsd(interestUsd),
              info: {
                kind: "chain-derived",
                pclass: "oracle",
                summary: `Interest on the ${side} since the previous event, in US dollars — every asset's interest at its price at this block, added up.`,
                formula: "Σ interest × price",
              },
            }
          : undefined,
        tip: TIPS.interest(side),
        sub,
      });
    // The market move: the rest of the change in the total, which the prices
    // made; its receipt names each asset's price at both blocks.
    if (complete && last.missing.length === 0 && beforeSum.missing.length === 0) {
      const move = beforeSum.usd - last.usd - interestUsd;
      if (Math.abs(move) >= 0.005)
        carry.push({
          key: "market",
          label: SHEET_WORDS.market,
          usd: {
            text: sheetUsd(move, true),
            info: {
              kind: "chain-derived",
              pclass: "oracle",
              summary: `Market move on the ${side} since the previous event — the total before this event, less the total once the previous event had run and the interest since, all in US dollars: the change the prices made to the balances held between the two. No token moved.`,
              formula: "before this event − last event − interest since",
              inputs: beforeSum.priced.flatMap(({ item, price }) => {
                const sym = aaveV4DisplaySymbol(item.symbol);
                const then = prevItems.find((x) => x.symbol === item.symbol);
                const pThen = then ? priceOf(prev, then) : undefined;
                return [
                  ...(pThen ? [priceInput(sym, pThen, `${sym} price at the previous event`)] : []),
                  priceInput(sym, price, `${sym} price at this event`),
                ];
              }),
            },
          },
          tip: TIPS.market(side),
        });
    }
    if (carry.length > 0 && beforeSum.missing.length === 0)
      beforeRow = {
        key: "before",
        label: SHEET_WORDS.before,
        usd: {
          text: sheetUsd(beforeSum.usd),
          info: sumProv(
            `The ${side} just before this event, in US dollars — each asset's balance before it times its price at this block, added up.`,
            beforeSum.priced,
          ),
        },
        tip: TIPS.before(side),
      };
  }

  /** A balance after the event, with its receipt. */
  const amountAfter = (h: Holding): SheetRow["amount"] => {
    const sym = aaveV4DisplaySymbol(h.symbol);
    const isMoved = moved?.symbol === h.symbol;
    const detail = { ...coord, asset: sym };
    return {
      text: fmtV4Amount(h.amount),
      symbol: h.symbol,
      address: isMoved ? address : undefined,
      info:
        isMoved && chain
          ? chainBalanceProv(
              "Balance after this event",
              detail,
              leg,
              leg === "supply"
                ? {
                    value: ctx.raw?.supplyAfter,
                    shares: ctx.raw?.supplySharesAfter,
                    a: ctx.raw?.hubAddedAssets,
                    b: ctx.raw?.hubAddedShares,
                  }
                : { value: ctx.raw?.debtAfter, shares: ctx.raw?.drawnSharesAfter, a: ctx.raw?.hubDrawnIndex },
              leg === "debt" ? premiumAt(hf, "after") : undefined,
            )
          : snapshotProv(
              "Balance after this event",
              { ...detail, raw: isMoved ? ctx.raw?.[leg === "supply" ? "supplyAfter" : "debtAfter"] : undefined },
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
      usd: p
        ? {
            text: sheetUsd(Number(h.amount) * p.usd),
            info: atBlockUsdProv(sym, `The ${sym} after this event`, h.amount, p),
          }
        : undefined,
      tip: TIPS.asset(sym, side),
    };
  });

  const total = sumOf(ctx, after);
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
      total:
        total.missing.length === 0
          ? {
              text: sheetUsd(total.usd),
              info: sumProv(
                `The ${side} after this event, in US dollars — each asset's balance in the spoke's snapshot times its price at this block, added up.`,
                total.priced,
              ),
            }
          : { none: WORDS.no_price(total.missing) },
      totalAmount: sole && amountAfter(sole),
      totalTip: TIPS.total(side),
    },
  };
}

/** The loan to value from a snapshot's two sums, in percent. */
function ltvOf(ctx: AaveV4Context): number | null {
  const c = sumOf(ctx, holdingsOf(ctx, "supply"));
  const d = sumOf(ctx, holdingsOf(ctx, "debt"));
  if (c.missing.length > 0 || d.missing.length > 0 || !(c.usd > 0)) return null;
  return (d.usd / c.usd) * 100;
}

/** The sheet for an Aave V4 event. `undefined` for a collateral toggle (its
 *  cell stands); `null` while the spoke's read around the block is pending. */
export function aaveV4Sheet({
  ctx,
  prev,
  coord,
  label,
  address,
  hf,
  repaid,
}: {
  ctx: AaveV4Context;
  /** The previous event on this spoke, whose snapshot the carry layer reads. */
  prev?: AaveV4Context;
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

  const coll = sheetSide({ ctx, prev, side: "collateral", coord, label, address, hf });
  const debt = sheetSide({ ctx, prev, side: "debt", coord, label, address, hf, repaid });

  // Risk: the spoke's health factor at the end of the block, and the fall it
  // leaves the collateral before it reaches 1.
  const read = hf.status === "ok" ? hf.after : null;
  const h = read ? hfOf(read.wad) : null;
  const supplied = holdingsOf(ctx, "supply");
  const owed = holdingsOf(ctx, "debt");
  const sameAsset = supplied.length === 1 && owed.length === 1 && supplied[0].symbol === owed[0].symbol;
  const drop = !sameAsset && h != null && h > 1 && h < HF_CAP ? (1 - 1 / h) * 100 : null;
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
                  "Collateral can fall — how far the collateral's total value can fall, the debt's value held, before the health factor reaches 1 and the position can be liquidated: one less one over the health factor after this event.",
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
                    : h <= 1
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
                  "Loan to value after this event — the debt's dollar value divided by the supplied assets' dollar value, each from the spoke's snapshot at the prices at this block.",
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
                      "Still borrowable — what the position can borrow before its health factor reaches 1: the debt in dollars times the health factor less one, the health factor from the spoke at the end of this event's block.",
                    formula: "debt USD × (health factor − 1)",
                    inputs: [
                      { label: "debt", value: sheetUsd(debt.usd ?? 0), kind: "chain-derived", pclass: "oracle" },
                      { label: "health factor", value: hfText, kind: "chain", pclass: "state" },
                    ],
                  }
                : {
                    kind: "derived",
                    summary:
                      "Still borrowable — with no debt, the collateral in dollars times the collateral factor the spoke weighs it by, from getUserAccountData at the end of this event's block.",
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
    { key: "max-ltv", label: WORDS.max_ltv, tip: TIPS.max_ltv, value: { none: WORDS.unread } },
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
                summary: `Liquidation threshold — the collateral factor the spoke weighs this position's collateral by, each asset's weighted by its value: getUserAccountData's avgCollateralFactor at the end of block ${read.block.toLocaleString("en-US")}.`,
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
