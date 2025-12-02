"use client";

import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { useHover } from "../context/HoverContext";
import { OpenTroveExplanation } from "./events/OpenTroveExplanation";
import { OpenTroveAndJoinBatchExplanation } from "./events/OpenTroveAndJoinBatchExplanation";
import { CloseTroveExplanation } from "./events/CloseTroveExplanation";
import { AdjustTroveExplanation } from "./events/AdjustTroveExplanation";
import { AdjustTroveInterestRateExplanation } from "./events/AdjustTroveInterestRateExplanation";
import { LiquidateExplanation } from "./events/LiquidateExplanation";
import { RedeemCollateralExplanation } from "./events/RedeemCollateralExplanation";
import { SetInterestBatchManagerExplanation } from "./events/SetInterestBatchManagerExplanation";
import { RemoveFromBatchExplanation } from "./events/RemoveFromBatchExplanation";
import { ApplyPendingDebtExplanation } from "./events/ApplyPendingDebtExplanation";
import { TransferTroveExplanation } from "./events/TransferTroveExplanation";
import { DefaultExplanation } from "./events/DefaultExplanation";
import { BatchManagerInterestRateUpdateExplanation } from "./events/BatchManagerInterestRateUpdateExplanation";

interface EventExplanationProps {
  transaction: Transaction;
  previousTransaction?: Transaction;
  onToggle: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function EventExplanation({ transaction, previousTransaction, onToggle, defaultOpen }: EventExplanationProps) {
  const { setHoverEnabled } = useHover();

  const handleToggle = (isOpen: boolean) => {
    setHoverEnabled(isOpen);
    onToggle(isOpen);
  };

  const generateExplanation = (): React.ReactNode => {
    const tx = transaction as any;

    switch (tx.operation) {
      case "openTrove":
        return <OpenTroveExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "openTroveAndJoinBatch":
        return <OpenTroveAndJoinBatchExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "closeTrove":
        return <CloseTroveExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "adjustTrove":
        return (
          <AdjustTroveExplanation
            transaction={transaction}
            previousTransaction={previousTransaction}
            onToggle={handleToggle}
            defaultOpen={defaultOpen}
          />
        );

      case "adjustTroveInterestRate":
        return (
          <AdjustTroveInterestRateExplanation
            transaction={transaction}
            previousTransaction={previousTransaction}
            onToggle={handleToggle}
            defaultOpen={defaultOpen}
          />
        );

      case "liquidate":
        return <LiquidateExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "redeemCollateral":
        return <RedeemCollateralExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "setInterestBatchManager":
        return <SetInterestBatchManagerExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "removeFromBatch":
        return <RemoveFromBatchExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "applyPendingDebt":
        return <ApplyPendingDebtExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "transferTrove":
        return <TransferTroveExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "setBatchManagerAnnualInterestRate":
        return <BatchManagerInterestRateUpdateExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      case "lowerBatchManagerAnnualFee":
        return <BatchManagerInterestRateUpdateExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;

      default:
        return <DefaultExplanation transaction={transaction} onToggle={handleToggle} defaultOpen={defaultOpen} />;
    }
  };

  const explanation = generateExplanation();

  return explanation;
}
