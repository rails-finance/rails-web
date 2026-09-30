"use client";

// PWN event detail (chain-state tier) — adapter onto the shared ChainTruthDetail
// grid. A PWN loan's economics are FIXED at creation and don't accrue, so unlike
// Spark/Comet there is no before→after replay: every event shows the loan's fixed
// terms — the collateral and where it stands after this event, the credit
// principal, the repay total — each traced via <Prov>. The creation adds the
// fixed interest and its rate; an extension shows the deadline it moved.
// Current-debt-with-interest, USD, HF are absent by construction.

import type { PwnContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  collateralLockedProv,
  collateralReturnedProv,
  collateralSeizedProv,
  creditAdvancedProv,
  extendedDeadlineProv,
  positionInterestProv,
  repayAmountProv,
  type PwnCoords,
} from "@/lib/pwn/event-provenance";
import { fixedInterestRate, interestRateText } from "@/lib/pwn/economics";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { shortTokenId } from "@/lib/pwn/asset-catalog";
import type { PwnEvent } from "@/lib/pwn/explainer-clauses";

export interface PwnEventDetailProps {
  ctx: PwnContext;
  txHash?: string;
  blockNumber?: number;
  /** The event's time (unix seconds) — the creation's, to state the term. */
  timestamp?: number;
  /** Same-transaction events: a burn reads where the collateral went from the
   *  claim or repayment beside it. */
  siblings?: PwnEvent[];
}

/** Matches the explainer's echo keys (lib/pwn/explainer-clauses.tsx `fmt`). */
const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** "2024-06-15 10:21 UTC" — the deadline's exact moment, for its tip and receipt. */
const utcMinute = (v: string): string =>
  `${new Date(Number(v) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

type CollateralState = "locked" | "returned" | "claimed" | "closed";

/** Where the collateral stands AFTER this event. One word per state, whatever
 *  the row: locked in escrow until the loan settles, then returned to the
 *  borrower (repaid) or claimed by the lender (defaulted). */
function collateralState(ctx: PwnContext, siblings: PwnEvent[]): CollateralState {
  switch (ctx.eventType) {
    case "paid_back":
      return "returned";
    case "claimed":
      return ctx.defaulted ? "claimed" : "returned";
    case "burned": {
      const close = siblings.find(
        (e) => e.context.data.eventType === "claimed" || e.context.data.eventType === "paid_back",
      );
      if (!close) return "closed";
      const d = close.context.data;
      return d.eventType === "claimed" && d.defaulted ? "claimed" : "returned";
    }
    default:
      return "locked";
  }
}

const STATE_LABEL: Record<CollateralState, string> = {
  locked: "Collateral · locked in escrow",
  returned: "Collateral · returned to borrower",
  claimed: "Collateral · claimed by lender",
  closed: "Collateral · none (loan closed)",
};

export function PwnEventDetail({ ctx, txHash, blockNumber, timestamp, siblings = [] }: PwnEventDetailProps) {
  const coords: PwnCoords = { txHash, blockNumber, loanId: ctx.loanId, version: ctx.version };
  const isNft = ctx.collateralCategory === "ERC721" || ctx.collateralCategory === "ERC1155";
  const seized = ctx.eventType === "claimed" && ctx.defaulted === true;
  const state = collateralState(ctx, siblings);
  const stats: ChainTruthStat[] = [];

  if (ctx.collateralSymbol) {
    const nftValue = isNft && ctx.collateralId != null ? `#${shortTokenId(ctx.collateralId)}` : null;
    const collValue = nftValue ?? fmt(ctx.collateralAmount);
    stats.push({
      label: STATE_LABEL[state],
      value: collValue,
      display: nftValue ?? `${collValue} ${ctx.collateralSymbol}`,
      symbol: ctx.collateralSymbol,
      prov:
        state === "claimed"
          ? collateralSeizedProv(ctx.collateralSymbol, coords)
          : state === "returned"
            ? collateralReturnedProv(ctx.collateralSymbol, coords)
            : collateralLockedProv(ctx.collateralSymbol, coords),
      // The rows that moved it draw it in the foreground.
      changed: ctx.eventType === "created" || ctx.eventType === "paid_back" || seized,
    });
  }

  if (ctx.creditSymbol) {
    stats.push({
      label: "Credit · principal",
      value: fmt(ctx.creditAmount),
      display: `${fmt(ctx.creditAmount)} ${ctx.creditSymbol}`,
      symbol: ctx.creditSymbol,
      prov: creditAdvancedProv(ctx.creditSymbol, coords),
    });
    stats.push({
      label: "Repay · total",
      value: fmt(ctx.loanRepayAmount),
      display: ctx.loanRepayAmount != null ? `${fmt(ctx.loanRepayAmount)} ${ctx.creditSymbol}` : undefined,
      symbol: ctx.creditSymbol,
      prov: repayAmountProv(ctx.creditSymbol, coords),
      // Muted on a defaulted claim — the borrower never paid; the lender took
      // the collateral instead of this repayment.
      changed: !seized,
    });
  }

  // The creation states the loan's cost: the fixed interest and its rate over
  // the term struck (creation to the deadline in the terms).
  if (ctx.eventType === "created" && ctx.creditSymbol && ctx.loanRepayAmount != null && ctx.creditAmount != null) {
    const interest = Number(ctx.loanRepayAmount) - Number(ctx.creditAmount);
    const term =
      ctx.dueValue == null
        ? null
        : ctx.dueKind === "duration"
          ? Number(ctx.dueValue)
          : timestamp != null
            ? Number(ctx.dueValue) - timestamp
            : null;
    const rate = fixedInterestRate(interest, Number(ctx.creditAmount), term);
    if (interest > 0)
      stats.push({
        label: "Interest · fixed",
        value: formatNumber(interest),
        display: `${formatNumber(interest)} ${ctx.creditSymbol}`,
        symbol: ctx.creditSymbol,
        prov: positionInterestProv(ctx.creditSymbol, ctx.version),
        sub: rate ? interestRateText(rate) : undefined,
      });
  }

  // An extension: the deadline before and after.
  if (ctx.eventType === "extended" && ctx.extendedDefaultTimestamp != null) {
    if (ctx.originalDefaultTimestamp != null)
      stats.push({
        label: "Deadline · before",
        value: utcMinute(ctx.originalDefaultTimestamp),
        display: formatDate(Number(ctx.originalDefaultTimestamp)),
        symbol: "",
        prov: extendedDeadlineProv(coords),
        changed: false,
      });
    stats.push({
      label: "Deadline · after",
      value: utcMinute(ctx.extendedDefaultTimestamp),
      display: formatDate(Number(ctx.extendedDefaultTimestamp)),
      symbol: "",
      prov: extendedDeadlineProv(coords),
    });
  }

  return <ChainTruthDetail stats={stats} />;
}
