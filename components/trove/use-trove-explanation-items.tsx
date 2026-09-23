"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { formatPrice, formatUsdValue, formatApproximate, formatCompact, formatExact } from "@/lib/utils/format";
import { formatDateRange, formatDuration } from "@/lib/date";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { getLiquidationThreshold, troveLiquidationPrice, formatLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { trovePriceRunwayExplanation } from "@/components/protocol/liquity/trove-price-axis";
import {
  troveBranchDebtProv,
  troveDebtInFrontProv,
  troveQueueShareProv,
  troveTrovesAheadProv,
} from "@/lib/liquity/trove-queue-provenance";
import { trovePeakCollProv, trovePeakDebtProv } from "@/lib/liquity/trove-provenance";
import { pct } from "@/components/shared/ratio-bar";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { H } from "@/lib/shared/explainer-prose";
import { stateOriginVia, stateOriginSummary } from "@/lib/shared/trove-state-origin";

// V2 TroveManager per branch — the contract the chain values are read from.
const TROVE_MANAGER: Record<string, string> = {
  weth: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
  wsteth: "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22",
  reth: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e",
};

interface UseTroveExplanationItemsArgs {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  debtInFront?: number | null;
  trovesAhead?: number | null;
  /** The branch's entire debt — the redemption queue the pane's queue-share
   *  and branch-debt bullets read (the same live figure the compact
   *  RedemptionRunway's fill divides by). */
  queueDebtTotal?: number | null;
}

/** The trove pane's content: a subject-first, colon-terminated status lead
 *  (charter §4) over the plain-English explanation bullets. */
export interface TroveExplanation {
  lead: React.ReactNode | null;
  items: React.ReactNode[];
}

/**
 * Returns the plain-English explanation lead + bullets for a trove's status.
 * Same content that used to live inside each summary card's local useMemo,
 * lifted here so it can render below the trove identity row instead of
 * inside the card itself. Hover-state isn't a dep — items contain
 * `HighlightableValue` components that subscribe to hover at render time.
 */
export function useTroveExplanationItems({
  trove,
  liveState,
  prices,
  debtInFront,
  trovesAhead,
  queueDebtTotal,
}: UseTroveExplanationItemsArgs): TroveExplanation {
  return useMemo(() => {
    if (trove.status === "liquidated") return buildLiquidatedItems(trove);
    if (trove.status === "closed") return buildClosedItems(trove);
    return buildOpenItems({ trove, liveState, prices, debtInFront, trovesAhead, queueDebtTotal });
  }, [trove, liveState, prices, debtInFront, trovesAhead, queueDebtTotal]);
}

function buildLiquidatedItems(trove: TroveSummary): TroveExplanation {
  const items: React.ReactNode[] = [];
  const liquidationThreshold = getLiquidationThreshold(trove.collateralType);
  const truncatedTroveId = trove.id.length > 10 ? `${trove.id.slice(0, 6)}...${trove.id.slice(-4)}` : trove.id;
  const duration = formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt);
  const dateRange = formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt);

  // The status verdict — subject-first, one sentence, colon-terminated.
  const lead = (
    <span key="liquidation" className="text-rb-500">
      Trove{" "}
      <HighlightableValue type="troveId" state="after" value={trove.id ? parseInt(trove.id) : undefined}>
        {truncatedTroveId}
      </HighlightableValue>{" "}
      was liquidated when its collateral ratio fell below the minimum threshold ({liquidationThreshold}% for{" "}
      {trove.collateralType}):
    </span>
  );

  items.push(
    <span key="lifecycle" className="text-rb-500">
      Trove was active for{" "}
      <HighlightableValue type="duration" state="after">
        {duration}
      </HighlightableValue>{" "}
      before liquidation from{" "}
      <HighlightableValue type="dateRange" state="after">
        {dateRange}
      </HighlightableValue>
    </span>,
  );

  const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
  if (nftUrl && trove.lastOwner) {
    const truncatedOwner = trove.ownerEns || `${trove.lastOwner.substring(0, 6)}...${trove.lastOwner.substring(38)}`;
    items.push(
      <span key="nft-info" className="text-rb-500">
        The{" "}
        <HighlightableValue type="nftToken" state="after">
          NFT
        </HighlightableValue>{" "}
        representing trove{" "}
        <HighlightableValue type="troveId" state="after" value={trove.id ? parseInt(trove.id) : undefined}>
          {`${trove.id.substring(0, 8)}...`}
        </HighlightableValue>{" "}
        was held by{" "}
        {/* Value-as-escape-hatch (color-grammar §4a): the owner address rests
            muted and hovers BLUE — it links out to the wallet-filtered
            listing, so the hover reads "a way out of here", never foreground
            ("this value matters here"). */}
        <Link
          href={listingHrefForWallet("liquity-v2", trove.lastOwner) ?? "/ethereum/liquity-v2"}
          className="hover:text-blue-500 transition-colors"
        >
          <HighlightableValue type="ownerAddress" state="after">
            {truncatedOwner}
          </HighlightableValue>
        </Link>{" "}
        at the time of liquidation
      </span>,
    );
  }
  // No owner-linked NFT bullet without a lastOwner — the generic "ownership is
  // an NFT" rule is Layer-2 material, covered by the "?" modal's Trove NFT
  // concept (the 2026-07-25 Layer-2-in-Layer-1 audit).

  return { lead, items };
}

function buildClosedItems(trove: TroveSummary): TroveExplanation {
  const items: React.ReactNode[] = [];

  // The status verdict — subject-first, one sentence, colon-terminated
  // (absorbs the old "closure" bullet).
  const lead = (
    <span key="closure" className="text-rb-500">
      This trove has been closed with all debt repaid — any collateral above the liquidation reserve was returned to the
      owner:
    </span>
  );
  // Shared with ClosedSummaryCard's face stats — one receipt identity for the
  // face figure and this bullet's restatement.
  const peakDebtProv = trovePeakDebtProv;
  const peakCollProv = trovePeakCollProv;
  const duration = formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt);
  const durationInSeconds =
    (new Date(trove.activity.lastActivityAt).getTime() - new Date(trove.activity.createdAt).getTime()) / 1000;

  items.push(
    <span key="peak-debt" className="text-rb-500">
      This trove reached a maximum debt of{" "}
      <Prov info={peakDebtProv}>
        <HighlightableValue type="peakDebt" state="after" value={trove.debt.peak}>
          {formatPrice(trove.debt.peak)} BOLD
        </HighlightableValue>
      </Prov>{" "}
      during its lifetime
    </span>,
  );

  items.push(
    <span key="peak-collateral" className="text-rb-500">
      The highest recorded collateral was{" "}
      <Prov info={peakCollProv}>
        <HighlightableValue type="peakCollateral" state="after" value={trove.collateral.peakAmount}>
          {formatPrice(trove.collateral.peakAmount)} {trove.collateralType}
        </HighlightableValue>
      </Prov>
    </span>,
  );

  items.push(
    <span key="lifecycle" className="text-rb-500">
      Trove was active for{" "}
      <HighlightableValue type="duration" state="after" value={durationInSeconds}>
        {duration}
      </HighlightableValue>{" "}
      from{" "}
      <HighlightableValue
        type="dateRange"
        state="after"
        value={`${trove.activity.createdAt}-${trove.activity.lastActivityAt}`}
      >
        {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
      </HighlightableValue>
    </span>,
  );

  // The generic "ownership is an NFT" rule is Layer-2 material, covered by the
  // "?" modal's Trove NFT concept (the 2026-07-25 Layer-2-in-Layer-1 audit).

  return { lead, items };
}

function buildOpenItems({
  trove,
  liveState,
  prices,
  debtInFront,
  trovesAhead,
  queueDebtTotal,
}: UseTroveExplanationItemsArgs): TroveExplanation {
  const items: React.ReactNode[] = [];
  const batchManagerInfo = getBatchManagerByAddress(trove.batch.manager);

  const displayDebt = liveState?.debt.entire ?? trove.debt.current;
  const displayRecordedDebt = liveState?.debt.recorded ?? trove.debt.current;
  const displayAccruedInterest = liveState?.debt.accruedInterest;
  const displayInterestRate = liveState?.rates.annualInterestRate ?? trove.metrics.interestRate;
  const displayManagementFee = liveState?.rates.accruedBatchManagementFee;
  const displayCollateral = liveState?.collateral.entire ?? trove.collateral.amount;

  // Costs stay on RECORDED (principal) debt — interest accrues on the
  // principal, and the pane says so. Only the annual figures render: the card
  // shows only the annual cost, so a per-day figure would be a non-mirrored
  // derived extra (charter §3's figure-density cap).
  const annualInterestCost = (displayRecordedDebt * displayInterestRate) / 100;
  const annualManagementFee = (displayRecordedDebt * trove.batch.managementFee) / 100;

  // The status verdict — subject-first, one sentence, two figures, colon-
  // terminated (charter §4): the lead-in to the bullets. The two figures head
  // the summary card's stat chrome, so they carry the bold highlight; their
  // receipts ride the bullets below, which restate both.
  const lead = (
    <span key="lead" className="text-rb-500">
      This trove holds{" "}
      <H>
        {displayCollateral} {trove.collateralType}
      </H>{" "}
      of collateral against <H>{formatPrice(displayDebt)} BOLD</H> of debt:
    </span>
  );

  const hasLiveData = liveState && prices;
  const collateralTokenKey = trove.collateralType.toLowerCase() as keyof OraclePricesData;
  const currentPrice = hasLiveData ? prices[collateralTokenKey] : null;
  const collateralUsd = hasLiveData && currentPrice ? displayCollateral * currentPrice : null;
  const collateralRatio = hasLiveData && collateralUsd && displayDebt > 0 ? (collateralUsd / displayDebt) * 100 : null;
  const mcr = getLiquidationThreshold(trove.collateralType);

  // ── Provenance ────────────────────────────────────────────────────────────
  // The displayed numbers come from one of two chain-rooted origins:
  //   liveState      → live TroveManager.getLatestTroveData()
  //   no liveState   → the rails-server index of decoded TroveUpdated
  // Derived figures (USD, ratio, daily/annual cost) carry formula + inputs.
  const tm = TROVE_MANAGER[trove.collateralType.toLowerCase()];
  const tmContract = { name: "TroveManager", address: tm };
  const isLive = !!liveState;
  const stateNote = isLive ? "live on-chain read" : "indexed";
  const chainState = (field: string, what: string): Provenance => ({
    kind: "chain",
    summary: stateOriginSummary(isLive, what),
    contract: tmContract,
    via: stateOriginVia(isLive, field),
  });
  const priceProv: Provenance = {
    kind: "chain-derived",
    summary: `Liquity's current price for ${trove.collateralType} — from Chainlink's on-chain price feeds (and, for staked ETH, the token's exchange rate) at the latest block, combined by the rules in Liquity's PriceFeed contract.`,
    via: "Chainlink feeds at the latest block, combined by Liquity PriceFeed rules",
  };
  const collInput = {
    label: "collateral",
    value: `${displayCollateral} ${trove.collateralType}`,
    kind: "chain" as const,
    note: stateNote,
  };
  const priceInput = currentPrice
    ? { label: "price", value: formatUsdValue(currentPrice), kind: "chain-derived" as const }
    : null;
  const debtInput = {
    label: "debt",
    value: `${formatPrice(displayDebt)} BOLD`,
    kind: "chain" as const,
    note: stateNote,
  };
  const rateInput = { label: "rate", value: `${displayInterestRate}%`, kind: "chain" as const, note: stateNote };
  const recordedInput = {
    label: "principal",
    value: `${formatPrice(displayRecordedDebt)} BOLD`,
    kind: "chain" as const,
    note: stateNote,
  };

  const debtProv: Provenance = {
    kind: "chain",
    summary: isLive
      ? "The trove's debt — what the trove owes now, as the TroveManager contract reports it: the debt at the trove's last change, plus the interest built up since and any share of liquidated troves' debt passed to it."
      : "The trove's debt — the debt the contract logged at the trove's most recent change. Interest has built up since then.",
    contract: tmContract,
    via: stateOriginVia(isLive, "entireDebt"),
  };
  const recordedProv: Provenance = {
    kind: "chain",
    summary: "Recorded debt — the trove's debt as of its last change, before the interest built up since.",
    contract: tmContract,
    via: stateOriginVia(isLive, "recordedDebt"),
  };
  const accruedProv: Provenance = {
    kind: "chain",
    summary: "Accrued interest — the interest built up on the trove's debt since its last change.",
    contract: tmContract,
    via: stateOriginVia(isLive, "accruedInterest"),
  };
  const mgmtFeeProv: Provenance = {
    kind: "chain",
    summary:
      "Accrued delegate fee — the delegate's management fee built up on the trove's debt since its last change. It is charged on top of the interest.",
    contract: tmContract,
    via: stateOriginVia(isLive, "accruedBatchManagementFee"),
  };
  const collProv = chainState("entireColl", "Collateral held by the trove");
  const rateProv = chainState("annualInterestRate", "Annual interest rate the trove pays");
  const collUsdProv: Provenance = {
    kind: "chain-derived",
    summary: `Collateral value in USD — the collateral multiplied by Liquity's current price for ${trove.collateralType}.`,
    formula: "collateral × price",
    inputs: [collInput, ...(priceInput ? [priceInput] : [])],
  };
  const crProv: Provenance = {
    kind: "chain-derived",
    summary: `Collateral ratio — the collateral's dollar value divided by the debt, at Liquity's current price for ${trove.collateralType}.`,
    formula: "collateral × price ÷ debt × 100",
    inputs: [collInput, ...(priceInput ? [priceInput] : []), debtInput],
  };
  const annualInterestProv: Provenance = {
    kind: "derived",
    summary:
      "Annual interest cost — the debt at the trove's last change multiplied by the interest rate. It is a year's interest at today's rate, before any delegate fee.",
    formula: "principal × rate",
    inputs: [recordedInput, rateInput],
  };
  const mgmtRateInput = { label: "mgmt rate", value: `${trove.batch.managementFee}%`, kind: "chain" as const };
  const annualMgmtProv: Provenance = {
    kind: "derived",
    summary:
      "Annual delegate fee — the debt at the trove's last change multiplied by the delegate's management rate. It is charged on top of the interest.",
    formula: "principal × mgmt rate",
    inputs: [recordedInput, mgmtRateInput],
  };
  const mgmtFeeRateProv: Provenance = {
    kind: "chain",
    summary:
      "Delegate management rate — the delegate's annual fee, charged on top of the interest rate. The delegate sets one rate for every trove in the batch.",
    via: "the batch's most recent BatchUpdated log: _annualManagementFee",
  };
  if (displayAccruedInterest !== undefined) {
    items.push(
      <span key="debt-breakdown" className="text-rb-500">
        Current debt of{" "}
        <Prov info={debtProv}>
          <HighlightableValue type="debt" state="after" value={displayDebt}>
            {formatPrice(displayDebt)} BOLD
          </HighlightableValue>
        </Prov>{" "}
        consists of{" "}
        <Prov info={recordedProv}>
          <HighlightableValue type="principal" state="after" value={displayRecordedDebt}>
            {formatPrice(displayRecordedDebt)} BOLD
          </HighlightableValue>
        </Prov>{" "}
        carried debt plus{" "}
        <Prov info={accruedProv}>
          <HighlightableValue type="interest" state="after" value={displayAccruedInterest}>
            {formatPrice(displayAccruedInterest)} BOLD
          </HighlightableValue>
        </Prov>{" "}
        interest accrued since the last event
        {trove.batch.isMember && displayManagementFee !== undefined && displayManagementFee > 0 && (
          <span>
            {" "}
            and{" "}
            <Prov info={mgmtFeeProv}>
              <HighlightableValue type="managementFee" state="after" value={displayManagementFee}>
                {formatPrice(displayManagementFee)} BOLD
              </HighlightableValue>
            </Prov>{" "}
            delegate fees
          </span>
        )}
      </span>,
    );
  }

  if (hasLiveData && currentPrice && collateralUsd) {
    // The USD worth and today's spot price split into separate bullets —
    // three figures in one sentence is a list wearing a sentence (charter §3).
    items.push(
      <span key="collateral-info" className="text-rb-500">
        <Prov info={collProv}>
          <HighlightableValue type="collateral" state="after" value={displayCollateral}>
            {displayCollateral} {trove.collateralType}
          </HighlightableValue>
        </Prov>{" "}
        collateral worth{" "}
        <Prov info={collUsdProv}>
          <HighlightableValue type="collateralUsd" state="after" value={collateralUsd}>
            {formatUsdValue(collateralUsd)}
          </HighlightableValue>
        </Prov>{" "}
        secures this position
      </span>,
    );
    items.push(
      <span key="spot-price" className="text-rb-500">
        That worth is priced at today&rsquo;s{" "}
        <Prov info={priceProv}>
          <HighlightableValue type="currentPrice" state="after" value={currentPrice}>
            {formatUsdValue(currentPrice)}
          </HighlightableValue>
        </Prov>{" "}
        per {trove.collateralType}
      </span>,
    );
  } else {
    items.push(
      <span key="collateral-info" className="text-rb-500">
        <Prov info={collProv}>
          <HighlightableValue type="collateral" state="after" value={displayCollateral}>
            {displayCollateral} {trove.collateralType}
          </HighlightableValue>
        </Prov>{" "}
        collateral secures this position
      </span>,
    );
  }

  if (hasLiveData && collateralRatio) {
    // The ratio read as a multiple: a 211.6% CR means the collateral is worth
    // 2.12× the debt (NOT "211.6% more than" it — that reading overstates by
    // the debt itself). The 110% minimum states once, in the runway bullet.
    const currentCollateralRatio = collateralRatio.toFixed(1);
    const crMultiple = (collateralRatio / 100).toFixed(2);
    items.push(
      <span key="collateral-ratio" className="text-rb-500">
        Collateral ratio of{" "}
        <Prov info={crProv}>
          <HighlightableValue type="collRatio" state="after" value={parseFloat(currentCollateralRatio)}>
            {currentCollateralRatio}%
          </HighlightableValue>
        </Prov>{" "}
        means the collateral is worth {crMultiple}× the debt
      </span>,
    );
  }

  // Liquidation-price runway gloss — the footnote for the runway bar that now
  // lives in the position card beneath the stats (moved up from the economics
  // panel so the gauge sits with the current-state numbers it reads).
  // ENTIRE-debt basis, via the same helper the headline caption and the
  // compact runway chip use — the three surfaces must state one price.
  const liqPrice =
    hasLiveData && currentPrice
      ? troveLiquidationPrice({
          debt: displayDebt,
          collateral: displayCollateral,
          collateralType: trove.collateralType,
        })
      : null;
  const liqPriceProv: Provenance = {
    kind: "derived",
    summary: `Liquidation price — the ${trove.collateralType} price at which the trove's collateral ratio would equal the branch's minimum of ${mcr}%. Below that price the trove can be liquidated.`,
    formula: "debt × MCR ÷ collateral",
    inputs: [debtInput, { label: "MCR", value: `${mcr}%`, kind: "chain", note: "branch constant" }, collInput],
  };
  if (currentPrice && liqPrice && liqPrice > 0) {
    items.push(
      <span key="price-runway" className="text-rb-500">
        {trovePriceRunwayExplanation({
          collateralSymbol: trove.collateralType,
          debtSymbol: "BOLD",
          oraclePrice: currentPrice,
          liquidationPrice: liqPrice,
          mcr,
          // The chrome twin is the "Liquidates at" caption — same formatter,
          // same receipt shape, mirrored bold.
          liquidationPriceNode: (
            <Prov info={liqPriceProv}>
              <HighlightableValue type="liquidationPrice" state="after" value={liqPrice}>
                {formatLiquidationPrice(liqPrice)}
              </HighlightableValue>
            </Prov>
          ),
        })}
      </span>,
    );
  }

  if (trove.batch.isMember) {
    // Rate + delegate + cost merged into one bullet: the interest rate, who
    // manages it and at what fee, and what the base interest plus delegate fee
    // actually cost — one continuous thought rather than two split bullets.
    items.push(
      <span key="rate-cost" className="text-rb-500">
        <Prov info={rateProv}>
          <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
            {displayInterestRate}%
          </HighlightableValue>
        </Prov>{" "}
        interest rate managed by{" "}
        {batchManagerInfo?.website ? (
          <a
            href={batchManagerInfo.website}
            target="_blank"
            rel="noopener noreferrer"
            title={`Visit ${batchManagerInfo.name} website`}
            className="inline-flex items-center gap-0.5 hover:text-pink-500 transition-colors"
          >
            <HighlightableValue type="delegateName" state="after">
              {batchManagerInfo.name}
            </HighlightableValue>
            <Link2 size={11} className="-rotate-45" aria-hidden="true" />
          </a>
        ) : (
          <HighlightableValue type="delegateName" state="after">
            {batchManagerInfo?.name || "Batch Manager"}
          </HighlightableValue>
        )}{" "}
        with a +
        <Prov info={mgmtFeeRateProv}>
          <HighlightableValue type="managementFeeRate" state="after" value={trove.batch.managementFee}>
            {trove.batch.managementFee}%
          </HighlightableValue>
        </Prov>{" "}
        management fee. Base interest costs approximately{" "}
        <Prov info={annualInterestProv}>
          <HighlightableValue type="annualInterest" state="after" value={annualInterestCost}>
            {formatPrice(annualInterestCost)} BOLD
          </HighlightableValue>
        </Prov>{" "}
        per year, plus{" "}
        <Prov info={annualMgmtProv}>
          <HighlightableValue type="annualManagementFee" state="after" value={annualManagementFee}>
            {formatPrice(annualManagementFee)} BOLD
          </HighlightableValue>
        </Prov>{" "}
        per year in delegate fees
      </span>,
    );
  } else {
    items.push(
      <span key="rate-cost" className="text-rb-500">
        Self-managed interest rate of{" "}
        <Prov info={rateProv}>
          <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
            {displayInterestRate}%
          </HighlightableValue>
        </Prov>{" "}
        accrues continuously on the principal debt, costing approximately{" "}
        <Prov info={annualInterestProv}>
          <HighlightableValue type="annualInterest" state="after" value={annualInterestCost}>
            {formatPrice(annualInterestCost)} BOLD
          </HighlightableValue>
        </Prov>{" "}
        per year
      </span>,
    );
  }

  if (debtInFront !== null && debtInFront !== undefined) {
    items.push(
      <span key="debt-in-front" className="text-rb-500">
        <Prov info={troveDebtInFrontProv(trove.collateralType)} value={formatExact(debtInFront)} symbol="BOLD">
          <span className="font-bold text-foreground">{formatApproximate(debtInFront)} BOLD</span>
        </Prov>{" "}
        of debt sits at the same or lower interest rate and is exposed to redemption alongside this trove
        {trovesAhead !== null && trovesAhead !== undefined && (
          <span>
            {" "}
            (
            <Prov info={troveTrovesAheadProv(trove.collateralType)}>
              <HighlightableValue type="trovesAhead" state="after" value={trovesAhead}>
                {trovesAhead}
              </HighlightableValue>
            </Prov>{" "}
            other trove{trovesAhead !== 1 ? "s" : ""})
          </span>
        )}
      </span>,
    );
  }

  // The redemption-queue bullets — the reduced form of the retired full-width
  // redemption panel (detail-page-anatomy §2): the branch's whole queue and
  // this trove's share of it (the compact runway chip's twin, so it carries
  // the same receipt). The general redemption mechanics the retired panel's
  // paragraph carried are Layer-2 material and live in the "?" modal
  // (liquityPositionContent's Redemption exposure + Branch scoping concepts),
  // not here — the 2026-07-25 Layer-2-in-Layer-1 audit.
  if (debtInFront !== null && debtInFront !== undefined) {
    if (queueDebtTotal !== null && queueDebtTotal !== undefined && queueDebtTotal > 0) {
      const queueShare = Math.min(1, debtInFront / queueDebtTotal);
      items.push(
        <span key="branch-debt" className="text-rb-500">
          The whole {trove.collateralType} redemption queue holds{" "}
          <Prov info={troveBranchDebtProv(trove.collateralType)} value={formatExact(queueDebtTotal)} symbol="BOLD">
            {formatCompact(queueDebtTotal)} BOLD
          </Prov>{" "}
          of branch debt
        </span>,
      );
      items.push(
        <span key="queue-share" className="text-rb-500">
          <Prov info={troveQueueShareProv(trove.collateralType)}>
            <HighlightableValue type="queueShare" state="after" value={queueShare}>
              {pct(queueShare)}
            </HighlightableValue>
          </Prov>{" "}
          of that queue sits in front of this trove and would be redeemed first
        </span>,
      );
    }
  }

  // Liquidation reserve moved to the economics panel's footnote — it's a
  // closing-accounting figure, not a headline-stat elaboration.

  const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
  if (nftUrl && trove.owner) {
    const truncatedOwner = trove.ownerEns || `${trove.owner.substring(0, 6)}...${trove.owner.substring(38)}`;
    items.push(
      <span key="nft-info" className="text-rb-500">
        A transferable{" "}
        <a
          href={nftUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View NFT on OpenSea"
          className="inline-flex items-center gap-0.5 hover:text-pink-500 transition-colors"
        >
          <HighlightableValue type="nftToken" state="after">
            NFT
          </HighlightableValue>
          <Link2 size={11} className="-rotate-45" aria-hidden="true" />
        </a>{" "}
        representing trove{" "}
        <HighlightableValue
          type="troveId"
          state="after"
          value={parseInt(trove.id)}
        >{`${trove.id.substring(0, 8)}...`}</HighlightableValue>{" "}
        is held by wallet{" "}
        {/* Value-as-escape-hatch (color-grammar §4a): rests muted, hovers
            BLUE — an internal link out of this panel, not a key value in it. */}
        <Link
          href={listingHrefForWallet("liquity-v2", trove.owner) ?? "/ethereum/liquity-v2"}
          className="hover:text-blue-500 transition-colors"
        >
          <HighlightableValue type="ownerAddress" state="after">
            {truncatedOwner}
          </HighlightableValue>
        </Link>
      </span>,
    );
  }

  // Closing aggregate — the twins of the header's two count badges (△
  // redemptions, ⇄ owner transactions). The badge subtracts redemptions from
  // the total event count, so the wording says OWNER transactions.
  const redemptionCount = trove.activity.redemptionCount;
  const ownerTxCount = trove.activity.transactionCount - redemptionCount;
  const redemptionCountProv: Provenance = {
    kind: "derived",
    summary: "Redemption count — the number of redemptions that have taken collateral from this trove.",
    via: "count of the trove's redemption events",
  };
  const ownerTxCountProv: Provenance = {
    kind: "derived",
    summary:
      "Owner transactions — the number of events in the trove's history minus its redemptions, which other BOLD holders start.",
    formula: "transaction count − redemption count",
    via: "counts of the trove's events",
  };
  const redemptionCountNode = (
    <Prov info={redemptionCountProv}>
      <HighlightableValue type="redemptionCount" state="after" value={redemptionCount}>
        {redemptionCount}
      </HighlightableValue>
    </Prov>
  );
  const ownerTxCountNode = (
    <Prov info={ownerTxCountProv}>
      <HighlightableValue type="transactionCount" state="after" value={ownerTxCount}>
        {ownerTxCount}
      </HighlightableValue>
    </Prov>
  );
  if (redemptionCount > 0 && ownerTxCount > 0) {
    items.push(
      <span key="activity-counts" className="text-rb-500">
        Redeemed against {redemptionCountNode} time{redemptionCount !== 1 ? "s" : ""} across {ownerTxCountNode} owner
        transaction{ownerTxCount !== 1 ? "s" : ""}
      </span>,
    );
  } else if (ownerTxCount > 0) {
    items.push(
      <span key="activity-counts" className="text-rb-500">
        Shaped by {ownerTxCountNode} owner transaction{ownerTxCount !== 1 ? "s" : ""}
      </span>,
    );
  } else if (redemptionCount > 0) {
    items.push(
      <span key="activity-counts" className="text-rb-500">
        Redeemed against {redemptionCountNode} time{redemptionCount !== 1 ? "s" : ""}
      </span>,
    );
  }

  return { lead, items };
}
