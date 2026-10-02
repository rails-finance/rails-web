// What each liquidation of a Compound V2-family account did, read from its
// rows, so the card says it in words that match them: how much of which debt
// the liquidator repaid, the share of that debt it was, and whether the owner
// repaid the rest afterwards. A liquidation here repays at most half of one
// borrowed market (the close factor), so "liquidated" rarely means the debt
// was cleared by it.

import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/utils/format";

export interface StoryRow {
  timestamp: number;
  txHash: string;
  kind: "liquidation" | "repay" | "borrow" | "other";
  market: string;
  symbol: string;
  /** Underlying amount (unsigned). */
  amount?: number;
  debtBefore?: number;
  debtAfter?: number;
  /** True when the owner sent or made the row (not a liquidator or a third
   *  party). */
  byOwner?: boolean;
}

export interface LiquidationStory {
  at: number;
  symbol: string;
  repaid: number;
  /** The debt in that market just before the liquidation, when a row states it. */
  debtBefore: number | null;
  /** The owner's own repayment that took this market's debt to zero after
   *  the liquidation, with how long after, and what the owner borrowed in
   *  that market between the two (0 when nothing). */
  ownerRepaidRest: { amount: number; afterSeconds: number; borrowedSince: number } | null;
}

export function liquidationStories(rows: readonly StoryRow[]): LiquidationStory[] {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  const out: LiquidationStory[] = [];
  sorted.forEach((r, i) => {
    if (r.kind !== "liquidation") return;
    // Moonwell: the debt before sits on the liquidator's RepayBorrow row in
    // the same transaction.
    const debtBefore =
      r.debtBefore ??
      sorted.find((x) => x.txHash === r.txHash && x.kind === "repay" && x.market === r.market)?.debtBefore ??
      null;
    let rest: LiquidationStory["ownerRepaidRest"] = null;
    let borrowedSince = 0;
    for (const x of sorted.slice(i + 1)) {
      if (x.market !== r.market) continue;
      if (x.kind === "liquidation") break;
      if (x.kind === "borrow") borrowedSince += x.amount ?? 0;
      if (x.kind === "repay" && x.byOwner && x.txHash !== r.txHash) {
        if (x.debtAfter != null && x.debtAfter <= 1e-12) {
          rest = { amount: x.amount ?? 0, afterSeconds: x.timestamp - r.timestamp, borrowedSince };
          break;
        }
      }
    }
    out.push({ at: r.timestamp, symbol: r.symbol, repaid: r.amount ?? 0, debtBefore, ownerRepaidRest: rest });
  });
  return out;
}

export function spanWords(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return "within a minute";
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"} later`;
  const h = Math.round(seconds / 3600);
  if (h < 48) return `${h} hours later`;
  return `${Math.round(seconds / 86400)} days later`;
}

/** Small amounts keep four significant figures (0.0058 ETH, not 0.006). */
const amt = (n: number) =>
  Math.abs(n) > 0 && Math.abs(n) < 1 ? n.toLocaleString("en-US", { maximumSignificantDigits: 4 }) : formatNumber(n);

const shareWords = (repaid: number, before: number): string => {
  const f = repaid / before;
  if (Math.abs(f - 0.5) < 0.005) return "half";
  return `${(f * 100).toFixed(1)}%`;
};

/** One sentence per liquidation, e.g. "On 13 Feb 2026 a liquidator repaid
 *  0.0058 ETH, half of its 0.0116 ETH debt; the owner repaid the rest 38
 *  minutes later." */
export function liquidationSentences(stories: readonly LiquidationStory[]): string[] {
  return stories.map((s) => {
    const of =
      s.debtBefore != null && s.debtBefore > 0
        ? `, ${shareWords(s.repaid, s.debtBefore)} of its ${amt(s.debtBefore)} ${s.symbol} debt`
        : "";
    const r = s.ownerRepaidRest;
    // Debt the owner took on after the liquidation is part of what the final
    // repayment cleared, so it is named.
    const rest = !r
      ? ""
      : r.borrowedSince > 0
        ? `; the owner then borrowed ${amt(r.borrowedSince)} ${s.symbol} more and repaid the whole debt ${spanWords(r.afterSeconds)}`
        : `; the owner repaid the rest ${spanWords(r.afterSeconds)}`;
    return `On ${formatDate(s.at)} a liquidator repaid ${amt(s.repaid)} ${s.symbol}${of}${rest}.`;
  });
}

/** The modal's lead for a closed account that was liquidated. */
export function liquidatedIntro(stories: readonly LiquidationStory[], count: number): string {
  const times = count === 1 ? "once" : `${count} times`;
  return [
    `This account was liquidated ${times}.`,
    ...liquidationSentences(stories),
    "It has since closed: nothing remains supplied or borrowed.",
  ].join(" ");
}
