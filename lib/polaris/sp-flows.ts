// The Lifetime flows tower of a Polaris stability-pool deposit (rails-ops
// decision 0022, option 2): two sides in token units, no price.
//
//   • Left, the pool's stablecoin: deposited, with the yield kept beside it
//     (the stable gain the touches did not claim compounds into the deposit),
//     less withdrawn, less burned at touches, holds the deposit recorded at
//     the last touch; the loss pending since then is carved out of it,
//     hatched, leaving the deposit now.
//   • Right, what was paid in: one bar per token. pETH paid at touches, less
//     claimed, holds the stash, with the pETH gained since the last touch on
//     the eventless segment; the stable gain paid at touches, less claimed and
//     less kept in the deposit, with the gain pending since the last touch.
//
// Each side reconciles to its getters: the left to getCompoundedStableTokenDeposit,
// the right to getDepositorBcTokenGain + stashedBcTokens and
// getDepositorStableTokenGainWithPending. The pending reads are passed even at
// zero, so each side keeps its result row (0022, "for feeders").

import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";
import { units, type DepositLifetime, type DepositNow } from "./sp-loan-math";
import { spLiveProv, spPendingLossProv, spSumProv } from "./sp-loan-provenance";

/** Rows a deposit timeline read brings, the first and each "Show more". */
export const DEPOSIT_PAGE = 50;

const line = (
  key: string,
  symbol: string,
  address: string,
  amount: bigint,
  prov: TowerLine["prov"],
  extra: Partial<TowerLine> = {},
): TowerLine => ({ key, symbol, address, amount: units(amount), usd: null, prov, ...extra });

const nonzero = (l: TowerLine) => (l.amount > 0 ? [l] : []);

export function polarisDepositTower(
  market: PolarisMarket,
  l: DepositLifetime,
  now: DepositNow | null,
): ChainTruthTowerData {
  const stable = POLARIS_MARKET_CONFIG[market].stable;
  const s = stable.symbol;
  const S = (key: string, amount: bigint, prov: TowerLine["prov"], extra?: Partial<TowerLine>) =>
    line(key, s, stable.address, amount, prov, extra);
  const P = (key: string, amount: bigint, prov: TowerLine["prov"], extra?: Partial<TowerLine>) =>
    line(key, PETH.symbol, PETH.address, amount, prov, extra);

  const depositSide: TowerSideData = {
    current: nonzero(S("recorded", l.recorded, spSumProv("recorded", market), { heldLabel: "At the last touch" })),
    lifetimeInflow: units(l.deposited) + units(l.kept),
    received: nonzero(S("kept", l.kept, spSumProv("kept", market), { flowLabel: "Yield kept" })),
    exited: nonzero(S("withdrawn", l.withdrawn, spSumProv("withdrawn", market), { flowLabel: "Withdrawn" })),
    liquidated: nonzero(S("burned", l.burned, spSumProv("burned", market), { flowLabel: "Burned at touches" })),
    ...(now
      ? {
          eventlessLosses: [
            S("pending-loss", now.pendingLoss, spPendingLossProv(market), { flowLabel: "Burned since last touch" }),
          ],
        }
      : {}),
  };

  const pethBar: TowerSideData = {
    current: nonzero(P("stashed", l.stashed, spSumProv("stashed", market), { heldLabel: "Stashed" })),
    lifetimeInflow: units(l.bcGain),
    exited: nonzero(P("peth-claimed", l.bcClaimed, spSumProv("bcClaimed", market), { flowLabel: "Claimed" })),
    liquidated: [],
    ...(now
      ? {
          eventlessGains: [
            P("peth-pending", now.bcSinceTouch, spLiveProv("pendingPeth", market), { flowLabel: "Since last touch" }),
          ],
        }
      : {}),
  };

  const stableBar: TowerSideData = {
    current: [],
    lifetimeInflow: units(l.stableGain),
    exited: [
      ...nonzero(S("gain-claimed", l.stableClaimed, spSumProv("stableClaimed", market), { flowLabel: "Claimed" })),
      ...nonzero(S("gain-kept", l.kept, spSumProv("kept", market), { flowLabel: "Kept in the deposit" })),
    ],
    liquidated: [],
    ...(now
      ? {
          eventlessGains: [
            S("gain-pending", now.pendingStable, spLiveProv("stableGain", market), { flowLabel: "Since last touch" }),
          ],
        }
      : {}),
  };

  return {
    valued: false,
    collateral: depositSide,
    debt: { current: [], exited: [], liquidated: [], lifetimeInflow: 0, bars: [pethBar, stableBar] },
    collateralUnit: s,
    collateralTitle: "Deposit now",
    debtTitle: "Pending gains",
    collateralInflowLabel: "Deposited",
    debtInflowLabel: "Paid in",
    wrapFlowLabels: true,
    fullTokenAmounts: true,
    unitOnEveryRow: true,
    flowsNote: "The deposit's operations sum to the deposit recorded at its last touch.",
  };
}
