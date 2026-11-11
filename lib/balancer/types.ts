// The two rails-server routes behind Balancer V3 on Rails (rails-ops ui-jobs
// 569): a wallet's share of one pool, and the pools a wallet holds a share of,
// read at named blocks. Raw chain values; bigints as decimal strings. The web
// does the math (lib/balancer/position.ts).
//
// Pure, with no imports: the unit tests read the modules that use it.

export interface BalToken {
  address: string;
  symbol: string;
  decimals: number;
}

export interface BlockRef {
  block: number;
  /** Unix seconds. */
  time: number;
}

/** A pool's state in the Vault at one block. */
export interface BalPoolAt {
  totalSupply: string;
  /** The Vault's raw balance of each pool token, in token units. */
  balancesRaw: string[];
  /** Each balance scaled to 18 decimals and by its token's rate. */
  liveBalancesScaled18: string[] | null;
  /** The pool's value per share, 18 decimals, in the pool's rate-scaled units. */
  bptRate: string | null;
}

export interface BalFlow {
  kind: "add" | "remove";
  block: number;
  time: number;
  txHash: string;
  amountsRaw: string[];
}

/** GET /api/at-block/balancer/position */
export interface BalPositionRead {
  chainId: number;
  vault: string;
  pool: string;
  wallet: string;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  name: string | null;
  symbol: string | null;
  tokens: (BalToken & { tokenType: number; rateProvider: string | null })[];
  paused: boolean | null;
  recoveryMode: boolean | null;
  /** 18 decimals: 1e18 is 100%. */
  swapFee: string | null;
  /** The wallet's pool shares now, 18 decimals. */
  balance: string;
  now: BalPoolAt;
  past: (BalPoolAt & { balance: string }) | null;
  /** The wallet's shares of this pool staked in its gauges at the head, where the server reads them. */
  staked?: BalStaked[];
  /** The wallet's adds and removes in this pool, oldest first: Rails's index, then the chain's logs above it. */
  flows: BalFlow[];
  /** The index's reach from its coverage route, read beside the position by
   *  the web (lib/api/fetch-balancer.ts); null where coverage did not answer. */
  indexThrough?: number | null;
}

/** Why a route refused: the index has no reach from the deployment on the
 *  chain, or it is more than a day of blocks below the head. */
export type BalIndexRefusal = "index_unavailable" | "index_behind";

/** Where the wallet finder looked: "index", Rails's position index of the
 *  Vault's pool-share Transfer events from deployment through `to`; "tail",
 *  the Transfer logs read from the chain after the index, through the head. */
export type BalFinderSource = "index" | "tail";

/** Shares of a pool staked in its gauge: the gauge holds them for the wallet. */
export interface BalStaked {
  gauge: string;
  /** The wallet's staked shares, 18 decimals. */
  balance: string;
}

/** GET /api/at-block/balancer/positions */
export interface BalPositionsRead {
  chainId: number;
  vault: string;
  wallet: string;
  head: BlockRef;
  provider: string;
  sources: { source: BalFinderSource; from: number; to: number; logs: number; pools: number }[];
  checked: number;
  positions: {
    pool: string;
    name: string | null;
    symbol: string | null;
    /** The wallet's own pool shares, 18 decimals. */
    balance: string;
    totalSupply: string;
    tokens: BalToken[];
    balancesRaw: string[];
    /** Shares of this pool the wallet has staked in a gauge, where the server reads them. */
    staked?: BalStaked[];
  }[];
  truncated: boolean;
}

/** The Vault, the same address on Ethereum, Arbitrum and Base. */
export const BALANCER_VAULT = "0xbA1333333333a1BA1108E8412f11850A5C319bA9";
