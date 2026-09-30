// ============================================================================
// FETCH AAVE-FAMILY RESERVE RATES (the indexed ReserveDataUpdated series)
// ============================================================================
//
// One client for both Ethereum V3-family explorers: Aave V3 (Core / Prime /
// EtherFi, three separate Pools) and SparkLend (one). Both answer the same
// question in the same shape — for each reserve, the rate a position's own
// action left in force at each earlier touch, and the rate that stood before
// each later touch — because the two routes share one upstream service
// (rails-server's api/src/services/aave-family-reserve-rates.ts, where the two
// as-of predicates are argued out).
//
// FAIL-OPEN. A position page's market notes are an addition to the timeline,
// never a precondition for it: `loadAaveFamilyReserveRates` answers `null` on
// any failure and the page renders exactly as it did before notes existed. A
// note is never drawn from a partial answer either — a point the route could
// not resolve comes back as `null` in place and its stretch is simply not
// stated.

/** One ReserveDataUpdated, as the route states it. */
export interface ReserveRatePoint {
  block: number;
  logIndex: number;
  txHash: string;
  /** Unix seconds — the block's own header. */
  timestamp: number;
  /** Supply rate as a fraction of 1 a year (`liquidityRate` ray ÷ 1e27). */
  liquidityRate: number;
  /** Variable borrow rate as a fraction. */
  variableBorrowRate: number;
  /** The exact ray integers, for a receipt that wants to state them. */
  liquidityRateRaw: string;
  variableBorrowRateRaw: string;
}

/** One reserve's answer, aligned index-for-index with what was asked. */
export interface ReserveRatesEntry {
  reserve: string;
  symbol: string | null;
  after: (ReserveRatePoint | null)[];
  before: (ReserveRatePoint | null)[];
}

export interface ReserveRatesResponse {
  market: string;
  reserves: ReserveRatesEntry[];
}

/** One reserve's question. `after` points are read AT OR BEFORE their own log;
 *  `before` points strictly before theirs AND never inside the transaction the
 *  third element names. */
export interface ReserveRatesRequest {
  reserve: string;
  after: [number, number][];
  before: [number, number, string][];
}

export interface FetchReserveRatesParams {
  /** `/api/aave-v3/reserve-rates` or `/api/spark/reserve-rates`. */
  route: string;
  /** core | prime | etherfi. Absent on Spark, which has one Pool. */
  market?: string;
  requests: ReserveRatesRequest[];
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchAaveFamilyReserveRates(p: FetchReserveRatesParams): Promise<ReserveRatesResponse> {
  const res = await fetch(`${p.baseUrl ?? ""}${p.route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(p.market ? { market: p.market } : {}), requests: p.requests }),
    cache: "no-store",
    signal: p.signal,
  });
  if (!res.ok) throw new Error(`fetchAaveFamilyReserveRates failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as ReserveRatesResponse;
}

/** The upstream's caps (rails-server's aave-family-reserve-rates.ts): at most
 *  20 reserves a request and 2,000 points a list. A busy position asks more
 *  (0xb8a4…715e on Core: 2,500 `after` points on one reserve), and the
 *  upstream answers the whole request 400. */
const RESERVE_RATES_MAX_RESERVES = 20;
const RESERVE_RATES_MAX_POINTS = 2_000;

/** The requests cut to fit the caps: each reserve's two lists sliced into
 *  runs of at most RESERVE_RATES_MAX_POINTS, run i of every reserve in
 *  round i, each round packed at most RESERVE_RATES_MAX_RESERVES to a request.
 *  No request names a reserve twice: the answer is matched back by reserve. */
function chunkReserveRatesRequests(
  requests: readonly ReserveRatesRequest[],
  maxReserves = RESERVE_RATES_MAX_RESERVES,
  maxPoints = RESERVE_RATES_MAX_POINTS,
): ReserveRatesRequest[][] {
  const rounds: ReserveRatesRequest[][] = [];
  for (const r of requests) {
    const runs = Math.max(1, Math.ceil(Math.max(r.after.length, r.before.length) / maxPoints));
    for (let i = 0; i < runs; i++) {
      (rounds[i] ??= []).push({
        reserve: r.reserve,
        after: r.after.slice(i * maxPoints, (i + 1) * maxPoints),
        before: r.before.slice(i * maxPoints, (i + 1) * maxPoints),
      });
    }
  }
  const out: ReserveRatesRequest[][] = [];
  for (const round of rounds)
    for (let i = 0; i < round.length; i += maxReserves) out.push(round.slice(i, i + maxReserves));
  return out;
}

/**
 * The reader every position page uses: the answer, keyed for lookup, or
 * `null` where anything went wrong. An empty `requests` list is answered with
 * an empty map without a round trip — a position with no held stretch has no
 * question to ask. A question over the upstream's caps goes as several
 * requests, and any one failing answers `null` for all of them.
 */
export async function loadAaveFamilyReserveRates(p: FetchReserveRatesParams): Promise<ReserveRateLookup | null> {
  if (p.requests.length === 0) return new Map();
  try {
    const chunks = chunkReserveRatesRequests(p.requests);
    const answers = await Promise.all(chunks.map((requests) => fetchAaveFamilyReserveRates({ ...p, requests })));
    const out: ReserveRateLookup = new Map();
    answers.forEach((data, i) => {
      for (const [reserve, entry] of indexReserveRates(chunks[i], data)) {
        const have = out.get(reserve);
        if (!have) out.set(reserve, entry);
        else {
          for (const [k, v] of entry.after) have.after.set(k, v);
          for (const [k, v] of entry.before) have.before.set(k, v);
          have.symbol ??= entry.symbol;
        }
      }
    });
    return out;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return null;
    console.error("reserve-rates fetch failed:", err);
    return null;
  }
}

/** `reserve` → the two coordinate-keyed maps, plus the symbol the index
 *  names the reserve by. */
export type ReserveRateLookup = Map<
  string,
  {
    symbol: string | null;
    after: Map<string, ReserveRatePoint>;
    before: Map<string, ReserveRatePoint>;
  }
>;

/** `${block}:${logIndex}` — the key a touch is looked up by. Both ends key on
 *  the TOUCH's own coordinates (what was asked), never on the observation's
 *  (what came back), so a lookup cannot silently match the wrong point. */
export const ratePointKey = (block: number, logIndex: number): string => `${block}:${logIndex}`;

/** Pair the route's aligned arrays back up with the coordinates that asked for
 *  them. The alignment is the route's contract; a response whose arrays are
 *  short simply leaves those coordinates unanswered rather than shifting the
 *  rest of the list onto the wrong points. */
export function indexReserveRates(
  requests: readonly ReserveRatesRequest[],
  data: ReserveRatesResponse,
): ReserveRateLookup {
  const byReserve = new Map(data.reserves.map((r) => [r.reserve.toLowerCase(), r]));
  const out: ReserveRateLookup = new Map();
  for (const req of requests) {
    const answer = byReserve.get(req.reserve.toLowerCase());
    if (!answer) continue;
    const after = new Map<string, ReserveRatePoint>();
    const before = new Map<string, ReserveRatePoint>();
    req.after.forEach((p, i) => {
      const point = answer.after[i];
      if (point) after.set(ratePointKey(p[0], p[1]), point);
    });
    req.before.forEach((p, i) => {
      const point = answer.before[i];
      if (point) before.set(ratePointKey(p[0], p[1]), point);
    });
    out.set(req.reserve.toLowerCase(), { symbol: answer.symbol, after, before });
  }
  return out;
}
