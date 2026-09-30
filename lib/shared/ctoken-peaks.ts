// A closed Compound V2-family card's "highest recorded" figures, read from the
// rows the page holds: per market, the largest balance before or after any
// row, interest included. The balance just before a repayment or a withdrawal
// is the highest the debt or the supply stood at, and a post-row maximum
// misses it (the rule every explorer adopted in September 2026).
//
// Only for a page holding the whole history. A supply row without its
// balances (no exchange rate read at its block) leaves that market's supply
// peak unstated, and the index's figure stands.

import { parseUnits } from "viem";

export interface PeakRow {
  market: string;
  decimals: number;
  side: "supply" | "debt";
  supplyBefore?: string;
  supplyAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
}

export interface PeakLine {
  market: string;
  symbol: string;
  decimals: number;
  amount: number;
  amountRaw: string;
}

const raw = (s: string | undefined, decimals: number): bigint | null => {
  if (s == null) return null;
  try {
    return parseUnits(s.replace(/^-/, ""), decimals);
  } catch {
    return null;
  }
};

export function balancePeaks(rows: readonly PeakRow[]): Map<string, { supply: bigint | null; debt: bigint }> {
  const out = new Map<string, { supply: bigint | null; debt: bigint }>();
  const ZERO = BigInt(0);
  for (const r of rows) {
    const cur = out.get(r.market) ?? { supply: ZERO, debt: ZERO };
    if (r.side === "supply") {
      const b = raw(r.supplyBefore, r.decimals);
      const a = raw(r.supplyAfter, r.decimals);
      if (b == null || a == null) cur.supply = null;
      else if (cur.supply != null) cur.supply = [cur.supply, b, a].reduce((m, x) => (x > m ? x : m));
    } else {
      for (const v of [raw(r.debtBefore, r.decimals), raw(r.debtAfter, r.decimals)])
        if (v != null && v > cur.debt) cur.debt = v;
    }
    out.set(r.market, cur);
  }
  return out;
}

/** The view's peak lines with each market's figure replaced by the balance
 *  peak where the rows state one. */
export function withBalancePeaks<L extends PeakLine>(
  lines: readonly L[],
  peaks: Map<string, { supply: bigint | null; debt: bigint }>,
  side: "supply" | "debt",
): L[] {
  return lines.map((l) => {
    const p = peaks.get(l.market);
    const v = p ? (side === "supply" ? p.supply : p.debt) : null;
    if (v == null || v <= BigInt(0)) return l;
    const div = BigInt(10) ** BigInt(l.decimals);
    const amount = Number(v / div) + Number(v % div) / Number(div);
    return { ...l, amount, amountRaw: v.toString() };
  });
}
