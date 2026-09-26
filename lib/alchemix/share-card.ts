// Alchemist position → share-card model. The bridge between the server read
// the page already makes and the shared card renderer: no second read and no
// second source for what the position states.
//
// WHAT THE CARD DOES NOT DO. It puts no earmarked figure on the card. That
// figure accrues on every block and is true only at the block it was read at,
// and a share card is cached by whoever scrapes it — so a figure that was right
// at render would be quoted for as long as the scraper holds the image. The
// card states debt and collateral, which are also point figures but are quoted
// with the card's own stamp; the earmarked figure belongs beside its block, on
// the page.

import type { PositionCardModel } from "@/lib/share/position-card";
import { formatNumber } from "@/lib/utils/format";
import type { AlchemistPositionTail } from "@/lib/alchemix/position-page-data";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";

const STATUS_WORD: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  refused: "Not served",
  unknown: "No current reading",
};

export function alchemixShareCardModel(
  tail: AlchemistPositionTail,
  deployment: AlchemixDeployment,
  tokenId: string,
): PositionCardModel | null {
  const p = tail.position;
  // No position under this line and id — `positionImage` degrades to the
  // explorer's own static card rather than rendering an empty one.
  if (!p) return null;

  const stats: PositionCardModel["stats"] = [];
  const debt = p.figures.debt;
  const collateral = p.figures.collateral;

  if (debt && debt.asOfBlock != null) {
    stats.push({ label: CARD_VOCAB.debt, value: `${formatNumber(debt.formatted)} ${p.syntheticSymbol}` });
  }
  // The asset underneath leads here too, so the card and the page state the
  // collateral in the same order. The share price lives only on a reading of
  // the position, so a position with no reading has no underlying — and then
  // the card states the share count, never a zero.
  if (collateral && collateral.asOfBlock != null) {
    const underlying = collateral.underlying;
    stats.push({
      label: CARD_VOCAB.collateral,
      value: underlying
        ? `${formatNumber(underlying.formatted)} ${underlying.symbol ?? "underlying"}`
        : `${formatNumber(collateral.formatted)} ${collateral.mytSymbol ?? "shares"}`,
    });
  }
  // The block both figures are true at. An Alchemix figure without its block is
  // not a figure, so the card carries it as a stat of its own rather than
  // leaving the reader to assume the stamp covers it.
  const at = debt?.asOfBlock ?? collateral?.asOfBlock ?? null;
  if (at != null) stats.push({ label: "At block", value: at.toLocaleString("en-US") });

  return {
    session: deployment.session,
    subject: tokenId,
    market: p.lineDisplayName,
    status: STATUS_WORD[p.status] ?? p.status,
    stats,
    asOf: new Date(),
  };
}
