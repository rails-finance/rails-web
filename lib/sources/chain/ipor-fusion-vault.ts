// ONE IPOR Fusion vault, read at ONE pinned block: the factsheet behind
// /<chain>/ipor-fusion/vaults/<vault>. SERVER-ONLY.
// ----------------------------------------------------------------------------
// Two Multicall3 waves at the block. The first reads the vault: totals, one
// whole share, both fee configurations, the supply cap, its access manager,
// price oracle middleware and fuses. The second reads what the first named:
// each fuse's entry in the IPOR DAO's Fuse Whitelist, and each role holder's
// `hasRole` on the access manager.
//
// ROLES NEED A LOG SCAN. The access manager is OpenZeppelin's AccessManager,
// which keeps no list of a role's members. The candidates are its
// `RoleGranted` logs from the vault's creation block, on the chain's logs lane;
// a candidate is a holder only where `hasRole(role, account)` answers true at
// the pinned block, so a revoked grant drops out there. The scan is cached
// five minutes per access manager; where it ends short of the pinned block an
// uncached scan covers the rest, so the range always reaches that block. A
// refused range is split in halves once. A failed scan is never cached and
// leaves the roles unread, in fixed words (ROLES_UNREAD).
//
// NOT CACHED otherwise: a factsheet is one address at the head, read per
// request, as the Yearn factsheet is.

import { unstable_cache } from "next/cache";
import { createPublicClient, http, parseAbi, parseAbiItem, type Chain, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { RawAmount } from "./morpho-base-vault";
import { iporFusionRoster, iporFusionRosterEntry, type IporFusionChainId } from "@/lib/ipor-fusion/vault-roster";
import { IPOR_FUSE_WHITELIST } from "@/lib/ipor-fusion/addresses";
import {
  decodeSubstrate,
  marketInfo,
  substrateAddresses,
  type MarketInfo,
  type Substrate,
} from "@/lib/ipor-fusion/markets";
import { MORPHO_MARKETS } from "@/lib/morpho/market-catalog";
import { MORPHO_MARKETS as MORPHO_BASE_MARKETS } from "@/lib/morpho-base/market-catalog";
import { MORPHO_ARBITRUM_MARKETS } from "@/lib/morpho-arbitrum/market-catalog";
import { resolveErc20Meta } from "./erc20-meta";

const VAULT_ABI = parseAbi([
  "function asset() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "struct PerformanceFeeData { address feeAccount; uint16 feeInPercentage; }",
  "struct ManagementFeeData { address feeAccount; uint16 feeInPercentage; uint32 lastUpdateTimestamp; }",
  "function getPerformanceFeeData() view returns (PerformanceFeeData)",
  "function getManagementFeeData() view returns (ManagementFeeData)",
  "function getTotalSupplyCap() view returns (uint256)",
  "function getAccessManagerAddress() view returns (address)",
  "function getPriceOracleMiddleware() view returns (address)",
  "function getFuses() view returns (address[])",
  "function getActiveMarketsInBalanceFuses() view returns (uint256[])",
  "function getRewardsClaimManagerAddress() view returns (address)",
  "function getUnrealizedManagementFee() view returns (uint256)",
  "function totalAssetsInMarket(uint256) view returns (uint256)",
  "function getMarketSubstrates(uint256) view returns (bytes32[])",
]);
const SIDE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function balanceOf() view returns (uint256)",
  "function asset() view returns (address)",
  "function collToken() view returns (address)",
]);
const WHITELIST_ABI = parseAbi([
  "function getFuseByAddress(address) view returns (uint16 fuseState, uint16 fuseType, address fuseAddress, uint32 timestamp)",
  "function getFuseStates() view returns (uint16[], string[])",
  "function getFuseTypes() view returns (uint16[], string[])",
]);
const ACCESS_ABI = parseAbi(["function hasRole(uint64, address) view returns (bool, uint32)"]);
const ROLE_GRANTED = parseAbiItem(
  "event RoleGranted(uint64 indexed roleId, address indexed account, uint32 delay, uint48 since, bool newMember)",
);

/** The vault's calls in wave one, in order. */
const CALLS = [
  "asset",
  "name",
  "symbol",
  "totalAssets",
  "totalSupply",
  "convertToAssets",
  "getPerformanceFeeData",
  "getManagementFeeData",
  "getTotalSupplyCap",
  "getAccessManagerAddress",
  "getPriceOracleMiddleware",
  "getFuses",
  "getActiveMarketsInBalanceFuses",
  "getRewardsClaimManagerAddress",
  "getUnrealizedManagementFee",
] as const;

/** Each chain's lane for `eth_getLogs`, named: a receipt states the variable,
 *  never the URL, which carries a key. Ethereum's is the keyless wide lane. */
export const IPOR_ROLE_LOG_LANE: Partial<Record<IporFusionChainId, { env: string; chain: Chain }>> = {
  1: { env: "ETHEREUM_LOGS_RPC_URL", chain: mainnet as Chain },
  // Arbitrum and Base have no lane wide enough for a vault's history (no
  // history key on the server; Base's backfill lane caps a range at 1,000
  // blocks), and the scan never goes over Alchemy or a public RPC: their roles
  // read "not configured" until one is named (TO-DO-ipor-scoping §6.3).
};

export const IPOR_ROLE_SCAN_REVALIDATE_SECONDS = 300;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);
const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface IporFusionFee {
  /** Basis points: 500 is 5%. */
  bps: number;
  /** The address the vault mints the fee to; null where it is the zero address. */
  account: string | null;
}

export interface IporFusionFuseRow {
  address: string;
  /** The whitelist's state for it ("active", "deprecated", "removed", "default"),
   *  as `getFuseStates()` names it; null where the call did not answer. */
  state: string | null;
  stateId: number | null;
  /** The fuse type's name in the whitelist (chain text); null where unread or unlisted. */
  type: string | null;
  /** When the whitelist added it, unix seconds; null where unread or zero. */
  listedAt: number | null;
}

export interface IporFusionRoleHolder {
  roleId: string;
  account: string;
}

export type IporFusionRoles =
  | {
      read: true;
      /** The holders `hasRole` confirms at the pinned block, in grant order. */
      holders: IporFusionRoleHolder[];
      /** The logs scanned: from the vault's creation block to `toBlock`. */
      fromBlock: number;
      toBlock: number;
      grants: number;
      lane: string;
    }
  | { read: false; reason: string; lane: string };

export interface IporFusionVaultResponse {
  chainId: IporFusionChainId;
  blockNumber: number;
  head?: PositionHeadStamp;
  chainStale: boolean;
  vault: {
    address: string;
    name: string | null;
    symbol: string | null;
    censusName: string | null;
    censusSymbol: string | null;
    index: number;
    version: number | null;
    createdBlock: number;
    createdTx: string;
    factory: string;
    censusBlock: number;
    /** The census's `isFusionVault` badge, read at its block. */
    registered: boolean;
    /** `asset()` at the pinned block; symbol and decimals from the census.
     *  Null where the call did not answer. */
    asset: { address: string; symbol: string; decimals: number; named: boolean };
    /** True where `asset()` answered and differs from the census's asset: the
     *  symbol and decimals beside it are the census's, so the page says so. */
    assetDiffersFromCensus: boolean;
    /** False where `asset()` did not answer and the address is the census's. */
    assetRead: boolean;
    shareDecimals: number;
    totalAssets: RawAmount | null;
    totalSupply: RawAmount | null;
    sharePrice: RawAmount | null;
    /** The supply cap, in shares; null where unread. */
    supplyCap: RawAmount | null;
    performanceFee: IporFusionFee | null;
    managementFee: IporFusionFee | null;
    /** `getUnrealizedManagementFee()`: the management fee accrued and not yet
     *  minted, in the asset. Older PlasmaVaults deduct it inside
     *  totalAssets(); null where unread. */
    unrealizedManagementFee: RawAmount | null;
    accessManager: string | null;
    priceOracleMiddleware: string | null;
  };
  /** The whitelist the fuses were read against. */
  whitelist: string;
  /** Null where `getFuses()` did not answer. */
  fuses: IporFusionFuseRow[] | null;
  roles: IporFusionRoles;
  /** Where the assets are; null where `getActiveMarketsInBalanceFuses()` did not answer. */
  markets: IporFusionMarkets | null;
}

export interface IporFusionMarketRow extends MarketInfo {
  id: string;
  /** `totalAssetsInMarket(id)`, the balance fuse's booked figure in the
   *  vault's asset; null where the call did not answer. */
  balance: RawAmount | null;
  /** `getMarketSubstrates(id)`, decoded; null where the call did not answer. */
  substrates: Substrate[] | null;
}

export interface IporFusionMarkets {
  rows: IporFusionMarketRow[];
  /** The asset's `balanceOf(vault)`; null where unread. */
  inVault: RawAmount | null;
  /** The rewards claim manager and its `balanceOf()`, where the vault names one. */
  rewards: { manager: string; balance: RawAmount | null } | null;
  /** Names for every address the grants name, a child vault's asset and a
   *  Morpho market's tokens, lowercased. */
  names: Record<string, { symbol: string; named: boolean }>;
  /** A child vault's `asset()`, by child. */
  childAssets: Record<string, string>;
  /** A Liquity V2 registry's `collToken()`, by registry. */
  registries: Record<string, string>;
  /** A Morpho market id's params from Rails' catalog; null where the catalog lacks it. */
  morpho: Record<string, { loanToken: string; collateralToken: string; lltv: string } | null>;
}

type MorphoParams = { id: string; loanToken: string; collateralToken: string; lltv: string };
const MORPHO_CATALOG: Record<IporFusionChainId, readonly MorphoParams[]> = {
  1: MORPHO_MARKETS,
  42161: MORPHO_ARBITRUM_MARKETS,
  8453: MORPHO_BASE_MARKETS,
};
const morphoById = new Map<IporFusionChainId, Map<string, MorphoParams>>();
/** A Morpho Blue market's params from Rails' catalog for the chain; null where it lacks the id. */
const morphoMarket = (chainId: IporFusionChainId, id: string) => {
  let byId = morphoById.get(chainId);
  if (!byId) morphoById.set(chainId, (byId = new Map(MORPHO_CATALOG[chainId].map((m) => [m.id.toLowerCase(), m]))));
  return byId.get(id.toLowerCase()) ?? null;
};

/** Each active market's booked balance and substrates, the asset in the
 *  vault, the rewards manager's balance, and the names the rows need: two
 *  Multicall3 waves at the block, then the token-name resolver. */
async function readMarkets(
  client: PublicClient,
  blockNumber: bigint,
  chainId: IporFusionChainId,
  vault: string,
  asset: string,
  assetDecimals: number,
  ids: readonly bigint[],
  rewardsManager: string | null,
): Promise<IporFusionMarkets> {
  const v = vault as `0x${string}`;
  const a = (raw: unknown) => (typeof raw === "bigint" ? amount(raw, assetDecimals) : null);
  const one = (await client.multicall({
    contracts: [
      { address: asset as `0x${string}`, abi: SIDE_ABI, functionName: "balanceOf", args: [v] },
      ...(rewardsManager
        ? [{ address: rewardsManager as `0x${string}`, abi: SIDE_ABI, functionName: "balanceOf" }]
        : []),
      ...ids.flatMap((id) => [
        { address: v, abi: VAULT_ABI, functionName: "totalAssetsInMarket", args: [id] },
        { address: v, abi: VAULT_ABI, functionName: "getMarketSubstrates", args: [id] },
      ]),
    ] as never,
    allowFailure: true,
    blockNumber,
  })) as Call[];
  const off = rewardsManager ? 2 : 1;
  const rows: IporFusionMarketRow[] = ids.map((idRaw, i) => {
    const id = idRaw.toString();
    const info = marketInfo(id);
    const subs = ok(one[off + 2 * i + 1]) as readonly string[] | undefined;
    return {
      ...info,
      id,
      balance: a(ok(one[off + 2 * i])),
      substrates: subs ? subs.map((h) => decodeSubstrate(info.kind, h)) : null,
    };
  });

  const children = new Set<string>();
  const registries = new Set<string>();
  const named = new Set<string>();
  const morpho: IporFusionMarkets["morpho"] = {};
  for (const r of rows) {
    for (const ad of substrateAddresses(r.substrates ?? [])) named.add(ad);
    for (const s of r.substrates ?? []) {
      if (r.kind === "child" && s.kind === "address") children.add(s.address);
      if (r.kind === "liquity" && (s.kind === "address" || s.kind === "typed")) registries.add(s.address);
      if (s.kind === "morpho-market") {
        const m = morphoMarket(chainId, s.id);
        morpho[s.id] = m ? { loanToken: m.loanToken, collateralToken: m.collateralToken, lltv: m.lltv } : null;
        if (m) {
          named.add(m.loanToken);
          if (m.collateralToken !== ZERO_ADDRESS) named.add(m.collateralToken);
        }
      }
    }
  }
  const childList = [...children];
  const registryList = [...registries];
  const two =
    childList.length + registryList.length > 0
      ? ((await client.multicall({
          contracts: [
            ...childList.map((c) => ({ address: c as `0x${string}`, abi: SIDE_ABI, functionName: "asset" })),
            ...registryList.map((r) => ({ address: r as `0x${string}`, abi: SIDE_ABI, functionName: "collToken" })),
          ] as never,
          allowFailure: true,
          blockNumber,
        })) as Call[])
      : [];
  const childAssets: Record<string, string> = {};
  childList.forEach((c, i) => {
    const r = ok(two[i]) as string | undefined;
    if (r) {
      childAssets[c] = r.toLowerCase();
      named.add(r.toLowerCase());
    }
  });
  const registryColl: Record<string, string> = {};
  registryList.forEach((r, i) => {
    const t = ok(two[childList.length + i]) as string | undefined;
    if (t) {
      registryColl[r] = t.toLowerCase();
      named.add(t.toLowerCase());
    }
  });
  const metas = await resolveErc20Meta([...named], chainId).catch(() => new Map());
  const names: IporFusionMarkets["names"] = {};
  for (const [addr, m] of metas) names[addr] = { symbol: m.symbol, named: m.named === true };
  return {
    rows,
    inVault: a(ok(one[0])),
    rewards: rewardsManager ? { manager: rewardsManager, balance: a(ok(one[1])) } : null,
    names,
    childAssets,
    registries: registryColl,
    morpho,
  };
}

const laneClients = new Map<number, PublicClient>();
function logsClient(chainId: IporFusionChainId): PublicClient | null {
  const lane = IPOR_ROLE_LOG_LANE[chainId];
  if (!lane) return null;
  const url = process.env[lane.env]?.replace(/^"(.*)"$/, "$1");
  if (!url) return null;
  let client = laneClients.get(chainId);
  if (!client) {
    client = createPublicClient({
      chain: lane.chain,
      transport: http(url, { batch: false, retryCount: 2, timeout: 60_000 }),
    });
    laneClients.set(chainId, client);
  }
  return client;
}

interface RoleScan {
  toBlock: number;
  grants: number;
  pairs: IporFusionRoleHolder[];
}

/** The fixed words a page states when the roles are not read. No provider
 *  message and no variable name reaches the page. */
export const ROLES_UNREAD = {
  unconfigured: "the logs lane is not configured",
  refused: "the logs lane refused the scan",
  check: "a role check did not answer",
  accessManager: "the vault did not name its access manager",
  vault: "the vault could not be read",
} as const;
type ScanFailure = "unconfigured" | "refused";

/** A scan failure carried in the message, so it survives the data cache's rethrow. */
const scanError = (code: ScanFailure) => new Error(`ipor-role-scan:${code}`);
const failureOf = (error: unknown): ScanFailure =>
  String((error as Error)?.message ?? "").includes("ipor-role-scan:unconfigured") ? "unconfigured" : "refused";

/** `RoleGranted` logs on `accessManager` over [from, to]. A refused range is
 *  split in halves once; a half refused again fails the scan. */
async function grantLogs(client: PublicClient, accessManager: string, from: bigint, to: bigint) {
  const one = (a: bigint, b: bigint) =>
    client.getLogs({ address: accessManager as `0x${string}`, event: ROLE_GRANTED, fromBlock: a, toBlock: b });
  try {
    return await one(from, to);
  } catch {
    if (to <= from) throw scanError("refused");
    const mid = from + (to - from) / BigInt(2);
    try {
      return [...(await one(from, mid)), ...(await one(mid + BigInt(1), to))];
    } catch {
      throw scanError("refused");
    }
  }
}

function pairsOf(
  logs: Awaited<ReturnType<typeof grantLogs>>,
  into: IporFusionRoleHolder[] = [],
): IporFusionRoleHolder[] {
  const seen = new Set(into.map((p) => `${p.roleId}:${p.account}`));
  for (const l of logs) {
    const roleId = l.args.roleId?.toString();
    const account = l.args.account?.toLowerCase();
    if (roleId == null || !account) continue;
    const key = `${roleId}:${account}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({ roleId, account });
  }
  return into;
}

/** Every `RoleGranted` on `accessManager` from `fromBlock` to the lane's head.
 *  Throws on a failure, so the cache never keeps one. */
async function scanRoleGrants(chainId: IporFusionChainId, accessManager: string, fromBlock: number): Promise<RoleScan> {
  const client = logsClient(chainId);
  if (!client) throw scanError("unconfigured");
  let toBlock: bigint;
  try {
    toBlock = await client.getBlockNumber();
  } catch {
    throw scanError("refused");
  }
  const logs = await grantLogs(client, accessManager, BigInt(fromBlock), toBlock);
  return { toBlock: Number(toBlock), grants: logs.length, pairs: pairsOf(logs) };
}

const cachedRoleScan = unstable_cache(scanRoleGrants, ["ipor-fusion-role-scan"], {
  revalidate: IPOR_ROLE_SCAN_REVALIDATE_SECONDS,
});

/** The scan up to `pinned`: the cached scan, topped up uncached from its end to
 *  the pinned block where it stops short. `toBlock` is the range the page
 *  states: the pinned block, or the scan's end clipped to it. */
async function roleScanAt(
  chainId: IporFusionChainId,
  accessManager: string,
  fromBlock: number,
  pinned: number,
): Promise<RoleScan | { failure: ScanFailure }> {
  const am = accessManager.toLowerCase();
  try {
    const cached = await cachedRoleScan(chainId, am, fromBlock);
    if (cached.toBlock >= pinned) return { ...cached, toBlock: pinned };
    const client = logsClient(chainId);
    if (!client) throw scanError("unconfigured");
    const more = await grantLogs(client, am, BigInt(cached.toBlock + 1), BigInt(pinned));
    return {
      toBlock: pinned,
      grants: cached.grants + more.length,
      pairs: pairsOf(more, [...cached.pairs]),
    };
  } catch (error) {
    const failure = failureOf(error);
    console.error(`IPOR Fusion role scan on ${am} (chain ${chainId}) failed: ${failure}`);
    return { failure };
  }
}

function fee(v: unknown): IporFusionFee | null {
  const f = v as { feeAccount?: string; feeInPercentage?: number } | undefined;
  if (!f || f.feeInPercentage == null) return null;
  const account = f.feeAccount && f.feeAccount.toLowerCase() !== ZERO_ADDRESS ? f.feeAccount.toLowerCase() : null;
  return { bps: Number(f.feeInPercentage), account };
}

/** One censused vault on `chainId`, read at one block. The caller has checked
 *  the address is in the census. */
export async function loadIporFusionVault(
  chainId: IporFusionChainId,
  address: string,
): Promise<IporFusionVaultResponse> {
  const entry = iporFusionRosterEntry(chainId, address);
  if (!entry) throw new Error(`${address} is not in the IPOR Fusion census on chain ${chainId}`);
  const roster = iporFusionRoster(chainId);
  const vaultAddress = entry.address.toLowerCase();
  const whitelist = IPOR_FUSE_WHITELIST[chainId];
  const ad = entry.asset.decimals;
  const lane = IPOR_ROLE_LOG_LANE[chainId]?.env ?? "no logs lane";

  const shell = (): IporFusionVaultResponse["vault"] => ({
    address: vaultAddress,
    name: null,
    symbol: null,
    censusName: entry.name,
    censusSymbol: entry.symbol,
    index: entry.index,
    version: entry.version,
    createdBlock: entry.createdBlock,
    createdTx: entry.createdTx,
    factory: roster.factory,
    censusBlock: roster.censusBlock,
    registered: entry.isFusionVault,
    asset: {
      address: entry.asset.address.toLowerCase(),
      symbol: entry.asset.symbol || entry.asset.address.slice(0, 6),
      decimals: ad,
      named: Boolean(entry.asset.symbol),
    },
    assetDiffersFromCensus: false,
    assetRead: false,
    shareDecimals: entry.shareDecimals,
    totalAssets: null,
    totalSupply: null,
    sharePrice: null,
    supplyCap: null,
    performanceFee: null,
    managementFee: null,
    unrealizedManagementFee: null,
    accessManager: null,
    priceOracleMiddleware: null,
  });

  try {
    const client = vaultHeadClient(chainId);
    const blockNumber = await client.getBlockNumber();
    const one = (fn: (typeof CALLS)[number]) =>
      fn === "convertToAssets"
        ? {
            address: vaultAddress as `0x${string}`,
            abi: VAULT_ABI,
            functionName: fn,
            args: [BigInt(10) ** BigInt(entry.shareDecimals)],
          }
        : { address: vaultAddress as `0x${string}`, abi: VAULT_ABI, functionName: fn };
    const first = (await client.multicall({
      contracts: CALLS.map(one) as never,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const at = (fn: (typeof CALLS)[number]) => ok(first[CALLS.indexOf(fn)]);

    const accessManager = ((at("getAccessManagerAddress") as string | undefined) ?? null)?.toLowerCase() ?? null;
    const fuseAddresses = ((at("getFuses") as string[] | undefined) ?? null)?.map((f) => f.toLowerCase()) ?? null;

    const marketIds = at("getActiveMarketsInBalanceFuses") as readonly bigint[] | undefined;
    const rewardsManager = (at("getRewardsClaimManagerAddress") as string | undefined)?.toLowerCase() ?? null;
    const [scan, markets] = await Promise.all([
      accessManager ? roleScanAt(chainId, accessManager, entry.createdBlock, Number(blockNumber)) : null,
      marketIds
        ? readMarkets(
            client,
            blockNumber,
            chainId,
            vaultAddress,
            ((at("asset") as string | undefined) ?? entry.asset.address).toLowerCase(),
            ad,
            marketIds,
            rewardsManager && rewardsManager !== ZERO_ADDRESS ? rewardsManager : null,
          ).catch((error) => {
            console.error(`IPOR Fusion markets read on ${vaultAddress} failed:`, error);
            return null;
          })
        : null,
    ]);
    const pairs = scan && "pairs" in scan ? scan.pairs : [];

    const second = (await client.multicall({
      contracts: [
        { address: whitelist as `0x${string}`, abi: WHITELIST_ABI, functionName: "getFuseStates" },
        { address: whitelist as `0x${string}`, abi: WHITELIST_ABI, functionName: "getFuseTypes" },
        ...(fuseAddresses ?? []).map((f) => ({
          address: whitelist as `0x${string}`,
          abi: WHITELIST_ABI,
          functionName: "getFuseByAddress" as const,
          args: [f as `0x${string}`],
        })),
        ...pairs.map((p) => ({
          address: accessManager as `0x${string}`,
          abi: ACCESS_ABI,
          functionName: "hasRole" as const,
          args: [BigInt(p.roleId), p.account as `0x${string}`],
        })),
      ] as never,
      allowFailure: true,
      blockNumber,
    })) as Call[];

    const states = ok(second[0]) as [readonly number[], readonly string[]] | undefined;
    const types = ok(second[1]) as [readonly number[], readonly string[]] | undefined;
    const stateName = new Map((states?.[0] ?? []).map((id, i) => [Number(id), states![1][i]]));
    const typeName = new Map((types?.[0] ?? []).map((id, i) => [Number(id), types![1][i]]));
    const fuseCount = fuseAddresses?.length ?? 0;
    const fuses =
      fuseAddresses?.map((address, i): IporFusionFuseRow => {
        const r = ok(second[2 + i]) as readonly [number, number, string, number] | undefined;
        if (!r) return { address, state: null, stateId: null, type: null, listedAt: null };
        const stateId = Number(r[0]);
        const listed = r[2].toLowerCase() !== ZERO_ADDRESS;
        return {
          address,
          stateId,
          state: stateName.get(stateId) ?? null,
          type: listed ? (typeName.get(Number(r[1])) ?? null) : null,
          listedAt: listed && Number(r[3]) > 0 ? Number(r[3]) : null,
        };
      }) ?? null;

    let roles: IporFusionRoles;
    if (!accessManager) roles = { read: false, reason: ROLES_UNREAD.accessManager, lane };
    else if (scan && "failure" in scan) roles = { read: false, reason: ROLES_UNREAD[scan.failure], lane };
    else {
      const s = scan as RoleScan;
      const answered = pairs.map((_, i) => ok(second[2 + fuseCount + i]) as readonly [boolean, number] | undefined);
      if (answered.some((a) => a == null)) roles = { read: false, reason: ROLES_UNREAD.check, lane };
      else
        roles = {
          read: true,
          holders: pairs.filter((_, i) => answered[i]![0]),
          fromBlock: entry.createdBlock,
          toBlock: s.toBlock,
          grants: s.grants,
          lane,
        };
    }

    const readAsset = (at("asset") as string | undefined)?.toLowerCase();
    const assetRead = (): Pick<IporFusionVaultResponse["vault"], "asset" | "assetDiffersFromCensus" | "assetRead"> => {
      const base = shell().asset;
      if (!readAsset) return { asset: base, assetDiffersFromCensus: false, assetRead: false };
      return {
        asset: { ...base, address: readAsset },
        assetDiffersFromCensus: readAsset !== base.address,
        assetRead: true,
      };
    };
    const ta = at("totalAssets") as bigint | undefined;
    const ts = at("totalSupply") as bigint | undefined;
    const sp = at("convertToAssets") as bigint | undefined;
    const cap = at("getTotalSupplyCap") as bigint | undefined;
    const oracle = (at("getPriceOracleMiddleware") as string | undefined)?.toLowerCase() ?? null;
    return {
      chainId,
      blockNumber: Number(blockNumber),
      head: serverHeadStampAt(chainId, blockNumber),
      chainStale: false,
      vault: {
        ...shell(),
        ...assetRead(),
        name: (at("name") as string | undefined) ?? null,
        symbol: (at("symbol") as string | undefined) ?? null,
        totalAssets: ta == null ? null : amount(ta, ad),
        totalSupply: ts == null ? null : amount(ts, entry.shareDecimals),
        sharePrice: sp == null ? null : amount(sp, ad),
        supplyCap: cap == null ? null : amount(cap, entry.shareDecimals),
        performanceFee: fee(at("getPerformanceFeeData")),
        managementFee: fee(at("getManagementFeeData")),
        unrealizedManagementFee: (() => {
          const f = at("getUnrealizedManagementFee") as bigint | undefined;
          return f == null ? null : amount(f, ad);
        })(),
        accessManager,
        priceOracleMiddleware: oracle,
      },
      whitelist,
      fuses,
      roles,
      markets,
    };
  } catch (error) {
    console.error(`IPOR Fusion vault ${vaultAddress} chain read failed on chain ${chainId}:`, error);
    return {
      chainId,
      blockNumber: 0,
      chainStale: true,
      vault: shell(),
      whitelist,
      fuses: null,
      roles: { read: false, reason: ROLES_UNREAD.vault, lane },
      markets: null,
    };
  }
}
