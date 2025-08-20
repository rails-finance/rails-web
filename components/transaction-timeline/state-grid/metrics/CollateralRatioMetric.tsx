import { StateMetric } from "../components/StateMetric";
import {
  StateTransition,
  TransitionArrow,
} from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";

interface CollateralRatioMetricProps {
  before?: number;
  after: number;
  isCloseTrove: boolean;
}

export function CollateralRatioMetric({
  before,
  after,
  isCloseTrove,
}: CollateralRatioMetricProps) {
  const hasChange = before && before !== after;
  return (
    <StateMetric label="Collateral Ratio">
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
          <span className="text-sm font-semibold text-white">{after}</span>
        )}
      </StateTransition>
    </StateMetric>
  );
}
