// A protocol's asset page heading (rails-ops reference/app-anatomy.md, A1, A7;
// decision 0069; Miles's mockup of 24 Nov 2026, ui-jobs 818): the title
// ("WETH price in Liquity V2", `assetTitle`) with the chain's pill; under it
// the source line naming the oracle the page charts and the contract it is
// read through (A1.9, `sourceLine`); then one muted line, what the token
// wraps or what wraps it and its contract with a copy button (A1.6), with the
// protocol's pages for the token at its right (A1.10). A page without a stored
// price draws no source line, and its figure and the no-price line (A1.3), or
// BOLD's live read (A1.7), stand in the chart panel's place (`UnpricedPanel`).

import Link from "next/link";
import type { ReactNode } from "react";
import { FigureRow } from "@/components/assets/asset-explorer";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { CopyFact } from "@/components/shared/event-page-aside";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainProvider } from "@/lib/shared/chain-context";
import { chainName, NATIVE, shortAddress } from "@/lib/shared/asset-roster";
import { PRICELESS_WHY, type CardFigure } from "@/lib/shared/asset-explorer";
import type { SourceLine } from "@/lib/shared/asset-oracle-view";
import type { ChipUse } from "@/lib/shared/asset-uses";
import { CHAINS, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

/** One relation in the line under the source: "Wrapped", "Wrapped as", "Priced from it:". */
export interface RelationGroup {
  word: string;
  links: { symbol: string; chain: number; href: string }[];
}

const ADDRESS_LINK = "font-mono text-blue-600 hover:underline dark:text-[var(--text-link)]";

export function AssetPageHead({
  chain,
  token,
  symbol,
  title,
  source,
  relations,
  markets,
}: {
  /** The asset's chain: the explorer's. */
  chain: number;
  token: string;
  symbol: string;
  /** `assetTitle`'s words. */
  title: string;
  /** The oracle the page charts; null on a page without a stored price. */
  source: SourceLine | null;
  relations: RelationGroup[];
  /** The protocol's pages for the token ("Branch", "Troves"). */
  markets: ChipUse[];
}) {
  const address = token.toLowerCase();
  return (
    <header className="mb-6" data-skel-section="page-header" data-anatomy="A1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          className="flex min-w-0 items-center gap-2 text-2xl font-semibold text-foreground sm:text-3xl"
          data-asset-title=""
        >
          <ChainProvider chainId={chain as ChainId}>
            <TokenChipIcon symbol={symbol} address={token} size={28} filterable={false} untitled />
          </ChainProvider>
          <span className="min-w-0">{title}</span>
        </h1>
        <ChainPill chain={chain} />
      </div>
      {source && (
        <p className="mt-2 text-sm text-foreground sm:text-base" data-asset-source={source.address} data-anatomy="A1.9">
          {source.words}{" "}
          <a
            href={explorerUrl(chain as ChainId, "address", source.address)}
            target="_blank"
            rel="noopener"
            className={`${ADDRESS_LINK} text-sm`}
            title={source.address}
          >
            {shortAddress(source.address)}
          </a>
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-rb-500"
          data-asset-links=""
          data-anatomy="A1.6"
        >
          {relations.map((g, gi) => (
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
          {address !== NATIVE && (
            <span className="inline-flex items-center gap-1.5" data-asset-contract={address}>
              {relations.length > 0 && <span aria-hidden="true">·</span>}
              contract
              <a
                href={explorerUrl(chain as ChainId, "token", address)}
                target="_blank"
                rel="noopener"
                className={ADDRESS_LINK}
                title={address}
              >
                {shortAddress(address)}
              </a>
              <CopyFact value={address} label="Copy contract address" name="contract" />
            </span>
          )}
        </p>
        {markets.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-asset-markets="" data-anatomy="A1.10">
            {markets.map((m) => (
              <li key={m.href + m.label}>
                <Link href={m.href} className={INLINE_LINK} data-asset-market={m.href}>
                  {m.label} <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  );
}

/** The chain's pill beside the title: its glyph and name. */
function ChainPill({ chain }: { chain: number }) {
  const c = CHAINS[chain as ChainId];
  if (!c) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rb-200 px-2.5 py-0.5 text-sm text-foreground dark:border-rb-700"
      data-chain-label={c.slug}
    >
      <ChainGlyph chainId={c.id} className="h-3.5 w-3.5" />
      {c.name}
    </span>
  );
}

/** A page without a stored price, in the chart panel's place: the card's
 *  figure over the no-price line (A1.3), or the live read that stands for it
 *  (`livePrice`, BOLD's, A1.7). */
export function UnpricedPanel({ figure, livePrice }: { figure: CardFigure | null; livePrice?: ReactNode }) {
  return (
    <div className="rounded-xl bg-raised p-3 sm:p-4" data-asset-unpriced="">
      {livePrice ?? (
        <>
          {figure && <FigureRow figure={figure} />}
          <p className="mt-1 text-sm text-rb-500" data-asset-priceless="" data-anatomy="A1.3">
            {PRICELESS_WHY}
          </p>
        </>
      )}
    </div>
  );
}
