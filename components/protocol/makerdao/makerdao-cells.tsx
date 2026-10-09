"use client";

// MakerDAO's T2 (ui-jobs 309 step 8): the card's `cells`, `notes` and `price`
// slots. Collateral and Debt over the Vat state after this event: the
// collateral is urn.ink, the debt urn.art × the ilk's rate at the block — what
// the vault owed there, the stability fee since the previous event a sub-line
// of Debt. Opened, the ilk read at the event's block (lib/makerdao/
// use-chain-history.ts) adds the collateral ratio before → after against the
// minimum and the OSM price to the price row. A give's owner before → after
// and a liquidation's auction (what it had to raise, what it sold, what it
// handed back) stand as notes under the grid. The index carries no gas for
// Maker's rows, so the row states none. Each figure traces via <Prov>.

import type { ReactNode } from "react";
import { collAmount, debtDigits, usdPrice } from "@/lib/makerdao/price-format";
import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import { Prov } from "@/components/shared/provenance";
import { reconstructTransition } from "@/components/shared/chain-truth-event";
import {
  EventNotes,
  NoteLine,
  useChainTruthCells,
  type ChainTruthCellStat,
} from "@/components/shared/chain-truth-cells";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { EventCardOpened } from "@/components/shared/event-card";
import type { EventCardPrice } from "@/components/shared/event-price-row";
import {
  inkAfterProv,
  dinkProv,
  inkBeforeProv,
  debtAfterProv,
  debtBeforeProv,
  debtChangeProv,
  interestSincePreviousProv,
  grabSeizedUsdProv,
  flowValueProv,
  eventPriceProv,
  atBlockPriceProv,
  eventRatioProv,
  matAtBlockProv,
  roomAtBlockProv,
  auctionProv,
  giveDstProv,
  giveOwnerProv,
  ownerBeforeProv,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import { formatExactDecimal, formatNumber, formatUsdValue } from "@/lib/utils/format";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { useMakerVaultHistory, type MakerOwnerRef, type MakerOwnershipStep } from "@/lib/makerdao/vault-history";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { useMakerLedgerCells } from "./makerdao-ledger";
import type { MakerAuctionRead, MakerTxContext } from "@/lib/makerdao/chain-history-types";
import { formatDate } from "@/lib/date";
import { knownContract } from "@/lib/makerdao/known-contracts";
import { shortAddr } from "@/lib/makerdao/ownership-prose";
import { useMakerIlkAt } from "@/lib/makerdao/use-chain-history";
import type { MakerIlkAt } from "@/lib/makerdao/chain-history-types";

const fmt = (human: string): string => formatNumber(Number(human));
/** A running balance the answer did not carry is stated, never filled in. */
const fmtAfter = (human: string | undefined): string => (human == null ? "Not loaded" : fmt(human));

/** DAI at the cent, the grain every DAI figure on a row is stated in. */
export const fmtDai = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** A collateral ratio at two decimals: 169.94%. */
export const fmtRatio = (r: number): string =>
  `${(r * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
/** A minimum ratio at its own grain: 145%, 170%, 175%. */
export const fmtMat = (m: number): string => `${Number((m * 100).toFixed(2))}%`;

/** The collateral transition at the Maker grain (collAmount), where the
 *  shared form would state 0.254 beside a row header of 0.2538. */
export function collTransition<
  T extends { before: string; beforeExact?: string; change: string; changeExact?: string },
>(t: T | undefined): T | undefined {
  if (!t) return t;
  const num = (x: string | undefined) => (x == null ? NaN : Number(x.replace(/[^0-9.eE-]/g, "")));
  const b = num(t.beforeExact);
  const c = num(t.changeExact);
  return {
    ...t,
    ...(Number.isFinite(b) && Math.abs(b) < 1 ? { before: collAmount(b) } : {}),
    ...(Number.isFinite(c) && Math.abs(c) < 1 ? { change: `${t.change.slice(0, 1)}${collAmount(c)}` } : {}),
  };
}

/** The ilk at this row's block: the page's read when it holds one, else, with
 *  `readOwn`, this row's own. The opened card's grid and explanation pass it
 *  (they mount when the card opens); the closed card does not, so a long
 *  history never reads a block per row. */
export function useIlkAtRow(ctx: MakerDAOContext, blockNumber?: number, readOwn = true): MakerIlkAt | null {
  const history = useMakerVaultHistory();
  const held = blockNumber != null ? history.ilkAt.get(blockNumber) : undefined;
  const own = useMakerIlkAt(
    held || blockNumber == null || !readOwn ? null : ctx.ilk,
    blockNumber != null ? [blockNumber] : [],
  );
  return held ?? (blockNumber != null ? (own?.reads.get(blockNumber) ?? null) : null);
}

/** The collateral ratio before and after a frob at the row's own price. Null
 *  where the side owes nothing (no ratio) or a figure is missing. */
export function rowRatios(ctx: MakerDAOContext, price: number | null) {
  if (price == null || ctx.inkAfter == null || ctx.debtAfter == null) return null;
  const inkAfter = Number(ctx.inkAfter);
  const inkBefore = inkAfter - (Number(ctx.dink) || 0);
  const debtAfter = Number(ctx.debtAfter);
  const debtBefore = debtAfter - (Number(ctx.debtChange) || 0);
  const r = (ink: number, debt: number) => (debt > 1e-9 ? (ink * price) / debt : null);
  return {
    before: r(inkBefore, debtBefore),
    after: r(inkAfter, debtAfter),
    inkBefore,
    inkAfter,
    debtBefore,
    debtAfter,
  };
}

/** The Collateral and Debt cells, with the collateral's value at `price`
 *  (the ledger's price where the cell opens into the Lifetime flows ledger,
 *  else the OSM price at the block, where read). */
function useMakerStats(ctx: MakerDAOContext, coords: MakerCoords, eventId: string, price: number | null) {
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const collSym = ctx.collateralSymbol;
  const isGrab = ctx.eventType === "grab";
  const isFrob = ctx.eventType === "frob";
  const inkAfter = ctx.inkAfter != null ? Number(ctx.inkAfter) : null;
  const dink = Number(ctx.dink) || 0;
  const debtMove = Number(ctx.debtChange) || 0;
  // The row's own amount under the box it moved, and "unchanged" under the
  // one it did not, so the grid states what this event did without the toggle.
  const collSub = isFrob
    ? dink > 0
      ? `deposited ${collAmount(dink)} ${collSym}`
      : dink < 0
        ? `withdrew ${collAmount(-dink)} ${collSym}`
        : "unchanged"
    : undefined;
  const debtSub = isFrob
    ? debtMove > 0
      ? `drew ${fmtDai(debtMove)} ${debtSym}`
      : debtMove < 0
        ? `repaid ${debtDigits(-debtMove)} ${debtSym}`
        : "unchanged by this event"
    : undefined;

  // The cells that open into the Lifetime flows ledgers, where the page has
  // them; while the model is on its way, the cells that will open stand as
  // placeholder rows. A give or an auction marker moves no balance and has
  // no ledger.
  const cells = useMakerLedgerCells();
  const focus = useFlowFocus();
  const flowsPending = !!focus && !focus.model;
  const flowRow = isFrob || isGrab || ctx.eventType === "fork-in" || ctx.eventType === "fork-out";
  const owes = (Number(ctx.debtAfter ?? "0") || 0) > 0 || debtMove !== 0;
  const flowEv = focus?.model ? focus.events.find((e) => e.id === eventId) : undefined;
  const flowPrice =
    flowEv?.sides && flowEv.sides.collateral.held > 0
      ? flowEv.sides.collateral.after / flowEv.sides.collateral.held
      : null;
  const collLedger = flowRow && (cells != null || flowsPending) ? { ledger: "collateral" as const } : {};
  const debtLedger = flowRow && (cells?.debt || (flowsPending && owes)) ? { ledger: "debt" as const } : {};

  const stats: ChainTruthCellStat[] = [
    {
      key: "collateral",
      label: "Collateral",
      // The exact decimal the row carries (0.2500008), so the hover and the
      // receipt state what the face (collAmount, four significant digits)
      // rounds; `fmt` would round it a second time (TO-DO-ui-jobs 186).
      value: ctx.inkAfter != null ? formatExactDecimal(ctx.inkAfter) : fmtAfter(ctx.inkAfter),
      ...(ctx.inkAfter != null ? { display: collAmount(Number(ctx.inkAfter)) } : {}),
      symbol: collSym,
      prov: inkAfterProv(collSym, coords),
      transition: collTransition(
        reconstructTransition({
          after: ctx.inkAfter,
          change: ctx.dink,
          changeProv: dinkProv(collSym, coords),
          beforeProv: inkBeforeProv(collSym, coords),
        }),
      ),
      changed: dink !== 0,
      ...(collSub ? { sub: <>{collSub}</> } : {}),
      ...collLedger,
      // Where the cell opens into the Lifetime flows ledger, the collateral's
      // value at the ledger's price, so the closed cell and the opened ledger
      // state one figure; otherwise at this block's OSM price.
      ...(isFrob && flowPrice != null && inkAfter != null && inkAfter > 1e-9 && collLedger.ledger
        ? {
            usd: {
              value: inkAfter * flowPrice,
              prov: flowValueProv(collSym, coords, { amount: fmt(String(inkAfter)), priceUsd: flowPrice }),
            },
          }
        : isFrob && price != null && inkAfter != null && inkAfter > 1e-9
          ? {
              usd: {
                value: inkAfter * price,
                prov: grabSeizedUsdProv(collSym, coords, { amount: fmt(String(inkAfter)), priceUsd: price }),
              },
            }
          : {}),
    },
    // The debt owed: art × the rate at the block (DAI, or USDS on LockStake
    // urns). Before = after − dart × rate; the gap from the previous row's
    // after is the stability fee accrued between them.
    {
      key: "debt",
      label: "Debt",
      value: fmtAfter(ctx.debtAfter),
      symbol: debtSym,
      prov: debtAfterProv(debtSym, coords),
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.debtChange,
        changeProv: debtChangeProv(debtSym, coords),
        beforeProv: debtBeforeProv(debtSym, coords),
      }),
      changed: Number(ctx.dart) !== 0,
      ...(debtSub ? { sub: <>{debtSub}</> } : {}),
      ...debtLedger,
      ...(ctx.interestSincePrevious
        ? {
            interestSincePrevious: {
              value: ctx.interestSincePrevious,
              prov: interestSincePreviousProv(debtSym, coords),
              label: "Stability fee since previous event",
              labelTip:
                "Fee added to the debt since the previous event. Maker adds it only when someone updates the collateral type's rate (a call to Jug.drip), so it lands in lumps: a row can carry fee that built up before the previous event, and the second row of one transaction can carry a little.",
            },
          }
        : {}),
    },
  ];
  return stats;
}

/** The cells before the card opens: Collateral and Debt. */
export function useMakerCells(ctx: MakerDAOContext, coords: MakerCoords, eventId: string): EventCellSpec[] {
  return useChainTruthCells(useMakerStats(ctx, coords, eventId, null));
}

/** The opened card: the ilk read at the block adds the collateral ratio and
 *  the OSM price; a give's owner and a liquidation's auction stand as notes. */
export function useMakerOpened(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  eventId: string,
  price0: EventCardPrice | undefined,
): EventCardOpened {
  const { txHash, blockNumber } = coords;
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const collSym = ctx.collateralSymbol;
  const history = useMakerVaultHistory();
  const isGrab = ctx.eventType === "grab";
  const ilkAt = useIlkAtRow(ctx, blockNumber);
  // A grab carries its price (the index's, the Dog's test); a frob reads it.
  const price = isGrab ? (ctx.priceAtBlock?.usd ?? ilkAt?.priceUsd ?? null) : (ilkAt?.priceUsd ?? null);
  const mat = ilkAt?.mat ?? null;
  const ratios = ctx.eventType === "frob" ? rowRatios(ctx, price) : null;
  const stats = useMakerStats(ctx, coords, eventId, price);

  if (ratios && (ratios.after != null || ratios.before != null)) {
    const a = ratios.after;
    const b = ratios.before;
    const room =
      mat != null && price != null && a != null
        ? Math.max(0, (ratios.inkAfter * price) / mat - ratios.debtAfter)
        : null;
    stats.push({
      key: "ratio",
      inputs: ["collateral", "debt"],
      label: "Collateral ratio",
      value: a != null ? String(a * 100) : "no debt",
      display: a != null ? fmtRatio(a) : "no debt",
      symbol: "",
      prov: eventRatioProv("after", coords, {
        collateralUsd: formatUsdValue(ratios.inkAfter * (price ?? 0)),
        debt: `${fmtDai(ratios.debtAfter)} ${debtSym}`,
      }),
      transition:
        b != null && (a == null || Math.abs(a - b) > 1e-9)
          ? {
              before: fmtRatio(b),
              beforeExact: String(b * 100),
              beforeProv: eventRatioProv("before", coords, {
                collateralUsd: formatUsdValue(ratios.inkBefore * (price ?? 0)),
                debt: `${fmtDai(ratios.debtBefore)} ${debtSym}`,
              }),
              change: a == null ? "debt cleared" : `${a >= b ? "+" : "−"}${(Math.abs(a - b) * 100).toFixed(2)} pts`,
              changeExact: a == null ? "debt cleared" : `${a >= b ? "+" : "−"}${Math.abs(a - b) * 100}`,
              changeProv: eventRatioProv("after", coords, {
                collateralUsd: formatUsdValue(ratios.inkAfter * (price ?? 0)),
                debt: `${fmtDai(ratios.debtAfter)} ${debtSym}`,
              }),
              shownAsIs: true,
            }
          : undefined,
      changed: a !== b,
      sub:
        mat != null ? (
          <>
            minimum{" "}
            <Prov info={matAtBlockProv(ctx.ilk, coords)} value={fmtMat(mat)}>
              <span>{fmtMat(mat)}</span>
            </Prov>
            {room != null ? (
              <>
                {" · can borrow "}
                <Prov info={roomAtBlockProv(coords)} value={fmtDai(room)}>
                  <span>{fmtDai(room)}</span>
                </Prov>{" "}
                {debtSym} more
              </>
            ) : null}
          </>
        ) : undefined,
    });
  }
  const cells = useChainTruthCells(stats);

  // The collateral's price at the block, in the price row: the OSM price on
  // a frob (LockStake's feed is capped: the lower of the cap and the OSM),
  // the price the liquidation was tested at on a grab.
  const cap = ilkAt?.priceCap;
  const atCap = cap != null && cap.oracleUsd != null && cap.oracleUsd > cap.capUsd;
  const blockWords = blockNumber != null ? ` · block ${blockNumber.toLocaleString("en-US")}` : "";
  const priceChip =
    (ctx.eventType === "frob" || isGrab) && price != null
      ? {
          symbol: collSym,
          usd: price,
          info: isGrab ? atBlockPriceProv(collSym, coords, price) : eventPriceProv(collSym, coords, price),
          value: String(price),
          title: isGrab
            ? `OSM price at the liquidation's block${blockWords}`
            : atCap
              ? `The cap governance set on Maker's price; the oracle read ${usdPrice(cap.oracleUsd as number)}${blockWords}`
              : `Maker's oracle price, one hour behind the market${blockWords}`,
        }
      : null;
  const row: EventCardPrice | undefined = priceChip
    ? { gas: price0?.gas, prices: [...(price0?.prices ?? []), priceChip], figures: price0?.figures }
    : price0;

  const auction = isGrab && txHash ? history.auctions.get(txHash.toLowerCase()) : undefined;
  const step = ctx.eventType === "give" ? history.ownership.get(eventId) : undefined;
  const idTx = eventId.split(":")[1];
  const txCtx = history.txContext.get((txHash || idTx || "").toLowerCase());
  const notes = step ? (
    <EventNotes>
      <MakerOwnerNote step={step} ctx={ctx} coords={coords} txCtx={txCtx} />
    </EventNotes>
  ) : isGrab ? (
    <MakerAuctionNotes ctx={ctx} coords={coords} price={row} auction={auction} />
  ) : undefined;
  return { cells, notes, price: row };
}

/** A liquidation's outcome as notes: the ratio it was seized at against the
 *  minimum, then the auction — what it had to raise (the debt plus the
 *  penalty), what it sold and for how much, and what it handed back or left
 *  unpaid. */
function MakerAuctionNotes({
  ctx,
  coords,
  price,
  auction,
}: {
  ctx: MakerDAOContext;
  coords: MakerCoords;
  price: EventCardPrice | undefined;
  auction: MakerAuctionRead | undefined;
}) {
  const collSym = ctx.collateralSymbol;
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const seized = Math.abs(Number(ctx.dink));
  const rate = ctx.rateAtBlock != null ? Number(ctx.rateAtBlock) / 1e27 : null;
  const cleared = rate != null ? Math.abs(Number(ctx.dart)) * rate : null;
  const a = auction?.kind === "clipper" ? auction : null;
  const mat = a?.mat ?? null;
  const usd = price?.prices.find((p) => p.symbol === collSym)?.usd ?? null;
  const ratio = usd != null && cleared != null && cleared > 0 ? (seized * usd) / cleared : null;
  const vals = { clip: a?.clip, auctionId: a?.auctionId };
  const lines: ReactNode[] = [];
  if (ratio != null)
    lines.push(
      <NoteLine key="ratio" label="Collateral ratio at seizure">
        <Prov info={auctionProv("ratio", coords)} value={fmtRatio(ratio)}>
          {fmtRatio(ratio)}
        </Prov>
        {mat != null && (
          <span className="font-normal text-rb-500">
            {" "}
            under the {ctx.ilk} minimum{" "}
            <Prov info={matAtBlockProv(ctx.ilk, coords)} value={fmtMat(mat)}>
              {fmtMat(mat)}
            </Prov>
          </span>
        )}
      </NoteLine>,
    );
  if (usd != null)
    lines.push(
      <NoteLine key="seized" label="Seized">
        <Prov info={dinkProv(collSym, coords)} value={formatNumber(seized)}>
          {formatNumber(seized)} {collSym}
        </Prov>{" "}
        <span className="font-normal text-rb-500">
          ={" "}
          <Prov
            info={grabSeizedUsdProv(collSym, coords, { amount: formatNumber(seized), priceUsd: usd })}
            value={formatUsdValue(seized * usd)}
          >
            {`$${Math.round(seized * usd).toLocaleString("en-US")}`}
          </Prov>{" "}
          at the OSM price then
        </span>
      </NoteLine>,
    );
  if (a) {
    const tab = Number(a.tabDai);
    const due = Number(a.dueDai);
    const penalty = Number(a.penaltyDai);
    lines.push(
      <NoteLine key="tab" label="Auction had to raise">
        <Prov info={auctionProv("tab", coords, { ...vals, value: a.tabDai })} value={fmtDai(tab)}>
          {fmtDai(tab)} {debtSym}
        </Prov>
        <span className="font-normal text-rb-500">
          {" "}
          ({fmtDai(due)} debt +{" "}
          <Prov info={auctionProv("penalty", coords, { ...vals, value: a.penaltyDai })} value={fmtDai(penalty)}>
            {fmtDai(penalty)}
          </Prov>{" "}
          penalty, {Math.round((a.chop - 1) * 100)}%)
        </span>
      </NoteLine>,
    );
    if (a.settled) {
      const sold = Number(a.soldInk);
      const raised = Number(a.raisedDai);
      lines.push(
        <NoteLine key="sold" label="Sold">
          <Prov info={auctionProv("sold", coords, { ...vals, value: a.soldInk })} value={formatNumber(sold)}>
            {formatNumber(sold)} {collSym}
          </Prov>
          <span className="font-normal text-rb-500">
            {" "}
            for{" "}
            <Prov info={auctionProv("raised", coords, { ...vals, value: a.raisedDai })} value={fmtDai(raised)}>
              {fmtDai(raised)}
            </Prov>{" "}
            {debtSym}
            {a.settledAt != null ? <> · {formatDate(a.settledAt)}</> : null}
          </span>
        </NoteLine>,
      );
      const left = Number(a.leftoverInk);
      const short = Number(a.shortfallDai);
      if (left > 0)
        lines.push(
          <NoteLine key="left" label="Returned to the vault">
            <Prov info={auctionProv("leftover", coords, { ...vals, value: a.leftoverInk })} value={formatNumber(left)}>
              {formatNumber(left)} {collSym}
            </Prov>
            <span className="font-normal text-rb-500"> collateral left once the debt and penalty were covered</span>
          </NoteLine>,
        );
      else if (short > 0)
        lines.push(
          <NoteLine key="short" label="Left unpaid">
            <Prov info={auctionProv("shortfall", coords, { ...vals, value: a.shortfallDai })} value={fmtDai(short)}>
              {fmtDai(short)} {debtSym}
            </Prov>
            <span className="font-normal text-rb-500"> the protocol absorbed it</span>
          </NoteLine>,
        );
    }
  }
  if (lines.length === 0) return null;
  return <EventNotes>{lines}</EventNotes>;
}

/** A give's owner before → after: the account, and beside it what the CDP
 *  manager records (a DSProxy, an Instadapp account, a known contract). */
function MakerOwnerNote({
  step,
  ctx,
  coords,
  txCtx,
}: {
  step: MakerOwnershipStep;
  ctx: MakerDAOContext;
  coords: MakerCoords;
  txCtx?: MakerTxContext;
}) {
  const side = (ref: MakerOwnerRef, after: boolean) => {
    const holder = ref.holder;
    const known = knownContract(holder);
    const party = holder ? txCtx?.parties[holder] : undefined;
    const head = known ? known.short : shortAddr(party?.kind === "instadapp-account" ? holder : (ref.owner ?? holder));
    const sub = known
      ? shortAddr(holder)
      : party?.kind === "instadapp-account"
        ? `Instadapp account${ref.owner ? ` for ${shortAddr(ref.owner)}` : ""}`
        : holder && ref.owner && holder !== ref.owner
          ? `through ${party?.kind === "dsproxy" ? "DSProxy" : "proxy"} ${shortAddr(holder)}`
          : party?.kind === "eoa"
            ? "a wallet"
            : null;
    const prov = after ? (ctx.giveDstOwner ? giveOwnerProv(coords) : giveDstProv(coords)) : ownerBeforeProv(coords);
    return (
      <span className={after ? "text-foreground" : "text-rb-500"}>
        <Prov info={prov} value={ref.owner ?? holder ?? ""}>
          {head}
        </Prov>
        {sub && <span className="font-normal"> ({sub})</span>}
      </span>
    );
  };
  return (
    <NoteLine label="Owner">
      {side(step.before, false)}
      <span aria-hidden="true" className="font-normal text-rb-500">
        {" "}
        →{" "}
      </span>
      {side(step.after, true)}
    </NoteLine>
  );
}
