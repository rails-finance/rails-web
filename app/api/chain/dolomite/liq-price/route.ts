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
  "function getLiquidationSpread() view returns ((uint256 value))",
  "function getMarketSpreadPremium(uint256 marketId) view returns ((uint256 value))",
  "function getAccountRiskOverrideByAccount(Info account) view returns ((uint256 value) marginRatioOverride, (uint256 value) liquidationSpreadOverride)",
  "function getAdjustedAccountValues(Info account) view returns ((uint256 value) supplyValue, (uint256 value) borrowValue)",
  "function getMarginRatioForAccount(Info account) view returns ((uint256 value))",
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
    // What the spread is made of, at the same block: the global base spread,
    // each market's spread premium, and the account's override where one is
    // set (a nonzero liquidationSpreadOverride replaces base × premiums).
    // And the account's health at the end of the block BEFORE: adjusted
    // supply ÷ (adjusted borrow × its margin requirement). Dolomite
    // liquidates half the debt when that is 0.95 or above and the collateral
    // market allows partial liquidation (docs.dolomite.io, risk management).
    const [base, heldPrem, owedPrem, override] = await alchemyClient().multicall({
      allowFailure: true,
      blockNumber,
      contracts: [
        { address: MARGIN, abi: MARGIN_ABI, functionName: "getLiquidationSpread" },
        { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketSpreadPremium", args: [held] },
        { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketSpreadPremium", args: [owed] },
        liquidAccount
          ? {
              address: MARGIN,
              abi: MARGIN_ABI,
              functionName: "getAccountRiskOverrideByAccount",
              args: [liquidAccount],
            }
          : { address: MARGIN, abi: MARGIN_ABI, functionName: "getLiquidationSpread" },
      ] as const,
    });
    let healthBefore: number | null = null;
    if (liquidAccount) {
      const [adj, ratio] = await alchemyClient().multicall({
        allowFailure: true,
        blockNumber: blockNumber - BigInt(1),
        contracts: [
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getAdjustedAccountValues", args: [liquidAccount] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarginRatioForAccount", args: [liquidAccount] },
        ],
      });
      if (adj.status === "success" && ratio.status === "success") {
        const [supply, borrow] = adj.result as readonly [{ value: bigint }, { value: bigint }];
        const req = 1 + Number((ratio.result as { value: bigint }).value) / 1e18;
        const b = Number(borrow.value);
        if (b > 0) healthBefore = Number(supply.value) / (b * req);
      }
    }
    const d256 = (r: { status: string; result?: unknown }): string | null =>
      r.status === "success" ? (r.result as { value: bigint }).value.toString() : null;
    const overrideSpread =
      liquidAccount && override.status === "success"
        ? (override.result as readonly [{ value: bigint }, { value: bigint }])[1].value
        : null;

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
        // The spread's parts (Decimal.D256 strings; null where the read
        // missed): base × (1 + held premium) × (1 + owed premium) unless the
        // override spread is nonzero.
        baseSpreadRaw: d256(base),
        heldSpreadPremiumRaw: d256(heldPrem),
        owedSpreadPremiumRaw: d256(owedPrem),
        overrideSpreadRaw: overrideSpread != null && overrideSpread > BigInt(0) ? overrideSpread.toString() : null,
        // Health just before the liquidation (end of the previous block);
        // null when the account was not named or the read missed.
        healthBefore,
      },
      { headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    );
  } catch (error) {
    console.error("Error reading Dolomite prices at block:", error);
    const message = error instanceof Error ? error.message : "at-block read failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
