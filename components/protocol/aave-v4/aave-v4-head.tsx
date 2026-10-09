"use client";

// Aave V4's T1, as the card's `head` slot (ui-jobs 309): the shared
// ChainTruthRow, stated from the event. The word (Enable as the green pill
// where a supply also turned the reserve on as collateral; the liquidation's
// word in the critical red), the moved amount as a magnitude (the event type
// carries the direction), a liquidation's two legs, a collateral toggle's
// reserve, the borrow rate on a borrow or repay, the acting party where it is
// not the owner, and "2 of 3" first where the transaction holds several of the
// position's operations.

import { formatExact } from "@/lib/utils/format";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { effectiveBorrowAPR, borrowRatesByDebt } from "@/lib/aave-v4/borrow-rate";
import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import { AAVE_V4_LABELS } from "@/lib/aave-v4/event-label";
import type { Provenance } from "@/components/shared/provenance";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { eventLogProv, heldDebtRateProv, externalActorProv } from "@/lib/aave-v4/position-provenance";

/** 1-based position + total within a shared tx_hash. `count > 1` draws the
 *  "X of Y" chip at the head's start. */
export interface AaveV4TxGroup {
  index: number;
  count: number;
}

const LABEL: Record<string, string> = {
  supply: AAVE_V4_LABELS.supply,
  withdraw: AAVE_V4_LABELS.withdraw,
  borrow: AAVE_V4_LABELS.borrow,
  repay: AAVE_V4_LABELS.repay,
  liquidation: AAVE_V4_LABELS.liquidation,
  collateral_toggle: AAVE_V4_LABELS.collateral_toggle,
};

// The emitted log + Solidity field each moved amount is read from — surfaced
// in the receipt's via line so the number ties to the actual on-chain anatomy.
// Field names match the spoke ABI (Repay emits repaidAmount; the premiumDelta
// leg is stored separately and is not part of this figure).
const AMOUNT_FIELD: Record<string, string> = {
  supply: "suppliedAmount",
  withdraw: "withdrawnAmount",
  borrow: "drawnAmount",
  repay: "repaidAmount",
};
const AMOUNT_LOG: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};
// Receipt-bar name clause per event type — short, since it IS the row label.
const AMOUNT_LABEL: Record<string, string> = {
  supply: "Amount supplied",
  withdraw: "Amount withdrawn",
  borrow: "Amount borrowed",
  repay: "Amount repaid",
};

/** Tx/spoke coordinates the amount receipt is stamped with. */
interface AaveV4AmountCoord {
  spokeName?: string;
  spokeAddress?: string;
  txHash?: string;
  blockNumber?: number;
}

/** The word the head states: Enable or Disable on a collateral toggle. */
const labelOf = (ctx: AaveV4Context): string =>
  ctx.eventType === "collateral_toggle"
    ? ctx.enabled
      ? "Enable"
      : "Disable"
    : (LABEL[ctx.eventType] ?? ctx.eventType);

/** The amount receipt for a non-liquidation row. The value is UNSIGNED: V4's
 *  `ctx.amount` is a magnitude whose direction is carried by `eventType`, so
 *  the delta states it as `exact` rather than through `chainTruthDeltaValue`,
 *  which would prepend a sign. */
function amountProv(ctx: AaveV4Context, coord: AaveV4AmountCoord): { info: Provenance; value: string } {
  const amount = parseFloat(ctx.amount ?? "0") || 0;
  const label = labelOf(ctx);
  return {
    value: formatExact(amount),
    info: eventLogProv(
      AMOUNT_LABEL[ctx.eventType] ?? `Amount ${label.toLowerCase()}`,
      AMOUNT_FIELD[ctx.eventType] ?? label,
      { ...coord, asset: ctx.reserveSymbol, raw: ctx.raw?.amount, origin: ctx.origin?.amount },
      AMOUNT_LOG[ctx.eventType],
    ),
  };
}

export function useAaveV4HeadSpec({
  ctx,
  txHash,
  blockNumber,
  txGroup,
  externalBy,
}: {
  ctx: AaveV4Context;
  txHash?: string;
  blockNumber?: number;
  txGroup?: AaveV4TxGroup;
  /** Third-party actor (the card's externalActor() verdict). */
  externalBy?: string;
}): ChainTruthRowSpec {
  const { showInterestRates, showTickerLabels } = useTimelineDisplay();
  const coord = { spokeName: ctx.spokeName, spokeAddress: ctx.spokeAddress, txHash, blockNumber };
  // The symbol beside each icon, under the Display menu's ticker-label toggle.
  const suffix = (sym?: string | null) => (showTickerLabels && sym ? aaveV4DisplaySymbol(sym) : undefined);
  const isLiq = ctx.eventType === "liquidation";
  const amount = parseFloat(ctx.amount ?? "0") || 0;

  const deltas: ChainTruthDelta[] = [];
  if (isLiq) {
    // A liquidation's two legs, the collateral seized and the debt repaid,
    // each with its receipt; the spine draws them as nodes.
    if (ctx.liquidatedCollateralAmount && ctx.collateralSymbol) {
      const n = Number(ctx.liquidatedCollateralAmount);
      deltas.push({
        label: "Seized",
        value: n,
        exact: formatExact(n),
        symbol: ctx.collateralSymbol,
        suffix: suffix(ctx.collateralSymbol),
        prov: eventLogProv(
          "Collateral seized in the liquidation",
          "collateralAmountRemoved",
          {
            ...coord,
            asset: ctx.collateralSymbol,
            raw: ctx.raw?.liquidatedCollateralAmount,
            origin: ctx.origin?.liquidatedCollateralAmount,
          },
          "LiquidationCall",
        ),
      });
    }
    if (ctx.debtToCover) {
      const n = Number(ctx.debtToCover);
      deltas.push({
        label: "Repaid",
        value: n,
        exact: formatExact(n),
        symbol: ctx.reserveSymbol ?? "???",
        suffix: suffix(ctx.reserveSymbol),
        prov: eventLogProv(
          "Debt repaid by the liquidation",
          "debtAmountRestored",
          { ...coord, asset: ctx.reserveSymbol, raw: ctx.raw?.amount, origin: ctx.origin?.amount },
          "LiquidationCall",
        ),
      });
    }
  } else if (amount > 0) {
    const p = amountProv(ctx, coord);
    deltas.push({
      value: amount,
      exact: p.value,
      symbol: ctx.reserveSymbol ?? "???",
      suffix: suffix(ctx.reserveSymbol),
      prov: p.info,
      // A supply that also turned the reserve on as collateral reads
      // "Enable Supply 10 ◊": the verb stays, the value hands off.
      ...(ctx.alsoToggledCollateral ? { label: "Supply", axisVerb: true } : {}),
    });
  }

  // The rate pill only on a borrow or repay, where it follows the moved
  // asset's icon and is that asset's rate; an echo of the detail's Borrow
  // Rate row.
  const apr = effectiveBorrowAPR(ctx);
  const ratePill =
    showInterestRates && (ctx.eventType === "borrow" || ctx.eventType === "repay") && apr
      ? {
          pct: parseFloat(apr) * 100,
          prov: heldDebtRateProv({ ...coord, asset: borrowRatesByDebt(ctx)[0]?.symbol ?? ctx.reserveSymbol }),
        }
      : undefined;

  return {
    label: ctx.alsoToggledCollateral ? "Enable" : labelOf(ctx),
    status: ctx.alsoToggledCollateral ? "open" : undefined,
    critical: isLiq || undefined,
    unsignedDeltas: true,
    deltas,
    asset:
      ctx.eventType === "collateral_toggle" && ctx.reserveSymbol
        ? { symbol: ctx.reserveSymbol, text: aaveV4DisplaySymbol(ctx.reserveSymbol) }
        : undefined,
    ratePill,
    externalActor:
      !isLiq && externalBy && ctx.owner && ctx.txFrom && ctx.caller
        ? {
            address: externalBy,
            prov: externalActorProv(
              { eventType: ctx.eventType, owner: ctx.owner, txFrom: ctx.txFrom, caller: ctx.caller },
              { ...coord, asset: ctx.reserveSymbol },
            ),
          }
        : undefined,
    sameBlock:
      txGroup && txGroup.count > 1
        ? {
            index: txGroup.index,
            count: txGroup.count,
            title: `Operation ${txGroup.index} of ${txGroup.count} in this transaction`,
            lead: true,
          }
        : undefined,
  };
}
