import { NextRequest, NextResponse } from "next/server";
import { resolveCometPrices, cometPriceOf, type CometPriceRequest } from "@/lib/sources/chain/compound-prices";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";

// On-chain USD for the tokens an Arbitrum Comet position touches — each
// Comet's own `getPrice` on the feed it liquidates with, one batched read, as
// the Base route does. Prices are keyed per market (`market:token`), because
// each Comet reads its own feeds; the WETH Comet quotes in ETH and its answers
// convert to dollars at the USDC Comet's WETH feed. An asset a Comet cannot
// price is absent, and the page treats it as unpriced.
//
// `?pairs=<market>:<token>,…` — market keys are this deployment's roster keys.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAIRS = 60;
const ADDRESS = /^0x[0-9a-f]{40}$/;

export async function GET(request: NextRequest) {
  const markets = new Map(COMPOUND_ARBITRUM_DEPLOYMENT.markets.map((m) => [m.key, m]));
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
    const map = await resolveCometPrices(reqs, COMPOUND_ARBITRUM_DEPLOYMENT);
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
    console.error("Error reading Compound V3 Arbitrum oracle prices:", error);
    return NextResponse.json({ prices: {} });
  }
}
