// The Lifetime flows panel's Explanation lines and "?" for a Fluid position
// (lib/fluid/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "Fluid").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { FluidFlowsNoteFacts } from "@/hooks/useFluidFlows";

const DOCS = "https://docs.fluid.io";

export interface FluidFlowsNoteProps {
  facts: FluidFlowsNoteFacts | null;
  collSymbol: string;
  debtSymbol: string;
}

export function FluidFlowsNote({ facts, collSymbol, debtSymbol }: FluidFlowsNoteProps): ReactNode {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);
  const borrower = facts?.borrower ?? true;
  const p = facts?.pricing;
  return (
    <div className="space-y-2" data-fluid-flows-note="" data-anatomy="F14·fluid">
      {borrower ? (
        <p>
          Every figure is in {debtSymbol}, this vault&apos;s debt token: Fluid prices nothing in USD, and the
          vault&apos;s oracle prices {collSymbol} in {debtSymbol}. Each {collSymbol} flow is converted at that price, so
          on the collateral side the last line, Market move and interest since the last event, is the change in the
          price since each flow with the interest the collateral earned since the last event.
        </p>
      ) : (
        <p>
          Every figure is in {collSymbol}, this vault&apos;s collateral token. The position never borrowed, so it is one
          bar and needs no price.
        </p>
      )}
      <p>
        Each event states both balances just before and after it, read from the vault at its block, so the interest
        between two events is exact to the base unit: the collateral&apos;s is Interest earned
        {borrower ? ", the debt's Interest accrued" : ""}. Between events each balance grows at the rate the vault paid
        {borrower ? " or charged" : ""} until the next one (its interest over the balance and the time); after the last,
        at the vault&apos;s rate now, and today&apos;s figure is the vault&apos;s live read.
      </p>
      {facts && facts.liquidations + facts.absorbs + facts.unrecorded > 0 && (
        <p>
          {facts.liquidations > 0 &&
            `${n(facts.liquidations, "A liquidation", "liquidations")} took collateral (Seized in liquidations) and cleared debt (Cleared by liquidations). `}
          {facts.absorbs > 0 &&
            `${n(facts.absorbs, "An absorb", "absorbs")} by the vault, which takes over a position past its liquidation limit, ${facts.absorbs === 1 ? "is" : "are"} counted in the same lines. `}
          Each one&apos;s figures are the vault&apos;s balances read either side of its block.
          {facts.unrecorded > 0 &&
            ` ${facts.unrecorded === 1 ? "Once" : `${facts.unrecorded.toLocaleString("en-US")} times`}, a balance stood lower at an event than the event before it left it, with no liquidation recorded between them. In a Fluid vault only a liquidation lowers a balance between the owner's operations, so that fall is counted in the liquidation lines.`}
        </p>
      )}
      {borrower && p && (
        <p>
          {p.row > 0 ? rowSentence(p) : ""}
          {p.nearest + p.today > 0 ? nearestSentence(p) : ""}
          {facts?.between === "store"
            ? "Between events the collateral takes the vault oracle's price at the close of each day, the last one carried over a day with none recorded, and a price more than 30 days old is stated as such."
            : "No daily oracle price is recorded for Fluid yet, so between events the collateral keeps the price of its latest event, and a price more than 30 days old is stated as such."}
        </p>
      )}
    </div>
  );
}

/** The flows valued at their own block's price. While the index priced
 *  liquidation blocks only, those were all liquidations. */
function rowSentence(p: FluidFlowsNoteFacts["pricing"]): string {
  if (p.rowLiq === p.row)
    return `${p.row === 1 ? "One collateral flow, a liquidation, is" : `${p.row.toLocaleString("en-US")} collateral flows, liquidations, are`} valued at the vault oracle's price at ${p.row === 1 ? "its block" : "their blocks"}. `;
  return `${p.row === 1 ? "One collateral flow is" : `${p.row.toLocaleString("en-US")} collateral flows are`} valued at the vault oracle's price at ${p.row === 1 ? "its block" : "their blocks"}. `;
}

/** The flows that took a price from another moment, and which. */
function nearestSentence(p: FluidFlowsNoteFacts["pricing"]): string {
  const k = p.nearest + p.today;
  const whose =
    p.nearest > 0 && p.today > 0
      ? `: ${p.nearest.toLocaleString("en-US")} a liquidation's, ${p.today.toLocaleString("en-US")} today's oracle read`
      : p.today > 0
        ? ", today's oracle read"
        : ", a liquidation's";
  const which =
    p.row > 0
      ? `the other ${k === 1 ? "flow takes" : `${k.toLocaleString("en-US")} take`}`
      : k === 1
        ? "the one collateral flow takes"
        : `all ${k.toLocaleString("en-US")} collateral flows take`;
  // Until the server's filler reaches a position, its liquidation blocks are
  // the only ones priced.
  const why =
    p.row > p.rowLiq
      ? `The index has not recorded the vault oracle's price at ${k === 1 ? "that flow's block" : "those flows' blocks"} yet`
      : "The index records the vault oracle's price only on liquidation blocks";
  return `${why}, so ${which} the nearest recorded price in time${whose}, and Market move runs from that price. `;
}

export function fluidFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every event Fluid has recorded for this position, in the vault's debt token (the collateral token where the position never borrowed), and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, plus the interest earned, less withdrawn, less seized in liquidations, each at the vault oracle's price, plus the change in that price since (Market move), is what the position holds.",
      "Debt: borrowed, plus the interest accrued, less repaid, less cleared by liquidations, is what the position owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Debt-token units",
        text: "each vault's oracle prices its collateral in its debt token, and Fluid has no USD price, so every figure is in the debt token.",
      },
      {
        bold: "Exchange prices",
        text: "the vault keeps each position as raw amounts and grows them by its supply and borrow exchange prices, so a balance grows between events with no event of its own.",
      },
      {
        bold: "Liquidation and absorb",
        text: "liquidators take collateral and clear debt from positions past the liquidation threshold; past the liquidation limit the vault absorbs the position's collateral and debt itself.",
      },
    ],
    links: [{ label: "docs.fluid.io", url: DOCS }],
  };
}
