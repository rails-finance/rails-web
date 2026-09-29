import { NextRequest, NextResponse } from "next/server";
import { readMakerAuction } from "@/lib/sources/chain/makerdao-history";

// How the Clipper auction behind one MakerDAO liquidation ran: the Dog's Bark
// and the Clipper's Kick in the grab's transaction, and the Clipper's Take logs
// for that auction (lib/sources/chain/makerdao-history.ts). A settled auction
// never changes, so it is cached hard at the edge; one still running is not.
// Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tx = sp.get("tx") ?? "";
  const urn = sp.get("urn") ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx) || !/^0x[0-9a-fA-F]{40}$/.test(urn)) {
    return NextResponse.json({ error: "tx and urn are required" }, { status: 400 });
  }
  try {
    const data = await readMakerAuction(tx.toLowerCase() as `0x${string}`, urn);
    const settled = data.kind === "not-read" || data.settled;
    return NextResponse.json(data, {
      headers: { "Cache-Control": settled ? "public, max-age=86400, s-maxage=604800" : "no-store" },
    });
  } catch (error) {
    console.error("Error reading the MakerDAO auction:", error);
    return NextResponse.json({ error: "Failed to read the auction" }, { status: 502 });
  }
}
