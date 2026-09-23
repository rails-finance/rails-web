// The Yearn V3 roster receipts — one pinned block's reading of every vault the
// V3 factories made on Ethereum.
// ----------------------------------------------------------------------------
// A sibling of lib/morpho-base/vault-provenance.ts for a different venue. That
// vocabulary traces a MetaMorpho vault and a holder's slice of it; this one
// traces the ROSTER: which contracts are in it, what each holds at the block,
// and which of them Yearn endorses at that same block.
//
// Distance classes, graded as the ladder does:
//   • state   — a slot read at the pinned block: a vault's `name()`,
//     `totalAssets()`, `convertToAssets()`, `isShutdown()`, and the Registry's
//     `isEndorsed(vault)`. Third-party verifiable: re-run the eth_call at that
//     block against any archive node.
//   • derived — arithmetic over such reads: how many vaults in an asset hold
//     something, how many hold nothing.
// No oracle class and no USD anywhere. The roster spans 72 distinct assets and
// this page reads no feed for any of them, so every figure is a quantity of one
// vault's asset and two assets are never added or ordered together.
//
// THREE THINGS THESE RECEIPTS MUST KEEP STRAIGHT:
//
//  1. THE ROSTER IS A FLOOR. It is every vault the five V3 factories emitted a
//     `NewVault` log for, up to the census block. `VaultV3` is a contract anyone
//     can deploy directly, and one deployed without a factory emits no log at
//     all, so no enumeration finds it. The census receipt says this before any
//     count is read.
//  2. ENDORSEMENT IS A READING AT A BLOCK. `Registry.isEndorsed(vault)` can go
//     from true to false when Yearn removes an endorsement, so every receipt
//     that states it states the block with it (rails-ops decision 0027 point 5).
//     An unread answer is neither true nor false and gets no badge.
//  3. THE NAME IS A READING TOO. 3.0.4 and 3.1.0 vaults answer `setName`, and
//     four names on this roster are each carried by three different vaults. The
//     name receipt says the address beside it is what tells them apart.

import type { Provenance } from "@/components/shared/provenance";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";

const LANE = "live Ethereum chain reads (/ethereum/yearn/vaults)";

export interface YearnVaultCoords {
  /** The block every figure was read at — every receipt's `source` block. */
  blockNumber?: number;
  /** The vault contract — the `contract` on every vault-side receipt. */
  vault?: string;
  /** The vault's name at that block, for prose. */
  vaultName?: string;
  /** The ERC-4626 underlying's symbol — the unit every asset figure speaks in. */
  assetSymbol?: string;
  /** The vault's `apiVersion()`, which is the release its factory stamps. */
  apiVersion?: string;
}

const n = (v: number) => v.toLocaleString("en-US");

const vaultContract = (c: YearnVaultCoords): Provenance["contract"] => ({
  name: c.vaultName ? `Yearn V3 vault ${c.vaultName}` : "Yearn V3 vault",
  address: c.vault,
});

const registryContract: Provenance["contract"] = { name: "Yearn V3 Registry", address: YEARN_REGISTRY };

const atBlock = (c: YearnVaultCoords): string => (c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : "");

const recompute = (call: string, c: YearnVaultCoords): Provenance["verify"] => ({
  kind: "recompute",
  text: `Call ${call} on ${c.vault ?? "the vault"}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""} against any archive node`,
});

const asset = (c: YearnVaultCoords) => c.assetSymbol ?? "the vault's asset";

/** The denominator, before any row: how many vaults the factories made, and
 *  what that count does and does not include. */
export const yearnRosterCensusProv = (
  c: YearnVaultCoords,
  census: { catalogSize: number; censusBlock: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: census.censusBlock },
  verify: {
    kind: "recompute",
    text: `Walk ReleaseRegistry.factories(i) on 0x0377b4daDDA86C89A0091772B79ba67d0E5F7198, sweep each factory's NewVault logs to block ${n(census.censusBlock)}, and count the vaults`,
  },
  summary: `Vaults catalogued — ${n(census.catalogSize)}: every vault the five Yearn V3 factories had deployed on Ethereum at block ${n(census.censusBlock)}, each one a \`NewVault\` log on its factory, checked against the vault's \`FACTORY()\`, \`apiVersion()\` and \`asset()\`. THE ROSTER IS A FLOOR: a \`VaultV3\` compiled and deployed without a factory emits no such log and is absent from it, and a vault created since that block is absent until the census re-runs. The factories come from the live release registry; the pointer \`Registry.releaseRegistry()\` answers knows three of the five and hides 130 of these vaults, and \`Registry.getAllEndorsedVaults()\` answers the endorsed subset mixed with 48 tokenized strategies no factory made.`,
  via: `${LANE} · NewVault on the five V3 factories, censused to block ${n(census.censusBlock)}`,
  formula: "count of NewVault logs across the five V3 factories up to the census block",
});

/** `name()` — read live because it MOVES: 3.0.4 and 3.1.0 vaults let the role
 *  manager rename through `setName`. */
export const yearnVaultNameProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("name()", c),
  summary: `Vault name — the ERC-20 \`name()\` of the vault's share token${atBlock(c)}, read live: a 3.0.4 or 3.1.0 vault can be renamed (\`setName\`), so the name is a reading at this block and never an identity. Four names on this roster are each carried by three different vaults, so the address beside the name is what tells them apart.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.name() @ the pinned block`,
});

/** `totalAssets()` on a roster row — what the vault holds, in its asset. */
export const yearnVaultTotalAssetsProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalAssets()", c),
  summary: `Total assets — the vault's \`totalAssets()\`${atBlock(c)}, in ${asset(c)}: what sits idle in the vault plus what its strategies report as debt. It is a quantity of ${asset(c)} and is compared only with vaults in the same asset — this roster groups by asset and never orders or sums across two of them, which would take a price no part of this page reads. A zero is a reading: the vault holds nothing at this block.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalAssets() @ the pinned block`,
});

/** `convertToAssets(10 ** decimals)` — one whole share, priced by the vault. */
export const yearnVaultSharePriceProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("convertToAssets(10 ** decimals)", c),
  summary: `Share price — \`convertToAssets(10 ** decimals)\`${atBlock(c)}: what ONE whole vault share converts to in ${asset(c)}, answered by the vault and never divided out by this page. The exponent is the asset's decimals, because a V3 vault's share token carries the same decimals as its asset — the census refuses to write when a vault disagrees with its asset on that. A quantity of ${asset(c)}, never converted to USD.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.convertToAssets(one share) @ the pinned block`,
});

/** `Registry.isEndorsed(vault)` — the only thing that earns the mark and the
 *  badge (rails-ops decision 0027 call 1). */
export const yearnVaultEndorsedProv = (c: YearnVaultCoords, endorsed: boolean): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Call isEndorsed(${c.vault ?? "the vault"}) on the Yearn V3 Registry ${YEARN_REGISTRY}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""} against any archive node`,
  },
  summary: endorsed
    ? `Endorsed — the Yearn V3 Registry answers \`isEndorsed()\` true for this vault${atBlock(c)}. Yearn can remove an endorsement, so the badge is a reading at this block and the block is printed with it. It is what the Yearn mark on this row stands for; an unendorsed vault made by the same factory carries the family word and no mark, because anyone can deploy one and name it anything.`
    : `Not endorsed — the Yearn V3 Registry answers \`isEndorsed()\` false for this vault${atBlock(c)}. The vault came out of a Yearn V3 factory and runs Yearn's vault code, which is what the family word on the row says; the endorsement is a separate act by Yearn and this vault has none at this block.`,
  contract: registryContract,
  via: `${LANE} · Registry.isEndorsed(vault) @ the pinned block`,
});

/** `isShutdown()` — the vault takes no more deposits. */
export const yearnVaultShutdownProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("isShutdown()", c),
  summary: `Shut down — the vault's \`isShutdown()\` answers true${atBlock(c)}: emergency shutdown has been called, so it accepts no further deposits and its strategies are being wound down. Withdrawals still work, and what it holds is the \`totalAssets()\` on this row.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.isShutdown() @ the pinned block`,
});

/** How many catalogued vaults in one asset hold something at the block. */
export const yearnAssetGroupCountProv = (c: YearnVaultCoords, count: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${count === 1 ? "One vault" : `${n(count)} vaults`} denominated in ${asset(c)} with a non-zero \`totalAssets()\`${atBlock(c)} — a count over this page's reads, one per catalogued vault whose immutable \`asset()\` is ${asset(c)}. Vaults in this asset that read zero are counted in the trailing group and are never dropped.`,
  via: `${LANE} · count of catalogued vaults with asset() = ${asset(c)} and totalAssets() > 0 @ the pinned block`,
  formula: `count of catalogued vaults where asset() = ${asset(c)} and totalAssets() > 0`,
});

/** How many catalogued vaults hold nothing at the block — a reading, one per
 *  vault, and never the vaults whose call went unanswered. */
export const yearnEmptyCountProv = (c: YearnVaultCoords, count: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n(count)} of the ${n(catalogSize)} catalogued vaults answered zero to \`totalAssets()\`${atBlock(c)} — each holds nothing at this block, which is a reading about the vault and never a gap in the read. A vault whose call went unanswered is stated as unread, separately, and is absent from this count.`,
  via: `${LANE} · count of catalogued vaults with totalAssets() = 0 @ the pinned block`,
  formula: "count of catalogued vaults where totalAssets() = 0",
});

/** How many of the roster the Registry endorses at the block. */
export const yearnEndorsedCountProv = (c: YearnVaultCoords, count: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n(count)} of the ${n(catalogSize)} catalogued vaults are endorsed${atBlock(c)} — one \`Registry.isEndorsed()\` call per vault, counted. Endorsement is an act Yearn can undo, so this count belongs to this block alone; the roster below is every vault the factories made, and the badge marks which of them Yearn stands behind.`,
  contract: registryContract,
  via: `${LANE} · count of Registry.isEndorsed(vault) = true @ the pinned block`,
  formula: "count of catalogued vaults where Registry.isEndorsed(vault) is true",
});

// ── one vault's factsheet ────────────────────────────────────────────────────
// The roster's receipts above answer "what is on the list and what does each
// hold". These answer the page a row opens: where a vault's assets sit, who
// holds the roles over it, and how a gain reaches the share price.

/** `totalSupply()` — every share in existence, in share units. */
export const yearnVaultTotalSupplyProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalSupply()", c),
  summary: `Shares issued — the vault's \`totalSupply()\`${atBlock(c)}: every share in existence, held across every depositor. A V3 vault's share token carries the same decimals as its asset, so this figure and the total assets above it are scaled the same way; they are quantities of two different things all the same, and the page keeps them apart.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalSupply() @ the pinned block`,
});

/** `totalIdle()` — the asset sitting in the vault. */
export const yearnVaultIdleProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalIdle()", c),
  summary: `Idle — the vault's \`totalIdle()\`${atBlock(c)}, in ${asset(c)}: the part of the vault's assets sitting in the vault contract, which is what a withdrawal is served from before any strategy is touched.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalIdle() @ the pinned block`,
});

/** `totalDebt()` — what the strategies hold, as the vault records it. */
export const yearnVaultDebtProv = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalDebt()", c),
  summary: `Deployed — the vault's \`totalDebt()\`${atBlock(c)}, in ${asset(c)}: the sum the vault records as lent to its strategies. It moves when a strategy is funded, when the vault pulls from one, and when a strategy reports a gain or a loss; between reports it is the last figure recorded and not a live mark.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalDebt() @ the pinned block`,
});

/** `get_default_queue()` — the withdrawal order, and its length. */
export const yearnVaultQueueProv = (c: YearnVaultCoords, count: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("get_default_queue()", c),
  summary: `Withdrawal queue — \`get_default_queue()\`${atBlock(c)}: the ${count === 1 ? "one strategy" : `${n(count)} strategies`} a withdrawal walks, in this order, once the idle balance runs out. The role manager sets it and a V3 vault holds at most ten. A strategy taken out of the queue can still carry debt, so this order describes withdrawals and the vault's \`totalDebt()\` is what describes the whole.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.get_default_queue() @ the pinned block`,
  formula: "length of get_default_queue()",
});

/** `strategies(addr).current_debt` — one strategy's share of the deployed sum. */
export const yearnVaultStrategyDebtProv = (c: YearnVaultCoords, strategy: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Call strategies(${strategy}) on ${c.vault ?? "the vault"}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""} and read current_debt`,
  },
  summary: `Debt to this strategy — \`strategies(${strategy.slice(0, 10)}…).current_debt\`${atBlock(c)}, in ${asset(c)}: what the vault records as lent to this one strategy. It is the vault's record and updates when the strategy reports, so a gain earned since its last report is absent from it until that report lands.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.strategies(strategy).current_debt @ the pinned block`,
});

/** `strategies(addr).max_debt` — the ceiling the role manager set. */
export const yearnVaultStrategyCapProv = (c: YearnVaultCoords, strategy: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Call strategies(${strategy}) on ${c.vault ?? "the vault"}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""} and read max_debt`,
  },
  summary: `Cap on this strategy — \`strategies(${strategy.slice(0, 10)}…).max_debt\`${atBlock(c)}, in ${asset(c)}: the most the vault may lend it. The role manager sets it, and it is a limit on future funding and never a claim about what the strategy holds now.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.strategies(strategy).max_debt @ the pinned block`,
});

/** `role_manager()` / `accountant()` — addresses, and only addresses. */
export const yearnVaultRoleProv = (c: YearnVaultCoords, role: "role manager" | "accountant"): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(role === "accountant" ? "accountant()" : "role_manager()", c),
  summary:
    role === "accountant"
      ? `Accountant — the vault's \`accountant()\`${atBlock(c)}: the contract the vault asks what fee to charge on a strategy's report. Stated as an address and only as an address; nothing on chain says who runs it.`
      : `Role manager — the vault's \`role_manager()\`${atBlock(c)}: the address that hands out every role over this vault, including who may add a strategy, set a debt cap or shut it down. Stated as an address and only as an address; nothing on chain says who holds it.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.${role === "accountant" ? "accountant" : "role_manager"}() @ the pinned block`,
});

/** `profitMaxUnlockTime()` — how long a reported gain takes to reach holders. */
export const yearnVaultUnlockProv = (c: YearnVaultCoords, seconds: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("profitMaxUnlockTime()", c),
  summary:
    seconds === 0
      ? `Profit unlock — \`profitMaxUnlockTime()\` answers zero${atBlock(c)}: a gain a strategy reports reaches the share price the moment it is reported, in one step.`
      : `Profit unlock — \`profitMaxUnlockTime()\` answers ${n(seconds)} seconds${atBlock(c)}: when a strategy reports a gain, the vault mints shares to its address and burns them over that span, so the share price climbs smoothly across it instead of jumping on the report. A loss lands at once.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.profitMaxUnlockTime() @ the pinned block`,
});
