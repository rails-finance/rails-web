"use client";

// The strip under the home hero's search (rails-ops decision 0051, app anatomy
// S10): up to three positions, each drawn as its family's listing card from
// its listing row as the family's listing draws it, inside one link to the
// position's page (N2), the chain on the card's edge (PositionCardEdgeContext)
// and the slot, family and chain in a line over it. The rows are read on the
// server (lib/home/front-door-strip-data.ts); no card is drawn for a slot whose
// read failed, and nothing at all when every read failed.

import Link from "next/link";
import { PositionCardEdgeContext } from "@/components/shared/position-card";
import {
  AaveV3PositionCard,
  notCollateralOf,
  viewFromSummary as aaveView,
} from "@/components/protocol/aave-v3/aave-v3-position-card";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import type { StripCard, StripSlot } from "@/lib/home/front-door-strip-data";

const SLOT_WORDS: Record<StripSlot, string> = {
  largest: "Largest open position",
  closest: "Closest to liquidation",
  latest: "Latest liquidation",
};

function FamilyCard({ card }: { card: StripCard }) {
  switch (card.kind) {
    case "aave-v3":
      return <AaveV3PositionCard v={aaveView(card.row)} notCollateral={notCollateralOf(card.row)} />;
    case "liquity-v2":
      return (
        <LiquityPositionCard
          protocol="liquity-v2"
          surface="listing"
          v={viewFromTroveSummary(card.row, card.prices)}
          compact
        />
      );
  }
}

export function FrontDoorStrip({ cards }: { cards: StripCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section
      aria-label="Positions on Rails now"
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 text-left"
      data-anatomy="S10"
    >
      {cards.map((card) => (
        <div key={card.slot} data-strip-card={card.slot} data-family={card.kind}>
          <p className="mb-1.5 pl-2 text-xs font-medium uppercase tracking-[0.12em] text-rb-500">
            {SLOT_WORDS[card.slot]}
            <span className="normal-case tracking-normal">
              {" "}
              · {card.family} on {card.chain}
            </span>
          </p>
          <PositionCardEdgeContext.Provider value={{ chain: card.chain }}>
            <Link
              href={card.href}
              prefetch={false}
              className="group/listing-row block"
              data-anatomy="N2"
              aria-label={`${SLOT_WORDS[card.slot]}: ${card.family} on ${card.chain}`}
            >
              <FamilyCard card={card} />
            </Link>
          </PositionCardEdgeContext.Provider>
        </div>
      ))}
    </section>
  );
}
