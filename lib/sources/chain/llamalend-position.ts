// Live LlamaLend per-position read — the soft-liquidation surface.
// ----------------------------------------------------------------------------
// The grain is (controller, user) — the isolated-market key — and the whole
// read is ONE multicall against the market's own two contracts:
//
//   Controller.user_state(user)        (collateral, stablecoin, debt, N)
//   AMM.read_user_tick_numbers(user)   (n1, n2) — SIGNED
//   AMM.get_sum_xy(user)               the converted amount's cross-check
//   AMM.A()                            amplification (immutable)
//   AMM.get_base_price()               band-grid anchor (drifts on TTL)
//   AMM.price_oracle()                 collateral in the borrowed token
//
// `user_state.stablecoin` is the figure no event carries: collateral the AMM
// has ALREADY converted for this user — soft-liquidation observed live. It is
// cross-checked against `get_sum_xy(user).x` (a second contract's answer),
// wei-exact on 130/130 measured in-soft-liq positions; the response records
// whether the identity held at THIS block.
//
// Band edges render from the EXACT integer p_oracle_up port (band-math.ts) —
// LOG_A_RATIO re-derived from A via the deployed ln_int, the solmate expWad
// path bit-for-bit — proven BigInt-exact against the AMMs' own p_oracle_up /
// p_oracle_down reads across A ∈ {10…500} and negative ticks. health =
// price_oracle ÷ pUp, two same-unit prices from the same block.
//
// ⚠️ CLOSED positions: user_state reads [0, 0, 0, N] with STALE ticks — and
// health()/user_prices() REVERT on such users. debt == 0 (or any revert in
// the read) is therefore "no live loan": ticks and band prices are NEVER
// rendered from that state.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { discoverLlamalendMarkets } from "./llamalend-markets";
import { scaleRaw } from "./erc20-meta";
import { bandPrices, scale1e18 } from "@/lib/llamalend/band-math";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";

const ZERO = BigInt(0);

const CONTROLLER_ABI = parseAbi(["function user_state(address) view returns (uint256[4])"]);
const AMM_ABI = parseAbi([
  "function read_user_tick_numbers(address) view returns (int256[2])",
  "function get_sum_xy(address) view returns (uint256[2])",
  "function A() view returns (uint256)",
  "function get_base_price() view returns (uint256)",
  "function price_oracle() view returns (uint256)",
]);

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

/** Thrown when the controller is not one the factories list — the route turns
 *  it into a 404 (a wrong address is not a chain failure). */
export class UnknownLlamalendMarketError extends Error {
  constructor(controller: string) {
    super(`not a LlamaLend controller: ${controller}`);
  }
}

function stub(controller: string, user: string): LlamalendChainResponse {
  return {
    controller,
    user,
    amm: "",
    blockNumber: 0,
    version: "v1",
    collateralSymbol: "",
    collateralDecimals: 18,
    borrowedSymbol: "",
    borrowedDecimals: 18,
    borrowedIsCrvusd: false,
    A: 0,
    hasLoan: false,
    collateral: null,
    collateralRaw: null,
    converted: null,
    convertedRaw: null,
    debt: null,
    debtRaw: null,
    bands: null,
    inSoftLiq: false,
    fullyConverted: false,
    sumXyXRaw: null,
    convertedCrossCheckExact: null,
    n1: null,
    n2: null,
    pUp: null,
    pUpRaw: null,
    pDown: null,
    pDownRaw: null,
    basePriceRaw: null,
    priceOracle: null,
    priceOracleRaw: null,
    health: null,
    chainStale: true,
  };
}

export async function loadLlamalendPositionFromChain(
  controllerRaw: string,
  userRaw: string,
): Promise<LlamalendChainResponse> {
  const controller = getAddress(controllerRaw).toLowerCase();
  const user = getAddress(userRaw); // checksummed for the calls
  const userLc = user.toLowerCase();

  // Identity from the factories' own roster — an address they never listed
  // is a 404, not a stub.
  const market = (await discoverLlamalendMarkets()).get(controller);
  if (!market) throw new UnknownLlamalendMarketError(controller);

  try {
    const client = alchemyClient();
    const amm = market.amm as `0x${string}`;
    const [blockNumber, reads] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        contracts: [
          { address: controller as `0x${string}`, abi: CONTROLLER_ABI, functionName: "user_state", args: [user] },
          { address: amm, abi: AMM_ABI, functionName: "read_user_tick_numbers", args: [user] },
          { address: amm, abi: AMM_ABI, functionName: "get_sum_xy", args: [user] },
          { address: amm, abi: AMM_ABI, functionName: "A" },
          { address: amm, abi: AMM_ABI, functionName: "get_base_price" },
          { address: amm, abi: AMM_ABI, functionName: "price_oracle" },
        ] as const,
      }) as Promise<Res[]>,
    ]);

    const base: LlamalendChainResponse = {
      ...stub(controller, userLc),
      amm: market.amm,
      version: market.version,
      collateralSymbol: market.collateralSymbol,
      collateralDecimals: market.collateralDecimals,
      borrowedSymbol: market.borrowedSymbol,
      borrowedDecimals: market.borrowedDecimals,
      borrowedIsCrvusd: market.borrowedIsCrvusd,
      A: market.A,
      blockNumber,
      chainStale: false,
    };

    const priceOracleRaw = ok<bigint>(reads[5]);
    if (priceOracleRaw != null) {
      base.priceOracle = scale1e18(priceOracleRaw);
      base.priceOracleRaw = priceOracleRaw.toString();
    }

    // A revert on the state read is "no live loan" (closed users make some
    // Controller getters revert) — never a render of stale figures.
    const userState = ok<readonly [bigint, bigint, bigint, bigint]>(reads[0]);
    if (userState == null) return base;
    const [collateralRaw, convertedRaw, debtRaw, bandsRaw] = userState;
    if (debtRaw === ZERO) return base; // closed: [0,0,0,N] + STALE ticks — render nothing

    base.hasLoan = true;
    base.collateral = scaleRaw(collateralRaw, market.collateralDecimals);
    base.collateralRaw = collateralRaw.toString();
    base.converted = scaleRaw(convertedRaw, market.borrowedDecimals);
    base.convertedRaw = convertedRaw.toString();
    base.debt = scaleRaw(debtRaw, market.borrowedDecimals);
    base.debtRaw = debtRaw.toString();
    base.bands = Number(bandsRaw);
    base.inSoftLiq = convertedRaw > ZERO;
    base.fullyConverted = convertedRaw > ZERO && collateralRaw === ZERO;

    // The cross-check: a second contract's statement of the converted amount.
    const sumXy = ok<readonly [bigint, bigint]>(reads[2]);
    if (sumXy != null) {
      base.sumXyXRaw = sumXy[0].toString();
      base.convertedCrossCheckExact = sumXy[0] === convertedRaw;
    }

    // Band geometry — the exact integer math over the same block's reads.
    const ticks = ok<readonly [bigint, bigint]>(reads[1]);
    const A = ok<bigint>(reads[3]);
    const basePriceRaw = ok<bigint>(reads[4]);
    if (ticks != null && A != null && basePriceRaw != null) {
      base.n1 = ticks[0].toString();
      base.n2 = ticks[1].toString();
      base.basePriceRaw = basePriceRaw.toString();
      try {
        const band = bandPrices(A, basePriceRaw, ticks[0], ticks[1]);
        base.pUp = scale1e18(band.pUpRaw);
        base.pUpRaw = band.pUpRaw.toString();
        base.pDown = scale1e18(band.pDownRaw);
        base.pDownRaw = band.pDownRaw.toString();
        if (base.priceOracle != null && base.pUp > 0) base.health = base.priceOracle / base.pUp;
      } catch (err) {
        // Out-of-domain ticks (never observed live) — leave the band null
        // rather than approximate.
        console.error("LlamaLend band math failed:", err);
      }
    }

    return base;
  } catch (error) {
    console.error("LlamaLend position chain read failed:", error);
    return stub(controller, userLc);
  }
}
