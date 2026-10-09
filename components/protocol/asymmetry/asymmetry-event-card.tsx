"use client";

// The Asymmetry event card: the shared Liquity V2 fork card
// (components/protocol/liquity-fork/liquity-fork-event-card.tsx) with this
// deployment's words, stable and provenance vocabulary.

import type { BaseActivityEvent, AsymmetryContext } from "@/lib/shared/types/event-shape";
import {
  LiquityForkEventCard,
  type LiquityForkDeployment,
} from "@/components/protocol/liquity-fork/liquity-fork-event-card";
import * as provs from "@/lib/asymmetry/event-provenance";
import { DEBT_SYMBOL, ASYMMETRY_DOCS, MIN_DEBT } from "@/lib/asymmetry/asset-catalog";

// The general Asymmetry docs link plus the question-level docs links per card
// topic (ASYMMETRY_DOCS — read and verified against docs.asymmetry.finance,
// 2026-09-28, Miles's OK).
export const ASYMMETRY_FORK = {
  protocolName: "Asymmetry",
  stablecoin: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  docsLink: { label: "Asymmetry docs", url: "https://docs.asymmetry.finance" },
  docsByTopic: ASYMMETRY_DOCS,
};

const DEPLOYMENT: LiquityForkDeployment = {
  family: "asymmetry",
  words: ASYMMETRY_FORK,
  debtSymbol: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  provs,
  gas: true,
};

export interface AsymmetryEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "asymmetry"; data: AsymmetryContext } };
  isLast?: boolean;
  eventNumber?: number;
}

export function AsymmetryEventCard({ event, isLast, eventNumber }: AsymmetryEventCardProps) {
  return <LiquityForkEventCard event={event} isLast={isLast} eventNumber={eventNumber} fork={DEPLOYMENT} />;
}
