"use client";

// Plain-English explainer for an Aave V4 event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/aave-v4/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-traced (an echo of the header / detail receipt, or — on the
// first event of a multi-action transaction — a primary for a sibling event's
// figure that lives beyond this card's scope).

import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import type { GasCost } from "@/lib/shared/types/activity";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  aaveV4LiquidationContent,
  aaveV4SupplyContent,
  aaveV4BorrowContent,
  aaveV4CollateralToggleContent,
  aaveV4EventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { formatGasCost } from "@/lib/shared/format-event";
import {
  clause,
  composeBullets,
  eventClauses,
  splitLead,
  ProseExplainer,
  type ClauseInput,
} from "@/lib/shared/explainer-prose";
import { aaveV4EventSlots, coordsFor, type AaveV4Event } from "@/lib/aave-v4/explainer-clauses";

export interface AaveV4EventExplainerProps {
  ctx: AaveV4Context;
  event: AaveV4Event;
  /** Same-transaction sibling events (defaults to just this one) — the seam the
   *  combined-act narration and cross-reference clauses read. */
  siblings?: AaveV4Event[];
  /** This transaction's gas cost — rendered as the trailing explainer clause. */
  gas?: GasCost;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Aave V4 explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). */
export function aaveV4LearnMoreContent(ctx: AaveV4Context): LearnMoreContent {
  switch (ctx.eventType) {
    case "liquidation":
      return aaveV4LiquidationContent(ctx.spokeName);
    case "supply":
    case "withdraw":
      return aaveV4SupplyContent();
    case "borrow":
    case "repay":
      return aaveV4BorrowContent();
    case "collateral_toggle":
      return aaveV4CollateralToggleContent();
    default:
      return aaveV4EventFallbackContent();
  }
}

export function AaveV4EventExplainer({ ctx, event, siblings, gas, skipLead }: AaveV4EventExplainerProps) {
  const coord = coordsFor(event);
  const clauses = eventClauses(aaveV4EventSlots(ctx, coord, siblings ?? [event], event));
  // Per-transaction gas as the closing clause (muted — not a header/grid value,
  // so it stays in the body tone). Appended after the arc so it always reads
  // last, regardless of the teaser/skipLead split.
  const gasClause: ClauseInput =
    gas && gas.gasCostEth > 0 ? clause(<>This transaction cost {formatGasCost(gas)} in gas.</>) : null;
  const withGas = gasClause ? [...clauses, gasClause] : clauses;
  const items = composeBullets(skipLead ? splitLead(withGas).rest : withGas);

  return <ProseExplainer items={items} />;
}
