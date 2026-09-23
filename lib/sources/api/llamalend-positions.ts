// LlamaLend positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/llamalend/positions) does the structural work —
// filter, sort, paginate over mv_llamalend_positions at the (controller, user)
// grain — and returns the page slice as raw per-position rows: MARKET IDENTITY
// ON THE ROW (the backend's factory-seeded llamalend_markets table — version,
// factory, A, token identities with chain-read decimals), the LAST emitted
// UserState absolutes (the reducer is a lag over emitted absolutes, never a
// running sum), and lifecycle scalars. ⚠️ `collateralRaw: null` means THE
// CHAIN DID NOT STATE IT (the deployed controller logs a 2^256−1 sentinel on
// the underwater partial-repay path; the backend NULLs it) — rendered as
// unstated, never zero. `n1` is null on closed rows by design (stale ticks
// never render).
//
// This builder layers the LIVE chain state on top:
//   • ONE multicall of `user_state(user)` over the page's OPEN rows — the
//     per-position soft-liq overlay: live collateral / debt AND the converted
//     amount (`stablecoin`), which lives in NO event and is deliberately NOT
//     in the API. O(page), zero-index.
//   • each market's AMM `price_oracle` (for the crvUSD-borrowed markets' USD
//     figures), from the cached factory discovery.
// When RPC is down the rows degrade to the MV absolutes (converted stays
// null — "unknown", never zero).
//
// THE GRAIN IS THE PAIR: one row per (controller, user), never per user —
// controllers are isolated markets liquidated independently, and a per-user
// row would assert one health across markets that share nothing.
//
// ⚠️ USD only where the borrowed token IS crvUSD (~$1); the non-crvUSD-
// borrowed markets (WETH / tBTC / ynETH) present in their own token, and
// their usd fields stay null.
//
// STATUS IS TWO-AXIS: `status` is the lifecycle (open / closed / liquidated —
// 'liquidated' names only a CLOSED position), and `everLiquidated` is the
// orthogonal flag on open survivors too (self-liquidations counted apart).

import { parseAbi } from "viem";
import { alchemyClient } from "@/lib/sources/chain/rpc";
import { scaleRaw } from "@/lib/sources/chain/erc20-meta";
import { resolveLlamalendMarketState, type LlamalendMarketStateMap } from "@/lib/sources/chain/llamalend-markets";
import { marketPairLabel, LLAMALEND_ADDRESSES, type LlamalendVersion } from "@/lib/llamalend/asset-catalog";

export type LlamalendPositionStatus = "open" | "closed" | "liquidated";
// Mirrors the rails route's sortBy allowlist (mig 187's debt_usd/collateral_usd
// on mv_llamalend_positions). "lastActivity" was the prior shape — grepped
// with no caller (llamalendFiltersToFetchParams never set it), so this is a
// rename, not a widening.
export type LlamalendPositionSort = "recent" | "debt" | "coll";

const ZERO = BigInt(0);
const CONTROLLER_ABI = parseAbi(["function user_state(address) view returns (uint256[4])"]);
type Res = { status: string; result?: unknown };

export interface LlamalendPositionSummary {
  /** The isolated market's key. */
  controller: string;
  user: string;
  /** The market's LLAMMA AMM (for receipts/links). */
  amm: string | null;
  version: LlamalendVersion;
  /** "wstETH / crvUSD" — display; the controller address is the key. */
  marketLabel: string;
  collateralSymbol: string;
  collateralDecimals: number;
  borrowedSymbol: string;
  borrowedDecimals: number;
  borrowedIsCrvusd: boolean;

  /** Lifecycle only: 'liquidated' = a CLOSED position that ended in a hard
   *  liquidation. */
  status: LlamalendPositionStatus;
  /** The orthogonal hard-liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  liquidationCount: number;
  selfLiquidationCount: number;

  /** Collateral still held as collateral (collateral-token units) — the live
   *  user_state read when it landed, the last emitted absolute otherwise.
   *  ⚠️ NULL = the chain did not state it (sentinel path) — never zero. */
  collateral: number | null;
  collateralRaw: string | null;
  /** Debt (borrowed-token units) — same basis rule. */
  debt: number;
  debtRaw: string;
  /** Which basis the two figures above carry: "chain" = user_state at head;
   *  "index" = the last emitted UserState absolute. */
  stateBasis: "chain" | "index";

  /** ⇒ Converted amount (borrowed-token units) — collateral the AMM has
   *  already converted: > 0 = in soft-liquidation NOW. Chain-only (no event
   *  carries it; the API deliberately omits it); NULL when the overlay read
   *  didn't land — unknown, not 0. */
  converted: number | null;
  convertedRaw: string | null;
  /** converted > 0 on a live loan; null when unknown. */
  inSoftLiq: boolean | null;

  /** AMM.price_oracle() at head — collateral in the borrowed token. */
  priceOracle: number | null;
  /** USD figures — ONLY on crvUSD-borrowed markets (~$1); null elsewhere. */
  collateralUsd: number | null;
  debtUsd: number | null;

  eventCount: number;
  txCount: number;
  firstActivityAt: number | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
}

/** One position's page-slice row exactly as the rails route returns it
 *  (pre-presentation; bigint columns arrive as strings from pg). */
export interface RawLlamalendPositionRow {
  controller: string;
  user: string;
  market: {
    version: number;
    factory: string;
    factoryIndex: number;
    amm: string;
    A: number;
    collateral: { token: string; symbol: string; decimals: number };
    borrowed: { token: string; symbol: string; decimals: number };
  };
  status: string;
  isOpen: boolean;
  everLiquidated: boolean;
  /** ⚠️ null = the chain did not state it (2^256−1 sentinel, NULLed
   *  backend-side) — never zero. */
  collateralRaw: string | null;
  /** V2 only. */
  borrowedRaw: string | null;
  debtRaw: string;
  /** null on closed positions by design (ticks go stale there). */
  n1: number | null;
  n2: number | null;
  stateBlock: number | null;
  snapshotBlock: number | null;
  eventCount: number;
  txCount: number;
  liquidationCount: number;
  selfLiquidationCount: number;
  lastLiquidationAt: number | null;
  firstActivityAt: number | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
}

function bigintOf(raw: string | null | undefined): bigint | null {
  if (raw == null || raw === "") return null;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return null;
  }
}

function statusOf(s: string): LlamalendPositionStatus {
  return s === "open" || s === "liquidated" ? s : "closed";
}

/**
 * Assemble the listing rows from the rails route's raw page slice. Filtering,
 * sorting and pagination already happened server-side — order is preserved.
 * `stateMap` is injectable for the proxy to share one resolution per request.
 */
export async function buildLlamalendPositionRows(
  raw: RawLlamalendPositionRow[],
  stateMap?: LlamalendMarketStateMap,
): Promise<LlamalendPositionSummary[]> {
  // The AMM oracle prices (per controller) for the USD figures — identity
  // itself now rides on the rows.
  let state: LlamalendMarketStateMap = new Map();
  if (stateMap) state = stateMap;
  else if (raw.length > 0) {
    try {
      state = (await resolveLlamalendMarketState()).state;
    } catch {
      // Prices stay null; token identity is on the rows.
    }
  }

  // The per-position soft-liq overlay: ONE multicall of user_state over the
  // open rows. O(page slice), zero-index.
  const openRows = raw.filter((r) => statusOf(r.status) === "open");
  let liveStates = new Map<string, readonly [bigint, bigint, bigint, bigint]>();
  if (openRows.length > 0) {
    try {
      const client = alchemyClient();
      const results = (await client.multicall({
        allowFailure: true,
        contracts: openRows.map(
          (r) =>
            ({
              address: r.controller.toLowerCase() as `0x${string}`,
              abi: CONTROLLER_ABI,
              functionName: "user_state",
              args: [r.user as `0x${string}`],
            }) as const,
        ),
      })) as Res[];
      liveStates = new Map(
        openRows.flatMap((r, i) => {
          const res = results[i];
          return res?.status === "success" && res.result != null
            ? [
                [
                  `${r.controller.toLowerCase()}:${r.user.toLowerCase()}`,
                  res.result as readonly [bigint, bigint, bigint, bigint],
                ] as const,
              ]
            : [];
        }),
      );
    } catch (error) {
      // RPC down — every row degrades to the MV absolutes; converted stays
      // null (unknown), never zero.
      console.error("LlamaLend listing overlay failed:", error);
    }
  }

  return raw.map((r) => {
    const controller = r.controller.toLowerCase();
    const user = r.user.toLowerCase();
    const mk = r.market;
    const collateralDecimals = mk.collateral.decimals;
    const borrowedDecimals = mk.borrowed.decimals;
    const isCrvusd = mk.borrowed.token.toLowerCase() === LLAMALEND_ADDRESSES.CRVUSD;
    const status = statusOf(r.status);

    const live = liveStates.get(`${controller}:${user}`);
    // A live loan whose head-state debt reads zero closed since the index's
    // last event — keep the MV lifecycle (the backend refresh will catch up)
    // but don't render zero live figures over the emitted absolutes.
    const useLive = live != null && status === "open" && live[2] > ZERO;
    // ⚠️ collateralRaw null = the chain did not state it — stays null unless
    // the live read (which always states it) landed.
    const collateralRaw = useLive ? live[0] : bigintOf(r.collateralRaw);
    const debtRaw = useLive ? live[2] : (bigintOf(r.debtRaw) ?? ZERO);
    const convertedRaw = useLive ? live[1] : null;

    const collateral = collateralRaw != null ? scaleRaw(collateralRaw, collateralDecimals) : null;
    const debt = scaleRaw(debtRaw, borrowedDecimals);
    const converted = convertedRaw != null ? scaleRaw(convertedRaw, borrowedDecimals) : null;

    const priceOracle = state.get(controller)?.priceOracle ?? null;

    return {
      controller,
      user,
      amm: mk.amm ? mk.amm.toLowerCase() : (state.get(controller)?.amm ?? null),
      version: (mk.version === 2 ? "v2" : "v1") as LlamalendVersion,
      marketLabel: marketPairLabel(mk.collateral.symbol, mk.borrowed.symbol),
      collateralSymbol: mk.collateral.symbol,
      collateralDecimals,
      borrowedSymbol: mk.borrowed.symbol,
      borrowedDecimals,
      borrowedIsCrvusd: isCrvusd,
      status,
      everLiquidated: !!r.everLiquidated,
      liquidationCount: r.liquidationCount,
      selfLiquidationCount: r.selfLiquidationCount ?? 0,
      collateral,
      collateralRaw: collateralRaw != null ? collateralRaw.toString() : null,
      debt,
      debtRaw: debtRaw.toString(),
      stateBasis: useLive ? "chain" : "index",
      converted,
      convertedRaw: convertedRaw != null ? convertedRaw.toString() : null,
      inSoftLiq: converted != null ? converted > 0 && debt > 0 : null,
      priceOracle,
      // ~$1: crvUSD debt IS the USD figure; collateral through the AMM's own
      // oracle. Null on the non-crvUSD-borrowed markets — their own token is
      // the unit, and no dollar is asserted.
      collateralUsd: isCrvusd && priceOracle != null && collateral != null ? collateral * priceOracle : null,
      debtUsd: isCrvusd ? debt : null,
      eventCount: r.eventCount,
      txCount: r.txCount,
      firstActivityAt: r.firstActivityAt ?? null,
      lastActivityAt: r.lastActivityAt,
      lastBlockNumber: r.lastBlockNumber,
      lastTxHash: r.lastTxHash,
    };
  });
}
