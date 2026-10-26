// The asset explorer's cards for /assets (rails-ops reference/asset-key-map.md,
// "The asset explorer"): the Prices list's rows, the chips each token's
// explorers give it, the pages' wrapper links, and the figures of the cards
// without a price.
//
// SERVER-ONLY.

import "server-only";
import { buildAssetPrices } from "@/lib/api/fetch-asset-prices-server";
import { assetChips } from "@/lib/api/asset-explorer-chips";
import { assetCardFigures } from "@/lib/api/asset-card-figures";
import { assetCards, type AssetCard } from "@/lib/shared/asset-explorer";
import type { AssetPriceList, ChainPrice } from "@/lib/shared/asset-prices";

/** A row as a card holds it: the lines other explorers read are the icon
 *  popover's (`rowFor`'s `via`), and the cards do not draw them. */
const bare = <T extends ChainPrice>({ alt: _alt, picks: _picks, ...r }: T) => r;

export interface AssetExplorerData {
  cards: AssetCard[];
  day: AssetPriceList["day"];
  /** Whether any card's price reads stored rounds. */
  rounds: boolean;
}

export async function fetchAssetExplorerServer(readerIp?: string | null): Promise<AssetExplorerData> {
  const { roster, pages, list } = await buildAssetPrices(readerIp);
  const [{ chips, listed }, figures] = await Promise.all([
    assetChips(roster.assets),
    assetCardFigures().catch(() => [] as Awaited<ReturnType<typeof assetCardFigures>>),
  ]);
  const links = new Map(pages.map((p) => [p.page.token, { underlying: p.page.underlying, wrapped: p.page.wrapped }]));
  const rows = list.rows.map((r) => ({ ...bare(r), elsewhere: r.elsewhere.map(bare) }));
  return {
    cards: assetCards({ ...list, rows }, links, chips, listed, new Map(figures)),
    day: list.day,
    rounds: list.rows.some((r) => r.asOf),
  };
}
