// An asset page's heading and top band under a protocol (rails-ops
// reference/app-anatomy.md, A1, A7; decision 0069): the asset's mark and symbol
// as the h1 with its category, then one band: the price row (A5.1), or on a
// page without a price the card's figure and why, beside the asset's use in
// the protocol and the other explorers using it (`aside`, A7.1 and A7.2);
// under the band, what it wraps and what wraps it as one muted line. The
// chain section (A2) follows on the page.

import Link from "next/link";
import type { ReactNode } from "react";
import { AssetPriceRow } from "@/components/assets/asset-price-row";
import { CategoryBadge, FigureRow } from "@/components/assets/asset-explorer";
import { ChainLabel } from "@/components/shared/rail-header";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { CopyFact } from "@/components/shared/event-page-aside";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainProvider } from "@/lib/shared/chain-context";
import { chainName, NATIVE, shortAddress } from "@/lib/shared/asset-roster";
import { PRICELESS_WHY, type CardFigure } from "@/lib/shared/asset-explorer";
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
  relations,
  note,
  livePrice,
  aside,
  chainLabel = true,
}: {
  /** The asset's chain: the explorer's. */
  chain: number;
  token: string;
  symbol: string;
  category: AssetCategory;
  /** The price row; null on a page without a stored price. */
  row: Row | null;
  figure: CardFigure | null;
  relations: RelationGroup[];
  /** A1.2, with `via` on a chain the page has no chart on. */
  note: ReactNode;
  /** On a page without a stored price, a price Rails reads live (BOLD's from
   *  the Curve BOLD/USDC pool, A1.7), in the no-price line's place. It draws
   *  the card's figure too, inside its receipts scope. */
  livePrice?: ReactNode;
  /** The band's right half (decision 0069, A7): the asset's use in the
   *  protocol and the other explorers using it. */
  aside: ReactNode;
  /** The chain's label after the h1; under a protocol its heading names the chain. */
  chainLabel?: boolean;
}) {
  return (
    <header className="mb-2" data-skel-section="page-header" data-anatomy="A1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold text-foreground">
          <ChainProvider chainId={chain as ChainId}>
            <TokenChipIcon symbol={symbol} address={token} size={24} filterable={false} untitled />
          </ChainProvider>
          <span className="min-w-0 truncate">{symbol}</span>
          {chainLabel && <ChainLabel chainId={chain as ChainId} anatomy={null} className="ml-1" />}
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
            (livePrice ?? (
              <>
                {figure && <FigureRow figure={figure} />}
                <p className="mt-1 text-sm text-rb-500" data-asset-priceless="" data-anatomy="A1.3">
                  {PRICELESS_WHY}
                </p>
              </>
            ))
          )}
          {token.toLowerCase() !== NATIVE && <ContractLine chain={chain} token={token} />}
        </div>
        {aside}
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
        rel="noopener"
        className="font-mono text-xs text-blue-600 hover:underline dark:text-[var(--text-link)]"
        title={address}
      >
        {shortAddress(address)}
      </a>
      <CopyFact value={address} label="Copy contract address" name="contract" />
    </p>
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
