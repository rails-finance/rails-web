// Moonwell's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read, for the Ethereum and Base deployments. For now the event
// page's (ui-jobs 236): the market and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isMoonwellEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";

const WORDS = {
  paragraph: (deployment: string) => `This page is one transaction from this account's history in ${deployment}.`,
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the account's timeline",
  market: "Market",
  collateral: "Collateral seized",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (deployment: string, account: string, day: string) =>
    `One transaction from the history of ${account} in ${deployment}, on ${day}.`,
};

const DEPLOYMENT_NAME = { ethereum: "Moonwell", base: "Moonwell on Base" } as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface MoonwellEventPageInput extends EventPageSlot {
  wallet: string;
  deployment: "ethereum" | "base";
}

/** The event's title: T1's word and the amounts its head states (a
 *  liquidation's debt covered and mTokens seized, a transfer's mTokens, else
 *  the underlying moved). Also read on the server. */
export function moonwellEventTitle(event: BaseActivityEvent, deployment: "ethereum" | "base" = "ethereum"): EventTitle {
  if (!isMoonwellEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  // Ethereum names its receipt tokens from the market table; Base's are "m" and the symbol.
  const mSymbolOf = (key: string | null | undefined, symbol: string) =>
    (deployment === "ethereum" && key ? MOONWELL_MARKET_BY_KEY[key]?.mSymbol : undefined) ?? `m${symbol}`;
  const kind = event.actionLabel;
  if (ctx.eventType === "liquidation")
    return makeEventTitle(event, kind, [
      { value: Number(ctx.assetsDelta ?? "0") || 0, symbol: ctx.marketSymbol },
      {
        value: Number(ctx.seizeTokens ?? "0") || 0,
        symbol: ctx.collateralSymbol ? mSymbolOf(ctx.collateralMarket, ctx.collateralSymbol) : "",
      },
    ]);
  if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out")
    return makeEventTitle(event, kind, [
      { value: Number(ctx.mTokensDelta ?? "0") || 0, symbol: mSymbolOf(ctx.market, ctx.marketSymbol) },
    ]);
  return makeEventTitle(event, kind, [{ value: Number(ctx.assetsDelta ?? "0") || 0, symbol: ctx.marketSymbol }]);
}

/** The event's heading: the title in words. Also read on the server. */
export function moonwellEventHeading(event: BaseActivityEvent, deployment: "ethereum" | "base" = "ethereum"): string {
  return eventTitleWords(moonwellEventTitle(event, deployment));
}

/** The page's metadata description, also read on the server. */
export function moonwellEventPageDescription(
  deployment: "ethereum" | "base",
  wallet: string,
  timestamp: number,
): string {
  return `${WORDS.description(DEPLOYMENT_NAME[deployment], short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const moonwellExplorer: ExplorerAdapter<MoonwellEventPageInput> = {
  eventPage: ({ wallet, deployment, event, ...slot }) => {
    const ctx = isMoonwellEvent(event) ? event.context.data : null;
    return {
      heading: moonwellEventHeading(event, deployment),
      title: moonwellEventTitle(event, deployment),
      words: {
        paragraph: WORDS.paragraph(DEPLOYMENT_NAME[deployment]),
        timelineLink: WORDS.timeline_link,
        timelineHint: WORDS.timeline_hint,
      },
      facts: [
        ...(ctx ? [{ key: "market", label: WORDS.market, value: ctx.marketSymbol }] : []),
        ...(ctx?.eventType === "liquidation" && ctx.collateralSymbol
          ? [{ key: "collateral", label: WORDS.collateral, value: ctx.collateralSymbol }]
          : []),
        {
          key: "account",
          label: WORDS.account,
          value: wallet,
          mono: true,
          copy: WORDS.copy_account,
          href: listingHrefForWallet(deployment === "base" ? "moonwell-base" : "moonwell", wallet) ?? undefined,
        },
      ],
      ...slot,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      eventId: event.id,
      description: moonwellEventPageDescription(deployment, wallet, event.timestamp),
    };
  },
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
