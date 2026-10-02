import { NextRequest, NextResponse } from "next/server";
import { getAddress, parseAbi, stringToHex } from "viem";
import { alchemyClient } from "@/lib/sources/chain/rpc";
import { MAKER_ADDRESSES, isLseIlk } from "@/lib/makerdao/asset-catalog";
import { readAuctionStop, readPriceCap } from "@/lib/sources/chain/makerdao-lse-oracle";

// GET /api/chain/makerdao/ilk-terms?ilk=LSEV2-SKY-A — one ilk's price cap and
// auction breaker at head (lib/sources/chain/makerdao-lse-oracle.ts), for the
// vault list's cards: the index serves a LockStake row's capped price with no
// word about the cap, and nothing about the stopped auctions (TO-DO-ui-jobs
// 189). A head read, so it is cached briefly. Node runtime.

export const runtime = "nodejs";

const SPOTTER_ABI = parseAbi(["function ilks(bytes32) view returns (address pip, uint256 mat)"]);

export async function GET(request: NextRequest) {
  const ilk = request.nextUrl.searchParams.get("ilk") ?? "";
  if (!/^[A-Z0-9-]{1,32}$/.test(ilk)) {
    return NextResponse.json({ error: "ilk is required" }, { status: 400 });
  }
  try {
    const client = alchemyClient();
    const head = await client.getBlockNumber();
    const ilkB = stringToHex(ilk, { size: 32 });
    const [pip] = await client.readContract({
      address: getAddress(MAKER_ADDRESSES.SPOTTER),
      abi: SPOTTER_ABI,
      functionName: "ilks",
      args: [ilkB],
      blockNumber: head,
    });
    const [priceCap, auction] = await Promise.all([
      // Only LockStake's pip is a capped wrapper; a plain OSM has no cap().
      isLseIlk(ilk) && !/^0x0{40}$/i.test(pip) ? readPriceCap(client, pip, head) : Promise.resolve(null),
      readAuctionStop(client, ilkB, head),
    ]);
    return NextResponse.json(
      { ilk, atBlock: Number(head), priceCap, auction },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
    );
  } catch (error) {
    console.error("Error reading the MakerDAO ilk terms:", error);
    return NextResponse.json({ error: "Failed to read the ilk terms" }, { status: 502 });
  }
}
