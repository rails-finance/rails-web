'use client';

import { useHover, shouldHighlight, ValueType } from '../../context/HoverContext';
import { toLocaleStringHelper } from '@/lib/utils/format';

interface ChangeValueProps {
  amount: number;
  type?: ValueType;
}

export function ChangeValue({ amount, type }: ChangeValueProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  
  const isHighlighted = hoverEnabled && type && shouldHighlight(hoveredValue, type, 'change');
  
  if (!type || !hoverEnabled) {
    return <span className="font-medium text-white min-h-10 flex items-center justify-end">{toLocaleStringHelper(amount)}</span>;
  }
  
  return (
    <span 
      className={`font-medium text-white min-h-10 flex items-center justify-end cursor-pointer transition-all ${isHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
      onMouseEnter={() => setHoveredValue({ type, state: 'change', value: amount })}
      onMouseLeave={() => setHoveredValue(null)}
    >
      {toLocaleStringHelper(amount)}
    </span>
  );
}
