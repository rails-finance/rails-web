'use client';

import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { useHover } from '../context/HoverContext';
import { OpenTroveExplanation } from './events/OpenTroveExplanation';
import { OpenTroveAndJoinBatchExplanation } from './events/OpenTroveAndJoinBatchExplanation';
import { CloseTroveExplanation } from './events/CloseTroveExplanation';
import { AdjustTroveExplanation } from './events/AdjustTroveExplanation';
import { AdjustTroveInterestRateExplanation } from './events/AdjustTroveInterestRateExplanation';
import { LiquidateExplanation } from './events/LiquidateExplanation';
import { RedeemCollateralExplanation } from './events/RedeemCollateralExplanation';
import { SetInterestBatchManagerExplanation } from './events/SetInterestBatchManagerExplanation';
import { RemoveFromBatchExplanation } from './events/RemoveFromBatchExplanation';
import { ApplyPendingDebtExplanation } from './events/ApplyPendingDebtExplanation';
import { DefaultExplanation } from './events/DefaultExplanation';

interface EventExplanationProps {
  transaction: Transaction;
}

export function EventExplanation({ transaction }: EventExplanationProps) {
  const { setHoverEnabled } = useHover();
  
  const handleToggle = (isOpen: boolean) => {
    setHoverEnabled(isOpen);
  };
  
  const generateExplanation = (): React.ReactNode => {
    const tx = transaction as any;
    
    switch (tx.operation) {
      case 'openTrove':
        return <OpenTroveExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'openTroveAndJoinBatch':
        return <OpenTroveAndJoinBatchExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'closeTrove':
        return <CloseTroveExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'adjustTrove':
        return <AdjustTroveExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'adjustTroveInterestRate':
        return <AdjustTroveInterestRateExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'liquidate':
        return <LiquidateExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'redeemCollateral':
        return <RedeemCollateralExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'setInterestBatchManager':
        return <SetInterestBatchManagerExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'removeFromBatch':
        return <RemoveFromBatchExplanation transaction={transaction} onToggle={handleToggle} />;
      
      case 'applyPendingDebt':
        return <ApplyPendingDebtExplanation transaction={transaction} onToggle={handleToggle} />;
      
      default:
        return <DefaultExplanation transaction={transaction} onToggle={handleToggle} />;
    }
  };

  const explanation = generateExplanation();
  
  return (
    <div className="mb-6">
      {explanation}
    </div>
  );
}