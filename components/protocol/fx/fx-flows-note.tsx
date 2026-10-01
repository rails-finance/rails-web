// The Lifetime flows panel's Explanation lines and "?" for an f(x) position
// (lib/fx/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "f(x)").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { FxFlowsNoteFacts } from "@/hooks/useFxFlows";

const DOCS = "https://fxprotocol.gitbook.io/fx-docs";

export interface FxFlowsNoteProps {
  facts: FxFlowsNoteFacts | null;
  /** The normalized unit (stETH, WBTC) and the token deposited (wstETH, WBTC). */
  collSymbol: string;
  tokenSymbol: string;
}

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

export function FxFlowsNote({ facts, collSymbol, tokenSymbol }: FxFlowsNoteProps): ReactNode {
  const p = facts?.pricing;
  const pool = facts ? facts.rebalances + facts.redemptions + facts.poolLiquidations : 0;
  return (
    <div className="space-y-2" data-fx-flows-note="" data-anatomy="F14·fx">
      <p>
        Every figure is in fxUSD, the pool&apos;s debt token: fxUSD is not pinned to a dollar, and the pool&apos;s
        oracle prices {collSymbol} in fxUSD, the price it holds the debt against. Each {collSymbol} flow is converted at
        the price the pool applied to it, so on the collateral side the last line, Market move and funding since the
        last event, is the change in that price since each flow with the funding taken since the last event.
      </p>
      <p>
        The pool is read at every block that moved this position, just before and after it, so each event&apos;s lines
        are exact to the pool&apos;s rounding.
        {tokenSymbol !== collSymbol
          ? ` A deposit or withdrawal of ${tokenSymbol} is converted to ${collSymbol} at the ${tokenSymbol} rate at its block.`
          : ""}{" "}
        What the pool moved between two events, with no event of this position&apos;s, has a dashed line: Funding, the
        collateral the pool takes as its funding charge, and Others&apos; bad debt added, the debt the pool spreads over
        every position when a liquidation leaves some unpaid. Neither is read between events, so each balance stays as
        its last event left it until the next one states the change; today&apos;s figures are the pool&apos;s reading.
      </p>
      {facts && pool + facts.liquidations > 0 && (
        <p>
          {facts.rebalances > 0 &&
            `${n(facts.rebalances, "A rebalance", "rebalances")} took collateral (Taken by rebalances) and cleared debt (Cleared by rebalances). `}
          {facts.redemptions > 0 &&
            `${n(facts.redemptions, "A redemption", "redemptions")} took collateral (Taken by redemptions) and cleared debt (Cleared by redemptions). `}
          {facts.poolLiquidations > 0 &&
            `${n(facts.poolLiquidations, "A pool-wide liquidation", "pool-wide liquidations")} took collateral and cleared debt (the pool-wide liquidation lines). `}
          {facts.liquidations > 0 &&
            `${n(facts.liquidations, "A liquidation", "liquidations")} of this position seized collateral (Seized in liquidations) and repaid debt (Repaid by liquidators); what a liquidation left of the debt is Left unpaid at liquidation, spread over the other positions. `}
          {pool > 0 &&
            "Each rebalance, redemption and pool-wide liquidation is the position's change across its block, read from the pool; where several share a block, the change is on the block's last row."}
        </p>
      )}
      {facts && facts.unrecorded > 0 && (
        <p>
          {facts.unrecorded === 1 ? "Once" : `${facts.unrecorded.toLocaleString("en-US")} times`}, the debt stood lower
          at an event than the event before left it, with no rebalance on the timeline between them. Only a rebalance, a
          redemption or a liquidation lowers it, so that fall is counted in Cleared by rebalances.
        </p>
      )}
      {p && (
        <p>
          {pricingSentence(p)} No daily price is recorded for f(x), so between events the collateral keeps the price of
          its latest event, a price more than 30 days old is stated as such, and today&apos;s is the oracle&apos;s
          anchor price, the one the position card values it at.
        </p>
      )}
    </div>
  );
}

function pricingSentence(p: FxFlowsNoteFacts["pricing"]): string {
  const parts: string[] = [];
  if (p.row > 0)
    parts.push("Deposits, withdrawals and liquidations are valued at the oracle price the pool recorded with each");
  if (p.block > 0)
    parts.push(
      "rebalances, redemptions and pool-wide liquidations at the oracle's min price at the block before each, the price they were judged at",
    );
  const k = p.nearest + p.today;
  if (k > 0)
    parts.push(
      `${k === 1 ? "one event takes" : `${k.toLocaleString("en-US")} events take`} the nearest recorded price in time, with no price read at ${k === 1 ? "its block" : "their blocks"}`,
    );
  if (parts.length === 0) return "";
  const s = parts.join("; ");
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

export function fxFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every change f(x) has made to this position, in fxUSD, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, less withdrawn, less the funding the pool took, less what rebalances, redemptions and liquidations took, each at the oracle price it was made at, plus the change in that price since (Market move), is what the position holds.",
      "Debt: borrowed, plus other positions' bad debt the pool added, less repaid, less what rebalances, redemptions and liquidations cleared, less what a liquidation left unpaid, is what the position owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "fxUSD units",
        text: "the pool's oracle prices the collateral in fxUSD, and fxUSD is not pinned to a dollar, so every figure is in fxUSD.",
      },
      {
        bold: "Funding",
        text: "the pool charges the collateral a funding fee through its collateral index, with no event of the position's; the next event's reading states what it took.",
      },
      {
        bold: "Rebalances and redemptions",
        text: "a keeper repays part of the debt of every position in a tick past the rebalance line and takes collateral plus a bonus; a redemption takes collateral for fxUSD from the riskiest ticks. The position's owner does not act.",
      },
      {
        bold: "Bad debt",
        text: "a liquidation that leaves debt unpaid writes it off the position and adds it to every other position's debt through the pool's debt index.",
      },
    ],
    links: [{ label: "f(x) Protocol docs", url: DOCS }],
  };
}
