// The asset explorer — /assets (rails-ops reference/asset-key-map.md, "The
// asset explorer" and "The Prices list"): a table row per asset in the price
// roster with its price, its chains and the Rails explorers that list it.

import { AssetExplorer } from "@/components/assets/asset-explorer";
import { explorerState } from "@/lib/shared/asset-explorer";
import { fetchAssetExplorerServer } from "@/lib/api/fetch-asset-explorer-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { formatDate } from "@/lib/date";
import { loadBoldPriceWithin } from "@/lib/sources/chain/liquity-v2-bold-price";

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
  const [data, sp, boldRead] = await Promise.all([
    fetchAssetExplorerServer(await readerIpFromHeaders()).catch(() => null),
    searchParams,
    // BOLD's row reads its price from the Curve BOLD/USDC pool (ui-jobs 746b).
    loadBoldPriceWithin(),
  ]);
  const initialSearch = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x]))),
  ).toString();
  // The lead under the h1 (ui-jobs 781): what the table holds, and the day
  // its prices read. The marked price and the stored round explain themselves
  // in their marks' tips (A5.2, A5.3).
  const about = data?.day != null && (
    <p data-asset-prices-day={data.day}>
      The table below lists each asset a Rails explorer lists or a lending oracle prices, with a line for each chain
      giving its price there and the explorers that list it. Prices are at the close of{" "}
      {formatDate(new Date(data.day * DAY_MS))}.
    </p>
  );

  return (
    <div className="min-h-screen">
      <div className="py-8">
        {data ? (
          <AssetExplorer
            cards={data.cards}
            initial={explorerState(sp)}
            initialSearch={initialSearch}
            about={about}
            boldRead={boldRead ?? null}
          />
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
