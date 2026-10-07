// The Lifetime flows panel's Explanation lines and "?" for a Compound V3
// position (lib/compound/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V3").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { CompoundFlowFacts } from "@/lib/compound/flows";

const DOCS = {
  ACCOUNTS: "https://docs.compound.finance/collateral-and-borrowing/",
  INTEREST: "https://docs.compound.finance/interest-rates/",
  LIQUIDATION: "https://docs.compound.finance/liquidation/",
};

export interface CompoundFlowsNoteProps {
  facts: CompoundFlowFacts | null;
  baseSymbol: string;
  /** The market's prices are quoted in ETH (cWETHv3). */
  ethQuoted: boolean;
}

export function CompoundFlowsNote({ facts, baseSymbol, ethQuoted }: CompoundFlowsNoteProps): ReactNode {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);
  const roles = facts?.roles;
  const two = roles ? roles.collateral || roles.debt : true;
  const lent = roles?.supply ?? !two;
  return (
    <div className="space-y-2" data-compound-flows-note="" data-anatomy="F14·compound">
      <p>
        Each flow is valued in USD at Comet&apos;s oracle price at its block, the price its liquidation engine reads
        {ethQuoted
          ? `; this market prices in ETH, so each price is converted at Comet's WETH/USD at the same block`
          : ""}
        .{two && " On the collateral side the last line, Market move, is the change in those prices since each flow."}
      </p>
      {two && roles?.debt !== false && (
        <p>
          The debt side adds up to what the position owes in {baseSymbol}: borrowed, plus the interest accrued, less
          what was repaid and what an absorb cleared. Each event states the {baseSymbol} balance the chain held at its
          block (the account&apos;s principal at the market&apos;s borrow index) and the interest since the previous
          event (the previous principal at this block&apos;s index, less the previous balance), so the interest between
          two events is exact to the base unit. Comet has no borrow or repay call: a supply into a debt repays it and
          lends the rest, and a withdrawal past the balance borrows. Between events the debt grows at the rate the
          market charged until the next one; after the last, at its borrow rate now.
        </p>
      )}
      {lent && (
        <p>
          The {two ? "lent " + baseSymbol : "bar"} adds up to what the position has supplied: supplied, plus the
          interest earned, less what was withdrawn. The interest between two events is exact to the base unit, from the
          principal at the market&apos;s supply index. Between events the supply grows at the rate the market paid until
          the next one; after the last, at its supply rate now.
        </p>
      )}
      {facts && facts.absorbs > 0 && (
        <p>
          {n(facts.absorbs, "An absorb", "absorbs")} liquidated the account: Comet takes every collateral asset (Seized
          by the absorb) and clears the debt (Cleared by the absorb).
          {facts.credits > 0
            ? ` Where the seized collateral was credited at more than the debt, the rest was lent to the account in ${baseSymbol} (Left over after the absorb).`
            : ""}{" "}
          Comet later sells the seized collateral to buyers for its reserves (buyCollateral), which moves nothing in
          this account.
        </p>
      )}
      {facts && facts.transfers > 0 && (
        <p>
          Received by transfer and Sent by transfer are collateral or lent {baseSymbol} moved between accounts inside
          Comet, with nothing leaving the protocol.
          {facts.unlogged > 0
            ? ` Comet logs no event for the borrowing side of a ${baseSymbol} transfer: where the balance moved by more than the events and the interest state (${n(facts.unlogged, "one event", "events")}), the move is Borrowed to send by transfer, or Repaid by a transfer in where it rose.`
            : ""}
        </p>
      )}
      {facts && facts.unsettled > 0 && (
        <p>
          {n(facts.unsettled, "One event's", "events'")} {baseSymbol} balance is the sum of the logged amounts, read
          from the Comet&apos;s logs before the index answered: no interest is counted before{" "}
          {facts.unsettled === 1 ? "it" : "them"}, so it lands on the last line.
        </p>
      )}
      {facts && (
        <p>
          {facts.nearest > 0
            ? `${n(facts.priced, "One event is", "events are")} valued at the prices read at its block; ${n(facts.nearest, "one takes", "take")} the nearest priced event's. `
            : "Every event is valued at the prices at its block. "}
          {facts.between === "store"
            ? "Between events each asset is valued at Comet's oracle price at the end of each day; the last stop takes the oracle's price at the latest block."
            : "No daily price is recorded for Compound V3, so between events each asset keeps the price of its latest event, and a price more than 30 days old is stated as such."}
        </p>
      )}
    </div>
  );
}

export function compoundFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every event Compound V3 has recorded for this position, each at Comet's oracle price at its block, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited and received, less withdrawn, sent and seized by an absorb, each at its block's price, plus the change in those prices since (Market move), is what the position holds.",
      "Debt: borrowed, plus the interest accrued, less repaid and cleared by an absorb, is what the position owes: its principal at the market's borrow index.",
      "Supply: supplied, plus the interest earned, less withdrawn, is what a lender holds: its principal at the market's supply index.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One base balance",
        text: "a Comet account holds one signed balance of the market's base asset: above zero it lends, below zero it borrows; collateral earns nothing.",
      },
      {
        bold: "Indexes",
        text: "the market's supply and borrow indexes grow with its interest, and a balance is its principal times the index, so it grows between events with no event.",
      },
      {
        bold: "Absorb",
        text: "a liquidation takes the whole account: every collateral asset is seized and the debt cleared; the protocol sells the collateral later.",
      },
    ],
    links: [
      { label: "docs.compound.finance — Collateral and borrowing", url: DOCS.ACCOUNTS },
      { label: "docs.compound.finance — Interest rates", url: DOCS.INTEREST },
      { label: "docs.compound.finance — Liquidation", url: DOCS.LIQUIDATION },
    ],
  };
}
