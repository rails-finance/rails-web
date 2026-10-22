// The Liquity V2 forks for the wallet view (decision 0050, step 3; SERVER-ONLY):
// Ebisu and Asymmetry on Ethereum, Basedollar on Base. Each card is the
// fork's listing row, built from the summary row's `card` (the TroveSummary
// /api/<fork>/troves answers, mig 398) by the fork's listing builder, the
// step the fork's listing proxy takes. The head read is the listing's own
// price read: one multicall of the fork's branch PriceFeeds for every Trove
// at once, which values the collateral and gives the collateral ratio.

import { buildEbisuTroveRows, type EbisuTroveSummary, type RawEbisuTroveRow } from "@/lib/sources/api/ebisu-troves";
import {
  buildAsymmetryTroveRows,
  type AsymmetryTroveSummary,
  type RawAsymmetryTroveRow,
} from "@/lib/sources/api/asymmetry-troves";
import {
  buildBasedollarTroveRows,
  type BasedollarTroveSummary,
  type RawBasedollarTroveRow,
} from "@/lib/sources/api/basedollar-troves";
import { resolveLiquityForkPrices, type LiquityForkPriceMap } from "@/lib/sources/chain/liquity-fork-prices";
import type { LiquityForkBranchConfig } from "@/lib/sources/chain/liquity-fork-position";
import { EBISU_BRANCHES, resolveBranch as ebisuBranch } from "@/lib/ebisu/asset-catalog";
import { ASYMMETRY_BRANCHES, resolveBranch as asymmetryBranch } from "@/lib/asymmetry/asset-catalog";
import { BASEDOLLAR_BRANCHES, resolveBranch as basedollarBranch } from "@/lib/basedollar/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { WalletCard, WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

type ForkSummary = EbisuTroveSummary | AsymmetryTroveSummary | BasedollarTroveSummary;
type ForkKind = "ebisu" | "asymmetry" | "basedollar";

interface ForkSpec<R, S extends ForkSummary> {
  kind: ForkKind;
  name: string;
  chain: ChainId;
  summaryChain: WalletSummaryRow["chain"];
  debtSymbol: string;
  branches: LiquityForkBranchConfig[];
  build: (raw: R[], prices?: LiquityForkPriceMap) => S[];
  mcr: (collateralType: string) => number | undefined;
}

const now = () => Math.floor(Date.now() / 1000);

function forkModule<R, S extends ForkSummary>(spec: ForkSpec<R, S>): FamilyModule {
  const cardOf = (row: S) => ({ kind: spec.kind, row }) as WalletCard;
  return {
    id: spec.kind,
    name: spec.name,
    chain: spec.chain,
    summaryChain: spec.summaryChain,
    summaryFamily: spec.kind,
    async shape(rows) {
      const cards = spec.build(rows.map((r) => r.card as R));
      return rows.map((r, i): WalletPosition => {
        const s = cards[i];
        const base: WalletPosition = {
          chain: spec.chain,
          family: spec.kind,
          familyName: spec.name,
          market: `${s.collateralType} Trove`,
          positionId: r.positionId,
          href: r.href,
          status: r.status,
          card: cardOf(s),
          headRead: "none",
          ...storeStamp(r),
        };
        if (r.status === "open") return base;
        const parts = [
          s.peakCollateral > 0 ? amountText(s.peakCollateral, s.collateralType) : null,
          s.peakDebt > 0 ? amountText(s.peakDebt, spec.debtSymbol) : null,
        ].filter(Boolean);
        return {
          ...base,
          history: {
            ...historyBase(r),
            size: parts.length ? parts.join(" / ") : undefined,
            sizeNote: parts.length ? "highest recorded" : undefined,
            result: s.redemptionCount > 0 ? plural(s.redemptionCount, "redemption") : undefined,
            // The route counts the owner's own transactions, redemptions and
            // liquidations left out.
            txCount: s.txCount,
          },
        };
      });
    },
    async head(open): Promise<HeadResult> {
      if (open.length === 0) return { positions: open, reads: 0 };
      const prices = await resolveLiquityForkPrices(spec.branches, spec.chain);
      if (prices.size === 0) return { reads: 1, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
      return {
        reads: 1,
        positions: open.map((p): WalletPosition => {
          // The builder values the row at its branch's price.
          const raw = (p.card as unknown as { row: S }).row;
          const s = spec.build([toRaw(raw) as R], prices)[0];
          const collateralUsd = s.collateralUsd ?? undefined;
          const cr = s.collateralRatio ?? undefined;
          const mcr = spec.mcr(s.collateralType);
          return {
            ...p,
            card: cardOf(s),
            collateralUsd,
            debtUsd: s.debt,
            usdSource: `${spec.name} branch price feed, debt in ${spec.debtSymbol}`,
            usdOwnOracle: collateralUsd != null,
            buffer: cr != null && mcr != null ? 1 - mcr / cr : undefined,
            riskFigure:
              cr != null
                ? {
                    value: `${(cr * 100).toFixed(1)}% CR`,
                    label: mcr != null ? `liquidates below ${(mcr * 100).toFixed(0)}%` : "Collateral ratio",
                  }
                : undefined,
            liquidatable: cr != null && mcr != null ? cr < mcr : undefined,
            debtRate: s.debt > 0 ? s.interestRate / 100 : undefined,
            headRead: "read",
            // The price read states no block; the Trove's figures are its last event's.
            readAt: now(),
          };
        }),
      };
    },
  };
}

/** A built row back in the route's shape, so the builder can value it. The
 *  fields are the ones the three builders read. */
function toRaw(s: ForkSummary) {
  return {
    id: s.id,
    status: s.status,
    isZombie: (s as { isZombie?: boolean }).isZombie,
    collateralType: s.collateralType,
    owner: s.owner,
    lastOwner: s.lastOwner,
    ownerEns: s.ownerEns,
    debt: { current: s.debt, currentRaw: s.debtRaw, peak: s.peakDebt },
    collateral: { amount: s.collateral, amountRaw: s.collateralRaw, peakAmount: s.peakCollateral },
    metrics: { interestRate: s.interestRate },
    activity: {
      lastActivityAt: s.lastActivityAt,
      transactionCount: s.txCount,
      redemptionCount: s.redemptionCount,
      liquidationCount: s.liquidationCount,
    },
    batch: { isMember: s.isBatched },
  };
}

export const ebisu = forkModule<RawEbisuTroveRow, EbisuTroveSummary>({
  kind: "ebisu",
  name: "Ebisu",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  debtSymbol: "ebUSD",
  branches: Object.values(EBISU_BRANCHES),
  build: buildEbisuTroveRows,
  mcr: (c) => ebisuBranch(c)?.mcr,
});

export const asymmetry = forkModule<RawAsymmetryTroveRow, AsymmetryTroveSummary>({
  kind: "asymmetry",
  name: "Asymmetry",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  debtSymbol: "USDaf",
  branches: Object.values(ASYMMETRY_BRANCHES),
  build: buildAsymmetryTroveRows,
  mcr: (c) => asymmetryBranch(c)?.mcr,
});

export const basedollar = forkModule<RawBasedollarTroveRow, BasedollarTroveSummary>({
  kind: "basedollar",
  name: "Basedollar",
  chain: BASE_CHAIN_ID,
  summaryChain: "base",
  debtSymbol: "BD",
  branches: Object.values(BASEDOLLAR_BRANCHES),
  build: buildBasedollarTroveRows,
  mcr: (c) => basedollarBranch(c)?.mcr,
});
