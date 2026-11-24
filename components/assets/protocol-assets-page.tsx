// A protocol's Assets pages (rails-ops decision 0069, ui-jobs 786; anatomy A6,
// A7): the shared page builders each explorer's thin route re-exports.
//
//   /<chain>/<slug>/assets          the assets the explorer uses on its chain,
//                                   under its heading (ProtocolAssets);
//   /<chain>/<slug>/assets/<token>  one asset under the protocol, read from
//                                   its side (`via`; Miles, 24 Nov 2026,
//                                   ui-jobs 818): Back and the token, the
//                                   chart panel with the price now, the row
//                                   naming the oracle it charts, the
//                                   protocols also reading that oracle, the
//                                   other oracles with their prices now, and
//                                   the as-of line.
//
// One token's pages under several protocols share the price section, so each
// names one canonical URL: the page under the first explorer, by the roster's
// order (alphabetical by name), that uses it on that chain.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { ProtocolAssets } from "@/components/assets/assets-by-protocol";
import { AssetTitle, SourceRow, UnpricedPanel, type RelationGroup } from "@/components/assets/asset-page-head";
import { AssetPriceChart } from "@/components/assets/asset-price-chart";
import { AsOfLine, OracleTable } from "@/components/assets/asset-oracles";
import { AssetReceipts } from "@/components/assets/asset-receipts";
import { BoldLivePrice } from "@/components/assets/bold-live-price";
import { fetchAssetExplorerServer, fetchAssetHeadServer } from "@/lib/api/fetch-asset-explorer-server";
import { fetchAssetPricesNow } from "@/lib/api/fetch-asset-prices-now";
import { fmtRowPrice } from "@/components/assets/asset-price-row";
import { fetchAssetRosterServer } from "@/lib/api/fetch-asset-roster-server";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { unpricedPage } from "@/lib/api/asset-explorer-chips";
import { loadBoldPriceWithin } from "@/lib/sources/chain/liquity-v2-bold-price";
import { assetCategory, ASSET_CATEGORY_ORDER } from "@/lib/shared/asset-categories";
import { cardLines, type AssetCard } from "@/lib/shared/asset-explorer";
import { assetPage, mainLine, type AssetPage } from "@/lib/shared/asset-roster";
import {
  alsoListed,
  alsoReads,
  listedRows,
  oracleRows,
  sameRows,
  tableRows,
  priceCell,
  priceProv,
  headTime,
  type PriceCell,
  sourceLine,
} from "@/lib/shared/asset-oracle-view";
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
import { CHAINS, MAINNET_CHAIN_ID, type ChainMeta } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { PROTOCOLS, positionNounPlural, type ProtocolEntry } from "@/lib/shared/protocols";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { comptrollerMarketLinks } from "@/lib/comptroller/market-pages";

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
  protocolAssetLines(
    cards,
    explorerOf(e),
    (c) => cardLines(c, CHAIN_ORDER),
    hrefOf,
    (chip, token) => comptrollerMarketLinks(e.id, e.href, token, chip.href),
  );

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
  const also = (Array.isArray(sp.also) ? sp.also[0] : sp.also) ?? null;
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
              initialAlso={also && /^[a-z0-9-]{1,40}$/.test(also) ? also : null}
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

  const relationsFor = (page: AssetPage | null) => relations(page, card, chain, data.cards, e);
  // Back's fresh-tab landing: the protocol's Assets list, the "Assets" entry of its sections menu.
  const backHref = protocolAssetsHref(e.href);
  const opened = answer ? assetPage(answer, chain) : null;
  // The page under it, read from the protocol's side, and its line on the chain.
  const via = viaExplorer(e.id);
  const { page, view } = opened && via ? viaPage(opened, via) : { page: opened, view: null };
  const section = page?.chains.find((c) => c.chain === chain) ?? null;
  const pageLine =
    (view?.lineId ? section?.lines.find((l) => l.id === view.lineId) : null) ?? (section ? mainLine(section) : null);

  if (!page || !section || !pageLine) {
    // No stored price on this chain: the card's figure, and BOLD's live read
    // where it is BOLD (ui-jobs 746b).
    const bold = chain === MAINNET_CHAIN_ID && t === TOKEN_ADDRESSES.BOLD;
    const [unpriced, boldRead] = await Promise.all([unpricedPage(chain, t), bold ? loadBoldPriceWithin() : undefined]);
    const figure = unpriced?.figure ?? card.figure;
    return (
      <Frame protocol={e}>
        <AssetTitle chain={chain} token={t} symbol={card.symbol} backHref={backHref} />
        <UnpricedPanel
          figure={figure}
          livePrice={bold ? <BoldLivePrice read={boldRead ?? null} figure={unpriced?.figure ?? null} /> : undefined}
        />
        <SourceRow chain={chain} token={t} source={null} relations={relationsFor(opened)} markets={line.markets} />
      </Frame>
    );
  }

  const own = view?.lineId != null;
  const [head, now] = await Promise.all([
    fetchAssetHeadServer(chain, t, via ? e.id : null, readerIp).catch(() => null),
    fetchAssetPricesNow(chain, t, section.lines, readerIp),
  ]);
  // Each explorer's page for the token: this protocol's, and the others' from the chips.
  const hrefs: Record<string, string> = Object.fromEntries(
    line.also.flatMap((ch) => {
      const at = ch.token || ch.chain !== chain ? null : hrefOf(ch.explorer);
      return at ? [[ch.explorer, protocolAssetsHref(at, t)]] : [];
    }),
  );
  hrefs[e.id] = protocolAssetsHref(e.href, t);
  const pageOf = (id: string) => hrefs[id] ?? null;
  const nowMs = Date.now();
  const read = now.prices[pageLine.id];
  const symbol = page.symbol;
  const reads = alsoReads(pageLine, e.id, pageOf);
  const other = oracleRows(section.lines, pageLine, now, pageOf);
  const rows = tableRows(
    sameRows(pageLine, reads, own ? e.label : null, now),
    other,
    listedRows(alsoListed(line.line.chips, chain, e.id, { reads, rows: other }, pageOf), now),
  );
  return (
    <Frame protocol={e}>
      <AssetTitle chain={chain} token={t} symbol={symbol} backHref={backHref} />
      <AssetReceipts>
        <section data-asset-chain={chain} data-asset-via={view?.lineId ?? "none"} data-anatomy="A2">
          <AssetPriceChart
            chain={chain}
            line={pageLine}
            symbol={symbol}
            head={{
              price: headPrice(priceCell(read)),
              info: read?.ok ? priceProv(pageLine, read, symbol) : null,
              symbol,
              change: head?.row?.change ?? null,
              updated: headTime(read, nowMs),
            }}
          />
          <SourceRow
            chain={chain}
            token={t}
            source={sourceLine(pageLine, own ? e.id : null, own ? undefined : { protocol: e.label, symbol })}
            relations={relationsFor(page)}
            markets={line.markets}
          />
          <OracleTable
            rows={rows}
            lines={section.lines}
            pageLine={pageLine.id}
            chain={chain}
            symbol={symbol}
            refName={own ? `${e.label}'s price` : "the price most protocols read"}
            now={now}
          />
          <AsOfLine now={now} />
        </section>
      </AssetReceipts>
    </Frame>
  );
}

/** The headline's figure in the Prices row's words: "$1,697", "$1.00". */
const headPrice = (c: PriceCell): PriceCell => (c.value == null ? c : { ...c, text: `$${fmtRowPrice(c.value)}` });

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

type Ref = { symbol: string; chain: number; token: string; kind?: "wraps" | "rate" };

/** The relations in the line under the source (A1.6), in the card's words, on this chain alone,
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
    "Wrapped",
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
