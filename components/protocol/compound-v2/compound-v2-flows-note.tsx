// The Lifetime flows panel's Explanation lines and "?" for a Compound V2
// account (lib/shared/ctoken-flows.ts, lib/compound-v2/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V2").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { CompoundV2FlowsFacts } from "@/hooks/useCompoundV2Flows";

const DOCS = "https://docs.compound.finance/v2/";

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

/** "a, b and c". */
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function CompoundV2FlowsNote({ facts }: { facts: CompoundV2FlowsFacts | null }): ReactNode {
  const borrower = facts?.borrower ?? true;
  const liquidated = (facts?.liquidations ?? 0) > 0;
  const collIn = [
    "supplied",
    ...(facts && facts.transfersIn > 0 ? ["received by transfer"] : []),
    ...(facts && facts.seizedAsLiquidator > 0 ? ["seized as a liquidator"] : []),
    "the interest earned",
  ];
  const collOut = [
    "withdrawn",
    ...(facts && facts.transfersOut > 0 ? ["sent"] : []),
    ...(liquidated ? ["seized in liquidations"] : []),
  ];
  return (
    <div className="space-y-2" data-compound-v2-flows-note="" data-anatomy="F14·compound-v2">
      <p>
        A Compound V2 account supplies and borrows on any of its markets under one account liquidity, so each bar adds
        every market in USD, each flow at Compound&apos;s oracle price for its market at its block. The collateral bar
        adds up to what the account holds: {list(collIn)}, less what was {list(collOut)}.
        {borrower &&
          ` The debt bar adds up to what it owes: borrowed and the interest accrued, less what was repaid${liquidated ? " and what liquidators repaid" : ""}.`}
      </p>
      <p>
        Interest is the dashed part. Every row states its market&apos;s balance just before and after it: the supply as
        the cToken balance × the market&apos;s exchange rate at that block
        {borrower ? ", the debt as the accountBorrows the market emitted" : ""}. So the interest between two rows on a
        market is the balance just before the later one less the balance after the earlier one, exact to the base unit.
        Between events the supply grows with the exchange rate, in a straight line from one row to the next
        {borrower ? ", and the debt as it grew until the market's next row" : ""}; after the last row, to
        {facts?.live === false ? " the market's rate now" : " today's balances from the live read"}. That growth and the
        change in prices since each flow are the last line of each bar, Market move and interest since the last event.
      </p>
      {facts &&
        (facts.liquidations > 0 || facts.transfersIn > 0 || facts.transfersOut > 0 || facts.seizedAsLiquidator > 0) && (
          <p>
            {facts.liquidations > 0
              ? `${n(facts.liquidations, "A liquidation", "liquidations")} repaid debt (Repaid by liquidators) and took cTokens from the collateral, the protocol's share included (Seized in liquidations). `
              : ""}
            {facts.transfersIn > 0 || facts.transfersOut > 0
              ? "cTokens can change hands like any token: those another wallet sent in are Received by transfer, those sent out are cTokens sent, at the underlying they stood for at that block. "
              : ""}
            {facts.seizedAsLiquidator > 0
              ? "As a liquidator the account took other borrowers' cTokens: Seized as liquidator."
              : ""}
          </p>
        )}
      {facts && (
        <p>
          {facts.nearest > 0
            ? `${n(facts.priced, "One row is", "rows are")} valued at the oracle price at its block; ${n(facts.nearest, "one takes", "take")} the nearest priced row's price on its market, since the page reads at most 400 block prices. `
            : "Every row is valued at the oracle price at its block. "}
          {facts.ethEra > 0
            ? `Before 17 Aug 2020 Compound's oracle priced every market in ETH: ${n(facts.ethEra, "one row", "rows")} from then ${facts.ethEra === 1 ? "is" : "are"} turned into dollars with the same oracle's USDC price at the block. `
            : ""}
          {facts.between === "store"
            ? "Between events each market is valued at Compound's oracle price at the end of each day (in the ETH years with that day's USDC price); today's is the live read's."
            : "No daily oracle price is recorded for Compound V2, so between events each market keeps the price of its latest priced row, and a price more than 30 days old is stated as such."}
          {facts.fixed.length > 0
            ? ` ${facts.fixed.join(", ")} ${facts.fixed.length === 1 ? "has" : "have"} a fixed price set by governance: the oracle stores a number with no live feed behind it, and Compound values ${facts.fixed.length === 1 ? "it" : "them"} at it.`
            : ""}
        </p>
      )}
    </div>
  );
}

export function compoundV2FlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every Compound V2 event of this account, each at Compound's oracle price at its block, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: supplied, received by transfer and the interest earned, less withdrawn, sent and seized in liquidations, is what the account holds: its cTokens at the market's exchange rate.",
      "Debt: borrowed and the interest accrued, less repaid and repaid by liquidators, is what the account owes: the market's accountBorrows.",
      "The last line of each bar is the change in prices since each flow, with the interest since the market's last event.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Exchange rate",
        text: "cTokens are receipt tokens: the market's exchange rate rises as borrowers pay interest, so a supply grows between its events.",
      },
      {
        bold: "One account liquidity",
        text: "the Comptroller adds every market the account entered against all its borrows, so one account's markets share one liquidation line.",
      },
      {
        bold: "Oracle in ETH, then USD",
        text: "until 17 Aug 2020 Compound's oracle priced every market in ETH; the panel turns those prices into dollars with the same oracle's USDC price at the block.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: DOCS }],
  };
}
