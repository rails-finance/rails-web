import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";

interface DebtMetricProps {
  assetType: string;
  before?: number;
  after: number;
  isCloseTrove: boolean;
}

export function DebtMetric({ assetType, before, after, isCloseTrove }: DebtMetricProps) {
  const hasChange = before && before !== after;
  return (
    <StateMetric label="Debt" icon={<TokenIcon assetSymbol={assetType} className="mr-2 w-5 h-5 text-green-400" />}>
      <StateTransition>
        {hasChange && (
          <>
            <div className="text-slate-600">{before}</div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? <ClosedStateLabel /> : <div className="text-sm font-semibold text-white">{after}</div>}
      </StateTransition>
    </StateMetric>
  );
}
