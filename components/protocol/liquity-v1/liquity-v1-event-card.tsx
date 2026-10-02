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
import { COLLATERAL_SYMBOL, DEBT_SYMBOL, LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import { LIQUITY_V1_RESERVE } from "@/lib/liquity-v1/event-figures";
import { collDeltaProv, debtDeltaProv, closeRepaidProv } from "@/lib/liquity-v1/event-provenance";
import type { LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { InLedgerFigures } from "@/components/shared/event-ledger-context";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";

export interface LiquityV1EventCardProps {
  event: BaseActivityEvent & { context: { protocol: "liquity-v1"; data: LiquityV1Context } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** The PriceFeed price now — a redemption's net outcome at today's price. */
  currentPrice?: number | null;
  /** On a liquidation, what the Trove's life left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
}

export function LiquityV1EventCard({
  event,
  isFirst,
  isLast,
  eventNumber,
  currentPrice,
  ownerOutcome,
}: LiquityV1EventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
  const isRedemption = ctx.eventType === "redemption";
  // Both liquidation and redemption are adverse events the owner didn't initiate —
  // they take the dotted warning spine (a passive loss), not token flows.
  // Liquidation is terminal (critical/red); a redemption changes the Trove
  // without the owner acting (caution/orange, color-grammar.md §5), matching
  // Liquity V2.
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
  // A close burns the debt less the 200 LUSD reserve from the owner; the
  // GasPool burns the reserve. The spine draws what left the owner's wallet.
  const isClose = ctx.eventType === "closeTrove";
  const debtSpineValue = isClose ? Math.max(0, Math.abs(debtDelta) - LIQUITY_V1_RESERVE) : Math.abs(debtDelta);
  const debtProv: SpineValProv | undefined =
    debtDelta !== 0 && !isClose
      ? {
          info: debtDeltaProv(coords, {
            after: ctx.debtAfter,
            before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debtDelta : null,
          }),
          value: chainTruthDeltaValue(debtDelta, labeled),
          symbol: DEBT_SYMBOL,
        }
      : debtDelta !== 0 && isClose
        ? {
            info: closeRepaidProv(coords, ctx.debtBefore),
            value: chainTruthDeltaValue(-debtSpineValue, false),
            symbol: DEBT_SYMBOL,
          }
        : undefined;

  // direction "right" = token moves toward the protocol (collateral deposit / debt
  // repay), "left" = toward the wallet (collateral withdraw / debt draw).
  //
  // The debt row names LUSD's contract from the catalog, so the
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
                address: LIQUITY_V1_ADDRESSES.LUSD,
                direction: debtDelta > 0 ? ("left" as const) : ("right" as const),
                value: debtSpineValue,
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

  // The Collateral and Debt cells open into their ledgers where the page ties
  // its timeline to the Lifetime flows panel.
  return (
    <LiquityLedgerProvider eventId={event.id} eventTs={event.timestamp}>
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
          />
        }
        detail={
          <LiquityV1EventDetail
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            wallet={event.wallet}
            currentPrice={currentPrice}
          />
        }
        detailLabel="Trove state"
        explainer={
          <LiquityV1EventExplainer
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            wallet={event.wallet}
            currentPrice={currentPrice}
            ownerOutcome={isLiq ? ownerOutcome : null}
            gas={event.gas}
            skipLead
          />
        }
        explainerLabel="Plain English"
        explainerTeaser={
          liquityV1ExplainerTeaser(ctx, coords) ? (
            <InLedgerFigures build={() => liquityV1ExplainerTeaser(ctx, coords)} />
          ) : null
        }
        txHash={event.txHash}
        learnMore={<LearnMore inline content={liquityV1LearnMoreContent(ctx)} />}
        persistKey={`liquity-v1:${event.id}`}
      />
    </LiquityLedgerProvider>
  );
}
