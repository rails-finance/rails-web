// The protocols index — /protocols, "Protocols by chain" (anatomy E8; rails-ops
// decisions 0068 point 2, 0069 point 1 and 0070, ui-jobs 781, 786): the top
// level, a CROSS-INDEX owning no page, and a roster (0070). One chain at a
// time by chain tabs (`?chain=<id>`, Ethereum by default), a line per launched
// explorer with its category (lib/shared/protocol-types.ts), its sections, its
// assets and its About, as its menu names them (explorerSections). Built from
// the roster and the asset cards its Assets pages read, so it shows no chain
// figure. The body is components/protocols/protocol-index.tsx.

import { ProtocolIndex } from "@/components/protocols/protocol-index";
import { type ChainId } from "@/lib/shared/chains";
import { explorerSections, LAUNCHED_PROTOCOLS, launchedChains } from "@/lib/shared/protocols";
import {
  ANY_TOKEN_TYPES,
  PROTOCOLS_INDEX_HREF,
  protocolIndexState,
  type ProtocolIndexAsset,
  type ProtocolIndexRow,
} from "@/lib/shared/protocol-index";
import { ASSETS_SEGMENT } from "@/lib/shared/assets-by-protocol";
import { fetchAssetExplorerServer } from "@/lib/api/fetch-asset-explorer-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { PROTOCOL_TYPE_LABELS, type ProtocolType } from "@/lib/shared/protocol-types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Protocols by chain",
  description:
    "Each protocol Rails runs an explorer for, one chain at a time, with its category and its sections: positions, markets, assets and more.",
  alternates: { canonical: PROTOCOLS_INDEX_HREF },
  robots: { index: false, follow: false },
};

export default async function ProtocolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, read] = await Promise.all([
    searchParams,
    // The assets each explorer's Assets page lists, from the cards those pages
    // read (cached); where the read fails no line states its assets.
    fetchAssetExplorerServer(await readerIpFromHeaders()).catch(() => null),
  ]);
  const byExplorer = new Map<string, ProtocolIndexAsset[]>();
  for (const card of read?.cards ?? [])
    for (const chip of card.chips) {
      const have = byExplorer.get(chip.explorer) ?? [];
      if (have.some((a) => a.symbol === card.symbol)) continue;
      const token = card.chains.find((x) => x.chain === chip.chain)?.token ?? card.chains[0]?.token ?? "";
      byExplorer.set(chip.explorer, [...have, { symbol: card.symbol, address: token, chainId: chip.chain }]);
    }
  // The menu's entries split in three cells, in its order: the sections, the
  // Assets page, About.
  const rows: ProtocolIndexRow[] = LAUNCHED_PROTOCOLS.map((p) => {
    const all = explorerSections(p);
    const assets = all.find((x) => x.kind === "subPage" && x.sub?.segment === ASSETS_SEGMENT);
    return {
      id: p.id,
      label: p.label,
      type: p.type,
      chainId: p.chainId,
      href: p.href,
      sections: all.filter((x) => x !== assets && x.kind !== "info").map(({ href, name }) => ({ href, name })),
      assetsHref: assets?.href ?? null,
      assets: read ? (byExplorer.get(p.id) ?? []) : null,
      anyToken: ANY_TOKEN_TYPES.includes(p.type),
      aboutHref: p.infoHref,
    };
  });
  // The tabs: the launched chains with an explorer, in the chain order.
  // A testnet (Sepolia) stays a tab, last and marked (decision 0070).
  const chains = launchedChains()
    .filter((c) => rows.some((r) => r.chainId === c.id))
    .sort((a, b) => Number(Boolean(a.testnet)) - Number(Boolean(b.testnet)))
    .map((c) => ({ id: c.id as ChainId as number, name: c.name, testnet: Boolean(c.testnet) }));
  return (
    <div className="min-h-screen">
      <div className="py-8" data-protocol-index="">
        <ProtocolIndex
          rows={rows}
          chains={chains}
          initial={protocolIndexState(
            sp,
            Object.keys(PROTOCOL_TYPE_LABELS) as ProtocolType[],
            chains.map((c) => c.id),
          )}
        />
      </div>
    </div>
  );
}
