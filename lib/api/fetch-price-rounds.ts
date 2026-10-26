// The stored oracle rounds, read through /api/prices/rounds (rails-ops
// reference/asset-key-map.md, "Rounds and the daily join"): per oracle
// address, the points its value in force changed at and each UTC day's
// close. The series reader joins them onto the daily stores
// (`joinRounds` in lib/shared/price-series.ts).

/** [ts, value at `scale`, block in force from, leg index, the leg row's block, its tx, its proxy round id] */
export type RoundWirePoint = [number, string, number, number, number, string, string | null];
/** [UTC day, close at `scale`, block, 1 where the day is complete] */
export type RoundWireDay = [number, string, number, 0 | 1];

export interface RoundsWireLine {
  kind: "feed" | "aave" | "compound" | "product";
  /** "usd", "eth" (a WETH Comet's prices), "ratio" (an exchange rate); absent on an older server. */
  unit?: "usd" | "eth" | "ratio";
  scale: number;
  legs: { kind: "feed" | "cap"; name: string; address: string }[];
  from: { block: number; ts: number } | null;
  total: number;
  inWindow: number;
  points: RoundWirePoint[];
  days: RoundWireDay[];
  thinned?: true;
  stops?: { block: number; why: string };
}

export interface RoundsAnswer {
  chain: number;
  /** "off": the chain's rounds are not served yet; the page reads the daily stores alone. */
  lane: "on" | "off";
  asOf?: { block: number; ts: number | null };
  lines: Record<string, RoundsWireLine | { unsettled: string }>;
}

/** Null where the read failed. */
export async function fetchPriceRounds(
  chain: number,
  oracles: readonly string[],
  opts: { from?: number; to?: number; max?: number; signal?: AbortSignal } = {},
): Promise<RoundsAnswer | null> {
  const unique = [...new Set(oracles.map((o) => o.toLowerCase()))];
  if (unique.length === 0) return null;
  const qs = new URLSearchParams({ chain: String(chain), oracles: unique.join(",") });
  if (opts.from != null) qs.set("from", String(opts.from));
  if (opts.to != null) qs.set("to", String(opts.to));
  if (opts.max != null) qs.set("max", String(opts.max));
  const res = await fetch(`/api/prices/rounds?${qs.toString()}`, { signal: opts.signal });
  if (!res.ok) return null;
  return (await res.json()) as RoundsAnswer;
}
