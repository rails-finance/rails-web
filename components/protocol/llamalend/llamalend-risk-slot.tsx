"use client";

// The LlamaLend position card's risk slot — the band surface, ON the card.
// ----------------------------------------------------------------------------
// It used to be a standalone block below the card, which made LlamaLend the one
// detail page with a fourth section AND the one risk surface in the repo
// carrying paragraphs. Both are gone, and so is the full-width body block that
// replaced them: this is now the ordinary <RiskFooterStrip> riding the card's
// heading-button row, label-led clusters then a `w-64` meter, the same shape a
// Trove's card has. Nothing about LlamaLend's risk picture is structurally
// special any more — only what it measures.
//
// Riding the card also puts every <Prov> here INSIDE the shell's receipts
// scope. As a sibling it was outside — health, the band count, both band edges
// and the oracle price registered nothing at all, so the inspector had no row
// for any of them (the prov-scope silent no-op). Keep this component mounted
// only through the card's children.
//
// Two clusters, then the axis:
//   • the health multiple — how far the price stands above the onset. It used
//     to carry the three-way band state as a prose tail; the axis's own lead
//     figure now states that ("Converting now" / "Fully converted") in the
//     shared runway's slot and voice, so saying it twice on one card is gone;
//   • the converted amount, but ONLY outside soft-liquidation. In it, the card
//     grows a third stat column carrying the same figure with the same receipt,
//     and a second <Prov> on the same info in the same scope would register a
//     duplicate row. A ZERO has no twin up there and is worth stating — it is a
//     positive claim about the chain, and this explorer's signature figure.
//
// The figures here carry no risk colour (feedback-no-opinionated-color) — they
// are numbers, and the numbers carry the meaning. The band axis below them is
// coloured on the house CAUTION → CRITICAL ladder (2026-07-27) — a state, not a
// verdict on a figure; the reasoning lives in that file.

import { Prov } from "@/components/shared/provenance";
import { RiskFigure, RiskFooterStrip, RiskMeter, RiskStrong } from "@/components/shared/risk-footer-strip";
import { llamalendConvertedProv, llamalendHealthProv } from "@/lib/llamalend/live-provenance";
import { formatNumber, formatUnitsExact } from "@/lib/utils/format";
import { LlamalendBandsAxis } from "./llamalend-bands-axis";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";

export function LlamalendRiskSlot({ chain }: { chain: LlamalendChainResponse }) {
  if (chain.chainStale || !chain.hasLoan) return null;

  return (
    <RiskFooterStrip>
      {/* The misleading-figure caution (copy charter §2's one exception): the
          converted figure on this card cannot be trusted as it stands. Plain
          words, no machinery — the receipt on the figure names the two reads.
          It leads the strip because it qualifies everything after it. The
          `null` case says nothing (§4: a missing fact is simply absent), and
          the receipt records it either way. */}
      {chain.convertedCrossCheckExact === false && (
        <RiskFigure caution>
          ⚠️ Converted figure unconfirmed — the market gave two different answers, most likely a trade mid-check.
          Reloading checks it again.
        </RiskFigure>
      )}

      {chain.health != null && (
        <RiskFigure label="Soft-liquidation">
          <RiskStrong>
            <Prov info={llamalendHealthProv(chain.amm)}>{chain.health.toFixed(3)}</Prov>
          </RiskStrong>
          × the onset price
        </RiskFigure>
      )}

      {!chain.inSoftLiq && (
        <RiskFigure label="Converted">
          <RiskStrong>
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
                {chain.converted != null ? formatNumber(chain.converted) : "—"} {chain.borrowedSymbol}
              </span>
            </Prov>
          </RiskStrong>
        </RiskFigure>
      )}

      <RiskMeter>
        <LlamalendBandsAxis chain={chain} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
