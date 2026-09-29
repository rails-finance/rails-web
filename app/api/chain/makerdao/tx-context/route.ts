import { NextRequest, NextResponse } from "next/server";
import { readMakerTxContext } from "@/lib/sources/chain/makerdao-tx-context";

// What one transaction around a MakerDAO vault's ownership did: its parties,
// the tools that logged, a flash loan, a migrated Sai CDP
// (lib/sources/chain/makerdao-tx-context.ts). A mined transaction never
// changes, so the answer is cached hard at the edge. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tx = sp.get("tx") ?? "";
  const addresses = (sp.get("addresses") ?? "").split(",").filter(Boolean);
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(tx) ||
    addresses.length > 8 ||
    addresses.some((a) => !/^0x[0-9a-fA-F]{40}$/.test(a))
  ) {
    return NextResponse.json({ error: "tx and up to 8 addresses are required" }, { status: 400 });
  }
  try {
    const data = await readMakerTxContext(tx.toLowerCase() as `0x${string}`, addresses);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the MakerDAO transaction:", error);
    return NextResponse.json({ error: "Failed to read the transaction" }, { status: 502 });
  }
}
