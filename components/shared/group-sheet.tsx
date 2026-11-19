"use client";

// A like-event group's balance sheet (rails-ops TO-DO-ui-jobs 330): the
// summary card of a closed group draws the sheet its members draw, read
// across the group. Each side takes the first member's carry-forward layer
// and before-balance, one summed row per asset of the members' rows (their
// legs listed under it with the breakdown on), and the last member's total;
// Risk and Limits are the last member's. The price row is the last member's,
// with the members' P/L summed.
//
// The members' sheets come from their own cards: mounted inside
// `GroupSheetCollector`, a member's `EventCard` hands up its slots and draws
// nothing. A member whose sheet waits on a read at open (the Aave family,
// Morpho) hands up its row's balances instead (`GroupLane`), and the group's
// sheet is read from those (`mergeLaneSheet`). A group whose members draw no
// sheet and hand up no balances, or sheets of different shapes,
// or figures the sheet's own formats do not state (`parseSheetNumber`), has
// none, and its card keeps the sums.

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import type { EventSheet, SheetRow, SheetSide } from "@/components/shared/event-sheet";
import { SHEET_NO_USD, sheetUsd } from "@/components/shared/event-sheet";
import type { EventCardPrice, EventPriceChip } from "@/components/shared/event-price-row";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import { amountsUsd, cellOf, groupMoveUsd, type PricedAmount } from "@/lib/shared/sheet-usd-rows";
import { centsOf } from "@/lib/shared/shown-usd";

const WORDS = {
  before: "Before the group",
  after: "After these events",
  interest: "Interest across these events",
  market: "Market move across these events",
  untouched: "Not changed by these events",
  unread: "Not stated by these rows",
  unpriced: "Not priced in these rows",
};
/** A group's words on its sheet, the same on every family's. */
export const GROUP_SHEET_WORDS = WORDS;

/** One balance a member's row states (`EventCardSlots.groupLanes`): an asset
 *  on a side, what the row moved on it, and the balance before and after the
 *  row where the row carries them. */
export interface GroupLane {
  side: FlowSide;
  symbol: string;
  address?: string;
  /** The member's word for its move ("Supply"), naming its leg. */
  label: string;
  /** The signed change the row made, in token units; "0" where the row
   *  states the balance without moving it. */
  change: string;
  changeProv: Provenance;
  before?: { value: string; prov: Provenance };
  after?: { value: string; prov: Provenance };
  /** The asset's USD price the row carries, at its block; unset where the
   *  row prices none. */
  price?: number;
  /** The price's block and where it comes from, for the receipts (ui-jobs
   *  743). */
  priceBlock?: number | null;
  priceNote?: string;
  /** A token amount as the family prints it. */
  fmt: (v: number) => string;
}

/** What a member's card hands up. */
export interface CollectedCard {
  id: string;
  timestamp: number;
  blockNumber?: number;
  number?: number;
  sheet?: EventSheet | null;
  price?: EventCardPrice;
  /** The balances the member's row states, where its sheet waits on a read
   *  the card makes at open: the group reads its sheet from these. */
  lanes?: GroupLane[];
}

/** Set inside a group's collector: a member's card reports here and draws
 *  nothing. */
export const SheetCollectContext = createContext<((card: CollectedCard) => () => void) | null>(null);

/** A figure as the sheet states it ("−3.6626", "$11,945", "+$1.20"), as a
 *  number; null for anything else. */
export function parseSheetNumber(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/[−–]/g, "-").replace(/[$,+\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** The places after the point a sheet figure states. */
export const placesOf = (text: string) => /\.(\d+)/.exec(text)?.[1].length ?? 0;

function sumProv(what: string, n: number): Provenance {
  return {
    kind: "chain-derived",
    summary: `${what} across this group. The total over its ${n} events. Opening the group shows each event with its receipt.`,
    formula: `Σ over ${n} events`,
  };
}

/** One summed row per asset of the members' rows; null where a figure does
 *  not read. */
function summedRows(rows: SheetRow[], label: string, n: number): SheetRow[] | null {
  const bySymbol = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const k = r.amount?.symbol ?? "";
    bySymbol.set(k, [...(bySymbol.get(k) ?? []), r]);
  }
  const out: SheetRow[] = [];
  for (const [symbol, rs] of bySymbol) {
    let amount = 0;
    let places = 0;
    let usd = 0;
    let usdKnown = true;
    // In cents where every member's figure carries its rows' cents (ui-jobs 743).
    const allCents = rs.every((r) => r.usd?.cents != null);
    for (const r of rs) {
      if (r.amount) {
        // The receipt's exact figure where it reads, so the sum does not
        // gather the members' rounding; else the figure as stated.
        const shown = parseSheetNumber(r.amount.text);
        if (shown == null) return null;
        const exact = parseSheetNumber(r.amount.value);
        amount += exact != null ? Math.sign(shown) * Math.abs(exact) : shown;
        places = Math.max(places, placesOf(r.amount.text as string));
      }
      const u = r.usd ? (allCents ? (r.usd.cents as number) : parseSheetNumber(r.usd.text)) : null;
      if (u == null) usdKnown = false;
      else usd = allCents ? centsOf(usd + u) : usd + u;
    }
    const amountText = `${amount < 0 ? "−" : ""}${Math.abs(amount).toLocaleString("en-US", {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    })}`;
    out.push({
      key: `group-${symbol || "row"}`,
      label,
      amount: rs[0].amount
        ? { text: amountText, symbol: symbol || undefined, address: rs[0].amount.address, info: sumProv(label, n) }
        : undefined,
      usd: usdKnown
        ? { text: sheetUsd(usd), info: sumProv(`${label} in USD`, n), ...(allCents ? { cents: usd } : {}) }
        : undefined,
    });
  }
  return out;
}

/** One figure summed over the members' figures; null where one does not
 *  read, undefined where none has one. */
function sumFigure(
  figs: (SheetRow["amount"] | SheetRow["usd"] | undefined)[],
  what: string,
  n: number,
  usd: boolean,
): SheetRow["amount"] | null | undefined {
  const present = figs.filter((f) => f != null);
  if (present.length === 0) return undefined;
  // Amounts in different assets do not add up: the USD column carries them.
  if (!usd && new Set(present.map((f) => (f as SheetRow["amount"])?.symbol ?? "")).size > 1) return undefined;
  let total = 0;
  let places = 0;
  // In cents where every member's dollar figure carries its rows' cents.
  const allCents = usd && present.every((f) => f!.cents != null);
  for (const f of present) {
    const v = allCents ? (f!.cents as number) : parseSheetNumber(f!.text);
    if (v == null) return null;
    total = allCents ? centsOf(total + v) : total + v;
    places = Math.max(places, placesOf(f!.text as string));
  }
  const first = present[0] as SheetRow["amount"];
  const text = usd
    ? sheetUsd(total, total > 0 && present.some((f) => String(f!.text).startsWith("+")))
    : `${total < 0 ? "−" : ""}${Math.abs(total).toLocaleString("en-US", {
        minimumFractionDigits: places,
        maximumFractionDigits: places,
      })}`;
  return {
    text,
    symbol: first?.symbol,
    address: first?.address,
    info: sumProv(what, n),
    ...(allCents ? { cents: total } : {}),
  };
}

/** The members' carry-forward rows past the first member's "Last event" (the
 *  interest, the market move), each summed over the group: what accrued or
 *  moved between the members belongs to the group's account as much as what
 *  accrued before the first. Null where a figure does not read. */
function summedCarry(memberSides: SheetSide[], n: number): SheetRow[] | null {
  const byKey = new Map<string, (SheetRow & { sub?: SheetRow[] })[]>();
  for (const side of memberSides)
    for (const r of side.carry) if (r.key !== "last") byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  const out: SheetRow[] = [];
  for (const [key, rs] of byKey) {
    const label = key === "interest" ? WORDS.interest : key === "market" ? WORDS.market : rs[0].label;
    const what = typeof label === "string" ? label : key;
    // A row stated per asset (the interest's lines) sums its lines.
    const lines = (r: SheetRow & { sub?: SheetRow[] }) => (r.amount ? [r] : (r.sub ?? []));
    const amount = sumFigure(
      rs.flatMap((r) => lines(r).map((x) => x.amount)),
      what,
      n,
      false,
    );
    const usd = sumFigure(
      rs.map((r) => r.usd),
      `${what} in USD`,
      n,
      true,
    );
    if (amount === null || usd === null) return null;
    out.push({ key: `group-${key}`, label, amount: amount ?? undefined, usd: usd ?? undefined, tip: rs[0].tip });
  }
  return out;
}

/** The group's sheet from its members' (oldest first); null where they do
 *  not read as one. The debt the group started from is the first member's
 *  "Last event", and every member's accrual and market move is summed into
 *  the group's rows, so the rows add up from it to the total after. */
export function mergeGroupSheet(cards: CollectedCard[], label: string): EventSheet | null {
  const sheets = cards.map((c) => c.sheet);
  if (sheets.length === 0 || sheets.some((s) => !s)) return null;
  const first = sheets[0]!;
  const last = sheets[sheets.length - 1]!;
  const sides: SheetSide[] = [];
  // Panels match by `id ?? side`; a panel some member draws and the first
  // does not would be dropped, so the group does not read as one.
  const keyOf = (x: SheetSide) => x.id ?? x.side;
  const firstKeys = new Set(first.sides.map(keyOf));
  if (sheets.some((sh) => sh!.sides.some((x) => !firstKeys.has(keyOf(x))))) return null;
  for (const s of first.sides) {
    const memberSides = sheets.map((sh) => sh!.sides.find((x) => keyOf(x) === keyOf(s)));
    const lastSide = memberSides[memberSides.length - 1];
    if (memberSides.some((x) => !x) || !lastSide) return null;
    const legs = memberSides.flatMap((x, i) =>
      x!.rows.map((r) => ({
        ...r,
        key: `${cards[i].id}-${r.key}`,
        label:
          cards[i].number == null ? (
            r.label
          ) : typeof r.label === "string" ? (
            `#${cards[i].number} ${r.label}`
          ) : (
            <>
              #{cards[i].number} {r.label}
            </>
          ),
      })),
    );
    const rows = legs.length > 0 ? summedRows(legs, label, cards.length) : [];
    if (rows == null) return null;
    const carried = summedCarry(memberSides as SheetSide[], cards.length);
    if (carried == null) return null;
    const lastEvent = s.carry.find((r) => r.key === "last");
    sides.push({
      ...s,
      icons: [...new Set(memberSides.flatMap((x) => x!.icons))],
      carry: [],
      before: lastEvent
        ? { ...lastEvent, key: "before", label: WORDS.before, tip: undefined }
        : s.before && { ...s.before, label: WORDS.before },
      rows: [...carried, ...rows],
      assets: legs,
      repaid: undefined,
      total: lastSide.total,
      // The last member's amount, where every member's side holds that one asset.
      totalAmount: memberSides.every((x) => x!.totalAmount?.symbol === lastSide.totalAmount?.symbol)
        ? lastSide.totalAmount
        : undefined,
      totalTip: lastSide.totalTip,
      after: WORDS.after,
    });
  }
  return { sides, panels: last.panels, footnotes: last.footnotes };
}

// ── A group read from its members' rows ─────────────────────────────────
//
// Where a member's sheet waits on a read the card makes at open (the Aave
// family, Morpho), the member hands up the balances its row states
// (`GroupLane`) and the group's sheet is read from those: per asset, the
// balance before the first member that moved it, the members' moves summed
// (each listed under the breakdown), the interest between them, and the
// balance after the last; in dollars where the rows carry a price.

/** Below this the difference between a lane's balances and its moves is
 *  float noise, not interest. */
const LANE_DUST = 1e-6;

interface LaneAcc {
  side: FlowSide;
  symbol: string;
  address?: string;
  fmt: (v: number) => string;
  first: GroupLane;
  last: GroupLane;
  lastWithAfter?: GroupLane;
  legs: { lane: GroupLane; card: CollectedCard; at: number }[];
  labels: string[];
  moved: number;
}

const signedText = (v: number, fmt: (v: number) => string) => `${v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
const sideWord = (side: FlowSide) => (side === "collateral" ? "supplied" : "owed");
const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

const LANE_TIPS = {
  before: (sym: string, side: FlowSide) =>
    `The ${sym} ${sideWord(side)} before the group, as the row of the first of these events to move it states it, in dollars at the price that row carries.`,
  moved: (sym: string) => `The ${sym} these events moved, summed; the breakdown lists each event.`,
  leg: (sym: string) => `The ${sym} this event moved, as its row states it.`,
  interest: (sym: string) =>
    `The ${sym} balance after the last of these events, less the balance before the first and what the events moved: the interest between them.`,
  market: "The change the prices made to the side's dollar value across these events.",
  asset: (sym: string, side: FlowSide) =>
    `The ${sym} ${sideWord(side)} after the last of these events to move it, as its row states it.`,
  total: (side: FlowSide) =>
    `The ${side === "collateral" ? "collateral" : "debt"} these events moved, in dollars after the last of them: each asset's balance at the price its last row carries. Where they moved one asset, its amount stands beside the dollars.`,
};

function laneInterestProv(sym: string, before: number, after: number, moved: number, n: number): Provenance {
  return {
    kind: "chain-derived",
    summary: `Interest on ${sym} across these events. The balance after the last of them, less the balance before the first and the ${n} moves between, each as the events' rows state it.`,
    formula: "after − before − Σ moves",
    inputs: [
      { label: "before", value: `${before} ${sym}`, kind: "chain" },
      { label: "after", value: `${after} ${sym}`, kind: "chain" },
      { label: "Σ moves", value: `${moved} ${sym}`, kind: "chain-derived" },
    ],
  };
}

const LANE_VIA = "the events' rows · each asset's amount × the price its row carries at its block";

function laneSide(side: FlowSide, accs: LaneAcc[], label: string): SheetSide {
  if (accs.length === 0)
    return {
      side,
      icons: [],
      carry: [],
      rows: [],
      total: { none: WORDS.unread },
      untouched: WORDS.untouched,
      after: WORDS.after,
    };
  const multi = accs.length > 1;
  const named = (base: string, a: LaneAcc) => (multi ? `${base} · ${a.symbol}` : base);
  const amountOf = (a: LaneAcc, v: number, info: Provenance, value: string) => ({
    text: a.fmt(v),
    symbol: a.symbol,
    address: a.address,
    info,
    value,
  });
  // Each dollar cell is its rows' cents, each price the one its row carries
  // at its block (lib/shared/sheet-usd-rows.ts, ui-jobs 743). A lane whose
  // row prices nothing draws no dollars.
  const pa = (l: GroupLane | undefined, amount: number): PricedAmount => ({
    symbol: l?.symbol ?? "",
    amount,
    price: l?.price ?? null,
    block: l?.priceBlock ?? null,
    priceNote: l?.priceNote,
  });
  const cell = (what: string, xs: PricedAmount[]) =>
    amountsUsd(what, xs, { amountNote: "as the events' rows state it", via: LANE_VIA });
  const interest: SheetRow[] = [];
  const moves: SheetRow[] = [];
  const legs: (SheetRow & { at: number })[] = [];
  const holdings: SheetRow[] = [];
  const befores: SheetRow[] = [];
  const beforeLegs: PricedAmount[] = [];
  const afterLegs: PricedAmount[] = [];
  const movedLegs: PricedAmount[] = [];
  const interestLegs: PricedAmount[] = [];
  // Every figure on every lane priced: the totals and Market move stand.
  let priced = true;
  let unread = false;
  for (const a of accs) {
    const b = a.first.before;
    const aft = a.lastWithAfter?.after;
    const bv = b ? Number(b.value) : null;
    const av = aft ? Number(aft.value) : null;
    if (a.first.price == null || (a.lastWithAfter && a.lastWithAfter.price == null)) priced = false;
    if (b && bv != null) {
      const leg = pa(a.first, bv);
      beforeLegs.push(leg);
      befores.push({
        key: `before-${a.symbol}`,
        label: multi ? a.symbol : WORDS.before,
        amount: amountOf(a, bv, b.prov, b.value),
        usd: a.first.price != null ? cellOf(cell(`${capital(a.symbol)} before the group, in USD`, [leg])) : undefined,
        tip: LANE_TIPS.before(a.symbol, side),
      });
    } else priced = false;
    // The interest: what the balances say beyond the moves, where the first
    // row states the balance before and the last the balance after.
    if (b && a.last.after && bv != null && av != null) {
      const r = av - bv - a.moved;
      if (Math.abs(r) >= LANE_DUST) {
        const leg = pa(a.lastWithAfter, r);
        interestLegs.push(leg);
        interest.push({
          key: `interest-${a.symbol}`,
          label: named(WORDS.interest, a),
          amount: amountOf(a, r, laneInterestProv(a.symbol, bv, av, a.moved, a.legs.length), String(r)),
          usd:
            a.lastWithAfter?.price != null
              ? cellOf(cell(`Interest on ${a.symbol} across these events, in USD`, [leg]))
              : undefined,
          tip: LANE_TIPS.interest(a.symbol),
        });
      }
    }
    if (a.legs.length > 0) {
      const words = capital(a.labels.join(" + ").toLowerCase());
      const mine = a.legs.map(({ lane }) => pa(lane, Number(lane.change)));
      movedLegs.push(...mine);
      if (a.legs.some(({ lane }) => lane.price == null)) priced = false;
      moves.push({
        key: `group-${a.symbol}`,
        label: named(a.labels.length > 0 ? words : label, a),
        amount: {
          text: signedText(a.moved, a.fmt),
          symbol: a.symbol,
          address: a.address,
          info: sumProv(`${a.symbol} moved`, a.legs.length),
          value: String(a.moved),
        },
        usd: a.legs.every(({ lane }) => lane.price != null)
          ? cellOf(cell(`${a.symbol} moved across these events, in USD`, mine))
          : undefined,
        tip: LANE_TIPS.moved(a.symbol),
      });
    }
    for (const { lane, card, at } of a.legs) {
      const c = Number(lane.change);
      legs.push({
        at,
        key: `${card.id}-${a.symbol}`,
        label: card.number == null ? lane.label : `#${card.number} ${lane.label}`,
        tip: LANE_TIPS.leg(a.symbol),
        amount: {
          text: signedText(c, a.fmt),
          symbol: a.symbol,
          address: a.address,
          info: lane.changeProv,
          value: lane.change,
        },
        usd: lane.price != null ? cellOf(cell(`The ${a.symbol} this event moved, in USD`, [pa(lane, c)])) : undefined,
      });
    }
    if (aft && av != null) {
      const leg = pa(a.lastWithAfter, av);
      afterLegs.push(leg);
      holdings.push({
        key: `after-${a.symbol}`,
        label: a.symbol,
        amount: amountOf(a, av, aft.prov, aft.value),
        usd:
          a.lastWithAfter?.price != null
            ? cellOf(cell(`${capital(a.symbol)} after these events, in USD`, [leg]))
            : undefined,
        tip: LANE_TIPS.asset(a.symbol, side),
      });
    } else unread = true;
  }
  const afterCell = cell(`${capital(side)} after these events, in USD`, afterLegs);
  const beforeCell = cell(`${capital(side)} before the group, in USD`, beforeLegs);
  const market: SheetRow[] = [];
  if (priced && !unread) {
    const move = groupMoveUsd(
      afterCell,
      beforeCell,
      cell(`${capital(side)} moved across these events, in USD`, movedLegs),
      interestLegs.length ? cell(`Interest on the ${side} across these events, in USD`, interestLegs) : null,
    );
    if (move.usd != null && Math.abs(move.usd) >= 0.005)
      market.push({ key: "group-market", label: WORDS.market, usd: cellOf(move), tip: LANE_TIPS.market });
  }
  const one = accs[0];
  const total: SheetSide["total"] = unread
    ? { none: WORDS.unread }
    : accs.every((a) => a.lastWithAfter?.price != null)
      ? cellOf(afterCell)
      : !multi && one.lastWithAfter?.after && one.lastWithAfter.price == null
        ? SHEET_NO_USD
        : { none: WORDS.unpriced };
  // One asset on the side: the total states its amount.
  const soleAfter = !multi && !unread ? one.lastWithAfter?.after : undefined;
  const before: SheetRow | undefined = multi
    ? befores.length === accs.length
      ? {
          key: "before",
          label: WORDS.before,
          usd: accs.every((a) => a.first.price != null) ? cellOf(beforeCell) : undefined,
        }
      : undefined
    : befores[0] && { ...befores[0], key: "before" };
  return {
    side,
    icons: accs.filter((a) => Number(a.lastWithAfter?.after?.value ?? "1") > 0).map((a) => a.symbol),
    // A lane the group opened (nothing held before it) states no line of its
    // own above the side's total before.
    carry: multi ? befores.filter((r) => Number(r.amount?.value ?? "0") !== 0) : [],
    before,
    rows: [...interest, ...market, ...moves],
    // Each member's move in the members' order, then what the side holds.
    assets: [...legs.sort((x, y) => x.at - y.at).map(({ at: _at, ...r }) => r), ...holdings],
    total,
    totalAmount: soleAfter && amountOf(one, Number(soleAfter.value), soleAfter.prov, soleAfter.value),
    untouched: WORDS.untouched,
    after: WORDS.after,
    totalTip: LANE_TIPS.total(side),
  };
}

/** The group's sheet from the balances its members' rows state (oldest
 *  first); null where a member hands up none. */
export function mergeLaneSheet(cards: CollectedCard[], label: string): EventSheet | null {
  if (cards.length === 0 || cards.some((c) => !c.lanes)) return null;
  const lanes = new Map<string, LaneAcc>();
  for (const [at, card] of cards.entries())
    for (const l of card.lanes!) {
      const c = Number(l.change);
      if (!Number.isFinite(c)) return null;
      const key = `${l.side}:${(l.address ?? l.symbol).toLowerCase()}`;
      let acc = lanes.get(key);
      if (!acc) {
        acc = {
          side: l.side,
          symbol: l.symbol,
          address: l.address,
          fmt: l.fmt,
          first: l,
          last: l,
          legs: [],
          labels: [],
          moved: 0,
        };
        lanes.set(key, acc);
      }
      acc.last = l;
      if (l.after) acc.lastWithAfter = l;
      if (c === 0) continue;
      acc.legs.push({ lane: l, card, at });
      acc.moved += c;
      if (!acc.labels.includes(l.label)) acc.labels.push(l.label);
    }
  if (lanes.size === 0) return null;
  const all = [...lanes.values()];
  return {
    sides: (["collateral", "debt"] as const).map((side) =>
      laneSide(
        side,
        all.filter((a) => a.side === side),
        label,
      ),
    ),
    panels: [],
  };
}

/** A group read from its rows: each asset's price as the last member that
 *  carries one states it. */
export function mergeLanePrice(cards: CollectedCard[]): EventCardPrice | undefined {
  const seen = new Map<string, EventPriceChip>();
  for (const c of [...cards].reverse())
    for (const p of c.price?.prices ?? []) if (!seen.has(p.symbol)) seen.set(p.symbol, p);
  return seen.size > 0 ? { gas: null, prices: [...seen.values()].reverse() } : undefined;
}

/** The group's price row: the last member's prices, its claimable, and the
 *  members' P/L summed where every member that states one reads. */
export function mergeGroupPrice(cards: CollectedCard[]): EventCardPrice | undefined {
  const last = cards[cards.length - 1]?.price;
  if (!last) return undefined;
  const pls = cards.map((c) => c.price?.outcome?.pl).filter((p) => p != null);
  const pl = pls.length > 0 ? { usd: pls.reduce((a, p) => a + p!.usd, 0), word: pls[0]!.word } : undefined;
  return {
    gas: null,
    prices: last.prices,
    figures: last.figures,
    outcome: last.outcome || pl ? { claimable: last.outcome?.claimable, pl } : null,
  };
}

/** Mounts the members out of sight and reports the group's sheet and price,
 *  or null where the members do not read as one. */
export function GroupSheetCollector({
  members,
  count,
  label,
  merge,
  onSheet,
}: {
  members: ReactNode;
  /** The members the group holds: the sheet waits for every one. */
  count: number;
  /** The summed rows' label ("Redemptions"). */
  label: string;
  /** The family's own reading of its members' sheets (oldest first), in
   *  place of `mergeGroupSheet`: a Liquity V2 delegate run sums its members'
   *  accruals and states the rate's sequence. */
  merge?: (cards: CollectedCard[]) => EventSheet | null;
  /** The merged sheet; null where the members do not read as one;
   *  undefined while they are still being collected. */
  onSheet: (merged: { sheet: EventSheet; price?: EventCardPrice } | null | undefined) => void;
}) {
  const [cards, setCards] = useState<Map<string, CollectedCard>>(() => new Map());
  const collect = useCallback((card: CollectedCard) => {
    setCards((m) => new Map(m).set(card.id, card));
    return () =>
      setCards((m) => {
        const next = new Map(m);
        next.delete(card.id);
        return next;
      });
  }, []);
  const merged = useMemo(() => {
    if (cards.size !== count) return null;
    const ordered = [...cards.values()].sort(
      (a, b) =>
        (a.number ?? 0) - (b.number ?? 0) || (a.blockNumber ?? 0) - (b.blockNumber ?? 0) || a.timestamp - b.timestamp,
    );
    if (!merge && ordered.every((c) => c.lanes)) {
      const sheet = mergeLaneSheet(ordered, label);
      return sheet ? { sheet, price: mergeLanePrice(ordered) } : null;
    }
    const sheet = merge ? merge(ordered) : mergeGroupSheet(ordered, label);
    return sheet ? { sheet, price: mergeGroupPrice(ordered) } : null;
  }, [cards, count, label, merge]);
  const complete = cards.size === count;
  useEffect(() => onSheet(complete ? merged : undefined), [complete, merged, onSheet]);
  return (
    <SheetCollectContext.Provider value={collect}>
      <div
        hidden
        data-group-collected={cards.size}
        data-group-sheets={[...cards.values()].filter((c) => c.sheet).length}
      >
        {members}
      </div>
    </SheetCollectContext.Provider>
  );
}
