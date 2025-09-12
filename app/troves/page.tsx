"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TroveCard } from "@/components/trove/TroveCard";
import { SimplifiedTroveCard } from "@/components/trove/SimplifiedTroveCard";
import { CompactTroveTable } from "@/components/trove/CompactTroveTable";
import { ViewToggle } from "@/components/trove/ViewToggle";
import { TroveData, TrovesResponse } from "@/types/api/trove";

type ViewMode = "standard" | "simplified" | "table";

export default function TrovesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get page from URL, default to 1
  const currentPage = Number(searchParams.get('page')) || 1;
  
  const [troves, setTroves] = useState<TroveData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    hasMore: false,
  });
  
  // Update URL when page changes
  const setCurrentPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`/troves?${params.toString()}`);
  };

  useEffect(() => {
    loadTroves();
  }, [currentPage]);

  const loadTroves = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((currentPage - 1) * pagination.limit).toString(),
      });
      
      const response = await fetch(`/api/troves?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch troves: ${response.statusText}`);
      }
      
      const data: TrovesResponse = await response.json();
      setTroves(data.data);
      setPagination({
        total: data.pagination.total,
        limit: data.pagination.limit,
        hasMore: data.pagination.hasMore,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading troves:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const startItem = (currentPage - 1) * pagination.limit + 1;
  const endItem = Math.min(currentPage * pagination.limit, pagination.total);

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="space-y-6">
          <div className="mb-6">
            <div className="flex justify-end mb-4">
              <div className="text-sm text-slate-400">Loading troves...</div>
            </div>
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
        {/* Header with pagination info and view toggle */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-slate-400">
              {pagination.total > 0 ? (
                <>
                  Showing {startItem} - {endItem} of {pagination.total} troves
                </>
              ) : (
                "No troves found"
              )}
            </div>
            <div className="flex items-center gap-4">
              <ViewToggle 
                viewMode={viewMode} 
                onChange={setViewMode}
              />
              {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                >
                  Next
                </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results display */}
        {troves.length > 0 ? (
          <div className="mb-8">
            {viewMode === "table" ? (
              <div className="overflow-x-auto">
                <CompactTroveTable troves={troves} showViewButton />
              </div>
            ) : viewMode === "simplified" ? (
              <div className="grid grid-cols-1 gap-6">
                {troves.map((trove) => (
                  <SimplifiedTroveCard key={trove.troveId} trove={trove} showViewButton />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {troves.map((trove) => (
                  <TroveCard key={trove.troveId} trove={trove} showViewButton />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <p>No troves available</p>
          </div>
        )}

        {/* Bottom pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pb-8">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
