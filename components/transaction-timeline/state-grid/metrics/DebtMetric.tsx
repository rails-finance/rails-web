import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";

interface DebtMetricProps {
  assetType: string;
  before?: number;
  after: number;
  isCloseTrove: boolean;
  upfrontFee?: number;
}

export function DebtMetric({ assetType, before, after, isCloseTrove, upfrontFee }: DebtMetricProps) {
  const hasChange = before && before !== after;
  return (
    <StateMetric label="Debt" icon={<TokenIcon assetSymbol={assetType} className="mr-2 w-5 h-5 text-green-400" />}>
      <div>
        <StateTransition>
          {hasChange && (
            <>
              <div className="text-slate-600">{before}</div>
              <TransitionArrow />
            </>
          )}
          <div className="flex">
            <div className="flex flex-row">
              {isCloseTrove ? <ClosedStateLabel /> : <div className="text-sm font-semibold text-white">{after}</div>}
            </div>
          </div>
        </StateTransition>
        {upfrontFee !== undefined && upfrontFee > 0 && (
          <div className="">
            <span className="text-xs text-slate-500 mt-0.5 block">Fee: {upfrontFee}</span>
          </div>
        )}
      </div>
    </StateMetric>
  );
}
