// Each family's columns for Configuration and addresses (V12,
// components/vaults/vault-config.tsx): what the family's page already reads,
// at the card's block, each value with its receipt. MetaMorpho: the fee, the
// roles and the contracts (lib/vaults/config-read.ts and the card's read).
// Aave: the kind, the Umbrella owner, the wrapper's aToken and Pool, the
// reserve a stake covers (lib/sources/chain/aave-ethereum-vault.ts). Yearn:
// the release, the creation block, the role manager and accountant, the
// factory and the Registry (lib/sources/chain/yearn-ethereum-vault.ts).

import { Prov } from "@/components/shared/provenance";
import type { ReadContract } from "@/components/shared/read-stamp";
import { networkEntry, type ConfigColumn } from "@/components/vaults/vault-config";
import { formatDate } from "@/lib/date";
import type { ChainId } from "@/lib/shared/chains";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { AssetScale } from "@/lib/vaults/asset-scale-words";
import type { VaultConfig } from "@/lib/vaults/config-read";
import {
  configCallProv,
  configCreatedProv,
  configFeeProv,
  configReleaseProv,
  configVaultProv,
  configWrapsProv,
  type ConfigCoords,
  type VaultCreation,
} from "@/lib/vaults/config-provenance";
import {
  aaveUmbrellaOwnerProv,
  aaveVaultATokenProv,
  aaveVaultCatalogueMemberProv,
  aaveVaultReserveHopProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import type { AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import { yearnVaultEndorsedProv, yearnVaultRoleProv, type YearnVaultCoords } from "@/lib/yearn/vault-provenance";
import type { YearnVaultResponse } from "@/lib/sources/chain/yearn-ethereum-vault";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";

const n = (v: number) => v.toLocaleString("en-US");

/** A WAD fraction as a percentage, to two places. */
function wadPct(raw: string): string {
  const bp = Number((BigInt(raw) * BigInt(1_000_000)) / BigInt(10) ** BigInt(18)) / 10_000;
  return `${bp.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** What a family passes to `VaultConfiguration` besides the chain, vault and block. */
export interface ConfigTile {
  stampWhat: string;
  stampContracts: ReadContract[];
  columns: ConfigColumn[];
}

/** The Created row, from the factory's creation log and its block's time. */
function createdEntry(
  created: VaultCreation | null,
  createdBlock: number,
  at: number | null,
): ConfigColumn["entries"][0] {
  return {
    kind: "fact",
    id: "created",
    label: "Created",
    tip: "The date of the block the vault was deployed in.",
    value: created && at ? <Prov info={configCreatedProv(created)}>{formatDate(new Date(at * 1000))}</Prov> : null,
    sub: created ? (
      <>
        block <Prov info={configCreatedProv(created)}>{n(createdBlock)}</Prov>
      </>
    ) : undefined,
  };
}

// ── MetaMorpho ─────────────────────────────────────────────────────────────

export function metaMorphoConfigTile({
  chainId,
  vault,
  vaultName,
  release,
  factory,
  createdBlock,
  asset,
  assetScale,
  morpho,
  owner,
  curator,
  block,
  readBy,
  config,
}: {
  chainId: 1 | 8453;
  vault: string;
  vaultName: string;
  /** "MetaMorpho V1.1". */
  release: string;
  /** The factory that made the vault, from the catalogue. */
  factory: string | null;
  createdBlock: number;
  asset: { address: string; symbol: string };
  /** What the asset wraps, where its decimals disagree. */
  assetScale?: AssetScale;
  /** `MORPHO()`, at `block`. */
  morpho: string;
  /** `owner()` and `curator()`, at `block`. */
  owner: string;
  curator: string | null;
  block: number;
  readBy?: ServerRead | null;
  config: VaultConfig;
}): ConfigTile {
  const card: ConfigCoords = { chainId, vault, vaultName, block, readBy };
  const own: ConfigCoords | null =
    config.block != null ? { chainId, vault, vaultName, block: config.block, readBy: config.readBy } : null;
  const created: VaultCreation | null =
    createdBlock > 0
      ? {
          chainId,
          vault,
          vaultName,
          release,
          log: "CreateMetaMorpho",
          factory,
          block: createdBlock,
          at: config.createdAt,
        }
      : null;
  const role = (c: ConfigCoords, label: string, call: string, what: string) => (a: string) =>
    configCallProv(c, { label, call, answer: a, what });

  return {
    stampWhat: "The fee, the roles and the contracts",
    stampContracts: [
      {
        name: vaultName,
        address: vault,
        reads: "fee(), feeRecipient(), guardian(), owner(), curator(), asset(), MORPHO()",
      },
    ],
    columns: [
      {
        title: "Configuration",
        entries: [
          networkEntry(chainId),
          {
            kind: "fact",
            id: "version",
            label: "Version",
            tip: "The MetaMorpho factory release that deployed the vault.",
            value: created ? <Prov info={configReleaseProv(created)}>{release}</Prov> : release,
          },
          createdEntry(created, createdBlock, config.createdAt),
          {
            kind: "fact",
            id: "fee",
            label: "Performance fee",
            tip: "The share of the interest the vault earns that it pays to the fee recipient, as new shares. Read from fee(), a fraction of 10^18.",
            value:
              own && config.fee != null ? (
                <span data-fee-raw={config.fee}>
                  <Prov info={configFeeProv(own, config.fee, wadPct(config.fee))}>{wadPct(config.fee)}</Prov>
                </span>
              ) : null,
          },
          {
            kind: "address",
            hook: "fact",
            id: "fee-recipient",
            label: "Fee recipient",
            tip: "The address the performance fee's new shares go to. Read from feeRecipient().",
            address: own ? config.feeRecipient : null,
            read: own != null,
            prov: role(
              own ?? card,
              "Fee recipient",
              "feeRecipient()",
              "The performance fee's new shares are minted to it.",
            ),
          },
        ],
      },
      {
        title: "Roles",
        entries: [
          {
            kind: "address",
            id: "owner",
            label: "Owner",
            note: "sets the curator, the guardian and the fee",
            address: owner,
            prov: role(card, "Owner", "owner()", "It sets the curator, the guardian and the fee."),
          },
          {
            kind: "address",
            id: "curator",
            label: "Curator",
            note: "chooses the markets and their caps",
            address: curator,
            prov: role(card, "Curator", "curator()", "It chooses the markets and their caps."),
          },
          {
            kind: "address",
            id: "guardian",
            label: "Guardian",
            note: "can cancel a change while it waits",
            address: config.guardian,
            read: own != null,
            prov: role(own ?? card, "Guardian", "guardian()", "It can cancel a change while the timelock runs."),
          },
        ],
        foot: "Allocators are not listed here.",
      },
      {
        title: "Contracts",
        entries: [
          {
            kind: "address",
            id: "vault",
            label: "Vault",
            tip: "The MetaMorpho contract that holds the deposits and issues the shares.",
            sub: vaultName,
            address: vault,
            prov: () =>
              created
                ? configVaultProv(created)
                : configCallProv(card, {
                    label: "Vault",
                    call: "name()",
                    answer: vaultName,
                    what: "The contract every figure on this page is read from.",
                  }),
          },
          {
            kind: "address",
            id: "asset",
            label: "Asset",
            tip: "The token the vault takes in deposits and lends out.",
            sub: asset.symbol,
            address: asset.address,
            prov: role(card, "Asset", "asset()", `The token the vault takes in deposits and lends: ${asset.symbol}.`),
          },
          ...(assetScale
            ? [
                {
                  kind: "address" as const,
                  id: "wraps",
                  label: "What the asset wraps",
                  tip: "The token the asset holds underneath.",
                  sub: `${assetScale.wraps.symbol}, ${asset.symbol}'s asset(), ${assetScale.wraps.decimals} decimals`,
                  address: assetScale.wraps.address,
                  prov: () => configWrapsProv(chainId, asset, assetScale.wraps),
                },
              ]
            : []),
          {
            kind: "address",
            id: "morpho-blue",
            label: "Morpho Blue",
            tip: "The Morpho Blue contract the vault supplies to; every market it lends in lives there.",
            note: "the lending protocol",
            address: morpho,
            prov: role(card, "Morpho Blue", "MORPHO()", "The Morpho Blue contract the vault supplies to."),
          },
        ],
      },
    ],
  };
}

// ── Aave ───────────────────────────────────────────────────────────────────

export function aaveConfigTile({
  data,
  coords,
  kind,
}: {
  data: AaveEthereumVaultResponse;
  coords: AaveVaultCoords;
  /** The family as the pill reads it: "Static aToken". */
  kind: string;
}): ConfigTile {
  const { vault } = data;
  const vaultName = vault.name ?? vault.symbol ?? "the vault";
  const card: ConfigCoords = {
    chainId: 1,
    vault: vault.address,
    vaultName,
    block: data.blockNumber,
    readBy: coords.readBy,
  };
  const call = (label: string, fn: string, what: string) => (a: string) =>
    configCallProv(card, { label, call: fn, answer: a, what });
  const s = data.stata;
  const u = data.umbrella;
  const reads = ["asset()", ...(s ? ["aToken()", "POOL()", "rewardTokens()"] : []), ...(u ? ["owner()"] : [])].join(
    ", ",
  );

  return {
    stampWhat: "The kind, the roles and the contracts",
    stampContracts: [{ name: vaultName, address: vault.address, reads }],
    columns: [
      {
        title: "Configuration",
        entries: [
          networkEntry(1),
          {
            kind: "fact",
            id: "kind",
            label: "Kind",
            tip: "Which of Aave's vault contracts this is: the enumerator that returned its address says so.",
            value: <Prov info={aaveVaultCatalogueMemberProv(coords, "This vault")}>{kind}</Prov>,
          },
          ...(s
            ? [
                {
                  kind: "fact" as const,
                  id: "reward-tokens",
                  label: "Reward tokens",
                  tip: "The incentive tokens the wrapper claims for its holders, outside the share. Read from rewardTokens().",
                  value:
                    s.rewardTokens == null ? null : (
                      <Prov
                        info={configCallProv(card, {
                          label: "Reward tokens",
                          call: "rewardTokens()",
                          answer: s.rewardTokens.length ? s.rewardTokens.join(", ") : "an empty list",
                          what: "The incentive tokens the wrapper claims for its holders.",
                        })}
                      >
                        {s.rewardTokens.length ? n(s.rewardTokens.length) : "none"}
                      </Prov>
                    ),
                },
              ]
            : []),
        ],
      },
      {
        title: "Roles",
        entries: u
          ? [
              {
                kind: "address",
                id: "owner",
                label: "Owner",
                note: "can slash the stake to cover a deficit",
                address: u.owner,
                read: u.owner != null,
                prov: (a) => aaveUmbrellaOwnerProv(coords, a),
              },
            ]
          : [],
      },
      {
        title: "Contracts",
        entries: [
          {
            kind: "address",
            id: "vault",
            label: "Vault",
            tip: "The contract that holds the deposits and issues the shares.",
            sub: vaultName,
            address: vault.address,
            prov: call("Vault", "name()", "The contract every figure on this page is read from."),
          },
          {
            kind: "address",
            id: "asset",
            label: "Asset",
            tip: "The token the vault takes in deposits.",
            sub: vault.asset.symbol,
            address: vault.asset.address,
            prov: call("Asset", "asset()", `The token the vault takes in deposits: ${vault.asset.symbol}.`),
          },
          ...(s
            ? [
                {
                  kind: "address" as const,
                  id: "atoken",
                  label: "aToken",
                  tip: "The aToken the wrapper holds: a supply position in the Aave V3 Core market.",
                  sub: `a${vault.asset.symbol}`,
                  address: s.aToken,
                  read: s.aToken != null,
                  prov: () => aaveVaultATokenProv(coords),
                },
                {
                  kind: "address" as const,
                  id: "pool",
                  label: "Aave V3 Pool",
                  tip: "The Pool the wrapper names, where it supplies its asset.",
                  note: "the lending protocol",
                  address: s.pool,
                  read: s.pool != null,
                  prov: call("Aave V3 Pool", "POOL()", "The Aave V3 Pool the wrapper supplies to."),
                },
              ]
            : []),
          ...(u
            ? [
                {
                  kind: "address" as const,
                  id: "reserve",
                  label: "Reserve covered",
                  tip: "The Aave V3 reserve this stake stands behind.",
                  sub: u.reserve?.symbol,
                  address: u.reserve?.address ?? null,
                  read: u.reserve != null,
                  prov: () => aaveVaultReserveHopProv(coords, u.reserve?.symbol ?? "the reserve"),
                },
              ]
            : []),
        ],
      },
    ],
  };
}

// ── Yearn V3 ───────────────────────────────────────────────────────────────

export function yearnConfigTile({
  data,
  coords,
  release,
  createdAt,
}: {
  data: YearnVaultResponse;
  coords: YearnVaultCoords;
  /** "Yearn V3 3.0.4". */
  release: string;
  /** The creation block's time, seconds; null until read. */
  createdAt: number | null;
}): ConfigTile {
  const y = data.vault;
  const chainId: ChainId = 1;
  const vaultName = y.name ?? y.censusName;
  const card: ConfigCoords = { chainId, vault: y.address, vaultName, block: data.blockNumber, readBy: coords.readBy };
  const call = (label: string, fn: string, what: string) => (a: string) =>
    configCallProv(card, { label, call: fn, answer: a, what });
  const created: VaultCreation | null =
    y.createdBlock > 0
      ? {
          chainId,
          vault: y.address,
          vaultName,
          release,
          log: "NewVault",
          factory: y.factory,
          block: y.createdBlock,
          at: createdAt,
        }
      : null;

  return {
    stampWhat: "The release, the roles and the contracts",
    stampContracts: [
      { name: vaultName, address: y.address, reads: "apiVersion(), asset(), role_manager(), accountant()" },
      { name: "Yearn V3 Registry", address: YEARN_REGISTRY, reads: "isEndorsed(vault)" },
    ],
    columns: [
      {
        title: "Configuration",
        entries: [
          networkEntry(chainId),
          {
            kind: "fact",
            id: "version",
            label: "Version",
            tip: "The Yearn V3 release the vault runs: its apiVersion(), from the factory that deployed it.",
            value: created ? <Prov info={configReleaseProv(created)}>{release}</Prov> : release,
          },
          createdEntry(created, y.createdBlock, createdAt),
        ],
      },
      {
        title: "Roles",
        entries: [
          {
            kind: "address",
            id: "role-manager",
            label: "Role manager",
            note: "adds strategies, sets their caps and can shut the vault down",
            address: y.roleManager,
            read: y.roleManager != null,
            prov: () => yearnVaultRoleProv(coords, "role manager"),
          },
          {
            kind: "address",
            id: "accountant",
            label: "Accountant",
            note: "charges the vault's fees when a strategy reports",
            address: y.accountant,
            prov: () => yearnVaultRoleProv(coords, "accountant"),
          },
        ],
      },
      {
        title: "Contracts",
        entries: [
          {
            kind: "address",
            id: "vault",
            label: "Vault",
            tip: "The Yearn V3 contract that holds the deposits and issues the shares.",
            sub: vaultName,
            address: y.address,
            prov: () =>
              created
                ? configVaultProv(created)
                : configCallProv(card, {
                    label: "Vault",
                    call: "name()",
                    answer: vaultName,
                    what: "The contract every figure on this page is read from.",
                  }),
          },
          {
            kind: "address",
            id: "asset",
            label: "Asset",
            tip: "The token the vault takes in deposits and lends to its strategies.",
            sub: y.asset.symbol,
            address: y.asset.address,
            prov: call("Asset", "asset()", `The token the vault takes in deposits: ${y.asset.symbol}.`),
          },
          ...(created
            ? [
                {
                  kind: "address" as const,
                  id: "factory",
                  label: "Factory",
                  tip: "The Yearn V3 factory that deployed the vault.",
                  sub: release,
                  address: y.factory,
                  prov: () => configReleaseProv(created),
                },
              ]
            : []),
          ...(y.endorsed != null
            ? [
                {
                  kind: "address" as const,
                  id: "registry",
                  label: "Yearn V3 Registry",
                  tip: "Yearn's list of the vaults it endorses.",
                  note: y.endorsed ? "endorses this vault" : "does not endorse this vault",
                  address: YEARN_REGISTRY,
                  prov: () => yearnVaultEndorsedProv(coords, y.endorsed === true),
                },
              ]
            : []),
        ],
      },
    ],
  };
}
