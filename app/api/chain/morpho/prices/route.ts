import { NextRequest, NextResponse } from "next/server";
import { loadMorphoPricesAtBlocks } from "@/lib/sources/chain/morpho-prices";
import {
  MORPHO_ARBITRUM_DEPLOYMENT,
  MORPHO_BASE_DEPLOYMENT,
  MORPHO_DEPLOYMENT,
} from "@/lib/sources/chain/morpho-deployments";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID } from "@/lib/shared/chains";
import { parseMorphoPricesQuery } from "@/lib/morpho/price-days";

// A Morpho Blue market's oracle price at up to MORPHO_PRICES_PER_REQUEST past
// blocks, for the Lifetime flows panel's one price per UTC day
// (lib/morpho/price-days.ts). The query takes one spelling and nothing else
// (`parseMorphoPricesQuery`), so one set of blocks has one URL and one
// edge-cache entry, and blocks outside Morpho Blue's life on the chain are
// refused. A past block's answer never changes, so it is cached hard; an
// answer with a block at 0 (a refused read, as a rule) for an hour. Node runtime.

export const runtime = "nodejs";

const RETRY_BACKOFF_MS = 500;

export async function GET(request: NextRequest) {
  const q = parseMorphoPricesQuery(request.nextUrl.searchParams.entries(), Date.now() / 1000);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  const { chain, market, blocks } = q;
  const deployment =
    chain === BASE_CHAIN_ID
      ? MORPHO_BASE_DEPLOYMENT
      : chain === ARBITRUM_CHAIN_ID
        ? MORPHO_ARBITRUM_DEPLOYMENT
        : MORPHO_DEPLOYMENT;
  try {
    // The keyless Arbitrum gateway refuses a burst now and then: one more
    // read after a short back-off.
    const data =
      chain === ARBITRUM_CHAIN_ID
        ? await loadMorphoPricesAtBlocks(market, blocks, deployment).catch(async () => {
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
            return loadMorphoPricesAtBlocks(market, blocks, deployment);
          })
        : await loadMorphoPricesAtBlocks(market, blocks, deployment);
    const whole = data.prices.every(([, p]) => p > 0);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": whole ? "public, max-age=86400, s-maxage=604800" : "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("Error reading Morpho prices at blocks:", error);
    return NextResponse.json({ error: "Failed to read the market's prices" }, { status: 502 });
  }
}
