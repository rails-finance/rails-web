// The Liquity V2 forks for the wallet view (decision 0050, step 3; SERVER-ONLY):
// Ebisu and Asymmetry on Ethereum, Basedollar on Base. Each card is the
// fork's listing row, built from the summary row's `card` (the TroveSummary
// /api/<fork>/troves answers, mig 398) by the fork's listing builder, the
// step the fork's listing proxy takes. The head read is the listing's own
// price read: one multicall of the fork's branch PriceFeeds for every Trove
// at once, which values the collateral and gives the collateral ratio. Each
// fork's Stability Pool deposits come from its deposit listing's route for the
// wallet (read-wallet.ts, readListingRows) with their stored figures: the
// forks' deposit listings price nothing, so neither does the wallet page.
// Beside the price read, each open Trove's branch shutdown: the catalog's
// record with the live read (branch-shutdown.ts), which lib/wallet/trove-shutdown.ts
// applies (ui-jobs 802).

import { formerHoldOf, movedHistory } from "@/lib/wallet/moved-row";
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
import { amountText, historyBase, plural, scaled, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import type { FamilyModule, HeadResult } from "./module";
import { walletBranchShutdowns, withShutdowns } from "./branch-shutdown";
import { shutDownTrove } from "@/lib/wallet/trove-shutdown";

type ForkSummary = EbisuTroveSummary | AsymmetryTroveSummary | BasedollarTroveSummary;
type ForkKind = "ebisu" | "asymmetry" | "basedollar";

interface ForkSpec<R, S extends ForkSummary> {
  kind: ForkKind;
  name: string;
  chain: ChainId;
  summaryChain: WalletSummaryRow["chain"];
  debtSymbol: string;
  branches: Record<string, LiquityForkBranchConfig>;
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
        // A Trove this wallet held and passed on (lib/wallet/moved-row.ts).
        const moved = formerHoldOf(r.card);
        if (moved) return { ...base, status: "moved", history: movedHistory(moved) };
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
      const rowOf = (p: WalletPosition) => (p.card as unknown as { row: S }).row;
      const [prices, shutdowns] = await Promise.all([
        resolveLiquityForkPrices(Object.values(spec.branches), spec.chain),
        walletBranchShutdowns(
          spec.kind,
          open.map((p) => rowOf(p).collateralType),
        ),
      ]);
      const shut = (p: WalletPosition) => shutDownTrove(p, shutdowns.states.get(rowOf(p).collateralType));
      // The price multicall, and the shutdown read where the cache did not answer.
      const reads = 1 + shutdowns.reads;
      if (prices.size === 0) return { reads, positions: open.map((p) => shut({ ...p, headRead: "failed" })) };
      return {
        reads,
        positions: open.map((p): WalletPosition => {
          // The builder values the row at its branch's price.
          const raw = (p.card as unknown as { row: S }).row;
          const s = spec.build([toRaw(raw) as R], prices)[0];
          const collateralUsd = s.collateralUsd ?? undefined;
          const cr = s.collateralRatio ?? undefined;
          const mcr = spec.mcr(s.collateralType);
          return shut({
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
          });
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
  branches: EBISU_BRANCHES,
  build: buildEbisuTroveRows,
  mcr: (c) => ebisuBranch(c)?.mcr,
});

export const asymmetry = forkModule<RawAsymmetryTroveRow, AsymmetryTroveSummary>({
  kind: "asymmetry",
  name: "Asymmetry",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  debtSymbol: "USDaf",
  branches: ASYMMETRY_BRANCHES,
  build: buildAsymmetryTroveRows,
  mcr: (c) => asymmetryBranch(c)?.mcr,
});

export const basedollar = forkModule<RawBasedollarTroveRow, BasedollarTroveSummary>({
  kind: "basedollar",
  name: "Basedollar",
  chain: BASE_CHAIN_ID,
  summaryChain: "base",
  debtSymbol: "BD",
  branches: BASEDOLLAR_BRANCHES,
  build: buildBasedollarTroveRows,
  mcr: (c) => basedollarBranch(c)?.mcr,
});

/** A fork's Stability Pool deposits: the deposit card, and for a closed one
 *  what it put in. No head read: the card states the stored figures. */
function forkDepositModule(
  fork: ForkKind,
  name: string,
  chain: ChainId,
  summaryChain: WalletSummaryRow["chain"],
  stable: string,
): FamilyModule {
  return {
    id: `${fork}-sp`,
    name,
    chain,
    summaryChain,
    summaryFamily: fork,
    summaryKind: "deposits",
    async shape(rows) {
      const shaped = rows.map((r): WalletPosition => {
        const d = r.card as LiquityV2DepositRow<string>;
        const p: WalletPosition = {
          chain,
          family: fork,
          familyName: name,
          market: `${d.collateral_type} Stability Pool`,
          positionId: r.positionId,
          href: r.href,
          status: r.status,
          card: { kind: "fork-deposit", fork, row: d },
          kind: "deposits",
          headRead: "none",
          ...storeStamp(r),
        };
        if (r.status === "open") return p;
        const total = scaled(d.deposited_raw, 18);
        return {
          ...p,
          history: {
            ...historyBase(r),
            size: total > 0 ? amountText(total, stable) : undefined,
            sizeNote: total > 0 ? "deposited in all" : undefined,
          },
        };
      });
      // Each open deposit's branch state (ui-jobs 802).
      return withShutdowns(fork, shaped, (p) => (p.card as { row: LiquityV2DepositRow<string> }).row.collateral_type);
    },
  };
}

export const ebisuDeposits = forkDepositModule("ebisu", "Ebisu", MAINNET_CHAIN_ID, "ethereum", "ebUSD");
export const asymmetryDeposits = forkDepositModule("asymmetry", "Asymmetry", MAINNET_CHAIN_ID, "ethereum", "USDaf");
export const basedollarDeposits = forkDepositModule("basedollar", "Basedollar", BASE_CHAIN_ID, "base", "BD");
