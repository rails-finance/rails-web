"use client";

// The LlamaLend position card's live layer (ui-jobs 209), from the page's
// chain read and inside the card's receipts scope, so every figure here is
// inspectable:
//
//   • the third headline: the protocol's own health; below 0 anyone may
//     liquidate;
//   • under it in the opened layer: the soft-liquidation multiple (how far the
//     price stands above the onset), the collateral the AMM has sold net and
//     any lost to soft-liquidation, then the band axis, whose lead figure
//     states the band state ("Converting now" / "Fully converted");
//   • under Collateral in the opened layer: what the AMM holds converted from
//     the collateral. A zero is worth stating: it is a positive claim about
//     the chain, and this explorer's signature figure.
//
// The figures carry no risk colour (feedback-no-opinionated-color). The band
// axis is coloured on the house CAUTION → CRITICAL ladder (2026-07-27): a
// state, not a verdict on a figure; the reasoning lives in that file.

import { Prov } from "@/components/shared/provenance";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { StatValue } from "@/components/shared/stat-value";
import { llamalendConvertedProv, llamalendHealthFullProv, llamalendHealthProv } from "@/lib/llamalend/live-provenance";
import { llamalendLostProv, llamalendSoldProv } from "@/lib/llamalend/event-provenance";
import { fmtColl, fmtHealth } from "@/lib/llamalend/event-figures";
import { formatUnitsExact } from "@/lib/utils/format";
import { AmountText } from "@/components/shared/amount-text";
import { LlamalendBandsAxis } from "./llamalend-bands-axis";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";

/** Health under this (5%) and above 0 carries the near-0 line. */
const HEALTH_NEAR_ZERO = 0.05;

/** Whether the read describes a live loan. */
export function llamalendHasRisk(chain: LlamalendChainResponse): boolean {
  return !chain.chainStale && chain.hasLoan;
}

/** The headline: the protocol's own health. */
export function LlamalendRiskHeadline({ chain }: { chain: LlamalendChainResponse }) {
  if (chain.healthFull == null) return null;
  return (
    <StatValue>
      <Prov info={llamalendHealthFullProv(chain.controller, chain.healthFullRaw)}>{fmtHealth(chain.healthFull)}</Prov>
    </StatValue>
  );
}

/** Under Health: the soft-liquidation multiple, what the AMM sold and what
 *  was lost, then the band axis. */
export function LlamalendRiskDetail({
  chain,
  lost,
  sold,
}: {
  chain: LlamalendChainResponse;
  /** Collateral lost to soft-liquidation over the position's life, where it
   *  can be stated (llamalendLostToSoftLiq). */
  lost?: number | null;
  /** Collateral the AMM has sold net of buy-backs, on a position in its bands
   *  now (llamalendSoldInBands). */
  sold?: number | null;
}) {
  if (!llamalendHasRisk(chain)) return null;
  return (
    <div className="mt-0.5 max-w-72 space-y-1">
      {/* Near 0 the figure alone reads as small, not as close to liquidation:
          one plain line, in the caution tone Liquity V1's card gives Recovery
          Mode. */}
      {chain.healthFull != null && chain.healthFull > 0 && chain.healthFull < HEALTH_NEAR_ZERO && (
        <RiskFigure alignStart caution>
          close to 0; below 0 anyone may liquidate it
        </RiskFigure>
      )}
      {chain.health != null && (
        <RiskFigure alignStart label="Soft-liquidation">
          <Prov info={llamalendHealthProv(chain.amm)}>{chain.health.toFixed(3)}</Prov>× the onset price
        </RiskFigure>
      )}
      {sold != null && sold > 0 && (
        <RiskFigure alignStart label="Sold by the AMM, net">
          <Prov info={llamalendSoldProv(chain.collateralSymbol, chain.controller)}>
            {fmtColl(sold)} {chain.collateralSymbol}
          </Prov>
        </RiskFigure>
      )}
      {lost != null && lost > 0 && (
        <RiskFigure alignStart label="Lost to soft-liquidation">
          <Prov info={llamalendLostProv(chain.collateralSymbol, chain.controller)}>
            {fmtColl(lost)} {chain.collateralSymbol}
          </Prov>
        </RiskFigure>
      )}
      <div className="pt-0.5">
        <LlamalendBandsAxis chain={chain} alignStart />
      </div>
    </div>
  );
}

/** Under Collateral: what the AMM holds converted, led by the caution when
 *  the market answered the cross-check two ways. */
export function LlamalendConvertedDetail({ chain }: { chain: LlamalendChainResponse }) {
  if (!llamalendHasRisk(chain)) return null;
  return (
    <div className="mt-0.5 max-w-72 space-y-1">
      {/* The misleading-figure caution (copy charter §2's one exception): the
          converted figure cannot be trusted as it stands. Plain words, no
          machinery — the receipt on the figure names the two reads. The `null`
          case says nothing (§4: a missing fact is simply absent). */}
      {chain.convertedCrossCheckExact === false && (
        <RiskFigure alignStart caution>
          ⚠️ Converted figure unconfirmed — the market gave two different answers, most likely a trade mid-check.
          Reloading checks it again.
        </RiskFigure>
      )}
      <RiskFigure alignStart label="Converted">
        <Prov
          info={llamalendConvertedProv(
            chain.borrowedSymbol,
            chain.convertedCrossCheckExact,
            chain.controller,
            chain.amm,
          )}
        >
          <span
            title={
              chain.convertedRaw != null
                ? `${formatUnitsExact(chain.convertedRaw, chain.borrowedDecimals)} — exact`
                : undefined
            }
          >
            {chain.converted != null ? <AmountText value={chain.converted} format="compact" /> : "—"}{" "}
            {chain.borrowedSymbol}
          </span>
        </Prov>
        {chain.inSoftLiq && <> from sold {chain.collateralSymbol}</>}
      </RiskFigure>
    </div>
  );
}
