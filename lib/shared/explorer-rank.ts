// The explorer chooser's split of a chain's explorers (rails-ops TO-DO-ui-jobs
// 503): the most used shown, the long tail behind "View all".
//
// RULE: "most used" is the value held on that chain, from the home page's
// value-held rows (explorer-rank.json, written by `pnpm explorer-rank`). The
// top FEATURED counted explorers show, alphabetically; an explorer with no
// counted row is in the long tail. A chain with FEATURED explorers or fewer
// shows them all and has no tail.

import rank from "@/lib/shared/explorer-rank.json";
import type { ChainId } from "@/lib/shared/chains";
import { protocolsForChain, type ProtocolEntry } from "@/lib/shared/protocols";

const FEATURED = 8;

const byLabel = (a: ProtocolEntry, b: ProtocolEntry) => a.label.localeCompare(b.label, "en-US");

/** A chain's explorers: the featured ones and the whole roster, both by label. */
export function chainExplorers(chainId: ChainId): { featured: ProtocolEntry[]; all: ProtocolEntry[] } {
  const all = [...protocolsForChain(chainId)].sort(byLabel);
  if (all.length <= FEATURED) return { featured: all, all };
  const ranked = (rank.byChain as Record<string, string[]>)[String(chainId)] ?? [];
  const featured = ranked
    .map((slug) => all.find((p) => p.slug === slug))
    .filter((p): p is ProtocolEntry => p != null)
    .slice(0, FEATURED)
    .sort(byLabel);
  return { featured, all };
}
