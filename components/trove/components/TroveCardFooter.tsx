import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons/icon";

interface TroveCardFooterProps {
  trove: any;
  showViewButton?: boolean;
  dateText: string;
}

export function TroveCardFooter({ trove, showViewButton, dateText }: TroveCardFooterProps) {
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
                  <button
                    className="mx-1.5 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                    aria-label="Copy to clipboard"
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </span>
              </span>
            )}
            <span className="bg-slate-800 rounded-sm px-1.5 py-1 inline-flex items-center">
              <span className="text-slate-400 flex items-center gap-1">
                <Icon name="hash" size={12} />
                {trove.troveId ? `${trove.troveId.substring(0, 8)}...` : "n/a"}
                <button
                  className="mx-1.5 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                  aria-label="Copy to clipboard"
                >
                  <Icon name="copy" size={14} />
                </button>
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