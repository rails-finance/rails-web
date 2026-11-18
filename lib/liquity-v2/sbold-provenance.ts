// The sBOLD vault page's receipts (rails-ops ui-jobs 749), on the shape of
// lib/yearn/vault-provenance.ts. Every figure is a getter's answer at the
// page's one block (class `state`); each receipt names the contract, the call
// and the block.

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance } from "@/components/shared/provenance";
import { SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
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

const sboldTotalSupplyProv_ = (c: SboldCoords): Provenance =>
  vaultRead(c, "totalSupply()", `Shares issued — every sBOLD share in existence${atBlock(c)}, in share units.`);

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
export const sboldBlockProv = withServerRead(sboldBlockProv_);
export const sboldDepositProv = withServerRead(sboldDepositProv_);
