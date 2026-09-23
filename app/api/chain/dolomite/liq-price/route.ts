import { NextRequest, NextResponse } from "next/server";
import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "@/lib/sources/chain/rpc";
import { DOLOMITE_ADDRESSES } from "@/lib/dolomite/asset-catalog";

// The liquidation-forensics read: the margin core's own oracle prices AND the
// liquidation spread AT the event's block — one archive multicall, the
// oracle-at-block overlay walk. getMarketPrice is the figure the risk engine
// judged the account with in that block, and the spread is the constant it
// sized the seizure by. ⚠️ The spread is ACCOUNT-AWARE, not just pair-aware:
// an account carrying a risk override (the LST/ETH and BTC categories) is
// seized at its override spread with premiums skipped, so when the caller
// names the liquidated account the read is getLiquidationSpreadForAccountAndPair
// — which collapses to base × (1 + each market's premium) on a plain account
// (verified equal to the pair getter on chain). The valued two-leg card is
// self-auditing: a full seizure lands on this constant exactly. Every
// liquidation postdates the core's deploy by construction, so the archive
// read always answers — no captured price pipeline, no backend dependency.
//
// One (block, held, owed[, owner+account]) tuple per call — an account
// carries at most a handful of liquidations, and the detail panel fetches
// lazily on expand. Block-pinned facts are immutable, so the response is
// cached hard at the edge.

export const runtime = "nodejs";

const MARGIN = getAddress(DOLOMITE_ADDRESSES.MARGIN);

const MARGIN_ABI = parseAbi([
  "struct Info { address owner; uint256 number; }",
  "function getMarketPrice(uint256 marketId) view returns ((uint256 value))",
  "function getLiquidationSpreadForPair(uint256 heldMarketId, uint256 owedMarketId) view returns ((uint256 value))",
  "function getLiquidationSpreadForAccountAndPair(Info account, uint256 heldMarketId, uint256 owedMarketId) view returns ((uint256 value))",
]);

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const blockParam = p.get("block") ?? "";
  const heldParam = p.get("held") ?? "";
  const owedParam = p.get("owed") ?? "";
  if (!/^\d+$/.test(blockParam) || !/^\d+$/.test(heldParam) || !/^\d+$/.test(owedParam)) {
    return NextResponse.json({ error: "block, held and owed are required (decimal integers)" }, { status: 400 });
  }
  const blockNumber = BigInt(blockParam);
  const held = BigInt(heldParam);
  const owed = BigInt(owedParam);
  // The LIQUIDATED account, when the caller knows it — switches the spread
  // read to the account-aware getter (override accounts seize at their own
  // spread). account is a uint256 decimal string — never parsed as a JS
  // number.
  const ownerParam = (p.get("owner") ?? "").toLowerCase();
  const acctParam = p.get("account") ?? "";
  const liquidAccount =
    /^0x[0-9a-f]{40}$/.test(ownerParam) && /^\d+$/.test(acctParam)
      ? { owner: getAddress(ownerParam), number: BigInt(acctParam) }
      : null;

  try {
    const [heldPrice, owedPrice, pairSpread] = await alchemyClient().multicall({
      allowFailure: true,
      blockNumber,
      contracts: [
        { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketPrice", args: [held] },
        { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketPrice", args: [owed] },
        liquidAccount
          ? {
              address: MARGIN,
              abi: MARGIN_ABI,
              functionName: "getLiquidationSpreadForAccountAndPair",
              args: [liquidAccount, held, owed],
            }
          : { address: MARGIN, abi: MARGIN_ABI, functionName: "getLiquidationSpreadForPair", args: [held, owed] },
      ],
    });

    // A price of zero is a miss, never a fact — the oracle answered nonzero
    // for every market at every liquidation block (the engine could not have
    // fired otherwise), so zero here means the read failed, and the card
    // stays token-only rather than valuing a leg at nothing.
    const heldRaw =
      heldPrice.status === "success" && heldPrice.result.value > BigInt(0) ? heldPrice.result.value : null;
    const owedRaw =
      owedPrice.status === "success" && owedPrice.result.value > BigInt(0) ? owedPrice.result.value : null;
    if (heldRaw == null || owedRaw == null) {
      return NextResponse.json({ error: "oracle price unavailable at block" }, { status: 502 });
    }
    // The spread getter degrades independently: the two legs still value
    // without it, only the self-audit reference drops.
    const spreadRaw =
      pairSpread.status === "success" && pairSpread.result.value > BigInt(0) ? pairSpread.result.value : null;

    return NextResponse.json(
      {
        blockNumber: Number(blockNumber),
        heldMarketId: Number(held),
        owedMarketId: Number(owed),
        // Raw Monetary.Price values, scale 1e(36 − token decimals) — the
        // caller values legs as wei × price ÷ 1e36 (decimals cancel).
        heldPriceRaw: heldRaw.toString(),
        owedPriceRaw: owedRaw.toString(),
        // Decimal.D256 (1e18 = 1.0): the account-aware spread when the
        // liquidated account was named (override-aware, collapsing to base ×
        // (1 + held premium) × (1 + owed premium) on plain accounts), the
        // pair spread otherwise; null when the read missed.
        spreadRaw: spreadRaw?.toString() ?? null,
        spreadBasis: liquidAccount ? "account-aware" : "pair",
      },
      { headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    );
  } catch (error) {
    console.error("Error reading Dolomite prices at block:", error);
    const message = error instanceof Error ? error.message : "at-block read failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
