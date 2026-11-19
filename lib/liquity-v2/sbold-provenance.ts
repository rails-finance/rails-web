// The sBOLD vault page's receipts (rails-ops ui-jobs 749), on the shape of
// lib/yearn/vault-provenance.ts. Every figure is a getter's answer at the
// page's one block (class `state`); each receipt names the contract, the call
// and the block.

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance } from "@/components/shared/provenance";
import { SBOLD_ASSET, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";
import { explorerUrl } from "@/lib/shared/chains";

const LANE = "live Ethereum chain reads (/ethereum/liquity-v2/sbold)";

export interface SboldCoords {
  /** rails-server's read of `blockNumber`, when it answered every read of the page. */
  readBy?: ServerRead | null;
  /** The block every figure was read at. */
  blockNumber?: number;
}

const n = (v: number) => v.toLocaleString("en-US");

const vaultContract: Provenance["contract"] = { name: "sBOLD vault", address: SBOLD_VAULT };

const atBlock = (c: SboldCoords): string => (c.blockNumber != null ? ` at block ${n(c.blockNumber)}` : "");

const recompute = (call: string, on: string, c: SboldCoords): Provenance["verify"] => ({
  kind: "recompute",
  text: `To check: ask any Ethereum archive node for ${call} on ${on}${atBlock(c)}.`,
});

const vaultRead = (c: SboldCoords, call: string, summary: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(call, SBOLD_VAULT, c),
  summary,
  contract: vaultContract,
  via: `${LANE} · sBOLD.${call} @ the pinned block`,
});

const sboldNameProv_ = (c: SboldCoords): Provenance =>
  vaultRead(c, "name()", `Vault name — the name the sBOLD share token answers${atBlock(c)}.`);

const sboldTotalAssetsProv_ = (c: SboldCoords): Provenance =>
  vaultRead(
    c,
    "totalAssets()",
    `Total assets — the BOLD the vault reports holding${atBlock(c)}, as its ERC-4626 totalAssets() answers.`,
  );

const sboldTotalSupplyProv_ = (c: SboldCoords, raw: string, shareDecimals: number): Provenance =>
  vaultRead(
    c,
    "totalSupply()",
    `Shares issued — every sBOLD share in existence${atBlock(c)}: ${raw} share units, ${shareDecimals} decimals as decimals() answers.`,
  );

const sboldSharePriceProv_ = (c: SboldCoords): Provenance =>
  vaultRead(
    c,
    "convertToAssets(10 ** 18)",
    `Share price — the BOLD one whole sBOLD share (10 ** 18 share units) converts to${atBlock(c)}, as the vault's convertToAssets answers. A zero is a reading.`,
  );

const sboldAssetProv_ = (c: SboldCoords): Provenance =>
  vaultRead(c, "asset()", `Asset — the token the vault's ERC-4626 asset() names${atBlock(c)}.`);

/** totalAssets() ÷ totalSupply(), both read at the block: BOLD per whole share. */
const sboldPerShareProv_ = (
  c: SboldCoords,
  r: { assets: string; supply: string; assetsRaw: string; supplyRaw: string; ratio: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for totalAssets() and totalSupply() on ${SBOLD_VAULT}${atBlock(c)}, and divide the first by the second.`,
  },
  summary: `Total assets ÷ shares issued — ${r.assets} BOLD of totalAssets() over ${r.supply} shares of totalSupply(), both on the sBOLD vault${atBlock(c)}: ${r.ratio} BOLD per share, rounded half-up to four significant digits.`,
  contract: vaultContract,
  via: `${LANE} · sBOLD.totalAssets() ÷ sBOLD.totalSupply() @ the pinned block`,
  formula: "totalAssets() ÷ totalSupply()",
  inputs: [
    { label: "totalAssets()", value: r.assetsRaw, kind: "chain", pclass: "state", contract: vaultContract },
    { label: "totalSupply()", value: r.supplyRaw, kind: "chain", pclass: "state", contract: vaultContract },
  ],
});

const boldContract: Provenance["contract"] = { name: "BOLD", address: SBOLD_ASSET.address };

/** `BOLD.balanceOf(sBOLD)`: the BOLD the vault holds outside the pools. */
const sboldIdleProv_ = (c: SboldCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`balanceOf(${SBOLD_VAULT})`, SBOLD_ASSET.address, c),
  summary: `Idle BOLD — the BOLD token's balanceOf for the sBOLD vault${atBlock(c)}.`,
  contract: boldContract,
  via: `${LANE} · BOLD.balanceOf(sBOLD) @ the pinned block`,
});

/** The three pools' `getDepositorYieldGainWithPending(sBOLD)`, summed (ui-jobs 765). */
const sboldYieldProv_ = (
  c: SboldCoords,
  r: { pools: { branch: SpBranch; pool: string; raw: string }[]; sumRaw: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node${atBlock(c)} for getDepositorYieldGainWithPending(${SBOLD_VAULT}) on each of the three Stability Pools, and add them.`,
  },
  summary: `BOLD yield pending — the BOLD yield each Stability Pool's getDepositorYieldGainWithPending(sBOLD) answers${atBlock(c)}, the interest not yet minted included, summed over the three pools: ${r.sumRaw} raw BOLD. The vault's totalAssets() counts it with each pool's deposit (SpLogic._getBoldAssetsSP in the vault's verified source).`,
  contract: vaultContract,
  via: `${LANE} · Σ StabilityPool.getDepositorYieldGainWithPending(sBOLD) @ the pinned block`,
  formula: "WETH pool + wstETH pool + rETH pool",
  inputs: r.pools.map((p) => ({
    label: `getDepositorYieldGainWithPending · ${p.branch} pool`,
    value: p.raw,
    kind: "chain" as const,
    pclass: "state" as const,
    contract: { name: `Liquity V2 ${p.branch} Stability Pool`, address: p.pool },
  })),
});

/** One branch's collateral in the vault's name, in the collateral (ui-jobs 765). */
const sboldCollProv_ = (
  c: SboldCoords,
  r: {
    branch: SpBranch;
    pool: string;
    coll: { symbol: string; address: string };
    gainRaw: string;
    stashRaw: string;
    heldRaw: string;
    text: string;
  },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node${atBlock(c)} for getDepositorCollGain(${SBOLD_VAULT}) and stashedColl(${SBOLD_VAULT}) on ${r.pool}, and balanceOf(${SBOLD_VAULT}) on ${r.coll.address}, and add them.`,
  },
  summary: `${r.coll.symbol} in the vault's name — the ${r.branch} Stability Pool's getDepositorCollGain(sBOLD) (${r.gainRaw}) and stashedColl(sBOLD) (${r.stashRaw}), and the ${r.coll.symbol} token's balanceOf(sBOLD) (${r.heldRaw}), raw ${r.coll.symbol}${atBlock(c)}: ${r.text} ${r.coll.symbol}.`,
  contract: { name: `Liquity V2 ${r.branch} Stability Pool`, address: r.pool },
  via: `${LANE} · StabilityPool.getDepositorCollGain + stashedColl, ${r.coll.symbol}.balanceOf(sBOLD) @ the pinned block`,
  formula: "getDepositorCollGain + stashedColl + balanceOf",
  inputs: [
    { label: "getDepositorCollGain(sBOLD)", value: r.gainRaw, kind: "chain", pclass: "state" },
    { label: "stashedColl(sBOLD)", value: r.stashRaw, kind: "chain", pclass: "state" },
    {
      label: `${r.coll.symbol}.balanceOf(sBOLD)`,
      value: r.heldRaw,
      kind: "chain",
      pclass: "state",
      contract: { name: r.coll.symbol, address: r.coll.address },
    },
  ],
});

/** `calcFragments()` on the vault: its total and its BOLD amount (ui-jobs 765). */
const sboldFragmentsProv_ = (
  c: SboldCoords,
  r: { totalRaw: string; boldRaw: string; collValueRaw: string; collInBoldRaw: string },
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("calcFragments()", SBOLD_VAULT, c),
  summary: `calcFragments() — the sBOLD vault's calcFragments()${atBlock(c)} answers, raw: totalBold ${r.totalRaw}, boldAmount ${r.boldRaw}, collValue ${r.collValueRaw}, collInBold ${r.collInBoldRaw}. Its boldAmount equals the rows' sum to the wei, and its totalBold equals totalAssets().`,
  contract: vaultContract,
  via: `${LANE} · sBOLD.calcFragments() @ the pinned block`,
});

/** The three deposits and the idle BOLD summed, against totalAssets(). */
const sboldReconcileProv_ = (
  c: SboldCoords,
  r: {
    deposits: { branch: SpBranch; pool: string; raw: string; yieldRaw: string }[];
    idleRaw: string;
    totalRaw: string;
    sumRaw: string;
    diffRaw: string;
  },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node${atBlock(c)} for getCompoundedBoldDeposit(${SBOLD_VAULT}) and getDepositorYieldGainWithPending(${SBOLD_VAULT}) on each of the three Stability Pools, balanceOf(${SBOLD_VAULT}) on BOLD and totalAssets() on the vault; add the first seven and compare the sum with the last.`,
  },
  summary: `The rows against total assets — the three Stability Pool deposits, their BOLD yield pending and the vault's BOLD balance${atBlock(c)} sum to ${r.sumRaw} raw BOLD; totalAssets() answers ${r.totalRaw}; totalAssets() less the sum is ${r.diffRaw}.`,
  contract: vaultContract,
  via: `${LANE} · Σ getCompoundedBoldDeposit(sBOLD) + Σ getDepositorYieldGainWithPending(sBOLD) + BOLD.balanceOf(sBOLD) vs sBOLD.totalAssets() @ the pinned block`,
  formula: "totalAssets() − (three deposits + three yields pending + idle BOLD)",
  inputs: [
    ...r.deposits.map((d) => ({
      label: `getCompoundedBoldDeposit · ${d.branch} pool`,
      value: d.raw,
      kind: "chain" as const,
      pclass: "state" as const,
      contract: { name: `Liquity V2 ${d.branch} Stability Pool`, address: d.pool },
    })),
    ...r.deposits.map((d) => ({
      label: `getDepositorYieldGainWithPending · ${d.branch} pool`,
      value: d.yieldRaw,
      kind: "chain" as const,
      pclass: "state" as const,
      contract: { name: `Liquity V2 ${d.branch} Stability Pool`, address: d.pool },
    })),
    { label: "BOLD.balanceOf(sBOLD)", value: r.idleRaw, kind: "chain", pclass: "state", contract: boldContract },
    { label: "totalAssets()", value: r.totalRaw, kind: "chain", pclass: "state", contract: vaultContract },
  ],
});

export type SboldSeriesKey = "totalAssets" | "totalSupply" | "sharePrice";

const POINT_CALL: Record<SboldSeriesKey, { label: string; call: string }> = {
  totalAssets: { label: "Total assets", call: "totalAssets()" },
  totalSupply: { label: "Shares issued", call: "totalSupply()" },
  sharePrice: { label: "Share price", call: "convertToAssets(10 ** 18)" },
};

/** One point of a daily line: one getter at one block. */
export const sboldPointProv = (
  key: SboldSeriesKey,
  p: { block: number; time: number; raw: string; text: string; day?: number },
): Provenance => {
  const when = new Date(p.time * 1000).toISOString().slice(0, 16).replace("T", " ");
  return {
    kind: "chain",
    pclass: "state",
    source: { block: p.block },
    verify: recompute(POINT_CALL[key].call, SBOLD_VAULT, { blockNumber: p.block }),
    summary: `${POINT_CALL[key].label} at block ${n(p.block)} — the sBOLD vault's ${POINT_CALL[key].call} at block ${n(p.block)} (${when} UTC${p.day != null ? ", the UTC day's last block" : ""}): ${p.text}, raw ${p.raw}.`,
    contract: vaultContract,
    via: `${LANE} · sBOLD.${POINT_CALL[key].call} @ block ${n(p.block)}`,
  };
};

/** The block the page's figures were read at. */
const sboldBlockProv_ = (c: SboldCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Read block — every figure on this page is a getter's answer${atBlock(c)}, read in one Multicall3 round.`,
  contract: vaultContract,
  via: `${LANE} · Multicall3 @ the pinned block`,
});

/** `getCompoundedBoldDeposit(sBOLD)` on one branch's Stability Pool. */
const sboldDepositProv_ = (c: SboldCoords, branch: SpBranch, pool: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute(`getCompoundedBoldDeposit(${SBOLD_VAULT})`, pool, c),
  summary: `${branch} Stability Pool deposit — the BOLD the ${branch} Stability Pool credits to the sBOLD vault${atBlock(c)}: the deposit after every liquidation the pool has absorbed.`,
  contract: { name: `Liquity V2 ${branch} Stability Pool`, address: pool },
  via: `${LANE} · StabilityPool.getCompoundedBoldDeposit(sBOLD) @ the pinned block`,
});

/** `paused()` on the vault (ui-jobs 765): the fact as the getter answers it. */
const sboldPausedProv_ = (c: SboldCoords): Provenance =>
  vaultRead(c, "paused()", `Paused — the sBOLD vault's paused() answers true${atBlock(c)}.`);

/** The vault's latest Paused(address) log, from a sweep of its Paused and
 *  Unpaused logs (ui-jobs 765). */
export const sboldPausedLogProv = (
  l: {
    block: number;
    time: number | null;
    txHash: string;
    logIndex: number;
    account: string;
    from: number;
    to: number;
  },
  what: "block" | "time" | "tx" | "account",
): Provenance => {
  const when = l.time == null ? "" : ` (${new Date(l.time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC)`;
  const lead =
    what === "block"
      ? "Paused log block"
      : what === "time"
        ? "Paused log time — the block's timestamp"
        : what === "tx"
          ? "Paused log transaction"
          : "Paused log account — the log's account field";
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: l.block, txHash: l.txHash },
    summary: `${lead} — the sBOLD vault's latest Paused(address) log: block ${n(l.block)}${when}, transaction ${l.txHash}, log ${l.logIndex}, account ${l.account}. The vault's Paused and Unpaused logs from block ${n(l.from)} to block ${n(l.to)} were read; no Unpaused log follows it.`,
    contract: vaultContract,
    via: `${LANE} · eth_getLogs sBOLD Paused(address) / Unpaused(address), blocks ${n(l.from)}–${n(l.to)} · log ${l.logIndex}`,
    verify: {
      kind: "etherscan",
      href: explorerUrl(1, "tx-logs", l.txHash),
      text: "The transaction's logs on Etherscan",
    },
  };
};

/** A holder's sBOLD (ui-jobs 765): balanceOf, convertToAssets(balance) and
 *  the pro-rata balance × totalAssets ÷ totalSupply, at the page's block. */
const sboldHolderSharesProv_ = (c: SboldCoords, h: { holder: string; raw: string; decimals: number }): Provenance =>
  vaultRead(
    c,
    `balanceOf(${h.holder})`,
    `Shares held — the sBOLD vault's balanceOf(${h.holder})${atBlock(c)}: ${h.raw} share units, ${h.decimals} decimals as decimals() answers.`,
  );

const sboldHolderClaimProv_ = (c: SboldCoords, h: { holder: string; sharesRaw: string; raw: string }): Provenance => ({
  ...vaultRead(
    c,
    `convertToAssets(${h.sharesRaw})`,
    `convertToAssets(balance) — the BOLD the vault's convertToAssets answers${atBlock(c)} for the ${h.sharesRaw} share units ${h.holder} holds: ${h.raw} raw BOLD. The vault rounds this conversion down.`,
  ),
  inputs: [
    { label: `balanceOf(${h.holder})`, value: h.sharesRaw, kind: "chain", pclass: "state", contract: vaultContract },
  ],
});

const sboldHolderProRataProv_ = (
  c: SboldCoords,
  h: { holder: string; sharesRaw: string; assetsRaw: string; supplyRaw: string; text: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node${atBlock(c)} for balanceOf(${h.holder}), totalAssets() and totalSupply() on ${SBOLD_VAULT}; multiply the first two and divide by the third.`,
  },
  summary: `Pro-rata BOLD — ${h.holder}'s share units times the vault's totalAssets(), over its totalSupply()${atBlock(c)}: ${h.text} BOLD, rounded half-up to four significant digits.`,
  contract: vaultContract,
  via: `${LANE} · sBOLD.balanceOf(holder) × sBOLD.totalAssets() ÷ sBOLD.totalSupply() @ the pinned block`,
  formula: "balanceOf(holder) × totalAssets() ÷ totalSupply()",
  inputs: [
    { label: "balanceOf(holder)", value: h.sharesRaw, kind: "chain", pclass: "state", contract: vaultContract },
    { label: "totalAssets()", value: h.assetsRaw, kind: "chain", pclass: "state", contract: vaultContract },
    { label: "totalSupply()", value: h.supplyRaw, kind: "chain", pclass: "state", contract: vaultContract },
  ],
});

// Receipts over a page's reads stamp rails-server's head read when the coordinates carry it.
export const sboldNameProv = withServerRead(sboldNameProv_);
export const sboldTotalAssetsProv = withServerRead(sboldTotalAssetsProv_);
export const sboldTotalSupplyProv = withServerRead(sboldTotalSupplyProv_);
export const sboldSharePriceProv = withServerRead(sboldSharePriceProv_);
export const sboldAssetProv = withServerRead(sboldAssetProv_);
export const sboldPerShareProv = withServerRead(sboldPerShareProv_);
export const sboldIdleProv = withServerRead(sboldIdleProv_);
export const sboldReconcileProv = withServerRead(sboldReconcileProv_);
export const sboldBlockProv = withServerRead(sboldBlockProv_);
export const sboldDepositProv = withServerRead(sboldDepositProv_);
export const sboldPausedProv = withServerRead(sboldPausedProv_);
export const sboldYieldProv = withServerRead(sboldYieldProv_);
export const sboldCollProv = withServerRead(sboldCollProv_);
export const sboldFragmentsProv = withServerRead(sboldFragmentsProv_);
export const sboldHolderSharesProv = withServerRead(sboldHolderSharesProv_);
export const sboldHolderClaimProv = withServerRead(sboldHolderClaimProv_);
export const sboldHolderProRataProv = withServerRead(sboldHolderProRataProv_);
