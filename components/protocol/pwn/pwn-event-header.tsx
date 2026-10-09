"use client";

// PWN event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. Each PWN lifecycle event concerns ONE fixed value (the credit advanced,
// the repayment, or the seized collateral); this maps it into the shared row spec
// and traces it via <Prov>. No health factor, no USD — a fixed-term loan has none.

import type { AssetFlow, PwnContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  creditAdvancedProv,
  collateralSeizedProv,
  extendedDeadlineProv,
  rowRepay,
  type PwnCoords,
} from "@/lib/pwn/event-provenance";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

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

/** A loan-sized figure in full: "1,380", "1,490.4", "0.1". */
export const fullAmount = (v: number): string => formatNumber(Math.abs(v));

/** "22 Feb 2024" from a unix-seconds integer string. */
const dateOfTs = (v?: string): string | null => (v == null ? null : formatDate(Number(v)));

/** T1's head row spec (the card's `head` slot). */
export function usePwnHeadSpec({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  flows,
}: PwnEventHeaderProps): ChainTruthRowSpec {
  const coords: PwnCoords = { txHash, blockNumber, loanId: ctx.loanId, version: ctx.version };
  const deltas: ChainTruthDelta[] = [];
  const creditAddress = soleFlowAddress(flows, ctx.creditSymbol);
  const isSeizure = ctx.eventType === "claimed" && ctx.defaulted === true;
  // Amounts are unsigned and say where they went, so the row reads the same
  // from either party's page: a sign would be the viewer's, and a lender and a
  // borrower looking at the same claim would see opposite ones. The direction
  // rides the row's note, which stays at every width (the amount hands
  // off to the spine at ≥sm).
  let direction: string | undefined;
  const moved = (v: number, symbol: string, address: string | undefined, prov: Provenance, where: string) => {
    deltas.push({ value: v, symbol, address, prov, display: fullAmount(v), suffix: symbol });
    direction = where;
  };

  if (ctx.eventType === "created" && ctx.creditSymbol) {
    const v = Number(ctx.creditAmount ?? "0") || 0;
    if (v !== 0)
      moved(v, ctx.creditSymbol, creditAddress, creditAdvancedProv(ctx.creditSymbol, coords), "to the borrower");
  } else if (ctx.eventType === "paid_back" && ctx.creditSymbol) {
    const r = rowRepay(ctx, coords);
    const v = Number(r?.amount ?? "0") || 0;
    if (v !== 0 && r) moved(v, ctx.creditSymbol, creditAddress, r.prov, "from the borrower");
  } else if (isSeizure && ctx.collateralSymbol) {
    // The collateral passes to the lender. For an NFT the amount is a unit
    // count (1); the token chip + id carry the identity.
    const v = Number(ctx.collateralAmount ?? "1") || 1;
    moved(
      v,
      ctx.collateralSymbol,
      soleFlowAddress(flows, ctx.collateralSymbol),
      collateralSeizedProv(ctx.collateralSymbol, coords),
      "to the lender",
    );
  } else if (ctx.eventType === "claimed" && !ctx.defaulted && ctx.creditSymbol) {
    // The settle claim: the note holder collects the repaid credit — the
    // amount IS the terms' repay total (the borrower paid exactly it), so the
    // same receipt traces it, matching the paid_back grammar.
    const r = rowRepay(ctx, coords);
    const v = Number(r?.amount ?? "0") || 0;
    if (v !== 0 && r) moved(v, ctx.creditSymbol, creditAddress, r.prov, "to the note holder");
  }

  // An extension moves no value: the row states the deadline it moved and who
  // moved it (on v1.1 only the LOAN note's holder can, and nothing is paid).
  const from = ctx.eventType === "extended" ? dateOfTs(ctx.originalDefaultTimestamp) : null;
  const to = ctx.eventType === "extended" ? dateOfTs(ctx.extendedDefaultTimestamp) : null;
  const note =
    direction != null ? (
      direction
    ) : ctx.eventType === "extended" && to ? (
      <Prov info={extendedDeadlineProv(coords)} value={String(ctx.extendedDefaultTimestamp)}>
        <span>{from ? `deadline moved from ${from} to ${to}` : `deadline moved to ${to}`}</span>
      </Prov>
    ) : undefined;
  const party =
    ctx.eventType === "extended" && ctx.extendedBy
      ? {
          prefix: ctx.extendedBy === ctx.lender ? "by the lender" : "by the note holder",
          address: ctx.extendedBy,
          prov: extendedDeadlineProv(coords),
          ens: true,
        }
      : undefined;

  return { label: actionLabel, critical: isSeizure, deltas, unsignedDeltas: true, note, party };
}
