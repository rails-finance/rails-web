"use client";

// Composer: wires the Liquity V1 header / detail / explainer into the universal
// EventCard shell (chain-replayed values carry the chain-state baseline; the
// plain-English explainer rides its own second-tier slot). A Trove event moves
// two axes, so the spine can show two token flows (ETH collateral + LUSD debt);
// a liquidation / redemption shows the warning spine instead.

import type { BaseActivityEvent, LiquityV1Context } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import type { SpineValProv } from "@/components/shared/activity-timeline";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { LiquityV1EventHeader } from "./liquity-v1-event-header";
import { LiquityV1EventDetail } from "./liquity-v1-event-detail";
import { LiquityV1EventExplainer, liquityV1LearnMoreContent } from "./liquity-v1-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { liquityV1ExplainerTeaser } from "@/lib/liquity-v1/explainer-clauses";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { collDeltaProv, debtDeltaProv } from "@/lib/liquity-v1/event-provenance";

export interface LiquityV1EventCardProps {
  event: BaseActivityEvent & { context: { protocol: "liquity-v1"; data: LiquityV1Context } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

export function LiquityV1EventCard({ event, isFirst, isLast, eventNumber }: LiquityV1EventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
  const isRedemption = ctx.eventType === "redemption";
  // Both liquidation and redemption are adverse events the owner didn't initiate —
  // they take the dotted warning spine (a passive loss), not token flows.
  // Liquidation is terminal (critical/red); redemption is routine adverse
  // (caution/orange), matching Liquity V2's spine tones.
  const isWarning = isLiq || isRedemption;

  const collDelta = Number(ctx.collDelta) || 0;
  const debtDelta = Number(ctx.debtDelta) || 0;

  // The spine flanking value re-renders the header's change figure, so it
  // echoes into that receipt (LiquityV1EventHeader): open/adjust register a
  // BARE magnitude (each axis carries its own verb there), close registers
  // SIGNED. Coords + ops mirror the header's construction exactly.
  const labeled = ctx.eventType === "openTrove" || ctx.eventType === "adjustTrove";
  const coords = { txHash: event.txHash, blockNumber: event.blockNumber };
  const collProv: SpineValProv | undefined =
    collDelta !== 0
      ? {
          info: collDeltaProv(coords, {
            after: ctx.collAfter,
            before: ctx.collAfter != null ? Number(ctx.collAfter) - collDelta : null,
          }),
          value: chainTruthDeltaValue(collDelta, labeled),
          symbol: COLLATERAL_SYMBOL,
        }
      : undefined;
  const debtProv: SpineValProv | undefined =
    debtDelta !== 0
      ? {
          info: debtDeltaProv(coords, {
            after: ctx.debtAfter,
            before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debtDelta : null,
          }),
          value: chainTruthDeltaValue(debtDelta, labeled),
          symbol: DEBT_SYMBOL,
        }
      : undefined;

  // direction "right" = token moves toward the protocol (collateral deposit / debt
  // repay), "left" = toward the wallet (collateral withdraw / debt draw).
  //
  // The debt row names LUSD's contract, read off the event's own flows, so the
  // icon chip has an address to ask a CDN about rather than a symbol to look up
  // in the house table. The collateral row deliberately does not: V1's
  // collateral is native ETH, which has no ERC-20 to name, and the flow records
  // the 0xEee… sentinel that stands in for it. Passing a sentinel as if it were
  // a contract would send the chip to two CDNs that cannot answer. ETH already
  // resolves from the curated local mark, which is the correct source for it.
  const tokens = isWarning
    ? undefined
    : (
        [
          collDelta !== 0
            ? {
                symbol: COLLATERAL_SYMBOL,
                direction: collDelta > 0 ? ("right" as const) : ("left" as const),
                value: Math.abs(collDelta),
                prov: collProv,
              }
            : null,
          debtDelta !== 0
            ? {
                symbol: DEBT_SYMBOL,
                address: soleFlowAddress(event.flows, DEBT_SYMBOL),
                direction: debtDelta > 0 ? ("left" as const) : ("right" as const),
                value: Math.abs(debtDelta),
                prov: debtProv,
              }
            : null,
        ] as (SpineTokenRow | null)[]
      ).filter((t): t is SpineTokenRow => t !== null);

  const iconSlot = isWarning ? (
    <SpineColumn
      icon="warning"
      warningTone={isLiq ? "critical" : "caution"}
      warningLabel={isLiq ? "Liquidation" : "Redemption"}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn tokens={tokens && tokens.length > 0 ? tokens : undefined} isFirst={isFirst} isLast={!!isLast} />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <LiquityV1EventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          flows={event.flows}
        />
      }
      detail={<LiquityV1EventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />}
      detailLabel="Trove state"
      explainer={<LiquityV1EventExplainer ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} skipLead />}
      explainerLabel="Plain English"
      explainerTeaser={liquityV1ExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={liquityV1LearnMoreContent(ctx)} />}
      persistKey={`liquity-v1:${event.id}`}
    />
  );
}
