// SparkLend on Ethereum, for the wallet view (decision 0050, step 2). The
// listing route filtered to the wallet (one account per wallet), then, for an
// open account, the Pool read the position page makes (getUserAccountData
// through /api/chain/spark/position): the health factor, the oracle dollars
// and the block.

import { fetchSparkPositions } from "@/lib/api/fetch-spark-positions";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";
import type { SparkPositionSummary, SparkReserveAmount } from "@/lib/sources/api/spark-positions";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import {
  amountText,
  bufferFromHealth,
  hopJson,
  scaled,
  walletReadContext,
  type WalletReadContext,
} from "@/lib/wallet/read-context";

function legsText(legs: SparkReserveAmount[]): string | undefined {
  const held = legs.filter((l) => !l.decimalsUnread && l.amount > 0).sort((a, b) => b.amount - a.amount);
  if (held.length === 0) return undefined;
  return `${amountText(held[0].amount, held[0].symbol)}${held.length > 1 ? ` +${held.length - 1}` : ""}`;
}

function debtRateOf(s: SparkPositionSummary, chain: SparkPositionChainResponse): number | undefined {
  let usd = 0;
  let weighted = 0;
  for (const r of chain.reserves) {
    const amount = scaled(r.debtBalanceRaw, r.decimals);
    if (amount <= 0) continue;
    const price = s.priceByAddress?.[r.address.toLowerCase()];
    if (price == null || r.borrowApr == null) return undefined;
    usd += amount * price;
    weighted += amount * price * r.borrowApr;
  }
  return usd > 0 ? weighted / usd : undefined;
}

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const answer = await fetchSparkPositions({
    wallet: address,
    limit: 10,
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
        family: "spark",
        familyName: "SparkLend",
        positionId: s.wallet,
        href: `/ethereum/spark/${s.wallet}`,
        status,
        card: { kind: "spark", row: s },
        usdSource: "SparkLend oracle",
      };
      if (status !== "open") {
        const supply = legsText(s.peakSupplies);
        const debt = legsText(s.peakBorrows);
        return {
          ...base,
          history: {
            closedAt: s.lastActivityAt,
            size: supply || debt ? [supply ?? "nothing supplied", debt].filter(Boolean).join(" / ") : undefined,
            sizeNote: supply || debt ? "highest recorded" : undefined,
            result:
              s.liquidationCount > 0
                ? `${s.liquidationCount} ${s.liquidationCount === 1 ? "liquidation" : "liquidations"}`
                : undefined,
            txCount: s.txCount,
          },
        };
      }
      const chain = await hopJson<SparkPositionChainResponse>(c, `/api/chain/spark/position?wallet=${s.wallet}`);
      if (!chain || chain.chainStale) return base;
      const hf = chain.healthFactor;
      return {
        ...base,
        collateralUsd: chain.totalCollateralUsd,
        debtUsd: chain.totalDebtUsd,
        buffer: hf == null ? undefined : bufferFromHealth(hf),
        riskFigure: hf == null ? undefined : { value: `${hfLabelV3(hf)} HF`, label: "Health factor" },
        liquidatable: hf != null && hf < 1,
        debtRate: debtRateOf(s, chain),
        readAtBlock: chain.blockNumber,
        readAt: Math.floor(Date.now() / 1000),
      };
    }),
  );
}
