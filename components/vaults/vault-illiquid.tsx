"use client";

// The markets that make a MetaMorpho vault illiquid, on its card's band (V2;
// rails-ops ui-jobs 540; the sentence is the Yield subline's): one row per market the test caught,
// with its share of the vault, how much of it is borrowed, its borrow rate and
// when Morpho Blue last settled it. The test and the words are
// lib/vaults/illiquid.ts.

import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { illiquidPct, marketName, ratePct, type IlliquidMarket, type VaultIlliquid } from "@/lib/vaults/illiquid";
import type { VaultSummary } from "@/lib/vaults/summary";

const n = (x: number) => x.toLocaleString("en-US");

const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

/** One market's reads at the block, for its utilisation and its rate. */
const marketProv = (
  v: VaultSummary,
  il: VaultIlliquid,
  m: IlliquidMarket,
  what: "utilisation" | "rate",
): Provenance => ({
  kind: "derived",
  pclass: "state",
  source: { block: il.block },
  summary:
    what === "utilisation"
      ? `Borrowed — the ${marketName(m)} market's totalBorrowAssets over its totalSupplyAssets, with interest accrued to block ${n(il.block)}.`
      : `Borrow rate — Rails's figure: the AdaptiveCurveIRM's curve at the utilisation Morpho Blue last settled over its rate at target, a year, before compounding: the rate the market charges from this block until it next settles. The rate at target is the stored rateAtTarget adapted to block ${n(il.block)}; it is at the IRM's maximum of 200% a year, so a fully used market charges the ceiling, 800% a year.`,
  contract: { name: `Morpho Blue market ${m.id.slice(0, 10)}…` },
  via:
    what === "utilisation"
      ? `market(${m.id.slice(0, 10)}…) @ block ${n(il.block)}`
      : `AdaptiveCurveIRM rateAtTarget(${m.id.slice(0, 10)}…) @ block ${n(il.block)}`,
  inputs: [{ label: "market id", value: m.id, kind: "chain", pclass: "state" }],
});

export function VaultIlliquidMarkets({ vault: v, il }: { vault: VaultSummary; il: VaultIlliquid }) {
  return (
    <div
      className="mt-4 rounded-lg border border-rb-300 px-3 py-2.5 text-[12px] leading-relaxed dark:border-rb-700"
      data-vault-illiquid={il.block}
    >
      <p className="font-semibold text-foreground">Markets fully borrowed, the rate model at its maximum</p>
      <table className="mt-2 w-full text-left tabular-nums max-sm:hidden">
        <thead className="text-[11px] text-rb-500">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              Market
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Share of this vault
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Borrowed
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Borrow rate
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Last settled
            </th>
          </tr>
        </thead>
        <tbody>
          {il.markets.map((m) => {
            const at = new Date(m.lastUpdate * 1000);
            return (
              <tr key={m.id} className="border-t border-rb-300/60 dark:border-rb-700/60" data-illiquid-market={m.id}>
                <th scope="row" className="py-1 pr-3 font-normal">
                  {marketName(m)} <span className="text-rb-500">LLTV {illiquidPct(m.lltv)}</span>
                </th>
                <td className="py-1 pr-3 text-right" data-prov-exempt="">
                  {illiquidPct(m.share)}
                </td>
                <td className="py-1 pr-3 text-right">
                  <Prov info={marketProv(v, il, m, "utilisation")}>{illiquidPct(m.utilisation)}</Prov>
                </td>
                <td className="py-1 pr-3 text-right">
                  <Prov info={marketProv(v, il, m, "rate")}>{`${ratePct(m.borrowRateYearly)} a year`}</Prov>
                </td>
                <td className="py-1 text-right" data-prov-exempt="">
                  {formatDate(at)}, {hhmm(at)} UTC
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Below sm each market is a short block: the table's five columns do not fit at 390. */}
      <ul className="mt-2 space-y-2 tabular-nums sm:hidden">
        {il.markets.map((m) => {
          const at = new Date(m.lastUpdate * 1000);
          return (
            <li
              key={m.id}
              className="border-t border-rb-300/60 pt-2 dark:border-rb-700/60"
              data-illiquid-market-card={m.id}
            >
              <p>
                {marketName(m)} <span className="text-rb-500">LLTV {illiquidPct(m.lltv)}</span>
              </p>
              <p className="text-foreground/80">
                <span data-prov-exempt="">{illiquidPct(m.share)}</span> of this vault,{" "}
                <Prov info={marketProv(v, il, m, "utilisation")}>{illiquidPct(m.utilisation)}</Prov> borrowed,{" "}
                <Prov info={marketProv(v, il, m, "rate")}>{ratePct(m.borrowRateYearly)}</Prov> a year
              </p>
              <p className="text-rb-500" data-prov-exempt="">
                Last settled {formatDate(at)}, {hhmm(at)} UTC
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
