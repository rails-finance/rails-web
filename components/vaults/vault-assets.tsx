"use client";

// Where the assets are (V3, rails-ops ui-jobs 407; survey 2026-10-20 §6): one
// section under the vault card on every family. At its head the allocation
// band (decision 0043 point 4, the one `band`; the plan in
// lib/vaults/allocation-plan.ts), beneath it one table, Venue · Amount · Share
// of this vault · Links, in the source's own order with Idle as a row. "Share
// of this vault" is a fraction of one vault's book, both terms reads of the
// vault at one block (survey §7.3); its header tip names the denominator. One
// line under the heading; the rest is behind the section's "?".

import type { ReactNode } from "react";
import { AllocationBar, type AllocationSegment } from "@/components/shared/ratio-bar";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { HeadingTip } from "@/components/shared/tip-label";
import { NotLoaded } from "@/components/shared/not-loaded";
import { assetText, pctText } from "@/lib/shared/vault-amount-text";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { planAllocation } from "@/lib/vaults/allocation-plan";

const n = (v: number) => v.toLocaleString("en-US");

export interface VaultAssetRow {
  key: string;
  /** The venue's name: a market's collateral, a strategy, the wrapped reserve. */
  venue: ReactNode;
  /** The venue's sub-label: a market's LLTV and id, a strategy's cap. */
  sub?: ReactNode;
  /** In the vault's asset; null where the read did not answer. */
  amount: RawAmount | null;
  amountProv?: Provenance;
  /** The amount cell's `data-figure`, which a verifier reads. */
  amountFigure?: string;
  /** Over the table's denominator; null where there is none to state. */
  share: number | null;
  shareProv?: Provenance;
  links?: ReactNode;
  /** A row the band does not draw (a wrapper hop, which holds no amount of
   *  this vault's asset). */
  offBand?: boolean;
  /** `data-*` hooks a verifier reads. */
  hooks?: Record<string, string>;
}

export function VaultAssets({
  rows,
  assetSymbol,
  assetDecimals,
  line,
  shareTip,
  learnMore,
}: {
  rows: VaultAssetRow[];
  assetSymbol: string;
  assetDecimals: number;
  /** The one line under the heading. */
  line: ReactNode;
  /** The "Share of this vault" header's read-more: what divides what. */
  shareTip: string;
  learnMore: LearnMoreContent;
}) {
  const banded = rows
    .map((r, order) => ({ r, order }))
    .filter(({ r }) => !r.offBand)
    .map(({ r, order }) => ({ key: r.key, amount: r.amount ? BigInt(r.amount.raw) : null, order, r }));
  const plan = planAllocation(banded);
  const total = plan.total;
  const of = (a: bigint) => (total === BigInt(0) ? 0 : Number(a) / Number(total));
  const text = (raw: bigint) =>
    assetText({ raw: raw.toString(), value: Number(raw) / Math.pow(10, assetDecimals) }, assetDecimals);

  const segments: AllocationSegment[] = plan.shown.map((l) => ({
    key: l.key,
    f: of(l.amount ?? BigInt(0)),
    rampIndex: l.order,
    title: `${typeof l.r.venue === "string" ? l.r.venue : l.key} · ${text(l.amount ?? BigInt(0))} ${assetSymbol} · ${pctText(of(l.amount ?? BigInt(0)))}`,
    data: { "data-alloc-amount": (l.amount ?? BigInt(0)).toString() },
    wrap: l.r.amountProv
      ? (bar: ReactNode) => (
          <Prov info={l.r.amountProv!} className="block h-full">
            {bar}
          </Prov>
        )
      : undefined,
  }));
  if (plan.collected.length) {
    const sum = plan.collected.reduce((s, l) => s + (l.amount ?? BigInt(0)), BigInt(0));
    segments.push({
      key: "collected",
      f: of(sum),
      rampIndex: 0,
      collected: true,
      title: `${n(plan.collected.length)} more · ${text(sum)} ${assetSymbol} · ${pctText(of(sum))}`,
      data: {
        "data-alloc-collected-count": String(plan.collected.length),
        "data-alloc-collected-sum": sum.toString(),
      },
    });
  }

  return (
    <section
      className="mb-6"
      data-anatomy="V3"
      data-skel-section="vault-allocation"
      data-alloc-total={total.toString()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Where the assets are</h2>
          <p className="mt-1 text-[13px] text-rb-500" data-prov-exempt>
            {line}
          </p>
        </div>
        <LearnMore inline content={learnMore} ariaLabel="Where the assets are, learn more" />
      </div>
      <div className="mt-3 [&>div]:px-0">
        <AllocationBar
          segments={segments}
          ariaLabel={`Where this vault's ${assetSymbol} is`}
          emptyLabel={total === BigInt(0) ? "Nothing to divide at this block." : undefined}
        />
      </div>
      <table className="mt-2 w-full text-[12px]">
        <thead>
          <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
            <th className="py-2 pr-3 font-normal">Venue</th>
            <th className="py-2 pr-3 text-right font-normal">Amount · {assetSymbol}</th>
            <th className="py-2 text-right font-normal sm:pr-3">
              <HeadingTip text="Share of this vault" tip={shareTip} />
            </th>
            <th className="hidden py-2 text-right font-normal sm:table-cell">Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-rb-200/60 align-top dark:border-rb-500/20" {...r.hooks}>
              <td className="min-w-0 py-2 pr-3">
                <span className="text-foreground" data-cell="venue">
                  {r.venue}
                </span>
                {r.sub != null && <span className="block break-words text-[11px] text-rb-500">{r.sub}</span>}
                {r.links && <span className="mt-0.5 block sm:hidden">{r.links}</span>}
              </td>
              <td
                className="py-2 pr-3 text-right tabular-nums text-foreground"
                data-cell="leg-assets"
                {...(r.amountFigure ? { "data-figure": r.amountFigure } : {})}
              >
                {r.offBand ? (
                  <span className="text-rb-500">—</span>
                ) : r.amount == null ? (
                  <NotLoaded />
                ) : r.amountProv ? (
                  <Prov info={r.amountProv}>{assetText(r.amount, assetDecimals)}</Prov>
                ) : (
                  assetText(r.amount, assetDecimals)
                )}
              </td>
              <td className="py-2 text-right tabular-nums text-rb-500 sm:pr-3" data-cell="leg-share">
                {r.share == null ? (
                  "—"
                ) : r.shareProv ? (
                  <Prov info={r.shareProv}>{pctText(r.share)}</Prov>
                ) : (
                  pctText(r.share)
                )}
              </td>
              <td className="hidden py-2 text-right sm:table-cell">{r.links}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
