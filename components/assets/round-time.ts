import { formatDate } from "@/lib/date";

/** "25 Oct 2026, 10:02 UTC": a block timestamp (unix seconds) to the minute, in UTC. */
export function roundTime(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm} UTC`;
}

/** A proxy round id (phase << 64 | aggregator round) as "phase 2, round 86,510". */
export function roundName(id: string): string {
  const n = BigInt(id);
  const shift = BigInt(64);
  const phase = n >> shift;
  const round = n - (phase << shift);
  return `phase ${phase.toString()}, round ${Number(round).toLocaleString("en-US")}`;
}

/** A feed's view pair as words: "eth_usd_71041d" → "ETH / USD",
 *  "wsteth_steth_exchange_rate" → "WSTETH / STETH exchange rate". */
export function legName(pair: string): string {
  const [a, b, ...rest] = pair.replace(/_[0-9a-f]{6}$/, "").split("_");
  return [b ? `${a.toUpperCase()} / ${b.toUpperCase()}` : a.toUpperCase(), ...rest].join(" ");
}
