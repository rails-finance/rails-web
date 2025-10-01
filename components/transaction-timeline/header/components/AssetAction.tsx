'use client';

import { TokenIcon } from "@/components/icons/tokenIcon";
import { useHover, ValueType, shouldHighlight } from '../../context/HoverContext';
import { toLocaleStringHelper } from '@/lib/utils/format';

interface AssetActionProps {
  action: string;
  asset: string;
  amount?: number;
  className?: string;
  alwaysShowAmount?: boolean;
  valueType?: ValueType; // 'debt' | 'collateral' | etc.
}

export function AssetAction({ action, asset, amount, alwaysShowAmount = false, valueType }: AssetActionProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  
  const isHighlighted = hoverEnabled && valueType && amount && shouldHighlight(hoveredValue, valueType, 'change');
  
  return (
    <div className="flex items-center space-x-1">
      <span className="font-bold text-slate-400 mr-1">{action}</span>
      {amount && (
        <span
          className={`font-medium ${alwaysShowAmount ? '' : 'sm:hidden'} ${
            hoverEnabled && valueType ? 'cursor-pointer' : ''
          } ${
            isHighlighted ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse' : ''
          }`}
          onMouseEnter={hoverEnabled && valueType ? () => setHoveredValue({ type: valueType, state: 'change', value: amount }) : undefined}
          onMouseLeave={hoverEnabled && valueType ? () => setHoveredValue(null) : undefined}
        >
          {toLocaleStringHelper(amount)}
        </span>
      )}
      <TokenIcon assetSymbol={asset} />
    </div>
  );
}
