// Liquity V2's position-card face receipts — the collateral / debt / rate /
// USD / ratio / liquidation-price provenance the trove card states. Built
// against the displayed figures (the live TroveManager read when it has
// landed, the trove's last logged state otherwise), so each receipt's sentence
// is the one that is true of the value on the face.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { LiquityFaceProvContext } from "@/components/protocol/liquity-family/types";
import { formatNum, formatUsd } from "@/lib/shared/format-event";
import { stateOriginVia } from "@/lib/shared/trove-state-origin";
import { scalingOf, TROVE_MANAGER } from "@/lib/liquity/event-provenance";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";

export { trovePeakCollProv, trovePeakDebtProv } from "@/lib/liquity/trove-provenance";

export interface LiquityFaceProv {
  coll: Provenance;
  debt: Provenance;
  rate: Provenance;
  collUsd: Provenance;
  cr: Provenance;
  liq: Provenance;
}

export function liquityTroveFaceProv(ctx: LiquityFaceProvContext): LiquityFaceProv {
  const { v, live, coll, debt, priceUsd, mcrPct } = ctx;
  // V2 TroveManager per branch — the contract these chain values ultimately
  // come from (the provenance "contract" slot). Whether read live on-chain or
  // via the rails-server index, the origin is this contract's trove state.
  const tm = TROVE_MANAGER[v.collateralType.toLowerCase()];
  const tmContract = { name: "TroveManager", address: tm };
  const sym = v.collateralType;
  const collStr = `${formatNum(coll, 3)} ${v.collateralType}`;
  const debtStr = `${formatNum(debt)} BOLD`;
  const isLive = live != null; // entire balances are the on-chain read; else the indexed snapshot
  // The trove's own state — a live TroveManager read at head (`state`) or the
  // rails-index snapshot (`indexed`) when the live read hasn't resolved. Never
  // an emitted log field: these are the *current* entire balances, not a delta.
  const stateClass = isLive ? ("state" as const) : ("indexed" as const);
  // The live read's own integers, when it delivered them: getLatestTroveData's
  // entireColl / entireDebt / annualInterestRate. A call's return value, so the
  // sentence says the contract returns it (the logged fallback has no raw here
  // and draws no sentence).
  const collPlaces = LIQUITY_V2_BRANCHES[v.collateralType.toLowerCase()]?.decimals ?? 18;
  const callScaling = (s: ReturnType<typeof scalingOf>) => (s ? { ...s, from: "call" as const } : undefined);
  const collScaling = callScaling(scalingOf(null, { scale: collPlaces, raw: live?.entireCollRaw }, { token: sym }));
  const debtScaling = callScaling(scalingOf(null, { scale: 18, raw: live?.entireDebtRaw }, { token: "BOLD" }));
  const rateScaling = callScaling(scalingOf(null, { scale: 16, raw: live?.annualInterestRateRaw }, "rate"));
  const collProv: Provenance = {
    kind: "chain",
    pclass: stateClass,
    summary: isLive
      ? `Collateral held by the trove — the trove's full ${sym} balance as the TroveManager contract reports it now, including any share of liquidated troves' collateral that is waiting to be added to the trove.`
      : `Collateral held by the trove — the ${sym} balance the contract logged at the trove's most recent change.`,
    contract: tmContract,
    via: stateOriginVia(isLive, "entire collateral"),
    scaling: collScaling,
  };
  const debtProv: Provenance = {
    kind: "chain",
    pclass: stateClass,
    summary: isLive
      ? "The trove's debt — what the trove owes now, as the TroveManager contract reports it: the debt at the trove's last change, plus the interest built up since and any share of liquidated troves' debt passed to it."
      : v.isBatched
        ? "The trove's debt — the trove's share of its delegate batch's total debt, as the contract logged it at the trove's most recent change. Interest has built up since then."
        : "The trove's debt — the debt the contract logged at the trove's most recent change. Interest has built up since then.",
    contract: tmContract,
    via: stateOriginVia(isLive, "entire debt"),
    scaling: debtScaling,
  };
  const rateProv: Provenance = {
    kind: "chain",
    pclass: stateClass,
    summary:
      "Annual interest rate — the yearly rate the trove pays on its debt. The owner sets it, or the delegate sets it when the trove is in a delegate's batch.",
    contract: tmContract,
    via: stateOriginVia(isLive, "annual interest rate"),
    scaling: rateScaling,
  };
  // Shared atomic leaves so the collateral-USD and collateral-ratio flows expand
  // to the same source values in the spine (state reads + one oracle price).
  const collLeaf: ProvInput = {
    label: "collateral",
    value: collStr,
    kind: "chain",
    pclass: stateClass,
    contract: tmContract,
  };
  const debtLeaf: ProvInput = {
    label: "debt",
    value: debtStr,
    kind: "chain",
    pclass: stateClass,
    contract: tmContract,
  };
  // The collateral's USD price from Liquity's on-chain oracle — an oracle read,
  // one step of external trust beyond the trove's own state (the weakest link
  // any USD-priced value inherits).
  const priceLeaf: ProvInput[] = priceUsd
    ? [
        {
          // Labelled "price" to match the formulas that name it (the pair rides
          // the note) — the inspector traces operands by label.
          label: "price",
          value: formatUsd(priceUsd),
          kind: "chain-derived",
          pclass: "oracle",
          note: `${v.collateralType} / USD — Liquity on-chain oracle (PriceFeed)`,
        },
      ]
    : [];
  const collUsdProv: Provenance = {
    kind: "chain-derived",
    summary: `Collateral value in USD — the collateral multiplied by Liquity's current price for ${sym}.`,
    formula: "collateral × price",
    inputs: [collLeaf, ...priceLeaf],
  };
  const crProv: Provenance = {
    kind: "chain-derived",
    summary: `Collateral ratio — the collateral's dollar value divided by the debt, at Liquity's current price for ${sym}.`,
    formula: "(collateral × price) ÷ debt × 100",
    inputs: [collLeaf, ...priceLeaf, debtLeaf],
  };
  const liqProv: Provenance = {
    kind: "derived",
    summary: `Liquidation price — the ${sym} price at which the trove's collateral ratio would equal the branch's minimum${mcrPct != null ? ` of ${mcrPct}%` : ""}. Below that price the trove can be liquidated.`,
    formula: "debt × MCR ÷ collateral",
    inputs: [
      debtLeaf,
      { label: "MCR", value: `${mcrPct ?? "—"}%`, kind: "chain", pclass: "indexed", note: "branch constant" },
      collLeaf,
    ],
  };
  return { coll: collProv, debt: debtProv, rate: rateProv, collUsd: collUsdProv, cr: crProv, liq: liqProv };
}
