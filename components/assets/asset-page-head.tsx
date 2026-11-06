// The asset page's heading and top band (rails-ops reference/app-anatomy.md,
// A1): the asset's mark, symbol and chain as the h1 with its category, then
// one band of the explorer card's parts (A5.4): the price row (A5.1), or on a
// page without a price the card's figure and why, and the explorers that read
// it, a group per chain; under the band, what it wraps and what wraps it as
// one muted line. The chain sections (A2) follow on the page.

import Link from "next/link";
import type { ReactNode } from "react";
import { AssetPriceRow } from "@/components/assets/asset-price-row";
import { CategoryBadge, ExplorerChip, FigureRow } from "@/components/assets/asset-explorer";
import { ChainLabel } from "@/components/shared/rail-header";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { CopyFact } from "@/components/shared/event-page-aside";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainProvider } from "@/lib/shared/chain-context";
import { chainName, NATIVE, shortAddress } from "@/lib/shared/asset-roster";
import { PRICELESS_WHY, type AssetChip, type CardChain, type CardFigure } from "@/lib/shared/asset-explorer";
import type { AssetCategory } from "@/lib/shared/asset-categories";
import type { AssetPriceRow as Row } from "@/lib/shared/asset-prices";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

/** One relation in the line under the band: "Wraps", "Wrapped as", "Priced from it:". */
export interface RelationGroup {
  word: string;
  links: { symbol: string; chain: number; href: string }[];
}

export function AssetPageHead({
  chain,
  token,
  symbol,
  category,
  row,
  figure,
  chips,
  chains,
  relations,
  back,
  note,
}: {
  /** The chain the page opens on: the h1's glyph and the first group of chips. */
  chain: number;
  token: string;
  symbol: string;
  category: AssetCategory;
  /** The price row; null on a page without a stored price. */
  row: Row | null;
  figure: CardFigure | null;
  chips: AssetChip[];
  /** The card's chains, each with its asset page. */
  chains: CardChain[];
  relations: RelationGroup[];
  back: { href: string; label: string } | null;
  /** A1.2, with `via` on a chain the page has no chart on. */
  note: ReactNode;
}) {
  return (
    <header className="mb-2" data-skel-section="page-header" data-anatomy="A1">
      {back && (
        <p className="mb-2 text-sm" data-anatomy="A1.1">
          <Link href={back.href} className="link-muted hover:underline" data-asset-back={back.href}>
            {back.label}
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold text-foreground">
          <ChainProvider chainId={chain as ChainId}>
            <TokenChipIcon symbol={symbol} address={token} size={24} filterable={false} untitled />
          </ChainProvider>
          <span className="min-w-0 truncate">{symbol}</span>
          <ChainLabel chainId={chain as ChainId} anatomy={null} className="ml-1" />
        </h1>
        <CategoryBadge category={category} />
      </div>
      <div
        className="mt-4 grid gap-x-6 gap-y-4 rounded-xl bg-raised p-3 sm:p-4 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
        data-asset-band=""
        data-anatomy="A1.4"
      >
        <div className="min-w-0 self-center">
          {row ? (
            <AssetPriceRow row={row} as="div" onPage />
          ) : (
            <>
              {figure && <FigureRow figure={figure} />}
              <p className="mt-1 text-sm text-rb-500" data-asset-priceless="" data-anatomy="A1.3">
                {PRICELESS_WHY}
              </p>
            </>
          )}
          {token.toLowerCase() !== NATIVE && <ContractLine chain={chain} token={token} />}
        </div>
        <ReadBy chain={chain} token={token} symbol={symbol} chips={chips} chains={chains} />
      </div>
      {relations.length > 0 && <RelationLine chain={chain} groups={relations} />}
      {note}
    </header>
  );
}

/** The token's contract: its short address, linking the chain explorer's
 *  token page, and a copy button; the native asset has none. */
function ContractLine({ chain, token }: { chain: number; token: string }) {
  const address = token.toLowerCase();
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm" data-asset-contract={address}>
      <span className="text-xs text-rb-500">Contract</span>
      <a
        href={explorerUrl(chain as ChainId, "token", address)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
        title={address}
      >
        {shortAddress(address)}
      </a>
      <CopyFact value={address} label="Copy contract address" name="contract" />
    </p>
  );
}

/** The explorers that read the asset , a group per chain under its glyph
 *  and name where they span chains, the page's chain first; a group on another
 *  chain's page names that page. */
function ReadBy({
  chain,
  token,
  symbol,
  chips,
  chains,
}: {
  chain: number;
  token: string;
  symbol: string;
  chips: AssetChip[];
  chains: CardChain[];
}) {
  const order = [...new Set([chain, ...chips.map((c) => c.chain)])].filter((c) => chips.some((x) => x.chain === c));
  const many = order.length > 1;
  return (
    <section
      className="min-w-0 md:border-l md:border-rb-200 md:pl-6 dark:md:border-rb-700"
      aria-labelledby="asset-read-by"
      data-anatomy="A1.5"
    >
      <h2 id="asset-read-by" className="mb-2 text-sm text-rb-500">
        Read by
      </h2>
      {chips.length === 0 ? (
        <p className="text-sm text-rb-500">No Rails explorer lists it.</p>
      ) : (
        <div className="space-y-2.5" data-asset-chips="">
          {order.map((c) => {
            const page = chains.find((x) => x.chain === c);
            const other = page?.href && page.token !== token.toLowerCase() ? page.href : null;
            return (
              <div key={c} data-asset-chip-chain={c}>
                {many && (
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-rb-500">
                    <ChainGlyph chainId={c as ChainId} className="h-3.5 w-3.5" />
                    {other ? (
                      <Link href={other} className="link-muted hover:underline" title={`${symbol} on ${chainName(c)}`}>
                        {chainName(c)}
                      </Link>
                    ) : (
                      chainName(c)
                    )}
                  </p>
                )}
                <ul className="flex flex-wrap gap-1">
                  {chips
                    .filter((ch) => ch.chain === c)
                    .map((ch) => (
                      <li key={ch.explorer}>
                        <ExplorerChip chip={ch} symbol={symbol} chainMark={false} />
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** "Wraps BTC · Wrapped as WBTC, cbBTC · Priced from it: wstETH" , in the
 *  card's words; a token on another chain carries that chain's glyph. */
function RelationLine({ chain, groups }: { chain: number; groups: RelationGroup[] }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-1.5 gap-y-1 text-sm text-rb-500" data-asset-links="" data-anatomy="A1.6">
      {groups.map((g, gi) => (
        <span key={g.word}>
          {gi > 0 && <span aria-hidden="true">· </span>}
          {g.word}{" "}
          {g.links.map((l, i) => (
            <span key={l.href}>
              {i > 0 && ", "}
              <Link href={l.href} className="font-medium text-foreground underline-offset-2 hover:underline">
                {l.symbol}
              </Link>
              {l.chain !== chain && (
                <span role="img" aria-label={`on ${chainName(l.chain)}`} title={`On ${chainName(l.chain)}`}>
                  <ChainGlyph chainId={l.chain as ChainId} className="ml-0.5 inline h-3 w-3 align-[-1px]" />
                </span>
              )}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
