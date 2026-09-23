import { isAddress } from "viem";
import batchManagersData from "@/data/batch-managers.json";

export interface BatchManager {
  name: string;
  address: string;
  description: string;
  website: string;
}

/**
 * Reject a registry whose entries carry an `address` or `asset_contract` that
 * is not a 20-byte hex address. The registry is hand-maintained JSON and
 * `address` is compared by bare `toLowerCase()` against addresses that arrive
 * from chain, so a malformed entry can never match anything — it just sits in
 * the map, and in `getAllBatchManagers()` / `searchBatchManagers()`, looking
 * like a real manager. Two "Mock Delegate Manager" fixtures (one with the
 * non-hex address `0xbatch1234…`) rode in with the migration baseline and
 * survived until now precisely because nothing looked.
 *
 * `asset_contract` carries the same risk in a quieter form: it is not shape
 * *and* content checked against anything, so 17 entries once carried a
 * placeholder address (not the mainnet token) with no failure anywhere in the
 * pipeline. This guard only checks shape — that it is a real 20-byte hex
 * address — not that it names the correct token for `asset_symbol`; nothing
 * dereferences `asset_contract` today, so there is no chain read to check it
 * against.
 *
 * The data is a static import, so this runs at build/module-load: a bad entry
 * fails the build rather than shipping a manager that silently matches nothing.
 * Checksum is not enforced (`strict: false`) — the registry is lowercase by
 * convention, which is the shape the chain-side comparison wants.
 */
export function assertValidBatchManagerAddresses(
  entries: readonly { name: string; address: string; asset_contract: string }[],
): void {
  const bad = entries.filter((bm) => !isAddress(bm.address, { strict: false }));
  if (bad.length > 0) {
    throw new Error(
      `data/batch-managers.json: ${bad.length === 1 ? "1 entry carries" : `${bad.length} entries carry`} a malformed address: ` +
        bad.map((bm) => `${bm.name} (${bm.address})`).join(", "),
    );
  }

  const badAssetContracts = entries.filter((bm) => !isAddress(bm.asset_contract, { strict: false }));
  if (badAssetContracts.length > 0) {
    throw new Error(
      `data/batch-managers.json: ${badAssetContracts.length === 1 ? "1 entry carries" : `${badAssetContracts.length} entries carry`} a malformed asset_contract: ` +
        badAssetContracts.map((bm) => `${bm.name} (${bm.asset_contract})`).join(", "),
    );
  }
}

assertValidBatchManagerAddresses(batchManagersData.batch_managers);

const BY_ADDR = new Map<string, BatchManager>(
  batchManagersData.batch_managers.map((bm) => [bm.address.toLowerCase(), bm as BatchManager]),
);

export function getBatchManagerByAddress(address: string): BatchManager | undefined {
  return BY_ADDR.get(address.toLowerCase());
}

export function getBatchManagerName(address: string): string {
  return BY_ADDR.get(address.toLowerCase())?.name ?? address.slice(0, 8) + "…" + address.slice(-4);
}
