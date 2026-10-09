"use client";

// Compound V3 (Comet) event cells (ui-jobs 309): the card's `cells` slot, two
// ledger cells always. Collateral holds the collateral assets and the base
// while it is lent; Debt holds the base while it is borrowed. A base that
// crosses zero in one event states its before in the one cell and its after in
// the other. The touched asset's figures are the chain's (the replayed after,
// the logged change, the before reconstructed from the two); a side holding
// several assets states its dollars before → after from the position's replay
// behind the assets' icons, as the cToken cards do. The absorb breakdown and
// the rate note stand under the grid as notes.

import { useContext, type ReactNode } from "react";
import { unreadBalanceText, useCompoundBalanceRead } from "./balance-read";
import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { InterestLine, useStatCells } from "@/components/shared/chain-truth-stat-cell";
import type { EventCardLedgers } from "@/components/shared/event-card";
import type { EventCells, EventLedgerCellSpec } from "@/components/shared/event-cells";
import type { EventPriceChip } from "@/components/shared/event-price-row";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import { SIDE_NAME } from "@/components/shared/event-ledger";
import { fmtPositionUsd } from "@/components/shared/position-row";
import { Prov } from "@/components/shared/provenance";
import {
  CompoundAbsorbBreakdown,
  type CompoundPreviousRow,
} from "@/components/protocol/compound/compound-absorb-breakdown";
import { compoundAmount, compoundBaseBefore, impliedYearlyRate, isBaseDust } from "@/lib/compound/row-facts";
import { compoundSideBalances } from "@/lib/compound/flows";
import { decimalSub, formatUsdValue } from "@/lib/utils/format";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import {
  absorbPriceProv,
  baseAfterProv,
  baseInterestProv,
  collateralAfterProv,
  baseDeltaProv,
  collateralDeltaProv,
  transferBaseProv,
  transferCollateralProv,
  absorbDebtProv,
  absorbCollateralProv,
  baseBeforeProv,
  collateralBeforeProv,
  cometPriceAtBlockProv,
  replayHeldProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { CompoundRateNote } from "@/components/protocol/compound/compound-rate-note";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { CompoundFlowReplayContext, CompoundLedgerProvider, useCompoundLedgerState } from "./compound-ledger";

export interface CompoundCellsInput {
  ctx: CompoundContext;
  txHash?: string;
  blockNumber?: number;
  /** The row's time, unix seconds. */
  timestamp: number;
  /** The account's previous row in this market, where the page has it: the
   *  interest line's yearly rate reads from it. */
  previous?: CompoundPreviousRow;
  /** The last row of the previous transaction: the absorb's "what moved". */
  previousTx?: CompoundPreviousRow;
  /** The timeline event, for the cells' ledgers. */
  eventId: string;
}

/** A before within one unit of zero is Comet's rounding: it reads as zero,
 *  and its receipt says why. */
function dustBefore(
  t: ChainTruthStat["transition"],
  isDust: boolean,
  sym: string,
  decimals: number,
): ChainTruthStat["transition"] {
  if (!t || !isDust) return t;
  const unit = (10 ** -decimals).toFixed(decimals);
  return {
    ...t,
    before: "0",
    beforeExact: "0",
    beforeProv: {
      ...t.beforeProv,
      summary: `Balance before — 0. After minus the change lands within one unit (${unit} ${sym}) of zero: Comet rounds a balance's present value down, so a flat balance reads one unit either side of zero. Shown as 0.`,
    },
  };
}

const fmt = (human?: string): string => (human == null ? "—" : compoundAmount(Number(human)));
/** A decimal string's negation: a borrowed base balance is stated as the
 *  amount owed, positive, as the Debt cell and its ledger state it. */
const negated = (v: string): string => (v.startsWith("-") ? v.slice(1) : /^0(\.0*)?$/.test(v) ? v : `-${v}`);
const isNeg = (s: string) => s.startsWith("-") && !/^-0(\.0*)?$/.test(s);
const isPos = (s: string) => !s.startsWith("-") && !/^0(\.0*)?$/.test(s);

/** The card's cells, ledgers, notes and prices. */
export function useCompoundCells({
  ctx,
  txHash,
  blockNumber,
  timestamp,
  previous,
  previousTx,
  eventId,
}: CompoundCellsInput): { cells: EventCells; ledgers: EventCardLedgers; notes: ReactNode; prices: EventPriceChip[] } {
  const m = useCometMarket(ctx.market);
  const ledgerState = useCompoundLedgerState(eventId);
  const rp = useContext(CompoundFlowReplayContext);
  const coords: CompoundCoords = {
    comet: m.comet,
    marketLabel: m.label,
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
    ...(ctx.quoteUsd != null ? { quoteUsd: ctx.quoteUsd } : {}),
  };
  const balanceRead = useCompoundBalanceRead();
  const baseSym = m.baseSymbol;
  const at = `this event`;

  // Interest since the account's previous row (Ethereum rows carry it; the
  // Base sweep's do not), stated under the base's cell as a magnitude.
  const interestSincePrevious = (sym: string): ChainTruthStat["interestSincePrevious"] => {
    // One unit either way is Comet's rounding, not interest.
    if (ctx.baseInterest == null || isBaseDust(ctx.baseInterest, m.baseDecimals)) return undefined;
    const signed = ctx.baseInterest;
    const mag = signed.startsWith("-") ? signed.slice(1) : signed;
    // The yearly rate that growth works out to, over the balance the
    // previous row left and the time between the two. Interest is rounded to
    // the token's last unit, so under a thousand units the rate it works out
    // to is mostly rounding: not stated.
    const meaningful = Number(mag) >= 1000 * 10 ** -m.baseDecimals;
    const rate =
      meaningful && previous?.baseAfter != null
        ? impliedYearlyRate(Number(mag), Number(previous.baseAfter), timestamp - previous.timestamp)
        : null;
    const days = previous ? (timestamp - previous.timestamp) / 86400 : null;
    return {
      value: mag,
      prov: baseInterestProv(sym, signed.startsWith("-") ? "borrow" : "lend", coords),
      ...(rate != null && days != null && Number(mag) > 0
        ? {
            after: `, over ${days < 10 ? days.toFixed(1) : Math.round(days).toLocaleString("en-US")} days: about ${(rate * 100).toFixed(1)}% a year`,
          }
        : {}),
    };
  };

  // ── The chain's figures for each side ──
  // The base: before and after this event (a collateral row leaves it as it
  // stood), signed; unread on a swept row whose balance is still being read.
  const baseAfter = ctx.baseUnsettled ? null : (ctx.baseAfter ?? null);
  const baseBefore = baseAfter == null ? null : ctx.isBase ? compoundBaseBefore(ctx, m.baseDecimals) : baseAfter;
  const baseMoved = ctx.isBase && baseAfter != null && baseBefore != null;
  const baseChangeProv =
    ctx.eventType === "absorb_debt"
      ? absorbDebtProv(baseSym, coords)
      : ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out"
        ? transferBaseProv(baseSym, ctx.eventType === "transfer_in" ? "in" : "out", coords)
        : baseDeltaProv(baseSym, ctx.eventType === "supply" ? "supply" : "withdraw", coords);
  const crosses = baseMoved && ((isPos(baseBefore!) && isNeg(baseAfter!)) || (isNeg(baseBefore!) && isPos(baseAfter!)));

  /** The base's stat on a side: lent on the collateral side, owed on the
   *  debt side; null where the base stands on neither end of the event. */
  const baseStat = (side: FlowSide): ChainTruthStat | null => {
    if (baseAfter == null || baseBefore == null) return null;
    const on = side === "collateral" ? isPos : isNeg;
    if (!on(baseAfter) && !on(baseBefore)) return null;
    const owed = side === "debt";
    const shown = (v: string) => (on(v) ? (owed ? negated(v) : v) : "0");
    const after = shown(baseAfter);
    const holdsAfter = on(baseAfter) || !on(baseBefore);
    let transition: ChainTruthStat["transition"];
    if (baseMoved && !crosses)
      transition = dustBefore(
        reconstructTransition({
          after,
          change: owed ? negated(ctx.assetsDelta) : ctx.assetsDelta,
          changeProv: baseChangeProv,
          beforeProv: baseBeforeProv(baseSym, coords, owed),
        }),
        baseBefore === "0" && decimalSub(baseAfter, ctx.assetsDelta) !== "0",
        baseSym,
        m.baseDecimals,
      );
    else if (crosses) {
      // The base crossed zero: this side states its part of the move, the
      // balance before on the one side and after on the other.
      const before = shown(baseBefore);
      const change = decimalSub(after, before) ?? "0";
      const sign = change.startsWith("-") ? "−" : "+";
      const mag = change.replace(/^-/, "");
      transition = {
        before: fmt(before),
        beforeExact: before,
        beforeProv: baseBeforeProv(baseSym, coords, owed),
        change: `${sign}${fmt(mag)}`,
        changeExact: `${sign}${mag}`,
        changeProv: {
          kind: "chain-derived",
          summary: `${baseSym} ${owed ? "owed" : "lent"} change at ${at} — the ${owed ? "amount owed" : "balance lent"} after less the one before: the base crossed zero, so the move splits between the two cells.`,
          formula: "after − before",
        },
        shownAsIs: true,
      };
    }
    return {
      label: SIDE_NAME[side],
      value: fmt(after),
      symbol: baseSym,
      prov: baseAfterProv(baseSym, coords, owed),
      changed: baseMoved && shown(baseBefore) !== after,
      transition,
      interestSincePrevious: holdsAfter ? interestSincePrevious(baseSym) : undefined,
      ledger: side,
    };
  };

  /** The touched collateral asset's stat. */
  const collStat = (): ChainTruthStat | null => {
    if (ctx.isBase) return null;
    const collCoords: CompoundCoords = { ...coords, asset: undefined };
    const changeProv =
      ctx.eventType === "absorb_collateral"
        ? absorbCollateralProv(ctx.assetSymbol, collCoords)
        : ctx.eventType === "transfer_collateral_in" || ctx.eventType === "transfer_collateral_out"
          ? transferCollateralProv(
              ctx.assetSymbol,
              ctx.eventType === "transfer_collateral_in" ? "in" : "out",
              collCoords,
            )
          : collateralDeltaProv(
              ctx.assetSymbol,
              ctx.eventType === "supply_collateral" ? "supply" : "withdraw",
              collCoords,
            );
    return {
      label: SIDE_NAME.collateral,
      value: fmt(ctx.collateralAfter),
      symbol: ctx.assetSymbol,
      prov: collateralAfterProv(ctx.assetSymbol, collCoords),
      transition: reconstructTransition({
        after: ctx.collateralAfter,
        change: ctx.assetsDelta,
        changeProv,
        beforeProv: collateralBeforeProv(ctx.assetSymbol, collCoords),
      }),
      ledger: "collateral",
    };
  };

  // ── The replay's view of each side, where the page has one ──
  const sides = (["collateral", "debt"] as const).map((side) => ({
    side,
    sb: ledgerState === "ready" && rp ? compoundSideBalances(rp, eventId, side) : null,
  }));

  const chainStats: (ChainTruthStat & { key: string })[] = [];
  // Every chain stat the cells state, for the rate note.
  const stated: ChainTruthStat[] = [];
  const direct: Partial<Record<FlowSide, EventLedgerCellSpec>> = {};
  const lines: Partial<Record<FlowSide, ChainTruthStat>> = {};
  for (const { side, sb } of sides) {
    const held = side === "collateral" ? [collStat(), baseStat("collateral")] : [baseStat("debt")];
    const chain = held.filter((st): st is ChainTruthStat => st != null);
    stated.push(...chain);
    if (sb && sb.balances.length > 1) {
      // Several assets: the side's dollars before → after, behind their icons.
      const moved = sb.balances.some((b) => Math.abs(b.amount - b.before) > 1e-12);
      const usdText = (v: number) => (v < 0.005 ? "$0" : fmtPositionUsd(v));
      direct[side] = {
        kind: "ledger",
        side,
        key: side,
        label: SIDE_NAME[side],
        changed: moved,
        value: {
          cluster: sb.balances.map((b) => b.symbol),
          before:
            moved && Math.round(sb.heldBefore) !== Math.round(sb.held)
              ? { text: usdText(sb.heldBefore), info: replayHeldProv(side, true, coords) }
              : undefined,
          after: { text: usdText(sb.held), info: replayHeldProv(side, false, coords) },
        },
        sub: chain.flatMap((st) =>
          st.interestSincePrevious ? [{ content: <InterestLine stat={st} />, changed: false }] : [],
        ),
      };
      continue;
    }
    if (chain.length > 0) {
      // Without the replay a collateral row may hold lent base beside it: the
      // collateral states the cell and the base its line under it.
      chainStats.push({ ...chain[0], key: side });
      if (chain[1]) lines[side] = chain[1];
      continue;
    }
    const one = sb?.balances[0];
    if (one) {
      // One asset this event left alone, as the replay holds it.
      chainStats.push({
        key: side,
        label: SIDE_NAME[side],
        value: compoundAmount(one.amount),
        symbol: one.symbol,
        prov: replayHeldProv(side, false, coords, one.symbol),
        changed: false,
        ledger: side,
      });
      continue;
    }
    direct[side] = {
      kind: "ledger",
      side,
      key: side,
      label: SIDE_NAME[side],
      changed: false,
      value: { none: side === "debt" && ctx.baseUnsettled ? unreadBalanceText(balanceRead) : "None" },
    };
  }
  const statCells = useStatCells(chainStats);
  const cells = (["collateral", "debt"] as const).flatMap((side) => {
    const c = direct[side] ?? statCells.find((x) => x.key === side);
    if (!c) return [];
    const line = lines[side];
    if (!line) return [c];
    return [
      {
        ...c,
        sub: [
          ...(c.sub ?? []),
          {
            content: (
              <>
                Lent:{" "}
                <Prov info={line.prov} value={line.value}>
                  {line.value}
                </Prov>{" "}
                {line.symbol}
              </>
            ),
            changed: line.changed,
          },
          ...(line.interestSincePrevious ? [{ content: <InterestLine stat={line} />, changed: false }] : []),
        ],
      },
    ];
  });

  // ── The price row: the moved asset's price at the block, where the
  // replay read it there or an absorb states it.
  const prices: EventPriceChip[] = [];
  const row = rp?.replayed.find((r) => r.ev.id === eventId);
  if (row && row.own.has(row.ev.token) && row.price[row.ev.token] > 0) {
    const usd = row.price[row.ev.token];
    const absorb = ctx.eventType === "absorb_debt" || ctx.eventType === "absorb_collateral";
    prices.push({
      symbol: ctx.assetSymbol,
      usd,
      display: formatUsdValue(usd),
      info:
        absorb && ctx.usdValue != null
          ? absorbPriceProv(ctx.assetSymbol, coords, {
              amount: ctx.assetsDelta.replace(/^-/, ""),
              usdValue: ctx.usdValue,
            })
          : cometPriceAtBlockProv(ctx.assetSymbol, coords),
      title: `${ctx.assetSymbol} price at this event: ${absorb ? "the absorb's value over its amount" : `${m.label}'s oracle at block ${blockNumber?.toLocaleString("en-US") ?? ""}`}`,
    });
  }

  const averageStated = stated.some((st) => st.interestSincePrevious?.after != null);
  const showRates =
    ctx.eventType !== "absorb_debt" &&
    stated.some((st) => st.interestSincePrevious != null) &&
    previous != null &&
    blockNumber != null &&
    previous.blockNumber < blockNumber;
  const notes =
    showRates || ctx.eventType === "absorb_debt" ? (
      <>
        {showRates && (
          <CompoundRateNote
            chainId={coords.chainId}
            marketKey={m.key}
            prevBlock={previous!.blockNumber}
            block={blockNumber!}
            hasAverage={averageStated}
          />
        )}
        {ctx.eventType === "absorb_debt" && (
          <CompoundAbsorbBreakdown
            ctx={ctx}
            coords={coords}
            marketKey={m.key}
            timestamp={timestamp}
            previous={previousTx}
          />
        )}
      </>
    ) : undefined;

  return {
    cells,
    ledgers: {
      provider: (children) =>
        ledgerState == null ? (
          <EventLedgerContext.Provider value={ROW_CELLS}>{children}</EventLedgerContext.Provider>
        ) : (
          <CompoundLedgerProvider eventId={eventId} eventTs={timestamp}>
            {children}
          </CompoundLedgerProvider>
        ),
    },
    notes,
    prices,
  };
}
