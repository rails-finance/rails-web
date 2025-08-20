import { ReactNode } from 'react';

interface TransactionContainerProps {
  children: ReactNode;
  className: string;
}

export function TransactionContainer({ children, className }: TransactionContainerProps) {
  return (
    <div className="w-full text-sm">
      <div className={className}>
        {children}
      </div>
    </div>
  );
}