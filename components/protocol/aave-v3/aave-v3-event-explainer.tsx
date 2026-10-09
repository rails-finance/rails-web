"use client";

// The Explanation pane (zone Z2) of an Aave V3 event, on Ethereum, Base and
// Seamless: the generator's sentences (lib/aave-v3/event-prose.ts, its strings
// in content/aave-v3/event-prose.yaml), one bullet each, under the three event
// headings when two of them hold two or more bullets. Each figure the header
// or the liquidation's legs also print echoes that receipt. The health factor
// and rate sentences read the position state the open card reads, so the card
// passes this pane as its body with no teaser.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import {
  assetsDeltaProv,
  debtRepaidProv,
  seizedCollateralProv,
  swapLegNet,
  swapLegProv,
  swapLegSign,
  transferDeltaProv,
  writtenOffDebtProv,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import { aaveV3EventProse, aaveV3ExplanationRuns, type AaveV3EchoKey } from "@/lib/aave-v3/event-prose";
import { v3StateRead } from "@/lib/aave-v3/event-state";
import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import type { AaveV3Neighbours, AaveV3TimelineEvent } from "@/lib/aave-v3/event-neighbours";
import { feeLiquidation } from "@/lib/aave-v3/liquidation-fee";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { v3Protocol, type V3Protocol } from "@/lib/aave-v3/protocol-name";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export interface AaveV3EventExplainerProps {
  ctx: AaveV3Context;
  txHash?: string;
  blockNumber?: number;
  /** The position's owner: the third-party sentences key on it. */
  owner?: string;
  /** The served market key; with it the pane reads the position state the
   *  open card reads (health factor, collateral flag, rates). */
  market?: string;
  /** This transaction's rows (a liquidation and its fee transfer). */
  siblings?: AaveV3TimelineEvent[];
  /** The previous transaction. */
  previous?: AaveV3Neighbours["previous"];
  /** The event's time (unix seconds). */
  timestamp?: number;
}

/** The event's "?" modal: it depends on the event's kind, a swap's venue and
 *  the Pool's protocol. A liquidation's fee transfer passes its liquidation. */
export function aaveV3LearnMoreContent(
  ctx: AaveV3Context,
  protocol: V3Protocol,
  chainId: ChainId = MAINNET_CHAIN_ID,
  siblings?: readonly AaveV3TimelineEvent[],
): LearnMoreContent {
  return aaveV3EventProse({ ctx, protocol, chainId, siblings }).L5.content;
}

/** The signed reserve delta this event moved, as the header signs it. */
const signedDelta = (ctx: AaveV3Context): number => {
  const mag = Math.abs(Number(ctx.amount ?? "0")) || 0;
  const neg =
    ctx.eventType === "withdraw" ||
    ctx.eventType === "repay" ||
    ctx.eventType === "transfer_out" ||
    ctx.eventType === "bad_debt_written_off";
  return (neg ? -1 : 1) * mag;
};

/** The receipt each echoed figure registers against: the header's delta, the
 *  swap's legs, the liquidation's legs. */
function echoFor(key: AaveV3EchoKey, ctx: AaveV3Context, coords: V3Coords): ProseEcho | null {
  const sym = ctx.reserveSymbol ?? "";
  const s = ctx.swap;
  switch (key) {
    case "amount": {
      const side = ctx.eventType === "borrow" || ctx.eventType === "repay" ? "debt" : "supply";
      return {
        info: assetsDeltaProv(sym, side, coords, ctx.raw?.amount, ctx.origin?.amount),
        value: chainTruthDeltaValue(signedDelta(ctx), false),
        symbol: sym,
      };
    }
    case "transfer":
      return {
        info: transferDeltaProv(sym, ctx.eventType === "transfer_in" ? "in" : "out", coords),
        value: chainTruthDeltaValue(signedDelta(ctx), false),
        symbol: sym,
      };
    case "written_off":
      return {
        info: writtenOffDebtProv(sym, coords, ctx.raw?.amount, ctx.origin?.amount),
        value: chainTruthDeltaValue(-(Math.abs(Number(ctx.amount ?? "0")) || 0), false),
        symbol: sym,
      };
    case "seized": {
      const coll = ctx.collateralSymbol ?? "";
      return {
        info: seizedCollateralProv(
          coll,
          coords,
          ctx.raw?.liquidatedCollateralAmount,
          ctx.origin?.liquidatedCollateralAmount,
        ),
        value: chainTruthDeltaValue(-Number(ctx.liquidatedCollateralAmount), false),
        symbol: coll,
      };
    }
    case "cleared":
      return {
        info: debtRepaidProv(sym, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover),
        value: chainTruthDeltaValue(-Number(ctx.debtToCover), false),
        symbol: sym,
      };
    case "given":
      if (!s) return null;
      return {
        info: swapLegProv(
          sym,
          s.givenAction,
          coords,
          ctx.raw?.amount,
          ctx.origin?.amount,
          s.kind,
          swapLegNet(s, "given"),
          s,
        ),
        value: chainTruthDeltaValue(swapLegSign(s.givenAction) * (Math.abs(Number(ctx.amount ?? "0")) || 0), false),
        symbol: sym,
      };
    case "received": {
      if (!s) return null;
      const rSym = s.receivedSymbol ?? "";
      return {
        info: swapLegProv(
          rSym,
          s.receivedAction,
          coords,
          s.raw.receivedAmount,
          s.receivedOrigin,
          s.kind,
          swapLegNet(s, "received"),
          s,
        ),
        value: chainTruthDeltaValue(
          swapLegSign(s.receivedAction, s.kind) * (Math.abs(Number(s.receivedAmount ?? "0")) || 0),
          false,
        ),
        symbol: rSym,
      };
    }
    case "back": {
      const back = s?.events?.find((e) => e.leftover);
      if (!back) return null;
      return {
        info: assetsDeltaProv(
          back.symbol ?? sym,
          back.action === "supply" ? "supply" : "debt",
          coords,
          back.raw,
          back.origin,
        ),
        value: String(Math.abs(Number(back.amount ?? "0"))),
        symbol: back.symbol,
      };
    }
  }
}

export function AaveV3EventExplainer({
  ctx,
  txHash,
  blockNumber,
  owner,
  market,
  siblings,
  previous,
  timestamp,
}: AaveV3EventExplainerProps) {
  const chainId = useChainId();
  const pool = useV3Pool();
  const coords: V3Coords = { txHash, blockNumber, chainId, source: useCaptureSource(), pool };
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
  const prose = aaveV3EventProse({
    ctx,
    protocol: v3Protocol(pool),
    chainId,
    state,
    owner,
    siblings,
    previousEvent: previous?.event,
    timestamp,
  });
  const echo = (key: AaveV3EchoKey) => echoFor(key, ctx, coords);
  const items = aaveV3ExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  return <ProseExplainer items={items} />;
}
