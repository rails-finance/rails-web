"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons/icon";

interface TroveCardFooterProps {
  trove: any;
  showViewButton?: boolean;
  dateText: string;
}

export function TroveCardFooter({ trove, showViewButton, dateText }: TroveCardFooterProps) {
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [copiedTrove, setCopiedTrove] = useState(false);
  return (
    <div className="text-xs">
      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-0 sm:items-center">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:space-x-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span>{dateText}</span>
          </div>
          <div className="flex flex-wrap sm:flex-row gap-3">
            {trove.walletAddress && (
              <span className="bg-slate-800 rounded-sm px-1.5 py-1 inline-flex items-center">
                <span className="text-slate-400 flex items-center gap-1">
                  <Icon name="user" size={12} />
                  <span>
                    {trove.walletEns || `${trove.walletAddress.substring(0, 6)}...${trove.walletAddress.substring(38)}`}
                  </span>
                  <div className="relative inline-block group">
                    <button
                      className="mx-1.5 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                      aria-label={copiedWallet ? "Copied to clipboard" : "Copy to clipboard"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigator.clipboard.writeText(trove.walletAddress);
                        setCopiedWallet(true);
                        setTimeout(() => setCopiedWallet(false), 2000);
                      }}
                    >
                      <Icon name={copiedWallet ? "check" : "copy"} size={14} />
                    </button>
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
                      <div className={`bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs whitespace-nowrap transition-opacity duration-200 ${copiedWallet ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {copiedWallet ? 'Copied!' : 'Copy'}
                      </div>
                    </div>
                  </div>
                </span>
              </span>
            )}
            <span className="bg-slate-800 rounded-sm px-1.5 py-1 inline-flex items-center">
              <span className="text-slate-400 flex items-center gap-1">
                <Icon name="hash" size={12} />
                {trove.troveId ? `${trove.troveId.substring(0, 8)}...` : "n/a"}
                <div className="relative inline-block group">
                  <button
                    className="mx-1.5 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                    aria-label={copiedTrove ? "Copied to clipboard" : "Copy to clipboard"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (trove.troveId) {
                        navigator.clipboard.writeText(trove.troveId);
                        setCopiedTrove(true);
                        setTimeout(() => setCopiedTrove(false), 2000);
                      }
                    }}
                  >
                    <Icon name={copiedTrove ? "check" : "copy"} size={14} />
                  </button>
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
                    <div className={`bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs whitespace-nowrap transition-opacity duration-200 ${copiedTrove ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {copiedTrove ? 'Copied!' : 'Copy'}
                    </div>
                  </div>
                </div>
              </span>
            </span>
            <span className="inline-flex items-center">
              <Icon name="arrow-left-right" size={12} />
              <span className="ml-1">{trove.activity?.transactionCount || 0}</span>
            </span>
            {trove.metrics?.redemptionCount > 0 && (
              <span className="inline-flex items-center text-orange-400">
                <Icon name="triangle" size={12} />
                <span className="ml-1">{trove.metrics.redemptionCount}</span>
              </span>
            )}
          </div>
        </div>
        {showViewButton && (
          <Button href={`/${trove.troveId}`} className="flex items-center w-full sm:w-auto justify-center">
            View Trove
            <Icon name="arrow-right" size={14} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}