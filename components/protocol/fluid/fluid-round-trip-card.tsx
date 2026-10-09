"use client";

// One row for the position NFT's round trip inside one transaction: the
// transfers that leave the holder and bring the NFT back to it, drawn as a
// single event on the shared shell's slots (ui-jobs 309 step 8): T1 the hop
// count, T2 one cell per hop from → to in log order with no ledger, T3 why it
// went out, T4 the ownership-transfer modal. Its number column states the
// range of the events it holds, as a group's does. The timeline reaches it through
// the Fluid transaction spec in lib/fluid/timeline-runs.tsx; a transfer that
// does not close a loop keeps its own FluidEventCard.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import { gasPrice } from "@/components/shared/event-price-row";
import { PlainNumber } from "@/components/shared/event-number-pill";
import { ownerPaidGas } from "@/lib/shared/index-gas";
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
  isLast?: boolean;
  /** The hops' event numbers, where the timeline gives them. */
  numbers?: number[];
}

/** An address the T2 grid states (a hop's receiver): echoed in the prose. */
function Addr({ coords, addr, echo }: { coords: FluidCoords; addr: string; echo?: boolean }) {
  return (
    <Prov info={ownerProv(coords, addr)} value={shortAddress(addr)} echo={echo}>
      <strong className={echo ? "font-semibold text-foreground" : undefined}>{shortAddress(addr)}</strong>
    </Prov>
  );
}

export function FluidRoundTripCard({ hops, operates, isLast, numbers }: FluidRoundTripCardProps) {
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

  // One cell per hop, the holder it left and the one it reached.
  const cells: EventCellSpec[] = hops.map((h, i) => {
    const from = (h.context.data.transferFrom ?? "").toLowerCase();
    const to = (h.context.data.transferTo ?? "").toLowerCase();
    return {
      kind: "stat",
      key: `hop-${i}`,
      label: `Hop ${i + 1}`,
      changed: true,
      value: {
        before: { text: shortAddress(from), info: ownerProv(coords, from), value: shortAddress(from) },
        after: { text: shortAddress(to), info: ownerProv(coords, to), value: shortAddress(to) },
      },
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

  const known = (numbers ?? []).filter((n) => n > 0);
  const range =
    known.length === hops.length && known.length > 0 ? { n: Math.min(...known), last: Math.max(...known) } : null;
  // The transaction's gas, where its first row is a hop and the holder it
  // started from signed it.
  const gas = gasPrice(ownerPaidGas(hops.find((h) => h.gas)?.gas, first.context.data.txFrom, home));

  const slots: EventCardSlots = {
    event: {
      id: first.id,
      family: "fluid",
      txHash: first.txHash,
      blockNumber: first.blockNumber,
      timestamp: first.timestamp,
      number: range?.n,
    },
    spine: { icon: "delegate", iconDirection: "up", isLast: !!isLast },
    head: { label: `Ownership round trip · ${hops.length} hops · ownership unchanged`, deltas: [] },
    caption: "Ownership round trip",
    cells,
    ledgers: { none: "The hops move the position NFT, no balance" },
    price: gas,
    explainer: { body: <ProseExplainer items={composeBullets(rest)} />, first: lead },
    learnMore: <LearnMore inline content={fluidTransferContent()} />,
  };
  return (
    <EventCard
      slots={slots}
      avatar={null}
      numberSlot={range ? <PlainNumber number={range.n} last={range.last} /> : undefined}
    />
  );
}
