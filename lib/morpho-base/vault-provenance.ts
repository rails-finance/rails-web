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

import type { Provenance } from "@/components/shared/provenance";
import { MORPHO_BASE_BLUE } from "@/lib/morpho-base/asset-catalog";
import type { MorphoBaseVaultHolderShape } from "@/lib/sources/chain/morpho-base-vault";

const LANE = "live Base chain reads (/base/morpho/vaults)";

export interface MorphoVaultCoords {
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
      ? `Re-run the ${call} eth_call at block ${c.blockNumber} against any Base node`
      : `Re-run the ${call} eth_call against any Base node`,
});

const asset = (c: MorphoVaultCoords) => c.assetSymbol ?? "the vault's asset";
const legName = (c: MorphoVaultCoords) => (c.collateralSymbol ? `${c.collateralSymbol} market` : "the idle market");

// ── what the vault says about itself ─────────────────────────────────────────

/** `totalAssets()` — MetaMorpho's OWN figure for what the vault holds. It walks
 *  the supply queue and adds interest accrued to the block timestamp, so it is
 *  ahead of the stored market totals the allocation table sums. */
export const vaultTotalAssetsProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.totalAssets()", c),
  summary: `Total assets — the vault's own \`totalAssets()\`${atBlock(c)}, in ${asset(c)}. MetaMorpho computes it by walking its supply queue and EXTRAPOLATING each market's interest to this block's timestamp, so it stands ahead of the stored market totals the allocation table sums. Both figures are on the page, and the difference between them is stated as its own number rather than reconciled away.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.totalAssets() @ the pinned block`,
});

// `lastTotalAssets()` travels in the loader's response and has NO builder here,
// deliberately: the page does not render it, and a receipt for a figure nothing
// shows is the orphaned-builder shape `npm run check:dead` exists to keep out.
// Give it one the same change that renders it.

/** `totalSupply()` — every vault share in existence. The denominator of every
 *  attribution on the page. */
export const vaultTotalSupplyProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.totalSupply()", c),
  summary: `Total shares — the ERC-20 \`totalSupply()\` of the vault's own share token${atBlock(c)}. Every share in existence, and the denominator of every proportional figure on this page.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.totalSupply() @ the pinned block`,
});

/** `convertToAssets(10^decimals)` — one whole share, priced by the vault itself. */
export const vaultSharePriceProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.convertToAssets(1 share)", c),
  summary: `Share price — \`convertToAssets(10^decimals)\`${atBlock(c)}: what ONE whole vault share converts to in ${asset(c)}, answered by the vault rather than divided out by this page. It carries the same extrapolation \`totalAssets()\` does.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.convertToAssets(one share) @ the pinned block`,
});

/** `lostAssets()` — V1.1's own ledger of the shortfall it has NOT taken off the share price. Never shown
 *  for a V1.0 vault: that family reverts on the call, and a revert is not a zero. */
export const vaultLostAssetsProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.lostAssets()", c),
  summary: `Lost assets — \`lostAssets()\`${atBlock(c)}, in ${asset(c)}: the part of the vault's stated total that no market holds. When a market loses asset (bad debt, or a market removed by force), a V1.1 vault does not lower its share price; it keeps \`totalAssets()\` where it stood and records the shortfall here. So this much of \`totalAssets()\`, and of the share price, is not backed by anything the vault holds. It is not a fee and not interest owed. This is a MetaMorpho V1.1 ledger; a V1.0 vault reverts on the call and this figure is absent for one rather than shown as zero.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.lostAssets() @ the pinned block`,
});

// ── what Blue says the vault holds ───────────────────────────────────────────

/** One leg's assets — Blue's own share→asset conversion on the market's STORED
 *  totals, for the vault's own supply position. */
export const vaultLegAssetsProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `The vault's supplied ${asset(c)} in ${legName(c)} — its \`position(id, vault).supplyShares\` converted at the market's stored totals${atBlock(c)}. STORED state: Blue accrues interest only when a market is TOUCHED, so \`market(id)\` holds what that market last settled at its \`lastUpdate\`, and nothing here projects it forward.`,
  contract: blueContract(),
  via: `${LANE} · Morpho.position(id, vault) and Morpho.market(id) @ the pinned block`,
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
export const vaultLegShareProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `How much of the vault's allocated ${asset(c)} sits in ${legName(c)} — this leg's stored assets over the sum of all of them${atBlock(c)}. A ratio of two amounts in the same token, so it needs no price and no oracle is asked.`,
  contract: blueContract(),
  via: `${LANE} · one leg ÷ Σ legs @ the pinned block`,
  formula: "leg assets ÷ Σ leg assets",
});

/** The market's one rung. Immutable, and self-verifying: the id IS the hash of
 *  the params. */
export const vaultLegLltvProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: "The market id is keccak256(abi.encode(params)); recompute the hash from these params — or call idToMarketParams(id) — to confirm this lltv defines the market.",
  },
  summary: `Loan-to-value for ${legName(c)} — \`idToMarketParams(id).lltv\`${atBlock(c)}, the market's ONE risk number: the borrow limit and the liquidation line at once. Fixed at creation and immutable, because the market id IS keccak256(abi.encode(params)).`,
  contract: blueContract(),
  via: `${LANE} · Morpho.idToMarketParams(id).lltv`,
});

/** Σ over the withdraw queue of each leg's stored assets — the vault's position
 *  in Blue as Blue itself last settled it. */
export const vaultAllocatedProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Allocated in Morpho Blue — Σ over every market in the vault's withdraw queue of the ${asset(c)} its supply shares convert to at that market's STORED totals${atBlock(c)}. A sum of amounts in one token, so it is a real quantity. It is not \`totalAssets()\`: this side is Blue's last settled state, and the vault's own figure extrapolates past it.`,
  contract: blueContract(),
  via: `${LANE} · Σ over MetaMorpho.withdrawQueue of Morpho.position/market @ the pinned block`,
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
export const vaultGapProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Unaccrued interest — the vault's own \`totalAssets()\` minus the Σ of its stored Blue legs${atBlock(c)}. Two readings of the same holdings at the same block: MetaMorpho extrapolates each market's interest to this block's timestamp, Blue's \`market(id)\` holds what each market last SETTLED. The difference is stated rather than reconciled away, and it also carries any asset the vault holds outside its Blue positions.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.totalAssets() − Σ legs @ the pinned block`,
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

/** `balanceOf(holder)` — the holder's shares. The one figure the whole exposure
 *  section is scaled from. */
export const vaultHolderSharesProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.balanceOf(address)", c),
  summary: `Shares held — the ERC-20 \`balanceOf\` of this address on the vault's share token${atBlock(c)}. One slot read, and the figure every proportional number in this section is scaled from.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.balanceOf(holder) @ the pinned block`,
});

/** What the address IS — the code read behind the shape sentence. The evidence
 *  is spelled out per verdict, because the verdict is only as good as the read:
 *  a Safe is an exact singleton match, an ERC-4626 is a contract that answered
 *  two accessors, and a proxy is an address in a slot. NOTHING here is inferred
 *  from an ABI shape — a proxy's implementation is printed, not interpreted. */
export const vaultHolderShapeProv = (c: MorphoVaultCoords, shape: MorphoBaseVaultHolderShape): Provenance => {
  const at = atBlock(c);
  const size = `${shape.codeSize.toLocaleString("en-US")} bytes`;
  const named = (name: string | null, symbol: string | null) =>
    name || symbol ? ` It answered \`name()\` ${name ?? "not at all"} and \`symbol()\` ${symbol ?? "not at all"}.` : "";
  const evidence = (() => {
    switch (shape.kind) {
      case "eoa":
        return `\`eth_getCode\`${at} came back empty, so this address carries no code at that block: an externally owned account, controlled by a key rather than by a contract. Code can be deployed to an address later, which is why the block is named.`;
      case "delegated-account":
        return `\`eth_getCode\`${at} returned exactly 23 bytes: \`0xef0100\` followed by ${shape.delegate}. That is the EIP-7702 delegation indicator — the account is still an externally owned account, controlled by a key, and the code it runs is the code at that address. The delegate is stated, not identified: what that contract is takes reading it, and an account can point at a different one, or at none, in a later block.`;
      case "metamorpho-vault":
        return `\`eth_getCode\`${at} returned ${size}, and the address is one of the MetaMorpho vaults this directory's own Base census recorded, which is where the name comes from. Its \`asset()\` answered ${shape.asset ?? "nothing"}.`;
      case "safe":
        return `\`eth_getCode\`${at} returned ${size}, and its ${shape.evidence} names ${shape.singleton} — the released Safe ${shape.version} singleton. The match is exact against a known deployment; no part of it is read off the ABI.`;
      case "erc4626":
        return `\`eth_getCode\`${at} returned ${size}; \`asset()\` answered ${shape.asset} and \`totalSupply()\` answered, which is the ERC-4626 pair.${named(shape.name, shape.symbol)} That it holds shares for others is what the standard says a vault does; who those others are is not on chain here.`;
      case "erc1967-proxy":
        return `\`eth_getCode\`${at} returned ${size}, and \`eth_getStorageAt\` on the EIP-1967 implementation slot ${shape.slot} answered ${shape.slotValue} — the address ${shape.implementation}. The implementation is stated, not identified: what that contract is takes reading it.`;
      case "eip1167-proxy":
        return `\`eth_getCode\`${at} returned ${size}, and the code IS the EIP-1167 minimal proxy, with ${shape.implementation} embedded in it. The implementation is stated, not identified.`;
      case "contract":
        return `\`eth_getCode\`${at} returned ${size}. Nothing further was established: \`asset()\` did not answer, storage slot 0 names no Safe singleton, and the EIP-1967 implementation slot is empty.${named(shape.name, shape.symbol)}`;
    }
  })();
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    // NOT `recompute(…)`: that helper says "re-run the eth_call", and this
    // verdict rests on eth_getCode and eth_getStorageAt, which are not calls.
    verify: {
      kind: "recompute",
      text:
        c.blockNumber != null
          ? `Re-run eth_getCode on this address at block ${c.blockNumber} against any Base node`
          : "Re-run eth_getCode on this address against any Base node",
    },
    summary: `What this address is — read from the address itself at the same block as every figure beside it. ${evidence} This says what kind of thing holds the shares; it does not say who controls it.`,
    contract: { name: "the address looked up", address: c.holder },
    via: `${LANE} · eth_getCode / eth_getStorageAt / asset() on the holder @ the pinned block`,
  };
};

/** shares ÷ totalSupply. A ratio of two share counts — decimals cancel. */
export const vaultHolderFractionProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Share of the vault — this address's \`balanceOf\` over the share token's \`totalSupply\`${atBlock(c)}. A ratio of two counts of the same share token, so the decimals cancel and no price is involved. Shares are fungible: this says how much of the pool the address holds, not which deposits are in it.`,
  contract: vaultContract(c),
  via: `${LANE} · balanceOf(holder) ÷ totalSupply @ the pinned block`,
  formula: "balanceOf(holder) ÷ totalSupply",
  inputs: [
    { label: "balanceOf(holder)", kind: "chain", pclass: "state", note: "MetaMorpho.balanceOf @ the pinned block" },
    { label: "totalSupply", kind: "chain", pclass: "state", note: "MetaMorpho.totalSupply @ the pinned block" },
  ],
});

/** `convertToAssets(shares)` — the VAULT's answer for what these shares claim.
 *  Quoted as MetaMorpho's figure, beside our Σ of the stored legs. */
export const vaultHolderClaimProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.convertToAssets(shares)", c),
  summary: `Claim on the vault — \`convertToAssets(shares)\`${atBlock(c)}, in ${asset(c)}: the VAULT's own conversion of this balance, asked of the contract rather than computed here. It is deliberately NOT the arithmetic of the attributed rows: MetaMorpho converts against its extrapolated \`totalAssets()\` and against the share count it would have after its next accrual — including the performance-fee shares that accrual would mint. Both adjustments are small and they pull opposite ways, so this figure can land either side of the attributed sum.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.convertToAssets(balanceOf(holder)) @ the pinned block`,
});

/** `maxWithdraw(holder)` — what the VAULT says can leave at this block, which
 *  is a different question from what the shares claim. */
export const vaultHolderMaxWithdrawProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.maxWithdraw(the holder)", c),
  summary: `Redeemable now — \`maxWithdraw()\` for this address${atBlock(c)}, in ${asset(c)}: the vault's own answer for how much of the asset this address could take out at that block, asked of the contract rather than derived here. It is NOT the claim beside it. ERC-4626 clamps this to what the vault can actually pay: the withdraw queue is walked in order and each market can only give up what it holds unborrowed at that block, so a vault whose legs are fully utilised answers less than the claim, and a paused or capped vault can answer zero. A zero here is a reading of the queue's liquidity, not an absence. It is one block's answer and the next block's can differ — nothing about it is a promise.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.maxWithdraw(holder) @ the pinned block`,
});

/** The attribution itself — the page's central figure, and the one whose receipt
 *  must state what kind of claim it is. */
export const vaultAttributedProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Attributed ${asset(c)} in ${legName(c)}${atBlock(c)} — this address's share of the vault applied to the vault's own supplied balance in that market, floored to whole units. It is PROPORTIONAL, not fund-tracing: vault shares are fungible and deposits were pooled before the curator allocated them, so no on-chain fact ties a particular deposit to a particular market. Two addresses holding equal shares carry equal figures here, whatever they deposited and whenever.`,
  contract: blueContract(),
  via: `${LANE} · balanceOf(holder) × leg assets ÷ totalSupply @ the pinned block`,
  formula: "floor(shares × leg assets ÷ totalSupply)",
  inputs: [
    { label: "shares", kind: "chain", pclass: "state", note: "MetaMorpho.balanceOf(holder) @ the pinned block" },
    {
      label: "leg assets",
      kind: "chain-derived",
      pclass: "state",
      note: "the vault's stored supplied assets in this market",
    },
    { label: "totalSupply", kind: "chain", pclass: "state", note: "MetaMorpho.totalSupply @ the pinned block" },
  ],
});

/** Σ of the attributed rows — the holder's slice of the STORED legs, which is a
 *  different question from `convertToAssets` beside it. */
export const vaultAttributedTotalProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Total attributed ${asset(c)}${atBlock(c)} — Σ over the rows above. This is the address's share of the vault's STORED positions in Blue, each row floored to whole units. The claim figure beside it is the vault's own answer for the same balance, computed against its extrapolated total and against a share count that includes the fee shares its next accrual would mint — so the two differ slightly, and either can be the larger.`,
  contract: blueContract(),
  via: `${LANE} · Σ floor(shares × leg assets ÷ totalSupply) @ the pinned block`,
  formula: "Σ floor(shares × leg assets ÷ totalSupply)",
});

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
export const vaultDirectoryCensusProv = (
  c: MorphoVaultCoords,
  census: { catalogSize: number; censusBlock: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: census.censusBlock },
  verify: {
    kind: "recompute",
    text: `Sweep CreateMetaMorpho on both MetaMorpho factories on Base from each factory's first block to block ${census.censusBlock} and count the vaults`,
  },
  summary: `Vaults catalogued — ${census.catalogSize.toLocaleString("en-US")}: every vault the two MetaMorpho factories on Base (v1.0 and v1.1) had deployed at Base block ${census.censusBlock.toLocaleString("en-US")}, each one a \`CreateMetaMorpho\` event on its factory. THE ROSTER IS A FLOOR, not a total: a MetaMorpho compiled and deployed without a factory emits no creation event and is absent from it, a vault created after the census block is absent until the census re-runs, and the Vault V2 family is not catalogued. The directory lists exactly these.`,
  via: `${LANE} · CreateMetaMorpho on both factories, censused to block ${census.censusBlock}`,
  formula: "count of CreateMetaMorpho events on the v1.0 and v1.1 factories up to the census block",
});

/** `name()` — the vault's own current name, read live because it is MUTABLE:
 *  MetaMorpho V1.1 lets the owner rename, and 44 of 505 answered a different
 *  name at the census than their creation log carries. */
export const vaultDirectoryNameProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.name()", c),
  summary: `Vault name — the ERC-20 \`name()\` of the vault's share token${atBlock(c)}, read live rather than taken from the census: a MetaMorpho V1.1 owner can rename the vault (\`setName\`), so the name is a reading at this block and not an identity. Two vaults may share a name; the address beside it is what tells them apart.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.name() @ the pinned block`,
});

/** `totalAssets()` on a directory row — the vault's own figure for what it
 *  holds, in its asset. The directory orders a group by it and never compares
 *  it across assets. */
export const vaultDirectoryTotalAssetsProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.totalAssets()", c),
  summary: `Total assets — the vault's own \`totalAssets()\`${atBlock(c)}, in ${asset(c)}. MetaMorpho computes it by walking its supply queue and extrapolating each market's interest to this block's timestamp. It is a quantity of ${asset(c)} and is compared only with other vaults in the same asset: the directory groups by asset and never orders or sums across two of them, because that would take a price this page does not read. A zero here is a reading — the vault holds nothing at this block — not an absence.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.totalAssets() @ the pinned block`,
});

/** `convertToAssets(10^18)` on a directory row — one whole share, priced by the
 *  vault itself, in its own asset. The exponent is fixed at 18 rather than read
 *  per vault (see the loader's header note); it is the same call the per-vault
 *  page's `vaultSharePriceProv` makes, over the same 18-decimal share
 *  assumption `totalSupply` above already relies on. */
export const vaultDirectorySharePriceProv = (c: MorphoVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("MetaMorpho.convertToAssets(1 share)", c),
  summary: `Share price — \`convertToAssets(10^18)\`${atBlock(c)}: what ONE whole vault share converts to in ${asset(c)}, answered by the vault rather than divided out by this page. It carries the same extrapolation \`totalAssets()\` does, and is a quantity of ${asset(c)} only — never compared or summed across a group boundary, and never converted to USD.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.convertToAssets(one share) @ the pinned block`,
});

/** `curator()` — or, where the vault names none, `owner()` — as an ADDRESS. No
 *  name is attached: nothing on chain attests who holds the role, and the
 *  directory does not infer one from a vault's branding. */
export const vaultDirectoryStewardProv = (c: MorphoVaultCoords, role: "curator" | "owner" | "none"): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(role === "curator" ? "MetaMorpho.curator()" : "MetaMorpho.owner()", c),
  summary:
    role === "curator"
      ? `Curator — the vault's \`curator()\`${atBlock(c)}: the address the vault's owner has set to manage its market caps and queue. Stated as an address and only as an address; no name is attached, because nothing on chain says who holds it.`
      : role === "owner"
        ? `Owner — the vault's \`owner()\`${atBlock(c)}. Shown because this vault's \`curator()\` is the zero address: it names no curator, and putting the owner under a "Curator" label would attribute a role nobody holds. Stated as an address; no name is attached.`
        : `No curator and no owner — both \`curator()\` and \`owner()\` answered the zero address${atBlock(c)}: the vault names nobody in either role (ownership renounced). A reading about the vault, stated rather than left blank.`,
  contract: vaultContract(c),
  via: `${LANE} · MetaMorpho.${role === "none" ? "curator() and MetaMorpho.owner" : role}() @ the pinned block`,
});

/** How many catalogued vaults in one asset hold something at the block — a
 *  count over the rows' `totalAssets()` reads, and the size of a group. */
export const vaultDirectoryGroupCountProv = (c: MorphoVaultCoords, n: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n === 1 ? "One vault" : `${n.toLocaleString("en-US")} vaults`} denominated in ${asset(c)} with a non-zero \`totalAssets()\`${atBlock(c)} — a count over the directory's own reads, one per catalogued vault whose immutable \`asset()\` is ${asset(c)}. Vaults in this asset that read zero are counted in the trailing group instead, not dropped.`,
  via: `${LANE} · count of catalogued vaults with asset() = ${asset(c)} and totalAssets() > 0 @ the pinned block`,
  formula: `count of catalogued vaults where asset() = ${asset(c)} and totalAssets() > 0`,
});

/** How many catalogued vaults hold nothing at the block. A READING, not an
 *  omission: each answered zero to `totalAssets()`; a vault whose read did not
 *  answer is counted separately and never here. */
export const vaultDirectoryEmptyCountProv = (c: MorphoVaultCoords, n: number, catalogSize: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${n.toLocaleString("en-US")} of the ${catalogSize.toLocaleString("en-US")} catalogued vaults answered zero to \`totalAssets()\`${atBlock(c)} — each holds nothing at this block. That is a reading about each vault, not a gap in the read: a vault whose call did not answer is stated as unread, separately, and is not in this count.`,
  via: `${LANE} · count of catalogued vaults with totalAssets() = 0 @ the pinned block`,
  formula: "count of catalogued vaults where totalAssets() = 0",
});

// ── the position census: membership, and only membership ─────────────────────
// What the roster's Positions column states about ONE vault. Every other figure
// on this chain's cards rides the shared receipts
// (lib/aave-vaults/vault-provenance.ts) — the calls are the same calls on
// either chain, and a second copy of "balanceOf at this block" would be two
// statements about one read. What is Base's own is the census's ROSTER (the two
// MetaMorpho factories, not a live enumerator) and its FLOOR (each vault's own
// creation block, because a fixed window of six million blocks is 139 days on
// this chain), which is what the builder below says.

const BASE_CENSUS_LANE = "the daily Base vault census (whole-Transfer sweep, Σ balanceOf == totalSupply)";

/* The listing's own census receipt, and the one that stated the lane's
   `finalized` block beside it, are gone with the drawer that carried them: the
   listing face states its counts and its blocks in one line with no <Prov>, and
   the section's about page says the rest in words. The `finalized` cut is still
   receipted where it is READ — on a position page's timeline
   (lib/morpho-base/vault-timeline-provenance.ts), beside the rows it decides. */

/** ONE VAULT'S participant count, as the census read it — the roster's Positions
 *  column, and the "no holder yet" a zero prints instead. */
export const baseVaultCensusVaultProv = (
  c: MorphoVaultCoords & { censusBlock?: number },
  counts: { participants: number; liveCount: number; sumMatches: boolean },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.censusBlock },
  verify: {
    kind: "recompute",
    text: `Sweep this vault's whole Transfer stream from its own creation block to block ${c.censusBlock ?? "the census block"}, take the addresses either side of each log, and count the distinct ones`,
  },
  summary:
    counts.participants === 0
      ? `No address has ever held it — the sweep of this vault's whole \`Transfer\` stream${c.censusBlock != null ? ` to block ${c.censusBlock.toLocaleString("en-US")}` : ""} returned no logs at all. The vault exists: one of the two MetaMorpho factories made it and its creation log names it. Nobody has minted a share of it. That is a reading about the vault, not an absence of data about it — and it is why the listing beside this offers it as no filter option, since a choice that always answers an empty page states nothing.`
      : `${counts.participants.toLocaleString("en-US")} address${counts.participants === 1 ? " has" : "es have"} held a share of this vault, ${counts.liveCount.toLocaleString("en-US")} of them holding one${c.censusBlock != null ? ` at census block ${c.censusBlock.toLocaleString("en-US")}` : ""} — every address named either side of any \`Transfer\` it has emitted since its own creation block. ${counts.sumMatches ? "Σ `balanceOf` over that set equalled the share token's `totalSupply()` wei-exact at that block, which is what makes the set whole rather than merely long." : "Σ `balanceOf` over that set did NOT equal `totalSupply()` at that block, so this count is not stated as whole."} It is a count at the census block, not at the block the figures beside it were read at.`,
  contract: vaultContract({ ...c, vaultName: c.vaultName }),
  via: `${BASE_CENSUS_LANE} · eth_getLogs(Transfer) @ the census block`,
});
