// The Lifetime flows panel's Explanation lines and "?" for a Morpho Blue
// position (lib/morpho/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Morpho").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { MorphoFlowsNoteFacts } from "@/hooks/useMorphoFlows";

const DOCS = {
  MARKET: "https://docs.morpho.org/learn/concepts/market/",
  LIQUIDATION: "https://docs.morpho.org/learn/concepts/liquidation/",
  IRM: "https://docs.morpho.org/learn/concepts/irm/",
};

export interface MorphoFlowsNoteProps {
  facts: MorphoFlowsNoteFacts | null;
  loanSymbol: string;
  collSymbol: string | null;
  /** "Morpho Blue" or "Morpho Blue on Base". */
  name: string;
}

export function MorphoFlowsNote({ facts, loanSymbol, collSymbol, name }: MorphoFlowsNoteProps): ReactNode {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);
  const coll = collSymbol ?? "the collateral";
  const borrower = facts?.roles.borrower ?? true;
  const lender = facts?.roles.lender ?? false;
  return (
    <div className="space-y-2" data-morpho-flows-note="" data-anatomy="F14·morpho">
      <p>
        Every figure is in {loanSymbol}, this market&apos;s loan token: {name} prices nothing in USD, and the
        market&apos;s oracle prices {coll} in {loanSymbol}.
        {borrower &&
          ` Each ${coll} flow is converted at the oracle's price at its block, so on the collateral side the last line, Market move, is the change in that price since each flow.`}
      </p>
      {borrower && (
        <p>
          The debt side adds up to what the position owes: borrowed, plus the interest accrued, less what was repaid,
          what liquidators repaid and any bad debt written off. Each event states the debt just before and after it as
          the market&apos;s totals price the position&apos;s borrow shares, so the interest between two events is exact
          to the base unit. Between events the debt grows at the rate the market charged until the next one (its
          interest over the debt and the time); after the last, at the market&apos;s borrow rate now.
          {facts && facts.principalRows > 0
            ? ` ${n(facts.principalRows, "One borrow or repay row states", "borrow or repay rows state")} the principal only (the answer carried no market totals for ${facts.principalRows === 1 ? "it" : "them"}), so interest before ${facts.principalRows === 1 ? "it" : "them"} is not counted.`
            : ""}
        </p>
      )}
      {lender && (
        <p>
          The {borrower ? "supply" : "bar"} adds up to what the position has supplied: supplied, plus the interest
          earned, less what was withdrawn and any bad debt the market passed on to its lenders. Each event states the
          supply just before and after it as the market&apos;s totals price the supply shares, so the interest between
          two events is exact to the base unit; where the supply fell between two events, bad debt from another
          position&apos;s liquidation took more than the interest earned, and the fall is shown as Bad debt realised.
          Between events the supply grows at the rate the market paid until the next one; after the last, at its supply
          rate now.
        </p>
      )}
      {borrower && facts && facts.liquidations > 0 && (
        <p>
          {n(facts.liquidations, "A liquidation", "liquidations")} seized collateral (Seized in liquidations) and repaid
          debt (Repaid by liquidators).
          {facts.badDebt > 0
            ? ` ${n(facts.badDebt, "One", "of them")} left no collateral, and the debt it could not cover was written off as bad debt: the liquidator repaid the seized collateral at the oracle price over the market's liquidation incentive, and the rest of the debt it cleared is Bad debt written off.`
            : ""}
        </p>
      )}
      {borrower && facts && (
        <p>
          {facts.nearest > 0
            ? `${n(facts.priced, "One collateral flow is", "collateral flows are")} valued at the oracle price read at its block; ${n(facts.nearest, "one takes", "take")} the nearest priced event's. `
            : "Every collateral flow is valued at the oracle price at its block. "}
          No daily oracle price is recorded, so between events the collateral keeps the price of its latest priced
          event, and a price more than 30 days old is stated as such.
        </p>
      )}
    </div>
  );
}

export function morphoFlowsContent(name: string): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro: `The bars add up every event ${name} has recorded for this position, in the market's loan token, and the line under them draws what it held and owed at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, less withdrawn, less seized in liquidations, each at the market oracle's price at its block, plus the change in that price since (Market move), is what the position holds.",
      "Debt: borrowed, plus the interest accrued, less repaid, less repaid by liquidators and any bad debt written off, is what the position owes: its borrow shares at the market's totals.",
      "Supply: supplied, plus the interest earned, less withdrawn and any bad debt realised, is what a lender holds: its supply shares at the market's totals.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Loan-token units",
        text: "each market's oracle prices its collateral in its loan token, and Morpho has no USD price, so every figure is in the loan token.",
      },
      {
        bold: "Shares",
        text: "debt and supply are shares of the market's totals; the market's interest raises what each share is worth, so a balance grows between events with no event of its own.",
      },
      {
        bold: "Bad debt",
        text: "a liquidation that leaves no collateral writes off the debt it could not cover, and the market's lenders bear it.",
      },
    ],
    links: [
      { label: "docs.morpho.org — Markets", url: DOCS.MARKET },
      { label: "docs.morpho.org — Liquidation", url: DOCS.LIQUIDATION },
      { label: "docs.morpho.org — Interest rate model", url: DOCS.IRM },
    ],
  };
}
