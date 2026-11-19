// The IPOR Fusion receipts: the roster (which vaults the factory made, and what
// each holds at one block) and one vault's factsheet (rails-ops
// TO-DO-ipor-scoping §6.3). A sibling of lib/yearn/vault-provenance.ts.
//
// Distance classes:
//   • state   — a call answered at the pinned block, on the vault, its access
//     manager or the Fuse Whitelist. Re-run the eth_call at that block on any
//     archive node.
//   • emitted — the census's creation events, and the access manager's
//     `RoleGranted` logs a role holder is found from.
//   • derived — counts over the reads.
// No USD: every amount is in the vault's asset or in shares.

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance } from "@/components/shared/provenance";
import { chainMeta } from "@/lib/shared/chains";
import { IPOR_ROLES } from "@/lib/ipor-fusion/addresses";

export interface IporFusionCoords {
  chainId: number;
  readBy?: ServerRead | null;
  blockNumber?: number;
  vault?: string;
  vaultName?: string;
  assetSymbol?: string;
}

const n = (v: number) => v.toLocaleString("en-US");
const chainName = (c: IporFusionCoords) => chainMeta(c.chainId as never).name;
const lane = (c: IporFusionCoords) => `live ${chainName(c)} chain reads (IPOR Fusion vaults)`;
const atBlock = (c: IporFusionCoords) => (c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : "");
const asset = (c: IporFusionCoords) => c.assetSymbol ?? "the vault's asset";
const vaultContract = (c: IporFusionCoords): Provenance["contract"] => ({
  name: c.vaultName ? `IPOR Fusion vault ${c.vaultName}` : "IPOR Fusion vault",
  address: c.vault,
});
const recompute = (c: IporFusionCoords, call: string, on?: string): Provenance["verify"] => ({
  kind: "recompute",
  text: `To check: ask any ${chainName(c)} archive node for ${call} on ${on ?? c.vault ?? "the vault"}${atBlock(c)}.`,
});

/** One call on the vault at the pinned block. */
const vaultCallProv_ = (c: IporFusionCoords, { label, call, what }: { label: string; call: string; what: string }) =>
  ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute(c, call),
    summary: `${label} — ${what}`,
    contract: vaultContract(c),
    via: `${lane(c)} · PlasmaVault.${call} @ the pinned block`,
  }) satisfies Provenance;

const iporRosterCensusProv_ = (
  c: IporFusionCoords,
  census: { catalogSize: number; censusBlock: number; factory: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: census.censusBlock },
  verify: {
    kind: "recompute",
    text: `To check: read the FusionInstanceCreated logs of the factory proxy ${census.factory} on ${chainName(c)} up to block ${n(census.censusBlock)}, decoding both of its event signatures, and count the vaults; getFusionFactoryIndex() at that block answers the same count.`,
  },
  summary: `Vaults catalogued — ${n(census.catalogSize)}: every vault the IPOR Fusion factory had made on ${chainName(c)} at block ${n(census.censusBlock)}, each named by its creation event. The factory is open to anyone, so a vault on this list is not one IPOR curates. The list is a floor: a vault deployed by hand, or by an earlier factory, emits no such event and is absent, and a vault made since that block joins when the census runs again.`,
  via: `${lane(c)} · FusionInstanceCreated on the factory proxy, censused to block ${n(census.censusBlock)}`,
  formula: "count of FusionInstanceCreated logs up to the census block",
});

const iporEmptyCountProv_ = (c: IporFusionCoords, count: number, total: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(c, "totalAssets() on each vault", "every vault in the roster"),
  summary: `Empty vaults — ${n(count)} of ${n(total)} answered zero to totalAssets()${atBlock(c)}. A vault never funded and one whose holders have all left read the same.`,
  via: `${lane(c)} · PlasmaVault.totalAssets() on each vault @ the pinned block`,
  formula: "count of vaults with totalAssets() = 0",
});

const iporVaultNameProv_ = (c: IporFusionCoords) =>
  vaultCallProv_(c, {
    label: "Vault name",
    call: "name()",
    what: `the name of the vault's share token${atBlock(c)}, as the contract answers it. Anyone can deploy from the factory and name a vault anything, so the address beside the name identifies it.`,
  });

const iporVaultTotalAssetsProv_ = (c: IporFusionCoords) =>
  vaultCallProv_(c, {
    label: "Total assets",
    call: "totalAssets()",
    what: `what the vault holds${atBlock(c)}, in ${asset(c)}: the asset in the vault, plus the balance its markets' balance fuses last booked, plus any rewards its rewards manager holds. The market balances are stored when the vault last updated them, so they can trail the markets. The management fee not yet taken is not deducted; the share price is. A zero is a reading: the vault holds nothing at this block.`,
  });

const iporVaultTotalSupplyProv_ = (c: IporFusionCoords) =>
  vaultCallProv_(c, {
    label: "Shares issued",
    call: "totalSupply()",
    what: `every share of the vault in existence${atBlock(c)}.`,
  });

const iporVaultSharePriceProv_ = (c: IporFusionCoords, shareDecimals: number) =>
  vaultCallProv_(c, {
    label: "Share price",
    call: `convertToAssets(10 ** ${shareDecimals})`,
    what: `what one whole share converts to${atBlock(c)}, in ${asset(c)}, as the vault answers it. A share has ${shareDecimals} decimals: the vault adds an offset to its asset's.`,
  });

const iporVaultSupplyCapProv_ = (c: IporFusionCoords) =>
  vaultCallProv_(c, {
    label: "Supply cap",
    call: "getTotalSupplyCap()",
    what: `the most shares the vault may issue${atBlock(c)}, in shares. A deposit that would pass it is refused.`,
  });

const iporVaultFeeProv_ = (c: IporFusionCoords, which: "performance" | "management", bps: number) =>
  vaultCallProv_(c, {
    label: which === "performance" ? "Performance fee" : "Management fee",
    call: which === "performance" ? "getPerformanceFeeData()" : "getManagementFeeData()",
    what:
      which === "performance"
        ? `${n(bps)} basis points${atBlock(c)}: the share of a gain in the share price the vault mints to its fee account as new shares.`
        : `${n(bps)} basis points a year${atBlock(c)}: a charge on total assets that accrues with time and is minted to the fee account as new shares.`,
  });

const iporVaultAddressProv_ = (
  c: IporFusionCoords,
  { label, call, what }: { label: string; call: string; what: string },
) => vaultCallProv_(c, { label, call, what });

/** A fuse's entry in the IPOR DAO's Fuse Whitelist at the pinned block. */
const iporFuseStateProv_ = (
  c: IporFusionCoords,
  f: { address: string; state: string | null; type: string | null },
  whitelist: string,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(c, `getFuseByAddress(${f.address})`, `the Fuse Whitelist ${whitelist}`),
  summary: f.type
    ? `Fuse — ${f.type}, ${f.state ?? "state unread"} in the IPOR DAO's Fuse Whitelist${atBlock(c)}. The vault can call it through execute(); the whitelist's state is IPOR's register, which a vault does not have to follow.`
    : `Fuse — not listed in the IPOR DAO's Fuse Whitelist${atBlock(c)}: the whitelist answers no type for it. The whitelist is a register: the vault's Atomist chose its fuses, and the vault can call this one.`,
  contract: { name: "IPOR Fusion Fuse Whitelist", address: whitelist },
  via: `${lane(c)} · PlasmaVault.getFuses() · FuseWhitelist.getFuseByAddress(fuse), getFuseStates(), getFuseTypes() @ the pinned block`,
});

/** One role holder: found in the access manager's logs, confirmed at the block. */
const iporRoleProv_ = (
  c: IporFusionCoords,
  r: { roleId: string; account: string; accessManager: string; fromBlock: number; toBlock: number; lane: string },
): Provenance => {
  const role = IPOR_ROLES[r.roleId];
  const name = role ? `${role.word ? `${role.word} (${role.constant})` : role.constant}` : `role ${r.roleId}`;
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: `To check: read the RoleGranted logs of the access manager ${r.accessManager} from block ${n(r.fromBlock)} to ${n(r.toBlock)}, then ask any ${chainName(c)} archive node for hasRole(${r.roleId}, ${r.account}) on it${atBlock(c)}.`,
    },
    summary: `${name}, role ${r.roleId} — ${r.account} holds it${atBlock(c)}: the access manager answers hasRole true. The address was found in its RoleGranted logs from the vault's creation at block ${n(r.fromBlock)} to block ${n(r.toBlock)}; the access manager keeps no list of a role's holders, so its grants are read from the logs up to the page's block.`,
    contract: { name: "IporFusionAccessManager", address: r.accessManager },
    via: `${lane(c)} · RoleGranted logs on ${r.lane} · IporFusionAccessManager.hasRole(role, account) @ the pinned block`,
  };
};

/** A steward role no address holds at the block. */
const iporRoleNoneProv_ = (
  c: IporFusionCoords,
  r: { roleId: string; accessManager: string; fromBlock: number; toBlock: number; lane: string },
): Provenance => {
  const role = IPOR_ROLES[r.roleId];
  const name = role ? `${role.word ? `${role.word} (${role.constant})` : role.constant}` : `role ${r.roleId}`;
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: `To check: read the RoleGranted logs of the access manager ${r.accessManager} from block ${n(r.fromBlock)} to ${n(r.toBlock)}, then ask any ${chainName(c)} archive node for hasRole(${r.roleId}, account) on it${atBlock(c)} for each account they name.`,
    },
    summary: `${name}, role ${r.roleId} — no address holds it${atBlock(c)}: no account the access manager's RoleGranted logs name from block ${n(r.fromBlock)} to ${n(r.toBlock)} answers hasRole true for it.`,
    contract: { name: "IporFusionAccessManager", address: r.accessManager },
    via: `${lane(c)} · RoleGranted logs on ${r.lane} · IporFusionAccessManager.hasRole(role, account) @ the pinned block`,
  };
};

/** One market's booked balance, `totalAssetsInMarket(id)`. */
const iporMarketBalanceProv_ = (c: IporFusionCoords, m: { id: string; constant: string | null }) =>
  vaultCallProv_(c, {
    label: m.constant ? `Market ${m.id} (${m.constant})` : `Market ${m.id}`,
    call: `totalAssetsInMarket(${m.id})`,
    what: `the vault's balance in this market${atBlock(c)}, in ${asset(c)}, as its balance fuse last booked it. The vault stores it when it acts in the market or updates its balances, so it can trail the market.`,
  });

/** One market's grants, `getMarketSubstrates(id)`, as the row decodes them. */
const iporMarketSubstratesProv_ = (c: IporFusionCoords, m: { id: string; constant: string | null; decoder: string }) =>
  vaultCallProv_(c, {
    label: m.constant ? `Market ${m.id} (${m.constant})` : `Market ${m.id}`,
    call: `getMarketSubstrates(${m.id})`,
    what: `what the vault may use in this market${atBlock(c)}: each bytes32 grant ${m.decoder}.`,
  });

/** The asset in the vault, `asset.balanceOf(vault)`. */
const iporInVaultProv_ = (c: IporFusionCoords, assetAddress: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(c, `balanceOf(${c.vault ?? "the vault"})`, `the asset ${assetAddress}`),
  summary: `In the vault — the ${asset(c)} the vault contract holds${atBlock(c)}, outside every market.`,
  contract: { name: asset(c), address: assetAddress },
  via: `${lane(c)} · ERC20.balanceOf(vault) @ the pinned block`,
});

/** The rewards claim manager's balance, which totalAssets() counts. */
const iporRewardsProv_ = (c: IporFusionCoords, manager: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(c, "balanceOf()", `the rewards claim manager ${manager}`),
  summary: `Rewards manager — the ${asset(c)} the vault's rewards claim manager holds${atBlock(c)}, which the vault's totalAssets() counts.`,
  contract: { name: "RewardsClaimManager", address: manager },
  via: `${lane(c)} · PlasmaVault.getRewardsClaimManagerAddress() · RewardsClaimManager.balanceOf() @ the pinned block`,
});

/** The rows' sum against totalAssets(), where they differ. */
const iporMarketsGapProv_ = (c: IporFusionCoords, f: { total: string; summed: string; gap: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(
    c,
    "totalAssets(), totalAssetsInMarket(id) for each active market, and the asset's balanceOf(vault)",
  ),
  summary: `Not in a row — totalAssets() answers ${f.total} ${asset(c)}${atBlock(c)} and the rows above sum to ${f.summed}, a difference of ${f.gap}. The rows are the asset in the vault, the rewards manager and each active market's booked balance; a balance fuse that values a market differently from its booked figure, or a market outside getActiveMarketsInBalanceFuses(), lands here.`,
  contract: vaultContract(c),
  via: `${lane(c)} · totalAssets() less the rows @ the pinned block`,
  formula: "totalAssets() − (in the vault + rewards manager + Σ totalAssetsInMarket)",
});

export const iporRosterCensusProv = withServerRead(iporRosterCensusProv_);
export const iporMarketBalanceProv = withServerRead(iporMarketBalanceProv_);
export const iporMarketSubstratesProv = withServerRead(iporMarketSubstratesProv_);
export const iporInVaultProv = withServerRead(iporInVaultProv_);
export const iporRewardsProv = withServerRead(iporRewardsProv_);
export const iporMarketsGapProv = withServerRead(iporMarketsGapProv_);
export const iporRoleNoneProv = withServerRead(iporRoleNoneProv_);
export const iporEmptyCountProv = withServerRead(iporEmptyCountProv_);
export const iporVaultNameProv = withServerRead(iporVaultNameProv_);
export const iporVaultTotalAssetsProv = withServerRead(iporVaultTotalAssetsProv_);
export const iporVaultTotalSupplyProv = withServerRead(iporVaultTotalSupplyProv_);
export const iporVaultSharePriceProv = withServerRead(iporVaultSharePriceProv_);
export const iporVaultSupplyCapProv = withServerRead(iporVaultSupplyCapProv_);
export const iporVaultFeeProv = withServerRead(iporVaultFeeProv_);
export const iporVaultAddressProv = withServerRead(iporVaultAddressProv_);
export const iporFuseStateProv = withServerRead(iporFuseStateProv_);
export const iporRoleProv = withServerRead(iporRoleProv_);
