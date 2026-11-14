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
import { stampHeadRead, type ServerRead } from "@/lib/shared/server-head-read";
import { LLAMALEND_ADDRESSES, SECONDS_PER_YEAR } from "@/lib/llamalend/asset-catalog";

const LANE = "live LlamaLend reads (/llamalend/markets)";

/** The coordinates a market-surface receipt needs: the block it was read at, the
 *  three contracts a market's figures come from, its symbols, and the two flags
 *  that decide a figure's unit (crvUSD par) and denominator (utilisation basis). */
export interface LlamalendMarketCoords {
  /** rails-server's read of `blockNumber`, when it answered every read. */
  readBy?: ServerRead | null;
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

/** A builder's receipt, stamped with the rails-server read its coordinates
 *  (the last argument) carry. */
const stamped =
  <A extends unknown[]>(build: (...a: A) => Provenance) =>
  (...a: A): Provenance =>
    stampHeadRead(build(...a), (a[a.length - 1] as LlamalendMarketCoords | undefined)?.readBy);

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
export const llamaDebtProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("Controller.total_debt", c),
    summary: c.borrowedIsCrvusd
      ? `${pair(c)} debt — the market's own \`total_debt\`${atBlock(c)}, in crvUSD. crvUSD is $-pegged, so this reads as dollars taken AT PAR (~$1, the market's own denomination) — not an oracle conversion. Interest is already in the slot; this is what the Controller records as borrowed.`
      : `${pair(c)} debt — the market's own \`total_debt\`${atBlock(c)}, in ${c.borrowedSymbol ?? "the borrowed token"}, its own borrowed token. No dollar is asserted: this market does not borrow crvUSD, so the figure stays in its own unit. Interest is already in the slot, read straight from the Controller.`,
    contract: controllerContract(c),
    via: `${LANE} · Controller.total_debt @ head`,
  }),
);

// ── market-level: band geometry ──────────────────────────────────────────────

/** Amplification A — the AMM's immutable A(): band density, how gradually
 *  soft-liquidation converts. */
export const llamaAmplificationProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("AMM.A", c),
    summary: `${pair(c)} amplification A — the market AMM's own \`A()\`${atBlock(c)}: band density, how many bands the LLAMMA packs per price doubling and so how GRADUAL soft-liquidation is. Immutable per market (10…500 on the live roster), read straight from the AMM.`,
    contract: ammContract(c),
    via: `${LANE} · AMM.A() @ head`,
  }),
);

/** A governance discount — loan_discount sizes borrowing power, liquidation_
 *  discount arms hard liquidation. Both 1e18 fractions on the Controller. */
export const llamaDiscountProv = stamped((which: "loan" | "liquidation", c: LlamalendMarketCoords): Provenance => {
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
});

// ── market-level: rate ───────────────────────────────────────────────────────

/** Borrow APR — the market's OWN monetary policy rate (per-second, 1e18)
 *  annualized by simple multiplication. */
export const llamaBorrowRateProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${pair(c)} borrow APR — the market's OWN monetary policy \`rate\`${atBlock(c)} (a per-second rate at 1e18) annualized by simple multiplication (× ${SECONDS_PER_YEAR.toLocaleString("en-US")} seconds/year, the same reading Curve's own UI leads with). Lend-market policies take the controller as argument, mint-market policies take none — whichever the policy answers. The rate the contract itself applies this block.`,
    contract: policyContract(c),
    via: `${LANE} · monetary_policy.rate() × seconds/year @ head`,
  }),
);

// ── market-level: activity + utilisation ─────────────────────────────────────

/** Open loans — Controller.n_loans(), the live position counter. */
export const llamaOpenLoansProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("Controller.n_loans", c),
    summary: `${pair(c)} open loans — the market's own \`n_loans\`${atBlock(c)}: how many positions the Controller currently carries. A live counter slot, read straight.`,
    contract: controllerContract(c),
    via: `${LANE} · Controller.n_loans @ head`,
  }),
);

/** Utilisation — debt over its own denominator. A mint market meters against the
 *  factory's crvUSD debt ceiling; a lend/V2 market against lender-funded
 *  liquidity (debt + the borrowed token still on the Controller). */
export const llamaUtilisationProv = stamped((c: LlamalendMarketCoords): Provenance => {
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
});

// ── market-level: oracle price ───────────────────────────────────────────────

/** The AMM's own oracle price — price_oracle(), collateral priced in the
 *  borrowed token (the price the LLAMMA converts against). */
export const llamaPriceOracleProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    source: { block: c.blockNumber },
    verify: recompute("AMM.price_oracle", c),
    summary: `${pair(c)} oracle price — the market AMM's own \`price_oracle()\`${atBlock(c)} (1e18): the collateral priced in the borrowed token, the price the LLAMMA itself converts collateral against inside its bands. Read straight from the AMM${c.borrowedIsCrvusd ? "; the borrowed token is crvUSD (~$1), so this reads as dollars at par" : `, in ${c.borrowedSymbol ?? "the borrowed token"} — no dollar asserted`}.`,
    contract: ammContract(c),
    via: `${LANE} · AMM.price_oracle() @ head`,
  }),
);

// ── roster summary (block-level; no single contract) ─────────────────────────

/** Open loans across the whole roster — Σ of each market's own n_loans. */
export const llamaSummaryLoansProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `Open loans across the roster — Σ over every listed market of its own \`n_loans\`${atBlock(c)}. Each leg a live Controller counter read; the sum is ours.`,
    via: `${LANE} · Σ Controller.n_loans over the roster @ head`,
    formula: "Σ n_loans over the roster",
  }),
);

/** Borrowed on the crvUSD markets — Σ total_debt over ONLY the crvUSD-borrowed
 *  markets, read as dollars at par (the others excluded, never converted). */
export const llamaSummaryDebtProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `Borrowed on the crvUSD markets — Σ \`total_debt\` over ONLY the markets whose borrowed token is crvUSD${atBlock(c)}. crvUSD is $-pegged, so the sum reads as dollars at par (~$1 the unit); the markets that borrow WETH / tBTC / ynETH / CRV are excluded, never converted. Each leg a live Controller read; the sum is ours.`,
    via: `${LANE} · Σ Controller.total_debt over the crvUSD markets @ head`,
    formula: "Σ total_debt over the crvUSD markets",
  }),
);

// ── one market's page (ui-jobs 549 step 7) ───────────────────────────────────

/** A market's identity: its Controller, AMM and monetary policy, the row's
 *  receipt on the roster and the head's subtitle on its page. */
export const llamaMarketIdentityProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${pair(c)} — one isolated LlamaLend market, keyed by its Controller. Its AMM (LLAMMA) holds the collateral in bands; its monetary policy sets the rate. Listed by its factory's own roster${atBlock(c)}.`,
    contract: controllerContract(c),
    via: `${LANE} · factory roster → Controller.amm(), Controller.monetary_policy() @ head`,
    inputs: [
      { label: "controller", value: c.controller, kind: "chain", contract: controllerContract(c) },
      { label: "AMM (LLAMMA)", value: c.amm, kind: "chain", contract: ammContract(c) },
      { label: "monetary policy", value: c.monetaryPolicy, kind: "chain", contract: policyContract(c) },
    ],
  }),
);

/** Σ total_debt over one roster group's markets, all lending crvUSD. */
export const llamaGroupDebtProv = stamped(
  (group: string, c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `Borrowed on the ${group} markets — Σ \`total_debt\` over the group's markets${atBlock(c)}, every one lending crvUSD, so the sum is in crvUSD. Each leg a live Controller read; the sum is ours.`,
    via: `${LANE} · Σ Controller.total_debt over the group @ head`,
    formula: "Σ total_debt over the group",
  }),
);

/** Σ n_loans over one roster group's markets. */
export const llamaGroupLoansProv = stamped(
  (group: string, c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `Open loans on the ${group} markets — Σ \`n_loans\` over the group's markets${atBlock(c)}.`,
    via: `${LANE} · Σ Controller.n_loans over the group @ head`,
    formula: "Σ n_loans over the group",
  }),
);

/** The borrowed token on the Controller: free to borrow now. */
export const llamaAvailableProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("borrowedToken.balanceOf(controller)", c),
    summary: `${pair(c)} available — the borrowed token's own \`balanceOf(controller)\`${atBlock(c)}: what a new loan can draw now. ${c.utilisationBasis === "crvUSD debt ceiling" ? "On a mint market the factory mints crvUSD onto the Controller up to the debt ceiling, so this is the room left under it." : "On a lend market it is the lenders' deposits not lent."}`,
    contract: controllerContract(c),
    via: `${LANE} · borrowedToken.balanceOf(controller) @ head`,
  }),
);

/** A lend market's supplied total: what is lent plus what is available. */
export const llamaSuppliedProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${pair(c)} supplied — lenders' deposits: the market's \`total_debt\` plus the borrowed token still on the Controller${atBlock(c)}. The utilisation's denominator.`,
    contract: controllerContract(c),
    via: `${LANE} · Controller.total_debt + borrowedToken.balanceOf(controller) @ head`,
    formula: "total_debt + balanceOf(controller)",
  }),
);

/** A mint market's debt ceiling, from the crvUSD ControllerFactory. */
export const llamaCeilingProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("ControllerFactory.debt_ceiling(controller)", c),
    summary: `${pair(c)} debt ceiling — the crvUSD ControllerFactory's \`debt_ceiling(controller)\`${atBlock(c)}: the most crvUSD this mint market may have out. Set by Curve's governance.`,
    contract: { name: "crvUSD ControllerFactory", address: LLAMALEND_ADDRESSES.CRVUSD_FACTORY },
    via: `${LANE} · ControllerFactory.debt_ceiling(controller) @ head`,
  }),
);

/** What a lend market's vault pays lenders now: Vault.lend_apr(). */
export const llamaSupplyRateProv = stamped(
  (vault: string | null, c: LlamalendMarketCoords): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("Vault.lend_apr", c),
    summary: `${pair(c)} supply rate — the market's ERC-4626 vault's own \`lend_apr()\`${atBlock(c)} (1e18 fraction a year, an APR): the interest borrowers are charged now, spread over every lender's deposit, less any fee the market takes.`,
    contract: { name: `${pair(c)} vault`, address: vault ?? undefined },
    via: `${LANE} · Vault.lend_apr() @ head`,
  }),
);

/** The rate the AMM charges borrowers now: AMM.rate() a year. */
export const llamaChargedRateProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("AMM.rate", c),
    summary: `${pair(c)} rate charged now — the AMM's stored \`rate()\`${atBlock(c)} (per second at 1e18) × ${SECONDS_PER_YEAR.toLocaleString("en-US")} seconds a year. Interest accrues at this rate until the next loan action, when the Controller writes the monetary policy's rate in its place.`,
    contract: ammContract(c),
    via: `${LANE} · AMM.rate() × seconds/year @ head`,
  }),
);

/** The semi-log curve: the policy's min_rate and max_rate. */
export const llamaCurveProv = stamped(
  (c: LlamalendMarketCoords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${pair(c)} rate curve — the monetary policy's \`min_rate()\` and \`max_rate()\`${atBlock(c)} (per second at 1e18, × ${SECONDS_PER_YEAR.toLocaleString("en-US")} a year). The policy sets the borrow rate at utilisation U to min × (max ÷ min)^U; Rails draws the curve only where that formula gives back the policy's own \`rate(controller)\` at this block.`,
    contract: policyContract(c),
    via: `${LANE} · monetary_policy.min_rate(), max_rate() @ head`,
    formula: "rate(U) = min_rate × (max_rate ÷ min_rate)^U",
  }),
);
