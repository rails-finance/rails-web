// One LlamaLend position's state on either side of one event: the block
// before it (block − 1) and its own block. The event's UserState log states
// collateral, debt and ticks after it; what stood before, what the AMM had
// converted, and the health on each side are state only, so they are read.
//
// Both blocks come from rails-server's `/api/at-block/llamalend/event-state`,
// which reads each block's seven calls once into its at-block store (Controller
// user_state, health, user_prices and liquidation_discounts; AMM
// read_user_tick_numbers, price_oracle and get_base_price; server mig 412,
// rails-ops decisions/0056).
//
// A liquidation row may also ask for the position at the START of its block
// (`start`): the state at block − 1 read with the block's number and time
// (eth_call block overrides), so health and the oracle price are what the
// block's first transaction saw. The oracle price moves with time, so health
// can cross 0 between the end of one block and the next. The same route
// answers it with `start=1` (server mig 457). Where it answers `start: null`
// (its read failed) or a start that does not parse, the read is the chain's:
// one block-header read and one eth_call (Multicall3 aggregate3). Either
// answer is kept in process memory.
//
// SERVER-ONLY.

import { decodeFunctionResult, encodeFunctionData, getAddress, multicall3Abi, parseAbi } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { alchemyClient } from "./rpc";
import { discoverLlamalendMarkets } from "./llamalend-markets";
import { UnknownLlamalendMarketError } from "./llamalend-position";

const CONTROLLER_ABI = parseAbi([
  "function user_state(address) view returns (uint256[4])",
  "function health(address,bool) view returns (int256)",
  "function user_prices(address) view returns (uint256[2])",
  "function liquidation_discounts(address) view returns (uint256)",
]);
const AMM_ABI = parseAbi([
  "function read_user_tick_numbers(address) view returns (int256[2])",
  "function price_oracle() view returns (uint256)",
  "function get_base_price() view returns (uint256)",
]);

/** The position at one block. Raw integers as strings; health and the
 *  discount are 1e18-scaled, prices 1e18 in the borrowed token. */
export interface LlamalendStateAt {
  block: number;
  /** debt > 0 at this block. False: the position had no loan (every field
   *  below but the price is null). */
  hasLoan: boolean;
  collateralRaw: string | null;
  convertedRaw: string | null;
  debtRaw: string | null;
  n1: string | null;
  n2: string | null;
  healthRaw: string | null;
  pUpRaw: string | null;
  pDownRaw: string | null;
  liquidationDiscountRaw: string | null;
  priceOracleRaw: string | null;
  /** AMM.get_base_price(), 1e18: with A and a tick pair it gives the band
   *  edges at this block (lib/llamalend/band-math.ts). */
  basePriceRaw: string | null;
}

/** Health and the oracle price at the start of the event's block. */
export interface LlamalendStartOfBlock {
  block: number;
  timestamp: number;
  healthRaw: string | null;
  priceOracleRaw: string | null;
}

export interface LlamalendEventState {
  controller: string;
  user: string;
  before: LlamalendStateAt;
  after: LlamalendStateAt;
  /** Present when asked for (`start`) and the read answered. */
  start?: LlamalendStartOfBlock | null;
}

const CACHE_MAX = 4000;
const RAILS_API_URL = process.env.RAILS_API_URL;

const INT = /^-?\d+$/;
const UINT = /^\d+$/;

/** The server's start of `block`, or null where it is absent or does not parse. */
function storedStart(v: unknown, block: number): LlamalendStartOfBlock | null {
  const r = v as Record<string, unknown> | null | undefined;
  if (r == null || r.block !== block || !Number.isInteger(r.timestamp)) return null;
  const h = r.healthRaw;
  const p = r.priceOracleRaw;
  if (h !== null && (typeof h !== "string" || !INT.test(h))) return null;
  if (p !== null && (typeof p !== "string" || !UINT.test(p))) return null;
  return { block, timestamp: r.timestamp as number, healthRaw: h, priceOracleRaw: p };
}

/** Both blocks from the server's store, and with `withStart` the start of
 *  the block (null where the server's read failed); an unlisted controller is
 *  its 404. */
async function storedStates(
  controller: string,
  user: string,
  block: number,
  withStart: boolean,
  readerIp?: string,
): Promise<{ before: LlamalendStateAt; after: LlamalendStateAt; start: LlamalendStartOfBlock | null }> {
  if (!RAILS_API_URL) throw new Error("RAILS_API_URL is not set");
  const qs = new URLSearchParams({ controller, user, block: String(block) });
  if (withStart) qs.set("start", "1");
  const res = await fetch(
    `${RAILS_API_URL}/api/at-block/llamalend/event-state?${qs.toString()}`,
    createAuthFetchOptions(undefined, readerIp),
  );
  if (res.status === 404) throw new UnknownLlamalendMarketError(controller);
  if (!res.ok) throw new Error(`the at-block store answered ${res.status}`);
  const body = (await res.json()) as { before: LlamalendStateAt; after: LlamalendStateAt; start?: unknown };
  return { before: body.before, after: body.after, start: withStart ? storedStart(body.start, block) : null };
}

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const startCache = new Map<string, Promise<LlamalendStartOfBlock | null>>();

async function readStart(
  controller: `0x${string}`,
  amm: `0x${string}`,
  user: `0x${string}`,
  block: number,
): Promise<LlamalendStartOfBlock | null> {
  const client = alchemyClient();
  const header = await client.getBlock({ blockNumber: BigInt(block) });
  const data = encodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [
      [
        {
          target: controller,
          allowFailure: true,
          callData: encodeFunctionData({ abi: CONTROLLER_ABI, functionName: "health", args: [user, true] }),
        },
        {
          target: amm,
          allowFailure: true,
          callData: encodeFunctionData({ abi: AMM_ABI, functionName: "price_oracle" }),
        },
      ],
    ],
  });
  const res = await client.call({
    to: MULTICALL3,
    data,
    blockNumber: BigInt(block - 1),
    blockOverrides: { number: BigInt(block), time: header.timestamp },
  });
  if (!res.data) return null;
  const [h, p] = decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: res.data });
  const health = h.success
    ? (decodeFunctionResult({ abi: CONTROLLER_ABI, functionName: "health", data: h.returnData }) as bigint)
    : null;
  const price = p.success
    ? (decodeFunctionResult({ abi: AMM_ABI, functionName: "price_oracle", data: p.returnData }) as bigint)
    : null;
  return {
    block,
    timestamp: Number(header.timestamp),
    healthRaw: health != null ? health.toString() : null,
    priceOracleRaw: price != null ? price.toString() : null,
  };
}

export async function readLlamalendEventState(
  controllerRaw: string,
  userRaw: string,
  block: number,
  withStart = false,
  readerIp?: string,
): Promise<LlamalendEventState> {
  const controller = getAddress(controllerRaw).toLowerCase();
  const user = getAddress(userRaw);
  const key = `${controller}:${user.toLowerCase()}:${block}`;
  const keep = (p: Promise<LlamalendStartOfBlock | null>) => {
    if (startCache.size >= CACHE_MAX) {
      const oldest = startCache.keys().next().value;
      if (oldest != null) startCache.delete(oldest);
    }
    p.then((v) => {
      if (v == null) startCache.delete(key);
    });
    startCache.set(key, p);
    return p;
  };
  /** The chain's start read, where the server answered none. */
  const chainStart = async () => {
    const market = (await discoverLlamalendMarkets()).get(controller);
    if (!market) throw new UnknownLlamalendMarketError(controller);
    return keep(readStart(controller as `0x${string}`, market.amm as `0x${string}`, user, block).catch(() => null));
  };
  const kept = withStart ? startCache.get(key) : undefined;
  const stored = await storedStates(controller, user.toLowerCase(), block, withStart && !kept, readerIp);
  let start: LlamalendStartOfBlock | null | undefined;
  if (withStart) {
    if (kept) start = await kept;
    else if (stored.start) start = await keep(Promise.resolve(stored.start));
    else start = await chainStart();
  }
  const { before, after } = stored;
  return { controller, user: user.toLowerCase(), before, after, ...(start !== undefined ? { start } : {}) };
}
