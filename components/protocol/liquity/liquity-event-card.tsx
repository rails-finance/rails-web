"use client";

import { useContext } from "react";
import Link from "next/link";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps, SpineTokenRow, SpineWarningLeg } from "@/components/shared/spine-column";
import { Facehash } from "@/components/shared/facehash";
import { useLiquityHeadSpec } from "./liquity-head";
import { liquityL1Label } from "@/lib/liquity/event-prose";
import { LiquityRedeemerNote, useLiquityCells } from "./liquity-cells";
import { isGroupedExplanation, LiquityEventExplainer, LiquityExplainerTeaser } from "./liquity-event-explainer";
import { useLiquityEventMarkdown, useLiquityEventProse } from "./event-prose-render";
import { EventMarkdownContext, EventPageContext } from "@/components/shared/event-page-aside";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { isNoChangeAdjust } from "@/lib/liquity/trove-ops";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { collChangeProv, debtChangeProv, eventGasProv, eventPriceProv } from "@/lib/liquity/event-provenance";
import { eventPriceTitle } from "@/lib/liquity/trove-page-words";
import type { EventCardPrice } from "@/components/shared/event-price-row";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";
import { liquityAccrualLabel } from "@/lib/liquity/event-ledgers";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { LedgerOpenContext } from "@/components/shared/event-ledger";
import { L1_WORDS, L2_WORDS } from "@/lib/liquity/event-templates";

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export interface LiquityEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "liquity-v2-troves"; data: LiquityContext } };
  addressDisplay?: "full" | "compact" | "hidden";
  ensName?: string | null;
  hoveredAddress?: string | null;
  setHoveredAddress?: (addr: string | null) => void;
  isLast?: boolean;
  /** When provided, replaces the internally-built avatar slot */
  avatarOverride?: React.ReactNode;
  /** Previous event in the timeline for interest calculations */
  previousEvent?: BaseActivityEvent;
  /** 1-based chronological position; threaded through to the header chip. */
  eventNumber?: number;
  /** Live oracle price for this collateral — drives the "today" leg of the
   *  redemption P/L in the header and explainer. */
  currentPrice?: number;
}

export function LiquityEventCard({
  event,
  addressDisplay = "full",
  ensName,
  hoveredAddress,
  setHoveredAddress,
  isLast,
  avatarOverride,
  previousEvent,
  eventNumber,
  currentPrice,
}: LiquityEventCardProps) {
  // The event page's card (rails-ops TO-DO-ui-jobs 236): its ledgers open
  // with no toggles, and the column reads the Copy for LLM build.
  const page = useContext(EventPageContext) != null;
  const ctx = event.context.data;
  const wallet = event.wallet;
  const prose = useLiquityEventProse(event, previousEvent, currentPrice);
  const coords = { txHash: event.txHash, blockNumber: event.blockNumber };
  const shareHref = useEventShareHref();
  const buildMarkdown = useLiquityEventMarkdown(prose, event, eventNumber, shareHref);

  // Column 1 — Avatar
  const avatarSlot =
    addressDisplay === "hidden" ? (
      <div className="hidden sm:block" />
    ) : addressDisplay === "compact" ? (
      <div className="flex items-center justify-center pt-4">
        <Link
          href={`/address/${wallet}`}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredAddress?.(wallet.toLowerCase())}
          onMouseLeave={() => setHoveredAddress?.(null)}
          className={`inline-flex items-center justify-center rounded-full border-2 p-1.5 bg-sunken transition-colors ${hoveredAddress === wallet.toLowerCase() ? "border-rb-500 dark:border-rb-500" : "border-rb-300 dark:border-rb-700"} hover:border-rb-500 dark:hover:border-rb-500`}
          title={ensName || wallet}
        >
          <Facehash address={wallet} size={20} />
        </Link>
      </div>
    ) : (
      <div className="flex items-center pt-4">
        <Link
          href={`/address/${wallet}`}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHoveredAddress?.(wallet.toLowerCase())}
          onMouseLeave={() => setHoveredAddress?.(null)}
          className={`flex items-center rounded-full bg-sunken px-3 py-2 text-blue-500 transition-colors ${hoveredAddress === wallet.toLowerCase() ? "border-rb-500 dark:border-rb-500" : ""} hover:border-rb-500 dark:hover:border-rb-500`}
        >
          <span className="inline-flex items-center gap-1.5 w-[140px]">
            <Facehash address={wallet} size={16} />
            <span className="truncate font-mono text-xs">{ensName || shortenAddress(wallet)}</span>
          </span>
        </Link>
      </div>
    );

  // Column 2 — Spine column with semantic icon modes
  const WARNING_ACTIONS = new Set(["redeemCollateral", "liquidate", "applyPendingDebt"]);
  const RATE_ACTIONS = new Set(["adjustTroveInterestRate", "setBatchManagerAnnualInterestRate"]);
  const DELEGATE_ACTIONS = new Set(["setInterestBatchManager", "removeFromBatch"]);
  const isWarning = WARNING_ACTIONS.has(ctx.operation);
  const isRateChange = RATE_ACTIONS.has(ctx.operation);
  const isDelegate = DELEGATE_ACTIONS.has(ctx.operation);

  const rateUp = isRateChange
    ? (ctx.stateAfter?.annualInterestRate ?? 0) >= (ctx.stateBefore?.annualInterestRate ?? 0)
    : false;
  // A rate change states its rate before and after, on the flank and in the
  // phone caption ("Rate 4.12% → 3.60%").
  const rateSpan: [number, number] | undefined =
    isRateChange && ctx.stateBefore && ctx.stateAfter
      ? [ctx.stateBefore.annualInterestRate, ctx.stateAfter.annualInterestRate]
      : undefined;
  const isJoin = isDelegate ? ctx.operation === "setInterestBatchManager" : false;

  const isRedemption = ctx.operation === "redeemCollateral";
  const isLiquidation = ctx.operation === "liquidate";
  // A redemption's or a liquidation's legs, drawn as two nodes on the spine:
  // the collateral that left the Trove, then the debt it cleared. The same
  // change receipts the header's figures trace.
  const warningLegs = (() => {
    if (!isRedemption && !isLiquidation) return undefined;
    const coords = { txHash: event.txHash, blockNumber: event.blockNumber };
    const collCp = collChangeProv(ctx, coords);
    const debtCp = debtChangeProv(ctx, coords);
    const debtSym = ctx.assetType ?? "BOLD";
    const legs: SpineWarningLeg[] = [];
    if (collCp && Math.abs(collCp.change) >= 0.01)
      legs.push({
        label: isRedemption ? L1_WORDS.reduced : L1_WORDS.liquidated,
        value: Math.abs(collCp.change),
        symbol: ctx.collateralType,
        address: soleFlowAddress(event.flows, ctx.collateralType),
      });
    if (debtCp && Math.abs(debtCp.change) >= 0.01)
      legs.push({
        label: L1_WORDS.cleared,
        value: Math.abs(debtCp.change),
        symbol: debtSym,
        address: soleFlowAddress(event.flows, debtSym),
      });
    return legs;
  })();

  // An owner's move: the collateral and BOLD it moved, as token rows.
  const tokenRows = (): SpineTokenRow[] => {
    const debtOp = ctx.troveOperation?.debtChangeFromOperation ?? 0;
    const collOp = ctx.troveOperation?.collChangeFromOperation ?? 0;
    const boldDir = debtOp < 0 ? ("right" as const) : ("left" as const);
    const collDir = collOp < 0 ? ("left" as const) : ("right" as const);
    // A close moves BOLD only when it repaid debt: closing a zombie a
    // redemption already cleared to zero returns collateral and nothing else.
    const closeRepaid =
      ctx.operation === "closeTrove" && (Math.abs(debtOp) >= 0.01 || (ctx.stateBefore?.debt ?? 0) >= 0.01);
    const showBold = closeRepaid || Math.abs(debtOp) >= 0.01 || !ctx.troveOperation;
    const showColl = ctx.operation === "closeTrove" || Math.abs(collOp) >= 0.01 || !ctx.troveOperation;
    const isActiveOp = ![
      "redeemCollateral",
      "adjustZombieTrove",
      "adjustUnredeemableZombieTrove",
      "liquidate",
      "applyPendingDebt",
      "adjustTroveInterestRate",
      "setBatchManagerAnnualInterestRate",
      "setInterestBatchManager",
      "removeFromBatch",
      "transferTrove",
    ].includes(ctx.operation);
    const collVal = isActiveOp ? Math.abs(collOp) : undefined;
    const debtVal = isActiveOp ? Math.abs(debtOp) : undefined;

    // The chip draws a mark from a contract address; a symbol alone only
    // gets it as far as the house lookup table. Liquity V2's branches and
    // BOLD are fixed, so both symbols are already in that table and no glyph
    // on this explorer is currently a letter — but the event's flows state
    // the contracts outright, and preferring the stated fact to the looked-up
    // one is the same reason the rest of these cards read from flows. The
    // helper answers only where a symbol appears on one flow alone.
    return [
      ...(showColl
        ? [
            {
              symbol: ctx.collateralType,
              address: soleFlowAddress(event.flows, ctx.collateralType),
              direction: collDir,
              verb: collDir === "left" ? "withdrawn" : "added",
              value: collVal,
            },
          ]
        : []),
      ...(showBold
        ? [
            {
              symbol: "BOLD",
              address: soleFlowAddress(event.flows, "BOLD"),
              direction: boldDir,
              verb: boldDir === "left" ? "borrowed" : "repaid",
              value: debtVal,
            },
          ]
        : []),
    ];
  };

  const spine: SpineColumnProps = isWarning
    ? // A redemption changes the Trove without the owner acting: caution
      // (color-grammar.md §5). Liquidation stays critical red.
      {
        icon: "warning",
        warningTone: ctx.operation === "liquidate" ? "critical" : "caution",
        warningLegs,
        isLast: !!isLast,
      }
    : isDelegate
      ? // Delegation reads as an external-party event via the pink +/- glyph
        // badge (color-grammar.md §4b); the spine line stays neutral.
        { icon: "delegate", iconDirection: isJoin ? "up" : "down", isLast: !!isLast }
      : isRateChange
        ? { icon: "rate-change", iconDirection: rateUp ? "up" : "down", rateSpan, isLast: !!isLast }
        : ctx.operation === "transferTrove"
          ? // The Trove NFT changed hands; no collateral or BOLD moved. The
            // custody plane in its neutral disc (detail-page-anatomy.md, "The
            // custody row"), the mark Polaris's position transfer wears.
            { icon: "custody", isLast: !!isLast }
          : isNoChangeAdjust(ctx)
            ? // Zero-delta touch: no flows to draw, but an empty spine slot
              // reads as a rendering hole — mark the event with the neutral
              // "nothing moved" glyph.
              { icon: "no-change", isLast: !!isLast }
            : { tokens: tokenRows(), isLast: !!isLast };

  // T2's price row: the gas the owner paid (the generator leaves a third
  // party's out), the redemption's outcome and the collateral's price at
  // this block, where the event carries its state.
  const l2 = ctx.stateBefore && ctx.stateAfter && prose.L2 && prose.L2.price > 0 ? prose.L2 : null;
  const priceP = l2 ? eventPriceProv(ctx, coords) : undefined;
  const redemption = l2?.redemption;
  const price: EventCardPrice = {
    gas: prose.footer.gasCost
      ? {
          ...prose.footer.gasCost,
          run: prose.footer.gasRun,
          info: eventGasProv(
            { ...prose.footer.gasCost, gasUsed: event.gas?.gasUsed, run: prose.footer.gasRun },
            coords,
          ),
        }
      : null,
    prices: l2
      ? [
          {
            symbol: ctx.collateralType,
            usd: l2.price,
            info: priceP?.info,
            value: priceP?.value,
            title: eventPriceTitle(ctx.collateralType),
          },
        ]
      : [],
    outcome: redemption
      ? {
          claimable:
            redemption.claimable != null
              ? { amount: redemption.claimable, symbol: ctx.collateralType, word: L2_WORDS.claimable }
              : undefined,
          pl: redemption.showPl ? { usd: redemption.plHistoric, word: L2_WORDS.pl } : undefined,
          today: redemption.today,
        }
      : null,
  };
  const cells = useLiquityCells({ ctx, txHash: event.txHash, blockNumber: event.blockNumber, prose });

  const head = useLiquityHeadSpec(ctx, coords);
  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "liquity-v2",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: rateSpan ? `Rate ${rateSpan[0].toFixed(2)}% → ${rateSpan[1].toFixed(2)}%` : liquityL1Label(ctx),
    // A third party's act names who acted: the redeemer, the batch manager
    // moving a delegated Trove's rate.
    actor: {
      by: isRedemption
        ? ctx.redeemer
        : ctx.operation === "setBatchManagerAnnualInterestRate"
          ? ctx.batchManager
          : undefined,
      custody:
        ctx.operation === "transferTrove" && ctx.transfer
          ? ctx.transfer.toAddress?.toLowerCase() === event.wallet?.toLowerCase()
            ? { dir: "from", address: ctx.transfer.fromAddress }
            : { dir: "to", address: ctx.transfer.toAddress }
          : undefined,
    },
    cells,
    ledgers: {
      provider: (children) => (
        <LiquityLedgerProvider eventId={event.id} eventTs={event.timestamp} accrualLabel={liquityAccrualLabel}>
          {children}
        </LiquityLedgerProvider>
      ),
    },
    notes:
      ctx.stateBefore && ctx.stateAfter && prose.L2 ? (
        <LiquityRedeemerNote ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />
      ) : undefined,
    price,
    explainer: {
      body: <LiquityEventExplainer prose={prose} ctx={ctx} coords={coords} />,
      first: prose.L4.length > 0 ? <LiquityExplainerTeaser prose={prose} ctx={ctx} coords={coords} /> : undefined,
      grouped: isGroupedExplanation(prose),
    },
    learnMore: <LearnMore inline content={prose.L5.content} />,
  };

  const card = <EventCard slots={slots} avatar={avatarOverride ?? avatarSlot} />;
  return page ? (
    <LedgerOpenContext.Provider value>
      <EventMarkdownContext.Provider value={buildMarkdown}>{card}</EventMarkdownContext.Provider>
    </LedgerOpenContext.Provider>
  ) : (
    card
  );
}
