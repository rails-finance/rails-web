"use client";

// PWN event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. Each PWN lifecycle event concerns ONE fixed value (the credit advanced,
// the repayment, or the seized collateral); this maps it into the shared row spec
// and traces it via <Prov>. No health factor, no USD — a fixed-term loan has none.

import type { AssetFlow, PwnContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import { creditAdvancedProv, repayAmountProv, collateralSeizedProv, type PwnCoords } from "@/lib/pwn/event-provenance";

export interface PwnEventHeaderProps {
  actionLabel: string;
  ctx: PwnContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** The event's own movements, read for the credit and collateral contracts.
   *  PWN is peer-to-peer — the two parties agree on whatever assets they like —
   *  so the symbols arriving here come from an open set, and a hand-kept table
   *  is structurally the wrong place to resolve them. The loan's flows name the
   *  contracts that changed hands. */
  flows?: AssetFlow[];
}

export function PwnEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  flows,
}: PwnEventHeaderProps) {
  const coords: PwnCoords = { txHash, blockNumber, loanId: ctx.loanId, version: ctx.version };
  const deltas: ChainTruthDelta[] = [];
  const creditAddress = soleFlowAddress(flows, ctx.creditSymbol);
  const isSeizure = ctx.eventType === "claimed" && ctx.defaulted === true;

  if (ctx.eventType === "created" && ctx.creditSymbol) {
    const v = Number(ctx.creditAmount ?? "0") || 0;
    if (v !== 0)
      deltas.push({
        value: v,
        symbol: ctx.creditSymbol,
        address: creditAddress,
        prov: creditAdvancedProv(ctx.creditSymbol, coords),
      });
  } else if (ctx.eventType === "paid_back" && ctx.creditSymbol) {
    const v = Number(ctx.loanRepayAmount ?? "0") || 0;
    if (v !== 0)
      deltas.push({
        value: v,
        symbol: ctx.creditSymbol,
        address: creditAddress,
        prov: repayAmountProv(ctx.creditSymbol, coords),
      });
  } else if (isSeizure && ctx.collateralSymbol) {
    // Collateral leaves the borrower to the lender — a negative move. For an NFT
    // the amount is a unit count (1); the token chip + id carry the identity.
    const v = Number(ctx.collateralAmount ?? "1") || 1;
    deltas.push({
      value: -v,
      symbol: ctx.collateralSymbol,
      address: soleFlowAddress(flows, ctx.collateralSymbol),
      prov: collateralSeizedProv(ctx.collateralSymbol, coords),
    });
  } else if (ctx.eventType === "claimed" && !ctx.defaulted && ctx.creditSymbol) {
    // The settle claim: the note holder collects the repaid credit — the
    // amount IS the terms' repay total (the borrower paid exactly it), so the
    // same receipt traces it, matching the paid_back grammar.
    const v = Number(ctx.loanRepayAmount ?? "0") || 0;
    if (v !== 0)
      deltas.push({
        value: v,
        symbol: ctx.creditSymbol,
        address: creditAddress,
        prov: repayAmountProv(ctx.creditSymbol, coords),
      });
  }

  return (
    <ChainTruthRow
      spec={{ label: actionLabel, critical: isSeizure, deltas }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
