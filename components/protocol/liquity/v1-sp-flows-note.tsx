// The Lifetime flows panel's Explanation lines and "?" for a Liquity V1
// stability-pool deposit (lib/liquity-v1/sp-flow-timelines.ts; decision 0022).

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const DOCS = "https://docs.liquity.org";

export function LiquityV1DepositFlowsNote(): ReactNode {
  return (
    <div className="space-y-2" data-liquity-v1-deposit-flows-note="" data-anatomy="F14">
      <p>The bars are two of the deposit&apos;s tokens, each on its own scale; neither prices ETH in LUSD.</p>
      <p>The LUSD bar: deposited, less withdrawn and burned by liquidations, is the deposit.</p>
      <p>
        The ETH bar: the ETH the pool paid in for the burned LUSD. Every touch pays it all out, so between touches the
        bar holds none. The LQTY each touch paid is on the card and in the timeline.
      </p>
      <p>
        The pool writes a deposit only when it is touched, and a liquidation reaches it at the next touch. Between
        touches each figure stands as the last touch left it. Today each bar adds what the pool has done since then: the
        LUSD burned and the ETH pending.
      </p>
    </div>
  );
}

export function liquityV1DepositFlowsContent(): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro:
      "The bars add up the deposit's touches, the deposit in LUSD and the ETH paid in, and the line under them draws each at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "LUSD: deposited, less withdrawn and burned by liquidations, is the deposit.",
      "ETH: paid in by liquidations, and paid out at the next touch.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Stability Pool",
        text: "LUSD deposited in the pool repays the debt of liquidated Troves; each liquidation burns a share of every deposit and pays ETH in its place. The protocol also issues LQTY to depositors.",
        sources: [{ label: "Liquity docs", url: DOCS }],
      },
      {
        bold: "Touch",
        text: "an operation on the deposit (a deposit, a withdrawal or a claim). The pool writes what liquidations did to the deposit only then, and every touch pays out the ETH and LQTY gained.",
      },
    ],
    links: [{ label: "Liquity docs", url: DOCS }],
  };
}
