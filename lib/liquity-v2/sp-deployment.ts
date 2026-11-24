// The Stability Pool deposit pages' deployments: Liquity V2 and its three forks
// (Asymmetry and Ebisu on Ethereum, Basedollar on Base), each one record the
// shared pages, cards and receipts read (rails-ops
// TO-DO-stability-pool-deposits.md §3). A fork's deposit routes answer in
// Liquity V2's shape (rails-server routes/liquityForkStabilityPool.ts), so a
// page differs only by what this record names. Client-safe: catalogs only.
//
// The pool addresses are rails-server's config/liquity-fork-branches.ts
// (LIQUITY_FORK_STABILITY_POOLS), the stanzas Sieve captures.

import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { ASYMMETRY_BRANCHES, DEBT_ADDRESS as USDAF, DEBT_SYMBOL as USDAF_SYMBOL } from "@/lib/asymmetry/asset-catalog";
import { BASEDOLLAR_BRANCHES, DEBT_ADDRESS as BD, DEBT_SYMBOL as BD_SYMBOL } from "@/lib/basedollar/asset-catalog";
import { EBISU_BRANCHES, DEBT_ADDRESS as EBUSD, DEBT_SYMBOL as EBUSD_SYMBOL } from "@/lib/ebisu/asset-catalog";
import { LIQUITY_V2_SP_POOLS } from "./sp-catalog";
import { LIQUITY_V2_BASE_PATH, LIQUITY_V2_SP_PATH } from "./sp-routes";
import { walletProtocolHref } from "@/lib/wallet/wallet-filters";

export type SpDeploymentId = "liquity-v2" | "asymmetry" | "basedollar" | "ebisu";

/** One branch's Stability Pool. `symbol` is the route segment and the
 *  routes' `collateral_type`. */
export interface SpPool {
  key: string;
  symbol: string;
  /** The collateral's decimals; the pages read every amount in 1e18
   *  (lib/liquity-v2/sp-decimals.ts). */
  decimals: number;
  collateralAddr: string;
  pool: string;
  priceFeed: string;
  troveManager: string;
}

export interface SpDeployment {
  id: SpDeploymentId;
  /** "Liquity V2", "Ebisu". */
  name: string;
  /** The RailHeader / DetailTopRow session, the explorer's id. */
  session: string;
  chainId: ChainId;
  basePath: string;
  spPath: string;
  /** The index routes' prefix, "/api/ebisu". */
  api: string;
  /** The chain read's route. */
  chainApi: string;
  /** The stablecoin the pools take and the yield is paid in. */
  stable: { symbol: string; address: string };
  pools: SpPool[];
  /** The deployment serves /stability-pool/liquidations. */
  liquidations: boolean;
  /** The docs page on the Stability Pool, for the flows' "?". */
  docs: { label: string; url: string };
}

type CatalogBranch = {
  key: string;
  symbol: string;
  decimals: number;
  collateralAddr: string;
  priceFeed: string;
  troveManager: string;
};

const pools = (branches: Record<string, CatalogBranch>, addresses: Record<string, string>): SpPool[] =>
  Object.entries(addresses).map(([key, pool]) => {
    const b = branches[key];
    return {
      key,
      symbol: b.symbol,
      decimals: b.decimals,
      collateralAddr: b.collateralAddr,
      pool,
      priceFeed: b.priceFeed,
      troveManager: b.troveManager,
    };
  });

export const LIQUITY_V2_SP: SpDeployment = {
  id: "liquity-v2",
  name: "Liquity V2",
  session: "liquity-v2",
  chainId: MAINNET_CHAIN_ID,
  basePath: LIQUITY_V2_BASE_PATH,
  spPath: LIQUITY_V2_SP_PATH,
  api: "/api/liquity-v2",
  chainApi: "/api/chain/liquity-v2/stability-pool",
  stable: { symbol: "BOLD", address: TOKEN_ADDRESSES.BOLD },
  pools: pools(
    LIQUITY_V2_BRANCHES,
    Object.fromEntries(Object.entries(LIQUITY_V2_SP_POOLS).map(([s, a]) => [s.toLowerCase(), a])),
  ),
  liquidations: true,
  docs: { label: "Liquity docs", url: "https://docs.liquity.org" },
};

const fork = (
  id: Exclude<SpDeploymentId, "liquity-v2">,
  name: string,
  chainId: ChainId,
  chainSlug: "ethereum" | "base",
  stable: { symbol: string; address: string },
  branches: Record<string, CatalogBranch>,
  addresses: Record<string, string>,
  docs: { label: string; url: string },
): SpDeployment => ({
  id,
  name,
  session: id,
  chainId,
  basePath: `/${chainSlug}/${id}`,
  spPath: `/${chainSlug}/${id}/stability-pool`,
  api: `/api/${id}`,
  chainApi: `/api/chain/${id}/stability-pool`,
  stable,
  pools: pools(branches, addresses),
  liquidations: true,
  docs,
});

export const ASYMMETRY_SP = fork(
  "asymmetry",
  "Asymmetry",
  MAINNET_CHAIN_ID,
  "ethereum",
  { symbol: USDAF_SYMBOL, address: USDAF },
  ASYMMETRY_BRANCHES,
  {
    ysybold: "0x83e5bde77d7477ecd972e338541b90af57675536",
    scrvusd: "0xd48dc7cddc481f596bd9a97755c7ac696ad4ea87",
    susds: "0xb571781cedf07257d60d6b252a3d8b24150ded97",
    sfrxusd: "0x446f358e3a927cc68f342141d78aa2d1c54e18f0",
    tbtc: "0x545a7ddfd863bd7ea0bfc689125169598085f75e",
    wbtc18: "0x922faa141e95e43a9deeab8dade3ac8d4a32ad5c",
    cbbtc18: "0x7f5d15f4053f1e34025907f0741f2abc4353c65c",
  },
  { label: "Asymmetry docs", url: "https://docs.asymmetry.finance/usdaf-stablecoin/earn" },
);

export const BASEDOLLAR_SP = fork(
  "basedollar",
  "Basedollar",
  BASE_CHAIN_ID,
  "base",
  { symbol: BD_SYMBOL, address: BD },
  BASEDOLLAR_BRANCHES,
  {
    weth: "0x7d837bf114785642d225d1101145ddb8af4ba438",
    wsteth: "0xc65a05737d31e0f42c0806c739f3c88dd009c05f",
    reth: "0x4eb3b6970fd358d34195b5d40e4eb64e0e3c0b6a",
    wcbbtc: "0x6bd55dd953507641c84a03956760f83d29d65726",
    cbeth: "0x25afbb09d9804482ed8e24295be4a12704fe93ea",
  },
  // Basedollar's own pages point at Liquity's (app/(app)/base/basedollar/info).
  { label: "Liquity docs", url: "https://docs.liquity.org" },
);

export const EBISU_SP = fork(
  "ebisu",
  "Ebisu",
  MAINNET_CHAIN_ID,
  "ethereum",
  { symbol: EBUSD_SYMBOL, address: EBUSD },
  EBISU_BRANCHES,
  {
    weeth: "0x4f14903b69ff454555a2d0eb1f321e782b235cf4",
    susde: "0xd31d0df7652ec403ffd751d2706431be080c79d5",
    wbtc: "0x441a2d31610ab6edffd7d42c44f3c2cbf61e7c8b",
    lbtc: "0x5f841e826038744ecf96f74b44520fa8828d596e",
    stcusd: "0x23b4a65ce1d85ea0a36326f6f56989779f7fb26c",
  },
  { label: "Earning ebUSD yield", url: "https://ebisu.gitbook.io/ebisu-money/earning-ebusd-yield" },
);

export const SP_DEPLOYMENTS: Record<SpDeploymentId, SpDeployment> = {
  "liquity-v2": LIQUITY_V2_SP,
  asymmetry: ASYMMETRY_SP,
  basedollar: BASEDOLLAR_SP,
  ebisu: EBISU_SP,
};

/** The branch a route segment or a row's collateral_type names, by symbol or
 *  key in any case (the fork routes take either); null where it names none. */
export function spPool(dep: SpDeployment, raw: string | null | undefined): SpPool | null {
  const lower = (raw ?? "").trim().toLowerCase();
  return dep.pools.find((p) => p.symbol.toLowerCase() === lower || p.key === lower) ?? null;
}

/** spPool where the row comes from the deployment's own route: its branch is
 *  one of the deployment's, so a miss is a wiring fault. */
export function spPoolOf(dep: SpDeployment, collateralType: string): SpPool {
  const p = spPool(dep, collateralType);
  if (!p) throw new Error(`${dep.name} has no Stability Pool for ${collateralType}`);
  return p;
}

/** One deposit's page: `<spPath>/<branch symbol>/<depositor>`. */
export function spDepositHref(dep: SpDeployment, collateralType: string, depositor: string): string {
  return `${dep.spPath}/${spPool(dep, collateralType)?.symbol ?? collateralType}/${depositor.toLowerCase()}`;
}

/** The depositor on the wallet page, the deployment chosen (ui-jobs 738). */
export const spWalletHref = (dep: SpDeployment, depositor: string): string => walletProtocolHref(depositor, dep.id);
