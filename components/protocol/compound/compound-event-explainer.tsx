"use client";

// The Explanation pane (zone Z2) of a Compound V3 event: the generator's
// sentences (lib/compound/event-prose.ts, its strings in
// content/compound/event-prose.yaml), one bullet each. The card shows the
// first as its teaser and this pane the rest; a grouped explanation has no
// teaser, every bullet sits under its group's heading. Each figure the header
// or the detail grid also prints echoes that receipt.
//
// Where the owner neither signed a supply nor provided its tokens, one read of
// the transaction settles whether a bundler sent a smart account's operation
// (app/api/chain/compound/tx-sender: a UserOperationEvent naming the account);
// the Bulker's address settles the other usual case (lib/compound/bulkers.ts).

import { useEffect, useState } from "react";
import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { externalActor } from "@/lib/shared/external-actor";
import { BASE_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { formatExactDecimal, formatNumber, formatUsdValue } from "@/lib/utils/format";
import {
  absorbCreditProv,
  absorbDebtClearedProv,
  absorbKeptProv,
  baseAfterProv,
  movedDeltaProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import { isCompoundBulker } from "@/lib/compound/bulkers";
import { compoundAbsorbSplit } from "@/lib/compound/row-facts";
import { useCometMarket } from "@/lib/compound/deployment-context";
import {
  compoundEventProse,
  compoundExplanationRuns,
  type CompoundEchoKey,
  type CompoundEvent,
  type CompoundEventProse,
  type CompoundProseInput,
} from "@/lib/compound/event-prose";

export interface CompoundEventExplainerProps {
  ctx: CompoundContext;
  event: CompoundEvent;
  txHash?: string;
  blockNumber?: number;
  /** Same-tx sibling events (defaults to just this one): the absorb-leg seam. */
  siblings?: CompoundEvent[];
}

/** The coords every figure cites: the same subset the header and detail build,
 *  so an explainer echo collapses onto their primary receipt. */
export function compoundEchoCoords(
  market: CometMarket,
  txHash?: string,
  blockNumber?: number,
  extra: Pick<CompoundCoords, "chainId" | "source"> = {},
): CompoundCoords {
  return { comet: market.comet, marketLabel: market.label, txHash, blockNumber, ...extra };
}

/** Where a third party sent the owner's supply: the sender, and how the
 *  tokens came. Null where the owner acted, and on every event but a supply. */
export function compoundExternal(
  ctx: CompoundContext,
  wallet: string,
  chainId: ChainId | undefined,
  smartAccount: boolean,
): CompoundProseInput["external"] {
  if (ctx.eventType !== "supply" && ctx.eventType !== "supply_collateral") return null;
  const actor = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.funder }, wallet);
  if (!actor || !ctx.funder) return null;
  return { actor, smartAccount, bulker: isCompoundBulker(ctx.funder, chainId) };
}

/** The header's and the detail grid's receipt each echoed figure registers
 *  against. */
export function compoundEchoFor(
  key: CompoundEchoKey,
  ctx: CompoundContext,
  coords: CompoundCoords,
  market: CometMarket,
): ProseEcho | null {
  const sym = ctx.assetSymbol;
  const signed = Number(ctx.assetsDelta);
  const signedDelta = Number.isFinite(signed) ? signed : 0;
  const split = compoundAbsorbSplit(ctx);
  switch (key) {
    case "delta": {
      const info = movedDeltaProv(ctx.eventType, sym, coords);
      return info ? { info, value: chainTruthDeltaValue(signedDelta, false), symbol: sym } : null;
    }
    case "base_after":
      return ctx.baseAfter != null
        ? {
            info: baseAfterProv(market.baseSymbol, coords),
            value: formatNumber(Number(ctx.baseAfter)),
            symbol: market.baseSymbol,
          }
        : null;
    case "cleared": {
      if (!split) return compoundEchoFor("delta", ctx, coords, market);
      return {
        info: absorbDebtClearedProv(sym, coords, {
          paidOut: formatExactDecimal(split.paidOut),
          before: formatExactDecimal(split.before),
        }),
        value: split.cleared,
        symbol: sym,
      };
    }
    case "credit":
      return split
        ? {
            info: absorbCreditProv(sym, coords, { paidOut: formatExactDecimal(split.paidOut) }),
            value: split.credit,
            symbol: sym,
          }
        : null;
    case "kept": {
      // The protocol's margin: the legs' valuation less the credit (or the
      // credit less the legs' valuation when the collateral fell short).
      const legs = ctx.absorbedCollateral;
      const creditedUsd = Number(ctx.usdValue);
      if (!split || !legs?.length || !Number.isFinite(creditedUsd)) return null;
      const seizedUsd = legs.reduce((s, l) => s + Number(l.usdValue), 0);
      return {
        info: absorbKeptProv(coords, {
          seizedUsd: formatUsdValue(seizedUsd),
          creditedUsd: formatUsdValue(creditedUsd),
        }),
        value: formatUsdValue(Math.abs(seizedUsd - creditedUsd)),
      };
    }
  }
}

/** Whether a bundler sent the wallet's signed operation, read from the
 *  transaction's receipt once, only where a third party sent a supply. */
function useSmartAccount(enabled: boolean, txHash: string | undefined, account: string, chainId?: ChainId): boolean {
  const [smart, setSmart] = useState(false);
  useEffect(() => {
    if (!enabled || !txHash) return;
    const ac = new AbortController();
    const deployment = chainId === BASE_CHAIN_ID ? "base" : "ethereum";
    fetch(`/api/chain/compound/tx-sender?deployment=${deployment}&tx=${txHash}&account=${account}`, {
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { userOpSender: string | null } | null) => setSmart(!!d?.userOpSender))
      .catch(() => {});
    return () => ac.abort();
  }, [enabled, txHash, account, chainId]);
  return smart;
}

/** The explanation draws its groups' headings. */
export const isGroupedExplanation = (prose: CompoundEventProse) => prose.L4.some((s) => s.group);

/** The card's teaser: the first sentence. */
export function CompoundExplainerTeaser({
  prose,
  echo,
}: {
  prose: CompoundEventProse;
  echo: (key: CompoundEchoKey) => ProseEcho | null;
}) {
  const lead = prose.L4[0];
  return lead ? <ProseSentenceText s={lead} echo={echo} /> : null;
}

export function CompoundEventExplainer({ ctx, event, txHash, blockNumber, siblings }: CompoundEventExplainerProps) {
  const market = useCometMarket(ctx.market);
  const chainId = useChainId();
  const coords = compoundEchoCoords(market, txHash, blockNumber, { chainId, source: useCaptureSource() });
  const third = compoundExternal(ctx, event.wallet, chainId, false);
  const smart = useSmartAccount(third != null, txHash, event.wallet, chainId);
  const prose = compoundEventProse({
    ctx,
    market,
    siblings: siblings ?? [event],
    self: event,
    external: compoundExternal(ctx, event.wallet, chainId, smart),
  });
  const echo = (key: CompoundEchoKey) => compoundEchoFor(key, ctx, coords, market);
  const sentence = (s: CompoundEventProse["L4"][number]) => <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;

  if (isGroupedExplanation(prose))
    return (
      <ProseExplainer
        items={compoundExplanationRuns(prose).flatMap((run) =>
          run.sentences.map((s) => ({ group: run.heading ?? "", node: sentence(s) })),
        )}
      />
    );
  return <ProseExplainer items={prose.L4.slice(1).map(sentence)} />;
}
