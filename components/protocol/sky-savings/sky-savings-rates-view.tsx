"use client";

// The Savings Rate history: every File('ssr') the sUSDS contract emitted, the
// share price and rate at the sealed block, and the PSM price of USDS. Each
// rate is stated at the block that set it; nothing is drawn between two.

import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { formatDate } from "@/lib/date";
import { explorerUrl } from "@/lib/shared/chains";
import { SKY_CHAIN_ID, SUSDS, USDS } from "@/lib/sky-savings/constants";
import { pctString, rayExact, rayNumber, usdcPerUsdsAt } from "@/lib/sky-savings/math";
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
              <Prov info={chiProv(asOf.block, asOf.chi)} value={rayExact(asOf.chi)} symbol={USDS.symbol}>
                <span>{rayNumber(asOf.chi).toFixed(6)}</span>
              </Prov>
              <span className="text-sm font-normal text-rb-500"> {USDS.symbol}</span>
            </Figure>
          )}
          {usdc != null && (
            <Figure label="One USDS worth">
              <Prov info={psmPriceProv(asOf.block, usdc.toFixed(6))} value={usdc.toFixed(6)}>
                <span>{usdc.toFixed(6)}</span>
              </Prov>
              <span className="text-sm font-normal text-rb-500"> USDC at the PSM</span>
            </Figure>
          )}
        </div>
        <p className="text-xs text-rb-500">
          At <BlockRef block={asOf.block} chainId={SKY_CHAIN_ID} />.
        </p>

        <div className="overflow-x-auto rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised">
          <table className="w-full min-w-[520px] text-sm tabular-nums" data-sky-rate-history={rows.length}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-rb-500">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Block</th>
                <th className="px-4 py-2.5 font-medium text-right">From</th>
                <th className="px-4 py-2.5 font-medium text-right">To</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const to = pctString(r.annualRate);
                return (
                  <tr key={r.txHash} className="border-t border-rb-300/40 dark:border-rb-700/40">
                    <td className="px-4 py-2 text-foreground/80">{formatDate(r.timestamp)}</td>
                    <td className="px-4 py-2">
                      <a
                        href={explorerUrl(SKY_CHAIN_ID, "tx", r.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-muted"
                      >
                        {r.blockNumber.toLocaleString("en-US")}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-right text-rb-500">{pctString(r.previousAnnualRate)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      <Prov info={rateChangeProv(r.blockNumber, r.txHash, r.ssr, to)} value={to}>
                        <span>{to}</span>
                      </Prov>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
