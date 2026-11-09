// The MetaMorpho vault-exposure receipts — one pinned block's reading of a Base
// vault, and of one holder's proportional slice of it.
// ----------------------------------------------------------------------------
// A sibling of lib/morpho/markets-provenance.ts, for a different question. That
// vocabulary traces the Blue markets themselves; this one traces a VAULT sitting
// on top of them, and the arithmetic that turns a share balance into a per-market
// figure.
//
// Distance classes, graded as the ladder does:
//   • state   — a slot read at the pinned block: the vault's own `totalAssets()`,
//     `totalSupply()`, `balanceOf(holder)`, and Blue's `market(id)` /
//     `position(id, vault)`. Third-party verifiable: re-run the eth_call at that
//     block against any node.
//   • derived — arithmetic over such reads: Σ over the legs, the gap between two
//     of them, a leg's share of the total, and the attribution itself.
// No oracle class, and no USD: every figure is a quantity of the vault's own
// asset or of its own shares, exactly as the Blue market surface is.
//
// THREE THINGS THESE RECEIPTS MUST KEEP STRAIGHT, because a smoothed-over version
// of any of them would read as a stronger claim than the chain supports:
//
//  1. ATTRIBUTION IS NOT FUND-TRACING. `attributed` is the holder's share of the
//     vault applied to the vault's own position in a market. Shares are fungible
//     and deposits were pooled before they were allocated, so no on-chain fact
//     ties a particular depositor's asset to a particular market. Two holders
//     with equal shares have equal figures whatever they deposited or when. Every
//     attribution receipt says this in its own summary rather than relying on the
//     page's prose to carry it.
//  2. THE LEGS ARE STORED, THE VAULT'S TOTAL IS EXTRAPOLATED. Blue accrues only
//     when a market is touched, so `market(id)` totals are each market's last
//     settled state; MetaMorpho's `totalAssets()` projects interest to the block
//     timestamp. The gap between them is a figure in its own right and its
//     receipt states both sides of it.
//  3. THE VAULT'S OWN ANSWER IS THE VAULT'S. `convertToAssets(shares)` is quoted
//     as MetaMorpho's figure, not ours, and it is shown BESIDE our Σ of the
//     stored legs rather than instead of it. It is not a rounding of that Σ: it
//     converts against the extrapolated `totalAssets()` (which pulls it up) AND
//     against a supply that includes the performance-fee shares the next accrual
//     would mint (which pulls it down — about 7 parts per million on the
//     case-study vault, measured). So either figure can be the larger, and no
//     receipt here asserts an order between them.

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance } from "@/components/shared/provenance";
import { MORPHO_BASE_BLUE } from "@/lib/morpho-base/asset-catalog";

/** The chain a receipt's reads were on: Base unless the coordinates say Ethereum. */
const chainWord = (c: MorphoVaultCoords) => (c.chainId === 1 ? "Ethereum" : "Base");
const lane = (c: MorphoVaultCoords) =>
  c.chainId === 1
    ? "live Ethereum chain reads (/ethereum/morpho/vaults)"
    : "live Base chain reads (/base/morpho/vaults)";

export interface MorphoVaultCoords {
  /** The chain the vault is on; Base where omitted. */
  chainId?: number;
  /** rails-server's read of `blockNumber`, when it answered every read of the page. */
  readBy?: ServerRead | null;
  /** The block every figure was read at — every receipt's `source` block. */
  blockNumber?: number;
  /** The vault contract — the `contract` on every MetaMorpho-side receipt. */
  vault?: string;
  /** The vault's own name at that block, for prose. */
  vaultName?: string;
  /** The ERC-4626 underlying's symbol — the unit every asset figure speaks in. */
  assetSymbol?: string;
  /** The vault share token's symbol — the unit every share figure speaks in. */
  shareSymbol?: string;
  /** The Blue market a leg receipt belongs to. */
  marketId?: string;
  /** That market's collateral symbol, or null on the idle market. */
  collateralSymbol?: string | null;
  /** The holder an attribution receipt is about. */
  holder?: string;
}

const blueContract = (): Provenance["contract"] => ({ name: "Morpho Blue", address: MORPHO_BASE_BLUE });

const vaultContract = (c: MorphoVaultCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (MetaMorpho)` : "MetaMorpho vault",
  address: c.vault,
});

const atBlock = (c: MorphoVaultCoords): string => (c.blockNumber != null ? ` at block ${c.blockNumber}` : "");

const recompute = (call: string, c: MorphoVaultCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    c.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${c.blockNumber} against any ${chainWord(c)} node`
      : `Re-run the ${call} eth_call against any ${chainWord(c)} node`,
});

const asset = (c: MorphoVaultCoords) => c.assetSymbol ?? "the vault's asset";
const legName = (c: MorphoVaultCoords) => (c.collateralSymbol ? `${c.collateralSymbol} market` : "the idle market");

// ── what the vault says about itself ─────────────────────────────────────────

/** `totalAssets()` — MetaMorpho's OWN figure for what the vault holds. It walks
 *  the supply queue and adds interest accrued to the block timestamp, so it is
 *  ahead of the stored market totals the allocation table sums. */
const vaultTotalAssetsProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.totalAssets()", c),
  summary: `Total assets — the vault's own \`totalAssets()\`${atBlock(c)}, in ${asset(c)}. MetaMorpho computes it by walking its supply queue and EXTRAPOLATING each market's interest to this block's timestamp, so it stands ahead of the stored market totals the allocation table sums. Both figures are on the page, and the difference between them is stated as its own number.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.totalAssets() @ the pinned block`,
});

// `lastTotalAssets()` travels in the loader's response and has NO builder here,
// deliberately: the page does not render it, and a receipt for a figure nothing
// shows is the orphaned-builder shape `npm run check:dead` exists to keep out.
// Give it one the same change that renders it.

/** `totalSupply()` — every vault share in existence. The denominator of every
 *  attribution on the page. */
const vaultTotalSupplyProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.totalSupply()", c),
  summary: `Total shares — the ERC-20 \`totalSupply()\` of the vault's own share token${atBlock(c)}. Every share in existence, and the denominator of every proportional figure on this page.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.totalSupply() @ the pinned block`,
});

/** `convertToAssets(10^decimals)` — one whole share, priced by the vault itself. */
const vaultSharePriceProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.convertToAssets(1 share)", c),
  summary: `Share price — \`convertToAssets(10^decimals)\`${atBlock(c)}: what ONE whole vault share converts to in ${asset(c)}, answered by the vault. It carries the same extrapolation \`totalAssets()\` does.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.convertToAssets(one share) @ the pinned block`,
});

/** `lostAssets()` — V1.1's own ledger of the shortfall it has NOT taken off the share price. Never shown
 *  for a V1.0 vault: that family reverts on the call, and a revert is not a zero. */
const vaultLostAssetsProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.lostAssets()", c),
  summary: `Lost assets — \`lostAssets()\`${atBlock(c)}, in ${asset(c)}: the part of the vault's stated total that no market holds. When a market loses asset (bad debt, or a market removed by force), a V1.1 vault does not lower its share price; it keeps \`totalAssets()\` where it stood and records the shortfall here. So this much of \`totalAssets()\`, and of the share price, is not backed by anything the vault holds. It is not a fee and not interest owed. This is a MetaMorpho V1.1 ledger; a V1.0 vault reverts on the call and this figure is absent for one rather than shown as zero.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.lostAssets() @ the pinned block`,
});

/** Held — `totalAssets() − lostAssets()`, what a V1.1 vault's markets hold
 *  (ui-jobs 543). Recomputable from the two reads; the raw values are inputs. */
const vaultHeldAssetsProv_ = (c: MorphoVaultCoords, r: { totalAssets: string; lostAssets: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Re-run MetaMorpho.totalAssets() and MetaMorpho.lostAssets()${atBlock(c)} against any ${chainWord(c)} node and subtract`,
  },
  summary: `Held — the vault's \`totalAssets()\` minus its \`lostAssets()\`${atBlock(c)}, in ${asset(c)}: what its markets hold. Total assets and the share price are stated with the loss included; the holders who withdraw last carry it.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.totalAssets() − MetaMorpho.lostAssets() @ the pinned block`,
  formula: "totalAssets − lostAssets",
  inputs: [
    {
      label: "totalAssets",
      value: r.totalAssets,
      kind: "chain",
      pclass: "state",
      note: "MetaMorpho.totalAssets(), raw",
    },
    { label: "lostAssets", value: r.lostAssets, kind: "chain", pclass: "state", note: "MetaMorpho.lostAssets(), raw" },
  ],
});

// ── what Blue says the vault holds ───────────────────────────────────────────

/** One leg's assets — Blue's own share→asset conversion on the market's STORED
 *  totals, for the vault's own supply position. */
const vaultLegAssetsProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `The vault's supplied ${asset(c)} in ${legName(c)} — its \`position(id, vault).supplyShares\` converted at the market's stored totals${atBlock(c)}. STORED state: Blue accrues interest only when a market is TOUCHED, so \`market(id)\` holds what that market last settled at its \`lastUpdate\`, and nothing here projects it forward.`,
  contract: blueContract(),
  via: `${lane(c)} · Morpho.position(id, vault) and Morpho.market(id) @ the pinned block`,
  formula: "supplyShares × totalSupplyAssets ÷ totalSupplyShares",
  inputs: [
    {
      label: "supplyShares",
      kind: "chain",
      pclass: "state",
      note: "Morpho.position(id, vault).supplyShares — the vault's own supply position in this market",
      contract: { name: "Morpho Blue", address: MORPHO_BASE_BLUE },
    },
    {
      label: "totalSupplyAssets",
      kind: "chain",
      pclass: "state",
      note: "Morpho.market(id).totalSupplyAssets — stored, at the market's lastUpdate",
      contract: { name: "Morpho Blue", address: MORPHO_BASE_BLUE },
    },
    {
      label: "totalSupplyShares",
      kind: "chain",
      pclass: "state",
      note: "Morpho.market(id).totalSupplyShares — stored, at the market's lastUpdate",
      contract: { name: "Morpho Blue", address: MORPHO_BASE_BLUE },
    },
  ],
});

/** A leg's share of the allocated total — a ratio of two figures in the same
 *  token, so the decimals cancel and no price is needed. */
const vaultLegShareProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `How much of the vault's allocated ${asset(c)} sits in ${legName(c)} — this leg's stored assets over the sum of all of them${atBlock(c)}. A ratio of two amounts in the same token, so it needs no price and no oracle is asked.`,
  contract: blueContract(),
  via: `${lane(c)} · one leg ÷ Σ legs @ the pinned block`,
  formula: "leg assets ÷ Σ leg assets",
});

/** The market's one rung. Immutable, and self-verifying: the id IS the hash of
 *  the params. */
const vaultLegLltvProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: "The market id is keccak256(abi.encode(params)); recompute the hash from these params — or call idToMarketParams(id) — to confirm this lltv defines the market.",
  },
  summary: `Loan-to-value for ${legName(c)} — \`idToMarketParams(id).lltv\`${atBlock(c)}, the market's ONE risk number: the borrow limit and the liquidation line at once. Fixed at creation and immutable, because the market id IS keccak256(abi.encode(params)).`,
  contract: blueContract(),
  via: `${lane(c)} · Morpho.idToMarketParams(id).lltv`,
});

/** Σ over the withdraw queue of each leg's stored assets — the vault's position
 *  in Blue as Blue itself last settled it. */
const vaultAllocatedProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Allocated in Morpho Blue — Σ over every market in the vault's withdraw queue of the ${asset(c)} its supply shares convert to at that market's STORED totals${atBlock(c)}. A sum of amounts in one token, so it is a real quantity. It is not \`totalAssets()\`: this side is Blue's last settled state, and the vault's own figure extrapolates past it.`,
  contract: blueContract(),
  via: `${lane(c)} · Σ over MetaMorpho.withdrawQueue of Morpho.position/market @ the pinned block`,
  formula: "Σ (supplyShares × totalSupplyAssets ÷ totalSupplyShares)",
  inputs: [
    {
      label: "withdrawQueue(i)",
      kind: "chain",
      pclass: "state",
      note: "MetaMorpho.withdrawQueue — the vault's own list of the markets it allocates to",
    },
    {
      label: "leg assets",
      kind: "chain-derived",
      pclass: "state",
      note: "each leg's stored assets, one row of the allocation table",
    },
  ],
});

/** totalAssets − Σ legs. Interest the vault has extrapolated and the markets have
 *  not yet settled, plus whatever the vault carries outside its Blue positions. */
const vaultGapProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Unaccrued interest — the vault's own \`totalAssets()\` minus the Σ of its stored Blue legs${atBlock(c)}. Two readings of the same holdings at the same block: MetaMorpho extrapolates each market's interest to this block's timestamp, Blue's \`market(id)\` holds what each market last SETTLED. The difference is stated, and it also carries any asset the vault holds outside its Blue positions.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.totalAssets() − Σ legs @ the pinned block`,
  formula: "totalAssets − Σ leg assets",
  inputs: [
    {
      label: "totalAssets",
      kind: "chain",
      pclass: "state",
      note: "MetaMorpho.totalAssets(), extrapolated to the block",
    },
    {
      label: "Σ leg assets",
      kind: "chain-derived",
      pclass: "state",
      note: "the allocation table's total, stored state",
    },
  ],
});

// ── one holder ───────────────────────────────────────────────────────────────

// ── the directory: every catalogued vault, at one block ──────────────────────
// The roster lists the census itself: one row per catalogued
// vault, grouped by asset, with the vault's live name, its `totalAssets()` and
// its curator read at ONE pinned block. Four kinds of figure, and what each is:
// the CENSUS count (a sweep of the two factories' creation events, a floor);
// per row three STATE reads (`name()`, `totalAssets()`, `curator()`/`owner()`);
// and DERIVED counts over those reads (how many vaults an asset group holds,
// how many hold nothing). The directory is cached for five minutes and prints
// the block it describes, which every receipt below also names.

/** How many vaults the directory lists — the census roster's size, and what it
 *  is a count OF: every vault the two MetaMorpho factories on Base had deployed
 *  at the census block, found by sweeping their `CreateMetaMorpho` events. A
 *  FLOOR: a MetaMorpho deployed without a factory emits no such event and is
 *  absent; vaults created since the census block are absent until it re-runs;
 *  the Vault V2 family is not catalogued at all. */
const vaultDirectoryCensusProv_ = (
  c: MorphoVaultCoords,
  census: { catalogSize: number; censusBlock: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: census.censusBlock },
  verify: {
    kind: "recompute",
    text: `Sweep CreateMetaMorpho on both MetaMorpho factories on ${chainWord(c)} from each factory's first block to block ${census.censusBlock} and count the vaults`,
  },
  summary: `Vaults catalogued — ${census.catalogSize.toLocaleString("en-US")}: every vault the two MetaMorpho factories on ${chainWord(c)} (v1.0 and v1.1) had deployed at ${chainWord(c)} block ${census.censusBlock.toLocaleString("en-US")}, each one a \`CreateMetaMorpho\` event on its factory. THE ROSTER IS A FLOOR, not a total: a MetaMorpho compiled and deployed without a factory emits no creation event and is absent from it, a vault created after the census block is absent until the census re-runs, and the Vault V2 family is not catalogued. The directory lists exactly these.`,
  via: `${lane(c)} · CreateMetaMorpho on both factories, censused to block ${census.censusBlock}`,
  formula: "count of CreateMetaMorpho events on the v1.0 and v1.1 factories up to the census block",
});

/** `name()` — the vault's own current name, read live because it is MUTABLE:
 *  MetaMorpho V1.1 lets the owner rename, and 44 of 505 answered a different
 *  name at the census than their creation log carries. */
const vaultDirectoryNameProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.name()", c),
  summary: `Vault name — the ERC-20 \`name()\` of the vault's share token${atBlock(c)}, read live rather than taken from the census: a MetaMorpho V1.1 owner can rename the vault (\`setName\`), so the name is a reading at this block and not an identity. Two vaults may share a name; the address beside it is what tells them apart.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.name() @ the pinned block`,
});

/** `totalAssets()` on a directory row — the vault's own figure for what it
 *  holds, in its asset. The directory orders a group by it and never compares
 *  it across assets. */
const vaultDirectoryTotalAssetsProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.totalAssets()", c),
  summary: `Total assets — the vault's own \`totalAssets()\`${atBlock(c)}, in ${asset(c)}. MetaMorpho computes it by walking its supply queue and extrapolating each market's interest to this block's timestamp. It is a quantity of ${asset(c)} and is compared only with other vaults in the same asset: the directory groups by asset and never orders or sums across two of them, because that would take a price this page does not read. A zero here is a reading — the vault holds nothing at this block — not an absence.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.totalAssets() @ the pinned block`,
});

/** `convertToAssets(10^18)` on a directory row — one whole share, priced by the
 *  vault itself, in its own asset. The exponent is fixed at 18 rather than read
 *  per vault (see the loader's header note); it is the same call the per-vault
 *  page's `vaultSharePriceProv` makes, over the same 18-decimal share
 *  assumption `totalSupply` above already relies on. */
const vaultDirectorySharePriceProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.convertToAssets(1 share)", c),
  summary: `Share price — \`convertToAssets(10^18)\`${atBlock(c)}: what ONE whole vault share converts to in ${asset(c)}, answered by the vault. It carries the same extrapolation \`totalAssets()\` does, and is a quantity of ${asset(c)} only — never compared or summed across a group boundary, and never converted to USD.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.convertToAssets(one share) @ the pinned block`,
});

/** How many catalogued vaults in one asset hold something at the block — a
 *  count over the rows' `totalAssets()` reads, and the size of a group. */
const vaultDirectoryGroupCountProv_ = (c: MorphoVaultCoords, n: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n === 1 ? "One vault" : `${n.toLocaleString("en-US")} vaults`} denominated in ${asset(c)} with a non-zero \`totalAssets()\`${atBlock(c)} — a count over the directory's own reads, one per catalogued vault whose immutable \`asset()\` is ${asset(c)}. Vaults in this asset that read zero are counted in the trailing group instead, not dropped.`,
  via: `${lane(c)} · count of catalogued vaults with asset() = ${asset(c)} and totalAssets() > 0 @ the pinned block`,
  formula: `count of catalogued vaults where asset() = ${asset(c)} and totalAssets() > 0`,
});

/** How many catalogued vaults hold nothing at the block. A READING, not an
 *  omission: each answered zero to `totalAssets()`; a vault whose read did not
 *  answer is counted separately and never here. */
const vaultDirectoryEmptyCountProv_ = (c: MorphoVaultCoords, n: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n.toLocaleString("en-US")} of the ${catalogSize.toLocaleString("en-US")} catalogued vaults answered zero to \`totalAssets()\`${atBlock(c)} — each holds nothing at this block. That is a reading about each vault, not a gap in the read: a vault whose call did not answer is stated as unread, separately, and is not in this count.`,
  via: `${lane(c)} · count of catalogued vaults with totalAssets() = 0 @ the pinned block`,
  formula: "count of catalogued vaults where totalAssets() = 0",
});

// ── the position census ──────────────────────────────────────────────────────
// The roster rows' Holders figure carries the receipt every family's vault row
// shares (lib/vaults/row-provenance.ts `vaultHoldersProv`).

/* The listing's own census receipt, and the one that stated the lane's
   `finalized` block beside it, are gone with the drawer that carried them: the
   listing face states its counts and its blocks in one line with no <Prov>, and
   the section's about page says the rest in words. The `finalized` cut is still
   receipted where it is READ — on a position page's timeline
   (lib/morpho-base/vault-timeline-provenance.ts), beside the rows it decides. */

// Receipts over a page's reads stamp rails-server's head read when the coordinates carry it.
export const vaultTotalAssetsProv = withServerRead(vaultTotalAssetsProv_);
export const vaultTotalSupplyProv = withServerRead(vaultTotalSupplyProv_);
export const vaultSharePriceProv = withServerRead(vaultSharePriceProv_);
export const vaultLostAssetsProv = withServerRead(vaultLostAssetsProv_);
export const vaultHeldAssetsProv = withServerRead(vaultHeldAssetsProv_);
export const vaultLegAssetsProv = withServerRead(vaultLegAssetsProv_);
export const vaultLegShareProv = withServerRead(vaultLegShareProv_);
export const vaultLegLltvProv = withServerRead(vaultLegLltvProv_);
export const vaultAllocatedProv = withServerRead(vaultAllocatedProv_);
export const vaultGapProv = withServerRead(vaultGapProv_);
export const vaultDirectoryCensusProv = withServerRead(vaultDirectoryCensusProv_);
export const vaultDirectoryNameProv = withServerRead(vaultDirectoryNameProv_);
export const vaultDirectoryTotalAssetsProv = withServerRead(vaultDirectoryTotalAssetsProv_);
export const vaultDirectorySharePriceProv = withServerRead(vaultDirectorySharePriceProv_);
export const vaultDirectoryGroupCountProv = withServerRead(vaultDirectoryGroupCountProv_);
export const vaultDirectoryEmptyCountProv = withServerRead(vaultDirectoryEmptyCountProv_);
