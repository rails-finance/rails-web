import { NextRequest, NextResponse } from "next/server";
import { fetchAssetPricesServer, ROUNDS_REVALIDATE_S } from "@/lib/api/fetch-asset-prices-server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { listedTokenKeys } from "@/lib/api/asset-explorer-chips";
import { fetchAssetPricesAndCards } from "@/lib/api/fetch-asset-explorer-server";
import { ASSETS_SEGMENT } from "@/lib/shared/assets-by-protocol";
import { PROTOCOLS } from "@/lib/shared/protocols";

/** The explorers with an Assets page (decision 0069). */
const WITH_ASSETS = new Set(
  PROTOCOLS.filter((p) => p.subPages.some((s) => s.segment === ASSETS_SEGMENT)).map((p) => p.id),
);

/**
 * The Prices list's rows (lib/shared/asset-prices.ts; rails-ops
 * reference/asset-key-map.md): per asset page, the price its chart's main
 * line gives (the last completed day, or on stored rounds the value in force
 * at the checkpoint), the 30 days before as a sparkline and the change over
 * them. The asset icon's popover reads it. Cached as long as the rounds' reads.
 * `unpriced` names the tokens with a page and no stored price: every token an
 * explorer lists that the roster does not price (the asset page's
 * `unpricedPage`). `paged` names the tokens an explorer has a page for under
 * it (decision 0069); a row with none draws no link (`href` null).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = readerIpFromRequest(request);
    // One build gives the list and the cards; where the cards fail, the list
    // alone is built and every row keeps its link.
    const [built, listed] = await Promise.all([
      fetchAssetPricesAndCards(ip).catch(() => null),
      listedTokenKeys().catch(() => [] as string[]),
    ]);
    const list = built?.list ?? (await fetchAssetPricesServer(ip));
    const cards = built?.cards ?? null;
    const priced = new Set(list.rows.flatMap((r) => r.chains.map((c) => `${c}:${r.token}`)));
    const unpriced = listed.filter((k) => !priced.has(k));
    // Where the cards were not read, every row keeps its link (the resolver
    // sends a token with no page back).
    const paged = cards
      ? new Set(
          cards.flatMap((c) =>
            c.chains
              .filter((x) => c.chips.some((ch) => ch.chain === x.chain && WITH_ASSETS.has(ch.explorer)))
              .map((x) => `${x.chain}:${x.token}`),
          ),
        )
      : null;
    const has = (href: string | null, chain: number, token: string) =>
      href && (!paged || paged.has(`${chain}:${token}`)) ? href : null;
    const rows = list.rows.map((r) => ({
      ...r,
      href: has(r.href, r.chain, r.token),
      ...(r.also
        ? { also: r.also.filter((a) => !paged || r.chains.some((c) => paged.has(`${c}:${a.href.split("/").pop()}`))) }
        : {}),
    }));
    return NextResponse.json(
      { ...list, rows, unpriced, ...(paged ? { paged: [...paged] } : {}) },
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
