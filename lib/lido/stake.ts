// A wallet's Lido stake worked out from rails-server's reads at the head and 30
// days back (rails-ops ui-jobs 570; the reads are lib/lido/types.ts). stETH
// accounts in shares and one wstETH is one share, so the stake is the sum of
// both in shares, valued in ETH at the share rate (ETH per share), which moves
// at each oracle report. What the shares earned over 30 days is stated only
// where the shares are equal at both reads: those shares valued at today's rate
// less then's (decision 0048: stated legs only). A stake opened or changed
// inside the window states its change in shares, and no earnings; the part of
// the change its withdrawal requests made since the past read account for is
// named from those requests (`shareCause`), the rest is shares that moved in or
// out of the wallet. No dollar figure (decision 0047).
//
// Pure: scripts/test/lido.test.mjs reads it.

import type { LidoProtocolRead, LidoRequest, LidoStakeRead, LidoWindowState } from "./types";

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

/** What accounts for a change in shares, from stated legs only: the wallet's
 *  withdrawal requests made after the past read, and the rest of the change. */
export interface ShareCause {
  /** The requests made after the past read, the oldest first. */
  requests: LidoRequestRow[];
  /** Their shares, and the stETH they locked (each request's amountOfStETH). */
  requested: number;
  requestedSteth: number;
  /** "all": the requests account for the drop, to rounding; "part": for part
   *  of the change; "none": no request was made after the past read. */
  fit: "all" | "part" | "none";
  /** Shares that moved in (above zero) or out (below zero) of the wallet
   *  beside the requests; zero where they account for the whole change. */
  rest: number;
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
  /** The server's window state: earnings are stated only where the shares match at both reads. */
  windowState: LidoWindowState;
  /** The shares held then, valued at today's rate less then's, in ETH; null unless the window is "ok". */
  earned: number | null;
  requests: LidoRequestRow[];
  /** stETH in requests not yet finalized, and ETH ready to claim. */
  waitingSteth: number;
  claimableEth: number;
  requestCount: number;
  truncated: boolean;
  /** Why the shares changed, where they did; null where they match at both reads. */
  cause: ShareCause | null;
}

/** Rounding between a request's recorded shares and the drop it made: the
 *  queue's share conversion rounds down, by a wei or two per request. */
const ROUNDING_WEI = BigInt(1000);

/** The change in shares from `thenRaw` to `nowRaw`, matched against the
 *  requests made after `thenTime` (unix seconds). Pure. */
export function shareCause(thenRaw: bigint, nowRaw: bigint, thenTime: number, rows: LidoRequest[]): ShareCause | null {
  if (thenRaw === nowRaw) return null;
  const made = rows.filter((q) => q.timestamp > thenTime).sort((a, b) => a.timestamp - b.timestamp);
  const requestedRaw = made.reduce((a, q) => a + BigInt(q.amountOfShares), ZERO);
  const stethRaw = made.reduce((a, q) => a + BigInt(q.amountOfStETH), ZERO);
  // Shares that moved beside the requests: the change plus what went into them.
  const restRaw = nowRaw - thenRaw + requestedRaw;
  const within = (restRaw < ZERO ? -restRaw : restRaw) <= ROUNDING_WEI * BigInt(Math.max(made.length, 1));
  const fit = made.length === 0 ? "none" : within ? "all" : "part";
  return {
    requests: made.map(requestRow),
    requested: units(requestedRaw),
    requestedSteth: units(stethRaw),
    fit,
    rest: fit === "all" ? 0 : units(restRaw),
  };
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
    windowState: r.windowState,
    earned: r.windowState === "ok" ? gainOn(thenShares, r.past.rate, r.now.rate) : null,
    requests,
    waitingSteth: requests.filter((q) => q.state === "waiting").reduce((a, q) => a + q.steth, 0),
    claimableEth: requests.reduce((a, q) => a + (q.claimable ?? 0), 0),
    requestCount: r.requests.count,
    truncated: r.requests.truncated,
    cause: shareCause(thenShares, nowShares, r.then.time, r.requests.rows),
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
