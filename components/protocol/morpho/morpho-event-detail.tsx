"use client";

// Morpho event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. The position's collateral after this event, replayed
// from the deltas, and its debt: the borrow shares at the market's totals at the
// row where the answer carries it (Ethereum, and the Base index), the borrowed
// principal otherwise (the Base sweep). On Base the supply likewise. Each value traces via <Prov>. The side this event
// didn't touch is muted.

import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import {
  ChainTruthDetail,
  reconstructTransition,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  collateralAfterProv,
  borrowedAfterProv,
  assetsDeltaProv,
  collateralBeforeProv,
  borrowedBeforeProv,
  debtAfterProv,
  debtBeforeProv,
  debtChangeProv,
  interestSincePreviousProv,
  suppliedAfterProv,
  suppliedBeforeProv,
  supplyAfterProv,
  supplyBeforeProv,
  supplyChangeProv,
  supplyGapSincePreviousProv,
  atBlockOraclePriceProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  liqPremiumProv,
  liqPriceUsedProv,
  morphoHealthAtEventProv,
  morphoBorrowRateAtBlockProv,
  morphoLifProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { Prov } from "@/components/shared/provenance";
import { StatCard, StateTransition, TransitionArrow } from "@/components/shared/state-transition";
import {
  useMorphoAtBlock,
  morphoHealthMove,
  morphoLiquidationPrice,
  fmtMorphoAmount,
  fmtMorphoPart,
  fmtMorphoHf,
  fmtMorphoPrice,
  atBlockText,
  subDecimal,
  type MorphoAtBlock,
  type MorphoHealthMove,
} from "@/lib/morpho/use-market-at-block";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useMorphoLedgerCells } from "./morpho-ledger";

export interface MorphoEventDetailProps {
  ctx: MorphoContext;
  txHash?: string;
  blockNumber?: number;
  /** The event's own asset flows. Not data for the grid — the grid's figures
   *  all come from `ctx` — but the only place on this card that names the
   *  CONTRACT behind a symbol. MorphoContext carries `loanSymbol` and
   *  `collateralSymbol` and no addresses, and Morpho Blue is permissionless, so
   *  a symbol here identifies nothing the icon chip can look up. */
  flows?: AssetFlow[];
}

const fmt = (human: string): string => formatNumber(Number(human));
/** A running balance the answer did not carry is stated, never filled in. */
const fmtAfter = (human: string | undefined): string => (human == null ? "Not loaded" : fmt(human));

/** "2839.378833" → "2,839.378833": the exact figure grouped as every other
 *  exact figure on the card is, with no digit dropped. */
function groupDecimal(s: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s.trim());
  return m ? `${m[1]}${BigInt(m[2]).toLocaleString("en-US")}${m[3] ?? ""}` : s;
}

/** The transition at the row's precision: the before is the row's own exact
 *  figure (never the float after − change), and both figures are written as
 *  the timeline row writes amounts. */
function atPrecision(
  t: ChainTruthTransition | undefined,
  before: string | undefined,
  change: string | undefined,
): ChainTruthTransition | undefined {
  if (!t || before == null || change == null) return t;
  const c = Number(change);
  return {
    ...t,
    before: fmtMorphoAmount(before),
    beforeExact: groupDecimal(before),
    change: `${c >= 0 ? "+" : "−"}${fmtMorphoAmount(Math.abs(c))}`,
    shownAsIs: true,
  };
}

/** The forensics for a Morpho liquidation — the loan-token-denominated variant
 *  of the shared two-leg block (Morpho prices in the loan token by design; no
 *  USD is asserted anywhere). Seized = |assetsDelta| (the Liquidate log's
 *  seizedAssets) valued at the oracle price the liquidation ran on
 *  (morphoLiquidationPrice); cleared = loanRepaid (repaid + any bad debt),
 *  already loan units. The premium then reproduces the market's incentive,
 *  shown beneath it. Undefined until the price is in hand. */
function buildMorphoLiqForensics(
  ctx: MorphoContext,
  coords: MorphoCoords,
  flows: AssetFlow[] | undefined,
  read: MorphoAtBlock,
): LiquidationForensicsProps | undefined {
  const used = morphoLiquidationPrice(ctx, read, coords.blockNumber);
  const seizedAmt = Math.abs(Number(ctx.assetsDelta));
  const clearedAmt = Number(ctx.loanRepaid);
  if (!used || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const price = used.price;
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const seizedValue = seizedAmt * price;
  const inLoan = (n: number) => `${fmtMorphoAmount(n)} ${loanSym}`;
  const priceBlock = used.block;
  return {
    seized: {
      symbol: collSym,
      usd: seizedValue,
      amount: `${fmtMorphoAmount(seizedAmt)} ${collSym}`,
      usdProv: liqSeizedValueProv(collSym, loanSym, coords, {
        amount: fmt(String(seizedAmt)),
        price,
      }),
    },
    cleared: {
      symbol: loanSym,
      usd: clearedAmt,
      usdProv: liqClearedValueProv(loanSym, coords, { amount: fmt(String(clearedAmt)) }),
    },
    seizedLabel: "Collateral seized",
    clearedLabel: "Debt cleared",
    premium: seizedValue / clearedAmt - 1,
    premiumProv: liqPremiumProv(loanSym, coords, { seized: inLoan(seizedValue), cleared: inLoan(clearedAmt) }),
    ...(used.lif != null && read.status === "ok"
      ? {
          premiumReference: {
            label: "Market incentive",
            value: `+${((used.lif - 1) * 100).toFixed(2)}%`,
            prov: morphoLifProv(coords, read.lltv, used.lif),
          },
        }
      : {}),
    pricePills: [
      {
        symbol: collSym,
        address: soleFlowAddress(flows, collSym),
        priceUsd: price,
        priceProv:
          priceBlock != null
            ? liqPriceUsedProv(collSym, loanSym, coords, price, priceBlock)
            : atBlockOraclePriceProv(collSym, loanSym, coords, price),
        note: priceBlock != null ? `market oracle at ${atBlockText(priceBlock, used.time)}` : "market oracle",
      },
    ],
    // Everything on this card is loan-token denominated — Morpho's own unit.
    format: { value: inLoan, price: (n: number) => `${fmtMorphoPrice(n)} ${loanSym}` },
  };
}

/** The before → after pair of one figure, in the grid's stat look. */
function MoveCard({
  label,
  before,
  after,
  beforeProv,
  afterProv,
  note,
}: {
  label: string;
  before: string;
  after: string;
  beforeProv: Parameters<typeof Prov>[0]["info"];
  afterProv: Parameters<typeof Prov>[0]["info"];
  note?: React.ReactNode;
}) {
  return (
    <StatCard label={label}>
      <StateTransition>
        <span className="text-sm font-semibold tabular-nums text-rb-500">
          <Prov info={beforeProv}>{before}</Prov>
        </span>
        <TransitionArrow size="sm" />
        <span className="text-sm font-semibold tabular-nums">
          <Prov info={afterProv}>{after}</Prov>
        </span>
      </StateTransition>
      {note && <div className="mt-0.5 text-xs text-rb-500">{note}</div>}
    </StatCard>
  );
}

/** Health factor, LTV and the borrow rate around the event — the market read
 *  at the end of block N − 1 (price) and N (rate). A cell holds its place while
 *  the read is in flight; a failed read draws nothing. */
function MorphoRiskCards({
  ctx,
  coords,
  read,
  move,
}: {
  ctx: MorphoContext;
  coords: MorphoCoords;
  read: MorphoAtBlock;
  move: MorphoHealthMove | null;
}) {
  const debtSide = ctx.eventType === "borrow" || ctx.eventType === "repay";
  const anyDebt = Number(ctx.debtBefore ?? 0) > 1e-6 || Number(ctx.debtAfter ?? ctx.borrowedAfter ?? 0) > 1e-6;
  if (!anyDebt || ctx.debtAfter == null) return null;
  if (read.status === "loading")
    return (
      <div className="grid grid-cols-1 gap-2.5 px-5 py-2 sm:grid-cols-2">
        <StatCard label="Health factor">
          <span className="inline-block h-[1em] w-24 rounded-md bg-skeleton animate-pulse" aria-hidden="true" />
        </StatCard>
      </div>
    );
  if (read.status !== "ok" || !move) return null;
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const vals = (side: "before" | "after") => ({
    collateral: String(side === "before" ? move.collBefore : move.collAfter),
    debt: String(side === "before" ? move.debtBefore : move.debtAfter),
    price: move.price,
    priceBlock: move.priceBlock,
    lltv: move.lltv,
    liquidation: move.liquidationPrice,
  });
  const hfText = (hf: number | null) => (hf == null ? "no debt" : fmtMorphoHf(hf));
  const ltvText = (l: number | null) =>
    l == null ? "no debt" : l > 0 && l < 0.001 ? "<0.1%" : `${(l * 100).toFixed(1)}%`;
  const priceNote = move.liquidationPrice ? (
    <>
      at {collSym} {fmtMorphoPrice(move.price)} {loanSym}, the market oracle at{" "}
      {atBlockText(move.priceBlock, move.priceBlockTime)}: the price the liquidation ran at
    </>
  ) : (
    <>
      at {collSym} {fmtMorphoPrice(move.price)} {loanSym}, the market oracle at{" "}
      {atBlockText(move.priceBlock, move.priceBlockTime)}
    </>
  );
  const apr = read.at.borrowApr;
  return (
    <div className="grid grid-cols-1 gap-2.5 px-5 py-2 sm:grid-cols-2">
      <MoveCard
        label="Health factor"
        before={hfText(move.hfBefore)}
        after={hfText(move.hfAfter)}
        beforeProv={morphoHealthAtEventProv("health factor", "before", collSym, loanSym, coords, vals("before"))}
        afterProv={morphoHealthAtEventProv("health factor", "after", collSym, loanSym, coords, vals("after"))}
        note={priceNote}
      />
      <MoveCard
        label={`LTV (liquidation at ${(move.lltv * 100).toFixed(1)}%)`}
        before={ltvText(move.ltvBefore)}
        after={ltvText(move.ltvAfter)}
        beforeProv={morphoHealthAtEventProv("LTV", "before", collSym, loanSym, coords, vals("before"))}
        afterProv={morphoHealthAtEventProv("LTV", "after", collSym, loanSym, coords, vals("after"))}
      />
      {debtSide && apr != null && (
        <StatCard label="Market borrow rate">
          <span className="text-sm font-semibold tabular-nums">
            <Prov info={morphoBorrowRateAtBlockProv(coords, read.at.block, apr)}>{(apr * 100).toFixed(2)}% APR</Prov>
          </span>
          <div className="mt-0.5 text-xs text-rb-500">
            at the end of {atBlockText(read.at.block, read.at.timestamp)}; it moves with the market&rsquo;s utilization,
            the share of its supplied {loanSym} that is lent out
          </div>
        </StatCard>
      )}
    </div>
  );
}

export function MorphoEventDetail({ ctx, txHash, blockNumber, flows }: MorphoEventDetailProps) {
  const chainId = useChainId();
  const coords: MorphoCoords = {
    txHash,
    blockNumber,
    marketId: ctx.marketId,
    chainId,
    source: useCaptureSource(),
  };
  const read = useMorphoAtBlock(ctx.marketId, blockNumber, chainId);
  // Which cells open into the Lifetime flows ledgers, where the page has them.
  const cells = useMorphoLedgerCells();
  // The address for each axis, read off the event's own flows under the
  // single-match rule (soleFlowAddress): a symbol two flows share resolves to
  // nothing rather than to whichever contract happened to come first. Only the
  // side this event actually moved has a flow to name, so the untouched axis —
  // muted here anyway — keeps whatever the house table can make of its symbol.
  const collAddr = soleFlowAddress(flows, ctx.collateralSymbol);
  const loanAddr = soleFlowAddress(flows, ctx.loanSymbol);
  const collActive = ctx.side === "collateral" || ctx.eventType === "liquidation";
  const borrActive = ctx.eventType === "borrow" || ctx.eventType === "repay" || ctx.eventType === "liquidation";

  // Only the axis this event's single `assetsDelta` describes (ctx.side) gets a
  // reconstructed before — on a liquidation both sides move but only that side
  // has a clean asset delta (the other's change is in shares, not assets).
  const stats: ChainTruthStat[] = [
    {
      label: "Collateral",
      value: fmtAfter(ctx.collateralAfter),
      symbol: ctx.collateralSymbol,
      address: collAddr,
      prov: collateralAfterProv(ctx.collateralSymbol, coords),
      changed: collActive,
      display: ctx.collateralAfter != null ? fmtMorphoAmount(ctx.collateralAfter) : undefined,
      ...(cells?.collateral === "collateral" ? { ledger: "collateral" as const } : {}),
      transition:
        ctx.side === "collateral"
          ? atPrecision(
              reconstructTransition({
                after: ctx.collateralAfter,
                change: ctx.assetsDelta,
                changeProv: assetsDeltaProv(ctx.collateralSymbol, "collateral", coords, ctx.eventType),
                beforeProv: collateralBeforeProv(ctx.collateralSymbol, coords),
              }),
              ctx.collateralAfter != null ? subDecimal(ctx.collateralAfter, ctx.assetsDelta) : undefined,
              ctx.assetsDelta,
            )
          : undefined,
    },
    ctx.debtAfter != null
      ? {
          // What the position owed: shares × the market's totals at the row.
          // Before = after − change, the change being debt after − debt before;
          // the gap from the previous row's after is the interest between.
          label: "Debt",
          value: fmt(ctx.debtAfter),
          display: fmtMorphoAmount(ctx.debtAfter),
          ...(cells?.debt ? { ledger: "debt" as const } : {}),
          symbol: ctx.loanSymbol,
          address: loanAddr,
          prov: debtAfterProv(ctx.loanSymbol, coords),
          changed: borrActive || Boolean(ctx.interestSincePrevious),
          transition: borrActive
            ? atPrecision(
                reconstructTransition({
                  after: ctx.debtAfter,
                  change: ctx.debtChange,
                  changeProv: debtChangeProv(ctx.loanSymbol, coords),
                  beforeProv: debtBeforeProv(ctx.loanSymbol, coords),
                }),
                ctx.debtBefore,
                ctx.debtChange,
              )
            : undefined,
          ...(ctx.interestSincePrevious
            ? {
                interestSincePrevious: {
                  value: ctx.interestSincePrevious,
                  display: fmtMorphoPart(ctx.interestSincePrevious, ctx.debtBefore ?? ctx.debtAfter),
                  prov: interestSincePreviousProv(ctx.loanSymbol, coords),
                },
              }
            : {}),
        }
      : {
          label: "Borrowed",
          value: fmtAfter(ctx.borrowedAfter),
          symbol: ctx.loanSymbol,
          address: loanAddr,
          prov: borrowedAfterProv(ctx.loanSymbol, coords),
          changed: borrActive,
          // Gated on the debt axis actually moving: a lender-side supply or
          // withdraw also rides `side: "loan"`, and its delta belongs to the
          // supplied axis below, not to the borrowed one.
          transition:
            ctx.side === "loan" && borrActive
              ? reconstructTransition({
                  after: ctx.borrowedAfter,
                  change: ctx.assetsDelta,
                  changeProv: assetsDeltaProv(ctx.loanSymbol, "loan", coords, ctx.eventType),
                  beforeProv: borrowedBeforeProv(ctx.loanSymbol, coords),
                })
              : undefined,
        },
  ];

  // The lender axis — Base only, whose rows include Supply and Withdraw; the
  // Ethereum index carries no lender rows. The Ethereum grid is unchanged.
  const lenderActive = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  if (ctx.suppliedAfter != null && ctx.supplyBefore != null) {
    // The chain's supply: shares × the market's totals at the row (Base index).
    // The gap from the previous row's after is the interest earned, net of any
    // bad debt socialised between; a loss is named as a change.
    const gap = ctx.supplyGapSincePrevious;
    stats.push({
      label: "Supplied",
      value: fmt(ctx.suppliedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: supplyAfterProv(ctx.loanSymbol, coords),
      ...(cells?.collateral === "supply" ? { ledger: "collateral" as const } : {}),
      changed: lenderActive || Boolean(gap),
      transition: lenderActive
        ? reconstructTransition({
            after: ctx.suppliedAfter,
            change: ctx.supplyChange,
            changeProv: supplyChangeProv(ctx.loanSymbol, coords),
            beforeProv: supplyBeforeProv(ctx.loanSymbol, coords),
          })
        : undefined,
      ...(gap
        ? {
            interestSincePrevious: {
              value: gap,
              prov: supplyGapSincePreviousProv(ctx.loanSymbol, coords),
              ...(Number(gap) < 0 ? { label: "Change since previous event" } : {}),
            },
          }
        : {}),
    });
  } else if (ctx.suppliedAfter != null) {
    stats.push({
      label: "Supplied",
      value: fmt(ctx.suppliedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: suppliedAfterProv(ctx.loanSymbol, coords),
      changed: true,
      transition: reconstructTransition({
        after: ctx.suppliedAfter,
        change: ctx.assetsDelta,
        changeProv: assetsDeltaProv(ctx.loanSymbol, "loan", coords, ctx.eventType),
        beforeProv: suppliedBeforeProv(ctx.loanSymbol, coords),
      }),
    });
  }

  const forensics = ctx.eventType === "liquidation" ? buildMorphoLiqForensics(ctx, coords, flows, read) : undefined;
  const move = morphoHealthMove(ctx, read, blockNumber);

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {ctx.eventType !== "supply" && ctx.eventType !== "withdraw" && (
        <MorphoRiskCards ctx={ctx} coords={coords} read={read} move={move} />
      )}
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
