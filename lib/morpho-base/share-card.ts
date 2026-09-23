// Morpho Blue on Base position → share-card model. The bridge between
// `loadMorphoBaseTail`'s `head` read (the same live per-market slot sweep
// both the wallet hub and the per-market page await) and the shared card
// renderer — no second read.
//
// Values here are in the market's own units — collateral in the collateral
// token, debt in the loan token — the same as the live card's "listed" render
// (`MorphoPositionCard`'s `v.listed` branch, built by `morphoListedViewFromLive`):
// a Base slot read carries no USD, only the market's own oracle price of
// collateral IN the loan token, which is not a figure this card states as a
// headline (the live card only footnotes it). The wallet hub states no
// cross-market total for the same reason the live page renders one card per
// market rather than a combined one (see position-view.tsx's header comment):
// loan tokens differ per market, so nothing sums. It leads with the largest
// market instead and names it in `market`.

import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { marketLabel } from "@/lib/morpho/asset-catalog";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

/** Neutral HF headline — matches the Aave V3 / Moonwell Base mappers'
 *  identical reading (the ratio stops meaning anything as a number once it
 *  clears 100). The live listed card instead says "100+"; the share cards
 *  across this sweep all say "∞" at that ceiling, a deliberate one-glyph
 *  consistency across the pooled-lender family. */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hf.toFixed(2);
}

const DUST = 1e-6;

const holdsSomething = (p: MorphoChainPositionResponse): boolean =>
  p.collateral > DUST || BigInt(p.borrowSharesRaw) > BigInt(0);

/** A same-wallet ranking of which market to lead the hub card with — never
 *  displayed, only compared. Loan tokens differ per market, so this is a
 *  rough same-order-of-magnitude proxy (most Base Morpho markets borrow a
 *  stablecoin), not a true USD comparison — an accepted rough edge since the
 *  score itself never reaches the card. */
function marketSizeScore(p: MorphoChainPositionResponse): number {
  return p.currentDebt > 0 ? p.currentDebt : p.collateralValue;
}

function largestMarket(positions: MorphoChainPositionResponse[]): MorphoChainPositionResponse | null {
  const holding = positions.filter(holdsSomething);
  if (holding.length === 0) return null;
  return holding.reduce((best, p) => (marketSizeScore(p) > marketSizeScore(best) ? p : best));
}

/** The three headline stats for one market's live slot read — shared by the
 *  wallet hub (the largest market) and the per-market page (that market). */
function statsFor(p: MorphoChainPositionResponse): PositionCardModel["stats"] {
  const stats: PositionCardModel["stats"] = [];
  const hasColl = p.collateral > DUST;
  const hasDebt = BigInt(p.borrowSharesRaw) > BigInt(0);
  if (hasColl)
    stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(p.collateral)} ${p.collateralSymbol}` });
  if (hasDebt) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(p.currentDebt)} ${p.loanSymbol}` });
  if (p.healthFactor != null) stats.push({ label: ratioLabel("pooled"), value: hfLabel(p.healthFactor) });
  return stats;
}

/** The wallet hub (`/base/morpho/[wallet]`): the largest market the wallet
 *  currently holds anything in. */
export function morphoBaseWalletShareCardModel(
  head: MorphoWalletChainResponse | null,
  wallet: string,
): PositionCardModel | null {
  if (!head || head.positionsFound === 0) return null;
  const market = largestMarket(head.positions);
  if (!market) return null;
  return {
    session: "morpho-base",
    subject: shortSubject(wallet),
    market: marketLabel(market.loanSymbol, market.collateralSymbol, market.lltv === 0),
    // The slot read only says whether the wallet holds anything in this
    // market NOW — there is no replay behind it here to tell a closed
    // position from one never opened, the same reason Moonwell Base's card
    // hard-codes this word. A market we lead with always holds something
    // (see `largestMarket`), so this is never asserted over an empty read.
    status: "Open",
    stats: statsFor(market),
    asOf: new Date(),
  };
}

/** The per-market page (`/base/morpho/[wallet]/[market]`): that market's
 *  position only. */
export function morphoBaseMarketShareCardModel(
  head: MorphoWalletChainResponse | null,
  wallet: string,
  marketId: string,
): PositionCardModel | null {
  const market = head?.positions.find((p) => p.marketId.toLowerCase() === marketId.toLowerCase()) ?? null;
  // No slot for this market, or the wallet holds nothing in it —
  // `positionImage` degrades to the static roster card rather than
  // rendering an empty one.
  if (!market || !holdsSomething(market)) return null;
  return {
    session: "morpho-base",
    subject: shortSubject(wallet),
    // Mirrors the page's own `generateMetadata`, which has no static id →
    // symbol map for a permissionless market and names it by its id's first
    // bytes instead.
    market: `${market.marketId.slice(0, 10)}…`,
    status: "Open",
    stats: statsFor(market),
    asOf: new Date(),
  };
}
