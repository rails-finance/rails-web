"use client";

// Plain-English explainer for a Polaris event — a layman set of bullets
// composed from state-keyed clauses in lib/polaris/explainer-clauses.tsx, plus
// the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST
// (skipLead), so the first sentence is never duplicated.

import type { GasCost, PolarisContext } from "@/lib/shared/types/event-shape";
import type { PolarisCoords } from "@/lib/polaris/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { polarisCdpContent, polarisLiquidationContent, polarisTransferContent } from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { polarisEventSlots, polarisGasClause } from "@/lib/polaris/explainer-clauses";

export interface PolarisEventExplainerProps {
  ctx: PolarisContext;
  txHash?: string;
  blockNumber?: number;
  /** This transaction's gas cost — the trailing clause. Passed only for the
   *  holder's own touches; the card withholds it on a liquidation (the
   *  liquidator sent it) and on a transfer (whoever moved the NFT paid). */
  gas?: GasCost;
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never empty. */
export function polarisLearnMoreContent(ctx: PolarisContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "liquidate":
      return polarisLiquidationContent();
    case "transfer":
      return polarisTransferContent();
    default:
      return polarisCdpContent();
  }
}

export function PolarisEventExplainer({ ctx, txHash, blockNumber, gas, skipLead }: PolarisEventExplainerProps) {
  const coords: PolarisCoords = { txHash, blockNumber, market: ctx.market, cdpId: ctx.cdpId };
  const clauses = eventClauses(polarisEventSlots(ctx, coords));
  // Gas rides last, after the arc — never the lead, so skipLead removes
  // exactly the teaser sentence and the gas clause always survives.
  const gasClause = gas ? polarisGasClause(gas) : null;
  const withGas = gasClause ? [...clauses, gasClause] : clauses;
  const items = composeBullets(skipLead ? splitLead(withGas).rest : withGas);
  return <ProseExplainer items={items} />;
}
