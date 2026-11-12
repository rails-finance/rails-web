// Receipts for the bad-debt episodes in the steward's record (V14.1; rails-ops
// ui-jobs 554, piece C). Each names the S1 row it rests on (the Liquidate log's
// transaction and log index) and, for the vault's figures, the at-block read:
// Morpho.position(id, vault).supplyShares and Morpho.market(id).totalSupplyShares
// at the block before the liquidation (lib/vaults/bad-debt-episodes.ts).

import type { Provenance } from "@/components/shared/provenance";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { BadDebtEpisode } from "@/lib/vaults/bad-debt-episodes";

const n = (v: number) => v.toLocaleString("en-US");

const BLUE = { name: "Morpho Blue", address: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb" };

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

const chainWord = (e: BadDebtEpisode) => chainMeta(e.chainId as ChainId).name;

/** The S1 row: where the liquidation's log sits. */
const row = (e: BadDebtEpisode) =>
  `the Liquidate log in transaction ${e.txHash}, log index ${e.logIndex}, at ${chainWord(e)} block ${n(e.block)}`;

const txVerify = (e: BadDebtEpisode) => ({
  kind: "etherscan" as const,
  href: explorerUrl(e.chainId as ChainId, "tx-logs", e.txHash),
  text: `The transaction's logs on ${chainMeta(e.chainId as ChainId).explorerName}`,
});

const RULE =
  "Read at the block before the liquidation; a supply or withdrawal by the vault earlier in the same block is not seen.";

/** The liquidation's date: its block's time. */
export const badDebtDateProv = (e: BadDebtEpisode): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: e.block, txHash: e.txHash },
  summary: `Liquidation — ${row(e)}, in Morpho Blue market ${e.marketId}. Rails's index of Morpho Blue's Liquidate logs holds the row, with its block's time.`,
  contract: BLUE,
  via: `Rails index · Morpho Blue Liquidate(id, …) · ${short(e.txHash)} log ${e.logIndex}`,
  verify: txVerify(e),
});

/** The market: its params, and its place in the vault's withdraw queue. */
export const badDebtMarketProv = (e: BadDebtEpisode): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: e.market.paramsBlock },
  summary: `Market — Morpho Blue's idToMarketParams(${short(e.marketId)}) at ${chainWord(e)} block ${n(e.market.paramsBlock)}: loan ${e.market.loanSymbol}, collateral ${e.market.collateralSymbol}, LLTV ${lltvText(e.market.lltv)}. The market is in the vault's withdraw queue at that block.`,
  contract: BLUE,
  via: "chain · Morpho.idToMarketParams(id), MetaMorpho.withdrawQueue(i) @ the head block",
  verify: {
    kind: "recompute",
    text: `To check: ask any archive node for idToMarketParams(${e.marketId}) on ${BLUE.address} at block ${n(e.market.paramsBlock)}.`,
  },
});

/** The market's bad debt: the log's badDebtAssets. */
export const badDebtAssetsProv = (e: BadDebtEpisode): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: e.block, txHash: e.txHash },
  summary: `Market's bad debt — the badDebtAssets field of ${row(e)}: the ${e.market.loanSymbol} Morpho Blue wrote off the market's supply in this liquidation.`,
  contract: BLUE,
  via: `Rails index · Liquidate.badDebtAssets · ${short(e.txHash)} log ${e.logIndex}`,
  verify: txVerify(e),
  scaling: {
    raw: e.badDebtAssets,
    from: "log",
    places: e.market.loanDecimals,
    why: `${e.market.loanSymbol} carries ${e.market.loanDecimals} decimals`,
  },
});

const sharesInputs = (e: BadDebtEpisode) => [
  {
    label: "Vault's supply shares",
    value: e.vaultShares,
    kind: "chain" as const,
    pclass: "state" as const,
    note: `position(${short(e.marketId)}, ${short(e.vault.address)}).supplyShares at block ${n(e.readBlock)}`,
    contract: BLUE,
  },
  {
    label: "Market's supply shares",
    value: e.totalShares,
    kind: "chain" as const,
    pclass: "state" as const,
    note: `market(${short(e.marketId)}).totalSupplyShares at block ${n(e.readBlock)}`,
    contract: BLUE,
  },
];

const sharesVerify = (e: BadDebtEpisode) => ({
  kind: "recompute" as const,
  text: `To check: ask any archive node for position(${e.marketId}, ${e.vault.address}) and market(${e.marketId}) on ${BLUE.address} at ${chainWord(e)} block ${n(e.readBlock)}.`,
});

/** The vault's share of the market's supply at block − 1. */
export const badDebtShareProv = (e: BadDebtEpisode): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: e.readBlock },
  summary: `Vault's share of supply — the vault's supply shares over the market's, on Morpho Blue at ${chainWord(e)} block ${n(e.readBlock)}, for ${row(e)}. ${RULE}`,
  contract: BLUE,
  via: "chain · Morpho.position(id, vault).supplyShares ÷ Morpho.market(id).totalSupplyShares @ block − 1",
  formula: "vault supply shares ÷ market supply shares",
  inputs: sharesInputs(e),
  verify: sharesVerify(e),
});

/** The vault's part: the bad debt times its share, floored. */
export const badDebtPartProv = (e: BadDebtEpisode): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: e.readBlock },
  summary: `Vault's part — the market's bad debt times the vault's share of its supply, floored to the loan token's unit: Morpho Blue writes bad debt off every supplier by supply shares. The bad debt is from ${row(e)}; the shares are read at block ${n(e.readBlock)}. ${RULE}`,
  contract: BLUE,
  via: "S1 badDebtAssets × position.supplyShares ÷ market.totalSupplyShares @ block − 1",
  formula: "floor(badDebtAssets × vault supply shares ÷ market supply shares)",
  inputs: [
    {
      label: "Market's bad debt (raw)",
      value: e.badDebtAssets,
      kind: "chain",
      pclass: "emitted",
      note: `Liquidate.badDebtAssets, ${short(e.txHash)} log ${e.logIndex}`,
    },
    ...sharesInputs(e),
  ],
  verify: sharesVerify(e),
  scaling: {
    raw: e.vaultPart,
    from: "call",
    places: e.market.loanDecimals,
    why: `${e.market.loanSymbol} carries ${e.market.loanDecimals} decimals`,
  },
});

/** The count of liquidations that left bad debt in the steward's vaults. */
export const badDebtCountProv = (count: number, vaults: number, markets: number, reads: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Liquidations with bad debt in its vaults — ${n(count)} Liquidate logs with badDebtAssets above zero, in the ${n(markets)} markets the withdraw queues of this steward's ${n(vaults)} MetaMorpho vaults on Base and Ethereum hold now, where one of those vaults held supply shares at the block before. ${n(reads)} at-block reads, one per block with bad debt. Markets a vault has left are not checked.`,
  via: "Rails index · Liquidate logs per market (S1) · Morpho.position and Morpho.market @ block − 1",
  formula: "count(Liquidate where badDebtAssets > 0 and vault supply shares at block − 1 > 0)",
  verify: {
    kind: "recompute",
    text: "To check: for each market in the vaults' withdraw queues, list its Liquidate logs with badDebtAssets above zero, and ask an archive node for each vault's position(id, vault).supplyShares at the block before each one.",
  },
});

/** LLTV raw at 1e18 as a percentage: "86%", "91.5%". */
export function lltvText(raw: string): string {
  const bp = Number(BigInt(raw) / BigInt("100000000000000")); // 1e14: hundredths of a percent
  return `${(bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
