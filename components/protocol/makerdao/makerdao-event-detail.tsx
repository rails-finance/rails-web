"use client";

// MakerDAO event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. Human labels (Collateral / Debt) over the Vat state
// after this event: the collateral is urn.ink, the debt urn.art × the ilk's
// rate at the block — what the vault owed there, stability fee included.
//
// With the ilk read at the event's block (lib/makerdao/use-chain-history.ts:
// the OSM price, the minimum ratio), a frob also states the collateral's value
// then, the collateral ratio before → after against the minimum, and the OSM
// price itself. A liquidation states the ratio at seizure against the minimum
// and, from the auction's own logs, what it had to raise, what it sold and what
// it handed back (MakerdaoAuctionOutcome). Each figure traces via <Prov>.

import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import { Prov } from "@/components/shared/provenance";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { StatCard, StateTransition, StatSubline, ValuePill } from "@/components/shared/state-transition";
import { AtBlockPriceFootnote } from "@/components/shared/liquidation-forensics";
import {
  inkAfterProv,
  dinkProv,
  inkBeforeProv,
  debtAfterProv,
  debtBeforeProv,
  debtChangeProv,
  interestSincePreviousProv,
  atBlockPriceProv,
  grabSeizedUsdProv,
  eventPriceProv,
  eventRatioProv,
  matAtBlockProv,
  roomAtBlockProv,
  auctionProv,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { useMakerVaultHistory } from "@/lib/makerdao/vault-history";
import { useMakerIlkAt } from "@/lib/makerdao/use-chain-history";
import type { MakerAuctionRead, MakerIlkAt } from "@/lib/makerdao/chain-history-types";
import { formatDate } from "@/lib/date";
import type { MakerTxContext } from "@/lib/makerdao/chain-history-types";
import type { MakerOwnerRef, MakerOwnershipStep } from "@/lib/makerdao/vault-history";
import { knownContract } from "@/lib/makerdao/known-contracts";
import { shortAddr } from "@/lib/makerdao/ownership-prose";
import { giveDstProv, giveOwnerProv, ownerBeforeProv } from "@/lib/makerdao/event-provenance";

export interface MakerDAOEventDetailProps {
  ctx: MakerDAOContext;
  txHash?: string;
  blockNumber?: number;
  /** The row's id, which the page's history is keyed by. */
  eventId?: string;
}

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

export function MakerDAOEventDetail({ ctx, txHash, blockNumber, eventId }: MakerDAOEventDetailProps) {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const collSym = ctx.collateralSymbol;
  const history = useMakerVaultHistory();
  const isGrab = ctx.eventType === "grab";
  const ilkAt = useIlkAtRow(ctx, blockNumber);
  // A grab carries its own price (the index's, the Dog's test); a frob reads it.
  const price = isGrab ? (ctx.priceAtBlock?.usd ?? ilkAt?.priceUsd ?? null) : (ilkAt?.priceUsd ?? null);
  const mat = ilkAt?.mat ?? null;
  const ratios = ctx.eventType === "frob" ? rowRatios(ctx, price) : null;
  const inkAfter = ctx.inkAfter != null ? Number(ctx.inkAfter) : null;

  const stats: ChainTruthStat[] = [
    {
      label: "Collateral",
      value: fmtAfter(ctx.inkAfter),
      symbol: collSym,
      prov: inkAfterProv(collSym, coords),
      transition: reconstructTransition({
        after: ctx.inkAfter,
        change: ctx.dink,
        changeProv: dinkProv(collSym, coords),
        beforeProv: inkBeforeProv(collSym, coords),
      }),
      changed: Number(ctx.dink) !== 0,
      // The collateral's value at this block's OSM price.
      ...(ctx.eventType === "frob" && price != null && inkAfter != null && inkAfter > 1e-9
        ? {
            usdAlways: true,
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
      ...(ctx.interestSincePrevious
        ? {
            interestSincePrevious: {
              value: ctx.interestSincePrevious,
              prov: interestSincePreviousProv(debtSym, coords),
              label: "Stability fee since previous event",
            },
          }
        : {}),
    },
  ];

  if (ratios && (ratios.after != null || ratios.before != null)) {
    const a = ratios.after;
    const b = ratios.before;
    const room =
      mat != null && price != null && a != null
        ? Math.max(0, (ratios.inkAfter * price) / mat - ratios.debtAfter)
        : null;
    stats.push({
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

  if (ctx.eventType === "frob" && price != null) {
    stats.push({
      label: `${collSym} price (OSM)`,
      value: String(price),
      display: `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      symbol: "",
      prov: eventPriceProv(collSym, coords, price),
      changed: false,
      sub: blockNumber != null ? <>at block {blockNumber.toLocaleString("en-US")}</> : undefined,
    });
  }

  const auction = isGrab && txHash ? history.auctions.get(txHash.toLowerCase()) : undefined;

  const step = ctx.eventType === "give" && eventId ? history.ownership.get(eventId) : undefined;
  const idTx = eventId?.split(":")[1];
  const txCtx = history.txContext.get((txHash || idTx || "").toLowerCase());

  return (
    <>
      <ChainTruthDetail
        stats={stats}
        extra={step ? <MakerdaoOwnerCell step={step} ctx={ctx} coords={coords} txCtx={txCtx} /> : undefined}
      />
      {isGrab && <MakerdaoAuctionOutcome ctx={ctx} coords={coords} price={price} auction={auction} />}
    </>
  );
}

/** A liquidation's outcome: the ratio it was seized at against the minimum,
 *  then the auction — what it had to raise (the debt plus the penalty), what
 *  it sold and for how much, and what it handed back or left unpaid. */
function MakerdaoAuctionOutcome({
  ctx,
  coords,
  price,
  auction,
}: {
  ctx: MakerDAOContext;
  coords: MakerCoords;
  price: number | null;
  auction: MakerAuctionRead | undefined;
}) {
  const collSym = ctx.collateralSymbol;
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const seized = Math.abs(Number(ctx.dink));
  const rate = ctx.rateAtBlock != null ? Number(ctx.rateAtBlock) / 1e27 : null;
  const cleared = rate != null ? Math.abs(Number(ctx.dart)) * rate : null;
  const a = auction?.kind === "clipper" ? auction : null;
  const mat = a?.mat ?? null;
  const ratio = price != null && cleared != null && cleared > 0 ? (seized * price) / cleared : null;
  const vals = { clip: a?.clip, auctionId: a?.auctionId };
  const cells: React.ReactNode[] = [];

  if (ratio != null) {
    cells.push(
      <StatCard key="ratio" label="Collateral ratio at seizure">
        <StateTransition>
          <Prov info={auctionProv("ratio", coords)} value={fmtRatio(ratio)}>
            <span className="text-sm font-semibold tabular-nums text-foreground">{fmtRatio(ratio)}</span>
          </Prov>
        </StateTransition>
        {mat != null && (
          <StatSubline>
            under the {ctx.ilk} minimum{" "}
            <Prov info={matAtBlockProv(ctx.ilk, coords)} value={fmtMat(mat)}>
              <span>{fmtMat(mat)}</span>
            </Prov>
          </StatSubline>
        )}
      </StatCard>,
    );
  }
  if (price != null) {
    cells.push(
      <StatCard key="seized" label="Seized">
        <StateTransition>
          <Prov info={dinkProv(collSym, coords)} value={formatNumber(seized)}>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatNumber(seized)} {collSym}
            </span>
          </Prov>
          <Prov
            info={grabSeizedUsdProv(collSym, coords, { amount: formatNumber(seized), priceUsd: price })}
            value={formatUsdValue(seized * price)}
          >
            <ValuePill changed>{`$${Math.round(seized * price).toLocaleString("en-US")}`}</ValuePill>
          </Prov>
        </StateTransition>
        <StatSubline>at the OSM price then</StatSubline>
      </StatCard>,
    );
  }
  if (a) {
    const tab = Number(a.tabDai);
    const due = Number(a.dueDai);
    const penalty = Number(a.penaltyDai);
    cells.push(
      <StatCard key="tab" label="Auction had to raise">
        <StateTransition>
          <Prov info={auctionProv("tab", coords, { ...vals, value: a.tabDai })} value={fmtDai(tab)}>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {fmtDai(tab)} {debtSym}
            </span>
          </Prov>
        </StateTransition>
        <StatSubline>
          {fmtDai(due)} debt +{" "}
          <Prov info={auctionProv("penalty", coords, { ...vals, value: a.penaltyDai })} value={fmtDai(penalty)}>
            <span>{fmtDai(penalty)}</span>
          </Prov>{" "}
          penalty ({Math.round((a.chop - 1) * 100)}%)
        </StatSubline>
      </StatCard>,
    );
    if (a.settled) {
      const sold = Number(a.soldInk);
      const raised = Number(a.raisedDai);
      cells.push(
        <StatCard key="sold" label="Sold">
          <StateTransition>
            <Prov info={auctionProv("sold", coords, { ...vals, value: a.soldInk })} value={formatNumber(sold)}>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatNumber(sold)} {collSym}
              </span>
            </Prov>
          </StateTransition>
          <StatSubline>
            for{" "}
            <Prov info={auctionProv("raised", coords, { ...vals, value: a.raisedDai })} value={fmtDai(raised)}>
              <span>{fmtDai(raised)}</span>
            </Prov>{" "}
            {debtSym}
            {a.settledAt != null ? <> · {formatDate(a.settledAt)}</> : null}
          </StatSubline>
        </StatCard>,
      );
      const left = Number(a.leftoverInk);
      const short = Number(a.shortfallDai);
      if (left > 0) {
        cells.push(
          <StatCard key="left" label="Returned to the vault">
            <StateTransition>
              <Prov
                info={auctionProv("leftover", coords, { ...vals, value: a.leftoverInk })}
                value={formatNumber(left)}
              >
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatNumber(left)} {collSym}
                </span>
              </Prov>
            </StateTransition>
            <StatSubline>collateral left once the debt and penalty were covered</StatSubline>
          </StatCard>,
        );
      } else if (short > 0) {
        cells.push(
          <StatCard key="short" label="Left unpaid">
            <StateTransition>
              <Prov info={auctionProv("shortfall", coords, { ...vals, value: a.shortfallDai })} value={fmtDai(short)}>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {fmtDai(short)} {debtSym}
                </span>
              </Prov>
            </StateTransition>
            <StatSubline>the protocol absorbed it</StatSubline>
          </StatCard>,
        );
      }
    }
  }
  if (cells.length === 0) return null;
  return (
    <div className="px-5 pb-2">
      <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-2">{cells}</div>
      {price != null && (
        <AtBlockPriceFootnote
          pills={[
            {
              symbol: collSym,
              priceUsd: price,
              priceProv: atBlockPriceProv(collSym, coords, price),
              note: "OSM price at the liquidation's block",
            },
          ]}
        />
      )}
    </div>
  );
}

/** A give's owner before → after: the account, and under it what the CDP
 *  manager records (a DSProxy, an Instadapp account, a known contract). */
function MakerdaoOwnerCell({
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
      <span className="inline-flex flex-col">
        <Prov info={prov} value={ref.owner ?? holder ?? ""}>
          <span className={`text-sm font-semibold ${after ? "text-foreground" : "text-rb-500"}`}>{head}</span>
        </Prov>
        {sub && <span className={`text-xs ${after ? "text-foreground/80" : "text-rb-500"}`}>{sub}</span>}
      </span>
    );
  };
  return (
    <StatCard label="Owner">
      <StateTransition>
        {side(step.before, false)}
        <span className="inline-flex items-start gap-2">
          <span aria-hidden="true" className="text-rb-500">
            →
          </span>
          {side(step.after, true)}
        </span>
      </StateTransition>
    </StatCard>
  );
}
