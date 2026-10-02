// The Lifetime flows panel's Explanation lines and "?" for an Aave V3 Pool
// account on Base: Aave V3 on Base and Seamless (lib/aave-v3-base/flows.ts;
// rails-ops reference/lifetime-flows-scrubber.md, "Aave V3 on Base and
// Seamless").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { AaveV3BaseFlowsFacts } from "@/hooks/useAaveV3BaseFlows";
import { formatNumber } from "@/lib/utils/format";

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

/** "a, b and c". */
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const count = (k: number, noun: string) => `${k.toLocaleString("en-US")} ${noun}${k === 1 ? "" : "s"}`;

/** Which price each flow took, where the index stored none at some blocks. */
function pricingWords(p: AaveV3BaseFlowsFacts["priced"], brand: string): string {
  const other = p.day + p.nearest + p.today;
  const ways = [
    ...(p.day > 0 ? [`${count(p.day, "flow")} at ${brand}'s oracle price at the end of the day`] : []),
    ...(p.nearest + p.today > 0
      ? [`${count(p.nearest + p.today, "flow")} at the nearest priced row's price on the reserve`]
      : []),
  ];
  return `${count(p.block, "flow")} ${p.block === 1 ? "is" : "are"} valued at the oracle price at ${p.block === 1 ? "its" : "their"} block. The index stored no price at the block of the other ${count(other, "flow")}, valued ${list(ways)}. `;
}

export function AaveV3BaseFlowsNote({
  facts,
  brand,
  pool,
}: {
  facts: AaveV3BaseFlowsFacts | null;
  /** "Aave" or "Seamless": whose oracle prices the flows. */
  brand: string;
  /** The Pool's name in a sentence: "the Aave V3 Pool on Base". */
  pool: string;
}): ReactNode {
  const borrower = facts?.borrower ?? true;
  const liquidated = (facts?.liquidations ?? 0) > 0;
  const collIn = [
    "supplied",
    ...(facts && facts.transfersIn > 0 ? ["received by transfer"] : []),
    "the interest earned",
  ];
  const collOut = [
    "withdrawn",
    ...(facts && facts.transfersOut > 0 ? ["sent to another account"] : []),
    ...(liquidated ? ["liquidated"] : []),
  ];
  const p = facts?.priced;
  const other = p ? p.day + p.nearest + p.today : 0;
  return (
    <div className="space-y-2" data-aave-base-flows-note="" data-anatomy="F14·aave-v3-base">
      <p>
        An account on {pool} supplies and borrows any of its reserves under one health factor, so each bar adds every
        reserve in USD, each flow at {brand}&apos;s oracle price for its reserve at its block. The collateral bar adds
        up to what the account holds: {list(collIn)}, less what was {list(collOut)}.
        {borrower &&
          ` The debt bar adds up to what it owes: borrowed and the interest accrued, less what was repaid${liquidated ? " and what liquidators repaid" : ""}.`}
      </p>
      <p>
        Interest is the dashed part. Every row states its reserve&apos;s balance just before and after it, as the aToken
        {borrower ? " and the variable debt token" : ""} held it at that block. So the interest between two rows of a
        reserve is the balance just before the later one less the balance after the earlier one. Between events each
        balance grows at the rate the rows imply, in a straight line from one row to the next; after the last row, to
        {facts?.live === false ? " the balance its last row left" : " the Pool's balance today"}. That growth and the
        change in prices since each flow are the last line of each bar, Market move and interest since the last event.
        The Pool rounds each balance to its token&apos;s smallest unit, so an act can move a balance a unit or two more
        or less than its amount; that rounding sits in the same line.
      </p>
      {facts && (liquidated || facts.transfersIn > 0 || facts.transfersOut > 0) && (
        <p>
          {liquidated
            ? `${n(facts.liquidations, "A liquidation", "liquidations")} repaid debt and took collateral at a bonus (Liquidated, on both bars)${facts.treasuryFees > 0 ? ", the protocol's share of the bonus sent to its treasury included" : ""}.${facts.aTokenSeizures > 0 ? ` Where the liquidator took the collateral as aTokens, the transfer to it is that seizure and is counted once.` : ""} `
            : ""}
          {facts.transfersIn > 0 || facts.transfersOut > 0
            ? "aTokens can change hands like any token: those another wallet sent in are Received by transfer, those sent out are Sent to another account."
            : ""}
        </p>
      )}
      {facts && facts.writtenOff.length > 0 && (
        <p>
          {list(facts.writtenOff.map((w) => `${formatNumber(w.amount)} ${w.symbol}`))} of debt that this history ends
          with no longer exists on chain: a liquidation left no collateral to cover it, so the Pool wrote it off, an
          event this history does not read. It is the debt bar&apos;s Written off line today.
        </p>
      )}
      {facts?.source === "route" && (
        <p data-aave-base-flows-source="route">
          This account has {count(facts.events, "event")}, more than this page holds, so the bars and the line come from
          Rails&apos; server: it replays every event from its index of {pool}, by the rules this page uses on a history
          it holds whole. The cards on the timeline state the newest events&apos; flows from the same replay.
        </p>
      )}
      {p && (
        <p>
          {other > 0 ? pricingWords(p, brand) : "Every flow is valued at the oracle price at its block. "}
          {facts.between === "store"
            ? `Between events each reserve is valued at ${brand}'s oracle price at the end of each day; today's is the oracle's now.`
            : "The daily oracle prices did not load, so between events each reserve keeps the price of its latest event, and a price more than 30 days old is stated as such."}
        </p>
      )}
    </div>
  );
}

export function aaveV3BaseFlowsContent(brand: string): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro: `The bars add up every event of this account on the Pool, each at ${brand}'s oracle price at its block, and the line under them draws what it held and owed at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: supplied, received by transfer and the interest earned, less withdrawn, sent and liquidated, is what the account holds: its aTokens.",
      "Debt: borrowed and the interest accrued, less repaid and liquidated, is what the account owes: its variable debt tokens.",
      "The last line of each bar is the change in prices since each flow, with the interest since the reserve's last event.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "aTokens",
        text: "a supply is held as aTokens, whose balance grows with the reserve's liquidity index as borrowers pay interest.",
      },
      {
        bold: "Variable debt",
        text: "a borrow is held as variable debt tokens, whose balance grows with the reserve's borrow index.",
      },
      {
        bold: "Liquidation",
        text: "a liquidator repays part of the debt and takes collateral at a bonus; the protocol keeps a share of that bonus.",
      },
    ],
  };
}
