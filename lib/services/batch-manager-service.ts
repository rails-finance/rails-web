import { BatchManager, BatchManagerData, BatchManagerIndexes, BatchManagerSearchResult } from "@/types/batch-manager";
import { isAddress, getAddress } from "viem";
import batchManagersData from "@/data/batch-managers.json";

class BatchManagerService {
  private data: BatchManagerData;
  private indexes: BatchManagerIndexes;
  private initialized: boolean = false;

  constructor() {
    this.data = batchManagersData as BatchManagerData;
    this.indexes = {
      byAddress: new Map(),
      byAssetSymbol: new Map(),
      byName: new Map(),
    };
    this.initialize();
  }

  private initialize(): void {
    if (this.initialized) return;

    for (const manager of this.data.batch_managers) {
      const normalizedAddress = manager.address.toLowerCase();

      this.indexes.byAddress.set(normalizedAddress, manager);

      this.indexes.byName.set(manager.name.toLowerCase(), manager);

      const assetSymbol = manager.asset_symbol.toUpperCase();
      if (!this.indexes.byAssetSymbol.has(assetSymbol)) {
        this.indexes.byAssetSymbol.set(assetSymbol, []);
      }
      this.indexes.byAssetSymbol.get(assetSymbol)!.push(manager);
    }

    this.initialized = true;
  }

  getAll(): BatchManager[] {
    return this.data.batch_managers;
  }

  getByAddress(address: string): BatchManager | undefined {
    if (!isAddress(address)) return undefined;
    return this.indexes.byAddress.get(address.toLowerCase());
  }

  getByAssetSymbol(symbol: string): BatchManager[] {
    return this.indexes.byAssetSymbol.get(symbol.toUpperCase()) || [];
  }

  search(query: string): BatchManagerSearchResult[] {
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
      return this.data.batch_managers;
    }

    if (isAddress(searchTerm)) {
      const manager = this.getByAddress(searchTerm);
      return manager ? [{ ...manager, relevance: 100 }] : [];
    }

    const results: BatchManagerSearchResult[] = [];
    const seen = new Set<string>();

    for (const manager of this.data.batch_managers) {
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

  validateAddress(address: string): boolean {
    if (!isAddress(address)) return false;
    return this.indexes.byAddress.has(address.toLowerCase());
  }

  getStats(): {
    total: number;
    byAsset: Record<string, number>;
    withWebsite: number;
  } {
    const stats = {
      total: this.data.batch_managers.length,
      byAsset: {} as Record<string, number>,
      withWebsite: 0,
    };

    for (const [symbol, managers] of this.indexes.byAssetSymbol) {
      stats.byAsset[symbol] = managers.length;
    }

    stats.withWebsite = this.data.batch_managers.filter((m) => m.website).length;

    return stats;
  }

  getVersion(): string {
    return this.data.version;
  }

  getLastUpdated(): string {
    return this.data.last_updated;
  }
}

const batchManagerService = new BatchManagerService();
export default batchManagerService;
