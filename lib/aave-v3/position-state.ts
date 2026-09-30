// The position state of an Aave V3 Ethereum account around one event's
// transaction — the wire shape of /api/aave-v3/timeline/position-state and the
// arithmetic the open card does on it (rails-ops TO-DO-ui-jobs §19).
// ----------------------------------------------------------------------------
// Balances are exact integers as strings, in the reserve's own units; prices are
// the market oracle's base currency (USD, 8 decimals on Aave V3 Ethereum); ratios
// are basis points; the health factor is a wad. Every figure stays a bigint until
// the one step that makes a display number, so nothing exact is rebuilt from a
// rounded float.
//
// Client-safe: no RPC, no server imports.

import { formatUnitsExact } from "@/lib/utils/format";

/** One side of one reserve, before and after the event's transaction. */
export interface AaveV3PositionStateLeg {
  /** Balance in underlying units, interest to the block's timestamp included. */
  before: string;
  after: string;
  /** Σ scaled deltas ordered by (block, tx index): strictly before the
   *  transaction, and through it. */
  scaledBefore: string;
  scaledAfter: string;
  /** The reserve index accrued to the block timestamp (ray). */
  index: string;
  /** The ReserveDataUpdated row the index was accrued from. */
  rduBlock: number;
  rduTxHash: string;
  rduTimestamp: number;
  /** The rate that row carried (ray): liquidity rate on supply, variable
   *  borrow rate on debt. */
  rate: string;
}

export interface AaveV3PositionStateReserve {
  /** Underlying token, lowercase. */
  reserve: string;
  symbol: string | null;
  decimals: number | null;
  supply: AaveV3PositionStateLeg;
  debt: AaveV3PositionStateLeg;
  /** Null where the collateral flags are not known at this block. */
  collateral: { before: boolean; after: boolean } | null;
  /** Oracle price at the block, in base units (8 decimals). */
  priceBase: string | null;
  ltvBps: number | null;
  liquidationThresholdBps: number | null;
  /** The reserve belongs to the wallet's eMode category at this block. */
  inEmode: boolean | null;
  /** The reserve's liquidation bonus (10500 = 5% on top of the debt's value)
   *  and the protocol's share of that bonus, both in bps, from its
   *  configuration at the end of block N−1: what a liquidation in this
   *  transaction paid. Set by the chain-at-block lane only. */
  liquidationBonusBps?: number | null;
  liquidationProtocolFeeBps?: number | null;
}

export interface AaveV3EmodeCategory {
  label: string | null;
  ltvBps: number;
  liquidationThresholdBps: number;
  /** The category's liquidation bonus (bps, 10100 = 1%), where the read carries it. */
  liquidationBonusBps?: number | null;
  priceSource: string | null;
  generation: "bitmap" | "legacy";
}

export interface AaveV3AccountSide {
  totalCollateralBase: string;
  totalDebtBase: string;
  ltvBps: number;
  liquidationThresholdBps: number;
  /** Wad; null when the account has no debt. */
  healthFactor: string | null;
}

export interface AaveV3PositionState {
  wallet: string;
  market: string;
  marketKey: string;
  block: number;
  txHash: string;
  txIndex: number;
  blockTimestamp: number;
  /** Settings and market reads both present. */
  complete: boolean;
  reserves: AaveV3PositionStateReserve[];
  /** Category id before and after (0 = none); null where settings are unknown. */
  emode: { before: number; after: number; categories: Record<string, AaveV3EmodeCategory> } | null;
  /** Null unless complete. */
  account: { before: AaveV3AccountSide; after: AaveV3AccountSide } | null;
  sources: {
    /** "chain-read-at-block": the Base lane, read from the chain at the end
     *  of blocks N−1 and N (lib/sources/chain/aave-v3-position-state-at-block). */
    balances: "scaled-deltas" | "chain-read-at-block";
    settings: "pool-events" | "chain-read-at-block" | null;
    market: "chain-read-at-block" | null;
    marketReadBlock: number | null;
    poolRevision: number | null;
  };
  /** Machine codes, e.g. `negative_scaled_sum:0x…:debt`. */
  notes: string[];
}

const TEN = BigInt(10);
const ZERO = BigInt(0);
const pow10 = (n: number): bigint => TEN ** BigInt(Math.max(0, n));

/** An integer string as a bigint; anything unreadable is zero. */
export function big(s: string | null | undefined): bigint {
  if (s == null || s === "") return ZERO;
  try {
    return BigInt(s.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** The leg held anything on either side of the transaction. */
export const legHeld = (leg: AaveV3PositionStateLeg | null | undefined): boolean =>
  !!leg && (big(leg.before) > ZERO || big(leg.after) > ZERO);

/** Exact decimal string of a raw amount: "1234500000" at 6 → "1234.5". */
export const humanOf = (raw: string, decimals: number): string => formatUnitsExact(raw, decimals);

/** An exact decimal string with its integer part grouped: "1234567.5" →
 *  "1,234,567.5". The receipt's exact figure, never rounded. */
export function groupExact(human: string): string {
  const neg = human.startsWith("-");
  const [int, frac] = (neg ? human.slice(1) : human).split(".");
  return `${neg ? "−" : ""}${big(int).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** A raw reserve amount valued at an oracle price in base units:
 *  raw × price ÷ 10^(decimals + 8), kept to four decimals of a dollar before it
 *  leaves bigint. */
export function rawToUsd(raw: string, priceBase: string, decimals: number): number {
  return Number((big(raw) * big(priceBase)) / pow10(decimals + 4)) / 1e4;
}

/** Base-currency units (8 decimals) to dollars. */
export const baseToUsd = (base: string): number => Number(big(base) / pow10(4)) / 1e4;

/** A wad (18 decimals) to a number, four decimals kept. */
export const wadToNumber = (wad: string): number => Number(big(wad) / pow10(14)) / 1e4;

/** Basis points as a percentage: 8050 → "80.50%". */
export const bpsPct = (bps: number): string => `${(bps / 100).toFixed(2)}%`;

/** after − before of one leg: its sign and exact magnitude in the reserve's units. */
export function legChange(
  leg: AaveV3PositionStateLeg,
  decimals: number,
): { raw: bigint; sign: -1 | 0 | 1; magnitude: string } {
  const raw = big(leg.after) - big(leg.before);
  const sign = raw > ZERO ? 1 : raw < ZERO ? -1 : 0;
  const abs = raw < ZERO ? -raw : raw;
  return { raw: abs, sign, magnitude: humanOf(abs.toString(), decimals) };
}

/** The reserve a card names, by its address, else by its symbol where exactly
 *  one reserve carries it. */
export function findReserve(
  state: AaveV3PositionState,
  address: string | undefined,
  symbol: string | undefined,
): AaveV3PositionStateReserve | undefined {
  if (address) {
    const hit = state.reserves.find((r) => r.reserve.toLowerCase() === address.toLowerCase());
    if (hit) return hit;
  }
  if (!symbol) return undefined;
  const named = state.reserves.filter((r) => r.symbol === symbol);
  return named.length === 1 ? named[0] : undefined;
}

/** One reserve leg read against the previous event: its balance once the
 *  previous transaction had run, and the interest it accrued from there to
 *  immediately before this one (this before − previous after). Undefined where
 *  the previous read is missing or the same transaction, the reserve is not in
 *  either answer, or the gap is negative. */
export function sincePrevious(
  here: AaveV3PositionState,
  prev: AaveV3PositionState | undefined,
  reserve: string | undefined,
  side: "supply" | "debt",
): { prevAfter: string; interest: string } | undefined {
  if (!prev || !reserve || prev.txHash.toLowerCase() === here.txHash.toLowerCase()) return undefined;
  const a = reserve.toLowerCase();
  const h = here.reserves.find((r) => r.reserve.toLowerCase() === a);
  const p = prev.reserves.find((r) => r.reserve.toLowerCase() === a);
  if (!h || h.decimals == null) return undefined;
  const prevAfterRaw = p ? big((side === "supply" ? p.supply : p.debt).after) : ZERO;
  const gap = big((side === "supply" ? h.supply : h.debt).before) - prevAfterRaw;
  if (gap < ZERO) return undefined;
  return { prevAfter: humanOf(prevAfterRaw.toString(), h.decimals), interest: humanOf(gap.toString(), h.decimals) };
}

/** Nothing supplied and nothing owed once the transaction had run. */
export const stateEmptyAfter = (state: AaveV3PositionState): boolean =>
  state.reserves.every((r) => big(r.supply.after) === ZERO && big(r.debt.after) === ZERO);

/** How the card names an eMode category: "None" for 0, the category's own label
 *  where the at-block read carries one, else its id. */
export function emodeName(state: AaveV3PositionState, id: number): string {
  if (id === 0) return "None";
  const label = state.emode?.categories[String(id)]?.label;
  return label ? label : `Category ${id}`;
}

/** A health factor to four decimals, rounded down under 1 so a liquidatable
 *  account never reads 1.0000. */
export const hf4 = (hf: number): string => (hf < 1 ? (Math.floor(hf * 1e4 + 1e-9) / 1e4).toFixed(4) : hf.toFixed(4));

/** The Aave V3 family's health factor, one format on the event tiles, the
 *  prose and the card: four decimals below 1.1 (rounded down under 1), two
 *  above; ">100" past the cap and "∞" with no debt. */
export function hfLabelV3(hf: number | null): string {
  if (hf == null) return "∞";
  if (hf >= 100) return ">100";
  return hf < 1.1 ? hf4(hf) : hf.toFixed(2);
}

/** One thing that moved the health factor between two events with no
 *  transaction by the account, and its share of the move. */
export interface HfMovePart {
  kind: "price" | "prices" | "debt-interest" | "supply-interest" | "threshold";
  /** price: the asset and its oracle price at the two ends. */
  symbol?: string;
  from?: number;
  to?: number;
  /** Interest: the amount each reserve's balance grew by. */
  amounts?: { symbol: string; amount: number }[];
  /** threshold: the collateral whose threshold changed (one), the change in
   *  percent, and whether an e-mode switch made it. */
  thresholds?: { symbol: string; from: number; to: number }[];
  emodeSwitch?: boolean;
  /** Its share of the move, in health-factor units (Shapley value: the
   *  average over every order of applying the changes, so the shares add up
   *  to the whole move whatever the order). */
  delta: number;
}

/** What moved the health factor from the account after the previous event
 *  (`prev`, end of its block) to just before this one (`here`: the balances
 *  at the end of N−1 at block N's oracle prices, the basis a liquidation in N
 *  ran at). Each change — one asset's price, interest on the debt, interest on
 *  the collateral, a threshold — gets its signed share and the shares add up
 *  to the whole move. Null where a price is missing, either end has no debt,
 *  or a balance fell between the two (a move the account made). */
export function hfMoveParts(
  prev: AaveV3PositionState,
  here: AaveV3PositionState,
): { from: number; to: number; parts: HfMovePart[] } | null {
  const catLt = (s: AaveV3PositionState, id: number | undefined): number | null =>
    id && id > 0 ? (s.emode?.categories[String(id)]?.liquidationThresholdBps ?? null) : null;
  const prevCat = catLt(prev, prev.emode?.after);
  const hereCat = catLt(here, here.emode?.before);
  type Row = {
    symbol: string;
    coll: boolean;
    s: [number, number];
    d: [number, number];
    px: [number, number];
    lt: [number, number];
  };
  const rows: Row[] = [];
  const addrs = new Set([...prev.reserves, ...here.reserves].map((r) => r.reserve.toLowerCase()));
  for (const a of addrs) {
    const p = prev.reserves.find((r) => r.reserve.toLowerCase() === a);
    const h = here.reserves.find((r) => r.reserve.toLowerCase() === a);
    const dec = h?.decimals ?? p?.decimals;
    if (dec == null) return null;
    const s: [number, number] = [
      p ? Number(humanOf(p.supply.after, dec)) : 0,
      h ? Number(humanOf(h.supply.before, dec)) : 0,
    ];
    const d: [number, number] = [
      p ? Number(humanOf(p.debt.after, dec)) : 0,
      h ? Number(humanOf(h.debt.before, dec)) : 0,
    ];
    if (s[0] + s[1] + d[0] + d[1] === 0) continue;
    // A balance that fell moved by a transaction, not by the market.
    if (s[1] < s[0] - 1e-12 || d[1] < d[0] - 1e-12) return null;
    const pxP = p?.priceBase ?? h?.priceBase;
    const pxH = h?.priceBase ?? p?.priceBase;
    if (pxP == null || pxH == null) return null;
    const ltOf = (r: AaveV3PositionStateReserve | undefined, cat: number | null): number =>
      r ? (r.inEmode && cat != null ? cat : (r.liquidationThresholdBps ?? 0)) : 0;
    const ltP = p ? ltOf(p, prevCat) : ltOf(h, hereCat);
    const ltH = h ? ltOf(h, hereCat) : ltP;
    const coll = h?.collateral ? h.collateral.before : !!p?.collateral?.after;
    rows.push({
      symbol: h?.symbol ?? p?.symbol ?? a.slice(0, 6),
      coll,
      s,
      d,
      px: [Number(pxP) / 1e8, Number(pxH) / 1e8],
      lt: [ltP / 1e4, ltH / 1e4],
    });
  }
  // Each factor switches its inputs from the previous event's value to this one's.
  type Factor = { part: Omit<HfMovePart, "delta">; rows: Set<number>; field: "px" | "s" | "d" | "lt" };
  const factors: Factor[] = [];
  const priced = rows.map((r, i) => i).filter((i) => rows[i].px[0] !== rows[i].px[1]);
  const priceFactors: Factor[] = priced.map((i) => ({
    part: { kind: "price", symbol: rows[i].symbol, from: rows[i].px[0], to: rows[i].px[1] },
    rows: new Set([i]),
    field: "px",
  }));
  if (priceFactors.length > 5) factors.push({ part: { kind: "prices" }, rows: new Set(priced), field: "px" });
  else factors.push(...priceFactors);
  const grew = (f: "s" | "d") =>
    rows.map((r, i) => i).filter((i) => rows[i][f][1] > rows[i][f][0] && (f === "d" || rows[i].coll));
  const debtGrew = grew("d");
  if (debtGrew.length > 0)
    factors.push({
      part: {
        kind: "debt-interest",
        amounts: debtGrew.map((i) => ({ symbol: rows[i].symbol, amount: rows[i].d[1] - rows[i].d[0] })),
      },
      rows: new Set(debtGrew),
      field: "d",
    });
  const supplyGrew = grew("s");
  if (supplyGrew.length > 0)
    factors.push({
      part: {
        kind: "supply-interest",
        amounts: supplyGrew.map((i) => ({ symbol: rows[i].symbol, amount: rows[i].s[1] - rows[i].s[0] })),
      },
      rows: new Set(supplyGrew),
      field: "s",
    });
  const ltMoved = rows.map((r, i) => i).filter((i) => rows[i].coll && rows[i].lt[0] !== rows[i].lt[1]);
  if (ltMoved.length > 0)
    factors.push({
      part: {
        kind: "threshold",
        thresholds: ltMoved.map((i) => ({
          symbol: rows[i].symbol,
          from: rows[i].lt[0] * 100,
          to: rows[i].lt[1] * 100,
        })),
        emodeSwitch: (prev.emode?.after ?? 0) !== (here.emode?.before ?? 0),
      },
      rows: new Set(ltMoved),
      field: "lt",
    });

  const n = factors.length;
  const hfAt = (mask: number): number | null => {
    let w = 0;
    let debt = 0;
    rows.forEach((r, i) => {
      const at = (field: Factor["field"]): 0 | 1 =>
        factors.some((f, k) => mask & (1 << k) && f.field === field && f.rows.has(i)) ? 1 : 0;
      const s = r.s[at("s")];
      const d = r.d[at("d")];
      const px = r.px[at("px")];
      const lt = r.lt[at("lt")];
      if (r.coll && s > 0 && lt > 0) w += s * px * lt;
      debt += d * px;
    });
    return debt > 0 ? w / debt : null;
  };
  const values: number[] = [];
  for (let m = 0; m < 1 << n; m++) {
    const v = hfAt(m);
    if (v == null) return null;
    values.push(v);
  }
  const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1));
  const parts: HfMovePart[] = factors.map((f, k) => {
    let delta = 0;
    for (let m = 0; m < 1 << n; m++) {
      if (m & (1 << k)) continue;
      let size = 0;
      for (let j = 0; j < n; j++) if (m & (1 << j)) size++;
      delta += ((fact(size) * fact(n - size - 1)) / fact(n)) * (values[m | (1 << k)] - values[m]);
    }
    return { ...f.part, delta };
  });
  return { from: values[0], to: values[(1 << n) - 1], parts };
}

/** The balances before the transaction valued at block N's oracle prices — the
 *  prices a liquidation in block N ran at — on one basis: the health factor
 *  (Σ collateral × price × threshold ÷ Σ debt × price) and the loan-to-value
 *  (Σ debt ÷ Σ collateral the Pool counts: switched on, threshold above 0).
 *  The account's own before figures are the end of block N−1, at N−1's prices.
 *  Null where a reserve is unpriced or unnamed. */
export function beforeAtBlockPrices(state: AaveV3PositionState): { hf: number | null; ltv: number | null } | null {
  const cat = state.emode && state.emode.before > 0 ? state.emode.categories[String(state.emode.before)] : undefined;
  let weighted = 0;
  let coll = 0;
  let debt = 0;
  for (const r of state.reserves) {
    if (r.priceBase == null || r.decimals == null) return null;
    const p = Number(r.priceBase) / 1e8;
    const supply = Number(humanOf(r.supply.before, r.decimals));
    const owed = Number(humanOf(r.debt.before, r.decimals));
    const lt = r.inEmode && cat ? cat.liquidationThresholdBps : (r.liquidationThresholdBps ?? 0);
    if (r.collateral?.before && supply > 0 && lt > 0) {
      weighted += supply * p * (lt / 1e4);
      coll += supply * p;
    }
    debt += owed * p;
  }
  return { hf: debt > 0 ? weighted / debt : null, ltv: coll > 0 ? debt / coll : null };
}
