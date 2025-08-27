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
  const { hoveredValue, setHoveredValue } = useHover();
  
  const isHighlighted = hoveredValue?.type === type && hoveredValue?.state === state;
  
  return (
    <span
      className={`cursor-pointer text-slate-200 ${
        isHighlighted ? 'underline decoration-dotted underline-offset-2 text-slate-200' : ''
      }`}
      onMouseEnter={() => setHoveredValue({ type, state, value })}
      onMouseLeave={() => setHoveredValue(null)}
    >
      {children}
    </span>
  );
}