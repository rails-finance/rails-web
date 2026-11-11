// The Slipstream explorers Rails draws from lib/aerodrome (rails-ops ui-jobs 566, 578):
// Aerodrome on Base and Velodrome on Optimism, one reader on rails-server
// (aerodrome-at-block.ts, SLIPSTREAM_DEPLOYMENTS) and one set of pages. A site names what
// differs: the protocol and its route, the chain, the reward token and the pools that price
// it, the position managers. Everything else is Slipstream's and is shared.
//
// Pure, with no imports but types: the unit tests read the modules that use it.

import type { SlipstreamDeployment } from "./types";

export interface SlipstreamSite {
  /** The roster id and session, and rails-server's mount: /api/at-block/<id>. */
  id: "aerodrome" | "velodrome";
  label: "Aerodrome" | "Velodrome";
  chainId: 8453 | 10;
  chainName: "Base" | "Optimism";
  /** The explorer's route. */
  route: string;
  /** The gauges' reward token. */
  reward: { symbol: "AERO" | "VELO"; address: string };
  /** The tokens the reward's two price pools quote against. */
  usdc: string;
  weth: string;
  /** The position managers in the order a reader meets them. */
  deployments: readonly SlipstreamDeployment[];
  nfpm: Partial<Record<SlipstreamDeployment, string>>;
  factory: Partial<Record<SlipstreamDeployment, string>>;
  voter: string;
  /** The pools that price the reward (rails-server's rewardPrice). */
  rewardPools: { usdc: string; weth: string };
  /** Whether rails-server names the wallet that staked a position and asks the gauge's earned():
   *  on Base it finds the deposit's block by time; elsewhere that lookup does not exist yet, and
   *  `staked.depositor` and `staked.earned` answer null. */
  namesDepositor: boolean;
  /** The Base day grid's note in a receipt; null where the grid needs none. */
  gridNote: string | null;
  docs: { label: string; href: string };
}

/** Aerodrome Slipstream on Base (checked on chain 10 Nov 2026). */
export const AERODROME: SlipstreamSite = {
  id: "aerodrome",
  label: "Aerodrome",
  chainId: 8453,
  chainName: "Base",
  route: "/base/aerodrome",
  reward: { symbol: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  weth: "0x4200000000000000000000000000000000000006",
  deployments: ["initial", "caps", "gv3"],
  nfpm: {
    initial: "0x827922686190790b37229fd06084350E74485b72",
    caps: "0xa990C6a764b73BF43cee5Bb40339c3322FB9D55F",
    gv3: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
  },
  factory: {
    initial: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
    caps: "0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a",
    gv3: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef",
  },
  voter: "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5",
  rewardPools: {
    usdc: "0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d",
    weth: "0x7f670f78B17dEC44d5Ef68a48740b6f8849cc2e6",
  },
  namesDepositor: true,
  gridNote: "Base has no fixed count of blocks a day",
  docs: { label: "Aerodrome documentation", href: "https://aerodrome.finance/docs" },
};

/** Velodrome Slipstream on Optimism: velodrome-finance/slipstream's README ("Deployment" and
 *  "Gauges V2") and velodrome-finance/contracts' README (Voter, VELO); checked on chain 11 Nov 2026. */
export const VELODROME: SlipstreamSite = {
  id: "velodrome",
  label: "Velodrome",
  chainId: 10,
  chainName: "Optimism",
  route: "/optimism/velodrome",
  reward: { symbol: "VELO", address: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db" },
  usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  weth: "0x4200000000000000000000000000000000000006",
  deployments: ["initial", "gv2"],
  nfpm: {
    initial: "0x416b433906b1B72FA758e166e239c43d68dC6F29",
    gv2: "0xf7f8ccce99Ca2896eC75D3A399D152dB96808399",
  },
  factory: {
    initial: "0xCc0bDDB707055e04e497aB22a59c2aF4391cd12F",
    gv2: "0xe13Dd1fbA721Aa81a1826D9523AC9BC7d260c879",
  },
  voter: "0x41C914ee0c7E1A5edCD0295623e6dC557B5aBf3C",
  rewardPools: {
    usdc: "0xa0A215dE234276CAc1b844fD58901351a50fec8A",
    weth: "0x58e6433A6903886E440Ddf519eCC573c4046a6b2",
  },
  namesDepositor: false,
  gridNote: null,
  docs: { label: "Velodrome documentation", href: "https://velodrome.finance/docs" },
};

/** The site a read belongs to, by its chain. */
export const siteOf = (chainId: number | undefined): SlipstreamSite => (chainId === 10 ? VELODROME : AERODROME);

export const isSiteDeployment = (site: SlipstreamSite, d: string): d is SlipstreamDeployment =>
  (site.deployments as readonly string[]).includes(d);
