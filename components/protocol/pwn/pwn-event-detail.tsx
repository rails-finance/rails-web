"use client";

// PWN event detail (chain-state tier) — adapter onto the shared ChainTruthDetail
// grid. A PWN loan's economics are FIXED at creation and don't accrue, so unlike
// Spark/Comet there is no before→after replay: every event shows the loan's fixed
// terms — collateral locked, credit principal, repay total — each traced via
// <Prov>. A defaulted claim additionally flags the seizure. Current-debt-with-
// interest, USD, HF are absent by construction (a fixed loan has none).

import type { PwnContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  collateralLockedProv,
  collateralSeizedProv,
  creditAdvancedProv,
  repayAmountProv,
  type PwnCoords,
} from "@/lib/pwn/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { shortTokenId } from "@/lib/pwn/asset-catalog";

export interface PwnEventDetailProps {
  ctx: PwnContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

export function PwnEventDetail({ ctx, txHash, blockNumber }: PwnEventDetailProps) {
  const coords: PwnCoords = { txHash, blockNumber, loanId: ctx.loanId, version: ctx.version };
  const isNft = ctx.collateralCategory === "ERC721" || ctx.collateralCategory === "ERC1155";
  const seized = ctx.eventType === "claimed" && ctx.defaulted === true;
  const stats: ChainTruthStat[] = [];

  if (ctx.collateralSymbol) {
    const collValue =
      isNft && ctx.collateralId != null ? `#${shortTokenId(ctx.collateralId)}` : fmt(ctx.collateralAmount);
    stats.push({
      label: seized ? "Collateral · seized" : "Collateral · locked",
      value: collValue,
      symbol: ctx.collateralSymbol,
      prov: seized
        ? collateralSeizedProv(ctx.collateralSymbol, coords)
        : collateralLockedProv(ctx.collateralSymbol, coords),
    });
  }

  if (ctx.creditSymbol) {
    stats.push({
      label: "Credit · principal",
      value: fmt(ctx.creditAmount),
      symbol: ctx.creditSymbol,
      prov: creditAdvancedProv(ctx.creditSymbol, coords),
    });
    stats.push({
      label: "Repay · total",
      value: fmt(ctx.loanRepayAmount),
      symbol: ctx.creditSymbol,
      prov: repayAmountProv(ctx.creditSymbol, coords),
      // Dim on a defaulted claim — the borrower never paid; the lender took the
      // collateral instead of this repayment.
      dimmed: seized,
    });
  }

  return <ChainTruthDetail stats={stats} />;
}
