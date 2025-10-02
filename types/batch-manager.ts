export interface BatchManager {
  name: string;
  address: string;
  description: string;
  website: string;
  asset_symbol: string;
  asset_contract: string;
}

export interface BatchManagerData {
  version: string;
  last_updated: string;
  batch_managers: BatchManager[];
}

export interface BatchManagerSearchResult extends BatchManager {
  relevance?: number;
}

export interface BatchManagerIndexes {
  byAddress: Map<string, BatchManager>;
  byAssetSymbol: Map<string, BatchManager[]>;
  byName: Map<string, BatchManager>;
}
