"use client";

// Composer: wires the Asymmetry header / detail / explainer into the universal
// EventCard shell (the shared Liquity-fork explainer rides the second-tier
// slot). A Trove event moves two axes, so the spine can show two token flows
// (branch collateral + USDaf debt); a liquidation shows the critical warning
// spine, a redemption the caution one.

import type { BaseActivityEvent, AsymmetryContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import type { SpineValProv } from "@/components/shared/activity-timeline";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { LiquityForkEventHeader } from "@/components/protocol/liquity-fork/liquity-fork-event-header";
import { AsymmetryEventDetail } from "./asymmetry-event-detail";
import {
  LiquityForkEventExplainer,
  liquityForkLearnMoreContent,
} from "@/components/protocol/liquity-fork/liquity-fork-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { liquityForkExplainerTeaser } from "@/lib/shared/liquity-fork-explainer-clauses";
import {
  collDeltaProv,
  debtDeltaProv,
  collAfterProv,
  debtAfterProv,
  rateAtEventProv,
  batchManagerProv,
  atBlockPriceProv,
  upfrontFeeProv,
  accruedInterestProv,
  redemptionFeeKeptProv,
  redemptionActProv,
  emittedRedemptionPriceProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  type AsymmetryCoords,
} from "@/lib/asymmetry/event-provenance";
import { DEBT_SYMBOL } from "@/lib/asymmetry/asset-catalog";

// The one live-verified Asymmetry link.
const ASYMMETRY_FORK = {
  protocolName: "Asymmetry",
  stablecoin: DEBT_SYMBOL,
  docsLink: { label: "Asymmetry docs", url: "https://docs.asymmetry.finance" },
};

// The fork explainer's provenance builders — the figures in the prose echo
// these (same identities the header / detail grid register their primaries on).
const ASYMMETRY_EXPLAINER_PROVS = {
  collDeltaProv,
  debtDeltaProv,
  collAfterProv,
  debtAfterProv,
  rateAtEventProv,
  atBlockPriceProv,
  upfrontFeeProv,
  accruedInterestProv,
  redemptionFeeKeptProv,
  redemptionActProv,
  emittedRedemptionPriceProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
};

export interface AsymmetryEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "asymmetry"; data: AsymmetryContext } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

export function AsymmetryEventCard({ event, isFirst, isLast, eventNumber }: AsymmetryEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidate";
  const isRedemption = ctx.eventType === "redeemCollateral";
  // Both liquidation and redemption are adverse events the owner didn't initiate.
  // Liquidation is terminal (critical/red); redemption is routine adverse (caution).
  const isWarning = isLiq || isRedemption;
  // Zero-delta adjust — classified by the timeline transform (the single
  // source of truth for the predicate); spine shows the neutral glyph and the
  // header suppresses its sub-epsilon dust chip.
  const isNoChange = event.actionType === "adjustTrove_noChange";

  const collDelta = Number(ctx.collDelta) || 0;
  const debtDelta = Number(ctx.debtDelta) || 0;

  // The spine flanking value re-renders the header's change figure, so it
  // echoes into that receipt (LiquityForkEventHeader): open/adjust register a
  // BARE magnitude (each axis carries its own verb there), close and
  // applyPendingDebt register SIGNED. Coords + ops mirror the header's
  // construction exactly.
  const labeled =
    ctx.eventType === "openTrove" || ctx.eventType === "openTroveAndJoinBatch" || ctx.eventType === "adjustTrove";
  const coords: AsymmetryCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  const collProv: SpineValProv | undefined =
    collDelta !== 0
      ? {
          info: collDeltaProv(
            coords,
            { after: ctx.collAfter, before: ctx.collAfter != null ? Number(ctx.collAfter) - collDelta : null },
            ctx.origin?.coll,
          ),
          value: chainTruthDeltaValue(collDelta, labeled),
          symbol: ctx.collateralSymbol,
        }
      : undefined;
  const debtProv: SpineValProv | undefined =
    debtDelta !== 0
      ? {
          info: debtDeltaProv(
            coords,
            { after: ctx.debtAfter, before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debtDelta : null },
            ctx.origin?.debt,
          ),
          value: chainTruthDeltaValue(debtDelta, labeled),
          symbol: DEBT_SYMBOL,
        }
      : undefined;

  // direction "right" = token moves toward the protocol (collateral deposit / debt
  // repay), "left" = toward the wallet (collateral withdraw / debt draw).
  //
  // Each row also names its token's contract, taken from the event's own flows:
  // that is the address the transfer actually touched, and an address is the
  // only thing an icon CDN can be asked about. Asymmetry's branches are a short
  // fixed list, so the symbol lookup already works here — but a branch added
  // tomorrow would draw as a letter until someone remembered the house table,
  // and this removes that dependency. Two flows sharing one symbol resolve to
  // nothing, because guessing between them is the mistake the letter avoids.
  const tokens = isWarning
    ? undefined
    : (
        [
          collDelta !== 0
            ? {
                symbol: ctx.collateralSymbol,
                address: soleFlowAddress(event.flows, ctx.collateralSymbol),
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
  ) : isNoChange ? (
    <SpineColumn icon="no-change" isFirst={isFirst} isLast={!!isLast} />
  ) : (
    <SpineColumn tokens={tokens && tokens.length > 0 ? tokens : undefined} isFirst={isFirst} isLast={!!isLast} />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <LiquityForkEventHeader
          actionLabel={event.actionLabel}
          noChange={isNoChange}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          builders={{ debtSymbol: DEBT_SYMBOL, collDeltaProv, debtDeltaProv, rateAtEventProv, batchManagerProv }}
          flows={event.flows}
        />
      }
      detail={<AsymmetryEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />}
      detailLabel="Trove state"
      explainer={
        <LiquityForkEventExplainer
          ctx={ctx}
          fork={ASYMMETRY_FORK}
          builders={ASYMMETRY_EXPLAINER_PROVS}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={liquityForkExplainerTeaser(ctx, coords, ASYMMETRY_FORK, ASYMMETRY_EXPLAINER_PROVS)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={liquityForkLearnMoreContent(ctx, ASYMMETRY_FORK)} />}
      persistKey={`asymmetry:${event.id}`}
    />
  );
}
