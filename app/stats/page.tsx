"use client";

import { useState, useEffect } from "react";
import { ProtocolStats, StatsResponse } from "@/types/api/stats";
import { StatCard } from "@/components/stats/StatCard";
import { CollateralBreakdown } from "@/components/stats/CollateralBreakdown";
import { Icon } from "@/components/icons/icon";

export default function StatsPage() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    loadStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/stats");
      
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data: StatsResponse = await response.json();
      
      if (data.success && data.data) {
        setStats(data.data);
        setLastUpdated(new Date());
        setError(null);
      } else {
        throw new Error(data.error || "Invalid response format");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
      console.error("Error loading stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
  };

  if (error && !stats) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Icon name="alert-triangle" size={20} className="text-red-400" />
              <p className="text-red-400 font-medium">Error loading protocol statistics</p>
            </div>
            <p className="text-slate-400 text-sm">{error}</p>
            <button
              onClick={loadStats}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  const overall = stats?.overall || {
    totalDebt: 0,
    totalCollateral: 0,
    totalCollateralUsd: 0,
    troveCount: 0,
    openTroveCount: 0
  };

  // Calculate collateral ratio
  const collateralRatio = overall.totalDebt > 0 
    ? (overall.totalCollateralUsd / overall.totalDebt) * 100 
    : 0;

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-white">Protocol Statistics</h1>
            {lastUpdated && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Icon name="refresh-cw" size={14} />
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
          <p className="text-slate-400">Real-time Liquity V2 protocol metrics</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Value Locked"
            value={`$${formatNumber(overall.totalCollateralUsd)}`}
            subtitle="Protocol TVL in USD"
            icon="lock"
            loading={loading}
            valueClassName="text-green-400"
          />
          
          <StatCard
            title="Total Debt"
            value={`$${formatNumber(overall.totalDebt)}`}
            subtitle="Outstanding BOLD debt"
            icon="dollar-sign"
            loading={loading}
            valueClassName="text-blue-400"
          />
          
          <StatCard
            title="Active Troves"
            value={overall.openTroveCount.toLocaleString()}
            subtitle={`${overall.troveCount.toLocaleString()} total`}
            icon="users"
            loading={loading}
          />
          
          <StatCard
            title="Collateral Ratio"
            value={`${collateralRatio.toFixed(1)}%`}
            subtitle="System-wide ratio"
            icon="shield"
            loading={loading}
            valueClassName={
              collateralRatio < 150 ? 'text-orange-400' :
              collateralRatio < 200 ? 'text-yellow-400' :
              'text-green-400'
            }
          />
        </div>

        {/* Collateral Breakdown */}
        <div className="mb-8">
          <CollateralBreakdown
            data={stats?.byCollateral || {}}
            loading={loading}
          />
        </div>

        {/* System Health Summary */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">System Overview</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-slate-700 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-slate-400 mb-1">Protocol Utilization</div>
                <div className="text-2xl font-bold text-white">
                  {overall.totalCollateralUsd > 0 
                    ? `${((overall.totalDebt / overall.totalCollateralUsd) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
                <div className="text-xs text-slate-500 mt-1">Debt to collateral ratio</div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Active Rate</div>
                <div className="text-2xl font-bold text-white">
                  {overall.troveCount > 0
                    ? `${((overall.openTroveCount / overall.troveCount) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
                <div className="text-xs text-slate-500 mt-1">Open vs total troves</div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Closed Troves</div>
                <div className="text-2xl font-bold text-white">
                  {(overall.troveCount - overall.openTroveCount).toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">Historical closures</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}