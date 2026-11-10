// A vault row's receipts, per family: the figures a roster row prints (name,
// total assets, share price, the standing pills, lost and held assets), each
// from its family's vocabulary at the roster's block. One builder per family,
// read by that family's roster and by the cross-protocol index (`/vaults`,
// decision 0062 point 5; ui-jobs 571), so a figure traces the same on both.

import type { VaultRowReceipts } from "@/components/vaults/vault-heads";
import type { ServerRead } from "@/lib/shared/server-head-read";
import { stampServerRead } from "@/lib/shared/server-head-read";
import { aaveVaultAttestation, type AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import {
  aaveVaultBookProv,
  aaveVaultNameProv,
  aaveVaultSharePriceProv,
  aaveVaultTotalAssetsProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import {
  vaultDirectoryNameProv,
  vaultDirectorySharePriceProv,
  vaultDirectoryTotalAssetsProv,
  vaultHeldAssetsProv,
  vaultLostAssetsProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import {
  yearnVaultEndorsedProv,
  yearnVaultNameProv,
  yearnVaultSharePriceProv,
  yearnVaultShutdownProv,
  yearnVaultTotalAssetsProv,
  type YearnVaultCoords,
} from "@/lib/yearn/vault-provenance";
import { poolNavRateProv, poolTotalAssetsProv } from "@/lib/maple/event-provenance";
import { vaultIndexProtocol } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";

/** The roster read a row's receipts name. */
export interface RosterRead {
  blockNumber?: number;
  readBy?: ServerRead | null;
}

/** MetaMorpho, on Base or Ethereum. */
export function metaMorphoRowReceipts(read: RosterRead & { chainId: number }, v: VaultSummary): VaultRowReceipts {
  const c: MorphoVaultCoords = {
    ...read,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
  };
  return {
    name: vaultDirectoryNameProv(c),
    totalAssets: vaultDirectoryTotalAssetsProv(c),
    sharePrice: vaultDirectorySharePriceProv(c),
    ...(v.lostAssets && v.totalAssets
      ? {
          lostAssets: vaultLostAssetsProv(c),
          heldAssets: vaultHeldAssetsProv(c, { totalAssets: v.totalAssets.raw, lostAssets: v.lostAssets.raw }),
        }
      : {}),
  };
}

/** Aave: sGHO, the stata wrappers and the Umbrella stake tokens. */
export function aaveRowReceipts(read: RosterRead, v: VaultSummary): VaultRowReceipts {
  const c: AaveVaultCoords = {
    ...read,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
    shareSymbol: v.symbol ?? undefined,
  };
  const family = v.family as AaveVaultFamily;
  return {
    name: aaveVaultNameProv(c, aaveVaultAttestation(v.address, family)),
    totalAssets: aaveVaultTotalAssetsProv(c, family),
    sharePrice: v.shareDecimals != null ? aaveVaultSharePriceProv(c, v.shareDecimals) : undefined,
    standing: { "address-book": aaveVaultBookProv(c, aaveVaultAttestation(v.address, family)) },
  };
}

/** Yearn V3. */
export function yearnRowReceipts(read: RosterRead, v: VaultSummary): VaultRowReceipts {
  const c: YearnVaultCoords = {
    ...read,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
    apiVersion: v.release ?? undefined,
  };
  return {
    name: yearnVaultNameProv(c),
    totalAssets: yearnVaultTotalAssetsProv(c),
    sharePrice: yearnVaultSharePriceProv(c),
    standing: { endorsed: yearnVaultEndorsedProv(c, true), "shut-down": yearnVaultShutdownProv(c) },
  };
}

/** A Maple pool: total assets and the NAV per share, as its pools page reads them. */
export function mapleRowReceipts(read: RosterRead, v: VaultSummary): VaultRowReceipts {
  const block = read.blockNumber || v.readAt.block || undefined;
  const share = v.symbol ?? v.asset.symbol;
  return {
    totalAssets: stampServerRead(poolTotalAssetsProv(v.asset.symbol, block), read.readBy),
    sharePrice: stampServerRead(poolNavRateProv(v.asset.symbol, share, block), read.readBy),
  };
}

/** A row of the cross-protocol index, by its protocol, at its roster's read. */
export function vaultIndexRowReceipts(read: RosterRead, v: VaultSummary): VaultRowReceipts {
  switch (vaultIndexProtocol(v)) {
    case "morpho":
      return metaMorphoRowReceipts({ ...read, chainId: v.chainId }, v);
    case "aave":
      return aaveRowReceipts(read, v);
    case "yearn":
      return yearnRowReceipts(read, v);
    case "maple":
      return mapleRowReceipts(read, v);
  }
}
