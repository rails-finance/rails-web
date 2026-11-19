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
// five minutes per access manager and states the block it reached; a refused
// scan is never cached and leaves the roles unread, with the reason.
//
// NOT CACHED otherwise: a factsheet is one address at the head, read per
// request, as the Yearn factsheet is.

import { unstable_cache } from "next/cache";
import { createPublicClient, http, parseAbi, parseAbiItem, type Chain, type PublicClient } from "viem";
import { arbitrum, base, mainnet } from "viem/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { RawAmount } from "./morpho-base-vault";
import { iporFusionRoster, iporFusionRosterEntry, type IporFusionChainId } from "@/lib/ipor-fusion/vault-roster";
import { IPOR_FUSE_WHITELIST } from "@/lib/ipor-fusion/addresses";

const VAULT_ABI = parseAbi([
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
] as const;

/** Each chain's lane for `eth_getLogs`, named: a receipt states the variable,
 *  never the URL, which carries a key. Ethereum's is the keyless wide lane. */
export const IPOR_ROLE_LOG_LANE: Record<IporFusionChainId, { env: string; chain: Chain }> = {
  1: { env: "ETHEREUM_LOGS_RPC_URL", chain: mainnet as Chain },
  42161: { env: "ARBITRUM_LOGS_RPC_URL", chain: arbitrum as Chain },
  8453: { env: "BASE_BACKFILL_RPC_URL", chain: base as Chain },
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
    asset: { address: string; symbol: string; decimals: number; named: boolean };
    shareDecimals: number;
    totalAssets: RawAmount | null;
    totalSupply: RawAmount | null;
    sharePrice: RawAmount | null;
    /** The supply cap, in shares; null where unread. */
    supplyCap: RawAmount | null;
    performanceFee: IporFusionFee | null;
    managementFee: IporFusionFee | null;
    accessManager: string | null;
    priceOracleMiddleware: string | null;
  };
  /** The whitelist the fuses were read against. */
  whitelist: string;
  /** Null where `getFuses()` did not answer. */
  fuses: IporFusionFuseRow[] | null;
  roles: IporFusionRoles;
}

const laneClients = new Map<number, PublicClient>();
function logsClient(chainId: IporFusionChainId): PublicClient | null {
  const lane = IPOR_ROLE_LOG_LANE[chainId];
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

/** Every `RoleGranted` on `accessManager` from `fromBlock` to the lane's head.
 *  Throws on a refusal, so the cache never keeps one. */
async function scanRoleGrants(chainId: IporFusionChainId, accessManager: string, fromBlock: number): Promise<RoleScan> {
  const client = logsClient(chainId);
  if (!client) throw new Error(`${IPOR_ROLE_LOG_LANE[chainId].env} is not set`);
  const toBlock = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: accessManager as `0x${string}`,
    event: ROLE_GRANTED,
    fromBlock: BigInt(fromBlock),
    toBlock,
  });
  const seen = new Set<string>();
  const pairs: IporFusionRoleHolder[] = [];
  for (const l of logs) {
    const roleId = l.args.roleId?.toString();
    const account = l.args.account?.toLowerCase();
    if (roleId == null || !account) continue;
    const key = `${roleId}:${account}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ roleId, account });
  }
  return { toBlock: Number(toBlock), grants: logs.length, pairs };
}

const cachedRoleScan = unstable_cache(scanRoleGrants, ["ipor-fusion-role-scan"], {
  revalidate: IPOR_ROLE_SCAN_REVALIDATE_SECONDS,
});

/** The scan, where it answered; the reason, where it did not. */
async function roleScan(
  chainId: IporFusionChainId,
  accessManager: string,
  fromBlock: number,
): Promise<RoleScan | { reason: string }> {
  try {
    return await cachedRoleScan(chainId, accessManager.toLowerCase(), fromBlock);
  } catch (error) {
    const reason = (error as { shortMessage?: string }).shortMessage ?? (error as Error).message ?? String(error);
    console.error(`IPOR Fusion role scan on ${accessManager} (chain ${chainId}) failed:`, reason);
    return { reason: reason.split("\n")[0].slice(0, 200) };
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
  const lane = IPOR_ROLE_LOG_LANE[chainId].env;

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
    shareDecimals: entry.shareDecimals,
    totalAssets: null,
    totalSupply: null,
    sharePrice: null,
    supplyCap: null,
    performanceFee: null,
    managementFee: null,
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

    const scan = accessManager ? await roleScan(chainId, accessManager, entry.createdBlock) : null;
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
    if (!accessManager) roles = { read: false, reason: "the vault's getAccessManagerAddress() did not answer", lane };
    else if (scan && "reason" in scan) roles = { read: false, reason: scan.reason, lane };
    else {
      const s = scan as RoleScan;
      const answered = pairs.map((_, i) => ok(second[2 + fuseCount + i]) as readonly [boolean, number] | undefined);
      if (answered.some((a) => a == null))
        roles = { read: false, reason: "a hasRole() call on the access manager did not answer", lane };
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
        name: (at("name") as string | undefined) ?? null,
        symbol: (at("symbol") as string | undefined) ?? null,
        totalAssets: ta == null ? null : amount(ta, ad),
        totalSupply: ts == null ? null : amount(ts, entry.shareDecimals),
        sharePrice: sp == null ? null : amount(sp, ad),
        supplyCap: cap == null ? null : amount(cap, entry.shareDecimals),
        performanceFee: fee(at("getPerformanceFeeData")),
        managementFee: fee(at("getManagementFeeData")),
        accessManager,
        priceOracleMiddleware: oracle,
      },
      whitelist,
      fuses,
      roles,
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
      roles: { read: false, reason: "the vault could not be read", lane },
    };
  }
}
