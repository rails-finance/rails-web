// Tower and card receipts for the INDEX-FREE Comet lane.
// ----------------------------------------------------------------------------
// The Ethereum tower and the Base one run the same arithmetic (economics.ts is
// shared), but they are not making the same claims, and the receipt is where
// that has to be said rather than glossed:
//
//   • The CURRENT figures on a swept explorer are direct reads of the Comet
//     itself at a pinned block — `balanceOf` / `borrowBalanceOf` for the base,
//     `collateralBalanceOf` for each collateral asset. On Ethereum the
//     collateral lines are a REPLAY of captured logs (exact, because collateral
//     does not accrue), and the base's current value is a head-lagged refresher
//     read. Same numbers, different provenance: these carry the `state` class
//     and name the call, not a replay.
//   • The LIFETIME sums come from a chunked sweep of the Comet's own logs run
//     for this request, from the market's first block, not from a captured
//     history. That is what lets these say "every event the Comet has emitted
//     for this account" where the Ethereum wording has to say "captured
//     history" — and it is why the page shows them only when the sweep read
//     every block, which the page states under the timeline.
//
// Reusing Ethereum's receipts here would have named a rails-server index that
// does not exist behind these pages, described a replay that did not produce
// the collateral figures, and called a fresh pinned read "head-lagged". All
// three read as correct until followed. Mirrors lib/aave-v3/swept-tower-
// provenance.ts, which did the same for the V3 family.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import type { CompoundTowerVocabulary } from "./economics";
import { type CompoundCoords, type CompoundLifetimeFlow } from "./event-provenance";

const cometContract = (coords?: CompoundCoords) => ({
  name: coords?.marketLabel ? `Comet (${coords.marketLabel})` : "Comet",
  address: coords?.comet ?? "0x0000000000000000000000000000000000000000",
});

const SWEEP_VIA = "live chunked eth_getLogs sweep of the Comet's own logs from its first block";

const stateVerify = (method: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the Comet.${method} eth_call at block ${block} against an archive node`
      : `Re-run the Comet.${method} eth_call against any node`,
});

const FLOW_STORY: Record<CompoundLifetimeFlow, string> = {
  deposited: "the base this account lent in (supplies while the running balance was ≥ 0)",
  withdrawn: "the lent base withdrawn back out (withdrawals down to a zero balance)",
  borrowed: "the base drawn below zero — Comet's borrow is a withdrawal past the account's own balance",
  repaid: "the base supplied back against a negative balance — Comet's repay is a supply that clears debt first",
  "absorbed debt": "the negative base the protocol cleared for this account in liquidations (AbsorbDebt)",
  "supplied collateral": "every collateral amount this account supplied",
  "withdrawn collateral": "every collateral amount this account withdrew back out",
  "absorbed collateral": "the collateral the protocol seized in liquidations (AbsorbCollateral)",
  "received collateral":
    "collateral moved IN from another Comet account (transferAsset) — custody arrived here without a fresh deposit",
  "transferred collateral":
    "collateral moved OUT to another Comet account (transferAsset) — custody left here without a withdrawal to a wallet",
};

/** The swept-lane receipts. One constant rather than a factory: the market's
 *  identity already rides on every call's coords (`comet`, `marketLabel`), so
 *  nothing about a Comet deployment is left for a factory to bind. */
export const COMPOUND_SWEPT_VOCABULARY: CompoundTowerVocabulary = {
  positionBase: (sym, side, coords): Provenance => ({
    kind: "chain-derived",
    pclass: "emitted",
    summary: `Base ${side === "lend" ? "lent" : "borrowed"} (${sym}) — the account's net base PRINCIPAL, replayed from every Supply, Withdraw, AbsorbDebt and account-to-account Transfer the Comet has emitted for it since the market's first block, in log order. ${side === "lend" ? "Positive base: it earns the supply rate." : "Negative base: it pays the borrow rate."} Principal only — interest accrues with no log to replay, so the live balance above sits apart from this by exactly the interest.`,
    contract: cometContract(coords),
    via: `${SWEEP_VIA} · Σ ±amount across Supply/Withdraw/AbsorbDebt/Transfer logs`,
  }),

  currentBase: (sym, side, coords, block): Provenance => ({
    kind: "chain",
    pclass: "state",
    verify: stateVerify(side === "lend" ? "balanceOf" : "borrowBalanceOf", block),
    summary: `Current ${sym} base with accrued interest — the ${side === "lend" ? "lent balance the account has earned to (supply rate applied)" : "debt the account owes (borrow rate applied)"}, read straight from the Comet with \`${side === "lend" ? "balanceOf" : "borrowBalanceOf"}\`${block != null ? ` pinned to block ${block.toLocaleString("en-US")}` : ""}. The Comet applies its own index in the call, so this is the true current amount; the principal replayed from the events sits apart from it by exactly the interest.`,
    contract: cometContract(coords),
    via: `Comet · ${side === "lend" ? "balanceOf" : "borrowBalanceOf"} at the pinned block`,
    inputs:
      block != null
        ? [{ label: "block", value: String(block), kind: "chain", pclass: "state", note: "chain read block" }]
        : [],
  }),

  positionCollateral: (sym, coords): Provenance => ({
    kind: "chain",
    pclass: "state",
    verify: stateVerify("collateralBalanceOf", coords.blockNumber),
    summary: `The ${sym} collateral the account holds — read straight from the Comet with \`collateralBalanceOf\`${coords.blockNumber != null ? ` pinned to block ${coords.blockNumber.toLocaleString("en-US")}` : ""}. Collateral does not accrue in Comet, so this is also exactly what a replay of the account's own collateral supplies, withdrawals, transfers and absorptions arrives at — the timeline's running balance is checked against it.`,
    contract: cometContract(coords),
    via: "Comet · collateralBalanceOf at the pinned block",
  }),

  lifetimeFlow: (flow, sym, coords): Provenance => ({
    kind: "chain-derived",
    pclass: "emitted",
    summary: `Lifetime ${flow} (${sym}) — ${FLOW_STORY[flow]}, summed over every event the Comet has emitted for this account since the market's first block. Base flows split at the running balance's zero crossings — Comet's own semantics (a supply repays debt first; a withdraw past the balance is a borrow). Shown only when the sweep read every block of the market's life, and when the replayed collateral matches the Comet's own \`collateralBalanceOf\`.`,
    contract: cometContract(coords),
    via: `${SWEEP_VIA} · Σ amount across the account's own logs · split at zero crossings`,
  }),

  accruedBase: (sym, side, coords): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    summary: `Interest ${side === "borrow" ? "accrued on the borrow" : "earned on the supply"} (${sym}) — the Comet's own \`${side === "borrow" ? "borrowBalanceOf" : "balanceOf"}\` (which already includes interest) minus the principal replayed from every base move the Comet has emitted for this account since the market's first block. Comet accrues by index with no log of its own, so the difference between what the contract says and what the events moved IS the interest. Shown only when the sweep read every block and the subtraction lands inside its own plausibility bounds.`,
    contract: cometContract(coords),
    via: `Comet ${side === "borrow" ? "borrowBalanceOf" : "balanceOf"} − (${SWEEP_VIA} · Σ replayed base amounts)`,
    formula: "current − net principal",
    inputs: [
      {
        label: "current",
        kind: "chain",
        pclass: "state",
        note: "Comet balanceOf / borrowBalanceOf at the pinned block",
      },
      { label: "net principal", kind: "chain-derived", pclass: "emitted", note: "Σ over the swept logs" },
    ],
  }),

  debtPrincipal: (sym, coords): Provenance => ({
    kind: "chain-derived",
    pclass: "emitted",
    summary: `Borrowed ${sym} PRINCIPAL — the net of every draw, repayment and liquidation absorption the account's own Comet events moved, over every event the Comet has emitted for it since the market's first block. Principal only — the interest accrued since each draw is the separate accrued segment above it (principal + interest = the Comet's own borrowBalanceOf).`,
    contract: cometContract(coords),
    via: `${SWEEP_VIA} · Σ (borrowed − repaid − absorbed) · first block → head`,
  }),
};
