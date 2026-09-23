import { BatchManager, BatchManagerData, BatchManagerSearchResult } from "@/types/batch-manager";
import { isAddress } from "viem";
import batchManagersData from "@/data/batch-managers.json";
import { assertValidBatchManagerAddresses } from "@/lib/liquity/batch-managers";

// Module-level data and indexes
const data: BatchManagerData = batchManagersData as BatchManagerData;
// Same guard as the other reader of this file: an entry whose address is not a
// 20-byte hex address never matches a lookup here (`getBatchManagerByAddress`
// screens with `isAddress`), but it would still surface through
// `getAllBatchManagers` / `searchBatchManagers` / `getBatchManagerStats`.
assertValidBatchManagerAddresses(data.batch_managers);
const indexes = {
  byAddress: new Map<string, BatchManager>(),
  byAssetSymbol: new Map<string, BatchManager[]>(),
  byName: new Map<string, BatchManager>(),
};

// Initialize indexes immediately at module load
function initializeIndexes(): void {
  for (const manager of data.batch_managers) {
    const normalizedAddress = manager.address.toLowerCase();

    indexes.byAddress.set(normalizedAddress, manager);
    indexes.byName.set(manager.name.toLowerCase(), manager);

    const assetSymbol = manager.asset_symbol.toUpperCase();
    if (!indexes.byAssetSymbol.has(assetSymbol)) {
      indexes.byAssetSymbol.set(assetSymbol, []);
    }
    indexes.byAssetSymbol.get(assetSymbol)!.push(manager);
  }
}

// Initialize on module load
initializeIndexes();

/**
 * Get batch manager by address
 * Handles null/undefined gracefully
 */
export function getBatchManagerByAddress(address: string | null | undefined): BatchManager | null {
  if (!address || !isAddress(address)) return null;
  return indexes.byAddress.get(address.toLowerCase()) || null;
}

/**
 * Get deprecation status for a batch manager
 * Returns null if not deprecated, or an object with the deadline and whether it's past
 */
export function getBatchManagerDeprecation(
  address: string | null | undefined,
): { deprecatedDate: string; isPast: boolean } | null {
  const manager = getBatchManagerByAddress(address);
  if (!manager?.deprecated_date) return null;
  const deadline = new Date(manager.deprecated_date + "T00:00:00Z");
  const isPast = new Date() > deadline;
  return { deprecatedDate: manager.deprecated_date, isPast };
}
