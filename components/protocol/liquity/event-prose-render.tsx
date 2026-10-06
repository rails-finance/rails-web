"use client";

// The page's side of the Liquity V2 event prose (lib/liquity/event-prose.ts):
// the hook that runs the generator against the page's replay, the sentence
// renderer that bolds a figure or attaches its receipt without changing a
// character, and the Copy for LLM button of the event page's actions row.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { Prov } from "@/components/shared/provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { useSurplusClaimFor } from "@/components/protocol/liquity-family/coll-surplus-context";
import { usePreferences } from "@/lib/shared/preferences-context";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { useMenuCopied } from "@/components/shared/event-card-menu";
import { liquityEventProse, type EchoKey, type LiquityEventProse, type ProseSentence } from "@/lib/liquity/event-prose";
import { liquityEventDecimals, liquityEventLedger } from "@/lib/liquity/event-ledgers";
import { liquityEventMarkdown } from "@/lib/liquity/event-markdown";
import { COPY_WORDS } from "@/lib/liquity/event-templates";
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
      }),
    [ctx, event, previousEvent, currentPrice, ledger, model, events, claimedAt],
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

const Bold = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

/** One sentence: its text, with each figure bolded, echoed into its receipt,
 *  or linked as the generator marks it. */
export function ProseSentenceText({ s, ctx, coords }: { s: ProseSentence; ctx: LiquityContext; coords: EventCoords }) {
  const { prefs } = usePreferences();
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
            <a
              key={i}
              href={explorerUrl(MAINNET_CHAIN_ID, "address", seg.address)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-pink-500 hover:text-pink-600 transition-colors"
            >
              {seg.text}
            </a>
          ) : (
            <LinkedAddress key={i} address={seg.address} />
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

/** The event's Copy for LLM build (`useLiquityEventMarkdown`), from the card
 *  (`LiquityEventCard`) to the event page's side column, which renders inside
 *  it. Null outside the event page or before the build can run. */
export const LiquityEventMarkdownContext = createContext<(() => string) | null>(null);

/** "Copy for LLM", on the event page's actions row. It copies the event's raw
 *  Markdown route (`href`, the page's URL with `.md`), so a copy taken before
 *  the page's replay lands is the whole text; where the read fails it copies
 *  the page's build. */
export function CopyForLlmButton({ href, build, className }: { href: string; build: () => string; className: string }) {
  const [copied, copy] = useMenuCopied();
  const read = () =>
    fetch(href, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .catch(() => build());
  return (
    <button
      type="button"
      className={className}
      title={COPY_WORDS.button_label}
      data-menu-item="copy-for-llm"
      data-copied={copied ? "" : undefined}
      onClick={() => copy("llm", read())}
    >
      {copied ? COPY_WORDS.copied : COPY_WORDS.button}
    </button>
  );
}
