import { NextRequest, NextResponse } from "next/server";
import { readTxLegs } from "@/lib/sources/chain/tx-legs";
import { saleVenue } from "@/lib/shared/tx-legs";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

// What a transaction moved to and from a wallet, read from its receipt
// (lib/sources/chain/tx-legs.ts), for a position token's transfer out to a
// registry router or settlement contract (rails-ops TO-DO-ui-jobs 438). A live
// chain read rendered as primary truth: decision 0006's carve-out.
//
// `?chain=1|8453|42161&hash=<tx>&wallet=<address>&via=<counterparty>` answers
// TxLegs. `via` must be a router or settlement in the registry, which keeps
// the read to the rows that qualify. `rpcCalls` (and the `x-rails-rpc-calls`
// header) counts the upstream calls this request spent: 0 on a cache hit.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAINS: ChainId[] = [MAINNET_CHAIN_ID, BASE_CHAIN_ID, ARBITRUM_CHAIN_ID];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chain = Number(q.get("chain") ?? MAINNET_CHAIN_ID) as ChainId;
  const hash = (q.get("hash") ?? "").toLowerCase();
  const wallet = (q.get("wallet") ?? "").toLowerCase();
  const via = (q.get("via") ?? "").toLowerCase();
  if (!CHAINS.includes(chain) || !HASH.test(hash) || !ADDRESS.test(wallet) || !ADDRESS.test(via))
    return NextResponse.json({ error: "chain (1, 8453 or 42161), hash, wallet and via are required" }, { status: 400 });
  if (!saleVenue(via, chain))
    return NextResponse.json({ error: "via is not a router or settlement contract in the registry" }, { status: 400 });
  try {
    const legs = await readTxLegs(chain, hash, wallet);
    // The row's transfer out must be in this receipt: the wallet sent `via`
    // a token here.
    if (!legs.sent.some((l) => l.counterparty === via))
      return NextResponse.json({ error: "the wallet sent via nothing in this transaction" }, { status: 400 });
    return NextResponse.json(legs, {
      headers: {
        "x-rails-rpc-calls": String(legs.rpcCalls),
        // A mined transaction's receipt never changes.
        "cache-control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Error reading a transaction's legs:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "receipt not read" }, { status: 502 });
  }
}
