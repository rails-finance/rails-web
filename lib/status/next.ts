// What Rails builds next, for the status page's "Next" section (rails-ops
// ui-jobs 583 part 3). The array order is the order on the page; the manager
// session keeps it in step with Miles's rulings. An item whose `indexes` all
// reach the head in the status table leaves this list there.
//
// Each line states one fact from rails-ops reference documents or the
// protocol's official docs, and `source` names where a reader can check it.

import { ROBINHOOD_CHAIN_ID as ROBINHOOD } from "../shared/chains";

export type NextStage = "indexing" | "building" | "built" | "surveyed" | "planned" | "considering";

export const NEXT_STAGE_WORDS: Record<NextStage, string> = {
  indexing: "Indexing",
  building: "Building",
  built: "Built, launch pending",
  surveyed: "Surveyed",
  planned: "Planned",
  considering: "Considering",
};

export interface NextItem {
  /** Stable key for the row. */
  key: string;
  /** The protocol as the page names it. */
  name: string;
  /** The roster id whose mark the row wears. */
  mark: string;
  /** Chain ids, in the order the row draws them. */
  chains: number[];
  stage: NextStage;
  why: string;
  source: { label: string; href: string };
  /** The server's (protocol, chain) index keys; the item leaves this list
   *  once every one is at the head in the status table. */
  indexes?: { protocol: string; chain: number }[];
}

export const NEXT: NextItem[] = [
  {
    key: "cow-l2",
    name: "CoW",
    mark: "cow",
    chains: [8453, 42161],
    stage: "indexing",
    why: "Every settlement and order from deployment, first in line.",
    source: { label: "docs.cow.fi", href: "https://docs.cow.fi" },
    indexes: [
      { protocol: "cow", chain: 8453 },
      { protocol: "cow", chain: 42161 },
    ],
  },
  {
    key: "uniswap-v3-base",
    name: "Uniswap V3",
    mark: "uniswap",
    chains: [8453],
    stage: "planned",
    why: "Full history. Base's free gateway serves 1,000 blocks a request, so it takes weeks.",
    source: { label: "docs.uniswap.org", href: "https://docs.uniswap.org" },
    indexes: [{ protocol: "uniswap-v3", chain: 8453 }],
  },
  {
    key: "aerodrome-base",
    name: "Aerodrome",
    mark: "aerodrome",
    chains: [8453],
    stage: "planned",
    why: "Full history. Base's free gateway serves 1,000 blocks a request, so it takes weeks.",
    source: { label: "aerodrome.finance", href: "https://aerodrome.finance" },
    indexes: [{ protocol: "aerodrome", chain: 8453 }],
  },
  {
    key: "lido",
    name: "Lido",
    mark: "lido",
    chains: [1],
    stage: "planned",
    why: "stETH, wstETH and the withdrawal queue, each from deployment.",
    source: { label: "docs.lido.fi", href: "https://docs.lido.fi" },
    indexes: [{ protocol: "lido", chain: 1 }],
  },
  {
    key: "morpho-robinhood",
    name: "Morpho Blue",
    mark: "morpho",
    chains: [ROBINHOOD],
    stage: "surveyed",
    why: "The chain's largest lending venue: about $510M supplied across 532 markets, plus 53 Vault V2s (2 Nov 2026).",
    source: { label: "docs.robinhood.com/chain", href: "https://docs.robinhood.com/chain" },
  },
  {
    key: "uniswap-robinhood",
    name: "Uniswap V3 and V4",
    mark: "uniswap",
    chains: [ROBINHOOD],
    stage: "planned",
    why: "After Morpho Blue, on the same chain.",
    source: { label: "docs.uniswap.org", href: "https://docs.uniswap.org" },
  },
  {
    key: "morpho-vaults-arc-op",
    name: "Morpho vaults",
    mark: "morpho",
    chains: [5042, 10],
    stage: "planned",
    why: "Morpho's vault factories are deployed on both chains.",
    source: { label: "docs.morpho.org", href: "https://docs.morpho.org" },
  },
  {
    key: "derive",
    name: "Derive V3",
    mark: "derive",
    chains: [1],
    stage: "considering",
    why: "Custody on Ethereum and trading off-chain, so positions would show as Derive reports them.",
    source: { label: "docs.derive.xyz", href: "https://docs.derive.xyz" },
  },
];

/** The items still to show: an item with indexes leaves once all of them
 *  are at the head. `atHead` answers for one (protocol, chain). */
export function nextItems(atHead: (protocol: string, chain: number) => boolean): NextItem[] {
  return NEXT.filter((i) => !i.indexes || !i.indexes.every((x) => atHead(x.protocol, x.chain)));
}
