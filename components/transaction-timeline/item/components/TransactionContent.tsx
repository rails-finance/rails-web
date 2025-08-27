import { ReactNode } from "react";

interface TransactionContentProps {
  children: ReactNode;
  isInBatch: boolean;
  isExpanded: boolean;
}

export function TransactionContent({ children, isInBatch, isExpanded }: TransactionContentProps) {
  let containerClassName = "grow self-start mt-1.5 mb-2.5 rounded-md group transition-colors duration-150";

  if (isExpanded) {
    containerClassName += " bg-slate-900";
  } else if (isInBatch) {
    containerClassName += " bg-fuchsia-900/10 hover:bg-fuchsia-900/20";
  } else {
    containerClassName += " hover:bg-slate-900";
  }

  return <div className={containerClassName}>{children}</div>;
}
