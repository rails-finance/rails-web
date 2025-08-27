import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { formatDateRange } from "@/lib/date";

interface LiquidatedTroveCardProps {
  trove: any;
  showViewButton?: boolean;
}

export function LiquidatedTroveCard({ trove, showViewButton = false }: LiquidatedTroveCardProps) {
  return (
    <div className="rounded-lg text-slate-500 bg-red-950 text-red-800 border border-red-900 grid grid-cols-1 p-4 gap-4">
      <TroveCardHeader status="liquidated" assetType={trove.assetType} />

      {/* Main value */}
      <div>
        <div className="text-sm mb-1">Liquidated Amount</div>
        <div className="flex items-center">
          <h3 className="text-3xl font-bold text-white">{trove.peakValue}</h3>
          <span className="ml-2 text-green-400 text-lg">
            <TokenIcon assetSymbol={trove.assetType} />
          </span>
        </div>
      </div>

      {/* Collateral at liquidation */}
      <div>
        <p className="text-sm">Collateral at liquidation</p>
        <div className="flex items-center">
          <div className="flex items-center">
            <p className="text-xl font-medium text-white mr-1">{trove.backedBy.peakAmount}</p>
            <span className="flex items-center text-slate-400">
              <TokenIcon assetSymbol={trove.collateralType} />
            </span>
          </div>
        </div>
      </div>

      <TroveCardFooter
        trove={trove}
        showViewButton={showViewButton}
        dateText={`${formatDateRange(trove.activity.created, trove.activity.lastActivity)}`}
      />
    </div>
  );
}
