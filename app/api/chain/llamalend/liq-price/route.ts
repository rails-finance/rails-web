import { NextRequest, NextResponse } from "next/server";
import { alchemyClient } from "@/lib/sources/chain/rpc";
import { discoverLlamalendMarkets } from "@/lib/sources/chain/llamalend-markets";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { scale1e18 } from "@/lib/llamalend/band-math";

// The liquidation-forensics price read: the market's own AMM oracle AT the
// event's block — an archive eth_call, the "oracle-at-block overlay walk".
// LLAMMA's price_oracle() answers at any height, so the valued treatment of a
// hard liquidation needs no captured price pipeline: the page asks the chain
// for the price the protocol itself was judging with in that block.
//
// One (controller, block) pair per call — a position carries at most a
// handful of liquidations, and the detail panel fetches lazily on expand.
// The price is immutable once the block is final, so the response is cached
// hard at the edge.

export const runtime = "nodejs";

const AMM_ABI = [
  { type: "function", name: "price_oracle", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export async function GET(request: NextRequest) {
  const controller = normalizeAddressParam(request.nextUrl.searchParams.get("controller") ?? "");
  const blockParam = request.nextUrl.searchParams.get("block") ?? "";
  const block = /^\d+$/.test(blockParam) ? BigInt(blockParam) : null;
  if (!controller || block == null) {
    return NextResponse.json({ error: "controller and block are required" }, { status: 400 });
  }
  const market = (await discoverLlamalendMarkets()).get(controller);
  if (!market) {
    return NextResponse.json({ error: `unknown LlamaLend market ${controller}` }, { status: 404 });
  }
  try {
    const priceRaw = await alchemyClient().readContract({
      address: market.amm as `0x${string}`,
      abi: AMM_ABI,
      functionName: "price_oracle",
      blockNumber: block,
    });
    return NextResponse.json(
      {
        controller,
        amm: market.amm,
        blockNumber: Number(block),
        priceRaw: priceRaw.toString(),
        // Borrowed token per whole collateral token (LLAMMA's fixed 1e18 scale).
        price: scale1e18(priceRaw),
      },
      { headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    );
  } catch (error) {
    console.error("Error reading LlamaLend price_oracle at block:", error);
    const message = error instanceof Error ? error.message : "price_oracle read failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
