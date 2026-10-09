"use client";

// The Basedollar event card: the shared Liquity V2 fork card
// (components/protocol/liquity-fork/liquity-fork-event-card.tsx) with this
// deployment's words, stable and provenance vocabulary.

import type { BaseActivityEvent, BasedollarContext } from "@/lib/shared/types/event-shape";
import {
  LiquityForkEventCard,
  type LiquityForkDeployment,
} from "@/components/protocol/liquity-fork/liquity-fork-event-card";
import * as provs from "@/lib/basedollar/event-provenance";
import { DEBT_SYMBOL, MIN_DEBT } from "@/lib/basedollar/asset-catalog";

// The one live-verified Basedollar link (docs.basedollar.money doesn't answer).
export const BASEDOLLAR_FORK = {
  protocolName: "Basedollar",
  stablecoin: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  docsLink: { label: "Basedollar", url: "https://basedollar.money" },
};

const DEPLOYMENT: LiquityForkDeployment = {
  family: "basedollar",
  words: BASEDOLLAR_FORK,
  debtSymbol: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  provs,
  // No gas: on Base the index's gas is the L2 execution fee alone, which
  // leaves out the L1 data fee, and no whole figure is read yet.
  gas: false,
};

export interface BasedollarEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "basedollar"; data: BasedollarContext } };
  isLast?: boolean;
  eventNumber?: number;
}

export function BasedollarEventCard({ event, isLast, eventNumber }: BasedollarEventCardProps) {
  return <LiquityForkEventCard event={event} isLast={isLast} eventNumber={eventNumber} fork={DEPLOYMENT} />;
}
