import { NextRequest, NextResponse } from "next/server";
import { resolveCometPrices, cometPriceOf, type CometPriceRequest } from "@/lib/sources/chain/compound-prices";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// On-chain USD for the tokens a Base Comet position touches — each market's
// OWN `getPrice` on the feed it liquidates with, one batched read. Exists for
// the same reason the Aave V3 Base twin does: the economics tower values
// lifetime flows, and an asset the wallet has fully exited is priced by
// nothing else on the page. Prices are keyed per MARKET (`comet:token`),
// because each Comet reads its own feeds and the ETH-quoted market's answers
// are converted to dollars through the protocol's own WETH/USD feed. An asset a
// market can't price is simply absent — the tower treats an absent price as
// unpriced and drops the whole panel to the token-only list rather than
// assert a partial USD total.
//
// `?pairs=<comet>:<token>,…` — comet slugs are this deployment's market keys.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAIRS = 60;
const ADDRESS = /^0x[0-9a-f]{40}$/;

export async function GET(request: NextRequest) {
  const markets = new Map(COMPOUND_BASE_DEPLOYMENT.markets.map((m) => [m.key, m]));
  const wanted = new Map<string, Set<string>>(); // market key → tokens
  for (const pair of (request.nextUrl.searchParams.get("pairs") ?? "").split(",").slice(0, MAX_PAIRS)) {
    const [key, token] = pair.trim().toLowerCase().split(":");
    if (!key || !token || !markets.has(key) || !ADDRESS.test(token)) continue;
    const set = wanted.get(key) ?? new Set<string>();
    set.add(token);
    wanted.set(key, set);
  }
  if (wanted.size === 0) return NextResponse.json({ prices: {} });

  try {
    const reqs: CometPriceRequest[] = [...wanted.entries()].map(([key, tokens]) => {
      const m = markets.get(key)!;
      return {
        comet: m.comet,
        baseToken: m.baseToken,
        collateral: [...tokens].filter((t) => t !== m.baseToken.toLowerCase()),
      };
    });
    const map = await resolveCometPrices(reqs, COMPOUND_BASE_DEPLOYMENT);
    const prices: Record<string, number> = {};
    for (const [key, tokens] of wanted) {
      const m = markets.get(key)!;
      for (const t of tokens) {
        const p = cometPriceOf(map, m.comet, t);
        if (p != null && p > 0) prices[`${key}:${t}`] = p;
      }
    }
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Error reading Compound V3 Base oracle prices:", error);
    return NextResponse.json({ prices: {} });
  }
}
