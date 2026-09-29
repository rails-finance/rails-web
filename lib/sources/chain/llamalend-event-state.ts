// One LlamaLend position's state on either side of one event: the block
// before it (block − 1) and its own block. The event's UserState log states
// collateral, debt and ticks after it; what stood before, what the AMM had
// converted, and the health on each side are state only, so they are read.
//
// Per block, ONE multicall against the market's two contracts:
//   Controller.user_state(user)            (collateral, converted, debt, N)
//   Controller.health(user, true)          reverts with no loan → null
//   Controller.user_prices(user)           band top and bottom price
//   Controller.liquidation_discounts(user) the discount health subtracts
//   AMM.read_user_tick_numbers(user)       (n1, n2)
//   AMM.price_oracle()
// Two eth_calls per event (block − 1, block). A mined block's state never
// changes, so each (controller, user, block) answer is kept in process
// memory and the route caches it at the edge.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
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
}

export interface LlamalendEventState {
  controller: string;
  user: string;
  before: LlamalendStateAt;
  after: LlamalendStateAt;
}

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const CACHE_MAX = 4000;
const cache = new Map<string, Promise<LlamalendStateAt>>();

function remember(key: string, p: Promise<LlamalendStateAt>): Promise<LlamalendStateAt> {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

async function readAt(controller: `0x${string}`, amm: `0x${string}`, user: `0x${string}`, block: number) {
  const reads = (await alchemyClient().multicall({
    allowFailure: true,
    blockNumber: BigInt(block),
    contracts: [
      { address: controller, abi: CONTROLLER_ABI, functionName: "user_state", args: [user] },
      { address: controller, abi: CONTROLLER_ABI, functionName: "health", args: [user, true] },
      { address: controller, abi: CONTROLLER_ABI, functionName: "user_prices", args: [user] },
      { address: controller, abi: CONTROLLER_ABI, functionName: "liquidation_discounts", args: [user] },
      { address: amm, abi: AMM_ABI, functionName: "read_user_tick_numbers", args: [user] },
      { address: amm, abi: AMM_ABI, functionName: "price_oracle" },
    ] as const,
  })) as Res[];
  const us = ok<readonly [bigint, bigint, bigint, bigint]>(reads[0]);
  if (us == null) throw new Error("user_state did not answer");
  const price = ok<bigint>(reads[5]);
  const out: LlamalendStateAt = {
    block,
    hasLoan: us[2] > BigInt(0),
    collateralRaw: null,
    convertedRaw: null,
    debtRaw: null,
    n1: null,
    n2: null,
    healthRaw: null,
    pUpRaw: null,
    pDownRaw: null,
    liquidationDiscountRaw: null,
    priceOracleRaw: price != null ? price.toString() : null,
  };
  // No loan: the stored ticks are stale and health reverts, so nothing else
  // is stated.
  if (!out.hasLoan) return out;
  out.collateralRaw = us[0].toString();
  out.convertedRaw = us[1].toString();
  out.debtRaw = us[2].toString();
  const health = ok<bigint>(reads[1]);
  if (health != null) out.healthRaw = health.toString();
  const prices = ok<readonly [bigint, bigint]>(reads[2]);
  if (prices != null) {
    out.pUpRaw = prices[0].toString();
    out.pDownRaw = prices[1].toString();
  }
  const discount = ok<bigint>(reads[3]);
  if (discount != null) out.liquidationDiscountRaw = discount.toString();
  const ticks = ok<readonly [bigint, bigint]>(reads[4]);
  if (ticks != null) {
    out.n1 = ticks[0].toString();
    out.n2 = ticks[1].toString();
  }
  return out;
}

export async function readLlamalendEventState(
  controllerRaw: string,
  userRaw: string,
  block: number,
): Promise<LlamalendEventState> {
  const controller = getAddress(controllerRaw).toLowerCase();
  const user = getAddress(userRaw);
  const market = (await discoverLlamalendMarkets()).get(controller);
  if (!market) throw new UnknownLlamalendMarketError(controller);
  const c = controller as `0x${string}`;
  const amm = market.amm as `0x${string}`;
  const at = (b: number) => {
    const key = `${controller}:${user.toLowerCase()}:${b}`;
    return cache.get(key) ?? remember(key, readAt(c, amm, user, b));
  };
  const [before, after] = await Promise.all([at(block - 1), at(block)]);
  return { controller, user: user.toLowerCase(), before, after };
}
