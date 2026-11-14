"use client";

// The Savings Rate history: every File('ssr') the sUSDS contract emitted, the
// share price and rate at the sealed block, and the PSM price of USDS. Each
// rate is stated at the block that set it; nothing is drawn between two. The
// history on the house table (rails-ops ui-jobs 539: D1, D6 cards below sm),
// newest first and unlinked.

import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { formatDate } from "@/lib/date";
import { explorerUrl } from "@/lib/shared/chains";
import { SKY_CHAIN_ID, SUSDS, USDS } from "@/lib/sky-savings/constants";
import { pctString, rayExact, rayNumber, toutAt, usdcPerUsdsAt } from "@/lib/sky-savings/math";
import { chiProv, psmPriceProv, rateChangeProv, rateProv } from "@/lib/sky-savings/provenance";
import type { SkyRates } from "@/lib/sky-savings/types";

export function SkySavingsRatesView({ rates }: { rates: SkyRates }) {
  const registry = useReceiptRegistry();
  const { asOf } = rates;
  const usdc = usdcPerUsdsAt(rates.psm.series, asOf.block);
  const rows = [...rates.ssr].reverse();
  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label="Savings Rate now">
            <Prov info={rateProv(asOf.block, asOf.ssr, pctString(asOf.ssrAnnual))} value={pctString(asOf.ssrAnnual)}>
              <span>{pctString(asOf.ssrAnnual)}</span>
            </Prov>
            <span className="text-sm font-normal text-rb-500"> a year</span>
          </Figure>
          {asOf.chi && (
            <Figure label={`One ${SUSDS.symbol} worth`}>
              <Prov info={chiProv(asOf)} value={rayExact(asOf.chi)} symbol={USDS.symbol}>
                <span>{rayNumber(asOf.chi).toFixed(6)}</span>
              </Prov>
              <span className="text-sm font-normal text-rb-500"> {USDS.symbol}</span>
            </Figure>
          )}
          {usdc != null && (
            <Figure label="One USDS worth">
              <Prov
                info={psmPriceProv(asOf.block, usdc.toFixed(6), toutAt(rates.psm.series, asOf.block))}
                value={usdc.toFixed(6)}
              >
                <span>{usdc.toFixed(6)}</span>
              </Prov>
              <span className="text-sm font-normal text-rb-500"> USDC at the PSM</span>
            </Figure>
          )}
        </div>
        <p className="text-xs text-rb-500">
          At <BlockRef block={asOf.block} chainId={SKY_CHAIN_ID} />.
        </p>

        <DataTable
          label="Savings Rate changes, newest first"
          stacked
          rowHeight="one"
          tableClassName="text-sm tabular-nums sm:min-w-[520px]"
          data-sky-rate-history={rows.length}
        >
          <DataTableHead>
            <DataTableHeader label="Date" />
            <DataTableHeader label="Block" />
            <DataTableHeader label="From" align="right" />
            <DataTableHeader label="To" align="right" />
          </DataTableHead>
          <DataTableBody>
            {rows.map((r) => {
              const to = pctString(r.annualRate);
              return (
                <DataTableRow key={r.txHash}>
                  <DataTableCell rowHeader className="whitespace-nowrap text-foreground">
                    {formatDate(r.timestamp)}
                  </DataTableCell>
                  <DataTableCell label="Block" className="whitespace-nowrap">
                    <a
                      href={explorerUrl(SKY_CHAIN_ID, "tx", r.txHash)}
                      target="_blank"
                      rel="noopener"
                      className="link-muted"
                      // The change's coordinate, linked to its transaction.
                      data-prov-exempt=""
                    >
                      {r.blockNumber.toLocaleString("en-US")}
                    </a>
                  </DataTableCell>
                  <DataTableCell label="From" align="right" className="whitespace-nowrap text-rb-500">
                    {pctString(r.previousAnnualRate)}
                  </DataTableCell>
                  <DataTableCell label="To" align="right" className="whitespace-nowrap text-foreground">
                    <Prov info={rateChangeProv(r.blockNumber, r.txHash, r.ssr, to)} value={to}>
                      <span className="font-semibold">{to}</span>
                    </Prov>
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      </div>
    </ProvReceiptsScope>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider text-rb-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground/80">{children}</div>
    </div>
  );
}
