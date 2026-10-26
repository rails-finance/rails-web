import { formatDate } from "@/lib/date";

/** "25 Oct 2026, 10:02 UTC": a block timestamp (unix seconds) to the minute, in UTC. */
export function roundTime(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm} UTC`;
}
