// ONE Yearn V3 vault, read at ONE pinned block — the factsheet behind
// /ethereum/yearn/vaults/<vault>. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The roster loader beside this one reads five slots on 247 vaults. This one
// reads one vault whole: what it holds and where that sits, who holds the roles
// over it, how long a gain takes to reach the share price, and whether Yearn
// endorses it — every call answered at one block, which the page prints.
//
// A VAULT IS IDLE PLUS DEBT. `totalIdle()` is the asset sitting in the vault
// ready for a withdrawal; `totalDebt()` is what its strategies have been lent
// and report back. `totalAssets()` is the two added, and the page shows all
// three so the reader can see the split rather than take the sum on trust.
//
// THE QUEUE IS THE ORDER, AND IT IS NOT THE WHOLE LIST. `get_default_queue()`
// is the order a withdrawal walks strategies in, up to ten of them. A strategy
// the role manager has removed from the queue can still carry debt, so a debt
// figure per queue member is what this loader reads and the page states — the
// vault's own `totalDebt()` stands beside the sum, and where the two differ the
// page says so instead of presenting either as the whole.
//
// ROLES ARE ADDRESSES AND ONLY ADDRESSES. `role_manager()` and `accountant()`
// are read and printed as addresses. Nothing on chain attests who holds them,
// and this page attaches no name to either.
//
// NOT CACHED. The roster is one question for every reader and goes through
// Next's data cache; a vault page is one address at the head, read per request,
// as the MetaMorpho vault page is.

import { parseAbi } from "viem";
import { chainBatchClient } from "./rpc";
import type { RawAmount } from "./morpho-base-vault";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";
import { yearnRosterEntry } from "@/lib/yearn/vault-roster";
import { YEARN_CHAIN_ID } from "./yearn-ethereum-vault-directory";

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalIdle() view returns (uint256)",
  "function totalDebt() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function get_default_queue() view returns (address[])",
  "function accountant() view returns (address)",
  "function role_manager() view returns (address)",
  "function profitMaxUnlockTime() view returns (uint256)",
  "function isShutdown() view returns (bool)",
  "function apiVersion() view returns (string)",
  // The share token's own decimals. READ rather than assumed, although a Yearn
  // V3 vault mirrors its asset's: the exponent every share price on the holder
  // lane is asked with is this number, and most of this roster is 6-decimal, so
  // a default of 18 would be a trillion-fold error stated as a price.
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);
const REGISTRY_ABI = parseAbi(["function isEndorsed(address) view returns (bool)"]);
const STRATEGY_ABI = parseAbi([
  "struct StrategyParams { uint256 activation; uint256 last_report; uint256 current_debt; uint256 max_debt; }",
  "function strategies(address) view returns (StrategyParams)",
  "function name() view returns (string)",
]);

/** The vault's own calls, in the order the first Multicall3 wave makes them. */
const CALLS = [
  "name",
  "symbol",
  "totalAssets",
  "totalSupply",
  "totalIdle",
  "totalDebt",
  "convertToAssets",
  "get_default_queue",
  "accountant",
  "role_manager",
  "profitMaxUnlockTime",
  "isShutdown",
  "apiVersion",
  "decimals",
] as const;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

export interface YearnVaultStrategyRow {
  /** The strategy contract, lowercased. */
  address: string;
  /** Its `name()`, where the call answered — a tokenized strategy is an
   *  ERC-4626 and names itself. Null when the call did not answer. */
  name: string | null;
  /** Its place in `get_default_queue()`, from 1 — the order a withdrawal walks. */
  position: number;
  /** `strategies(addr).current_debt` — what the vault has lent it, in the
   *  asset. Null when the call did not answer. */
  currentDebt: RawAmount | null;
  /** `strategies(addr).max_debt` — the ceiling the role manager set. */
  maxDebt: RawAmount | null;
  /** `strategies(addr).last_report`, a unix timestamp: when this strategy last
   *  reported a gain or a loss to the vault. Null when the call did not
   *  answer. */
  lastReport: number | null;
  /** `strategies(addr).activation`, a unix timestamp: when the vault added it. */
  activation: number | null;
}

export interface YearnVaultResponse {
  /** The block every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  vault: {
    /** Lowercased vault address — its identity and its route. */
    address: string;
    /** `name()` at the block; null when the call did not answer. */
    name: string | null;
    /** `symbol()` at the block; null when the call did not answer. */
    symbol: string | null;
    /** The catalogue's snapshot of the name, for a header that has no live one. */
    censusName: string;
    /** `apiVersion()` at the block, which the census checked against the
     *  factory that made it. */
    apiVersion: string;
    /** The factory that emitted this vault's creation log, lowercased. */
    factory: string;
    /** The block that log was in. */
    createdBlock: number;
    /** The ERC-4626 underlying, from the catalogue: immutable, and checked
     *  against the creation log by the census. */
    asset: { address: string; symbol: string; decimals: number; named: boolean };
    /** `totalAssets()` — idle plus debt, in the asset. */
    totalAssets: RawAmount | null;
    /** `totalSupply()` — every share in existence, in share units. */
    totalSupply: RawAmount | null;
    /** `totalIdle()` — the asset in the vault, ready for a withdrawal. */
    totalIdle: RawAmount | null;
    /** `totalDebt()` — what the strategies hold, as the vault records it. */
    totalDebt: RawAmount | null;
    /** `convertToAssets(10 ** decimals)` — one whole share, in the asset. */
    sharePrice: RawAmount | null;
    /** `accountant()` — the contract that charges the vault's fees, or null
     *  when it is the zero address (no accountant set). */
    accountant: string | null;
    /** `role_manager()` — the address that holds the vault's roles. */
    roleManager: string | null;
    /** `profitMaxUnlockTime()` in seconds: how long a reported gain takes to
     *  reach the share price. Null when the call did not answer; zero is a
     *  reading, and means a gain lands at once. */
    profitMaxUnlockTime: number | null;
    /** `isShutdown()` at the block. */
    shutdown: boolean | null;
    /** `Registry.isEndorsed(vault)` at the block. Null is not false. */
    endorsed: boolean | null;
    /** The share token's own `decimals()` at the block. A Yearn V3 vault
     *  mirrors its asset's decimals and adds no offset — unlike MetaMorpho,
     *  whose factory adds a `DECIMALS_OFFSET()` — but this is the READING of
     *  it, and it is what the holder lane's share prices are asked with. Null
     *  where the call did not answer, and then no share price is asked at all:
     *  an invented exponent is a wrong figure wearing the contract's name. */
    shareDecimals: number | null;
  };
  /** What ONE address holds of this vault at the same block, when the caller
   *  named one. Null where none was named. An address holding nothing is a
   *  reading and comes back with zero shares, not as null. */
  holder: {
    /** Lowercased, as the caller passed it. */
    address: string;
    /** `balanceOf(holder)` — the figure the timeline's gate is checked
     *  against, in share units. */
    shares: RawAmount;
    /** `convertToAssets(balanceOf(holder))` — the vault's own conversion of
     *  that exact balance, in the asset. Null where the call did not answer. */
    claim: RawAmount | null;
  } | null;
  /** One row per member of `get_default_queue()`, in queue order. */
  strategies: YearnVaultStrategyRow[];
}

/**
 * One catalogued Yearn V3 vault, read at one pinned block. Throws for an
 * address the catalogue does not hold — the page checks membership first and
 * answers 404 — and returns `chainStale` with no figures when the read fails.
 */
export async function loadYearnEthereumVault(address: string, holder?: string): Promise<YearnVaultResponse> {
  const entry = await yearnRosterEntry(address);
  if (!entry) throw new Error(`${address} is not in the Yearn V3 catalogue`);

  const base = {
    address: entry.address,
    name: null,
    symbol: null,
    censusName: entry.name,
    apiVersion: entry.apiVersion,
    factory: entry.factory,
    createdBlock: entry.createdBlock,
    asset: {
      address: entry.asset.address,
      symbol: entry.asset.symbol ?? entry.asset.address.slice(0, 6),
      decimals: entry.asset.decimals,
      named: entry.asset.symbol != null,
    },
    totalAssets: null,
    totalSupply: null,
    totalIdle: null,
    totalDebt: null,
    sharePrice: null,
    accountant: null,
    roleManager: null,
    profitMaxUnlockTime: null,
    shutdown: null,
    endorsed: null,
    shareDecimals: null,
  } satisfies YearnVaultResponse["vault"];

  try {
    const client = chainBatchClient(YEARN_CHAIN_ID);
    // ONE block read; every call below is pinned to it.
    const blockNumber = await client.getBlockNumber();
    const vault = entry.address as `0x${string}`;
    const decimals = entry.asset.decimals;

    const reads = (await client.multicall({
      contracts: [
        { address: vault, abi: VAULT_ABI, functionName: "name" },
        { address: vault, abi: VAULT_ABI, functionName: "symbol" },
        { address: vault, abi: VAULT_ABI, functionName: "totalAssets" },
        { address: vault, abi: VAULT_ABI, functionName: "totalSupply" },
        { address: vault, abi: VAULT_ABI, functionName: "totalIdle" },
        { address: vault, abi: VAULT_ABI, functionName: "totalDebt" },
        {
          address: vault,
          abi: VAULT_ABI,
          functionName: "convertToAssets",
          args: [BigInt(10) ** BigInt(decimals)],
        },
        { address: vault, abi: VAULT_ABI, functionName: "get_default_queue" },
        { address: vault, abi: VAULT_ABI, functionName: "accountant" },
        { address: vault, abi: VAULT_ABI, functionName: "role_manager" },
        { address: vault, abi: VAULT_ABI, functionName: "profitMaxUnlockTime" },
        { address: vault, abi: VAULT_ABI, functionName: "isShutdown" },
        { address: vault, abi: VAULT_ABI, functionName: "apiVersion" },
        { address: vault, abi: VAULT_ABI, functionName: "decimals" },
        { address: YEARN_REGISTRY as `0x${string}`, abi: REGISTRY_ABI, functionName: "isEndorsed", args: [vault] },
      ],
      allowFailure: true,
      blockNumber,
    })) as Call[];

    const at = (name: (typeof CALLS)[number]) => ok(reads[CALLS.indexOf(name)]);
    const big = (name: (typeof CALLS)[number]) => at(name) as bigint | undefined;
    const addr = (name: (typeof CALLS)[number]) => (at(name) as string | undefined)?.toLowerCase();
    const scaled = (v: bigint | undefined, d: number) => (v == null ? null : amount(v, d));

    const queue = ((at("get_default_queue") as readonly string[] | undefined) ?? []).map((a) => a.toLowerCase());

    // The queue's own reads, one wave: each member's StrategyParams on the
    // vault, and its `name()` on the strategy.
    const strategyReads =
      queue.length === 0
        ? []
        : ((await client.multicall({
            contracts: queue.flatMap((s) => [
              { address: vault, abi: STRATEGY_ABI, functionName: "strategies", args: [s as `0x${string}`] },
              { address: s as `0x${string}`, abi: STRATEGY_ABI, functionName: "name" },
            ]),
            allowFailure: true,
            blockNumber,
          })) as Call[]);

    const strategies: YearnVaultStrategyRow[] = queue.map((s, i) => {
      const params = ok(strategyReads[i * 2]) as
        | { activation: bigint; last_report: bigint; current_debt: bigint; max_debt: bigint }
        | undefined;
      return {
        address: s,
        name: (ok(strategyReads[i * 2 + 1]) as string | undefined) ?? null,
        position: i + 1,
        currentDebt: params == null ? null : amount(params.current_debt, decimals),
        maxDebt: params == null ? null : amount(params.max_debt, decimals),
        lastReport: params == null ? null : Number(params.last_report),
        activation: params == null ? null : Number(params.activation),
      };
    });

    // The share exponent, READ. A share figure is scaled by it and every share
    // price on the holder lane is asked with it, so it is the vault's own
    // answer or nothing.
    const shareDecimalsRaw = at("decimals");
    const shareDecimals = typeof shareDecimalsRaw === "number" ? shareDecimalsRaw : null;

    // ── ONE ADDRESS'S READING, at the same block ─────────────────────────────
    // Two calls, the second built from the first's answer: `convertToAssets` is
    // asked with the EXACT balance rather than with one whole share times the
    // balance, because the vault's own conversion of a number is the vault's
    // figure and a multiplication of ours is not. An address holding nothing
    // comes back with zero and a claim of zero — a reading, never a null.
    let holderReading: YearnVaultResponse["holder"] = null;
    if (holder) {
      const who = holder.toLowerCase() as `0x${string}`;
      const balance = (
        await client.multicall({
          contracts: [{ address: vault, abi: VAULT_ABI, functionName: "balanceOf", args: [who] }],
          allowFailure: true,
          blockNumber,
        })
      )[0];
      const shares = ok(balance as Call) as bigint | undefined;
      if (shares != null) {
        const claimRead = (
          await client.multicall({
            contracts: [{ address: vault, abi: VAULT_ABI, functionName: "convertToAssets", args: [shares] }],
            allowFailure: true,
            blockNumber,
          })
        )[0];
        const claim = ok(claimRead as Call) as bigint | undefined;
        holderReading = {
          address: who,
          shares: amount(shares, shareDecimals ?? decimals),
          claim: claim == null ? null : amount(claim, decimals),
        };
      }
    }

    const accountant = addr("accountant");
    const roleManager = addr("role_manager");
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const unlock = big("profitMaxUnlockTime");

    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      vault: {
        ...base,
        name: (at("name") as string | undefined) ?? null,
        symbol: (at("symbol") as string | undefined) ?? null,
        totalAssets: scaled(big("totalAssets"), decimals),
        totalSupply: scaled(big("totalSupply"), decimals),
        totalIdle: scaled(big("totalIdle"), decimals),
        totalDebt: scaled(big("totalDebt"), decimals),
        sharePrice: scaled(big("convertToAssets"), decimals),
        accountant: accountant == null || accountant === ZERO_ADDR ? null : accountant,
        roleManager: roleManager ?? null,
        profitMaxUnlockTime: unlock == null ? null : Number(unlock),
        shutdown: (at("isShutdown") as boolean | undefined) ?? null,
        endorsed: (ok(reads[CALLS.length]) as boolean | undefined) ?? null,
        shareDecimals: shareDecimals ?? null,
      },
      holder: holderReading,
      strategies,
    };
  } catch (error) {
    console.error("Yearn vault chain read failed:", error);
    return { blockNumber: 0, chainStale: true, vault: base, holder: null, strategies: [] };
  }
}
