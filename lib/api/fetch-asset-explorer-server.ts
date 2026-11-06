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
import { rowFor, type AssetPriceList, type AssetPriceRow, type ChainPrice } from "@/lib/shared/asset-prices";

/** A row as a card holds it: the lines other explorers read are the icon
 *  popover's (`rowFor`'s `via`), and the cards do not draw them. */
const bare = <T extends ChainPrice>({ alt: _alt, picks: _picks, ...r }: T) => r;

export interface AssetExplorerData {
  cards: AssetCard[];
  day: AssetPriceList["day"];
  /** Whether any card's price reads stored rounds. */
  rounds: boolean;
}

async function buildCards(readerIp?: string | null) {
  const { roster, pages, list } = await buildAssetPrices(readerIp);
  const [{ chips, listed }, figures] = await Promise.all([
    assetChips(roster.assets),
    assetCardFigures().catch(() => [] as Awaited<ReturnType<typeof assetCardFigures>>),
  ]);
  const links = new Map(pages.map((p) => [p.page.token, { underlying: p.page.underlying, wrapped: p.page.wrapped }]));
  const rows = list.rows.map((r) => ({ ...bare(r), elsewhere: r.elsewhere.map(bare) }));
  return { list, cards: assetCards({ ...list, rows }, links, chips, listed, new Map(figures)) };
}

export async function fetchAssetExplorerServer(readerIp?: string | null): Promise<AssetExplorerData> {
  const { list, cards } = await buildCards(readerIp);
  return { cards, day: list.day, rounds: list.rows.some((r) => r.asOf) };
}

/** The asset page's top band (A1): the card of the token on that chain, and
 *  its row on that chain, priced with `via` by the line its explorer reads. */
export async function fetchAssetHeadServer(
  chain: number,
  token: string,
  via: string | null,
  readerIp?: string | null,
): Promise<{ card: AssetCard | null; row: AssetPriceRow | null }> {
  const { list, cards } = await buildCards(readerIp);
  const t = token.toLowerCase();
  const row = rowFor(list, chain, t, via);
  return {
    card: cards.find((c) => c.chains.some((x) => x.chain === chain && x.token === t)) ?? null,
    row: row ? { ...bare(row), elsewhere: [] } : null,
  };
}
