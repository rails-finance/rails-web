// Under a protocol's asset chart (Miles's mockup of 24 Nov 2026; ui-jobs 818;
// anatomy A2.3 to A2.6): "Also reads this oracle", the other protocols on the
// page's line (`alsoReads`); "Other oracles for <symbol>", one row per other
// line with its readers, oracle, contract, price now and gap against the
// page's price (`oracleRows`), each row opening its markets; and the as-of
// line (`asOfText`). Prices and gaps carry their receipts. Where the prices
// stand at different blocks (the stored stub) a price carries its stamp,
// the Gap column is held back with a line saying why, and the as-of line says
// each price has its block. Below sm each row is a card.

import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { shortAddress, type PageLine } from "@/lib/shared/asset-roster";
import {
  alsoReadsWords,
  asOfNote,
  asOfText,
  gapProv,
  marketWords,
  priceProv,
  type AlsoReadsEntry,
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

/** "Also reads this oracle" (A2.3): each protocol, its route and its first stored day. */
export function AlsoReads({ entries, chain }: { entries: AlsoReadsEntry[]; chain: number }) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-8" data-asset-also-reads="" data-anatomy="A2.3">
      <h2 className={`mb-2 ${SECTION_HEAD}`}>Also reads this oracle</h2>
      <ul className="space-y-1 text-sm sm:text-base">
        {entries.map((e) => {
          const w = alsoReadsWords(e);
          return (
            <li key={e.protocol.name} className="flex flex-wrap items-baseline gap-x-4" data-asset-also-reader="">
              <ProtocolName p={e.protocol} className="font-semibold text-foreground" />
              <span className="text-rb-500">
                {w.before}
                {e.route && (
                  <>
                    {" "}
                    <Address chain={chain} address={e.route.address} />
                  </>
                )}
                {w.after}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
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
    <span className="inline-flex flex-col items-end">
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
      {cell.stamp && (
        <span className="text-[11px] text-rb-500" data-asset-price-stamp={p.block ?? ""}>
          {cell.stamp}
        </span>
      )}
    </span>
  );
}

/** "Other oracles for WETH" (A2.4): a row per other line (A2.5). */
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
    : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7rem_11rem]";
  const lineOf = (id: string) => lines.find((l) => l.id === id)!;
  const refPrice = now.prices[pageLine]?.price ?? null;
  return (
    <section className="mt-8" data-asset-oracles="" data-asset-gaps={gaps ? "on" : "off"} data-anatomy="A2.4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={SECTION_HEAD}>Other oracles for {symbol}</h2>
        {gaps ? (
          <p className="text-sm text-rb-500" data-asset-gap-caption="">
            Gap is against {refName}
          </p>
        ) : (
          <p className="text-sm text-rb-500" data-asset-gap-held="">
            Gaps show once every price is read at one block.
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
          const line = lineOf(r.id);
          return (
            <li key={r.id} data-asset-oracle={r.id} data-anatomy="A2.5">
              <details className="group">
                <summary
                  className={`grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 sm:items-center [&::-webkit-details-marker]:hidden ${cols}`}
                >
                  <span className="col-span-2 font-semibold text-foreground sm:col-span-1" data-asset-used-by="">
                    <ChevronRight
                      className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-rb-500 transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    />
                    {r.usedBy.map((p, i) => (
                      <span key={p.name}>
                        {i > 0 && ", "}
                        <ProtocolName p={p} />
                      </span>
                    ))}
                    {r.retired && <span className="font-normal text-rb-500"> (retired)</span>}
                  </span>
                  <span className="col-span-2 min-w-0 sm:col-span-1" title={r.full ?? undefined}>
                    <span className="block text-foreground" data-asset-oracle-name="">
                      {r.name}
                    </span>
                    {r.kind && (
                      <span className="block text-sm text-rb-500" data-asset-oracle-kind="">
                        {r.kind}
                      </span>
                    )}
                  </span>
                  <span className="text-sm">
                    <Address chain={chain} address={r.address} />
                  </span>
                  <span className="text-right tabular-nums" data-asset-price-now={r.price.value ?? ""}>
                    <PriceFigure cell={r.price} line={line} symbol={symbol} now={now} />
                  </span>
                  {r.gap && (
                    <span
                      className="col-span-2 text-right tabular-nums text-rb-500 sm:col-span-1"
                      data-asset-gap={r.gap.value ?? ""}
                    >
                      <span className="mr-2 text-xs sm:hidden">Gap</span>
                      {r.gap.value != null && r.price.value != null && refPrice != null ? (
                        <Prov
                          info={gapProv(r, r.price.value, refPrice, refName, now.block)}
                          value={String(r.gap.value)}
                        >
                          <span className="text-foreground">{r.gap.text}</span>
                        </Prov>
                      ) : (
                        <Dash reason={r.gap.reason} />
                      )}
                    </span>
                  )}
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The as-of line (A2.6), with its explanation behind the (i). */
export function AsOfLine({ now }: { now: AssetPricesNow }) {
  const note = asOfNote(now);
  return (
    <p
      className="mt-8 flex items-center gap-2 border-t border-rb-200 pt-4 text-sm text-rb-500 dark:border-rb-700"
      data-asset-as-of={now.sameBlock ? (now.block ?? "") : "each"}
      data-anatomy="A2.6"
    >
      {asOfText(now)}
      <RevealTip tip={note} label={`About the prices: ${note}`} focusable wrap>
        <Info className="h-4 w-4" aria-hidden="true" />
      </RevealTip>
    </p>
  );
}
