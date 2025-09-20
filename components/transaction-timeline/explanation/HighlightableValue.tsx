'use client';

import { useHover, ValueType, ValueState } from '../context/HoverContext';

interface HighlightableValueProps {
  children: React.ReactNode;
  type: ValueType;
  state: ValueState;
  value?: number;
  className?: string;
  asBlock?: boolean;
}

export function HighlightableValue({
  children,
  type,
  state,
  value,
  className = 'text-slate-300',
  asBlock = false
}: HighlightableValueProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  // Skip hover interactions for 'before' states or when hover is disabled
  const shouldEnableHover = hoverEnabled && state !== 'before';
  const isHighlighted = shouldEnableHover && hoveredValue?.type === type && hoveredValue?.state === state;

  const Component = asBlock ? 'div' : 'span';

  return (
    <Component
      className={`${asBlock ? 'inline-block' : 'font-semibold'} ${shouldEnableHover ? 'cursor-pointer ' : ''} ${
        isHighlighted ? 'text-blue-100 -mx-1 px-1 -my-0.5 py-0.5 bg-blue-900 rounded' : className
      }`}
      onMouseEnter={shouldEnableHover ? () => setHoveredValue({ type, state, value }) : undefined}
      onMouseLeave={shouldEnableHover ? () => setHoveredValue(null) : undefined}
    >
      {children}
    </Component>
  );
}