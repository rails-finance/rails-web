// A transaction's gas as the index rows carry it (ui-jobs 309 step 8): gas
// used × the gas price, in ETH. The index carries no ETH price at the block, so
// the USD leg stays 0 and the card states the ETH figure. A transaction's gas
// stands on its first row only (the lowest log index among the position's rows
// in it), so a transaction that logged several of the position's events states
// its gas once. Whether the owner paid it is the card's call
// (components/shared/event-price-row.tsx `ownerPaidGas`).

import type { GasCost } from "@/lib/shared/types/event-shape";

interface GasRow {
  tx_hash: string | null;
  log_index: number;
  tx_gas_used?: string | null;
  tx_gas_price?: string | null;
}

/** The gas of a row's transaction, where both figures are present. */
export function indexRowGas(r: GasRow): GasCost | undefined {
  const used = r.tx_gas_used != null ? Number(r.tx_gas_used) : NaN;
  const price = r.tx_gas_price != null ? Number(r.tx_gas_price) : NaN;
  if (!Number.isFinite(used) || !Number.isFinite(price) || used <= 0 || price <= 0) return undefined;
  return { gasUsed: used, gasCostEth: (used * price) / 1e18, gasCostUsd: 0 };
}

/** Each transaction's lowest log index among `rows`. */
export function firstLogOfTx(rows: readonly GasRow[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const r of rows) {
    const tx = (r.tx_hash ?? "").toLowerCase();
    if (!tx) continue;
    const at = first.get(tx);
    if (at == null || r.log_index < at) first.set(tx, r.log_index);
  }
  return first;
}

/** `{ gas }` for the first row of its transaction, else nothing. */
export function gasOnFirstRow(r: GasRow, first: Map<string, number>): { gas?: GasCost } {
  if (first.get((r.tx_hash ?? "").toLowerCase()) !== r.log_index) return {};
  const gas = indexRowGas(r);
  return gas ? { gas } : {};
}
