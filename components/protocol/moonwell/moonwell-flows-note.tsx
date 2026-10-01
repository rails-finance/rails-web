// The Lifetime flows panel's Explanation lines and "?" for a Moonwell account,
// Ethereum or Base (lib/shared/ctoken-flows.ts, lib/moonwell/flows.ts;
// rails-ops reference/lifetime-flows-scrubber.md, "Moonwell").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { MoonwellFlowsFacts } from "@/hooks/useMoonwellFlows";

const DOCS = "https://docs.moonwell.fi/moonwell/protocol-information/lending-and-borrowing";

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

/** "a, b and c". */
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function MoonwellFlowsNote({ facts }: { facts: MoonwellFlowsFacts | null }): ReactNode {
  const borrower = facts?.borrower ?? true;
  const liquidated = (facts?.liquidations ?? 0) > 0;
  const collIn = [
    "supplied",
    ...(facts && facts.transfersIn > 0 ? ["received by transfer"] : []),
    "the interest earned",
  ];
  const collOut = [
    "withdrawn",
    ...(facts && facts.transfersOut > 0 ? ["sent"] : []),
    ...(liquidated ? ["seized in liquidations"] : []),
  ];
  return (
    <div className="space-y-2" data-moonwell-flows-note="" data-anatomy="F14·moonwell">
      <p>
        A Moonwell account supplies and borrows on any of its markets under one account liquidity, so each bar adds
        every market in USD, each flow at Moonwell&apos;s oracle price for its market at its block. The collateral bar
        adds up to what the account holds: {list(collIn)}, less what was {list(collOut)}.
        {borrower &&
          ` The debt bar adds up to what it owes: borrowed and the interest accrued, less what was repaid${liquidated ? " and what liquidators repaid" : ""}.`}
      </p>
      <p>
        Interest is the dashed part. Every row states its market&apos;s balance just before and after it: the supply as
        the mToken balance × the market&apos;s exchange rate at that block
        {borrower ? ", the debt as the accountBorrows the market emitted" : ""}. So the interest between two rows on a
        market is the balance just before the later one less the balance after the earlier one, exact to the base unit.
        Between events the supply grows with the exchange rate, in a straight line from one row to the next
        {borrower ? ", and the debt as it grew until the market's next row" : ""}; after the last row, to
        {facts?.live === false ? " the market's rate now" : " today's balances from the live read"}. That growth and the
        change in prices since each flow are the last line of each bar, Market move and interest since the last event.
      </p>
      {facts && (facts.liquidations > 0 || facts.transfersIn > 0 || facts.transfersOut > 0) && (
        <p>
          {facts.liquidations > 0
            ? `${n(facts.liquidations, "A liquidation", "liquidations")} repaid debt (Repaid by liquidators) and took mTokens from the collateral: the liquidator's part and the protocol's share, which stays in the market as reserves (Seized in liquidations). `
            : ""}
          {facts.transfersIn > 0 || facts.transfersOut > 0
            ? "mTokens can change hands like any token: those another wallet sent in are Received by transfer, those sent out are mTokens sent, at the underlying they stood for at that block."
            : ""}
        </p>
      )}
      {facts && (
        <p>
          {facts.nearest > 0
            ? `${n(facts.priced, "One row is", "rows are")} valued at the oracle price at its block; ${n(facts.nearest, "one has", "have")} no price recorded at its block and ${facts.nearest === 1 ? "takes" : "take"} the nearest priced row's price on its market. `
            : "Every row is valued at the oracle price at its block. "}
          {facts.between === "store"
            ? "Between events each market is valued at Moonwell's oracle price at the end of each day; today's is the live read's."
            : "The daily oracle prices did not load, so between events each market keeps the price of its latest event, and a price more than 30 days old is stated as such."}
        </p>
      )}
    </div>
  );
}

export function moonwellFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every Moonwell event of this account, each at Moonwell's oracle price at its block, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: supplied, received by transfer and the interest earned, less withdrawn, sent and seized in liquidations, is what the account holds: its mTokens at the market's exchange rate.",
      "Debt: borrowed and the interest accrued, less repaid and repaid by liquidators, is what the account owes: the market's accountBorrows.",
      "The last line of each bar is the change in prices since each flow, with the interest since the market's last event.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Exchange rate",
        text: "mTokens are receipt tokens: the market's exchange rate rises as borrowers pay interest, so a supply grows between its events.",
      },
      {
        bold: "One account liquidity",
        text: "the Comptroller adds every market the account entered against all its borrows, so one account's markets share one liquidation line.",
      },
      {
        bold: "Liquidation",
        text: "a liquidator repays part of the debt and takes mTokens of the collateral at a bonus; a share of what it takes stays in the market as the protocol's reserves.",
      },
    ],
    links: [{ label: "Moonwell docs", url: DOCS }],
  };
}
