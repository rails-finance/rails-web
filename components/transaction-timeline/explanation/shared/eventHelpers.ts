import { Transaction, isTroveTransaction } from '@/types/api/troveHistory';

export const getUpfrontFee = (tx: Transaction): number => {
  if (isTroveTransaction(tx)) {
    const debtIncrease = tx.troveOperation?.debtIncreaseFromUpfrontFee || 0;
    return debtIncrease;
  }
  return 0;
};

export const formatCurrency = (value: number, currency: string): string => {
  return `${value.toLocaleString()} ${currency}`;
};

export const formatPrice = (value: number): string => {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatUsdValue = (value: number): string => {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};


export const isHighRisk = (collRatio?: number): boolean => {
  return collRatio ? collRatio < 150 : false;
};

export const isConservative = (collRatio?: number): boolean => {
  return collRatio ? collRatio > 250 : false;
};

export const isZombieTrove = (debt: number): boolean => {
  return debt >= 0 && debt < 2000; // MIN_DEBT in BOLD
};

export const calculateFeePercentage = (fee: number, principal: number): string => {
  return ((fee / principal) * 100).toFixed(2);
};

export const LIQUIDATION_RESERVE_ETH = 0.0375;