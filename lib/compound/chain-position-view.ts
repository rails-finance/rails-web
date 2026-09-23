// A live Comet read plus its swept replay, in the shape the shared Compound V3
// card and economics speak.
// ----------------------------------------------------------------------------
// `CompoundPositionCard` and `computeCompoundEconomics` take a
// `CompoundPositionView` — which on Ethereum is built from a LISTING row
// (viewFromSummary), because that is where an indexed explorer's per-position
// figures come from. The Base explorer has no listing and no index. What it
// has is two reads the page already makes:
//
//   • the live Comet read (`CompoundMarketChainResponse`) — the account's
//     present-value base with interest, its exact collateral balances, the
//     market's own oracle prices; and
//   • the sweep's per-market replay (`CometMarketReplay`) — the signed base
//     PRINCIPAL, the peaks, the counts, the last activity.
//
// Which read feeds which field is the whole content of this adapter, and it is
// chosen so the tower's gates test something real:
//
//   • `current`  ← the Comet (balanceOf / borrowBalanceOf, interest included).
//   • `base`     ← the replay (principal). The gap between the two IS the
//                  accrued interest the tower draws as its own segment.
//   • `collateral` ← the Comet (collateralBalanceOf, exact). The tower checks
//                  the replayed lifetime collateral flows against THESE, so a
//                  sweep that missed a collateral event fails the conservation
//                  gate rather than passing against its own arithmetic.
//   • `status`   ← the Comet decides OPEN (it holds anything); the replay
//                  decides between CLOSED and LIQUIDATED for an empty account,
//                  because the Comet's own read cannot tell an unwound position
//                  from a seized one.
//
// A market the sweep saw but the Comet read did not (a closed position) and a
// market the Comet holds but the sweep did not read (a holed sweep, or an
// account funded by a transfer the sweep missed) are both valid inputs: each
// side may be null, and the view says what it can.
//
// WHICH FIGURES A PARTIAL HISTORY MAY STILL STATE. `whole` says the capture
// read every block of the market's life. The figures that are claims ABOUT
// THE WHOLE LIFE — the signed base PRINCIPAL, the peaks, the transaction
// count, the last-activity stamp, and the collateral standing in for a Comet
// read that failed — are taken from the replay only when it is whole, and
// stay at their empty values otherwise. A horizoned history (the API's heavy
// answer, or a capped sweep) would otherwise put a two-thousand-row window's
// arithmetic where a lifetime is read: a partial principal makes the tower's
// accrued-interest segment nonsense, and a window's highest balance is not a
// "highest recorded". The live Comet read is unaffected — it is a read at the
// head, not a replay — so `current` and the held collateral stand either way,
// and with no principal beside it the card shows the one number it has and
// labels it current.

import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CometMarketReplay } from "@/lib/sources/chain/compound-v3-events";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import { scaleCompoundChainBalance } from "@/lib/api/fetch-compound-position";

/** Below this many display units a balance is treated as dust = zero — the
 *  listing builder's own threshold. */
const DUST = 1e-9;

const sideOf = (amount: number): "lend" | "borrow" | "flat" =>
  amount > DUST ? "lend" : amount < -DUST ? "borrow" : "flat";

/**
 * Adapt one market's live read and/or replay into the shared view.
 *
 * `prices` is on-chain oracle USD keyed by lowercased token address — the
 * market's own `getPrice`, converted to dollars for the ETH-quoted market by
 * the protocol's own WETH/USD feed (lib/sources/chain/compound-prices). None
 * is valid: the tower's per-total guard then drops to the token-only list,
 * which is the correct rendering of "no price", not a degraded one.
 */
export function cometViewFromChain(
  market: CometMarket,
  wallet: string,
  chain: CompoundMarketChainResponse | null,
  replay: CometMarketReplay | null,
  prices?: Record<string, number>,
  whole: boolean = true,
): CompoundPositionView {
  const baseToken = market.baseToken.toLowerCase();
  const live = chain && !chain.chainStale ? chain : null;
  // The replay, but only where it is entitled to speak for the whole life.
  const lifeReplay = whole ? replay : null;

  // The Comet's own present value: balanceOf when lending, −borrowBalanceOf
  // when borrowing (at most one is nonzero — verified on-chain by the Ethereum
  // verifier, and true of the contract's storage model).
  let current: CompoundPositionView["current"] = null;
  if (live) {
    const supply = scaleCompoundChainBalance(live.supplyBalanceRaw, live.baseDecimals);
    const borrow = scaleCompoundChainBalance(live.borrowBalanceRaw, live.baseDecimals);
    const amount = borrow > 0 ? -borrow : supply;
    current = {
      amount,
      amountRaw: borrow > 0 ? `-${live.borrowBalanceRaw}` : live.supplyBalanceRaw,
      side: sideOf(amount),
      block: live.blockNumber,
    };
  }

  // The principal: the replay's signed sum when the sweep reached this market,
  // else the live figure stands in for it (and the card then shows one number
  // labelled as current, never a principal it does not have).
  const baseAmount = lifeReplay ? lifeReplay.base.amount : (current?.amount ?? 0);
  const baseRaw = lifeReplay ? lifeReplay.base.amountRaw : (current?.amountRaw ?? "0");

  const collateral: CompoundPositionView["collateral"] = live
    ? live.collateral.map((c) => ({
        symbol: c.symbol,
        address: c.address.toLowerCase(),
        decimals: c.decimals,
        amount: scaleCompoundChainBalance(c.balanceRaw, c.decimals),
        amountRaw: c.balanceRaw,
      }))
    : (lifeReplay?.collateral ?? []);

  const holds =
    live != null && (live.supplyBalanceRaw !== "0" || live.borrowBalanceRaw !== "0" || live.collateral.length > 0);
  const everLiquidated = replay?.everLiquidated ?? false;

  return {
    market: market.key,
    marketLabel: market.label,
    comet: market.comet,
    account: wallet,
    status: holds ? "open" : everLiquidated ? "liquidated" : "closed",
    base: {
      symbol: market.baseSymbol,
      address: baseToken,
      decimals: market.baseDecimals,
      amount: baseAmount,
      amountRaw: baseRaw,
    },
    side: sideOf(baseAmount),
    current,
    collateral,
    peak: {
      collateral: lifeReplay?.peak.collateral ?? [],
      lentBase: lifeReplay?.peak.lentBase ?? 0,
      borrowedBase: lifeReplay?.peak.borrowedBase ?? 0,
    },
    everLiquidated,
    // An absorb the capture DID see is a fact about this account whether or
    // not the rest of its life was read — the same stance the Aave family's
    // view takes, counting liquidations off the events it holds.
    liquidationCount: replay?.liquidationCount ?? 0,
    txCount: lifeReplay?.txCount ?? 0,
    lastActivityAt: lifeReplay?.lastActivityAt ?? null,
    atBlock: live?.blockNumber,
    priceByAddress: prices,
  };
}
