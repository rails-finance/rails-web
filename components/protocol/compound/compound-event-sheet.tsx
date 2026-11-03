"use client";

// Compound V3's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330), from the
// page's replay of the position (lib/compound/flows.ts, handed down through
// `CompoundFlowReplayContext`): the figures the cells and their ledgers state
// (compound-event-detail.tsx, compound-ledger.tsx), laid out as the shared
// sheet (components/shared/event-sheet.tsx) the way the Aave family's
// multi-asset sheet lays them out.
//
// Collateral holds the assets posted and the base while it is lent (the side
// is named "Lent" where it holds the lent base alone); Debt holds the base
// while it is borrowed. Per side: the total once the previous event had run
// ("Last event"), the base's interest since it, the market move between them
// (the rest of the change in the side's dollars), the total before this
// event, each asset the event moved, and the total after; a base that crosses
// zero states its part on each side. Risk (borrowing limit used, how far the
// collateral can fall) and Still borrowable need each asset's collateral
// factors at the event's block, which the page reads only for an absorb's
// seized assets: those rows stand with their labels and tips, unread, unless
// the account owes nothing or posts nothing. The borrow rate is the read the
// rate note (or the absorb breakdown) makes at the block before the event.

import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText, type SwapFigure } from "@/components/shared/change-swap-value";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { CV3, type CompoundFlowReplay, type CompoundReplayed } from "@/lib/compound/flows";
import { compoundAmount } from "@/lib/compound/row-facts";
import { absorbFactorProv, cometContract, type CompoundCoords } from "@/lib/compound/event-provenance";
import { COMPOUND_WORDS, PROSE } from "@/lib/compound/event-templates";
import type { CompoundRates } from "./compound-rate-note";
import type { AbsorbFactors, CompoundPreviousRow } from "./compound-absorb-breakdown";

const { fillText } = PROSE;
const DUST = 1e-12;

/** Each row's read-more (the strings file's words, tip_*). */
const tips = (sym: string) => ({
  collateral: {
    last: COMPOUND_WORDS.tip_coll_last,
    interest: fillText(COMPOUND_WORDS.tip_coll_interest, { symbol: sym }),
    market: COMPOUND_WORDS.tip_coll_market,
    before: COMPOUND_WORDS.tip_coll_before,
    total: fillText(COMPOUND_WORDS.tip_coll_total, { symbol: sym }),
  },
  debt: {
    last: fillText(COMPOUND_WORDS.tip_debt_last, { symbol: sym }),
    interest: fillText(COMPOUND_WORDS.tip_debt_interest, { symbol: sym }),
    market: fillText(COMPOUND_WORDS.tip_debt_market, { symbol: sym }),
    before: fillText(COMPOUND_WORDS.tip_debt_before, { symbol: sym }),
    total: fillText(COMPOUND_WORDS.tip_debt_total, { symbol: sym }),
  },
});
const eventTip = (side: FlowSide, sym: string) =>
  side === "collateral"
    ? fillText(COMPOUND_WORDS.tip_coll_event, { symbol: sym })
    : fillText(COMPOUND_WORDS.tip_debt_event, { symbol: sym });

/** "$0.9997": a price as the rows print it. */
const priceWords = (p: number) =>
  `$${p.toLocaleString("en-US", p < 10 ? { minimumFractionDigits: 4, maximumFractionDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdText = (v: number) => (Math.abs(v) < 0.005 ? "$0" : sheetUsd(v));
const signedAmount = (c: number) => `${c < 0 ? "−" : ""}${compoundAmount(Math.abs(c))}`;
/** A decimal string's negation: a borrowed base's move stated as owed. */
const negated = (v: string): string => (v.startsWith("-") ? v.slice(1) : `-${v}`);
const pct = (f: number) => `${(f * 100).toFixed(2)}%`;
const factorPct = (f: number) => `${Math.round(f * 1000) / 10}%`;

/** One asset on a side: after the event, just before it, and once the
 *  previous event had run, in tokens; the prices at this event's row and at
 *  the previous one. */
interface Holding {
  token: string;
  symbol: string;
  /** The base, lent on the collateral side or owed on the debt side. */
  base: boolean;
  after: number;
  before: number;
  last: number;
  price: number | null;
  pricePrev: number | null;
  /** Whether the row's block was read for this price, or it is the nearest
   *  priced row's. */
  atBlock: boolean;
}

const priceOf = (r: CompoundReplayed | null, t: string): number | null => {
  const p = r?.price[t];
  return p != null && p > 0 ? p : null;
};

/** A token figure's dollars at the price the replay values the row at. */
const atPriceUsdProv = (
  h: Holding,
  what: string,
  amount: number,
  price: number,
  coords: CompoundCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what}, in US dollars — the amount times the Comet's oracle price for ${h.symbol} ${h.atBlock ? "at this event's block" : "at the nearest row whose block was read"}.`,
  formula: "amount × price",
  contract: cometContract(coords),
  inputs: [
    { label: "amount", value: `${compoundAmount(amount)} ${h.symbol}`, kind: "chain-derived", pclass: "indexed" },
    { label: `${h.symbol} price`, value: `$${price}`, kind: "chain", pclass: "oracle" },
  ],
});

/** A side's dollars at one point, its assets at their prices. */
function sideUsdProv(
  side: FlowSide,
  when: "after" | "before" | "previous",
  hs: Holding[],
  coords: CompoundCoords,
): Provenance {
  const what = side === "collateral" ? "Collateral" : "Debt";
  const at =
    when === "previous"
      ? "once the previous event had run, at the prices then"
      : when === "before"
        ? "just before this event, at the prices at this event"
        : "once this event had run, at the prices at this event";
  const amountOf = (h: Holding) => (when === "previous" ? h.last : when === "before" ? h.before : h.after);
  const priceAt = (h: Holding) => (when === "previous" ? h.pricePrev : h.price);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `${what} ${when === "previous" ? "at the last event" : `${when} this event`} — what the account ${side === "collateral" ? "posted and lent" : "owed"} ${at}, in US dollars: each asset's balance from the position's replay of its rows times the Comet's oracle price.`,
    formula: "Σ balance × price",
    contract: cometContract(coords),
    via: "the position's replay of its rows (lib/compound/flows.ts)",
    inputs: hs
      .filter((h) => amountOf(h) > DUST)
      .flatMap((h) => [
        {
          label: `${h.symbol}${h.base && side === "collateral" ? " lent" : ""}`,
          value: `${compoundAmount(amountOf(h))} ${h.symbol}`,
          kind: "chain-derived" as const,
          pclass: "indexed" as const,
        },
        ...(priceAt(h) != null
          ? [{ label: `${h.symbol} price`, value: `$${priceAt(h)}`, kind: "chain" as const, pclass: "oracle" as const }]
          : []),
      ]),
  };
}

/** What a figure became since the previous event. */
const sinceProv = (what: string): Provenance => ({
  kind: "derived",
  summary: `${what} since the previous event — the figure at this event less the figure at the previous one.`,
  formula: "now − at the previous event",
});

export interface CompoundSheetInput {
  rp: CompoundFlowReplay;
  eventId: string;
  ctx: CompoundContext;
  coords: CompoundCoords;
  /** The event's word ("Supply collateral"), naming its rows. */
  label: string;
  /** The account's previous row in this market, as the card has it: the
   *  carry layer stands where the replay's previous row is that row. */
  previous?: CompoundPreviousRow;
  /** The receipt of the event's move on the asset it touched, as the cells
   *  state it, and its signed amount (ctx.assetsDelta). */
  move: { info: Provenance; delta: string } | null;
  rates: CompoundRates | null;
  /** An absorb's factors, where its breakdown read them. */
  absorb: AbsorbFactors | null;
  /** Words for a swept row's base balance that is still being read. */
  unsettled: string;
}

/** The sheet of a Compound V3 event; `undefined` where the replay does not
 *  hold the event (the cells stand). */
export function compoundEventSheet(input: CompoundSheetInput): EventSheet | undefined {
  const { rp, eventId, ctx, coords, label, previous, move, rates, absorb, unsettled } = input;
  const i = rp.replayed.findIndex((r) => r.ev.id === eventId);
  if (i < 0) return undefined;
  const r = rp.replayed[i];
  const p = i > 0 ? rp.replayed[i - 1] : null;
  const base = rp.base;
  const baseSym = rp.symbols.get(base) ?? ctx.assetSymbol;
  const dust = rp.dust;
  const T = tips(baseSym);

  // The base just before the row's act: its after less what the row moved.
  const act = r.ev.isBase ? r.ev.delta : 0;
  const preBase = r.base - act;
  const lastBase = p?.base ?? 0;
  const crosses = r.ev.isBase && ((preBase > dust && r.base < -dust) || (preBase < -dust && r.base > dust));

  // The carry layer stands where the replay's previous row is the account's
  // previous row and the base moved by nothing the page cannot name.
  const carryOk =
    p != null &&
    previous != null &&
    previous.baseAfter != null &&
    previous.blockNumber === p.ev.block &&
    Math.abs(r.unlogged) <= dust;

  const baseHolding = (side: FlowSide): Holding => {
    const on = (v: number) => (side === "collateral" ? Math.max(0, v) : Math.max(0, -v));
    return {
      token: base,
      symbol: baseSym,
      base: true,
      after: on(r.base),
      before: on(preBase),
      last: on(lastBase),
      price: priceOf(r, base),
      pricePrev: priceOf(p, base),
      atBlock: r.own.has(base),
    };
  };
  const collTokens = [...new Set([...r.coll.keys(), ...(p ? [...p.coll.keys()] : [])])];
  const collHoldings: Holding[] = collTokens.map((t) => {
    const after = Math.max(0, r.coll.get(t) ?? 0);
    const last = Math.max(0, p?.coll.get(t) ?? 0);
    return {
      token: t,
      symbol: rp.symbols.get(t) ?? t,
      base: false,
      after,
      before: last,
      last,
      price: priceOf(r, t),
      pricePrev: priceOf(p, t),
      atBlock: r.own.has(t),
    };
  });
  const held = (h: Holding) => h.after > DUST || h.before > DUST || h.last > DUST;
  const heldBase = (h: Holding) => h.after > dust || h.before > dust || h.last > dust;

  // Interest on the base since the previous row: earned on a supply, charged
  // on a debt.
  const interestOf = (side: FlowSide) =>
    r.legs
      .filter((l) => l.bucket === (side === "collateral" ? CV3.earned : CV3.accrued))
      .reduce((a, l) => a + l.amount, 0);

  const addressOf = (t: string) => (t.startsWith("0x") ? t : undefined);

  /** The base owed at the previous event or just before this one, in tokens:
   *  the replay's balance at that row. */
  const baseOwedProv = (when: "previous" | "before", amount: number): Provenance => ({
    kind: "chain-derived",
    pclass: "indexed",
    summary:
      when === "previous"
        ? `${baseSym} owed once the account's previous event in this market had run — the base balance the position's replay of its rows holds at that row, interest to then included.`
        : `${baseSym} owed just before this event — the base balance once the previous event had run plus the interest charged since, from the position's replay of its rows.`,
    formula:
      when === "previous"
        ? "−base balance at the previous row"
        : "−(base balance after this event − this event's move)",
    contract: cometContract(coords),
    via: "the position's replay of its rows (lib/compound/flows.ts)",
    inputs: [
      {
        label: `${baseSym} owed`,
        value: `${compoundAmount(amount)} ${baseSym}`,
        kind: "chain-derived",
        pclass: "indexed",
      },
    ],
  });

  function sheetSide(side: FlowSide): SheetSide {
    const b = baseHolding(side);
    const hs: Holding[] = [...(side === "collateral" ? collHoldings.filter(held) : []), ...(heldBase(b) ? [b] : [])];
    const tip = T[side];
    const lentAlone = side === "collateral" && hs.length > 0 && hs.every((h) => h.base);
    // A swept row's base balance is the logged amounts' sum, short of its
    // interest: a side that holds the base states the event's move and no
    // balance, as the cells do.
    const baseUnread = ctx.baseUnsettled === true && heldBase(b);

    // The event's rows: each asset it moved on this side.
    const rows: SheetRow[] = hs
      .filter((h) => Math.abs(h.after - h.before) > (h.base ? dust : DUST))
      .map((h) => {
        const c = h.after - h.before;
        const word =
          crosses && h.base
            ? side === "collateral"
              ? c > 0
                ? COMPOUND_WORDS.sheet_supply
                : COMPOUND_WORDS.sheet_withdraw
              : c > 0
                ? COMPOUND_WORDS.sheet_borrow
                : COMPOUND_WORDS.sheet_repay
            : label;
        // The log's exact amount, where the row moved this asset by it alone.
        const exact = move ? (side === "debt" ? negated(move.delta) : move.delta) : null;
        const logged =
          !crosses &&
          exact != null &&
          (h.base ? r.ev.isBase : !r.ev.isBase && h.token === r.ev.token) &&
          Math.abs(Number(exact) - c) <= Math.max(h.base ? dust : DUST, Math.abs(c) * 1e-9);
        return {
          key: `event-${h.symbol}`,
          label: word,
          amount: {
            text: signedAmount(c),
            symbol: h.symbol,
            address: addressOf(h.token),
            info: logged
              ? move!.info
              : {
                  kind: "chain-derived",
                  summary: `${h.symbol} ${side === "debt" ? "owed" : h.base ? "lent" : "posted"} change at this event — the balance once the event had run less the balance just before it, from the position's replay of its rows.`,
                  formula: "after − before",
                  contract: cometContract(coords),
                },
            value: logged ? (exact!.startsWith("-") ? `−${exact!.slice(1)}` : `+${exact}`) : undefined,
          },
          usd:
            h.price != null
              ? {
                  text: sheetUsd(c * h.price),
                  info: atPriceUsdProv(h, `The ${h.symbol} this event moved`, Math.abs(c), h.price, coords),
                }
              : undefined,
          tip: eventTip(side, h.symbol),
        };
      });

    const priced = (key: "after" | "before" | "last") =>
      hs.every((h) => h[key] <= DUST || (key === "last" ? h.pricePrev : h.price) != null);
    const usdAt = (key: "after" | "before" | "last") =>
      hs.reduce((a, h) => a + h[key] * ((key === "last" ? h.pricePrev : h.price) ?? 0), 0);

    // The carry-forward layer.
    const carry: SheetSide["carry"] = [];
    let before: SheetRow | undefined;
    const lastUsd = priced("last") ? usdAt("last") : null;
    const beforeUsd = priced("before") ? usdAt("before") : null;
    if (carryOk && !baseUnread && lastUsd != null && beforeUsd != null && (lastUsd > 0.005 || beforeUsd > 0.005)) {
      const single = side === "debt" ? b : null;
      carry.push({
        key: "last",
        label: SHEET_WORDS.last,
        note: single && single.pricePrev != null ? priceWords(single.pricePrev) : undefined,
        amount: single
          ? {
              text: compoundAmount(single.last),
              symbol: baseSym,
              address: addressOf(base),
              info: baseOwedProv("previous", single.last),
            }
          : undefined,
        usd: { text: usdText(lastUsd), info: sideUsdProv(side, "previous", hs, coords) },
        tip: tip.last,
      });
      const interest = interestOf(side);
      const interestUsd = b.price != null ? interest * b.price : null;
      if (interest > dust)
        carry.push({
          key: "interest",
          label: SHEET_WORDS.interest,
          note: b.price != null ? priceWords(b.price) : undefined,
          amount: {
            text: compoundAmount(interest),
            symbol: baseSym,
            address: addressOf(base),
            info: {
              kind: "chain-derived",
              pclass: "state",
              summary: `${side === "collateral" ? `Interest the lent ${baseSym} earned` : `Interest charged on the borrowed ${baseSym}`} since the account's previous event in this market — the balance just before this event less the balance once the previous event had run, as the rows state them. Comet accrues continuously and logs nothing for it.`,
              formula: "before − previous after",
              contract: cometContract(coords),
            },
          },
          usd:
            interestUsd != null
              ? {
                  text: sheetUsd(interestUsd),
                  info: atPriceUsdProv(b, `Interest on ${baseSym} since the last event`, interest, b.price!, coords),
                }
              : undefined,
          tip: tip.interest,
        });
      // The market move: the rest of the change in the side's dollars, which
      // the prices moved; its receipt names each asset's price at both rows.
      const accrued = interest > dust ? interestUsd : 0;
      if (accrued != null) {
        const mv = beforeUsd - lastUsd - accrued;
        if (Math.abs(mv) >= 0.005)
          carry.push({
            key: "market",
            label: SHEET_WORDS.market,
            usd: {
              text: sheetUsd(mv, true),
              info: {
                kind: "chain-derived",
                pclass: "oracle",
                summary: `Market move on the ${side} since the last event — the side's total just before this event, less its total once the previous event had run and the interest since, all in US dollars: the change the Comet's oracle prices made to the balances held between the two. No token moved.`,
                formula: "before this event − last event − interest since",
                contract: cometContract(coords),
                inputs: hs
                  .filter((h) => h.last > DUST)
                  .flatMap((h) => [
                    ...(h.pricePrev != null
                      ? [
                          {
                            label: `${h.symbol} price at the last event`,
                            value: `$${h.pricePrev}`,
                            kind: "chain" as const,
                            pclass: "oracle" as const,
                          },
                        ]
                      : []),
                    ...(h.price != null
                      ? [
                          {
                            label: `${h.symbol} price at this event`,
                            value: `$${h.price}`,
                            kind: "chain" as const,
                            pclass: "oracle" as const,
                          },
                        ]
                      : []),
                  ]),
              },
            },
            tip: tip.market,
          });
      }
      before = {
        key: "before",
        label: SHEET_WORDS.before,
        note: single && single.price != null ? priceWords(single.price) : undefined,
        amount: single
          ? {
              text: compoundAmount(single.before),
              symbol: baseSym,
              address: addressOf(base),
              info: baseOwedProv("before", single.before),
            }
          : undefined,
        usd: { text: usdText(beforeUsd), info: sideUsdProv(side, "before", hs, coords) },
        tip: tip.before,
      };
    }

    // One asset held after the event, or none after it emptied the one the side
    // held: the total states its amount (decision 0042, point 9).
    const heldAfter = hs.filter((h) => h.after > (h.base ? dust : DUST));
    const sole = baseUnread ? undefined : heldAfter.length === 1 ? heldAfter[0] : hs.length === 1 ? hs[0] : undefined;
    const soleAmount = sole && (sole.after > (sole.base ? dust : DUST) ? sole.after : 0);

    // The debt assets the account once owed and owes none of after the event.
    const repaid =
      side === "debt" && b.after <= dust && rp.replayed.slice(0, i + 1).some((x) => x.base < -dust)
        ? [baseSym]
        : undefined;

    return {
      side,
      ...(lentAlone ? { name: COMPOUND_WORDS.sheet_lent_side } : {}),
      icons: hs.filter((h) => h.after > (h.base ? dust : DUST)).map((h) => h.symbol),
      carry,
      before,
      rows,
      ...(side === "debt" ? { repaid, repaidTip: COMPOUND_WORDS.tip_debt_repaid } : {}),
      total: baseUnread
        ? { none: unsettled }
        : priced("after")
          ? { text: usdText(usdAt("after")), info: sideUsdProv(side, "after", hs, coords) }
          : { none: COMPOUND_WORDS.sheet_no_price },
      totalAmount:
        sole && soleAmount != null
          ? {
              text: compoundAmount(soleAmount),
              symbol: sole.symbol,
              address: addressOf(sole.token),
              info: {
                kind: "chain-derived",
                pclass: "indexed",
                summary: `${sole.symbol} ${side === "debt" ? "owed" : sole.base ? "lent" : "posted"} once this event had run — the balance the position's replay of its rows holds at this row.`,
                formula: side === "debt" ? "−base balance at this row" : "balance at this row",
                contract: cometContract(coords),
                via: "the position's replay of its rows (lib/compound/flows.ts)",
              },
            }
          : undefined,
      totalTip: tip.total,
    };
  }

  const sides = (["collateral", "debt"] as const).map(sheetSide);

  // ── Risk and Limits ──
  const unread = { none: COMPOUND_WORDS.sheet_unread };
  const owes = Math.max(0, -r.base) > dust;
  const posts = collHoldings.some((h) => h.after > DUST);
  const risk: SheetStat[] = [
    {
      key: "limit-used",
      label: COMPOUND_WORDS.sheet_limit_used,
      tip: COMPOUND_WORDS.tip_limit_used,
      value: owes ? unread : { none: COMPOUND_WORDS.sheet_no_debt },
    },
    {
      key: "collateral-can-fall",
      label: COMPOUND_WORDS.sheet_fall,
      tip: COMPOUND_WORDS.tip_fall,
      value: owes ? unread : { none: COMPOUND_WORDS.sheet_no_debt },
    },
  ];

  // The borrow rate: the rate note's read at the block before this event,
  // else the absorb breakdown's.
  const ratePair: { now: number; then: number | null; readBlock: number } | null = rates
    ? { now: rates.now.borrow, then: rates.then.borrow, readBlock: rates.readBlock }
    : absorb?.borrowRate?.read != null
      ? {
          now: absorb.borrowRate.read,
          then: absorb.borrowRate.prev ?? null,
          readBlock: absorb.readBlock,
        }
      : null;
  const rateFig: SwapFigure | null = ratePair
    ? {
        text: pct(ratePair.now),
        value: pct(ratePair.now),
        info: {
          kind: "chain",
          pclass: "state",
          summary: `The market's borrow rate a year just before this event — the Comet's getBorrowRate at its getUtilization, read at block ${ratePair.readBlock.toLocaleString("en-US")}, the block before.`,
          contract: cometContract(coords),
          via: `Comet · getBorrowRate(getUtilization()) · block ${ratePair.readBlock}`,
        },
      }
    : null;
  const limits: SheetStat[] = [
    {
      key: "borrowable",
      label: COMPOUND_WORDS.sheet_borrowable,
      tip: COMPOUND_WORDS.tip_borrowable,
      value: posts ? unread : { none: COMPOUND_WORDS.sheet_no_collateral },
    },
    {
      key: "borrow-rate",
      label: COMPOUND_WORDS.sheet_borrow_rate,
      tip: COMPOUND_WORDS.tip_borrow_rate,
      value: rateFig ?? unread,
      change:
        ratePair && ratePair.then != null
          ? {
              text: changeText((ratePair.now - ratePair.then) * 100, (x) => `${x.toFixed(2)} pts`),
              info: sinceProv("The borrow rate's change, in percentage points"),
            }
          : null,
    },
  ];

  // The parameters: each asset posted before or after the event, its two
  // collateral factors where the page read them (an absorb's seized assets).
  const factors = absorb;
  const params: SheetStat[] = collHoldings
    .filter((h) => h.after > DUST || h.before > DUST)
    .flatMap((h) => {
      const f = factors?.factors[h.token.toLowerCase()];
      const readBlock = factors?.readBlock;
      return [
        {
          key: `borrow-factor-${h.symbol}`,
          label: fillText(COMPOUND_WORDS.sheet_borrow_factor, { symbol: h.symbol }),
          tip: fillText(COMPOUND_WORDS.tip_borrow_factor, { symbol: h.symbol }),
          value:
            f && readBlock != null
              ? {
                  text: factorPct(f.borrow),
                  value: factorPct(f.borrow),
                  info: {
                    kind: "chain" as const,
                    pclass: "state" as const,
                    summary: `Borrow collateral factor — the share of ${h.symbol}'s value that counts toward the borrowing limit in this market, ${factorPct(f.borrow)}, read from the Comet's asset settings at block ${readBlock}, the block before the absorb.`,
                    contract: cometContract(coords),
                    via: `Comet.getAssetInfoByAddress(${h.symbol}) · block ${readBlock}`,
                  },
                }
              : unread,
        },
        {
          key: `liquidate-factor-${h.symbol}`,
          label: fillText(COMPOUND_WORDS.sheet_liquidate_factor, { symbol: h.symbol }),
          tip: fillText(COMPOUND_WORDS.tip_liquidate_factor, { symbol: h.symbol }),
          value:
            f && readBlock != null
              ? {
                  text: factorPct(f.liquidate),
                  value: factorPct(f.liquidate),
                  info: absorbFactorProv(h.symbol, "liquidate factor", coords, {
                    value: factorPct(f.liquidate),
                    readBlock,
                  }),
                }
              : unread,
        },
      ];
    });

  return {
    sides,
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
