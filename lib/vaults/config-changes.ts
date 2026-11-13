// A MetaMorpho vault's recent configuration changes in words (rails-ops
// ui-jobs 554, point 1: "What protects it … recent cap changes"), from
// rails-server's /api/metamorpho/:chain/vaults/:vault/changes
// (lib/api/fetch-metamorpho-changes.ts). The window is the 30 days to the
// page's block time; the eight configuration events count, the two
// reallocation events do not. Each change is said from its log's arguments,
// with the value before it where an earlier log of the same kind is in the
// answer. Facts only: no change is called good or bad.
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

/** "1 day", "7 days", "36 hours", "no wait". */
export function timelockText(seconds: number): string {
  if (seconds <= 0) return "no wait";
  if (seconds % DAY === 0) return seconds === DAY ? "1 day" : `${(seconds / DAY).toLocaleString("en-US")} days`;
  if (seconds % 3600 === 0) return seconds === 3600 ? "1 hour" : `${(seconds / 3600).toLocaleString("en-US")} hours`;
  const d = seconds / DAY;
  return `${d.toLocaleString("en-US", { maximumFractionDigits: 1 })} days`;
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

/** The timelock in force at `c`: the latest SetTimelock before it, else `fallback`. */
export function timelockAt(all: readonly MetaMorphoChange[], c: MetaMorphoChange, fallback: number | null) {
  const t = previous(all, c, (x) => x.event === "SetTimelock");
  if (t) return { seconds: Number(str(t.args.newTimelock)), from: t };
  return fallback == null ? null : { seconds: fallback, from: null };
}

export interface ChangeWords {
  /** The change in one sentence, no full stop. */
  text: string;
  /** SubmitCap: when the cap can be accepted, and the SetCap that accepted it where one follows. */
  waiting?: { validAt: number; timelock: number; acceptedBy: MetaMorphoChange | null };
  /** The earlier log the "from" value comes from. */
  previous: MetaMorphoChange | null;
}

/** One change in words. `all` is every change the answer holds (for the value before); `timelock`
 *  is the vault's timelock at the page's read, used where no SetTimelock precedes a SubmitCap. */
export function changeWords(
  c: MetaMorphoChange,
  all: readonly MetaMorphoChange[],
  f: ChangeFormat,
  timelock: number | null,
  now: number,
): ChangeWords {
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
      const tl = timelockAt(all, c, timelock);
      const head = `Cap of ${capOf(f, cap)} on ${marketOf(f, id)} submitted`;
      if (!tl) return { text: `${head}; it waits for the timelock`, previous: null };
      const validAt = c.blockTime + tl.seconds;
      const accepted = next(all, c, (x) => x.event === "SetCap" && str(x.args.id) === id && str(x.args.cap) === cap);
      const waiting = { validAt, timelock: tl.seconds, acceptedBy: accepted };
      if (accepted) return { text: `${head}; accepted on ${f.date(accepted.blockTime)}`, waiting, previous: null };
      if (validAt > now)
        return {
          text: `${head}; it waits for the ${timelockText(tl.seconds)} timelock and can be accepted from ${f.date(validAt)}`,
          waiting,
          previous: null,
        };
      return {
        text: `${head}; it could be accepted from ${f.date(validAt)}, and no acceptance follows in the record`,
        waiting,
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

export function changeRows(
  all: readonly MetaMorphoChange[],
  asOf: { block: number; time: number },
  f: ChangeFormat,
  timelock: number | null,
): ChangeRowWords[] {
  return recentChanges(all, asOf).map((c) => ({ change: c, words: changeWords(c, all, f, timelock, asOf.time) }));
}
