// Under a protocol's asset chart (Miles's mockup and ruling of 24 Nov 2026,
// "one table"; ui-jobs 818; anatomy A2.4 to A2.6): "How other protocols price
// <symbol>", one table in three groups with no sub-headings, on the house
// table (D1, D4, D5, D6; components/shared/data-table). First the protocols on
// the page's own oracle line ("Same oracle as <page protocol>"), then the
// other lines, then the protocols that list the token and store no line for it
// ("Not saved by Rails"). One row per protocol, or per market for a protocol that
// reads more than one line; each row is one link to that protocol's page for
// the token (a plain row where it has none), and does not expand. Each row has
// the Oracle and
// Price now, and on a same-block read a Gap; prices and gaps carry their
// receipts. Where the prices stand at different blocks (the stored stub) the
// table shows the price only and draws no as-of line. Below sm each row is a
// card (D6).

import { Info } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableLeadCell,
  DataTableLeadHeader,
  DataTableLeadMark,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { shortAddress, type PageLine } from "@/lib/shared/asset-roster";
import {
  AS_OF_NOTE,
  asOfText,
  gapProv,
  priceProv,
  rowLabel,
  tableIntro,
  type OracleRow,
  type PriceCell,
} from "@/lib/shared/asset-oracle-view";
import type { AssetPricesNow } from "@/lib/shared/asset-prices-now";
import type { ChainId } from "@/lib/shared/chains";

/** An address as mono text, the full one in its tooltip. A link here would sit in a row's link. */
function Address({ address }: { address: string }) {
  return (
    <span className="font-mono" title={address}>
      {shortAddress(address)}
    </span>
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

/** "How other protocols price WETH" (A2.4): a row per protocol (A2.5), on the house table. */
export function OracleTable({
  rows,
  lines,
  pageLine,
  chain,
  symbol,
  refName,
  gapFrom,
  chainName,
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
  /** What the intro says the gap is from: "Liquity V2's price", "the price charted above". */
  gapFrom: string;
  chainName: string;
  now: AssetPricesNow;
}) {
  if (rows.length === 0) return null;
  const gaps = now.sameBlock;
  const lineOf = (id: string) => lines.find((l) => l.id === id)!;
  const refPrice = now.prices[pageLine]?.price ?? null;
  return (
    <section className="mt-8" data-asset-oracles="" data-asset-gaps={gaps ? "on" : "off"} data-anatomy="A2.4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="max-w-3xl text-sm leading-relaxed text-rb-500" data-asset-oracles-intro="">
          {tableIntro({
            chain: chainName,
            symbol,
            sameBlock: gaps,
            gapFrom,
          })}
        </p>
        {gaps && (
          <p className="text-sm text-rb-500" data-asset-gap-caption="">
            Gap is against {refName}
          </p>
        )}
      </div>
      <DataTable
        label={`How other protocols price ${symbol}`}
        tableClassName="min-w-[640px] text-sm"
        stacked
        rowHeight="two"
      >
        <DataTableHead>
          <DataTableLeadHeader plain chainless />
          <DataTableHeader label="Used by" />
          <DataTableHeader label="Oracle" />
          <DataTableHeader label="Price now" align="right" />
          {gaps && <DataTableHeader label="Gap" align="right" />}
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => {
            const line = r.lineId ? lineOf(r.lineId) : null;
            const listed = r.group === "listed";
            const href = r.protocol.href ?? undefined;
            const explorer = r.protocol.explorer ?? "";
            const nameText = (
              <span data-asset-used-by="">
                {r.protocol.name}
                {r.retired && <span className="font-normal text-rb-500"> (retired)</span>}
              </span>
            );
            return (
              <DataTableRow
                key={r.id}
                href={href}
                data-asset-oracle={r.id}
                data-asset-oracle-group={r.group}
                data-asset-oracle-href={href ?? ""}
                data-anatomy="A2.5"
              >
                <DataTableLeadCell
                  protocol={explorer}
                  protocolName={r.protocol.name}
                  chain={chain as ChainId}
                  plain
                  chainless
                />
                <DataTableCell rowHeader valign="middle" className="sm:w-[22%] sm:min-w-[180px] sm:whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <DataTableLeadMark protocol={explorer} chain={chain as ChainId} chainless />
                    {href ? (
                      <DataTableRowLink href={href} aria-label={rowLabel(r)} className="font-semibold">
                        {nameText}
                      </DataTableRowLink>
                    ) : (
                      <span className="font-semibold text-foreground">{nameText}</span>
                    )}
                  </span>
                </DataTableCell>
                <DataTableCell label="Oracle" wide valign="middle" className="sm:w-full sm:max-w-0 sm:min-w-[220px]">
                  <span className="block min-w-0" title={r.full ?? undefined}>
                    <span
                      className={`block truncate ${listed ? "text-rb-500" : "text-foreground"}`}
                      data-asset-oracle-name=""
                    >
                      {r.name}
                    </span>
                    {r.via ? (
                      <span className="block truncate text-sm text-rb-500" data-asset-oracle-kind="">
                        via {r.via.words} <Address address={r.via.address} />
                      </span>
                    ) : (
                      r.kind && (
                        <span className="block truncate text-sm text-rb-500" data-asset-oracle-kind="">
                          {r.kind}
                        </span>
                      )
                    )}
                  </span>
                </DataTableCell>
                <DataTableCell
                  label="Price now"
                  align="right"
                  valign="middle"
                  className="whitespace-nowrap tabular-nums sm:w-[130px]"
                  data-asset-price-now={r.price.value ?? ""}
                >
                  {line ? (
                    <PriceFigure cell={r.price} line={line} symbol={symbol} now={now} />
                  ) : (
                    <span className="text-rb-500">–</span>
                  )}
                </DataTableCell>
                {r.gap && (
                  <DataTableCell
                    label="Gap"
                    align="right"
                    valign="middle"
                    className="whitespace-nowrap tabular-nums text-rb-500 sm:w-[110px]"
                    data-asset-gap={r.gap.value ?? ""}
                  >
                    {listed ? (
                      "–"
                    ) : r.gap.value != null && r.price.value != null && refPrice != null ? (
                      <Prov info={gapProv(r, r.price.value, refPrice, refName, now.block)} value={String(r.gap.value)}>
                        <span className="text-foreground">{r.gap.text}</span>
                      </Prov>
                    ) : (
                      <Dash reason={r.gap.reason} />
                    )}
                  </DataTableCell>
                )}
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
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
      {now.stale && (
        <span data-asset-as-of-cached="true" title="The server's last read, served while it refreshes">
          (cached)
        </span>
      )}
      <RevealTip tip={AS_OF_NOTE} label={`About the prices: ${AS_OF_NOTE}`} focusable wrap>
        <Info className="h-4 w-4" aria-hidden="true" />
      </RevealTip>
    </p>
  );
}
