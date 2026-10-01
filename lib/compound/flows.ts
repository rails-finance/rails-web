// Lifetime flows for a Compound V3 (Comet) position, a (market, account)
// pair: the page's rows replayed into the day rows the Lifetime flows panel
// reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V3").
// ----------------------------------------------------------------------------
// A Comet account holds one signed base balance (above zero it lends, below
// zero it borrows) and any number of collateral assets, which earn nothing.
// Each row states the base balance after it as the chain held it: Comet's
// presentValue, the account's principal × the base supply or borrow index at
// the row's block (server migs 348–351; the Base index the same reads, web
// lib/sources/chain/compound-v3-events.ts). It also states the change since
// the account's previous row that no event moved: `baseInterest`, the
// previous principal at this block's index less the previous balance, and
// `baseUnlogged`, a base move no captured event states (Comet logs no
// Transfer for the borrow side of a base transfer). So every row splits
// to the base unit:
//
//     base after − base after the last row = interest + unlogged move + act
//
// with the act the row's amount. Comet has no borrow or repay call: a
// Supply into a debt repays it first and lends the rest, a Withdraw past the
// balance borrows the rest, and an AbsorbDebt clears the debt and lends
// whatever the seized collateral was credited beyond it. Collateral rows state
// the asset's balance after them.
//
// Values: each flow at Comet's oracle price at its block, as the server
// stores it for every event block (/api/compound/prices-at, rails-server mig
// 372), a block not stored yet read from the archive
// (/api/chain/compound/prices-at-block); an absorb row carries its `usdValue`
// too. A row the reads did not reach takes the nearest priced row's price.
// Between events each asset is valued at the daily price store's price for
// the day (`cv3:<comet>:<asset>`, rails-ops reference/daily-prices.md), a day
// a row priced keeping the row's; without the store an asset keeps the price
// of its latest priced event. The base balance grows at the rate the market
// paid or charged until the next row (that row's interest over the balance
// and the time), and after the last row at the market's rate now.
//
// Pure: tested offline in scripts/verify/verify-compound-v3-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowSide, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents } from "@/lib/shared/flows-timeline";
import type { AssetBalance, FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, CompoundEventType } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-12;

/** Bucket keys. */
export const CV3 = {
  collIn: "cv3-coll-in",
  received: "cv3-received",
  supplied: "cv3-supplied",
  earned: "cv3-earned",
  credit: "cv3-credit",
  collOut: "cv3-coll-out",
  withdrawn: "cv3-withdrawn",
  sent: "cv3-sent",
  seized: "cv3-seized",
  borrowed: "cv3-borrowed",
  accrued: "cv3-accrued",
  borrowedSent: "cv3-borrowed-sent",
  repaid: "cv3-repaid",
  repaidReceived: "cv3-repaid-received",
  cleared: "cv3-cleared",
} as const;

type Key = (typeof CV3)[keyof typeof CV3];

/** The buckets that hold collateral assets, base supply, or base debt. */
const COLL_ONLY = new Set<string>([CV3.collIn, CV3.collOut, CV3.seized]);
const SUPPLY_ONLY = new Set<string>([CV3.supplied, CV3.earned, CV3.credit, CV3.withdrawn]);
/** Received and Sent by transfer hold collateral and lent base alike. */
const COLL_SIDE = new Set<string>([...COLL_ONLY, ...SUPPLY_ONLY, CV3.received, CV3.sent]);
const OUT_KEYS = new Set<string>([
  CV3.collOut,
  CV3.withdrawn,
  CV3.sent,
  CV3.seized,
  CV3.repaid,
  CV3.repaidReceived,
  CV3.cleared,
]);
/** Interest: not the event's act. */
const ACCRUAL_KEYS = new Set<string>([CV3.earned, CV3.accrued]);

/** The page's asset ids: each collateral token, and the base on each side. */
export const SUPPLY_ASSET = "base-supply";
export const DEBT_ASSET = "base-debt";
const collAsset = (token: string) => `coll:${token}`;

/** One row of a Comet position, in human units. */
export interface CompoundFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: CompoundEventType;
  isBase: boolean;
  /** The token the row moved (lowercased address), and its symbol. */
  token: string;
  symbol: string;
  /** The row's signed amount, in the token. */
  delta: number;
  /** The signed base balance after the row, where the row states it. */
  baseAfter: number | null;
  /** The interest since the previous row (> 0 earned, < 0 charged). */
  baseInterest: number;
  /** The same three in base units (10^-decimals), exact. */
  units: { delta: bigint; after: bigint | null; interest: bigint };
  /** True where the base balance is the logged amounts' running sum (a
   *  swept Base history): no interest is known before it. */
  baseUnsettled: boolean;
  /** A collateral row's balance of its asset after it. */
  collAfter: number | null;
  /** An absorb row's oracle value in dollars (its event's usdValue). */
  usdValue: number | null;
  /** Comet's oracle price per token address at the block, where read. */
  prices: Record<string, number> | null;
}

/** A decimal string in units of 10^-decimals, exact; null where it is not
 *  one. */
export function toUnits(v: unknown, decimals: number): bigint | null {
  if (v == null || v === "") return null;
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(v).trim());
  if (!m) return null;
  const frac = (m[3] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const u = BigInt((m[2] || "0") + frac);
  return m[1] === "-" ? -u : u;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The page's rows for one market as the replay reads them, oldest first;
 *  `prices` the oracle read at each block, by block. */
export function compoundFlowEvents(
  events: BaseActivityEvent[],
  baseToken: string,
  baseDecimals: number,
  prices?: Map<number, Record<string, number>> | null,
): CompoundFlowEvent[] {
  const rows = events.filter(isCompoundEvent);
  // The served order within a block is the chain's; a newest-first list is
  // turned round first, and the sort is stable.
  if (rows.length > 1 && rows[0].blockNumber > rows[rows.length - 1].blockNumber) rows.reverse();
  rows.sort((a, b) => a.blockNumber - b.blockNumber);
  const base = baseToken.toLowerCase();
  return rows.map((e) => {
    const c = e.context.data;
    const flow = e.flows?.find((f) => f.tokenSymbol === c.assetSymbol) ?? e.flows?.[0];
    const token = c.isBase ? base : (flow?.token ?? `symbol:${c.assetSymbol}`).toLowerCase();
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind: c.eventType,
      isBase: c.isBase,
      token,
      symbol: c.assetSymbol,
      delta: num(c.assetsDelta) ?? 0,
      baseAfter: num(c.baseAfter),
      baseInterest: num(c.baseInterest) ?? 0,
      units: {
        delta: c.isBase ? (toUnits(c.assetsDelta, baseDecimals) ?? BigInt(0)) : BigInt(0),
        after: toUnits(c.baseAfter, baseDecimals),
        interest: toUnits(c.baseInterest, baseDecimals) ?? BigInt(0),
      },
      baseUnsettled: c.baseUnsettled === true,
      collAfter: num(c.collateralAfter),
      usdValue: num(c.usdValue),
      prices: prices?.get(e.blockNumber) ?? null,
    };
  });
}

/** The blocks whose prices the replay needs read, newest first, each once,
 *  at most `cap`. */
export function compoundPriceBlocks(events: CompoundFlowEvent[], cap = 250): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = events.length - 1; i >= 0 && out.length < cap; i--) {
    const b = events[i].block;
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

/** Every token the rows moved: the base first, then each collateral asset. */
export function compoundAssets(events: CompoundFlowEvent[], baseToken: string): string[] {
  const out = [baseToken.toLowerCase()];
  for (const e of events) if (!e.isBase && !e.token.startsWith("symbol:") && !out.includes(e.token)) out.push(e.token);
  return out;
}

/** A replayed row's legs in tokens, by bucket. */
export interface CompoundReplayed {
  ev: CompoundFlowEvent;
  legs: { bucket: Key; amount: number; token: string; symbol: string }[];
  /** The signed base after the row, and each collateral asset's balance. */
  base: number;
  coll: Map<string, number>;
  /** Each token's price at the row (USD), and whether the row's block was
   *  read (or the row carried its own value) for it. */
  price: Record<string, number>;
  own: Set<string>;
  /** The base move since the previous row that no event states. */
  unlogged: number;
}

/** The per-row replay, in tokens. The base is replayed in its units, so
 *  each row's legs add to its recorded balance; a gap of up to two units is
 *  Comet's principal rounding: interest on a balance, nothing on a flat one. */
export function replayCompound(
  events: CompoundFlowEvent[],
  baseToken: string,
  baseSymbol: string,
  baseDecimals: number,
): CompoundReplayed[] {
  const base = baseToken.toLowerCase();
  const ZERO = BigInt(0);
  const ROUND = BigInt(2);
  const abs = (v: bigint) => (v < ZERO ? -v : v);
  const tokens = (u: bigint) => Number(u) / 10 ** baseDecimals;
  let bal = ZERO;
  const coll = new Map<string, number>();
  const symbols = new Map<string, string>([[base, baseSymbol]]);
  const out: CompoundReplayed[] = [];
  for (const ev of events) {
    if (!ev.isBase) symbols.set(ev.token, ev.symbol);
    const legs: CompoundReplayed["legs"] = [];
    const add = (bucket: Key, amount: number, token: string) => {
      if (Math.abs(amount) > DUST) legs.push({ bucket, amount, token, symbol: symbols.get(token) ?? token });
    };
    const addBase = (bucket: Key, units: bigint) => {
      if (units !== ZERO) add(bucket, tokens(units), base);
    };
    // A base move, split at zero: up repays the debt first, down draws the
    // supply first. A balance within the rounding of zero is zero.
    const move = (amount: bigint, up: [Key, Key], down: [Key, Key]) => {
      if (amount > ZERO) {
        const owed = -bal > ROUND ? -bal : ZERO;
        const repay = amount < owed ? amount : owed;
        addBase(up[0], repay);
        addBase(up[1], amount - repay);
      } else if (amount < ZERO) {
        const m = -amount;
        const lent = bal > ROUND ? bal : ZERO;
        const fromSupply = m < lent ? m : lent;
        addBase(down[0], fromSupply);
        addBase(down[1], m - fromSupply);
      }
      bal += amount;
    };
    let act = ev.isBase ? ev.units.delta : ZERO;
    const after = ev.units.after ?? bal + act;
    const gap = after - act - bal;
    let interest = ev.baseUnsettled ? ZERO : ev.units.interest;
    let unlogged = gap - interest;
    if (abs(unlogged) <= ROUND) {
      interest += unlogged;
      unlogged = ZERO;
    }
    if (abs(bal) <= ROUND && abs(interest) <= ROUND) {
      // Rounding on a flat balance: part of the row's act (the present value
      // of a supply rounds down), or no line where the row moved no base.
      if (ev.isBase) act += interest;
      else bal += interest;
      interest = ZERO;
    }
    // Interest: earned on a supply, charged on a debt.
    if (interest !== ZERO) {
      const lending = bal > ROUND || (bal >= -ROUND && interest > ZERO);
      if (lending) addBase(CV3.earned, interest);
      else addBase(CV3.accrued, -interest);
      bal += interest;
    }
    // A base move no event states: the account sent base by a transfer
    // (borrowing where it had no supply), or received it.
    move(unlogged, [CV3.repaidReceived, CV3.received], [CV3.sent, CV3.borrowedSent]);
    if (ev.isBase) {
      switch (ev.kind) {
        case "transfer_in":
        case "transfer_out":
          move(act, [CV3.repaidReceived, CV3.received], [CV3.sent, CV3.borrowedSent]);
          break;
        case "absorb_debt":
          move(act, [CV3.cleared, CV3.credit], [CV3.withdrawn, CV3.borrowed]);
          break;
        default:
          move(act, [CV3.repaid, CV3.supplied], [CV3.withdrawn, CV3.borrowed]);
      }
    } else {
      const before = coll.get(ev.token) ?? 0;
      const collAfter = ev.collAfter ?? Math.max(0, before + ev.delta);
      const d = collAfter - before;
      const into: Key =
        ev.kind === "absorb_collateral"
          ? CV3.seized
          : ev.kind === "transfer_collateral_in"
            ? CV3.received
            : ev.kind === "transfer_collateral_out"
              ? CV3.sent
              : d >= 0
                ? CV3.collIn
                : CV3.collOut;
      add(into, Math.abs(d), ev.token);
      coll.set(ev.token, collAfter);
    }
    // The recorded balance stands; the legs above add to it.
    bal = after;
    out.push({
      ev,
      legs,
      base: tokens(after),
      coll: new Map(coll),
      price: {},
      own: new Set(),
      unlogged: tokens(unlogged),
    });
  }
  priceRows(out, base);
  return out;
}

/** Each row's price for every token: its block's read, an absorb's own
 *  value, else the nearest priced row's (the last before, else the first
 *  after). */
function priceRows(rows: CompoundReplayed[], base: string) {
  const tokens = new Set<string>([base]);
  for (const r of rows) for (const t of r.coll.keys()) tokens.add(t);
  for (const r of rows) {
    for (const [t, p] of Object.entries(r.ev.prices ?? {}))
      if (p > 0 && tokens.has(t)) {
        r.price[t] = p;
        r.own.add(t);
      }
    if (r.ev.usdValue != null && r.ev.usdValue > 0 && Math.abs(r.ev.delta) > DUST && !r.own.has(r.ev.token)) {
      r.price[r.ev.token] = r.ev.usdValue / Math.abs(r.ev.delta);
      r.own.add(r.ev.token);
    }
  }
  for (const t of tokens) {
    let last: number | null = null;
    for (const r of rows) {
      if (r.own.has(t)) last = r.price[t];
      else if (last != null) r.price[t] = last;
    }
    let next: number | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.own.has(t)) next = r.price[t];
      else if (r.price[t] == null && next != null) r.price[t] = next;
    }
  }
}

/** Which bars the position draws: collateral, the lent base, the debt. */
export interface CompoundRoles {
  collateral: boolean;
  supply: boolean;
  debt: boolean;
}

export function compoundRoles(replayed: CompoundReplayed[], baseToken: string): CompoundRoles {
  const base = baseToken.toLowerCase();
  const r = { collateral: false, supply: false, debt: false };
  for (const x of replayed)
    for (const l of x.legs) {
      if (COLL_ONLY.has(l.bucket)) r.collateral = true;
      else if (SUPPLY_ONLY.has(l.bucket)) r.supply = true;
      else if (l.bucket === CV3.received || l.bucket === CV3.sent) {
        if (l.token === base) r.supply = true;
        else r.collateral = true;
      } else r.debt = true;
    }
  if (!r.collateral && !r.supply && !r.debt) r.supply = true;
  return r;
}

/** Two bars where the position held collateral or borrowed; one where it
 *  only lent. */
export const twoSided = (r: CompoundRoles) => r.collateral || r.debt;

/** The buckets the position fills, in drawing order. */
export function compoundFlowBuckets(roles: CompoundRoles, filled: Set<string>): FlowBucket[] {
  const mixed = roles.collateral && roles.supply;
  const all: FlowBucket[] = [
    { key: CV3.collIn, label: "Collateral deposited", event: "Supply collateral", side: "collateral", dir: "in" },
    {
      key: CV3.received,
      label: "Received by transfer",
      event: "Transfer in",
      side: "collateral",
      dir: "in",
      hatch: "grid",
    },
    {
      key: CV3.supplied,
      label: roles.collateral ? "Base supplied" : "Supplied",
      event: "Supply",
      side: "collateral",
      dir: "in",
      ...(roles.collateral ? { hatch: "checker" as const } : {}),
    },
    // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md).
    { key: CV3.earned, label: "Interest earned", event: "", side: "collateral", dir: "in", hatch: "dashes" },
    {
      key: CV3.credit,
      label: "Left over after the absorb",
      event: "Absorb",
      side: "collateral",
      dir: "in",
      hatch: "horizontal",
      link: "liquidation",
    },
    {
      key: CV3.collOut,
      label: "Collateral withdrawn",
      event: "Withdraw collateral",
      side: "collateral",
      dir: "out",
    },
    {
      key: CV3.withdrawn,
      label: mixed ? "Base withdrawn" : "Withdrawn",
      event: "Withdraw",
      side: "collateral",
      dir: "out",
      ...(mixed ? { hatch: "cross" as const } : {}),
    },
    {
      key: CV3.sent,
      label: "Sent by transfer",
      event: "Transfer out",
      side: "collateral",
      dir: "out",
      hatch: "dots",
    },
    {
      key: CV3.seized,
      label: "Seized by the absorb",
      event: "Absorb",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
    { key: CV3.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
    { key: CV3.accrued, label: "Interest accrued", event: "", side: "debt", dir: "in", hatch: "dashes" },
    {
      key: CV3.borrowedSent,
      label: "Borrowed to send by transfer",
      event: "Transfer out",
      side: "debt",
      dir: "in",
      hatch: "grid",
    },
    { key: CV3.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
    {
      key: CV3.repaidReceived,
      label: "Repaid by a transfer in",
      event: "Transfer in",
      side: "debt",
      dir: "out",
      hatch: "dots",
    },
    {
      key: CV3.cleared,
      label: "Cleared by the absorb",
      event: "Absorb",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
  const two = twoSided(roles);
  return all.filter((b) => filled.has(b.key) || (two && b.key === CV3.borrowed) || (!two && b.key === CV3.supplied));
}

/** The rate (a fraction a year) a balance grew at between two rows. */
function rateBetween(interest: number, balance: number, dt: number): number {
  return balance > DUST && dt > 0 ? interest / balance / (dt / ONE_YEAR_S) : 0;
}

/** What the page's live read states now, where it has one. */
export interface CompoundLive {
  /** The signed base now (balanceOf − borrowBalanceOf). */
  base: number;
  /** Each collateral asset held now, by token address. */
  coll: Record<string, number>;
  /** Comet's oracle price now, USD per token, by token address. */
  prices: Record<string, number>;
  /** The market's rates now, fractions a year. */
  supplyApr?: number | null;
  borrowApr?: number | null;
}

export interface CompoundFlowOptions {
  baseToken: string;
  baseSymbol: string;
  baseDecimals: number;
  /** Unix seconds now; the page's clock. */
  now: number;
  live: CompoundLive | null;
  /** A daily price per token (lowercase address, the base among them), [UTC
   *  day, USD] ascending, from the shared daily price store: each completed
   *  day no row priced takes it. */
  dailyPrices?: Record<string, [number, number][]>;
}

/** The replay with the rates between rows, for the timeline, the cards and
 *  the tests. */
export interface CompoundFlowReplay {
  replayed: CompoundReplayed[];
  roles: CompoundRoles;
  /** Per row, the supply's and the debt's rate (fractions a year) from that
   *  row to the next; the last row's is the market's rate now. */
  supplyRate: number[];
  borrowRate: number[];
  base: string;
  symbols: Map<string, string>;
  /** Two units of the base: Comet's principal rounding. */
  dust: number;
}

export function compoundFlowReplay(events: CompoundFlowEvent[], o: CompoundFlowOptions): CompoundFlowReplay {
  const replayed = replayCompound(events, o.baseToken, o.baseSymbol, o.baseDecimals);
  const roles = compoundRoles(replayed, o.baseToken);
  const supplyRate: number[] = [];
  const borrowRate: number[] = [];
  for (let i = 0; i < replayed.length; i++) {
    const r = replayed[i];
    const next = replayed[i + 1];
    if (!next) {
      supplyRate.push(o.live?.supplyApr ?? (i > 0 ? supplyRate[i - 1] : 0));
      borrowRate.push(o.live?.borrowApr ?? (i > 0 ? borrowRate[i - 1] : 0));
      continue;
    }
    const dt = next.ev.ts - r.ev.ts;
    const earned = next.legs.filter((l) => l.bucket === CV3.earned).reduce((a, l) => a + l.amount, 0);
    const accrued = next.legs.filter((l) => l.bucket === CV3.accrued).reduce((a, l) => a + l.amount, 0);
    // A gap with no time (two rows in one block) keeps the rate before it.
    supplyRate.push(dt > 0 ? Math.max(0, rateBetween(earned, Math.max(0, r.base), dt)) : (supplyRate[i - 1] ?? 0));
    borrowRate.push(dt > 0 ? Math.max(0, rateBetween(accrued, Math.max(0, -r.base), dt)) : (borrowRate[i - 1] ?? 0));
  }
  const symbols = new Map<string, string>([[o.baseToken.toLowerCase(), o.baseSymbol]]);
  for (const r of replayed) if (!r.ev.isBase) symbols.set(r.ev.token, r.ev.symbol);
  return {
    replayed,
    roles,
    supplyRate,
    borrowRate,
    base: o.baseToken.toLowerCase(),
    symbols,
    dust: 2 * 10 ** -o.baseDecimals,
  };
}

/** The growth factor of a balance `dt` seconds after its row, at `rate`. */
const grow = (rate: number, dt: number) => 1 + rate * (Math.max(0, dt) / ONE_YEAR_S);

/** A leg's dollars: the token at the row's price. */
const legUsd = (r: CompoundReplayed, l: CompoundReplayed["legs"][number]) => l.amount * (r.price[l.token] ?? 0);

/** Whether the position still holds or owes anything after a row. */
function holds(r: CompoundReplayed, dust: number): boolean {
  if (Math.abs(r.base) > dust) return true;
  for (const v of r.coll.values()) if (v > DUST) return true;
  return false;
}

/** The position's rows as the Lifetime flows panel's timeline, in USD. Null
 *  with no rows. */
export function compoundFlowTimeline(events: CompoundFlowEvent[], o: CompoundFlowOptions): FlowTimeline | null {
  if (events.length === 0) return null;
  const rp = compoundFlowReplay(events, o);
  const { replayed, roles, base } = rp;
  const filled = new Set<string>();
  for (const r of replayed) for (const l of r.legs) filled.add(l.bucket);
  const buckets = compoundFlowBuckets(roles, filled);
  const dust = rp.dust;
  const collTokens = new Set<string>();
  for (const r of replayed) for (const t of r.coll.keys()) collTokens.add(t);

  // The base's index on each side, implied by the rows: a balance between two
  // rows is the earlier balance's principal at the later index, so its
  // interest over the earlier balance is the index's growth. 1 at the first
  // row; a balance recorded at a row carries that row's index, and a later
  // day grows it (FlowTimeline.indexes).
  const sIdx: number[] = [];
  const bIdx: number[] = [];
  {
    let si = 1;
    let bi = 1;
    replayed.forEach((r, i) => {
      const prev = replayed[i - 1];
      if (prev) {
        const earned = r.legs.filter((l) => l.bucket === CV3.earned).reduce((a, l) => a + l.amount, 0);
        const accrued = r.legs.filter((l) => l.bucket === CV3.accrued).reduce((a, l) => a + l.amount, 0);
        if (prev.base > rp.dust) si *= 1 + earned / prev.base;
        if (-prev.base > rp.dust) bi *= 1 + accrued / -prev.base;
      }
      sIdx.push(si);
      bIdx.push(bi);
    });
  }
  const flowEvents: FlowEvent[] = replayed.map((r, i) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      if (COLL_SIDE.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const balances: FlowEvent["balances"] = [
      { asset: SUPPLY_ASSET, symbol: o.baseSymbol, side: "collateral", amount: Math.max(0, r.base), index: sIdx[i] },
      { asset: DEBT_ASSET, symbol: o.baseSymbol, side: "debt", amount: Math.max(0, -r.base), index: bIdx[i] },
    ];
    if (!r.ev.isBase)
      balances.push({
        asset: collAsset(r.ev.token),
        symbol: r.ev.symbol,
        side: "collateral",
        amount: Math.max(0, r.coll.get(r.ev.token) ?? 0),
      });
    const prices: FlowEvent["prices"] = [];
    for (const t of r.own)
      if (t !== base) prices.push({ asset: collAsset(t), usd: r.price[t] });
      else prices.push({ asset: SUPPLY_ASSET, usd: r.price[t] }, { asset: DEBT_ASSET, usd: r.price[t] });
    const absorb = r.ev.kind === "absorb_debt" || r.ev.kind === "absorb_collateral";
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick: absorb ? "liquidation" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      legs: r.legs.map((l) => ({ bucket: l.bucket, usd: legUsd(r, l), symbol: l.symbol })),
      tx: r.ev.tx,
      countsTx: !absorb && r.ev.kind !== "transfer_in" && r.ev.kind !== "transfer_collateral_in",
      balances,
      prices,
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = holds(last, dust);
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const endDay = open ? Math.max(today, Math.floor(last.ev.ts / DAY_S) + 1) : Math.floor(last.ev.ts / DAY_S) + 1;
  const li = replayed.length - 1;
  const sinceLast = o.now - last.ev.ts;
  // Now: the live read where the page has one, else the last row grown at
  // the market's rate.
  const nowSupply = !open
    ? 0
    : o.live
      ? Math.max(0, o.live.base)
      : Math.max(0, last.base) * grow(rp.supplyRate[li], sinceLast);
  const nowDebt = !open
    ? 0
    : o.live
      ? Math.max(0, -o.live.base)
      : Math.max(0, -last.base) * grow(rp.borrowRate[li], sinceLast);
  const priceNow = (t: string) => {
    const p = o.live?.prices[t];
    return p != null && p > 0 ? p : (last.price[t] ?? 0);
  };
  const nowColl = (t: string) => (!open ? 0 : o.live ? (o.live.coll[t] ?? 0) : (last.coll.get(t) ?? 0));

  // The daily store's prices, where it has them: a day a row priced keeps
  // the row's (the cards and the bars agree on an event's day).
  const storeDays = (t: string, obs: Map<number, number>) => {
    const rowDays = new Set(obs.keys());
    for (const [d, p] of o.dailyPrices?.[t] ?? []) if (p > 0 && !rowDays.has(d) && d < today) obs.set(d, p);
  };
  // Each collateral asset's price on each day a row priced it, the store's
  // between, and today's.
  const dailyPrices: Record<string, [number, number][]> = {};
  for (const t of collTokens) {
    const obs = new Map<number, number>();
    for (const r of replayed) if (r.own.has(t)) obs.set(Math.floor(r.ev.ts / DAY_S), r.price[t]);
    // Days before the first priced row take its price, as their flows do.
    const first = replayed.find((r) => r.price[t] != null);
    if (first && ![...obs.keys()].some((d) => d <= firstDay)) obs.set(firstDay, first.price[t]);
    storeDays(t, obs);
    if (open && (o.live?.prices[t] ?? 0) > 0) obs.set(today, o.live!.prices[t]);
    dailyPrices[collAsset(t)] = [...obs].sort((a, b) => a[0] - b[0]);
  }
  // The base's price: each day a row priced it, the store's between, and
  // today's. Its index each day: the last row's, grown at the rate since to
  // the day's end; today's meets the live read.
  const baseObs = new Map<number, number>();
  for (const r of replayed) if (r.own.has(base)) baseObs.set(Math.floor(r.ev.ts / DAY_S), r.price[base]);
  const firstBase = replayed.find((r) => r.price[base] != null);
  if (firstBase && ![...baseObs.keys()].some((d) => d <= firstDay)) baseObs.set(firstDay, firstBase.price[base]);
  storeDays(base, baseObs);
  if (open && (o.live?.prices[base] ?? 0) > 0) baseObs.set(today, o.live!.prices[base]);
  const baseSeries = [...baseObs].sort((a, b) => a[0] - b[0]);
  dailyPrices[SUPPLY_ASSET] = baseSeries;
  dailyPrices[DEBT_ASSET] = baseSeries;
  const indexRows: [number, number | null, number | null][] = [];
  let ei = -1;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].ev.ts <= end) ei++;
    if (ei < 0) continue;
    const r = replayed[ei];
    const isNow = d === today && open && ei === li;
    const s0 = Math.max(0, r.base);
    const b0 = Math.max(0, -r.base);
    indexRows.push([
      d,
      sIdx[ei] * (isNow && s0 > dust ? nowSupply / s0 : grow(rp.supplyRate[ei], end - r.ev.ts)),
      bIdx[ei] * (isNow && b0 > dust ? nowDebt / b0 : grow(rp.borrowRate[ei], end - r.ev.ts)),
    ]);
  }

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  let collUsd = 0;
  if (open) {
    for (const t of collTokens) {
      const a = nowColl(t);
      if (!(a > DUST)) continue;
      const usd = a * priceNow(t);
      collUsd += usd;
      assets.push({ side: "collateral", symbol: rp.symbols.get(t) ?? t, amount: a, usd });
    }
    if (nowSupply > dust) {
      const usd = nowSupply * priceNow(base);
      collUsd += usd;
      assets.push({ side: "collateral", symbol: o.baseSymbol, amount: nowSupply, usd });
    }
    if (nowDebt > dust)
      assets.push({ side: "debt", symbol: o.baseSymbol, amount: nowDebt, usd: nowDebt * priceNow(base) });
  }
  const todayPrices: Record<string, number> = {
    [SUPPLY_ASSET]: priceNow(base),
    [DEBT_ASSET]: priceNow(base),
  };
  for (const t of collTokens) todayPrices[collAsset(t)] = priceNow(t);

  return {
    buckets,
    days,
    live: {
      collateralUsd: collUsd,
      debtUsd: open ? nowDebt * priceNow(base) : 0,
      assets,
    },
    todayPrices,
    dailyPrices,
    seriesCarry: true,
    indexes: { basis: "comet", assets: { [SUPPLY_ASSET]: indexRows, [DEBT_ASSET]: indexRows } },
    today: open ? today : endDay,
    labels: {
      collateral: twoSided(roles) ? (roles.supply ? "Collateral and supply" : "Collateral") : "Supplied",
      debt: "Debt",
    },
    words: compoundFlowWords(o.baseSymbol, roles, o.dailyPrices ? "store" : "carried"),
  };
}

/** The panel's words for a Comet position. */
export function compoundFlowWords(
  baseSymbol: string,
  roles: CompoundRoles,
  between: "store" | "carried" = "carried",
): NonNullable<FlowTimeline["words"]> {
  // The price a balance is held at between events: the daily store's for the
  // day, or without it the latest event's.
  const heldAt =
    between === "store" ? "at Comet's oracle price at the end of the day" : "at the oracle price of the latest event";
  const two = twoSided(roles);
  const collRest = two
    ? roles.supply
      ? "Market move and interest since the last event"
      : "Market move"
    : "Market move and interest since the last event";
  const collNote = two
    ? roles.supply
      ? `the change in each asset's oracle price since its flows, and the interest the lent ${baseSymbol} earned since the last event`
      : "the change in each asset's oracle price since its flows"
    : `the interest the ${baseSymbol} earned at the market's rate since the position's last event, and the change in its oracle price since each flow`;
  const supplyBasis = `the ${baseSymbol} lent after the last event by then, grown at the rate the market paid until its next event (after the last, its supply rate now), ${heldAt}`;
  const collBasis =
    between === "store"
      ? "each asset held after the last event by then, at Comet's oracle price at the end of the day"
      : "each asset held after the last event by then, at Comet's oracle price of the latest event that priced it";
  return {
    held: two ? "Still deposited" : "Still supplied",
    restBySide: {
      collateral: collRest,
      ...(two ? { debt: "Market move and interest since the last event" } : {}),
    },
    restNote: {
      collateral: collNote,
      debt: `the interest built up on the ${baseSymbol} owed at the market's rate since the position's last event, and the change in its oracle price since each flow`,
    },
    basis: {
      collateral: "Each flow is valued at Comet's oracle price at its block.",
      debt: "Each flow is valued at Comet's oracle price at its block.",
    },
    heldBasis: {
      collateral: two ? (roles.supply ? `${collBasis}; with it, ${supplyBasis}.` : `${collBasis}.`) : `${supplyBasis}.`,
      debt: `the ${baseSymbol} owed after the last event by then, grown at the rate the market charged until its next event (after the last, its borrow rate now), ${heldAt}.`,
    },
    linePrices: two
      ? between === "store"
        ? `in USD, with each asset at Comet's oracle price at the end of the day and the ${baseSymbol} balance grown at the market's rate since the last event`
        : `in USD, with each asset at Comet's oracle price of its latest priced event and the ${baseSymbol} balance grown at the market's rate since the last event`
      : `in USD, with the ${baseSymbol} supplied grown at the market's rate since the last event, ${heldAt}`,
    moment: {
      noPrice: {
        collateral: "No oracle price is recorded for this day, so the collateral is stated in tokens.",
      },
      notes: [],
    },
  };
}

/** Each side's assets once a transaction had run, in tokens, with the
 *  prices at its last row, and their dollars. */
function sideAt(
  rp: CompoundFlowReplay,
  r: CompoundReplayed | null,
  side: FlowSide,
): { symbol: string; amount: number; price: number }[] {
  if (!r) return [];
  const out: { symbol: string; amount: number; price: number }[] = [];
  if (side === "collateral") {
    for (const [t, a] of r.coll)
      out.push({ symbol: rp.symbols.get(t) ?? t, amount: Math.max(0, a), price: r.price[t] ?? 0 });
    out.push({ symbol: rp.symbols.get(rp.base) ?? "", amount: Math.max(0, r.base), price: r.price[rp.base] ?? 0 });
  } else
    out.push({ symbol: rp.symbols.get(rp.base) ?? "", amount: Math.max(0, -r.base), price: r.price[rp.base] ?? 0 });
  return out;
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in dollars and in tokens, ascending, the legs the day rows
 *  add up. Each side's dollars just before and once the row's transaction had
 *  run are its assets at the transaction's last row's prices. */
export function compoundFocusEvents(rp: CompoundFlowReplay): FocusEvent[] {
  const { replayed, roles } = rp;
  const byTx = txGroups(replayed);
  return replayed.map((r, i) => {
    const tx = byTx.get(r.ev.tx ?? r.ev.id) ?? [r];
    const lastOf = tx[tx.length - 1];
    const firstIdx = replayed.indexOf(tx[0]);
    const prior = firstIdx > 0 ? replayed[firstIdx - 1] : null;
    const usdOf = (assets: { amount: number; price: number }[]) => assets.reduce((a, x) => a + x.amount * x.price, 0);
    const side = (s: FlowSide) => {
      const after = sideAt(rp, lastOf, s);
      // Before the transaction, at its prices.
      const before = sideAt(rp, prior, s).map((x) => ({
        ...x,
        price: after.find((y) => y.symbol === x.symbol)?.price ?? x.price,
      }));
      const baseSym = rp.symbols.get(rp.base) ?? "";
      const held = s === "debt" ? Math.max(0, -lastOf.base) : Math.max(0, lastOf.base);
      const was = s === "debt" ? Math.max(0, -(prior?.base ?? 0)) : Math.max(0, prior?.base ?? 0);
      return { before: usdOf(before), after: usdOf(after), amount: held - was, symbol: baseSym, held };
    };
    const rate = twoSided(roles) ? rp.borrowRate[i] : rp.supplyRate[i];
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      legs: r.legs.map((l) => ({
        bucket: l.bucket,
        usd: legUsd(r, l),
        amount: l.amount,
        symbol: l.symbol,
        ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
      })),
      sides: { collateral: side("collateral"), debt: side("debt") },
      rate: rate * 100,
    };
  });
}

function txGroups(replayed: CompoundReplayed[]): Map<string, CompoundReplayed[]> {
  const byTx = new Map<string, CompoundReplayed[]>();
  for (const r of replayed) {
    const k = r.ev.tx ?? r.ev.id;
    const list = byTx.get(k);
    if (list) list.push(r);
    else byTx.set(k, [r]);
  }
  return byTx;
}

/** A side's assets once the event's transaction had run and just before it,
 *  in tokens, at the prices of the transaction's last row: what the card's
 *  ledger lands on (lib/shared/flow-focus.ts `eventAssetSum`). Null where the
 *  replay does not hold the event. */
export function compoundSideBalances(
  rp: CompoundFlowReplay,
  eventId: string,
  side: FlowSide,
): { balances: AssetBalance[]; held: number; heldBefore: number } | null {
  const at = rp.replayed.findIndex((r) => r.ev.id === eventId);
  if (at < 0) return null;
  const r = rp.replayed[at];
  const tx = txGroups(rp.replayed).get(r.ev.tx ?? r.ev.id) ?? [r];
  const lastOf = tx[tx.length - 1];
  const firstIdx = rp.replayed.indexOf(tx[0]);
  const prior = firstIdx > 0 ? rp.replayed[firstIdx - 1] : null;
  const after = sideAt(rp, lastOf, side);
  const before = sideAt(rp, prior, side);
  const symbols = [...new Set([...after, ...before].map((x) => x.symbol))];
  const balances: AssetBalance[] = [];
  for (const s of symbols) {
    const a = after.find((x) => x.symbol === s);
    const b = before.find((x) => x.symbol === s);
    if (!((a?.amount ?? 0) > DUST) && !((b?.amount ?? 0) > DUST)) continue;
    balances.push({ symbol: s, amount: a?.amount ?? 0, before: b?.amount ?? 0, price: a?.price ?? b?.price ?? null });
  }
  const held = balances.reduce((acc, x) => acc + x.amount * (x.price ?? 0), 0);
  const heldBefore = balances.reduce((acc, x) => acc + x.before * (x.price ?? 0), 0);
  return { balances, held, heldBefore };
}

/** What the Explanation counts. */
export interface CompoundFlowFacts {
  roles: CompoundRoles;
  /** Rows valued at their block's prices, and at the nearest priced row's. */
  priced: number;
  nearest: number;
  /** Absorbs (AbsorbDebt rows), and those that left base lent. */
  absorbs: number;
  credits: number;
  /** Rows with a base move no event states. */
  unlogged: number;
  /** Rows whose base balance is the logged amounts' sum (no interest known). */
  unsettled: number;
  /** Transfers in and out, of collateral or base. */
  transfers: number;
  /** "store": days between events at the daily store's price; "carried":
   *  each asset keeps its latest event's. */
  between: "store" | "carried";
}

export function compoundFlowFacts(rp: CompoundFlowReplay, between: "store" | "carried" = "carried"): CompoundFlowFacts {
  const rows = rp.replayed;
  const nearest = rows.filter((r) => r.legs.length > 0 && r.legs.some((l) => !r.own.has(l.token))).length;
  return {
    roles: rp.roles,
    priced: rows.filter((r) => r.legs.length > 0).length - nearest,
    nearest,
    absorbs: rows.filter((r) => r.ev.kind === "absorb_debt").length,
    credits: rows.filter((r) => r.legs.some((l) => l.bucket === CV3.credit)).length,
    unlogged: rows.filter((r) => r.unlogged !== 0).length,
    unsettled: rows.filter((r) => r.ev.baseUnsettled).length,
    transfers: rows.filter((r) =>
      r.legs.some((l) => [CV3.received, CV3.sent, CV3.borrowedSent, CV3.repaidReceived].includes(l.bucket as never)),
    ).length,
    between,
  };
}
