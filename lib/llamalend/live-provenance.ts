// Provenance vocabulary for the LlamaLend live position reads — the
// soft-liquidation surface's sources (/api/chain/llamalend/position). One
// multicall against the position's own two contracts, and the vocabulary
// names three kinds of source:
//
//   • STATE — user_state(user) legs (collateral / converted / debt / N) and
//     read_user_tick_numbers: live eth_calls at the latest block. The
//     CONVERTED amount is the distinctive one — it lives in NO event, and its
//     receipt cites the cross-check: AMM.get_sum_xy(user).x equals
//     user_state.stablecoin wei-exact (130/130 measured), two contracts
//     agreeing on the same figure — and it states THIS read's outcome, passed
//     in, not the promise of one.
//   • BAND-DERIVED — pUp / pDown / health: chain-derived over state inputs
//     (graded `state` EXPLICITLY — the kind-default would drift them to
//     oracle, and they are integer functions of A, base_price and the ticks,
//     not prices from a feed). The band math is the deployed integer pair
//     (ln_int + the solmate expWad port), proven BigInt-exact against the
//     AMM's own p_oracle_up / p_oracle_down reads.
//   • ORACLE — price_oracle(): the AMM's own price of the collateral in the
//     BORROWED token. USD language only where that token IS crvUSD (~$1).

import type { Provenance, ProvVerify } from "@/components/shared/provenance";

const LANE_VIA = "GET /api/chain/llamalend/position";

const controllerOf = (controller?: string) => ({ name: "LlamaLend Controller", address: controller ?? "" });
const ammOf = (amm?: string) => ({ name: "LLAMMA AMM", address: amm ?? "" });

const recompute = (text: string): ProvVerify => ({ kind: "recompute", text });

/** ⇒ THE DISTINCTIVE LANE: the converted / soft-liquidation amount.
 *
 *  `crossCheckExact` is the per-read OUTCOME of the two-contract cross-check
 *  (the response's `convertedCrossCheckExact`), so the receipt states what
 *  happened at this block rather than promising that it records it: true = the
 *  two answers matched, false = they differed, null = the AMM's leg did not
 *  land. The card's own surface carries only the plain-words caution for the
 *  `false` case; the machinery stays here. */
export function llamalendConvertedProv(
  borrowedSymbol: string,
  crossCheckExact: boolean | null,
  controller?: string,
  amm?: string,
): Provenance {
  const crossCheck =
    crossCheckExact == null
      ? "The cross-check did not land at this block: the AMM's own get_sum_xy(user) rode the same multicall but returned nothing, so the Controller's answer stands alone behind this figure."
      : crossCheckExact
        ? "Cross-checked in the same multicall against the AMM's own get_sum_xy(user).x: the two answers matched to the wei at this block — two contracts, one figure."
        : "Cross-checked in the same multicall against the AMM's own get_sum_xy(user).x: the two answers DIFFERED at this block, so the reads most likely straddled a trade in the AMM — re-read both at one head to settle it.";
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute(
      "Re-run TWO independent eth_calls: the Controller's user_state(user) — this figure is its `stablecoin` leg — and the AMM's get_sum_xy(user), whose .x must equal it EXACTLY (measured wei-exact on 130/130 in-soft-liquidation positions). Two contracts agreeing on the same integer is the proof this surface is read from the chain, not inference — the figure lives in NO event, which is why it is a state read.",
    ),
    summary: `${borrowedSymbol} the LLAMMA AMM has ALREADY converted from this position's collateral — user_state(user).stablecoin, read live. > 0 means the position is in SOFT-liquidation right now: the oracle price is inside its band, and the AMM is converting collateral to the borrowed token continuously, in place, with no per-user event. ${crossCheck}`,
    contract: controllerOf(controller),
    via: `${LANE_VIA} · user_state @ head · stablecoin leg ≡ AMM.get_sum_xy(user).x`,
    inputs: [
      { label: "user_state.stablecoin", kind: "chain", pclass: "state", note: "the Controller's answer" },
      { label: "get_sum_xy(user).x", kind: "chain", pclass: "state", note: `the AMM's answer (${amm ?? "AMM"})` },
    ],
  };
}

/** A band edge — pUp (onset) or pDown (fully liquidated). Chain-derived over
 *  state inputs; graded `state` EXPLICITLY. */
export function llamalendBandEdgeProv(
  edge: "pUp" | "pDown",
  borrowedSymbol: string,
  isCrvusd: boolean,
  amm?: string,
): Provenance {
  const unit = isCrvusd ? `${borrowedSymbol} (~$1)` : borrowedSymbol;
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: recompute(
      `Re-run the AMM's own ${edge === "pUp" ? "p_oracle_up(n1)" : "p_oracle_down(n2)"} eth_call — it reproduces this figure to the wei. The rendered number comes from the deployed integer math itself (the Vault's ln_int for LOG_A_RATIO and the AMM's solmate-expWad power), ported bit-for-bit and verified BigInt-exact against those reads across A ∈ {10…500} and negative ticks — never a float approximation.`,
    ),
    summary:
      edge === "pUp"
        ? `The price where SOFT-liquidation begins for this position — base_price · ((A−1)/A)^n1, the top of its band, in ${unit} per collateral token. At this price health reads exactly 1.0; below it the AMM starts converting collateral. Derived from three same-block state reads (A, get_base_price, n1) by the deployed integer formula — chain-derived over state, not an oracle figure.`
        : `The price where this position is FULLY converted — base_price · ((A−1)/A)^(n2+1), the bottom of its band, in ${unit} per collateral token. Below it nothing remains as collateral (everything is the borrowed token) and hard liquidation arms. A second risk coordinate no other protocol on this roster has. Derived from three same-block state reads by the deployed integer formula.`,
    contract: ammOf(amm),
    via: `${LANE_VIA} · exact ln_int/expWad port over A + get_base_price + ticks (≡ ${
      edge === "pUp" ? "p_oracle_up(n1)" : "p_oracle_down(n2)"
    })`,
    formula: edge === "pUp" ? "base_price · ((A−1)/A)^n1" : "base_price · ((A−1)/A)^(n2+1)",
    inputs: [
      { label: "A", kind: "chain", pclass: "state", note: "AMM.A() — immutable amplification" },
      { label: "base_price", kind: "chain", pclass: "state", note: "AMM.get_base_price() @ head" },
      { label: edge === "pUp" ? "n1" : "n2", kind: "chain", pclass: "state", note: "read_user_tick_numbers @ head" },
    ],
  };
}

/** The AMM's own oracle price — collateral in the borrowed token. */
export function llamalendOraclePriceProv(
  collateralSymbol: string,
  borrowedSymbol: string,
  isCrvusd: boolean,
  amm?: string,
): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: recompute("Re-run the AMM's price_oracle eth_call against any node."),
    summary: `${collateralSymbol} priced in ${borrowedSymbol} — the AMM's own price_oracle() at the latest block (1e18), the same price the LLAMMA conversion mechanism trades against. ${
      isCrvusd
        ? "The borrowed token is crvUSD (~$1), so this reading is presented as USD — unit: crvUSD, the protocol's own denomination."
        : `⚠️ This market borrows ${borrowedSymbol}, NOT crvUSD — the price stays in ${borrowedSymbol} and no dollar figure is asserted from it.`
    }`,
    contract: ammOf(amm),
    via: `${LANE_VIA} · price_oracle @ head`,
  };
}

/** health = price_oracle ÷ pUp — a ratio of two same-unit prices. */
export function llamalendHealthProv(amm?: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: recompute(
      "Re-run the AMM's price_oracle and p_oracle_up(n1) eth_calls and divide — both legs are same-block chain reads in the same unit; only the division is arithmetic. (This deliberately differs from the Controller's health(), which incorporates the liquidation discount and value-above-band accounting; the band ratio is the price-distance read, and each is labeled as itself.)",
    ),
    summary:
      "How far the price stands above the soft-liquidation onset — the collateral price over this position's band top, price_oracle ÷ pUp: two prices in the same unit at the same block. Exactly 1.0 at the band's top; below 1.0 the position is inside its band and the AMM is converting. The division is client arithmetic over two chain reads, graded state because every input is.",
    contract: ammOf(amm),
    via: `${LANE_VIA} · price_oracle ÷ derived pUp (same block)`,
    formula: "price_oracle ÷ pUp",
    inputs: [
      { label: "price_oracle", kind: "chain", pclass: "oracle", note: "the AMM's own price @ head" },
      { label: "pUp", kind: "chain-derived", pclass: "state", note: "exact band math over A, base_price, n1" },
    ],
  };
}

/** Band count N — how many bands the collateral is spread across. */
export function llamalendBandCountProv(controller?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("Re-run the Controller's user_state eth_call — N is its fourth leg."),
    summary:
      "The number of bands this position's collateral is spread across — user_state's fourth leg, chosen at open (4…50). More bands means a wider, more gradual soft-liquidation range; fewer concentrates it.",
    contract: controllerOf(controller),
    via: `${LANE_VIA} · user_state @ head · N leg`,
  };
}
