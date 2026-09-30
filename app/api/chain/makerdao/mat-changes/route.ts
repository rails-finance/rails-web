import { NextRequest, NextResponse } from "next/server";
import { readMakerMatChanges } from "@/lib/sources/chain/makerdao-tx-context";

// Changes to one MakerDAO ilk's minimum collateral ratio between two mined
// blocks: the Spotter's file(ilk, "mat", value) logs
// (lib/sources/chain/makerdao-tx-context.ts). Mined blocks never change, so
// the answer is cached hard at the edge. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ilk = sp.get("ilk") ?? "";
  const from = Number(sp.get("from"));
  const to = Number(sp.get("to"));
  if (!/^[A-Z0-9-]{1,32}$/.test(ilk) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return NextResponse.json({ error: "ilk, from and to are required" }, { status: 400 });
  }
  try {
    const data = await readMakerMatChanges(ilk, from, to);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the MakerDAO minimum-ratio changes:", error);
    return NextResponse.json({ error: "Failed to read the minimum-ratio changes" }, { status: 502 });
  }
}
