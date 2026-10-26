// The asset explorer's cards for /assets (rails-ops reference/asset-key-map.md,
// "The asset explorer"): the Prices list's rows, the chips each token's
// explorers give it, and the pages' wrapper links.
//
// SERVER-ONLY.

import "server-only";
import { buildAssetPrices } from "@/lib/api/fetch-asset-prices-server";
import { assetChips } from "@/lib/api/asset-explorer-chips";
import { assetCards, type AssetCard } from "@/lib/shared/asset-explorer";
import type { AssetPriceList } from "@/lib/shared/asset-prices";

export interface AssetExplorerData {
  cards: AssetCard[];
  day: AssetPriceList["day"];
  /** Whether any card's price reads stored rounds. */
  rounds: boolean;
}

export async function fetchAssetExplorerServer(readerIp?: string | null): Promise<AssetExplorerData> {
  const { roster, pages, list } = await buildAssetPrices(readerIp);
  const chips = await assetChips(roster.assets);
  const links = new Map(pages.map((p) => [p.page.token, { underlying: p.page.underlying, wrapped: p.page.wrapped }]));
  return { cards: assetCards(list, links, chips), day: list.day, rounds: list.rows.some((r) => r.asOf) };
}
