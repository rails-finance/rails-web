// Polaris → share-card models. The bridge between the server reads a page
// already makes and the shared card renderer — no second read.
//
//   • `polarisShareCardModel` — ONE CDP, from `loadPolarisPositionTail`'s
//     indexed summary (the same tail the position page itself awaits).
//   • `polarisHolderCardModel` — a WALLET, from the holder strip's own adapter
//     (the same one the wallet view mounts above its cards).

import type { PolarisPositionSummary, PolarisPositionStatus } from "@/lib/sources/api/polaris-positions";
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import type { PositionCardModel } from "@/lib/share/position-card";
import { holderCardModel } from "@/lib/share/holder-card";
import { polarisHolderStrip } from "@/lib/polaris/holder-strip";
import { positionNounPlural } from "@/lib/shared/protocols";

const STATUS_WORD: Record<PolarisPositionStatus, string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
};

/** `markets` is the market board at one head block — the same read the listing
 *  makes. Given it, an open CDP with debt carries the listing's own
 *  approximate ratio (row figures × the market's feed ÷ row debt), marked ≈
 *  for the same reason it is marked on the card. A stale or absent board
 *  simply leaves the stat out; the image still renders. */
export function polarisShareCardModel(
  position: PolarisPositionSummary | null,
  markets?: PolarisMarketsChainResponse | null,
): PositionCardModel | null {
  if (!position) return null;
  const stats: PositionCardModel["stats"] = [];
  if (position.status === "open") {
    if (position.coll > 0) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(position.coll)} pETH` });
    if (position.debt > 0)
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(position.debt)} ${position.stableSymbol}` });
    const board =
      markets && !markets.chainStale ? markets.markets.find((m) => m.market === position.market) : undefined;
    if (board && position.coll > 0 && position.debt > 0) {
      const icrPct = ((position.coll * board.price.pethInDebt) / position.debt) * 100;
      stats.push({ label: ratioLabel("cdp"), value: `≈ ${icrPct.toFixed(1)}%` });
    }
  } else {
    if (position.peakColl > 0)
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(position.peakColl)} pETH` });
    if (position.peakDebt > 0)
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(position.peakDebt)} ${position.stableSymbol}` });
  }
  return {
    session: "polaris",
    subject: `#${position.cdpId}`,
    market: position.stableSymbol,
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}

/** The WALLET's card — what `/sepolia/polaris?q=<holder>` unfurls as.
 *
 *  Built from the SAME adapter the wallet view mounts above its cards
 *  (`polarisHolderStrip`), so the card and the page can never state different
 *  totals: the legs' own value strings are carried across, nothing is re-summed
 *  here, and a wallet holding more than one page states its count and no
 *  totals, exactly as the strip does.
 *
 *  `null` — which the share route turns into the static roster card — for a
 *  wallet with no rows (nothing to summarise) and for an absent or stale market
 *  board. The board is not an enhancement on this card: the two markets borrow
 *  in different tokens, and a board that can price one of them and not the
 *  other would leave the adapter summing the priceable market alone and
 *  labelling it the wallet's whole debt. A card that does not render says less
 *  than one that understates. */
export function polarisHolderCardModel(
  rows: PolarisPositionSummary[],
  total: number,
  markets: PolarisMarketsChainResponse | null,
  perPage: number,
  subject: string,
): PositionCardModel | null {
  if (rows.length === 0 || !markets || markets.chainStale) return null;
  return holderCardModel(polarisHolderStrip(rows, total, markets, perPage), {
    session: "polaris",
    subject,
    total,
    plural: positionNounPlural("polaris"),
  });
}
