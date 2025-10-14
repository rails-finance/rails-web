"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { CardFooter } from "./components/CardFooter";
import { TroveSummary } from "@/types/api/trove";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { formatDate, formatDuration } from "@/lib/date";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { generateInterestInfo, generateInterestInfoWithTimeline } from "@/lib/utils/interest-calculator";
import { getLiquidationThreshold } from "@/lib/utils/liquidation-utils";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { Link2, Users } from "lucide-react";
import type { Transaction } from "@/types/api/troveHistory";

interface OpenTroveCardProps {
  trove: TroveSummary;
  timeline?: Transaction[];
}

function OpenTroveCardContent({ trove, timeline }: OpenTroveCardProps) {
  const { hoveredValue, setHoverEnabled } = useHover();

  const batchManagerInfo = getBatchManagerByAddress(trove.batch.manager);

  const interestInfo = useMemo(() => {
    // Use timeline-based calculation if available and trove is in a batch
    if (timeline && timeline.length > 0 && trove.batch.isMember) {
      return generateInterestInfoWithTimeline(
        timeline,
        trove.debt.current,
        trove.metrics.interestRate,
        trove.batch.managementFee,
        trove.batch.isMember,
        trove.batch.manager || undefined,
      );
    }

    // Fallback to simple calculation
    const lastUpdate = trove.activity.lastActivityAt;
    const recordedDebt = trove.debt.current;
    const interestRate = trove.metrics.interestRate;

    return generateInterestInfo(
      recordedDebt,
      interestRate,
      lastUpdate,
      trove.batch.isMember,
      trove.batch.managementFee,
      trove.batch.manager || undefined,
    );
  }, [trove, timeline]);

  // Calculate display value with interest
  const debtWithInterest = interestInfo.entireDebt;

  // Calculate daily and annual interest cost
  const dailyInterestCost = (interestInfo.recordedDebt * interestInfo.annualInterestRatePercent) / 100 / 365;
  const annualInterestCost = (interestInfo.recordedDebt * interestInfo.annualInterestRatePercent) / 100;

  // Create hover context items
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Debt breakdown
    items.push(
      <span key="debt-breakdown" className="text-slate-500">
        Current debt of{" "}
        <HighlightableValue type="debt" state="after" value={debtWithInterest}>
          {formatPrice(debtWithInterest)} BOLD
        </HighlightableValue>{" "}
        consists of{" "}
        <HighlightableValue type="principal" state="after" value={interestInfo.recordedDebt}>
          {formatPrice(interestInfo.recordedDebt)} BOLD
        </HighlightableValue>{" "}
        principal plus{" "}
        <HighlightableValue type="interest" state="after" value={interestInfo.accruedInterest}>
          {formatPrice(interestInfo.accruedInterest)} BOLD
        </HighlightableValue>{" "}
        accrued interest
        {interestInfo.isBatchMember &&
          interestInfo.accruedManagementFees !== undefined &&
          interestInfo.accruedManagementFees > 0 && (
            <span>
              {" "}
              and{" "}
              <HighlightableValue type="managementFee" state="after" value={interestInfo.accruedManagementFees}>
                {formatPrice(interestInfo.accruedManagementFees)} BOLD
              </HighlightableValue>{" "}
              delegate fees
            </span>
          )}
      </span>,
    );

    // Collateral info
    const currentPrice = trove.collateral.valueUsd / trove.collateral.amount;
    items.push(
      <span key="collateral-info" className="text-slate-500">
        <HighlightableValue type="collateral" state="after" value={trove.collateral.amount}>
          {trove.collateral.amount} {trove.collateralType}
        </HighlightableValue>{" "}
        collateral worth{" "}
        <HighlightableValue type="collateralUsd" state="after" value={trove.collateral.valueUsd}>
          {formatUsdValue(trove.collateral.valueUsd)}
        </HighlightableValue>{" "}
        at current price of{" "}
        <HighlightableValue type="currentPrice" state="after" value={currentPrice}>
          {formatUsdValue(currentPrice)}
        </HighlightableValue>{" "}
        / {trove.collateralType} secures this position
      </span>,
    );

    // Collateral ratio explanation
    const currentCollateralRatio = trove.metrics.collateralRatio.toFixed(1);
    const liquidationThreshold = getLiquidationThreshold(trove.collateralType);

    items.push(
      <span key="collateral-ratio" className="text-slate-500">
        Collateral ratio of{" "}
        <HighlightableValue
          type="collRatio"
          state="after"
          value={
            typeof currentCollateralRatio === "string" ? parseFloat(currentCollateralRatio) : currentCollateralRatio
          }
        >
          {currentCollateralRatio}%
        </HighlightableValue>{" "}
        means the collateral is worth {currentCollateralRatio}% more than the debt (minimum {liquidationThreshold}% to avoid liquidation)
      </span>,
    );

    // Interest rate info
    if (trove.batch.isMember) {
      const dailyManagementFee = (interestInfo.recordedDebt * trove.batch.managementFee) / 100 / 365;
      const annualManagementFee = (interestInfo.recordedDebt * trove.batch.managementFee) / 100;

      items.push(
        <span key="delegated-rate" className="text-slate-500">
          <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>
            {trove.metrics.interestRate}%
          </HighlightableValue>{" "}
          interest rate managed by{" "}
          <HighlightableValue type="delegateName" state="after">
            {batchManagerInfo?.name || "Batch Manager"}
          </HighlightableValue>
          {batchManagerInfo?.website && (
            <a
              href={batchManagerInfo.website}
              target="_blank"
              rel="noopener noreferrer"
              className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-blue-500 w-4 h-4 rounded-full transition-colors hover:bg-blue-600 text-white"
              aria-label={`Visit ${batchManagerInfo.name} website`}
            >
              <Link2 className="w-3 h-3" />
            </a>
          )}{" "}
          with +
          <HighlightableValue type="managementFeeRate" state="after" value={trove.batch.managementFee}>
            {trove.batch.managementFee}%
          </HighlightableValue>{" "}
          management fee costing ~
          <HighlightableValue type="dailyManagementFee" state="after" value={dailyManagementFee}>
            {formatPrice(dailyManagementFee)} BOLD
          </HighlightableValue>{" "}
          per day or{" "}
          <HighlightableValue type="annualManagementFee" state="after" value={annualManagementFee}>
            {formatPrice(annualManagementFee)} BOLD
          </HighlightableValue>{" "}
          per year
        </span>,
      );
    } else if (trove.batch.isMember) {
      items.push(
        <span key="delegated-rate" className="text-slate-500">
          <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>
            {trove.metrics.interestRate}%
          </HighlightableValue>{" "}
          interest rate managed by{" "}
          <HighlightableValue type="delegateName" state="after">
            {batchManagerInfo?.name || "Batch Manager"}
          </HighlightableValue>
          {batchManagerInfo?.website && (
            <a
              href={batchManagerInfo.website}
              target="_blank"
              rel="noopener noreferrer"
              className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-blue-500 w-4 h-4 rounded-full transition-colors hover:bg-blue-600 text-white"
              aria-label={`Visit ${batchManagerInfo.name} website`}
            >
              <Link2 className="w-3 h-3" />
            </a>
          )}{" "}
          with +
          <HighlightableValue type="managementFeeRate" state="after" value={trove.batch.managementFee}>
            {trove.batch.managementFee}%
          </HighlightableValue>{" "}
          management fee
        </span>,
      );
    } else {
      items.push(
        <span key="self-managed-rate" className="text-slate-500">
          Self-managed interest rate of{" "}
          <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>
            {trove.metrics.interestRate}%
          </HighlightableValue>{" "}
          accrues continuously on the principal debt
        </span>,
      );
    }

    // Interest cost breakdown (only for self-managed or when no management fee info)
    if (!trove.batch.isMember) {
      items.push(
        <span key="interest-cost" className="text-slate-500">
          Current interest costs approximately{" "}
          <HighlightableValue type="dailyInterest" state="after" value={dailyInterestCost}>
            {formatPrice(dailyInterestCost)} BOLD
          </HighlightableValue>{" "}
          per day or{" "}
          <HighlightableValue type="annualInterest" state="after" value={annualInterestCost}>
            {formatPrice(annualInterestCost)} BOLD
          </HighlightableValue>{" "}
          per year
        </span>,
      );
    } else {
      // For batch members, show interest costs separately
      items.push(
        <span key="interest-cost" className="text-slate-500">
          Base interest costs approximately{" "}
          <HighlightableValue type="dailyInterest" state="after" value={dailyInterestCost}>
            {formatPrice(dailyInterestCost)} BOLD
          </HighlightableValue>{" "}
          per day or{" "}
          <HighlightableValue type="annualInterest" state="after" value={annualInterestCost}>
            {formatPrice(annualInterestCost)} BOLD
          </HighlightableValue>{" "}
          per year
        </span>,
      );
    }

    // Add NFT information if NFT URL is available
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl && trove.owner) {
      const truncatedOwner = trove.ownerEns || `${trove.owner.substring(0, 6)}...${trove.owner.substring(38)}`;
      items.push(
        <span key="nft-info" className="text-slate-500">
          A transferable{" "}
          <HighlightableValue type="nftToken" state="after">
            NFT
          </HighlightableValue>{" "}
          representing trove{" "}
          <HighlightableValue
            type="troveId"
            state="after"
            value={parseInt(trove.id)}
          >{`${trove.id.substring(0, 8)}...`}</HighlightableValue>{" "}
          is held by wallet{" "}
          <Link
            href={`/troves?ownerAddress=${trove.owner}`}
            className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            <HighlightableValue type="ownerAddress" state="after">
              {truncatedOwner}
            </HighlightableValue>
          </Link>
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>,
      );
    }

    return items;
  }, [trove, interestInfo, debtWithInterest, dailyInterestCost, annualInterestCost, batchManagerInfo, hoveredValue]);

  return (
    <div>
      {/* Main trove card */}
      <div className="relative rounded-lg text-slate-600 dark:text-slate-500 bg-slate-50 dark:bg-slate-900">
        {/* Header section */}
        <div className="grid grid-cols-[auto_1fr] gap-2 p-4 pb-0 items-start">
          <div className="flex items-center">
            {/* Status */}
            <span className="font-bold tracking-wider px-2 py-0.5 text-white bg-green-500 dark:bg-green-950 dark:text-green-500/70 rounded-xs text-xs">
              ACTIVE
            </span>
          </div>
          {/* Metrics moved to the right */}
          <div className="flex items-center gap-2 text-xs flex-wrap justify-end pt-0.5">
            <span className="text-slate-600 dark:text-slate-400">Opened {formatDate(trove.activity.createdAt)}</span>
						<div className="flex items-center gap-1">
            <span className="text-slate-600 dark:text-slate-400 rounded-lg bg-slate-200 dark:bg-slate-700 px-2">
              {formatDuration(trove.activity.createdAt, new Date())}
            </span>
            {trove.activity.redemptionCount > 0 && (
              <span className="inline-flex items-center text-orange-400">
                <Icon name="triangle" size={12} />
                <span className="ml-1">{trove.activity.redemptionCount}</span>
              </span>
            )}
            <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
              <Icon name="arrow-left-right" size={12} />
              <span className="ml-1">{trove.activity.transactionCount - trove.activity.redemptionCount}</span>
            </span>
          </div>
          </div>
        </div>

        {/* Content section with standard grid layout */}
        <div className="grid grid-cols-1 pt-2 p-4 gap-4">
          {/* Main value */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Debt</p>
            <HighlightableValue type="debt" state="after" value={debtWithInterest} asBlock={true}>
              <div className="flex items-center">
                <h3 className="text-3xl font-bold">{formatPrice(debtWithInterest)}</h3>
                <span className="ml-2 text-green-600 text-lg">
                  <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
                </span>
              </div>
            </HighlightableValue>
            {/* Debt breakdown */}
            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
              <div className="flex items-center gap-1 ">
                <span>
                  <HighlightableValue
                    type="principal"
                    state="after"
                    className="text-slate-500"
                    value={interestInfo.recordedDebt}
                  >
                    {formatPrice(interestInfo.recordedDebt)}
                  </HighlightableValue>{" "}
                  +{" "}
                  <HighlightableValue
                    type="interest"
                    state="after"
                    className="text-slate-500"
                    value={interestInfo.accruedInterest}
                  >
                    {formatPrice(interestInfo.accruedInterest)}
                  </HighlightableValue>{" "}
                  interest
                  {interestInfo.isBatchMember &&
                    interestInfo.accruedManagementFees !== undefined &&
                    interestInfo.accruedManagementFees > 0 && (
                      <span className="text-pink-500">
                        {" "}
                        +&nbsp;
                        <HighlightableValue
                          type="managementFee"
                          state="after"
                          className="text-pink-500"
                          value={interestInfo.accruedManagementFees}
                        >
                          {formatPrice(interestInfo.accruedManagementFees)}
                        </HighlightableValue>&nbsp;delegate&nbsp;fee
                      </span>
                    )}
                </span>
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-600">Backed by</p>
              <div className="flex items-center">
                <span className="flex items-center">
                  <p className="text-xl font-bold mr-1">
                    <HighlightableValue type="collateral" state="after" value={trove.collateral.amount}>
                      {trove.collateral.amount}
                    </HighlightableValue>
                  </p>
                  <span className="flex items-center">
                    <TokenIcon assetSymbol={trove.collateralType} />
                  </span>
                </span>
                <div className="ml-1 flex items-center">
                  <span className="text-xs flex items-center border-l-2 border-r-2 border-green-500 rounded-sm px-1 py-0">
                    <HighlightableValue
                      className="text-green-500"
                      type="collateralUsd"
                      state="after"
                      value={trove.collateral.valueUsd}
                    >
                      {formatUsdValue(trove.collateral.valueUsd)}
                    </HighlightableValue>
                  </span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-600">Collateral Ratio</p>
              <p className="text-xl font-semibold">
                <HighlightableValue
                  type="collRatio"
                  state="after"
                  value={parseFloat(trove.metrics.collateralRatio.toFixed(1))}
                >
                  {trove.metrics.collateralRatio.toFixed(1)}%
                </HighlightableValue>
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                {trove.batch.isMember && (
                  <span className="inline-flex items-center text-xs font-semibold px-1 py-0.5 bg-pink-300 text-white dark:bg-pink-900/50 dark:text-pink-400 rounded-xs">
                    <Users className="w-3 h-3" aria-hidden="true" />
                  </span>
                )}
                <p className="text-xs font-bold text-slate-400 dark:text-slate-600">Interest Rate</p>
              </div>
              <div className="text-xl font-medium">
                <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>
                  {trove.metrics.interestRate}%
                </HighlightableValue>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                <span>
                  ~{" "}
                  <HighlightableValue
                    type="dailyInterest"
                    state="after"
                    className="text-slate-500"
                    value={dailyInterestCost}
                  >
                    {formatPrice(dailyInterestCost)}
                  </HighlightableValue>{" "}
                  day /{" "}
                  <HighlightableValue
                    type="annualInterest"
                    state="after"
                    className="text-slate-500"
                    value={annualInterestCost}
                  >
                    {formatPrice(annualInterestCost)}
                  </HighlightableValue>{" "}
                  year
                </span>
              </div>
              {trove.batch.isMember && (
                <>
                  <p className="text-xs text-slate-500 mt-0.5">
                    +{" "}
                    <HighlightableValue
                      type="managementFeeRate"
                      state="after"
                      value={trove.batch.managementFee}
                      className="text-pink-500"
                    >
                      {trove.batch.managementFee}%
                    </HighlightableValue>{" "}
                    <HighlightableValue type="delegateName" state="after" className="text-pink-500">
                      {batchManagerInfo?.name || "Batch Manager"}
                    </HighlightableValue>
                  </p>
                  <div className="text-xs text-pink-500 mt-0.5">
                    ~{" "}
                    <HighlightableValue
                      type="dailyManagementFee"
                      state="after"
                      className="text-pink-500"
                      value={(interestInfo.recordedDebt * trove.batch.managementFee) / 100 / 365}
                    >
                      {formatPrice((interestInfo.recordedDebt * trove.batch.managementFee) / 100 / 365)}
                    </HighlightableValue>{" "}
                    day /{" "}
                    <HighlightableValue
                      type="annualManagementFee"
                      state="after"
                      className="text-pink-500"
                      value={(interestInfo.recordedDebt * trove.batch.managementFee) / 100}
                    >
                      {formatPrice((interestInfo.recordedDebt * trove.batch.managementFee) / 100)}
                    </HighlightableValue>{" "}
                    year
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between items-end">
            <CardFooter trove={trove} />

            {/* Latest collateral value - only show on trove view page */}
            <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 shadow-b shadow-slate-900/50 rounded-l p-2 -mr-4.5">
              <TokenIcon assetSymbol={trove.collateralType} />
              <HighlightableValue
                type="currentPrice"
                state="after"
                className="text-xs text-green-500"
                value={trove.collateral.valueUsd / trove.collateral.amount}
              >
                {formatUsdValue(trove.collateral.valueUsd / trove.collateral.amount)}
              </HighlightableValue>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer - 20px narrower than the card above */}
      <div className="px-2.5">
        <ExplanationPanel
          items={hoverContextItems}
          onToggle={(isOpen) => {
            setHoverEnabled(isOpen);
          }}
          defaultOpen={false}
        />
      </div>
    </div>
  );
}

export function OpenSummaryCard({ trove, timeline }: OpenTroveCardProps) {
  return (
    <HoverProvider>
      <OpenTroveCardContent trove={trove} timeline={timeline} />
    </HoverProvider>
  );
}
