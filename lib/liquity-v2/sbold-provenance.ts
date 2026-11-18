// The sBOLD vault page's receipts (rails-ops ui-jobs 749), on the shape of
// lib/yearn/vault-provenance.ts. Every figure is a getter's answer at the
// page's one block (class `state`); each receipt names the contract, the call
// and the block.

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance } from "@/components/shared/provenance";
import { SBOLD_ASSET, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";

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

const sboldTotalSupplyProv_ = (c: SboldCoords, raw: string): Provenance =>
  vaultRead(
    c,
    "totalSupply()",
    `Shares issued — every sBOLD share in existence${atBlock(c)}: ${raw} share units, 18 decimals.`,
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
  summary: `Total assets ÷ shares issued — ${r.assets} BOLD of totalAssets() over ${r.supply} shares of totalSupply(), both on the sBOLD vault${atBlock(c)}: ${r.ratio} BOLD per share, to four significant digits.`,
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

/** The three deposits and the idle BOLD summed, against totalAssets(). */
const sboldReconcileProv_ = (
  c: SboldCoords,
  r: {
    deposits: { branch: SpBranch; pool: string; raw: string }[];
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
    text: `To check: ask any Ethereum archive node${atBlock(c)} for getCompoundedBoldDeposit(${SBOLD_VAULT}) on each of the three Stability Pools, balanceOf(${SBOLD_VAULT}) on BOLD and totalAssets() on the vault, add the first four and compare the sum with the fifth.`,
  },
  summary: `Deposits and idle BOLD against total assets — the three Stability Pool deposits plus the vault's BOLD balance${atBlock(c)} sum to ${r.sumRaw} raw BOLD; totalAssets() answers ${r.totalRaw}; totalAssets() less the sum is ${r.diffRaw}.`,
  contract: vaultContract,
  via: `${LANE} · Σ getCompoundedBoldDeposit(sBOLD) + BOLD.balanceOf(sBOLD) vs sBOLD.totalAssets() @ the pinned block`,
  formula: "WETH deposit + wstETH deposit + rETH deposit + idle BOLD − totalAssets()",
  inputs: [
    ...r.deposits.map((d) => ({
      label: `getCompoundedBoldDeposit · ${d.branch} pool`,
      value: d.raw,
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
