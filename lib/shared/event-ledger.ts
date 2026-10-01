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

import { apportionSigned, wholeUsd } from "@/lib/shared/flows-sum";
import {
  assetTokenSumFor,
  fmtTokens,
  interestLine,
  type AssetSum,
  type FocusEvent,
  type TokenSum,
} from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowModel, FlowSegment, FlowSide, FlowUnit } from "@/lib/shared/flows-timeline";

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
  /** Signed whole dollars, and printed ("−$1,151"). */
  usd: { dollars: number; text: string } | null;
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
  usd: { before: string | null; after: string; dollars: number } | null;
}

/** A dollar line of the side, as flow-focus prints it. */
export interface UsdLine {
  key: string;
  label: string;
  kind: "opening" | "in" | "out" | "rest";
  seg: FlowSegment | null;
  dollars: number;
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
  "Upfront fee": "This upfront fee",
  Redistribution: "This redistribution",
  "Transferred in": "This transfer in",
  "Transferred out": "This transfer out",
  "Collateral swap": "This swap",
  "Debt swap": "This debt swap",
  "Debt written off": "This write-off",
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
 *  last event is not), in tokens and USD; null where it has none. */
function eventPart(ev: FocusEvent | null, key: string, symbol?: string): { amount: number; usd: number } | null {
  let amount = 0;
  let usd = 0;
  let act = false;
  for (const l of ev?.legs ?? []) {
    if (l.bucket !== key || l.accrual) continue;
    if (symbol != null && l.symbol !== symbol) continue;
    act = true;
    amount += l.amount ?? 0;
    usd += l.usd ?? 0;
  }
  return act ? { amount, usd } : null;
}

const usdTotal = (dollars: number, before: number | null, unit?: FlowUnit) => ({
  before: before != null && Math.round(before) !== dollars ? wholeUsd(before, unit) : null,
  after: wholeUsd(dollars, unit),
  dollars,
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
}: {
  model: FlowModel;
  side: FlowSide;
  /** The event the card states; null for none (no row is split). */
  ev: FocusEvent | null;
  sum: TokenSum;
  usd: { lines: UsdLine[]; dollars: number; before: number | null } | null;
  /** Read only the event's legs in this token (a side by asset). */
  symbolFilter?: string;
}): Ledger {
  const scale = 10 ** sum.decimals;
  const bucketOf = (k: string) => model.buckets.find((b) => b.key === k);
  const usdOf = new Map(usd?.lines.map((l) => [l.key, l]) ?? []);
  const rows: LedgerRow[] = [];
  const row = (
    key: string,
    line: string,
    label: string,
    role: LedgerRole,
    seg: FlowSegment | null,
    units: number | null,
    dollars: number | null,
  ): LedgerRow => ({
    key,
    line,
    label,
    role,
    seg,
    tokens: units == null ? null : { units, text: signedTokens(units, sum.decimals) },
    usd: dollars == null ? null : { dollars, text: signedUsd(dollars) },
  });
  for (const l of sum.lines) {
    const b = bucketOf(l.key);
    const u = usdOf.get(l.key);
    const seg = l.kind === "interest" ? null : b ? bucketSeg(b) : (u?.seg ?? null);
    const words = ledgerWords(b, l.label);
    const lineUsd = usd ? (u?.dollars ?? 0) : null;
    const part = l.kind === "interest" ? null : eventPart(ev, l.key, symbolFilter);
    const sign = l.kind === "out" ? -1 : 1;
    const evUnits = part ? sign * Math.round(part.amount * scale) : 0;
    if (part && evUnits !== 0) {
      const beforeUnits = l.units - evUnits;
      let evUsd = lineUsd == null ? null : u ? sign * Math.round(part.usd) : 0;
      if (beforeUnits !== 0) {
        rows.push(
          row(l.key, l.key, words.before, "before", seg, beforeUnits, lineUsd == null ? null : lineUsd - (evUsd ?? 0)),
        );
      } else evUsd = lineUsd;
      rows.push(row(`${l.key}#event`, l.key, words.event, "event", seg, evUnits, evUsd));
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
          u.dollars,
        ),
      );
    }
  return {
    side,
    symbol: sum.symbol,
    decimals: sum.decimals,
    rows,
    tokens: { before: sum.before, after: sum.total.amount, units: sum.total.units },
    usd: usd ? usdTotal(usd.dollars, usd.before) : null,
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
}: {
  model: FlowModel;
  side: FlowSide;
  ev: FocusEvent | null;
  lines: UsdLine[];
  dollars: number;
  before: number | null;
}): Ledger {
  const rows: LedgerRow[] = [];
  const row = (key: string, line: string, label: string, role: LedgerRole, seg: FlowSegment | null, d: number) =>
    rows.push({ key, line, label, role, seg, tokens: null, usd: { dollars: d, text: signedUsd(d, model.unit) } });
  for (const l of lines) {
    const b = model.buckets.find((x) => x.key === l.key);
    const words = ledgerWords(b, l.label);
    if (l.kind === "rest") {
      row(l.key, l.key, l.label, "market", null, l.dollars);
      continue;
    }
    const interest = l.key === interestLine(side).key;
    const seg = interest ? null : b ? bucketSeg(b) : l.seg;
    const part = interest ? null : eventPart(ev, l.key);
    const evDollars = part ? (l.kind === "out" ? -1 : 1) * Math.round(part.usd) : 0;
    if (part && evDollars !== 0) {
      if (l.dollars !== evDollars) row(l.key, l.key, words.before, "before", seg, l.dollars - evDollars);
      row(`${l.key}#event`, l.key, words.event, "event", seg, evDollars);
    } else row(l.key, l.key, interest ? l.label : words.plain, interest ? "interest" : "flow", seg, l.dollars);
  }
  return { side, symbol: null, decimals: null, rows, tokens: null, usd: usdTotal(dollars, before, model.unit) };
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
}): { assets: Ledger[]; usd: { before: string | null; after: string; dollars: number } } {
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
    return tokenLedger({ model, side, ev, sum: t, usd, symbolFilter: symbol });
  });
  return { assets, usd: usdTotal(total, heldBefore) };
}

/** The rows' sums, for the checks: every column adds to its total. */
export function ledgerAdds(l: Ledger): { tokens: boolean; usd: boolean } {
  const tok = l.rows.reduce((a, r) => a + (r.tokens?.units ?? 0), 0);
  const usd = l.rows.reduce((a, r) => a + (r.usd?.dollars ?? 0), 0);
  return {
    tokens: l.tokens == null || tok === l.tokens.units,
    usd: l.usd == null || usd === l.usd.dollars,
  };
}
