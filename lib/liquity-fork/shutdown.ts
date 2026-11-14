// A Liquity V2 branch's shutdown (rails-ops TO-DO-ui-jobs 612): the shapes, how
// a raw answer settles, the cache rule, and how a stored record and a live read
// make the state a page draws.
//
// Decision 0054 ruling 2: a deployment that records its shutdown in its catalog
// (Ebisu) draws "Shut down" from that record; the live read confirms it, and a
// live answer of "not shut down" is shown as a disagreement, never taken over
// the record. A deployment with no record relies on the live read alone, and an
// unknown answer draws the page as before.
//
// Pure: imports nothing, so the unit test reads it (scripts/test).

/** The call a deployment's branch answers its shutdown on: `shutdownTime()`
 *  (uint256, 0 while live) on the contract named. Liquity V2, Asymmetry and
 *  Basedollar answer it on the TroveManager; Ebisu's TroveManager reverts and
 *  its ActivePool answers. */
export interface ShutdownRead {
  contract: "TroveManager" | "ActivePool";
  address: string;
  call: "shutdownTime";
}

/** One recorded transaction: when it was mined, its hash, its block. */
export interface ShutdownTxRecord {
  /** Unix seconds of the block. */
  at: number;
  tx: string;
  block: number;
}

/** A branch's shutdown as recorded in its deployment's catalog. */
export interface BranchShutdownRecord {
  /** Who shut it down, where the record knows: the deployment's admin. */
  by: "admin";
  shutdown: ShutdownTxRecord;
  /** The admin's withdrawal of the pool's collateral, where there was one. */
  withdrawal?: ShutdownTxRecord & {
    /** The ActivePool the collateral left, where it held any. */
    pool?: string;
    /** The exact amount the ActivePool sent, in the collateral's units, where it held any. */
    amount?: string;
  };
  /** The owner operations that revert since, read from the chain. */
  reverts?: readonly string[];
}

/** One live answer. `shutDown` null: not known (the read failed). */
export interface BranchShutdownLive {
  shutDown: boolean | null;
  /** Unix seconds the branch shut down, when it has. */
  at: number | null;
  /** The raw integer the call returned, when it answered. */
  raw: string | null;
  source: { contract: ShutdownRead["contract"]; address: string; call: string; block: number | null };
}

/** What the page draws for a shut-down branch. */
export interface BranchShutdownState {
  /** Unix seconds: the record's, else the live read's. */
  at: number;
  record: BranchShutdownRecord | null;
  live: BranchShutdownLive | null;
  /** The live read answered "not shut down" against the record. */
  disagree: boolean;
}

/** A shutdownTime() answer settled: null raw is not known, 0 is live. */
export function settleShutdownTime(raw: bigint | null, source: BranchShutdownLive["source"]): BranchShutdownLive {
  if (raw == null) return { shutDown: null, at: null, raw: null, source };
  const at = Number(raw);
  return { shutDown: raw > BigInt(0), at: raw > BigInt(0) ? at : null, raw: raw.toString(), source };
}

/** How long an answer is kept: a shutdown is permanent, so a true answer is
 *  kept for the process; a false one ten minutes; a failed read 30 s, the
 *  down window of the route gate (lib/sources/api/route-gate.ts). */
export const SHUTDOWN_FALSE_TTL_MS = 10 * 60_000;
export const SHUTDOWN_FAILED_TTL_MS = 30_000;
export function shutdownTtlMs(live: Pick<BranchShutdownLive, "shutDown">): number {
  if (live.shutDown === true) return Number.POSITIVE_INFINITY;
  if (live.shutDown === false) return SHUTDOWN_FALSE_TTL_MS;
  return SHUTDOWN_FAILED_TTL_MS;
}

/** The state a page draws, or null where the branch reads live or unknown. */
export function branchShutdownState(
  record: BranchShutdownRecord | null | undefined,
  live: BranchShutdownLive | null | undefined,
): BranchShutdownState | null {
  if (record) {
    return { at: record.shutdown.at, record, live: live ?? null, disagree: live?.shutDown === false };
  }
  if (live?.shutDown === true && live.at != null) return { at: live.at, record: null, live, disagree: false };
  return null;
}

/** Every branch of a deployment is shut down: the branches page states the
 *  deployment's state in place of how redemption reaches its branches. */
export function allBranchesShutDown(branches: readonly { shutdown?: BranchShutdownState | null }[]): boolean {
  return branches.length > 0 && branches.every((b) => b.shutdown != null);
}

/** The branches page's title: how redemption reaches the branches, or, with
 *  every branch shut down, the branches alone. */
export function branchesPageTitle(branches: readonly { shutdown?: BranchShutdownState | null }[]): string {
  return allBranchesShutDown(branches) ? "Branches" : "Branches & how redemption reaches them";
}

/** Which redemption reached a Trove. Once a branch is shut down, standard
 *  redemptions skip it and only `urgentRedemption` reaches its Troves (the
 *  Liquity V2 contracts, which the forks share), so a redemption at or after
 *  the branch's shutdown time is the urgent path. Seen on chain in Ebisu's
 *  sUSDe redemption of 7 Oct 2026, tx 0xf9bcc83e…3f94 (block 26,139,958):
 *  both fees 0 and the collateral at 1.02 × par (rails-ops
 *  reference/official-docs/ebisu.md, "Chain reads"). The index labels both
 *  paths `redeemCollateral`, so the time is what tells them apart; an
 *  unknown shutdown reads as ordinary. `at` and `shutdownAt` are unix seconds. */
export type RedemptionPath = "ordinary" | "urgent";
export function redemptionPath(at: number, shutdownAt: number | null | undefined): RedemptionPath {
  return shutdownAt != null && at >= shutdownAt ? "urgent" : "ordinary";
}
