import { ReactNode } from "react";

interface TransactionContentProps {
  children: ReactNode;
  isInBatch: boolean;
  isExpanded: boolean;
  onClick: () => void;
}

export function TransactionContent({ children, isInBatch, isExpanded, onClick }: TransactionContentProps) {
  let contentClassName =
    "grow p-4 sm:pb-6 sm:px-6 self-start grid grid-col-1 transition-colors duration-150 cursor-pointer mt-1.5 mb-2.5 rounded-md hover:bg-slate-900";

  if (isExpanded) {
    contentClassName += " gap-4 bg-slate-900";
  }
  if (isInBatch) {
    contentClassName += " bg-fuchsia-900/10";
  }
  return (
    <div
      className={contentClassName}
      onClick={onClick}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} transaction details`}
    >
      {children}
    </div>
  );
}
