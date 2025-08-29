"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { TroveData, TrovesResponse } from "@/types/api/trove";
import type { TransactionTimeline as TimelineData } from "@/types/api/troveHistory";
import { TroveCard } from "@/components/trove/TroveCard";
import { Button } from "@/components/ui/button";
import { TransactionTimeline } from "@/components/transaction-timeline";

export default function TrovePage() {
  const params = useParams();
  const troveId = params.troveId as string;
  const collateralType = params.collateralType as string;

  const [troveData, setTroveData] = useState<TroveData | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="space-y-6">
        <Button onClick={() => window.history.back()} className="mb-4">
          ← Back
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
      <div className="space-y-6">
        <Button onClick={() => window.history.back()} className="mb-4">
          ← Back
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
    <div className="space-y-6">
      <Button onClick={() => window.history.back()} className="mb-4">
        ← Back
      </Button>

      <TroveCard trove={troveData} />

      <h3 className="text-xl font-semibold mb-4 text-white">Trove Timeline</h3>
      {timelineData && timelineData.transactions.length > 0 ? (
        <TransactionTimeline timeline={timelineData} />
      ) : (
        <div className="text-center py-8 text-slate-400">No transaction history available</div>
      )}
    </div>
  );
}
