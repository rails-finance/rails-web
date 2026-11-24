// Each owner row as the read its explorer's card takes (W9; rails-ops decisions/0071): the owner
// routes answer the head-only fields the listing card draws, so the card's read is the row with
// the answer's head, and no history (no past read, no daily grid, no logs). A Uniswap-family or
// Slipstream row whose head fields are missing (`now` null: past the server's first 25 rows, or a
// pool that answered no state) has no card, and so has a staked row whose stake read is missing:
// drawn, it would read as unstaked.
//
// Pure, with relative imports only: scripts/test/wallet-liquidity.test.mjs reads it.

import { siteOf } from "../../aerodrome/sites";
import { UNI_DEPLOYMENTS } from "../../uniswap/deployments";
import type { UniPositionRead, UniPositionsRead } from "../../uniswap/types";
import type { AeroPositionRead, AeroPositionsRead } from "../../aerodrome/types";
import type { BalPositionRead, BalPositionsRead } from "../../balancer/types";

/** A Uniswap V3 or V4, or PancakeSwap V3, row's card read; null without its head fields. */
/** PancakeSwap's farms, which hold a staked position's NFT. */
const MASTER_CHEFS = new Set(UNI_DEPLOYMENTS.flatMap((d) => (d.masterChef ? [d.masterChef.toLowerCase()] : [])));

export function uniCardRead(a: UniPositionsRead, row: UniPositionsRead["positions"][number]): UniPositionRead | null {
  if (!row.now) return null;
  // Staked in a PancakeSwap farm with no stake read: no card.
  if ((row.staked === true || MASTER_CHEFS.has(row.owner.toLowerCase())) && !row.stake) return null;
  return {
    ...row,
    chainId: a.chainId,
    head: a.head,
    then: a.head,
    provider: "",
    now: row.now,
    staked: row.stake,
    past: null,
    opened: null,
    daily: [],
    history: null,
  };
}

/** An Aerodrome or Velodrome row's card read; null without its head fields or the reward's price. */
export function slipstreamCardRead(
  a: AeroPositionsRead,
  row: AeroPositionsRead["positions"][number],
): AeroPositionRead | null {
  if (!row.now || row.pool == null || row.fee == null || !a.aero) return null;
  // Staked in a gauge with no gauge read: no card.
  const inGauge = row.staked || (row.gauge != null && row.owner.toLowerCase() === row.gauge.toLowerCase());
  if (inGauge && !row.stake) return null;
  return {
    ...row,
    chainId: a.chainId,
    head: a.head,
    then: a.head,
    provider: "",
    nfpm: siteOf(a.chainId).nfpm[row.deployment] ?? "",
    pool: row.pool,
    fee: row.fee,
    now: row.now,
    staked: row.stake,
    stakedThen: null,
    aero: a.aero,
    past: null,
    opened: null,
    daily: [],
  };
}

/** A Balancer V3 pool share's card read: the owner row's share and the pool's balances at the head.
 *  The row names no token type or rate provider; each token reads as a plain one (type 0). */
export function balancerCardRead(a: BalPositionsRead, row: BalPositionsRead["positions"][number]): BalPositionRead {
  return {
    chainId: a.chainId,
    vault: a.vault,
    pool: row.pool,
    wallet: a.wallet,
    head: a.head,
    then: a.head,
    provider: a.provider,
    name: row.name,
    symbol: row.symbol,
    tokens: row.tokens.map((t) => ({ ...t, tokenType: 0, rateProvider: null })),
    paused: null,
    recoveryMode: null,
    swapFee: null,
    balance: row.balance,
    now: { totalSupply: row.totalSupply, balancesRaw: row.balancesRaw, liveBalancesScaled18: null, bptRate: null },
    past: null,
    staked: row.staked,
    flows: [],
  };
}
