// The Lifetime flows panel's Explanation lines and "?" for a Liquity V1 LQTY
// stake (lib/liquity-v1/staking-flow-timelines.ts).

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const DOCS = "https://docs.liquity.org/liquity-v1/faq/staking";

export function LiquityV1StakeFlowsNote(): ReactNode {
  return (
    <div className="space-y-2" data-liquity-v1-stake-flows-note="" data-anatomy="F14">
      <p>The bars are two of the stake&apos;s tokens, each on its own scale; neither prices one in the other.</p>
      <p>The LQTY bar: staked, less unstaked, is the stake.</p>
      <p>
        The LUSD bar: the borrowing fees paid in to the stake. Every touch pays them all out, so between touches the bar
        holds none. The ETH redemption fees each touch paid are on the card and in the timeline.
      </p>
      <p>Today the LUSD bar adds the fees paid in since the last touch.</p>
    </div>
  );
}

export function liquityV1StakeFlowsContent(): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro:
      "The bars add up the stake's touches, the stake in LQTY and the LUSD fees paid in, and the line under them draws each at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "LQTY: staked, less unstaked, is the stake.",
      "LUSD: the borrowing fees paid in to the stake, and paid out at the next touch.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "LQTY staking",
        text: "LQTY staked in LQTYStaking earns a share of the protocol's fees: the borrowing fees in LUSD and the redemption fees in ETH, in proportion to the stake.",
        sources: [{ label: "Liquity docs", url: DOCS }],
      },
      {
        bold: "Touch",
        text: "a stake, an unstake or a claim (an unstake of 0). Every touch pays out the fees paid in since the last one.",
      },
    ],
    links: [{ label: "Liquity docs", url: DOCS }],
  };
}
