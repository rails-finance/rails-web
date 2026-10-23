// Aave V3's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read, for the Ethereum Pools (Core, Prime, EtherFi) and Base. For
// now the event page's (ui-jobs 236): the Pool and the account, then the shared
// rows. The words are the strings file's `page_words`
// (content/aave-v3/event-prose.yaml).

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isAaveV3Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { aaveV3CtLabel } from "@/lib/aave-v3/event-label";
import { feeLiquidation } from "@/lib/aave-v3/liquidation-fee";
import { AAVE_V3_PAGE_WORDS, PROSE } from "@/lib/aave-v3/event-templates";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Seamless draws through this adapter: an Aave V3 fork on Base with a separate listing. */
export type AaveV3Deployment = "ethereum" | "base" | "seamless" | "arbitrum";

const chainOf = (d: AaveV3Deployment) =>
  d === "ethereum" ? MAINNET_CHAIN_ID : d === "arbitrum" ? ARBITRUM_CHAIN_ID : BASE_CHAIN_ID;
const listingOf = (d: AaveV3Deployment) =>
  d === "ethereum" ? "aave-v3" : d === "base" ? "aave-v3-base" : d === "arbitrum" ? "aave-v3-arbitrum" : "seamless";

type SiblingRows = Parameters<typeof feeLiquidation>[1];

export interface AaveV3EventPageInput extends EventPageSlot {
  /** The Pool's name: Core, Prime, EtherFi, Base, or Seamless. */
  market: string;
  wallet: string;
  deployment: AaveV3Deployment;
  /** The rows of the event's transaction, which name a liquidation's fee transfer. */
  siblings?: SiblingRows;
}

/** The event's title: T1's word and the amounts its head states (a
 *  liquidation's collateral and debt, a swap's two legs, else the reserve
 *  moved). Also read on the server. */
export function aaveV3EventTitle(
  event: BaseActivityEvent,
  deployment: AaveV3Deployment,
  siblings?: SiblingRows,
): EventTitle {
  if (!isAaveV3Event(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const chainId = chainOf(deployment);
  const kind = aaveV3CtLabel(ctx, !!feeLiquidation(ctx, siblings, chainId), chainId, event.wallet);
  const amount = Math.abs(Number(ctx.amount ?? "0")) || 0;
  if (ctx.eventType === "liquidation")
    return makeEventTitle(event, kind, [
      { value: Number(ctx.liquidatedCollateralAmount ?? "0") || 0, symbol: ctx.collateralSymbol ?? "" },
      { value: Number(ctx.debtToCover ?? "0") || 0, symbol: ctx.reserveSymbol },
    ]);
  if (ctx.eventType === "swap" && ctx.swap) {
    const given = { value: amount, symbol: ctx.reserveSymbol };
    const received = {
      value: Math.abs(Number(ctx.swap.receivedAmount ?? "0")) || 0,
      symbol: ctx.swap.receivedSymbol ?? "",
      address: ctx.swap.receivedAsset,
    };
    return makeEventTitle(event, kind, ctx.swap.kind === "supply_from_swap" ? [received, given] : [given, received]);
  }
  return makeEventTitle(event, kind, [{ value: amount, symbol: ctx.reserveSymbol }]);
}

/** The event's heading: the title in words. Also read on the server. */
export function aaveV3EventHeading(
  event: BaseActivityEvent,
  deployment: AaveV3Deployment,
  siblings?: SiblingRows,
): string {
  return eventTitleWords(aaveV3EventTitle(event, deployment, siblings));
}

/** The page's metadata description, also read on the server. */
export function aaveV3EventPageDescription(
  market: string,
  wallet: string,
  timestamp: number,
  deployment?: AaveV3Deployment,
): string {
  const account = short(wallet);
  const day = formatDateLong(timestamp);
  const text =
    deployment === "seamless"
      ? PROSE.fillText(AAVE_V3_PAGE_WORDS.description_seamless, { account, day })
      : PROSE.fillText(AAVE_V3_PAGE_WORDS.description, { market, account, day });
  return `${text} ${AAVE_V3_PAGE_WORDS.timeline_link}`;
}

export const aaveV3Explorer: ExplorerAdapter<AaveV3EventPageInput> = {
  eventPage: ({ market, wallet, deployment, siblings, event, ...slot }) => ({
    heading: aaveV3EventHeading(event, deployment, siblings),
    title: aaveV3EventTitle(event, deployment, siblings),
    words: {
      paragraph:
        deployment === "seamless"
          ? AAVE_V3_PAGE_WORDS.paragraph_seamless
          : PROSE.fillText(AAVE_V3_PAGE_WORDS.paragraph, { market }),
      timelineLink: AAVE_V3_PAGE_WORDS.timeline_link,
      timelineHint: AAVE_V3_PAGE_WORDS.timeline_hint,
    },
    facts: [
      { key: "market", label: AAVE_V3_PAGE_WORDS.market, value: market },
      {
        key: "account",
        label: AAVE_V3_PAGE_WORDS.account,
        value: wallet,
        mono: true,
        copy: AAVE_V3_PAGE_WORDS.copy_account,
        href: listingHrefForWallet(listingOf(deployment), wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: aaveV3EventPageDescription(market, wallet, event.timestamp, deployment),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
