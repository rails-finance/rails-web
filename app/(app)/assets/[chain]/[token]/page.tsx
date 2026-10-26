// An asset page — /assets/{chain}/{token} (rails-ops reference/asset-key-map.md).
// ----------------------------------------------------------------------------
// The price of one asset over time from each oracle the protocols read, a
// line per oracle named with its protocols and a chart per chain (Miles,
// 2 Oct and 25 Oct 2026). Native ETH is 0xeeee…eeee on every chain; a wrapped
// token's page links to its underlying's. It spans chains, so it sits under
// no chain segment and no explorer rail; the chain in the path puts that
// chain's chart first. `?via=<explorer>&from=<path>` reads the page from
// that protocol's side and links back to where the reader came from
// (lib/shared/asset-via.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetPriceChart } from "@/components/assets/asset-price-chart";
import { ASSET_CHART_ENGINE } from "@/lib/shared/asset-chart-grid";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-roster-server";
import { assetHref, assetPage, chainName, chainOfSlug, pageLinks } from "@/lib/shared/asset-roster";
import { FROM_PARAM, VIA_PARAM, viaPage, withVia } from "@/lib/shared/asset-via";
import { backLink, viaExplorer } from "@/lib/shared/asset-via-links";

export const dynamic = "force-dynamic";

type Params = Promise<{ chain: string; token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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

export default async function AssetPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ chain: slug, token }, sp] = await Promise.all([params, searchParams]);
  const chain = chainOfSlug(slug);
  if (chain == null || !/^0x[0-9a-fA-F]{40}$/.test(token)) notFound();
  const explorer = viaExplorer(one(sp[VIA_PARAM]));
  const from = one(sp[FROM_PARAM]);
  // `?chart=classic` draws the earlier chart, to compare the two (ui-jobs 234).
  const engine = one(sp.chart) === "classic" ? "classic" : ASSET_CHART_ENGINE;
  const answer = await fetchAssetRosterServer(token);
  const opened = answer ? assetPage(answer, explorer?.chain ?? chain) : null;
  if (!opened) notFound();
  const { page, view } = explorer ? viaPage(opened, explorer) : { page: opened, view: null };
  const back = explorer ? backLink(from) : null;
  const links = pageLinks(page);
  // The page's links keep the protocol context.
  const href = (c: number, t: string) => withVia(assetHref(c, t), explorer?.id, from);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-2" data-skel-section="page-header" data-anatomy="A1">
          {back && (
            <p className="mb-2 text-sm" data-anatomy="A1.1">
              <Link href={back.href} className="link-muted hover:underline" data-asset-back={back.href}>
                {back.label}
              </Link>
            </p>
          )}
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
                      <Link href={href(l.chain, l.token)} className="font-medium text-foreground hover:underline">
                        {l.symbol}
                      </Link>
                    </span>
                  ))}
                  <span className="text-rb-500"> →</span>
                </span>
              ))}
            </p>
          )}
          {explorer && !view && (
            <p className="mt-2 text-sm text-rb-500" data-asset-via="none" data-anatomy="A1.2">
              {page.symbol} has no chart on {chainName(explorer.chain)}, where {explorer.label} is; the page shows its
              usual lines.
            </p>
          )}
        </header>
        {page.chains.map((c) => (
          <AssetPriceChart
            key={c.chain}
            section={c}
            symbol={page.symbol}
            via={view && c.chain === view.explorer.chain ? view : null}
            engine={engine}
          />
        ))}
      </div>
    </div>
  );
}
