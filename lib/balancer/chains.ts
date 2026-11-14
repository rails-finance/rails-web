// The chains Balancer V3 on Rails reads (rails-ops ui-jobs 569): each one's
// roster session, the URL path its pages live under, its name, the Vault's first block there, and how its 30-day
// read finds its block. The Vault has one address on every chain.
//
// Pure, with no imports: the unit tests read the modules that use it.

export type BalChainId = 1 | 42161;

export interface BalChain {
  session: "balancer-v3" | "balancer-v3-arbitrum";
  /** The explorer's URL path: the URL slug is "balancer-v3" on both chains, unlike the session. */
  home: "/ethereum/balancer-v3" | "/arbitrum/balancer-v3";
  name: string;
  /** The Vault's first block, where the wallet search starts. */
  firstBlock: number;
  /** The past read's block, for a receipt. */
  grid: string;
}

export const BAL_CHAINS: Record<BalChainId, BalChain> = {
  1: {
    session: "balancer-v3",
    home: "/ethereum/balancer-v3",
    name: "Ethereum",
    firstBlock: 21_336_938,
    grid: "the multiple of 7,200 blocks 30 days below the head",
  },
  42161: {
    session: "balancer-v3-arbitrum",
    home: "/arbitrum/balancer-v3",
    name: "Arbitrum",
    firstBlock: 297_829_457,
    grid: "the block at the UTC midnight 30 days before the head's last one",
  },
};

export const balChain = (chainId: number): BalChain => BAL_CHAINS[chainId as BalChainId] ?? BAL_CHAINS[1];
