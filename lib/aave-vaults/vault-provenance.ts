// The receipts for Aave's vault layer on Ethereum — /ethereum/aave/vaults.
// ----------------------------------------------------------------------------
// A sibling of lib/morpho-base/vault-provenance.ts for a different catalogue.
// That one traces a MetaMorpho vault sitting on Morpho Blue; this one traces
// three families Aave itself deploys, and the differences between them are the
// whole reason the receipts are written separately rather than parameterised:
//
//   • THE ROSTER IS A CHAIN READ, not a census. Every receipt that speaks about
//     the catalogue says which call answered it and at which block, because the
//     answer is complete at that block by construction — the opposite of the
//     Base catalogue's "this is a floor".
//   • THE SHARE PRICE'S EXPONENT IS PART OF THE CLAIM. Aave's share tokens are
//     6-, 8- and 18-decimal, so `convertToAssets(10^18)` would be a different
//     question on most of them. Every share-price receipt names the exponent it
//     asked with and where that number came from.
//   • A STAKE TOKEN'S ASSET IS ANOTHER VAULT. Three of the four hold a stata
//     token, which holds an aToken, which is the reserve — so a figure in "the
//     asset" is a figure in waEthUSDC, not in USDC, and the receipts say so
//     rather than letting the last hop's symbol stand against the first hop's
//     amount.
//
// Distance classes: every figure here is `state` — a slot or a view call at the
// pinned block, re-runnable by anyone against any archive node — with ONE
// `oracle`-class exception: the position card's census-block USD value, which
// names the chain's Aave V3 oracle and the block it was read at
// (`aaveVaultValueUsdProv`). A stake token's own `latestAnswer()` is a USD price
// feed too, and this section still does not read it.
//
// WHAT THESE RECEIPTS REFUSE TO SAY. `isReserveSlashable()` and the cooldown are
// stated as the contract's own configuration. No receipt here multiplies a
// slashable amount by anyone's balance: an amount a holder "would lose" is a
// projection of an event that has not happened, and the chain-truth gate refuses
// it on the face.

import type { Provenance } from "@/components/shared/provenance";
import type { VaultPositionValue } from "@/lib/aave-vaults/vault-position";
import {
  AAVE_ADDRESS_BOOK_COMMIT,
  AAVE_STATA_FACTORY,
  AAVE_UMBRELLA,
  type AaveVaultAttestation,
  type AaveVaultFamily,
} from "@/lib/aave-vaults/vault-catalog";
import { attestedClause, attestedShortName, type AttestedAddress } from "@/lib/shared/attested-addresses";

const LANE = "live Ethereum chain reads (/ethereum/aave/vaults)";

export interface AaveVaultCoords {
  /** The block every figure was read at — every receipt's `source` block. */
  blockNumber?: number;
  /** The vault contract — the `contract` on every vault-side receipt. */
  vault?: string;
  /** The vault's own name at that block, for prose. */
  vaultName?: string;
  /** The ERC-4626 underlying's symbol — the unit an asset figure speaks in. */
  assetSymbol?: string;
  /** The share token's own symbol — the unit a share figure speaks in. */
  shareSymbol?: string;
  /** The reserve an Umbrella stake token covers, where a figure speaks in the
   *  reserve's units rather than the vault asset's — three of the four hold a
   *  wrapper, so the two are different tokens. */
  reserveSymbol?: string;
  /** The address a holder-side figure is about. */
  holder?: string;
  /** The block the CENSUS swept to, where a figure comes out of the store
   *  rather than out of a call this request made. Kept separate from
   *  `blockNumber` on purpose: the position listing draws both lanes on one
   *  card, and a receipt that let the two share a field could print a stored
   *  figure at a block it was never read at. */
  censusBlock?: number;
  /** Which chain the census lane named in these receipts ran on. Absent means
   *  Ethereum, which is where this vocabulary started; the Base vault listing
   *  draws the SAME card and the same reads, so it passes 8453 rather than
   *  growing a second copy of every receipt for `balanceOf` and
   *  `convertToAssets`. */
  chainId?: number;
}

const FAMILY_NAME: Record<AaveVaultFamily, string> = {
  sgho: "sGHO",
  stata: "static aToken",
  "umbrella-stake": "Umbrella stake token",
};

const vaultContract = (c: AaveVaultCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (ERC-4626)` : "the vault",
  address: c.vault,
});

const atBlock = (c: AaveVaultCoords): string => (c.blockNumber != null ? ` at block ${c.blockNumber}` : "");

const recompute = (call: string, c: AaveVaultCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    c.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${c.blockNumber} against any Ethereum archive node`
      : `Re-run the ${call} eth_call against any Ethereum archive node`,
});

const asset = (c: AaveVaultCoords) => c.assetSymbol ?? "the vault's asset";

/** How a row earns its place, in one clause — quoted inside the receipts that
 *  state what the catalogue is. */
export const attestationClause = (a: AaveVaultAttestation): string =>
  a.kind === "book"
    ? `Aave publishes this address as \`${a.constant}\` in its own address book (\`aave-dao/aave-address-book\`, \`src/ts/${a.file}.ts\`, commit ${AAVE_ADDRESS_BOOK_COMMIT.slice(0, 10)})`
    : `Aave publishes \`${a.constant}\`, and that contract's own \`${a.call}\` returned this address`;

// ── what the catalogue is ────────────────────────────────────────────────────

/** The denominator: how many vaults the section lists, and who said so. Not a
 *  census and not a floor — two enumerator calls and one published address, all
 *  at the block the page states. */
export const aaveVaultCatalogueProv = (
  c: AaveVaultCoords,
  counts: { catalogSize: number; stataCount: number; stakeCount: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Re-run StataTokenFactory.getStataTokens() and Umbrella.getStkTokens()${atBlock(c)} and count what they return`,
  },
  summary: `Vaults listed — ${counts.catalogSize}: sGHO, the ${counts.stakeCount} stake tokens \`Umbrella.getStkTokens()\` returned, and the ${counts.stataCount} static aTokens \`StataTokenFactory.getStataTokens()\` returned, every one of them read${atBlock(c)}. The roster is not a census and not a floor: both calls answer their whole family in one read, and sGHO is a single address Aave's address book names, so the list is complete AT THIS BLOCK by construction. A vault deployed one block earlier is in it. What is outside it is stated in the prose beside this figure.`,
  via: `${LANE} · getStataTokens() + getStkTokens() + GhoEthereum.SGHO @ the pinned block`,
  formula: "1 (sGHO) + getStkTokens().length + getStataTokens().length",
});

/** How many vaults are in one family — a count over the same reads. */
export const aaveVaultFamilyCountProv = (
  c: AaveVaultCoords,
  family: AaveVaultFamily,
  counts: { funded: number; total: number },
  attestation: AaveVaultAttestation,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${counts.funded === 1 ? "One vault" : `${counts.funded} vaults`} shown here — the ${FAMILY_NAME[family]} rows holding something${atBlock(c)}, out of ${counts.total} in the family. ${attestationClause(attestation)}. Counted from that answer, not from a list kept in this repo; a vault in this family whose \`totalAssets()\` read zero is in the trailing group below rather than dropped from the count.`,
  via: `${LANE} · ${attestation.kind === "book" ? attestation.constant : attestation.call} @ the pinned block`,
  formula: attestation.kind === "book" ? "one published address" : `length of ${attestation.call}`,
});

// ── what a vault says about itself ───────────────────────────────────────────

/** `name()` — read live rather than kept in a catalogue. */
export const aaveVaultNameProv = (c: AaveVaultCoords, attestation: AaveVaultAttestation): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("name()", c),
  summary: `Vault name — the ERC-20 \`name()\` of the vault's own share token${atBlock(c)}, read rather than stored: a name is a reading at a block, never an identity, and the address beside it is what tells two vaults apart. ${attestationClause(attestation)}.`,
  contract: vaultContract(c),
  via: `${LANE} · name() @ the pinned block`,
});

/** `totalAssets()` — with the family's own accounting note, because the three
 *  families compute it in three different ways and a single sentence about "the
 *  vault's assets" would be wrong for two of them. */
export const aaveVaultTotalAssetsProv = (c: AaveVaultCoords, family: AaveVaultFamily): Provenance => {
  const mechanic =
    family === "sgho"
      ? `sGHO does NOT count the GHO it holds: \`totalAssets()\` is what its stored yield index says the shares are worth (\`convertToAssets(totalSupply())\`), and the GHO balance in the contract is a separate number that can be either side of it. Withdrawals are clamped to that balance, not to this figure.`
      : family === "stata"
        ? `A static aToken's \`totalAssets()\` is its share supply valued at the Aave V3 Core Pool's liquidity index for the reserve it wraps, so it moves with the reserve's accrued interest and not with any action on the wrapper. It is close to, and need not equal, the aToken balance the wrapper holds — the difference is the wrapper's own floor rounding, stated rather than reconciled away.`
        : `A stake token's \`totalAssets()\` is a STORED COUNTER incremented on deposit and decremented on withdrawal — not a balance read. Umbrella decrements it when it slashes, which is the only thing that moves this token's share price.`;
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("totalAssets()", c),
    summary: `Total assets — the vault's own \`totalAssets()\`${atBlock(c)}, in ${asset(c)}. ${mechanic} A quantity of ${asset(c)} and nothing else: the section never orders or sums across two assets, and never converts one to USD. A zero here is a reading — the vault holds nothing at this block — not an absence.`,
    contract: vaultContract(c),
    via: `${LANE} · totalAssets() @ the pinned block`,
  };
};

/** `totalSupply()` — every share in existence, in the SHARE token's decimals. */
export const aaveVaultTotalSupplyProv = (c: AaveVaultCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalSupply()", c),
  summary: `Shares issued — the ERC-20 \`totalSupply()\` of the vault's own share token${atBlock(c)}, scaled by that token's own \`decimals()\` (${shareDecimals}) read at the same block. Every share in existence. Shares and assets are different units here: this vault's share decimals and its asset's decimals need not match.`,
  contract: vaultContract(c),
  via: `${LANE} · totalSupply() @ the pinned block`,
});

/** `convertToAssets(10 ** decimals)` — one whole share, priced by the vault. The
 *  exponent is READ, and the receipt says so: it is the difference between a
 *  share price and a number 1e12 too large. */
export const aaveVaultSharePriceProv = (c: AaveVaultCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`convertToAssets(10^${shareDecimals})`, c),
  summary: `Share price — \`convertToAssets(10^${shareDecimals})\`${atBlock(c)}: what ONE whole share converts to in ${asset(c)}, answered by the vault rather than divided out by this page. The exponent is this vault's OWN \`decimals()\`, read at the same block — Aave's share tokens are 6-, 8- and 18-decimal, and \`convertToAssets\` is linear, so asking with a fixed 10^18 would answer a different question on most of them. A quantity of ${asset(c)}; never a USD price.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(one whole share) @ the pinned block`,
});

// ── the per-family mechanic, each leg its own read ───────────────────────────

/** sGHO `targetRate()` — a governance CONFIGURATION read, in basis points as
 *  stored. Deliberately not turned into a yearly percentage or into anyone's
 *  earnings: that is a forecast of what the risk council will leave it at. */
export const aaveVaultTargetRateProv = (c: AaveVaultCoords, bps: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("targetRate()", c),
  summary: `Target rate — \`targetRate()\` reads ${bps} basis points${atBlock(c)}: the rate the risk council has set on the vault, in the units the contract stores it in. It is the setting at this block and not a forecast of what a holder earns — the council can change it, and this page states no return, no annualisation and no yield series.`,
  contract: vaultContract(c),
  via: `${LANE} · targetRate() @ the pinned block`,
});

/** sGHO `supplyCap()` — the ceiling on what the vault will accept, in GHO. */
export const aaveVaultSupplyCapProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("supplyCap()", c),
  summary: `Deposit cap — \`supplyCap()\`${atBlock(c)}, in ${asset(c)}: the ceiling the risk council has set on what this vault will hold. What is left of it is the cap minus \`totalAssets()\`, which is what the vault's own \`maxDeposit()\` answers — the two agree exactly. A configuration read, not a plan.`,
  contract: vaultContract(c),
  via: `${LANE} · supplyCap() @ the pinned block`,
});

/** stata `aToken()` — the one aToken this wrapper wraps. */
export const aaveVaultATokenProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("aToken()", c),
  summary: `Wrapped aToken — the wrapper's own \`aToken()\`${atBlock(c)}: the single Aave V3 aToken this ERC-4626 wraps, asked of the wrapper rather than searched for across Aave's three Ethereum Pools. Everything the wrapper holds is that aToken, and its share price is that reserve's normalised income in the Core Pool.`,
  contract: vaultContract(c),
  via: `${LANE} · aToken() @ the pinned block`,
});

/** Umbrella `getCooldown()` / `getUnstakeWindow()` — the two seconds a holder
 *  has to wait, and then has, before redeeming. */
export const aaveVaultCooldownProv = (c: AaveVaultCoords, cooldown: number, window: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("getCooldown() and getUnstakeWindow()", c),
  summary: `Cooldown and unstake window — \`getCooldown()\` reads ${cooldown} seconds and \`getUnstakeWindow()\` ${window}${atBlock(c)}, both on this token. A holder starts the cooldown, waits it out, and may redeem only inside the window that follows; outside it the token's own \`maxRedeem()\` answers zero for a holder with a positive balance. That zero is a state, not missing data. Both figures are the token's configuration at this block, and Umbrella can change them.`,
  contract: vaultContract(c),
  via: `${LANE} · getCooldown() + getUnstakeWindow() @ the pinned block`,
});

/** Umbrella `isReserveSlashable(reserve)` — whether a deficit is outstanding on
 *  the reserve this stake token covers. A reading about the RESERVE. */
export const aaveVaultSlashableProv = (c: AaveVaultCoords, reserveSymbol: string, slashable: boolean): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`Umbrella.isReserveSlashable(${reserveSymbol})`, c),
  summary: `Slashable now — \`Umbrella.isReserveSlashable()\` answers ${slashable ? "true" : "false"} for ${reserveSymbol}${atBlock(c)}. ${slashable ? "A deficit is outstanding on that reserve, so Umbrella may slash this stake token to cover it." : "No deficit is outstanding on that reserve at this block, so there is nothing for Umbrella to slash this token for."} It is a reading about the reserve at one block and says nothing about what any holder would lose: a share of a slashing that has not happened is a projection, and this section does not state one. Past slashings are not read here — this page reads state, not history.`,
  contract: { name: "Umbrella", address: AAVE_UMBRELLA },
  via: `${LANE} · Umbrella.isReserveSlashable(reserve) @ the pinned block`,
});

/** The reserve a stake token covers — derived by hopping `asset()` twice, which
 *  is a claim about the chain and gets its own receipt rather than riding on the
 *  cooldown's. */
export const aaveVaultReserveHopProv = (c: AaveVaultCoords, reserveSymbol: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Reserve covered — ${reserveSymbol}, reached by reading this stake token's \`asset()\`${atBlock(c)} and, where that answer is itself a static aToken, that wrapper's own \`asset()\`. Three of the four stake tokens hold a wrapped aToken rather than the reserve asset, so a holder is three hops from the reserve; stkGHO holds GHO directly. The hop is read, never assumed from a symbol: \`getStakeTokenData()\` does not answer the asset for stkGHO.`,
  via: `${LANE} · asset() on the stake token, then asset() on the wrapper @ the pinned block`,
  formula: "stakeToken.asset() → (stataToken.asset() where that is a wrapper)",
});

/** The stata factory, cited where the page names the enumerator itself. */
export const aaveStataFactoryProv = (c: AaveVaultCoords, n: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("StataTokenFactory.getStataTokens()", c),
  summary: `Static aTokens deployed — \`getStataTokens()\` on the factory Aave publishes as \`AaveV3Ethereum.STATA_FACTORY\` returned ${n} addresses${atBlock(c)}. The factory allows one wrapper per underlying asset, so this is the whole family at this block rather than a sample of it.`,
  contract: { name: "StataTokenFactory", address: AAVE_STATA_FACTORY },
  via: `${LANE} · StataTokenFactory.getStataTokens() @ the pinned block`,
});

/** How many vaults hold nothing at the block. A READING, not an omission. */
export const aaveVaultEmptyCountProv = (c: AaveVaultCoords, n: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n} of the ${catalogSize} vaults answered zero to \`totalAssets()\`${atBlock(c)} — each holds nothing at this block. A reading about each vault, not a gap in the read: a vault whose call did not answer is stated as unread, separately, and is not in this count. Each of them still answers a share price, and it is not parity.`,
  via: `${LANE} · count of vaults with totalAssets() = 0 @ the pinned block`,
  formula: "count of listed vaults where totalAssets() = 0",
});

// ─────────────────────────────────────────────────────────────────────────────
// THE VAULT PAGE — /ethereum/aave/vaults/<vault>
// ─────────────────────────────────────────────────────────────────────────────
// The directory states one column per vault; the page states the family's whole
// mechanic and, when `?holder=` resolved, one address's reading of it. Every
// receipt below is the same distance class as the ones above (`state`: a slot
// or a view call at the pinned block) and the same two refusals hold — no USD,
// and no figure that multiplies a slashable amount by anyone's balance.

const reserveOf = (c: AaveVaultCoords) => c.reserveSymbol ?? "the reserve";

// ── sGHO ─────────────────────────────────────────────────────────────────────

/** `GHO.balanceOf(sGHO)` — the asset the contract actually holds, which is a
 *  different number from `totalAssets()` and the one withdrawals are clamped
 *  to. */
export const aaveSghoAssetHeldProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`${asset(c)}.balanceOf(the vault)`, c),
  summary: `${asset(c)} the contract holds — the ERC-20 \`balanceOf()\` of ${asset(c)} at the vault's own address${atBlock(c)}. This is NOT \`totalAssets()\`: that figure is what the vault's stored yield index says its shares are worth, and this one is the token balance. Withdrawals are clamped to this number, not to that one. The two can sit either side of each other and nothing here asserts an order between them.`,
  contract: vaultContract(c),
  via: `${LANE} · asset.balanceOf(vault) @ the pinned block`,
});

/** The difference between the two sGHO totals — its own number, signed. */
export const aaveSghoAssetGapProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Balance minus index total — the ${asset(c)} the contract holds less what \`totalAssets()\` says the shares are worth${atBlock(c)}. Both legs are reads at this block, so the difference is chain-derived and nothing is estimated into it. It is stated rather than reconciled: the index accrues continuously between updates while the balance moves only when someone deposits or withdraws, so the gap is a MECHANISM, not an error, and it can be either sign.`,
  contract: vaultContract(c),
  via: `${LANE} · asset.balanceOf(vault) − totalAssets() @ the pinned block`,
  formula: "asset.balanceOf(vault) − totalAssets()",
});

/** `maxDeposit()` — what is left of the cap, answered by the vault. */
export const aaveSghoCapacityProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("maxDeposit()", c),
  summary: `Remaining capacity — the vault's own \`maxDeposit()\`${atBlock(c)}, in ${asset(c)}: the deposit cap the risk council has set less what \`totalAssets()\` already counts. Answered by the contract rather than subtracted by this page, and the two agree exactly. It is the ceiling at this block and not a plan — the council can move the cap.`,
  contract: vaultContract(c),
  via: `${LANE} · maxDeposit() @ the pinned block`,
});

/** `yieldIndex()` — the RAY every sGHO conversion runs against. */
export const aaveSghoYieldIndexProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("yieldIndex()", c),
  summary: `Yield index — sGHO's stored \`yieldIndex()\`${atBlock(c)}, a RAY (10^27). It is the whole of this vault's accounting: \`convertToAssets(shares)\` is shares times this index over one RAY, and \`totalAssets()\` is that conversion applied to the whole supply. It grows in a straight line inside a rate period and compounds when the contract updates it, which happens on every mint, burn and transfer. A number as stored — this page derives no rate from it.`,
  contract: vaultContract(c),
  via: `${LANE} · yieldIndex() @ the pinned block`,
});

/** `lastUpdate()` — a STORED timestamp, and the distinction matters. */
export const aaveSghoLastUpdateProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("lastUpdate()", c),
  summary: `Index last updated — the vault's stored \`lastUpdate()\`${atBlock(c)}, as unix seconds. It is the moment the contract last wrote its yield index, NOT this block's own timestamp: the two differ by however long it has been since anyone touched the vault. Printed in UTC because the chain's clock is in UTC.`,
  contract: vaultContract(c),
  via: `${LANE} · lastUpdate() @ the pinned block`,
});

/** `ratePerSecond()` — a configuration slot, stated as one. */
export const aaveSghoRatePerSecondProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("ratePerSecond()", c),
  summary: `Rate per second — the vault's stored \`ratePerSecond()\`${atBlock(c)}, RAY-scaled, exactly as the contract holds it. It is the number the index is grown by, and it is a SETTING at this block: the risk council writes it from the target rate through the steward. This page states it and stops — nothing here compounds it out to a year or turns it into what a holder earns, which would be a forecast of a setting that can change.`,
  contract: vaultContract(c),
  via: `${LANE} · ratePerSecond() @ the pinned block`,
});

// ── static aTokens ───────────────────────────────────────────────────────────

/** The reserve's liquidity index in the Pool — the same fact as the share
 *  price, read from the other end. */
export const aaveStataLiquidityIndexProv = (c: AaveVaultCoords, pool: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("Pool.getReserveData(asset).liquidityIndex", c),
  summary: `Reserve liquidity index — \`getReserveData(${asset(c)}).liquidityIndex\` on the Pool this wrapper names in its own \`POOL()\`${atBlock(c)}, a RAY (10^27). It is the same fact as the share price above, read from the other end: the wrapper converts shares to assets by multiplying by exactly this number, so one whole share in ${asset(c)} and this index are one reading stated twice. The Pool is asked rather than assumed — the wrapper says which one it belongs to.`,
  contract: { name: "Aave V3 Pool", address: pool ?? undefined },
  via: `${LANE} · POOL() then Pool.getReserveData(asset) @ the pinned block`,
});

/** `aToken.balanceOf(wrapper)` — the supply position the wrapper holds. */
export const aaveStataATokenBalanceProv = (c: AaveVaultCoords, aToken: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("aToken.balanceOf(the wrapper)", c),
  summary: `aToken held — the aToken's own \`balanceOf()\` at this wrapper's address${atBlock(c)}, in ${asset(c)}. An aToken balance rebases with the reserve's interest, so this is the wrapper's supply position in the Pool as the Pool itself reports it. Everything the wrapper holds is this one aToken: it wraps exactly one, and the factory allows one wrapper per underlying asset.`,
  contract: { name: "aToken", address: aToken ?? undefined },
  via: `${LANE} · aToken.balanceOf(vault) @ the pinned block`,
});

/** The wrapper's custody gap — stated, not reconciled. */
export const aaveStataCustodyGapProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `aToken held minus total assets — the wrapper's aToken balance less its own \`totalAssets()\`${atBlock(c)}, both read at this block. The two are close and need not be equal: \`totalAssets()\` is the share supply valued at the reserve's index and the conversion floors, so the remainder stays in the wrapper. The difference is stated as its own number rather than rounded away, and no order between the two legs is asserted.`,
  contract: vaultContract(c),
  via: `${LANE} · aToken.balanceOf(vault) − totalAssets() @ the pinned block`,
  formula: "aToken.balanceOf(vault) − totalAssets()",
});

/** `rewardTokens()` — a registry that can under-report, and the receipt says
 *  so rather than presenting it as the Pool's truth. */
export const aaveStataRewardTokensProv = (c: AaveVaultCoords, n: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("rewardTokens()", c),
  summary: `Reward tokens registered — the wrapper's own \`rewardTokens()\` returned ${n === 0 ? "an empty list" : `${n} address${n === 1 ? "" : "es"}`}${atBlock(c)}. An empty list is a reading, not an absence of data. It is a REGISTRY rather than the Pool's truth: a reward the Pool starts paying after this wrapper was deployed has to be registered by a permissionless \`refreshRewardTokens()\` call before it appears here, so this list can under-report and this page does not present it as complete.`,
  contract: vaultContract(c),
  via: `${LANE} · rewardTokens() @ the pinned block`,
});

/** The share of this vault one stake token holds — the nesting, as two reads.
 *
 *  The number is the whole claim: a ratio of two integers in the same units, so
 *  no price, no conversion and no census figure enters it. What it is NOT is
 *  said out loud, because the figure invites both readings: it is not a risk
 *  score, and it is not a total — the stake token's own supply is a claim on this
 *  one position, so the two layers hold the same assets and adding them counts
 *  them twice. */
export const aaveVaultBackedByProv = (c: AaveVaultCoords, stakeSymbol: string, stake: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${stakeSymbol}'s share of this vault — that token's \`balanceOf()\` of this vault's share token over this vault's \`totalSupply()\`${atBlock(c)}, both read at that block. It appears here because the same token's own \`asset()\` returned this vault at that block, which is the chain saying these shares ARE its backing: the stake token's supply is a claim on this one position. So the two layers hold the same assets once, and a reader must not add them. A share of the shares is a share of the pool — shares are fungible and the vault pooled them — and the figure carries no ranking and no risk reading.`,
  contract: vaultContract(c),
  inputs: [{ label: "stake token", value: stake, kind: "chain", note: "the address the roster returned" }],
  via: `${LANE} · balanceOf(the stake token) ÷ totalSupply() @ the pinned block`,
  formula: "balanceOf(stake token) ÷ totalSupply()",
});

// ── Umbrella stake tokens ────────────────────────────────────────────────────

/** `getMaxSlashableAssets()` — the contract's own figure, in native units. */
export const aaveUmbrellaMaxSlashableProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("getMaxSlashableAssets()", c),
  summary: `Slashable amount — the token's own \`getMaxSlashableAssets()\`${atBlock(c)}, in ${asset(c)}: what Umbrella could take out of this stake token at this block, which is its \`totalAssets()\` less the floor \`MIN_ASSETS_REMAINING()\` keeps in it. The contract's own configuration read, and not a claim that any of it will be taken. No share of it is attributed to any holder anywhere on this page: an amount someone would lose in an event that has not happened is a projection, not a reading.`,
  contract: vaultContract(c),
  via: `${LANE} · getMaxSlashableAssets() @ the pinned block`,
});

/** `MIN_ASSETS_REMAINING()` — the floor the figure above stops at. */
export const aaveUmbrellaMinRemainingProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MIN_ASSETS_REMAINING()", c),
  summary: `Minimum left behind — the token's \`MIN_ASSETS_REMAINING()\`${atBlock(c)}, in ${asset(c)}: the amount a slashing may not take the stake token below. Subtracting it from \`totalAssets()\` is what produces the slashable figure beside it, so the two are one read and a constant rather than two independent claims.`,
  contract: vaultContract(c),
  via: `${LANE} · MIN_ASSETS_REMAINING() @ the pinned block`,
});

/** `asset.balanceOf(stakeToken)` beside the stored counter. */
export const aaveUmbrellaCustodyProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`${asset(c)}.balanceOf(the stake token)`, c),
  summary: `${asset(c)} the token holds — the ERC-20 \`balanceOf()\` of ${asset(c)} at this stake token's address${atBlock(c)}. Worth stating beside \`totalAssets()\` because that figure is a STORED COUNTER, incremented on deposit and decremented on withdrawal and on a slashing, rather than a balance read. Where the two agree, the counter and the custody agree; a slashing moves both, and only a slashing moves this token's share price.`,
  contract: vaultContract(c),
  via: `${LANE} · asset.balanceOf(vault) @ the pinned block`,
});

/** `Umbrella.getDeficitOffset(reserve)` — a buffer, in the reserve's units. */
export const aaveUmbrellaDeficitOffsetProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`Umbrella.getDeficitOffset(${reserveOf(c)})`, c),
  summary: `Deficit offset — \`Umbrella.getDeficitOffset()\` for ${reserveOf(c)}${atBlock(c)}, in ${reserveOf(c)}'s own units: the buffer a deficit on that reserve has to exceed before this stake token can be slashed at all. A governance configuration read at one block, stated in native units. It says what the threshold IS, never that anything will cross it.`,
  contract: { name: "Umbrella", address: AAVE_UMBRELLA },
  via: `${LANE} · Umbrella.getDeficitOffset(reserve) @ the pinned block`,
});

/** `Umbrella.getPendingDeficit(reserve)` — a reading, and zero is one. */
export const aaveUmbrellaPendingDeficitProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`Umbrella.getPendingDeficit(${reserveOf(c)})`, c),
  summary: `Pending deficit — \`Umbrella.getPendingDeficit()\` for ${reserveOf(c)}${atBlock(c)}, in ${reserveOf(c)}'s own units: the deficit Umbrella currently records against that reserve. A zero here is a reading — Umbrella records none at this block — and not missing data. Past slashings are not read on this page at all: it reads state, never history, and says so rather than implying none happened.`,
  contract: { name: "Umbrella", address: AAVE_UMBRELLA },
  via: `${LANE} · Umbrella.getPendingDeficit(reserve) @ the pinned block`,
});

/** `owner()` on a stake token — the only address that can slash it. */
export const aaveUmbrellaOwnerProv = (c: AaveVaultCoords, owner: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("owner()", c),
  summary: `Who can slash this token — its own \`owner()\`${atBlock(c)}. The slash entry point is owner-only, so the address this call returns is the only one that can take assets out of the token, and it reads as the Umbrella contract itself. Read from the token rather than taken from the source: it puts the reachable slasher on chain instead of only in the documentation.`,
  contract: vaultContract(c),
  via: `${LANE} · owner() @ the pinned block`,
});

/** One whole wrapper share in reserve units — the middle leg of the hop. */
export const aaveUmbrellaWrapperPriceProv = (
  c: AaveVaultCoords,
  wrapperSymbol: string,
  decimals: number,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`${wrapperSymbol}.convertToAssets(10^${decimals})`, c),
  summary: `One whole ${wrapperSymbol} in ${reserveOf(c)} — \`convertToAssets(10^${decimals})\` asked of the WRAPPER this stake token holds${atBlock(c)}, with the exponent read from that wrapper's own \`decimals()\` at the same block. It is the second of three hops: a stake share converts to wrapper units, a wrapper unit converts to ${reserveOf(c)}, and each leg is its own call rather than one multiplication written here.`,
  contract: { name: wrapperSymbol, address: c.vault },
  via: `${LANE} · wrapper.convertToAssets(one whole share) @ the pinned block`,
});

/** The holder's claim carried through the wrapper into reserve units. */
export const aaveUmbrellaWrapperClaimProv = (c: AaveVaultCoords, wrapperSymbol: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`${wrapperSymbol}.convertToAssets(the holder's claim)`, c),
  summary: `The same claim in ${reserveOf(c)} — the wrapper's own \`convertToAssets()\` applied to this holder's ${wrapperSymbol} claim${atBlock(c)}. Three reads in a row, each answered by the contract that owns the question: the stake token converts the holder's shares to ${wrapperSymbol}, the wrapper converts that to ${reserveOf(c)}. Nothing is divided out or multiplied by this page, and the figure is what the two contracts say at one block — not what a redemption would return, which depends on the cooldown and on nothing being slashed first.`,
  contract: { name: wrapperSymbol },
  via: `${LANE} · wrapper.convertToAssets(holder claim) @ the pinned block`,
});

// ── the holder ───────────────────────────────────────────────────────────────

/** `balanceOf(holder)` — the one figure everything else on the holder half
 *  hangs off. */
export const aaveVaultHolderSharesProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("balanceOf(the holder)", c),
  summary: `Shares held — the ERC-20 \`balanceOf()\` of this vault's own share token at ${c.holder ?? "the address"}${atBlock(c)}, scaled by the share token's own \`decimals()\` read at the same block. A balance at one block and nothing more: it says what the address holds, never who the address is.`,
  contract: vaultContract(c),
  via: `${LANE} · balanceOf(holder) @ the pinned block`,
});

/** The holder's fraction of supply — two slot reads, both named. */
export const aaveVaultHolderFractionProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Share of the vault — this address's \`balanceOf()\` over the share token's \`totalSupply()\`${atBlock(c)}, both read at that block. A ratio of two integers in the same units, so no price and no conversion enters it. It is a share of the SHARES, which is a share of the pool: holders are not attributed to individual deposits, because shares are fungible and the vault pooled them.`,
  contract: vaultContract(c),
  via: `${LANE} · balanceOf(holder) ÷ totalSupply() @ the pinned block`,
  formula: "balanceOf(holder) ÷ totalSupply()",
});

/** `convertToAssets(shares)` — the vault's own answer. */
export const aaveVaultHolderClaimProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("convertToAssets(the holder's shares)", c),
  summary: `What those shares convert to — \`convertToAssets()\` asked with this address's exact share balance${atBlock(c)}, in ${asset(c)}. Answered by the vault rather than divided out by this page: the balance goes in as an argument and the contract's own conversion comes back, so the figure is the vault's arithmetic and not a restatement of it. What a redemption would actually return is a different question — this is a conversion at one block.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(holder shares) @ the pinned block`,
});

/** `maxRedeem(holder)` — where a zero is a STATE. */
export const aaveVaultMaxRedeemProv = (c: AaveVaultCoords, family: AaveVaultFamily): Provenance => {
  const mechanic =
    family === "umbrella-stake"
      ? `On a stake token this answers ZERO unless the block's own timestamp sits inside this holder's unstake window — so a zero beside a positive balance is the contract's state, not missing data and not a balance of nothing. The cooldown line beside it says which state the holder is in.`
      : family === "sgho"
        ? `sGHO has no cooldown and no queue: the only things that reduce this below the balance are the pause flag, which zeroes it outright, and the GHO the contract actually holds, which clamps what can leave.`
        : `A static aToken has no withdrawal delay, so this reads equal to the balance unless the reserve is inactive or paused, or the wrapper itself is.`;
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("maxRedeem(the holder)", c),
    summary: `Redeemable now — \`maxRedeem()\` for this address${atBlock(c)}, in shares. ${mechanic} A reading at one block; the contract can answer differently at the next.`,
    contract: vaultContract(c),
    via: `${LANE} · maxRedeem(holder) @ the pinned block`,
  };
};

/** `getStakerCooldown(holder)` — the struct the contract holds. */
export const aaveVaultCooldownStateProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("getStakerCooldown(the holder)", c),
  summary: `Cooldown state — \`getStakerCooldown()\` for this address${atBlock(c)}: the amount it covers, when the cooldown ends and how long the window after it lasts, exactly as the token stores them. Which of the four states that is — none started, waiting, open, or passed — is a comparison against THIS BLOCK's own timestamp, read with the block, never against the reader's clock. Only one cooldown record exists per address at a time, and an outgoing transfer decays it.`,
  contract: vaultContract(c),
  via: `${LANE} · getStakerCooldown(holder) @ the pinned block`,
});

/** What the holding address IS — a mechanism, never an identity. */
export const aaveVaultHolderShapeProv = (c: AaveVaultCoords, kind: string, codeSize: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("eth_getCode(the holder)", c),
  summary: `What this address is — \`eth_getCode\`${atBlock(c)} returned ${codeSize === 0 ? "no code" : `${codeSize} bytes`}, read as ${kind}. Every verdict here is a read: an empty answer is an externally owned account, a 23-byte \`0xef0100…\` code is the EIP-7702 delegation indicator, a released Safe singleton is an exact address match, an \`asset()\` plus a \`totalSupply()\` is a contract answering the ERC-4626 accessors, and an implementation slot is a pointer to another address to read. No app is named from any of it, and an address with a computed stake is not an identified person.`,
  contract: { name: "the holding address", address: c.holder },
  via: `${LANE} · eth_getCode(holder) @ the pinned block`,
});

/** THE NAME, and whose claim it is. A registry citation, not a reading of the
 *  chain: the figure under it is still the code read, and this says who publishes
 *  the address under that constant and where to check. */
export const aaveAttestedNameProv = (c: AaveVaultCoords, a: AttestedAddress): Provenance => ({
  // A PUBLISHED FILE IS OFFCHAIN, and the ladder says so rather than borrowing
  // the chain's class for a citation: rung 1 is a constant in a repository at a
  // commit, with no on-chain anchor of its own. Rung 2 IS a chain read — the
  // registry answered at the block beside it — and takes the chain's class.
  kind: a.via === "book" ? "offchain" : "chain",
  pclass: a.via === "book" ? "offchain" : "state",
  source: { block: a.via === "book" ? undefined : c.blockNumber },
  verify:
    a.via === "book"
      ? {
          kind: "none",
          text: `Open \`src/ts/${a.file}.ts\` at commit ${a.commit.slice(0, 10)} of \`aave-dao/aave-address-book\` and read \`${attestedShortName(a)}\``,
        }
      : recompute(`${a.enumerator?.call} on ${a.enumerator?.constant}`, c),
  summary: `The name of this address — ${attestedClause(a)}: ${a.what}. It is a REGISTRY CITATION and the distinction is the whole point: a verified source name in a block explorer is the name a deployer gave a file, and anyone can deploy a contract under any name. ${
    a.via === "book"
      ? "The commit is pinned rather than a branch, so a constant that moves shows up as a disagreement rather than as a silent update."
      : "The roster answer is a chain read at the block beside it, so an address published after the pinned commit is still found — a different and weaker claim than the book naming the address itself, and this says which."
  } Nothing about what the contract DOES is claimed beyond the publication's own vocabulary, and no app, owner or person is named from it.`,
  contract: { name: "the holding address", address: a.address },
  via:
    a.via === "book"
      ? `aave-dao/aave-address-book · src/ts/${a.file}.ts @ ${a.commit.slice(0, 10)}`
      : `${LANE} · ${a.enumerator?.call} @ the pinned block`,
});

// ─────────────────────────────────────────────────────────────────────────────
// THE VENUE CITATIONS
// ─────────────────────────────────────────────────────────────────────────────
// The directory answers "which of Aave's vaults does this address hold", and
// "which address does this transaction name". Both are the same distance class
// as everything above (`state`, plus one `emitted` for the receipt scan), and
// both carry the same two refusals: no USD, and no figure about anyone's share
// of a slashing.

/** The cross-link: this address is itself in the catalogue. */
export const aaveVaultCatalogueMemberProv = (c: AaveVaultCoords, what: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${what} is itself in this catalogue — its address came back from \`StataTokenFactory.getStataTokens()\` or \`Umbrella.getStkTokens()\` at this same block${atBlock(c)}, which is why it is linked rather than only printed. Membership is a chain fact and not a name: the test is whether an enumerator Aave publishes returned the address, and the same call that decided which vaults this section lists decided this.`,
  via: `${LANE} · the enumerators' own answer @ the pinned block`,
  formula: "address ∈ getStataTokens() ∪ getStkTokens() ∪ { GhoEthereum.SGHO }",
});

/** The venue's own pages, cited under the lookup. NOT a chain read and not a
 *  figure: an `offchain` receipt whose whole job is to say what the citation
 *  claims and what it does not. Two things it is careful to keep apart —
 *
 *   • THE PAGES ARE POINTED AT, NOT READ. No number anywhere on this site comes
 *     out of them. A receipt that said "sourced from Aave's docs" would put an
 *     off-chain leaf under figures that are slot reads, and one off-chain leaf
 *     makes the whole value's interpretation off-chain.
 *   • CITING THE VENUE IS NOT ATTRIBUTING A HOLDING. The find door drew tiles
 *     because the Base record identifies wallet software behind holders. Nothing
 *     on Ethereum identifies an app behind a holder of these vaults, and this
 *     receipt says so in the same breath as the citation, so the block cannot be
 *     read as a quieter version of a tile grid.
 */
export const aaveFirstPartySourcesProv = (count: number, fetchedOn: string): Provenance => ({
  kind: "offchain",
  pclass: "offchain",
  summary: `Aave's own pages — ${count.toLocaleString("en-US")} pages the venue publishes about the three families this directory lists, each fetched on ${fetchedOn} and answering 200; the \`aave.com/docs\` ones serve the same page as raw markdown under \`Accept: text/markdown\`. They are CITED, NOT READ: no figure on this site comes from them, and the claim made here is only that Aave publishes them. Nothing in this block attributes a holding to an app — a holder in this section is the holder's own wallet address, and no row names an app.`,
  verify: {
    kind: "none",
    text: "Open each page: they are Aave's own, at aave.com and app.aave.com, and nothing on this site is computed from them",
  },
  via: `aave.com and app.aave.com · fetched ${fetchedOn}`,
});

// ─────────────────────────────────────────────────────────────────────────────
// THE POSITION LISTING — /ethereum/aave/vaults/positions
// ─────────────────────────────────────────────────────────────────────────────
// Everything above is one lane: an `eth_call` at the block the page names. The
// listing has a SECOND lane, and mixing the two would be the one thing a
// receipt here must never let happen.
//
//   • THE LIVE LANE, unchanged. `balanceOf`, `convertToAssets(balanceOf)` and
//     `totalSupply()` at the block the response pinned. The receipts above
//     (`aaveVaultHolderSharesProv`, `…ClaimProv`, `…FractionProv`) are reused
//     verbatim for those three, because a card and a vault page must say ONE
//     thing about one figure.
//   • THE CENSUS LANE, new. Membership, the transfer count, the first and last
//     blocks and the holder's shape come from a sweep of the vault's WHOLE
//     `Transfer` stream, proven complete by Σ `balanceOf` == `totalSupply()`
//     wei-exact, run daily and stored. Its figures are at the CENSUS block, not
//     at the card's block, and every receipt below names that block and says
//     the figure came out of a store.
//
// A census figure is a chain reading that was kept, not a derived one: the
// sweep read logs at named blocks and the store holds what it read. So the
// class stays `chain` / `chain-derived` and the `via` names the store as well
// as the call — the rule the plan sets for a stored figure's receipt.
//
// WHAT NO RECEIPT HERE SAYS. No count is a rate, no balance is a value, and no
// holder is a person: the shape is a mechanism read out of `eth_getCode`, and
// an ENS name beside an address is that address's own reverse record, drawn as
// the address's claim about itself and nothing more.

/** The census lane's own `via`, so every stored figure names both the sweep
 *  that read it and the store that kept it. */
/** The census a stored figure came out of, named per chain: two daily jobs with
 *  the same method and the same completeness gate, one per chain. */
const censusLane = (c: AaveVaultCoords) =>
  `the daily ${c.chainId === 8453 ? "Base" : "Ethereum"} vault census (whole-Transfer sweep, Σ balanceOf == totalSupply)`;

const atCensus = (c: AaveVaultCoords): string =>
  c.censusBlock != null ? ` at block ${c.censusBlock.toLocaleString("en-US")}` : "";

/* The listing's own census receipts are gone with the drawer that carried
   them. The listing face states its two counts and its two blocks in one line
   with no <Prov> — a <Prov> is inert without an inspector, and that face mounts
   none — and the section's about page (/<chain>/vaults/info) states the same
   claims in words. What a figure on a CARD is a reading of still has its
   receipt: those are below, and the card mounts the inspector on the pages that
   draw it. */

/** The census's own `balanceOf` — what this card falls back to when the live
 *  read did not answer, labelled as the census's figure at the census block. */
export const aaveVaultCensusBalanceProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.censusBlock },
  verify: recompute("balanceOf(the holder)", { ...c, blockNumber: c.censusBlock }),
  summary: `Shares held at the census block — the ERC-20 \`balanceOf()\` of this vault's share token at ${c.holder ?? "the address"}${atCensus(c)}, read by the census and kept. It is stated here because the live read for this card did not answer, and an unread figure is stated as unread rather than shown as a zero or as a dash. What the address holds NOW is a different question and this page does not answer it.`,
  contract: vaultContract(c),
  via: `${censusLane(c)} · balanceOf(holder) @ the census block`,
});

/* The transfer COUNT has no receipt builder here any more. It is stated on the
   card by `PositionCardMeta`, the shared activity cluster, which is
   `data-prov-exempt` at its root by construction — the house's "event numbers"
   class, index row counts rather than chain-state figures — and carries what
   the count is in its own title instead. A builder nothing renders would be a
   receipt for a figure no surface states. */

/** The first and last blocks this address appears in the vault's stream. */
export const aaveVaultPositionSeenProv = (c: AaveVaultCoords, which: "first" | "last", block: number): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block },
  verify: {
    kind: "recompute",
    text: `Sweep this vault's Transfer logs to block ${c.censusBlock ?? "the census block"} and take the ${which === "first" ? "lowest" : "highest"} block of the ones naming this address`,
  },
  summary: `${which === "first" ? "First seen" : "Last activity"} — block ${block.toLocaleString("en-US")}, the ${which === "first" ? "lowest" : "highest"} block of any \`Transfer\` of this vault naming this address, out of the whole stream swept${atCensus(c)}. The date beside it is that block's own \`timestamp\`, read at that block and printed as one UTC instant, not a duration and not an inference from a block number. ${which === "last" ? "It is the last block this address moved shares of THIS vault — the address may have done anything at all since, elsewhere." : "Before it, this address had never held a share of this vault."}`,
  contract: vaultContract(c),
  via: `${censusLane(c)} · eth_getLogs(Transfer) + eth_getBlockByNumber @ the census block`,
});

/** What the holding address is, as the CENSUS classified it — the same reads as
 *  `aaveVaultHolderShapeProv`, made at the census block and kept. */
export const aaveVaultPositionShapeProv = (c: AaveVaultCoords, kind: string, codeSize: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.censusBlock },
  verify: recompute("eth_getCode(the holder)", { ...c, blockNumber: c.censusBlock }),
  summary: `What this address is — \`eth_getCode\`${atCensus(c)} returned ${codeSize === 0 ? "no code" : codeSize == null ? "code the census recorded no length for" : `${codeSize.toLocaleString("en-US")} bytes`}, read as ${kind}, and kept with the census row. Every verdict is a read: an empty answer is an externally owned account, a 23-byte \`0xef0100…\` code is the EIP-7702 delegation indicator, a released Safe singleton is an exact address match, an \`asset()\` plus a \`totalSupply()\` is a contract answering the ERC-4626 accessors, and an implementation slot is a pointer to another address to read. NO APP IS NAMED FROM ANY OF IT. A card states the mechanism and stops; what a contract does takes reading it, and nothing here reads it.`,
  contract: { name: "the holding address", address: c.holder },
  via: `${censusLane(c)} · eth_getCode(holder) @ the census block`,
});

/** The two lanes disagreeing — the card's one interpretive sentence, and it is
 *  stated rather than resolved. */
export const aaveVaultPositionDivergenceProv = (c: AaveVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Two readings, two blocks — the census read this address's \`balanceOf\`${atCensus(c)} and this page read it again${atBlock(c)}, and the two disagree about whether anything is held. Both are true of their own block; neither is stated alone, because showing one would let a reading at one block stand as a claim about another. What happened between them is in the address's own timeline on the vault's page.`,
  contract: vaultContract(c),
  via: `${LANE} · balanceOf(holder) @ the pinned block, beside ${censusLane(c)}`,
  formula: "balanceOf(holder) at the page's block, compared with balanceOf(holder) at the census block",
});

// ── the one priced figure: value in USD at the census block (mig 206) ────────
// Both receipts below name the SAME source — the chain's Aave V3 oracle,
// resolved from its PoolAddressesProvider by the census — because the charter's
// USD rule (S3) is that a dollar figure names its price source and block and is
// a real oracle read at that block. The oracle is Aave's, not this vault's own
// protocol's: MetaMorpho vaults sit on Morpho Blue, whose market oracles price
// collateral in loan-asset terms and never in USD, so a USD figure for a Base
// vault has to come from a feed on the same chain that does — and the receipt
// says so rather than letting "the oracle" stand for a feed the vault never
// used.

const chainWord = (c: AaveVaultCoords) => (c.chainId === 8453 ? "Base" : "Ethereum");
const oracleContract = (c: AaveVaultCoords, v: VaultPositionValue): Provenance["contract"] => ({
  name: `IAaveOracle (Aave V3 on ${chainWord(c)})`,
  address: v.oracle ?? undefined,
});
const usdOf = (e8: string): string => {
  const abs = e8.replace(/^-/, "");
  const whole = abs.length > 8 ? abs.slice(0, -8) : "0";
  const frac = abs.padStart(9, "0").slice(-8);
  return `${e8.startsWith("-") ? "-" : ""}${Number(whole).toLocaleString("en-US")}.${frac}`;
};

/** The position's value in USD at the census block — the balance through the
 *  vault's own conversion and the named oracle, every input at one block. */
export const aaveVaultValueUsdProv = (c: AaveVaultCoords, v: VaultPositionValue, shareDecimals: number): Provenance => {
  const block = v.pricedBlock ?? c.censusBlock;
  const assetSym = v.assetSymbol ?? "the vault's asset";
  const hop =
    v.underlyingUnitAssets != null
      ? ` That asset is itself an ERC-4626 wrapper the oracle does not price directly, so the price is its UNDERLYING's — \`getAssetPrice(${v.pricedAsset ?? "the underlying"})\` — with one whole ${assetSym} converted through the wrapper's own \`convertToAssets()\` (${v.underlyingUnitAssets} underlying units at block ${block ?? "the census block"}).`
      : "";
  return {
    kind: "chain-derived",
    pclass: "oracle",
    source: { block },
    verify: {
      kind: "recompute",
      text: `Re-run balanceOf(the holder) and convertToAssets(10^${shareDecimals}) on the vault, and getAssetPrice(${v.pricedAsset ?? "the asset"}) on the oracle, all at block ${block ?? "the census block"} against any ${chainWord(c)} archive node; multiply and truncate to 1e-8 dollars`,
    },
    summary: `Value in USD at the census block — this address's \`balanceOf()\` at block ${block ?? "the census block"}, through the vault's own \`convertToAssets()\` at that block (one whole share = ${v.shareUnitAssets ?? "?"} raw units of ${assetSym}), priced by Aave V3's oracle on ${chainWord(c)}: \`IAaveOracle.getAssetPrice(${v.pricedAsset ?? "the asset"})\` answered ${v.oraclePriceE8 != null ? usdOf(v.oraclePriceE8) : "?"} USD at the same block.${hop} Computed once by the daily census with integer arithmetic and truncated — never read for this page — so it is what the position was worth at THAT block and says nothing about now. The oracle is Aave's, the feed Aave itself liquidates against on this chain, and not this vault's own protocol's: it is named here because which oracle is a choice, and the figure is only as true as the feed it names.`,
    contract: oracleContract(c, v),
    via: `${censusLane(c)} · balanceOf(holder) × convertToAssets(1 share) × IAaveOracle.getAssetPrice(asset) @ the census block`,
    formula: `balanceOf(holder) ÷ 10^${shareDecimals} × convertToAssets(10^${shareDecimals}) ÷ 10^${v.assetDecimals ?? "assetDecimals"}${v.underlyingUnitAssets != null ? ` × ${v.underlyingUnitAssets} ÷ 10^${v.underlyingDecimals ?? "underlyingDecimals"}` : ""} × getAssetPrice(${v.pricedAsset ?? "asset"}) ÷ 1e8`,
  };
};

/** No USD figure, and why: the oracle declined the asset, or the census has not
 *  priced this vault yet. Two different absences, each said in its own words. */
export const aaveVaultUnpricedProv = (c: AaveVaultCoords, v: VaultPositionValue): Provenance => {
  const assetSym = v.assetSymbol ?? "the vault's asset";
  const block = v.pricedBlock ?? c.censusBlock;
  if (v.pricedBlock == null) {
    return {
      kind: "chain",
      pclass: "oracle",
      source: { block },
      verify: { kind: "none", text: "Nothing was read: there is no call to re-run until the census prices this vault" },
      summary: `Not priced — the daily census has not yet run its price pass over this vault, so no oracle was asked and no USD figure exists for it. An empty slot rather than a zero or a dash: nothing was read, and the card says so. The next census tick prices every vault it sweeps.`,
      contract: vaultContract(c),
      via: `${censusLane(c)} · no price columns yet`,
    };
  }
  return {
    kind: "chain",
    pclass: "oracle",
    source: { block },
    verify: {
      kind: "recompute",
      text: `Re-run getAssetPrice(${v.asset ?? "the asset"}) on the oracle at block ${block} against any ${chainWord(c)} archive node — it reverts, or answers 0`,
    },
    summary: `Not priced — Aave V3's oracle on ${chainWord(c)} (\`IAaveOracle.getAssetPrice\`) declined ${assetSym}${v.asset ? ` (${v.asset})` : ""} at block ${block}: the call reverted or answered zero, and a zero from a price feed is the feed declining, not a reading of value. So this card carries no USD figure at all — an empty slot, never a substitute from some other feed (chain-truth charter S3) — and the row sits outside every USD bracket and inside the listing's "Unpriced" set instead. Its shares, its claim in ${assetSym} and its share of the vault are stated exactly as they are.`,
    contract: oracleContract(c, v),
    via: `${censusLane(c)} · IAaveOracle.getAssetPrice(asset) @ the census block — declined`,
  };
};
