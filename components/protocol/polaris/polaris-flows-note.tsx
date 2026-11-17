// The Lifetime flows panel's Explanation bullets and "?" for a Polaris CDP
// (lib/polaris/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Polaris"). Brief bullets (explanation-copy-charter §4): one group, the
// replay's mechanics behind "More about the sums".

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ExplainBullet, ExplainGroup, ExplainMore, Fig } from "@/components/shared/explain-groups";
import type { PolarisFlowFacts } from "@/lib/polaris/flows";
import { POLARIS_DOC_LINKS } from "@/lib/polaris/docs-links";
import { POLARIS_LIQ_CONSTANTS } from "./polaris-liquidation-forensics";

export interface PolarisFlowsNoteProps {
  facts: PolarisFlowFacts | null;
  /** The market's stablecoin (USDp, GOLDp). */
  stable: string;
}

const touches = (k: number) => (
  <>
    <Fig>{k.toLocaleString("en-US")}</Fig> touch{k === 1 ? "" : "es"}
  </>
);

export function PolarisFlowsNote({ facts, stable }: PolarisFlowsNoteProps): ReactNode {
  const p = facts?.pricing;
  const unpriced = p ? p.nearest + p.today : 0;
  return (
    <div data-polaris-flows-note="" data-anatomy="F14">
      <ExplainGroup title="How it counts">
        <ExplainBullet>In {stable} at the market&apos;s feed price: a testnet has no market price</ExplainBullet>
        <ExplainBullet>Interest is written into the debt at each touch</ExplainBullet>
        <ExplainBullet>
          PSM shares{facts && facts.psmRows > 0 ? <>, at {touches(facts.psmRows)}</> : null}: each mint and redemption
          moves every position pro rata
        </ExplainBullet>
        <ExplainBullet>
          Escrow <Fig>{POLARIS_LIQ_CONSTANTS.gasComp.label}</Fig> held apart, on no line; each card&apos;s ledger states
          it
        </ExplainBullet>
        {facts && facts.settledRows > 0 && (
          <ExplainBullet>Minted to the holder at {touches(facts.settledRows)}</ExplainBullet>
        )}
        {facts?.liquidated && (
          <ExplainBullet>
            Liquidated took the whole position; Surplus to claim is the owner&apos;s remainder
          </ExplainBullet>
        )}
        {unpriced > 0 && (
          <ExplainBullet>{touches(unpriced)} without a feed price take the nearest recorded one</ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainMore title="More about the sums">
        <ul className="space-y-1">
          <ExplainBullet>
            Each touch states collateral and debt; every part&apos;s line meets those figures
          </ExplainBullet>
          <ExplainBullet>Interest, reward pETH, PSM shares and stability gains build up between touches</ExplainBullet>
          <ExplainBullet>Each side runs straight from one touch to what the next wrote in</ExplainBullet>
          {facts?.pendingToday && (
            <ExplainBullet>Today adds what built up since the last touch, as the next would</ExplainBullet>
          )}
          <ExplainBullet>
            {facts?.between === "carried"
              ? "Between touches, pETH keeps its latest touch's price: the daily store did not answer"
              : "Between touches, pETH takes the feed's price at each day's close"}
          </ExplainBullet>
          <ExplainBullet>Today&apos;s pETH takes the feed price at the latest block, as the card does</ExplainBullet>
          {facts?.liquidated && (
            <ExplainBullet>
              The liquidator&apos;s compensation is inside Liquidated on the collateral side
            </ExplainBullet>
          )}
        </ul>
      </ExplainMore>
    </div>
  );
}

export function polarisFlowsContent(stable: string): LearnMoreContent {
  return {
    title: "About the lifetime flows",
    intro: `The bars add up every change Polaris made to the position, in ${stable}; the line draws what it held and owed each day.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral = deposited + reward pETH + PSM shares added − withdrawn − PSM shares taken − liquidated, plus Market move.",
      "Debt = borrowed + interest + PSM shares added − repaid − stability gains − PSM shares cleared − liquidated; where that falls below zero, the stables minted to the holder bring it to zero.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      { bold: "Interest", text: "accrues continuously at the market's algorithmic rate." },
      { bold: "Reward pETH", text: "the position's share of the bonding curve's rewards." },
      {
        bold: "PSM shares",
        text: "a touch writes in the net since the last one, so its two sides can move opposite ways.",
      },
      { bold: "Gas compensation escrow", text: "returns at the close, or goes to the liquidator." },
      {
        bold: "Minted to the holder",
        text: "where gains and a net PSM share take the debt below zero, the touch mints the difference to the holder.",
      },
    ],
    links: [POLARIS_DOC_LINKS.interestRates, POLARIS_DOC_LINKS.pegDefence, POLARIS_DOC_LINKS.liquidations],
  };
}
