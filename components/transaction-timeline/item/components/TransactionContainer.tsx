import { ReactNode, CSSProperties } from 'react';

interface TransactionContainerProps {
  children: ReactNode;
  className: string;
  style?: CSSProperties;
}

export function TransactionContainer({ children, className, style }: TransactionContainerProps) {
  return (
    <div className="w-full text-sm">
      <div className={className} style={style}>
        {children}
      </div>
    </div>
  );
}