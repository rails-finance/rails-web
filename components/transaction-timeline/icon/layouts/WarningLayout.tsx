import { ReactNode } from 'react';
import { IconWrapper } from '../base/IconWrapper';

interface WarningLayoutProps {
  children: ReactNode; // The warning symbol
  className?: string;
}

export function WarningLayout({ children, className = '' }: WarningLayoutProps) {
  return (
    <div className={`transaction-single ${className}`} style={{ position: 'relative', zIndex: 1 }}>
      <div className="transaction-step step-single">
        <IconWrapper width={80} height={40} viewBox="0 0 80 40">
          {children}
        </IconWrapper>
      </div>
    </div>
  );
}