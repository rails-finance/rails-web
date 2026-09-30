import { NextRequest, NextResponse } from "next/server";
import { readPwnCollateralTransfers } from "@/lib/sources/chain/pwn-collateral-transfer";

// Chain arm of the PWN collateral-return read: how an NFT collateral came back
// to a borrower between an earlier loan's default claim and a new loan
// (lib/sources/chain/pwn-collateral-transfer.ts). Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const asset = sp.get("asset") ?? "";
  const category = sp.get("category");
  const id = sp.get("id") ?? "";
  const lender = sp.get("lender") ?? "";
  const borrower = sp.get("borrower") ?? "";
  const fromBlock = Number(sp.get("fromBlock"));
  const toBlock = Number(sp.get("toBlock"));
  if (![asset, lender, borrower].every((a) => ADDRESS.test(a)))
    return NextResponse.json({ error: "asset, lender and borrower must be addresses" }, { status: 400 });
  if (category !== "ERC721" && category !== "ERC1155")
    return NextResponse.json({ error: "category must be ERC721 or ERC1155" }, { status: 400 });
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "id (token id) is required" }, { status: 400 });
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock) || fromBlock <= 0 || toBlock < fromBlock)
    return NextResponse.json({ error: "fromBlock ≤ toBlock are required" }, { status: 400 });
  // The read spans the gap between two loans; refuse a span no loan page asks for.
  if (toBlock - fromBlock > 3_000_000) return NextResponse.json({ error: "block span too wide" }, { status: 400 });
  try {
    const transfers = await readPwnCollateralTransfers({
      asset: asset.toLowerCase(),
      category,
      id,
      lender: lender.toLowerCase(),
      borrower: borrower.toLowerCase(),
      fromBlock,
      toBlock,
    });
    return NextResponse.json({ transfers });
  } catch (error) {
    console.error("PWN collateral transfer read failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "read failed" }, { status: 500 });
  }
}
