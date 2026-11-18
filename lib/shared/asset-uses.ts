// What a token is to an explorer that lists it (rails-ops ui-jobs 490): the
// uses the asset page names under its "Read by" chips (A1.8), each a link to
// the explorer's page for it. Every use comes from a protocol's own config or
// roster, read in lib/api/asset-explorer-chips.ts: a Liquity-family debt
// token's Troves and Stability Pools, sBOLD's asset, and Pendle's roster,
// whose markets name their yield token and the asset it accounts in (BOLD
// under PT-sBOLD).
//
// Pure: no imports, so scripts/test/asset-uses.test.mjs loads it directly.

/** One use: its words and a path under the explorer's route ("" for the
 *  explorer, "/stability-pool", "/markets/0x…"). */
export interface TokenUse {
  label: string;
  page: string;
}

/** A use as the chip carries it, its path resolved. */
export interface ChipUse {
  label: string;
  href: string;
}

/** A Pendle market as the roster names it, reduced to what the uses need. */
export interface PendleMarketRef {
  market: string;
  pt: string | null;
  yieldToken: string;
  asset: string | null;
  expired: boolean | null;
}

/** The uses of one Pendle market's tokens: the yield token and, where it is
 *  another token, the asset it accounts in, each named by the PT; an expired
 *  market, and the zero address Pendle writes for ETH, have none. */
export function pendleUses(markets: readonly PendleMarketRef[]): { token: string; use: TokenUse }[] {
  const out: { token: string; use: TokenUse }[] = [];
  for (const m of markets) {
    if (m.expired === true) continue;
    const use = { label: m.pt ?? "Market", page: `/markets/${m.market.toLowerCase()}` };
    const tokens = new Set([m.yieldToken, m.asset].filter((t): t is string => t != null).map((t) => t.toLowerCase()));
    for (const token of tokens) if (!/^0x0{40}$/.test(token)) out.push({ token, use });
  }
  return out;
}

/** An explorer's uses of a token, their paths under `root`, each path once in
 *  the order first named; two uses of one label (two Pendle markets of one
 *  PT symbol) each carry the short address their path ends in. */
export function chipUses(root: string, uses: readonly TokenUse[]): ChipUse[] {
  const seen = new Map<string, ChipUse>();
  for (const u of uses) {
    const href = `${root}${u.page}`;
    if (!seen.has(href)) seen.set(href, { label: u.label, href });
  }
  const out = [...seen.values()];
  const count = new Map<string, number>();
  for (const u of out) count.set(u.label, (count.get(u.label) ?? 0) + 1);
  return out.map((u) => {
    const address = /0x[0-9a-f]{40}$/.exec(u.href)?.[0];
    return count.get(u.label)! > 1 && address
      ? { ...u, label: `${u.label} (${address.slice(0, 6)}…${address.slice(-4)})` }
      : u;
  });
}
