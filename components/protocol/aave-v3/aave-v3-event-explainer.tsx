"use client";

// Plain-English explainer for an Aave V3 event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/aave-v3/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-echoed against the header / detail (and, on a liquidation, the
// forensics block).

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { V3Coords } from "@/lib/aave-v3/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  aaveV3SupplyWithdrawContent,
  aaveV3BorrowRepayContent,
  aaveV3LiquidationContent,
  aaveV3BadDebtContent,
  aaveV3TransferContent,
  aaveV3EventFallbackContent,
  aaveV3RepayWithCollateralContent,
  aaveV3WithdrawAndSwapContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { aaveV3EventSlots, v3StateRead } from "@/lib/aave-v3/explainer-clauses";
import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import type { AaveV3Neighbours, AaveV3TimelineEvent } from "@/lib/aave-v3/event-neighbours";
import { feeLiquidation } from "@/lib/aave-v3/liquidation-fee";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import type { V3Protocol } from "@/lib/aave-v3/protocol-name";

export interface AaveV3EventExplainerProps {
  ctx: AaveV3Context;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** The position's owner: the third-party line keys on it. */
  owner?: string;
  /** The Ethereum market key; with it the prose reads the position state the
   *  open card reads (health factor, collateral flag), one shared request. */
  market?: string;
  /** This transaction's rows (a liquidation and its fee transfer). */
  siblings?: AaveV3TimelineEvent[];
  /** The previous transaction, to say how the health factor moved between events. */
  previous?: AaveV3Neighbours["previous"];
  /** The event's own time (unix seconds). */
  timestamp?: number;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Aave V3 explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). `protocol` is the page's Pool's — Seamless
 *  gets the same mechanics under its own name. */
export function aaveV3LearnMoreContent(ctx: AaveV3Context, protocol: V3Protocol = "Aave V3"): LearnMoreContent {
  switch (ctx.eventType) {
    case "supply":
    case "withdraw":
      return aaveV3SupplyWithdrawContent(ctx.eventType, protocol);
    case "borrow":
    case "repay":
      return aaveV3BorrowRepayContent(ctx.eventType, protocol);
    // (A liquidation's fee transfer passes its liquidation here.)
    case "liquidation":
      return aaveV3LiquidationContent(protocol);
    case "bad_debt_written_off":
      return aaveV3BadDebtContent(protocol);
    case "transfer_in":
    case "transfer_out":
      return aaveV3TransferContent(protocol);
    // The two ParaSwap adapter kinds have their own modals; the other swap
    // kinds and routes keep the general one.
    case "swap":
      if (ctx.swap?.route === "paraswap" && ctx.swap.kind === "repay_with_collateral")
        return aaveV3RepayWithCollateralContent();
      if (ctx.swap?.route === "paraswap" && ctx.swap.kind === "withdraw_and_swap")
        return aaveV3WithdrawAndSwapContent();
      return aaveV3EventFallbackContent(protocol);
    default:
      return aaveV3EventFallbackContent(protocol);
  }
}

export function AaveV3EventExplainer({
  ctx,
  txHash,
  blockNumber,
  skipLead,
  owner,
  market,
  siblings,
  previous,
  timestamp,
}: AaveV3EventExplainerProps) {
  const chainId = useChainId();
  const coords: V3Coords = {
    txHash,
    blockNumber,
    chainId,
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  const feeOf = feeLiquidation(ctx, siblings, chainId);
  // The same reads the open card makes (module-scope cache, one request each):
  // around this transaction, and around the previous one.
  const here = useAaveV3PositionState({
    wallet: owner,
    market: feeOf ? undefined : market,
    block: blockNumber,
    txHash,
  });
  const before = useAaveV3PositionState({
    wallet: owner,
    market: feeOf ? undefined : market,
    block: previous?.blockNumber,
    txHash: previous?.txHash,
  });
  const state = v3StateRead(
    ctx,
    here?.status === "ready" ? here.data : undefined,
    before?.status === "ready" ? before.data : undefined,
  );
  const clauses = eventClauses(
    aaveV3EventSlots(ctx, coords, { owner, siblings, state, previousEvent: previous?.event, timestamp }),
  );
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
