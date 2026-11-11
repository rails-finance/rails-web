// One wallet's share of a Balancer V3 pool worked out from rails-server's reads
// at the head and 30 days back (rails-ops ui-jobs 569; the reads are
// lib/balancer/types.ts). Every pool share (BPT) is a claim on the pool's
// tokens in proportion to the shares outstanding, so the wallet's part of each
// token is the pool's balance × its shares ÷ all shares. The pool's value per
// share (getBptRate) grows with swap fees and its tokens' yield, and is in
// the pool's rate-scaled units, so the page states its change as a percentage.
//
// Pure: scripts/test/balancer.test.mjs reads it.

import type { BalPoolAt, BalPositionRead, BalPositionsRead, BalStaked, BalToken, BlockRef } from "./types";

const ZERO = BigInt(0);
const SCALE = BigInt(10) ** BigInt(18);

/** A raw integer in units of 10^decimals, as a number. */
export function units(raw: string | bigint, decimals: number): number {
  const v = BigInt(raw);
  const d = BigInt(10) ** BigInt(decimals);
  return Number(v / d) + Number(v % d) / Number(d);
}

/** `part ÷ whole` as a fraction, exact to 18 places before it becomes a number; 0 over 0 is 0. */
export function fraction(part: string | bigint, whole: string | bigint): number {
  const w = BigInt(whole);
  if (w === ZERO) return 0;
  return units((BigInt(part) * SCALE) / w, 18);
}

/** The wallet's part of each pool balance: balance × shares ÷ supply, per token, in token units. */
export function sharesOf(
  tokens: readonly BalToken[],
  balancesRaw: readonly string[],
  shares: string,
  supply: string,
): number[] {
  const s = BigInt(supply);
  return tokens.map((t, i) => (s === ZERO ? 0 : units((BigInt(balancesRaw[i]) * BigInt(shares)) / s, t.decimals)));
}

export interface BalSide {
  at: BlockRef;
  /** The wallet's pool shares. */
  shares: number;
  supply: number;
  /** The wallet's fraction of all shares (0.01 is 1%). */
  share: number;
  /** The wallet's part of each token, in token order. */
  holds: number[];
  /** The pool's balance of each token. */
  pool: number[];
  /** Value per share, in the pool's rate-scaled units. */
  rate: number | null;
}

export interface BalPosition {
  chainId: number;
  pool: string;
  wallet: string;
  name: string;
  symbol: string;
  tokens: BalPositionRead["tokens"];
  now: BalSide;
  /** null where the pool did not exist 30 days back. */
  then: BalSide | null;
  /** The change in value per share over the window (0.01 is 1%), or null. */
  rateChange: number | null;
  /** The swap fee in percent (0.04 is 0.04%), or null. */
  feePct: number | null;
  paused: boolean;
  recoveryMode: boolean;
  /** The wallet's first add to this pool, or null where none was found. */
  firstAdd: BlockRef | null;
  adds: number;
  removes: number;
}

function side(tokens: readonly BalToken[], at: BlockRef, p: BalPoolAt, shares: string): BalSide {
  return {
    at,
    shares: units(shares, 18),
    supply: units(p.totalSupply, 18),
    share: fraction(shares, p.totalSupply),
    holds: sharesOf(tokens, p.balancesRaw, shares, p.totalSupply),
    pool: tokens.map((t, i) => units(p.balancesRaw[i], t.decimals)),
    rate: p.bptRate == null ? null : units(p.bptRate, 18),
  };
}

export function balPosition(r: BalPositionRead): BalPosition {
  const now = side(r.tokens, r.head, r.now, r.balance);
  const then = r.past ? side(r.tokens, r.then, r.past, r.past.balance) : null;
  const first = r.flows.find((f) => f.kind === "add");
  return {
    chainId: r.chainId,
    pool: r.pool,
    wallet: r.wallet,
    name: r.name ?? r.symbol ?? r.pool,
    symbol: r.symbol ?? r.tokens.map((t) => t.symbol).join("-"),
    tokens: r.tokens,
    now,
    then,
    rateChange: now.rate != null && then?.rate ? now.rate / then.rate - 1 : null,
    feePct: r.swapFee == null ? null : units(r.swapFee, 16),
    paused: r.paused === true,
    recoveryMode: r.recoveryMode === true,
    firstAdd: first ? { block: first.block, time: first.time } : null,
    adds: r.flows.filter((f) => f.kind === "add").length,
    removes: r.flows.filter((f) => f.kind === "remove").length,
  };
}

/** The wallet's shares staked in the pool's gauges, summed, and as a part of
 *  all the pool's shares; null where none are staked or none were read. */
export function stakedOf(staked: readonly BalStaked[] | undefined, supply: string) {
  if (!staked?.length) return null;
  const raw = staked.reduce((n, s) => n + BigInt(s.balance), ZERO);
  return {
    raw: raw.toString(),
    shares: units(raw, 18),
    share: fraction(raw, supply),
    gauges: staked.map((s) => s.gauge),
  };
}

/** A wallet page's row: the pool, the wallet's fraction of it and its part of each token. */
export function walletRow(p: BalPositionsRead["positions"][number]) {
  return {
    pool: p.pool,
    symbol: p.symbol ?? p.tokens.map((t) => t.symbol).join("-"),
    share: fraction(p.balance, p.totalSupply),
    holds: sharesOf(p.tokens, p.balancesRaw, p.balance, p.totalSupply),
    tokens: p.tokens,
    staked: stakedOf(p.staked, p.totalSupply),
  };
}
