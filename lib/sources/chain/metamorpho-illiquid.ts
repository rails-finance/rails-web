// Which MetaMorpho vaults on a roster are illiquid at one block (rails-ops
// ui-jobs 540; the test and its arithmetic are lib/vaults/illiquid.ts).
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// Five waves, every call pinned to the directory's block:
//
//   1. `withdrawQueueLength()` on every vault holding assets;
//   2. `withdrawQueue(i)`;
//   3. `market(id)` and `idToMarketParams(id)` once per distinct market;
//   4. the IRM's `borrowRateView` on each market with interest to accrue, and
//      the block's timestamp: the totals accrued to the block;
//   5. `position(id, vault)` on every leg of every queue whose markets all
//      answered, and `rateAtTarget(id)` on the markets 99.9% or more borrowed
//      on the chain's AdaptiveCurveIRM.
//
// A vault whose read did not answer is left out of the map: unread, never
// liquid. A vault read maps to its liquidity (what can leave), whose
// `illiquid` is null where the test catches no market.

import { parseAbi, type PublicClient } from "viem";
import { resolveErc20Meta } from "./erc20-meta";
import type { ChainId } from "@/lib/shared/chains";
import {
  expectedMarket,
  needsBorrowRate,
  needsRateAtTarget,
  toAssetsDown,
  vaultIlliquid,
  type IlliquidLegInput,
  type SettledMarket,
  type VaultLiquidity,
} from "@/lib/vaults/illiquid";

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
const IRM_ABI = parseAbi([
  "function rateAtTarget(bytes32) view returns (int256)",
  "struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }",
  "struct Market { uint128 totalSupplyAssets; uint128 totalSupplyShares; uint128 totalBorrowAssets; uint128 totalBorrowShares; uint128 lastUpdate; uint128 fee; }",
  "function borrowRateView(MarketParams marketParams, Market market) view returns (uint256)",
]);

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

const settled = (market: MarketTuple): SettledMarket => ({
  totalSupplyAssets: market[0],
  totalSupplyShares: market[1],
  totalBorrowAssets: market[2],
  lastUpdate: Number(market[4]),
  fee: market[5],
});

/** Does accruing this market to `timestamp` need its IRM's `borrowRateView`? */
export const readNeedsBorrowRate = (read: MarketRead, timestamp: number): boolean =>
  needsBorrowRate(settled(read.market), read.params[3], timestamp);

/** Reads `borrowRateView(params, market)` for each market given, at `blockNumber`. */
export async function readBorrowRates(
  client: PublicClient,
  blockNumber: bigint,
  markets: { id: string; read: MarketRead }[],
): Promise<Map<string, bigint>> {
  const answers = await multicall(
    client,
    markets.map(({ read: { params: p, market: m } }) => ({
      address: p[3] as `0x${string}`,
      abi: IRM_ABI,
      functionName: "borrowRateView",
      args: [
        { loanToken: p[0], collateralToken: p[1], oracle: p[2], irm: p[3], lltv: p[4] },
        {
          totalSupplyAssets: m[0],
          totalSupplyShares: m[1],
          totalBorrowAssets: m[2],
          totalBorrowShares: m[3],
          lastUpdate: m[4],
          fee: m[5],
        },
      ],
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

/** One leg as the test takes it, from its reads, accrued to `timestamp`:
 *  null where the accrual needs a borrow rate that was not read. */
export function legInput(
  id: string,
  read: MarketRead,
  supplyShares: bigint,
  borrowRate: bigint | null,
  timestamp: number,
  collateralSymbol: string | null,
): IlliquidLegInput | null {
  const [, collateral, oracle, irm, lltv] = read.params;
  const s = settled(read.market);
  const at = expectedMarket(s, irm, borrowRate, timestamp);
  if (at == null) return null;
  return {
    id,
    collateralSymbol,
    isIdle: collateral.toLowerCase() === ZERO_ADDR && oracle.toLowerCase() === ZERO_ADDR,
    irm: irm.toLowerCase(),
    lltv: Number((lltv * BigInt(1_000_000)) / WAD) / 1_000_000,
    vaultAssets: toAssetsDown(supplyShares, at.supplyAssets, at.supplyShares),
    supplyAssets: at.supplyAssets,
    borrowAssets: at.borrowAssets,
    lastUpdate: s.lastUpdate,
    settledUtilisation:
      s.totalSupplyAssets === ZERO
        ? 0
        : Number((s.totalBorrowAssets * BigInt(1_000_000)) / s.totalSupplyAssets) / 1_000_000,
    rateAtTarget: null,
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
): Promise<Map<string, VaultLiquidity>> {
  const out = new Map<string, VaultLiquidity>();
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
  const read = new Map<string, MarketRead>();
  distinct.forEach((id, k) => {
    const market = ok(marketAnswers[2 * k]) as MarketTuple | undefined;
    const params = ok(marketAnswers[2 * k + 1]) as ParamsTuple | undefined;
    if (market && params) read.set(id, { market, params });
  });

  // 4. Each market accrued to the block. One whose rate did not answer is unread.
  const timestamp = Number((await client.getBlock({ blockNumber })).timestamp);
  const accruing = [...read].filter(([, r]) => readNeedsBorrowRate(r, timestamp)).map(([id, r]) => ({ id, read: r }));
  const borrowRates = await readBorrowRates(client, blockNumber, accruing);
  // The market's totals at the block, as a leg with no supply of the vault's.
  const markets = new Map<string, MarketRead>();
  const atBlock = new Map<string, IlliquidLegInput>();
  for (const [id, r] of read) {
    const l = legInput(id, r, ZERO, borrowRates.get(id) ?? null, timestamp, null);
    if (l == null) continue;
    markets.set(id, r);
    atBlock.set(id, l);
  }
  const hot = (id: string) => {
    const l = atBlock.get(id);
    return l != null && needsRateAtTarget(chainId, l);
  };

  // A vault with a market unread cannot be tested. Every other vault's legs
  // are read, so its withdrawable part is stated (ui-jobs 553); the hot
  // markets' rates at target are read for the test.
  const testable = vaults.filter((v) => readable.has(v) && (queues.get(v) ?? []).every((id) => markets.has(id)));

  // 5. Positions on every leg of a testable queue, and the hot markets' rates.
  const posSlots = testable.flatMap((v) => (queues.get(v) ?? []).map((id) => ({ vault: v, id })));
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

  const caught = new Map<string, IlliquidLegInput[]>();
  for (const v of testable) {
    const q = queues.get(v) ?? [];
    if (q.some((id) => shares.get(`${v}:${id}`) == null)) continue;
    const accrued = q.map((id) =>
      legInput(id, markets.get(id)!, shares.get(`${v}:${id}`)!, borrowRates.get(id) ?? null, timestamp, null),
    );
    if (accrued.some((l) => l == null)) continue;
    const legs = accrued.map((l) => ({ ...l!, rateAtTarget: rates.get(l!.id) ?? null }));
    const liquidity = vaultIlliquid(chainId, Number(blockNumber), timestamp, legs);
    if (liquidity == null) continue;
    if (liquidity.illiquid == null) out.set(v, liquidity);
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
    const liquidity = vaultIlliquid(chainId, Number(blockNumber), timestamp, named);
    if (liquidity) out.set(v, liquidity);
  }
  return out;
}
