// Compound V3 on Ethereum (every Comet) and on Base, for the wallet view
// (decision 0050, step 2). The listing route filtered to the wallet, one row
// per (Comet, account), its dollars at the row's Comet prices; for an open
// row the Comet read the position page makes (the health factor and the
// contract's isLiquidatable). Arbitrum is ./arbitrum.ts.

import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import {
  amountText,
  bufferFromHealth,
  hopJson,
  walletReadContext,
  type WalletReadContext,
} from "@/lib/wallet/read-context";

type Lane = "ethereum" | "base";

const LANES: Record<Lane, { chain: 1 | 8453; route?: string; oracle: string }> = {
  ethereum: { chain: MAINNET_CHAIN_ID, oracle: "Compound V3 Comet prices" },
  // lib/compound-base/list-filter-dimensions.ts COMPOUND_BASE_POSITIONS_ROUTE
  base: { chain: BASE_CHAIN_ID, route: "/api/compound-base/positions", oracle: "Compound V3 Base Comet prices" },
};

const priceOf = (s: CompoundPositionSummary, address: string): number | undefined =>
  s.priceByAddress?.[address.toLowerCase()];

/** The row's collateral in dollars; undefined the moment one leg is unpriced. */
function collateralUsdOf(s: CompoundPositionSummary): number | undefined {
  let sum = 0;
  for (const c of s.collateral) {
    if (c.amount <= 0) continue;
    const p = priceOf(s, c.address);
    if (c.decimalsUnread || p == null) return undefined;
    sum += c.amount * p;
  }
  return sum;
}

/** The borrowed base in dollars: the live present value where the refresher
 *  has read it, else the principal. Zero for a lender. */
function debtUsdOf(s: CompoundPositionSummary): number | undefined {
  const amount = s.current ? s.current.amount : s.base.amount;
  if (amount >= 0) return 0;
  const p = priceOf(s, s.base.address);
  return p == null ? undefined : -amount * p;
}

export async function readCompoundLane(lane: Lane, address: string, ctx: WalletReadContext): Promise<WalletPosition[]> {
  const cfg = LANES[lane];
  const answer = await fetchCompoundPositions({
    wallet: address,
    limit: 50,
    route: cfg.route,
    baseUrl: ctx.hop.baseUrl,
    headers: ctx.hop.headers,
    signal: ctx.signal,
  });
  const anyOpen = answer.data.some((s) => s.status === "open" || s.status === "unread");
  // Base reads every Comet of the wallet in one call, as its position page does.
  const baseRead =
    lane === "base" && anyOpen
      ? await hopJson<CompoundWalletChainResponse>(ctx, `/api/chain/compound-base/wallet?wallet=${address}`)
      : null;
  return Promise.all(
    answer.data.map(async (s): Promise<WalletPosition> => {
      const status: WalletPositionStatus =
        s.status === "liquidated" ? "liquidated" : s.status === "closed" ? "closed" : "open";
      const href =
        lane === "ethereum"
          ? `/ethereum/compound-v3/${s.market}/${s.account}`
          : `/base/compound-v3/${s.market}/${s.account}`;
      const base: WalletPosition = {
        chain: cfg.chain,
        family: "compound-v3",
        familyName: "Compound V3",
        market: s.marketLabel,
        positionId: `${s.market}:${s.account}`,
        href,
        status,
        card: { kind: "compound-v3", lane, row: s },
        usdSource: cfg.oracle,
      };
      if (status !== "open") {
        const coll = [...s.peak.collateral].sort((a, b) => b.amount - a.amount);
        const parts = [
          coll[0]
            ? `${amountText(coll[0].amount, coll[0].symbol)}${coll.length > 1 ? ` +${coll.length - 1}` : ""}`
            : null,
          s.peak.borrowedBase > 0 ? amountText(s.peak.borrowedBase, s.base.symbol) : null,
          s.peak.lentBase > 0 && s.peak.borrowedBase === 0
            ? `${amountText(s.peak.lentBase, s.base.symbol)} lent`
            : null,
        ].filter(Boolean);
        return {
          ...base,
          history: {
            closedAt: (status === "liquidated" ? s.lastLiquidationAt : null) ?? s.lastActivityAt ?? undefined,
            size: parts.length ? parts.join(" / ") : undefined,
            sizeNote: parts.length ? "highest recorded" : undefined,
            result:
              s.liquidationCount > 0
                ? `${s.liquidationCount} ${s.liquidationCount === 1 ? "absorb" : "absorbs"}`
                : undefined,
            txCount: s.txCount,
          },
        };
      }
      const live =
        lane === "ethereum"
          ? await hopJson<CompoundMarketChainResponse>(
              ctx,
              `/api/chain/compound/position?${new URLSearchParams({ wallet: s.account, market: s.market })}`,
            )
          : (baseRead?.positions.find((p) => p.comet.toLowerCase() === s.comet.toLowerCase()) ?? null);
      const debtUsd = debtUsdOf(s);
      const hf = live && !live.chainStale ? live.healthFactor : null;
      return {
        ...base,
        collateralUsd: collateralUsdOf(s),
        debtUsd,
        buffer: bufferFromHealth(hf),
        riskFigure:
          hf != null ? { value: `${hf >= 100 ? ">100" : hf.toFixed(2)} HF`, label: "Health factor" } : undefined,
        liquidatable: live && !live.chainStale ? live.isLiquidatable : undefined,
        debtRate: live && !live.chainStale && (debtUsd ?? 0) > 0 ? live.borrowApr : undefined,
        readAtBlock: live && !live.chainStale ? live.blockNumber : (s.current?.block ?? undefined),
        readAt: live && !live.chainStale ? Math.floor(Date.now() / 1000) : undefined,
      };
    }),
  );
}

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  return readCompoundLane("ethereum", address, ctx ?? (await walletReadContext()));
}

export async function readWalletPositionsBase(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  return readCompoundLane("base", address, ctx ?? (await walletReadContext()));
}
