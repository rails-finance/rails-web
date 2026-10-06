// The Lifetime flows panel's Explanation lines and "?" for a Polaris CDP
// (lib/polaris/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Polaris").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { PolarisFlowFacts } from "@/lib/polaris/flows";
import { POLARIS_APP_LINK, POLARIS_DOC_LINKS } from "@/lib/polaris/docs-links";

export interface PolarisFlowsNoteProps {
  facts: PolarisFlowFacts | null;
  /** The market's stablecoin (USDp, GOLDp). */
  stable: string;
}

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

export function PolarisFlowsNote({ facts, stable }: PolarisFlowsNoteProps): ReactNode {
  const p = facts?.pricing;
  return (
    <div className="space-y-2" data-polaris-flows-note="" data-anatomy="F14·polaris">
      <p>
        Every figure is in {stable}, the market&apos;s stablecoin: this is a testnet, and nothing on it has a market
        price. Each pETH flow is converted at the market&apos;s own price feed at its block, the price the protocol
        holds the debt against, so on the collateral side the last line, Market move, is the change in that price since
        each flow.
      </p>
      <p>
        Each event states the CDP&apos;s collateral and debt after it and every part that changed them, so each part has
        a line of its own and the lines meet the recorded figures at every event. Interest (dashed) is charged on the
        recorded debt at the market&apos;s rate and written in at each event; between two events the debt grows by the
        next event&apos;s interest in a straight line, and after the last by the interest the live read states pending.
        The other parts also build up between events, but nothing states them until the next one: Reward pETH (dashed),
        the CDP&apos;s net share of every direct mint and redemption through the PSM since the last event (Net PSM
        shares added, taken or cleared, each side split by its sign), Stability gains (dashed), and Settled to zero, the{" "}
        {stable} the protocol mints where the shares took the debt below zero.
        {facts && facts.psmRows > 0 && ` ${n(facts.psmRows, "One event", "events")} wrote PSM shares in.`}
        {facts && facts.settledRows > 0 && ` ${n(facts.settledRows, "One event", "events")} settled the debt to zero.`}
      </p>
      {facts?.liquidated && (
        <p>
          The liquidation took the whole CDP: its collateral less the surplus is Liquidated (with the liquidator&apos;s
          compensation inside it), the surplus left for the owner is Surplus to claim, and the debt it cleared is
          Liquidated on the debt side.
        </p>
      )}
      {facts?.pendingToday && (
        <p>
          Today&apos;s figures are the live read: the parts built up since the last event are added to their lines at
          today, as the next event would write them in.
        </p>
      )}
      {p && (
        <p>
          {p.nearest + p.today > 0
            ? `${n(p.nearest + p.today, "One event takes", "events take")} the nearest recorded price in time, with no feed price read at ${p.nearest + p.today === 1 ? "its block" : "their blocks"}. `
            : ""}
          Polaris is not in the daily price store, so between events the collateral keeps the price of its latest event,
          and the last stop takes the feed&apos;s price at the latest block, the one the position card values it at.
        </p>
      )}
    </div>
  );
}

export function polarisFlowsContent(stable: string): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro: `The bars add up every change Polaris has made to this CDP, in ${stable}, and the line under them draws what it held and owed at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, plus reward pETH and the net PSM shares that added pETH, less withdrawn, less the net PSM shares that took pETH and what a liquidation took, each at the feed's price when it happened, plus the change in that price since (Market move), is what the CDP holds.",
      "Debt: borrowed, plus interest, the net PSM shares that added debt and any settlement to zero, less repaid, less stability gains, the net PSM shares that cleared debt and what a liquidation cleared, is what the CDP owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: `${stable} units`,
        text: "a testnet token has no market price, so the collateral is converted at the market's own price feed and every figure is in the market's stablecoin.",
      },
      {
        bold: "Interest at each event",
        text: "interest accrues continuously at the market's algorithmic rate and is written into the debt whenever the CDP is touched.",
      },
      {
        bold: "PSM shares",
        text: "when the market's PSM mints or redeems, every CDP takes a pro-rata share of the collateral and debt that moved. An event writes in the net of every mint and redemption since the last one, so its two sides can move in opposite directions; each side is split by its sign.",
      },
      {
        bold: "Settled to zero",
        text: "when a net PSM share clears more debt than the CDP owes, the protocol adds the difference back so the debt lands on zero.",
      },
    ],
    links: [
      POLARIS_DOC_LINKS.interestRates,
      POLARIS_DOC_LINKS.pegDefence,
      POLARIS_DOC_LINKS.liquidations,
      POLARIS_APP_LINK,
    ],
  };
}
