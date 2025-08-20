import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";

interface CollateralMetricProps {
  collateralType: string;
  before?: number;
  after: number;
  afterInUsd?: number;
  isCloseTrove: boolean;
}

export function CollateralMetric({
  collateralType,
  before,
  after,
  afterInUsd = 0,
  isCloseTrove,
}: CollateralMetricProps) {
  const hasChange = before && before !== after;
  return (
    <StateMetric label="Collateral" icon={<TokenIcon assetSymbol={collateralType} className="mr-2 w-5 h-5" />}>
      <StateTransition>
        {hasChange && (
          <>
            <div className="text-slate-700">{before}</div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <div className="flex items-center space-x-1">
            <span className="text-sm font-semibold text-white">{after}</span>
            {afterInUsd > 0 && (
              <span className="text-xs flex items-center text-slate-600 border border-slate-600 font-medium rounded-sm px-1 py-0">
                {afterInUsd}
              </span>
            )}
          </div>
        )}
      </StateTransition>
    </StateMetric>
  );
}
