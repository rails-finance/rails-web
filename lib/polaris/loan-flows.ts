// The Lifetime flows tower of a Polaris reserve loan, in token units: fpETH
// collateral on the left (deposited, less returned, holds the collateral),
// WETH debt on the right (borrowed, with the fees each leg's index charged on
// the shares before it, less repaid, holds the debt after the last leg; the
// fees accrued since that leg sit on the eventless segment as "Accrued fees").
// The right side reconciles to getLoanDebt(id), the left to loans(id).

import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { FPETH, POLARIS_WETH } from "./asset-catalog";
import { units, type LoanLifetime } from "./sp-loan-math";
import { loanSumProv } from "./sp-loan-provenance";

const line = (
  key: string,
  token: { symbol: string; address: string },
  amount: bigint,
  prov: TowerLine["prov"],
  extra: Partial<TowerLine> = {},
): TowerLine => ({
  key,
  symbol: token.symbol,
  address: token.address,
  amount: units(amount),
  usd: null,
  prov,
  ...extra,
});

const nonzero = (l: TowerLine) => (l.amount > 0 ? [l] : []);

export function polarisLoanTower(l: LoanLifetime, pendingFee: bigint | null): ChainTruthTowerData {
  const coll = l.collDeposited - l.collReturned;
  return {
    valued: false,
    collateral: {
      current: nonzero(line("coll", FPETH, coll, loanSumProv("collDeposited"))),
      lifetimeInflow: units(l.collDeposited),
      exited: nonzero(line("returned", FPETH, l.collReturned, loanSumProv("collReturned"), { flowLabel: "Returned" })),
      liquidated: [],
    },
    debt: {
      current: nonzero(
        line("debt-last-leg", POLARIS_WETH, l.debtAtLastLeg, loanSumProv("fees"), { heldLabel: "At the last leg" }),
      ),
      lifetimeInflow: units(l.borrowed),
      received: nonzero(
        line("fees", POLARIS_WETH, l.feesAtLegs, loanSumProv("fees"), { flowLabel: "Fees at each leg" }),
      ),
      exited: nonzero(line("repaid", POLARIS_WETH, l.repaid, loanSumProv("repaid"), { flowLabel: "Repaid" })),
      liquidated: [],
      interest: pendingFee == null ? null : line("pending-fee", POLARIS_WETH, pendingFee, loanSumProv("pendingFee")),
    },
    collateralUnit: FPETH.symbol,
    debtUnit: POLARIS_WETH.symbol,
    interestLabel: "Accrued fees",
    interestNote: "The fees since the last leg need the live read.",
    wrapFlowLabels: true,
    fullTokenAmounts: true,
    unitOnEveryRow: true,
  };
}
