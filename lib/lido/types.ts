// The two rails-server routes behind Lido on Rails (rails-ops ui-jobs 570): a
// wallet's stake in stETH and wstETH with its withdrawal requests, and the
// protocol's totals, read at named blocks. Raw chain values; bigints as decimal
// strings. The web does the math (lib/lido/stake.ts).
//
// Pure, with no imports: the unit tests read the modules that use it.

export interface BlockRef {
  block: number;
  /** Unix seconds. */
  time: number;
}

interface Contracts {
  steth: string;
  wsteth: string;
  queue: string;
}

export type LidoWindowState = "ok" | "opened" | "changed";

/** A wallet's stake at one block. */
export interface LidoStakeAt {
  /** stETH shares the wallet holds. */
  stethShares: string;
  /** wstETH the wallet holds: one wstETH is one share. */
  wstethBalance: string;
  /** ETH per 1e18 shares (getPooledEthByShares(1e18)). */
  rate: string;
}

export interface LidoRequest {
  id: string;
  /** stETH locked when the request was made. */
  amountOfStETH: string;
  amountOfShares: string;
  /** Unix seconds. */
  timestamp: number;
  isFinalized: boolean;
  isClaimed: boolean;
  /** ETH a finalized, unclaimed request pays on claim; null otherwise. */
  claimableEth: string | null;
  hint: string | null;
}

/** GET /api/at-block/lido/stake */
export interface LidoStakeRead extends Contracts {
  chainId: number;
  wallet: string;
  /** "ok" where the wallet's shares (stETH shares plus wstETH) are equal at both reads, "opened" where
   *  they were zero then and are above zero now, "changed" otherwise. Earned is stated only when "ok". */
  windowState: LidoWindowState;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  now: LidoStakeAt & {
    /** stETH balanceOf: the stETH leg in ETH. */
    stethBalance: string;
    /** The wstETH leg in ETH (getPooledEthByShares of the wstETH balance). */
    wstethEth: string;
    /** The stake in ETH (getPooledEthByShares of all its shares). */
    totalEth: string;
  };
  past: LidoStakeAt;
  requests: {
    count: number;
    lastFinalizedRequestId: string;
    lastCheckpointIndex: string;
    /** The newest first. */
    rows: LidoRequest[];
    truncated: boolean;
  };
}

export interface LidoProtocolAt {
  totalPooledEther: string;
  totalShares: string;
  rate: string;
}

/** GET /api/at-block/lido/protocol */
export interface LidoProtocolRead extends Contracts {
  chainId: number;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  now: LidoProtocolAt & { lastRequestId: string; lastFinalizedRequestId: string; unfinalizedStETH: string };
  past: LidoProtocolAt;
}

export const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
export const WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
export const WITHDRAWAL_QUEUE = "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1";
/** The withdrawal requests a stake page reads, the newest first. */
export const REQUEST_CAP = 100;
/** Where the 30-day read stands, for a receipt. */
export const GRID = "the multiple of 7,200 blocks 30 days below the head";
