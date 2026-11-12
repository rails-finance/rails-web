"use client";

// The explanation bullet for a Trove on a shut-down branch (rails-ops
// TO-DO-ui-jobs 608, 612). From the catalog's record: who shut the branch down,
// when, the withdrawal of the pool's collateral and what reverts since. From a
// live read alone: the date, and Liquity V2's documented consequences on its own
// branches (reference/official-docs/liquity-v2.md, Terms row 26). Each date
// carries its receipt. A live read that answers "live" against the record is
// stated after it.

import { Prov } from "@/components/shared/provenance";
import { H } from "@/lib/shared/explainer-prose";
import { formatPrice } from "@/lib/utils/format";
import { liquityFamilyTerms } from "@/lib/liquity/ltv";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { shutdownDateProv, shutdownDay, withdrawalDateProv } from "@/lib/shared/liquity-family-shutdown";

/** The owner operations a record says revert, in plain words. */
const OPERATION: Record<string, string> = {
  repayBold: "repay",
  withdrawColl: "withdraw",
  closeTrove: "close",
};

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function ShutdownBullet({
  protocol,
  state,
  symbol,
  debtSymbol,
  coll,
  debt,
}: {
  protocol: string;
  state: BranchShutdownState;
  symbol: string;
  debtSymbol: string;
  /** The Trove's recorded collateral and debt, the card's two figures. */
  coll: number;
  debt: number;
}) {
  const terms = liquityFamilyTerms(protocol);
  const rec = state.record;
  const day = <Prov info={shutdownDateProv(protocol, symbol, state)}>{shutdownDay(state.at)}</Prov>;
  const withdrawalProv = rec ? withdrawalDateProv(protocol, symbol, rec) : null;
  const reverts = (rec?.reverts ?? []).map((op) => OPERATION[op] ?? op);
  return (
    <span key="shutdown">
      {rec ? (
        <>
          The {terms.branch}&rsquo;s {rec.by} shut it down on {day}
          {rec.withdrawal && withdrawalProv ? (
            <>
              {" "}
              and withdrew the pool&rsquo;s collateral on{" "}
              <Prov info={withdrawalProv}>{shutdownDay(rec.withdrawal.at)}</Prov>
            </>
          ) : null}
          . The Trove still records{" "}
          <H>
            {formatPrice(coll)} {symbol}
          </H>{" "}
          and{" "}
          <H>
            {formatPrice(debt)} {debtSymbol}
          </H>{" "}
          of debt
          {reverts.length > 0 ? <>; {list(reverts)} all revert</> : null}.
          {state.disagree ? (
            <> The {terms.branch}&rsquo;s contracts now answer that it is live, against this record.</>
          ) : null}
        </>
      ) : (
        <>
          The {terms.branch} shut down on {day}.
          {protocol === "liquity-v2" ? (
            <> Closing, surplus claims and shutdown redemptions remain, and the shutdown is permanent.</>
          ) : null}
        </>
      )}
    </span>
  );
}
