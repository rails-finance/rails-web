// The event card's ledger (rails-ops reference/lifetime-flows-scrubber.md,
// "The event card's sum"): a T2 account cell (Collateral, Debt) opened into
// the side's lifetime flows as of the event. One row per kind of flow, the
// event's part of its kind on a separate row ("Withdrawn before",
// "This withdrawal"), the price's effect (Market move) where USD shows, and a
// total line: the side before → after the event's transaction.
//
// Built on the token sums of lib/shared/flow-focus.ts (`eventTokenSum`,
// `assetTokenSumFor`), which round a side's lines together so they add to the
// printed balance, and on its dollar lines (`eventSideSum`,
// `eventSideSumByAsset`). Splitting a line keeps that rule: the event's row is
// its legs rounded, the earlier row the line less it, so the rows add to the
// printed total in tokens and in dollars.
//
// Pure, tested offline (scripts/verify/verify-liquity-flows.ts,
// scripts/verify/verify-lifetime-flows-state.ts).

import { apportionSigned, NO_FIGURE, noPriceWords, wholeUsd } from "@/lib/shared/flows-sum";
import {
  assetTokenSumFor,
  signedShownUsd,
  fmtTokens,
  interestLine,
  type AssetSum,
  type FocusEvent,
  type TokenSum,
} from "@/lib/shared/flow-focus";
import {
  flowLeg,
  hasParts,
  unitOf,
  type FlowBucket,
  type FlowLeg,
  type MarketMove,
  type FlowModel,
  type FlowSegment,
  type FlowSide,
  type FlowUnit,
} from "@/lib/shared/flows-timeline";
import { centsOf, roundAway, shownPrice, shownUsd } from "@/lib/shared/shown-usd";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";

/** "5 Jul '25": the day a ledger's rows stand at. */
export const ledgerDayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** Where the page does not hold every event of the day, the rows stand at
 *  its close; the ledger says so under its rows. */
export function dayCloseNote(eventTs?: number): string {
  return `The page does not hold every event of ${eventTs != null ? ledgerDayStamp(eventTs) : "this day"}, so the rows stand at the close of that day.`;
}

/** A row's part: a kind of flow the event left alone, the earlier movements
 *  of a kind it moved, its movement, an asset's interest, the price's
 *  effect. */
export type LedgerRole = "flow" | "before" | "event" | "interest" | "market";

export interface LedgerRow {
  /** Unique within the ledger. */
  key: string;
  /** The bucket or line the row states. */
  line: string;
  label: string;
  role: LedgerRole;
  /** The bar's segment the swatch draws; null for the dashed box. */
  seg: FlowSegment | null;
  /** Signed, in units of the printed last decimal, and printed ("−200.00"). */
  tokens: { units: number; text: string } | null;
  /** Signed whole dollars, and printed ("−$1,151"); in a ledger of legs
   *  with their parts (ui-jobs 743) also `cents`, the sum of its legs' cents
   *  that the face rounds, and the legs for its receipt. A row with no
   *  figure prints "—" and names its unpriced assets, or says why
   *  (`market`). */
  usd: LedgerUsd | null;
}

export interface LedgerUsd {
  dollars: number;
  text: string;
  cents?: number;
  legs?: FlowLeg[];
  unpriced?: string[];
  market?: MarketMove;
  /** A served series' line: the sentence its receipt states (`FlowWords.served`). */
  served?: string;
}

export interface Ledger {
  side: FlowSide;
  /** The token the rows count; null where they are in dollars. */
  symbol: string | null;
  decimals: number | null;
  rows: LedgerRow[];
  /** What is held or owed: before the event's transaction where it moved
   *  the side, and after. */
  tokens: { before: string | null; after: string; units: number } | null;
  usd: { before: string | null; after: string; dollars: number; cents?: number } | null;
  /** The token's price at the event, where the builder is given it: the
   *  off-par stablecoin rule reads it (lib/shared/usd-display.ts). */
  price?: number | null;
  /** The amount and price the total multiplies out from, where the ledger
   *  states one asset at the block's price (a side by asset). */
  held?: { amount: number; price: number; block: number | null; priceNote?: string };
  /** Plain lines under the rows: a line with no figure for want of a price,
   *  or a Market move whose two values stand on different bases. */
  notes?: string[];
}

/** A dollar line of the side, as flow-focus prints it; in cents where its
 *  legs carry their parts (`SumLine`). */
export interface UsdLine {
  key: string;
  label: string;
  kind: "opening" | "in" | "out" | "rest";
  seg: FlowSegment | null;
  dollars: number;
  cents?: number;
  unpriced?: string[];
  none?: string;
}

const toCents = centsOf;

/** A row's dollars from its cents: the face to the dollar, the cents kept. */
function centsUsd(
  cents: number,
  extra: Omit<LedgerUsd, "dollars" | "text" | "cents"> = {},
  unit?: FlowUnit,
): LedgerUsd {
  return { dollars: roundAway(cents), text: signedUsd(cents, unit), cents, ...extra };
}

/** A row with no figure: "—", its unpriced assets or why. */
function noFigure(extra: Omit<LedgerUsd, "dollars" | "text" | "cents">): LedgerUsd {
  return { dollars: 0, text: NO_FIGURE, ...extra };
}

/** The legs of a line less the event's: one match per event leg. */
function legsLess(all: FlowLeg[], gone: FlowLeg[]): FlowLeg[] {
  const left = [...all];
  for (const g of gone) {
    const i = left.findIndex(
      (l) => l.symbol === g.symbol && l.amount === g.amount && l.price === g.price && l.block === g.block,
    );
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

/** The notes a ledger states under its rows for its rows with no figure. */
function notesFor(rows: LedgerRow[]): string[] | undefined {
  const notes: string[] = [];
  for (const r of rows) {
    if (r.usd?.unpriced?.length && r.role !== "before")
      notes.push(`${r.label} has no dollar figure: ${noPriceWords(r.usd.unpriced)}.`);
    if (r.usd?.market && "none" in r.usd.market && !r.usd.market.none.startsWith("No dollar figure"))
      notes.push(r.usd.market.none);
  }
  return notes.length ? [...new Set(notes)] : undefined;
}

export const signedTokens = (units: number, decimals: number): string =>
  `${units < 0 ? "−" : ""}${fmtTokens(units / 10 ** decimals, decimals)}`;
export const signedUsd = (dollars: number, unit?: FlowUnit): string =>
  `${dollars < 0 ? "−" : ""}${wholeUsd(dollars, unit)}`;

/** The event's row, by the name the timeline gives the event that fills
 *  its bucket. */
const THIS_ROW: Record<string, string> = {
  Deposit: "This deposit",
  Supply: "This deposit",
  Withdraw: "This withdrawal",
  "Withdraw and swap": "This withdrawal",
  Borrow: "This borrow",
  Repay: "This repayment",
  "Repay with collateral": "This repayment",
  Redemption: "This redemption",
  Liquidation: "This liquidation",
  Liquidated: "This liquidation",
  "Upfront Borrowing Fee": "This Upfront Borrowing Fee",
  Redistribution: "This redistribution",
  "Transferred in": "This transfer in",
  "Transferred out": "This transfer out",
  "Collateral swap": "This swap",
  "Debt swap": "This debt swap",
  "Debt written off": "This write-off",
  Mint: "This mint",
  "Challenge sale": "This challenge sale",
  "Forced sale": "This forced sale",
  Rebalance: "This rebalance",
  "Pool liquidation": "This liquidation",
};

/** A row's words: the line's name, its earlier movements, the event's. */
export function ledgerWords(
  b: FlowBucket | undefined,
  label: string,
): { plain: string; before: string; event: string } {
  const plain = b?.ledgerLabel ?? (b?.tone === "redemption" ? "Redeemed" : label);
  return { plain, before: `${plain} before`, event: THIS_ROW[b?.event ?? ""] ?? "This event" };
}

/** The bar's segment for a bucket, for its swatch. */
export function bucketSeg(b: FlowBucket): FlowSegment {
  return b.dir === "out"
    ? { key: b.key, label: b.label, fill: "out", tone: b.tone ?? "exit", hatch: b.hatch, width: 0, value: 0 }
    : { key: b.key, label: b.label, fill: "in", ...(b.hatch ? { hatch: b.hatch } : {}), width: 0, value: 0 };
}

/** The event's legs on a line (its act; the interest accrued since the
 *  last event is not, unless `accrual`, which reads that alone), in tokens
 *  and USD; null where it has none. */
function eventPart(
  ev: FocusEvent | null,
  key: string,
  symbol?: string,
  accrual = false,
): { amount: number; usd: number; legs: FlowLeg[]; unpriced: string[] } | null {
  let amount = 0;
  let usd = 0;
  let act = false;
  const legs: FlowLeg[] = [];
  const unpriced: string[] = [];
  for (const l of ev?.legs ?? []) {
    if (l.bucket !== key || !!l.accrual !== accrual) continue;
    if (symbol != null && l.symbol !== symbol) continue;
    act = true;
    amount += l.amount ?? 0;
    if (hasParts(l)) {
      legs.push({ ...l, ts: ev?.ts });
      if (l.usd == null) {
        if (l.symbol && !unpriced.includes(l.symbol)) unpriced.push(l.symbol);
      } else usd = toCents(usd + l.usd);
    } else usd += l.usd ?? 0;
  }
  return act ? { amount, usd, legs, unpriced } : null;
}

const usdTotal = (dollars: number, before: number | null, unit?: FlowUnit, cents?: number) => ({
  before:
    before != null && roundAway(before) !== roundAway(dollars) && roundAway(before) !== 0
      ? wholeUsd(before, unit)
      : null,
  after: wholeUsd(cents ?? dollars, unit),
  dollars: cents != null ? roundAway(cents) : dollars,
  ...(cents != null ? { cents } : {}),
});

/** A side's ledger in its token: `sum`'s lines, the event's part of each
 *  line it moved on a separate row. With `usd`, each row carries its
 *  dollars and the dollar lines with no token amount follow (Market move). */
export function tokenLedger({
  model,
  side,
  ev,
  sum,
  usd,
  symbolFilter,
  accrualLabel,
  price,
  held,
}: {
  model: FlowModel;
  side: FlowSide;
  /** The event the card states; null for none (no row is split). */
  ev: FocusEvent | null;
  sum: TokenSum;
  /** The side's dollar lines and total; `cents` where the lines are in
   *  cents (their legs carry their parts). */
  usd: { lines: UsdLine[]; dollars: number; before: number | null; cents?: number } | null;
  /** Read only the event's legs in this token (a side by asset). */
  symbolFilter?: string;
  /** Where the family counts the accrual since the last event in the event's
   *  move (Liquity V2's debt): a line the accrual alone moved splits into its
   *  earlier part and this row, which the function names by the line's key. */
  accrualLabel?: (key: string) => string;
  /** The token's price at the event. */
  price?: number | null;
  /** The amount and price the total multiplies out from, for its receipt. */
  held?: Ledger["held"];
}): Ledger {
  const scale = 10 ** sum.decimals;
  const bucketOf = (k: string) => model.buckets.find((b) => b.key === k);
  const usdOf = new Map(usd?.lines.map((l) => [l.key, l]) ?? []);
  // In cents where the lines are: a served series' lines are whole dollars.
  const inCents = usd != null && usd.lines.some((l) => l.cents != null || l.unpriced);
  const rows: LedgerRow[] = [];
  const row = (
    key: string,
    line: string,
    label: string,
    role: LedgerRole,
    seg: FlowSegment | null,
    units: number | null,
    dollars: number | LedgerUsd | null,
  ): LedgerRow => ({
    key,
    line,
    label,
    role,
    seg,
    tokens: units == null ? null : { units, text: signedTokens(units, sum.decimals) },
    usd:
      dollars == null
        ? null
        : typeof dollars === "number"
          ? { dollars, text: signedUsd(dollars), ...(servedOf(line) ? { served: servedOf(line) } : {}) }
          : dollars,
  });
  /** The sentence a served series' line states in its receipt. */
  const servedOf = (line: string) => usdOf.get(line)?.seg?.served;
  /** A whole line's dollars in cents: its legs' sum, or no figure. */
  const lineCents = (u: UsdLine | undefined): LedgerUsd =>
    u?.unpriced?.length
      ? noFigure({ unpriced: u.unpriced, legs: u.seg?.legs })
      : u?.none != null
        ? noFigure({ market: u.seg?.market ?? { none: u.none } })
        : centsUsd(u?.cents ?? 0, {
            ...(u?.seg?.legs ? { legs: u.seg.legs } : {}),
            ...(u?.seg?.market ? { market: u.seg.market } : {}),
          });
  const accrualLines: { key: string; before: string; label: string }[] = [];
  for (const l of sum.lines) {
    const b = bucketOf(l.key);
    const u = usdOf.get(l.key);
    const seg = l.kind === "interest" ? null : b ? bucketSeg(b) : (u?.seg ?? null);
    const words = ledgerWords(b, l.label);
    const sign = l.kind === "out" ? -1 : 1;
    const lineUsd: number | LedgerUsd | null = !usd ? null : inCents ? lineCents(u) : (u?.dollars ?? 0);
    let part = l.kind === "interest" ? null : eventPart(ev, l.key, symbolFilter);
    let eventLabel = words.event;
    if (!part && accrualLabel && l.kind !== "interest") {
      part = eventPart(ev, l.key, symbolFilter, true);
      eventLabel = accrualLabel(l.key);
      if (part) accrualLines.push({ key: l.key, before: words.before, label: eventLabel });
    }
    const evUnits = part ? sign * Math.round(part.amount * scale) : 0;
    if (part && evUnits !== 0) {
      const beforeUnits = l.units - evUnits;
      let evUsd: number | LedgerUsd | null;
      let beforeUsd: number | LedgerUsd | null;
      if (lineUsd == null) evUsd = beforeUsd = null;
      else if (typeof lineUsd === "number") {
        evUsd = u ? sign * Math.round(part.usd) : 0;
        beforeUsd = lineUsd - evUsd;
      } else {
        // The event's row is its legs' cents; the earlier row the line less
        // them, so the rows add to the line in cents. A line with no figure
        // has no earlier part either.
        const evCents = toCents(sign * part.usd);
        evUsd = part.unpriced.length
          ? noFigure({ unpriced: part.unpriced, legs: part.legs })
          : centsUsd(evCents, { legs: part.legs });
        beforeUsd =
          lineUsd.cents == null
            ? noFigure({ unpriced: lineUsd.unpriced, legs: legsLess(lineUsd.legs ?? [], part.legs) })
            : centsUsd(toCents(lineUsd.cents - evCents), { legs: legsLess(lineUsd.legs ?? [], part.legs) });
      }
      if (beforeUnits !== 0) rows.push(row(l.key, l.key, words.before, "before", seg, beforeUnits, beforeUsd));
      else evUsd = lineUsd;
      rows.push(row(`${l.key}#event`, l.key, eventLabel, "event", seg, evUnits, evUsd));
    } else
      rows.push(row(l.key, l.key, words.plain, l.kind === "interest" ? "interest" : "flow", seg, l.units, lineUsd));
  }
  if (usd)
    for (const u of usd.lines) {
      if (sum.lines.some((l) => l.key === u.key)) continue;
      const b = bucketOf(u.key);
      rows.push(
        row(
          u.key,
          u.key,
          u.kind === "rest" ? "Market move" : ledgerWords(b, u.label).plain,
          u.kind === "rest" ? "market" : u.key === interestLine(side).key ? "interest" : "flow",
          u.kind === "rest" || u.key === interestLine(side).key ? null : b ? bucketSeg(b) : u.seg,
          null,
          inCents ? lineCents(u) : u.dollars,
        ),
      );
    }
  let before = sum.before;
  if (accrualLabel && ev?.sides) {
    // The accrual counts in the event's move: the before is the balance the
    // previous event recorded, and the event's rows (in bold) add from it to
    // the after. A unit or two of rounding between them goes to the accrual's
    // row, from its earlier part.
    const units = (r: LedgerRow) => r.tokens?.units ?? 0;
    const recorded = Math.round(Math.max(0, sum.held - ev.sides[side].amount) * scale);
    const moved = rows.reduce((a, r) => a + (r.role === "event" ? units(r) : 0), 0);
    const gap = sum.total.units - recorded - moved;
    const set = (r: LedgerRow, n: number) => (r.tokens = { units: n, text: signedTokens(n, sum.decimals) });
    if (gap !== 0 && Math.abs(gap) <= 2)
      for (const a of accrualLines) {
        const at = rows.findIndex((r) => r.line === a.key && (r.role === "before" || r.role === "flow"));
        if (at < 0) continue;
        const earlier = rows[at];
        const acc = rows.find((r) => r.line === a.key && r.role === "event");
        // An accrual adds to the debt: rounding never turns its row negative.
        if ((acc ? units(acc) : 0) + gap < 0) break;
        if (acc) set(acc, units(acc) + gap);
        else
          rows.splice(
            at + 1,
            0,
            row(`${a.key}#event`, a.key, a.label, "event", earlier.seg, gap, earlier.usd ? 0 : null),
          );
        set(earlier, units(earlier) - gap);
        earlier.role = "before";
        earlier.label = a.before;
        if (units(earlier) === 0 && !earlier.usd?.dollars) rows.splice(at, 1);
        break;
      }
    before = recorded !== sum.total.units && recorded !== 0 ? fmtTokens(recorded / scale, sum.decimals) : null;
  }
  const notes = inCents ? notesFor(rows) : undefined;
  return {
    side,
    symbol: sum.symbol,
    decimals: sum.decimals,
    rows,
    tokens: { before, after: sum.total.amount, units: sum.total.units },
    usd: usd ? usdTotal(usd.dollars, usd.before, undefined, inCents ? (usd.cents ?? usd.dollars) : undefined) : null,
    ...(price != null ? { price } : {}),
    ...(held && usd ? { held } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** A side's ledger in dollars, where the page does not hold every flow
 *  before the event (its tokens cannot be counted) or a moment's sum. */
export function dollarLedger({
  model,
  side,
  ev,
  lines,
  dollars,
  before,
  cents,
}: {
  model: FlowModel;
  side: FlowSide;
  ev: FocusEvent | null;
  lines: UsdLine[];
  dollars: number;
  before: number | null;
  /** The total in cents, where the lines are (`SumLine.cents`). */
  cents?: number;
}): Ledger {
  const unit = unitOf(model, side);
  const inCents = lines.some((l) => l.cents != null || l.unpriced);
  const rows: LedgerRow[] = [];
  const row = (
    key: string,
    line: string,
    label: string,
    role: LedgerRole,
    seg: FlowSegment | null,
    d: number | LedgerUsd,
  ) =>
    rows.push({
      key,
      line,
      label,
      role,
      seg,
      tokens: null,
      usd: typeof d === "number" ? { dollars: d, text: signedUsd(d, unit) } : d,
    });
  const lineUsd = (l: UsdLine): LedgerUsd =>
    l.unpriced?.length
      ? noFigure({ unpriced: l.unpriced, legs: l.seg?.legs })
      : l.none != null
        ? noFigure({ market: l.seg?.market ?? { none: l.none } })
        : centsUsd(
            l.cents ?? 0,
            { ...(l.seg?.legs ? { legs: l.seg.legs } : {}), ...(l.seg?.market ? { market: l.seg.market } : {}) },
            unit,
          );
  for (const l of lines) {
    const b = model.buckets.find((x) => x.key === l.key);
    const words = ledgerWords(b, l.label);
    if (l.kind === "rest") {
      row(l.key, l.key, l.label, "market", null, inCents ? lineUsd(l) : l.dollars);
      continue;
    }
    const interest = l.key === interestLine(side).key;
    const seg = interest ? null : b ? bucketSeg(b) : l.seg;
    const part = interest ? null : eventPart(ev, l.key);
    const sign = l.kind === "out" ? -1 : 1;
    if (!inCents) {
      const evDollars = part ? sign * Math.round(part.usd) : 0;
      if (part && evDollars !== 0) {
        if (l.dollars !== evDollars) row(l.key, l.key, words.before, "before", seg, l.dollars - evDollars);
        row(`${l.key}#event`, l.key, words.event, "event", seg, evDollars);
      } else row(l.key, l.key, interest ? l.label : words.plain, interest ? "interest" : "flow", seg, l.dollars);
      continue;
    }
    const whole = lineUsd(l);
    const evCents = part ? toCents(sign * part.usd) : 0;
    const moved = part != null && (part.unpriced.length > 0 || Math.abs(evCents) >= 0.005);
    if (part && moved) {
      const evUsd = part.unpriced.length
        ? noFigure({ unpriced: part.unpriced, legs: part.legs })
        : centsUsd(evCents, { legs: part.legs }, unit);
      const rest = legsLess(whole.legs ?? [], part.legs);
      if (whole.cents == null) {
        if (rest.length)
          row(l.key, l.key, words.before, "before", seg, noFigure({ unpriced: whole.unpriced, legs: rest }));
      } else if (Math.abs(whole.cents - evCents) >= 0.005)
        row(l.key, l.key, words.before, "before", seg, centsUsd(toCents(whole.cents - evCents), { legs: rest }, unit));
      row(`${l.key}#event`, l.key, words.event, "event", seg, evUsd);
    } else row(l.key, l.key, interest ? l.label : words.plain, interest ? "interest" : "flow", seg, whole);
  }
  const notes = inCents ? notesFor(rows) : undefined;
  return {
    side,
    symbol: null,
    decimals: null,
    rows,
    tokens: null,
    usd: usdTotal(dollars, before, unit, inCents ? (cents ?? dollars) : undefined),
    ...(notes ? { notes } : {}),
  };
}

/** A side holding several assets: one ledger per asset in its token, each
 *  with its dollars where the asset has a price (each flow at its block's
 *  price, its interest at the block's, Market move the asset's dollars less
 *  them), the assets' dollars apportioned to add to the side's `held`. The
 *  side's total is in dollars: the assets add only there. */
export function assetLedgers({
  model,
  side,
  ev,
  sum,
  held,
  heldBefore,
}: {
  model: FlowModel;
  side: FlowSide;
  ev: FocusEvent | null;
  sum: AssetSum;
  held: number;
  heldBefore: number | null;
}): { assets: Ledger[]; usd: { before: string | null; after: string; dollars: number; cents?: number } | null } {
  // A side whose legs carry their parts sums in cents (ui-jobs 743): each
  // asset's balance as shown times its price as shown, the side's total
  // their sum, with no figure where an asset is unpriced.
  const inCents = Object.values(sum.legs).some((by) => Object.keys(by).length > 0);
  if (inCents) return assetLedgersInCents({ model, side, ev, sum, heldBefore });
  const total = Math.round(held);
  const values = sum.symbols.map((s) => {
    const b = sum.balances.find((x) => x.symbol === s);
    if (!b || !(b.amount > 0)) return 0;
    return b.price == null ? null : b.amount * b.price;
  });
  const priced = values.every((v) => v != null);
  const shares = priced
    ? apportionSigned(values as number[], total)
    : values.map((v) => (v == null ? null : Math.round(v)));
  const assets = sum.symbols.map((symbol, i) => {
    const t = assetTokenSumFor(sum, symbol);
    const assetUsd = shares[i];
    const interest = sum.interest.find((x) => x.symbol === symbol);
    let usd: { lines: UsdLine[]; dollars: number; before: number | null } | null = null;
    if (assetUsd != null && (!interest || Math.abs(interest.amount) <= 1e-12 || interest.price != null)) {
      const lines: UsdLine[] = [];
      for (const l of sum.lines) {
        if (!l.parts.some((p) => p.symbol === symbol)) continue;
        const d =
          l.kind === "interest"
            ? Math.round((interest?.amount ?? 0) * (interest?.price ?? 0))
            : (l.kind === "out" ? -1 : 1) * Math.round(sum.usd[l.key]?.[symbol] ?? 0);
        lines.push({ key: l.key, label: l.label, kind: l.kind === "interest" ? "in" : l.kind, seg: null, dollars: d });
      }
      const rest = assetUsd - lines.reduce((a, l) => a + l.dollars, 0);
      if (rest !== 0)
        lines.push({ key: `${side}-${symbol}-market`, label: "Market move", kind: "rest", seg: null, dollars: rest });
      usd = { lines, dollars: assetUsd, before: null };
    }
    const price = sum.balances.find((x) => x.symbol === symbol)?.price ?? null;
    return tokenLedger({ model, side, ev, sum: t, usd, symbolFilter: symbol, price });
  });
  return { assets, usd: usdTotal(total, heldBefore) };
}

/** An asset's interest row as a leg: its amount as the balance less the
 *  flows, at the balance read's price. */
function interestLeg(side: FlowSide, i: AssetSum["interest"][number]): FlowLeg {
  return flowLeg({
    bucket: interestLine(side).key,
    symbol: i.symbol,
    amount: Math.abs(i.amount),
    price: i.price,
    block: i.block ?? null,
    priceNote: i.priceNote ?? "the price the side's balance read carries",
  });
}

function assetLedgersInCents({
  model,
  side,
  ev,
  sum,
  heldBefore,
}: {
  model: FlowModel;
  side: FlowSide;
  ev: FocusEvent | null;
  sum: AssetSum;
  heldBefore: number | null;
}): { assets: Ledger[]; usd: { before: string | null; after: string; dollars: number; cents?: number } | null } {
  const values = sum.symbols.map((s) => {
    const b = sum.balances.find((x) => x.symbol === s);
    if (!b || !(b.amount > 0)) return 0;
    return b.price == null ? null : shownUsd(b.amount, b.price);
  });
  const assets = sum.symbols.map((symbol, i) => {
    const t = assetTokenSumFor(sum, symbol);
    const assetCents = values[i];
    const interest = sum.interest.find((x) => x.symbol === symbol);
    const bal = sum.balances.find((x) => x.symbol === symbol);
    let usd: { lines: UsdLine[]; dollars: number; before: number | null; cents: number } | null = null;
    if (assetCents != null && (!interest || Math.abs(interest.amount) <= 1e-12 || interest.price != null)) {
      const lines: UsdLine[] = [];
      for (const l of sum.lines) {
        if (!l.parts.some((p) => p.symbol === symbol)) continue;
        const sign = l.kind === "out" ? -1 : 1;
        const legs =
          l.kind === "interest" && interest ? [interestLeg(side, interest)] : (sum.legs[l.key]?.[symbol] ?? []);
        const cents =
          l.kind === "interest"
            ? interest?.price != null
              ? signedShownUsd(interest.amount, interest.price)
              : 0
            : toCents(sign * (sum.usd[l.key]?.[symbol] ?? 0));
        lines.push({
          key: l.key,
          label: l.label,
          kind: l.kind === "interest" ? "in" : l.kind,
          seg: { key: l.key, label: l.label, fill: "in", width: 0, value: cents, legs },
          dollars: roundAway(cents),
          cents,
        });
      }
      const lineSum = toCents(lines.reduce((a, l) => a + (l.cents ?? 0), 0));
      const rest = toCents(assetCents - lineSum);
      if (Math.abs(rest) >= 0.005) {
        const key = `${side}-${symbol}-market`;
        lines.push({
          key,
          label: "Market move",
          kind: "rest",
          seg: {
            key,
            label: "Market move",
            fill: "estimate",
            width: 0,
            value: rest,
            market: { cents: rest, held: assetCents, lines: lineSum },
          },
          dollars: roundAway(rest),
          cents: rest,
        });
      }
      usd = { lines, dollars: roundAway(assetCents), before: null, cents: assetCents };
    }
    const ledger = tokenLedger({ model, side, ev, sum: t, usd, symbolFilter: symbol, price: bal?.price ?? null });
    // The held row's receipt: the balance as shown times its price as shown.
    return bal?.price != null && ledger.usd
      ? {
          ...ledger,
          held: { amount: bal.amount, price: bal.price, block: bal.block ?? null, priceNote: bal.priceNote },
        }
      : ledger;
  });
  // The side's total: the assets' cents, or no figure where one is unpriced.
  if (values.some((v) => v == null)) return { assets, usd: null };
  const cents = toCents((values as number[]).reduce((a, v) => a + v, 0));
  return { assets, usd: usdTotal(cents, heldBefore, undefined, cents) };
}

/** A token ledger restated at another price (the card set to today, ui-jobs
 *  283): the flows keep the dollars of their blocks, the total is the tokens
 *  held at `price`, and Market move takes the difference. Null for a ledger
 *  in dollars or with no USD. */
export function ledgerAtPrice(l: Ledger, price: number): Ledger | null {
  if (!l.tokens || !l.usd || l.decimals == null || !(price > 0)) return null;
  const scale = 10 ** l.decimals;
  const moved = l.rows.reduce((a, r) => a + (r.role === "event" ? (r.tokens?.units ?? 0) : 0), 0);
  const rows = l.rows.filter((r) => r.role !== "market");
  const key = l.rows.find((r) => r.role === "market")?.key ?? `${l.side}-${l.symbol ?? "usd"}-market`;
  const marketRow = (usd: LedgerUsd): LedgerRow => ({
    key,
    line: key,
    label: "Market move",
    role: "market",
    seg: null,
    tokens: null,
    usd,
  });
  if (l.usd.cents != null) {
    // In cents (ui-jobs 743): the total is the tokens as shown times today's
    // price as shown; Market move the difference of it and the rows' cents,
    // with no figure where a row has none.
    const amount = l.tokens.units / scale;
    const cents = shownUsd(amount, price);
    const before = l.tokens.before != null ? shownUsd((l.tokens.units - moved) / scale, price) : null;
    const blocked = rows.some((r) => r.usd != null && r.usd.cents == null);
    const lineSum = toCents(rows.reduce((a, r) => a + (r.usd?.cents ?? 0), 0));
    const market = toCents(cents - lineSum);
    if (blocked)
      rows.push(marketRow(noFigure({ market: { none: "No dollar figure: a line above has no price at its block." } })));
    else if (Math.abs(market) >= 0.005)
      rows.push(marketRow(centsUsd(market, { market: { cents: market, held: cents, lines: lineSum } })));
    return {
      ...l,
      rows,
      usd: usdTotal(cents, before, undefined, cents),
      price,
      held: { amount, price: shownPrice(price), block: null },
    };
  }
  const dollars = Math.round((l.tokens.units / scale) * price);
  const before = l.tokens.before != null ? ((l.tokens.units - moved) / scale) * price : null;
  const market = dollars - rows.reduce((a, r) => a + (r.usd?.dollars ?? 0), 0);
  if (market !== 0) rows.push(marketRow({ dollars: market, text: signedUsd(market) }));
  return { ...l, rows, usd: usdTotal(dollars, before), price };
}

/** The rows' sums, for the checks: every column adds to its total, the
 *  dollars to the cent where the rows are in cents. A ledger with a row of
 *  no figure has no dollar sum to check. */
export function ledgerAdds(l: Ledger): { tokens: boolean; usd: boolean } {
  const tok = l.rows.reduce((a, r) => a + (r.tokens?.units ?? 0), 0);
  const cents = l.usd?.cents != null;
  const none = l.rows.some((r) => r.usd != null && r.usd.text === NO_FIGURE);
  const usd = l.rows.reduce((a, r) => a + (cents ? (r.usd?.cents ?? 0) : (r.usd?.dollars ?? 0)), 0);
  return {
    tokens: l.tokens == null || tok === l.tokens.units,
    usd:
      l.usd == null ||
      none ||
      (cents ? roundAway(usd * 100) === roundAway((l.usd.cents as number) * 100) : usd === l.usd.dollars),
  };
}
