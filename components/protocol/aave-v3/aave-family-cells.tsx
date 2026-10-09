"use client";

// The Aave family's T2 cells (rails-ops reference/shared-event-card-spec.md §4;
// ui-jobs 309 step 6): the account around the event's transaction, read at its
// block, as the shared grid's cells. A Collateral and a Debt ledger cell, each
// one row closed: one reserve's tokens before → after (its dollars in the
// ledger's tooltip), or several reserves' dollars before → after with one icon
// per reserve held; each opens into its side's ledger as of the event. Then
// the health factor, the LTV against its limits, what could still be borrowed,
// and the eMode category, each stating whether the event moved it and, where
// derived, from which cells (ui-jobs 243).
//
// RULE (§47): a balance is stated once. Where the read lists the reserve the
// event touched, its side cell states it and no other cell does.
// RULE (§52): a reserve under a cent the event did not touch draws no icon.
// RULE (§54): a supply whose collateral switch flipped says so under the
// figures; an unflipped one's flag rides on its balance's receipt.
//
// Aave V3 on Ethereum and Base, Seamless's switch rows and SparkLend share it:
// SparkLend runs Aave V3's account arithmetic.

import { useMemo, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { AmountText, ExactTip } from "@/components/shared/amount-text";
import { todayUsdProv, useTodayBasisPrices } from "@/components/shared/price-basis";
import {
  AssetLedgers,
  DayCloseNote,
  EventLedgerContext,
  LedgerTable,
  SIDE_NAME,
  dayStamp,
  useEventCum,
  usdAt,
  type EventLedgerSource,
} from "@/components/shared/event-ledger";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import type {
  EventCellHead,
  EventCellSpec,
  EventFigure,
  EventLedgerCellSpec,
  EventStatCellSpec,
} from "@/components/shared/event-cells";
import type { ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { EventPriceChip } from "@/components/shared/event-price-row";
import type { AtBlockPricePill } from "@/components/shared/liquidation-forensics";
import { fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import { usdShown } from "@/lib/shared/usd-display";
import { formatCompact, formatNumber, formatUsdValue } from "@/lib/utils/format";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import {
  assetTokenSum,
  eventAssetSum,
  eventSideSum,
  eventSideSumByAsset,
  type AssetBalance,
  type EventCum,
} from "@/lib/shared/flow-focus";
import { assetLedgers, dollarLedger, tokenLedger } from "@/lib/shared/event-ledger";
import { ledgerPartProv } from "@/lib/shared/flows-timeline-provenance";
import {
  accountRatioProv,
  accountTotalProv,
  borrowableProv,
  currentLtvProv,
  exactBalanceChangeProv,
  exactBalanceProv,
  heldAtEventProv,
  prevEventInterestProv,
  sideChangeProv,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import {
  baseToUsd,
  beforeAtBlockPrices,
  big,
  borrowableBase,
  bpsPct,
  groupExact,
  hfLabelV3,
  humanOf,
  interestSincePrevious,
  legChange,
  legHeld,
  rawToUsd,
  wadToNumber,
  type AaveV3AccountSide,
  type AaveV3PositionState,
  type AaveV3PositionStateReserve,
  type InterestPart,
} from "@/lib/aave-v3/position-state";
import {
  CollateralFlipNote,
  emodeFigure,
  exactLeg,
  exactUsd,
  hfAtCallProv,
  hfFigure,
  isDustRow,
  ltvAtCallProv,
  reserveSymbol,
  withFlagNote,
  type Figure,
  type TouchedLeg,
} from "./aave-v3-position-state";

type Side = "supply" | "debt";
const ZERO = BigInt(0);

/** The cells' names before the read lands, for the skeleton. */
export const ACCOUNT_CELL_HEADS: EventCellHead[] = [
  { kind: "ledger", side: "collateral", label: "Collateral" },
  { kind: "ledger", side: "debt", label: "Debt" },
  { kind: "stat", label: "Health factor" },
  { kind: "stat", label: "LTV" },
  { kind: "stat", label: "Still borrowable" },
];

/** A position-state figure as a cell's. */
export const fig = (f: Figure): EventFigure => ({ text: f.text, info: f.prov, value: f.value });

/** Each side's figures at the event. */
function sideFacts(state: AaveV3PositionState, side: FlowSide) {
  const acc = state.account;
  const base = (a: AaveV3AccountSide) => (side === "collateral" ? a.totalCollateralBase : a.totalDebtBase);
  const before = acc ? baseToUsd(base(acc.before)) : null;
  const after = acc ? baseToUsd(base(acc.after)) : null;
  // A supply with its switch off: the Pool's total leaves it out, the flows
  // count it, so the sum's total adds every supplied balance.
  const offSupply =
    side === "collateral" &&
    state.reserves.some((r) => r.collateral?.after === false && big(r.supply.after) > ZERO);
  const parts: { symbol: string; usd: number }[] = [];
  let priced = true;
  if (side === "collateral")
    for (const r of state.reserves) {
      if (big(r.supply.after) <= ZERO) continue;
      if (r.priceBase == null || r.decimals == null) priced = false;
      else parts.push({ symbol: reserveSymbol(r), usd: rawToUsd(r.supply.after, r.priceBase, r.decimals) });
    }
  const held = offSupply ? (priced ? parts.reduce((a, p) => a + p.usd, 0) : null) : after;
  // What every supplied balance was worth before the transaction, where the
  // sum's total adds them.
  let heldBefore: number | null = offSupply ? 0 : before;
  if (offSupply)
    for (const r of state.reserves) {
      if (big(r.supply.before) <= ZERO) continue;
      if (r.priceBase == null || r.decimals == null) heldBefore = null;
      else if (heldBefore != null) heldBefore += rawToUsd(r.supply.before, r.priceBase, r.decimals);
    }
  return {
    before,
    after,
    changed: before != null && after != null && Math.round(before * 100) !== Math.round(after * 100),
    offSupply,
    held,
    heldBefore,
    parts,
  };
}
type SideFacts = ReturnType<typeof sideFacts>;

/** Each asset of a side at the block, in tokens, for the sum by asset. */
function sideBalances(state: AaveV3PositionState, side: FlowSide): AssetBalance[] {
  const out: AssetBalance[] = [];
  for (const r of state.reserves) {
    if (r.decimals == null) continue;
    const l = side === "collateral" ? r.supply : r.debt;
    if (big(l.after) <= ZERO && big(l.before) <= ZERO) continue;
    out.push({
      symbol: reserveSymbol(r),
      amount: Number(humanOf(l.after, r.decimals)),
      before: Number(humanOf(l.before, r.decimals)),
      price: r.priceBase != null ? Number(big(r.priceBase)) / 1e8 : null,
    });
  }
  return out;
}

const atWords = (eventTs?: number) => (eventTs != null ? `this event (${dayStamp(eventTs)})` : "this event");
const usdText = (v: number) => (v < 0.005 ? "$0" : fmtPositionUsd(v));

/** What the side's ledger closes on in dollars, with its receipts: the
 *  Pool's account total, or where a supply has its collateral switch off,
 *  every supplied balance (the flows count it). */
function sideTotals(
  side: FlowSide,
  state: AaveV3PositionState,
  coords: V3Coords,
  facts: SideFacts,
  at: string,
): { afterProv: Provenance; beforeProv: Provenance } {
  const what = side === "collateral" ? "collateral" : "debt";
  const afterProv =
    side === "collateral" && facts.offSupply && facts.held != null
      ? heldAtEventProv(coords, { parts: facts.parts, total: facts.held })
      : accountTotalProv(what, "after", coords, {
          base:
            side === "collateral"
              ? (state.account?.after.totalCollateralBase ?? "0")
              : (state.account?.after.totalDebtBase ?? "0"),
          poolRevision: state.sources.poolRevision,
        });
  const beforeProv =
    facts.offSupply || !state.account
      ? ledgerPartProv(SIDE_NAME[side], "USD", at, "held-before")
      : accountTotalProv(what, "before", coords, {
          base: side === "collateral" ? state.account.before.totalCollateralBase : state.account.before.totalDebtBase,
          poolRevision: state.sources.poolRevision,
        });
  return { afterProv, beforeProv };
}

/** The closed cell's dollars before → after, as its ledger closes on them. */
function sideUsd(
  side: FlowSide,
  state: AaveV3PositionState,
  coords: V3Coords,
  facts: SideFacts,
  eventTs?: number,
): { before: Figure | null; after: Figure; change: Figure | null } | null {
  const after = facts.offSupply ? facts.held : facts.after;
  const before = facts.offSupply ? facts.heldBefore : facts.before;
  if (after == null) return null;
  const { afterProv, beforeProv } = sideTotals(side, state, coords, facts, atWords(eventTs));
  // The change between the Pool's two totals, behind the arrow's toggle.
  const diff = before != null ? after - before : 0;
  const change =
    !facts.offSupply && facts.changed && before != null
      ? {
          text: `${diff < 0 ? "−" : "+"}${fmtPositionUsd(Math.abs(diff))}`,
          value: `${diff < 0 ? "−" : "+"}${formatUsdValue(Math.abs(diff))}`,
          prov: sideChangeProv(side === "collateral" ? "collateral" : "debt", coords, { before, after }),
        }
      : null;
  return {
    after: { text: usdText(after), value: formatUsdValue(after), prov: afterProv },
    before: before != null ? { text: usdText(before), value: formatUsdValue(before), prov: beforeProv } : null,
    change,
  };
}

/** A side's dollars over several reserves: at the event's prices, or, on a
 *  card set to today, at the latest block's where every reserve has one
 *  (ui-jobs 283). */
function SideDollars({
  which,
  event,
  rows,
  side,
  account,
}: {
  which: "before" | "after" | "change";
  event: Figure | null;
  rows: AaveV3PositionStateReserve[];
  side: Side;
  /** Marks the after figure, which a verifier reads. */
  account?: boolean;
}) {
  const todayOf = useTodayBasisPrices();
  const total = (when: "before" | "after"): number | null => {
    let t = 0;
    let priced = 0;
    for (const r of rows) {
      const amount = Number(humanOf((side === "supply" ? r.supply : r.debt)[when], r.decimals!));
      if (!(amount > 0)) continue;
      const p = todayOf(reserveSymbol(r));
      if (p == null) return null;
      t += amount * p;
      priced++;
    }
    return priced > 0 ? t : null;
  };
  const what = (when: string) => `${side === "supply" ? "Collateral" : "Debt"} ${when} the event`;
  const todayAfter = total("after");
  let shown: Figure | null = event;
  if (todayAfter != null) {
    if (which === "after") shown = { text: fmtPositionUsd(todayAfter), value: todayAfter.toFixed(2), prov: todayUsdProv(what("after"), "each reserve") };
    else {
      const b = total("before");
      if (b == null) shown = null;
      else if (which === "before")
        shown = { text: fmtPositionUsd(b), value: b.toFixed(2), prov: todayUsdProv(what("before"), "each reserve") };
      else {
        const d = todayAfter - b;
        shown = {
          text: `${d < 0 ? "−" : "+"}${fmtPositionUsd(Math.abs(d))}`,
          value: `${d < 0 ? "−" : "+"}${d.toFixed(2)}`,
          prov: todayUsdProv(`${side === "supply" ? "Collateral" : "Debt"}\u2019s change over the event,`, "each reserve"),
        };
      }
    }
  }
  if (!shown) return null;
  const body = (
    <Prov info={shown.prov} value={shown.value}>
      {shown.text}
    </Prov>
  );
  return account ? <span data-account-total={side === "supply" ? "collateral" : "debt"}>{body}</span> : body;
}

export interface AccountSideArgs {
  state: AaveV3PositionState;
  coords: V3Coords;
  /** The reserves the event touched: their icons always draw (§52). */
  touched: TouchedLeg[];
  /** The sides whose balance the event moved: their headings stand in the
   *  foreground (ui-jobs 243). */
  moved: Set<Side>;
  eventTs?: number;
  /** Lines under each side's figures (the interest since the previous event). */
  sub?: Partial<Record<Side, EventLedgerCellSpec["sub"]>>;
}

/** One side's cell. */
function sideCell(a: AccountSideArgs, side: Side): EventLedgerCellSpec {
  const { state, coords } = a;
  const flowSide: FlowSide = side === "supply" ? "collateral" : "debt";
  const legOf = (r: AaveV3PositionStateReserve) => (side === "supply" ? r.supply : r.debt);
  const rows = state.reserves.filter((r) => r.decimals != null && legHeld(legOf(r)));
  const touched = new Set(a.touched.filter((t) => t.side === side).map((t) => t.reserve));
  const afterProvOf = (r: AaveV3PositionStateReserve): Provenance => {
    const sym = reserveSymbol(r);
    const flag = side === "supply" ? r.collateral : null;
    const prov = exactBalanceProv(sym, side, "after", coords, exactLeg(legOf(r), "after", r.decimals!, state.blockTimestamp));
    return flag && flag.before === flag.after ? withFlagNote(prov, sym, flag.after, coords) : prov;
  };
  const flips = rows.flatMap((r) => {
    const flag = side === "supply" ? r.collateral : null;
    return flag && flag.before !== flag.after ? [{ r, flag }] : [];
  });
  const sub: NonNullable<EventLedgerCellSpec["sub"]> = [
    ...flips.map(({ r, flag }) => ({
      content: <CollateralFlipNote sym={reserveSymbol(r)} flag={flag} coords={coords} named={rows.length > 1} />,
    })),
    ...(side === "supply" && state.sources.settings == null
      ? [{ content: <>Collateral on/off isn&rsquo;t available at this block.</> }]
      : []),
    ...(a.sub?.[side] ?? []),
  ];
  const changed = a.moved.has(side) || flips.length > 0;
  const data = {
    "data-position-card": flowSide,
    "data-receipt-cell": flowSide,
    "data-receipt-total": side,
    "data-receipt-changed": changed ? "true" : "false",
  };
  const common = { key: flowSide, label: SIDE_NAME[flowSide], side: flowSide, kind: "ledger" as const, changed, data, sub };

  if (rows.length === 1) {
    const r = rows[0];
    const decimals = r.decimals!;
    const sym = reserveSymbol(r);
    const leg = legOf(r);
    const before = humanOf(leg.before, decimals);
    const after = humanOf(leg.after, decimals);
    const moved = legChange(leg, decimals);
    const sign = moved.sign < 0 ? "−" : "+";
    const uAfter = exactUsd(state, r, side, "after", coords);
    const uBefore = moved.sign !== 0 ? exactUsd(state, r, side, "before", coords) : undefined;
    return {
      ...common,
      value: {
        ...(moved.sign !== 0
          ? {
              before: {
                text: fmtPositionAmount(before),
                info: exactBalanceProv(sym, side, "before", coords, exactLeg(leg, "before", decimals, state.blockTimestamp)),
                value: groupExact(before),
              },
              delta: {
                text: `${sign}${fmtPositionAmount(moved.magnitude)}`,
                info: exactBalanceChangeProv(sym, side, coords, { before: groupExact(before), after: groupExact(after) }),
                value: `${sign}${groupExact(moved.magnitude)}`,
              },
            }
          : {}),
        after: { text: fmtPositionAmount(after), info: afterProvOf(r), value: groupExact(after) },
        afterClass: `tabular-nums ${moved.sign !== 0 ? "text-foreground" : "text-rb-500"}`,
        icon: sym,
        iconAddress: r.reserve,
      },
      usd:
        uAfter != null || uBefore != null
          ? {
              before: uBefore ? (
                <Prov info={uBefore.prov} value={uBefore.exact}>
                  {fmtPositionUsd(uBefore.value)}
                </Prov>
              ) : null,
              after: uAfter ? (
                <Prov info={uAfter.prov} value={uAfter.exact}>
                  {fmtPositionUsd(uAfter.value)}
                </Prov>
              ) : (
                "$0"
              ),
              ...(r.priceBase != null
                ? usdAt({ price: Number(humanOf(r.priceBase, 8)), symbol: sym, before: Number(before), after: Number(after) })
                : {}),
            }
          : undefined,
    };
  }

  // Several reserves (or none): the side's dollars, and one icon per reserve
  // held after the event, whose tip reads its balance.
  const facts = sideFacts(state, flowSide);
  const usd = sideUsd(flowSide, state, coords, facts, a.eventTs);
  const icons = rows
    .filter((r) => big(legOf(r).after) > ZERO && (touched.has(r.reserve) || !isDustRow(r, side)))
    .map((r) => {
      const amount = humanOf(legOf(r).after, r.decimals!);
      return {
        symbol: reserveSymbol(r),
        address: r.reserve,
        info: afterProvOf(r),
        value: groupExact(amount),
        title: `${fmtPositionAmount(amount)} ${reserveSymbol(r)}`,
      };
    });
  const differs = !!usd?.before && usd.before.value !== usd.after.value;
  return {
    ...common,
    value: usd
      ? {
          ...(differs
            ? {
                before: { text: <SideDollars which="before" event={usd.before} rows={rows} side={side} /> },
                delta: usd.change
                  ? { text: <SideDollars which="change" event={usd.change} rows={rows} side={side} /> }
                  : undefined,
              }
            : {}),
          after: { text: <SideDollars which="after" event={usd.after} rows={rows} side={side} account /> },
          afterClass: `tabular-nums ${differs ? "text-foreground" : "text-rb-500"}`,
          icons,
        }
      : { none: "Not available at this block", icons },
  };
}

/** The Collateral and Debt cells. */
export function accountSideCells(a: AccountSideArgs): EventLedgerCellSpec[] {
  return [sideCell(a, "supply"), sideCell(a, "debt")];
}

/** "a" or "an" before a percentage as read aloud: an 80.50%, an 11.00%, an
 *  18.00%; a 76.71%. */
const article = (pct: string): string => (/^(8|11\.|18\.)/.test(pct) ? "an" : "a");

/** A figure inside a sentence, before → after where it moved. */
function InlinePair({ before, after }: { before: Figure; after: Figure }) {
  return (
    <>
      {before.value !== after.value && (
        <>
          <Prov info={before.prov} value={before.value}>
            {before.text}
          </Prov>{" "}
          →{" "}
        </>
      )}
      <Prov info={after.prov} value={after.value}>
        {after.text}
      </Prov>
    </>
  );
}

const DERIVED = ["collateral", "debt"];

/** The LTV cell (debt ÷ collateral before → after, of the weighted max LTV,
 *  with the liquidation threshold: "37.52% of a 76.71% maximum; liquidation at
 *  80.47%") and what the account could still borrow once the transaction had
 *  run. `before` replaces the before figure (a liquidation's, at the prices
 *  the call ran at). */
export function ltvCells(state: AaveV3PositionState, coords: V3Coords, beforeOverride?: Figure): EventStatCellSpec[] {
  const { account, emode } = state;
  if (!account)
    return [
      {
        key: "ltv",
        kind: "stat",
        label: "LTV",
        changed: false,
        inputs: DERIVED,
        value: { none: "Not available at this block" },
        data: { "data-position-card": "ltv" },
      },
    ];
  const inEmode = !!emode && (emode.before !== 0 || emode.after !== 0);
  const current = (a: AaveV3AccountSide, when: "before" | "after"): Figure => {
    const coll = baseToUsd(a.totalCollateralBase);
    const debt = baseToUsd(a.totalDebtBase);
    const text = coll > 0 ? `${((debt / coll) * 100).toFixed(2)}%` : "—";
    return { text, value: text, prov: currentLtvProv(when, coords, { debtUsd: debt, collateralUsd: coll }) };
  };
  const ratio = (which: "ltv" | "lt", a: AaveV3AccountSide, when: "before" | "after"): Figure => {
    const bps = which === "ltv" ? a.ltvBps : a.liquidationThresholdBps;
    return { text: bpsPct(bps), value: bpsPct(bps), prov: accountRatioProv(which, when, coords, { bps, emode: inEmode }) };
  };
  const hasCollateral = big(account.before.totalCollateralBase) > ZERO || big(account.after.totalCollateralBase) > ZERO;
  const before = beforeOverride ?? current(account.before, "before");
  const after = current(account.after, "after");
  const ltvMoved = before.value !== after.value;
  const room = borrowableBase(account.after);
  const roomUsd = baseToUsd(room.toString());
  const roomBefore = borrowableBase(account.before);
  return [
    {
      key: "ltv",
      kind: "stat",
      label: "LTV",
      changed: ltvMoved,
      inputs: DERIVED,
      value: { ...(ltvMoved ? { before: fig(before) } : {}), after: fig(after), afterClass: `tabular-nums ${ltvMoved ? "text-foreground" : "text-rb-500"}` },
      sub: hasCollateral
        ? [
            {
              content: (
                <span data-ltv-limits="">
                  of{" "}
                  {article(bpsPct(account.before.ltvBps !== account.after.ltvBps ? account.before.ltvBps : account.after.ltvBps))}{" "}
                  <InlinePair before={ratio("ltv", account.before, "before")} after={ratio("ltv", account.after, "after")} />{" "}
                  maximum; liquidation at{" "}
                  <InlinePair before={ratio("lt", account.before, "before")} after={ratio("lt", account.after, "after")} />
                </span>
              ),
            },
          ]
        : undefined,
      data: { "data-position-card": "ltv" },
    },
    {
      key: "borrowable",
      kind: "stat",
      label: "Still borrowable",
      changed: room !== roomBefore,
      inputs: DERIVED,
      value: hasCollateral
        ? {
            after: {
              text: <span data-ltv-borrowable="">{room === ZERO ? "$0" : fmtPositionUsd(roomUsd)}</span>,
              info: borrowableProv(coords, {
                ltvBps: account.after.ltvBps,
                collateralUsd: baseToUsd(account.after.totalCollateralBase),
                debtUsd: baseToUsd(account.after.totalDebtBase),
                resultUsd: roomUsd,
              }),
              value: formatUsdValue(roomUsd),
            },
            afterClass: `tabular-nums ${room !== roomBefore ? "text-foreground" : "text-rb-500"}`,
          }
        : { none: "None" },
      data: { "data-position-card": "borrowable" },
    },
  ];
}

/** Interest since the previous event, per side, from the two position reads:
 *  each side cell's sub-line. */
export function interestSubs(
  here: AaveV3PositionState,
  prev: AaveV3PositionState | undefined,
  coords: V3Coords,
): Partial<Record<Side, NonNullable<EventLedgerCellSpec["sub"]>>> {
  const since = interestSincePrevious(here, prev);
  if (!since) return {};
  const list = (parts: InterestPart[], side: Side) =>
    parts.map((p, i) => (
      <span key={p.reserve}>
        {i > 0 && ", "}
        <Prov info={prevEventInterestProv(p.symbol, side, coords)} value={p.interest} symbol={p.symbol}>
          <span title={p.interest}>
            <AmountText value={Number(p.interest)} />
          </span>
        </Prov>{" "}
        {p.symbol}
      </span>
    ));
  const line = (parts: InterestPart[], side: Side) =>
    parts.length > 0
      ? [
          {
            content: (
              <span data-interest-since="" data-interest-side={side}>
                {side === "debt" ? "Interest on the debt" : "Supply interest"} since the previous event: {list(parts, side)}
              </span>
            ),
          },
        ]
      : undefined;
  return { debt: line(since.debt, "debt"), supply: line(since.collateral, "supply") };
}

/** A price the position read took at the block, as the price row's chip. */
export function priceChips(pills: AtBlockPricePill[]): EventPriceChip[] {
  return pills.map((p) => ({
    symbol: p.symbol,
    address: p.address,
    usd: p.priceUsd,
    info: p.priceProv,
    value: p.display ?? undefined,
    display: p.display != null ? `$${p.display}` : undefined,
    title: `${p.symbol} at the ${p.note ?? "oracle at block"}`,
  }));
}

/* ── A balance the event's row states (no read, or a reserve the read
 *    does not list) ───────────────────────────────────────────────────── */

/** "10,967,283.723" → "10.97M"; a placeholder passes through. */
function compactAmount(full: string): string {
  const n = Number(full.replace(/,/g, ""));
  return Number.isFinite(n) && full.trim() !== "" ? formatCompact(n) : full;
}

/** Below 0.01 a before or a change reads in three significant digits, never
 *  in exponent notation; the exact figure stays in the tip and the receipt. */
function smallFigure(shown: string, exact: string, signed = true): string {
  const m = /^([+−-]?)(.*)$/.exec(exact.trim());
  if (!m) return shown;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) >= 0.01) return shown;
  const sign = !signed ? "" : m[1] === "-" ? "−" : m[1];
  const body = formatNumber(Math.abs(n));
  return sign && body.startsWith("<") ? `${sign} ${body}` : `${sign}${body}`;
}

const usdChip = (value: number): string =>
  !Number.isFinite(value) || value < 0.01
    ? "< $0.01"
    : value < 1
      ? `$${value.toFixed(2)}`
      : "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** A balance or an amount the event's row states, as a cell: a ledger cell on
 *  `side` (the side's balance), else a stat cell (a swap's bought amount, the
 *  rows behind a swap). */
export function rowCell(s: ChainTruthStat, key: string, side?: FlowSide): EventCellSpec {
  const t = s.transition;
  const tip = (text: string, exact: string) => <ExactTip always text={text} exact={exact} symbol={s.symbol} />;
  const value = {
    ...(t
      ? {
          before: { text: tip(t.shownAsIs ? t.before : smallFigure(t.before, t.beforeExact, false), t.beforeExact), info: t.beforeProv, value: t.beforeExact },
          delta: { text: tip(t.shownAsIs ? t.change : smallFigure(t.change, t.changeExact), t.changeExact), info: t.changeProv, value: t.changeExact },
        }
      : {}),
    after: { text: tip(s.display ?? compactAmount(s.value), s.value), info: s.prov, value: s.value },
    afterClass: "tabular-nums text-foreground",
    icon: s.symbol || undefined,
    iconAddress: s.address,
  };
  const i = s.interestSincePrevious;
  const sub = i
    ? [
        {
          content: (
            <>
              {i.label ?? "Interest since previous event"}:{" "}
              <Prov info={i.prov} value={i.value} symbol={s.symbol}>
                {tip(i.display ?? smallFigure(formatNumber(Number(i.value)), i.value), i.value)}
              </Prov>{" "}
              {s.symbol}
            </>
          ),
        },
      ]
    : undefined;
  const changed = s.changed ?? true;
  if (!side) return { key, kind: "stat", label: s.label, changed, value, sub };
  const held = Number(s.value);
  return {
    key,
    kind: "ledger",
    side,
    label: s.label,
    changed,
    value,
    sub,
    usd:
      s.usd && usdShown(s.usd.value)
        ? {
            after: (
              <Prov info={s.usd.prov} value={formatUsdValue(s.usd.value)}>
                {usdChip(s.usd.value)}
              </Prov>
            ),
            ...(s.symbol && held > 0
              ? usdAt({
                  price: s.usd.value / held,
                  symbol: s.symbol,
                  before: t ? Number(t.beforeExact) : null,
                  after: held,
                })
              : {}),
          }
        : undefined,
  };
}

/* ── The ledgers ─────────────────────────────────────────────────────── */

/** The family's ledgers (T2.1): each side cell opens into the side's flows as
 *  of the event, once the read has landed and the page holds the flows. */
export function AaveFamilyLedgers({
  state,
  coords,
  eventId,
  eventTs,
  children,
}: {
  state: AaveV3PositionState | undefined;
  coords: V3Coords;
  eventId?: string;
  eventTs?: number;
  children: ReactNode;
}) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const on = !!(state && cum && focus?.model);
  const src = useMemo<EventLedgerSource>(
    () => ({
      has: () => on,
      render: (side) =>
        on && state && cum ? (
          <SideLedger side={side} state={state} coords={coords} cum={cum} eventId={eventId} eventTs={eventTs} />
        ) : null,
    }),
    [on, state, cum, coords, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}

/** The opened cell: the side's ledger as of the event. */
function SideLedger({
  side,
  state,
  coords,
  cum,
  eventId,
  eventTs,
}: {
  side: FlowSide;
  state: AaveV3PositionState;
  coords: V3Coords;
  cum: EventCum;
  eventId?: string;
  eventTs?: number;
}) {
  const focus = useFlowFocus();
  const model = focus?.model;
  if (!model || !focus) return null;
  const facts = sideFacts(state, side);
  if (facts.held == null)
    return (
      <p className="text-sm text-rb-500" data-ledger-missing={side}>
        A supplied reserve has no price at this block, so the ledger is left out.
      </p>
    );
  const at = atWords(eventTs);
  const ev = focus.events.find((e) => e.id === eventId) ?? null;
  const balances = sideBalances(state, side);
  // Where the family books interest as separate lines (Aave V3 on Base and
  // Seamless, lib/aave-v3-base/flows.ts), the balancing line holds only the
  // interest since each reserve's last event, and float dust is no interest.
  const booksInterest = model.buckets.some((b) => b.key === "interestEarned" || b.key === "interestAccrued");
  const bySum = eventId
    ? eventAssetSum(
        model,
        focus.events,
        side,
        cum,
        eventId,
        balances,
        booksInterest ? { interestLabel: "Interest since the last event", relDust: 1e-9 } : {},
      )
    : null;
  const name = SIDE_NAME[side];
  const { afterProv: totalProv, beforeProv: totalBeforeProv } = sideTotals(side, state, coords, facts, at);
  const note = <DayCloseNote cum={cum} eventTs={eventTs} />;
  if (bySum) {
    const priceOf = (sym: string) => bySum.balances.find((x) => x.symbol === sym);
    const shownFor = (sym: string) => {
      const b = priceOf(sym);
      return usdShown(b?.price != null ? b.amount * b.price : null);
    };
    const single = assetTokenSum(bySum);
    if (single) {
      const dollars = eventSideSumByAsset(model, bySum, cum, facts.held);
      const ledger = tokenLedger({
        model,
        side,
        ev,
        sum: single,
        usd: shownFor(single.symbol)
          ? { lines: dollars.lines, dollars: dollars.total.dollars, before: facts.heldBefore }
          : null,
        price: bySum.balances.find((x) => x.symbol === single.symbol)?.price ?? null,
      });
      return (
        <>
          <LedgerTable
            ledger={ledger}
            name={name}
            at={at}
            totalUsdProv={totalProv}
            totalUsdBeforeProv={totalBeforeProv}
            daily={model.daily}
          />
          {note}
        </>
      );
    }
    const { assets, usd } = assetLedgers({
      model,
      side,
      ev,
      sum: bySum,
      held: facts.held,
      heldBefore: facts.heldBefore,
    });
    return (
      <>
        <AssetLedgers
          side={side}
          assets={assets}
          usd={usd}
          at={at}
          totalUsdProv={totalProv}
          totalUsdBeforeProv={totalBeforeProv}
          usdShownFor={(l) => l.usd != null && l.symbol != null && shownFor(l.symbol)}
        />
        {note}
      </>
    );
  }
  // The page does not hold every flow before the event: the ledger in dollars.
  const rows = eventSideSum(model, side, cum, facts.held);
  const ledger = dollarLedger({
    model,
    side,
    ev,
    lines: rows.lines,
    dollars: rows.total.dollars,
    before: facts.heldBefore,
  });
  return (
    <>
      <LedgerTable
        ledger={ledger}
        name={name}
        at={at}
        totalUsdProv={totalProv}
        totalUsdBeforeProv={totalBeforeProv}
        daily={model.daily}
      />
      {note}
    </>
  );
}

/* ── Aave V3's account figures ───────────────────────────────────────── */

/** Aave V3's figures under the side cells: the health factor, the LTV and
 *  what can still be borrowed, and eMode where the account used a category on
 *  either side; with the lines a reader needs to read them (a liquidation's
 *  basis, a read that is missing a part). */
export function aaveV3RiskCells(
  state: AaveV3PositionState,
  coords: V3Coords,
  liquidation: boolean,
): { cells: EventStatCellSpec[]; notes: ReactNode } {
  const { account, emode, sources } = state;
  const atCall = liquidation ? beforeAtBlockPrices(state) : null;
  const inEmode = !!emode && (emode.before !== 0 || emode.after !== 0);
  // A liquidation's before LTV is at the prices the call ran at (block N), the
  // figure the prose states; the note under the grid gives the end of N−1.
  const ltvBefore = ((): Figure | undefined => {
    if (!account || atCall?.ltv == null) return undefined;
    const coll = baseToUsd(account.before.totalCollateralBase);
    const debt = baseToUsd(account.before.totalDebtBase);
    const text = `${(atCall.ltv * 100).toFixed(2)}%`;
    return { text, value: text, prov: ltvAtCallProv(coords, atCall.ltv, coll > 0 ? debt / coll : null) };
  })();
  const hfBefore: Figure | null = account
    ? atCall?.hf != null
      ? {
          text: hfLabelV3(atCall.hf),
          value: hfLabelV3(atCall.hf),
          prov: hfAtCallProv(
            coords,
            atCall.hf,
            account.before.healthFactor == null ? null : wadToNumber(account.before.healthFactor),
          ),
        }
      : hfFigure(account.before, "before", coords)
    : null;
  const hfAfter = account ? hfFigure(account.after, "after", coords) : null;
  const hfMoved = !!hfBefore && !!hfAfter && hfBefore.value !== hfAfter.value;
  const cells: EventStatCellSpec[] = [
    {
      key: "health-factor",
      kind: "stat",
      label: "Health factor",
      changed: hfMoved,
      inputs: DERIVED,
      value:
        account && hfBefore && hfAfter
          ? {
              // Every event states the factor as a pair where both ends have one.
              ...(account.before.healthFactor != null && account.after.healthFactor != null
                ? { before: fig(hfBefore) }
                : {}),
              after: fig(hfAfter),
              afterClass: `tabular-nums ${hfMoved ? "text-foreground" : "text-rb-500"}`,
            }
          : { none: "Not available at this block" },
      data: { "data-position-card": "health-factor" },
    },
    ...ltvCells(state, coords, ltvBefore),
    ...(emode && !inEmode
      ? []
      : [
          {
            key: "emode",
            kind: "stat" as const,
            label: "eMode",
            changed: !!emode && emode.before !== emode.after,
            value: emode
              ? {
                  ...(emode.before !== emode.after ? { before: fig(emodeFigure(state, emode.before, "before", coords)) } : {}),
                  after: fig(emodeFigure(state, emode.after, "after", coords)),
                }
              : { none: "Not available at this block" },
            data: { "data-position-card": "emode" },
          },
        ]),
  ];
  const missing =
    sources.settings == null && sources.market == null
      ? "Collateral on/off, eMode, prices and reserve settings at this block aren’t available, so USD and the account figures are not shown."
      : sources.settings == null
        ? "Collateral on/off and eMode at this block aren’t available, so the account figures are not shown."
        : sources.market == null
          ? "Prices and reserve settings at this block aren’t available, so USD and the account figures are not shown."
          : null;
  const clamped = state.notes.some((n) => n.startsWith("negative_scaled_sum:"));
  const notes =
    (account && liquidation && atCall?.hf != null) || missing || clamped ? (
      <>
        {account && liquidation && atCall?.hf != null && (
          <p data-liq-basis>
            Before: the health factor and loan-to-value at the oracle prices the liquidation ran at (block{" "}
            {state.block.toLocaleString("en-US")}); the other before figures are the account at the end of block{" "}
            {(state.block - 1).toLocaleString("en-US")}
            {account.before.healthFactor != null ? (
              <>
                , where the health factor was {hfLabelV3(wadToNumber(account.before.healthFactor))}
                {hfLabelV3(wadToNumber(account.before.healthFactor)) === hfLabelV3(atCall.hf)
                  ? " as well: the prices did not move between the two blocks"
                  : ""}
              </>
            ) : null}
            .
          </p>
        )}
        {missing && <p>{missing}</p>}
        {clamped && <p>A balance whose recorded changes sum below zero is shown as 0.</p>}
      </>
    ) : null;
  return { cells, notes };
}
