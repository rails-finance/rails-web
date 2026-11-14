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

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance } from "@/components/shared/provenance";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";

const LANE = "live Ethereum chain reads (/ethereum/yearn/vaults)";

export interface YearnVaultCoords {
  /** rails-server's read of `blockNumber`, when it answered every read of the page. */
  readBy?: ServerRead | null;
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
  text: `To check: ask any Ethereum archive node for ${call} on ${c.vault ?? "the vault"}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""}.`,
});

const asset = (c: YearnVaultCoords) => c.assetSymbol ?? "the vault's asset";

/** The denominator, before any row: how many vaults the factories made, and
 *  what that count does and does not include. */
const yearnRosterCensusProv_ = (
  c: YearnVaultCoords,
  census: { catalogSize: number; censusBlock: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: census.censusBlock },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for each factories(i) on the ReleaseRegistry at 0x0377b4daDDA86C89A0091772B79ba67d0E5F7198, read each factory's NewVault logs up to block ${n(census.censusBlock)}, and count the vaults.`,
  },
  summary: `Vaults catalogued — ${n(census.catalogSize)}: every vault the five Yearn V3 factories had deployed on Ethereum at block ${n(census.censusBlock)}, each one recorded by its factory when it was created and checked against the factory, version and asset the vault reports. The roster is a floor: a Yearn V3 vault deployed without a factory leaves no such record and is absent from it, and a vault created since that block is absent until the census runs again. The factories come from the live release registry. The release registry the Yearn V3 Registry points to knows three of the five and misses 130 of these vaults, and the Registry's list of endorsed vaults mixes them with 48 tokenized strategies no factory made.`,
  via: `${LANE} · NewVault on the five V3 factories, censused to block ${n(census.censusBlock)} · FACTORY(), apiVersion(), asset() on each vault`,
  formula: "count of NewVault logs across the five V3 factories up to the census block",
});

/** `name()` — read live because it MOVES: 3.0.4 and 3.1.0 vaults let the role
 *  manager rename through `setName`. */
const yearnVaultNameProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("name()", c),
  summary: `Vault name — the name of the vault's share token${atBlock(c)}, read live. A 3.0.4 or 3.1.0 vault can be renamed, so the name is a reading at this block. Four names on this roster are each carried by three different vaults, so the address beside the name tells them apart.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.name() @ the pinned block`,
});

/** `totalAssets()` on a roster row — what the vault holds, in its asset. */
const yearnVaultTotalAssetsProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalAssets()", c),
  summary: `Total assets — what the vault holds${atBlock(c)}, in ${asset(c)}: the amount idle in the vault plus what its strategies report as debt. The roster groups vaults by asset and compares them only within one, since ordering or adding two assets would take a price this page does not read. A zero is a reading: the vault holds nothing at this block.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalAssets() @ the pinned block`,
});

/** `convertToAssets(10 ** decimals)` — one whole share, priced by the vault. */
const yearnVaultSharePriceProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("convertToAssets(10 ** decimals)", c),
  summary: `Share price — what one whole vault share converts to${atBlock(c)}, in ${asset(c)}, as the vault answers it; this page divides nothing out. The exponent is the asset's decimals: a V3 vault's share token has the same decimals as its asset, and the census refuses to write a vault that disagrees.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.convertToAssets(one share) @ the pinned block`,
});

/** `Registry.isEndorsed(vault)` — the only thing that earns the mark and the
 *  badge (rails-ops decision 0027 call 1). */
const yearnVaultEndorsedProv_ = (c: YearnVaultCoords, endorsed: boolean): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for isEndorsed(${c.vault ?? "the vault"}) on the Yearn V3 Registry ${YEARN_REGISTRY}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""}.`,
  },
  summary: endorsed
    ? `Endorsed — the Yearn V3 Registry lists this vault as endorsed${atBlock(c)}. Yearn can remove an endorsement, so the badge is a reading at this block and the block is printed with it. It is what the Yearn mark on this row stands for; an unendorsed vault made by the same factory carries the family word and no mark, because anyone can deploy one and name it anything.`
    : `Not endorsed — the Yearn V3 Registry lists this vault as not endorsed${atBlock(c)}. The vault came out of a Yearn V3 factory and runs Yearn's vault code, which is what the family word on the row says; the endorsement is a separate act by Yearn and this vault has none at this block.`,
  contract: registryContract,
  via: `${LANE} · Registry.isEndorsed(vault) @ the pinned block`,
});

/** `isShutdown()` — the vault takes no more deposits. */
const yearnVaultShutdownProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("isShutdown()", c),
  summary: `Shut down — the vault reports that it is shut down${atBlock(c)}: emergency shutdown has been called, so it accepts no further deposits and its strategies are being wound down. Withdrawals still work, and what it holds is the total assets on this row.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.isShutdown() @ the pinned block`,
});

/** How many catalogued vaults hold nothing at the block — a reading, one per
 *  vault, and never the vaults whose call went unanswered. */
const yearnEmptyCountProv_ = (c: YearnVaultCoords, count: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n(count)} of the ${n(catalogSize)} catalogued vaults hold nothing${atBlock(c)} — each answered zero for its total assets, a reading about the vault. A vault whose read went unanswered is stated as unread, separately, and is not in this count.`,
  via: `${LANE} · count of catalogued vaults with totalAssets() = 0 @ the pinned block`,
  formula: "count of catalogued vaults where totalAssets() = 0",
});

/** How many of the roster the Registry endorses at the block. */
const yearnEndorsedCountProv_ = (c: YearnVaultCoords, count: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n(count)} of the ${n(catalogSize)} catalogued vaults are endorsed${atBlock(c)} — the Yearn V3 Registry asked once for each vault, and the answers counted. Yearn can undo an endorsement, so this count belongs to this block. The roster below is every vault the factories made, and the badge marks the ones Yearn endorses.`,
  contract: registryContract,
  via: `${LANE} · count of Registry.isEndorsed(vault) = true @ the pinned block`,
  formula: "count of catalogued vaults where Registry.isEndorsed(vault) is true",
});

// ── one vault's factsheet ────────────────────────────────────────────────────
// The roster's receipts above answer "what is on the list and what does each
// hold". These answer the page a row opens: where a vault's assets sit, who
// holds the roles over it, and how a gain reaches the share price.

/** `totalSupply()` — every share in existence, in share units. */
const yearnVaultTotalSupplyProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalSupply()", c),
  summary: `Shares issued — every share in existence${atBlock(c)}, held across every depositor. A V3 vault's share token has the same decimals as its asset, so this figure and the total assets are scaled the same way; they are still quantities of two different things, and the page keeps them apart.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalSupply() @ the pinned block`,
});

/** `totalIdle()` — the asset sitting in the vault. */
const yearnVaultIdleProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalIdle()", c),
  summary: `Idle — the part of the vault's assets sitting in the vault contract${atBlock(c)}, in ${asset(c)}. A withdrawal is served from it before any strategy is touched.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalIdle() @ the pinned block`,
});

/** `totalDebt()` — what the strategies hold, as the vault records it. */
const yearnVaultDebtProv_ = (c: YearnVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalDebt()", c),
  summary: `Debt — the sum the vault records as lent to its strategies${atBlock(c)}, in ${asset(c)}. It moves when a strategy is funded, when the vault pulls from one, and when a strategy reports a gain or a loss; between reports it is the last figure recorded.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.totalDebt() @ the pinned block`,
});

/** `get_default_queue()` — the withdrawal order, and its length. */
const yearnVaultQueueProv_ = (c: YearnVaultCoords, count: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("get_default_queue()", c),
  summary: `Withdrawal queue — the vault's default queue${atBlock(c)}: the ${count === 1 ? "one strategy" : `${n(count)} strategies`} a withdrawal walks, in this order, once the idle balance runs out. The role manager sets it and a V3 vault holds at most ten. A strategy taken out of the queue can still carry debt, so this order describes withdrawals and the vault's total debt describes the whole.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.get_default_queue() @ the pinned block`,
  formula: "length of get_default_queue()",
});

/** `strategies(addr).current_debt` — one strategy's share of the deployed sum. */
const yearnVaultStrategyDebtProv_ = (c: YearnVaultCoords, strategy: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for strategies(${strategy}) on ${c.vault ?? "the vault"}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""} and read its current_debt.`,
  },
  summary: `Debt to this strategy — what the vault records as lent to strategy ${strategy.slice(0, 10)}…${atBlock(c)}, in ${asset(c)}. It is the vault's record and updates when the strategy reports, so a gain earned since its last report is absent from it until the next report lands.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.strategies(strategy).current_debt @ the pinned block`,
});

/** `strategies(addr).max_debt` — the ceiling the role manager set. */
const yearnVaultStrategyCapProv_ = (c: YearnVaultCoords, strategy: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for strategies(${strategy}) on ${c.vault ?? "the vault"}${c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : ""} and read its max_debt.`,
  },
  summary: `Max debt of this strategy — the most the vault may lend strategy ${strategy.slice(0, 10)}…${atBlock(c)}, in ${asset(c)}. The role manager sets it as a limit on future funding; what the strategy holds now is its debt.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.strategies(strategy).max_debt @ the pinned block`,
});

/** `role_manager()` / `accountant()` — addresses, and only addresses. */
const yearnVaultRoleProv_ = (c: YearnVaultCoords, role: "role manager" | "accountant"): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(role === "accountant" ? "accountant()" : "role_manager()", c),
  summary:
    role === "accountant"
      ? `Accountant — the vault's accountant${atBlock(c)}: the contract the vault asks what fee to charge on a strategy's report. It is stated as an address, because nothing on chain says who runs it.`
      : `Role manager — the address that hands out every role over this vault${atBlock(c)}, including who may add a strategy, set a debt cap or shut it down. It is stated as an address, because nothing on chain says who holds it.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.${role === "accountant" ? "accountant" : "role_manager"}() @ the pinned block`,
});

/** `profitMaxUnlockTime()` — how long a reported gain takes to reach holders. */
const yearnVaultUnlockProv_ = (c: YearnVaultCoords, seconds: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("profitMaxUnlockTime()", c),
  summary:
    seconds === 0
      ? `Profit unlock — zero seconds${atBlock(c)}: a gain a strategy reports reaches the share price the moment it is reported, in one step.`
      : `Profit unlock — ${n(seconds)} seconds${atBlock(c)}: when a strategy reports a gain, the vault mints shares to its address and burns them over that span, so the share price climbs across it instead of jumping on the report. A loss lands at once.`,
  contract: vaultContract(c),
  via: `${LANE} · VaultV3.profitMaxUnlockTime() @ the pinned block`,
});

// Receipts over a page's reads stamp rails-server's head read when the coordinates carry it.
export const yearnRosterCensusProv = withServerRead(yearnRosterCensusProv_);
export const yearnVaultNameProv = withServerRead(yearnVaultNameProv_);
export const yearnVaultTotalAssetsProv = withServerRead(yearnVaultTotalAssetsProv_);
export const yearnVaultSharePriceProv = withServerRead(yearnVaultSharePriceProv_);
export const yearnVaultEndorsedProv = withServerRead(yearnVaultEndorsedProv_);
export const yearnVaultShutdownProv = withServerRead(yearnVaultShutdownProv_);
export const yearnEmptyCountProv = withServerRead(yearnEmptyCountProv_);
export const yearnEndorsedCountProv = withServerRead(yearnEndorsedCountProv_);
export const yearnVaultTotalSupplyProv = withServerRead(yearnVaultTotalSupplyProv_);
export const yearnVaultIdleProv = withServerRead(yearnVaultIdleProv_);
export const yearnVaultDebtProv = withServerRead(yearnVaultDebtProv_);
export const yearnVaultQueueProv = withServerRead(yearnVaultQueueProv_);
export const yearnVaultStrategyDebtProv = withServerRead(yearnVaultStrategyDebtProv_);
export const yearnVaultStrategyCapProv = withServerRead(yearnVaultStrategyCapProv_);
export const yearnVaultRoleProv = withServerRead(yearnVaultRoleProv_);
export const yearnVaultUnlockProv = withServerRead(yearnVaultUnlockProv_);
