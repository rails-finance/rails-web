"use client";

import { useMemo } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { TroveData } from "@/types/api/trove";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";
import { formatDate } from "@/lib/date";

interface OpenTroveCardProps {
  trove: TroveData;
  showViewButton?: boolean;
}

export function OpenTroveCard({ trove, showViewButton = false }: OpenTroveCardProps) {
  const batchManagerInfo = useMemo(() => {
    if (trove.batchMembership?.batchManager) {
      return getBatchManagerInfo(trove.batchMembership.batchManager);
    }
    return undefined;
  }, [trove.batchMembership?.batchManager]);

  return (
    <div className="rounded-lg text-slate-500 bg-slate-900 grid grid-cols-1 p-4 gap-4">
      <TroveCardHeader status="open" assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} />

      {/* Main value */}
      <div>
        <div className="text-xs text-slate-400 mb-1">
          <span className="font-bold">Debt</span>{" "}
          <span className="text-slate-600">
            <a href="#" className="hover:text-slate-400 transition-colors">
              with interest <Icon name="calculator" size={14} className="inline-flex relative -top-0.5" />
            </a>
          </span>
        </div>
        <div className="flex items-center">
          <h3 className="text-3xl font-bold text-white">{trove.mainValue}</h3>
          <span className="ml-2 text-green-400 text-lg">
            <TokenIcon assetSymbol={trove.assetType} />
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-sm">Backed by</p>
          <div className="flex items-center">
            <span className="flex items-center">
              <p className="text-xl font-medium text-white mr-1">{trove.backedBy.amount}</p>
              <span className="flex items-center">
                <TokenIcon assetSymbol={trove.collateralType} />
              </span>
            </span>
            <div className="ml-1 flex items-center">
              <span className="text-xs flex items-center text-green-400 border border-green-400 rounded-sm px-1 py-0">
                ${trove.backedBy.valueUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm">Collateral Ratio</p>
          <p className="text-xl font-medium text-white">{trove.metrics.collateralRatio}%</p>
        </div>
        <div>
          <p className="text-sm">Interest Rate</p>
          <div className="text-xl font-medium">
            <span className="text-white">{trove.metrics.interestRate}%</span>
          </div>
          {trove.batchMembership.isMember && (
            <>
              {batchManagerInfo?.website ? (
                <a 
                  href={batchManagerInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 underline underline-offset-2 block"
                >
                  {batchManagerInfo.name}
                </a>
              ) : (
                <p className="text-xs text-slate-400 mt-1">{batchManagerInfo?.name || "Batch Manager"}</p>
              )}
              <p className="text-xs text-slate-400">+ {trove.batchMembership.managementFeeRate}% mgmt fee</p>
            </>
          )}
        </div>
      </div>

      <TroveCardFooter
        trove={trove}
        showViewButton={showViewButton}
        dateText={`Opened ${formatDate(trove.activity.created)}`}
      />
    </div>
  );
}
