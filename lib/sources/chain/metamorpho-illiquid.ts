// Which MetaMorpho vaults on a roster are illiquid at one block (rails-ops
// ui-jobs 540; the test and its arithmetic are lib/vaults/illiquid.ts).
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// Four waves, every call pinned to the directory's block:
//
//   1. `withdrawQueueLength()` on every vault holding assets;
//   2. `withdrawQueue(i)`;
//   3. `market(id)` and `idToMarketParams(id)` once per distinct market;
//   4. for the vaults whose queue holds a market 99.9% or more borrowed on the
//      chain's AdaptiveCurveIRM: `position(id, vault)` on every leg of that
//      queue, and `rateAtTarget(id)` on those markets, with the block's
//      timestamp to adapt it.
//
// A vault whose read did not answer is left out of the map: unread, never
// liquid. A vault read and not caught maps to null.

import { parseAbi, type PublicClient } from "viem";
import { resolveErc20Meta } from "./erc20-meta";
import type { ChainId } from "@/lib/shared/chains";
import { needsRateAtTarget, vaultIlliquid, type IlliquidLegInput, type VaultIlliquid } from "@/lib/vaults/illiquid";

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const WAD = BigInt("1000000000000000000");
/** Calls per Multicall3 request: the chain fallback's gas stays inside a node's cap. */
const CHUNK = 400;

const VAULT_ABI = parseAbi([
  "function withdrawQueueLength() view returns (uint256)",
  "function withdrawQueue(uint256) view returns (bytes32)",
]);
const BLUE_ABI = parseAbi([
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
const IRM_ABI = parseAbi(["function rateAtTarget(bytes32) view returns (int256)"]);

/** The Blue singleton, the same address on both chains. */
export const MORPHO_BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";

type Call = { status: string; result?: unknown };
type Contract = { address: `0x${string}`; abi: unknown; functionName: string; args?: readonly unknown[] };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

async function multicall(client: PublicClient, contracts: Contract[], blockNumber: bigint): Promise<Call[]> {
  const chunks: Contract[][] = [];
  for (let i = 0; i < contracts.length; i += CHUNK) chunks.push(contracts.slice(i, i + CHUNK));
  const answers = await Promise.all(
    chunks.map(
      (chunk) =>
        client.multicall({
          contracts: chunk as Parameters<PublicClient["multicall"]>[0]["contracts"],
          allowFailure: true,
          batchSize: 0,
          blockNumber,
        }) as Promise<Call[]>,
    ),
  );
  return answers.flat();
}

type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
type ParamsTuple = readonly [string, string, string, string, bigint];

/** The legs of one vault's queue as the test takes them. */
export interface MarketRead {
  params: ParamsTuple;
  market: MarketTuple;
}

/** One leg as the test takes it, from its reads. */
export function legInput(
  id: string,
  read: MarketRead,
  supplyShares: bigint,
  rateAtTarget: bigint | null,
  collateralSymbol: string | null,
): IlliquidLegInput {
  const [, collateral, oracle, irm, lltv] = read.params;
  const [supplyAssets, supplyShares_, borrowAssets, , lastUpdate] = read.market;
  return {
    id,
    collateralSymbol,
    isIdle: collateral.toLowerCase() === ZERO_ADDR && oracle.toLowerCase() === ZERO_ADDR,
    irm: irm.toLowerCase(),
    lltv: Number((lltv * BigInt(1_000_000)) / WAD) / 1_000_000,
    vaultAssets: supplyShares_ === ZERO ? ZERO : (supplyShares * supplyAssets) / supplyShares_,
    supplyAssets,
    borrowAssets,
    lastUpdate: Number(lastUpdate),
    rateAtTarget,
  };
}

/** Reads `rateAtTarget(id)` for each market that needs it, at `blockNumber`. */
export async function readRatesAtTarget(
  client: PublicClient,
  blockNumber: bigint,
  markets: { id: string; irm: string }[],
): Promise<Map<string, bigint>> {
  const answers = await multicall(
    client,
    markets.map((m) => ({
      address: m.irm as `0x${string}`,
      abi: IRM_ABI,
      functionName: "rateAtTarget",
      args: [m.id as `0x${string}`],
    })),
    blockNumber,
  );
  const out = new Map<string, bigint>();
  markets.forEach((m, i) => {
    const r = ok(answers[i]) as bigint | undefined;
    if (r != null) out.set(m.id, r);
  });
  return out;
}

/** The illiquid test over `vaults` at `blockNumber`, by lowercased address. */
export async function readMetaMorphoIlliquid(
  client: PublicClient,
  chainId: ChainId,
  blockNumber: bigint,
  vaults: readonly string[],
): Promise<Map<string, VaultIlliquid | null>> {
  const out = new Map<string, VaultIlliquid | null>();
  if (vaults.length === 0) return out;
  const blue = MORPHO_BLUE as `0x${string}`;

  // 1. Queue lengths.
  const lengths = await multicall(
    client,
    vaults.map((v) => ({ address: v as `0x${string}`, abi: VAULT_ABI, functionName: "withdrawQueueLength" })),
    blockNumber,
  );
  const slots: { vault: string; i: number }[] = [];
  const readable = new Set<string>();
  vaults.forEach((v, k) => {
    const n = ok(lengths[k]) as bigint | undefined;
    if (n == null) return;
    readable.add(v);
    for (let i = 0; i < Number(n); i++) slots.push({ vault: v, i });
  });

  // 2. The queues.
  const ids = await multicall(
    client,
    slots.map((s) => ({
      address: s.vault as `0x${string}`,
      abi: VAULT_ABI,
      functionName: "withdrawQueue",
      args: [BigInt(s.i)],
    })),
    blockNumber,
  );
  const queues = new Map<string, string[]>();
  slots.forEach((s, k) => {
    const id = ok(ids[k]) as string | undefined;
    if (id == null) {
      readable.delete(s.vault);
      return;
    }
    queues.set(s.vault, [...(queues.get(s.vault) ?? []), id]);
  });

  // 3. Each distinct market once.
  const distinct = [...new Set([...queues.values()].flat())];
  const marketAnswers = await multicall(
    client,
    distinct.flatMap((id) => [
      { address: blue, abi: BLUE_ABI, functionName: "market", args: [id as `0x${string}`] },
      { address: blue, abi: BLUE_ABI, functionName: "idToMarketParams", args: [id as `0x${string}`] },
    ]),
    blockNumber,
  );
  const markets = new Map<string, MarketRead>();
  distinct.forEach((id, k) => {
    const market = ok(marketAnswers[2 * k]) as MarketTuple | undefined;
    const params = ok(marketAnswers[2 * k + 1]) as ParamsTuple | undefined;
    if (market && params) markets.set(id, { market, params });
  });
  const hot = (id: string) => {
    const m = markets.get(id);
    if (!m) return false;
    return needsRateAtTarget(chainId, {
      isIdle: m.params[1].toLowerCase() === ZERO_ADDR && m.params[2].toLowerCase() === ZERO_ADDR,
      irm: m.params[3],
      supplyAssets: m.market[0],
      borrowAssets: m.market[2],
    });
  };

  // A vault with a market unread cannot be tested; one with no hot market is not caught.
  const candidates: string[] = [];
  for (const v of vaults) {
    if (!readable.has(v)) continue;
    const q = queues.get(v) ?? [];
    if (q.some((id) => !markets.has(id))) continue;
    if (q.some(hot)) candidates.push(v);
    else out.set(v, null);
  }

  // 4. Positions on every leg of a candidate's queue, and the hot markets' rates.
  const posSlots = candidates.flatMap((v) => (queues.get(v) ?? []).map((id) => ({ vault: v, id })));
  const hotIds = [...new Set(posSlots.map((s) => s.id).filter(hot))];
  const [positions, rates] = await Promise.all([
    multicall(
      client,
      posSlots.map((s) => ({
        address: blue,
        abi: BLUE_ABI,
        functionName: "position",
        args: [s.id as `0x${string}`, s.vault as `0x${string}`],
      })),
      blockNumber,
    ),
    readRatesAtTarget(
      client,
      blockNumber,
      hotIds.map((id) => ({ id, irm: markets.get(id)!.params[3] })),
    ),
  ]);
  const shares = new Map<string, bigint | undefined>();
  posSlots.forEach((s, k) => {
    const p = ok(positions[k]) as readonly [bigint, bigint, bigint] | undefined;
    shares.set(`${s.vault}:${s.id}`, p?.[0]);
  });

  const timestamp = candidates.length > 0 ? Number((await client.getBlock({ blockNumber })).timestamp) : 0;
  const caught = new Map<string, IlliquidLegInput[]>();
  for (const v of candidates) {
    const q = queues.get(v)!;
    if (q.some((id) => shares.get(`${v}:${id}`) == null)) continue;
    const legs = q.map((id) => legInput(id, markets.get(id)!, shares.get(`${v}:${id}`)!, rates.get(id) ?? null, null));
    const il = vaultIlliquid(chainId, Number(blockNumber), timestamp, legs);
    if (il == null) out.set(v, null);
    else caught.set(v, legs);
  }

  // Name the caught markets' collateral through the house resolver.
  const collateral = new Map<string, string>();
  for (const legs of caught.values())
    for (const l of legs) {
      const c = markets.get(l.id)!.params[1].toLowerCase();
      if (c !== ZERO_ADDR) collateral.set(l.id, c);
    }
  const meta = collateral.size > 0 ? await resolveErc20Meta([...new Set(collateral.values())], chainId) : new Map();
  for (const [v, legs] of caught) {
    const named = legs.map((l) => {
      const m = meta.get(collateral.get(l.id) ?? "");
      return { ...l, collateralSymbol: m?.named ? m.symbol : null };
    });
    out.set(v, vaultIlliquid(chainId, Number(blockNumber), timestamp, named));
  }
  return out;
}
