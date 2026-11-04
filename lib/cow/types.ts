// The CoW wallet routes' answers (rails-server api/src/routes/cow.ts): a
// wallet's trades and its tokens from victoria's Sieve, at the checkpoint
// block each answer names.

export interface CowAsOf {
  block: number;
  source: "sieve-checkpoint";
}

/** One `Trade` log of GPv2Settlement, amounts as the log's raw integers. */
export interface CowTrade {
  /** `<block>-<txIndex>-<logIndex>`, also the paging cursor. */
  id: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
  txIndex: number;
  /** Sieve's log index, counted within the transaction. */
  logIndex: number;
  /** The settlement transaction's sender (the solver's account). */
  txFrom: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  orderUid: string;
  /** The order's expiry, the UID's last four bytes (unix seconds). */
  validTo: number | null;
  /** The settlement transaction's trades, this one included. */
  settlementTrades: number;
}

export interface CowTokenScale {
  symbol: string | null;
  decimals: number | null;
}

export interface CowTradesPage {
  chainId: 1;
  wallet: string;
  asOf: CowAsOf;
  filter: { tokens: string[]; pair: boolean };
  /** Trades matching the filter; null on a later page. */
  matched: number | null;
  trades: CowTrade[];
  next: string | null;
  tokens: Record<string, CowTokenScale>;
}

/** One token the wallet sold or bought. */
export interface CowWalletToken {
  address: string;
  trades: number;
  firstBlock: number;
  lastBlock: number;
  symbol: string | null;
  decimals: number | null;
  name: string | null;
  readAtBlock: number | null;
}

export interface CowWalletSummary {
  trades: number;
  firstBlock: number | null;
  firstTimestamp: number | null;
  lastBlock: number | null;
  lastTimestamp: number | null;
}

export interface CowWalletTokens {
  chainId: 1;
  wallet: string;
  asOf: CowAsOf;
  summary: CowWalletSummary;
  tokens: CowWalletToken[];
}

/** What the wallet view draws for CoW (W7): the summary and its block. */
export interface CowWalletEntry {
  summary: CowWalletSummary;
  asOf: CowAsOf;
}
