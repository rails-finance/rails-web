"use client";

// The card's accrual and batch fee, read from the page's ledger where it has
// one (lib/liquity/accrual.ts).

import { useMemo } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { liquityAccrual, type LiquityAccrual } from "@/lib/liquity/accrual";
import { exactRateAfter } from "@/lib/liquity/utils/interest-calculator";

export function useLiquityAccrual(
  ctx: LiquityContext,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
): LiquityAccrual {
  const focus = useFlowFocus();
  const ledger = currentEvent ? (focus?.events.find((e) => e.id === currentEvent.id) ?? null) : null;
  return useMemo(
    () => liquityAccrual(ctx, previousEvent, currentEvent, ledger),
    [ctx, previousEvent, currentEvent, ledger],
  );
}

/** The batch's annual management fee (percent) in force after this event,
 *  and where it is read: the event's BatchUpdated log, else the ledger's
 *  rate in force (rate + fee) less the trove's rate. Null where the trove is
 *  not batched or neither states it. */
export interface BatchFeeAfter {
  fee: number;
  source: "log" | "ledger";
}

export function useBatchFeeAfter(ctx: LiquityContext, currentEvent?: BaseActivityEvent): BatchFeeAfter | null {
  const focus = useFlowFocus();
  if (!ctx.isInBatch) return null;
  const logged = ctx.batchUpdate?.annualManagementFee;
  if (logged != null) return { fee: logged, source: "log" };
  const ledger = currentEvent ? focus?.events.find((e) => e.id === currentEvent.id) : undefined;
  if (ledger?.rate == null) return null;
  const fee = Math.round((ledger.rate - exactRateAfter(ctx)) * 1e6) / 1e6;
  return fee > 0 ? { fee, source: "ledger" } : null;
}
