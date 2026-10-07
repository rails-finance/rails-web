"use client";

// One row for the position NFT's round trip inside one transaction: the
// transfers that leave the holder and bring the NFT back to it, drawn as a
// single card (T1 the hop count, T2 each hop from → to in log order, T3 why it
// went out, T4 the ownership-transfer modal). The timeline reaches it through
// the Fluid transaction spec in lib/fluid/timeline-runs.tsx; a transfer that
// does not close a loop keeps its own FluidEventCard.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { ChainTruthDetail, ChainTruthRow, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { Prov } from "@/components/shared/provenance";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { fluidTransferContent } from "@/lib/shared/learn-more-content";
import { clause, composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { ownerProv, type FluidCoords } from "@/lib/fluid/event-provenance";
import { shortAddress } from "@/lib/fluid/asset-catalog";
import { coordsFor, holderAtOperate, valueOutLegs, type FluidEvent } from "@/lib/fluid/explainer-clauses";

export interface FluidRoundTripCardProps {
  /** The hops, in log order (roundTripHops). */
  hops: FluidEvent[];
  /** The position's operates in the same transaction, in log order. */
  operates: FluidEvent[];
  isFirst?: boolean;
  isLast?: boolean;
}

/** An address the T2 grid states (a hop's receiver): echoed in the prose. */
function Addr({ coords, addr, echo }: { coords: FluidCoords; addr: string; echo?: boolean }) {
  return (
    <Prov info={ownerProv(coords, addr)} value={shortAddress(addr)} echo={echo}>
      <strong className={echo ? "font-semibold text-foreground" : undefined}>{shortAddress(addr)}</strong>
    </Prov>
  );
}

export function FluidRoundTripCard({ hops, operates, isFirst, isLast }: FluidRoundTripCardProps) {
  const first = hops[0];
  const coords = coordsFor(first);
  const home = (first.context.data.transferFrom ?? "").toLowerCase();
  // Each address the NFT passed through, in order, without the holder it
  // started and ended with.
  const via: string[] = [];
  for (const h of hops) {
    const to = (h.context.data.transferTo ?? "").toLowerCase();
    if (to && to !== home && !via.includes(to)) via.push(to);
  }

  const stats: ChainTruthStat[] = hops.map((h, i) => {
    const from = (h.context.data.transferFrom ?? "").toLowerCase();
    const to = (h.context.data.transferTo ?? "").toLowerCase();
    return {
      label: `Hop ${i + 1}`,
      value: shortAddress(to),
      display: `${shortAddress(from)} → ${shortAddress(to)}`,
      symbol: "",
      prov: ownerProv(coords, to),
    };
  });

  // The operate that needed the NFT: the first one taking value out, run by
  // the address holding it at that point.
  const valueOut = operates.find((o) => valueOutLegs(o.context.data) != null) ?? null;
  const holder = valueOut ? holderAtOperate(hops, valueOut) : null;
  const legs = valueOut ? valueOutLegs(valueOut.context.data) : null;

  const viaList = via.map((a, i) => (
    <span key={a}>
      {i > 0 ? (i === via.length - 1 ? " and " : ", ") : null}
      <Addr coords={coords} addr={a} echo />
    </span>
  ));
  const clauses = eventClauses({
    happened: [
      clause(
        <>
          The position NFT left <Addr coords={coords} addr={home} echo /> and came back to it in this transaction, by
          way of {viaList}.
        </>,
      ),
    ],
    meansNow:
      valueOut && holder && holder !== home && legs
        ? [
            clause(
              <>
                Fluid lets only the NFT&rsquo;s holder withdraw or borrow, so the position went to{" "}
                <Addr coords={coords} addr={holder} echo /> for the {valueOut.actionLabel} beside this row and came back
                once {legs} had run.
              </>,
            ),
          ]
        : [],
  });
  const { lead, rest } = splitLead(clauses);

  return (
    <EventCard
      avatar={null}
      caption="Ownership round trip"
      iconColumn={<SpineColumn icon="delegate" iconDirection="up" spine="dotted" isFirst={isFirst} isLast={!!isLast} />}
      header={
        <ChainTruthRow
          spec={{
            label: `Ownership round trip · ${hops.length} hops · ownership unchanged`,
            deltas: [],
          }}
          timestamp={first.timestamp}
        />
      }
      detail={<ChainTruthDetail stats={stats} />}
      detailLabel="Hops"
      explainer={<ProseExplainer items={composeBullets(rest)} />}
      explainerLabel="Plain English"
      explainerTeaser={lead}
      txHash={first.txHash}
      learnMore={<LearnMore inline content={fluidTransferContent()} />}
      persistKey={`fluid:${first.id}`}
    />
  );
}
