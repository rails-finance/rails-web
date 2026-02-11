"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";
import { TroveSummary, TrovesResponse } from "@/types/api/trove";
import type { TransactionTimeline as TimelineData } from "@/types/api/troveHistory";
import { isRedemptionTransaction, isBatchManagerOperation } from "@/types/api/troveHistory";
import { TroveSummaryCard } from "@/components/trove/TroveSummaryCard";
import { TroveEconomicsSummary } from "@/components/trove/TroveEconomicsSummary";
import { Button } from "@/components/ui/button";
import { TransactionTimeline } from "@/components/transaction-timeline";
import { formatDuration } from "@/lib/date";
import { Icon } from "@/components/icons/icon";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { FeedbackButton } from "@/components/FeedbackButton";
import { TroveStateData, TroveStateResponse } from "@/types/api/troveState";
import { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { useTroveUiState } from "@/hooks/useTroveUiState";

export default function TrovePage() {
  const params = useParams();
  const router = useRouter();
  const troveId = params.troveId as string;
  const collateralType = params.collateralType as string;
  const troveKey = `${collateralType}:${troveId}`;

  const [troveData, setTroveData] = useState<TroveSummary | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    hideDelegateRates,
    hideRedemptions,
    transactions: transactionUiState,
    summaryExplanationOpen,
    economicsOpen,
    setHideDelegateRates,
    setHideRedemptions,
    getTransactionState,
    setTransactionExpanded,
    setExplanationOpen,
    setSummaryExplanationOpen,
    setEconomicsOpen,
  } = useTroveUiState(troveKey);

  // Live blockchain data and prices
  const [liveState, setLiveState] = useState<TroveStateData | undefined>(undefined);
  const [prices, setPrices] = useState<OraclePricesData | undefined>(undefined);
  const [enhancementLoading, setEnhancementLoading] = useState({
    blockchain: false,
    prices: false,
  });

  useEffect(() => {
    loadData();
  }, [troveId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both trove data and timeline data in parallel
      const [troveResponse, timelineResponse] = await Promise.all([
        fetch(`/api/troves?troveId=${troveId}&collateralType=${collateralType}`),
        fetch(`/api/trove/${collateralType}/${troveId}`),
      ]);

      if (!troveResponse.ok) {
        throw new Error(`Failed to fetch trove: ${troveResponse.statusText}`);
      }

      const troveData: TrovesResponse = await troveResponse.json();

      if (!troveData.data || troveData.data.length === 0) {
        setError("Trove not found");
        setLoading(false); // Always set loading to false
        return;
      }

      setTroveData(troveData.data[0]);

      // Handle timeline response even if it fails
      if (timelineResponse.ok) {
        const timeline: TimelineData = await timelineResponse.json();
        setTimelineData(timeline);
      } else {
        console.error("Failed to fetch timeline:", timelineResponse.statusText);
        // Set empty timeline on error
        setTimelineData({
          troveId,
          transactions: [],
          totalTransactions: 0,
        });
      }

      // After successfully loading base data, fetch enhancements
      setLoading(false);
      loadEnhancements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trove data");
      console.error("Error loading trove data:", err);
      setLoading(false);
    }
  };

  const loadEnhancements = async () => {
    setEnhancementLoading({ blockchain: true, prices: true });

    // Fetch blockchain state and prices in parallel
    const results = await Promise.allSettled([
      fetch(`/api/trove/state/${collateralType}/${troveId}`),
      fetch(`/api/oracle/liquity-v2`),
    ]);

    // Handle blockchain state response
    if (results[0].status === "fulfilled" && results[0].value.ok) {
      try {
        const stateResponse: TroveStateResponse = await results[0].value.json();
        if (stateResponse.success && stateResponse.data) {
          setLiveState(stateResponse.data);
        }
      } catch (err) {
        console.error("Error parsing blockchain state:", err);
      }
    } else {
      console.error("Failed to fetch blockchain state");
    }
    setEnhancementLoading((prev) => ({ ...prev, blockchain: false }));

    // Handle prices response
    if (results[1].status === "fulfilled" && results[1].value.ok) {
      try {
        const pricesResponse: OraclePricesResponse = await results[1].value.json();
        if (pricesResponse.success && pricesResponse.data) {
          setPrices(pricesResponse.data);
        }
      } catch (err) {
        console.error("Error parsing oracle prices:", err);
      }
    } else {
      console.error("Failed to fetch oracle prices");
    }
    setEnhancementLoading((prev) => ({ ...prev, prices: false }));
  };

  const getEnhancementStatus = (): string | null => {
    const { blockchain, prices } = enhancementLoading;

    if (!blockchain && !prices) return null;

    if (blockchain) return "Loading current state...";
    if (prices) return "Fetching current asset price...";

    return null;
  };

  if (loading) {
    return (
      <>
        <FeedbackButton />
        <div className="space-y-6 py-8">
          <h1 className="text-2xl font-bold text-slate-700 dark:text-white mb-6 flex items-center gap-2">
            <TokenIcon assetSymbol={collateralType} className="w-7 h-7 z-1" />
            <TokenIcon assetSymbol="BOLD" className="w-7 h-7 -ml-3" />
            Liquity V2 Trove
          </h1>
          <Button onClick={() => router.back()} className="mb-4 pl-2 font-bold">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="bg-slate-100 dark:bg-slate-700 rounded-lg h-48 animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded w-1/4 animate-pulse" />
            <div className="h-32 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
          </div>
        </div>
      </>
    );
  }

  if (error || !troveData) {
    return (
      <>
        <FeedbackButton />
        <div className="space-y-6 py-8">
          <Button onClick={() => router.back()} className="mb-4 pl-2 font-bold">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
            <p className="text-red-400">{error || "Trove not found"}</p>
            <button
              onClick={loadData}
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <FeedbackButton />
      <div className="space-y-6 py-8">
        <h1 className="text-2xl font-bold text-slate-700 dark:text-white mb-6 flex items-center gap-2">
          <TokenIcon assetSymbol={collateralType} className="w-7 h-7 z-1" />
          <TokenIcon assetSymbol="BOLD" className="w-7 h-7 -ml-3" />
          Liquity V2 Trove
        </h1>
        <Button onClick={() => router.back()} className="mb-4 pl-2 font-bold">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>

        <TroveSummaryCard
          trove={troveData}
          liveState={liveState}
          prices={prices}
          summaryExplanationOpen={summaryExplanationOpen}
          onToggleSummaryExplanation={setSummaryExplanationOpen}
          loadingStatus={{
            message: getEnhancementStatus(),
            snapshotDate: timelineData?.transactions?.[0]?.timestamp,
          }}
        />

        <TroveEconomicsSummary
          trove={troveData}
          transactions={timelineData?.transactions}
          currentPrice={prices?.[troveData.collateralType.toLowerCase() as keyof OraclePricesData]}
          entireDebt={liveState?.debt.entire}
          persistedOpen={economicsOpen}
          onToggle={setEconomicsOpen}
        />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-slate-700 dark:text-white">Timeline</h3>
            {troveData.activity?.lastActivityAt && (
              <span className="text-xs text-slate-600 dark:text-slate-500 flex baseline gap-1 rounded-full pl-1 pr-2 py-0.5 bg-slate-100 dark:bg-slate-900">
                <Icon name="clock-zap" size={14} />
                {formatDuration(troveData.activity.lastActivityAt, new Date())} ago
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {timelineData && timelineData.transactions.some((tx) => isBatchManagerOperation(tx)) && (
              <button
                onClick={() => setHideDelegateRates(!hideDelegateRates)}
                aria-label={hideDelegateRates ? "Show delegate rate updates" : "Hide delegate rate updates"}
                className={`cursor-pointer pl-0.5 pr-1.5 text-sm rounded-full transition-colors flex items-center bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-400 hover:bg-pink-200 dark:hover:bg-pink-900/70`}
              >
                <span className="w-5 h-5 flex items-center justify-center ">
                  {hideDelegateRates ? (
                    <Icon name="x" size={12} className="text-pink-600 dark:text-pink-400" />
                  ) : (
                    <Icon name="check" size={12} className="text-pink-600 dark:text-pink-400" />
                  )}
                </span>
                <span className="flex items-center text-xs font-medium gap-1">
                  <Users size={12} className="text-pink-500" />
                  {timelineData.transactions.filter((tx) => isBatchManagerOperation(tx)).length}
                </span>
              </button>
            )}
            {timelineData && timelineData.transactions.some((tx) => isRedemptionTransaction(tx)) && (
              <button
                onClick={() => setHideRedemptions(!hideRedemptions)}
                aria-label={hideRedemptions ? "Show redemption transactions" : "Hide redemption transactions"}
                className={`cursor-pointer pl-0.5 pr-1.5 text-sm rounded-full transition-colors flex items-center bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/70`}
              >
                <span className="w-5 h-5 flex items-center justify-center ">
                  {hideRedemptions ? (
                    <Icon name="x" size={12} className="text-orange-600 dark:text-orange-400" />
                  ) : (
                    <Icon name="check" size={12} className="text-orange-600 dark:text-orange-400" />
                  )}
                </span>
                <span className="flex items-center text-xs font-medium gap-1">
                  <Icon name="triangle" size={12} className="text-orange-500" />
                  {timelineData.transactions.filter((tx) => isRedemptionTransaction(tx)).length}
                </span>
              </button>
            )}
          </div>
        </div>
        {timelineData && timelineData.transactions.length > 0 ? (
          <TransactionTimeline
            timeline={{
              ...timelineData,
              transactions: timelineData.transactions.filter((tx) => {
                if (hideRedemptions && isRedemptionTransaction(tx)) return false;
                if (hideDelegateRates && isBatchManagerOperation(tx)) return false;
                return true;
              }),
            }}
            currentPrice={prices?.[troveData.collateralType.toLowerCase() as keyof OraclePricesData]}
            transactionState={transactionUiState}
            getTransactionState={getTransactionState}
            setTransactionExpanded={setTransactionExpanded}
            setExplanationOpen={setExplanationOpen}
          />
        ) : (
          <div className="text-center py-8 text-slate-400">No transaction history available</div>
        )}
      </div>
    </>
  );
}
