// Receipts the vault card (V2) and "Where the assets are" (V3) draw for any
// family: the steward's address and a venue's share of this vault. Every other
// figure keeps its family's receipt (lib/morpho-base/vault-provenance.ts,
// lib/aave-vaults/vault-provenance.ts, lib/yearn/vault-provenance.ts).

import type { Provenance } from "@/components/shared/provenance";
import type { VaultSteward, VaultSummary } from "@/lib/vaults/summary";
import { stampServerRead, type ServerRead } from "@/lib/shared/server-head-read";

const n = (v: number) => v.toLocaleString("en-US");

const CALL: Record<VaultSteward["role"], string> = {
  curator: "curator()",
  owner: "owner()",
  roleManager: "role_manager()",
  poolDelegate: "poolDelegate() on the PoolManager",
};

const contractOf = (v: VaultSummary) => ({ name: v.name ?? v.catalogName ?? v.symbol ?? "vault", address: v.address });

/** The steward: the address the vault's own call names. */
export const vaultStewardProv = (v: VaultSummary, s: VaultSteward, readBy?: ServerRead | null): Provenance =>
  stampServerRead(
    {
      kind: "chain",
      pclass: "state",
      source: { block: v.readAt.block },
      verify: { kind: "recompute", text: `Call ${CALL[s.role]} on ${v.address} at block ${n(v.readAt.block)}` },
      summary: `Steward — the vault's \`${CALL[s.role]}\` at block ${n(v.readAt.block)}: ${s.address}. An address: who holds it is stated nowhere on chain.`,
      contract: contractOf(v),
      via: `chain · ${CALL[s.role]} @ the pinned block`,
    },
    readBy,
  );

/** A venue's share of this vault: its amount over the table's denominator,
 *  both read at the same block. */
export const vaultVenueShareProv = (
  v: VaultSummary,
  venue: string,
  denominator: string,
  readBy?: ServerRead | null,
): Provenance =>
  stampServerRead(
    {
      kind: "chain-derived",
      pclass: "state",
      source: { block: v.readAt.block },
      summary: `Share of this vault — ${venue}'s amount over ${denominator}, both read at block ${n(v.readAt.block)} in ${v.asset.symbol}. A ratio of two amounts in one token, so no price is asked.`,
      contract: contractOf(v),
      via: `chain · ${venue} ÷ ${denominator} @ the pinned block`,
      formula: `${venue} ÷ ${denominator}`,
    },
    readBy,
  );

/** A venue of "Where the assets are": the contract or market it is, which the
 *  table's surface names only by its asset or its name. `ids` are the
 *  coordinates the surface leaves out (a Morpho market's id, a strategy's
 *  address), each a labelled input. */
export const vaultVenueProv = (
  v: VaultSummary,
  {
    venue,
    what,
    via,
    contract,
    ids = [],
  }: {
    /** The venue as the table names it. */
    venue: string;
    /** One sentence: what the venue is, and what the vault holds there. */
    what: string;
    /** The call that names the venue: "withdrawQueue(i) · idToMarketParams(id)". */
    via: string;
    contract?: { name: string; address?: string };
    ids?: { label: string; value: string }[];
  },
  readBy?: ServerRead | null,
): Provenance =>
  stampServerRead(
    {
      kind: "chain",
      pclass: "state",
      source: { block: v.readAt.block },
      summary: `${venue} — ${what} Read at block ${n(v.readAt.block)}.`,
      contract: contract ?? contractOf(v),
      via: `chain · ${via} @ the pinned block`,
      inputs: ids.map((i) => ({ label: i.label, value: i.value, kind: "chain" as const, pclass: "state" as const })),
    },
    readBy,
  );
