// "How the vault is doing" (rails-ops ui-jobs 553, door 1): five readings of
// the past, worked from reads Rails already holds. This module measures; the
// words are lib/vaults/health-words.ts, so wording changes in one place.
// Nothing here rates, forecasts or recommends: each line is a figure and the
// reads behind it.
// ----------------------------------------------------------------------------
// 1. Size: `totalAssets()` from the daily store, the latest day against the
//    latest day at least 30 days before it.
// 2. Yield: the share price's growth over 30 and 90 days by decision 0047's
//    formula, and the three 30-day windows inside the 90.
// 3. Withdrawals: what the page read at its block. The holder's
//    `maxWithdraw` against their claim; the vault's own figure where the
//    family has one (a MetaMorpho vault's withdrawable part of its queue,
//    lib/vaults/illiquid.ts; a Yearn vault's idle assets; an Umbrella stake's
//    cooldown and window); a pause or shutdown the contract states.
// 4. Losses: the days the share price fell in the last 90, and a MetaMorpho
//    V1.1 vault's `lostAssets()`.
// 5. Steward: the address that holds the vault's controlling role.
//
// A line with nothing read is `{ kind: "none" }`. Each figure is its own
// basis: the reads its receipt names (lib/vaults/health-provenance.ts).
//
// Pure, with type imports only: scripts/test/vault-health.test.mjs reads it.

import type { VaultFamily } from "./families";
import type { VaultYieldRead } from "./yield";

/** The days the readout asks of the store: room for a 90-day figure across a gap. */
export const HEALTH_READ_DAYS = 130;

export type HealthKey = "size" | "yield" | "withdrawals" | "losses" | "steward";

export type StewardRole = "curator" | "owner" | "roleManager" | "umbrellaOwner" | "poolDelegate";

/** What the family's page read about the vault's own exit, at its block. */
export type ExitInput =
  /** MetaMorpho: the withdraw queue's sum and its withdrawable part, raw. */
  | { kind: "queue"; block: number; queueAssets: string; withdrawable: string }
  /** Yearn V3: `totalIdle()` and `totalAssets()`, raw. */
  | { kind: "idle"; block: number; idle: string; total: string }
  /** Umbrella: `getCooldown()` and `getUnstakeWindow()`, seconds. */
  | { kind: "cooldown"; block: number; cooldownSeconds: number; windowSeconds: number };

export interface HealthInput {
  family: VaultFamily;
  /** The share price's stored days, oldest first; null where the store did not answer. */
  price: readonly VaultYieldRead[] | null;
  /** Total assets' stored days, oldest first; null where the store did not answer. */
  assets: readonly VaultYieldRead[] | null;
  /** Total assets under the dust floor (decision 0047 point 4). */
  tooSmall: boolean;
  /** The holder's claim and `maxWithdraw` at the page block, raw; absent off a holder page. */
  holder?: { block: number; claim: string; maxWithdraw: string } | null;
  exit: ExitInput | null;
  /** The contract says withdrawals are paused (sGHO's `paused()`, the index's standing). */
  paused?: boolean;
  /** The vault says it is shut down (Yearn's `isShutdown()`). */
  shutdown?: boolean;
  /** A MetaMorpho vault's `lostAssets()` at the page block: null where the
   *  vault keeps no ledger (V1.0); absent for other families. */
  lostAssets?: { raw: string; block: number } | null;
  /** The illiquid test's sentence, where it catches a market. */
  caught?: string | null;
  steward: { role: StewardRole; address: string; block: number } | null;
}

export interface Span {
  from: VaultYieldRead;
  to: VaultYieldRead;
}

/** Why a line states nothing: the family is not read, or the read did not answer. */
export type NoneReason = "family" | "unanswered" | "no-series";

export type SizeFigure =
  | { kind: "none"; reason: NoneReason }
  | { kind: "young"; firstDay: number }
  | { kind: "size"; span: Span; change: number | null };

export type YieldFigure =
  | { kind: "none"; reason: NoneReason }
  | { kind: "young"; firstDay: number }
  | { kind: "too-small" }
  | {
      kind: "yield";
      y30: Span;
      y90: Span | null;
      /** The three 30-day windows inside the 90, newest first; empty where the series is too young. */
      windows: Span[];
      yearly30: number;
      yearly90: number | null;
      low: number | null;
      high: number | null;
      /** The share price has not moved over the 30 days, nor over the 90 where read. */
      unmoved: boolean;
    };

export interface HolderExit {
  block: number;
  claim: string;
  maxWithdraw: string;
}

export type WithdrawalsFigure =
  | { kind: "none"; reason: NoneReason }
  | {
      kind: "withdrawals";
      paused: boolean;
      shutdown: boolean;
      holder: HolderExit | null;
      exit: ExitInput | null;
      /** The vault's withdrawable or idle share, 0..1, where `exit` has one. */
      share: number | null;
      caught: string | null;
    };

export interface LostAssetsRead {
  raw: string;
  block: number;
}

export type LossesFigure =
  | { kind: "none"; reason: NoneReason }
  | { kind: "lost-only"; lostAssets: LostAssetsRead | null }
  | {
      kind: "falls";
      first: VaultYieldRead;
      last: VaultYieldRead;
      reads: number;
      falls: number;
      worst: (Span & { change: number }) | null;
      lostAssets: LostAssetsRead | null | undefined;
    };

export type StewardFigure =
  | { kind: "none"; reason: NoneReason }
  | { kind: "steward"; role: StewardRole; address: string; block: number };

export interface Health {
  size: SizeFigure;
  yield: YieldFigure;
  withdrawals: WithdrawalsFigure;
  losses: LossesFigure;
  steward: StewardFigure;
}

const ratio = (a: VaultYieldRead, b: VaultYieldRead): number => {
  const SCALE = BigInt(10) ** BigInt(18);
  return Number((BigInt(b.raw) * SCALE) / BigInt(a.raw)) / Number(SCALE);
};

/** The latest read, and the latest read at least `days` before it. */
export function spanOf(reads: readonly VaultYieldRead[], days: number): Span | null {
  if (reads.length === 0) return null;
  const to = reads[reads.length - 1];
  let from: VaultYieldRead | null = null;
  for (const r of reads) {
    if (r.day > to.day - days) break;
    from = r;
  }
  return from ? { from, to } : null;
}

/** Decision 0047's figure over a span: (p1 / p0 − 1) × 365 / d. */
export const yearlyOf = (s: Span): number => ((ratio(s.from, s.to) - 1) * 365) / (s.to.day - s.from.day);

/** `part / whole`, 0..1, to six places; 0 where the whole is zero. */
export const shareOf = (part: string, whole: string): number =>
  BigInt(whole) === BigInt(0) ? 0 : Number((BigInt(part) * BigInt(1_000_000)) / BigInt(whole)) / 1_000_000;

/** A yearly rate this close to zero prints as 0.0%: the share price has not moved. */
const UNMOVED_YEARLY = 0.0005;

const READ_FAMILIES: readonly VaultFamily[] = ["metamorpho", "yearn-v3", "umbrella-stake"];

function size(i: HealthInput): SizeFigure {
  if (i.family === "maple-pool") return { kind: "none", reason: "family" };
  if (i.assets == null) return { kind: "none", reason: "unanswered" };
  if (i.assets.length === 0) return { kind: "none", reason: "no-series" };
  const s = spanOf(i.assets, 30);
  if (!s) return { kind: "young", firstDay: i.assets[0].day };
  return { kind: "size", span: s, change: BigInt(s.from.raw) === BigInt(0) ? null : ratio(s.from, s.to) - 1 };
}

function yieldOf(i: HealthInput): YieldFigure {
  if (i.family === "maple-pool") return { kind: "none", reason: "family" };
  if (i.price == null) return { kind: "none", reason: "unanswered" };
  if (i.tooSmall) return { kind: "too-small" };
  if (i.price.length === 0) return { kind: "none", reason: "no-series" };
  const p30 = spanOf(i.price, 30);
  if (!p30) return { kind: "young", firstDay: i.price[0].day };
  const yearly30 = yearlyOf(p30);
  const p90 = spanOf(i.price, 90);
  const yearly90 = p90 ? yearlyOf(p90) : null;
  const windows: Span[] = [];
  if (p90) {
    const end = p30.to.day;
    for (const k of [0, 30, 60]) {
      const s = spanOf(
        i.price.filter((r) => r.day <= end - k),
        30,
      );
      if (s) windows.push(s);
    }
  }
  const measured = windows.length === 3 ? windows.map(yearlyOf) : null;
  return {
    kind: "yield",
    y30: p30,
    y90: p90,
    windows,
    yearly30,
    yearly90,
    low: measured ? Math.min(...measured) : null,
    high: measured ? Math.max(...measured) : null,
    unmoved: Math.abs(yearly30) < UNMOVED_YEARLY && (yearly90 == null || Math.abs(yearly90) < UNMOVED_YEARLY),
  };
}

function withdrawals(i: HealthInput): WithdrawalsFigure {
  const holder = i.holder ?? null;
  const e = i.exit;
  if (!holder && !e && !i.paused && !i.shutdown)
    return { kind: "none", reason: READ_FAMILIES.includes(i.family) ? "unanswered" : "family" };
  const share =
    e == null || e.kind === "cooldown"
      ? null
      : Math.min(1, e.kind === "idle" ? shareOf(e.idle, e.total) : shareOf(e.withdrawable, e.queueAssets));
  return {
    kind: "withdrawals",
    paused: i.paused === true,
    shutdown: i.shutdown === true,
    holder,
    exit: e,
    share,
    caught: i.caught ?? null,
  };
}

function losses(i: HealthInput): LossesFigure {
  const price = i.price ?? [];
  const end = price.length ? price[price.length - 1].day : 0;
  const recent = price.filter((r) => r.day >= end - 90);
  if (recent.length < 2 || i.family === "maple-pool") {
    if (i.lostAssets !== undefined) return { kind: "lost-only", lostAssets: i.lostAssets };
    return {
      kind: "none",
      reason: i.family === "maple-pool" ? "family" : i.price == null ? "unanswered" : "no-series",
    };
  }
  let falls = 0;
  let worst: (Span & { change: number }) | null = null;
  for (let k = 1; k < recent.length; k++) {
    const c = ratio(recent[k - 1], recent[k]) - 1;
    if (c < 0) {
      falls++;
      if (worst == null || c < worst.change) worst = { from: recent[k - 1], to: recent[k], change: c };
    }
  }
  return {
    kind: "falls",
    first: recent[0],
    last: recent[recent.length - 1],
    reads: recent.length,
    falls,
    worst,
    lostAssets: i.lostAssets,
  };
}

function steward(i: HealthInput): StewardFigure {
  if (i.steward == null) return { kind: "none", reason: READ_FAMILIES.includes(i.family) ? "unanswered" : "family" };
  return { kind: "steward", ...i.steward };
}

/** The five figures for one vault. */
export function vaultHealth(i: HealthInput): Health {
  return { size: size(i), yield: yieldOf(i), withdrawals: withdrawals(i), losses: losses(i), steward: steward(i) };
}
