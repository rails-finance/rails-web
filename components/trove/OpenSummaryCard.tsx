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
import { getLiquidationThreshold } from "@/lib/utils/liquidation-utils";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { Link2, Users, Loader2 } from "lucide-react";
import type { Transaction } from "@/types/api/troveHistory";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { FadeNumber } from "@/components/ui/FadeNumber";

interface OpenTroveCardProps {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  loadingStatus?: {
    message: string | null;
    snapshotDate?: number;
  };
  summaryExplanationOpen?: boolean;
  onToggleSummaryExplanation?: (isOpen: boolean) => void;
}

function OpenTroveCardContent({
  trove,
  liveState,
  prices,
  loadingStatus,
  summaryExplanationOpen,
  onToggleSummaryExplanation,
}: OpenTroveCardProps) {
  const { hoveredValue, setHoverEnabled } = useHover();

  const batchManagerInfo = getBatchManagerByAddress(trove.batch.manager);

  // Progressive enhancement: Use DB snapshot initially, then enhance with live blockchain data
  // DB snapshot provides immediate display, blockchain data animates in when ready
  const displayDebt = liveState?.debt.entire ?? trove.debt.current;
  const displayRecordedDebt = liveState?.debt.recorded ?? trove.debt.current;
  const displayAccruedInterest = liveState?.debt.accruedInterest; // undefined until blockchain loads
  const displayInterestRate = liveState?.rates.annualInterestRate ?? trove.metrics.interestRate;
  const displayManagementFee = liveState?.rates.accruedBatchManagementFee; // undefined until blockchain loads
  const displayCollateral = liveState?.collateral.entire ?? trove.collateral.amount;

  // Recalculate interest costs from live data
  const annualInterestCost = (displayRecordedDebt * displayInterestRate) / 100;
  const dailyInterestCost = annualInterestCost / 365;
  const annualManagementFee = (displayRecordedDebt * trove.batch.managementFee) / 100;
  const dailyManagementFee = annualManagementFee / 365;

  // Calculate live collateral metrics (only when both liveState and prices are available)
  const hasLiveData = liveState && prices;
  const collateralTokenKey = trove.collateralType.toLowerCase() as keyof OraclePricesData;
  const currentPrice = hasLiveData ? prices[collateralTokenKey] : null;
  const collateralUsd = hasLiveData && currentPrice ? displayCollateral * currentPrice : null;
  const collateralRatio = hasLiveData && collateralUsd && displayDebt > 0 ? (collateralUsd / displayDebt) * 100 : null;

  // Create hover context items
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Debt breakdown (only show when we have live blockchain data)
    if (displayAccruedInterest !== undefined) {
      items.push(
        <span key="debt-breakdown" className="text-slate-500">
          Current debt of{" "}
          <HighlightableValue type="debt" state="after" value={displayDebt}>
            {formatPrice(displayDebt)} BOLD
          </HighlightableValue>{" "}
          consists of{" "}
          <HighlightableValue type="principal" state="after" value={displayRecordedDebt}>
            {formatPrice(displayRecordedDebt)} BOLD
          </HighlightableValue>{" "}
          principal plus{" "}
          <HighlightableValue type="interest" state="after" value={displayAccruedInterest}>
            {formatPrice(displayAccruedInterest)} BOLD
          </HighlightableValue>{" "}
          accrued interest
          {trove.batch.isMember && displayManagementFee !== undefined && displayManagementFee > 0 && (
            <span>
              {" "}
              and{" "}
              <HighlightableValue type="managementFee" state="after" value={displayManagementFee}>
                {formatPrice(displayManagementFee)} BOLD
              </HighlightableValue>{" "}
              delegate fees
            </span>
          )}
        </span>,
      );
    }

    // Collateral info
    if (hasLiveData && currentPrice && collateralUsd) {
      items.push(
        <span key="collateral-info" className="text-slate-500">
          <HighlightableValue type="collateral" state="after" value={displayCollateral}>
            {displayCollateral} {trove.collateralType}
          </HighlightableValue>{" "}
          collateral worth{" "}
          <HighlightableValue type="collateralUsd" state="after" value={collateralUsd}>
            {formatUsdValue(collateralUsd)}
          </HighlightableValue>{" "}
          at current price of{" "}
          <HighlightableValue type="currentPrice" state="after" value={currentPrice}>
            {formatUsdValue(currentPrice)}
          </HighlightableValue>{" "}
          / {trove.collateralType} secures this position
        </span>,
      );
    } else {
      items.push(
        <span key="collateral-info" className="text-slate-500">
          <HighlightableValue type="collateral" state="after" value={displayCollateral}>
            {displayCollateral} {trove.collateralType}
          </HighlightableValue>{" "}
          collateral secures this position
        </span>,
      );
    }

    // Collateral ratio explanation
    if (hasLiveData && collateralRatio) {
      const currentCollateralRatio = collateralRatio.toFixed(1);
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
          means the collateral is worth {currentCollateralRatio}% more than the debt (minimum {liquidationThreshold}% to
          avoid liquidation)
        </span>,
      );
    }

    // Interest rate info
    if (trove.batch.isMember) {
      items.push(
        <span key="delegated-rate" className="text-slate-500">
          <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
            {displayInterestRate}%
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
          <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
            {displayInterestRate}%
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
          <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
            {displayInterestRate}%
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
  }, [
    trove,
    displayDebt,
    displayRecordedDebt,
    displayAccruedInterest,
    displayInterestRate,
    displayManagementFee,
    displayCollateral,
    dailyInterestCost,
    annualInterestCost,
    dailyManagementFee,
    annualManagementFee,
    batchManagerInfo,
    hoveredValue,
    hasLiveData,
    currentPrice,
    collateralUsd,
    collateralRatio,
  ]);

  return (
    <div>
      {/* Main trove card */}
      <div className="relative rounded-lg text-slate-600 dark:text-slate-500 bg-slate-50 dark:bg-slate-900">
        {/* Header section */}
        <div className="grid grid-cols-[auto_1fr] gap-2 p-4 pb-0 items-start">
          <div className="flex items-center gap-2">
            {/* Status */}
            <span className="font-bold tracking-wider px-2 py-0.5 text-white bg-green-500 dark:bg-green-950 dark:text-green-500/70 rounded-xs text-xs">
              ACTIVE
            </span>
            {/* Loading spinner */}
            {(!hasLiveData || !currentPrice) && (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            )}
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
            {hasLiveData && currentPrice ? (
              <>
                <HighlightableValue type="debt" state="after" value={displayDebt} asBlock={true}>
                  <div className="flex items-center">
                    <h3 className="text-3xl font-bold">
                      <FadeNumber value={displayDebt} formatFn={formatPrice} animateOnMount={true} />
                    </h3>
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
                        value={displayRecordedDebt}
                      >
                        <FadeNumber value={displayRecordedDebt} formatFn={formatPrice} animateOnMount={true} />
                      </HighlightableValue>{" "}
                      +{" "}
                      {displayAccruedInterest !== undefined ? (
                        <HighlightableValue
                          type="interest"
                          state="after"
                          className="text-slate-500"
                          value={displayAccruedInterest}
                        >
                          <FadeNumber value={displayAccruedInterest} formatFn={formatPrice} animateOnMount={true} />
                        </HighlightableValue>
                      ) : (
                        <span className="inline-block h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                      )}{" "}
                      interest
                      {trove.batch.isMember && displayManagementFee !== undefined && (
                        <span className="text-pink-500">
                          {" "}
                          +&nbsp;
                          <HighlightableValue
                            type="managementFee"
                            state="after"
                            className="text-pink-500"
                            value={displayManagementFee}
                          >
                            <FadeNumber value={displayManagementFee} formatFn={formatPrice} animateOnMount={true} />
                          </HighlightableValue>
                          &nbsp;delegate&nbsp;fee
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center">
                  <div className="h-9 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <span className="ml-2 text-green-600 text-lg">
                    <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-600">Backed by</p>
              {hasLiveData && currentPrice ? (
                <div className="flex items-center">
                  <span className="flex items-center">
                    <p className="text-xl font-bold mr-1">
                      <HighlightableValue type="collateral" state="after" value={displayCollateral}>
                        <FadeNumber value={displayCollateral} animateOnMount={true} />
                      </HighlightableValue>
                    </p>
                    <span className="flex items-center">
                      <TokenIcon assetSymbol={trove.collateralType} />
                    </span>
                  </span>
                  <div className="ml-1 flex items-center">
                    {collateralUsd !== null && collateralUsd > 0 ? (
                      <span className="text-xs flex items-center border-l-2 border-r-2 border-green-500 rounded-sm px-1 py-0">
                        <HighlightableValue
                          className="text-green-500"
                          type="collateralUsd"
                          state="after"
                          value={collateralUsd}
                        >
                          <FadeNumber value={collateralUsd} formatFn={formatUsdValue} animateOnMount={true} />
                        </HighlightableValue>
                      </span>
                    ) : displayCollateral === 0 ? (
                      <span className="text-xs flex items-center border-l-2 border-r-2 border-slate-300 dark:border-slate-600 rounded-sm px-1 py-0 text-slate-400">
                        N/A
                      </span>
                    ) : (
                      <span className="text-xs flex items-center border-l-2 border-r-2 border-slate-300 dark:border-slate-600 rounded-sm px-1 py-0">
                        <span className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mr-1" />
                  <span className="flex items-center">
                    <TokenIcon assetSymbol={trove.collateralType} />
                  </span>
                  <div className="ml-1 flex items-center">
                    <span className="text-xs flex items-center border-l-2 border-r-2 border-slate-300 dark:border-slate-600 rounded-sm px-1 py-0">
                      <span className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-600">Collateral Ratio</p>
              {hasLiveData && currentPrice ? (
                collateralRatio !== null && collateralRatio > 0 ? (
                  <p className="text-xl font-semibold">
                    <HighlightableValue type="collRatio" state="after" value={parseFloat(collateralRatio.toFixed(1))}>
                      <FadeNumber value={collateralRatio} decimals={1} animateOnMount={true} />%
                    </HighlightableValue>
                  </p>
                ) : (
                  <p className="text-xl font-semibold text-slate-400">N/A</p>
                )
              ) : (
                <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              )}
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
              {hasLiveData && currentPrice ? (
                <>
                  <div className="text-xl font-medium">
                    <HighlightableValue type="interestRate" state="after" value={displayInterestRate}>
                      <FadeNumber value={displayInterestRate} decimals={2} animateOnMount={true} />%
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
                        <FadeNumber value={dailyInterestCost} formatFn={formatPrice} animateOnMount={true} />
                      </HighlightableValue>{" "}
                      day /{" "}
                      <HighlightableValue
                        type="annualInterest"
                        state="after"
                        className="text-slate-500"
                        value={annualInterestCost}
                      >
                        <FadeNumber value={annualInterestCost} formatFn={formatPrice} animateOnMount={true} />
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
                          value={dailyManagementFee}
                        >
                          <FadeNumber value={dailyManagementFee} formatFn={formatPrice} animateOnMount={true} />
                        </HighlightableValue>{" "}
                        day /{" "}
                        <HighlightableValue
                          type="annualManagementFee"
                          state="after"
                          className="text-pink-500"
                          value={annualManagementFee}
                        >
                          <FadeNumber value={annualManagementFee} formatFn={formatPrice} animateOnMount={true} />
                        </HighlightableValue>{" "}
                        year
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  </div>
                  {trove.batch.isMember && (
                    <>
                      <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-0.5" />
                      <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-0.5" />
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between items-end">
            <CardFooter trove={trove} />

            {/* Loading status or current price indicator */}
            {loadingStatus?.message ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 text-right">
                {loadingStatus.snapshotDate && <div>Snapshot from {formatDate(loadingStatus.snapshotDate)}.</div>}
                <div className="italic">{loadingStatus.message}</div>
              </div>
            ) : (
              hasLiveData &&
              currentPrice && (
                <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 shadow-b shadow-slate-900/50 rounded-l p-2 -mr-4.5">
                  <TokenIcon assetSymbol={trove.collateralType} />
                  <HighlightableValue
                    type="currentPrice"
                    state="after"
                    className="text-xs text-green-500"
                    value={currentPrice}
                  >
                    {formatUsdValue(currentPrice)}
                  </HighlightableValue>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Drawer - 20px narrower than the card above */}
      <div className="px-2.5">
        <ExplanationPanel
          items={hoverContextItems}
          onToggle={(isOpen) => {
            setHoverEnabled(isOpen);
            onToggleSummaryExplanation?.(isOpen);
          }}
          defaultOpen={summaryExplanationOpen ?? false}
        />
      </div>
    </div>
  );
}

export function OpenSummaryCard({
  trove,
  liveState,
  prices,
  loadingStatus,
  summaryExplanationOpen,
  onToggleSummaryExplanation,
}: OpenTroveCardProps) {
  return (
    <HoverProvider>
      <OpenTroveCardContent
        trove={trove}
        liveState={liveState}
        prices={prices}
        loadingStatus={loadingStatus}
        summaryExplanationOpen={summaryExplanationOpen}
        onToggleSummaryExplanation={onToggleSummaryExplanation}
      />
    </HoverProvider>
  );
}
