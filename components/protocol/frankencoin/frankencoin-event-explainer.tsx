"use client";

// The Explanation pane (zone Z2) of a Frankencoin event: the generator's
// sentences (lib/frankencoin/event-prose.ts, its strings in
// content/frankencoin/event-prose.yaml), one bullet each, under the three event
// headings when two of them hold two or more bullets. Each figure the header,
// the cells or their receipts also print echoes that receipt. The "?" modal
// depends on the event's kind (lib/frankencoin/event-templates.ts).

import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import {
  changeProv,
  challengeFigureProv,
  challengeReceiptProv,
  forcedSaleProv,
  liqPriceAfterProv,
  receiptLegProv,
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";
import { fmtFcPrice, fmtZchf } from "@/lib/frankencoin/figures";
import {
  frankencoinEventProse,
  frankencoinExplanationRuns,
  type FrankencoinEchoKey,
} from "@/lib/frankencoin/event-prose";
import { frankencoinEventModal } from "@/lib/frankencoin/event-templates";
import {
  frankencoinZchfSplit,
  useFrankencoinEventRead,
  type FrankencoinEventRead,
} from "@/lib/frankencoin/use-event-read";
import { useFrankencoinPageFacts, type FrankencoinPageFacts } from "@/lib/frankencoin/page-facts";

export interface FrankencoinEventExplainerProps {
  ctx: FrankencoinContext;
  txHash?: string;
  blockNumber?: number;
  /** The event's unix time, for the dates a price raise sets. */
  timestamp?: number;
  /** The event id, whose log index isolates this event's receipt logs. */
  eventId?: string;
}

/** The event's "?" modal: by its kind, and whether a settlement row belongs
 *  to a forced sale. */
export function frankencoinLearnMoreContent(
  ctx: FrankencoinContext,
  facts?: FrankencoinPageFacts | null,
  txHash?: string,
): LearnMoreContent {
  const forcedTx = txHash != null && (facts?.txKinds[txHash] ?? []).includes("forced_sale");
  return frankencoinEventModal(ctx, forcedTx);
}

const num = (s?: string | null): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The receipt each echoed figure registers against: the header's moved
 *  amounts and declared price, the receipt legs the debt lane's sub-line
 *  prints, and the challenge and sale figures the cells print (same
 *  vocabulary, coordinates and value, so the entry key matches). */
function echoFor(
  key: FrankencoinEchoKey,
  ctx: FrankencoinContext,
  coords: FrankencoinCoords,
  values: Record<string, string | number | null>,
  read: FrankencoinEventRead | null,
): ProseEcho | null {
  const sym = ctx.collateralSymbol;
  const n = (name: string) => Number(values[name]);
  const zchf = (name: string): ProseEcho["value"] => fmtZchf(n(name));
  const c = read?.challenge?.kind === "succeeded" ? read.challenge : null;
  const f = read?.forced ?? null;
  switch (key) {
    case "collateral":
      return {
        info: changeProv("collateral", sym, coords),
        value: chainTruthDeltaValue(n("coll_change"), true),
        symbol: sym,
      };
    case "minted": {
      const amount = values.minted != null ? n("minted") : n("repaid");
      return { info: changeProv("minted", sym, coords), value: chainTruthDeltaValue(amount, true), symbol: "ZCHF" };
    }
    case "price_after":
      return {
        info: liqPriceAfterProv(sym, ctx.collateralDecimals, coords, ctx.raw?.price),
        value: fmtFcPrice(num(ctx.liqPrice)),
      };
    case "received":
      return {
        info: receiptLegProv("received", coords, String(n("received"))),
        value: zchf("received"),
        symbol: "ZCHF",
      };
    case "interest":
      return {
        info: receiptLegProv("interest", coords, String(n("interest"))),
        value: zchf("interest"),
        symbol: "ZCHF",
      };
    case "paid":
      return { info: receiptLegProv("paid", coords, String(n("paid"))), value: zchf("paid"), symbol: "ZCHF" };
    case "reserve_returned":
      return {
        info: receiptLegProv("reserveReturned", coords, String(n("reserve_back"))),
        value: zchf("reserve_back"),
        symbol: "ZCHF",
      };
    case "size": {
      const stage = ctx.eventType === "challenge_averted" ? "averted" : "started";
      return {
        info: challengeFigureProv("size", stage, sym, coords, ctx.raw?.size),
        value: chainTruthDeltaValue(n("size"), true),
        symbol: sym,
      };
    }
    case "acquired":
      return {
        info: challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral),
        value: chainTruthDeltaValue(n("acquired"), true),
        symbol: sym,
      };
    case "bid":
      return {
        info: challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid),
        value: chainTruthDeltaValue(n("bid"), true),
        symbol: "ZCHF",
      };
    case "cleared_price":
      return { info: challengeReceiptProv("clearedPrice", sym, coords, String(n("unit"))), value: String(n("unit")) };
    case "shortfall":
      return c
        ? { info: challengeReceiptProv("shortfall", sym, coords, c.shortfall), value: c.shortfall, symbol: "ZCHF" }
        : null;
    case "owner_received":
      return c
        ? {
            info: challengeReceiptProv("ownerReceived", sym, coords, c.ownerReceived),
            value: c.ownerReceived,
            symbol: "ZCHF",
          }
        : null;
    case "debt_cleared":
      return c
        ? {
            info: challengeReceiptProv("debtCleared", sym, coords, c.debtCleared),
            value: c.debtCleared,
            symbol: "ZCHF",
          }
        : null;
    case "forced":
      return {
        info: forcedSaleProv(sym, coords, ctx.raw?.size),
        value: chainTruthDeltaValue(n("amount"), true),
        symbol: sym,
      };
    case "forced_cost":
      return f
        ? { info: challengeReceiptProv("forcedCost", sym, coords, f.cost), value: f.cost, symbol: "ZCHF" }
        : null;
    case "forced_reserve":
      return f
        ? {
            info: challengeReceiptProv("forcedReserveToBuyer", sym, coords, f.reserveToBuyer),
            value: f.reserveToBuyer,
            symbol: "ZCHF",
          }
        : null;
    case "forced_shortfall":
      return f
        ? { info: challengeReceiptProv("forcedShortfall", sym, coords, f.loss), value: f.loss, symbol: "ZCHF" }
        : null;
  }
}

export function FrankencoinEventExplainer({
  ctx,
  txHash,
  blockNumber,
  timestamp,
  eventId,
}: FrankencoinEventExplainerProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  // The same receipt read the opened grid makes; one request serves both.
  const { read } = useFrankencoinEventRead(ctx, txHash, eventId);
  const facts = useFrankencoinPageFacts();
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : 0;
  const split = frankencoinZchfSplit(read, dMint, ctx.hub);
  const prose = frankencoinEventProse({ ctx, read, split, facts, timestamp, txHash, blockNumber });
  const echo = (key: FrankencoinEchoKey) => echoFor(key, ctx, coords, prose.values, read);
  const items = frankencoinExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  return <ProseExplainer items={items} />;
}
