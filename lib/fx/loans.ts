// The loans one f(x) NFT has carried. Closing or liquidating empties the
// position and leaves the NFT with its owner, and a later deposit funds the
// same id again; the timeline numbers each row's loan (fx-timeline.ts). Built
// from the page's rows, so it needs the whole history (a windowed page carries
// no loan numbers and yields none).

import type { BaseActivityEvent, FxContext } from "@/lib/shared/types/event-shape";

export interface FxLoan {
  number: number;
  openedAt: number;
  /** When a row emptied the position; null while the loan is open. */
  closedAt: number | null;
  ending: "closed" | "liquidated" | null;
  /** fxUSD borrowed and repaid on this loan's own rows. */
  borrowed: number;
  repaid: number;
}

export function fxLoans(events: Array<BaseActivityEvent & { context: { data: FxContext } }>): FxLoan[] {
  const loans: FxLoan[] = [];
  for (const e of events) {
    const d = e.context.data;
    if (d.loanNumber == null) continue;
    let loan = loans.find((l) => l.number === d.loanNumber);
    if (!loan) {
      loan = { number: d.loanNumber, openedAt: e.timestamp, closedAt: null, ending: null, borrowed: 0, repaid: 0 };
      loans.push(loan);
    }
    if (d.eventType === "operate") {
      const debt = Number(d.debtDelta) || 0;
      if (debt > 0) loan.borrowed += debt;
      else loan.repaid -= debt;
    }
    if (d.emptiesPosition) {
      loan.closedAt = e.timestamp;
      loan.ending = d.eventType === "liquidation" ? "liquidated" : "closed";
    }
  }
  return loans.sort((a, b) => a.number - b.number);
}
