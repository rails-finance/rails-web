"use client";

// Who holds it, on a vault page (Miles, 10 Nov 2026; MetaMorpho, Aave and
// Yearn V3 since ui-jobs 584): the census's
// live holders by share of the vault's shares, as a donut (`ShareDonut`, the
// live holder count in its hole) beside the ten largest holders. Holders of
// 2% or more draw their own slice (the allocation band's rule,
// lib/vaults/allocation-plan.ts), everyone else one "others" slice. The list
// is the house table in the /vaults index's rows (V6), 48px from sm, each row
// lit with its slice and the reverse (`data-seg-scope`, CSS `:has()`). Every
// figure carries the census's receipt (lib/vaults/holders-provenance.ts).

import Link from "next/link";
import type { ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { useBlockTime } from "@/components/shared/read-stamp";
import { ShareDonut, type DonutSlice } from "@/components/shared/asset-donut";
import { AssetUnit } from "@/components/shared/asset-unit";
import { HeadingTip } from "@/components/shared/tip-label";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { formatDate } from "@/lib/date";
import { formatCompact } from "@/lib/shared/format-compact";
import { holderSliceColours } from "@/lib/shared/slice-colours";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { pctText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { formatUnitsExact } from "@/lib/utils/format";
import { MIN_SEGMENT_SHARE } from "@/lib/vaults/allocation-plan";
import type { VaultHolders } from "@/lib/vaults/holders-read";
import {
  holderBalanceProv,
  holderShareProv,
  holdersCountProv,
  otherHoldersCountProv,
  otherHoldersShareProv,
  type HoldersCoords,
} from "@/lib/vaults/holders-provenance";
import type { ChainId } from "@/lib/shared/chains";

const n = (v: number) => v.toLocaleString("en-US");
const ppmPct = (ppm: number) => pctText(ppm / 1_000_000);

/** The list names this many holders, largest first. */
const TOP_HOLDERS = 10;
/** The donut's size. */
const DONUT = 152;

/** The section's receipts scope, and the donut's and rows' linking scope. */
export const HOLDERS_SCOPE = "vault-holders";

export function VaultWhoHolds({
  chainId,
  vault,
  vaultName,
  shareSymbol,
  shareDecimals: readDecimals,
  holders,
  holderHref,
  listingHref,
}: {
  chainId: ChainId;
  vault: string;
  vaultName: string;
  shareSymbol: string;
  /** The share token's decimals as the page read them; the census's where the page has none. */
  shareDecimals: number | null;
  /** The census's largest holders; null where it did not answer. */
  holders: VaultHolders | null;
  /** A holder's position page. */
  holderHref: (holder: string) => string;
  /** The positions listing filtered to the vault; null where the family has none. */
  listingHref: string | null;
}) {
  const at = useBlockTime(chainId, holders?.censusBlock ?? null);
  const shareDecimals = readDecimals ?? holders?.shareDecimals ?? null;

  let content: ReactNode;
  if (!holders || holders.holders.length === 0 || shareDecimals == null) {
    content = <p className="mt-3 text-[13px] text-rb-500">The census did not answer, so no holder is stated.</p>;
  } else if (!holders.sumMatches) {
    content = (
      <p className="mt-3 text-[13px] text-rb-500">
        The census&rsquo;s balances do not sum to the share supply at its block, so the set is not proven whole and is
        not drawn.
      </p>
    );
  } else {
    const c: HoldersCoords = { vault, vaultName, shareSymbol, censusBlock: holders.censusBlock };
    const list = holders.holders;
    let shown = list.filter((h) => h.ppm / 1_000_000 >= MIN_SEGMENT_SHARE);
    if (!shown.length) shown = list.slice(0, 1);
    // A single leftover draws alone, as on the band.
    if (holders.liveCount - shown.length === 1 && list[shown.length]) shown = list.slice(0, shown.length + 1);
    const shownPpm = shown.reduce((s, h) => s + h.ppm, 0);
    const othersCount = holders.liveCount - shown.length;
    const othersPpm = Math.max(0, 1_000_000 - shownPpm);
    const slices: DonutSlice[] = shown.map((h) => ({
      key: h.holder,
      label: `${shortAddress(h.holder)} · ${ppmPct(h.ppm)}`,
      share: h.ppm / 1_000_000,
    }));
    if (othersCount > 0)
      slices.push({
        key: "others",
        label: `${n(othersCount)} others · ${ppmPct(othersPpm)}`,
        share: othersPpm / 1_000_000,
        rest: true,
      });
    const colours = holderSliceColours(slices);
    const colourOf = new Map(slices.map((sl, i) => [sl.key, colours[i]]));
    const othersColour = colours[colours.length - 1];

    const top = list.slice(0, TOP_HOLDERS);
    const restCount = holders.liveCount - top.length;
    const restPpm = Math.max(0, 1_000_000 - top.reduce((s, h) => s + h.ppm, 0));

    const others = (
      <>
        <Prov info={otherHoldersCountProv(c, holders.liveCount, restCount, top.length)}>{n(restCount)}</Prov> others
      </>
    );
    const sharesOf = (balance: string) => {
      const a = { raw: balance, value: Number(formatUnitsExact(balance, shareDecimals).replace(/,/g, "")) };
      return { text: formatCompact(a.value), exact: shareText(a, shareDecimals) };
    };
    const shareHead = (
      <HeadingTip
        text="Share of the vault"
        tip={`Each holder's ${shareSymbol} over the share token's totalSupply() at the census block.`}
      />
    );

    content = (
      <div className="mt-4 flex flex-col items-center gap-6 xl:flex-row xl:items-start">
        <div className="shrink-0 xl:pt-3" data-anatomy="V11.1">
          <ShareDonut
            slices={slices}
            colours={colours}
            size={DONUT}
            scope={HOLDERS_SCOPE}
            label={`${n(holders.liveCount)} holders of ${shareSymbol} by share`}
            centre={
              <>
                <span className="text-lg font-semibold tabular-nums text-foreground" data-holders-count="">
                  <Prov info={holdersCountProv(c, holders.liveCount)}>{n(holders.liveCount)}</Prov>
                </span>
                <span className="text-xs text-rb-500">holders</span>
              </>
            }
          />
        </div>
        <div className="w-full min-w-0 flex-1">
          <DataTable
            tableClassName="text-sm sm:[&_tbody_tr]:h-12 sm:[&_tbody_tr]:py-0"
            label={`The largest holders of ${shareSymbol}`}
            stacked
          >
            <DataTableHead>
              <DataTableHeader label="Holder" />
              <DataTableHeader label="Shares" align="right" />
              <DataTableHeader align="right">{shareHead}</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {top.map((h) => {
                const href = holderHref(h.holder);
                const sh = sharesOf(h.balance);
                return (
                  <DataTableRow
                    key={h.holder}
                    href={href}
                    data-vault-holder={h.holder}
                    data-seg={colourOf.has(h.holder) ? h.holder : "others"}
                    data-seg-row={h.holder}
                  >
                    <DataTableCell rowHeader className="sm:w-full sm:max-w-0">
                      <DataTableRowLink href={href} className="font-mono text-[13px] font-semibold" title={h.holder}>
                        {shortAddress(h.holder)}
                      </DataTableRowLink>
                    </DataTableCell>
                    <DataTableCell
                      label="Shares"
                      align="right"
                      className="whitespace-nowrap font-semibold tabular-nums text-foreground"
                    >
                      <span className="flex items-center gap-1.5 sm:justify-end">
                        <span title={`${sh.exact} ${shareSymbol}`} data-cell="holder-shares" data-raw={h.balance}>
                          <Prov info={holderBalanceProv(c, h.holder, sh.exact)}>{sh.text}</Prov>
                        </span>
                        <AssetUnit symbol={shareSymbol} address={vault} />
                      </span>
                    </DataTableCell>
                    <DataTableCell
                      label={shareHead}
                      align="right"
                      className="whitespace-nowrap font-semibold tabular-nums text-foreground"
                    >
                      <span data-cell="holder-share" data-ppm={h.ppm}>
                        <Prov info={holderShareProv(c, h.holder, h.ppm)}>{ppmPct(h.ppm)}</Prov>
                      </span>
                      {/* The key, after the share it stands for (C19's legend). */}
                      <i
                        aria-hidden
                        className="ml-1.5 inline-block size-2.5 rounded-[2px] align-[-1px]"
                        style={{ background: colourOf.get(h.holder) ?? othersColour }}
                        data-key-colour=""
                      />
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
          {restCount > 0 && (
            <p className="mt-2 text-[13px] text-rb-500" data-holders-rest="">
              {listingHref ? (
                <Link href={listingHref} prefetch={false} className={INLINE_LINK}>
                  {others}
                </Link>
              ) : (
                others
              )}{" "}
              hold <Prov info={otherHoldersShareProv(c, restCount, restPpm, top.length)}>{ppmPct(restPpm)}</Prov>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <ProvSection scope={HOLDERS_SCOPE} data-vault-holders={vault} data-anatomy="V11">
      <SectionHeading
        title="Who holds it"
        menu={
          <SectionMenu
            scope={HOLDERS_SCOPE}
            title="Who holds it"
            links={
              listingHref
                ? [
                    {
                      item: "holders",
                      title: "Every holder of this vault",
                      subtitle: "The positions listing, filtered to this vault",
                      href: listingHref,
                      internal: true,
                    },
                  ]
                : undefined
            }
          />
        }
      >
        {holders && (
          <p className="mt-1 text-[13px] text-rb-500">
            By share of {shareSymbol}, at the census of {at != null ? `${formatDate(new Date(at * 1000))}, ` : ""}block{" "}
            {n(holders.censusBlock)}
          </p>
        )}
      </SectionHeading>
      {content}
    </ProvSection>
  );
}
