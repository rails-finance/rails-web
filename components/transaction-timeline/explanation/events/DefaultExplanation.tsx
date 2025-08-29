import React from 'react';
import { Transaction } from '@/types/api/troveHistory';

interface DefaultExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function DefaultExplanation({ transaction, onToggle }: DefaultExplanationProps) {
  const tx = transaction as any;
  const defaultBeforeDebt = tx.stateBefore?.debt;
  const defaultAfterDebt = tx.stateAfter.debt;
  const defaultBeforeColl = tx.stateBefore?.coll;
  const defaultAfterColl = tx.stateAfter.coll;
  const defaultBeforeRatio = tx.stateBefore?.collateralRatio;
  const defaultAfterRatio = tx.stateAfter.collateralRatio;
  
  return (
    <div className="bg-slate-800/40 rounded-lg p-4 space-y-2">
      <div className="text-white space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-slate-400 mt-0.5">•</span>
          <span>{tx.operation.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} executed</span>
        </div>
        {defaultBeforeDebt !== undefined && (
          <div className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5">•</span>
            <span>Debt changed from {defaultBeforeDebt.toLocaleString()} to {defaultAfterDebt.toLocaleString()} {tx.assetType}</span>
          </div>
        )}
        {defaultBeforeColl !== undefined && (
          <div className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5">•</span>
            <span>Collateral changed from {defaultBeforeColl} to {defaultAfterColl} {tx.collateralType}</span>
          </div>
        )}
      </div>
      {defaultBeforeRatio && defaultAfterRatio && (
        <div className="pt-2 mt-2 border-t border-slate-700/50 flex items-center gap-4 text-sm text-slate-300">
          <span>Collateral ratio {defaultBeforeRatio}% → {defaultAfterRatio}%</span>
        </div>
      )}
    </div>
  );
}