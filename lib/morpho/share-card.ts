// Morpho Blue (Ethereum) position → share-card model. The bridge between
// `loadMorphoPositionTail`'s `position` row (the same server tail the
// position page itself awaits) and the shared card renderer — no second
// read, no fetched prices of our own.
//
// The indexed replay grammar (`MorphoPositionCard`'s non-`listed` branch)
// states no USD and no health factor at all — three token-unit columns
// instead: Collateral, Debt (principal), and Current debt (principal +
// accrued interest, gated on the live index having answered). This card
// collapses the last two into one Debt figure — the current, interest-
// inclusive amount when the index answered, the principal otherwise — the
// same current-over-principal preference the Aave V3 and Compound V3
// mappers make for their own current-vs-principal splits, so the card states
// one number that means "what this position owes right now."

import type { MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<MorphoPositionSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
  // No state recorded for the account yet (0018); never read as closed.
  unread: "Unread",
};

const DUST = 1e-6;

export function morphoShareCardModel(
  position: MorphoPositionSummary | null,
  positionId: string,
): PositionCardModel | null {
  // No row for this position id — `positionImage` degrades to the static
  // roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    if (position.collateral.amount > DUST) {
      const collSym = position.collateral.symbol ?? position.collateralSymbol ?? "";
      stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(position.collateral.amount)} ${collSym}` });
    }
    const debtAmount = position.currentDebt?.amount ?? position.borrowed.amount;
    if (debtAmount > DUST) {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(debtAmount)} ${position.loanSymbol}` });
    }
  } else {
    // Closed/liquidated: collateral and borrowed have unwound to 0 — the
    // highest-recorded amounts are what `peak` carries. Token amounts only,
    // no USD, matching the detail card's own closed layout.
    if (position.peak.collateral > DUST) {
      const collSym = position.collateral.symbol ?? position.collateralSymbol ?? "";
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(position.peak.collateral)} ${collSym}` });
    }
    if (position.peak.borrowed > DUST) {
      stats.push({
        label: CARD_VOCAB.peakDebt,
        value: `${formatCompact(position.peak.borrowed)} ${position.loanSymbol}`,
      });
    }
  }

  const { user } = splitMorphoPositionId(positionId);

  return {
    session: "morpho",
    // Mirrors the page's own `generateMetadata`: the title names the user
    // half of the id, not the market — Morpho's Ethereum position route has
    // no static marketId → symbol map on the metadata path.
    subject: shortSubject(user),
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
