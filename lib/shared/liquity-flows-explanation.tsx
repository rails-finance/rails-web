// The Lifetime flows panel's Explanation lines for a Liquity-family Trove
// (lib/shared/liquity-flows.ts): what each side's lines are, what the two
// remainders hold, the prices, and how a closed life and a zombie read.

import type { ReactNode } from "react";

export interface LiquityFlowsNoteProps {
  collSymbol: string;
  debtSymbol: string;
  /** Events whose row carries no price of their own. */
  unpriced: number;
  /** The Trove closed and was opened again at least once. */
  lives: number;
  zombie: boolean;
  /** The collateral between events is at the branch's daily price. */
  daily?: boolean;
}

export function LiquityFlowsNote({
  collSymbol,
  debtSymbol,
  unpriced,
  lives,
  zombie,
  daily = false,
}: LiquityFlowsNoteProps): ReactNode {
  return (
    <div className="space-y-2" data-liquity-flows-note="" data-anatomy="F14·liquity">
      <p>
        The collateral side adds up to what the Trove holds: {collSymbol} deposited, plus redistribution gains from
        liquidated Troves, less what was withdrawn, taken by redemptions and liquidated (and, after a liquidation, the
        surplus left to claim). Each flow is valued at the branch&apos;s price when it happened, so the last line,
        Market move, is the change in {collSymbol}&apos;s price since each flow.
      </p>
      <p>
        The debt side adds up to what the Trove owes, in {debtSymbol} at its $1 face: borrowed, plus the interest, the
        upfront fees, the batch management fees and the debt redistributed from liquidated Troves, less what was repaid,
        redeemed and liquidated. Each event records the debt after it, so the interest to that event is exact; on a
        batch member it is split into interest and the batch&apos;s fee by their two rates. Interest since the last
        event is the last line: the interest the Trove&apos;s rate has built on its recorded debt since then (at
        today&apos;s stop, the Trove&apos;s own current figure, with any redistribution and batch fee not yet recorded
        on their own lines).
      </p>
      <p>
        {daily
          ? "Between the Trove's events its collateral is valued at the branch's price at each day's close: the last price any Trove's operation on the branch recorded that day. A day no Trove touched keeps the day before's."
          : "No daily price is recorded for the branch yet, so between the Trove's events its collateral keeps the price of its latest event, and a price more than 30 days old is stated as such."}
        {unpriced === 1 &&
          " One of its events carries no price of its own; its flows take the nearest price before it."}
        {unpriced > 1 &&
          ` ${unpriced.toLocaleString("en-US")} of its events carry no price of their own; their flows take the nearest price before them.`}
      </p>
      <p>
        The bars and the sums cover every life of this Trove: a closed life&apos;s flows stay in the bars and the line
        reads zero while the Trove is closed
        {lives > 1 ? ` (it has had ${lives} lives)` : ""}. A zombie Trove, redeemed below the minimum debt, still holds
        its collateral and owes its debt, so both stay solid on the bars until its owner closes it or brings it back
        above the minimum{zombie ? "; this Trove is a zombie now" : ""}.
      </p>
    </div>
  );
}

/** How many lives the replayed events hold: a new life opens on an event
 *  after one that left nothing. */
export function troveLives(events: { collAfter: number; debtAfter: number }[]): number {
  let lives = 0;
  let empty = true;
  for (const e of events) {
    const held = e.collAfter > 1e-12 || e.debtAfter > 1e-12;
    if (held && empty) lives += 1;
    empty = !held;
  }
  return lives;
}
