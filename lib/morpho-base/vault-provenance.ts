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
import type { VaultGapLost } from "@/lib/morpho-base/vault-gap";

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

const atBlock = (c: MorphoVaultCoords): string =>
  c.blockNumber != null ? ` at block ${c.blockNumber.toLocaleString("en-US")}` : "";

const recompute = (call: string, c: MorphoVaultCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    c.blockNumber != null
      ? `To check: ask any ${chainWord(c)} archive node for the vault's ${call} at block ${c.blockNumber}.`
      : `To check: ask any ${chainWord(c)} archive node for the vault's ${call}.`,
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
  verify: recompute("totalAssets()", c),
  summary: `Total assets — what the vault holds${atBlock(c)}, in ${asset(c)}. MetaMorpho computes it by walking its withdraw queue and extrapolating each market's interest to this block's timestamp, so it stands ahead of the stored market totals the allocation table sums. Both figures are on the page.`,
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
  verify: recompute("totalSupply()", c),
  summary: `Shares issued — every share in existence${atBlock(c)}, the denominator of every proportional figure on this page.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.totalSupply() @ the pinned block`,
});

/** `convertToAssets(10^decimals)` — one whole share, priced by the vault itself. */
const vaultSharePriceProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("convertToAssets(10^decimals)", c),
  summary: `Share price — what one whole vault share converts to${atBlock(c)}, in ${asset(c)}, as the vault answers it. It carries the same interest extrapolation as total assets.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.convertToAssets(one share) @ the pinned block`,
});

/** `lostAssets()` — V1.1's own ledger of the shortfall it has NOT taken off the share price. Never shown
 *  for a V1.0 vault: that family reverts on the call, and a revert is not a zero. */
const vaultLostAssetsProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("lostAssets()", c),
  summary: `Lost assets — the part of the vault's stated total that no market holds${atBlock(c)}, in ${asset(c)}. When a market loses assets (bad debt, or a market removed by force), a V1.1 vault does not lower its share price; it keeps total assets where they stood and records the shortfall here. So this much of total assets, and of the share price, is not backed by anything the vault holds. A V1.0 vault has no such ledger, and the figure is absent for it.`,
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
    text: `To check: ask any ${chainWord(c)} archive node for the vault's totalAssets() and lostAssets()${c.blockNumber != null ? ` at block ${c.blockNumber}` : ""} and subtract the second from the first.`,
  },
  summary: `Held — total assets minus lost assets${atBlock(c)}, in ${asset(c)}: what the vault's markets hold. Total assets and the share price include the loss; by Morpho's docs, the last holders to withdraw carry it.`,
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
  summary: `The vault's supplied ${asset(c)} in ${legName(c)} — its supply shares in the market, converted at the market's stored totals${atBlock(c)}. Stored state: Morpho Blue accrues interest only when a market is touched, so the market holds what it last settled, and nothing here projects it forward.`,
  contract: blueContract(),
  via: `${lane(c)} · Morpho.position(id, vault) and Morpho.market(id) @ the pinned block`,
  formula: "supplyShares × totalSupplyAssets ÷ totalSupplyShares",
  inputs: [
    {
      label: "supplyShares",
      kind: "chain",
      pclass: "state",
      note: "Morpho.position(id, vault).supplyShares — the vault's supply position in this market",
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
  summary: `How much of the vault's allocated ${asset(c)} sits in ${legName(c)} — this leg's stored assets over the sum of all of them${atBlock(c)}.`,
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
    text: `To check: hash the market's parameters (the market id is keccak256(abi.encode(params))), or ask any ${chainWord(c)} archive node for idToMarketParams(id) on the Morpho Blue contract, and confirm this LLTV is among the parameters that define the market.`,
  },
  summary: `LLTV for ${legName(c)} — the market's Liquidation Loan-To-Value${atBlock(c)}: by Morpho's docs, the maximum LTV a borrower's position can reach before it becomes eligible for liquidation. It is fixed when the market is created and cannot change, because the market id is the hash of its parameters.`,
  contract: blueContract(),
  via: `${lane(c)} · Morpho.idToMarketParams(id).lltv`,
});

/** Σ over the withdraw queue of each leg's stored assets — the vault's position
 *  in Blue as Blue itself last settled it. */
const vaultAllocatedProv_ = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Allocated in Morpho Blue — the sum, over every market in the vault's withdraw queue, of the ${asset(c)} its supply shares convert to at that market's stored totals${atBlock(c)}. It differs from total assets: this side is Morpho Blue's last settled state, and the vault's figure extrapolates past it.`,
  contract: blueContract(),
  via: `${lane(c)} · Σ over MetaMorpho.withdrawQueue of Morpho.position/market @ the pinned block`,
  formula: "Σ (supplyShares × totalSupplyAssets ÷ totalSupplyShares)",
  inputs: [
    {
      label: "withdrawQueue(i)",
      kind: "chain",
      pclass: "state",
      note: "MetaMorpho.withdrawQueue — the vault's list of the markets it allocates to",
    },
    {
      label: "leg assets",
      kind: "chain-derived",
      pclass: "state",
      note: "each leg's stored assets, one row of the allocation table",
    },
  ],
});

/** Unaccrued interest: totalAssets − Σ legs, less the stored lostAssets where a
 *  V1.1 vault has stored any (ui-jobs 688). Interest the vault has extrapolated
 *  and the markets have not yet settled. */
/** `lost`: what the figure did with lost assets (lib/morpho-base/vault-gap.ts). */
const GAP_LOST_SENTENCE: Record<VaultGapLost, string> = {
  subtracted:
    " On this V1.1 vault the lost assets the vault last stored are subtracted too, so a loss since its last interaction stays in this figure until the next one.",
  zero: " This V1.1 vault has stored no lost assets; a loss since its last interaction would show here until the next one.",
  unread:
    " This V1.1 vault's stored lost assets did not answer at this block, so none are subtracted and any loss is in this figure.",
  "no-ledger": "",
};

const vaultGapProv_ = (c: MorphoVaultCoords, lost: VaultGapLost): Provenance => {
  const sub = lost === "subtracted";
  const block = c.blockNumber != null ? ` at block ${c.blockNumber}` : "";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: sub
        ? `To check: ask any ${chainWord(c)} archive node for the vault's totalAssets() and lostAssets()${block}, and subtract the allocation table's total and then the lost assets from the total assets.`
        : `To check: ask any ${chainWord(c)} archive node for the vault's totalAssets()${block}, and subtract the allocation table's total.`,
    },
    summary: `Unaccrued interest — total assets minus the sum of the stored Morpho Blue legs${atBlock(c)}. MetaMorpho extrapolates each market's interest to this block's timestamp, and Morpho Blue holds what each market last settled; the difference is that interest.${GAP_LOST_SENTENCE[lost] ?? ""}`,
    contract: vaultContract(c),
    via: sub
      ? `${lane(c)} · MetaMorpho.totalAssets() − Σ legs − MetaMorpho.lostAssets() @ the pinned block`
      : `${lane(c)} · MetaMorpho.totalAssets() − Σ legs @ the pinned block`,
    formula: sub ? "totalAssets − Σ leg assets − lostAssets" : "totalAssets − Σ leg assets",
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
      ...(sub
        ? [
            {
              label: "lostAssets",
              kind: "chain" as const,
              pclass: "state" as const,
              note: "MetaMorpho.lostAssets(), as the vault last stored it",
            },
          ]
        : []),
    ],
  };
};

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
    text: `To check: ask any ${chainWord(c)} archive node for the CreateMetaMorpho logs of both MetaMorpho factories, from each factory's first block to block ${census.censusBlock}, and count the vaults.`,
  },
  summary: `Vaults catalogued — ${census.catalogSize.toLocaleString("en-US")}: every vault the two MetaMorpho factories on ${chainWord(c)} (v1.0 and v1.1) had deployed at ${chainWord(c)} block ${census.censusBlock.toLocaleString("en-US")}, each one a creation event on its factory. The roster is a floor: a vault deployed without a factory emits no creation event and is absent, a vault created after the census block is absent until the census runs again, and the Vault V2 family is not catalogued. The directory lists these vaults.`,
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
  verify: recompute("name()", c),
  summary: `Vault name — the name of the vault's share token${atBlock(c)}, read live. A MetaMorpho V1.1 owner can rename the vault, so the name is a reading at this block. Two vaults may share a name; the address beside it tells them apart.`,
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
  verify: recompute("totalAssets()", c),
  summary: `Total assets — what the vault holds${atBlock(c)}, in ${asset(c)}. MetaMorpho computes it by walking its withdraw queue and extrapolating each market's interest to this block's timestamp. The directory groups vaults by asset and compares only within a group, since a comparison across assets needs a price this page does not read. A zero means the vault holds nothing at this block.`,
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
  verify: recompute("convertToAssets(10^18)", c),
  summary: `Share price — what one whole vault share converts to${atBlock(c)}, in ${asset(c)}, as the vault answers it. It carries the same interest extrapolation as total assets. The directory compares it only within one asset group.`,
  contract: vaultContract(c),
  via: `${lane(c)} · MetaMorpho.convertToAssets(one share) @ the pinned block`,
});

/** How many catalogued vaults hold nothing at the block. A READING, not an
 *  omission: each answered zero to `totalAssets()`; a vault whose read did not
 *  answer is counted separately and never here. */
const vaultDirectoryEmptyCountProv_ = (c: MorphoVaultCoords, n: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n.toLocaleString("en-US")} of the ${catalogSize.toLocaleString("en-US")} catalogued vaults hold nothing${atBlock(c)} — each answered zero for its total assets. A vault whose call did not answer is stated as unread and is not in this count.`,
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
export const vaultDirectoryEmptyCountProv = withServerRead(vaultDirectoryEmptyCountProv_);
