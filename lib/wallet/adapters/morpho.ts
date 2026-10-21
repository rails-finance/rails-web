// Morpho Blue on Ethereum, for the wallet view (decision 0050, step 2). The
// listing route filtered to the borrower (one row per market), then, for an
// open row with debt, the singleton read the position page makes: LTV against
// the market's LLTV at its own oracle. Morpho states no dollars on Ethereum,
// so its positions add nothing to the tiles' sums. Arbitrum is ./arbitrum.ts.

import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import { amountText, hopJson, walletReadContext, type WalletReadContext } from "@/lib/wallet/read-context";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const answer = await fetchMorphoPositions({
    user: address,
    limit: 100,
    baseUrl: c.hop.baseUrl,
    headers: c.hop.headers,
    signal: c.signal,
  });
  return Promise.all(
    answer.data.map(async (s): Promise<WalletPosition> => {
      const status: WalletPositionStatus =
        s.status === "liquidated" ? "liquidated" : s.status === "closed" ? "closed" : "open";
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "morpho",
        familyName: "Morpho Blue",
        market: s.marketLabel,
        positionId: s.positionId,
        href: `/ethereum/morpho/${encodeURIComponent(s.positionId)}`,
        status,
        card: { kind: "morpho", row: s },
      };
      if (status !== "open") {
        const parts = [
          s.peak.collateral > 0 ? amountText(s.peak.collateral, s.collateralSymbol) : null,
          s.peak.borrowed > 0 ? amountText(s.peak.borrowed, s.loanSymbol) : null,
        ].filter(Boolean);
        return {
          ...base,
          history: {
            closedAt: s.activity.lastTs ?? undefined,
            size: parts.length ? parts.join(" / ") : undefined,
            sizeNote: parts.length ? "highest recorded" : undefined,
            result: s.badDebt > 0 ? `${amountText(s.badDebt, s.loanSymbol)} bad debt` : undefined,
            txCount: s.activity.txCount,
          },
        };
      }
      const owes = (s.currentDebt?.amount ?? s.borrowed.amount) > 0;
      if (!owes || s.isIdle) return base;
      const live = await hopJson<MorphoChainPositionResponse>(
        c,
        `/api/chain/morpho/position?${new URLSearchParams({ market: s.marketId, user: address })}`,
      );
      if (!live || live.chainStale || live.ltv == null) return base;
      return {
        ...base,
        buffer: live.lltv > 0 ? 1 - live.ltv / live.lltv : undefined,
        riskFigure: { value: `${pct(live.ltv)} LTV`, label: `LLTV ${pct(live.lltv)}` },
        liquidatable: live.healthy === false,
        debtRate: live.borrowApr,
        readAtBlock: live.blockNumber,
        readAt: live.timestamp,
      };
    }),
  );
}
