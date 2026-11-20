// A protocol's Assets pages (rails-ops decision 0069, ui-jobs 786; anatomy A6,
// A7): the shared page builders each explorer's thin route re-exports.
//
//   /<chain>/<slug>/assets          the assets the explorer uses on its chain,
//                                   under its heading (ProtocolAssets);
//   /<chain>/<slug>/assets/<token>  one asset under the protocol: the price
//                                   band and the chain's price section read
//                                   from the protocol's side (`via`), what the
//                                   asset is in the protocol, and the other
//                                   explorers using it on the chain.
//
// One token's pages under several protocols share the price section, so each
// names one canonical URL: the page under the first explorer, by the roster's
// order (alphabetical by name), that uses it on that chain.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { ProtocolAssets } from "@/components/assets/assets-by-protocol";
import { AssetPageHead, type RelationGroup } from "@/components/assets/asset-page-head";
import { AssetPriceChart } from "@/components/assets/asset-price-chart";
import { ExplorerChip } from "@/components/assets/asset-explorer";
import { BoldLivePrice } from "@/components/assets/bold-live-price";
import { fetchAssetExplorerServer, fetchAssetHeadServer } from "@/lib/api/fetch-asset-explorer-server";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-roster-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { unpricedPage } from "@/lib/api/asset-explorer-chips";
import { loadBoldPriceWithin } from "@/lib/sources/chain/liquity-v2-bold-price";
import { assetCategory, ASSET_CATEGORY_ORDER } from "@/lib/shared/asset-categories";
import { cardLines, type AssetCard } from "@/lib/shared/asset-explorer";
import { assetPage, chainName, type AssetPage } from "@/lib/shared/asset-roster";
import { viaPage } from "@/lib/shared/asset-via";
import { viaExplorer } from "@/lib/shared/asset-via-links";
import {
  ASSETS_SEGMENT,
  canonicalExplorer,
  protocolAssetLines,
  protocolAssetsHref,
  type AssetsExplorer,
  type ProtocolAssetLine,
} from "@/lib/shared/assets-by-protocol";
import type { ChipUse } from "@/lib/shared/asset-uses";
import { CHAINS, MAINNET_CHAIN_ID, type ChainMeta } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { PROTOCOLS, positionNounPlural, type ProtocolEntry } from "@/lib/shared/protocols";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

type Search = Record<string, string | string[] | undefined>;

const CHAIN_ORDER = (Object.values(CHAINS) as ChainMeta[]).map((c) => c.id as number);
const ROSTER_ORDER = PROTOCOLS.filter((p) => p.subPages.some((s) => s.segment === ASSETS_SEGMENT)).map((p) => p.id);
const DAY_MS = 86_400_000;

const entryOf = (id: string): ProtocolEntry => {
  const e = PROTOCOLS.find((p) => p.id === id);
  if (!e) throw new Error(`protocol-assets-page: no roster entry ${id}`);
  return e;
};
/** An explorer's route where it has an Assets sub-page; null elsewhere, so a
 *  link to it keeps its chip's target. */
const hrefOf = (id: string) => {
  const p = PROTOCOLS.find((x) => x.id === id);
  return p?.subPages.some((s) => s.segment === ASSETS_SEGMENT) ? p.href : null;
};
const explorerOf = (e: ProtocolEntry): AssetsExplorer => ({
  id: e.id,
  label: e.label,
  href: e.href,
  noun: positionNounPlural(e.session),
});

async function read() {
  return fetchAssetExplorerServer(await readerIpFromHeaders()).catch(() => null);
}

const linesFor = (cards: readonly AssetCard[], e: ProtocolEntry): ProtocolAssetLine[] =>
  protocolAssetLines(cards, explorerOf(e), (c) => cardLines(c, CHAIN_ORDER), hrefOf);

// ── /<chain>/<slug>/assets ──────────────────────────────────────────────────

export function protocolAssetsMetadata(id: string): Metadata {
  const e = entryOf(id);
  const where = CHAINS[e.chainId].name;
  return {
    title: `${e.label} on ${where}: assets`,
    description: `The assets ${e.label} uses on ${where}, each with its price over the last 30 days, what it is in ${e.label}, and the other explorers that use it.`,
    alternates: { canonical: protocolAssetsHref(e.href) },
    robots: { index: false, follow: false },
  };
}

export async function ProtocolAssetsPage({ id, searchParams }: { id: string; searchParams: Promise<Search> }) {
  const e = entryOf(id);
  const [data, sp, boldRead] = await Promise.all([read(), searchParams, loadBoldPriceWithin()]);
  const cat = (Array.isArray(sp.cat) ? sp.cat[0] : sp.cat) ?? "";
  const initialCats = cat.split(",").filter((c) => (ASSET_CATEGORY_ORDER as readonly string[]).includes(c));
  const where = CHAINS[e.chainId].name;
  return (
    <div className="min-h-screen">
      <div className="py-8" data-protocol-assets={e.id}>
        {/* No visible heading, as the protocol's listing (ui-jobs 786): H3 and
            the sections menu naming Assets carry it; the h1 is for readers
            that need one, sr-only. */}
        <div className="mb-6">
          <RailHeader session={e.session} venue="subPage" />
          <h1 className="sr-only">{`${e.label} assets`}</h1>
        </div>
        {data ? (
          <>
            <p
              className="mb-4 max-w-3xl text-sm leading-relaxed text-rb-500"
              data-protocol-assets-lead=""
              data-asset-prices-day={data.day ?? undefined}
            >
              The table below lists the assets {e.label} uses on {where}, with each one&rsquo;s price, what it is in{" "}
              {e.label}, and the other explorers that use it there.
              {data.day != null && <> Prices are at the close of {formatDate(new Date(data.day * DAY_MS))}.</>}
            </p>
            <ProtocolAssets
              lines={linesFor(data.cards, e)}
              protocol={e.label}
              chain={e.chainId}
              initialCats={initialCats}
              boldRead={boldRead ?? null}
            />
          </>
        ) : (
          <p className="text-sm text-rb-500" data-asset-prices="failed">
            The assets were not read.
          </p>
        )}
      </div>
    </div>
  );
}

// ── /<chain>/<slug>/assets/<token> ──────────────────────────────────────────

const validToken = (t: string) => /^0x[0-9a-fA-F]{40}$/.test(t);

export async function protocolAssetMetadata(id: string, token: string): Promise<Metadata> {
  const e = entryOf(id);
  if (!validToken(token)) return { robots: { index: false, follow: false } };
  const data = await read();
  const t = token.toLowerCase();
  const card = data?.cards.find((c) => c.chains.some((x) => x.chain === e.chainId && x.token === t));
  const first = card ? canonicalExplorer(card.chips, e.chainId, ROSTER_ORDER) : null;
  const canonical = protocolAssetsHref(hrefOf(first ?? e.id) ?? e.href, t);
  return {
    title: card ? `${card.symbol} in ${e.label} on ${CHAINS[e.chainId].name}` : "Asset",
    description: card
      ? `${card.symbol} in ${e.label}: its price from each oracle on ${CHAINS[e.chainId].name}, what it is in ${e.label}, and the other explorers that use it.`
      : undefined,
    alternates: { canonical },
    robots: { index: false, follow: false },
  };
}

export async function ProtocolAssetPage({ id, token }: { id: string; token: string }) {
  const e = entryOf(id);
  if (!validToken(token)) notFound();
  const t = token.toLowerCase();
  const chain = e.chainId;
  const readerIp = await readerIpFromHeaders();
  const [data, answer] = await Promise.all([
    fetchAssetExplorerServer(readerIp).catch(() => null),
    fetchAssetRosterServer(t).catch(() => null),
  ]);
  // A failed read is no answer about the token: the page says so, as the
  // Assets page does, rather than a 404.
  if (!data)
    return (
      <Frame protocol={e}>
        <p className="text-sm text-rb-500" data-asset-prices="failed">
          The assets were not read.
        </p>
      </Frame>
    );
  const line = linesFor(data.cards, e).find((l) => l.line.token === t);
  // A token the explorer does not use on its chain has no page under it.
  if (!line) notFound();
  const { card } = line;

  const aside = <ProtocolUse protocol={e} line={line} chain={chain} />;
  const relationsFor = (page: AssetPage | null) => relations(page, card, chain, data.cards, e);
  const opened = answer ? assetPage(answer, chain) : null;

  if (!opened || !opened.chains.some((c) => c.chain === chain)) {
    // No stored price on this chain: the card's line, its figure, and BOLD's
    // live read where it is BOLD (ui-jobs 746b).
    const bold = chain === MAINNET_CHAIN_ID && t === TOKEN_ADDRESSES.BOLD;
    const [unpriced, boldRead] = await Promise.all([unpricedPage(chain, t), bold ? loadBoldPriceWithin() : undefined]);
    return (
      <Frame protocol={e}>
        <AssetPageHead
          chain={chain}
          token={t}
          symbol={card.symbol}
          category={card.category ?? assetCategory(card.symbol)}
          row={null}
          figure={unpriced?.figure ?? card.figure}
          chips={card.chips}
          chains={card.chains}
          relations={relationsFor(opened)}
          back={null}
          note={null}
          aside={aside}
          chainLabel={false}
          livePrice={bold ? <BoldLivePrice read={boldRead ?? null} figure={unpriced?.figure ?? null} /> : undefined}
        />
      </Frame>
    );
  }

  // The price read from this protocol's side: its line leads the chain's chart.
  const via = viaExplorer(e.id);
  const { page, view } = via ? viaPage(opened, via) : { page: opened, view: null };
  const head = await fetchAssetHeadServer(chain, t, via ? e.id : null, readerIp).catch(() => null);
  const section = page.chains.find((c) => c.chain === chain);
  return (
    <Frame protocol={e}>
      <AssetPageHead
        chain={chain}
        token={t}
        symbol={page.symbol}
        category={card.category}
        row={head?.row ?? null}
        figure={null}
        chips={card.chips}
        chains={card.chains}
        relations={relationsFor(page)}
        back={null}
        note={null}
        aside={aside}
        chainLabel={false}
      />
      {section && (
        <AssetPriceChart
          section={section}
          symbol={page.symbol}
          via={view && section.chain === view.explorer.chain ? view : null}
        />
      )}
    </Frame>
  );
}

/** The page under the protocol's heading (H3 with the sections menu, Assets current). */
function Frame({ protocol: e, children }: { protocol: ProtocolEntry; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="py-8" data-protocol-asset={e.id} data-anatomy="A7">
        <div className="mb-4">
          <RailHeader session={e.session} venue="subPage" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Beside the price band (A7.1, A7.2): "In <protocol>", what the asset is
 *  there as links to the protocol's pages for it, then "Also used in", the
 *  other explorers on the chain, each opening its page for the asset. */
function ProtocolUse({
  protocol: e,
  line,
  chain,
}: {
  protocol: ProtocolEntry;
  line: ProtocolAssetLine;
  chain: number;
}) {
  const where = chainName(chain);
  return (
    <div className="min-w-0 space-y-4 md:border-l md:border-rb-200 md:pl-6 dark:md:border-rb-700">
      <section aria-labelledby="asset-in-protocol" data-anatomy="A7.1">
        <h2 id="asset-in-protocol" className="mb-2 text-sm text-rb-500">
          In {e.label}
        </h2>
        {line.markets.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm" data-asset-markets="">
            {line.markets.map((m: ChipUse) => (
              <li key={m.href + m.label}>
                <Link href={m.href} className={INLINE_LINK} data-asset-market={m.href}>
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-rb-500">
            {e.label} lists it on {where}.
          </p>
        )}
      </section>
      <section aria-labelledby="asset-also-used" data-anatomy="A7.2">
        <h2 id="asset-also-used" className="mb-2 text-sm text-rb-500">
          Also used in
        </h2>
        {line.also.length > 0 ? (
          <ul className="flex flex-wrap gap-1" data-asset-chips="" data-asset-also="">
            {line.also.map((ch) => (
              <li key={ch.explorer}>
                <ExplorerChip chip={ch} symbol={line.card.symbol} chainMark={false} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-rb-500">No other Rails explorer uses it on {where}.</p>
        )}
      </section>
    </div>
  );
}

type Ref = { symbol: string; chain: number; token: string; kind?: "wraps" | "rate" };

/** The line under the band (A1.6) in the card's words, on this chain alone,
 *  each token linking its page under this protocol where it uses it, else
 *  under the first explorer that does, else not drawn. */
function relations(
  page: AssetPage | null,
  card: AssetCard,
  chain: number,
  cards: readonly AssetCard[],
  e: ProtocolEntry,
): RelationGroup[] {
  const pageOf = (r: Ref): string | null => {
    const c = cards.find((x) => x.chains.some((y) => y.chain === r.chain && y.token === r.token.toLowerCase()));
    if (!c) return null;
    const here = c.chips.some((ch) => ch.explorer === e.id && ch.chain === r.chain);
    const by = here ? e.id : canonicalExplorer(c.chips, r.chain, ROSTER_ORDER);
    const at = by ? hrefOf(by) : null;
    return at ? protocolAssetsHref(at, r.token) : null;
  };
  const groups: RelationGroup[] = [];
  const add = (word: string, refs: Ref[]) => {
    const links = refs
      .filter((r) => r.chain === chain)
      .filter((r, i, all) => all.findIndex((x) => x.symbol === r.symbol) === i)
      .flatMap((r) => {
        const href = pageOf(r);
        return href ? [{ symbol: r.symbol, chain: r.chain, href }] : [];
      });
    if (links.length) groups.push({ word, links });
  };
  const under = [page?.underlying, card.underlying].filter((u): u is Ref => u != null);
  const wrapped: Ref[] = [...(page?.wrapped ?? []), ...card.wrapped];
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
