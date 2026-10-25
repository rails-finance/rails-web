import { NextRequest, NextResponse } from "next/server";
import { fetchAssetPricesServer } from "@/lib/api/fetch-asset-prices-server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

/**
 * The Prices list's rows (lib/shared/asset-prices.ts; rails-ops
 * reference/asset-key-map.md): per asset page, the price its chart's first
 * line gives on the last completed day, the 30 days before as a sparkline and
 * the change over them. The asset icon's popover reads it.
 */
export async function GET(request: NextRequest) {
  try {
    const list = await fetchAssetPricesServer(readerIpFromRequest(request));
    return NextResponse.json(list, { headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" } });
  } catch (error) {
    console.error("Error building the asset price list:", error);
    return NextResponse.json({ error: "Failed to read the asset prices" }, { status: 500 });
  }
}
