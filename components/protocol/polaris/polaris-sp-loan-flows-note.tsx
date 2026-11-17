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
        The bars are the deposit&apos;s two tokens, each on its own scale. Nothing on this page prices pETH in {stable},
        so the two lengths do not compare.
      </p>
      <p>
        The {stable} bar: deposited, with the {stable} yield the touches paid in, less withdrawn, burned by liquidations
        and the yield claimed, is the deposit. Yield a touch does not claim stays in the deposit.
      </p>
      <p>
        The pETH bar: the pETH the pool paid in for the burned {stable}, less claimed, is the pETH a touch would pay out
        now.
      </p>
      <p>
        The pool writes a deposit only when it is touched, and a liquidation reaches it at the next touch. Between
        touches each figure stands as the last touch left it. At today each bar adds what the pool has done since then:
        the {stable} burned, the yield and the pETH pending.
      </p>
    </div>
  );
}

export function polarisDepositFlowsContent(stable: string): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro: `The bars add up the deposit's operations, the deposit in ${stable} and the pETH paid in, and the line under them draws each at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      `${stable}: deposited, plus the yield paid in, less withdrawn, burned by liquidations and the yield claimed, is the deposit.`,
      "pETH: paid in by liquidations, less claimed, is the pETH waiting to be claimed.",
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
        The bars are the loan&apos;s two sides: the fpETH it holds and the WETH it owes, each on its own scale. The
        floor prices fpETH in WETH; the bars do not use it, so the two lengths do not compare.
      </p>
      <p>
        The debt: borrowed, with the fees (dashed), less repaid, is what the loan owes. Each touch charges the fees the
        loans manager&apos;s index built on the debt since the touch before.
        {accrued ? " At today the fees accrued since the last touch join the Fees line." : ""}
      </p>
    </div>
  );
}

export function polarisLoanFlowsContent(): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro:
      "The bars add up the loan's touches, the collateral in fpETH and the debt in WETH, and the line under them draws each at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, less returned, is the fpETH the loan holds.",
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
        text: "the loans manager's index grows the debt per share; a touch writes the debt at the index in force.",
      },
    ],
    links: [{ label: "Polaris docs", url: DOCS }],
  };
}
