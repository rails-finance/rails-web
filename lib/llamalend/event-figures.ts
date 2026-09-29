// Figures for a LlamaLend event read at block − 1 and at its block
// (use-event-state.ts): the before/after pairs the card's grid and its
// explanation both state, computed once here so the two never disagree.

import type { LlamalendContext } from "@/lib/shared/types/event-shape";
import type { LlamalendEventState } from "@/lib/llamalend/use-event-state";

/** A collateral amount at the grid's precision: two significant digits under
 *  0.01, five places under 1, four above. */
export function fmtColl(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a < 0.01) return n.toLocaleString("en-US", { maximumSignificantDigits: 2 });
  if (a < 1) return n.toLocaleString("en-US", { maximumFractionDigits: 5 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** A band price: one place from 100 up, four significant digits below. */
export function fmtBandPrice(n: number): string {
  if (Math.abs(n) >= 100) return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/** A 1e18 health as a percentage with two places ("5.08%", "−54.50%"), and
 *  two significant digits under 0.01% so a health on either side of 0 never
 *  reads "0.00%" ("0.0019%", "−0.0058%"). */
export function fmtHealth(fraction: number): string {
  const pct = fraction * 100;
  const a = Math.abs(pct);
  const s =
    a > 0 && a < 0.01
      ? a.toLocaleString("en-US", { maximumSignificantDigits: 2 })
      : a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${pct < 0 ? "−" : ""}${s}%`;
}

/** A price in the borrowed token: formatNumber's three places from 1 up, four
 *  significant digits below 1 ("0.3958"). */
export function fmtPrice(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a < 1) return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

const n = (raw: string | null | undefined, decimals: number): number | null =>
  raw == null ? null : Number(raw) / 10 ** decimals;

export interface LlamalendEventFigures {
  /** The position had a loan at block − 1. */
  hadLoan: boolean;
  /** It has one at the event's block. */
  hasLoan: boolean;
  collBefore: number | null;
  collAfter: number | null;
  convBefore: number | null;
  convAfter: number | null;
  debtBefore: number | null;
  debtAfter: number | null;
  healthBefore: number | null;
  healthAfter: number | null;
  n1Before: number | null;
  n2Before: number | null;
  n1After: number | null;
  n2After: number | null;
  /** Band top and bottom price after the event, in the borrowed token. */
  pUpAfter: number | null;
  pDownAfter: number | null;
  /** The stored liquidation discount at block − 1 (fraction). */
  discountBefore: number | null;
  /** The AMM's oracle price at block − 1 and at the event's block. */
  priceBefore: number | null;
  priceAfter: number | null;
  /** Health and the oracle price at the start of the event's block (a
   *  liquidation row's `start` read); null where not read. */
  healthStart: number | null;
  priceStart: number | null;
}

export function llamalendEventFigures(ctx: LlamalendContext, s: LlamalendEventState): LlamalendEventFigures {
  const cd = ctx.collateralDecimals;
  const bd = ctx.borrowedDecimals;
  const b = s.before;
  const a = s.after;
  const tick = (t: string | null) => (t == null ? null : Number(t));
  return {
    hadLoan: b.hasLoan,
    hasLoan: a.hasLoan,
    collBefore: b.hasLoan ? n(b.collateralRaw, cd) : 0,
    collAfter: a.hasLoan ? n(a.collateralRaw, cd) : 0,
    convBefore: b.hasLoan ? n(b.convertedRaw, bd) : 0,
    convAfter: a.hasLoan ? n(a.convertedRaw, bd) : 0,
    debtBefore: b.hasLoan ? n(b.debtRaw, bd) : 0,
    debtAfter: a.hasLoan ? n(a.debtRaw, bd) : 0,
    healthBefore: b.hasLoan ? n(b.healthRaw, 18) : null,
    healthAfter: a.hasLoan ? n(a.healthRaw, 18) : null,
    n1Before: b.hasLoan ? tick(b.n1) : null,
    n2Before: b.hasLoan ? tick(b.n2) : null,
    n1After: a.hasLoan ? tick(a.n1) : null,
    n2After: a.hasLoan ? tick(a.n2) : null,
    pUpAfter: a.hasLoan ? n(a.pUpRaw, 18) : null,
    pDownAfter: a.hasLoan ? n(a.pDownRaw, 18) : null,
    discountBefore: b.hasLoan ? n(b.liquidationDiscountRaw, 18) : null,
    priceBefore: n(b.priceOracleRaw, 18),
    priceAfter: n(a.priceOracleRaw, 18),
    healthStart: s.start ? n(s.start.healthRaw, 18) : null,
    priceStart: s.start ? n(s.start.priceOracleRaw, 18) : null,
  };
}

/** The last stated collateral before an event: the nearest earlier row whose
 *  UserState stated it, with no row between that moved collateral without
 *  stating the result. Anything the chain reads below it at block − 1 was
 *  moved by the AMM. */
export interface LlamalendPreviousStated {
  collateral: number;
  timestamp: number;
}

/** A gap below this share of the stated balance is the AMM's rounding. */
const REL_EPS = 1e-9;

/** Collateral the AMM sold between the last stated balance and this event's
 *  block − 1 (positive), or null when there is none to state. */
export function soldSincePrevious(prev: LlamalendPreviousStated | null | undefined, f: LlamalendEventFigures) {
  if (!prev || f.collBefore == null || !f.hadLoan) return null;
  const gap = prev.collateral - f.collBefore;
  if (gap <= Math.max(prev.collateral * REL_EPS, 1e-12)) return null;
  return gap;
}

/** For each event id, the last collateral an earlier row stated — walking
 *  back past rows that stated nothing and moved no collateral (a repay while
 *  converted logs a sentinel), and stopping at one that moved collateral
 *  without stating the result (a partial liquidation). */
export function llamalendPreviousStatedMap(
  events: readonly {
    id: string;
    blockNumber: number;
    timestamp: number;
    context: { data: LlamalendContext };
  }[],
): Map<string, LlamalendPreviousStated | null> {
  const ordered = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.context.data.role !== "liquidator")
    .sort((a, b) => a.e.blockNumber - b.e.blockNumber || a.i - b.i);
  const out = new Map<string, LlamalendPreviousStated | null>();
  let prev: LlamalendPreviousStated | null = null;
  for (const { e } of ordered) {
    out.set(e.id, prev);
    const c = e.context.data;
    if (c.collateralAfter != null) prev = { collateral: Number(c.collateralAfter), timestamp: e.timestamp };
    else if (Number(c.collateralDelta ?? 0) !== 0) prev = null;
  }
  return out;
}

/** One loan on a (market, borrower) page: the Controller keys a position by
 *  the pair, so a borrower who closes and opens again writes a second loan on
 *  the same page. A loan ends at a row that leaves the debt at 0. */
export interface LlamalendLoan {
  openedAt: number;
  closedAt: number | null;
  ending: "open" | "repaid" | "liquidated";
}

export function llamalendLoans(
  events: readonly { blockNumber: number; timestamp: number; context: { data: LlamalendContext } }[],
): LlamalendLoan[] {
  const rows = events
    .filter((e) => e.context.data.role !== "liquidator")
    .slice()
    .sort((a, b) => a.blockNumber - b.blockNumber);
  const loans: LlamalendLoan[] = [];
  let cur: LlamalendLoan | null = null;
  for (const e of rows) {
    const c = e.context.data;
    if (!cur) cur = { openedAt: e.timestamp, closedAt: null, ending: "open" };
    if (c.debtAfter != null && Number(c.debtAfter) <= 1e-12) {
      cur.closedAt = e.timestamp;
      cur.ending = c.eventType === "liquidation" && !c.selfLiquidation && c.role !== "self" ? "liquidated" : "repaid";
      loans.push(cur);
      cur = null;
    }
  }
  if (cur) loans.push(cur);
  return loans;
}

/** Where an event sits among the page's loans: `opens` on the first row of a
 *  loan, `closes` on a repay that leaves the debt at 0. `loan` is 1-based and
 *  `loans` the page's count, so copy can say "loan 2" only where there are
 *  several. */
export interface LlamalendLoanMark {
  loan: number;
  loans: number;
  opens: boolean;
  closes: boolean;
}

export function llamalendLoanMarks(
  events: readonly { id: string; blockNumber: number; context: { data: LlamalendContext } }[],
): Map<string, LlamalendLoanMark> {
  const rows = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.context.data.role !== "liquidator")
    .sort((a, b) => a.e.blockNumber - b.e.blockNumber || a.i - b.i);
  const marks: { id: string; loan: number; opens: boolean; closes: boolean }[] = [];
  let loan = 0;
  let open = false;
  for (const { e } of rows) {
    const c = e.context.data;
    const opens = !open;
    if (opens) loan += 1;
    open = true;
    const closedHere = c.debtAfter != null && Number(c.debtAfter) <= 1e-12;
    if (closedHere) open = false;
    marks.push({ id: e.id, loan, opens, closes: closedHere && c.eventType === "repay" });
  }
  const out = new Map<string, LlamalendLoanMark>();
  for (const m of marks) out.set(m.id, { loan: m.loan, loans: loan, opens: m.opens, closes: m.closes });
  return out;
}

/** The next row of the same loan after an event, for a partial liquidation's
 *  remainder: what happened to it and when. */
export interface LlamalendNextRow {
  id: string;
  blockNumber: number;
  timestamp: number;
  eventType: LlamalendContext["eventType"];
  /** It left the debt at 0. */
  closes: boolean;
  ctx: LlamalendContext;
}

export function llamalendNextRowMap(
  events: readonly { id: string; blockNumber: number; timestamp: number; context: { data: LlamalendContext } }[],
): Map<string, LlamalendNextRow | null> {
  const rows = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.context.data.role !== "liquidator")
    .sort((a, b) => a.e.blockNumber - b.e.blockNumber || a.i - b.i);
  const out = new Map<string, LlamalendNextRow | null>();
  for (let k = 0; k < rows.length; k++) {
    const c = rows[k].e.context.data;
    const closedHere = c.debtAfter != null && Number(c.debtAfter) <= 1e-12;
    const n = rows[k + 1]?.e;
    out.set(
      rows[k].e.id,
      closedHere || !n
        ? null
        : {
            id: n.id,
            blockNumber: n.blockNumber,
            timestamp: n.timestamp,
            eventType: n.context.data.eventType,
            closes: n.context.data.debtAfter != null && Number(n.context.data.debtAfter) <= 1e-12,
            ctx: n.context.data,
          },
    );
  }
  return out;
}
