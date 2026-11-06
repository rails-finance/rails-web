// An asset page — /assets/{chain}/{token} (rails-ops reference/asset-key-map.md).
// ----------------------------------------------------------------------------
// The price of one asset over time from each oracle the protocols read, a
// line per oracle named with its protocols and a chart per chain (Miles,
// 2 Oct and 25 Oct 2026). Native ETH is 0xeeee…eeee on every chain; a wrapped
// token's page links to its underlying's. It spans chains, so it sits under
// no chain segment and no explorer rail; the chain in the path puts that
// chain's chart first. `?via=<explorer>&from=<path>` reads the page from
// that protocol's side and links back to where the reader came from
// (lib/shared/asset-via.ts). A token an explorer lists that the roster does
// not price has a page of the card's line, its figure where Rails has one,
// and the explorers that list it.

import { notFound } from "next/navigation";
import { AssetPriceChart } from "@/components/assets/asset-price-chart";
import { AssetPageHead, type RelationGroup } from "@/components/assets/asset-page-head";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-roster-server";
import { fetchAssetHeadServer } from "@/lib/api/fetch-asset-explorer-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { assetHref, assetPage, chainName, chainOfSlug, type AssetPage } from "@/lib/shared/asset-roster";
import { FROM_PARAM, VIA_PARAM, viaPage, withVia } from "@/lib/shared/asset-via";
import { backLink, viaExplorer } from "@/lib/shared/asset-via-links";
import { unpricedPage } from "@/lib/api/asset-explorer-chips";
import { assetCategory } from "@/lib/shared/asset-categories";
import type { AssetCard } from "@/lib/shared/asset-explorer";

export const dynamic = "force-dynamic";

type Params = Promise<{ chain: string; token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }) {
  const { chain, token } = await params;
  const answer = /^0x[0-9a-fA-F]{40}$/.test(token) ? await fetchAssetRosterServer(token).catch(() => null) : null;
  const page = answer ? assetPage(answer, chainOfSlug(chain) ?? 1) : null;
  const unpriced = !page && chainOfSlug(chain) != null ? await unpricedPage(chainOfSlug(chain)!, token) : null;
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
  const via = one(sp[VIA_PARAM]);
  const explorer = viaExplorer(via);
  const from = one(sp[FROM_PARAM]);
  const back = explorer ? backLink(from) : null;
  const [answer, readerIp] = await Promise.all([fetchAssetRosterServer(token), readerIpFromHeaders()]);
  const opened = answer ? assetPage(answer, explorer?.chain ?? chain) : null;
  if (!opened) {
    const [unpriced, head] = await Promise.all([
      unpricedPage(chain, token),
      fetchAssetHeadServer(chain, token, null, readerIp).catch(() => null),
    ]);
    if (!unpriced) notFound();
    return (
      <div className="min-h-screen">
        <div className="py-8">
          <AssetPageHead
            chain={chain}
            token={token}
            symbol={unpriced.symbol}
            category={head?.card?.category ?? assetCategory(unpriced.symbol)}
            row={null}
            figure={unpriced.figure}
            chips={head?.card?.chips ?? unpriced.chips}
            chains={head?.card?.chains ?? []}
            relations={[]}
            back={back}
            note={null}
          />
        </div>
      </div>
    );
  }
  const { page, view } = explorer ? viaPage(opened, explorer) : { page: opened, view: null };
  const at = page.chains[0]?.chain ?? chain;
  const head = await fetchAssetHeadServer(at, page.token, explorer ? via! : null, readerIp).catch(() => null);
  // The page's links keep the protocol context.
  const href = (c: number, t: string) => withVia(assetHref(c, t), explorer?.id, from);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <AssetPageHead
          chain={at}
          token={page.token}
          symbol={page.symbol}
          category={head?.card?.category ?? assetCategory(page.symbol)}
          row={head?.row ?? null}
          figure={null}
          chips={head?.card?.chips ?? []}
          chains={head?.card?.chains ?? []}
          relations={relations(page, head?.card, at, href)}
          back={back}
          note={
            explorer &&
            !view && (
              <p className="mt-2 text-sm text-rb-500" data-asset-via="none" data-anatomy="A1.2">
                {page.symbol} has no chart on {chainName(explorer.chain)}, where {explorer.label} is; the page shows its
                usual lines.
              </p>
            )
          }
        />
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

type Ref = { symbol: string; chain: number; token: string; kind?: "wraps" | "rate" };

/** The line under the band, in the card's words: what it wraps or is priced
 *  from, what wraps it, what is priced from it, on the page and on the card
 *  (USDC's card carries Base's USDbC); a symbol on two chains once, the
 *  page's chain first. */
function relations(
  page: AssetPage,
  card: AssetCard | null | undefined,
  chain: number,
  href: (c: number, t: string) => string,
): RelationGroup[] {
  const groups: RelationGroup[] = [];
  const add = (word: string, refs: Ref[]) => {
    const sorted = [...refs].sort((a, b) => Number(b.chain === chain) - Number(a.chain === chain));
    const links = sorted
      .filter((r, i) => sorted.findIndex((x) => x.symbol === r.symbol) === i)
      .map((r) => ({ symbol: r.symbol, chain: r.chain, href: href(r.chain, r.token) }));
    if (links.length) groups.push({ word, links });
  };
  const under = [page.underlying, card?.underlying].filter((u): u is Ref => u != null);
  const wrapped: Ref[] = [...page.wrapped, ...(card?.wrapped ?? [])];
  add(
    "Wraps",
    under.filter((u) => u.kind !== "rate"),
  );
  add(
    "Priced from",
    under.filter((u) => u.kind === "rate"),
  );
  add(
    "Wrapped as",
    wrapped.filter((w) => w.kind !== "rate"),
  );
  add(
    "Priced from it:",
    wrapped.filter((w) => w.kind === "rate"),
  );
  return groups;
}
