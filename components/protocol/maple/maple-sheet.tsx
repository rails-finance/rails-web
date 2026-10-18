// Maple's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the card's
// `sheet` slot, from the figures maple-cells.tsx states. A lender's position
// has no collateral and no debt, so the one side is the pool claim and carries
// that name. The claim is in the pool's funds asset: Maple prices nothing in
// USD (maple-flows-note.tsx), so no row has a dollar column and the total
// reads in the funds asset.
//
// The side: "Last event" (the claim the pool's previous row left), the
// interest since it, "Before this event", the amounts the event moved, and the
// claim after. No Risk or Limits panel: the family has none.

import type { MapleContext } from "@/lib/shared/types/event-shape";
import { SHEET_NO_USD, SHEET_WORDS, type EventSheet, type SheetRow } from "@/components/shared/event-sheet";
import type { ChainTruthTransition } from "@/components/shared/chain-truth-event";
import type { Provenance } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import {
  assetsDeltaProv,
  claimAfterProv,
  claimBeforeProv,
  interestSincePrevProv,
  requestCancelSharesProv,
  requestSharesProv,
  sharesDeltaProv,
  transferAmountProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";

const WORDS = {
  side: "Pool claim",
  paid: "Paid to the wallet",
  deposited: "Deposited",
  sharesReceived: "Shares received",
  sharesRedeemed: "Shares redeemed",
  sharesSent: "Shares sent",
  queued: "Queued for withdrawal",
  dequeued: "Taken out of the queue",
  returned: "Returned from the queue",
  claimReceived: "Claim received",
  claimSent: "Claim sent",
  unread: "Not available at this block",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  last: "The claim in the funds asset once the pool's previous event had run: the claim just before this event less the interest since.",
  interest:
    "What the pool's rising rate added to the claim since the previous event in this pool, at the rate in this block.",
  before:
    "The claim just before this event: the shares held and the shares in the withdrawal queue, times the pool's rate in this block.",
  deposited: "The funds asset this deposit paid into the pool, from the Deposit log.",
  paid: "The funds asset the pool paid to the wallet, from the withdrawal's log.",
  sharesReceived: "The pool shares this deposit minted to the wallet, from the Deposit log.",
  sharesRedeemed: "The pool shares this event burned, from its log.",
  queued: "The pool shares this request moved from the wallet into the withdrawal queue, from the request's log.",
  dequeued: "The pool shares this change took back out of the queue and returned to the wallet.",
  returned: "The pool shares this cancellation returned from the queue to the wallet.",
  sharesTransfer: "The pool shares that changed hands in this transfer, from the Transfer log.",
  claimTransfer: "The funds asset these shares were worth at the pool's rate in this block.",
  total:
    "The claim after this event: the shares held and the shares in the withdrawal queue, times the pool's rate in this block, the pool's convertToAssets there.",
};

export interface MapleSheetArgs {
  ctx: MapleContext;
  coords: MapleCoords;
  /** The claim's before → after, as maple-cells states it; its receipts. */
  claim?: ChainTruthTransition;
  /** Token contracts by symbol, where the event's flows carry them. */
  addresses?: Record<string, string | undefined>;
}

const fmt = (n: number): string => formatNumber(n);
const signed = (n: number): string => `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;

/** The sheet, or undefined where it has nothing to state (the cells stand). */
export function mapleSheet({ ctx, coords, claim, addresses = {} }: MapleSheetArgs): EventSheet | undefined {
  const asset = ctx.assetSymbol;
  const pool = ctx.poolSymbol;
  const raw = ctx.raw;
  const kind = ctx.eventType;
  const num = (v?: string): number => Number(v ?? "0") || 0;
  const figure = (text: string, symbol: string, info: Provenance, value?: string): NonNullable<SheetRow["amount"]> => ({
    text,
    symbol,
    address: addresses[symbol],
    info,
    value,
  });

  const rows: SheetRow[] = [];
  const assets = num(ctx.assetsDelta);
  const shares = num(ctx.sharesDelta);
  const queued = num(ctx.requestShares);
  if (kind === "deposit" || kind === "withdraw" || kind === "request_fill") {
    if (assets !== 0)
      rows.push({
        key: "assets",
        label: kind === "deposit" ? WORDS.deposited : WORDS.paid,
        amount: figure(signed(assets), asset, assetsDeltaProv(asset, kind, coords, raw?.assets), raw?.assets),
        tip: kind === "deposit" ? TIPS.deposited : TIPS.paid,
      });
    if (kind === "request_fill" ? queued !== 0 : shares !== 0)
      rows.push({
        key: "shares",
        label: kind === "deposit" ? WORDS.sharesReceived : WORDS.sharesRedeemed,
        amount: figure(
          kind === "request_fill" ? `−${fmt(Math.abs(queued))}` : signed(shares),
          pool,
          kind === "request_fill"
            ? requestSharesProv(pool, "request_fill", coords, raw?.shares)
            : sharesDeltaProv(pool, kind, coords, raw?.shares),
          raw?.shares,
        ),
        tip: kind === "deposit" ? TIPS.sharesReceived : TIPS.sharesRedeemed,
      });
  } else if (kind === "request" || kind === "request_decrease" || kind === "request_cancel") {
    if (queued !== 0)
      rows.push({
        key: "queue",
        label: kind === "request" ? WORDS.queued : kind === "request_cancel" ? WORDS.returned : WORDS.dequeued,
        amount: figure(
          fmt(Math.abs(queued)),
          pool,
          kind === "request_cancel"
            ? requestCancelSharesProv(pool, coords, raw?.shares)
            : requestSharesProv(pool, kind, coords, raw?.shares),
          raw?.shares,
        ),
        tip: kind === "request" ? TIPS.queued : kind === "request_cancel" ? TIPS.returned : TIPS.dequeued,
      });
  } else if (kind === "transfer_in" || kind === "transfer_out") {
    if (shares !== 0)
      rows.push({
        key: "shares",
        label: kind === "transfer_in" ? WORDS.sharesReceived : WORDS.sharesSent,
        amount: figure(
          signed(shares),
          pool,
          transferAmountProv(pool, kind === "transfer_in" ? "in" : "out", coords, raw?.shares),
          raw?.shares,
        ),
        tip: TIPS.sharesTransfer,
      });
    const moved = num(ctx.valueAfter) - num(ctx.valueBefore);
    if (claim && moved !== 0)
      rows.push({
        key: "claim",
        label: kind === "transfer_in" ? WORDS.claimReceived : WORDS.claimSent,
        amount: figure(claim.change, asset, claim.changeProv, claim.changeExact),
        tip: TIPS.claimTransfer,
      });
  }

  const haveClaim = ctx.valueAfter != null && ctx.valueBefore != null;
  if (!haveClaim && rows.length === 0) return undefined;

  const before = haveClaim ? num(ctx.valueBefore) : 0;
  const beforeProv = claim?.beforeProv ?? claimBeforeProv(asset, pool, ctx.rateSource, coords);
  const carry: (SheetRow & { sub?: SheetRow[] })[] = [];
  if (haveClaim && ctx.interestSincePrev != null) {
    const interest = num(ctx.interestSincePrev);
    carry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: figure(fmt(before - interest), asset, {
        kind: "derived",
        summary: `The claim once the pool's previous event had run — the claim just before this event less the interest since that event.`,
        via: "claim before − interest since the previous event",
        formula: "claim before − interest since previous event",
      }),
      tip: TIPS.last,
    });
    carry.push({
      key: "interest",
      label: SHEET_WORDS.interest,
      amount: figure(
        interest < 0 ? `−${fmt(-interest)}` : fmt(interest),
        asset,
        interestSincePrevProv(asset, pool, coords, raw?.interestSincePrev),
        raw?.interestSincePrev,
      ),
      tip: TIPS.interest,
    });
  }

  return {
    sides: [
      {
        side: "collateral",
        name: WORDS.side,
        icons: [asset],
        carry,
        before:
          carry.length > 0
            ? {
                key: "before",
                label: SHEET_WORDS.before,
                amount: figure(fmt(before), asset, beforeProv, claim?.beforeExact),
                tip: TIPS.before,
              }
            : undefined,
        rows,
        total: haveClaim ? SHEET_NO_USD : { none: WORDS.unread },
        totalAmount: haveClaim
          ? figure(
              fmt(num(ctx.valueAfter)),
              asset,
              claimAfterProv(asset, pool, ctx.rateSource, coords, raw?.valueAfter),
              ctx.valueAfter,
            )
          : undefined,
        totalTip: TIPS.total,
      },
    ],
    panels: [],
  };
}
