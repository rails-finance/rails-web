// The Lifetime flows panel's Explanation lines and "?" for a LlamaLend
// position (lib/llamalend/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "LlamaLend").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { LlamalendFlowFacts } from "@/lib/llamalend/flows";
import { formatNumber } from "@/lib/utils/format";

const DOCS = "https://docs.curve.finance/lending/overview/";

export interface LlamalendFlowsNoteProps {
  facts: LlamalendFlowFacts | null;
  collSymbol: string;
  debtSymbol: string;
}

const count = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

export function LlamalendFlowsNote({ facts, collSymbol, debtSymbol }: LlamalendFlowsNoteProps): ReactNode {
  const p = facts?.pricing;
  const priced = p ? p.row + p.nearest + p.today : 0;
  return (
    <div className="space-y-2" data-llamalend-flows-note="" data-anatomy="F14·llamalend">
      <p>
        Every figure is in {debtSymbol}, this market&apos;s borrowed token: the market&apos;s AMM prices {collSymbol} in{" "}
        {debtSymbol}, and that is the price it lends and liquidates against. Each {collSymbol} flow is converted at that
        price at its block, so the collateral&apos;s last line, Market move since the last event, is the change in the
        price since each flow.
      </p>
      <p>
        Each event states the position after it and its amounts, so the interest between two events is exact to the base
        unit: the debt just before an event less the debt the event before left is Interest accrued. Between events the
        debt grows at the rate between those two events; after the last, at the rate that meets today&apos;s debt from
        the live read.
      </p>
      <p>
        The collateral sits in the AMM&apos;s bands. While the price is inside them the AMM sells {collSymbol} for{" "}
        {debtSymbol} as the price falls and buys it back as it rises (soft liquidation). No event records those trades:
        the collateral an event starts from, less what the event before left, is what the AMM sold (Sold in soft
        liquidation) or bought back (Bought back in soft liquidation) in between, at the event&apos;s price.
        {facts && facts.softSold + facts.boughtBack > 0
          ? ` Here ${[
              facts.softSold > 0
                ? `the AMM had sold collateral before ${count(facts.softSold, "one event", "events")}`
                : "",
              facts.boughtBack > 0
                ? `${facts.softSold > 0 ? "it" : "the AMM"} had bought some back before ${count(facts.boughtBack, "one event", "events")}`
                : "",
            ]
              .filter(Boolean)
              .join(", and ")}.`
          : facts
            ? " Here no event found the collateral changed since the one before."
            : ""}
        {facts?.softSinceLast === "sold" &&
          " Since the last event the AMM has sold more, which today's read shows on that line at today."}
        {facts?.softSinceLast === "bought" &&
          " Since the last event the AMM has bought some back, which today's read shows on that line at today."}{" "}
        The {debtSymbol} the AMM holds for the position from those sales (the card&apos;s Converted) is not on the bars:
        no event records it.
      </p>
      {facts && facts.liquidations + facts.selfLiquidations + facts.readRows + facts.unstatedRows > 0 && (
        <p>
          {facts.liquidations > 0 &&
            `${count(facts.liquidations, "A hard liquidation", "hard liquidations")} took collateral (Seized in liquidations) and cleared debt (Cleared by liquidations)${facts.partialLiquidations > 0 ? `, ${facts.partialLiquidations === facts.liquidations ? (facts.liquidations === 1 ? "a partial one" : "all of them partial") : `${facts.partialLiquidations.toLocaleString("en-US")} of them partial`}` : ""}${facts.convertedTaken > 0 ? `; ${facts.liquidations === 1 ? "it" : "they"} also took ${formatNumber(facts.convertedTaken)} ${debtSymbol} the AMM held for the position, which is not on the bars` : ""}. `}
          {facts.selfLiquidations > 0 &&
            `${count(facts.selfLiquidations, "A self-liquidation", "self-liquidations")}, the owner closing the loan through the liquidation path, ${facts.selfLiquidations === 1 ? "is" : "are"} counted as Repaid and Withdrawn. `}
          {facts.readRows + facts.unstatedRows > 0 && unstatedSentence(facts)}
        </p>
      )}
      {p && priced > 0 && (
        <p>
          {p.row === priced
            ? "Every flow is valued at the AMM's oracle price at its block, read from the chain. "
            : `${count(p.row, "One event is", "events are")} valued at the AMM's oracle price at ${p.row === 1 ? "its block" : "their blocks"}, read from the chain; the ${count(p.nearest + p.today, "other takes", "others take")} the nearest price read in time${p.today > 0 ? (p.today === p.nearest + p.today ? ", today's" : `, ${p.today.toLocaleString("en-US")} of them today's`) : ""}. `}
          LlamaLend has no daily price recorded, so between events the collateral keeps the price of its latest event,
          and a price more than 30 days old is stated as such.
        </p>
      )}
    </div>
  );
}

/** The rows that state no balances after them: an underwater repay, a
 *  partial liquidation. */
function unstatedSentence(f: LlamalendFlowFacts): string {
  const n = f.readRows + f.unstatedRows;
  const what =
    f.unstatedRepays > 0 && f.partialLiquidations > 0
      ? "Repays made while the bands were being traded, and partial liquidations,"
      : f.partialLiquidations > 0
        ? n === 1
          ? "A partial liquidation"
          : "Partial liquidations"
        : n === 1
          ? "A repay made while the bands were being traded"
          : `${n.toLocaleString("en-US")} repays made while the bands were being traded`;
  const verb = n === 1 && !what.endsWith(",") ? "states" : "state";
  if (f.unstatedRows === 0)
    return `${what} ${verb} no balances after ${n === 1 ? "it" : "them"}, so the position at the end of ${n === 1 ? "its block is" : "each one's block is"} read from the chain.`;
  return `${what} ${verb} no balances after ${n === 1 ? "it" : "them"}; ${f.readRows > 0 ? `${count(f.unstatedRows, "one was not read from the chain", "were not read from the chain")}, so ` : ""}the collateral and debt stand as the event before left them, less the event's amounts, until the next event that states them.`;
}

export function llamalendFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every event the index has recorded for this position, in the market's borrowed token, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, plus what the AMM bought back, less withdrawn, less what the AMM sold in soft liquidation, less seized in liquidations, each at the AMM's oracle price, plus the change in that price since (Market move), is the collateral in the bands.",
      "Debt: borrowed, plus the interest accrued, less repaid, less cleared by liquidations, is what the position owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowed-token units",
        text: "each market's AMM prices its collateral in the token it lends, so every figure is in that token.",
      },
      {
        bold: "Soft liquidation",
        text: "the collateral is spread over a range of price bands; inside them the AMM sells collateral as the price falls and buys it back as it rises.",
      },
      {
        bold: "Hard liquidation",
        text: "once the position's health falls below zero, anyone may repay its debt and take what is in its bands.",
      },
    ],
    links: [{ label: "docs.curve.finance", url: DOCS }],
  };
}
