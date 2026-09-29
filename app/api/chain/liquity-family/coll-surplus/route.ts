import { NextRequest, NextResponse } from "next/server";
import { readTroveCollSurplus } from "@/lib/sources/chain/liquity-coll-surplus";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { resolveBranch as asymmetryBranch } from "@/lib/asymmetry/asset-catalog";
import { resolveBranch as ebisuBranch } from "@/lib/ebisu/asset-catalog";
import { resolveBranch as basedollarBranch } from "@/lib/basedollar/asset-catalog";
import { LIQUITY_V1_ADDRESSES, ASSET_DECIMALS } from "@/lib/liquity-v1/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

// A Trove's collateral surplus at the head — still claimable, or claimed — for
// any Liquity-V2-architecture explorer and for Liquity V1 (lib/sources/chain/
// liquity-coll-surplus.ts). `?protocol=` names the explorer, `?branch=` the
// collateral branch (V1 has one, so any value stands), `?owner=` the Trove's
// last owner and `?tx=` the transaction that credited the surplus: a
// liquidation, or on V1 also a full redemption. A V2-family branch names its
// PriceFeed, so a claim carries the price at its block (V1's claim row reads
// its price from the event route). Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BranchLookup = (branch: string) => { troveManager: string; decimals: number; priceFeed?: string } | undefined;

const PROTOCOLS: Record<string, { chainId: ChainId; branch: BranchLookup }> = {
  "liquity-v2": { chainId: MAINNET_CHAIN_ID, branch: (b) => LIQUITY_V2_BRANCHES[b.toLowerCase()] },
  asymmetry: { chainId: MAINNET_CHAIN_ID, branch: asymmetryBranch },
  ebisu: { chainId: MAINNET_CHAIN_ID, branch: ebisuBranch },
  basedollar: { chainId: BASE_CHAIN_ID, branch: basedollarBranch },
  // V1 runs the same CollSurplusPool events and getters on its single ETH
  // market; a full redemption credits it as well as a capped liquidation.
  "liquity-v1": {
    chainId: MAINNET_CHAIN_ID,
    branch: () => ({ troveManager: LIQUITY_V1_ADDRESSES.TROVE_MANAGER, decimals: ASSET_DECIMALS }),
  },
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const proto = PROTOCOLS[sp.get("protocol") ?? ""];
  if (!proto) return NextResponse.json({ error: "protocol must name a Liquity-family explorer" }, { status: 400 });
  const branch = proto.branch(sp.get("branch") ?? "");
  if (!branch) return NextResponse.json({ error: "branch must name a collateral branch" }, { status: 400 });
  const owner = sp.get("owner") ?? "";
  const tx = sp.get("tx") ?? "";
  if (!ADDRESS.test(owner)) return NextResponse.json({ error: "owner must be an address" }, { status: 400 });
  if (!TX.test(tx)) return NextResponse.json({ error: "tx must be a transaction hash" }, { status: 400 });
  try {
    const data = await readTroveCollSurplus({
      chainId: proto.chainId,
      troveManager: branch.troveManager,
      owner,
      liquidationTx: tx,
      decimals: branch.decimals,
      priceFeed: branch.priceFeed,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error reading the collateral surplus:", error);
    const message = error instanceof Error ? error.message : "Failed to read the collateral surplus";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
