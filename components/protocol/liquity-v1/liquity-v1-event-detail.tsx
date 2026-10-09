"use client";

// Liquity V1 event detail (the opened card, T2), as the shell's slots (ui-jobs
// 309 step 5) — the Liquity V2 grid: the Trove's collateral (with its USD value
// at this block), its debt (with what the event added or burned itemised) and
// its collateral ratio before → after; no interest rate, which V1 does not
// have. The ETH price at this block and the owner's gas stand in the price
// row; a redemption's outcome and a liquidation's route stand under the grid.
//
// Before and after are the captured TroveUpdated absolutes, formatted from
// their decimal strings (lib/liquity-v1/event-figures.ts), so consecutive cards
// agree to the figure. The price is the PriceFeed's lastGoodPrice at the
// block: the row's own capture on a redemption or liquidation, otherwise the
// receipt read (/api/chain/liquity-v1/event), which also carries the fee, the
// reserve and, on a liquidation, where the debt and ETH went. A full
// redemption's leftover ETH, and whether it has been claimed, comes from the
// CollSurplusPool read.

import type { ReactNode } from "react";
import type { GasCost, LiquityV1Context } from "@/lib/shared/types/event-shape";
import { eventGas, type EventCardPrice } from "@/components/shared/event-price-row";
import type { EventCardOpened } from "@/components/shared/event-card";
import type { EventCellHead, EventCellSpec, EventFigure } from "@/components/shared/event-cells";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { PendingBar, usdAt } from "@/components/shared/event-ledger";
import { usdShown } from "@/lib/shared/usd-display";
import { LinkedAddress } from "@/components/shared/linked-address";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  collAfterProv,
  debtAfterProv,
  collBeforeProv,
  debtBeforeProv,
  collDeltaProv,
  debtDeltaProv,
  atBlockPriceProv,
  eventPriceProv,
  collUsdAtBlockProv,
  ratioAtBlockProv,
  borrowingFeeProv,
  lusdReceivedProv,
  reserveProv,
  ownerRepaidProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  liqRouteProv,
  redemptionLegProv,
  redemptionNetProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import {
  LIQUITY_V1_RESERVE,
  fmtEth,
  fmtLusd,
  fmtPct,
  fmtUsd,
  fmtUsdSigned,
  ratioOf,
  redemptionSplit,
  sidesOf,
} from "@/lib/liquity-v1/event-figures";
import {
  useLiquityV1EventReadState,
  useLiquityV1Surplus,
  type LiquityV1EventRead,
} from "@/lib/liquity-v1/use-event-read";
import { formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

const P = ({ info, value, children }: { info?: Provenance; value?: string; children: ReactNode }) =>
  info ? (
    <Prov info={info} value={value}>
      {children}
    </Prov>
  ) : (
    <>{children}</>
  );

const EPS = 1e-9;

/** The event's price: the row's capture where it has one, else the receipt read's. */
export function liquityV1EventPrice(ctx: LiquityV1Context, read: LiquityV1EventRead | null): number | null {
  const captured = ctx.priceAtBlock?.usd;
  if (captured != null && captured > 0) return captured;
  return read?.priceUsd != null && read.priceUsd > 0 ? read.priceUsd : null;
}

function buildV1LiquidationForensics(
  ctx: LiquityV1Context,
  coords: LiquityV1Coords,
): LiquidationForensicsProps | undefined {
  const price = ctx.priceAtBlock;
  const seizedAmt = Number(ctx.collBefore);
  const clearedAmt = Number(ctx.debtBefore);
  if (!price || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const seizedUsd = seizedAmt * price.usd;
  const clearedUsd = clearedAmt;
  return {
    seized: {
      symbol: COLLATERAL_SYMBOL,
      usd: seizedUsd,
      usdProv: liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${COLLATERAL_SYMBOL}`, priceUsd: price.usd }),
    },
    cleared: {
      symbol: DEBT_SYMBOL,
      usd: clearedUsd,
      usdProv: liqClearedFaceProv(coords, { amount: `${ctx.debtBefore} ${DEBT_SYMBOL}` }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: liqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    pricePills: [
      {
        symbol: COLLATERAL_SYMBOL,
        priceUsd: price.usd,
        priceProv: atBlockPriceProv(coords, price.usd),
        note: "Liquity's price feed at block",
      },
    ],
  };
}

/** The cells before the body opens: the grid's three, drawn as placeholders. */
export const LIQUITY_V1_CELL_HEADS: EventCellHead[] = [
  { kind: "ledger", side: "collateral", label: "Collateral" },
  { kind: "ledger", side: "debt", label: "Debt" },
  { kind: "stat", label: "Collateral ratio" },
];

const fig = (text: EventFigure["text"], info?: Provenance, n?: number): EventFigure => ({ text, info, n });

export interface LiquityV1OpenedArgs {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
  /** The Trove's owner — the receipt read filters the fee and transfers on it. */
  wallet?: string;
  /** The PriceFeed price now, for a redemption's net outcome at today's price. */
  currentPrice?: number | null;
  /** The transaction's gas from the index; the receipt read supplies it where
   *  the row carries none. Stated on the owner's events only: a
   *  redemption's or a liquidation's gas is its caller's. */
  gas?: GasCost;
}

/** The opened card's cells, notes and price row (the shell's `useOpened`):
 *  the receipt read starts when the card opens, and a figure that waits on it
 *  stands as a pending bar until it lands. */
export function useLiquityV1Opened({
  ctx,
  txHash,
  blockNumber,
  wallet,
  currentPrice,
  gas,
}: LiquityV1OpenedArgs): EventCardOpened {
  const coords: LiquityV1Coords = { txHash, blockNumber, wallet };
  const { read, pending: readPending } = useLiquityV1EventReadState(txHash, wallet);
  const s = sidesOf(ctx);
  const split = redemptionSplit(ctx);
  const surplus = useLiquityV1Surplus(
    split?.full || ctx.eventType === "liquidation" ? txHash : null,
    split?.full || ctx.eventType === "liquidation" ? wallet : null,
  );
  const price = liquityV1EventPrice(ctx, read);

  const isOpen = ctx.eventType === "openTrove";
  const isClose = ctx.eventType === "closeTrove";
  const isLiq = ctx.eventType === "liquidation";
  const isRedemption = ctx.eventType === "redemption";
  const ends = isClose || isLiq || (isRedemption && s.debtAfter <= EPS);
  const CLOSED = "CLOSED";

  // ── Collateral ──
  // The shell states the closed figures at the decimals the opened ledger
  // prints (`n`).
  const collChanged = Math.abs(s.collDelta) > EPS;
  const collShowBefore = !isOpen && collChanged;
  const usdAfter = price != null && s.collAfter > EPS ? s.collAfter * price : null;
  const usdBefore = price != null && s.collBefore > EPS ? s.collBefore * price : null;
  const collateral: EventCellSpec = {
    kind: "ledger",
    side: "collateral",
    key: "collateral",
    label: "Collateral",
    changed: collChanged,
    value: {
      before: collShowBefore ? fig(fmtEth(s.collBefore), collBeforeProv(coords), s.collBefore) : undefined,
      delta:
        collShowBefore && !ends
          ? {
              text: fmtEth(Math.abs(s.collDelta)),
              n: Math.abs(s.collDelta),
              sign: s.collDelta >= 0 ? "+" : "−",
              info: collDeltaProv(coords, { after: ctx.collAfter, before: ctx.collBefore }),
            }
          : undefined,
      ...(ends ? { closed: CLOSED } : { after: fig(fmtEth(s.collAfter), collAfterProv(coords), s.collAfter) }),
      icon: COLLATERAL_SYMBOL,
    },
    usd:
      usdAfter != null && usdShown(usdAfter)
        ? {
            before:
              (isRedemption || isLiq) && usdBefore != null && usdShown(usdBefore) ? (
                <P
                  info={collUsdAtBlockProv(coords, { coll: ctx.collBefore, priceUsd: price as number, side: "before" })}
                >
                  {fmtUsd(usdBefore)}
                </P>
              ) : null,
            after: (
              <P info={collUsdAtBlockProv(coords, { coll: ctx.collAfter, priceUsd: price as number, side: "after" })}>
                {fmtUsd(usdAfter)}
              </P>
            ),
            ...usdAt({
              price,
              symbol: COLLATERAL_SYMBOL,
              before: Number(ctx.collBefore),
              after: Number(ctx.collAfter),
            }),
          }
        : undefined,
    sub: collChanged ? undefined : [{ content: "unchanged" }],
  };

  // ── Debt ──
  const debtChanged = Math.abs(s.debtDelta) > EPS;
  const debtShowBefore = !isOpen && debtChanged;

  // What the debt change was made of, where the receipt says.
  const fee = read?.borrowingFee != null ? Number(read.borrowingFee) : null;
  const received = read ? Number(read.lusdMintedToOwner) : null;
  const ownerBurned = read ? Number(read.lusdBurnedFromOwner) : null;
  const debtLines: ReactNode[] = [];
  if (s.debtDelta > EPS && read) {
    if (received != null && received > EPS)
      debtLines.push(
        <span key="recv">
          <P info={lusdReceivedProv(coords, read.lusdMintedToOwner)}>{fmtLusd(received)}</P> received
        </span>,
      );
    if (fee != null)
      debtLines.push(
        <span key="fee">
          <P info={borrowingFeeProv(coords, read.borrowingFee as string)}>{fmtLusd(fee)}</P> fee
          {received != null && received > EPS && fee > 0 && <> ({fmtPct(fee / received)})</>}
        </span>,
      );
    if (isOpen && Number(read.reserveMinted) > EPS)
      debtLines.push(
        <span key="res">
          <P info={reserveProv(coords, "minted")}>{fmtLusd(Number(read.reserveMinted))}</P> reserve
        </span>,
      );
  }
  if (isClose && read && ownerBurned != null) {
    debtLines.push(
      <span key="paid">
        owner repaid <P info={ownerRepaidProv(coords, read.lusdBurnedFromOwner)}>{fmtLusd(ownerBurned)}</P>
      </span>,
    );
    if (Number(read.reserveBurned) > EPS)
      debtLines.push(
        <span key="burn">
          <P info={reserveProv(coords, "burned")}>{fmtLusd(Number(read.reserveBurned))}</P> reserve burned
        </span>,
      );
  }
  if (split?.full) {
    const splitProv: Provenance = {
      kind: "chain-derived",
      pclass: "indexed",
      summary:
        "Debt a full redemption cancelled, in two parts — the redeemer's LUSD paid for all of it except the last 200 LUSD, the liquidation reserve, which the GasPool burned (TroveManager._redeemCloseTrove).",
      formula: "debt before − 200 LUSD reserve",
      inputs: [{ label: "debt before", value: ctx.debtBefore, kind: "chain", pclass: "emitted" }],
    };
    debtLines.push(
      <span key="rd">
        <P info={splitProv}>{fmtLusd(split.lusdRedeemed)}</P> redeemed
      </span>,
    );
    debtLines.push(
      <span key="rs">
        <P info={splitProv}>{fmtLusd(split.reserveBurned)}</P> reserve burned
      </span>,
    );
  }
  const debt: EventCellSpec = {
    kind: "ledger",
    side: "debt",
    key: "debt",
    label: "Debt",
    changed: debtChanged,
    value: {
      before: debtShowBefore ? fig(fmtLusd(s.debtBefore), debtBeforeProv(coords), s.debtBefore) : undefined,
      delta:
        debtShowBefore && !ends
          ? {
              text: fmtLusd(Math.abs(s.debtDelta)),
              n: Math.abs(s.debtDelta),
              sign: s.debtDelta >= 0 ? "+" : "−",
              info: debtDeltaProv(coords, { after: ctx.debtAfter, before: ctx.debtBefore }),
            }
          : undefined,
      ...(ends ? { closed: CLOSED } : { after: fig(fmtLusd(s.debtAfter), debtAfterProv(coords), s.debtAfter) }),
      icon: DEBT_SYMBOL,
    },
    sub:
      debtLines.length > 0
        ? [
            {
              changed: true,
              content: debtLines.map((l, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {l}
                </span>
              )),
            },
          ]
        : !debtChanged
          ? [{ content: "unchanged" }]
          : undefined,
  };

  // ── Collateral ratio, both sides at this block's price ──
  const crBefore = isOpen ? null : ratioOf(s.collBefore, s.debtBefore, price);
  const crAfter = ends ? null : ratioOf(s.collAfter, s.debtAfter, price);
  const crBeforeStr = crBefore != null ? fmtPct(crBefore) : null;
  const crAfterStr = crAfter != null ? fmtPct(crAfter) : null;
  const crShowBefore = crBeforeStr != null && crBeforeStr !== crAfterStr;
  const ratioProv = (side: "before" | "after") =>
    price != null
      ? ratioAtBlockProv(coords, {
          coll: side === "before" ? ctx.collBefore : ctx.collAfter,
          debt: side === "before" ? ctx.debtBefore : ctx.debtAfter,
          priceUsd: price,
          side,
        })
      : undefined;
  const ratio: EventCellSpec = {
    kind: "stat",
    key: "ratio",
    label: "Collateral ratio",
    changed: crShowBefore || (crBeforeStr == null && crAfterStr != null),
    inputs: ["collateral", "debt"],
    value:
      crBeforeStr == null && crAfterStr == null
        ? ends
          ? { closed: CLOSED }
          : price == null && readPending
            ? { after: fig(<PendingBar />), afterClass: "text-rb-500" }
            : { none: price == null ? "…" : "N/A" }
        : {
            before: crShowBefore ? fig(crBeforeStr, ratioProv("before")) : undefined,
            ...(ends ? { closed: CLOSED } : { after: fig(crAfterStr ?? "", ratioProv("after")) }),
          },
    sub: [{ content: "minimum 110%" }],
  };

  // ── Notes: a redemption's outcome, a liquidation's forensics and route ──
  const forensics = isLiq ? buildV1LiquidationForensics(ctx, coords) : undefined;
  const notes = (
    <>
      {isRedemption && split && (
        <RedemptionOutcome ctx={ctx} coords={coords} split={split} surplus={surplus} currentPrice={currentPrice} />
      )}
      {forensics && <LiquidationForensics {...forensics} />}
      {isLiq && read?.liquidation ? (
        <LiquidationRoute read={read} coords={coords} surplusClaimed={surplus?.claimed ?? null} />
      ) : isLiq && readPending ? (
        <LiquidationRoutePending />
      ) : null}
    </>
  );

  // ── The price row: the gas the owner paid, in USD at the receipt's ETH
  // price, and ETH at Liquity's price feed for this block ──
  const ownerPaid = isOpen || isClose || ctx.eventType === "adjustTrove";
  const paid = ownerPaid ? (gas ?? read?.gas ?? null) : null;
  const priceRow: EventCardPrice = {
    gas: eventGas(paid ? { ...paid, gasCostUsd: read?.priceUsd ? paid.gasCostEth * read.priceUsd : 0 } : undefined),
    prices:
      price != null
        ? [
            {
              symbol: COLLATERAL_SYMBOL,
              usd: price,
              info: eventPriceProv(coords, price),
              title: "ETH at Liquity's price feed, at this block",
              format: fmtUsd,
            },
          ]
        : [],
  };

  return { cells: [collateral, debt, ratio], notes, price: priceRow };
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
      <span className="text-rb-500">{label}</span>
      <span className="tabular-nums text-foreground">{children}</span>
    </div>
  );
}

function RedemptionOutcome({
  ctx,
  coords,
  split,
  surplus,
  currentPrice,
}: {
  ctx: LiquityV1Context;
  coords: LiquityV1Coords;
  split: NonNullable<ReturnType<typeof redemptionSplit>>;
  surplus: ReturnType<typeof useLiquityV1Surplus>;
  currentPrice?: number | null;
}) {
  const netAtRedemption = split.lusdRedeemed - split.ethToRedeemer * split.price;
  const netToday =
    currentPrice != null && currentPrice > 0 ? split.lusdRedeemed - split.ethToRedeemer * currentPrice : null;
  const legVals = { debt: String(split.lusdRedeemed), priceUsd: split.price, coll: ctx.collBefore };
  return (
    <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3">
      <Row label="ETH to the redeemer">
        <P info={redemptionLegProv(coords, "redeemer", legVals)}>
          {fmtEth(split.ethToRedeemer)} {COLLATERAL_SYMBOL}
        </P>{" "}
        for {fmtLusd(split.lusdRedeemed)} {DEBT_SYMBOL}
      </Row>
      {split.full && (
        <Row label="ETH left to the owner (surplus pool)">
          <P info={redemptionLegProv(coords, "surplus", legVals)}>
            {fmtEth(surplus?.surplus ?? split.ethSurplus)} {COLLATERAL_SYMBOL}
          </P>
          {surplus && (
            <span className={surplus.claimed ? "text-rb-500" : "font-semibold text-green-600 dark:text-green-400"}>
              {" "}
              {surplus.claimed
                ? `claimed${surplus.claimed.timestamp != null ? ` ${formatDate(surplus.claimed.timestamp)}` : ""}`
                : surplus.claimable > EPS
                  ? "claimable"
                  : ""}
            </span>
          )}
        </Row>
      )}
      {split.full && (
        <Row label="Liquidation reserve">
          {fmtLusd(LIQUITY_V1_RESERVE)} {DEBT_SYMBOL} burned
        </Row>
      )}
      <Row label="Owner's net outcome">
        <P
          info={redemptionNetProv(coords, {
            debt: String(split.lusdRedeemed),
            eth: String(split.ethToRedeemer),
            priceUsd: split.price,
            when: "redemption",
          })}
        >
          {fmtUsdSigned(Math.abs(netAtRedemption) < 0.005 ? 0 : netAtRedemption)}
        </P>{" "}
        at the redemption price
        {netToday != null && (
          <>
            {" · "}
            <P
              info={redemptionNetProv(coords, {
                debt: String(split.lusdRedeemed),
                eth: String(split.ethToRedeemer),
                priceUsd: currentPrice as number,
                when: "today",
              })}
            >
              <span className={netToday >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                {fmtUsdSigned(netToday)}
              </span>
            </P>{" "}
            at the latest block&apos;s {fmtUsd(currentPrice as number)}
          </>
        )}
      </Row>
    </div>
  );
}

/** The "Where it went" block while the liquidation's receipt read is on its
 *  way: the heading and a placeholder for each row it will carry. */
function LiquidationRoutePending() {
  return (
    <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3" aria-busy="true">
      <div className="mb-1 text-xs font-semibold text-rb-500">Where it went</div>
      {["Stability Pool", "Liquidator", "Owner"].map((label) => (
        <Row key={label} label={label}>
          <span className="inline-block h-3 w-28 animate-pulse rounded bg-rb-500/20 align-middle" />
        </Row>
      ))}
    </div>
  );
}

function LiquidationRoute({
  read,
  coords,
  surplusClaimed,
}: {
  read: LiquityV1EventRead;
  coords: LiquityV1Coords;
  surplusClaimed: { timestamp: number | null } | null;
}) {
  const l = read.liquidation!;
  const n = (s: string) => Number(s);
  return (
    <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3">
      <div className="mb-1 text-xs font-semibold text-rb-500">
        Where it went{l.recoveryMode ? " · Recovery Mode liquidation" : ""}
        {l.trovesInTx > 1
          ? l.share === "trove"
            ? ` · this Trove's share of the ${l.trovesInTx} Troves this transaction liquidated`
            : ` · this transaction liquidated ${l.trovesInTx} Troves; the figures are its totals`
          : ""}
      </div>
      {n(l.stabilityPoolDebt) > EPS && (
        <Row label="Stability Pool">
          burned <P info={liqRouteProv(coords, "stability pool debt", l)}>{fmtLusd(n(l.stabilityPoolDebt))}</P>{" "}
          {DEBT_SYMBOL}, received{" "}
          <P info={liqRouteProv(coords, "stability pool eth", l)}>{fmtEth(n(l.stabilityPoolEth))}</P>{" "}
          {COLLATERAL_SYMBOL}
        </Row>
      )}
      {(n(l.redistributedDebt) > EPS || n(l.redistributedEth) > EPS) && (
        <Row label="Shared out to other Troves">
          <P info={liqRouteProv(coords, "redistributed", l)}>
            {fmtLusd(n(l.redistributedDebt))} {DEBT_SYMBOL} and {fmtEth(n(l.redistributedEth))} {COLLATERAL_SYMBOL}
          </P>
        </Row>
      )}
      <Row label={<>Liquidator {l.liquidator && <LinkedAddress address={l.liquidator} className="text-rb-500" />}</>}>
        <P info={liqRouteProv(coords, "liquidator", l)}>
          {fmtLusd(n(l.liquidatorLusd))} {DEBT_SYMBOL} + {fmtEth(n(l.liquidatorEth))} {COLLATERAL_SYMBOL}
        </P>
      </Row>
      {n(l.surplusEth) > EPS && (
        <Row label="Left to the owner (surplus pool)">
          <P info={liqRouteProv(coords, "surplus", l)}>
            {fmtEth(n(l.surplusEth))} {COLLATERAL_SYMBOL}
          </P>
          {surplusClaimed ? " claimed" : " claimable"}
        </Row>
      )}
      <Row label="Owner">receives nothing back; keeps the LUSD borrowed</Row>
    </div>
  );
}
