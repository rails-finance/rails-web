// Aave V3, Compound V3 and Morpho Blue on Arbitrum, for the wallet view
// (decision 0050, step 2). Each family's store row for the wallet
// (GET /api/<family>/positions?wallet=, the stored read of its last visit),
// and nothing else: a wallet the lane has not visited has no row, and the page
// shows none (no head-state probe in this step). A row whose read found
// nothing held is a History row: the store does not say how it ended.

import {
  AAVE_V3_ARBITRUM_API_PREFIX,
  readPositionsAnswer as readAaveAnswer,
} from "@/lib/aave-v3-arbitrum/api-contract";
import {
  COMPOUND_ARBITRUM_API_PREFIX,
  readPositionsAnswer as readCompoundAnswer,
} from "@/lib/compound-arbitrum/api-contract";
import {
  MORPHO_ARBITRUM_API_PREFIX,
  readPositionsAnswer as readMorphoAnswer,
} from "@/lib/morpho-arbitrum/api-contract";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref } from "@/lib/compound-arbitrum/routes";
import { expandCards } from "@/lib/compound-arbitrum/comet-cards";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { ARBITRUM_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { ArbitrumReadRow } from "@/components/shared/arbitrum-positions-listing";
import type { WalletPosition } from "@/lib/wallet/types";
import {
  boxJson,
  bufferFromHealth,
  isoSeconds,
  walletReadContext,
  type WalletReadContext,
} from "@/lib/wallet/read-context";

const stamp = (row: ArbitrumReadRow) => ({
  readAtBlock: row.blockNumber ?? undefined,
  readAt: isoSeconds(row.refreshedAt),
});

/** A stored read that found nothing held: one History row. */
function closedRow(
  row: ArbitrumReadRow,
  base: Omit<WalletPosition, "status" | "history">,
  visitedAt: string | null,
): WalletPosition {
  return {
    ...base,
    status: "closed",
    ...stamp(row),
    history: {
      closedAt: isoSeconds(visitedAt) ?? isoSeconds(row.refreshedAt),
      resultNote: "nothing held at the last stored read",
      txCount: row.txCount ?? undefined,
    },
  };
}

export async function readAaveV3Arbitrum(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const raw = await boxJson(c, `${AAVE_V3_ARBITRUM_API_PREFIX}/positions?wallet=${address}`);
  const answer = readAaveAnswer(raw);
  if (!answer) throw new Error("answered outside the contract");
  // The single borrowed reserve's rate, where the stored row lists reserves.
  const reserves = ((raw as { rows?: { reserves?: { hasBorrow?: boolean; borrowApr?: number }[] }[] }).rows?.[0]
    ?.reserves ?? []) as { hasBorrow?: boolean; borrowApr?: number }[];
  const borrowed = reserves.filter((r) => r.hasBorrow);
  return answer.rows.map((r): WalletPosition => {
    const row = r as ArbitrumReadRow;
    const base = {
      chain: ARBITRUM_CHAIN_ID as ChainId,
      family: "aave-v3",
      familyName: "Aave V3",
      positionId: r.wallet,
      href: `/arbitrum/aave-v3/${r.wallet}`,
      card: { kind: "aave-v3-arbitrum" as const, row },
      usdSource: "Aave V3 Arbitrum oracle",
    };
    if (r.chainOpen !== true) return closedRow(row, base, r.lastVisitedAt);
    const hf = r.healthFactor;
    return {
      ...base,
      status: "open",
      collateralUsd: r.totalCollateralUsd ?? undefined,
      debtUsd: r.totalDebtUsd ?? undefined,
      buffer: hf == null ? undefined : bufferFromHealth(hf),
      riskFigure: hf == null ? undefined : { value: `${hfLabelV3(hf)} HF`, label: "Health factor" },
      liquidatable: hf != null && hf < 1,
      debtRate: borrowed.length === 1 ? borrowed[0].borrowApr : undefined,
      ...stamp(row),
    };
  });
}

export async function readCompoundV3Arbitrum(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const answer = readCompoundAnswer(await boxJson(c, `${COMPOUND_ARBITRUM_API_PREFIX}/positions?wallet=${address}`));
  if (!answer) throw new Error("answered outside the contract");
  const out: WalletPosition[] = [];
  for (const r of answer.rows) {
    const row = r as ArbitrumReadRow;
    const base = {
      chain: ARBITRUM_CHAIN_ID as ChainId,
      family: "compound-v3",
      familyName: "Compound V3",
      usdSource: "Compound V3 Arbitrum Comet prices",
    };
    if (r.chainOpen !== true) {
      out.push(
        closedRow(
          row,
          {
            ...base,
            positionId: r.wallet,
            href: `/arbitrum/compound-v3/${r.wallet}`,
            card: { kind: "compound-v3-arbitrum", row },
          },
          r.lastVisitedAt,
        ),
      );
      continue;
    }
    for (const card of expandCards([row], COMPOUND_ARBITRUM_DEPLOYMENT.markets)) {
      const comet = card.comet;
      if (!comet) continue;
      const m = comet.market;
      const roster = COMPOUND_ARBITRUM_DEPLOYMENT.markets.find((x) => x.comet.toLowerCase() === m.comet);
      // Comet's liquidation line: each collateral's dollars at the Comet's
      // price, times its liquidateCollateralFactor (the roster as getAssetInfo
      // answered it).
      let capacity: number | undefined = 0;
      for (const leg of m.collateral) {
        if (BigInt(leg.amount) === BigInt(0)) continue;
        const f = roster?.collateral?.find((a) => a.asset.toLowerCase() === leg.asset)?.liquidateCollateralFactor;
        if (leg.usd == null || f == null) {
          capacity = undefined;
          break;
        }
        capacity += leg.usd * f;
      }
      const debt = m.borrowUsd ?? undefined;
      const hf = capacity != null && debt != null && debt > 0 ? capacity / debt : null;
      out.push({
        ...base,
        market: comet.label,
        positionId: `${m.comet}:${r.wallet}`,
        href: comet.key ? compoundArbitrumMarketHref(comet.key, r.wallet) : `/arbitrum/compound-v3/${r.wallet}`,
        status: "open",
        card: { kind: "compound-v3-arbitrum", row, comet },
        collateralUsd: m.collateralUsd ?? undefined,
        debtUsd: debt,
        buffer: bufferFromHealth(hf),
        riskFigure:
          hf != null ? { value: `${hf >= 100 ? ">100" : hf.toFixed(2)} HF`, label: "Health factor" } : undefined,
        liquidatable: m.isLiquidatable,
        ...stamp(row),
      });
    }
  }
  return out;
}

export async function readMorphoArbitrum(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const answer = readMorphoAnswer(await boxJson(c, `${MORPHO_ARBITRUM_API_PREFIX}/positions?wallet=${address}`));
  if (!answer) throw new Error("answered outside the contract");
  return answer.rows.map((r): WalletPosition => {
    const row = r as ArbitrumReadRow;
    const base = {
      chain: ARBITRUM_CHAIN_ID as ChainId,
      family: "morpho",
      familyName: "Morpho Blue",
      positionId: r.wallet,
      href: `/arbitrum/morpho/${r.wallet}`,
      card: { kind: "morpho-arbitrum" as const, row },
      usdSource: "Aave V3 Arbitrum oracle",
    };
    if (r.chainOpen !== true) return closedRow(row, base, r.lastVisitedAt);
    return {
      ...base,
      status: "open",
      collateralUsd: r.totalCollateralUsd ?? undefined,
      debtUsd: r.totalDebtUsd ?? undefined,
      ...stamp(row),
    };
  });
}
