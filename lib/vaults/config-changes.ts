// A MetaMorpho vault's recent configuration changes in words (rails-ops
// ui-jobs 554, point 1: "What protects it … recent cap changes"), from
// rails-server's /api/metamorpho/:chain/vaults/:vault/changes
// (lib/api/fetch-metamorpho-changes.ts). The window is the 30 days to the
// page's block time; the eight configuration events count, the two
// reallocation events do not. Each change is said from its log's arguments,
// with the value before it where an earlier log of the same kind is in the
// answer; a truncated answer infers nothing from outside it. The section is
// scoped to how far Rails's record reaches (`changesScope`). Facts only: no
// change is called good or bad.
//
// Pure, no `@/` import (scripts/test/vault-config-changes.test.mjs loads it):
// dates and amounts come in through `ChangeFormat`.

export type MetaMorphoChangeEvent =
  | "SetCap"
  | "SubmitCap"
  | "SetSupplyQueue"
  | "SetWithdrawQueue"
  | "SetCurator"
  | "SetGuardian"
  | "SetTimelock"
  | "ReallocateSupply"
  | "ReallocateWithdraw"
  | "OwnershipTransferred";

export interface MetaMorphoChange {
  blockNumber: number;
  /** Unix seconds. */
  blockTime: number;
  txHash: string;
  txIndex: number;
  logIndex: number;
  event: MetaMorphoChangeEvent;
  args: Record<string, string | string[]>;
  source: "index" | "sieve";
}

export interface MetaMorphoCoverage {
  index: { fromBlock: number; throughBlock: number } | null;
  sieve: { fromBlock: number; throughBlock: number } | null;
}

export interface MetaMorphoRoleRun {
  fromBlock: number;
  fromTime: number;
  fromTx: string;
  untilBlock: number | null;
  untilTime: number | null;
  untilTx: string | null;
}

export interface MetaMorphoRoleVault {
  vault: string;
  name: string | null;
  symbol: string | null;
  version: string | null;
  firstBlock: number;
  lastBlock: number | null;
  runs: MetaMorphoRoleRun[];
}

/** The configuration events: every change event but the two reallocations. */
export const CONFIG_EVENTS: readonly MetaMorphoChangeEvent[] = [
  "SetCap",
  "SubmitCap",
  "SetSupplyQueue",
  "SetWithdrawQueue",
  "SetCurator",
  "SetGuardian",
  "SetTimelock",
  "OwnershipTransferred",
];

export const WINDOW_DAYS = 30;
const DAY = 86_400;

const ZERO = "0x0000000000000000000000000000000000000000";
/** The largest cap MetaMorpho stores (uint184). */
const MAX_CAP = (BigInt(1) << BigInt(184)) - BigInt(1);

export const shortHex = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The last block the answer covers: Sieve's checkpoint where Sieve serves, else the index's. */
export const coveredThrough = (c: MetaMorphoCoverage): number | null =>
  c.sieve?.throughBlock ?? c.index?.throughBlock ?? null;

/** About a day of blocks per chain: Ethereum's 12-second slots, Base's 2-second blocks. A record that
 *  stops further than this short of the page's block, or starts after the window's first block
 *  (estimated with the same block times), scopes what the section says. */
export const LAG_BLOCKS: Record<number, number> = { 1: 7_200, 8453: 43_200 };

/** How the record covers the 30 days: unread (no coverage), whole, or scoped to where it starts or stops. */
export type ChangesScope =
  | { kind: "unread" }
  | { kind: "whole"; through: number }
  | {
      kind: "scoped";
      through: number;
      /** The first block the record holds where that is after the window's start; null, the window's start. */
      fromBlock: number | null;
    };

/** `createdBlock`: the vault's creation block, from the answer. A record that starts at the vault's
 *  creation, inside the window, misses nothing: it starts late only after both. */
export function changesScope(
  coverage: MetaMorphoCoverage,
  chainId: number,
  asOf: { block: number },
  createdBlock = 0,
  days = WINDOW_DAYS,
): ChangesScope {
  const through = coveredThrough(coverage);
  if (through == null) return { kind: "unread" };
  const day = LAG_BLOCKS[chainId] ?? LAG_BLOCKS[1];
  const windowStart = asOf.block - days * day;
  const from = coverage.index?.fromBlock ?? coverage.sieve?.fromBlock ?? null;
  const late = from != null && from > Math.max(windowStart, createdBlock) ? from : null;
  if (asOf.block - through > day || late != null) return { kind: "scoped", through, fromBlock: late };
  return { kind: "whole", through };
}

/** The changes at or before `block` whose time falls in the `days` before `time`, newest first as given. */
export function recentChanges(
  changes: readonly MetaMorphoChange[],
  asOf: { block: number; time: number },
  days = WINDOW_DAYS,
): MetaMorphoChange[] {
  const from = asOf.time - days * DAY;
  return changes.filter((c) => c.blockNumber <= asOf.block && c.blockTime > from && c.blockTime <= asOf.time);
}

/** Chain order, oldest first. */
const before = (a: MetaMorphoChange, b: MetaMorphoChange) =>
  a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex;

/** The latest change in `all` before `c` that `pick` accepts. */
function previous(
  all: readonly MetaMorphoChange[],
  c: MetaMorphoChange,
  pick: (x: MetaMorphoChange) => boolean,
): MetaMorphoChange | null {
  let best: MetaMorphoChange | null = null;
  for (const x of all) if (before(x, c) < 0 && pick(x) && (!best || before(best, x) < 0)) best = x;
  return best;
}

/** The earliest change in `all` after `c` that `pick` accepts. */
function next(
  all: readonly MetaMorphoChange[],
  c: MetaMorphoChange,
  pick: (x: MetaMorphoChange) => boolean,
): MetaMorphoChange | null {
  let best: MetaMorphoChange | null = null;
  for (const x of all) if (before(c, x) < 0 && pick(x) && (!best || before(x, best) < 0)) best = x;
  return best;
}

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? "" : (v ?? ""));
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : []);

/** "1 day", "7 days", "36 hours", "none". */
export function timelockText(seconds: number): string {
  if (seconds <= 0) return "none";
  if (seconds % DAY === 0) return seconds === DAY ? "1 day" : `${(seconds / DAY).toLocaleString("en-US")} days`;
  if (seconds % 3600 === 0) return seconds === 3600 ? "1 hour" : `${(seconds / 3600).toLocaleString("en-US")} hours`;
  const d = seconds / DAY;
  return `${d.toLocaleString("en-US", { maximumFractionDigits: 1 })} days`;
}

/** Before a noun: "3-day", "36-hour", "1.5-day"; null for no wait. */
export function timelockAdjective(seconds: number): string | null {
  if (seconds <= 0) return null;
  if (seconds % DAY === 0) return `${(seconds / DAY).toLocaleString("en-US")}-day`;
  if (seconds % 3600 === 0) return `${(seconds / 3600).toLocaleString("en-US")}-hour`;
  return `${(seconds / DAY).toLocaleString("en-US", { maximumFractionDigits: 1 })}-day`;
}

export interface ChangeFormat {
  /** A unix time as the house date ("9 Nov 2026"). */
  date: (ts: number) => string;
  /** A raw cap in the vault's asset ("50M USDC"). */
  amount: (raw: string) => string;
  /** A market id as its name ("the wstETH market"); null where the page does not know it. */
  market: (id: string) => string | null;
}

const marketOf = (f: ChangeFormat, id: string) => f.market(id) ?? `market ${shortHex(id)}`;

/** A cap in words: the amount, zero, or the contract's maximum. */
function capOf(f: ChangeFormat, raw: string): string {
  const v = BigInt(raw || "0");
  if (v === BigInt(0)) return "zero";
  if (v >= MAX_CAP) return "the largest cap the contract takes";
  return f.amount(raw);
}

/** The timelock in force at `c`: the latest SetTimelock before it in the answer; else, where the
 *  answer is whole (not truncated), `fallback`, the page's read. A truncated answer infers none. */
export function timelockAt(
  all: readonly MetaMorphoChange[],
  c: MetaMorphoChange,
  fallback: number | null,
  truncated = false,
) {
  const t = previous(all, c, (x) => x.event === "SetTimelock");
  if (t) return { seconds: Number(str(t.args.newTimelock)), from: t };
  return fallback == null || truncated ? null : { seconds: fallback, from: null };
}

/** The SetCap that accepted a SubmitCap: same market and cap, after it, before the next SubmitCap on
 *  the market (a later submission replaces a revoked or pending one), at or after `validAt` where
 *  known, at or before the page's block. */
export function acceptanceOf(
  all: readonly MetaMorphoChange[],
  c: MetaMorphoChange,
  validAt: number | null,
  asOfBlock: number,
): MetaMorphoChange | null {
  const id = str(c.args.id);
  const cap = str(c.args.cap);
  const bound = next(all, c, (x) => x.event === "SubmitCap" && str(x.args.id) === id);
  return next(
    all,
    c,
    (x) =>
      x.event === "SetCap" &&
      str(x.args.id) === id &&
      str(x.args.cap) === cap &&
      x.blockNumber <= asOfBlock &&
      (validAt == null || x.blockTime >= validAt) &&
      (!bound || before(x, bound) < 0),
  );
}

/** What a change is read against: every change the answer holds, newest first; whether the answer
 *  was truncated; the vault's timelock at the page's read; the page's block and time. */
export interface ChangeContext {
  all: readonly MetaMorphoChange[];
  truncated: boolean;
  timelock: number | null;
  asOf: { block: number; time: number };
}

export interface ChangeWords {
  /** The change in one sentence, no full stop. */
  text: string;
  /** SubmitCap: when the cap can be accepted (where the timelock in force is known), and the SetCap that accepted it where one follows. */
  waiting?: { validAt: number; timelock: number; acceptedBy: MetaMorphoChange | null };
  /** SubmitCap: the SetCap that accepted it; null where none follows in the record. */
  accepted?: MetaMorphoChange | null;
  /** The earlier log the "from" value comes from. */
  previous: MetaMorphoChange | null;
}

/** One change in words. A "from" value comes only from an earlier log in the answer. */
export function changeWords(c: MetaMorphoChange, ctx: ChangeContext, f: ChangeFormat): ChangeWords {
  const { all } = ctx;
  const a = c.args;
  switch (c.event) {
    case "SetCap": {
      const id = str(a.id);
      const prev = previous(all, c, (x) => x.event === "SetCap" && str(x.args.id) === id);
      const to = capOf(f, str(a.cap));
      const where = `Cap on ${marketOf(f, id)}`;
      if (!prev) return { text: `${where} set to ${to}`, previous: null };
      const was = BigInt(str(prev.args.cap) || "0");
      const now_ = BigInt(str(a.cap) || "0");
      const verb = now_ > was ? "raised" : now_ < was ? "lowered" : "set again";
      if (verb === "set again") return { text: `${where} set again to ${to}`, previous: prev };
      return { text: `${where} ${verb} from ${capOf(f, str(prev.args.cap))} to ${to}`, previous: prev };
    }
    case "SubmitCap": {
      const id = str(a.id);
      const cap = str(a.cap);
      const tl = timelockAt(all, c, ctx.timelock, ctx.truncated);
      const head = `Cap of ${capOf(f, cap)} on ${marketOf(f, id)} submitted`;
      const validAt = tl ? c.blockTime + tl.seconds : null;
      const accepted = acceptanceOf(all, c, validAt, ctx.asOf.block);
      if (!tl || validAt == null)
        return accepted
          ? { text: `${head}; accepted on ${f.date(accepted.blockTime)}`, accepted, previous: null }
          : {
              text: `${head}; no acceptance follows in the record`,
              accepted,
              previous: null,
            };
      const waiting = { validAt, timelock: tl.seconds, acceptedBy: accepted };
      if (accepted)
        return { text: `${head}; accepted on ${f.date(accepted.blockTime)}`, waiting, accepted, previous: null };
      if (validAt > ctx.asOf.time) {
        const adj = timelockAdjective(tl.seconds);
        return {
          text: `${head}; it waits for the ${adj ? `${adj} ` : ""}timelock and can be accepted from ${f.date(validAt)}`,
          waiting,
          accepted,
          previous: null,
        };
      }
      return {
        text: `${head}; it could be accepted from ${f.date(validAt)}, and no acceptance follows in the record`,
        waiting,
        accepted,
        previous: null,
      };
    }
    case "SetSupplyQueue":
    case "SetWithdrawQueue": {
      const key = c.event === "SetSupplyQueue" ? "newSupplyQueue" : "newWithdrawQueue";
      const name = c.event === "SetSupplyQueue" ? "Supply queue" : "Withdraw queue";
      const len = list(a[key]).length;
      const markets = (k: number) => `${k.toLocaleString("en-US")} market${k === 1 ? "" : "s"}`;
      const prev = previous(all, c, (x) => x.event === c.event);
      if (!prev) return { text: `${name} set to ${markets(len)}`, previous: null };
      const before_ = list(prev.args[key]);
      const after = list(a[key]);
      const added = after.filter((id) => !before_.includes(id)).length;
      const removed = before_.filter((id) => !after.includes(id)).length;
      if (!added && !removed) {
        const same = before_.length === after.length && before_.every((id, i) => after[i] === id);
        return {
          text: same ? `${name} set again with the same ${markets(len)}` : `${name} reordered, ${markets(len)}`,
          previous: prev,
        };
      }
      const moved = [
        added ? `${added.toLocaleString("en-US")} added` : null,
        removed ? `${removed.toLocaleString("en-US")} removed` : null,
      ]
        .filter(Boolean)
        .join(", ");
      if (before_.length === len) return { text: `${name} changed, still ${markets(len)}: ${moved}`, previous: prev };
      return { text: `${name} changed from ${markets(before_.length)} to ${markets(len)}: ${moved}`, previous: prev };
    }
    case "SetCurator": {
      const to = str(a.newCurator);
      return { text: to === ZERO ? "Curator removed" : `Curator set to ${shortHex(to)}`, previous: null };
    }
    case "SetGuardian": {
      const to = str(a.guardian);
      return { text: to === ZERO ? "Guardian removed" : `Guardian set to ${shortHex(to)}`, previous: null };
    }
    case "SetTimelock": {
      const to = Number(str(a.newTimelock));
      const prev = previous(all, c, (x) => x.event === "SetTimelock");
      if (!prev) return { text: `Timelock set to ${timelockText(to)}`, previous: null };
      return {
        text: `Timelock changed from ${timelockText(Number(str(prev.args.newTimelock)))} to ${timelockText(to)}`,
        previous: prev,
      };
    }
    case "OwnershipTransferred": {
      const from = str(a.previousOwner);
      const to = str(a.newOwner);
      if (to === ZERO) return { text: "Ownership renounced", previous: null };
      if (from === ZERO) return { text: `Owner set to ${shortHex(to)} at the vault's creation`, previous: null };
      return { text: `Owner changed from ${shortHex(from)} to ${shortHex(to)}`, previous: null };
    }
    default:
      return { text: c.event, previous: null };
  }
}

/** The changes an answer gives, as the section's rows. */
export interface ChangeRowWords {
  change: MetaMorphoChange;
  words: ChangeWords;
}

export function changeRows(ctx: ChangeContext, f: ChangeFormat): ChangeRowWords[] {
  return recentChanges(ctx.all, ctx.asOf).map((c) => ({ change: c, words: changeWords(c, ctx, f) }));
}
