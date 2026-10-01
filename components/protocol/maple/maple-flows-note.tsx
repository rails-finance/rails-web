// The Lifetime flows panel's Explanation lines and "?" for a Maple lender
// (lib/maple/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "Maple").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { MapleFlowsNoteFacts } from "@/hooks/useMapleFlows";

const MAPLE_DOC_URL = "https://docs.maple.finance";

export interface MapleFlowsNoteProps {
  facts: MapleFlowsNoteFacts | null;
  /** Pools the wallet has used: with two, the panel shows one at a time. */
  pools: number;
}

export function MapleFlowsNote({ facts, pools }: MapleFlowsNoteProps): ReactNode {
  if (!facts) return null;
  const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);
  const a = facts.assetSymbol;
  const s = facts.poolSymbol;
  return (
    <div className="space-y-2" data-maple-flows-note="" data-anatomy="F14·maple">
      <p>
        Every figure is in {a}, the {s} pool&apos;s funds asset: Maple prices nothing in USD.
        {pools > 1 &&
          " This wallet has used both pools, and USDC and USDT are never added together, so the panel shows one pool at a time."}
      </p>
      <p>
        The bar adds up to the wallet&apos;s claim on the pool: what it deposited and received, plus the interest
        earned, less what it withdrew and transferred out. The claim is its {s} shares, with any shares waiting in the
        withdrawal queue, at the pool&apos;s rate (its assets over its shares). Each event states the claim at the
        pool&apos;s rate in its block, so the interest between two events is the claim&apos;s rise less what moved: the
        shares held times the rise in the rate, to within a few millionths of {a} of rounding.
      </p>
      {(facts.requests > 0 || facts.fills > 0) && (
        <p>
          {facts.requests > 0
            ? `${n(facts.requests, "A withdrawal request", "withdrawal requests")} moved shares into the queue. Shares waiting there are still the wallet's claim and stay in Still in the pool`
            : "Shares waiting in the queue are still the wallet's claim"}
          {facts.cancellations > 0
            ? `; ${n(facts.cancellations, "one request was cancelled or reduced", "requests were cancelled or reduced")}, which moved shares back and changed nothing on the bar`
            : ""}
          .
          {facts.fills > 0
            ? ` ${n(facts.fills, "One fill", "fills")} paid the wallet out of the queue (Withdrawn through the queue).`
            : ""}
          {facts.fillsWithoutPayout > 0
            ? ` ${n(facts.fillsWithoutPayout, "One fill", "fills")} left the claim as it was: the shares came out of the queue to the wallet, and the withdrawal that redeemed them is the outflow.`
            : ""}
        </p>
      )}
      {facts.transfers > 0 && (
        <p>
          {n(facts.transfers, "One share transfer", "share transfers")} moved {s} between this wallet and another, each
          valued at the pool&apos;s rate in its block (Received by transfer, Transferred out).
          {facts.unvalued > 0
            ? ` ${n(facts.unvalued, "One has", "have")} no rate in its block, so its value is not counted and the interest of the next event takes up the difference.`
            : ""}
        </p>
      )}
      {facts.rateFalls > 0 && (
        <p>
          {n(facts.rateFalls, "Once", "times")} the claim fell between two events by more than rounding: the pool&apos;s
          rate fell, and the fall is shown as Fall in the pool&apos;s rate.
        </p>
      )}
      {facts.unmatched > 0 && (
        <p>
          In {n(facts.unmatched, "one transaction", "transactions")} the rows&apos; amounts do not add up to the
          claim&apos;s move less the interest the index states; the difference is in Interest earned.
        </p>
      )}
      <p>
        Between events the shares stay as they are, and the pool&apos;s rate is drawn in a straight line from its value
        at one of the wallet&apos;s events to the next
        {facts.liveRate
          ? "; after the last, to the pool's exit rate now, the amount one share pays out on withdrawal."
          : "; after the last it stays at that event's rate, since the page has no read of the pool's rate now."}
        {facts.unrated > 0
          ? ` ${n(facts.unrated, "One transaction has", "transactions have")} no rate in its block, so the claim there is the one before plus what moved.`
          : ""}{" "}
        Maple is not in the daily price store; amounts in the pool&apos;s token need no price.
      </p>
      <p>
        Where the interest comes from: the pool&apos;s borrowers pay interest on their loans, which raises the
        pool&apos;s rate. Nothing is paid out to the lender; the same shares are worth more. The chain proves every
        deposit, withdrawal, transfer, queue fill and the rate each used; the loan book behind the rate and the
        borrowers&apos; collateral, which custodians hold off-chain, are Maple&apos;s records.
      </p>
    </div>
  );
}

export function mapleFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every event Maple has recorded for this wallet in one pool, in the pool's token, and the line under them draws its claim at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Deposited, plus received by transfer, plus the interest earned, less withdrawn, less withdrawn through the queue, less transferred out, is the claim: the wallet's shares and its shares in the withdrawal queue at the pool's rate.",
      "Each event states the claim at the pool's rate in its block, so the interest between two events is the claim's rise less what moved.",
      "Amounts are in the pool's token, USDC or USDT, with no dollar price: pricing a stablecoin at a fixed $1 would hide the moment it stopped being worth one.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Pool shares",
        text: "a lender holds shares of the pool, a standard vault token (ERC-4626) whose value in USDC or USDT rises as the pool's borrowers pay interest. It falls only if the pool delegate, the manager that runs the pool's lending, marks a loan as impaired.",
      },
      {
        bold: "Withdrawal queue",
        text: "exiting means requesting a withdrawal and waiting for it to be processed, first in, first out, as the pool has cash. Shares in the queue are still the lender's until a fill pays them out.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}
