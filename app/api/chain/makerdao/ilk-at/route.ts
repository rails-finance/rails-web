import { NextRequest, NextResponse } from "next/server";
import { MAKER_ILK_AT_MAX_BLOCKS, readMakerIlkAtBlocks } from "@/lib/sources/chain/makerdao-history";

// One MakerDAO ilk's risk state at up to 60 mined blocks: the OSM price, the
// minimum collateral ratio and the minimum debt (lib/sources/chain/makerdao-history.ts).
// The vault page asks for its rows' blocks. A mined block never changes, so the
// answer is kept in process memory and cached hard at the edge. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ilk = sp.get("ilk") ?? "";
  const blocks = (sp.get("blocks") ?? "")
    .split(",")
    .filter(Boolean)
    .map((b) => (/^\d{1,10}$/.test(b) ? Number(b) : NaN));
  if (
    !/^[A-Z0-9-]{1,32}$/.test(ilk) ||
    blocks.length === 0 ||
    blocks.length > MAKER_ILK_AT_MAX_BLOCKS ||
    blocks.some((b) => !Number.isFinite(b) || b < 1)
  ) {
    return NextResponse.json({ error: `ilk and 1–${MAKER_ILK_AT_MAX_BLOCKS} blocks are required` }, { status: 400 });
  }
  try {
    const data = await readMakerIlkAtBlocks(ilk, blocks);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the MakerDAO ilk at blocks:", error);
    return NextResponse.json({ error: "Failed to read the ilk at those blocks" }, { status: 502 });
  }
}
