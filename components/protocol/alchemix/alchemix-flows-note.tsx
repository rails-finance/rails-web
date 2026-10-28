// The Lifetime flows panel's Explanation lines for an Alchemist position
// (lib/alchemix/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Alchemix").

import type { ReactNode } from "react";
import type { AlchemixFlowFacts } from "@/lib/alchemix/flows";

export interface AlchemixFlowsNoteProps {
  facts: AlchemixFlowFacts | null;
  underlyingSymbol: string;
  mytSymbol: string;
  syntheticSymbol: string;
  /** Gas over the position's transactions, each counted once. */
  gas: { transactions: number; custody: number; eth: number } | null;
  /** A V2 history joins the timeline: its rows are not in the bars. */
  v2Joined: boolean;
}

export function AlchemixFlowsNote({
  facts,
  underlyingSymbol: u,
  mytSymbol: sh,
  syntheticSymbol: sym,
  gas,
  v2Joined,
}: AlchemixFlowsNoteProps): ReactNode {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);
  const shares = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 4 });
  return (
    <div className="space-y-2" data-alchemix-flows-note="" data-anatomy="F14">
      <p>
        Every figure is in {u}, the asset under the vault, as the card&apos;s collateralisation counts it: the {sh}{" "}
        collateral at the vault&apos;s share price read with each reading, and each {sym} owed as one {u}, the
        Alchemist&apos;s accounting. The collateral side&apos;s last line, Share price move, is the change in that share
        price since each flow.
      </p>
      <p>
        What the position holds and owes on each day is the getCDP reading in force, taken at every block where it could
        move, the line&apos;s redemptions included. No interest accrues on the debt.
      </p>
      {facts && facts.redemptions > 0 && (
        <p>
          {n(facts.redemptions, "A line redemption", "line redemptions")} cleared debt set aside for repayment and took
          collateral; each figure is the difference of the readings either side of it, not a figure from the
          redemption&apos;s log.
          {facts.redemptionsUnstated > 0
            ? ` ${n(facts.redemptionsUnstated, "One redemption's", "redemptions'")} figures cannot be stated, another step falling between ${facts.redemptionsUnstated === 1 ? "its" : "their"} readings, so the bars leave ${facts.redemptionsUnstated === 1 ? "it" : "them"} out.`
            : ""}
        </p>
      )}
      {facts && facts.repays > 0 && (
        <p>
          {n(facts.repays, "A repay", "repays")} paid {shares(facts.repaySharesIn)} {sh} in from the caller&apos;s
          wallet, which the bars do not draw: only the protocol fee on the set-aside part left the collateral (Repay
          fees).
          {facts.unresolved > 0
            ? ` ${n(facts.unresolved, "One repayment's", "repayments'")} cleared debt was not resolved when ${facts.unresolved === 1 ? "its log was" : "their logs were"} captured, so it is not drawn.`
            : ""}
        </p>
      )}
      {facts && facts.nearest > 0 && (
        <p>
          {n(facts.nearest, "One collateral flow is", "collateral flows are")} valued at the share price of the last
          reading before {facts.nearest === 1 ? "it" : "them"}: {facts.nearest === 1 ? "its" : "their"} reading carries
          none.
        </p>
      )}
      {v2Joined && (
        <p>
          The V2 rows on the timeline are not added here: a V2 debt and this position&apos;s debt are one obligation at
          two points in time.
        </p>
      )}
      {gas && gas.eth > 0 && (
        <p>
          Gas across this position&apos;s {gas.transactions} {gas.transactions === 1 ? "transaction" : "transactions"}
          {gas.custody > 0
            ? `, ${gas.custody === 1 ? "one a custody transfer" : `${gas.custody} of them custody transfers`}`
            : ""}
          : {gas.eth.toFixed(4)} ETH.
        </p>
      )}
    </div>
  );
}
