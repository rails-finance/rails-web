// A protocol's asset page heading and source row (rails-ops
// reference/app-anatomy.md, A1, A7; decision 0069; Miles, 24 Nov 2026, ui-jobs
// 818). The heading (`AssetTitle`): Back's row (H7, the detail pages'
// DetailBackButton, its fresh-tab fallback the protocol's Assets list), then
// the h1, the token's mark and symbol; the protocol bar above names the
// protocol and chain. The source row (`SourceRow`), under the chart panel: the
// oracle the page charts and the contract it is read through (A1.9,
// `sourceLine`), then muted what the token wraps or what wraps it and its
// contract with a copy button (A1.6), and at its right the protocol's pages
// for the token (A1.10), under it on a narrow screen. A page without a stored
// price draws its figure and the no-price line (A1.3), or BOLD's live read
// (A1.7), in the chart panel's place (`UnpricedPanel`), and a source row
// without the oracle.

import Link from "next/link";
import type { ReactNode } from "react";
import { FigureRow } from "@/components/assets/asset-explorer";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { CopyFact } from "@/components/shared/event-page-aside";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainProvider } from "@/lib/shared/chain-context";
import { chainName, NATIVE, shortAddress } from "@/lib/shared/asset-roster";
import { PRICELESS_WHY, type CardFigure } from "@/lib/shared/asset-explorer";
import type { SourceLine } from "@/lib/shared/asset-oracle-view";
import type { ChipUse } from "@/lib/shared/asset-uses";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

/** One relation in the source row: "Wrapped", "Wrapped as", "Priced from it:". */
export interface RelationGroup {
  word: string;
  links: { symbol: string; chain: number; href: string }[];
}

const ADDRESS_LINK = "font-mono text-blue-600 hover:underline dark:text-[var(--text-link)]";

/** Back's row and the h1: the token's mark and symbol. */
export function AssetTitle({
  chain,
  token,
  symbol,
  backHref,
}: {
  chain: number;
  token: string;
  symbol: string;
  /** Where Back lands on a fresh tab: the protocol's Assets list. */
  backHref: string;
}) {
  return (
    <header className="mb-4" data-skel-section="page-header" data-anatomy="A1">
      <div className="flex min-h-[38px] items-center" data-anatomy="H7" data-back-row="" data-asset-back={backHref}>
        <DetailBackButton fallbackHref={backHref} />
      </div>
      <h1
        className="mt-4 flex min-w-0 items-center gap-2 text-2xl font-semibold text-foreground sm:text-3xl"
        data-asset-title=""
      >
        <ChainProvider chainId={chain as ChainId}>
          <TokenChipIcon symbol={symbol} address={token} size={28} filterable={false} untitled />
        </ChainProvider>
        <span className="min-w-0 truncate">{symbol}</span>
      </h1>
    </header>
  );
}

/** The row under the chart panel: the source, the relations and contract, the protocol's pages. */
export function SourceRow({
  chain,
  token,
  source,
  relations,
  markets,
}: {
  chain: number;
  token: string;
  /** The oracle the page charts; null on a page without a stored price. */
  source: SourceLine | null;
  relations: RelationGroup[];
  /** The protocol's pages for the token ("Branch", "Troves"). */
  markets: ChipUse[];
}) {
  const address = token.toLowerCase();
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2" data-asset-source-row="">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        {source && (
          <span className="text-foreground" data-asset-source={source.address} data-anatomy="A1.9">
            {source.words}{" "}
            <a
              href={explorerUrl(chain as ChainId, "address", source.address)}
              target="_blank"
              rel="noopener"
              className={ADDRESS_LINK}
              title={source.address}
            >
              {shortAddress(source.address)}
            </a>
          </span>
        )}
        <span
          className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-rb-500"
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
        </span>
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
