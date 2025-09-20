"use client";

import { useMemo, useState } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { TroveSummary } from "@/types/api/trove";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";
import { formatDate, formatDuration } from "@/lib/date";
import { toLocaleStringHelper, formatPrice, formatUsdValue } from "@/lib/utils/format";
import { InterestCalculator } from "@/lib/utils/interest-calculator";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";

interface OpenTroveCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
}

function OpenTroveCardContent({ trove, showViewButton = false }: OpenTroveCardProps) {
  const [showHoverContext, setShowHoverContext] = useState(false);
  const { hoveredValue, hoverEnabled, setHoverEnabled } = useHover();
  const calculator = useMemo(() => new InterestCalculator(), []);
  
  const batchManagerInfo = useMemo(() => {
    if (trove.batch?.manager) {
      return getBatchManagerInfo(trove.batch.manager);
    }
    return undefined;
  }, [trove.batch?.manager]);

  // Generate interest info if not provided by backend
  const interestInfo = useMemo(() => {
    // Mock data for demonstration - in production this should come from the API
    // Using the example values from the prototype
    const mockLastUpdate = Date.now() / 1000 - (68 * 24 * 60 * 60); // 68 days ago
    // Convert from wei (18 decimals) to normal units
    const recordedDebt = parseFloat(trove.debt.currentRaw) / 1e18;
    const interestRate = trove.metrics.interestRate;
    
    return calculator.generateInterestInfo(
      recordedDebt,
      interestRate,
      mockLastUpdate,
      trove.batch.isMember,
      trove.batch.managementFee,
      trove.batch.manager || undefined
    );
  }, [trove, calculator]);

  // Calculate display value with interest
  const debtWithInterest = interestInfo ? interestInfo.entireDebt : trove.debt.current;
  
  // Calculate daily and annual interest cost
  const dailyInterestCost = useMemo(() => {
    if (!interestInfo) return 0;
    return (interestInfo.recordedDebt * interestInfo.annualInterestRatePercent / 100) / 365;
  }, [interestInfo]);
  
  const annualInterestCost = useMemo(() => {
    if (!interestInfo) return 0;
    return interestInfo.recordedDebt * interestInfo.annualInterestRatePercent / 100;
  }, [interestInfo]);

  // Create hover context items
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Debt breakdown
    if (interestInfo) {
      items.push(
        <span key="debt-breakdown" className="text-slate-500">
          Current debt of <HighlightableValue type="debt" state="after" value={debtWithInterest}>{formatPrice(debtWithInterest)} BOLD</HighlightableValue> consists of{" "}
          <HighlightableValue type="principal" state="after" value={interestInfo.recordedDebt}>{formatPrice(interestInfo.recordedDebt)} BOLD</HighlightableValue> principal plus{" "}
          <HighlightableValue type="interest" state="after" value={interestInfo.accruedInterest}>{formatPrice(interestInfo.accruedInterest)} BOLD</HighlightableValue> accrued interest
          {interestInfo.isBatchMember && interestInfo.accruedManagementFees !== undefined && interestInfo.accruedManagementFees > 0 && (
            <span> and <HighlightableValue type="managementFee" state="after" value={interestInfo.accruedManagementFees}>{formatPrice(interestInfo.accruedManagementFees)} BOLD</HighlightableValue> delegate fees</span>
          )}
        </span>
      );
    }

    // Collateral info
    items.push(
      <span key="collateral-info" className="text-slate-500">
        <HighlightableValue type="collateral" state="after" value={trove.collateral.amount}>{trove.collateral.amount} {trove.collateralType}</HighlightableValue> collateral worth{" "}
        <HighlightableValue type="collateralUsd" state="after" value={trove.collateral.valueUsd}>{formatUsdValue(trove.collateral.valueUsd)}</HighlightableValue> secures this position
      </span>
    );

    // Collateral ratio explanation
    const currentCollateralRatio = interestInfo && trove.collateral.valueUsd > 0 
      ? ((trove.collateral.valueUsd / debtWithInterest) * 100).toFixed(1)
      : trove.metrics.collateralRatio;
    
    items.push(
      <span key="collateral-ratio" className="text-slate-500">
        Collateral ratio of <HighlightableValue type="collRatio" state="after" value={typeof currentCollateralRatio === 'string' ? parseFloat(currentCollateralRatio) : currentCollateralRatio}>{currentCollateralRatio}%</HighlightableValue> means the collateral is worth{" "}
        {currentCollateralRatio}% more than the debt (minimum 110% to avoid liquidation)
      </span>
    );

    // Interest rate info
    if (trove.batch.isMember) {
      items.push(
        <span key="delegated-rate" className="text-slate-500">
          Interest rate of <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>{trove.metrics.interestRate}%</HighlightableValue> is managed by{" "}
          {batchManagerInfo?.name || "Batch Manager"} with additional{" "}
          {trove.batch.managementFee}% management fee
        </span>
      );
    } else {
      items.push(
        <span key="self-managed-rate" className="text-slate-500">
          Self-managed interest rate of <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>{trove.metrics.interestRate}%</HighlightableValue> accrues continuously on the principal debt
        </span>
      );
    }

    // Interest cost breakdown
    if (interestInfo) {
      items.push(
        <span key="interest-cost" className="text-slate-500">
          Current interest costs approximately <HighlightableValue type="dailyInterest" state="after" value={dailyInterestCost}>{formatPrice(dailyInterestCost)} BOLD</HighlightableValue> per day
          or <HighlightableValue type="annualInterest" state="after" value={annualInterestCost}>{formatPrice(annualInterestCost)} BOLD</HighlightableValue> per year
        </span>
      );
    }

    // Add NFT information if NFT URL is available
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl && trove.owner) {
      const truncatedOwner = trove.ownerEns || `${trove.owner.substring(0, 6)}...${trove.owner.substring(38)}`;
      items.push(
        <span key="nft-info" className="text-slate-500">
          A transferable <HighlightableValue type="nftToken" state="after">NFT</HighlightableValue> representing trove <HighlightableValue type="troveId" state="after" value={parseInt(trove.id)}>{`${trove.id.substring(0, 8)}...`}</HighlightableValue> is held by wallet <HighlightableValue type="ownerAddress" state="after">{truncatedOwner}</HighlightableValue>
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>
      );
    }

    return items;
  }, [trove, interestInfo, debtWithInterest, dailyInterestCost, annualInterestCost, batchManagerInfo, hoveredValue]);

  return (
    <div>
      {/* Main trove card */}
      <div className="relative rounded-lg text-slate-500 bg-slate-900">
        {/* Header section */}
        <div className="flex items-center justify-between p-4 pb-0">
          <div className="flex items-center">
            {/* Status and metrics */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold px-2 py-0.5 bg-green-900 text-green-400 rounded-xs">ACTIVE</span>
              <span className="text-slate-400">
                {formatDuration(trove.activity.createdAt, new Date())}
              </span>
              {!showViewButton && (
                <span className="text-slate-400">
                  Opened {formatDate(trove.activity.createdAt)}
                </span>
              )}
              <span className="inline-flex items-center text-slate-400">
                <Icon name="arrow-left-right" size={12} />
                <span className="ml-1">{trove.activity.transactionCount}</span>
              </span>
              {trove.activity.redemptionCount > 0 && (
                <span className="inline-flex items-center text-orange-400">
                  <Icon name="triangle" size={12} />
                  <span className="ml-1">{trove.activity.redemptionCount}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content section with standard grid layout */}
        <div className="grid grid-cols-1 pt-2 p-4 gap-4">

        {/* Main value */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Debt</p>
          <HighlightableValue
            type="debt"
            state="after"
            value={interestInfo ? debtWithInterest : trove.debt.current}
            asBlock={true}
          >
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {interestInfo ? formatPrice(debtWithInterest) : formatPrice(trove.debt.current)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </HighlightableValue>
          {/* Debt breakdown */}
          {interestInfo && (
            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
              <div className="flex items-center gap-1 ">
                <span className="bg-slate-950 rounded px-1.5  py-0.5">
                  <HighlightableValue type="principal" state="after" className="text-slate-500" value={interestInfo.recordedDebt}>
                    {formatPrice(interestInfo.recordedDebt)}
                  </HighlightableValue> + <HighlightableValue type="interest" state="after"  className="text-slate-500"  value={interestInfo.accruedInterest}>
                    {formatPrice(interestInfo.accruedInterest)}
                  </HighlightableValue> interest
                  {interestInfo.isBatchMember && interestInfo.accruedManagementFees !== undefined && interestInfo.accruedManagementFees > 0 && (
                    <> + <HighlightableValue type="managementFee" state="after" value={interestInfo.accruedManagementFees}>
                      {formatPrice(interestInfo.accruedManagementFees)}
                    </HighlightableValue> delegate fee</>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Backed by</p>
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
                <span className="text-xs flex items-center border-l border-r border-green-400 rounded-sm px-1 py-0">
                  <HighlightableValue className="text-green-400" type="collateralUsd" state="after" value={trove.collateral.valueUsd}>
                    {formatUsdValue(trove.collateral.valueUsd)}
                  </HighlightableValue>
                </span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Collateral Ratio</p>
            <p className="text-xl font-semibold">
              <HighlightableValue type="collRatio" state="after" value={interestInfo && trove.collateral.valueUsd > 0 
                ? parseFloat(((trove.collateral.valueUsd / debtWithInterest) * 100).toFixed(1))
                : trove.metrics.collateralRatio}>
                {interestInfo && trove.collateral.valueUsd > 0 
                  ? `${((trove.collateral.valueUsd / debtWithInterest) * 100).toFixed(1)}%`
                  : `${trove.metrics.collateralRatio}%`}
              </HighlightableValue>
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              {trove.batch.isMember && (
                <span className="text-xs font-semibold px-1 py-0.5 bg-blue-900 text-blue-400 rounded-xs">DELEGATED</span>
              )}
              <p className="text-xs text-slate-400">Interest Rate</p>
            </div>
            <div className="text-xl font-medium">
              <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>
                {trove.metrics.interestRate}%
              </HighlightableValue>
            </div>
            {interestInfo && (
              <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                <span className="bg-slate-950 rounded px-1.5 py-0.5">
                  ~ <HighlightableValue type="dailyInterest" state="after" className="text-slate-500" value={dailyInterestCost}>
                    {formatPrice(dailyInterestCost)}
                  </HighlightableValue> day / <HighlightableValue type="annualInterest" state="after" className="text-slate-500" value={annualInterestCost}>
                    {formatPrice(annualInterestCost)}
                  </HighlightableValue> year
                </span>
              </div>
            )}
            {trove.batch.isMember && (
              <>
                <p className="text-xs text-slate-500 mt-0.5">+ {trove.batch.managementFee}% 
                {batchManagerInfo?.website ? (
                  <a 
                    href={batchManagerInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 mt-1 underline underline-offset-2 ml-0.5"
                  >
                    {batchManagerInfo.name}
                  </a>
                ) : (
                  <span> {batchManagerInfo?.name || "Batch Manager"}</span>
                )}
              </p>
              {interestInfo && (
                <div className="text-xs text-slate-500 mt-0.5">
                  ~ <HighlightableValue type="dailyManagementFee" state="after" className="text-slate-500" value={(interestInfo.recordedDebt * trove.batch.managementFee / 100) / 365}>
                    {formatPrice((interestInfo.recordedDebt * trove.batch.managementFee / 100) / 365)}
                  </HighlightableValue> day / <HighlightableValue type="annualManagementFee" state="after" className="text-slate-500" value={interestInfo.recordedDebt * trove.batch.managementFee / 100}>
                    {formatPrice(interestInfo.recordedDebt * trove.batch.managementFee / 100)}
                  </HighlightableValue> year
                </div>
              )}
              </>
            )}
          </div>
        </div>

        {showViewButton ? (
          <TroveCardFooter
            trove={trove}
            showViewButton={showViewButton}
            dateInfo={{
              prefix: "Opened",
              date: formatDate(trove.activity.createdAt)
            }}
          />
        ) : (
          <div className="flex justify-between items-end">
            <TroveCardFooter
              trove={trove}
              showViewButton={showViewButton}
            />
            
            {/* Latest collateral value - only show on trove view page */}
            <div className="flex items-center gap-1">
              <TokenIcon assetSymbol={trove.collateralType} />
              <span className="text-xs flex items-center text-green-400">
                {formatUsdValue(trove.collateral.valueUsd / trove.collateral.amount)}
              </span>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Drawer - 20px narrower than the card above */}
      <div className="px-2.5">
        <ExplanationPanel 
          items={hoverContextItems} 
          onToggle={(isOpen) => {
            setShowHoverContext(isOpen);
            setHoverEnabled(isOpen);
          }}
          defaultOpen={false}
        />
      </div>
    </div>
  );
}

export function OpenTroveCard({ trove, showViewButton = false }: OpenTroveCardProps) {
  return (
    <HoverProvider>
      <OpenTroveCardContent trove={trove} showViewButton={showViewButton} />
    </HoverProvider>
  );
}
