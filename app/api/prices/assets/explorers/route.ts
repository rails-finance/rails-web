import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { explorerAssetIndex } from "@/lib/api/explorer-asset-index";

const REVALIDATE_S = 3600;

const cached = unstable_cache(explorerAssetIndex, ["explorer-asset-index-v2"], { revalidate: REVALIDATE_S });

/**
 * Which explorers list which assets (lib/api/explorer-asset-index.ts), for the
 * asset preference's filter on the explorer chooser, the home tiles and
 * /start (ui-jobs 557). Read once per page load; cached an hour.
 */
export async function GET() {
  try {
    return NextResponse.json(await cached(), {
      headers: { "Cache-Control": `public, max-age=${REVALIDATE_S}, s-maxage=${REVALIDATE_S}` },
    });
  } catch (error) {
    console.error("Error building the explorer asset index:", error);
    return NextResponse.json({ error: "Failed to build the explorer asset index" }, { status: 500 });
  }
}
