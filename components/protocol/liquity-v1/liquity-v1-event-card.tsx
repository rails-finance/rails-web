"use client";

// The Liquity V1 event card on the shared shell's slots (rails-ops
// reference/shared-event-card-spec.md §3; ui-jobs 309 step 5). A Trove event
// moves two axes, so the spine can show two token flows (ETH collateral + LUSD
// debt); a liquidation / redemption shows the warning spine instead. T2 waits
// on the receipt read, which starts when the card opens (`useOpened`).

import type { BaseActivityEvent, LiquityV1Context } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";

import { liquityV1HeadSpec } from "./liquity-v1-event-header";
import { LIQUITY_V1_CELL_HEADS, useLiquityV1Opened } from "./liquity-v1-event-detail";
import { LiquityV1EventExplainer, liquityV1LearnMoreContent } from "./liquity-v1-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL, LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import { LIQUITY_V1_RESERVE } from "@/lib/liquity-v1/event-figures";
import type { LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";

export interface LiquityV1EventCardProps {
  event: BaseActivityEvent & { context: { protocol: "liquity-v1"; data: LiquityV1Context } };
  isLast?: boolean;
  eventNumber?: number;
  /** The PriceFeed price now — a redemption's net outcome at today's price. */
  currentPrice?: number | null;
  /** On a liquidation, what the Trove's life left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
}

export function LiquityV1EventCard({
  event,
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

  // A close burns the debt less the 200 LUSD reserve from the owner; the
  // GasPool burns the reserve. The spine draws what left the owner's wallet.
  const isClose = ctx.eventType === "closeTrove";
  const debtSpineValue = isClose ? Math.max(0, Math.abs(debtDelta) - LIQUITY_V1_RESERVE) : Math.abs(debtDelta);

  const coords = { txHash: event.txHash, blockNumber: event.blockNumber };

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
              }
            : null,
          debtDelta !== 0
            ? {
                symbol: DEBT_SYMBOL,
                address: LIQUITY_V1_ADDRESSES.LUSD,
                direction: debtDelta > 0 ? ("left" as const) : ("right" as const),
                value: debtSpineValue,
              }
            : null,
        ] as (SpineTokenRow | null)[]
      ).filter((t): t is SpineTokenRow => t !== null);

  const spine: SpineColumnProps = isWarning
    ? { icon: "warning", warningTone: isLiq ? "critical" : "caution", isLast: !!isLast }
    : { tokens: tokens && tokens.length > 0 ? tokens : undefined, isLast: !!isLast };

  const opened = {
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    currentPrice,
    gas: event.gas,
  };
  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "liquity-v1",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head: liquityV1HeadSpec(event.actionLabel, ctx, coords),
    caption: event.actionLabel,
    // Collateral, Debt and Collateral ratio; V1 has no interest rate. The
    // figures, the price row and the notes are built once the card opens.
    cells: { pending: LIQUITY_V1_CELL_HEADS },
    useOpened: () => useLiquityV1Opened(opened),
    // The Collateral and Debt cells open into their ledgers where the page
    // ties its timeline to the Lifetime flows panel.
    ledgers: {
      provider: (children) => (
        <LiquityLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </LiquityLedgerProvider>
      ),
    },
    // The pane draws every bullet: whether it groups them waits on the
    // receipt read, which starts only when the card opens.
    explainer: {
      body: (
        <LiquityV1EventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          ownerOutcome={isLiq ? ownerOutcome : null}
        />
      ),
    },
    learnMore: <LearnMore inline content={liquityV1LearnMoreContent(ctx)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
