"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { TroveData, TrovesResponse } from "@/types/api/trove";
import { TroveCard } from "@/components/trove/TroveCard";

export default function AddressTrovesPage() {
  const params = useParams();
  const address = params.address as string;

  const [troves, setTroves] = useState<TroveData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      loadTroves();
    }
  }, [address]);

  const loadTroves = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/troves?ownerAddress=${address.toLowerCase()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch troves: ${response.statusText}`);
      }

      const data: TrovesResponse = await response.json();

      if (!data.data || data.data.length === 0) {
        setTroves([]);
      } else {
        setTroves(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading troves for address:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="space-y-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Troves for Address</h1>
            <p className="text-sm text-slate-400 font-mono">{address}</p>
            <div className="mt-4 text-sm text-slate-400">Loading troves...</div>
          </div>
          <div className="grid grid-cols-1 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-slate-700 rounded-lg h-48 animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen">
        <div className="space-y-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Troves for Address</h1>
            <p className="text-sm text-slate-400 font-mono">{address}</p>
          </div>
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={loadTroves}
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Troves for Address</h1>
          <p className="text-sm text-slate-400 font-mono">{address}</p>
          <div className="mt-4 text-sm text-slate-400">
            {troves.length > 0 ? (
              <>
                Found {troves.length} trove{troves.length !== 1 ? "s" : ""}
              </>
            ) : (
              "No troves found for this address"
            )}
          </div>
        </div>

        {/* Troves grid */}
        {troves.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 mb-8">
            {troves.map((trove) => (
              <TroveCard key={trove.troveId} trove={trove} showViewButton />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <p>This address has no troves</p>
          </div>
        )}
      </div>
    </main>
  );
}
