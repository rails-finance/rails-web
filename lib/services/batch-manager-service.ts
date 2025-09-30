import { BatchManager, BatchManagerData, BatchManagerSearchResult } from "@/types/batch-manager";
import { isAddress } from "viem";
import batchManagersData from "@/data/batch-managers.json";

// Module-level data and indexes
const data: BatchManagerData = batchManagersData as BatchManagerData;
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
 * Get all batch managers
 */
export function getAllBatchManagers(): BatchManager[] {
  return data.batch_managers;
}

/**
 * Get batch manager by address
 * Handles null/undefined gracefully
 */
export function getBatchManagerByAddress(address: string | null | undefined): BatchManager | null {
  if (!address || !isAddress(address)) return null;
  return indexes.byAddress.get(address.toLowerCase()) || null;
}

/**
 * Get batch managers by asset symbol
 */
export function getBatchManagersByAsset(symbol: string): BatchManager[] {
  return indexes.byAssetSymbol.get(symbol.toUpperCase()) || [];
}

/**
 * Search batch managers by query
 */
export function searchBatchManagers(query: string): BatchManagerSearchResult[] {
  const searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    return data.batch_managers;
  }

  if (isAddress(searchTerm)) {
    const manager = getBatchManagerByAddress(searchTerm);
    return manager ? [{ ...manager, relevance: 100 }] : [];
  }

  const results: BatchManagerSearchResult[] = [];
  const seen = new Set<string>();

  for (const manager of data.batch_managers) {
    let relevance = 0;

    if (manager.name.toLowerCase() === searchTerm) {
      relevance = 100;
    } else if (manager.name.toLowerCase().includes(searchTerm)) {
      relevance = 80;
    }

    if (manager.asset_symbol.toLowerCase() === searchTerm) {
      relevance = Math.max(relevance, 90);
    } else if (manager.asset_symbol.toLowerCase().includes(searchTerm)) {
      relevance = Math.max(relevance, 70);
    }

    if (manager.description.toLowerCase().includes(searchTerm)) {
      relevance = Math.max(relevance, 60);
    }

    if (manager.website && manager.website.toLowerCase().includes(searchTerm)) {
      relevance = Math.max(relevance, 50);
    }

    if (manager.address.toLowerCase().includes(searchTerm)) {
      relevance = Math.max(relevance, 40);
    }

    if (relevance > 0 && !seen.has(manager.address)) {
      results.push({ ...manager, relevance });
      seen.add(manager.address);
    }
  }

  return results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
}

/**
 * Validate if address is a known batch manager
 */
export function isBatchManager(address: string): boolean {
  if (!isAddress(address)) return false;
  return indexes.byAddress.has(address.toLowerCase());
}

/**
 * Get batch manager statistics
 */
export function getBatchManagerStats(): {
  total: number;
  byAsset: Record<string, number>;
  withWebsite: number;
} {
  const stats = {
    total: data.batch_managers.length,
    byAsset: {} as Record<string, number>,
    withWebsite: 0,
  };

  for (const [symbol, managers] of indexes.byAssetSymbol) {
    stats.byAsset[symbol] = managers.length;
  }

  stats.withWebsite = data.batch_managers.filter((m) => m.website).length;

  return stats;
}

/**
 * Get data version
 */
export function getBatchManagerVersion(): string {
  return data.version;
}

/**
 * Get last update timestamp
 */
export function getBatchManagerLastUpdated(): string {
  return data.last_updated;
}

/**
 * Format batch manager for display
 * Returns manager name or truncated address
 */
export function formatBatchManagerDisplay(address: string | null | undefined): string {
  if (!address) return "Unknown";

  const manager = getBatchManagerByAddress(address);
  if (manager) {
    return manager.name;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}