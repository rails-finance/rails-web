// The Uniswap-family deployments Rails reads (rails-ops ui-jobs 556, 568, 573
// and 575): Uniswap V3 and V4 on Ethereum, V3 on Base, V3 and V4 on Arbitrum
// and Optimism (578), and PancakeSwap V3 on Base and Arbitrum. One table per (protocol, chain): the
// contracts a receipt names, the chain's native coin and its wrapped token,
// and whether rails-server reads a position's history there (Base's keyless
// gateway serves no whole-life logs). The addresses match rails-server's
// `uniswap-at-block.ts` deployments.
//
// The native coin is per chain: the pages make no assumption that a pool's
// address(0) side is ETH.
//
// Pure, with type imports only: the unit tests read the modules that use it.

import type { UniswapVersion } from "./types";

export type UniProtocol = "uniswap" | "pancakeswap";
/** The chains the at-block routes answer for. */
export type UniChainId = 1 | 8453 | 42161 | 10 | 5042;

export interface UniDeployment {
  protocol: UniProtocol;
  /** "Uniswap", "PancakeSwap". */
  protocolName: string;
  chainId: UniChainId;
  chainName: string;
  /** The chain's route segment (lib/shared/chains.ts `slug`). */
  chainSlug: string;
  versions: readonly UniswapVersion[];
  /** The chain's gas coin as a pool currency (address(0)). */
  native: { symbol: string; decimals: number };
  wrapped: { symbol: string; address: string; decimals: number };
  v3Npm: string;
  v4PositionManager: string | null;
  v4StateView: string | null;
  /** PancakeSwap's farm, which holds a staked position's NFT. */
  masterChef: string | null;
  /** Whether rails-server reads a position's deposits, withdrawals and collections, and the day it
   *  opened, from whole-life logs on this chain. */
  history: boolean;
}

const ETH = { symbol: "ETH", decimals: 18 };

export const UNI_DEPLOYMENTS: readonly UniDeployment[] = [
  {
    protocol: "uniswap",
    protocolName: "Uniswap",
    chainId: 1,
    chainName: "Ethereum",
    chainSlug: "ethereum",
    versions: ["v3", "v4"],
    native: ETH,
    wrapped: { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    v3Npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    v4PositionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    v4StateView: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
    masterChef: null,
    history: true,
  },
  {
    protocol: "uniswap",
    protocolName: "Uniswap",
    chainId: 8453,
    chainName: "Base",
    chainSlug: "base",
    versions: ["v3"],
    native: ETH,
    wrapped: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    v3Npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    v4PositionManager: null,
    v4StateView: null,
    masterChef: null,
    history: false,
  },
  {
    protocol: "uniswap",
    protocolName: "Uniswap",
    chainId: 42161,
    chainName: "Arbitrum",
    chainSlug: "arbitrum",
    versions: ["v3", "v4"],
    native: ETH,
    wrapped: { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    v3Npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    v4PositionManager: "0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869",
    v4StateView: "0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990",
    masterChef: null,
    history: true,
  },
  // Arc (ui-jobs 577): USDC is the gas coin, 18 decimals as a pool's address(0) side. Arc has no
  // wrapped USDC; the ERC-20 at 0x3600…0000 is an interface over the same balance at 6 decimals, and
  // stands as the wrapped token, named apart on a pair card.
  {
    protocol: "uniswap",
    protocolName: "Uniswap",
    chainId: 5042,
    chainName: "Arc",
    chainSlug: "arc",
    versions: ["v3", "v4"],
    native: { symbol: "USDC", decimals: 18 },
    wrapped: { symbol: "ERC-20 USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 },
    v3Npm: "0x39654A85A4C05127f5Fd6ED22CAeC077A0fB1377",
    v4PositionManager: "0x6049c9a0e26405C0985f9E3685C87d0aE917f82B",
    v4StateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
    masterChef: null,
    history: true,
  },
  {
    protocol: "uniswap",
    protocolName: "Uniswap",
    chainId: 10,
    chainName: "Optimism",
    chainSlug: "optimism",
    versions: ["v3", "v4"],
    native: ETH,
    wrapped: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    v3Npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    v4PositionManager: "0x3C3Ea4B57a46241e54610e5f022E5c45859A1017",
    v4StateView: "0xc18a3169788F4F75A170290584ECA6395C75Ecdb",
    masterChef: null,
    history: true,
  },
  {
    protocol: "pancakeswap",
    protocolName: "PancakeSwap",
    chainId: 8453,
    chainName: "Base",
    chainSlug: "base",
    versions: ["v3"],
    native: ETH,
    wrapped: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    v3Npm: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    v4PositionManager: null,
    v4StateView: null,
    masterChef: "0xC6A2Db661D5a5690172d8eB0a7DEA2d3008665A3",
    history: false,
  },
  {
    protocol: "pancakeswap",
    protocolName: "PancakeSwap",
    chainId: 42161,
    chainName: "Arbitrum",
    chainSlug: "arbitrum",
    versions: ["v3"],
    native: ETH,
    wrapped: { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    v3Npm: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    v4PositionManager: null,
    v4StateView: null,
    masterChef: "0x5e09ACf80C0296740eC5d6F643005a4ef8DaA694",
    history: true,
  },
];

/** "Uniswap", "PancakeSwap". */
export const protocolName = (protocol: UniProtocol): string => (protocol === "pancakeswap" ? "PancakeSwap" : "Uniswap");

/** The deployment of a protocol on a chain; Ethereum's Uniswap where none matches. */
export function uniDeployment(protocol: UniProtocol = "uniswap", chainId: number = 1): UniDeployment {
  return UNI_DEPLOYMENTS.find((d) => d.protocol === protocol && d.chainId === chainId) ?? UNI_DEPLOYMENTS[0];
}

/** One explorer: a deployment and a version, under one roster entry. */
export interface UniExplorer {
  /** The roster id (lib/shared/protocols.ts), also the session key: "uniswap-v3", "uniswap-v3-base". */
  id: string;
  /** The route segment under the chain: "uniswap-v3", "pancakeswap-v3". */
  slug: string;
  version: UniswapVersion;
  deployment: UniDeployment;
  /** "/base/uniswap-v3". */
  route: string;
}

/** The roster id of a deployment's version: Ethereum's Uniswap keeps its bare ids. */
export function uniExplorerId(protocol: UniProtocol, chainId: number, version: UniswapVersion): string {
  const slug = `${protocol}-${version}`;
  return chainId === 1 ? slug : `${slug}-${uniDeployment(protocol, chainId).chainSlug}`;
}

export function uniExplorer(protocol: UniProtocol, chainId: number, version: UniswapVersion): UniExplorer {
  const deployment = uniDeployment(protocol, chainId);
  const slug = `${protocol}-${version}`;
  return {
    id: uniExplorerId(protocol, chainId, version),
    slug,
    version,
    deployment,
    route: `/${deployment.chainSlug}/${slug}`,
  };
}

/** The symbols a pool's ETH side may carry on a deployment: its native coin and wrapped token. */
export const nativeSymbols = (d: UniDeployment): readonly string[] => [d.native.symbol, d.wrapped.symbol];
