// LlamaLend MARKET-SURFACE provenance vocabulary — the receipts for
// /llamalend/markets, one head block's reading of Curve's three factories'
// rosters and every market's own Controller / AMM (LLAMMA) / monetary policy.
// ----------------------------------------------------------------------------
// The market-level counterpart of lib/llamalend/{position,event}-provenance
// (which trace a WALLET's position and events). Nothing here concerns an
// account: every figure is a slot read on a Controller, its AMM, or its
// monetary policy at one head block — or an arithmetic over such reads. The
// source classes, graded exactly as the ladder does:
//   • state   — a contract slot at the block (total_debt, n_loans, the two
//     governance discounts, the AMM's immutable A). Third-party verifiable:
//     re-run the eth_call at the block against any node.
//   • oracle  — the AMM's own price_oracle() (collateral priced in the borrowed
//     token, the price the LLAMMA converts collateral against), read straight.
//   • derived — a ratio or Σ over those reads (a market's utilisation, the
//     roster's Σ debt / Σ loans), chain-derived and no further than its weakest
//     input.
//
// UNITS. crvUSD is $-pegged, so a crvUSD-borrowed market's debt reads as dollars
// AT PAR — the crvUSD unit taken at ~$1, NOT an oracle conversion, and the debt
// receipt says exactly that. The markets that borrow WETH / tBTC / ynETH / CRV
// keep their own token and assert no dollar.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.
//
// The `contract` on each receipt is the address the value was read FROM: the
// Controller for its own totals/discounts, the AMM for A and the oracle price,
// the monetary policy for the rate. Real addresses throughout, threaded from the
// market row (m.controller / m.amm / m.monetaryPolicy).

import type { Provenance } from "@/components/shared/provenance";
import { LLAMALEND_ADDRESSES, SECONDS_PER_YEAR } from "@/lib/llamalend/asset-catalog";

const LANE = "live LlamaLend reads (/llamalend/markets)";

/** The coordinates a market-surface receipt needs: the block it was read at, the
 *  three contracts a market's figures come from, its symbols, and the two flags
 *  that decide a figure's unit (crvUSD par) and denominator (utilisation basis). */
export interface LlamalendMarketCoords {
  blockNumber?: number;
  /** The Controller address — THE market key; total_debt / n_loans / the
   *  discounts cite it. */
  controller?: string;
  /** The market AMM (LLAMMA) address — A() and price_oracle() cite it. */
  amm?: string;
  /** The market's own monetary-policy contract — the rate() read cites it. */
  monetaryPolicy?: string;
  /** The collateral / borrowed symbols — the pair that names each row. */
  collateralSymbol?: string;
  borrowedSymbol?: string;
  /** crvUSD-borrowed (~$1): decides whether the debt reads as dollars at par. */
  borrowedIsCrvusd?: boolean;
  /** What the utilisation is OF — a mint market meters against a crvUSD debt
   *  ceiling, a lend/V2 market against lender-funded liquidity. */
  utilisationBasis?: "lender deposits" | "crvUSD debt ceiling" | null;
}

const pair = (c?: LlamalendMarketCoords): string =>
  c?.collateralSymbol && c?.borrowedSymbol ? `${c.collateralSymbol}/${c.borrowedSymbol}` : "market";

const controllerContract = (c?: LlamalendMarketCoords): Provenance["contract"] => ({
  name: `${pair(c)} controller`,
  address: c?.controller,
});
const ammContract = (c?: LlamalendMarketCoords): Provenance["contract"] => ({
  name: `${pair(c)} AMM (LLAMMA)`,
  address: c?.amm,
});
const policyContract = (c?: LlamalendMarketCoords): Provenance["contract"] => ({
  name: `${pair(c)} monetary policy`,
  address: c?.monetaryPolicy,
});

const atBlock = (c?: LlamalendMarketCoords): string => (c?.blockNumber != null ? ` at block ${c.blockNumber}` : "");

const recompute = (call: string, c?: LlamalendMarketCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    c?.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${c.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

// ── market-level: size ───────────────────────────────────────────────────────

/** The market's total debt — Controller.total_debt(), borrowed-token units.
 *  crvUSD markets read it as dollars at par; the others keep their own token. */
export const llamaDebtProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("Controller.total_debt", c),
  summary: c.borrowedIsCrvusd
    ? `${pair(c)} debt — the market's own \`total_debt\`${atBlock(c)}, in crvUSD. crvUSD is $-pegged, so this reads as dollars taken AT PAR (~$1, the market's own denomination) — not an oracle conversion. Interest is already in the slot; this is what the Controller records as borrowed, not a sum over events.`
    : `${pair(c)} debt — the market's own \`total_debt\`${atBlock(c)}, in ${c.borrowedSymbol ?? "the borrowed token"}, its own borrowed token. No dollar is asserted: this market does not borrow crvUSD, so the figure stays in its own unit. Interest is already in the slot, read straight from the Controller.`,
  contract: controllerContract(c),
  via: `${LANE} · Controller.total_debt @ head`,
});

// ── market-level: band geometry ──────────────────────────────────────────────

/** Amplification A — the AMM's immutable A(): band density, how gradually
 *  soft-liquidation converts. */
export const llamaAmplificationProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("AMM.A", c),
  summary: `${pair(c)} amplification A — the market AMM's own \`A()\`${atBlock(c)}: band density, how many bands the LLAMMA packs per price doubling and so how GRADUAL soft-liquidation is. Immutable per market (10…500 on the live roster), read straight from the AMM.`,
  contract: ammContract(c),
  via: `${LANE} · AMM.A() @ head`,
});

/** A governance discount — loan_discount sizes borrowing power, liquidation_
 *  discount arms hard liquidation. Both 1e18 fractions on the Controller. */
export const llamaDiscountProv = (which: "loan" | "liquidation", c: LlamalendMarketCoords): Provenance => {
  const method = which === "loan" ? "loan_discount" : "liquidation_discount";
  const gloss =
    which === "loan"
      ? "sizes borrowing power against the collateral (the haircut on collateral value when a loan is opened)"
      : "arms hard liquidation (the discount at which the position becomes fully liquidatable)";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute(`Controller.${method}`, c),
    summary: `${pair(c)} ${which} discount — the market's own \`${method}\`${atBlock(c)} (1e18 fraction): ${gloss}. A governance-set slot, read straight from the Controller.`,
    contract: controllerContract(c),
    via: `${LANE} · Controller.${method} @ head`,
  };
};

// ── market-level: rate ───────────────────────────────────────────────────────

/** Borrow APR — the market's OWN monetary policy rate (per-second, 1e18)
 *  annualized by simple multiplication. */
export const llamaBorrowRateProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${pair(c)} borrow APR — the market's OWN monetary policy \`rate\`${atBlock(c)} (a per-second rate at 1e18) annualized by simple multiplication (× ${SECONDS_PER_YEAR.toLocaleString("en-US")} seconds/year, the same reading Curve's own UI leads with). Lend-market policies take the controller as argument, mint-market policies take none — whichever the policy answers. The rate the contract itself applies this block.`,
  contract: policyContract(c),
  via: `${LANE} · monetary_policy.rate() × seconds/year @ head`,
});

// ── market-level: activity + utilisation ─────────────────────────────────────

/** Open loans — Controller.n_loans(), the live position counter. */
export const llamaOpenLoansProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("Controller.n_loans", c),
  summary: `${pair(c)} open loans — the market's own \`n_loans\`${atBlock(c)}: how many positions the Controller currently carries. A live counter slot, read straight.`,
  contract: controllerContract(c),
  via: `${LANE} · Controller.n_loans @ head`,
});

/** Utilisation — debt over its own denominator. A mint market meters against the
 *  factory's crvUSD debt ceiling; a lend/V2 market against lender-funded
 *  liquidity (debt + the borrowed token still on the Controller). */
export const llamaUtilisationProv = (c: LlamalendMarketCoords): Provenance => {
  const ceiling = c.utilisationBasis === "crvUSD debt ceiling";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: ceiling
      ? `${pair(c)} utilisation — the market's \`total_debt\` ÷ the crvUSD ControllerFactory's own \`debt_ceiling(controller)\`${atBlock(c)}. A mint market borrows against a governance debt ceiling, not lender deposits, so THAT is the denominator — stated, never blended with a lend market's.`
      : `${pair(c)} utilisation — the market's \`total_debt\` ÷ (debt + the borrowed token still sitting on the Controller)${atBlock(c)}: the share of lender-funded liquidity that is borrowed. Both legs live reads; the available leg is the borrowed token's own \`balanceOf(controller)\`.`,
    contract: controllerContract(c),
    via: ceiling
      ? `${LANE} · Controller.total_debt ÷ ControllerFactory.debt_ceiling(controller) @ head`
      : `${LANE} · Controller.total_debt ÷ (total_debt + borrowedToken.balanceOf(controller)) @ head`,
    formula: ceiling ? "debt ÷ debt ceiling" : "debt ÷ (debt + available liquidity)",
    inputs: ceiling
      ? [
          {
            label: "debt",
            kind: "chain",
            pclass: "state",
            note: "Controller.total_debt @ head",
            contract: controllerContract(c),
          },
          {
            label: "debt ceiling",
            kind: "chain",
            pclass: "state",
            note: "ControllerFactory.debt_ceiling(controller) @ head",
            contract: { name: "crvUSD ControllerFactory", address: LLAMALEND_ADDRESSES.CRVUSD_FACTORY },
          },
        ]
      : [
          {
            label: "debt",
            kind: "chain",
            pclass: "state",
            note: "Controller.total_debt @ head",
            contract: controllerContract(c),
          },
          {
            label: "available liquidity",
            kind: "chain",
            pclass: "state",
            note: "borrowedToken.balanceOf(controller) @ head",
          },
        ],
  };
};

// ── market-level: oracle price ───────────────────────────────────────────────

/** The AMM's own oracle price — price_oracle(), collateral priced in the
 *  borrowed token (the price the LLAMMA converts against). */
export const llamaPriceOracleProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: c.blockNumber },
  verify: recompute("AMM.price_oracle", c),
  summary: `${pair(c)} oracle price — the market AMM's own \`price_oracle()\`${atBlock(c)} (1e18): the collateral priced in the borrowed token, the price the LLAMMA itself converts collateral against inside its bands. Read straight from the AMM${c.borrowedIsCrvusd ? "; the borrowed token is crvUSD (~$1), so this reads as dollars at par" : `, in ${c.borrowedSymbol ?? "the borrowed token"} — no dollar asserted`}.`,
  contract: ammContract(c),
  via: `${LANE} · AMM.price_oracle() @ head`,
});

// ── roster summary (block-level; no single contract) ─────────────────────────

/** Open loans across the whole roster — Σ of each market's own n_loans. */
export const llamaSummaryLoansProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Open loans across the roster — Σ over every listed market of its own \`n_loans\`${atBlock(c)}. Each leg a live Controller counter read; the sum is ours.`,
  via: `${LANE} · Σ Controller.n_loans over the roster @ head`,
  formula: "Σ n_loans over the roster",
});

/** Borrowed on the crvUSD markets — Σ total_debt over ONLY the crvUSD-borrowed
 *  markets, read as dollars at par (the others excluded, never converted). */
export const llamaSummaryDebtProv = (c: LlamalendMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Borrowed on the crvUSD markets — Σ \`total_debt\` over ONLY the markets whose borrowed token is crvUSD${atBlock(c)}. crvUSD is $-pegged, so the sum reads as dollars at par (~$1 the unit); the markets that borrow WETH / tBTC / ynETH / CRV are excluded, never converted. Each leg a live Controller read; the sum is ours.`,
  via: `${LANE} · Σ Controller.total_debt over the crvUSD markets @ head`,
  formula: "Σ total_debt over the crvUSD markets",
});
