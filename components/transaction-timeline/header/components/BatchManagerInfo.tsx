"use client";

import { useMemo } from "react";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";

interface BatchManagerInfoProps {
  batchManager?: string | null;
  batchManagerLabel?: string;
  color?: "blue" | "purple";
  showIcon?: boolean;
}

export function BatchManagerInfo({ batchManager, batchManagerLabel, color = "blue" }: BatchManagerInfoProps) {
  if (!batchManager) return null;

  const managerInfo = useMemo(() => {
    return getBatchManagerByAddress(batchManager);
  }, [batchManager]);

  const displayName =
    batchManagerLabel || managerInfo?.name || `${batchManager.slice(0, 6)}...${batchManager.slice(-4)}`;
  const textColor = color === "purple" ? "text-purple-400" : "text-blue-400";

  return (
    <div className="flex items-center text-xs text-slate-400 mt-1">
      <svg className={`w-4 h-4 mr-1 ${textColor}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
      <span className={`font-medium ${textColor}`}>{displayName}</span>
    </div>
  );
}
