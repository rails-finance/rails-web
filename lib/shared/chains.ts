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

export type ChainId = 1 | 8453 | 11155111;

export const MAINNET_CHAIN_ID = 1 satisfies ChainId;
export const BASE_CHAIN_ID = 8453 satisfies ChainId;
/** Sepolia — the first testnet chain in Rails (Polaris runs there). A
 *  testnet's numbers are test numbers; `testnet: true` on its entry is what
 *  lets copy say so where it matters. */
export const SEPOLIA_CHAIN_ID = 11155111 satisfies ChainId;

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
  /** Where this chain sits — "L1" for a settlement layer, "L2" for a rollup on
   *  one. It exists for the one sentence that says it: the home page's scope
   *  phrase ("positions across Ethereum L1 and Base L2 DeFi"), which is built
   *  from the chains the site actually offers rather than written out, so it
   *  cannot name a chain the nav has stopped linking. A testnet takes its
   *  parent's layer — Sepolia is an L1 — and is left out of that phrase by
   *  `testnet`, not by this. */
  layer: "L1" | "L2";
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
    layer: "L1",
    explorerName: "Etherscan",
    explorerBase: "https://etherscan.io",
    rpcEnv: "ALCHEMY_URL",
    logsRpcEnv: "ALCHEMY_URL",
  },
  8453: {
    id: 8453,
    name: "Base",
    slug: "base",
    layer: "L2",
    explorerName: "Basescan",
    explorerBase: "https://basescan.org",
    rpcEnv: "BASE_RPC_URL",
    // Alchemy PAYG answers a whole-life, wallet-filtered sweep in 2.5M-block
    // chunks (36 logs, 0 refusals, 2026-09-19). BASE_LOGS_RPC_URL was Tenderly's
    // public gateway, which since at least 2026-09-07 refuses any range over
    // 1,000 blocks — every chunk of every Base sweep failed and became a gap.
    logsRpcEnv: "BASE_BACKFILL_RPC_URL",
  },
  11155111: {
    id: 11155111,
    name: "Sepolia",
    slug: "sepolia",
    layer: "L1",
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
  return `${chainMeta(chainId).explorerBase}${PATHS[kind](String(value))}`;
}
