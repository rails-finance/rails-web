// The Lifetime flows panel's Explanation lines and "?" for a LlamaLend
// position (lib/llamalend/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "LlamaLend").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { LlamalendFlowFacts } from "@/lib/llamalend/flows";
import { formatNumber } from "@/lib/utils/format";
import { ExplainBullet, ExplainGroup, ExplainMore } from "@/components/shared/explain-groups";

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
  const soft = facts ? facts.softSold + facts.boughtBack : 0;
  return (
    <div data-llamalend-flows-note="" data-anatomy="F14·llamalend">
      <ExplainGroup title="Soft liquidation">
        <ExplainBullet>The AMM sells {collSymbol} as its price falls and buys it back as it rises</ExplainBullet>
        <ExplainBullet>
          No event records those trades; the collateral bar shows them as sold or bought back
        </ExplainBullet>
        {facts?.withConv ? (
          <ExplainBullet>
            The {debtSymbol} from those sales is on the collateral bar: received, spent, withdrawn or seized
          </ExplainBullet>
        ) : (
          <ExplainBullet>The {debtSymbol} the AMM holds from those sales is not on the bars</ExplainBullet>
        )}
        {facts && soft > 0 && (
          <ExplainBullet>
            {[
              facts.softSold > 0 ? `Sold before ${count(facts.softSold, "one event", "events")}` : "",
              facts.boughtBack > 0 ? `bought back before ${count(facts.boughtBack, "one event", "events")}` : "",
            ]
              .filter(Boolean)
              .join(", ")
              .replace(/^b/, "B")}
          </ExplainBullet>
        )}
        {facts?.softSinceLast === "sold" && (
          <ExplainBullet>More sold since the last event, in today&apos;s read</ExplainBullet>
        )}
        {facts?.softSinceLast === "bought" && (
          <ExplainBullet>Some bought back since the last event, in today&apos;s read</ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Prices and debt">
        <ExplainBullet>Every figure is in {debtSymbol}, the market&apos;s borrowed token</ExplainBullet>
        <ExplainBullet>
          {collSymbol} takes the AMM&apos;s oracle price at the latest priced event&apos;s block
        </ExplainBullet>
        <ExplainBullet>No daily price is recorded; between events that price holds</ExplainBullet>
        <ExplainBullet>Debt grows at the market&apos;s rate since the last transaction</ExplainBullet>
      </ExplainGroup>
      {facts && facts.liquidations + facts.selfLiquidations > 0 && (
        <ExplainGroup title="Liquidations">
          {facts.liquidations > 0 && (
            <ExplainBullet>
              {count(facts.liquidations, "One hard liquidation", "hard liquidations")}
              {facts.partialLiquidations > 0
                ? `, ${facts.partialLiquidations === facts.liquidations ? (facts.liquidations === 1 ? "partial" : "all partial") : `${facts.partialLiquidations.toLocaleString("en-US")} partial`}`
                : ""}
              : seized collateral and cleared debt
            </ExplainBullet>
          )}
          {facts.convertedTaken > 0 && (
            <ExplainBullet>
              Liquidations also took {formatNumber(facts.convertedTaken)} {debtSymbol} the AMM held
            </ExplainBullet>
          )}
          {facts.selfLiquidations > 0 && (
            <ExplainBullet>
              {count(facts.selfLiquidations, "One self-liquidation", "self-liquidations")}, counted as repaid and
              withdrawn
            </ExplainBullet>
          )}
        </ExplainGroup>
      )}
      <ExplainMore title="More about the sums">
        <p>
          Each {collSymbol} flow is converted at the AMM&apos;s price at its block, so the collateral&apos;s last line,
          Market move since the last event, is the change in that price since each flow. Each event states the position
          after it, so the interest between two events is exact.
        </p>
        {facts?.withConv && facts.convUnreadRows > 0 && (
          <p>
            At {count(facts.convUnreadRows, "one event", "events")} the {debtSymbol} from sales is not stored yet and
            stands as the event before left it.
          </p>
        )}
        {facts?.withConv && facts.convEstimatedRows > 0 && (
          <p>
            At {count(facts.convEstimatedRows, "a repay that closed the position", "repays that closed the position")},
            what the sales took in is valued at that event&apos;s price.
          </p>
        )}
        {facts && facts.readRows + facts.unstatedRows > 0 && <p>{unstatedSentence(facts)}</p>}
        {p && priced > 0 && p.row < priced && (
          <p>
            {count(p.row, "One event takes", "events take")} the oracle price at its block; the{" "}
            {count(p.nearest + p.today, "other takes", "others take")} the nearest price read
            {p.today > 0 ? ", or the latest block's" : ""}. A price more than 30 days old is stated as such.
          </p>
        )}
      </ExplainMore>
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
