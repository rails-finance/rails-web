"use client";

// One MetaMorpho vault's page on Base or Ethereum (rails-ops ui-jobs 407, 486;
// the grid of tiles, Miles, 10 Nov 2026): the holder finder (V4), the vault
// card (V2), then the grid (components/vaults/vault-tiles.tsx): the last 30
// days (V5); where the assets are (V3) | who holds it; what protects it (V9) |
// the protocol underneath (V10), streamed by the route; the steward's record
// (V14); configuration and
// addresses; the colour note at the foot. One block's read of the vault and
// of Morpho Blue (lib/sources/chain/morpho-base-vault.ts), the fee and the
// guardian at the same block (lib/vaults/config-read.ts); Holders and Who
// holds it are the census's, Yield the daily store's.

import Link from "next/link";
import type { ReactNode } from "react";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvReceiptsScope, Prov, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import type { PositionCardHead } from "@/components/shared/position-card";
import { AssetUnit } from "@/components/shared/asset-unit";
import { CreatedBullet, VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { ALLOCATION_SCOPE, allocationBar, VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { VaultStrip } from "@/components/vaults/vault-strip";
import { VaultIlliquidMarkets } from "@/components/vaults/vault-illiquid";
import { vaultHeads } from "@/components/vaults/vault-heads";
import { ColourNote, RULE, Tile, VAULT_CARD_TILE, VAULT_GRID } from "@/components/vaults/vault-tiles";
import { HOLDERS_SCOPE, VaultWhoHolds } from "@/components/vaults/vault-who-holds";
import { VaultStewardRecord } from "@/components/vaults/vault-steward-record";
import type { StewardRecordRead } from "@/lib/vaults/steward-record";
import { VaultConfiguration } from "@/components/vaults/vault-config";
import { metaMorphoConfigTile } from "@/components/vaults/vault-config-columns";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";
import { explorerUrl } from "@/lib/shared/chains";
import {
  assetText,
  pctText,
  sharePriceText,
  shareText,
  shortAddress,
  shortId,
  statText,
} from "@/lib/shared/vault-amount-text";
import { StatAmount } from "@/components/vaults/stat-amount";
import { formatCompact } from "@/lib/shared/format-compact";
import { morphoBaseWalletHref } from "@/lib/morpho-base/routes";
import { morphoLoanTokenHref, morphoMarketHref } from "@/lib/morpho/market-routes";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import {
  vaultAllocatedProv,
  vaultGapProv,
  vaultLegAssetsProv,
  vaultLegLltvProv,
  vaultLegShareProv,
  vaultLostAssetsProv,
  vaultHeldAssetsProv,
  vaultSharePriceProv,
  vaultTotalAssetsProv,
  vaultTotalSupplyProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type { MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { metaMorphoVaultHref, metaMorphoVaultsListingHref } from "@/lib/vaults/routes";
import { morphoBaseVaultPageSummary, withAssetScale } from "@/lib/vaults/summary";
import {
  assetScaleAbsentTip,
  assetScaleReceiptNote,
  withScaleNote,
  type AssetScale,
} from "@/lib/vaults/asset-scale-words";
import { HeadingTip } from "@/components/shared/tip-label";
import { vaultStewardProv, vaultVenueProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import {
  morphoVaultAssetsContent,
  morphoVaultCardContent,
  SHARES_ISSUED_TIP,
  STEWARD_TIP,
} from "@/lib/vaults/card-words";
import { vaultHoldersProv } from "@/lib/vaults/row-provenance";
import { measuredYield, type VaultYield } from "@/lib/vaults/yield";
import type { VaultConfig } from "@/lib/vaults/config-read";
import type { VaultHolders } from "@/lib/vaults/holders-read";

const n = (v: number) => v.toLocaleString("en-US");
const lltvText = (lltv: number) => `${(lltv * 100).toFixed(1)}%`;

/** What differs by chain on the page: the block explorer, Morpho's app slug and
 *  the Morpho Blue explorer's position routes (ui-jobs 486). */
const CHAIN_WORDS = {
  8453: { explorer: "Basescan", app: "base" },
  1: { explorer: "Etherscan", app: "ethereum" },
} as const;

/** Where the assets are draws this many markets, then links to every one. */
const TOP_MARKETS = 5;

/** From a million, a figure reads compact. */
const MILLION = 1_000_000;

/** Every Blue position the vault holds, on the chain's explorer. */
const blueWalletHref = (chainId: 1 | 8453, vault: string) =>
  chainId === 8453 ? morphoBaseWalletHref(vault) : (listingHrefForWallet("morpho", vault) ?? "/ethereum/morpho");

/** A headline's or a stat's figure in the vault's asset: compact from a
 *  million (formatCompact, the V6 index's form), the full figure in its
 *  title and in `data-figure-full`; then the asset's mark, or its symbol in
 *  words where it has none. */
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
  /** The full figure as text: the title, the receipt's exact figure and `data-figure-full`. */
  exact: string;
  asset: { symbol: string; address: string; named: boolean };
  prov: Provenance;
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
    >
      <span
        data-figure-value=""
        data-figure-full={exact}
        data-prov-exact={exact}
        data-prov-symbol={asset.symbol}
        title={big ? `${exact} ${asset.symbol}` : undefined}
      >
        <Prov info={prov}>{text}</Prov>
      </span>
      <AssetUnit symbol={asset.symbol} address={asset.address} named={asset.named} />
    </span>
  );
}

export function MorphoBaseVaultPage({
  protects,
  assetScales,
  data,
  census,
  yieldFigure: storeYield,
  strip,
  factory,
  config,
  holders,
  stewardRecord,
  badDebt,
}: {
  /** "What protects it" and "The protocol underneath" (V9, V10), streamed by the route. */
  protects: ReactNode;
  /** The "decimals disagree" reading for the vault's asset, where it disagrees. */
  assetScales?: Record<string, AssetScale>;
  data: MorphoBaseVaultResponse;
  census: VaultCensusRow | null;
  yieldFigure?: VaultYield;
  /** The store's three daily series for the strip (V5); null where it did not answer. */
  strip: VaultStripSeries | null;
  /** The factory that made this vault, from the catalogue. */
  factory: string | null;
  /** `fee()`, `feeRecipient()`, `guardian()` at the card's block, and the creation block's time. */
  config: VaultConfig;
  /** Who holds it: the census's largest holders; null where it did not answer. */
  holders: VaultHolders | null;
  /** The vaults this steward runs now, from the /vaults directory; null where it did not answer. */
  stewardRecord: StewardRecordRead;
  /** The bad-debt episodes in the steward's vaults (V14.1), streamed by the route. */
  badDebt?: ReactNode;
}) {
  const registry = useReceiptRegistry();
  const { vault, legs, chainId } = data;
  const words = CHAIN_WORDS[chainId];
  const base = (kind: "address" | "block", v: string | number) => explorerUrl(chainId, kind, v);
  const v = withAssetScale(morphoBaseVaultPageSummary(data, census), assetScales ?? {});
  // A figure on total assets under the dust floor is too small to measure (ui-jobs 542).
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
  const name = vault.name || shortAddress(vault.address);
  const holdersHref = metaMorphoVaultsListingHref(chainId, { vault: vault.address });

  // An asset whose decimals disagree (ui-jobs 664): every amount in it stands
  // as "—" with the reason; each receipt keeps its raw read and says so.
  const withheld = v.assetScale ? assetScaleAbsentTip(unit, v.assetScale) : null;
  const note = v.assetScale ? assetScaleReceiptNote(unit, v.assetScale) : null;
  const noted = <P extends { summary: string }>(p: P) => withScaleNote(p, note);
  const withheldValue = (figure: string, prov: Provenance) => (
    <span data-figure={figure} data-asset-scale-withheld="">
      <Prov info={noted(prov)}>—</Prov>
    </span>
  );
  const withheldSub = withheld ? <HeadingTip text="decimals disagree" tip={withheld} /> : undefined;

  const receipts = {
    totalAssets: noted(vaultTotalAssetsProv(coords)),
    sharePrice: noted(vaultSharePriceProv(coords)),
    ...(data.lostAssets
      ? {
          lostAssets: noted(vaultLostAssetsProv(coords)),
          heldAssets: noted(
            vaultHeldAssetsProv(coords, {
              totalAssets: data.totalAssets.raw,
              lostAssets: data.lostAssets.raw,
            }),
          ),
        }
      : {}),
  };

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
      sub: withheldSub,
      value: withheld ? (
        withheldValue("allocated", vaultAllocatedProv(coords))
      ) : (
        <span data-figure="allocated">
          <InAssetFigure
            value={data.allocated.value}
            full={<StatAmount amount={data.allocated} decimals={ad} symbol={unit} />}
            exact={statText(data.allocated, assetText(data.allocated, ad))}
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
      sub: withheldSub,
      value: withheld ? (
        withheldValue("gap", vaultGapProv(coords))
      ) : (
        <span data-figure="gap">
          <InAssetFigure
            value={data.gap.value}
            full={<StatAmount amount={data.gap} decimals={ad} symbol={unit} />}
            exact={statText(data.gap, assetText(data.gap, ad))}
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
        // The short address alone: the steward's explorer page is a row of the ⋮.
        <span className="font-mono text-sm" data-steward={steward.address} data-steward-role={steward.role}>
          <Prov info={vaultStewardProv(v, steward, coords.readBy)}>{shortAddress(steward.address)}</Prov>
        </span>
      ),
    },
  ];
  // Absent on a V1.0 vault, which keeps no such ledger, and hidden at zero.
  const lostStat = data.lostAssets && BigInt(data.lostAssets.raw) > BigInt(0) ? data.lostAssets : null;
  if (lostStat)
    stats.push({
      id: "lost-assets",
      label: "Lost assets",
      tip: "On a MetaMorpho V1.1 vault, the part of total assets that no market holds. The share price has not been lowered for it.",
      ...(withheld ? { sub: withheldSub } : { asset }),
      value: withheld ? (
        withheldValue("lost-assets", vaultLostAssetsProv(coords))
      ) : (
        <span data-figure="lost-assets">
          <Prov info={vaultLostAssetsProv(coords)}>
            <StatAmount amount={lostStat} decimals={ad} symbol={unit} />
          </Prov>
        </span>
      ),
    });

  const stewardWord = steward.role === "curator" ? "Curator" : "Owner";
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
      subtitle: `${shortAddress(vault.address)} on ${words.explorer}`,
      href: base("address", vault.address),
    },
    ...(factory
      ? [
          {
            item: "factory",
            title: "Factory",
            subtitle: `MetaMorpho ${vault.factory} · ${shortAddress(factory)}`,
            href: base("address", factory),
          },
        ]
      : []),
    {
      item: "created",
      title: "Created",
      subtitle: `Block ${n(vault.createdBlock)} on ${words.explorer}`,
      href: base("block", vault.createdBlock),
    },
    {
      item: "steward",
      title: `${stewardWord} on ${words.explorer}`,
      subtitle: shortAddress(steward.address),
      href: base("address", steward.address),
    },
    {
      item: "venue-page",
      title: "On Morpho's app",
      subtitle: "app.morpho.org",
      href: `https://app.morpho.org/${words.app}/vault/${vault.address}`,
    },
    {
      item: "docs",
      title: "Morpho's documentation",
      subtitle: "docs.morpho.org: Vaults V1 roles",
      href: "https://docs.morpho.org/curate/concepts/roles/#morpho-vaults-v1-roles",
    },
  ];

  const explanation = (
    <div data-vault-explanation="">
      <ExplainGroup title="Holdings">
        {withheld ? (
          <ExplainBullet>
            This vault lends across <Fig>{n(funded.length)}</Fig> Morpho Blue markets for the holders of its shares.{" "}
            {withheld}
          </ExplainBullet>
        ) : (
          <>
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
          </>
        )}
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

  const exportModel: VaultExportModel = {
    stats: [
      ["Shares issued", `${shareText(data.totalSupply, vault.decimals)} ${vault.symbol}`],
      // An asset whose decimals disagree exports an empty cell (ui-jobs 664).
      ["Allocated in Morpho Blue", withheld ? "" : `${assetText(data.allocated, ad)} ${unit}`],
      ["Unaccrued interest", withheld ? "" : `${assetText(data.gap, ad)} ${unit}`],
      [`Steward (${steward.role})`, steward.address],
      ...(lostStat
        ? ([["Lost assets", withheld ? "" : `${assetText(lostStat, ad)} ${unit}`]] as [string, string][])
        : []),
    ],
    rows: legs.map((l) => [
      `${l.isIdle ? "Idle market" : (l.collateralSymbol ?? shortId(l.id))} ${l.id}`,
      withheld ? "" : assetText(l.assets, ad),
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
            { label: "loan asset", value: leg.loanToken },
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
      amountProv: noted(vaultLegAssetsProv(legCoords)),
      share: leg.shareOfAllocated,
      shareProv: vaultLegShareProv(legCoords),
      hooks: { "data-leg": leg.id },
    };
  });
  // Largest first, so the first rows are the top markets by amount.
  const amountOf = (r: VaultAssetRow) => (r.amount ? BigInt(r.amount.raw) : BigInt(-1));
  rows.sort((a, b) => (amountOf(b) > amountOf(a) ? 1 : amountOf(b) < amountOf(a) ? -1 : 0));
  // Idle is a row on every family: a queue with no idle market says so.
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
  const c = v.census;
  const heads: PositionCardHead[] = vaultHeads({ vault: v, yieldFigure, holdersHref, receipts, detail: true }).map(
    (h) => {
      // An asset whose decimals disagree keeps vaultHeads's "—" (ui-jobs 664).
      if (h.id === "total-assets" && v.totalAssets && !v.assetScale)
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
      if (h.id === "share-price" && v.sharePrice && !v.assetScale)
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
              data-link="vault-positions"
              data-positions-vault={v.address}
            >
              <Prov info={vaultHoldersProv(v, c)}>{n(c.live)}</Prov>
            </Link>
          ),
          sub: <Prov info={vaultHoldersProv(v, c)}>{`${n(c.holders)} have held it`}</Prov>,
        };
      return h;
    },
  );

  // Where the assets are as a segmented bar, each row keyed by its slice.
  const alloc = allocationBar(rows, { asset, venue: { one: "market", many: "markets" } });

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultFinder />

      {/* A stat the compact form does not cover (Shares issued on an asset
          whose decimals disagree) breaks across lines at phone width instead
          of running past the card's edge. The card stands as a tile, with no
          frame of its own. */}
      <Tile id="summary" flush>
        <div className={`${VAULT_CARD_TILE} [&_[data-panel-figure]]:max-w-full [&_dd]:break-all`}>
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
      </Tile>

      <div className={VAULT_GRID} data-vault-grid="" data-anatomy="V13">
        <Tile id="last-30-days" wide>
          <VaultStrip vault={v} strip={strip} yieldFigure={yieldFigure} />
        </Tile>

        <Tile id="allocation" segScope={ALLOCATION_SCOPE} left>
          <VaultAssets
            rows={alloc.rows}
            assetSymbol={unit}
            assetAddress={asset.address}
            assetDecimals={ad}
            limit={TOP_MARKETS}
            allHref={blueWalletHref(chainId, vault.address)}
            chart={alloc.chart}
            keyColours={alloc.keyColours}
            look="index"
            amountsWithheld={withheld ?? undefined}
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
              exports: vaultAssetsExports(v, exportModel),
            }}
          />
        </Tile>

        <Tile id="holders" segScope={HOLDERS_SCOPE} right>
          <VaultWhoHolds
            chainId={chainId}
            vault={vault.address}
            vaultName={name}
            shareSymbol={vault.symbol}
            shareDecimals={vault.decimals}
            holders={holders}
            holderHref={(h) => metaMorphoVaultHref(chainId, vault.address, h)}
            listingHref={holdersHref}
          />
        </Tile>

        {/* What protects it and The protocol underneath stream in as two
            sections: one wide tile, split in two from lg by a hairline. */}
        <Tile id="risk" wide flush>
          <div className="grid grid-cols-1 lg:grid-cols-2 [&>section]:!px-0 [&>section]:!py-5 sm:[&>section]:!p-5">
            <i aria-hidden className={`pointer-events-none absolute inset-y-5 left-1/2 hidden w-px lg:block ${RULE}`} />
            {protects}
          </div>
        </Tile>

        <Tile id="steward-record" wide>
          <VaultStewardRecord record={stewardRecord} role={steward.role} badDebt={badDebt} />
        </Tile>

        <Tile id="configuration" wide last>
          <VaultConfiguration
            chainId={chainId}
            vault={vault.address}
            vaultName={name}
            block={data.blockNumber}
            readBy={coords.readBy}
            {...metaMorphoConfigTile({
              chainId,
              vault: vault.address,
              vaultName: name,
              release: v.releaseLabel,
              factory,
              createdBlock: vault.createdBlock,
              asset,
              assetScale: v.assetScale,
              morpho: vault.morpho,
              owner: vault.owner,
              curator: vault.curator,
              block: data.blockNumber,
              readBy: coords.readBy,
              config,
            })}
          />
        </Tile>
      </div>
      <ColourNote />
    </ProvReceiptsScope>
  );
}
