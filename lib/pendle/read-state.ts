// Whether a failed read of rails-server's Pendle routes means "not indexed
// yet": an api with no /api/pendle routes answers 404 (an Express page, no
// code), and one whose router tables are still filling answers 503
// `router_events_unavailable` (or `no_sieve`). A 404 that says `not_a_market`
// is an answer about the address, and is not this.

export interface PendleFailure {
  status: number;
  code: string | null;
}

export function pendleNotIndexed(f: PendleFailure): boolean {
  if (f.code === "router_events_unavailable" || f.code === "no_sieve") return true;
  return f.status === 404 && f.code !== "not_a_market";
}
