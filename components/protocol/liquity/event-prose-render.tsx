"use client";

// The page's side of the Liquity V2 event prose (lib/liquity/event-prose.ts):
// the hook that runs the generator against the page's replay, the sentence
// renderer that bolds a figure or attaches its receipt without changing a
// character, and the Copy for LLM build the event page's actions row copies.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { Prov } from "@/components/shared/provenance";
import { addressContext, LinkedAddress, railsPageTip } from "@/components/shared/linked-address";
import { LinkedValue } from "@/components/shared/linked-value";
import { useChainId } from "@/lib/shared/chain-context";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { useSurplusClaimFor } from "@/components/protocol/liquity-family/coll-surplus-context";
import { usePreferences } from "@/lib/shared/preferences-context";
import { liquityEventProse, type EchoKey, type LiquityEventProse, type ProseSentence } from "@/lib/liquity/event-prose";
import { liquityEventDecimals, liquityEventLedger } from "@/lib/liquity/event-ledgers";
import { liquityEventMarkdown } from "@/lib/liquity/event-markdown";
import { redeemerEventHref } from "@/lib/liquity-v2/redeemer-routes";
import { useTxTroves } from "@/lib/liquity-v2/tx-troves";
import {
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  redistArrivalProv,
  upfrontFeeProv,
  type EventCoords,
} from "@/lib/liquity/event-provenance";

type LiquityEvent = BaseActivityEvent & { context: { protocol: "liquity-v2-troves"; data: LiquityContext } };

/** The trove page's facts an event's Copy for LLM header names. */
export interface LiquityTroveMeta {
  owner: string | null;
  /** The trove's whole event count. */
  total: number;
  /** The branch's shutdown time (ui-jobs 612), where the page read one. */
  shutdownAt?: number | null;
}
export const LiquityTroveMetaContext = createContext<LiquityTroveMeta | null>(null);

/** The generator, run against the page's replay of this event. */
export function useLiquityEventProse(
  event: LiquityEvent,
  previousEvent: BaseActivityEvent | undefined,
  currentPrice: number | undefined,
): LiquityEventProse {
  const ctx = event.context.data;
  const focus = useFlowFocus();
  const claim = useSurplusClaimFor(ctx.operation === "liquidate" ? event.txHash : undefined);
  const model = focus?.model ?? null;
  const events = focus?.events;
  const ledger = events?.find((e) => e.id === event.id) ?? null;
  const claimedAt = claim ? claim.timestamp : undefined;
  const shutdownAt = useContext(LiquityTroveMetaContext)?.shutdownAt ?? null;
  return useMemo(
    () =>
      liquityEventProse({
        ctx,
        event,
        previousEvent,
        currentEvent: event,
        currentPrice,
        ledger,
        collDecimals: model && events ? liquityEventDecimals(model, events, event.id, "collateral") : null,
        debtDecimals: model && events ? liquityEventDecimals(model, events, event.id, "debt") : null,
        surplusClaimedAt: claimedAt,
        shutdownAt,
      }),
    [ctx, event, previousEvent, currentPrice, ledger, model, events, claimedAt, shutdownAt],
  );
}

function echoProv(key: EchoKey, ctx: LiquityContext, coords: EventCoords) {
  switch (key) {
    case "coll_change":
      return collChangeProv(ctx, coords);
    case "debt_change":
      return debtChangeProv(ctx, coords);
    case "rate_after":
      return rateAfterProv(ctx, coords);
    case "upfront_fee":
      return upfrontFeeProv(ctx, coords);
    case "redist_debt":
      return redistArrivalProv(ctx, "debt", coords);
    case "redist_coll":
      return redistArrivalProv(ctx, "coll", coords);
  }
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const Bold = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

/** The redemption sentence's "redeemer", linked to this redemption on the
 *  redeemer's page: the redemption's sender, as the redeemer note under the
 *  grid reads it (the same read, cached per transaction). A LinkedValue
 *  (anatomy L14) whose tooltip reads "Redeemer 0x12…34 →"; plain words until
 *  the redeemer is known. */
function RedeemerWord({
  ctx,
  txHash,
  eventId,
  children,
}: {
  ctx: LiquityContext;
  txHash?: string;
  eventId: string;
  children: string;
}) {
  const tx = useTxTroves(!ctx.redeemer && txHash ? txHash : "");
  const redeemer = ctx.redeemer ?? tx?.rows.find((r) => r.operation === "redeemCollateral")?.transaction_from;
  if (!redeemer) return <span>{children}</span>;
  const href = redeemerEventHref(redeemer, eventId);
  return (
    <LinkedValue
      href={href}
      tip={railsPageTip(href, shortAddr(redeemer))}
      label={children}
      className="text-blue-600 dark:text-[var(--text-link)] hover:underline"
      dataAttrs={{ "data-redeemer-link": "" }}
    >
      {children}
    </LinkedValue>
  );
}

/** One sentence: its text, with each figure bolded, echoed into its receipt,
 *  or linked as the generator marks it. */
export function ProseSentenceText({
  s,
  ctx,
  coords,
  eventId,
}: {
  s: ProseSentence;
  ctx: LiquityContext;
  coords: EventCoords;
  /** The event's id on the Trove's timeline, which the redeemer page's row shares. */
  eventId: string;
}) {
  const { prefs } = usePreferences();
  const chainId = useChainId();
  return (
    <>
      {s.segs.map((seg, i) => {
        if (seg.pair)
          return prefs.ratioMode === "ltv" ? (
            <span key={i}>
              {seg.pair.cr} (LTV <Bold>{seg.pair.ltv}</Bold>)
            </span>
          ) : (
            <span key={i}>
              <Bold>{seg.pair.cr}</Bold> (LTV {seg.pair.ltv})
            </span>
          );
        if (seg.address)
          return seg.tone === "manager" ? (
            // A batch manager wears the pink every delegate name wears
            // (liquity-head.tsx); its tooltip is LinkedAddress's.
            <LinkedValue
              key={i}
              explorer={{ chainId, kind: "address", value: seg.address }}
              context={addressContext(seg.address)}
              label={seg.text}
              className="text-pink-500 hover:text-pink-600 transition-colors"
            >
              {seg.text}
            </LinkedValue>
          ) : (
            <LinkedAddress key={i} address={seg.address} holderOf={seg.tone === "wallet" ? "liquity-v2" : undefined} />
          );
        if (seg.name === "redeemer")
          return (
            <RedeemerWord key={i} ctx={ctx} txHash={coords.txHash} eventId={eventId}>
              {seg.text}
            </RedeemerWord>
          );
        if (!seg.emph) return <span key={i}>{seg.text}</span>;
        if (seg.emph === "bold") return <Bold key={i}>{seg.text}</Bold>;
        const prov = echoProv(seg.emph, ctx, coords);
        if (!prov) return <Bold key={i}>{seg.text}</Bold>;
        return (
          <Prov
            key={i}
            echo
            info={prov.info}
            value={prov.value}
            symbol={"symbol" in prov ? (prov.symbol as string | undefined) : undefined}
          >
            <Bold>{seg.text}</Bold>
          </Prov>
        );
      })}
    </>
  );
}

/** The event's Copy for LLM block, built at the moment of the copy from the
 *  generator's levels and the page's ledgers. */
export function useLiquityEventMarkdown(
  prose: LiquityEventProse,
  event: LiquityEvent,
  eventNumber: number | undefined,
  shareHref: string | null,
): (() => string) | null {
  const focus = useFlowFocus();
  const meta = useContext(LiquityTroveMetaContext);
  if (!meta || eventNumber == null || !shareHref) return null;
  return () => {
    const model = focus?.model;
    const events = focus?.events;
    const ledgers =
      model && events
        ? {
            collateral: liquityEventLedger(model, events, event.id, "collateral"),
            debt: liquityEventLedger(model, events, event.id, "debt"),
          }
        : null;
    return liquityEventMarkdown(
      prose,
      {
        troveId: event.context.data.troveId,
        owner: meta.owner,
        n: eventNumber,
        total: meta.total,
        url: `${window.location.origin}${shareHref}`,
        timestamp: event.timestamp,
      },
      ledgers,
    );
  };
}
