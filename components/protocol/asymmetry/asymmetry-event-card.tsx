"use client";

// Composer: wires the Asymmetry header / detail / explainer into the universal
// EventCard shell (the shared Liquity-fork explainer rides the second-tier
// slot). A Trove event moves two axes, so the spine can show two token flows
// (branch collateral + USDaf debt); a liquidation shows the critical warning
// spine, a redemption the caution one.

import { forkDebtMove, FORK_DEBT_DUST_FLOAT, forkCollMove } from "@/lib/shared/liquity-fork-ops";
import type { BaseActivityEvent, AsymmetryContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { InLedgerFigures } from "@/components/shared/event-ledger-context";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";

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
  liquidationLegProv,
  collRatioProv,
  costPerYearProv,
  batchFeeShareProv,
  redistProv,
  liqPenaltyProv,
  type AsymmetryCoords,
} from "@/lib/asymmetry/event-provenance";
import { DEBT_SYMBOL, ASYMMETRY_DOCS, MIN_DEBT } from "@/lib/asymmetry/asset-catalog";

// The general Asymmetry docs link plus the question-level docs links per card
// topic (ASYMMETRY_DOCS — read and verified against docs.asymmetry.finance,
// 2026-09-28, Miles's OK).
export const ASYMMETRY_FORK = {
  protocolName: "Asymmetry",
  stablecoin: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  docsLink: { label: "Asymmetry docs", url: "https://docs.asymmetry.finance" },
  docsByTopic: ASYMMETRY_DOCS,
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
  liquidationLegProv,
  collRatioProv,
  costPerYearProv,
  batchFeeShareProv,
  redistProv,
  liqPenaltyProv,
};

export interface AsymmetryEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "asymmetry"; data: AsymmetryContext } };
  isLast?: boolean;
  eventNumber?: number;
}

export function AsymmetryEventCard({ event, isLast, eventNumber }: AsymmetryEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidate";
  const isRedemption = ctx.eventType === "redeemCollateral";
  // Both liquidation and redemption are adverse events the owner didn't initiate.
  // Liquidation is terminal (critical/red); a redemption changes the Trove
  // without the owner acting (caution/orange, color-grammar.md §5).
  const isWarning = isLiq || isRedemption;
  // Zero-delta adjust — classified by the timeline transform (the single
  // source of truth for the predicate); spine shows the neutral glyph and the
  // header suppresses its sub-epsilon dust chip.
  const isNoChange = event.actionType === "adjustTrove_noChange";

  // The collateral the act moved; a redistribution landing on the same touch
  // is the header's own figure and moves no token, so the spine leaves it out.
  const collDelta = forkCollMove(ctx);
  // The debt the act moved (TroveOperation), the figure the header states.
  const debtDelta = forkDebtMove(ctx).value;

  const debtMoved = Math.abs(debtDelta) >= FORK_DEBT_DUST_FLOAT;

  const coords: AsymmetryCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };

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
              }
            : null,
          debtMoved
            ? {
                symbol: DEBT_SYMBOL,
                address: soleFlowAddress(event.flows, DEBT_SYMBOL),
                direction: debtDelta > 0 ? ("left" as const) : ("right" as const),
                value: Math.abs(debtDelta),
              }
            : null,
        ] as (SpineTokenRow | null)[]
      ).filter((t): t is SpineTokenRow => t !== null);

  const iconSlot = isWarning ? (
    <SpineColumn icon="warning" warningTone={isLiq ? "critical" : "caution"} isLast={!!isLast} />
  ) : isNoChange ? (
    <SpineColumn icon="no-change" isLast={!!isLast} />
  ) : (
    <SpineColumn tokens={tokens && tokens.length > 0 ? tokens : undefined} isLast={!!isLast} />
  );

  return (
    <LiquityLedgerProvider eventId={event.id} eventTs={event.timestamp}>
      <EventCard
        // A batch manager moved the rate: not the owner's act.
        byOwner={ctx.eventType === "setBatchManagerAnnualInterestRate" ? false : undefined}
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
            builders={{
              debtSymbol: DEBT_SYMBOL,
              collDeltaProv,
              debtDeltaProv,
              rateAtEventProv,
              batchManagerProv,
              batchFeeShareProv,
              redistProv,
              minDebt: MIN_DEBT,
            }}
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
            // The owner's transactions only: a redeemer, a liquidator or a
            // batch manager paid for theirs.
            gas={isWarning || ctx.batchRate ? undefined : event.gas}
          />
        }
        explainerTeaser={
          liquityForkExplainerTeaser(ctx, coords, ASYMMETRY_FORK, ASYMMETRY_EXPLAINER_PROVS) ? (
            <InLedgerFigures
              build={() => liquityForkExplainerTeaser(ctx, coords, ASYMMETRY_FORK, ASYMMETRY_EXPLAINER_PROVS)}
            />
          ) : null
        }
        txHash={event.txHash}
        learnMore={<LearnMore inline content={liquityForkLearnMoreContent(ctx, ASYMMETRY_FORK)} />}
        persistKey={`asymmetry:${event.id}`}
      />
    </LiquityLedgerProvider>
  );
}
