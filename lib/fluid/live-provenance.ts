// Provenance vocabulary for the Fluid LIVE position read — the risk surfaces'
// sources (/api/chain/fluid/position → VaultResolver.positionByNftId at the
// head block). Three kinds of source:
//
//   • STATE — the resolver's settled read: it runs the vault's OWN
//     fetchLatestPosition settlement math (every liquidation sweep applied)
//     and converts raw units through the live exchange prices (accrued
//     interest included). Also the governance config block (collateralFactor /
//     liquidationThreshold / liquidationMaxLimit / liquidationPenalty) read
//     from the vault through the same call.
//   • ORACLE — the vault's own oracle price. A Fluid oracle prices the
//     collateral IN THE DEBT TOKEN (debt per col); the protocol has no USD
//     feed anywhere — this pair price is the entire space the liquidation
//     engine judges in, so it is the space every risk figure here renders in.
//   • DERIVED — the ratio (borrow ÷ collateral × liquidate-price), the
//     liquidation price (the same equation rearranged), and the debt-token
//     valuation of the collateral — arithmetic over those same-block reads,
//     so chain-derived.
//
// The decode, the 1e(27 + debtDec − colDec) price scale and the ratio
// identity are proven on-chain by scripts/verify-fluid-chain.mjs.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { FLUID_ADDRESSES } from "./asset-catalog";

const LANE_VIA = "GET /api/chain/fluid/position";

const RESOLVER_CONTRACT = { name: "Fluid VaultResolver", address: FLUID_ADDRESSES.VAULT_RESOLVER };
const vaultContract = (vault: string, pair?: string) => ({
  name: pair ? `Fluid vault (${pair})` : "Fluid vault",
  address: vault,
});

const recompute = (text: string): ProvVerify => ({ kind: "recompute", text });

/** Position-card / narration settled figure — the resolver's live read at the
 *  head block (the page's own eth_call, not the worker's stamped sweep). */
export const liveSettledProv = (side: "supply" | "borrow", sym: string, blockNumber?: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: recompute(
    "Re-run the VaultResolver.positionByNftId eth_call against any node — the resolver reproduces this figure",
  ),
  summary: `${sym} the position's ${side === "supply" ? "collateral" : "debt"} settles to NOW — VaultResolver.positionByNftId read live${blockNumber ? ` at block ${blockNumber}` : " at the head block"}: the resolver runs the vault's OWN fetchLatestPosition settlement math (every liquidation sweep applied) and converts raw units through the live exchange prices, so interest accrued to this block is included. The protocol's own reckoning of this position, this moment.`,
  contract: RESOLVER_CONTRACT,
  via: `${LANE_VIA} · VaultResolver.positionByNftId @ head · ${side === "supply" ? "supply" : "borrow"}`,
});

/** A governance risk line (collateralFactor / liquidationThreshold /
 *  liquidationMaxLimit / liquidationPenalty) from the vault's config block. */
export const vaultConfigProv = (what: string, field: string, vault: string, pair?: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: recompute(`Re-run VaultResolver.positionByNftId (or getVaultEntireData) and read configs.${field}`),
  summary: `${what} — the vault's governance-set risk line, read live from the vault's own config through the VaultResolver (configs.${field}, a 1e4-scaled percent). Each Fluid vault is one (collateral, debt) pair with its own lines.`,
  contract: vaultContract(vault, pair),
  via: `${LANE_VIA} · VaultResolver.positionByNftId @ head · configs.${field}`,
});

/** The vault oracle's price — DEBT PER COL, the protocol's only price space. */
export const vaultOraclePriceProv = (
  colSym: string,
  debtSym: string,
  oracle: string,
  leg: "operate" | "liquidate" = "liquidate",
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: recompute(
    `Re-run VaultResolver.positionByNftId and read configs.oraclePrice${leg === "operate" ? "Operate" : "Liquidate"} — scale is 1e(27 + debt decimals − collateral decimals)`,
  ),
  summary: `The ${colSym} price in ${debtSym} — the vault's own oracle (each Fluid vault names one), read through the resolver at the head block. Fluid oracles price the collateral IN THE DEBT TOKEN; there is no USD feed anywhere in the protocol — this pair price is the exact space the liquidation engine judges in${leg === "liquidate" ? " (the liquidate-leg price, the one liquidations use)" : " (the operate-leg price, the one user operations are gated by)"}.`,
  contract: { name: "Fluid vault oracle", address: oracle },
  via: `${LANE_VIA} · configs.oraclePrice${leg === "operate" ? "Operate" : "Liquidate"} @ head`,
});

/** The position's ratio in the engine's own space. */
export const fluidRatioProv = (colSym: string, debtSym: string, vault: string, pair?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: recompute(
    "Recompute borrow ÷ (supply × oracle liquidate-price) from the same positionByNftId call — scripts/verify-fluid-chain.mjs proves the identity",
  ),
  summary: `The position's ratio — settled ${debtSym} debt ÷ (settled ${colSym} collateral × the vault oracle's liquidate price), every input from ONE resolver read at the same block. This is the exact quantity Fluid's liquidation engine compares against the vault's risk lines: borrowing gates at the collateral factor, liquidation fires above the threshold.`,
  contract: vaultContract(vault, pair),
  via: `${LANE_VIA} · derived ratio`,
  formula: "borrow ÷ (supply × oracle price)",
  inputs: [
    { label: "borrow", kind: "chain", pclass: "state", note: "settled debt @ head" },
    { label: "supply", kind: "chain", pclass: "state", note: "settled collateral @ head" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: "configs.oraclePriceLiquidate" },
  ],
});

/** Liquidation price — the debt-per-col price at which the ratio hits the
 *  vault's liquidation threshold. */
export const fluidLiqPriceProv = (colSym: string, debtSym: string, vault: string, pair?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: recompute("Recompute borrow ÷ (supply × liquidationThreshold) from the same positionByNftId call"),
  summary: `Liquidation price — the ${colSym} price (in ${debtSym}, the vault's own price space) at which this position's ratio hits the vault's liquidation threshold: borrow ÷ (supply × threshold), every input from one resolver read at the same block (the liquidation equation rearranged for price).`,
  contract: vaultContract(vault, pair),
  via: `${LANE_VIA} · derived ratio`,
  formula: "borrow ÷ (supply × liquidation threshold)",
  inputs: [
    { label: "borrow", kind: "chain", pclass: "state", note: "settled debt @ head" },
    { label: "supply", kind: "chain", pclass: "state", note: "settled collateral @ head" },
    { label: "liquidation threshold", kind: "chain", pclass: "state", note: "configs.liquidationThreshold" },
  ],
});
