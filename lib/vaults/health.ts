// "How the vault is doing" (rails-ops ui-jobs 553, door 1; Miles's rulings of
// 9 Nov 2026): five lines, each a question, a one-word answer and one
// sentence, worked from reads Rails already holds. No line scores the vault;
// the words name what the figures show.
// ----------------------------------------------------------------------------
// 1. Growing or shrinking: `totalAssets()` from the daily store, the latest
//    day against the latest day at least 30 days before it. Within 1% either
//    way is "Steady".
// 2. Earning steadily: the share price's yield over 30 and 90 days by
//    decision 0047's formula, and the three 30-day windows inside the 90.
//    "Steady" when the highest window less the lowest is under a quarter of
//    the 30-day yield, and never under one percentage point; "Flat" for a
//    share price that does not move.
// 3. Can I get out today: what the family's page reads at its block. A
//    MetaMorpho vault's withdrawable part of its queue (lib/vaults/illiquid.ts),
//    a Yearn vault's idle assets, an Umbrella stake's cooldown and window.
// 4. Has it lost money: the days the share price fell in the last 90, and a
//    MetaMorpho V1.1 vault's `lostAssets()`.
// 5. Who runs it: the address that holds the vault's controlling role, an
//    address until names are attested (decision 0017 point 5).
//
// A line a family cannot answer says what is not read, `read: false`. Each
// line carries its `basis`, the reads its receipt names
// (lib/vaults/health-provenance.ts).
//
// Pure, with type imports only: scripts/test/vault-health.test.mjs reads it.

import type { VaultFamily } from "./families";
import type { VaultYieldRead } from "./yield";

/** The days the readout asks of the store: room for a 90-day figure across a gap. */
export const HEALTH_READ_DAYS = 130;

export type HealthKey = "size" | "earning" | "exit" | "losses" | "steward";

export const HEALTH_QUESTIONS: Record<HealthKey, string> = {
  size: "Growing or shrinking",
  earning: "Earning steadily",
  exit: "Can I get out today",
  losses: "Has it lost money",
  steward: "Who runs it",
};

export type StewardRole = "curator" | "owner" | "roleManager" | "umbrellaOwner";

/** What the family's page read about getting out, at its block. */
export type ExitInput =
  /** MetaMorpho: the withdraw queue's sum and its withdrawable part, raw;
   *  `caught` is the illiquid test's sentence where it catches a market. */
  | { kind: "queue"; block: number; queueAssets: string; withdrawable: string; caught: string | null }
  /** Yearn V3: `totalIdle()` and `totalAssets()`, raw. */
  | { kind: "idle"; block: number; idle: string; total: string }
  /** Umbrella: `getCooldown()` and `getUnstakeWindow()`, seconds. */
  | { kind: "cooldown"; block: number; cooldownSeconds: number; windowSeconds: number };

export interface HealthInput {
  family: VaultFamily;
  assetSymbol: string;
  decimals: number;
  /** The share price's stored days, oldest first; null where the store did not answer. */
  price: readonly VaultYieldRead[] | null;
  /** Total assets' stored days, oldest first; null where the store did not answer. */
  assets: readonly VaultYieldRead[] | null;
  /** Total assets under the dust floor (decision 0047 point 4). */
  tooSmall: boolean;
  exit: ExitInput | null;
  /** A MetaMorpho vault's `lostAssets()` at the page block: null where the
   *  vault keeps no ledger (V1.0); absent for other families. */
  lostAssets?: { raw: string; block: number } | null;
  steward: { role: StewardRole; address: string; block: number } | null;
}

/** The formatters the sentences use, so the page's own (en-US amounts,
 *  en-GB days) print them. */
export interface HealthWords {
  /** An amount of the asset, compact: "12.3M". */
  amount: (value: number) => string;
  /** A stored UTC day: "10 Oct 2026". */
  day: (day: number) => string;
}

export interface Span {
  from: VaultYieldRead;
  to: VaultYieldRead;
}

/** The reads behind a line, for its receipt. */
export type HealthBasis =
  | { kind: "none" }
  | { kind: "size"; span: Span; change: number | null }
  | { kind: "young"; series: "price" | "assets"; firstDay: number }
  | {
      kind: "earning";
      y30: Span;
      y90: Span | null;
      /** The three 30-day windows inside the 90, newest first; empty where the series is too young. */
      windows: Span[];
      yearly30: number;
      yearly90: number | null;
      low: number | null;
      high: number | null;
    }
  | { kind: "too-small" }
  | {
      kind: "falls";
      first: VaultYieldRead;
      last: VaultYieldRead;
      reads: number;
      falls: number;
      worst: (Span & { change: number }) | null;
      lostAssets: { raw: string; block: number } | null | undefined;
    }
  | { kind: "lost-only"; lostAssets: { raw: string; block: number } | null }
  | { kind: "exit"; exit: ExitInput; share: number }
  | { kind: "steward"; role: StewardRole; address: string; block: number };

export interface HealthLine {
  key: HealthKey;
  question: string;
  /** The one-word answer; null where the line has none. */
  word: string | null;
  sentence: string;
  /** False where Rails does not read this for the family: the sentence says
   *  what is not read, and the page draws it muted. */
  read: boolean;
  basis: HealthBasis;
}

export interface Health {
  size: HealthLine;
  earning: HealthLine;
  exit: HealthLine;
  losses: HealthLine;
  steward: HealthLine;
}

/** The order the lines draw in. */
export const HEALTH_ORDER: readonly HealthKey[] = ["size", "earning", "exit", "losses", "steward"];

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

/** "4.2%", to one decimal. */
export const pctText = (x: number, digits = 1): string =>
  `${(x * 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

const signed = (x: number, digits = 1) => `${x > 0 ? "+" : ""}${pctText(x, digits)}`;

/** A share floored to one decimal, so a part under the whole never prints as 100%. */
export const flooredPct = (x: number): string =>
  `${(Math.floor(x * 1000) / 10).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

const rawValue = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

const share = (part: string, whole: string): number =>
  BigInt(whole) === BigInt(0) ? 0 : Number((BigInt(part) * BigInt(1_000_000)) / BigInt(whole)) / 1_000_000;

/** "7 days", "2 days 12 hours", "6 hours". */
export function durationText(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const unit = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
  if (days > 0 && hours > 0) return `${unit(days, "day")} ${unit(hours, "hour")}`;
  if (days > 0) return unit(days, "day");
  if (hours > 0) return unit(hours, "hour");
  return unit(Math.round(seconds / 60), "minute");
}

/** A share price within this of no move a year reads as flat. */
const FLAT_YEARLY = 0.0005;
/** "Steady": the windows' spread under this share of the 30-day yield… */
const STEADY_SHARE = 0.25;
/** …and never under one percentage point. */
const STEADY_FLOOR = 0.01;
/** Total assets within 1% either way over 30 days. */
const SIZE_STEADY = 0.01;
/** A one-day fall past this reads as a loss: 0.1%. */
const LOSS_DAY = 0.001;

const line = (key: HealthKey, l: Omit<HealthLine, "key" | "question">): HealthLine => ({
  key,
  question: HEALTH_QUESTIONS[key],
  ...l,
});

const NO_SERIES = (family: VaultFamily) =>
  family === "maple-pool" ? "Rails keeps no daily series for Maple pools yet." : "The daily store did not answer.";

function sizeLine(i: HealthInput, w: HealthWords): HealthLine {
  const sym = i.assetSymbol;
  if (i.assets == null || i.assets.length === 0 || i.family === "maple-pool")
    return line("size", { word: null, sentence: NO_SERIES(i.family), read: false, basis: { kind: "none" } });
  const s = spanOf(i.assets, 30);
  if (!s) {
    const first = i.assets[0];
    return line("size", {
      word: "Young",
      sentence: `Its daily total starts on ${w.day(first.day)}, under the 30 days a change needs.`,
      read: true,
      basis: { kind: "young", series: "assets", firstDay: first.day },
    });
  }
  const to = rawValue(s.to.raw, i.decimals);
  const from = rawValue(s.from.raw, i.decimals);
  const change = BigInt(s.from.raw) === BigInt(0) ? null : ratio(s.from, s.to) - 1;
  const word =
    change == null ? "New" : Math.abs(change) < SIZE_STEADY ? "Steady" : change > 0 ? "Growing" : "Shrinking";
  const sentence =
    change == null
      ? `Holds ${w.amount(to)} ${sym}; it held nothing on ${w.day(s.from.day)}.`
      : `Holds ${w.amount(to)} ${sym}, ${signed(change)} since ${w.day(s.from.day)} (${w.amount(from)}).`;
  return line("size", { word, sentence, read: true, basis: { kind: "size", span: s, change } });
}

function earningLine(i: HealthInput, w: HealthWords): HealthLine {
  if (i.price == null || i.family === "maple-pool")
    return line("earning", { word: null, sentence: NO_SERIES(i.family), read: false, basis: { kind: "none" } });
  if (i.tooSmall)
    return line("earning", {
      word: "Too small",
      sentence: "Too small to measure: rounding moves its share price more than its earnings do.",
      read: true,
      basis: { kind: "too-small" },
    });
  const p30 = spanOf(i.price, 30);
  if (!p30) {
    if (i.price.length === 0)
      return line("earning", {
        word: null,
        sentence: "Rails keeps no daily share price for it yet.",
        read: false,
        basis: { kind: "none" },
      });
    return line("earning", {
      word: "Young",
      sentence: `Its daily share price starts on ${w.day(i.price[0].day)}, under the 30 days a yield needs.`,
      read: true,
      basis: { kind: "young", series: "price", firstDay: i.price[0].day },
    });
  }
  const y30 = yearlyOf(p30);
  const p90 = spanOf(i.price, 90);
  const y90 = p90 ? yearlyOf(p90) : null;
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
  const low = measured ? Math.min(...measured) : null;
  const high = measured ? Math.max(...measured) : null;
  const flat = Math.abs(y30) < FLAT_YEARLY && (y90 == null || Math.abs(y90) < FLAT_YEARLY);
  const steady = low != null && high != null && high - low < Math.max(STEADY_FLOOR, Math.abs(y30) * STEADY_SHARE);
  const word = flat ? "Flat" : y30 < 0 ? "Falling" : low == null ? "Young" : steady ? "Steady" : "Uneven";
  const sentence = flat
    ? i.family === "umbrella-stake"
      ? "Its share price does not move: Umbrella pays its rewards outside the share, and Rails does not read them yet."
      : `Its share price has not moved in ${p90 ? 90 : p30.to.day - p30.from.day} days.`
    : `${pctText(y30)} a year over 30 days` +
      (y90 != null ? `, ${pctText(y90)} over 90` : "") +
      (low != null && high != null
        ? `. Each 30 days of the last 90 earned between ${pctText(low)} and ${pctText(high)}.`
        : ". Its series is too young for 90 days.");
  return line("earning", {
    word,
    sentence,
    read: true,
    basis: { kind: "earning", y30: p30, y90: p90, windows, yearly30: y30, yearly90: y90, low, high },
  });
}

const EXIT_UNREAD: Record<VaultFamily, string> = {
  metamorpho: "The markets it lends to did not all answer, so what can leave today is not stated.",
  sgho: "Rails does not read how much of it can leave today yet.",
  stata: "A withdrawal takes cash from its Aave reserve, and Rails does not read the reserve's free cash here yet.",
  "umbrella-stake": "The cooldown did not answer, so the wait is not stated.",
  "yearn-v3": "Its idle assets did not answer, so what can leave today is not stated.",
  "maple-pool": "Maple pools pay withdrawals through a queue, which Rails reads on the pools page only.",
};

function exitLine(i: HealthInput): HealthLine {
  const e = i.exit;
  if (e == null)
    return line("exit", { word: null, sentence: EXIT_UNREAD[i.family], read: false, basis: { kind: "none" } });
  if (e.kind === "cooldown")
    return line("exit", {
      word: "After a cooldown",
      sentence: `A withdrawal starts a cooldown of ${durationText(e.cooldownSeconds)}, then must be made within the ${durationText(e.windowSeconds)} after it.`,
      read: true,
      basis: { kind: "exit", exit: e, share: 0 },
    });
  if (e.kind === "idle") {
    const s = Math.min(1, share(e.idle, e.total));
    const all = s >= 0.999;
    return line("exit", {
      word: all ? "Yes" : "Partly",
      sentence: all
        ? "All of it sits idle in the vault and can leave today."
        : s === 0
          ? "None of it sits idle in the vault: all of it is lent to its strategies, which pay a withdrawal as far as they can free the asset."
          : `${flooredPct(s)} of it sits idle in the vault and can leave today. The rest is lent to its strategies, which pay a withdrawal as far as they can free the asset.`,
      read: true,
      basis: { kind: "exit", exit: e, share: s },
    });
  }
  const s = Math.min(1, share(e.withdrawable, e.queueAssets));
  const all = s >= 0.999;
  return line("exit", {
    word: e.caught ? "Not all of it" : all ? "Yes" : "Partly",
    sentence: e.caught
      ? `${e.caught} ${flooredPct(s)} of it can leave today.`
      : all
        ? "All of it can leave today: the markets it lends to hold that much unborrowed."
        : `${flooredPct(s)} of it can leave today: the markets it lends to hold that much unborrowed.`,
    read: true,
    basis: { kind: "exit", exit: e, share: s },
  });
}

function lostPart(i: HealthInput, w: HealthWords): string {
  if (i.lostAssets === undefined) return "";
  if (i.lostAssets === null) return "A V1.0 vault keeps no lost-assets ledger.";
  const lost = rawValue(i.lostAssets.raw, i.decimals);
  return lost > 0 ? `It records ${w.amount(lost)} ${i.assetSymbol} of lost assets.` : "It records no lost assets.";
}

function lossesLine(i: HealthInput, w: HealthWords): HealthLine {
  const lost = lostPart(i, w);
  const price = i.price ?? [];
  const end = price.length ? price[price.length - 1].day : 0;
  const recent = price.filter((r) => r.day >= end - 90);
  if (recent.length < 2 || i.family === "maple-pool") {
    if (lost)
      return line("losses", {
        word: null,
        sentence: lost,
        read: true,
        basis: { kind: "lost-only", lostAssets: i.lostAssets ?? null },
      });
    return line("losses", {
      word: null,
      sentence: i.price == null ? NO_SERIES(i.family) : "Rails keeps no daily share price for it yet.",
      read: false,
      basis: { kind: "none" },
    });
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
  const lostAny = i.lostAssets != null && BigInt(i.lostAssets.raw) > BigInt(0);
  const word = lostAny || (worst != null && worst.change < -LOSS_DAY) ? "Yes" : falls > 0 ? "Small dips" : "No";
  const days = recent[recent.length - 1].day - recent[0].day;
  const fell =
    worst == null
      ? `Its share price has not fallen on any day in ${days} days.`
      : `Its share price fell on ${falls} of the last ${days} days, the most ${pctText(worst.change, worst.change > -0.0001 ? 4 : 2)} on ${w.day(worst.to.day)}.`;
  return line("losses", {
    word,
    sentence: lost ? `${fell} ${lost}` : fell,
    read: true,
    basis: {
      kind: "falls",
      first: recent[0],
      last: recent[recent.length - 1],
      reads: recent.length,
      falls,
      worst,
      lostAssets: i.lostAssets,
    },
  });
}

/** What each role does, in a clause after the role's name. */
const ROLE_WORDS: Record<StewardRole, string> = {
  curator: "its curator, which picks the markets it lends to and their caps",
  owner: "its owner, which sets its curator, fees and markets",
  roleManager: "its role manager, which hands out every role in the vault",
  umbrellaOwner: "its owner, the one address that can slash it",
};

const STEWARD_UNREAD: Record<VaultFamily, string> = {
  metamorpho: "Its curator and owner did not answer.",
  sgho: "Aave's governance holds its roles, and Rails does not read them here.",
  stata: "Aave's governance holds its roles, and Rails does not read them here.",
  "umbrella-stake": "Its owner did not answer.",
  "yearn-v3": "Its role manager did not answer.",
  "maple-pool": "Rails does not read who runs a Maple pool yet.",
};

/** "0x1234…abcd". */
export const shortHex = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

function stewardLine(i: HealthInput): HealthLine {
  const s = i.steward;
  if (s == null)
    return line("steward", { word: null, sentence: STEWARD_UNREAD[i.family], read: false, basis: { kind: "none" } });
  const role = ROLE_WORDS[s.role];
  return line("steward", {
    word: shortHex(s.address),
    sentence: `This address is ${role}. Rails shows the address until a name for it is attested.`,
    read: true,
    basis: { kind: "steward", ...s },
  });
}

/** The five lines for one vault. */
export function vaultHealth(i: HealthInput, w: HealthWords): Health {
  return {
    size: sizeLine(i, w),
    earning: earningLine(i, w),
    exit: exitLine(i),
    losses: lossesLine(i, w),
    steward: stewardLine(i),
  };
}

/** The lines in drawing order. */
export const healthLines = (h: Health): HealthLine[] => HEALTH_ORDER.map((k) => h[k]);
