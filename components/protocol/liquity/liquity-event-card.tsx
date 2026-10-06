"use client";

import Link from "next/link";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { fmtSpine } from "@/components/shared/activity-timeline";
import { Facehash } from "@/components/shared/facehash";
import { LiquityEventHeader, liquityOperationLabel } from "./liquity-event-header";
import { LiquityEventDetail, LiquityGas } from "./liquity-event-detail";
import { LiquityEventExplainer, LiquityExplainerTeaser } from "./liquity-event-explainer";
import { CopyForLlmItem, useLiquityEventMarkdown, useLiquityEventProse } from "./event-prose-render";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { isNoChangeAdjust } from "@/lib/liquity/trove-ops";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { collChangeProv, debtChangeProv } from "@/lib/liquity/event-provenance";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";
import { liquityAccrualLabel } from "@/lib/liquity/event-ledgers";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { LedgerOpenContext } from "@/components/shared/event-ledger";
import { COPY_WORDS, MENU_WORDS, PAGE_WORDS } from "@/lib/liquity/event-templates";
import type { EventMenuWords } from "@/components/shared/event-card-menu";

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export interface LiquityEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "liquity-v2-troves"; data: LiquityContext } };
  addressDisplay?: "full" | "compact" | "hidden";
  ensName?: string | null;
  hoveredAddress?: string | null;
  setHoveredAddress?: (addr: string | null) => void;
  isFirst?: boolean;
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
  /** The event page's card (rails-ops TO-DO-ui-jobs 236): opened with no
   *  chevron, its ledgers and T3 open with no toggles, and `aside` in the
   *  spine's column. Unset, the card is the timeline's. */
  page?: { aside: React.ReactNode };
}

/** The event menu's words, from the strings file. */
const menuWords: EventMenuWords = {
  menu: MENU_WORDS.menu,
  heading: MENU_WORDS.heading,
  view_page: MENU_WORDS.view_page,
  view_page_hint: MENU_WORDS.view_page_hint,
  view_explorer: MENU_WORDS.view_explorer,
  view_explorer_hint: MENU_WORDS.view_explorer_hint,
  copy_link: MENU_WORDS.copy_link,
  copy_link_hint: MENU_WORDS.copy_link_hint,
  copied: COPY_WORDS.copied,
};

export function LiquityEventCard({
  event,
  addressDisplay = "full",
  ensName,
  hoveredAddress,
  setHoveredAddress,
  isFirst,
  isLast,
  avatarOverride,
  previousEvent,
  eventNumber,
  currentPrice,
  page,
}: LiquityEventCardProps) {
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
  const PASSIVE_ACTIONS = new Set(["redeemCollateral", "liquidate", "applyPendingDebt"]);
  const RATE_ACTIONS = new Set(["adjustTroveInterestRate", "setBatchManagerAnnualInterestRate"]);
  const DELEGATE_ACTIONS = new Set(["setInterestBatchManager", "removeFromBatch"]);
  const isPassive = PASSIVE_ACTIONS.has(ctx.operation);
  const isRateChange = RATE_ACTIONS.has(ctx.operation);
  const isDelegate = DELEGATE_ACTIONS.has(ctx.operation);

  const rateUp = isRateChange
    ? (ctx.stateAfter?.annualInterestRate ?? 0) >= (ctx.stateBefore?.annualInterestRate ?? 0)
    : false;
  const isJoin = isDelegate ? ctx.operation === "setInterestBatchManager" : false;

  const isRedemption = ctx.operation === "redeemCollateral";
  // A redemption's amounts, worded as the header words them, for the phone
  // spine view's flanks: debt "Cleared", collateral "Took". The same
  // change receipts the header's figures trace.
  const redemptionLegs = (() => {
    if (!isRedemption) return undefined;
    const coords = { txHash: event.txHash, blockNumber: event.blockNumber };
    const collCp = collChangeProv(ctx, coords);
    const debtCp = debtChangeProv(ctx, coords);
    const debtSym = ctx.assetType ?? "BOLD";
    return {
      left:
        collCp && Math.abs(collCp.change) >= 0.01
          ? {
              label: "Took",
              value: Math.abs(collCp.change),
              symbol: ctx.collateralType,
              address: soleFlowAddress(event.flows, ctx.collateralType),
              prov: collCp,
            }
          : undefined,
      right:
        debtCp && Math.abs(debtCp.change) >= 0.01
          ? {
              label: "Cleared",
              value: Math.abs(debtCp.change),
              symbol: debtSym,
              address: soleFlowAddress(event.flows, debtSym),
              prov: debtCp,
            }
          : undefined,
    };
  })();

  const iconSlot = isPassive ? (
    // A redemption changes the Trove without the owner acting: caution
    // (color-grammar.md §5). Liquidation stays critical red.
    <SpineColumn
      icon="warning"
      warningTone={ctx.operation === "liquidate" ? "critical" : "caution"}
      warningLabel={ctx.operation === "liquidate" ? "Liquidation" : isRedemption ? "Redemption" : undefined}
      warningLegs={redemptionLegs}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : isDelegate ? (
    // Delegation reads as an external-party event via the pink +/- glyph badge
    // (color-grammar.md §4b); the spine line itself stays neutral.
    <SpineColumn
      icon="delegate"
      iconDirection={isJoin ? "up" : "down"}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : isRateChange ? (
    <SpineColumn
      icon="rate-change"
      iconDirection={rateUp ? "up" : "down"}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : ctx.operation === "transferTrove" ? (
    // The Trove NFT changed hands; no collateral or BOLD moved. The custody
    // plane in its neutral disc (detail-page-anatomy.md, "The custody row"),
    // the mark Polaris's position transfer wears.
    <SpineColumn icon="custody" spine="dotted" isFirst={isFirst} isLast={!!isLast} />
  ) : isNoChangeAdjust(ctx) ? (
    // Zero-delta touch: no flows to draw, but an empty spine slot reads as a
    // rendering hole — mark the event with the neutral "nothing moved" glyph.
    <SpineColumn icon="no-change" isFirst={isFirst} isLast={!!isLast} />
  ) : (
    (() => {
      const debtOp = ctx.troveOperation?.debtChangeFromOperation ?? 0;
      const collOp = ctx.troveOperation?.collChangeFromOperation ?? 0;
      // The spine flanking value re-renders the header's change figure, so it
      // echoes into that receipt (the locator pulse then reaches it) — when
      // the two are the same number AT DISPLAY PRECISION, the same rule the
      // detail's delta echo uses. The spine shows the operation's own
      // movement; the receipt includes redistribution (+ upfront fee for
      // debt). Those extras are usually dust that vanishes in the compact
      // form (both render "17K") — indistinguishable figures echo; a visibly
      // different figure would be a false pairing, so it drops.
      const coords = { txHash: event.txHash, blockNumber: event.blockNumber };
      const collCp = collChangeProv(ctx, coords);
      const debtCp = debtChangeProv(ctx, coords);
      const collProv = collCp && fmtSpine(Math.abs(collCp.change)) === fmtSpine(Math.abs(collOp)) ? collCp : undefined;
      const debtProv = debtCp && fmtSpine(Math.abs(debtCp.change)) === fmtSpine(Math.abs(debtOp)) ? debtCp : undefined;
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

      // The chip draws a mark from a contract address; a symbol on its own only
      // gets it as far as the house lookup table. Liquity V2's branches and
      // BOLD are fixed, so both symbols are already in that table and no glyph
      // on this explorer is currently a letter — but the event's flows state
      // the contracts outright, and preferring the stated fact to the looked-up
      // one is the same reason the rest of these cards read from flows. The
      // helper answers only where a symbol appears on exactly one flow.
      const tokens = [
        ...(showColl
          ? [
              {
                symbol: ctx.collateralType,
                address: soleFlowAddress(event.flows, ctx.collateralType),
                direction: collDir,
                verb: collDir === "left" ? "withdrawn" : "added",
                value: collVal,
                prov: collVal != null ? collProv : undefined,
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
                prov: debtVal != null ? debtProv : undefined,
              },
            ]
          : []),
      ] as import("@/components/shared/spine-column").SpineTokenRow[];

      return <SpineColumn tokens={tokens} isFirst={isFirst} isLast={!!isLast} />;
    })()
  );

  const liquityTeaser = prose.L4.length > 0 ? <LiquityExplainerTeaser prose={prose} ctx={ctx} coords={coords} /> : null;
  // Gas (owner-paid events only; the generator leaves a third party's out)
  // and the event menu stand in T2's price row (LiquityEventDetail); a card
  // that draws no price row keeps both in the footer.
  const priceRow = !!(ctx.stateBefore && ctx.stateAfter && prose.L2 && prose.L2.price > 0);
  const footerExtra = prose.footer.gasCost && !priceRow ? <LiquityGas footer={prose.footer} /> : undefined;

  const card = (
    <LiquityLedgerProvider eventId={event.id} eventTs={event.timestamp} accrualLabel={liquityAccrualLabel}>
      <EventCard
        avatar={avatarOverride ?? avatarSlot}
        iconColumn={iconSlot}
        header={
          <LiquityEventHeader
            ctx={ctx}
            timestamp={event.timestamp}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            eventNumber={eventNumber}
            page={!!page}
          />
        }
        detail={
          <LiquityEventDetail
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            previousEvent={previousEvent}
            currentEvent={event}
            currentPrice={currentPrice}
            prose={prose}
          />
        }
        explainer={<LiquityEventExplainer prose={prose} ctx={ctx} coords={coords} />}
        explainerTeaser={liquityTeaser}
        txHash={event.txHash}
        footerExtra={footerExtra}
        learnMore={<LearnMore inline content={prose.L5.content} />}
        explanationHeading={PAGE_WORDS.explanation_heading}
        menuWords={menuWords}
        menuExtra={buildMarkdown ? <CopyForLlmItem build={buildMarkdown} /> : undefined}
        menuInDetail={priceRow}
        persistKey={`liquity-v2:${event.id}`}
        caption={liquityOperationLabel(ctx)}
        {...(page
          ? {
              hideDetailChevron: true,
              detailOpen: true,
              pageAside: page.aside,
            }
          : {})}
      />
    </LiquityLedgerProvider>
  );
  return page ? <LedgerOpenContext.Provider value>{card}</LedgerOpenContext.Provider> : card;
}
