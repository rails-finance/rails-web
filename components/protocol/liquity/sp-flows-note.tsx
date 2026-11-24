// The Lifetime flows panel's Explanation lines and "?" for a Liquity V2 (or
// fork) stability-pool deposit; `stable` is the pool's stablecoin, `docs` the
// deployment's page on its Stability Pool (lib/liquity-v2/sp-flow-timelines.ts; decision 0022
// as amended 17 Nov 2026).

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const DOCS = { label: "Liquity docs", url: "https://docs.liquity.org" };

export function LiquityV2DepositFlowsNote({ coll, stable = "BOLD" }: { coll: string; stable?: string }): ReactNode {
  const S = stable;
  return (
    <div className="space-y-2" data-liquity-v2-deposit-flows-note="" data-anatomy="F14">
      <p>
        The bars are the deposit&apos;s two tokens, each on its own scale; neither bar prices {coll} in {S}.
      </p>
      <p>
        The {S} bar: deposited, with the {S} yield the branch&apos;s interest paid in, less withdrawn, burned by
        liquidations and the yield claimed, is the deposit.
      </p>
      <p>
        The {coll} bar: the {coll} the pool paid in for the burned {S}, less claimed, is the {coll} still stashed.
      </p>
      <p>
        The pool writes a deposit only when it is touched, and a liquidation reaches it at the next touch. Between
        touches each figure stands as the last touch left it. Today each bar adds what the pool has done since then: the
        {S} burned, the yield and the {coll} pending.
      </p>
    </div>
  );
}

export function liquityV2DepositFlowsContent(
  coll: string,
  stable = "BOLD",
  docs: { label: string; url: string } = DOCS,
): LearnMoreContent {
  const S = stable;
  return {
    title: "About the lifetime flows",
    intro: `The bars add up the deposit's touches, the deposit in ${S} and the ${coll} paid in, and the line under them draws each at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      `${S}: deposited, plus the yield paid in, less withdrawn, burned by liquidations and the yield claimed, is the deposit.`,
      `${coll}: paid in by liquidations, less claimed, is the ${coll} the deposit has stashed.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Stability Pool",
        text: `each branch has its own. ${S} deposited in the ${coll} pool repays the debt of liquidated ${coll} Troves; each liquidation burns a share of every deposit and pays ${coll} in its place. The branch's interest pays the pool a yield in ${S}.`,
        sources: [docs],
      },
      {
        bold: "Touch",
        text: "an operation on the deposit (a deposit, a withdrawal or a claim). The pool writes what liquidations and yield did to the deposit only then. A touch either claims both gains or neither: unclaimed yield joins the deposit, unclaimed collateral is stashed.",
      },
    ],
    links: [docs],
  };
}
