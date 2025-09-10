"use client";

import { useMemo, useState } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { TroveSummary } from "@/types/api/trove";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";
import { formatDate } from "@/lib/date";
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
          {formatPrice(interestInfo.recordedDebt)} BOLD principal plus{" "}
          {formatPrice(interestInfo.accruedInterest)} BOLD accrued interest
          {interestInfo.isBatchMember && interestInfo.accruedManagementFees !== undefined && interestInfo.accruedManagementFees > 0 && (
            <span> and {formatPrice(interestInfo.accruedManagementFees)} BOLD delegate fees</span>
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
          Current interest costs approximately {formatPrice(dailyInterestCost)} BOLD per day 
          or {formatPrice(annualInterestCost)} BOLD per year
        </span>
      );
    }

    // Add NFT information if NFT URL is available
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl) {
      items.push(
        <span key="nft-info" className="text-slate-500">
          Trove is represented by an ERC-721 NFT token for ownership verification
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
          <a
            href={nftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors"
            aria-label="View NFT on OpenSea"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-link2 lucide-link-2 w-3 h-3 text-slate-500" aria-hidden="true">
              <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
              <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
              <line x1="8" x2="16" y1="12" y2="12"></line>
            </svg>
          </a>
        </span>
      );
    }

    return items;
  }, [trove, interestInfo, debtWithInterest, dailyInterestCost, annualInterestCost, batchManagerInfo, hoveredValue]);

  return (
    <div>
      {/* Main trove card */}
      <div className="rounded-lg text-slate-500 bg-slate-900 grid grid-cols-1 p-4 gap-4">
        <TroveCardHeader status="open" assetType="BOLD" isDelegated={trove.batch?.isMember} />

        {/* Main value */}
        <div>
          <div className="text-xs font-bold text-slate-400 mb-1">
            Debt
          </div>
          <div className="flex items-center">
            <h3 className="text-3xl font-bold">
              <HighlightableValue type="debt" state="after" value={interestInfo ? debtWithInterest : trove.debt.current}>
                {interestInfo ? formatPrice(debtWithInterest) : formatPrice(trove.debt.current)}
              </HighlightableValue>
            </h3>
            <span className="ml-2 text-green-400 text-lg">
              <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
            </span>
          </div>
          {/* Debt breakdown */}
          {interestInfo && (
            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
              <div className="flex items-center gap-1 ">
                <span className="bg-slate-950 border border-slate-700 rounded px-1.5">{formatPrice(interestInfo.recordedDebt)} + {formatPrice(interestInfo.accruedInterest)} interest</span>
              {interestInfo.isBatchMember && interestInfo.accruedManagementFees !== undefined && interestInfo.accruedManagementFees > 0 && (
                <span>
                  + {formatPrice(interestInfo.accruedManagementFees)} delegate fee
                </span>
              )}
              </div>
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm font-semibold ">Backed by</p>
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
                <span className="text-xs flex items-center text-green-400 border-l border-r border-green-400 rounded-sm px-1 py-0">
                  <HighlightableValue type="collateralUsd" state="after" value={trove.collateral.valueUsd}>
                    {formatUsdValue(trove.collateral.valueUsd)}
                  </HighlightableValue>
                </span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm">Collateral Ratio</p>
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
            <p className="text-sm">{trove.batch.isMember ? 'Delegated ' : ''}Interest Rate</p>
            <div className="text-xl font-medium">
              <HighlightableValue type="interestRate" state="after" value={trove.metrics.interestRate}>
                {trove.metrics.interestRate}%
              </HighlightableValue>
            </div>
            {interestInfo && (
              <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                <span className="bg-slate-950 border border-slate-700 rounded px-1.5">~ {formatPrice(dailyInterestCost)} day / {formatPrice(annualInterestCost)} year</span>
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
                  ~ {formatPrice((interestInfo.recordedDebt * trove.batch.managementFee / 100) / 365)} day / {formatPrice(interestInfo.recordedDebt * trove.batch.managementFee / 100)} year
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
              date: formatDate(trove.activity.createdAt),
              suffix: `${trove.activity.lifetimeDays} days`
            }}
          />
        ) : (
          <div className="flex justify-between items-end">
            <TroveCardFooter
              trove={trove}
              showViewButton={showViewButton}
              dateInfo={{
                prefix: "Opened",
                date: formatDate(trove.activity.createdAt),
                suffix: `${trove.activity.lifetimeDays} days`
              }}
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
