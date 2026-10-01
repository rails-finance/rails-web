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

export interface LiquityV1FlowsNoteProps {
  /** How the events' ETH prices were found (lib/liquity-v1/flows.ts). */
  prices: { block: number; dayClose: number; nearest: number };
  /** ETH's daily closing price was read. */
  daily: boolean;
  /** Draws whose fee was not read. */
  feesUnread: number;
  /** Rows that applied redistribution gains. */
  redistributions: number;
  /** This life's number and the wallet's lives. */
  life: { n: number; of: number } | null;
}

/** The Explanation lines for a Liquity V1 Trove life (lib/liquity-v1/flows.ts). */
export function LiquityV1FlowsNote({
  prices,
  daily,
  feesUnread,
  redistributions,
  life,
}: LiquityV1FlowsNoteProps): ReactNode {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);
  return (
    <div className="space-y-2" data-liquity-flows-note="v1" data-anatomy="F14·liquity">
      <p>
        The collateral side adds up to what the Trove holds: ETH deposited, plus redistribution gains from liquidated
        Troves, less what was withdrawn, taken by redemptions and liquidated (and the surplus left to claim where a
        Recovery Mode liquidation or a redemption that cancelled the last of the debt closed the Trove). Each flow is
        valued at Liquity&apos;s ETH price at its block, so the last line, Market move, is the change in ETH&apos;s
        price since each flow.
      </p>
      <p>
        The debt side adds up to what the Trove owes, in LUSD at its $1 face: borrowed, plus the borrowing fees, the 200
        LUSD liquidation reserve the open adds and any debt redistributed from liquidated Troves, less what was repaid,
        redeemed and liquidated. Liquity V1 charges no interest, so between events the debt stays as its last event left
        it. The reserve is burned when the owner closes the Trove or a redemption cancels the last of its debt (Reserve
        burned); a liquidation pays it to the liquidator, so there it is part of the debt liquidated.
        {feesUnread > 0 &&
          ` The fee of ${n(feesUnread, "one draw", "draws")} was not read from its transaction, so it stays in Borrowed.`}
      </p>
      <p>
        A redistribution has no event of its own: a liquidation the Stability Pool cannot cover shares its debt and ETH
        out to the open Troves, and each Trove takes its share at its next transaction, which records the gains before
        its own change. That step is put on Redistribution gains and Redistributed debt at that event.{" "}
        {redistributions === 0
          ? "None reached this life."
          : `Gains reached this life at ${n(redistributions, "one event", "events")}.`}
      </p>
      <p>
        ETH is valued at the price Liquity&apos;s price feed held at each event&apos;s block: recorded with each
        redemption and liquidation, and read from the transaction for the owner&apos;s own events.
        {prices.dayClose > 0 &&
          ` ${n(prices.dayClose, "One event whose transaction was not read takes", "events whose transactions were not read take")} that day's closing price.`}
        {prices.nearest > 0 &&
          ` ${n(prices.nearest, "One event takes", "events take")} the nearest recorded price before ${prices.nearest === 1 ? "it" : "them"}.`}{" "}
        {daily
          ? "Between events the line and the bars take ETH's price at each day's close from 19 May 2025 (the last price any Liquity V2 WETH Trove recorded that day); before then, the price of the Trove's latest event, a price more than 30 days old stated as such."
          : "Between events the line and the bars keep the price of the Trove's latest event, a price more than 30 days old stated as such."}
      </p>
      <p>
        The bars and the sums cover this life of the Trove
        {life && life.of > 1 ? ` (life ${life.n} of ${life.of} for this wallet; each has its own page)` : ""}. A
        liquidated or closed life&apos;s slider stops the day after its last event.
      </p>
    </div>
  );
}
