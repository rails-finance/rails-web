"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TroveSummary, TrovesResponse } from "@/types/api/trove";
import type { TransactionTimeline as TimelineData } from "@/types/api/troveHistory";
import { isRedemptionTransaction } from "@/types/api/troveHistory";
import { TroveCard } from "@/components/trove/TroveCard";
import { Button } from "@/components/ui/button";
import { TransactionTimeline } from "@/components/transaction-timeline";
import { formatDuration } from "@/lib/date";
import { Icon } from "@/components/icons/icon";

export default function TrovePage() {
  const params = useParams();
  const router = useRouter();
  const troveId = params.troveId as string;
  const collateralType = params.collateralType as string;

  const [troveData, setTroveData] = useState<TroveSummary | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideRedemptions, setHideRedemptions] = useState(false);

  useEffect(() => {
    loadData();
  }, [troveId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("collateralType", collateralType);
      console.log("troveId", troveId);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trove data");
      console.error("Error loading trove data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
    <div className="space-y-6 py-8">
    <h1 class="text-2xl font-bold text-white mb-6">Liquity V2 Trove</h1>
        <Button onClick={() => router.back()} className="mb-4 pl-2">
        <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="bg-slate-700 rounded-lg h-48 animate-pulse" />
        <div className="space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/4 animate-pulse" />
          <div className="h-32 bg-slate-700 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !troveData) {
    return (
      <div className="space-y-6 py-8">
        <Button onClick={() => router.back()} className="mb-4 pl-2">
        <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error || "Trove not found"}</p>
          <button onClick={loadData} className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
    <h1 class="text-2xl font-bold text-white mb-6">Liquity V2 Trove</h1>
      <Button onClick={() => router.back()} className="mb-4 pl-2">
        <ChevronLeft className="w-4 h-4" />
          Back
      </Button>

      <TroveCard trove={troveData} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-semibold text-white">Trove Timeline</h3>
          {troveData.activity?.lastActivityAt && (
            <span className="text-xs text-slate-500 flex baseline gap-1 rounded-full pl-1 pr-2 py-0.5 bg-slate-900">
              <Icon name="clock-zap" size={14} />
              {formatDuration(troveData.activity.lastActivityAt, new Date())} ago
            </span>
          )}
        </div>
        {timelineData && timelineData.transactions.some(tx => isRedemptionTransaction(tx)) && (
          <button
            onClick={() => setHideRedemptions(!hideRedemptions)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              hideRedemptions
                ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {hideRedemptions
              ? `Show ${timelineData.transactions.filter(tx => isRedemptionTransaction(tx)).length} Redemptions`
              : `Hide ${timelineData.transactions.filter(tx => isRedemptionTransaction(tx)).length} Redemptions`
            }
          </button>
        )}
      </div>
      {timelineData && timelineData.transactions.length > 0 ? (
        <TransactionTimeline 
          timeline={{
            ...timelineData,
            transactions: hideRedemptions 
              ? timelineData.transactions.filter(tx => !isRedemptionTransaction(tx))
              : timelineData.transactions
          }} 
        />
      ) : (
        <div className="text-center py-8 text-slate-400">No transaction history available</div>
      )}
    </div>
  );
}
