// A SparkLend reserve's balance from the wallet's scaled balance and the
// reserve's indices (rails-ops TO-DO-infra-and-backend.md, "The spark wallet
// sync rewrites about 4,500 rows on every pass", Miles's option B′). A stored
// wallet card from rails-server mig 535 carries each reserve's scaled sums
// (`supplyScaledRaw`, `debtScaledRaw`), which move only on the position's
// events; the page accrues them to a block's time with the reserve's latest
// index and rate from `/api/spark/reserve-indices`. A card stored before mig
// 535 carries the balances (`supplyBalanceRaw`, `debtBalanceRaw`), used as they
// are.
//
// The arithmetic is rails-server's SQL, to the wei: `ray_mul`,
// `aave_linear_index` and `aave_compound_index`, with `mv_spark_positions`'s
// dt rule GREATEST(t − rdu_ts, 0) and its floor GREATEST(balance, 0).
// Postgres `div` truncates toward zero, as BigInt `/` does.
//
// A reserve with a scaled balance and no index to accrue it with is drawn
// "Not read": a scaled balance is short of the amount by the index factor.
//
// Imports nothing, so scripts/test/spark-scaled-accrual.test.mjs loads it directly.

const big = (s: string) => BigInt(s);
const ZERO = big("0");
const ONE = big("1");
const TWO = big("2");
const SIX = big("6");
const RAY = big("1000000000000000000000000000");
const HALF_RAY = big("500000000000000000000000000");
const SECONDS_PER_YEAR = big("31536000");

/** `ray_mul(a, b)`: div(a*b + RAY/2, RAY), Aave's half-up rayMul. */
export function rayMul(a: bigint, b: bigint): bigint {
  return (a * b + HALF_RAY) / RAY;
}

/** `aave_linear_index(stored, rate, dt)`: the liquidity index `dt` seconds on. */
export function aaveLinearIndex(stored: bigint, rate: bigint, dt: bigint): bigint {
  return rayMul(stored, RAY + (rate * dt) / SECONDS_PER_YEAR);
}

/** `aave_compound_index(stored, rate, dt)`: the variable borrow index `dt`
 *  seconds on, by the Pool's three-term binomial approximation. */
export function aaveCompoundIndex(stored: bigint, rate: bigint, dt: bigint): bigint {
  if (dt <= ZERO) return stored;
  const e1 = dt - ONE;
  const e2 = dt > TWO ? dt - TWO : ZERO;
  const bp2 = rayMul(rate, rate) / (SECONDS_PER_YEAR * SECONDS_PER_YEAR);
  const bp3 = rayMul(bp2, rate) / SECONDS_PER_YEAR;
  const s2 = (dt * e1 * bp2) / TWO;
  const s3 = (dt * e1 * e2 * bp3) / SIX;
  return rayMul(stored, RAY + (rate * dt) / SECONDS_PER_YEAR + s2 + s3);
}

/** One reserve's indices as `/api/spark/reserve-indices` serves them: raw ray
 *  integer strings, and the time of the reserve's last update in seconds. */
export interface SparkReserveIndex {
  reserve: string;
  liquidityIndex: string;
  liquidityRate: string;
  variableBorrowIndex: string;
  variableBorrowRate: string;
  rduTs: number;
}

/** The route's answer: every reserve's indices, the block they stand at and its time. */
export interface SparkReserveIndices {
  reserves: SparkReserveIndex[];
  block: number;
  at: number;
}

/** A supply or debt balance at `t` (seconds), as mv_spark_positions computes it. */
export function accrueBalance(scaled: bigint, x: SparkReserveIndex, side: "supply" | "debt", t: number): bigint {
  const dt = big(String(Math.max(Math.floor(t) - x.rduTs, 0)));
  const balance =
    side === "supply"
      ? rayMul(scaled, aaveLinearIndex(big(x.liquidityIndex), big(x.liquidityRate), dt))
      : rayMul(scaled, aaveCompoundIndex(big(x.variableBorrowIndex), big(x.variableBorrowRate), dt));
  return balance > ZERO ? balance : ZERO;
}

/** A stored card's reserve before mig 535: the balances, accrued by the server. */
export interface SparkBalanceReserve {
  reserve: string;
  supplyBalanceRaw: string;
  debtBalanceRaw: string;
}

/** A stored card's reserve from mig 535: the scaled sums. */
export interface SparkScaledReserve {
  reserve: string;
  supplyScaledRaw: string;
  debtScaledRaw: string;
}

/** A reserve as the listing builder takes it: balances, and which side has
 *  a scaled balance no index could accrue (its balance then reads "0"). */
export interface SparkAccruedReserve extends SparkBalanceReserve {
  supplyUnread?: true;
  debtUnread?: true;
}

export const isScaledReserve = (r: SparkBalanceReserve | SparkScaledReserve): r is SparkScaledReserve =>
  "supplyScaledRaw" in r || "debtScaledRaw" in r;

/** Whether a stored card carries scaled balances. */
export const cardIsScaled = (card: { reserves?: (SparkBalanceReserve | SparkScaledReserve)[] } | null | undefined) =>
  (card?.reserves ?? []).some(isScaledReserve);

/** A raw integer string as a BigInt; 0 where it is missing or unreadable. */
export function rawInt(raw: string | null | undefined): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return big(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** The reserves' indices by lowercased reserve address. */
export const indexMap = (answer: SparkReserveIndices | null): Map<string, SparkReserveIndex> | null =>
  answer ? new Map(answer.reserves.map((x) => [x.reserve.toLowerCase(), x])) : null;

/** One side of a reserve at `t`: the balance, or unread where the side holds a
 *  scaled balance and `indices` (null: the route did not answer) has no row for it. */
export function accrueSide(
  scaledRaw: string | null | undefined,
  index: SparkReserveIndex | undefined,
  side: "supply" | "debt",
  t: number,
): { raw: string; unread?: true } {
  const scaled = rawInt(scaledRaw);
  if (scaled <= ZERO) return { raw: "0" };
  if (!index) return { raw: "0", unread: true };
  return { raw: accrueBalance(scaled, index, side, t).toString() };
}

/** A stored card's reserves as balances at `t`. A reserve stored as balances
 *  passes as it is. */
export function accrueReserves(
  reserves: (SparkBalanceReserve | SparkScaledReserve)[],
  indices: Map<string, SparkReserveIndex> | null,
  t: number,
): SparkAccruedReserve[] {
  return reserves.map((r) => {
    if (!isScaledReserve(r)) return r;
    const x = indices?.get(r.reserve.toLowerCase());
    const s = accrueSide(r.supplyScaledRaw, x, "supply", t);
    const d = accrueSide(r.debtScaledRaw, x, "debt", t);
    return {
      reserve: r.reserve,
      supplyBalanceRaw: s.raw,
      debtBalanceRaw: d.raw,
      ...(s.unread ? { supplyUnread: true as const } : {}),
      ...(d.unread ? { debtUnread: true as const } : {}),
    };
  });
}

const RAW_INT = /^\d+$/;

/** The route's body as `SparkReserveIndices`, or null where it is not that
 *  shape. A reserve row with an unreadable figure is left out, so its
 *  reserve reads "Not read". */
export function parseSparkReserveIndices(body: unknown): SparkReserveIndices | null {
  if (body == null || typeof body !== "object") return null;
  const b = body as { reserves?: unknown; block?: unknown; at?: unknown };
  if (!Array.isArray(b.reserves) || typeof b.at !== "number" || !Number.isFinite(b.at)) return null;
  const reserves: SparkReserveIndex[] = [];
  for (const x of b.reserves as Record<string, unknown>[]) {
    if (x == null || typeof x !== "object" || typeof x.reserve !== "string") continue;
    const figures = [x.liquidityIndex, x.liquidityRate, x.variableBorrowIndex, x.variableBorrowRate];
    if (!figures.every((f) => typeof f === "string" && RAW_INT.test(f))) continue;
    if (typeof x.rduTs !== "number" || !Number.isFinite(x.rduTs)) continue;
    reserves.push({
      reserve: x.reserve,
      liquidityIndex: x.liquidityIndex as string,
      liquidityRate: x.liquidityRate as string,
      variableBorrowIndex: x.variableBorrowIndex as string,
      variableBorrowRate: x.variableBorrowRate as string,
      rduTs: x.rduTs,
    });
  }
  return { reserves, block: typeof b.block === "number" ? b.block : 0, at: b.at };
}

/** One drawn reserve line: the listing builder's SparkReserveAmount, as far as accrual touches it. */
export interface SparkAmountLine {
  address: string;
  decimals: number;
  amount: number;
  amountRaw: string;
  amountUnread?: true;
}

/**
 * A card's supply or debt lines accrued to `t` from the stored scaled sums: each
 * line's amount is rebuilt, and the lines are ranked by raw amount, the unread
 * ones last. A line whose reserve the stored card holds as balances keeps its
 * amount. `scale` turns a raw amount into the display number (lib/shared/scale-raw.ts).
 */
export function accrueLines<L extends SparkAmountLine>(
  lines: L[],
  reserves: (SparkBalanceReserve | SparkScaledReserve)[],
  indices: Map<string, SparkReserveIndex> | null,
  side: "supply" | "debt",
  t: number,
  scale: (raw: bigint, decimals: number) => number,
): L[] {
  const stored = new Map(reserves.map((r) => [r.reserve.toLowerCase(), r]));
  const out = lines.map((l): L => {
    const r = stored.get(l.address.toLowerCase());
    if (!r || !isScaledReserve(r)) return l;
    const got = accrueSide(
      side === "supply" ? r.supplyScaledRaw : r.debtScaledRaw,
      indices?.get(l.address.toLowerCase()),
      side,
      t,
    );
    const { amountUnread: _was, ...rest } = l;
    void _was;
    if (got.unread) return { ...rest, amount: 0, amountRaw: "0", amountUnread: true } as L;
    return { ...rest, amount: scale(big(got.raw), l.decimals), amountRaw: got.raw } as L;
  });
  const rank = (l: SparkAmountLine) => (l.amountUnread ? -ONE : rawInt(l.amountRaw));
  return out.sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return y > x ? 1 : y < x ? -1 : 0;
  });
}
