"use client";

// Fluid timeline run-collapse — tick-sweep liquidations/absorptions, lifted
// out of the NFT page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { useMemo, type ReactNode } from "react";
import { SpineTipContext } from "@/components/shared/spine-column";
import { isFluidEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { operatesIn, roundTripHops, type FluidEvent } from "@/lib/fluid/explainer-clauses";
import { FluidEventCard } from "@/components/protocol/fluid/fluid-event-card";
import { FluidRoundTripCard } from "@/components/protocol/fluid/fluid-round-trip-card";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Runs shorter than this stay as individual cards. */
const MIN_LIQUIDATION_RUN = 4;

// A tick sweep can touch a position several times in one bot pass —
// consecutive liquidation/absorption rows collapse into one expandable run
// row, via ChainTruthTimeline's runs seam. Owner actions always stand as
// their own rows. Module-scope so the timeline's row memo keeps a stable
// identity.
export const FLUID_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isFluidEvent(e) && (e.context.data.eventType === "liquidated" || e.context.data.eventType === "absorbed"),
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const first = events[0];
        const supplySymbol = isFluidEvent(first) ? first.context.data.supplySymbol : null;
        const borrowSymbol = isFluidEvent(first) ? first.context.data.borrowSymbol : null;
        // Smart vaults (DEX-share legs) carry no display symbol on one or both
        // sides — a Σ pair would misstate a share amount as a token amount, so
        // the run renders count-only there, matching the single-event card's
        // own token-less liquidation row.
        const aggregates: RunAggregate[] | undefined =
          supplySymbol && borrowSymbol
            ? [
                ...Array.from(
                  sumBySymbol(
                    events
                      .filter(isFluidEvent)
                      .map((e) => ({ symbol: e.context.data.supplySymbol, amount: e.context.data.colDelta })),
                  ),
                  ([symbol, value]): RunAggregate => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" }),
                ),
                ...Array.from(
                  sumBySymbol(
                    events
                      .filter(isFluidEvent)
                      .map((e) => ({ symbol: e.context.data.borrowSymbol, amount: e.context.data.debtDelta })),
                  ),
                  ([symbol, value]): RunAggregate => ({ verb: "Repaid", value, symbol, provWhat: "Debt repaid" }),
                ),
              ]
            : undefined;
        return (
          <TimelineRunCard
            key={folder.key}
            count={events.length}
            memberNoun="liquidation"
            tone="critical"
            kindWord="Liquidations"
            aggregates={aggregates}
            folder
            firstTimestamp={first.timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
            isLast={folder.isLast}
          >
            {folder.children}
          </TimelineRunCard>
        );
      }),
  },
];

// ── One transaction, one or two rows ────────────────────────────────────────
//
// Two shapes of a Fluid transaction draw fewer rows than they have logs, both
// through the runs seam's `asOneEvent` (the Alchemix opening's mechanism: the
// rows are the transaction's, nothing is hidden behind a click, and "Collapse
// like events" does not reach them):
//   • the OPEN row — the mint and the position's first operate of the same
//     transaction, one card (FluidEventCard with `openedBy`);
//   • the ROUND TRIP row — the NFT transfers that leave the holder and bring
//     it back within the transaction, one card (FluidRoundTripCard), beside
//     the operate they wrap. The vault logs the operate between the hops, so
//     the spec takes the whole transaction and draws the operate's card and
//     the round trip's card in one row.
// Anything else in such a transaction (a transfer that does not close a loop,
// a second operate) keeps its own card inside the row. The timeline's count
// line still counts events, every hop and the mint included.

/** Does this transaction draw as a grouped row? */
function groupedTx(sibs: FluidEvent[] | undefined): boolean {
  if (!sibs || sibs.length < 2) return false;
  const nft = sibs[0].context.data.nftId;
  const minted = sibs.some((s) => s.context.data.eventType === "mint");
  const operates = operatesIn(sibs, nft);
  return (minted && operates.length > 0) || roundTripHops(sibs, nft) != null;
}

const logIndex = (e: BaseActivityEvent): number => {
  const n = Number(e.id.split(":")[2]);
  return Number.isFinite(n) ? n : 0;
};

function renderTxRow(run: BaseActivityEvent[], sibs: FluidEvent[], meta: { isLast: boolean }) {
  const members = run.filter(isFluidEvent).sort((a, b) => logIndex(b) - logIndex(a));
  const nft = members[0].context.data.nftId;
  const mint = members.find((m) => m.context.data.eventType === "mint") ?? null;
  const operates = operatesIn(members, nft);
  const openOperate = mint ? (operates[0] ?? null) : null;
  // The verdict reads the whole transaction; the row draws the hops on screen.
  const loop = roundTripHops(sibs, nft);
  const hops = loop ? loop.filter((h) => members.includes(h)) : [];
  const drawnAsRoundTrip = hops.length >= 2;

  // Cards newest first, the list's order: operates (the Open row among them),
  // then the round trip, then whatever else the transaction holds.
  const cards: { key: string; node: (last: boolean) => ReactNode }[] = [];
  for (const o of [...operates].reverse()) {
    cards.push({
      key: o.id,
      node: (last) => (
        <FluidEventCard
          event={o}
          siblings={sibs}
          openedBy={o === openOperate ? (mint ?? undefined) : undefined}
          isLast={last}
        />
      ),
    });
  }
  if (drawnAsRoundTrip) {
    cards.push({
      key: `roundtrip_${hops[0].id}`,
      node: (last) => <FluidRoundTripCard hops={hops} operates={operatesIn(sibs, nft)} isLast={last} />,
    });
  }
  for (const m of members) {
    if (operates.includes(m) || (mint === m && openOperate) || (drawnAsRoundTrip && hops.includes(m))) continue;
    cards.push({
      key: m.id,
      node: (last) => <FluidEventCard event={m} siblings={sibs} isLast={last} />,
    });
  }
  return (
    <div className="flex flex-col gap-2">
      {/* The row is one transaction and the tip is its newest card: the ones
          under it refuse the dot the timeline provides around the row. */}
      {cards.map((c, i) => (
        <div key={c.key}>
          {i === 0 ? (
            c.node(meta.isLast && cards.length === 1)
          ) : (
            <SpineTipContext.Provider value={null}>
              {c.node(meta.isLast && i === cards.length - 1)}
            </SpineTipContext.Provider>
          )}
        </div>
      ))}
    </div>
  );
}

/** The Fluid position page's run specs: the transaction rows, then the
 *  liquidation streak. Memoised on the page's same-tx map. */
export function useFluidTimelineRuns(siblingsByTx: Map<string, FluidEvent[]>): TimelineRunSpec[] {
  return useMemo(
    () => [
      {
        asOneEvent: true,
        match: (e: BaseActivityEvent) => isFluidEvent(e) && groupedTx(siblingsByTx.get(e.txHash)),
        min: 2,
        sameRun: (prev: BaseActivityEvent, next: BaseActivityEvent) => prev.txHash === next.txHash,
        render: (run, meta) => renderTxRow(run, siblingsByTx.get(run[0].txHash) ?? [], meta),
      },
      ...FLUID_LIQUIDATION_RUNS,
    ],
    [siblingsByTx],
  );
}
