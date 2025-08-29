import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { InfoButton } from '../InfoButton';
import { FAQ_URLS } from '../shared/faqUrls';
import { formatCurrency, formatUsdValue } from '@/lib/utils/format';

interface LiquidateExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function LiquidateExplanation({ transaction, onToggle }: LiquidateExplanationProps) {
  const tx = transaction as any;
  const liquidatedColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const liquidatedDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const liquidatedCollUsd = tx.stateBefore?.collateralInUsd;
  const liquidationBeforeCollRatio = tx.stateBefore?.collateralRatio;
  const liquidationBeforeInterestRate = tx.stateBefore?.annualInterestRate || tx.stateAfter.annualInterestRate;
  
  const liquidateItems: React.ReactNode[] = [
    <span key="liquidated" className="text-red-400">
      Trove was liquidated due to insufficient collateral ratio
      <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
    </span>,
    <span key="seizedCollateral" className="text-slate-500">
      The protocol seized{' '}
      <HighlightableValue type="collateral" state="change" value={liquidatedColl}>
        {liquidatedColl} {tx.collateralType}
      </HighlightableValue>
      {liquidatedCollUsd ? ` valued at ${formatUsdValue(liquidatedCollUsd)}` : ''}
    </span>,
    <span key="clearedDebt" className="text-slate-500">
      Outstanding debt of{' '}
      <HighlightableValue type="debt" state="change" value={liquidatedDebt}>
        {formatCurrency(liquidatedDebt, tx.assetType)}
      </HighlightableValue>
      {' '}was cleared by the liquidator
    </span>
  ];

  if (liquidationBeforeCollRatio !== undefined) {
    liquidateItems.push(
      <span key="ratioBeforeLiquidation" className="text-slate-500">
        Collateral ratio had fallen to {liquidationBeforeCollRatio}% before liquidation
      </span>
    );
  }

  if (liquidationBeforeInterestRate !== undefined) {
    liquidateItems.push(
      <span key="interestRateBeforeLiquidation" className="text-slate-500">
        Interest rate was {liquidationBeforeInterestRate}% annual before closure
      </span>
    );
  }

  liquidateItems.push(
    <span key="zeroCollateral" className="text-slate-500">
      All collateral is now{' '}
      <HighlightableValue type="collateral" state="after" value={0}>
        0 {tx.collateralType}
      </HighlightableValue>
    </span>,
    <span key="zeroDebt" className="text-slate-500">
      All debt is now{' '}
      <HighlightableValue type="debt" state="after" value={0}>
        0 {tx.assetType}
      </HighlightableValue>
    </span>,
    <span key="warning" className="text-yellow-500">
      ⚠️ Liquidation occurs when collateral ratio falls below the minimum threshold
      <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
    </span>,
    <span key="closed" className="text-slate-300">
      Trove closed through liquidation
    </span>
  );
  
  return (
    <ExplanationPanel items={liquidateItems} onToggle={onToggle} />
  );
}