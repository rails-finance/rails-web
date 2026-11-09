"use client";

// One MetaMorpho vault's page on Base or Ethereum (rails-ops ui-jobs 407, 486): the vault card
// (V2), the last 30 days (V5), where the assets are (V3) and the holder
// finder (V4). One block's read
// of the vault and of Morpho Blue (lib/sources/chain/morpho-base-vault.ts);
// Holders is the census's, Yield the daily store's.

import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { CreatedBullet, VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { VaultStrip } from "@/components/vaults/vault-strip";
import { VaultIlliquidMarkets } from "@/components/vaults/vault-illiquid";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";
import { explorerUrl } from "@/lib/shared/chains";
import { assetText, pctText, shareText, shortAddress, shortId } from "@/lib/shared/vault-amount-text";
import { StatAmount } from "@/components/vaults/stat-amount";
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
import { metaMorphoVaultsListingHref } from "@/lib/vaults/routes";
import { morphoBaseVaultPageSummary } from "@/lib/vaults/summary";
import { vaultStewardProv, vaultVenueProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import {
  morphoVaultAssetsContent,
  morphoVaultCardContent,
  SHARES_ISSUED_TIP,
  STEWARD_TIP,
} from "@/lib/vaults/card-words";
import { measuredYield, type VaultYield } from "@/lib/vaults/yield";

const n = (v: number) => v.toLocaleString("en-US");
const lltvText = (lltv: number) => `${(lltv * 100).toFixed(1)}%`;

/** What differs by chain on the page: the block explorer, Morpho's app slug and
 *  the Morpho Blue explorer's position routes (ui-jobs 486). */
const CHAIN_WORDS = {
  8453: { explorer: "Basescan", app: "base" },
  1: { explorer: "Etherscan", app: "ethereum" },
} as const;

/** Every Blue position the vault holds, on the chain's explorer. */
const blueWalletHref = (chainId: 1 | 8453, vault: string) =>
  chainId === 8453 ? morphoBaseWalletHref(vault) : (listingHrefForWallet("morpho", vault) ?? "/ethereum/morpho");

export function MorphoBaseVaultPage({
  data,
  census,
  yieldFigure: storeYield,
  strip,
  factory,
}: {
  data: MorphoBaseVaultResponse;
  census: VaultCensusRow | null;
  yieldFigure?: VaultYield;
  /** The store's three daily series for the strip (V5); null where it did not answer. */
  strip: VaultStripSeries | null;
  /** The factory that made this vault, from the catalogue. */
  factory: string | null;
}) {
  const registry = useReceiptRegistry();
  const { vault, legs, chainId } = data;
  const words = CHAIN_WORDS[chainId];
  const base = (kind: "address" | "block", v: string | number) => explorerUrl(chainId, kind, v);
  const v = morphoBaseVaultPageSummary(data, census);
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
  const steward = v.steward!;
  const funded = legs.filter((l) => BigInt(l.assets.raw) > BigInt(0));

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
      asset,
      value: (
        <span data-figure="allocated">
          <Prov info={vaultAllocatedProv(coords)}>
            <StatAmount amount={data.allocated} decimals={ad} symbol={unit} />
          </Prov>
        </span>
      ),
    },
    {
      id: "unaccrued",
      label: "Unaccrued interest",
      tip: "Total assets minus the allocated sum: interest the vault counts that the markets have not settled yet.",
      asset,
      value: (
        <span data-figure="gap">
          <Prov info={vaultGapProv(coords)}>
            <StatAmount amount={data.gap} decimals={ad} symbol={unit} />
          </Prov>
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
      asset,
      value: (
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
      subtitle: "docs.morpho.org: Vaults",
      href: "https://docs.morpho.org/learn/concepts/vault/",
    },
  ];

  const idle = legs.find((l) => l.isIdle);
  const rows: VaultAssetRow[] = legs.map((leg) => {
    const legCoords: MorphoVaultCoords = { ...coords, marketId: leg.id, collateralSymbol: leg.collateralSymbol };
    const venue = leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id));
    return {
      key: leg.id,
      venue,
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
  // Idle is a row on every family: a queue with no idle market says so.
  if (!idle)
    rows.push({
      key: "idle",
      venue: "Idle",
      sub: "no idle market in the queue",
      amount: null,
      share: null,
      offBand: true,
      hooks: { "data-idle": "none" },
    });

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

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultCard
        vault={v}
        yieldFigure={yieldFigure}
        holdersHref={metaMorphoVaultsListingHref(chainId, { vault: vault.address })}
        receipts={{
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
        }}
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
      <VaultStrip vault={v} strip={strip} yieldFigure={yieldFigure} />
      <VaultAssets
        rows={rows}
        assetSymbol={unit}
        assetAddress={asset.address}
        assetDecimals={ad}
        line={
          <>
            <PanelFigure>{n(funded.length)}</PanelFigure> of {n(legs.length)} markets in the withdraw queue hold a
            balance.
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
      <VaultFinder />
    </ProvReceiptsScope>
  );
}
