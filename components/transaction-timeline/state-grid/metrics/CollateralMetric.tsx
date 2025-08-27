import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";

interface CollateralMetricProps {
  collateralType: string;
  before?: number;
  after: number;
  afterInUsd: number;
  isCloseTrove: boolean;
}

export function CollateralMetric({ collateralType, before, after, afterInUsd, isCloseTrove }: CollateralMetricProps) {
  const hasChange = before && before !== after;
  return (
    <StateMetric label="Collateral" icon={<TokenIcon assetSymbol={collateralType} className="mr-2 w-5 h-5" />}>
      <StateTransition>
        {hasChange && (
          <>
            <div className="flex items-center space-x-1">
              <span className="text-slate-600">{before}</span>
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <div className="flex items-center space-x-1">
            <span className="text-sm font-semibold text-white">{after}</span>
            <span className="text-xs flex items-center text-slate-600 border-l border-r border-slate-600 font-medium rounded-sm px-1 py-0">
              ${afterInUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </StateTransition>
    </StateMetric>
  );
}
