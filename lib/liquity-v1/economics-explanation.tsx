// Liquity V1's Lifetime flows panel: the redemption net outcome as a bullet of
// the Explanation's Totals (at each redemption's price and at today's). The
// panel's other lines are lib/shared/liquity-flows-explanation.tsx
// (LiquityV1FlowsNote); its "?" is `L5.flows` in content/liquity-v1/event-prose.yaml.

import type { ReactNode } from "react";
import type { LiquityV1RedemptionTotals } from "@/lib/liquity-v1/economics";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { fmtEth, fmtLusd, fmtUsd, fmtUsdSigned } from "@/lib/liquity-v1/event-figures";

/** The redemption net outcome, a bullet of the panel's Totals: the net at each
 *  redemption's price, and at today's price. */
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
            "Redemption net outcome at the latest block's price — the LUSD the redeemers paid in, counted at $1, less the ETH they took valued at the PriceFeed price at the latest block.",
          formula: "LUSD redeemed − ETH taken × price now",
          inputs: [
            { label: "LUSD redeemed", value: fmtLusd(t.lusdRedeemed), kind: "chain-derived" },
            { label: "ETH taken", value: fmtEth(t.ethTaken), kind: "chain-derived" },
            { label: "price now", value: fmtUsd(priceNow as number), kind: "chain", pclass: "oracle" },
          ],
        }
      : null;
  const shownThen = Math.abs(netThen) < 0.005 ? 0 : netThen;
  return (
    // A bullet of the Lifetime flows Explanation's Totals.
    <li className="flex items-start gap-2" data-anatomy="F13·liquity" data-flows-outcome="">
      <span aria-hidden className="select-none">
        •
      </span>
      <span className="min-w-0">
        Redemptions:{" "}
        <Prov info={thenProv}>
          <span className="font-medium tabular-nums">{fmtUsdSigned(shownThen)}</span>
        </Prov>{" "}
        at the redemption prices
        {netNow != null && nowProv && (
          <>
            ,{" "}
            <Prov info={nowProv}>
              <span className="font-medium tabular-nums">{fmtUsdSigned(netNow)}</span>
            </Prov>{" "}
            at the latest block&apos;s price, against having held the ETH
          </>
        )}
      </span>
    </li>
  );
}
