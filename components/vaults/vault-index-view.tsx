"use client";

// The cross-protocol vault index (rails-ops ui-jobs 39; decision 0028 point 8):
// the shared roster (components/vaults/vault-roster.tsx) over the union of the
// vault rosters, each row the vault row (V1) with a chain pill.
// ----------------------------------------------------------------------------
// The index owns no vault page: every row opens the vault's page under its
// protocol, a Maple pool's opening Maple's pools page. Facets: Token (by
// symbol, across chains), Network and Protocol, with the rosters' search.
// Each roster was read at its block and the read-at line names each one.
// Every figure keeps its roster's receipt. No USD and no cross-asset total.

import Link from "next/link";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import type { VaultRowReceipts } from "@/components/vaults/vault-row";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import {
  vaultDirectoryCensusProv,
  vaultDirectoryNameProv,
  vaultDirectorySharePriceProv,
  vaultDirectoryTotalAssetsProv,
} from "@/lib/morpho-base/vault-provenance";
import {
  aaveVaultBookProv,
  aaveVaultCatalogueProv,
  aaveVaultNameProv,
  aaveVaultSharePriceProv,
  aaveVaultTotalAssetsProv,
} from "@/lib/aave-vaults/vault-provenance";
import { aaveVaultAttestation, type AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import {
  yearnRosterCensusProv,
  yearnVaultEndorsedProv,
  yearnVaultNameProv,
  yearnVaultSharePriceProv,
  yearnVaultShutdownProv,
  yearnVaultTotalAssetsProv,
} from "@/lib/yearn/vault-provenance";
import { poolNavRateProv, poolTotalAssetsProv } from "@/lib/maple/event-provenance";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import {
  chainName,
  VAULT_INDEX_PROTOCOL_LABEL,
  VAULT_INDEX_PROTOCOLS,
  vaultIndexHoldersHref,
  vaultIndexHref,
  vaultIndexKey,
  vaultIndexProtocol,
  vaultIndexRosterHref,
  type VaultIndexRoster,
} from "@/lib/vaults/index-rosters";
import { maplePoolCountProv, vaultIndexEmptyCountProv, vaultIndexGroupCountProv } from "@/lib/vaults/index-provenance";

const n = (v: number) => v.toLocaleString("en-US");

const FACETS: VaultRosterFacet[] = [
  {
    id: "network",
    label: "Network",
    valueOf: (v) => String(v.chainId),
    labelOf: (c) => chainName(Number(c)),
  },
  {
    id: "protocol",
    label: "Protocol",
    valueOf: (v) => vaultIndexProtocol(v),
    labelOf: (p) => VAULT_INDEX_PROTOCOL_LABEL[p as keyof typeof VAULT_INDEX_PROTOCOL_LABEL] ?? p,
    order: VAULT_INDEX_PROTOCOLS,
  },
];

// One token across chains: USDC on Base and USDC on Ethereum are one option.
// An asset whose symbol did not decode is an option by address.
const TOKEN_FACET: VaultRosterFacet = {
  id: "asset",
  label: "Token",
  valueOf: (v) => (v.asset.named ? v.asset.symbol : v.asset.address),
  labelOf: (s) => s,
};

/** The count sentence's receipt for one roster: the roster's. */
function rosterCountProv(r: VaultIndexRoster): Provenance {
  const coords = { blockNumber: r.blockNumber || undefined };
  const c = r.catalog;
  switch (r.protocol) {
    case "morpho":
      return vaultDirectoryCensusProv(coords, { catalogSize: c.catalogSize, censusBlock: c.censusBlock ?? 0 });
    case "aave":
      return aaveVaultCatalogueProv(coords, {
        catalogSize: c.catalogSize,
        stataCount: c.stataCount ?? 0,
        stakeCount: c.stakeCount ?? 0,
      });
    case "yearn":
      return yearnRosterCensusProv(coords, { catalogSize: c.catalogSize, censusBlock: c.censusBlock ?? 0 });
    case "maple":
      return maplePoolCountProv(r.count, r.blockNumber);
  }
}

export function VaultIndexView({
  vaults,
  yields,
  rosters,
}: {
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  rosters: VaultIndexRoster[];
}) {
  const blockOf = (v: VaultSummary) =>
    rosters.find((r) => r.protocol === vaultIndexProtocol(v))?.blockNumber || undefined;

  const receiptsOf = (v: VaultSummary): VaultRowReceipts => {
    const blockNumber = blockOf(v);
    const vaultName = vaultDisplayName(v) ?? undefined;
    switch (vaultIndexProtocol(v)) {
      case "morpho": {
        const c = { blockNumber, vault: v.address, vaultName, assetSymbol: v.asset.symbol };
        return {
          name: vaultDirectoryNameProv(c),
          totalAssets: vaultDirectoryTotalAssetsProv(c),
          sharePrice: vaultDirectorySharePriceProv(c),
        };
      }
      case "aave": {
        const family = v.family as AaveVaultFamily;
        const c = {
          blockNumber,
          vault: v.address,
          vaultName,
          assetSymbol: v.asset.symbol,
          shareSymbol: v.symbol ?? undefined,
        };
        const att = aaveVaultAttestation(v.address, family);
        return {
          name: aaveVaultNameProv(c, att),
          totalAssets: aaveVaultTotalAssetsProv(c, family),
          sharePrice: v.shareDecimals != null ? aaveVaultSharePriceProv(c, v.shareDecimals) : undefined,
          standing: { "address-book": aaveVaultBookProv(c, att) },
        };
      }
      case "yearn": {
        const c = {
          blockNumber,
          vault: v.address,
          vaultName,
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
      case "maple":
        return {
          totalAssets: poolTotalAssetsProv(v.asset.symbol, blockNumber),
          sharePrice: poolNavRateProv(v.asset.symbol, v.symbol ?? "pool", blockNumber),
        };
    }
  };

  const registry = useReceiptRegistry();
  const total = vaults.length;

  // One line per roster: its protocol, linked to the roster, its chain and
  // the block its figures were read at.
  const readAt = (
    <p className="flex flex-col gap-0.5" data-prov-exempt>
      {rosters.map((r) => (
        <span
          key={r.protocol}
          className="flex flex-wrap items-center gap-x-1"
          data-index-roster={r.protocol}
          data-index-chain={r.chainId}
          data-index-block={r.blockNumber}
          data-directory-block={r.chainStale ? undefined : r.blockNumber}
        >
          <Link href={vaultIndexRosterHref(r.protocol)} className={PAGE_LINK} prefetch={false}>
            {VAULT_INDEX_PROTOCOL_LABEL[r.protocol]}
          </Link>
          <span>on {chainName(r.chainId)}</span>
          {r.chainStale ? (
            <span>not read</span>
          ) : (
            <>
              <span>at</span>
              <BlockRef block={r.blockNumber} chainId={r.chainId} />
            </>
          )}
        </span>
      ))}
    </p>
  );

  const counts = rosters.filter((r) => !r.chainStale);
  const drawer = (
    <p data-index-counts={total}>
      Every vault the rosters list:{" "}
      {counts.map((r, i) => (
        <span key={r.protocol} data-index-count={r.protocol} data-count={r.count}>
          {i > 0 && ", "}
          {VAULT_INDEX_PROTOCOL_LABEL[r.protocol]} <Prov info={rosterCountProv(r)}>{n(r.count)}</Prov>
        </span>
      ))}
      ; each row opens under its protocol.
    </p>
  );

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultRoster
        vaults={vaults}
        yields={yields}
        chainId={MAINNET_CHAIN_ID as ChainId}
        blockNumber={0}
        chainStale={rosters.every((r) => r.chainStale)}
        skel="index"
        facets={FACETS}
        assetFacet={TOKEN_FACET}
        hrefOf={vaultIndexHref}
        holdersHrefOf={vaultIndexHoldersHref}
        receiptsOf={receiptsOf}
        chainOf={(v) => chainName(v.chainId)}
        yieldKeyOf={vaultIndexKey}
        hooksOf={(v) => ({
          "data-protocol": vaultIndexProtocol(v),
          "data-chain": String(v.chainId),
          "data-family": v.family,
        })}
        groupCountProv={(assetSymbol, count, chainId) =>
          vaultIndexGroupCountProv(assetSymbol, chainName(chainId), count)
        }
        emptyCountProv={(count) => vaultIndexEmptyCountProv(count, total)}
        head={{
          census: null,
          censusFigure: "index-census",
          listingHref: null,
          infoHref: null,
          indexHref: null,
          readAt,
          drawer,
        }}
      />
    </ProvReceiptsScope>
  );
}
