// The asset explorer — /assets (rails-ops reference/asset-key-map.md, "The
// asset explorer" and "The Prices list"): a table row per asset in the price
// roster with its price, its chains and the Rails explorers that list it.

import { AssetExplorer } from "@/components/assets/asset-explorer";
import { explorerState } from "@/lib/shared/asset-explorer";
import { fetchAssetExplorerServer } from "@/lib/api/fetch-asset-explorer-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Assets",
  description:
    "Each asset the lending protocols' oracles price: its price with the last 30 days, its chains, and the Rails explorers that list it.",
  robots: { index: false, follow: false },
};

const DAY_MS = 86_400_000;

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, sp] = await Promise.all([
    fetchAssetExplorerServer(await readerIpFromHeaders()).catch(() => null),
    searchParams,
  ]);
  const initialSearch = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x]))),
  ).toString();
  // The (i) drawer's body: what the list is and the day its prices read.
  const about = data?.day != null && (
    <p data-asset-prices-day={data.day}>
      Each asset a Rails explorer lists or a lending protocol&rsquo;s oracle prices, with the explorers that list it.
      Prices at the close of {formatDate(new Date(data.day * DAY_MS))}, from the main line on each asset&rsquo;s page;
      {data.rounds && " a price stamped after its figure reads the line’s stored rounds, in force at the stamp;"} the
      line and the change cover 30 days. A marked price has a fixed price on its page or a line more than 1 % from its
      main line in those 30 days. The categories are Rails&rsquo; classification.
    </p>
  );
  return (
    <div className="min-h-screen">
      <div className="py-8">
        {data ? (
          <AssetExplorer cards={data.cards} initial={explorerState(sp)} initialSearch={initialSearch} about={about} />
        ) : (
          <>
            <h1 className="mb-4 text-2xl font-semibold text-foreground" data-anatomy="A5">
              Assets
            </h1>
            <p className="text-sm text-rb-500" data-asset-prices="failed">
              The prices were not read.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
