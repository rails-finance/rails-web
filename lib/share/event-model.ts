// ONE family-agnostic mapper: `BaseActivityEvent` → `EventCardModel`. Every
// family's `event/[eventId]/opengraph-image.tsx` calls this instead of
// hand-rolling its own — unlike the position card (whose stats are lane-
// specific: HF vs collateral ratio, USD vs a raw reserve amount), a base
// event's flows are already a shared shape (`AssetFlow[]`), so one mapper off
// the base fields covers all three families in this batch without a per-family
// `share-card.ts` twin.

import type { AssetFlow, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { formatUsd } from "@/lib/shared/format-event";
import { formatHeadlineAmount } from "@/lib/utils/format";
import type { EventCardModel } from "@/lib/share/event-card";

/** Up to three flows: sorted by |valueUsd| descending when at least one flow
 *  carries a price (unpriced flows sink to the bottom, valued at 0 for the
 *  sort only), else the event's own first three — the same "fall back to
 *  arrival order" rule `getEventAssetKeys` and friends already use for an
 *  axis with no price to rank by. */
function pickFlows(flows: AssetFlow[]): AssetFlow[] {
  const anyPriced = flows.some((f) => typeof f.valueUsd === "number");
  const ordered = anyPriced ? [...flows].sort((a, b) => Math.abs(b.valueUsd ?? 0) - Math.abs(a.valueUsd ?? 0)) : flows;
  return ordered.slice(0, 3);
}

/** The summed |valueUsd| of the flows actually shown — undefined when none of
 *  them carry a price, so the card omits the line rather than asserting a
 *  partial total as the whole. */
function sumShownUsd(shown: AssetFlow[]): number | undefined {
  const known = shown.map((f) => f.valueUsd).filter((v): v is number => typeof v === "number");
  return known.length > 0 ? known.reduce((s, v) => s + Math.abs(v), 0) : undefined;
}

export function eventCardModel(
  event: BaseActivityEvent,
  ctx: { session: SessionProtocol; subject: string; market?: string },
): EventCardModel {
  const shown = pickFlows(event.flows ?? []);
  const usd = sumShownUsd(shown);
  return {
    session: ctx.session,
    subject: ctx.subject,
    market: ctx.market,
    // A family whose actionLabel is empty for some rows (a composed-label edge
    // case) falls back to the raw actionType rather than an empty verb.
    actionLabel: event.actionLabel || event.actionType,
    flows: shown.map((f) => ({
      sign: f.direction === "in" ? "+" : "−",
      amount: formatHeadlineAmount(Math.abs(f.amountFormatted)),
      symbol: f.tokenSymbol,
    })),
    usd: usd != null ? formatUsd(usd) : undefined,
    at: new Date(event.timestamp * 1000),
    txHash: event.txHash,
    blockNumber: event.blockNumber,
  };
}
