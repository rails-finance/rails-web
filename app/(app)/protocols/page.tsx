// The protocols index — /protocols (anatomy E8; rails-ops decision 0068
// points 2 and 8, ui-jobs 781): a CROSS-INDEX, owning no page. A group per
// protocol (a version) with its category (lib/shared/protocol-types.ts), one
// line per launched explorer opening it, with the assets that explorer lists,
// from the read /assets makes. Built from the roster with no chain read, so it shows no chain
// figure. It spans chains, so it sits under no chain and no explorer rail.
// The body is components/protocols/protocol-index.tsx.

import { ProtocolIndex } from "@/components/protocols/protocol-index";
import { fetchAssetExplorerServer } from "@/lib/api/fetch-asset-explorer-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { CHAINS, type ChainId, type ChainMeta } from "@/lib/shared/chains";
import { LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";
import {
  groupProtocolRows,
  PROTOCOLS_INDEX_HREF,
  protocolIndexState,
  type ProtocolIndexAsset,
} from "@/lib/shared/protocol-index";
import { PROTOCOL_TYPE_LABELS, type ProtocolType } from "@/lib/shared/protocol-types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Protocols",
  description:
    "Each protocol Rails runs an explorer for, with its category, the chains Rails reads it on and the assets its explorers list.",
  alternates: { canonical: PROTOCOLS_INDEX_HREF },
  robots: { index: false, follow: false },
};

const CHAIN_ORDER = (Object.values(CHAINS) as ChainMeta[]).map((c) => c.id);

export default async function ProtocolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, read] = await Promise.all([
    searchParams,
    // The assets /assets lists per explorer, from the read it makes (cached);
    // where it fails no row states its assets.
    fetchAssetExplorerServer(await readerIpFromHeaders()).catch(() => null),
  ]);
  // Each explorer's assets, in /assets's order, one per symbol.
  const byExplorer = new Map<string, ProtocolIndexAsset[]>();
  for (const card of read?.cards ?? [])
    for (const chip of card.chips) {
      const have = byExplorer.get(chip.explorer) ?? [];
      if (have.some((a) => a.symbol === card.symbol)) continue;
      const token = card.chains.find((x) => x.chain === chip.chain)?.token ?? card.chains[0]?.token ?? "";
      byExplorer.set(chip.explorer, [...have, { symbol: card.symbol, address: token, chainId: chip.chain }]);
    }
  const rows = groupProtocolRows(
    LAUNCHED_PROTOCOLS,
    (p) => ({
      id: p.id,
      chainId: p.chainId,
      chainName: CHAINS[p.chainId as ChainId].name,
      chainOrder: CHAIN_ORDER.indexOf(p.chainId),
      href: p.href,
    }),
    (id) => (read ? (byExplorer.get(id) ?? []) : null),
  );
  return (
    <div className="min-h-screen">
      <div className="py-8" data-protocol-index="">
        <ProtocolIndex
          rows={rows}
          initial={protocolIndexState(sp, Object.keys(PROTOCOL_TYPE_LABELS) as ProtocolType[])}
        />
      </div>
    </div>
  );
}
