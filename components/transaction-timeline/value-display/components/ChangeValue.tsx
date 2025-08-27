'use client';

import { useHover, shouldHighlight, ValueType } from '../../context/HoverContext';

interface ChangeValueProps {
  amount: number;
  type?: ValueType;
}

export function ChangeValue({ amount, type }: ChangeValueProps) {
  const { hoveredValue, setHoveredValue } = useHover();
  
  const isHighlighted = type && shouldHighlight(hoveredValue, type, 'change');
  
  if (!type) {
    return <span className="font-medium text-white min-h-10 flex items-center justify-end">{amount}</span>;
  }
  
  return (
    <span 
      className={`font-medium text-white min-h-10 flex items-center justify-end cursor-pointer transition-all ${isHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
      onMouseEnter={() => setHoveredValue({ type, state: 'change', value: amount })}
      onMouseLeave={() => setHoveredValue(null)}
    >
      {amount}
    </span>
  );
}
