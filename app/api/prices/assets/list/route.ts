import { NextRequest, NextResponse } from "next/server";
import { fetchAssetPricesServer, ROUNDS_REVALIDATE_S } from "@/lib/api/fetch-asset-prices-server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { listedTokenKeys } from "@/lib/api/asset-explorer-chips";

/**
 * The Prices list's rows (lib/shared/asset-prices.ts; rails-ops
 * reference/asset-key-map.md): per asset page, the price its chart's main
 * line gives (the last completed day, or on stored rounds the value in force
 * at the checkpoint), the 30 days before as a sparkline and the change over
 * them. The asset icon's popover reads it. Cached as long as the rounds' reads.
 * `unpriced` names the tokens with a page and no stored price: every token an
 * explorer lists that the roster does not price (the asset page's
 * `unpricedPage`).
 */
export async function GET(request: NextRequest) {
  try {
    const [list, listed] = await Promise.all([
      fetchAssetPricesServer(readerIpFromRequest(request)),
      listedTokenKeys().catch(() => [] as string[]),
    ]);
    const priced = new Set(list.rows.flatMap((r) => r.chains.map((c) => `${c}:${r.token}`)));
    const unpriced = listed.filter((k) => !priced.has(k));
    return NextResponse.json(
      { ...list, unpriced },
      {
        headers: {
          "Cache-Control": `public, max-age=${ROUNDS_REVALIDATE_S}, s-maxage=${ROUNDS_REVALIDATE_S}`,
        },
      },
    );
  } catch (error) {
    console.error("Error building the asset price list:", error);
    return NextResponse.json({ error: "Failed to read the asset prices" }, { status: 500 });
  }
}
