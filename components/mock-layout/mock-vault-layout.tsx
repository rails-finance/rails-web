"use client";

// The MetaMorpho vault page as a grid of tiles (Miles, 10 Nov 2026, round
// five): Coinbase's asset page for the grid, Morpho's vault page for the
// configuration and the roles. A localhost mock under /mock-layout. The holder
// finder, then the live vault card (V2, built with the props
// components/vaults/morpho-base-vault-page.tsx gives it), then the grid: The
// last 30 days, Where the assets are | Who holds it, What protects it | The
// protocol underneath (each line one paragraph), Configuration and addresses.
//
// Each tile is a `Tile` holding one `ProvSection`, so its heading, read stamp,
// "?" and ⋮ sit in its top row. The reused sections keep their headings; the
// grid's scoped selectors strip their outer margins, and hide
// the protects section's disclaimer (the site's /terms carries it). Who holds
// it is the asset breakdown's donut (C19, `ShareDonut`) beside the ten largest
// holders; Where the assets are a `SegmentBar` over the markets. Both lists are
// house tables in the /vaults index's rows (V6), each row lit with its slice or
// segment and the reverse (`data-seg-scope`, CSS `:has()`). The card takes the
// mock's headlines (`heads`) and the sidebar's protocol and chain through the
// edge context, which the live page reads from its route.

import Link from "next/link";
import type { ReactNode } from "react";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { readStampProv, SectionReadStamp, useBlockTime } from "@/components/shared/read-stamp";
import { CopyFact } from "@/components/shared/event-page-aside";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { CreatedBullet, VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { VaultStrip } from "@/components/vaults/vault-strip";
import { VaultIlliquidMarkets } from "@/components/vaults/vault-illiquid";
import { VaultProtects, type ProtectsSectionData } from "@/components/vaults/vault-protects";
import { StatAmount } from "@/components/vaults/stat-amount";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { assetText, pctText, sharePriceText, shareText, shortAddress, shortId } from "@/lib/shared/vault-amount-text";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { HeadingTip } from "@/components/shared/tip-label";
import { morphoBaseWalletHref } from "@/lib/morpho-base/routes";
import { morphoLoanTokenHref, morphoMarketHref } from "@/lib/morpho/market-routes";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import {
  vaultAllocatedProv,
  vaultGapProv,
  vaultLegAssetsProv,
  vaultLegLltvProv,
  vaultLegShareProv,
  vaultHeldAssetsProv,
  vaultLostAssetsProv,
  vaultSharePriceProv,
  vaultTotalAssetsProv,
  vaultTotalSupplyProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type { MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { metaMorphoVaultHref, metaMorphoVaultsListingHref } from "@/lib/vaults/routes";
import { morphoBaseVaultPageSummary, withAssetScale } from "@/lib/vaults/summary";
import type { AssetScale } from "@/lib/vaults/asset-scale-words";
import { vaultStewardProv, vaultVenueProv } from "@/lib/vaults/card-provenance";
import type { VaultExportModel } from "@/lib/vaults/card-export";
import {
  morphoVaultAssetsContent,
  morphoVaultCardContent,
  SHARES_ISSUED_TIP,
  STEWARD_TIP,
} from "@/lib/vaults/card-words";
import { MIN_SEGMENT_SHARE, planAllocation } from "@/lib/vaults/allocation-plan";
import { ShareDonut, type DonutSlice } from "@/components/shared/asset-donut";
import { SegmentBar, type SegmentSlice } from "@/components/shared/segment-bar";
import { assetSliceColours, holderSliceColours } from "@/lib/shared/slice-colours";
import { tokenColour } from "@/lib/shared/token-colours";
import { AssetUnit } from "@/components/shared/asset-unit";
import { PositionCardEdgeContext, type PositionCardEdge } from "@/components/shared/position-card-edge";
import type { PositionCardHead } from "@/components/shared/position-card";
import { vaultHeads } from "@/components/vaults/vault-heads";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact } from "@/lib/utils/format";
import { protocolForPathname } from "@/lib/shared/protocols";
import { vaultHoldersProv } from "@/lib/vaults/row-provenance";
import { measuredYield, type VaultYield } from "@/lib/vaults/yield";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";
import type { MockVaultConfig } from "@/lib/mock-layout/vault-config-read";
import type { MockVaultHolders } from "@/lib/mock-layout/vault-holders-read";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const n = (v: number) => v.toLocaleString("en-US");
const lltvText = (lltv: number) => `${(lltv * 100).toFixed(1)}%`;
const ZERO = /^0x0{40}$/;

/** Where the assets are draws this many markets, then links to every one. */
const TOP_MARKETS = 5;
/** Who holds it names this many holders, largest first. */
const TOP_HOLDERS = 10;

/** The grid: one column, two from lg. Each tile draws its own hairlines,
 *  inset 20px from its ends, so no two lines meet (Tile, RULE). The scoped selectors work on the reused
 *  sections: no outer margin or ring offset, and no disclaimer in the protects
 *  section's explanation. */
const GRID = [
  "grid grid-cols-1 lg:grid-cols-2",
  // The last 30 days: no frame round each chart; a hairline between them from sm.
  "[&_[data-strip-tile]]:rounded-none [&_[data-strip-tile]]:border-0 [&_[data-strip-tile]]:px-0",
  "sm:[&_[data-strip-tile]+[data-strip-tile]]:border-l sm:[&_[data-strip-tile]+[data-strip-tile]]:pl-5",
  "[&_[data-strip-tile]+[data-strip-tile]]:border-rb-200 dark:[&_[data-strip-tile]+[data-strip-tile]]:border-rb-500/30",
  "[&_section[data-prov-scope]]:m-0 [&_section[data-prov-scope]]:rounded-none [&_section[data-prov-scope]]:p-0",
  "[&_[data-protects-disclaimer]]:hidden",
].join(" ");

const TILE = "min-w-0 scroll-mt-4 p-5";

/** A hairline's colour. */
const RULE = "bg-rb-200 dark:bg-rb-500/30";

function Tile({
  id,
  wide,
  flush,
  left,
  last,
  segScope,
  children,
}: {
  id?: string;
  wide?: boolean;
  flush?: boolean;
  /** The left tile of a pair: a vertical hairline at its right edge from lg. */
  left?: boolean;
  /** The last tile: no hairline under it. */
  last?: boolean;
  /** A `SegmentBar`'s scope, lighting its segments with their rows. */
  segScope?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={`relative ${flush ? "min-w-0 scroll-mt-4" : TILE} ${wide ? "lg:col-span-2" : ""}`}
      data-mock-tile=""
      data-seg-scope={segScope}
    >
      {children}
      {!last && <i aria-hidden className={`pointer-events-none absolute inset-x-5 bottom-0 h-px ${RULE}`} />}
      {left && (
        <i aria-hidden className={`pointer-events-none absolute inset-y-5 right-0 hidden w-px lg:block ${RULE}`} />
      )}
    </div>
  );
}

const LABEL =
  "cursor-help text-[13px] text-rb-500 underline decoration-rb-400 decoration-dotted underline-offset-4 dark:decoration-rb-500";

function Term({ label, tip }: { label: string; tip?: string }) {
  return tip ? (
    <abbr title={tip} className={LABEL}>
      {label}
    </abbr>
  ) : (
    <span className="text-[13px] text-rb-500">{label}</span>
  );
}

/** One label/value pair in a tile's list. */
function Fact({
  id,
  label,
  tip,
  value,
  sub,
}: {
  id: string;
  label: string;
  tip?: string;
  value: ReactNode | null;
  sub?: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 border-b border-rb-200 py-2.5 dark:border-rb-500/30"
      data-mock-fact={id}
    >
      <dt>
        <Term label={label} tip={tip} />
      </dt>
      <dd className="flex min-w-0 justify-end text-right text-[14px] font-medium tabular-nums text-foreground">
        {value ?? <span className="text-[13px] font-normal text-rb-500">not read</span>}
      </dd>
      {sub && <dd className="col-span-2 mt-0.5 text-xs leading-snug text-rb-500">{sub}</dd>}
    </div>
  );
}

/** One address row: what it is, its short form, copy and explorer link. */
function AddressRow({
  id,
  label,
  sub,
  address,
  explorer,
  href,
}: {
  id: string;
  label: string;
  sub?: string;
  address: string | null;
  explorer: string;
  href: (a: string) => string;
}) {
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rb-200 py-2.5 dark:border-rb-500/30"
      data-mock-address={id}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-rb-500">{sub}</div>}
      </div>
      {address ? (
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[13px] text-foreground" title={address}>
            {shortAddress(address)}
          </span>
          <CopyFact value={address} label={`Copy the ${label.toLowerCase()} address`} name={id} />
          <a href={href(address)} target="_blank" rel="noopener noreferrer" className={`text-[13px] ${INLINE_LINK}`}>
            {explorer}
          </a>
        </div>
      ) : (
        <span className="text-[13px] text-rb-500">none set</span>
      )}
    </li>
  );
}

/** A WAD fraction as a percentage, to two places. */
function wadPct(raw: string): string {
  const bp = Number((BigInt(raw) * BigInt(1_000_000)) / BigInt(10) ** BigInt(18)) / 10_000;
  return `${bp.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** Every Blue position the vault holds, on the chain's explorer. */
const blueWalletHref = (chainId: 1 | 8453, vault: string) =>
  chainId === 8453 ? morphoBaseWalletHref(vault) : (listingHrefForWallet("morpho", vault) ?? "/ethereum/morpho");

const ppmPct = (ppm: number) => pctText(ppm / 1_000_000);

/** Who holds it's donut. */
const DONUT = 152;

/** The page's one note on the charts' colours, at its foot (Miles, round
 *  nine: a tooltip later). */
function ColourNote() {
  return (
    <p className="mt-4 text-[11px] text-rb-500" data-mock-colour-note="">
      Colours tell the segments apart.
    </p>
  );
}

/** From a million, a figure reads compact. */
const MILLION = 1_000_000;

/** A headline's or a stat's figure in the vault's asset: compact from a
 *  million (formatCompact, the V6 index's form), the full figure in its
 *  title; then the asset's mark, or its symbol in words where it has none. */
function InAssetFigure({
  value,
  full,
  exact,
  asset,
  prov,
  head = false,
}: {
  value: number;
  full: ReactNode;
  /** The full figure as text, for the title. */
  exact: string;
  asset: { symbol: string; address: string; named: boolean };
  prov?: Provenance;
  /** At headline size. */
  head?: boolean;
}) {
  const big = Math.abs(value) >= MILLION;
  const text = big ? formatCompact(value) : full;
  return (
    // A phone's half-width headline column holds about eight characters at
    // headline size; a longer figure steps down there rather than wrap.
    <span
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap ${head && typeof text === "string" && text.length > 8 ? "max-sm:text-[0.6em]" : ""}`}
      data-mock-figure=""
    >
      <span
        data-figure-value=""
        data-prov-exact={exact}
        data-prov-symbol={asset.symbol}
        title={big ? `${exact} ${asset.symbol}` : undefined}
      >
        {prov ? <Prov info={prov}>{text}</Prov> : text}
      </span>
      <AssetUnit symbol={asset.symbol} address={asset.address} named={asset.named} />
    </span>
  );
}

/** Who holds it: the census's live holders by share of the vault's shares.
 *  Holders of 2% or more draw their own slice (the allocation band's rule,
 *  lib/vaults/allocation-plan.ts), everyone else one "others" slice. */
function WhoHoldsIt({
  chainId,
  vault,
  vaultName,
  shareSymbol,
  shareDecimals,
  holders,
}: {
  chainId: 1 | 8453;
  vault: string;
  vaultName: string;
  shareSymbol: string;
  shareDecimals: number;
  holders: MockVaultHolders | null;
}) {
  const at = useBlockTime(chainId, holders?.censusBlock ?? null);
  const listingHref = metaMorphoVaultsListingHref(chainId, { vault });
  const scope = "mock-holders";

  let content: ReactNode;
  if (!holders || holders.holders.length === 0) {
    content = <p className="mt-3 text-[13px] text-rb-500">The census did not answer, so no holder is stated.</p>;
  } else if (!holders.sumMatches) {
    content = (
      <p className="mt-3 text-[13px] text-rb-500">
        The census&rsquo;s balances do not sum to the share supply at its block, so the set is not proven whole and is
        not drawn.
      </p>
    );
  } else {
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
    const shareProv = (holder: string, ppm: number): Provenance => ({
      kind: "chain",
      pclass: "state",
      source: { block: holders.censusBlock },
      summary: `Share of the vault's shares at the census — ${shortAddress(holder)} held ${ppmPct(ppm)} of ${shareSymbol}: its balanceOf() over the share token's totalSupply(), both read by the Rails census at block ${n(holders.censusBlock)} and kept.`,
      contract: { name: vaultName, address: vault },
      via: "Rails census · balanceOf(holder) / totalSupply() @ the census block",
    });
    const balanceProv = (holder: string, exact: string): Provenance => ({
      kind: "chain",
      pclass: "state",
      source: { block: holders.censusBlock },
      summary: `Shares held at the census — ${shortAddress(holder)} held ${exact} ${shareSymbol}: its balanceOf() on the share token, read by the Rails census at block ${n(holders.censusBlock)} and kept.`,
      contract: { name: vaultName, address: vault },
      via: "Rails census · balanceOf(holder) @ the census block",
    });
    const othersProv: Provenance = {
      kind: "chain-derived",
      pclass: "state",
      source: { block: holders.censusBlock },
      summary: `The other holders' share at the census — ${n(restCount)} addresses held ${ppmPct(restPpm)} of ${shareSymbol}: the whole supply less the ${n(top.length)} named above, from the census at block ${n(holders.censusBlock)}, where every balance summed to totalSupply().`,
      contract: { name: vaultName, address: vault },
      via: "Rails census · 1 − Σ balanceOf(top holders) / totalSupply() @ the census block",
    };

    const countProv: Provenance = {
      kind: "chain-derived",
      pclass: "state",
      source: { block: holders.censusBlock },
      summary: `Holders at the census — ${n(holders.liveCount)} addresses held a share of ${shareSymbol} at block ${n(holders.censusBlock)}: the Rails census swept every Transfer of the vault to that block and read balanceOf() for each address it named.`,
      contract: { name: vaultName, address: vault },
      via: "Rails census · eth_getLogs(Transfer) + balanceOf(holder) > 0 @ the census block",
    };
    const restCountProv: Provenance = {
      ...countProv,
      summary: `Other holders at the census — ${n(restCount)} addresses: the ${n(holders.liveCount)} holding a share of ${shareSymbol} at block ${n(holders.censusBlock)}, less the ${n(top.length)} named above.`,
    };

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
        <div className="shrink-0 xl:pt-3">
          <ShareDonut
            slices={slices}
            colours={colours}
            size={DONUT}
            scope={scope}
            label={`${n(holders.liveCount)} holders of ${shareSymbol} by share`}
            centre={
              <>
                <span className="text-lg font-semibold tabular-nums text-foreground" data-mock-holders-count="">
                  <Prov info={countProv}>{n(holders.liveCount)}</Prov>
                </span>
                <span className="text-xs text-rb-500">holders</span>
              </>
            }
          />
        </div>
        <div className="w-full min-w-0 flex-1">
          {/* The /vaults index's rows (V6): the house table, one line a row. */}
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
                const href = metaMorphoVaultHref(chainId, vault, h.holder);
                const sh = sharesOf(h.balance);
                return (
                  <DataTableRow
                    key={h.holder}
                    href={href}
                    data-mock-holder={h.holder}
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
                      <span className="flex items-center justify-end gap-1.5">
                        <span title={`${sh.exact} ${shareSymbol}`} data-cell="holder-shares" data-raw={h.balance}>
                          <Prov info={balanceProv(h.holder, sh.exact)}>{sh.text}</Prov>
                        </span>
                        <AssetUnit symbol={shareSymbol} address={vault} />
                      </span>
                    </DataTableCell>
                    <DataTableCell
                      label={shareHead}
                      align="right"
                      className="whitespace-nowrap font-semibold tabular-nums text-foreground"
                    >
                      <Prov info={shareProv(h.holder, h.ppm)}>{ppmPct(h.ppm)}</Prov>
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
            <p className="mt-2 text-[13px] text-rb-500" data-mock-holders-rest="">
              <Link href={listingHref} prefetch={false} className={INLINE_LINK}>
                <Prov info={restCountProv}>{n(restCount)}</Prov> others
              </Link>{" "}
              hold <Prov info={othersProv}>{ppmPct(restPpm)}</Prov>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <ProvSection scope={scope} data-mock-section="holders">
      <SectionHeading
        title="Who holds it"
        menu={
          <SectionMenu
            scope={scope}
            title="Who holds it"
            links={[
              {
                item: "holders",
                title: "Every holder of this vault",
                subtitle: "The positions listing, filtered to this vault",
                href: listingHref,
                internal: true,
              },
            ]}
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

export function MockVaultLayout({
  data,
  census,
  assetScales,
  yieldFigure: storeYield,
  strip,
  protects,
  config,
  holders,
  factory,
}: {
  data: MorphoBaseVaultResponse;
  census: VaultCensusRow | null;
  assetScales: Record<string, AssetScale>;
  yieldFigure?: VaultYield;
  strip: VaultStripSeries | null;
  /** "What protects it" and "The protocol underneath", and the guardian
   *  behind them; null where the read failed. */
  protects: {
    block: number;
    guardian: string | null;
    protects: ProtectsSectionData;
    underneath: ProtectsSectionData;
  } | null;
  config: MockVaultConfig;
  /** Who holds it: the census's largest holders; null where it did not answer. */
  holders: MockVaultHolders | null;
  /** The factory that made this vault, from the catalogue. */
  factory: string | null;
}) {
  const registry = useReceiptRegistry();
  const { vault, legs, chainId } = data;
  const chain = chainMeta(chainId);
  const v = withAssetScale(morphoBaseVaultPageSummary(data, census), assetScales);
  const yieldFigure = measuredYield(storeYield, v.totalAssets?.raw);
  const coords: MorphoVaultCoords = {
    chainId,
    readBy: serverReadOf(data),
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol,
  };
  const unit = vault.asset.symbol;
  const ad = vault.asset.decimals;
  const asset = { symbol: unit, address: vault.asset.address };
  const assetMark = { ...asset, named: v.asset.named };
  const steward = v.steward!;
  const funded = legs.filter((l) => BigInt(l.assets.raw) > BigInt(0));
  const addr = (a: string) => explorerUrl(chainId, "address", a);
  const name = vault.name || shortAddress(vault.address);
  const feeRecipient = config.feeRecipient && !ZERO.test(config.feeRecipient) ? config.feeRecipient : null;

  const receipts = {
    totalAssets: vaultTotalAssetsProv(coords),
    sharePrice: vaultSharePriceProv(coords),
    ...(data.lostAssets
      ? {
          lostAssets: vaultLostAssetsProv(coords),
          heldAssets: vaultHeldAssetsProv(coords, {
            totalAssets: data.totalAssets.raw,
            lostAssets: data.lostAssets.raw,
          }),
        }
      : {}),
  };
  // The live card's stats (components/vaults/morpho-base-vault-page.tsx).
  const stats: PositionPanelRow[] = [
    {
      id: "shares-issued",
      label: "Shares issued",
      tip: SHARES_ISSUED_TIP,
      sub: vault.symbol,
      value: (
        <span data-figure="total-shares">
          <Prov info={vaultTotalSupplyProv(coords)}>
            <StatAmount amount={data.totalSupply} decimals={vault.decimals} symbol={vault.symbol} shares />
          </Prov>
        </span>
      ),
    },
    {
      id: "allocated",
      label: "Allocated in Morpho Blue",
      tip: "The vault's supply in each Morpho Blue market, summed as Morpho Blue last settled them. Total assets adds the interest since, so either figure can be the larger.",
      value: (
        <span data-figure="allocated">
          <InAssetFigure
            value={data.allocated.value}
            full={<StatAmount amount={data.allocated} decimals={ad} symbol={unit} />}
            exact={assetText(data.allocated, ad)}
            asset={assetMark}
            prov={vaultAllocatedProv(coords)}
          />
        </span>
      ),
    },
    {
      id: "unaccrued",
      label: "Unaccrued interest",
      tip: "Total assets minus the allocated sum: interest the vault counts that the markets have not settled yet.",
      value: (
        <span data-figure="gap">
          <InAssetFigure
            value={data.gap.value}
            full={<StatAmount amount={data.gap} decimals={ad} symbol={unit} />}
            exact={assetText(data.gap, ad)}
            asset={assetMark}
            prov={vaultGapProv(coords)}
          />
        </span>
      ),
    },
    {
      id: "steward",
      label: "Steward",
      sub: steward.role === "curator" ? "curator" : "owner",
      tip: steward.role === "curator" ? STEWARD_TIP.curator : STEWARD_TIP.owner,
      value: (
        <span className="font-mono text-sm" data-steward={steward.address} data-steward-role={steward.role}>
          <Prov info={vaultStewardProv(v, steward, coords.readBy)}>{shortAddress(steward.address)}</Prov>
        </span>
      ),
    },
  ];
  const lostStat = data.lostAssets && BigInt(data.lostAssets.raw) > BigInt(0) ? data.lostAssets : null;
  if (lostStat)
    stats.push({
      id: "lost-assets",
      label: "Lost assets",
      tip: "On a MetaMorpho V1.1 vault, the part of total assets that no market holds. The share price has not been lowered for it.",
      asset,
      value: (
        <span data-figure="lost-assets">
          <Prov info={vaultLostAssetsProv(coords)}>
            <StatAmount amount={lostStat} decimals={ad} symbol={unit} />
          </Prov>
        </span>
      ),
    });

  // The live card's (i) pane.
  const explanation = (
    <div data-vault-explanation="">
      <ExplainGroup title="Holdings">
        <ExplainBullet>
          This vault lends{" "}
          <Fig>
            {assetText(data.totalAssets, ad)} {unit}
          </Fig>{" "}
          across <Fig>{n(funded.length)}</Fig> Morpho Blue markets for the holders of its shares.
        </ExplainBullet>
        <ExplainBullet>
          Morpho Blue last settled{" "}
          <Fig>
            {assetText(data.allocated, ad)} {unit}
          </Fig>{" "}
          of it; the rest is interest it has not booked yet.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Risk">
        <ExplainBullet>
          The {steward.role} <Fig>{shortAddress(steward.address)}</Fig> chooses the markets and each one&rsquo;s cap.
        </ExplainBullet>
        <ExplainBullet>A loss in any of these markets lowers the share price for every holder.</ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rate">
        <YieldBullets yieldFigure={yieldFigure} rewards="rewards paid outside the share, such as MORPHO," />
      </ExplainGroup>
      <ExplainGroup title="History">
        <CreatedBullet
          chainId={chainId}
          block={vault.createdBlock > 0 ? vault.createdBlock : null}
          by={`the MetaMorpho ${vault.factory} factory`}
        />
        {v.census && (
          <ExplainBullet>
            <Fig>{n(v.census.holders)}</Fig> addresses have held a share; <Fig>{n(v.census.live)}</Fig> hold one at the
            last census.
          </ExplainBullet>
        )}
      </ExplainGroup>
    </div>
  );

  const links: VaultMenuLink[] = [
    {
      item: "own-positions",
      title: "This vault's positions on Morpho Blue",
      subtitle: "The vault as a Morpho Blue lender",
      href: blueWalletHref(chainId, vault.address),
      internal: true,
    },
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(vault.address)} on ${chain.explorerName}`,
      href: addr(vault.address),
    },
    ...(factory
      ? [
          {
            item: "factory",
            title: "Factory",
            subtitle: `MetaMorpho ${vault.factory} · ${shortAddress(factory)}`,
            href: addr(factory),
          },
        ]
      : []),
    {
      item: "created",
      title: "Created",
      subtitle: `Block ${n(vault.createdBlock)} on ${chain.explorerName}`,
      href: explorerUrl(chainId, "block", vault.createdBlock),
    },
    {
      item: "steward",
      title: `${steward.role === "curator" ? "Curator" : "Owner"} on ${chain.explorerName}`,
      subtitle: shortAddress(steward.address),
      href: addr(steward.address),
    },
    {
      item: "venue-page",
      title: "On Morpho's app",
      subtitle: "app.morpho.org",
      href: `https://app.morpho.org/${chainId === 1 ? "ethereum" : "base"}/vault/${vault.address}`,
    },
    {
      item: "docs",
      title: "Morpho's documentation",
      subtitle: "docs.morpho.org: Vaults",
      href: "https://docs.morpho.org/learn/concepts/vault/",
    },
  ];

  const exportModel: VaultExportModel = {
    stats: [
      ["Shares issued", `${shareText(data.totalSupply, vault.decimals)} ${vault.symbol}`],
      ["Allocated in Morpho Blue", `${assetText(data.allocated, ad)} ${unit}`],
      ["Unaccrued interest", `${assetText(data.gap, ad)} ${unit}`],
      [`Steward (${steward.role})`, steward.address],
      ...(lostStat ? ([["Lost assets", `${assetText(lostStat, ad)} ${unit}`]] as [string, string][]) : []),
    ],
    rows: legs.map((l) => [
      `${l.isIdle ? "Idle market" : (l.collateralSymbol ?? shortId(l.id))} ${l.id}`,
      assetText(l.assets, ad),
      l.shareOfAllocated == null ? "" : pctText(l.shareOfAllocated),
    ]),
  };

  const rows: VaultAssetRow[] = legs.map((leg) => {
    const legCoords: MorphoVaultCoords = { ...coords, marketId: leg.id, collateralSymbol: leg.collateralSymbol };
    const venue = leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id));
    return {
      key: leg.id,
      venue,
      ...(leg.isIdle ? {} : { icon: { symbol: leg.collateralSymbol ?? venue, address: leg.collateralToken } }),
      href: morphoMarketHref(chainId, leg.loanToken, leg.id),
      venueProv: vaultVenueProv(
        v,
        {
          venue,
          what: leg.isIdle
            ? `the vault's idle market on Morpho Blue: a market with no collateral, no oracle and no rate model, where it holds ${unit} unlent.`
            : `the Morpho Blue market lending ${unit} against ${leg.collateralSymbol ?? "its collateral"}, a market in the vault's withdraw queue.`,
          via: "withdrawQueue(i) · idToMarketParams(id) · position(id, vault)",
          contract: { name: "Morpho Blue", address: vault.morpho },
          ids: [
            { label: "market id", value: leg.id },
            { label: "loan token", value: leg.loanToken },
          ],
        },
        coords.readBy,
      ),
      sub: leg.isIdle ? (
        "the vault's cash inside Morpho Blue"
      ) : (
        <>
          LLTV <Prov info={vaultLegLltvProv(legCoords)}>{lltvText(leg.lltv)}</Prov>
        </>
      ),
      amount: leg.assets,
      amountProv: vaultLegAssetsProv(legCoords),
      share: leg.shareOfAllocated,
      shareProv: vaultLegShareProv(legCoords),
      hooks: { "data-leg": leg.id },
    };
  });
  // Largest first, so the first rows are the top markets by amount.
  const amountOf = (r: VaultAssetRow) => (r.amount ? BigInt(r.amount.raw) : BigInt(-1));
  rows.sort((a, b) => (amountOf(b) > amountOf(a) ? 1 : amountOf(b) < amountOf(a) ? -1 : 0));
  if (!legs.some((l) => l.isIdle))
    rows.push({
      key: "idle",
      venue: "Idle",
      sub: "no idle market in the queue",
      amount: null,
      share: null,
      offBand: true,
      hooks: { "data-idle": "none" },
    });

  // The card's headlines: vaultHeads's, with Total assets and Share price
  // compact from a million and the asset's mark after them, and Holders
  // leading with the addresses holding a share now.
  const holdersHref = metaMorphoVaultsListingHref(chainId, { vault: vault.address });
  const c = v.census;
  const heads: PositionCardHead[] = vaultHeads({ vault: v, yieldFigure, holdersHref, receipts, detail: true }).map(
    (h) => {
      if (h.id === "total-assets" && v.totalAssets)
        return {
          ...h,
          value: (
            <span data-cell="total-assets" data-figure="total-assets" data-raw={v.totalAssets.raw}>
              <InAssetFigure
                value={v.totalAssets.value}
                full={assetText(v.totalAssets, ad)}
                exact={assetText(v.totalAssets, ad)}
                asset={assetMark}
                prov={receipts.totalAssets}
                head
              />
            </span>
          ),
        };
      if (h.id === "share-price" && v.sharePrice)
        return {
          ...h,
          value: (
            <span data-cell="share-price" data-figure="share-price" data-raw={v.sharePrice.raw}>
              <InAssetFigure
                value={v.sharePrice.value}
                full={sharePriceText(v.sharePrice, ad)}
                exact={sharePriceText(v.sharePrice, ad)}
                asset={assetMark}
                prov={receipts.sharePrice}
                head
              />
            </span>
          ),
        };
      if (h.id === "holders" && c && c.holders > 0)
        return {
          ...h,
          labelTip:
            "The addresses holding a share of this vault at the census block. A floor: an address is often a wrapper or a contract holding for others.",
          value: (
            <Link
              href={holdersHref}
              prefetch={false}
              className="pointer-events-auto hover:text-blue-600 dark:hover:text-[var(--text-link)]"
              data-cell="holders"
              data-positions-link={v.address}
            >
              <Prov info={vaultHoldersProv(v, c)}>{n(c.live)}</Prov>
            </Link>
          ),
          sub: <Prov info={vaultHoldersProv(v, c)}>{`${n(c.holders)} have held it`}</Prov>,
        };
      return h;
    },
  );

  // The card's sidebar names the explorer the live page sits under; the
  // mock's route is on no roster entry, so it is named here.
  const entry = protocolForPathname(metaMorphoVaultHref(chainId, vault.address));
  const edge: PositionCardEdge | null = entry
    ? {
        protocol: { id: entry.id, name: entry.label, href: entry.href },
        chain: { id: entry.chainId, name: chainMeta(entry.chainId).name },
      }
    : null;

  // Where the assets are as a segmented bar: the band's plan (a market of 2%
  // or more alone, the rest one slice), each row's share keyed by its
  // slice's colour.
  const plan = planAllocation(
    rows
      .map((r, order) => ({ r, order, key: r.key, amount: r.amount ? BigInt(r.amount.raw) : null }))
      .filter(({ r }) => !r.offBand),
  );
  const planTotal = Number(plan.total);
  const allocParts = plan.shown.map((l) => ({
    key: l.key,
    label: typeof l.r.venue === "string" ? l.r.venue : shortId(l.key),
    share: Number(l.amount ?? BigInt(0)) / planTotal,
    rest: false,
  }));
  if (plan.collected.length)
    allocParts.push({
      key: "collected",
      label: `${n(plan.collected.length)} more markets`,
      share: plan.collected.reduce((t, l) => t + Number(l.amount ?? BigInt(0)), 0) / planTotal,
      rest: true,
    });
  // Each market in its collateral's colour, the idle market in the asset's
  // (lib/shared/slice-colours.ts): the icon's colour by symbol, then address,
  // the order the icon resolves in.
  const iconOf = new Map(rows.map((r) => [r.key, r.icon ?? asset]));
  const allocColours = assetSliceColours(
    allocParts.map((sl) => {
      const t = iconOf.get(sl.key) ?? asset;
      return sl.rest ? { rest: true } : { token: t.address, colour: tokenColour(t.symbol) ?? tokenColour(t.address) };
    }),
  );
  const allocSlices: SegmentSlice[] = allocParts.map(({ key, label, share }, i) => ({
    key,
    label,
    share,
    colour: allocColours[i],
  }));
  const keyColours: Record<string, string> = {};
  /** Each row's segment, for the row and its segment to light together. */
  const segOf = new Map<string, string>();
  for (const sl of allocSlices)
    if (sl.key !== "collected") {
      keyColours[sl.key] = sl.colour;
      segOf.set(sl.key, sl.key);
    }
  for (const l of plan.collected) {
    keyColours[l.key] = allocColours[allocColours.length - 1];
    segOf.set(l.key, "collected");
  }
  const segRows = rows.map((r) =>
    segOf.has(r.key) ? { ...r, hooks: { ...r.hooks, "data-seg": segOf.get(r.key)! } } : r,
  );
  const allocChart =
    planTotal > 0 && allocSlices.length > 0 ? (
      <div className="pt-4 pb-4" data-mock-alloc-bar="">
        <SegmentBar slices={allocSlices} scope="allocation" label={`Where this vault's ${unit} is, by market`} />
      </div>
    ) : undefined;

  const configStamp = (block: number | null, what: string, reads: string) =>
    block ? (
      <SectionReadStamp
        chainId={chainId}
        block={block}
        info={(at) =>
          readStampProv({
            chainId,
            block,
            at,
            what,
            contracts: [{ name: vault.name, address: vault.address, reads }],
          })
        }
      />
    ) : undefined;

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        className="mb-4 rounded-lg border border-dashed border-rb-400 px-4 py-3 text-[13px] leading-relaxed text-rb-500 dark:border-rb-500"
        data-mock-note=""
      >
        A mock of a new layout for this vault&rsquo;s page: the live vault card, then a grid of tiles after
        Coinbase&rsquo;s asset pages, with the configuration and roles after Morpho&rsquo;s vault page. New: Who holds
        it, from the census, and Configuration and addresses, which carries no receipts yet. The other tiles are the
        live page&rsquo;s sections.{" "}
        <Link href={metaMorphoVaultHref(chainId, vault.address)} prefetch={false} className={INLINE_LINK}>
          The live page
        </Link>
      </div>

      <VaultFinder />

      {/* A stat the compact form does not cover (Shares issued on an asset
          whose decimals disagree) breaks across lines at phone width instead
          of running past the card's edge. */}
      <PositionCardEdgeContext.Provider value={edge}>
        <div className="[&_[data-panel-figure]]:max-w-full [&_dd]:break-all">
          <VaultCard
            heads={heads}
            vault={v}
            yieldFigure={yieldFigure}
            holdersHref={holdersHref}
            receipts={receipts}
            status={null}
            stats={stats}
            band={v.illiquid ? <VaultIlliquidMarkets vault={v} il={v.illiquid} /> : undefined}
            links={links}
            explanation={explanation}
            learnMore={morphoVaultCardContent()}
            stamp={
              <SectionReadStamp
                chainId={chainId}
                block={data.blockNumber}
                readBy={coords.readBy}
                info={(at) =>
                  readStampProv({
                    chainId,
                    block: data.blockNumber,
                    at,
                    readBy: coords.readBy,
                    what: "Every figure on this card and in where the assets are",
                    contracts: [
                      {
                        name: vault.name,
                        address: vault.address,
                        reads:
                          "totalAssets(), totalSupply(), convertToAssets(), curator(), owner(), lostAssets(), withdrawQueue()",
                      },
                      {
                        name: "Morpho Blue",
                        address: vault.morpho,
                        reads: "market(id), position(id, vault), idToMarketParams(id) for each market in the queue",
                      },
                    ],
                  })
                }
              />
            }
            exports={exportModel}
          />
        </div>
      </PositionCardEdgeContext.Provider>

      <div className={`${GRID} [--donut-ground:var(--background)]`} data-mock-layout="">
        <Tile id="last-30-days" wide>
          <VaultStrip vault={v} strip={strip} yieldFigure={yieldFigure} />
        </Tile>

        <Tile id="allocation" segScope="allocation" left>
          <VaultAssets
            rows={segRows}
            assetSymbol={unit}
            assetAddress={vault.asset.address}
            assetDecimals={ad}
            limit={TOP_MARKETS}
            allHref={blueWalletHref(chainId, vault.address)}
            chart={allocChart}
            keyColours={keyColours}
            look="index"
            line={
              <>
                <PanelFigure>{n(funded.length)}</PanelFigure> of {n(legs.length)} markets in the withdraw queue hold a
                balance, largest first.
              </>
            }
            shareTip="Each market's amount over the sum across the withdraw queue."
            learnMore={morphoVaultAssetsContent()}
            menu={{
              links: [
                {
                  item: "own-positions",
                  title: "This vault's positions on Morpho Blue",
                  subtitle: "The vault as a Morpho Blue lender",
                  href: blueWalletHref(chainId, vault.address),
                  internal: true,
                },
                {
                  item: "loan-token-markets",
                  title: `${unit} markets on Morpho Blue`,
                  subtitle: `Every market that lends ${unit}`,
                  href: morphoLoanTokenHref(chainId, vault.asset.address),
                  internal: true,
                },
              ],
            }}
          />
        </Tile>

        <Tile id="holders" segScope="mock-holders">
          <WhoHoldsIt
            chainId={chainId}
            vault={vault.address}
            vaultName={name}
            shareSymbol={vault.symbol}
            shareDecimals={vault.decimals}
            holders={holders}
          />
        </Tile>

        {/* The two protects sections render as one fragment: one wide tile,
            split in two from lg by the same 1px-gap hairline. */}
        <Tile id="risk" wide flush>
          <div className="grid grid-cols-1 lg:grid-cols-2 [&>section]:!p-5">
            <i aria-hidden className={`pointer-events-none absolute inset-y-5 left-1/2 hidden w-px lg:block ${RULE}`} />
            <VaultProtects
              chainId={chainId}
              block={protects?.block ?? 0}
              vaultName={name}
              protects={protects?.protects ?? null}
              underneath={protects?.underneath ?? null}
              look="paragraph"
            />
          </div>
        </Tile>

        <Tile id="configuration" wide last>
          <ProvSection scope="mock-config" data-mock-section="config">
            <SectionHeading
              title="Configuration and addresses"
              stamp={configStamp(
                config.block ?? protects?.block ?? null,
                "The fee and the roles",
                "fee(), feeRecipient(), owner(), curator(), guardian()",
              )}
              menu={<SectionMenu scope="mock-config" title="Configuration and addresses" />}
            >
              <p className="mt-1 text-[13px] text-rb-500">
                {chain.name}, chain id {chainId}
              </p>
            </SectionHeading>
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-3" data-prov-exempt="">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-rb-500">Configuration</h3>
                <dl className="mt-1">
                  <Fact
                    id="version"
                    label="Version"
                    tip="The MetaMorpho factory release that deployed the vault."
                    value={v.releaseLabel}
                  />
                  <Fact
                    id="created"
                    label="Created"
                    tip="The date of the block the vault was deployed in."
                    value={config.createdAt ? formatDate(new Date(config.createdAt * 1000)) : null}
                    sub={vault.createdBlock > 0 ? `block ${n(vault.createdBlock)}` : undefined}
                  />
                  <Fact
                    id="fee"
                    label="Performance fee"
                    tip="The share of the interest the vault earns that it pays to the fee recipient, as new shares. Read from fee(), a fraction of 10^18."
                    value={config.fee != null ? wadPct(config.fee) : null}
                  />
                  <Fact
                    id="fee-recipient"
                    label="Fee recipient"
                    tip="The address the performance fee's new shares go to. Read from feeRecipient()."
                    value={
                      feeRecipient ? (
                        <a
                          href={addr(feeRecipient)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-mono ${INLINE_LINK}`}
                          title={feeRecipient}
                        >
                          {shortAddress(feeRecipient)}
                        </a>
                      ) : config.block != null ? (
                        <span className="text-[13px] font-normal text-rb-500">none set</span>
                      ) : null
                    }
                  />
                </dl>
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-rb-500">Roles</h3>
                <ul className="mt-1">
                  <AddressRow
                    id="owner"
                    label="Owner"
                    sub="sets the curator, the guardian and the fee"
                    address={vault.owner}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="curator"
                    label="Curator"
                    sub="chooses the markets and their caps"
                    address={vault.curator}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="guardian"
                    label="Guardian"
                    sub="can cancel a change while it waits"
                    address={protects ? protects.guardian : null}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                </ul>
                <p className="mt-2 text-xs text-rb-500">Allocators are not listed here.</p>
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-rb-500">Contracts</h3>
                <ul className="mt-1">
                  <AddressRow
                    id="vault"
                    label="Vault"
                    sub={name}
                    address={vault.address}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  <AddressRow
                    id="asset"
                    label="Asset"
                    sub={unit}
                    address={vault.asset.address}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                  {v.assetScale && (
                    <AddressRow
                      id="wraps"
                      label="What the asset wraps"
                      sub={`${v.assetScale.wraps.symbol}, ${unit}'s asset(), ${v.assetScale.wraps.decimals} decimals`}
                      address={v.assetScale.wraps.address}
                      explorer={chain.explorerName}
                      href={addr}
                    />
                  )}
                  <AddressRow
                    id="morpho-blue"
                    label="Morpho Blue"
                    sub="the lending protocol"
                    address={vault.morpho}
                    explorer={chain.explorerName}
                    href={addr}
                  />
                </ul>
              </div>
            </div>
          </ProvSection>
        </Tile>
      </div>
      <ColourNote />
    </ProvReceiptsScope>
  );
}
