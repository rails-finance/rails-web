// The chain axis — one registry for every place the app used to assume Ethereum.
// ----------------------------------------------------------------------------
// Until Base (basedollar) there was exactly one chain, so "mainnet" was spelled
// inline everywhere: `chain: mainnet` in the viem client, and 103 hand-built
// `https://etherscan.io/...` hrefs across 72 files. Neither is wrong on L1 —
// both are simply unparameterised.
//
// This module is the parameter. It carries no secrets and no server-only
// imports, so it is safe in a client component; the RPC *URL* deliberately
// lives in env (see rpc.ts), not here.
//
// Chain 1 is the default everywhere on purpose. Every existing call site that
// does not pass a chain keeps rendering the exact Etherscan URL it rendered
// before — the L1 protocol surface is untouched by the Base work.

export type ChainId = 1 | 10 | 8453 | 4663 | 5042 | 42161 | 11155111;

export const MAINNET_CHAIN_ID = 1 satisfies ChainId;
export const BASE_CHAIN_ID = 8453 satisfies ChainId;
/** Arbitrum One. Its first roster entry is Aave V3 (`aave-v3-arbitrum`), which
 *  puts the chain on the nav, the sitemap and /coverage/arbitrum. */
export const ARBITRUM_CHAIN_ID = 42161 satisfies ChainId;
/** OP Mainnet. Registered ahead of any launched explorer on it: until one
 *  launches, `isLaunchedChain` keeps it off every listing surface. */
export const OPTIMISM_CHAIN_ID = 10 satisfies ChainId;
/** Arc, Circle's chain, whose native coin is USDC. Registered ahead of any
 *  launched explorer on it, as Optimism is. */
export const ARC_CHAIN_ID = 5042 satisfies ChainId;
/** Robinhood Chain, an Arbitrum chain running Arbitrum Nitro. Registered ahead
 *  of any launched explorer on it, as Optimism is. */
export const ROBINHOOD_CHAIN_ID = 4663 satisfies ChainId;
/** Sepolia — the first testnet chain in Rails (Polaris runs there). A
 *  testnet's numbers are test numbers; `testnet: true` on its entry is what
 *  lets copy say so where it matters. */
export const SEPOLIA_CHAIN_ID = 11155111 satisfies ChainId;

export interface NativeCurrency {
  symbol: string;
  name: string;
  /** The native balance's decimals (`eth_getBalance`, `msg.value`). */
  decimals: number;
}

/** Every chain's native coin unless its entry names another. */
const ETHER: NativeCurrency = { symbol: "ETH", name: "Ether", decimals: 18 };

export interface ChainMeta {
  id: ChainId;
  /** Human name for prose and provenance receipts. */
  name: string;
  /** URL segment for this chain — the directory route (`/base`) and the first
   *  segment of every explorer route under it (`/base/aave-v3`). See rails-ops
   *  `decisions/0016-path-scoped-chain-routes.md`. */
  slug: string;
  /** The block explorer's own name — used in aria-labels and "View on X". */
  explorerName: string;
  /** Origin only, no trailing slash. */
  explorerBase: string;
  /** Server env var holding this chain's JSON-RPC URL. */
  rpcEnv: string;
  /** Server env var holding the endpoint that answers WIDE-RANGE `eth_getLogs`
   *  for this chain — the whole-life history sweeps, not the `eth_call` state
   *  reads. Separate from `rpcEnv` so a sweep never shares a rate budget with
   *  the page's state reads: on Base the two are different Alchemy apps
   *  (`rails-base-backfill` for history, the site's own app for state). A chain
   *  whose one app serves both simply names the same var twice. */
  logsRpcEnv: string;
  /** The explorer's software when it is not Etherscan-family. Blockscout takes
   *  the same /tx, /address, /block and /token paths and shows a transaction's
   *  logs on `?tab=logs` in place of the `#eventlog` anchor. */
  explorerKind?: "blockscout";
  /** The native coin when it is not 18-decimal ETH: Arc pays gas in USDC. */
  nativeCurrency?: NativeCurrency;
  /** Optional server env var holding a second JSON-RPC URL for the state reads.
   *  When set, `chainClient` tries `rpcEnv` first and falls to this URL for a
   *  call the first one refused or did not answer. Absent on every chain but
   *  Arbitrum. */
  fallbackRpcEnv?: string;
  /** A test network. Absent (false) on every production chain. Surfaces that
   *  state figures as money read this to say "testnet" once, where a reader
   *  would otherwise take a Sepolia balance for a real one. */
  testnet?: boolean;
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  1: {
    id: 1,
    name: "Ethereum",
    slug: "ethereum",
    explorerName: "Etherscan",
    explorerBase: "https://etherscan.io",
    rpcEnv: "ALCHEMY_URL",
    logsRpcEnv: "ALCHEMY_URL",
  },
  8453: {
    id: 8453,
    name: "Base",
    slug: "base",
    explorerName: "Basescan",
    explorerBase: "https://basescan.org",
    rpcEnv: "BASE_RPC_URL",
    // Alchemy PAYG answers a whole-life, wallet-filtered sweep in 2.5M-block
    // chunks (36 logs, 0 refusals, 2026-09-19). BASE_LOGS_RPC_URL was Tenderly's
    // public gateway, which since at least 2026-09-07 refuses any range over
    // 1,000 blocks — every chunk of every Base sweep failed and became a gap.
    logsRpcEnv: "BASE_BACKFILL_RPC_URL",
  },
  42161: {
    id: 42161,
    name: "Arbitrum",
    slug: "arbitrum",
    explorerName: "Arbiscan",
    // Etherscan-family, so the PATHS below and the #eventlog anchor hold.
    explorerBase: "https://arbiscan.io",
    rpcEnv: "ARBITRUM_RPC_URL",
    logsRpcEnv: "ARBITRUM_LOGS_RPC_URL",
    // The Alchemy Arbitrum app; the Tenderly gateway in `rpcEnv` answers first.
    fallbackRpcEnv: "ARBITRUM_FALLBACK_RPC_URL",
  },
  10: {
    id: 10,
    name: "Optimism",
    slug: "optimism",
    explorerName: "Optimism Etherscan",
    // Etherscan-family, so the PATHS below and the #eventlog anchor hold.
    explorerBase: "https://optimistic.etherscan.io",
    // Tenderly's keyless gateway answers both the state reads and whole-life
    // logs here, so both names are the same var.
    rpcEnv: "OPTIMISM_RPC_URL",
    logsRpcEnv: "OPTIMISM_RPC_URL",
  },
  5042: {
    id: 5042,
    name: "Arc",
    slug: "arc",
    // Named in Arc's docs (docs.arc.io, "Connect to Arc": the mainnet
    // `blockExplorers` entry). The site runs Blockscout.
    explorerName: "Arc Explorer",
    explorerBase: "https://explorer.arc.io",
    explorerKind: "blockscout",
    rpcEnv: "ARC_RPC_URL",
    logsRpcEnv: "ARC_RPC_URL",
    // USDC is the native coin: 18 decimals as the native balance. Its ERC-20
    // interface at 0x3600…0000 reports 6 (ARC_USDC_ERC20 below).
    nativeCurrency: { symbol: "USDC", name: "USDC", decimals: 18 },
  },
  4663: {
    id: 4663,
    name: "Robinhood Chain",
    slug: "robinhood",
    // The explorer Robinhood's docs link (docs.robinhood.com/chain, the network
    // table). The site runs Blockscout.
    explorerName: "Blockscout",
    explorerBase: "https://robinhoodchain.blockscout.com",
    explorerKind: "blockscout",
    // The public RPC (rpc.mainnet.chain.robinhood.com) serves both names. It is
    // not an archive node: state at a past block is unavailable, so a read at a
    // past block fails there. `eth_getLogs` takes at most 10,000,000 blocks per
    // call.
    rpcEnv: "ROBINHOOD_RPC_URL",
    logsRpcEnv: "ROBINHOOD_RPC_URL",
  },
  11155111: {
    id: 11155111,
    name: "Sepolia",
    slug: "sepolia",
    // Etherscan runs the Sepolia explorer under its own brand, on a subdomain.
    explorerName: "Etherscan",
    explorerBase: "https://sepolia.etherscan.io",
    // One Alchemy endpoint serves both the state reads and the wide-range
    // getLogs sweeps on Sepolia (measured 2026-09-05: a full-history
    // address-scoped call answers in one shot), so both names are the same var.
    rpcEnv: "SEPOLIA_RPC_URL",
    logsRpcEnv: "SEPOLIA_RPC_URL",
    testnet: true,
  },
};

/** The chain's native coin: ETH at 18 decimals unless the entry names another. */
export function nativeCurrency(chainId: ChainId = MAINNET_CHAIN_ID): NativeCurrency {
  return chainMeta(chainId).nativeCurrency ?? ETHER;
}

/** Arc's USDC through its ERC-20 interface: the same balance as the native
 *  coin, stated in 6 decimals where the native balance uses 18. */
export const ARC_USDC_ERC20 = { address: "0x3600000000000000000000000000000000000000", decimals: 6 } as const;

/** Never throws on an unknown id — a bad chain must not blank a rendered page. */
export function chainMeta(chainId: ChainId = MAINNET_CHAIN_ID): ChainMeta {
  return CHAINS[chainId] ?? CHAINS[MAINNET_CHAIN_ID];
}

export type ExplorerLinkKind =
  | "tx"
  /** Transaction, scrolled to its decoded logs — the provenance "see the event" link. */
  | "tx-logs"
  | "address"
  | "block"
  | "token";

const PATHS: Record<ExplorerLinkKind, (v: string) => string> = {
  tx: (v) => `/tx/${v}`,
  // Basescan is Etherscan-family and honours the same #eventlog anchor.
  "tx-logs": (v) => `/tx/${v}#eventlog`,
  address: (v) => `/address/${v}`,
  block: (v) => `/block/${v}`,
  token: (v) => `/token/${v}`,
};

/**
 * Build a block-explorer URL for a chain.
 *
 * `explorerUrl(1, "address", a)` returns exactly the string the inline
 * template literals returned before this module existed — that equivalence is
 * what makes the sweep safe to land on the L1 pages.
 */
export function explorerUrl(chainId: ChainId, kind: ExplorerLinkKind, value: string | number): string {
  if (kind === "tx-logs" && chainMeta(chainId).explorerKind === "blockscout")
    return `${chainMeta(chainId).explorerBase}/tx/${value}?tab=logs`;
  return `${chainMeta(chainId).explorerBase}${PATHS[kind](String(value))}`;
}
