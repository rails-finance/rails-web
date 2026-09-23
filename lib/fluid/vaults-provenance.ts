// Fluid MARKET-SURFACE provenance vocabulary — the receipts for /fluid/vaults,
// one block's reading of the whole vault roster.
// ----------------------------------------------------------------------------
// This is the market-level counterpart of lib/fluid/{live,event}-provenance
// (which trace ONE position and its events). Nothing here concerns an account:
// every figure is a slot the VaultResolver returns for a vault at one head
// block, or an arithmetic over such reads.
//
// The LANE matters. live-provenance.ts reads a single position through
// `VaultResolver.positionByNftId` — this view reads the WHOLE roster through
// `VaultResolver.getVaultsEntireData()` (one eth_call, the array of every
// vault's VaultEntireData), and a smart leg's composition through the
// `DexResolver.getDexEntireDatas([pool])`. Reusing live-provenance's builders
// here would stamp the position lane on a roster receipt, so these builders are
// written against the lane the vaults loader (lib/sources/chain/fluid-vaults.ts)
// actually uses.
//
// Three source classes, graded as the ladder does:
//   • state   — a slot the resolver returns (the vault's config rungs, its
//     totals, its rate). Third-party verifiable: re-run the eth_call at the
//     block against any node.
//   • oracle  — the vault's own oracle price (configs.oraclePriceLiquidate),
//     debt-per-collateral. Fluid runs NO USD feed anywhere: this pair price is
//     the whole space the liquidation engine judges in, and no figure here is
//     ever converted to dollars.
//   • derived — the vault's aggregate ratio, and a smart leg's DEX-share
//     composition (shares × the pool's own per-share figures). Chain-derived,
//     no further than its weakest input.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.

import type { Provenance } from "@/components/shared/provenance";
import { FLUID_ADDRESSES } from "@/lib/fluid/asset-catalog";

const LANE = "live Fluid vault reads (/fluid/vaults)";
const ROSTER_VIA = `${LANE} · VaultResolver.getVaultsEntireData() @ head`;

/** DexResolver — HEAD-ONLY row from the vaults loader; a smart leg's per-share
 *  composition is read from it (never re-derived from reserves ÷ totalShares). */
const FLUID_DEX_RESOLVER_ADDRESS = "0x11D80CfF056Cef4F9E6d23da8672fE9873e5cC07";

const VAULT_RESOLVER_CONTRACT = { name: "Fluid VaultResolver", address: FLUID_ADDRESSES.VAULT_RESOLVER };
const DEX_RESOLVER_CONTRACT = { name: "Fluid DexResolver", address: FLUID_DEX_RESOLVER_ADDRESS };

/** What a roster receipt needs: the block it was read at, the vault it belongs
 *  to (the contract that owns the config/totals the resolver relays), the pair
 *  label for the contract name, the vault's oracle address, and the leg symbols
 *  the prose speaks in. */
export interface FluidVaultCoords {
  blockNumber?: number;
  /** The vault address — owner of the config/totals slots the resolver returns. */
  vault?: string;
  vaultId?: number;
  /** Display pair ("wstETH / USDC") for the contract name. */
  pair?: string;
  /** The vault's own oracle address — the contract on a price receipt. */
  oracle?: string | null;
  /** Collateral / debt leg symbols, for the prose. */
  colSym?: string | null;
  debtSym?: string | null;
}

const vaultContract = (coords?: FluidVaultCoords): Provenance["contract"] => ({
  name: coords?.pair ? `Fluid vault (${coords.pair})` : "Fluid vault",
  address: coords?.vault,
});

const atBlock = (coords?: FluidVaultCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

const recompute = (call: string, coords?: FluidVaultCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    coords?.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${coords.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

// ── roster (VaultResolver-level) ─────────────────────────────────────────────

/** The count of vaults minted — the length of getVaultsEntireData()'s own array. */
export const fluidRosterProv = (coords: FluidVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("VaultResolver.getVaultsEntireData", coords),
  summary: `Vaults minted — the length of the VaultResolver's own \`getVaultsEntireData()\` array${atBlock(coords)}. Fluid keeps no market catalog: the factory mints one vault per pair and the resolver returns every one in a single call, so the roster is what the protocol says it is, not what this view decides.`,
  contract: VAULT_RESOLVER_CONTRACT,
  via: ROSTER_VIA,
});

// ── vault-level: the risk ladder (governance config slots) ───────────────────

type FluidConfigField = "collateralFactor" | "liquidationThreshold" | "liquidationMaxLimit" | "liquidationPenalty";

const CONFIG_GLOSS: Record<FluidConfigField, string> = {
  collateralFactor: "the ratio a position can borrow up to",
  liquidationThreshold: "the ratio at which a position becomes liquidatable",
  liquidationMaxLimit:
    "the ratio past which the vault stops selling to liquidators and absorbs the position onto its own book (why an absorbed liquidation pays no bonus)",
  liquidationPenalty: "the premium floor the engine guarantees a liquidator",
};

/** A vault's governance-set risk rung — one of the config block's 1e4-scaled
 *  percents, read from the vault's own config through getVaultsEntireData. */
export const fluidVaultConfigProv = (field: FluidConfigField, coords: FluidVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute(`VaultResolver.getVaultsEntireData (configs.${field})`, coords),
  summary: `${field} — the vault's governance-set risk line${atBlock(coords)} (\`configs.${field}\`, a 1e4-scaled percent): ${CONFIG_GLOSS[field]}. Each Fluid vault is one (collateral, debt) pair carrying its own three-rung ladder; this is one rung, read straight from the vault's own config.`,
  contract: vaultContract(coords),
  via: `${LANE} · VaultResolver.getVaultsEntireData() · configs.${field} @ head`,
});

// ── vault-level: the oracle price ────────────────────────────────────────────

/** The vault's own oracle price — DEBT PER COLLATERAL, Fluid's only price
 *  space. There is no USD feed anywhere in the protocol. */
export const fluidOraclePriceProv = (coords: FluidVaultCoords): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  verify: recompute("VaultResolver.getVaultsEntireData (configs.oraclePriceLiquidate)", coords),
  summary: `The ${coords.colSym ?? "collateral"} price in ${coords.debtSym ?? "the debt token"} — the vault's own oracle (each Fluid vault names one), read as \`configs.oraclePriceLiquidate\` through getVaultsEntireData${atBlock(coords)}. Fluid oracles price the collateral IN THE DEBT TOKEN; there is no USD feed anywhere in the protocol — this pair price is the exact space the liquidation engine judges in (the liquidate-leg price, the one liquidations use).`,
  contract: { name: "Fluid vault oracle", address: coords.oracle ?? undefined },
  via: `${LANE} · VaultResolver.getVaultsEntireData() · configs.oraclePriceLiquidate @ head`,
});

// ── vault-level: leg sizes ───────────────────────────────────────────────────

/** A leg's vault total — totalSupplyVault / totalBorrowVault, the vault's own
 *  aggregate on that leg, scaled by the leg's decimals. On a smart leg the
 *  figure is DEX pool SHARES (a quantity, not a token). */
export const fluidVaultSizeProv = (
  side: "supply" | "borrow",
  smartLeg: boolean,
  coords: FluidVaultCoords,
): Provenance => {
  const field = side === "supply" ? "totalSupplyVault" : "totalBorrowVault";
  const unit = smartLeg
    ? "DEX pool shares — the leg holds shares of a Fluid DEX pool, a quantity, not a token"
    : "the leg's own token units";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute(`VaultResolver.getVaultsEntireData (totalSupplyAndBorrow.${field})`, coords),
    summary: `The vault's total ${side} — \`totalSupplyAndBorrow.${field}\`${atBlock(coords)}, the vault's own aggregate on this leg, scaled by the leg's decimals. In ${unit}. Not a sum over events: the resolver returns the vault's settled total directly.`,
    contract: vaultContract(coords),
    via: `${LANE} · VaultResolver.getVaultsEntireData() · totalSupplyAndBorrow.${field} @ head`,
  };
};

/** A smart leg's DEX-share composition — what the leg's shares are MADE OF,
 *  resolved through the DexResolver at head. Supply and debt legs are different
 *  instruments backed by different reserves, so each reads its OWN per-share
 *  pair (perSupplyShare vs perBorrowShare). Composition, NOT price. */
export const fluidSmartLegProv = (side: "supply" | "borrow", coords: FluidVaultCoords): Provenance => {
  const shareField = side === "supply" ? "totalSupplyVault" : "totalBorrowVault";
  const perField = side === "supply" ? "token{0,1}PerSupplyShare" : "token{0,1}PerBorrowShare";
  return {
    kind: "chain-derived",
    source: { block: coords.blockNumber },
    summary: `What the smart ${side} leg's DEX shares are made of${atBlock(coords)} — the leg's total shares (\`totalSupplyAndBorrow.${shareField}\`) resolved through the DexResolver's OWN per-share composition (\`${perField}\`), the vault's pro-rata slice of the pool's reserves. This is the ${side} leg's own reserves, read separately from the debt leg's. Composition, NOT price: pro-rata is Fluid's own redemption mechanic (withdrawPerfect), and no USD is implied — Fluid runs no USD feed.`,
    contract: DEX_RESOLVER_CONTRACT,
    via: `${LANE} · VaultResolver.getVaultsEntireData() × DexResolver.getDexEntireDatas([pool]) @ head`,
    formula: "shares × per-share composition ÷ 1e18",
    inputs: [
      {
        label: "shares",
        kind: "chain",
        pclass: "state",
        note: `totalSupplyAndBorrow.${shareField} @ head`,
      },
      {
        label: "per-share composition",
        kind: "chain",
        pclass: "state",
        note: `DexResolver ${perField} @ head`,
      },
    ],
  };
};

// ── vault-level: rate ────────────────────────────────────────────────────────

/** A vault rate (annual percent) from the resolver's rates block. Only stated
 *  on a token leg — a smart leg's resolver rate is only the vault's own
 *  reward/fee component, not the full rate. */
export const fluidVaultRateProv = (side: "supply" | "borrow", coords: FluidVaultCoords): Provenance => {
  const field = side === "supply" ? "supplyRateVault" : "borrowRateVault";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute(`VaultResolver.getVaultsEntireData (exchangePricesAndRates.${field})`, coords),
    summary: `The vault's current ${side} rate, annual${atBlock(coords)} — the resolver's own rates block (\`exchangePricesAndRates.${field}\`, a 1e2-precision percent): the liquidity-layer rate with the vault's reward or fee magnifier applied. Rates float with utilisation; this is the rate at this block, not a projection.`,
    contract: vaultContract(coords),
    via: `${LANE} · VaultResolver.getVaultsEntireData() · exchangePricesAndRates.${field} @ head`,
  };
};
