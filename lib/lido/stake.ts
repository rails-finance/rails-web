// A wallet's Lido stake worked out from rails-server's reads at the head and 30
// days back (rails-ops ui-jobs 570; the reads are lib/lido/types.ts). stETH
// accounts in shares and one wstETH is one share, so the stake is the sum of
// both in shares, valued in ETH at the share rate (ETH per share), which moves
// at each oracle report. What the shares held 30 days back earned is those
// shares valued at today's rate less then's (decision 0048: stated legs only);
// shares that moved in or out since are a change in shares, with no reason
// given. No dollar figure (decision 0047).
//
// Pure: scripts/test/lido.test.mjs reads it.

import type { LidoProtocolRead, LidoRequest, LidoStakeRead } from "./types";

const ZERO = BigInt(0);
const ONE = BigInt(10) ** BigInt(18);

/** A raw 18-decimal integer as a number. */
export function units(raw: string | bigint): number {
  const v = BigInt(raw);
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const n = Number(a / ONE) + Number(a % ONE) / 1e18;
  return neg ? -n : n;
}

export interface LidoSide {
  /** stETH shares, wstETH and both, in shares. */
  stethShares: number;
  wsteth: number;
  shares: number;
  /** ETH per share. */
  rate: number;
}

export type RequestState = "waiting" | "claimable" | "claimed";
export interface LidoRequestRow {
  id: string;
  steth: number;
  shares: number;
  time: number;
  state: RequestState;
  /** ETH the request pays on claim, for a claimable one. */
  claimable: number | null;
}

export interface LidoStake {
  wallet: string;
  now: LidoSide & {
    /** The stETH leg in ETH (its balance), the wstETH leg in ETH, and the stake in ETH. */
    stethEth: number;
    wstethEth: number;
    eth: number;
  };
  then: LidoSide;
  /** Rate now over rate then, less one (0.01 is 1%). */
  rateGrowth: number;
  /** Shares now less shares then. */
  shareChange: number;
  /** The shares held then, valued at today's rate less then's, in ETH. */
  earned: number;
  requests: LidoRequestRow[];
  /** stETH in requests not yet finalized, and ETH ready to claim. */
  waitingSteth: number;
  claimableEth: number;
  requestCount: number;
  truncated: boolean;
}

/** ETH that `sharesRaw` gained between two rates (rates per 1e18 shares), exact before it becomes a number. */
export function gainOn(sharesRaw: string | bigint, rateThen: string | bigint, rateNow: string | bigint): number {
  return units((BigInt(sharesRaw) * (BigInt(rateNow) - BigInt(rateThen))) / ONE);
}

export const growth = (rateThen: string, rateNow: string): number =>
  BigInt(rateThen) === ZERO ? 0 : units((BigInt(rateNow) * ONE) / BigInt(rateThen) - ONE);

export function requestRow(q: LidoRequest): LidoRequestRow {
  const state: RequestState = q.isClaimed ? "claimed" : q.isFinalized ? "claimable" : "waiting";
  return {
    id: q.id,
    steth: units(q.amountOfStETH),
    shares: units(q.amountOfShares),
    time: q.timestamp,
    state,
    claimable: state === "claimable" && q.claimableEth != null ? units(q.claimableEth) : null,
  };
}

/** The raw shares of a stake side: stETH shares plus wstETH. */
export const sharesRaw = (s: { stethShares: string; wstethBalance: string }): bigint =>
  BigInt(s.stethShares) + BigInt(s.wstethBalance);

export function lidoStake(r: LidoStakeRead): LidoStake {
  const nowShares = sharesRaw(r.now);
  const thenShares = sharesRaw(r.past);
  const requests = r.requests.rows.map(requestRow);
  return {
    wallet: r.wallet,
    now: {
      stethShares: units(r.now.stethShares),
      wsteth: units(r.now.wstethBalance),
      shares: units(nowShares),
      rate: units(r.now.rate),
      stethEth: units(r.now.stethBalance),
      wstethEth: units(r.now.wstethEth),
      eth: units(r.now.totalEth),
    },
    then: {
      stethShares: units(r.past.stethShares),
      wsteth: units(r.past.wstethBalance),
      shares: units(thenShares),
      rate: units(r.past.rate),
    },
    rateGrowth: growth(r.past.rate, r.now.rate),
    shareChange: units(nowShares - thenShares),
    earned: gainOn(thenShares, r.past.rate, r.now.rate),
    requests,
    waitingSteth: requests.filter((q) => q.state === "waiting").reduce((a, q) => a + q.steth, 0),
    claimableEth: requests.reduce((a, q) => a + (q.claimable ?? 0), 0),
    requestCount: r.requests.count,
    truncated: r.requests.truncated,
  };
}

export interface LidoTotals {
  pooledEth: number;
  shares: number;
  rate: number;
  rateGrowth: number;
  /** stETH in requests the queue has not finalized. */
  unfinalized: number;
  /** Requests made and not yet finalized. */
  waitingRequests: number;
}

export function lidoTotals(r: LidoProtocolRead): LidoTotals {
  return {
    pooledEth: units(r.now.totalPooledEther),
    shares: units(r.now.totalShares),
    rate: units(r.now.rate),
    rateGrowth: growth(r.past.rate, r.now.rate),
    unfinalized: units(r.now.unfinalizedStETH),
    waitingRequests: Number(BigInt(r.now.lastRequestId) - BigInt(r.now.lastFinalizedRequestId)),
  };
}
