"use client";

// One MetaMorpho vault's page on Base (rails-ops ui-jobs 407): the vault card
// (V2), where the assets are (V3) and the holder finder (V4). One block's read
// of the vault and of Morpho Blue (lib/sources/chain/morpho-base-vault.ts);
// Holders is the census's, Yield the daily store's.

import Link from "next/link";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { VaultCard, YieldBullets, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { assetText, pctText, shareText, shortAddress, shortId } from "@/lib/shared/vault-amount-text";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { morphoBasePositionHref, morphoBaseWalletHref } from "@/lib/morpho-base/routes";
import {
  vaultAllocatedProv,
  vaultGapProv,
  vaultLegAssetsProv,
  vaultLegLltvProv,
  vaultLegShareProv,
  vaultLostAssetsProv,
  vaultSharePriceProv,
  vaultTotalAssetsProv,
  vaultTotalSupplyProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type { MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { baseVaultsListingHref } from "@/lib/vaults/routes";
import { morphoBaseVaultPageSummary } from "@/lib/vaults/summary";
import { vaultStewardProv } from "@/lib/vaults/card-provenance";
import {
  morphoVaultAssetsContent,
  morphoVaultCardContent,
  SHARES_ISSUED_TIP,
  STEWARD_TIP,
} from "@/lib/vaults/card-words";
import type { VaultYield } from "@/lib/vaults/yield";

const n = (v: number) => v.toLocaleString("en-US");
const lltvText = (lltv: number) => `${(lltv * 100).toFixed(1)}%`;
const base = (kind: "address" | "block", v: string | number) => explorerUrl(MORPHO_BASE_CHAIN_ID, kind, v);

export function MorphoBaseVaultPage({
  data,
  census,
  yieldFigure,
  factory,
}: {
  data: MorphoBaseVaultResponse;
  census: VaultCensusRow | null;
  yieldFigure?: VaultYield;
  /** The factory that made this vault, from the catalogue. */
  factory: string | null;
}) {
  const registry = useReceiptRegistry();
  const { vault, legs } = data;
  const v = morphoBaseVaultPageSummary(data, census);
  const coords: MorphoVaultCoords = {
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
          <Prov info={vaultTotalSupplyProv(coords)}>{shareText(data.totalSupply, vault.decimals)}</Prov>
        </span>
      ),
    },
    {
      id: "allocated",
      label: "Allocated in Morpho Blue",
      tip: "The vault's supply positions summed, as Morpho Blue last settled each market. Total assets adds interest up to this block; no order between the two is asserted.",
      asset,
      value: (
        <span data-figure="allocated">
          <Prov info={vaultAllocatedProv(coords)}>{assetText(data.allocated, ad)}</Prov>
        </span>
      ),
    },
    {
      id: "unaccrued",
      label: "Unaccrued interest",
      tip: "Total assets minus the allocated sum: interest the vault counts to this block that the markets have not settled.",
      asset,
      value: (
        <span data-figure="gap">
          <Prov info={vaultGapProv(coords)}>{assetText(data.gap, ad)}</Prov>
        </span>
      ),
    },
    {
      id: "steward",
      label: "Steward",
      sub: steward.role === "curator" ? "curator" : "owner",
      tip: steward.role === "curator" ? STEWARD_TIP.curator : STEWARD_TIP.owner,
      value: (
        <a
          href={base("address", steward.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm hover:underline"
          data-steward={steward.address}
          data-steward-role={steward.role}
        >
          <Prov info={vaultStewardProv(v, steward)}>{shortAddress(steward.address)}</Prov>
        </a>
      ),
    },
  ];
  // Absent, not zero, on a V1.0 vault: that family keeps no such ledger.
  if (data.lostAssets)
    stats.push({
      id: "lost-assets",
      label: "Lost assets",
      tip: "On a MetaMorpho V1.1 vault, the part of total assets that no market holds. The share price has not been lowered for it.",
      asset,
      value: (
        <span data-figure="lost-assets">
          <Prov info={vaultLostAssetsProv(coords)}>{assetText(data.lostAssets, ad)}</Prov>
        </span>
      ),
    });

  const links: VaultMenuLink[] = [
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(vault.address)} on Basescan`,
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
      subtitle: `Block ${n(vault.createdBlock)} on Basescan`,
      href: base("block", vault.createdBlock),
    },
    {
      item: "own-positions",
      title: "This vault's positions on Morpho Blue",
      subtitle: "The vault as a Morpho Blue lender",
      href: morphoBaseWalletHref(vault.address),
      internal: true,
    },
    {
      item: "venue-page",
      title: "On Morpho's app",
      subtitle: "app.morpho.org",
      href: `https://app.morpho.org/base/vault/${vault.address}`,
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
    return {
      key: leg.id,
      venue: leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id)),
      sub: (
        <>
          {!leg.isIdle && (
            <>
              LLTV <Prov info={vaultLegLltvProv(legCoords)}>{lltvText(leg.lltv)}</Prov> ·{" "}
            </>
          )}
          <span className="font-mono">{shortId(leg.id)}</span>
        </>
      ),
      amount: leg.assets,
      amountProv: vaultLegAssetsProv(legCoords),
      share: leg.shareOfAllocated,
      shareProv: vaultLegShareProv(legCoords),
      links: (
        <span className="whitespace-nowrap">
          <Link href={`/base/morpho/markets/${leg.loanToken}`} className={PAGE_LINK} prefetch={false}>
            {unit} markets
          </Link>
          <span className="mx-1.5 text-rb-500">·</span>
          <Link href={morphoBasePositionHref(vault.address, leg.id)} className={PAGE_LINK} prefetch={false}>
            vault&rsquo;s position
          </Link>
        </span>
      ),
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
        <ExplainBullet>
          Created at block <Fig>{n(vault.createdBlock)}</Fig> by the MetaMorpho {vault.factory} factory.
        </ExplainBullet>
        {v.census && (
          <ExplainBullet>
            <Fig>{n(v.census.holders)}</Fig> addresses have held a share; <Fig>{n(v.census.live)}</Fig> hold one at the
            census block.
          </ExplainBullet>
        )}
      </ExplainGroup>
    </div>
  );

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultCard
        vault={v}
        yieldFigure={yieldFigure}
        holdersHref={baseVaultsListingHref({ vault: vault.address })}
        receipts={{ totalAssets: vaultTotalAssetsProv(coords), sharePrice: vaultSharePriceProv(coords) }}
        status={null}
        stats={stats}
        links={links}
        explanation={explanation}
        learnMore={morphoVaultCardContent()}
        readAt={
          <>
            Read at <BlockRef block={data.blockNumber} chainId={MORPHO_BASE_CHAIN_ID} />, on the vault and on the{" "}
            <a href={base("address", vault.morpho)} target="_blank" rel="noopener noreferrer" className="link-external">
              Morpho Blue singleton
            </a>
          </>
        }
        exports={{
          stats: [
            ["Shares issued", `${shareText(data.totalSupply, vault.decimals)} ${vault.symbol}`],
            ["Allocated in Morpho Blue", `${assetText(data.allocated, ad)} ${unit}`],
            ["Unaccrued interest", `${assetText(data.gap, ad)} ${unit}`],
            [`Steward (${steward.role})`, steward.address],
            ...(data.lostAssets
              ? ([["Lost assets", `${assetText(data.lostAssets, ad)} ${unit}`]] as [string, string][])
              : []),
          ],
          rows: legs.map((l) => [
            `${l.isIdle ? "Idle market" : (l.collateralSymbol ?? shortId(l.id))} ${l.id}`,
            assetText(l.assets, ad),
            l.shareOfAllocated == null ? "" : pctText(l.shareOfAllocated),
          ]),
        }}
      />
      <VaultAssets
        rows={rows}
        assetSymbol={unit}
        assetDecimals={ad}
        line={
          <>
            <PanelFigure>{n(funded.length)}</PanelFigure> of {n(legs.length)} markets in the withdraw queue hold a
            balance at this block.
          </>
        }
        shareTip="Each market's amount over the sum across the withdraw queue, as Morpho Blue last settled them at this block."
        learnMore={morphoVaultAssetsContent()}
      />
      <VaultFinder />
    </ProvReceiptsScope>
  );
}
