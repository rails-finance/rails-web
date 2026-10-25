// An asset page — /assets/{chain}/{token} (rails-ops reference/asset-key-map.md).
// ----------------------------------------------------------------------------
// The price of one asset over time from each oracle the protocols read, a
// line per oracle named with its protocols and a chart per chain (Miles,
// 2 Oct and 25 Oct 2026). Native ETH is 0xeeee…eeee on every chain; a wrapped
// token's page links to its underlying's. It spans chains, so it sits under
// no chain segment and no explorer rail; the chain in the path puts that
// chain's chart first.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetPriceChart } from "@/components/assets/asset-price-chart";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-roster-server";
import { assetHref, assetPage, chainOfSlug, pageLinks } from "@/lib/shared/asset-roster";

export const dynamic = "force-dynamic";

type Params = Promise<{ chain: string; token: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { chain, token } = await params;
  const answer = /^0x[0-9a-fA-F]{40}$/.test(token) ? await fetchAssetRosterServer(token).catch(() => null) : null;
  const page = answer ? assetPage(answer, chainOfSlug(chain) ?? 1) : null;
  return {
    title: page ? `${page.symbol} price` : "Asset",
    description: page
      ? `${page.symbol}'s price from each oracle the lending protocols read, a line per oracle and a chart per chain.`
      : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function AssetPage({ params }: { params: Params }) {
  const { chain: slug, token } = await params;
  const chain = chainOfSlug(slug);
  if (chain == null || !/^0x[0-9a-fA-F]{40}$/.test(token)) notFound();
  const answer = await fetchAssetRosterServer(token);
  const page = answer ? assetPage(answer, chain) : null;
  if (!page) notFound();
  const links = pageLinks(page);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-2" data-skel-section="page-header" data-anatomy="A1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <TokenChipIcon symbol={page.symbol} address={page.token} size={24} filterable={false} untitled />
            {page.symbol}
          </h1>
          {links.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-asset-links="">
              {links.map((g) => (
                <span key={g.id}>
                  <span className="text-rb-500">{g.word} </span>
                  {g.assets.map((l, i) => (
                    <span key={`${l.chain}:${l.token}`}>
                      {i > 0 && <span className="text-rb-500">, </span>}
                      <Link href={assetHref(l.chain, l.token)} className="font-medium text-foreground hover:underline">
                        {l.symbol}
                      </Link>
                    </span>
                  ))}
                  <span className="text-rb-500"> →</span>
                </span>
              ))}
            </p>
          )}
        </header>
        {page.chains.map((c) => (
          <AssetPriceChart key={c.chain} section={c} symbol={page.symbol} />
        ))}
      </div>
    </div>
  );
}
