// Receipts the vault card (V2) and "Where the assets are" (V3) draw for any
// family: the steward's address and a venue's share of this vault. Every other
// figure keeps its family's receipt (lib/morpho-base/vault-provenance.ts,
// lib/aave-vaults/vault-provenance.ts, lib/yearn/vault-provenance.ts).

import type { Provenance } from "@/components/shared/provenance";
import type { VaultSteward, VaultSummary } from "@/lib/vaults/summary";

const n = (v: number) => v.toLocaleString("en-US");

const CALL: Record<VaultSteward["role"], string> = {
  curator: "curator()",
  owner: "owner()",
  roleManager: "role_manager()",
};

const contractOf = (v: VaultSummary) => ({ name: v.name ?? v.catalogName ?? v.symbol ?? "vault", address: v.address });

/** The steward: the address the vault's own call names. */
export const vaultStewardProv = (v: VaultSummary, s: VaultSteward): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: v.readAt.block },
  verify: { kind: "recompute", text: `Call ${CALL[s.role]} on ${v.address} at block ${n(v.readAt.block)}` },
  summary: `Steward — the vault's \`${CALL[s.role]}\` at block ${n(v.readAt.block)}: ${s.address}. An address: who holds it is stated nowhere on chain.`,
  contract: contractOf(v),
  via: `chain · ${CALL[s.role]} @ the pinned block`,
});

/** A venue's share of this vault: its amount over the table's denominator,
 *  both read at the same block. */
export const vaultVenueShareProv = (v: VaultSummary, venue: string, denominator: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: v.readAt.block },
  summary: `Share of this vault — ${venue}'s amount over ${denominator}, both read at block ${n(v.readAt.block)} in ${v.asset.symbol}. A ratio of two amounts in one token, so no price is asked.`,
  contract: contractOf(v),
  via: `chain · ${venue} ÷ ${denominator} @ the pinned block`,
  formula: `${venue} ÷ ${denominator}`,
});
