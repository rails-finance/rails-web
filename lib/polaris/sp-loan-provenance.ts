// Receipts for the Polaris stability-pool deposit and reserve-loan pages: the
// pool's and the loans manager's getters at head (the chain lane), and the
// index's sums over a position's rows (rails-server migs 479 and 480).

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { FPETH, POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";

const SP_VIA = "GET /api/chain/polaris/stability-pool";
const LOAN_VIA = "GET /api/chain/polaris/reserve-loan";

const stableOf = (m: PolarisMarket) => POLARIS_MARKET_CONFIG[m].stable.symbol;
const pool = (m: PolarisMarket) => ({
  name: `Polaris ${stableOf(m)} StabilityPool`,
  address: POLARIS_MARKET_CONFIG[m].stabilityPool,
});
const manager = { name: "Polaris ReserveLoansManager", address: POLARIS_CORE.reserveLoansManager };
const curve = { name: "Polaris BondingCurve", address: POLARIS_CORE.bondingCurve };

const ask = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `To check: ask any Sepolia archive node for ${method} at the stamped block.`,
});

const SP_GETTER: Record<
  "compounded" | "stableGain" | "pendingPeth" | "owner",
  { method: string; summary: (s: string) => string }
> = {
  compounded: {
    method: "getCompoundedStableTokenDeposit(id)",
    summary: (s) =>
      `Deposit now — the pool's getCompoundedStableTokenDeposit(id) at the latest block: the ${s} recorded at the last touch, less what liquidations have burned since, floor(recorded × P ÷ the P snapshot taken at that touch).`,
  },
  stableGain: {
    method: "getDepositorStableTokenGainWithPending(id)",
    summary: (s) =>
      `${s} gain pending — the pool's getDepositorStableTokenGainWithPending(id) at the latest block: the yield the deposit has earned since its last touch, which the next touch pays as its stable gain. What that touch does not claim stays in the deposit.`,
  },
  pendingPeth: {
    method: "getDepositorBcTokenGain(id) + stashedBcTokens(id)",
    summary: () =>
      "pETH pending — the pool's getDepositorBcTokenGain(id), the pETH liquidations have paid the deposit since its last touch, plus stashedBcTokens(id), the pETH earlier touches left unclaimed, both at the latest block.",
  },
  owner: {
    method: "ownerOf(id)",
    summary: () => "Holder — the pool's ownerOf(id) at the latest block: the pool is the deposit NFT's contract.",
  },
};

export function spLiveProv(what: keyof typeof SP_GETTER, market: PolarisMarket): Provenance {
  const g = SP_GETTER[what];
  return {
    kind: "chain",
    pclass: "state",
    verify: ask(g.method),
    summary: g.summary(stableOf(market)),
    contract: pool(market),
    via: `${SP_VIA} · ${g.method} @ head`,
  };
}

/** The pending loss: the recorded deposit less the deposit now. */
export function spPendingLossProv(market: PolarisMarket): Provenance {
  const s = stableOf(market);
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("deposits(id) and getCompoundedStableTokenDeposit(id)"),
    summary: `${s} burned since the last touch — the pool's deposits(id), the deposit recorded at the last touch, less its getCompoundedStableTokenDeposit(id), both at the latest block. The next touch writes it as the operation's deposit loss.`,
    contract: pool(market),
    formula: "deposits(id) − getCompoundedStableTokenDeposit(id)",
    via: `${SP_VIA} @ head`,
  };
}

const SP_SUM: Record<string, (s: string) => string> = {
  deposited: (s) => `${s} deposited — the sum of every DepositOperation's positive topUpOrWithdrawal on this deposit.`,
  withdrawn: (s) => `${s} withdrawn — the sum of every DepositOperation's negative topUpOrWithdrawal on this deposit.`,
  burned: (s) =>
    `${s} burned at touches — the sum of every DepositOperation's depositLossSinceLastOperation: the deposit liquidations used, written at the next touch.`,
  kept: (s) =>
    `Yield kept — the sum of every DepositOperation's stableTokenGainSinceLastOperation less its stableTokenGainClaimed: the ${s} gain the touches left in the deposit, where it compounds.`,
  recorded: (s) =>
    `Deposit at the last touch — the last DepositUpdated's newDeposit on this deposit: the ${s} it held after its newest operation.`,
  stableGain: (s) =>
    `${s} gain paid at touches — the sum of every DepositOperation's stableTokenGainSinceLastOperation.`,
  stableClaimed: (s) => `${s} gain claimed — the sum of every DepositOperation's stableTokenGainClaimed.`,
  bcGain: () => "pETH paid at touches — the sum of every DepositOperation's bcTokenGainSinceLastOperation.",
  bcClaimed: () => "pETH claimed — the sum of every DepositOperation's bcTokenGainClaimed.",
  stashed: () => "pETH stashed — the last DepositUpdated's stashedBcTokens: pETH paid at touches and left unclaimed.",
};

export function spSumProv(what: keyof typeof SP_SUM, market: PolarisMarket): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: SP_SUM[what](stableOf(market)),
    contract: pool(market),
    via: "GET /api/polaris/stability-pool/timeline · position",
  };
}

const LOAN_GETTER: Record<
  "coll" | "debt" | "floor" | "owner",
  { method: string; summary: string; contract: { name: string; address: string } }
> = {
  coll: {
    method: "loans(id)",
    summary: `${FPETH.symbol} collateral — the loans manager's loans(id) at the latest block, its first field: the ${FPETH.symbol} the loan holds.`,
    contract: manager,
  },
  debt: {
    method: "getLoanDebt(id)",
    summary:
      "Debt — the loans manager's getLoanDebt(id) at the latest block: the WETH the loan owes, its shares at the debt per share, with the fees accrued since the last FeesAccrued.",
    contract: manager,
  },
  floor: {
    method: "floorPrice()",
    summary: `${FPETH.symbol} at the floor — the bonding curve's floorPrice() at the latest block: the WETH one ${FPETH.symbol} is worth at the floor, which the protocol only raises.`,
    contract: curve,
  },
  owner: {
    method: "ownerOf(id)",
    summary: "Holder — the loan NFT's ownerOf(id) at the latest block.",
    contract: { name: "Polaris ReserveLoansNFT", address: POLARIS_CORE.reserveLoansNft },
  },
};

export function loanLiveProv(what: keyof typeof LOAN_GETTER): Provenance {
  const g = LOAN_GETTER[what];
  return {
    kind: "chain",
    pclass: what === "floor" ? "oracle" : "state",
    verify: ask(g.method),
    summary: g.summary,
    contract: g.contract,
    via: `${LOAN_VIA} · ${g.method} @ head`,
  };
}

export function loanCostProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("getLoanDebt(id)"),
    summary:
      "Cost so far — the loans manager's getLoanDebt(id) at the latest block less the WETH borrowed net of repayments, summed from the loan's LoanOpened and LoanAdjusted logs: the fees the loan has been charged.",
    contract: manager,
    formula: "getLoanDebt(id) − (borrowed − repaid)",
    via: `${LOAN_VIA} @ head`,
  };
}

export function loanAtFloorProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: ask("loans(id) and floorPrice()"),
    summary: `Collateral at the floor — the loan's ${FPETH.symbol} from loans(id) times the bonding curve's floorPrice(), both at the latest block, in WETH.`,
    contract: curve,
    formula: "loans(id).fpCollateral × floorPrice() ÷ 1e18",
    via: `${LOAN_VIA} @ head`,
  };
}

const LOAN_SUM: Record<string, string> = {
  collDeposited: `${FPETH.symbol} deposited — the sum of the loan's LoanOpened fpCollateral and positive LoanAdjusted collChange.`,
  collReturned: `${FPETH.symbol} returned — the sum of the loan's negative LoanAdjusted collChange and its LoanClosed fpCollateralReturned.`,
  borrowed: "WETH borrowed — the sum of the loan's LoanOpened reserveBorrowed and positive LoanAdjusted debtChange.",
  repaid: "WETH repaid — the sum of the loan's negative LoanAdjusted debtChange and its LoanClosed reserveRepaid.",
  fees: "Fees at each leg — the debt after the loan's last leg, its shares at the FeesAccrued index in force there, less the WETH borrowed net of repayments.",
  pendingFee:
    "Fees since the last leg — getLoanDebt(id) at the latest block less the debt after the loan's last leg: the index's growth on its shares since.",
};

export function loanSumProv(what: keyof typeof LOAN_SUM): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: LOAN_SUM[what],
    contract: manager,
    via: "GET /api/polaris/reserve-loans/timeline",
  };
}

/** A leg's index: the FeesAccrued log in force when it was written. */
export function loanIndexProv(txHash: string | null, block: string | null): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary:
      "Debt per share at this leg — the newDebtPerShare of the last FeesAccrued at or before the leg, which the manager logs before the leg in the same transaction.",
    contract: manager,
    ...(txHash || block ? { source: { ...(block ? { block } : {}), ...(txHash ? { txHash } : {}) } } : {}),
    via: "FeesAccrued.newDebtPerShare",
  };
}

/** One leg's field, from its log. */
export function legProv(
  summary: string,
  txHash: string,
  block: string,
  contract: "pool" | "loans",
  market?: PolarisMarket,
): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: contract === "pool" && market ? pool(market) : manager,
    source: { block, txHash },
  };
}

/** pETH in the market's stablecoin at its price feed, read with the deposit. */
export function spFeedProv(market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: ask("previewPrice()"),
    summary: `pETH in ${stableOf(market)} — the market's price feed, previewPrice() at the latest block: the price the protocol values pETH at in this market.`,
    contract: { name: `Polaris ${stableOf(market)} PriceFeed`, address: POLARIS_MARKET_CONFIG[market].priceFeed },
    via: `${SP_VIA} · previewPrice() @ head`,
  };
}
