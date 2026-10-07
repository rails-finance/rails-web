// The PSM outcome for a Polaris CDP: the net PSM shares' effect on its
// equity, as a sentence (the markdown export) and as a bullet of the Lifetime
// flows Explanation's Totals. Third person; the market's own unit.

import type { ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatCompact, formatExact } from "@/lib/utils/format";
import type { PolarisLifetime } from "./economics";
import { AmountText } from "@/components/shared/amount-text";

const DUST = 1e-9;

const signedText = (n: number, unit: string): string => `${n >= 0 ? "+" : "−"}${formatCompact(Math.abs(n))} ${unit}`;

/** Whether this CDP has any PSM-share activity worth a sentence — either kind
 *  of share priced at settle, or a share row still waiting on a price. */
function hasPsmOutcome(lifetime: PolarisLifetime): boolean {
  return (
    Math.abs(lifetime.psmRedemptionEffectAtSettle) > DUST ||
    Math.abs(lifetime.psmMintEffectAtSettle) > DUST ||
    lifetime.psmRowsUnpriced > 0
  );
}

/** The one sentence describing the PSM's effect on this CDP's equity — the
 *  markdown export states it with these words. */
export function polarisPsmOutcomeSentence(
  lifetime: PolarisLifetime,
  stable: string,
  pethInDebt?: number,
): string | null {
  if (!hasPsmOutcome(lifetime)) return null;
  const netCollLeg = lifetime.collFromPsm - lifetime.collToPsm;
  const netDebtLeg = lifetime.debtFromPsm - lifetime.debtToPsm;
  const todayEffect = pethInDebt != null ? netCollLeg * pethInDebt - netDebtLeg : null;

  let s =
    `The net PSM shares, valued at the feed at each settling block, changed the CDP's equity by ` +
    `${signedText(lifetime.psmEffectAtSettle, stable)}`;
  if (todayEffect != null) {
    s += `; at the latest block's feed price the same legs come to ${signedText(todayEffect, stable)}`;
  }
  if (lifetime.psmRowsUnpriced > 0) {
    s += ` (${lifetime.psmRowsUnpriced} rows carry no price yet)`;
  }
  return `${s}.`;
}

/** The PSM outcome, a bullet of the Lifetime flows Explanation's Totals — the
 *  Polaris mirror of `liquityRedemptionOutcome`. The same figures
 *  `polarisPsmOutcomeSentence` states, each carrying its receipt. Never a verdict: "changed the CDP's equity at the feed" is the
 *  phrase, not "profit" or "P&L" — a PSM share is not this CDP's own trade,
 *  and an open CDP's own position is not scored here. */
export function polarisPsmOutcome(lifetime: PolarisLifetime, stable: string, pethInDebt?: number): ReactNode {
  if (!hasPsmOutcome(lifetime)) return undefined;
  const netCollLeg = lifetime.collFromPsm - lifetime.collToPsm;
  const netDebtLeg = lifetime.debtFromPsm - lifetime.debtToPsm;
  const todayEffect = pethInDebt != null ? netCollLeg * pethInDebt - netDebtLeg : null;

  const signed = (n: number) => (
    <span className="whitespace-nowrap font-medium tabular-nums">
      {n >= 0 ? "+" : "−"}
      <AmountText value={Math.abs(n)} format="compact" /> {stable}
    </span>
  );

  const effectProv: Provenance = {
    kind: "derived",
    summary:
      "The net PSM shares' effect on this CDP's equity — valued at the feed at the end of the block each share settled onto this CDP at its own touch, never the price the PSM's own mints or redemptions used (the share accrued between touches at a different price, and the settling block's own feed is what this CDP's equity is judged against). Each row's share is the net of every mint and redemption since the previous touch; its effect is the pETH it added or took × that feed, minus the debt it added or cleared.",
    formula: "Σ (mintRedeemCollGain × priceAtBlock − mintRedeemDebtGain)",
    inputs: [
      {
        label: "rows whose net share took pETH",
        value: formatExact(lifetime.psmRedemptionEffectAtSettle),
        kind: "derived",
        note: "Σ over rows whose net PSM share moved the collateral down (or, with no collateral leg, the debt)",
      },
      {
        label: "rows whose net share added pETH",
        value: formatExact(lifetime.psmMintEffectAtSettle),
        kind: "derived",
        note: "Σ over rows whose net PSM share moved the collateral up (or, with no collateral leg, the debt)",
      },
      ...(lifetime.psmRowsUnpriced > 0
        ? [
            {
              label: "rows with no price yet",
              value: String(lifetime.psmRowsUnpriced),
              kind: "derived" as const,
              note: "PSM-share rows omitted from the sum until the oracle-at-block lane prices their block",
            },
          ]
        : []),
    ],
  };

  const todayProv: Provenance | null =
    todayEffect != null && pethInDebt != null
      ? {
          kind: "chain-derived",
          summary: `The same PSM legs at the latest block's feed price — the net pETH the PSM's shares moved over the CDP's life, priced at the pETH/${stable} feed, minus the net debt they moved.`,
          formula: "(collFromPsm − collToPsm) × pethInDebt − (debtFromPsm − debtToPsm)",
          inputs: [
            {
              label: "net pETH from PSM",
              value: formatExact(netCollLeg),
              kind: "derived",
              note: "collFromPsm − collToPsm",
            },
            {
              label: "net debt from PSM",
              value: formatExact(netDebtLeg),
              kind: "derived",
              note: "debtFromPsm − debtToPsm",
            },
            {
              label: "latest block's feed price",
              value: formatExact(pethInDebt),
              kind: "chain-derived",
              pclass: "oracle",
              note: "the market's own price feed at head",
            },
          ],
        }
      : null;

  return (
    // A bullet of the Lifetime flows Explanation's Totals.
    <li className="flex items-start gap-2" data-flows-outcome="psm">
      <span aria-hidden className="select-none">
        •
      </span>
      <span className="min-w-0">
        PSM shares:{" "}
        <Prov info={effectProv} value={formatExact(lifetime.psmEffectAtSettle)}>
          {signed(lifetime.psmEffectAtSettle)}
        </Prov>{" "}
        to equity at the settling feeds
        {todayEffect != null && todayProv && (
          <>
            ,{" "}
            <Prov info={todayProv} value={formatExact(todayEffect)}>
              {signed(todayEffect)}
            </Prov>{" "}
            at the latest block&rsquo;s feed price
          </>
        )}
        {lifetime.psmRowsUnpriced > 0 && <>, {lifetime.psmRowsUnpriced} rows not yet priced</>}
      </span>
    </li>
  );
}
