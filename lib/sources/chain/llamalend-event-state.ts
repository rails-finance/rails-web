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
// can cross 0 between the end of one block and the next. The store keys a call
// by its block alone, so this read stays on the chain: one block-header read
// and one eth_call (Multicall3 aggregate3), kept in process memory.
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

/** Both blocks from the server's store; an unlisted controller is its 404. */
async function storedStates(
  controller: string,
  user: string,
  block: number,
  readerIp?: string,
): Promise<{ before: LlamalendStateAt; after: LlamalendStateAt }> {
  if (!RAILS_API_URL) throw new Error("RAILS_API_URL is not set");
  const qs = new URLSearchParams({ controller, user, block: String(block) });
  const res = await fetch(
    `${RAILS_API_URL}/api/at-block/llamalend/event-state?${qs.toString()}`,
    createAuthFetchOptions(undefined, readerIp),
  );
  if (res.status === 404) throw new UnknownLlamalendMarketError(controller);
  if (!res.ok) throw new Error(`the at-block store answered ${res.status}`);
  const body = (await res.json()) as { before: LlamalendStateAt; after: LlamalendStateAt };
  return { before: body.before, after: body.after };
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
  const startOf = async () => {
    const market = (await discoverLlamalendMarkets()).get(controller);
    if (!market) throw new UnknownLlamalendMarketError(controller);
    const key = `${controller}:${user.toLowerCase()}:${block}`;
    let p = startCache.get(key);
    if (!p) {
      if (startCache.size >= CACHE_MAX) {
        const oldest = startCache.keys().next().value;
        if (oldest != null) startCache.delete(oldest);
      }
      p = readStart(controller as `0x${string}`, market.amm as `0x${string}`, user, block).catch(() => null);
      p.then((v) => {
        if (v == null) startCache.delete(key);
      });
      startCache.set(key, p);
    }
    return p;
  };
  const [{ before, after }, start] = await Promise.all([
    storedStates(controller, user.toLowerCase(), block, readerIp),
    withStart ? startOf() : Promise.resolve(undefined),
  ]);
  return { controller, user: user.toLowerCase(), before, after, ...(start !== undefined ? { start } : {}) };
}
