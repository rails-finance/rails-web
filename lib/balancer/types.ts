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
  flows: BalFlow[];
}

export type BalFinderSource = "liquidity-added";

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
    balance: string;
    totalSupply: string;
    tokens: BalToken[];
    balancesRaw: string[];
  }[];
  truncated: boolean;
}

/** The Vault, the same address on Ethereum, Arbitrum and Base. */
export const BALANCER_VAULT = "0xbA1333333333a1BA1108E8412f11850A5C319bA9";
/** The Vault's first block on Ethereum, where the wallet search starts. */
export const BALANCER_FIRST_BLOCK = 21_336_938;
