"use client";

// Polaris event head — the card's `head` slot (ui-jobs 309), drawn by the
// shared ChainTruthRow.
//
// The timeline's head is words (rails-ops decision 0045, TO-DO-ui-jobs 367):
// the past-participle kind, in Liquity V2's open and close pills, then the
// clauses for what the spine cannot show (`polarisT1Words`). The spine carries
// the figures: the holder's legs, the escrow and a liquidation's seizure. The
// head states one figure, a liquidation's claimable surplus, and a transfer's
// recipient. The liquidator stands in the card's notes. No rate pill: Polaris
// rates are algorithmic, the holder never chose one. No ratio chip (Miles,
// 18 Oct 2026): the sheet's Risk panel states the collateral ratio.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import { PartyChip, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { Prov } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { liquidationFieldProv, transferProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import { polarisT1Words, type PolarisT1Clause } from "@/lib/polaris/event-prose";
import { formatExact } from "@/lib/utils/format";

/** One clause of the head, drawn. */
function clauseNode(c: PolarisT1Clause, ctx: PolarisContext, coords: PolarisCoords) {
  if ("surplus" in c)
    // The one figure the head states: the collateral the holder can claim.
    return (
      <>
        <Prov
          info={liquidationFieldProv("collSurplus", coords, ctx.raw?.collSurplus)}
          value={formatExact(c.surplus)}
          symbol={c.symbol}
        >
          <span className="font-bold text-foreground">{c.surplus.toFixed(4)}</span>
        </Prov>
        <TokenChipIcon symbol={c.symbol} size={16} />
        <span className="text-green-700 dark:text-green-400">{c.word}</span>
      </>
    );
  return <PartyChip party={{ prefix: c.lead, address: c.address, prov: transferProv(coords), ens: true }} />;
}

/** The timeline head's spec. */
export function polarisHeadSpec(ctx: PolarisContext, coords: PolarisCoords): ChainTruthRowSpec {
  const words = polarisT1Words(ctx);
  return {
    label: words.kind,
    status: ctx.eventType === "open" ? "open" : ctx.eventType === "close" ? "close" : undefined,
    critical: ctx.eventType === "liquidate",
    clauses: words.clauses.map((c) => clauseNode(c, ctx, coords)),
    deltas: [],
  };
}
