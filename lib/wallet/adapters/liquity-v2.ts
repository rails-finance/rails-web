// Liquity V2 on Ethereum, for the wallet view (decision 0050, step 2). The
// Trove listing filtered to the owner (a closed Trove answers to its last
// owner), and the branch prices the listing side-fetches
// (/api/oracle/liquity-v2): the collateral's dollars, the collateral ratio
// with BOLD at one dollar as the card states it, and the branch's MCR.

import { fetchTroves } from "@/lib/api/fetch-troves";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { branchMcr } from "@/lib/liquity/event-safety";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import { amountText, hopJson, walletReadContext, type WalletReadContext } from "@/lib/wallet/read-context";

const priceOf = (type: string, p: OraclePricesData | null): number | undefined => {
  if (!p) return undefined;
  const key = type.toLowerCase() as keyof OraclePricesData;
  return p[key] ?? undefined;
};

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const [answer, oracle] = await Promise.all([
    fetchTroves({
      ownerAddress: address,
      limit: 100,
      baseUrl: c.hop.baseUrl,
      headers: c.hop.headers,
      signal: c.signal,
    }),
    hopJson<OraclePricesResponse>(c, "/api/oracle/liquity-v2"),
  ]);
  const prices = oracle?.success && oracle.data ? oracle.data : null;
  return answer.data.map((t): WalletPosition => {
    const status: WalletPositionStatus = t.status;
    const base: WalletPosition = {
      chain: MAINNET_CHAIN_ID,
      family: "liquity-v2",
      familyName: "Liquity V2",
      market: `${t.collateralType} Trove`,
      positionId: t.id,
      href: `/ethereum/liquity-v2/trove/${t.collateralType}/${t.id}`,
      status,
      card: { kind: "liquity-v2", row: t, prices },
      usdSource: "Liquity V2 price feed",
    };
    const txCount = Number(t.activity.transactionCount) - t.activity.redemptionCount;
    if (status !== "open") {
      const parts = [
        t.collateral.peakAmount > 0 ? amountText(t.collateral.peakAmount, t.collateral.symbol) : null,
        t.debt.peak > 0 ? amountText(t.debt.peak, t.assetType) : null,
      ].filter(Boolean);
      const r = t.activity.redemptionCount;
      return {
        ...base,
        history: {
          closedAt: t.activity.lastActivityAt,
          openedAt: t.activity.createdAt,
          size: parts.length ? parts.join(" / ") : undefined,
          sizeNote: parts.length ? "highest recorded" : undefined,
          result: r > 0 ? `${r} ${r === 1 ? "redemption" : "redemptions"}` : undefined,
          txCount: Number.isFinite(txCount) ? txCount : undefined,
        },
      };
    }
    const price = priceOf(t.collateralType, prices);
    const collateralUsd = price != null ? t.collateral.amount * price : undefined;
    const cr = collateralUsd != null && t.debt.current > 0 ? collateralUsd / t.debt.current : undefined;
    const mcr = branchMcr(t.collateralType);
    return {
      ...base,
      collateralUsd,
      debtUsd: t.debt.current,
      buffer: cr != null && mcr != null ? 1 - mcr / cr : undefined,
      riskFigure:
        cr != null
          ? {
              value: `${(cr * 100).toFixed(1)}% CR`,
              label: mcr != null ? `liquidates below ${(mcr * 100).toFixed(0)}%` : "Collateral ratio",
            }
          : undefined,
      liquidatable: cr != null && mcr != null ? cr < mcr : undefined,
      debtRate: t.debt.current > 0 ? t.metrics.interestRate / 100 : undefined,
    };
  });
}
