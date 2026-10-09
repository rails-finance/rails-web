"use client";

// The Ebisu event card: the shared Liquity V2 fork card
// (components/protocol/liquity-fork/liquity-fork-event-card.tsx) with this
// deployment's words, stable and provenance vocabulary.

import type { BaseActivityEvent, EbisuContext } from "@/lib/shared/types/event-shape";
import {
  LiquityForkEventCard,
  type LiquityForkDeployment,
} from "@/components/protocol/liquity-fork/liquity-fork-event-card";
import * as provs from "@/lib/ebisu/event-provenance";
import { DEBT_SYMBOL, EBISU_DOCS, MIN_DEBT } from "@/lib/ebisu/asset-catalog";

// The general Ebisu link (docs.ebisu.money doesn't answer) plus the
// question-level docs links per card topic (EBISU_DOCS — read and verified
// against ebisu.gitbook.io/ebisu-money, 2026-09-28, Miles's OK).
export const EBISU_FORK = {
  protocolName: "Ebisu",
  stablecoin: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  docsLink: { label: "Ebisu", url: "https://ebisu.money" },
  docsByTopic: EBISU_DOCS,
};

const DEPLOYMENT: LiquityForkDeployment = {
  family: "ebisu",
  words: EBISU_FORK,
  debtSymbol: DEBT_SYMBOL,
  minDebt: MIN_DEBT,
  provs,
  gas: true,
};

export interface EbisuEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "ebisu"; data: EbisuContext } };
  isLast?: boolean;
  eventNumber?: number;
}

export function EbisuEventCard({ event, isLast, eventNumber }: EbisuEventCardProps) {
  return <LiquityForkEventCard event={event} isLast={isLast} eventNumber={eventNumber} fork={DEPLOYMENT} />;
}
