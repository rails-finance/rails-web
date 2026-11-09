"use client";

// Where the assets are (V3, rails-ops ui-jobs 407; survey 2026-10-20 §6): one
// section under the vault card on every family. At its head the allocation
// band (decision 0043 point 4, the one `band`; the plan in
// lib/vaults/allocation-plan.ts), beneath it one table in the house style
// (components/shared/data-table), Venue · Amount · Share of this vault, in the source's own order with Idle as a row. "Share
// of this vault" is a fraction of one vault's book, both terms reads of the
// vault at one block (survey §7.3); its header tip names the denominator. One
// line under the heading; the rest is behind the section's "?".
//
// From sm every row is two lines, 64px (D1 `rowHeight="two"`): the venue over its
// sub-label, each truncating with its full text in a `title` where it is
// text. Amount carries the asset's mark (`AssetUnit`). A venue opens Rails's
// page for it where there is one (a Morpho market, an Aave reserve, a Yearn or
// MetaMorpho vault), else it is text; its contract and ids are the venue's receipt. The
// section's ⋮ carries the Rails pages for the whole table, the exports and
// "Inspect provenance" on this section alone (components/shared/section-menu.tsx).
// Below sm each row is a card (D6): the venue across, Amount and Share two-up
// under their names.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ProvSection,
  SectionHeading,
  SectionMenu,
  type SectionMenuExports,
  type SectionMenuLink,
} from "@/components/shared/section-menu";
import { AllocationBar, type AllocationSegment } from "@/components/shared/ratio-bar";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { HeadingTip } from "@/components/shared/tip-label";
import { NotLoaded } from "@/components/shared/not-loaded";
import { AssetUnit } from "@/components/shared/asset-unit";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { assetText, pctText } from "@/lib/shared/vault-amount-text";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { planAllocation } from "@/lib/vaults/allocation-plan";

const n = (v: number) => v.toLocaleString("en-US");

export interface VaultAssetRow {
  key: string;
  /** The venue's name: a market's collateral, a strategy, the wrapped reserve. */
  venue: ReactNode;
  /** Rails's page for the venue, where there is one. */
  href?: string;
  /** The venue's mark: a market's collateral, a hop's reserve. Absent, the
   *  vault's asset (a strategy or an idle balance holds that). */
  icon?: { symbol: string; address: string };
  /** The venue's receipt: its contract, its market id. */
  venueProv?: Provenance;
  /** `data-*` hooks on the venue's name. */
  venueHooks?: Record<string, string>;
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
  /** A row the band does not draw (a wrapper hop, which holds no amount of
   *  this vault's asset). */
  offBand?: boolean;
  /** `data-*` hooks a verifier reads. */
  hooks?: Record<string, string>;
}

/** The section's scope: its ⋮ arms the inspector on it alone. */
export const ASSETS_SCOPE = "vault-assets";

/** The venue: its receipt around the name. A row with a page opens it from
 *  anywhere on the row (D4); the name is the one keyboard stop. */
function venueOf(r: VaultAssetRow): ReactNode {
  const name = r.venueProv ? <Prov info={r.venueProv}>{r.venue}</Prov> : r.venue;
  return r.href ? (
    <DataTableRowLink href={r.href} data-venue-link="">
      {name}
    </DataTableRowLink>
  ) : (
    name
  );
}

export function VaultAssets({
  rows,
  assetSymbol,
  assetAddress,
  assetDecimals,
  line,
  shareTip,
  learnMore,
  menu,
}: {
  rows: VaultAssetRow[];
  assetSymbol: string;
  /** The asset's mark after each amount. */
  assetAddress: string;
  assetDecimals: number;
  /** The one line under the heading. */
  line: ReactNode;
  /** The "Share of this vault" header's read-more: what divides what. */
  shareTip: string;
  learnMore: LearnMoreContent;
  /** The section ⋮'s rows above Inspect provenance. */
  menu: { links?: SectionMenuLink[]; exports?: SectionMenuExports };
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

  const shareHead = <HeadingTip text="Share of this vault" tip={shareTip} />;

  return (
    <ProvSection
      scope={ASSETS_SCOPE}
      className="mb-4"
      data-anatomy="V3"
      data-skel-section="vault-allocation"
      data-alloc-total={total.toString()}
    >
      <SectionHeading
        title="Where the assets are"
        help={<LearnMore inline content={learnMore} ariaLabel="Where the assets are, learn more" />}
        menu={<SectionMenu scope={ASSETS_SCOPE} title="Where the assets are" {...menu} />}
      >
        <p className="mt-1 text-[13px] text-rb-500" data-prov-exempt>
          {line}
        </p>
      </SectionHeading>
      <div className="mt-3 [&>div]:px-0">
        <AllocationBar
          segments={segments}
          ariaLabel={`Where this vault's ${assetSymbol} is`}
          emptyLabel={total === BigInt(0) ? "Nothing to divide at this block." : undefined}
        />
      </div>
      <DataTable
        className="mt-2"
        tableClassName="text-[12px]"
        label={`Where this vault's ${assetSymbol} is, by venue`}
        stacked
        rowHeight="two"
      >
        <DataTableHead>
          <DataTableHeader label="Venue" />
          <DataTableHeader label="Amount" align="right" />
          <DataTableHeader align="right">{shareHead}</DataTableHeader>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.key} href={r.href} {...r.hooks}>
              <DataTableCell rowHeader className="sm:w-full sm:max-w-0">
                <div className="flex items-center gap-2">
                  <TokenChipIcon
                    symbol={r.icon?.symbol ?? assetSymbol}
                    address={r.icon?.address ?? assetAddress}
                    size={20}
                    filterable={false}
                  />
                  <div className="min-w-0 flex-1">
                    <span
                      className="block text-foreground sm:truncate"
                      title={typeof r.venue === "string" ? r.venue : undefined}
                      data-cell="venue"
                      {...r.venueHooks}
                    >
                      {venueOf(r)}
                    </span>
                    {r.sub != null && (
                      <span
                        className="block text-[11px] [overflow-wrap:anywhere] text-rb-500 sm:truncate"
                        title={typeof r.sub === "string" ? r.sub : undefined}
                      >
                        {r.sub}
                      </span>
                    )}
                  </div>
                </div>
              </DataTableCell>
              <DataTableCell label="Amount" align="right" className="whitespace-nowrap tabular-nums text-foreground">
                {r.offBand ? (
                  <span className="text-rb-500" data-cell="leg-assets">
                    —
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span data-cell="leg-assets" {...(r.amountFigure ? { "data-figure": r.amountFigure } : {})}>
                      {r.amount == null ? (
                        <NotLoaded />
                      ) : r.amountProv ? (
                        <Prov info={r.amountProv}>{assetText(r.amount, assetDecimals)}</Prov>
                      ) : (
                        assetText(r.amount, assetDecimals)
                      )}
                    </span>
                    {r.amount != null && <AssetUnit symbol={assetSymbol} address={assetAddress} />}
                  </span>
                )}
              </DataTableCell>
              <DataTableCell label={shareHead} align="right" className="whitespace-nowrap tabular-nums text-rb-500">
                <span data-cell="leg-share">
                  {r.share == null ? (
                    "—"
                  ) : r.shareProv ? (
                    <Prov info={r.shareProv}>{pctText(r.share)}</Prov>
                  ) : (
                    pctText(r.share)
                  )}
                </span>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </ProvSection>
  );
}
