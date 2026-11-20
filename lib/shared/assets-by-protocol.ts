// A protocol's Assets (rails-ops decision 0069, ui-jobs 786): the assets one
// explorer uses on its chain, from the asset cards (lib/shared/asset-explorer.ts),
// each with what it is in that protocol (its markets) and the other explorers
// that use it on the same chain, every link staying under a protocol.
//
// Pure: type imports only, so client and server code and the tests read it.

import type { AssetCard, AssetChip, CardLine } from "./asset-explorer";
import type { ChipUse } from "./asset-uses";

/** The Assets sub-page's segment under an explorer's route. */
export const ASSETS_SEGMENT = "assets";

/** An explorer's Assets page, or its page for one token. */
export const protocolAssetsHref = (explorerHref: string, token?: string): string =>
  token ? `${explorerHref}/${ASSETS_SEGMENT}/${token.toLowerCase()}` : `${explorerHref}/${ASSETS_SEGMENT}`;

/** An explorer as these pages read it. */
export interface AssetsExplorer {
  id: string;
  label: string;
  href: string;
}

/** One asset the explorer uses on its chain. */
export interface ProtocolAssetLine {
  card: AssetCard;
  line: CardLine;
  /** What the asset is in this protocol, each a link to the protocol's page for it. */
  markets: ChipUse[];
  /** The other explorers that use it on that chain, each linking its page for the asset. */
  also: AssetChip[];
}

/** What the asset is in the protocol, as links (ui-jobs 786): the uses the
 *  explorer's list names (BOLD's trove debt and Stability Pools), else Aave
 *  V3's reserve page, Liquity V2's branch, else the chip's market page or its
 *  listing filtered to the asset. */
export function assetMarkets(e: AssetsExplorer, chip: AssetChip, symbol: string, token: string): ChipUse[] {
  if (chip.uses?.length) return chip.uses;
  if (e.id === "aave-v3") return [{ label: "Reserve", href: `${e.href}/markets/${token.toLowerCase()}` }];
  if (e.id === "liquity")
    return [
      { label: "Branch", href: `${e.href}/branches` },
      { label: "Troves", href: chip.href },
    ];
  if (chip.link === "page") return [{ label: "Market", href: chip.href }];
  if (chip.link === "filtered") return [{ label: `Positions with ${symbol}`, href: chip.href }];
  return [];
}

/** A chip as these pages link it: an explorer's page for the token, where
 *  `hrefOf` knows the explorer; a vault no explorer deploys keeps its page. */
export const chipToProtocolPage = (
  chip: AssetChip,
  token: string,
  hrefOf: (explorer: string) => string | null,
): AssetChip => {
  const at = chip.token ? null : hrefOf(chip.explorer);
  return at ? { ...chip, href: protocolAssetsHref(at, token) } : chip;
};

/** The explorer's lines, in the cards' order (most read first): each card it
 *  lists, on its chain. `linesOf` is `cardLines` (asset-explorer.ts). */
export function protocolAssetLines(
  cards: readonly AssetCard[],
  e: AssetsExplorer,
  linesOf: (c: AssetCard) => CardLine[],
  hrefOf: (explorer: string) => string | null,
): ProtocolAssetLine[] {
  const out: ProtocolAssetLine[] = [];
  for (const card of cards) {
    const chip = card.chips.find((ch) => ch.explorer === e.id);
    if (!chip) continue;
    const line = linesOf(card).find((l) => l.chain === chip.chain && l.chips.some((ch) => ch.explorer === e.id));
    if (!line) continue;
    out.push({
      card,
      line: { ...line, href: protocolAssetsHref(e.href, line.token) },
      markets: assetMarkets(e, chip, card.symbol, line.token),
      also: line.chips.filter((ch) => ch.explorer !== e.id).map((ch) => chipToProtocolPage(ch, line.token, hrefOf)),
    });
  }
  return out;
}

/** The one canonical page of a token on a chain (ui-jobs 786): the first
 *  explorer in `order` (the roster's, by name) that uses it there. */
export function canonicalExplorer(chips: readonly AssetChip[], chain: number, order: readonly string[]): string | null {
  const here = new Set(chips.filter((c) => c.chain === chain && !c.token).map((c) => c.explorer));
  return order.find((id) => here.has(id)) ?? null;
}
