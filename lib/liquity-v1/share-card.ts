// Liquity V1 Trove → share-card model. The bridge between
// `loadLiquityV1PositionTail` (the same server tail the position page itself
// awaits) and the shared card renderer — no second read, no second source of
// truth for what this Trove currently states.
//
// Mirrors `components/protocol/liquity-v1/liquity-v1-position-card.tsx`: the
// card carries no collateral-ratio column at all (V1's summary row has none —
// the ratio is a live chain read, not part of the tail), so this mapper states
// only Collateral + Debt, the same two the card does, in the SAME compact
// notation (`AssetAmount`'s visible headline, not its full-precision hover).

import type { loadLiquityV1PositionTail } from "./position-page-data";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

type LiquityV1Tail = Awaited<ReturnType<typeof loadLiquityV1PositionTail>>;

const STATUS_WORD: Record<string, string> = { open: "Open", closed: "Closed", liquidated: "Liquidated" };

export function liquityV1ShareCardModel(tail: LiquityV1Tail, wallet: string): PositionCardModel | null {
  const summaries = tail.summaries;
  // A wallet the protocol has never seen is a legitimate empty answer here
  // (see position-page-data.ts — this route has no 404 for it), and an SSR
  // read that failed reads the same way: either way there is no life to draw,
  // so `positionImage` degrades to the static roster card.
  if (!summaries || summaries.length === 0) return null;

  // The page's own rule (position-view.tsx) is "?epoch= if it resolves, else
  // the latest life" — but the image route carries no search params, so it
  // always states the latest life, the same thing an old link with no ?epoch
  // lands on.
  const trove = [...summaries].sort((a, b) => b.epoch - a.epoch)[0];

  const stats: PositionCardModel["stats"] = [];

  if (trove.status === "open") {
    if (trove.collateral > 0) {
      stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(trove.collateral)} ${COLLATERAL_SYMBOL}` });
    }
    if (trove.debt > 0) {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(trove.debt)} ${DEBT_SYMBOL}` });
    }
  } else {
    // Closed/liquidated: the Trove now reads 0 on chain — the headline is
    // what it held at its height, the same lifetime maxima the card falls
    // back to.
    if (trove.peakCollateral > 0) {
      stats.push({
        label: CARD_VOCAB.peakCollateral,
        value: `${formatCompact(trove.peakCollateral)} ${COLLATERAL_SYMBOL}`,
      });
    }
    if (trove.peakDebt > 0) {
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(trove.peakDebt)} ${DEBT_SYMBOL}` });
    }
  }

  return {
    session: "liquity-v1",
    subject: shortSubject(wallet),
    status: STATUS_WORD[trove.status] ?? trove.status,
    stats,
    asOf: new Date(),
  };
}
