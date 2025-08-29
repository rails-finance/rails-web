'use client';

import { useHover, ValueType, ValueState } from '../context/HoverContext';

interface HighlightableValueProps {
  children: React.ReactNode;
  type: ValueType;
  state: ValueState;
  value?: number;
}

export function HighlightableValue({ 
  children, 
  type, 
  state, 
  value 
}: HighlightableValueProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  
  // Skip hover interactions for 'before' states or when hover is disabled
  const shouldEnableHover = hoverEnabled && state !== 'before';
  const isHighlighted = shouldEnableHover && hoveredValue?.type === type && hoveredValue?.state === state;
  
  return (
    <span
      className={`font-semibold ${shouldEnableHover ? 'cursor-pointer' : ''} text-slate-200 ${
        isHighlighted ? 'underline decoration-dotted underline-offset-2 text-slate-200' : ''
      }`}
      onMouseEnter={shouldEnableHover ? () => setHoveredValue({ type, state, value }) : undefined}
      onMouseLeave={shouldEnableHover ? () => setHoveredValue(null) : undefined}
    >
      {children}
    </span>
  );
}