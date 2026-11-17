// The Lifetime flows panel's Explanation lines and "?" for a Morpho Blue
// position (lib/morpho/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Morpho").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { MorphoFlowsNoteFacts } from "@/hooks/useMorphoFlows";
import { MORPHO_PRICE_DAYS } from "@/lib/morpho/price-days";

const DOCS = {
  MARKET: "https://docs.morpho.org/learn/concepts/blue/",
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
    <div className="space-y-2" data-morpho-flows-note="" data-anatomy="F14">
      <p>
        Every figure is in {loanSymbol}, this market&apos;s loan asset: {name} prices nothing in USD, and the
        market&apos;s oracle prices {coll} in {loanSymbol}.
        {borrower &&
          ` Each ${coll} flow is converted at the oracle's price on its day, so on the collateral side the last line, Market move, is the change in that price since each flow.`}
      </p>
      {borrower && (
        <p>
          The debt side adds up to what the position owes: borrowed, plus the interest accrued, less what was repaid,
          what liquidators repaid and any bad debt realized. Each event states the debt just before and after it as the
          market&apos;s totals price the position&apos;s borrow shares, so the interest between two events is exact to
          the base unit. Between events the debt grows at the rate the market charged until the next one (its interest
          over the debt and the time); after the last, at the market&apos;s Borrow APY now.
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
          position&apos;s liquidation took more than the interest earned, and the fall is shown as Bad debt realized.
          Between events the supply grows at the rate the market paid until the next one; after the last, at its Supply
          APY now.
        </p>
      )}
      {borrower && facts && facts.liquidations > 0 && (
        <p>
          {n(facts.liquidations, "A liquidation", "liquidations")} seized collateral (Seized in liquidations) and repaid
          debt (Repaid by liquidators).
          {facts.badDebt > 0
            ? ` ${n(facts.badDebt, "One", "of them")} left no collateral, and the debt it could not cover was realized as bad debt: the liquidator repaid the seized collateral at the oracle price over the market's Liquidation Incentive Factor, and the rest of the debt it cleared is Bad debt.`
            : ""}
        </p>
      )}
      {borrower && facts && (
        <p>
          Every collateral flow takes the oracle&apos;s price after the last event of its UTC day; a liquidation keeps
          the price it ran on.
          {facts.nearest > 0
            ? ` ${n(facts.nearest, "One collateral flow takes", "collateral flows take")} the nearest priced day's price (the page prices at most ${MORPHO_PRICE_DAYS} days).`
            : ""}{" "}
          No daily oracle price is recorded, so between days with events the collateral keeps the price of the latest
          priced day, and a price more than 30 days old is stated as such.
        </p>
      )}
    </div>
  );
}

export function morphoFlowsContent(name: string): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro: `The bars add up every event ${name} has recorded for this position, in the market's loan asset, and the line under them draws what it held and owed at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: supplied, less withdrawn, less seized in liquidations, each at the market oracle's price on its day, plus the change in that price since (Market move), is what the position holds.",
      "Debt: borrowed, plus the interest accrued, less repaid, less repaid by liquidators and any bad debt realized, is what the position owes: its borrow shares at the market's totals.",
      "Supply: supplied, plus the interest earned, less withdrawn and any bad debt realized, is what a lender holds: its supply shares at the market's totals.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Loan-asset units",
        text: "each market's oracle prices its collateral in its loan asset, and Morpho has no USD price, so every figure is in the loan asset.",
      },
      {
        bold: "Shares",
        text: "debt and supply are shares of the market's totals; the market's interest raises what each share is worth, so a balance grows between events with no event of its own.",
      },
      {
        bold: "Bad debt",
        text: "a liquidation that leaves no collateral realizes the debt it could not cover as bad debt, and the market's lenders bear it.",
      },
    ],
    links: [
      { label: "docs.morpho.org: Variable Rate Market", url: DOCS.MARKET },
      { label: "docs.morpho.org: Liquidation", url: DOCS.LIQUIDATION },
      { label: "docs.morpho.org: Interest rate model", url: DOCS.IRM },
    ],
  };
}
