// Liquity V1's Lifetime flows panel: the redemption net outcome on the
// Explanation's heading row (at each redemption's price and at today's) and
// the panel's "?" content. The panel's own lines are
// lib/shared/liquity-flows-explanation.tsx (LiquityV1FlowsNote).

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { LiquityV1RedemptionTotals } from "@/lib/liquity-v1/economics";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { fmtEth, fmtLusd, fmtUsd, fmtUsdSigned } from "@/lib/liquity-v1/event-figures";

/** The redemption net-outcome strip on the panel's heading row (the V2
 *  panel's rowExtra): the net at each redemption's price, and at today's price. */
export function liquityV1RedemptionOutcome(t: LiquityV1RedemptionTotals | null, priceNow?: number | null): ReactNode {
  if (!t) return undefined;
  const netThen = t.lusdRedeemed - t.ethValueAtRedemption;
  const thenProv: Provenance = {
    kind: "derived",
    summary:
      "Redemption net outcome — the LUSD the redeemers paid in, counted at $1, less the ETH they took valued at the PriceFeed price at each redemption's block.",
    formula: "LUSD redeemed − ETH taken × price at each redemption",
    inputs: [
      { label: "LUSD redeemed", value: fmtLusd(t.lusdRedeemed), kind: "chain-derived" },
      {
        label: "ETH taken, at redemption prices",
        value: fmtUsd(t.ethValueAtRedemption),
        kind: "chain-derived",
        pclass: "oracle",
      },
    ],
  };
  const netNow = priceNow != null && priceNow > 0 ? t.lusdRedeemed - t.ethTaken * priceNow : null;
  const nowProv: Provenance | null =
    netNow != null
      ? {
          kind: "derived",
          summary:
            "Redemption net outcome at today's price — the LUSD the redeemers paid in, counted at $1, less the ETH they took valued at the PriceFeed price now.",
          formula: "LUSD redeemed − ETH taken × price now",
          inputs: [
            { label: "LUSD redeemed", value: fmtLusd(t.lusdRedeemed), kind: "chain-derived" },
            { label: "ETH taken", value: fmtEth(t.ethTaken), kind: "chain-derived" },
            { label: "price now", value: fmtUsd(priceNow as number), kind: "chain", pclass: "oracle" },
          ],
        }
      : null;
  const tone = (n: number) => (n >= 0 ? "text-green-400" : "text-red-400");
  const shownThen = Math.abs(netThen) < 0.005 ? 0 : netThen;
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 pl-2 text-xs text-rb-500"
      data-anatomy="F13·liquity"
    >
      <span>Owner&apos;s net outcome from redemptions was</span>
      <Prov info={thenProv}>
        <span className={tone(shownThen)}>{fmtUsdSigned(shownThen)}</span>
      </Prov>
      <span>at the redemption prices</span>
      {netNow != null && nowProv && (
        <>
          <span>and</span>
          <Prov info={nowProv}>
            <span className={tone(netNow)}>{fmtUsdSigned(netNow)}</span>
          </Prov>
          <span>against having held the ETH</span>
        </>
      )}
    </div>
  );
}

const LIQUITY_V1_FAQ = {
  BORROWING: "https://docs.liquity.org/liquity-v1/faq/borrowing",
  REDEMPTIONS: "https://docs.liquity.org/liquity-v1/faq/lusd-redemptions",
  LIQUIDATIONS: "https://docs.liquity.org/liquity-v1/faq/stability-pool-and-liquidations",
} as const;

/** The Lifetime flows panel's "?" for Liquity V1. */
export function liquityV1EconomicsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime Flows",
    intro:
      "This panel adds up everything that moved in and out of the Trove over its life, from each of its events, and shows what it held on any day you move the cursor to.",
    stepsHeading: "How to read it:",
    steps: [
      "The collateral bar (ETH): deposited and redistribution gains came in; withdrawn, taken by redemptions, liquidated and any surplus left to claim went out; the solid part is what is still deposited.",
      "The debt bar (LUSD): borrowed, the one-time borrowing fees, the 200 LUSD liquidation reserve and any redistributed debt came in; repaid, redeemed, liquidated and the reserve burned went out; the solid part is what is owed.",
      "Each flow is valued at Liquity's ETH price at its block and LUSD at $1, so Market move is what ETH's price has done to the collateral since.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "No interest",
        text: "the debt moves only when the owner borrows or repays, or a redemption or liquidation reaches the Trove.",
        sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
      },
      {
        bold: "Debt taken on",
        text: "each draw adds the LUSD received plus a one-time fee; opening also adds the 200 LUSD liquidation reserve, which closing or a full redemption burns.",
        sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
      },
    ],
    links: [
      { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
      { label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS },
      { label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
    ],
  };
}
