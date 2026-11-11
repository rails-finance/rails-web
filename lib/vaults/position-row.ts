// One census row as /api/vaults/positions serves it (app/api/vaults/positions/
// route.ts): the backend's flat row reshaped into the listing's two-lane row,
// the live lane left empty for the overlay to fill. The family is the
// census's word wherever the web tier knows it (Aave's three, `morpho`,
// `yearn-v3`). Imports only modules with no runtime imports of their own
// (npm test).

import { AAVE_VAULT_FAMILY_ORDER } from "@/lib/aave-vaults/vault-catalog";
import {
  isVaultPositionShape,
  vaultPositionValueFrom,
  type VaultCensusRow,
  type VaultPositionFamily,
  type VaultPositionRow,
} from "@/lib/aave-vaults/vault-position";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

/** The backend's row shape as Phase 1 shipped it (camelCase, flat). */
export interface BackendPositionRow {
  chainId: number;
  vault: string;
  holder: string;
  family: string;
  symbol: string | null;
  shareDecimals: number | null;
  balance: string;
  live: boolean;
  transferCount: number;
  firstBlock: number;
  lastBlock: number;
  shape: string | null;
  shapeDetail: Record<string, unknown> | null;
  censusBlock: number;
  /** mig 206 — null where the vault is unpriced, or before the price pass. */
  valueUsdE8?: string | null;
  sharePpm?: string | null;
}

/** Every family word a census row can carry. */
export const VAULT_POSITION_FAMILIES: readonly VaultPositionFamily[] = [
  ...AAVE_VAULT_FAMILY_ORDER,
  "morpho",
  "yearn-v3",
];

/** Is this a family word the web tier knows? */
export const isVaultPositionFamily = (v: string): v is VaultPositionFamily =>
  (VAULT_POSITION_FAMILIES as readonly string[]).includes(v);

/** Reshape one backend row into the two-lane row the listing renders. The live
 *  lane is filled in afterwards; here it is null, which reads as unread. */
export function toRow(r: BackendPositionRow, chainId: number, census: VaultCensusRow | null): VaultPositionRow {
  return {
    chainId: r.chainId,
    vault: r.vault.toLowerCase(),
    holder: r.holder.toLowerCase(),
    // A family the web tier does not know is not silently renamed: the row
    // keeps the census's word where it is one this tier knows, and otherwise
    // falls back to the chain's own single family — never to another chain's.
    family: isVaultPositionFamily(r.family) ? r.family : chainId === BASE_CHAIN_ID ? "morpho" : "stata",
    symbol: r.symbol,
    shareDecimals: r.shareDecimals,
    census: {
      block: r.censusBlock,
      balance: r.balance,
      live: r.live,
      transferCount: r.transferCount,
      firstBlock: r.firstBlock,
      lastBlock: r.lastBlock,
      shape: r.shape != null && isVaultPositionShape(r.shape) ? r.shape : null,
      shapeDetail: r.shapeDetail,
      sharePpm: r.sharePpm ?? null,
    },
    live: null,
    asset: null,
    firstSeenAt: null,
    lastActivityAt: null,
    value: vaultPositionValueFrom(census, r.valueUsdE8 ?? null),
  };
}
