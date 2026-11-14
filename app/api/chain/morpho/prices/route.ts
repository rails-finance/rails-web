import { NextRequest, NextResponse } from "next/server";
import { loadMorphoPricesAtBlocks } from "@/lib/sources/chain/morpho-prices";
import {
  MORPHO_ARBITRUM_DEPLOYMENT,
  MORPHO_BASE_DEPLOYMENT,
  MORPHO_DEPLOYMENT,
} from "@/lib/sources/chain/morpho-deployments";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID } from "@/lib/shared/chains";
import { MORPHO_PRICES_PER_REQUEST } from "@/lib/morpho/price-days";

// A Morpho Blue market's oracle price at up to MORPHO_PRICES_PER_REQUEST past
// blocks, for the Lifetime flows panel's one price per UTC day
// (lib/morpho/price-days.ts). `blocks` is ascending and without repeats, so
// one set of blocks has one URL and one edge-cache entry. A past block's
// answer never changes, so it is cached hard. Node runtime.

export const runtime = "nodejs";

const MARKET_ID = /^(0x)?[0-9a-fA-F]{64}$/;
const RETRY_BACKOFF_MS = 500;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const market = sp.get("market");
  const chain = Number(sp.get("chain") ?? "1");
  const blocks = (sp.get("blocks") ?? "").split(",").map(Number);
  if (!market || !MARKET_ID.test(market))
    return NextResponse.json({ error: "market must be a 32-byte hex id" }, { status: 400 });
  if (blocks.length === 0 || blocks.some((b) => !Number.isInteger(b) || b <= 1))
    return NextResponse.json({ error: "blocks must be block numbers" }, { status: 400 });
  if (blocks.length > MORPHO_PRICES_PER_REQUEST)
    return NextResponse.json({ error: `at most ${MORPHO_PRICES_PER_REQUEST} blocks a request` }, { status: 400 });
  if (blocks.some((b, i) => i > 0 && b <= blocks[i - 1]))
    return NextResponse.json({ error: "blocks must be ascending, each once" }, { status: 400 });
  const deployment =
    chain === BASE_CHAIN_ID
      ? MORPHO_BASE_DEPLOYMENT
      : chain === ARBITRUM_CHAIN_ID
        ? MORPHO_ARBITRUM_DEPLOYMENT
        : MORPHO_DEPLOYMENT;
  try {
    const data =
      chain === ARBITRUM_CHAIN_ID
        ? await loadMorphoPricesAtBlocks(market, blocks, deployment).catch(async () => {
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
            return loadMorphoPricesAtBlocks(market, blocks, deployment);
          })
        : await loadMorphoPricesAtBlocks(market, blocks, deployment);
    // A block that answered 0 (a refused read, as a rule) is not kept.
    const whole = data.prices.every(([, p]) => p > 0);
    return NextResponse.json(data, {
      headers: { "Cache-Control": whole ? "public, max-age=86400, s-maxage=604800" : "no-store" },
    });
  } catch (error) {
    console.error("Error reading Morpho prices at blocks:", error);
    return NextResponse.json({ error: "Failed to read the market's prices" }, { status: 502 });
  }
}
