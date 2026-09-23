// Compound V3 on Base position → share-card model. The bridge between
// `loadCompoundBaseTail`'s `head` read (the same live per-Comet sweep the
// wallet page itself awaits) and the shared card renderer — no second read.
//
// The Base wallet page states no combined total across markets (a Comet
// market is single-base, nothing is cross-collateralised between markets,
// and they do not all measure in the same unit — see position-view.tsx's own
// header comment), so this card cannot state a wallet aggregate either. It
// leads with the largest market the wallet holds something in instead, and
// names it in `market` — the same shape the Ethereum mapper's per-(market,
// wallet) card states, reusing its `largestCompoundAsset` fallback.

import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { scaleCompoundChainBalance, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import { largestCompoundAsset, type CompoundAssetLike } from "@/lib/compound/share-card";
import type { PositionCardModel } from "@/lib/share/position-card";

const holdsSomething = (m: CompoundMarketChainResponse): boolean =>
  m.supplyBalanceRaw !== "0" || m.borrowBalanceRaw !== "0" || m.collateral.length > 0;

/** A same-wallet ranking of which Comet to lead the card with — never
 *  displayed, only compared. `debtValue` is already basePrice-scaled by the
 *  reader; the supply side gets the same scaling here. This is an
 *  apples-to-apples comparison for the ordinary case (every Base Comet quotes
 *  in USD); the one ETH-quoted market (cWETHv3) ranks on a different footing,
 *  an accepted rough edge since the score itself never reaches the card. */
function marketSizeScore(m: CompoundMarketChainResponse): number {
  if (m.borrowBalanceRaw !== "0") return m.debtValue;
  return scaleCompoundChainBalance(m.supplyBalanceRaw, m.baseDecimals) * m.basePrice;
}

function largestMarket(positions: CompoundMarketChainResponse[]): CompoundMarketChainResponse | null {
  const holding = positions.filter(holdsSomething);
  if (holding.length === 0) return null;
  return holding.reduce((best, m) => (marketSizeScore(m) > marketSizeScore(best) ? m : best));
}

export function compoundBaseShareCardModel(
  head: CompoundWalletChainResponse | null,
  wallet: string,
): PositionCardModel | null {
  // No market this wallet holds anything in — `positionImage` degrades to
  // the static roster card rather than rendering an empty one.
  if (!head || head.positionsFound === 0) return null;
  const market = largestMarket(head.positions);
  if (!market) return null;

  const supply = scaleCompoundChainBalance(market.supplyBalanceRaw, market.baseDecimals);
  const borrow = scaleCompoundChainBalance(market.borrowBalanceRaw, market.baseDecimals);
  const side: "lend" | "borrow" | "flat" = borrow > 0 ? "borrow" : supply > 0 ? "lend" : "flat";
  // `basePrice`/collateral `price` are in the market's own quote unit — USD
  // for every Base Comet except cWETHv3, which quotes in ETH. Only a
  // USD-quoted market gets a dollar headline; the rest fall to token units,
  // the same "not priced" degrade the live card's `cardSideUsd` applies.
  const usdSafe = market.quoteUnit === "USD";

  const stats: PositionCardModel["stats"] = [];

  const collateralAssets: CompoundAssetLike[] = market.collateral.map((c) => ({
    symbol: c.symbol,
    amount: scaleCompoundChainBalance(c.balanceRaw, c.decimals),
  }));
  const supplyAssets: CompoundAssetLike[] = [
    ...(side === "lend" ? [{ symbol: market.baseSymbol, amount: supply }] : []),
    ...collateralAssets,
  ];

  let supplyUsd: number | null = null;
  if (usdSafe) {
    let sum = 0;
    let any = false;
    let allPriced = true;
    if (side === "lend") {
      if (market.basePrice > 0) {
        sum += supply * market.basePrice;
        any = true;
      } else allPriced = false;
    }
    for (const c of market.collateral) {
      const amt = scaleCompoundChainBalance(c.balanceRaw, c.decimals);
      if (amt <= 0) continue;
      if (c.price > 0) {
        sum += amt * c.price;
        any = true;
      } else allPriced = false;
    }
    supplyUsd = allPriced && any ? sum : null;
  }
  if (supplyUsd != null) {
    stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(supplyUsd) });
  } else {
    const top = largestCompoundAsset(supplyAssets);
    if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
  }

  // No debt column for a non-borrower — Comet's base is signed and
  // single-sided, so there is no separate zero-debt figure to state.
  if (side === "borrow") {
    const debtUsd = usdSafe && market.basePrice > 0 ? market.debtValue : null;
    if (debtUsd != null) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(debtUsd) });
    } else {
      stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(borrow)} ${market.baseSymbol}` });
    }
  }

  return {
    session: "compound-base",
    subject: shortSubject(wallet),
    market: market.baseSymbol,
    // The Comet read only says whether the wallet holds anything NOW — there
    // is no replay behind it to tell a closed position from one never opened,
    // the same reason Moonwell Base's card hard-codes this word.
    status: "Open",
    stats,
    asOf: new Date(),
  };
}
