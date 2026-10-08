"use client";

// Composer: wires the Frankencoin header / detail / explainer into the
// universal EventCard shell (the plain-English explainer rides its own
// second-tier slot).
//
// Spine grammar: the challenge lifecycle carries the warning spine —
// caution-toned at its start (an open bet against the declared price),
// critical when a slice succeeds or governance denies the position; a
// forced sale is caution-toned (an expiry consequence, not a failure of the
// declared price). Averted challenges ride a plain spine — the position
// survived and nothing of its own moved. Collateral seized by the auction
// carries NO token-flow chip: not a send the owner made.

import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { FrankencoinLedgerProvider } from "./frankencoin-ledger";
import { SpineColumn } from "@/components/shared/spine-column";

import { soleFlowAddress } from "@/lib/shared/format-event";
import { type FrankencoinCoords } from "@/lib/frankencoin/event-provenance";
import { frankencoinExplainerTeaser } from "@/lib/frankencoin/explainer-clauses";
import { FrankencoinEventHeader } from "./frankencoin-event-header";
import { FrankencoinEventDetail } from "./frankencoin-event-detail";
import { FrankencoinEventExplainer, frankencoinLearnMoreContent } from "./frankencoin-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { useFrankencoinPageFacts } from "@/lib/frankencoin/page-facts";
import { useFrankencoinEventRead, type FrankencoinEventRead } from "@/lib/frankencoin/use-event-read";
import type { FrankencoinForcedSaleFact } from "@/lib/frankencoin/page-facts";
import type { FrankencoinModalForcedSale } from "@/lib/shared/learn-more-content";
import { shortAddress } from "@/lib/frankencoin/asset-catalog";

export interface FrankencoinEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "frankencoin"; data: FrankencoinContext } };
  isLast?: boolean;
  eventNumber?: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function FrankencoinEventCard({ event, isLast, eventNumber }: FrankencoinEventCardProps) {
  const ctx = event.context.data;
  const facts = useFrankencoinPageFacts();
  // The receipt read the teaser's lead can use (a new owner's kind); the same
  // request serves the grid and the explanation.
  const { read } = useFrankencoinEventRead(ctx, event.txHash, event.id);

  // A settlement row in a forced sale's transaction belongs to that sale: it
  // says so in its title and badge and opens the forced-sale modal, whose
  // worked example is the position's own sale (the one that sold something).
  const forcedTx = (facts?.txKinds[event.txHash] ?? []).includes("forced_sale");
  const exampleSale = facts ? [...facts.forcedSales].reverse().find((f) => f.amount > 0) : undefined;
  const { read: exampleRead } = useFrankencoinEventRead(
    exampleSale?.ctx ?? ctx,
    exampleSale?.txHash ?? event.txHash,
    exampleSale?.eventId ?? event.id,
  );
  const forcedExample = exampleSale ? forcedModalExample(exampleSale, exampleRead) : null;

  const critical = ctx.eventType === "challenge_succeeded" || ctx.eventType === "denied";
  const caution =
    ctx.eventType === "challenge_started" || ctx.eventType === "forced_sale" || ctx.eventType === "auction_settlement";

  // Token rows for the plain spine — the collateral the owner's own action
  // moved (from the ledger's two absolutes), in the position's own token.
  const dColl =
    ctx.collateral != null && ctx.collateralBefore != null ? num(ctx.collateral) - num(ctx.collateralBefore) : null;
  const openColl = ctx.eventType === "open" || ctx.eventType === "clone" ? num(ctx.collateral) : 0;
  const collMove = dColl ?? (openColl > 0 ? openColl : 0);

  const coords: FrankencoinCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    position: ctx.position,
    hub: ctx.hub,
  };

  // The ZCHF the owner's own action moved: minted to the wallet or repaid into
  // the position, on the rows whose header states it.
  const isOpen = ctx.eventType === "open" || ctx.eventType === "clone";
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  const debtMove = dMint ?? (isOpen ? num(ctx.minted) : 0);
  const headerRegistersDebt =
    debtMove !== 0 &&
    (isOpen ||
      ctx.eventType === "mint" ||
      ctx.eventType === "repay" ||
      ctx.eventType === "adjust" ||
      ctx.eventType === "close");

  // A Frankencoin position is minted against whatever ERC-20 its proposer put
  // up, so the collateral symbol is drawn from an open set the house address
  // table was never going to cover — exactly the case where the chip gives up
  // and prints an initial. The collateral's contract is in the event's flows,
  // recorded as the transfer that moved it, so it is read from there. A symbol
  // claimed by two flows resolves to nothing and the letter stands.
  //
  // direction "right" = toward the position (deposit / repay), "left" = toward
  // the wallet (withdraw / mint).
  const tokens =
    !critical && !caution && (collMove !== 0 || headerRegistersDebt)
      ? [
          ...(collMove !== 0
            ? [
                {
                  symbol: ctx.collateralSymbol,
                  address: soleFlowAddress(event.flows, ctx.collateralSymbol),
                  direction: collMove > 0 ? ("right" as const) : ("left" as const),
                  value: Math.abs(collMove),
                },
              ]
            : []),
          ...(headerRegistersDebt
            ? [
                {
                  symbol: "ZCHF",
                  address: soleFlowAddress(event.flows, "ZCHF"),
                  direction: debtMove > 0 ? ("left" as const) : ("right" as const),
                  value: Math.abs(debtMove),
                },
              ]
            : []),
        ]
      : undefined;

  const iconSlot =
    critical || caution ? (
      <SpineColumn icon="warning" warningTone={critical ? "critical" : "caution"} isLast={!!isLast} />
    ) : ctx.eventType === "ownership_transferred" ? (
      // An ownership handover is a people event with no token flow — the person
      // glyph with the join badge marks the new owner taking over; dotted spine
      // (nothing moved). Same treatment as makerdao's `give`, fluid's and fx's
      // `transfer`. Covers the mint-time factory→owner handover too ("Owner Set
      // at Mint"), which is the same shape: a party changed, no collateral did.
      <SpineColumn icon="delegate" iconDirection="up" isLast={!!isLast} />
    ) : (
      <SpineColumn tokens={tokens} isLast={!!isLast} />
    );

  // The Collateral and Debt cells open into their ledgers where the page ties
  // its timeline to the Lifetime flows panel.
  return (
    <FrankencoinLedgerProvider eventId={event.id} eventTs={event.timestamp}>
      <EventCard
        avatar={null}
        iconColumn={iconSlot}
        header={
          <FrankencoinEventHeader
            actionLabel={
              ctx.eventType === "auction_settlement" && forcedTx ? "Forced Sale Settlement" : event.actionLabel
            }
            ctx={ctx}
            timestamp={event.timestamp}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            eventNumber={eventNumber}
            flows={event.flows}
          />
        }
        detail={
          <FrankencoinEventDetail
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            eventId={event.id}
            timestamp={event.timestamp}
          />
        }
        detailLabel="Position state"
        explainer={
          <FrankencoinEventExplainer
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            timestamp={event.timestamp}
            eventId={event.id}
            skipLead
          />
        }
        explainerLabel="Plain English"
        explainerTeaser={frankencoinExplainerTeaser(ctx, coords, event.timestamp, facts, event.txHash, read)}
        txHash={event.txHash}
        learnMore={<LearnMore inline content={frankencoinLearnMoreContent(ctx, facts, event.txHash, forcedExample)} />}
        persistKey={`frankencoin:${event.id}`}
      />
    </FrankencoinLedgerProvider>
  );
}

/** The forced-sale modal's worked example, from the sale's receipt read. */
function forcedModalExample(
  sale: FrankencoinForcedSaleFact,
  read: FrankencoinEventRead | null,
): FrankencoinModalForcedSale | null {
  const f = read?.forced;
  if (!f || f.expiration == null || f.challengePeriod == null) return null;
  const dec = sale.ctx.collateralDecimals;
  const scale = (raw: string, d: number) => Number(raw) / 10 ** d;
  return {
    symbol: sale.ctx.collateralSymbol,
    expiration: f.expiration,
    period: f.challengePeriod,
    soldAt: sale.timestamp,
    unit: scale(f.priceRaw, 36 - dec),
    declared: f.liqPriceRaw != null ? scale(f.liqPriceRaw, 36 - dec) : null,
    sold: scale(f.soldRaw, dec),
    cost: Number(f.cost),
    buyer: f.buyer ? shortAddress(f.buyer) : null,
    branch: f.branch,
    debt: Number(f.debtCleared),
    reserveBack: Number(f.reserveToBuyer),
    owner: Number(f.ownerReceived),
    loss: Number(f.loss),
  };
}
