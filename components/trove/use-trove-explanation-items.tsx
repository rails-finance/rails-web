"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { formatPrice, formatUsdValue, formatApproximate, formatExact } from "@/lib/utils/format";
import { formatDateRange, formatDuration } from "@/lib/date";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { getLiquidationThreshold, troveLiquidationPrice, formatLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { troveDebtInFrontProv, troveQueueShareProv } from "@/lib/liquity/trove-queue-provenance";
import { liquityTroveFaceProv, troveAnnualCostProv } from "@/lib/liquity/trove-card-provenance";
import { liveFromTroveState, viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import { collateralPriceInfo } from "@/lib/liquity/trove-page-words";
import { trovePeakCollProv, trovePeakDebtProv } from "@/lib/liquity/trove-provenance";
import { pct } from "@/components/shared/ratio-bar";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { H, type ExplainerItem } from "@/lib/shared/explainer-prose";
import { stateOriginVia } from "@/lib/shared/trove-state-origin";
import type { LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";
import { troveWords } from "@/lib/liquity/event-templates";
import { troveNodes } from "@/lib/liquity/trove-nodes";
import { SurplusBullet } from "@/components/protocol/liquity-family/surplus-bullet";

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
  /** A liquidated trove's collateral surplus, read at the head. */
  surplus?: LiquityTroveSurplus | null;
  /** A closed trove's debt just before the close, where the page knows it:
   *  0 when redemption had cleared it and the owner closed a zombie. */
  debtAtClose?: number | null;
}

/** The trove pane's content: a subject-first, colon-terminated status lead
 *  (charter §4) over the plain-English explanation bullets. */
export interface TroveExplanation {
  lead: React.ReactNode | null;
  items: ExplainerItem[];
}

/** The position card's four headings, in order (rails-ops
 *  standards/prose-limits-and-zones.md 3.3). */
const GROUPS = ["holdings", "risk", "rate", "history"] as const;
type Group = (typeof GROUPS)[number];
type Bullet = { group: Group; node: React.ReactNode };

/** The bullets in heading order; under their headings when two or more
 *  headings hold two or more bullets each, otherwise one list. */
function arrange(bullets: Bullet[]): ExplainerItem[] {
  const sorted = GROUPS.flatMap((g) => bullets.filter((b) => b.group === g));
  const dense = GROUPS.filter((g) => sorted.filter((b) => b.group === g).length >= 2).length;
  if (dense < 2) return sorted.map((b) => b.node);
  const heading: Record<Group, string> = {
    holdings: troveWords("heading_holdings"),
    risk: troveWords("heading_risk"),
    rate: troveWords("heading_rate"),
    history: troveWords("heading_history"),
  };
  return sorted.map((b) => ({ group: heading[b.group], node: b.node }));
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
  surplus,
  debtAtClose,
}: UseTroveExplanationItemsArgs): TroveExplanation {
  return useMemo(() => {
    if (trove.status === "liquidated") return buildLiquidatedItems(trove, surplus ?? null);
    if (trove.status === "closed")
      return buildClosedItems(trove, debtAtClose === 0 && trove.activity.redemptionCount > 0);
    return buildOpenItems({ trove, liveState, prices, debtInFront, queueDebtTotal });
  }, [trove, liveState, prices, debtInFront, trovesAhead, queueDebtTotal, surplus, debtAtClose]);
}

function buildLiquidatedItems(trove: TroveSummary, surplus: LiquityTroveSurplus | null): TroveExplanation {
  const items: Bullet[] = [];
  const add = (group: Group, node: React.ReactNode) => items.push({ group, node });
  const liquidationThreshold = getLiquidationThreshold(trove.collateralType);
  const truncatedTroveId = trove.id.length > 10 ? `${trove.id.slice(0, 6)}...${trove.id.slice(-4)}` : trove.id;
  const duration = formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt);
  const dateRange = formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt);

  // The status verdict — subject-first, one sentence, colon-terminated.
  const lead = (
    <span key="liquidation" className="text-rb-500">
      {troveNodes("liq_lead", {
        id: (
          <HighlightableValue type="troveId" state="after" value={trove.id ? parseInt(trove.id) : undefined}>
            {truncatedTroveId}
          </HighlightableValue>
        ),
        threshold: liquidationThreshold,
        coll_type: trove.collateralType,
      })}
    </span>
  );

  add(
    "history",
    <span key="lifecycle" className="text-rb-500">
      {troveNodes("liq_lifecycle", {
        duration: (
          <HighlightableValue type="duration" state="after">
            {duration}
          </HighlightableValue>
        ),
        range: (
          <HighlightableValue type="dateRange" state="after">
            {dateRange}
          </HighlightableValue>
        ),
      })}
    </span>,
  );

  const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
  if (nftUrl && trove.lastOwner) {
    const truncatedOwner = trove.ownerEns || `${trove.lastOwner.substring(0, 6)}...${trove.lastOwner.substring(38)}`;
    add(
      "history",
      <span key="nft-info" className="text-rb-500">
        {troveNodes("liq_nft", {
          nft: (
            <HighlightableValue type="nftToken" state="after">
              {troveWords("nft_word")}
            </HighlightableValue>
          ),
          id: (
            <HighlightableValue type="troveId" state="after" value={trove.id ? parseInt(trove.id) : undefined}>
              {`${trove.id.substring(0, 8)}...`}
            </HighlightableValue>
          ),
          // Value-as-escape-hatch (color-grammar §4a): the owner address rests
          // muted and hovers BLUE — it links out to the wallet-filtered
          // listing, so the hover reads "a way out of here", never foreground
          // ("this value matters here").
          owner: (
            <Link
              href={listingHrefForWallet("liquity-v2", trove.lastOwner) ?? "/ethereum/liquity-v2"}
              className="hover:text-blue-500 transition-colors"
            >
              <HighlightableValue type="ownerAddress" state="after">
                {truncatedOwner}
              </HighlightableValue>
            </Link>
          ),
        })}
      </span>,
    );
  }
  if (surplus) add("holdings", <SurplusBullet key="surplus" surplus={surplus} symbol={trove.collateralType} />);
  // No owner-linked NFT bullet without a lastOwner — the generic "ownership is
  // an NFT" rule is Layer-2 material, covered by the "?" modal's Trove NFT
  // concept (the 2026-07-25 Layer-2-in-Layer-1 audit).

  return { lead, items: arrange(items) };
}

function buildClosedItems(trove: TroveSummary, clearedByRedemption: boolean): TroveExplanation {
  const items: React.ReactNode[] = [];
  // Every bullet of a closed trove is History: one list, no heading.

  // The status verdict — subject-first, one sentence, colon-terminated
  // (absorbs the old "closure" bullet).
  const lead = (
    <span key="closure" className="text-rb-500">
      {troveWords(clearedByRedemption ? "closed_lead_redeemed" : "closed_lead_repaid")}
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
      {troveNodes("closed_peak_debt", {
        debt: (
          <Prov info={peakDebtProv}>
            <HighlightableValue type="peakDebt" state="after" value={trove.debt.peak}>
              {formatPrice(trove.debt.peak)} BOLD
            </HighlightableValue>
          </Prov>
        ),
      })}
    </span>,
  );

  items.push(
    <span key="peak-collateral" className="text-rb-500">
      {troveNodes("closed_peak_coll", {
        coll: (
          <Prov info={peakCollProv}>
            <HighlightableValue type="peakCollateral" state="after" value={trove.collateral.peakAmount}>
              {formatPrice(trove.collateral.peakAmount)} {trove.collateralType}
            </HighlightableValue>
          </Prov>
        ),
      })}
    </span>,
  );

  items.push(
    <span key="lifecycle" className="text-rb-500">
      {troveNodes("closed_lifecycle", {
        duration: (
          <HighlightableValue type="duration" state="after" value={durationInSeconds}>
            {duration}
          </HighlightableValue>
        ),
        range: (
          <HighlightableValue
            type="dateRange"
            state="after"
            value={`${trove.activity.createdAt}-${trove.activity.lastActivityAt}`}
          >
            {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
          </HighlightableValue>
        ),
      })}
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
  queueDebtTotal,
}: UseTroveExplanationItemsArgs): TroveExplanation {
  const items: Bullet[] = [];
  const add = (group: Group, node: React.ReactNode) => items.push({ group, node });
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

  // The status verdict — subject-first, one sentence, two figures, colon-
  // terminated (charter §4): the lead-in to the bullets. The two figures head
  // the summary card's stat chrome, so they carry the bold highlight; their
  // receipts ride the bullets below, which restate both.
  const lead = (
    <span key="lead" className="text-rb-500">
      {troveNodes("open_lead", {
        coll: (
          <H>
            {displayCollateral} {trove.collateralType}
          </H>
        ),
        debt: <H>{formatPrice(displayDebt)} BOLD</H>,
      })}
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
  const stateNote = troveWords(isLive ? "state_live" : "state_indexed");
  const coll_type = trove.collateralType;
  // The figures the card states come with the card's receipts (one builder
  // for both surfaces): collateral, rate, USD, ratio, liquidation price, the
  // yearly cost and the price.
  const fp = liquityTroveFaceProv({
    v: viewFromTroveSummary(trove, prices),
    live: liveFromTroveState(trove, liveState, prices),
    coll: displayCollateral,
    debt: displayDebt,
    rate: displayInterestRate,
    priceUsd: currentPrice ?? null,
    collUsd: collateralUsd,
    crPct: collateralRatio,
    liqPrice: null,
    mcrPct: mcr,
  });
  const priceProv = collateralPriceInfo(coll_type);

  const accruedProv: Provenance = {
    kind: "chain",
    summary: troveWords("prov_accrued"),
    contract: tmContract,
    via: stateOriginVia(isLive, troveWords("field_accrued_interest")),
  };
  const mgmtFeeProv: Provenance = {
    kind: "chain",
    summary: troveWords("prov_mgmt_fee"),
    contract: tmContract,
    via: stateOriginVia(isLive, troveWords("field_accrued_fee")),
  };
  const collProv = fp.coll;
  const rateProv = fp.rate;
  const collUsdProv = fp.collUsd;
  const crProv = fp.cr;
  const annualInterestProv = troveAnnualCostProv(displayRecordedDebt, displayInterestRate, isLive);
  const mgmtRateInput = {
    label: troveWords("input_mgmt_rate"),
    value: `${trove.batch.managementFee}%`,
    kind: "chain" as const,
  };
  const mgmtFeeRateProv: Provenance = {
    kind: "chain",
    summary: troveWords("prov_mgmt_rate"),
    via: troveWords("prov_mgmt_rate_via"),
  };
  if (displayAccruedInterest !== undefined) {
    add(
      "holdings",
      <span key="debt-breakdown" className="text-rb-500">
        {troveNodes("debt_breakdown", {
          interest: (
            <Prov info={accruedProv}>
              <HighlightableValue type="interest" state="after" value={displayAccruedInterest}>
                {formatPrice(displayAccruedInterest)} BOLD
              </HighlightableValue>
            </Prov>
          ),
        })}
        {trove.batch.isMember && displayManagementFee !== undefined && displayManagementFee > 0 && (
          <span>
            {" "}
            {troveNodes("debt_breakdown_fee", {
              fee: (
                <Prov info={mgmtFeeProv}>
                  <HighlightableValue type="managementFee" state="after" value={displayManagementFee}>
                    {formatPrice(displayManagementFee)} BOLD
                  </HighlightableValue>
                </Prov>
              ),
            })}
          </span>
        )}
      </span>,
    );
  }

  const collNode = (
    <Prov info={collProv}>
      <HighlightableValue type="collateral" state="after" value={displayCollateral}>
        {displayCollateral} {trove.collateralType}
      </HighlightableValue>
    </Prov>
  );
  if (hasLiveData && currentPrice && collateralUsd) {
    // The lead states the collateral; this bullet its worth and the price
    // that worth is at.
    add(
      "holdings",
      <span key="collateral-info" className="text-rb-500">
        {troveNodes("coll_worth", {
          usd: (
            <Prov info={collUsdProv}>
              <HighlightableValue type="collateralUsd" state="after" value={collateralUsd}>
                {formatUsdValue(collateralUsd)}
              </HighlightableValue>
            </Prov>
          ),
          coll_type,
          price: (
            <Prov info={priceProv}>
              <HighlightableValue type="currentPrice" state="after" value={currentPrice}>
                {formatUsdValue(currentPrice)}
              </HighlightableValue>
            </Prov>
          ),
        })}
      </span>,
    );
  } else {
    add(
      "holdings",
      <span key="collateral-info" className="text-rb-500">
        {troveNodes("coll_secures", { coll: collNode })}
      </span>,
    );
  }

  if (hasLiveData && collateralRatio) {
    // The ratio read as a multiple: a 211.6% CR means the collateral is worth
    // 2.12× the debt (NOT "211.6% more than" it — that reading overstates by
    // the debt itself). The 110% minimum states once, in the runway bullet.
    const currentCollateralRatio = collateralRatio.toFixed(1);
    const crMultiple = (collateralRatio / 100).toFixed(2);
    add(
      "risk",
      <span key="collateral-ratio" className="text-rb-500">
        {troveNodes("coll_ratio", {
          ratio: (
            <Prov info={crProv}>
              <HighlightableValue type="collRatio" state="after" value={parseFloat(currentCollateralRatio)}>
                {currentCollateralRatio}%
              </HighlightableValue>
            </Prov>
          ),
          multiple: crMultiple,
        })}
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
  const liqPriceProv = fp.liq;
  if (currentPrice && liqPrice && liqPrice > 0) {
    // The runway: the fall to the liquidation price, both the twins of the
    // card's "% from liquidation" and "Liquidates at" chrome, so both bold.
    const headroomPct = ((currentPrice - liqPrice) / currentPrice) * 100;
    add(
      "risk",
      <span key="price-runway" className="text-rb-500">
        {currentPrice <= liqPrice
          ? troveNodes("liq_runway_now", { coll_type })
          : troveNodes("liq_runway", {
              coll_type,
              drop: <span className="font-semibold text-foreground">{headroomPct.toFixed(1)}%</span>,
              price: (
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

  const rateNode = (
    <Prov info={rateProv}>
      <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
        {displayInterestRate}%
      </HighlightableValue>
    </Prov>
  );
  const annualInterestNode = (
    <Prov info={annualInterestProv}>
      <HighlightableValue type="annualInterest" state="after" value={annualInterestCost}>
        {formatPrice(annualInterestCost)} BOLD
      </HighlightableValue>
    </Prov>
  );
  if (trove.batch.isMember) {
    // Who sets the rate and the fee they charge; the yearly costs are the
    // card's costs line, and two figures fill the bullet.
    add(
      "rate",
      <span key="rate-cost" className="text-rb-500">
        {troveNodes("rate_cost_delegate", {
          rate: rateNode,
          delegate: batchManagerInfo?.website ? (
            <a
              href={batchManagerInfo.website}
              target="_blank"
              rel="noopener noreferrer"
              title={troveWords("delegate_visit", { name: batchManagerInfo.name })}
              className="inline-flex items-center gap-0.5 hover:text-pink-500 transition-colors"
            >
              <HighlightableValue type="delegateName" state="after">
                {batchManagerInfo.name}
              </HighlightableValue>
              <Link2 size={11} className="-rotate-45" aria-hidden="true" />
            </a>
          ) : (
            <HighlightableValue type="delegateName" state="after">
              {batchManagerInfo?.name || troveWords("delegate_fallback")}
            </HighlightableValue>
          ),
          fee_rate: (
            <Prov info={mgmtFeeRateProv}>
              <HighlightableValue type="managementFeeRate" state="after" value={trove.batch.managementFee}>
                {trove.batch.managementFee}%
              </HighlightableValue>
            </Prov>
          ),
        })}
      </span>,
    );
  } else {
    add(
      "rate",
      <span key="rate-cost" className="text-rb-500">
        {troveNodes("rate_cost_owner", { rate: rateNode, interest_year: annualInterestNode })}
      </span>,
    );
  }

  // The redemption queue: the debt redeemed before or with this trove and,
  // where the branch's whole queue is known, its share of it (the compact
  // runway chip's twin, so it carries the same receipt). The general
  // mechanics are Layer-2 material in the "?" modal (the 2026-07-25
  // Layer-2-in-Layer-1 audit).
  if (debtInFront !== null && debtInFront !== undefined) {
    const debtNode = (
      <Prov info={troveDebtInFrontProv(trove.collateralType)} value={formatExact(debtInFront)} symbol="BOLD">
        <span className="font-bold text-foreground">{formatApproximate(debtInFront)} BOLD</span>
      </Prov>
    );
    const queueShare =
      queueDebtTotal !== null && queueDebtTotal !== undefined && queueDebtTotal > 0
        ? Math.min(1, debtInFront / queueDebtTotal)
        : null;
    add(
      "risk",
      <span key="debt-in-front" className="text-rb-500">
        {queueShare != null
          ? troveNodes("queue_share", {
              share: (
                <Prov info={troveQueueShareProv(trove.collateralType)}>
                  <HighlightableValue type="queueShare" state="after" value={queueShare}>
                    {pct(queueShare)}
                  </HighlightableValue>
                </Prov>
              ),
              coll_type,
              debt: debtNode,
            })
          : troveNodes("debt_in_front", { debt: debtNode })}
      </span>,
    );
  }

  // Liquidation reserve moved to the economics panel's footnote — it's a
  // closing-accounting figure, not a headline-stat elaboration.

  const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
  if (nftUrl && trove.owner) {
    const truncatedOwner = trove.ownerEns || `${trove.owner.substring(0, 6)}...${trove.owner.substring(38)}`;
    add(
      "history",
      <span key="nft-info" className="text-rb-500">
        {troveNodes("nft_held", {
          nft: (
            <a
              href={nftUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={troveWords("nft_open_title")}
              className="inline-flex items-center gap-0.5 hover:text-pink-500 transition-colors"
            >
              <HighlightableValue type="nftToken" state="after">
                {troveWords("nft_word")}
              </HighlightableValue>
              <Link2 size={11} className="-rotate-45" aria-hidden="true" />
            </a>
          ),
          id: (
            <HighlightableValue
              type="troveId"
              state="after"
              value={parseInt(trove.id)}
            >{`${trove.id.substring(0, 8)}...`}</HighlightableValue>
          ),
          // Value-as-escape-hatch (color-grammar §4a): rests muted, hovers
          // BLUE — an internal link out of this panel.
          owner: (
            <Link
              href={listingHrefForWallet("liquity-v2", trove.owner) ?? "/ethereum/liquity-v2"}
              className="hover:text-blue-500 transition-colors"
            >
              <HighlightableValue type="ownerAddress" state="after">
                {truncatedOwner}
              </HighlightableValue>
            </Link>
          ),
        })}
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
    summary: troveWords("prov_redemption_count"),
    via: troveWords("prov_redemption_count_via"),
  };
  const ownerTxCountProv: Provenance = {
    kind: "derived",
    summary: troveWords("prov_owner_tx_count"),
    formula: troveWords("prov_owner_tx_count_formula"),
    via: troveWords("prov_owner_tx_count_via"),
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
  const time_word = troveWords(redemptionCount !== 1 ? "time_many" : "time_one");
  const tx_word = troveWords(ownerTxCount !== 1 ? "owner_tx_many" : "owner_tx_one");
  if (redemptionCount > 0 && ownerTxCount > 0) {
    add(
      "history",
      <span key="activity-counts" className="text-rb-500">
        {troveNodes("counts_both", {
          redemptions: redemptionCountNode,
          owner_txs: ownerTxCountNode,
          time_word,
          tx_word,
        })}
      </span>,
    );
  } else if (ownerTxCount > 0) {
    add(
      "history",
      <span key="activity-counts" className="text-rb-500">
        {troveNodes("counts_owner", { owner_txs: ownerTxCountNode, tx_word })}
      </span>,
    );
  } else if (redemptionCount > 0) {
    add(
      "history",
      <span key="activity-counts" className="text-rb-500">
        {troveNodes("counts_redeemed", { redemptions: redemptionCountNode, time_word })}
      </span>,
    );
  }

  return { lead, items: arrange(items) };
}
