// Aave V3, Compound V3 and Morpho Blue on Arbitrum, for the wallet view
// (decision 0050, step 3; SERVER-ONLY). The summary row's card is the
// family's GET /api/<family>/positions?wallet= row, the stored read of the
// wallet's last visit, and every figure is that read's: no head read here
// (the probe for unvisited wallets is step 4). A read that found nothing held
// is a History row; the store does not say how it ended.

import { readPositionsAnswer as readAaveAnswer } from "@/lib/aave-v3-arbitrum/api-contract";
import { readPositionsAnswer as readCompoundAnswer } from "@/lib/compound-arbitrum/api-contract";
import { readPositionsAnswer as readMorphoAnswer } from "@/lib/morpho-arbitrum/api-contract";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref } from "@/lib/compound-arbitrum/routes";
import { expandCards } from "@/lib/compound-arbitrum/comet-cards";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { ARBITRUM_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { ArbitrumReadRow } from "@/components/shared/arbitrum-positions-listing";
import type { WalletPosition } from "@/lib/wallet/types";
import { bufferFromHealth, isoSeconds, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { FamilyModule } from "./module";

/** The contract reader of each family over the summary rows' cards, each
 *  card beside its summary row (one row per wallet on this lane). */
function rowsOf(
  rows: WalletSummaryRow[],
  read: (raw: unknown) => { rows: unknown[] } | null,
): { row: ArbitrumReadRow; r: WalletSummaryRow }[] {
  const answer = read({ rows: rows.map((r) => r.card), total: rows.length });
  if (!answer) throw new Error("the stored rows answered outside the contract");
  const byWallet = new Map(rows.map((r) => [r.owner, r]));
  return (answer.rows as ArbitrumReadRow[]).flatMap((row) => {
    const r = byWallet.get(row.wallet.toLowerCase());
    return r ? [{ row, r }] : [];
  });
}

function closedRow(
  row: ArbitrumReadRow,
  base: Omit<WalletPosition, "status" | "history" | "headRead">,
): WalletPosition {
  return {
    ...base,
    status: "closed",
    headRead: "none",
    readAtBlock: row.blockNumber ?? undefined,
    readAt: isoSeconds(row.refreshedAt),
    history: {
      closedAt: isoSeconds(row.lastVisitedAt) ?? isoSeconds(row.refreshedAt),
      resultNote: "nothing held at the last stored read",
      txCount: row.txCount ?? undefined,
    },
  };
}

const stamp = (row: ArbitrumReadRow) => ({
  readAtBlock: row.blockNumber ?? undefined,
  readAt: isoSeconds(row.refreshedAt),
});

export const aaveV3Arbitrum: FamilyModule = {
  id: "aave-v3-arbitrum",
  name: "Aave V3",
  chain: ARBITRUM_CHAIN_ID,
  summaryChain: "arbitrum",
  summaryFamily: "aave-v3",
  async shape(summary) {
    return rowsOf(summary, readAaveAnswer).map(({ row, r }): WalletPosition => {
      const raw = r.card as { reserves?: { hasBorrow?: boolean; borrowApr?: number }[] };
      const borrowed = (raw.reserves ?? []).filter((x) => x.hasBorrow);
      const base = {
        chain: ARBITRUM_CHAIN_ID as ChainId,
        family: "aave-v3",
        familyName: "Aave V3",
        positionId: r.positionId,
        href: r.href,
        card: { kind: "aave-v3-arbitrum" as const, row },
        usdSource: r.usdSource ?? "Aave V3 Arbitrum oracle at the visit's read",
      };
      if (r.status !== "open") return closedRow(row, base);
      const hf = row.healthFactor;
      return {
        ...base,
        status: "open",
        collateralUsd: row.totalCollateralUsd ?? undefined,
        debtUsd: row.totalDebtUsd ?? undefined,
        usdOwnOracle: true,
        buffer: hf == null ? undefined : bufferFromHealth(hf),
        riskFigure: hf == null ? undefined : { value: `${hfLabelV3(hf)} HF`, label: "Health factor" },
        liquidatable: hf != null && hf < 1,
        debtRate: borrowed.length === 1 ? borrowed[0].borrowApr : undefined,
        headRead: "stored",
        ...stamp(row),
      };
    });
  },
};

export const compoundV3Arbitrum: FamilyModule = {
  id: "compound-v3-arbitrum",
  name: "Compound V3",
  chain: ARBITRUM_CHAIN_ID,
  summaryChain: "arbitrum",
  summaryFamily: "compound-v3",
  async shape(summary) {
    const out: WalletPosition[] = [];
    rowsOf(summary, readCompoundAnswer).forEach(({ row, r }) => {
      const base = {
        chain: ARBITRUM_CHAIN_ID as ChainId,
        family: "compound-v3",
        familyName: "Compound V3",
        usdSource: r.usdSource ?? "Compound V3 Arbitrum Comet prices at the visit's read",
      };
      if (r.status !== "open") {
        out.push(
          closedRow(row, {
            ...base,
            positionId: r.positionId,
            href: r.href,
            card: { kind: "compound-v3-arbitrum", row },
          }),
        );
        return;
      }
      for (const card of expandCards([row], COMPOUND_ARBITRUM_DEPLOYMENT.markets)) {
        const comet = card.comet;
        if (!comet) continue;
        const m = comet.market;
        const roster = COMPOUND_ARBITRUM_DEPLOYMENT.markets.find((x) => x.comet.toLowerCase() === m.comet);
        // Comet's liquidation line: each collateral's dollars at the Comet's
        // price, times its liquidateCollateralFactor (the roster as
        // getAssetInfo answered it).
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
          positionId: `${m.comet}:${row.wallet}`,
          href: comet.key ? compoundArbitrumMarketHref(comet.key, row.wallet) : r.href,
          status: "open",
          card: { kind: "compound-v3-arbitrum", row, comet },
          collateralUsd: m.collateralUsd ?? undefined,
          debtUsd: debt,
          usdOwnOracle: true,
          buffer: bufferFromHealth(hf),
          riskFigure:
            hf != null ? { value: `${hf >= 100 ? ">100" : hf.toFixed(2)} HF`, label: "Health factor" } : undefined,
          liquidatable: m.isLiquidatable,
          headRead: "stored",
          ...stamp(row),
        });
      }
    });
    return out;
  },
};

export const morphoArbitrum: FamilyModule = {
  id: "morpho-arbitrum",
  name: "Morpho Blue",
  chain: ARBITRUM_CHAIN_ID,
  summaryChain: "arbitrum",
  summaryFamily: "morpho",
  async shape(summary) {
    return rowsOf(summary, readMorphoAnswer).map(({ row, r }): WalletPosition => {
      const base = {
        chain: ARBITRUM_CHAIN_ID as ChainId,
        family: "morpho",
        familyName: "Morpho Blue",
        positionId: r.positionId,
        href: r.href,
        card: { kind: "morpho-arbitrum" as const, row },
        // Decision 0046: another protocol's oracle, named; open point 7: shown
        // on the card, outside the tiles.
        usdSource: "Aave V3 Arbitrum oracle at the visit's read",
      };
      if (r.status !== "open") return closedRow(row, base);
      return {
        ...base,
        status: "open",
        collateralUsd: row.totalCollateralUsd ?? undefined,
        debtUsd: row.totalDebtUsd ?? undefined,
        usdOwnOracle: false,
        headRead: "stored",
        ...stamp(row),
      };
    });
  },
};
