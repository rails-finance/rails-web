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
  /** Its positions' name, plural: "Positions", "Troves", "Accounts". */
  noun: string;
}

/** The explorers with a page per asset at `markets/<underlying>`: a reserve
 *  page (M3) on the Aave family, a market page on the others. */
const RESERVE_PAGES = new Set(["aave-v3", "aave-v3-base", "spark", "seamless"]);
const MARKET_PAGES = new Set(["compound-v2", "moonwell", "moonwell-base"]);
/** The Liquity family: a collateral is a branch. */
const BRANCHES = new Set(["liquity", "asymmetry", "ebisu", "basedollar"]);

/** One asset the explorer uses on its chain. */
export interface ProtocolAssetLine {
  card: AssetCard;
  line: CardLine;
  /** What the asset is in this protocol, each a link to the protocol's page for it. */
  markets: ChipUse[];
  /** The other explorers that use it on that chain, each linking its page for the asset. */
  also: AssetChip[];
}

/** "/markets" or "/markets/0x…" under the explorer: "Markets". */
const pageWord = (e: AssetsExplorer, href: string): string => {
  const seg = href.slice(e.href.length).split(/[/?#]/)[1] ?? "";
  return seg ? seg[0].toUpperCase() + seg.slice(1).replace(/-/g, " ") : e.label;
};

/** What the asset is in the protocol, as links (ui-jobs 786): the uses the
 *  explorer's list names (a debt token's Trove debt and Stability Pools, a
 *  Pendle market), else its reserve or market page where the explorer has a
 *  page per asset, its branch on the Liquity family, then the chip's page
 *  ("Markets", "Vaults") or the listing filtered to it (the positions' noun). */
export function assetMarkets(e: AssetsExplorer, chip: AssetChip, token: string): ChipUse[] {
  if (chip.uses?.length) return chip.uses;
  const t = token.toLowerCase();
  if (RESERVE_PAGES.has(e.id)) return [{ label: "Reserve", href: `${e.href}/markets/${t}` }];
  if (MARKET_PAGES.has(e.id)) return [{ label: "Market", href: `${e.href}/markets/${t}` }];
  const out: ChipUse[] = BRANCHES.has(e.id) ? [{ label: "Branch", href: `${e.href}/branches` }] : [];
  if (chip.link === "page") out.push({ label: pageWord(e, chip.href), href: chip.href });
  if (chip.link === "filtered") out.push({ label: e.noun, href: chip.href });
  return out;
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
      markets: assetMarkets(e, chip, line.token),
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
