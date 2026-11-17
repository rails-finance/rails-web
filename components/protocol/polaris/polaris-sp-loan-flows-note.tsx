// The Lifetime flows panel's Explanation lines and "?" for a Polaris
// stability-pool deposit and a reserve loan (lib/polaris/sp-loan-flow-timelines.ts;
// decision 0022 as amended 17 Nov 2026).

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const DOCS = "https://docs.polaris.finance";

export function PolarisDepositFlowsNote({ stable }: { stable: string }): ReactNode {
  return (
    <div className="space-y-2" data-polaris-deposit-flows-note="" data-anatomy="F14">
      <p>
        The bars are the deposit&apos;s two tokens, each on its own scale. Nothing on this page prices pETH in {stable}.
      </p>
      <p>
        The {stable} bar: deposited, with the {stable} yield the touches paid in, less withdrawn, burned by liquidations
        and the yield claimed, is the deposit.
      </p>
      <p>
        The pETH bar: the pETH the pool paid in for the burned {stable}, less claimed, is the pETH the next touch pays
        out.
      </p>
      <p>
        The pool writes a deposit only when it is touched, and a liquidation reaches it at the next touch. Between
        touches each figure stands as the last touch left it. Today each bar adds what the pool has done since then: the{" "}
        {stable} burned, the yield and the pETH pending.
      </p>
    </div>
  );
}

export function polarisDepositFlowsContent(stable: string): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro: `The bars add up the deposit's touches, the deposit in ${stable} and the pETH paid in, and the line under them draws each at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      `${stable}: deposited, plus the yield paid in, less withdrawn, burned by liquidations and the yield claimed, is the deposit.`,
      "pETH: paid in by liquidations, less claimed, is the pETH the next touch pays out.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Stability Pool",
        text: `deposits of ${stable} repay the debt of liquidated positions; each liquidation burns a share of every deposit and pays pETH in its place.`,
        sources: [{ label: "Polaris docs", url: DOCS }],
      },
      {
        bold: "Touch",
        text: "an operation on the deposit (a deposit, a withdrawal or a claim). The pool writes what liquidations and yield did to the deposit only then.",
      },
    ],
    links: [{ label: "Polaris docs", url: DOCS }],
  };
}

export function PolarisLoanFlowsNote({ accrued }: { accrued: boolean }): ReactNode {
  return (
    <div className="space-y-2" data-polaris-loan-flows-note="" data-anatomy="F14">
      <p>
        Both bars are in WETH: the fpETH the loan holds at the bonding curve&apos;s floor, and the WETH it owes. Each
        fpETH flow is valued at the floor in force at its touch; the floor only rises, and its rise since is the
        collateral&apos;s Floor rise. The index records the floor only at the loan&apos;s touches, so a day between
        keeps the last touch&apos;s floor, drawn dotted; today is the chain&apos;s floor.
      </p>
      <p>
        The debt: borrowed, with the fees (dashed), less repaid, is what the loan owes. Each touch charges the fees the
        index built on the debt since the touch before.
        {accrued ? " Today the fees accrued since the last touch join the Fees line." : ""}
      </p>
    </div>
  );
}

export function polarisLoanFlowsContent(): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro:
      "The bars add up the loan's touches in WETH, the collateral at the bonding curve's floor, and the line under them draws each at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, less returned, each at the floor at its touch, with the floor's rise since, is the fpETH the loan holds at the floor.",
      "Debt: borrowed, plus the fees, less repaid, is the WETH the loan owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Reserve loan",
        text: "WETH lent against fpETH at the bonding curve's floor; the loans manager liquidates no loan.",
        sources: [{ label: "Polaris docs", url: DOCS }],
      },
      {
        bold: "Fees",
        text: "the index grows the debt per share; a touch writes the debt at the index in force.",
      },
    ],
    links: [{ label: "Polaris docs", url: DOCS }],
  };
}
