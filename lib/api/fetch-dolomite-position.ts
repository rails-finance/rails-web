// ============================================================================
// FETCH DOLOMITE POSITION (chain state)
// ============================================================================
//
// Per-ACCOUNT state read directly from DolomiteMargin at the live head — the
// risk-surface companion to the captured event replay. The grain is the
// contract's own key, Account.Info = (owner, uint256 accountNumber):
// cross-margin WITHIN an account number, isolated ACROSS them, so one fetch
// covers exactly one risk unit and never aggregates an owner.
//
//   • getAccountBalances — every nonzero market: the par (the stored scaled
//     balance) and the wei (par × the market's CURRENT index — the index
//     accrues ON READ; interest is per-second, so no stored figure is current).
//     Negative wei IS the debt: the core has no Borrow action.
//   • getAccountValues / getAdjustedAccountValues — the protocol's own USD
//     aggregation at 1e36, raw and premium-adjusted. The premiums are
//     MULTIPLICATIVE (Solo semantics): adjusted supply = raw ÷ (1 + premium),
//     adjusted borrow = raw × (1 + premium), per market.
//   • getAccountRiskOverrideByAccount — ⚠️ THE CARVE-OUT. Some accounts
//     (observed: wstETH/WETH and weETH/WETH pairs — an e-mode-like category)
//     carry an override: minimum collateralisation 111.11%, spread 4%, and the
//     premiums SKIPPED (their adjusted values equal raw). (0, 0) for normal
//     accounts. The threshold this lane ships is the override when nonzero,
//     else the global getMarginRatio() — also cross-checked against
//     getMarginRatioForAccount, the core's own effective-ratio getter.
//   • getAccountStatus — the core's stored account status
//     (0 Normal / 1 Liquid / 2 Vapor), mapping onto the two-axis model.
//
// Both of this explorer's lanes are `state`-class — the replayed par equals a
// slot the chain stores (getAccountPar re-reads exactly it), unusual on this
// roster — and the receipts say so.

export interface DolomiteChainBalance {
  /** Dolomite's own market key. */
  marketId: number;
  token: string;
  symbol: string;
  decimals: number;
  /** SIGNED par (raw integer string) — the stored scaled balance. Negative IS
   *  debt. */
  parRaw: string;
  /** SIGNED wei (raw integer string) — par × the market's current index; the
   *  exact token amount at this block, interest included. */
  weiRaw: string;
  /** wei scaled by decimals (signed float, display). */
  wei: number;
  /** getMarketPrice USD per whole token (scale 1e(36 − decimals)). */
  priceUsd: number | null;
  /** |wei| × price — this leg's USD value at the core's own oracle. */
  valueUsd: number | null;
  /** This market's margin premium (fraction; SKIPPED when the account carries
   *  the risk override). */
  marginPremium: number;
  /** Borrow APR (%) — getMarketInterestRate × seconds/year, at head. */
  borrowAprPct: number | null;
  /** Supply APR (%) — borrow × utilisation × earningsRate. */
  supplyAprPct: number | null;
  /** New borrowing switched off for this market (getMarketIsClosing). */
  isClosing: boolean;
}

export interface DolomiteChainResponse {
  owner: string;
  /** Canonical decimal string (uint256 — never a JS number). */
  accountNumber: string;
  blockNumber: number;
  balances: DolomiteChainBalance[];

  /** getAccountValues — the core's own USD aggregation (1e36 → USD). */
  supplyValueUsd: number;
  borrowValueUsd: number;
  /** getAdjustedAccountValues — the same after the per-market margin premiums
   *  (multiplicative). Equals raw exactly when the override is active. */
  adjSupplyValueUsd: number;
  adjBorrowValueUsd: number;
  /** The four raw 1e36 integers behind the figures above. */
  rawValues: { supply: string; borrow: string; adjSupply: string; adjBorrow: string };

  /** Global getMarginRatio (fraction, e.g. 0.17647). */
  marginRatio: number;
  /** Global getLiquidationSpread (fraction, e.g. 0.05). */
  liquidationSpread: number;
  /** ⚠️ The carve-out: getAccountRiskOverrideByAccount. `active` when nonzero —
   *  the account's threshold is the override and the premiums are skipped. */
  override: { active: boolean; marginRatio: number | null; liquidationSpread: number | null };
  /** getMarginRatioForAccount — the core's OWN effective ratio for exactly
   *  this account (the override when set, the global otherwise). */
  marginRatioForAccount: number;
  /** 1 + marginRatioForAccount — the minimum adjustedSupply ÷ adjustedBorrow
   *  this account must keep. The protocol's own line. */
  requiredCollateralization: number;
  /** adjustedSupply ÷ adjustedBorrow — both legs the core's own getters; the
   *  division is arithmetic over them. Null when nothing is borrowed. */
  collateralization: number | null;
  /** getAccountStatus — the core's stored status. */
  accountStatus: number;
  accountStatusLabel: "Normal" | "Liquid" | "Vapor";

  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

export interface FetchDolomitePositionParams {
  owner: string;
  /** Decimal or 0x-hex uint256 string. */
  accountNumber: string;
  baseUrl?: string;
}

export async function fetchDolomiteChainPosition(p: FetchDolomitePositionParams): Promise<DolomiteChainResponse> {
  const qs = new URLSearchParams({ owner: p.owner, accountNumber: p.accountNumber });
  const url = `${p.baseUrl ?? ""}/api/chain/dolomite/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchDolomiteChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as DolomiteChainResponse;
}
