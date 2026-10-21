// Aave V3 on Ethereum and on Base, for the wallet view (decision 0050, step 2).
// The listing route filtered to the wallet (one row per market), then, for an
// open row, the Pool read the position page makes (getUserAccountData through
// /api/chain/aave-v3[-base]/position): the health factor, the oracle dollars
// and the block. Arbitrum is ./arbitrum.ts.

import {
  fetchAaveV3Positions,
  type AaveV3PositionRow,
  type AaveV3ReserveSummary,
} from "@/lib/api/fetch-aave-v3-positions";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import { MARKET_NAME } from "@/lib/aave-v3/asset-catalog";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import {
  amountText,
  bufferFromHealth,
  hopJson,
  scaled,
  walletReadContext,
  type WalletReadContext,
} from "@/lib/wallet/read-context";

type Lane = "ethereum" | "base";

const LANES: Record<Lane, { chain: 1 | 8453; route?: string; chainRoute: string; oracle: string }> = {
  ethereum: {
    chain: MAINNET_CHAIN_ID,
    chainRoute: "/api/chain/aave-v3/position",
    oracle: "Aave V3 oracle",
  },
  base: {
    chain: BASE_CHAIN_ID,
    // lib/aave-v3-base/list-filter-dimensions.ts AAVE_V3_BASE_POSITIONS_ROUTE
    route: "/api/aave-v3-base/positions",
    chainRoute: "/api/chain/aave-v3-base/position",
    oracle: "Aave V3 Base oracle",
  },
};

/** "76.1 WETH +2": the largest reserve by amount and how many more. */
export function reservesText(reserves: AaveV3ReserveSummary[], side: "supply" | "debt"): string | undefined {
  const legs = reserves
    .map((r) => ({
      symbol: r.symbol,
      amount: r.decimalsUnread ? 0 : scaled(side === "supply" ? r.supplyBalanceRaw : r.debtBalanceRaw, r.decimals),
    }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (legs.length === 0) return undefined;
  return `${amountText(legs[0].amount, legs[0].symbol)}${legs.length > 1 ? ` +${legs.length - 1}` : ""}`;
}

/** The listing row's dollars where the Pool read is missing: every reserve at
 *  the row's oracle prices, undefined the moment one is unpriced. */
function rowUsd(row: AaveV3PositionRow, side: "supply" | "debt"): number | undefined {
  let sum = 0;
  for (const r of row.reserves) {
    const amount = scaled(side === "supply" ? r.supplyBalanceRaw : r.debtBalanceRaw, r.decimals);
    if (amount <= 0) continue;
    const price = row.priceByAddress?.[r.address.toLowerCase()];
    if (r.decimalsUnread || price == null) return undefined;
    sum += amount * price;
  }
  return sum;
}

function debtRateOf(row: AaveV3PositionRow, chain: AaveV3PositionChainResponse): number | undefined {
  let usd = 0;
  let weighted = 0;
  for (const r of chain.reserves) {
    const amount = scaled(r.debtBalanceRaw, r.decimals);
    if (amount <= 0) continue;
    const price = row.priceByAddress?.[r.address.toLowerCase()];
    if (price == null || r.borrowApr == null) return undefined;
    usd += amount * price;
    weighted += amount * price * r.borrowApr;
  }
  return usd > 0 ? weighted / usd : undefined;
}

export async function readAaveV3Lane(lane: Lane, address: string, ctx: WalletReadContext): Promise<WalletPosition[]> {
  const cfg = LANES[lane];
  const answer = await fetchAaveV3Positions({
    wallet: address,
    limit: 50,
    route: cfg.route,
    baseUrl: ctx.hop.baseUrl,
    headers: ctx.hop.headers,
    signal: ctx.signal,
  });
  return Promise.all(
    answer.rows.map(async (row): Promise<WalletPosition> => {
      const status: WalletPositionStatus =
        row.status === "liquidated" ? "liquidated" : row.status === "closed" ? "closed" : "open";
      const market = lane === "ethereum" ? (MARKET_NAME[row.market] ?? row.market) : undefined;
      const href =
        lane === "ethereum" ? `/ethereum/aave-v3/${row.wallet}?market=${row.market}` : `/base/aave-v3/${row.wallet}`;
      const base: WalletPosition = {
        chain: cfg.chain,
        family: "aave-v3",
        familyName: "Aave V3",
        market,
        positionId: lane === "ethereum" ? `${row.wallet}:${row.market}` : row.wallet,
        href,
        status,
        card: { kind: "aave-v3", lane, row },
        usdSource: cfg.oracle,
        readAtBlock: row.chainBlock ?? undefined,
      };
      if (status !== "open") {
        const supply = reservesText(row.peakReserves, "supply");
        const debt = reservesText(row.peakReserves, "debt");
        return {
          ...base,
          history: {
            closedAt: (status === "liquidated" ? row.lastLiquidationAt : null) ?? row.lastActivityAt,
            size: supply || debt ? [supply ?? "nothing supplied", debt].filter(Boolean).join(" / ") : undefined,
            sizeNote: supply || debt ? "highest recorded" : undefined,
            result:
              row.liquidationCount > 0
                ? `${row.liquidationCount} ${row.liquidationCount === 1 ? "liquidation" : "liquidations"}`
                : undefined,
            txCount: row.txCount,
          },
        };
      }
      const q = new URLSearchParams({ wallet: row.wallet });
      if (lane === "ethereum") q.set("market", row.market);
      const chain = await hopJson<AaveV3PositionChainResponse>(ctx, `${cfg.chainRoute}?${q}`);
      if (!chain || chain.chainStale) {
        return { ...base, collateralUsd: rowUsd(row, "supply"), debtUsd: rowUsd(row, "debt") };
      }
      const hf = chain.healthFactor;
      return {
        ...base,
        collateralUsd: chain.totalCollateralUsd,
        debtUsd: chain.totalDebtUsd,
        buffer: hf == null ? undefined : bufferFromHealth(hf),
        riskFigure: hf == null ? undefined : { value: `${hfLabelV3(hf)} HF`, label: "Health factor" },
        liquidatable: hf != null && hf < 1,
        debtRate: debtRateOf(row, chain),
        readAtBlock: chain.blockNumber,
        readAt: Math.floor(Date.now() / 1000),
      };
    }),
  );
}

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  return readAaveV3Lane("ethereum", address, ctx ?? (await walletReadContext()));
}

export async function readWalletPositionsBase(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  return readAaveV3Lane("base", address, ctx ?? (await walletReadContext()));
}
