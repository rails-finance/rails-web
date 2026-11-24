// Under a protocol's asset chart (Miles's mockup and ruling of 24 Nov 2026,
// "one table"; ui-jobs 818; anatomy A2.4 to A2.6): "How other protocols price
// <symbol>", one table in three groups with no sub-headings. First the
// protocols on the page's own oracle line ("Same oracle as <page protocol>"),
// then one row per other line, then the protocols that list the token and
// store no line for it ("No stored price"). Each row has Used by, Oracle,
// Contract and Price now, and on a same-block read a Gap; a row opens its
// markets, a listed-only row does not. Prices and gaps carry their receipts.
// Where the prices stand at different blocks (the stored stub) the table shows
// the price only and draws no as-of line. Below sm each row is a card.

import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { shortAddress, type PageLine } from "@/lib/shared/asset-roster";
import {
  AS_OF_NOTE,
  asOfText,
  gapProv,
  marketWords,
  priceProv,
  type OracleRow,
  type PageProtocol,
  type PriceCell,
} from "@/lib/shared/asset-oracle-view";
import type { AssetPricesNow } from "@/lib/shared/asset-prices-now";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const ADDRESS_LINK = "font-mono text-blue-600 hover:underline dark:text-[var(--text-link)]";
const SECTION_HEAD = "text-xs font-semibold uppercase tracking-[0.12em] text-rb-500";

function Address({ chain, address }: { chain: number; address: string }) {
  return (
    <a
      href={explorerUrl(chain as ChainId, "address", address)}
      target="_blank"
      rel="noopener"
      className={ADDRESS_LINK}
      title={address}
    >
      {shortAddress(address)}
    </a>
  );
}

function ProtocolName({ p, className = "" }: { p: PageProtocol; className?: string }) {
  return p.href ? (
    <Link href={p.href} className={`${INLINE_LINK} ${className}`} data-asset-oracle-link={p.explorer ?? ""}>
      {p.name}
    </Link>
  ) : (
    <span className={className}>{p.name}</span>
  );
}

/** "–" with why it is there, on a press. */
function Dash({ reason }: { reason: string | null }) {
  return (
    <RevealTip tip={reason ?? "Not read"} label={`No figure: ${reason ?? "not read"}`} focusable wrap align="end">
      <span className="tip-underline text-rb-500" data-asset-dash={reason ?? ""}>
        –
      </span>
    </RevealTip>
  );
}

function PriceFigure({
  cell,
  line,
  symbol,
  now,
}: {
  cell: PriceCell;
  line: Pick<PageLine, "oracle" | "id">;
  symbol: string;
  now: AssetPricesNow;
}) {
  const p = now.prices[line.id];
  if (cell.value == null || !p) return <Dash reason={cell.reason} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      {cell.stale && (
        <span
          className="rounded border border-[var(--caution)] px-1 text-[11px] leading-4 text-[var(--caution)]"
          title="The oracle's last update is older than its heartbeat"
          data-asset-stale=""
        >
          stale
        </span>
      )}
      <Prov info={priceProv(line, p, symbol)} value={String(cell.value)} symbol={symbol}>
        <span className="text-foreground">{cell.text}</span>
      </Prov>
    </span>
  );
}

/** "How other protocols price WETH" (A2.4): a row per protocol group entry (A2.5). */
export function OracleTable({
  rows,
  lines,
  pageLine,
  chain,
  symbol,
  refName,
  now,
}: {
  rows: OracleRow[];
  lines: readonly PageLine[];
  /** The page's line's id: the gap's reference. */
  pageLine: string;
  chain: number;
  symbol: string;
  /** Whose price the gap is against: "Liquity V2's price", "the price most protocols read". */
  refName: string;
  now: AssetPricesNow;
}) {
  if (rows.length === 0) return null;
  const gaps = now.sameBlock;
  const cols = gaps
    ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7rem_7.5rem_4.5rem]"
    : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7rem_7.5rem]";
  const lineOf = (id: string) => lines.find((l) => l.id === id)!;
  const refPrice = now.prices[pageLine]?.price ?? null;
  return (
    <section className="mt-8" data-asset-oracles="" data-asset-gaps={gaps ? "on" : "off"} data-anatomy="A2.4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={SECTION_HEAD}>How other protocols price {symbol}</h2>
        {gaps && (
          <p className="text-sm text-rb-500" data-asset-gap-caption="">
            Gap is against {refName}
          </p>
        )}
      </div>
      <div
        className={`hidden gap-x-4 border-b border-rb-200 pb-2 text-xs text-rb-500 sm:grid dark:border-rb-700 ${cols}`}
        aria-hidden="true"
      >
        <span>Used by</span>
        <span>Oracle</span>
        <span>Contract</span>
        <span className="text-right">Price now</span>
        {gaps && <span className="text-right">Gap</span>}
      </div>
      <ul className="divide-y divide-rb-200 dark:divide-rb-700">
        {rows.map((r) => {
          const line = r.lineId ? lineOf(r.lineId) : null;
          const listed = r.group === "listed";
          const summaryClass = `grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 sm:items-center ${cols}`;
          const cells = (
            <>
              <span className="col-span-2 font-semibold text-foreground sm:col-span-1" data-asset-used-by="">
                {!listed && (
                  <ChevronRight
                    className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-rb-500 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                )}
                {r.usedBy.map((p, i) => (
                  <span key={p.name}>
                    {i > 0 && ", "}
                    <ProtocolName p={p} />
                  </span>
                ))}
                {r.retired && <span className="font-normal text-rb-500"> (retired)</span>}
              </span>
              <span className="col-span-2 min-w-0 sm:col-span-1" title={r.full ?? undefined}>
                <span className={`block ${listed ? "text-rb-500" : "text-foreground"}`} data-asset-oracle-name="">
                  {r.name}
                </span>
                {r.via ? (
                  <span className="block text-sm text-rb-500" data-asset-oracle-kind="">
                    via {r.via.words} <Address chain={chain} address={r.via.address} />
                  </span>
                ) : (
                  r.kind && (
                    <span className="block text-sm text-rb-500" data-asset-oracle-kind="">
                      {r.kind}
                    </span>
                  )
                )}
              </span>
              <span className="text-sm">
                {r.address ? <Address chain={chain} address={r.address} /> : <span className="text-rb-500">–</span>}
              </span>
              <span className="text-right tabular-nums" data-asset-price-now={r.price.value ?? ""}>
                {line ? (
                  <PriceFigure cell={r.price} line={line} symbol={symbol} now={now} />
                ) : (
                  <span className="text-rb-500">–</span>
                )}
              </span>
              {r.gap && (
                <span
                  className="col-span-2 text-right tabular-nums text-rb-500 sm:col-span-1"
                  data-asset-gap={r.gap.value ?? ""}
                >
                  <span className="mr-2 text-xs sm:hidden">Gap</span>
                  {listed ? (
                    "–"
                  ) : r.gap.value != null && r.price.value != null && refPrice != null ? (
                    <Prov info={gapProv(r, r.price.value, refPrice, refName, now.block)} value={String(r.gap.value)}>
                      <span className="text-foreground">{r.gap.text}</span>
                    </Prov>
                  ) : (
                    <Dash reason={r.gap.reason} />
                  )}
                </span>
              )}
            </>
          );
          return (
            <li key={r.id} data-asset-oracle={r.id} data-asset-oracle-group={r.group} data-anatomy="A2.5">
              {listed ? (
                <div className={summaryClass}>{cells}</div>
              ) : (
                <details className="group">
                  <summary className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${summaryClass}`}>
                    {cells}
                  </summary>
                  <ul className="mb-3 space-y-0.5 text-sm text-rb-500" data-asset-oracle-markets="">
                    {r.full && <li className="text-foreground">{r.full}</li>}
                    {r.markets.map((m) => {
                      const w = marketWords(m);
                      return (
                        <li key={`${m.protocol}${m.via?.address ?? ""}`}>
                          {w.before}
                          {m.via && (
                            <>
                              {" "}
                              <Address chain={chain} address={m.via.address} />
                            </>
                          )}
                          {w.after}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The as-of line (A2.6), with its explanation behind the (i). Drawn on a same-block read only. */
export function AsOfLine({ now }: { now: AssetPricesNow }) {
  const text = asOfText(now);
  if (text == null) return null;
  return (
    <p
      className="mt-8 flex items-center gap-2 border-t border-rb-200 pt-4 text-sm text-rb-500 dark:border-rb-700"
      data-asset-as-of={now.block ?? ""}
      data-anatomy="A2.6"
    >
      {text}
      <RevealTip tip={AS_OF_NOTE} label={`About the prices: ${AS_OF_NOTE}`} focusable wrap>
        <Info className="h-4 w-4" aria-hidden="true" />
      </RevealTip>
    </p>
  );
}
