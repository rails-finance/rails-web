// An asset page — /assets/{chain}/{token} (rails-ops reference/asset-key-map.md).
// ----------------------------------------------------------------------------
// The price of one asset over time from each oracle the protocols read, a
// line per oracle named with its protocols and a chart per chain (Miles,
// 2 Oct and 25 Oct 2026). Native ETH is 0xeeee…eeee on every chain; a wrapped
// token's page links to its underlying's. It spans chains, so it sits under
// no chain segment and no explorer rail; the chain in the path puts that
// chain's chart first. `?via=<explorer>&from=<path>` reads the page from
// that protocol's side and links back to where the reader came from
// (lib/shared/asset-via.ts). A token without a stored price that Morpho lists
// in a market with $1M or more of supply has a page of one line, the card's,
// and the explorers that list it.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetPriceChart } from "@/components/assets/asset-price-chart";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-roster-server";
import { assetHref, assetPage, chainName, chainOfSlug, pageLinks } from "@/lib/shared/asset-roster";
import { FROM_PARAM, VIA_PARAM, viaPage, withVia } from "@/lib/shared/asset-via";
import { backLink, viaExplorer } from "@/lib/shared/asset-via-links";
import { morphoUnpricedPage } from "@/lib/api/asset-explorer-chips";
import { PRICELESS_WHY, type AssetChip } from "@/lib/shared/asset-explorer";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainProvider } from "@/lib/shared/chain-context";
import type { ChainId } from "@/lib/shared/chains";

export const dynamic = "force-dynamic";

type Params = Promise<{ chain: string; token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }) {
  const { chain, token } = await params;
  const answer = /^0x[0-9a-fA-F]{40}$/.test(token) ? await fetchAssetRosterServer(token).catch(() => null) : null;
  const page = answer ? assetPage(answer, chainOfSlug(chain) ?? 1) : null;
  const unpriced = !page && chainOfSlug(chain) != null ? await morphoUnpricedPage(chainOfSlug(chain)!, token) : null;
  return {
    title: page ? `${page.symbol} price` : (unpriced?.symbol ?? "Asset"),
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
  const answer = await fetchAssetRosterServer(token);
  const opened = answer ? assetPage(answer, explorer?.chain ?? chain) : null;
  if (!opened) {
    const unpriced = await morphoUnpricedPage(chain, token);
    if (!unpriced) notFound();
    return <UnpricedPage chain={chain} token={token} back={explorer ? backLink(from) : null} {...unpriced} />;
  }
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
          />
        ))}
      </div>
    </div>
  );
}

/** The page of a token without a stored price: the card's line and its explorers. */
function UnpricedPage({
  chain,
  token,
  symbol,
  chips,
  back,
}: {
  chain: number;
  token: string;
  symbol: string;
  chips: AssetChip[];
  back: ReturnType<typeof backLink> | null;
}) {
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
            <ChainProvider chainId={chain as ChainId}>
              <TokenChipIcon symbol={symbol} address={token} size={24} filterable={false} untitled />
            </ChainProvider>
            {symbol}
          </h1>
          <p className="mt-2 text-sm text-rb-500" data-asset-priceless="" data-anatomy="A1.3">
            {PRICELESS_WHY}
          </p>
        </header>
        {chips.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1" data-asset-chips="">
            {chips.map((ch) => (
              <li key={ch.explorer}>
                <Link
                  href={ch.href}
                  className="inline-flex items-center gap-1 rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-foreground hover:bg-[var(--surface-active)]"
                  title={`${symbol} on ${ch.label}, ${chainName(chain)}`}
                  data-asset-chip={ch.explorer}
                  data-asset-chip-link={ch.link}
                >
                  <ProtocolIcon id={ch.explorer} className="h-3 w-3 shrink-0" />
                  {ch.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
