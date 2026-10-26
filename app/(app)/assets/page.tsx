// The Prices list — /assets (rails-ops reference/asset-key-map.md, "The
// Prices list"): a row per asset page in the roster, each the link to it.

import { AssetPriceRow } from "@/components/assets/asset-price-row";
import { fetchAssetPricesServer } from "@/lib/api/fetch-asset-prices-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prices",
  description: "Each asset's price from the oracles the lending protocols read, with its last 30 days.",
  robots: { index: false, follow: false },
};

const DAY_MS = 86_400_000;

export default async function PricesPage() {
  const list = await fetchAssetPricesServer(await readerIpFromHeaders()).catch(() => null);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-4" data-anatomy="A5">
          <h1 className="text-2xl font-semibold text-foreground">Prices</h1>
          {list?.day != null && (
            <p className="mt-2 max-w-2xl text-sm text-rb-500" data-asset-prices-day={list.day}>
              At the close of {formatDate(new Date(list.day * DAY_MS))}, from the main line on each asset&rsquo;s page;
              the line and the change cover 30 days. A marked row, listed first, has a fixed price on its page or a line
              more than 1 % from its main line in those 30 days.
            </p>
          )}
        </header>
        {list ? (
          <ul className="max-w-xl divide-y divide-rb-200 dark:divide-rb-800" data-asset-prices="">
            {list.rows.map((r) => (
              <AssetPriceRow key={`${r.chain}:${r.token}`} row={r} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-rb-500" data-asset-prices="failed">
            The prices were not read.
          </p>
        )}
      </div>
    </div>
  );
}
