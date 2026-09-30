"use client";

// The open Aave V3 family card's position block: the account as it stood
// immediately before the event's transaction and once it had run (rails-ops
// TO-DO-ui-jobs §19, §213). Four cells: Collateral, Debt, Health factor, LTV,
// and eMode where the account used a category.
//   • Collateral: total collateral in USD (before → after), each collateral
//     reserve beneath it, and the supplied reserves with their switch off under
//     "Supplied, not collateral" — the total leaves them out.
//   • Debt: total debt in USD (before → after), each borrowed reserve beneath.
//   • LTV: debt ÷ collateral (before → after), of the weighted max LTV, with
//     the liquidation threshold, and what the account could still borrow.
// The paragraph on how the weighted limits move is in the card's (i)
// (LtvWeightingNote, drawn by the explainer).
//
// Balances are exact, interest included. USD is each balance at the oracle price
// read at the block, behind the USD toggle. The account figures are Aave's own
// arithmetic over them, as rails-server computed it. Where the collateral
// switches, eMode or the at-block read are not known, a card says so rather than
// guess.
//
// RULE (§52): a reserve row whose priced after-balance is under a cent is dust,
// whatever its collateral flag — a row with no price is held, not dust. Dust
// rows sit behind a "N dust reserve(s) hidden" line per side, local state, not
// persisted, counting hidden rows across both collateral groups (§54). The
// reserve an event touched (the one the grid above gives way for, §47) always
// draws, dust or not, and is never counted in that line.
//
// RULE (§54, §213): a supplied reserve is placed by its AFTER-state flag —
// switched on, directly under the Collateral total; switched off, under the
// "Supplied, not collateral" line; an empty group draws nothing. A row whose
// flag flipped on the event carries a short muted "switched on here" /
// "switched off here" holding the receipt the icon used to carry
// (collateralFlagProv). A row that did not flip has no per-row flag words; its
// flag receipt rides on the row's own after-balance receipt instead (see
// `withFlagNote` below), since `collateralFlagProv` names one reserve and a
// group can list several.

import type { ReactNode } from "react";
import { DustToggle, isDustUsd, useDustOpen } from "@/components/shared/dust-reserves";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatCard, StatSubline, StateTransition, TransitionArrow } from "@/components/shared/state-transition";
import { AmountText } from "@/components/shared/amount-text";
import type { AtBlockPricePill } from "@/components/shared/liquidation-forensics";
import { PositionRow, fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import { formatUsdValue } from "@/lib/utils/format";
import { v3Brand, v3Protocol } from "@/lib/aave-v3/protocol-name";
import {
  accountRatioProv,
  accountTotalProv,
  borrowableProv,
  currentLtvProv,
  collateralFlagProv,
  emodeCategoryProv,
  exactBalanceChangeProv,
  exactBalanceProv,
  healthFactorProv,
  positionUsdProv,
  prevEventInterestProv,
  stateReadPriceProv,
  type V3Coords,
  type V3ExactLeg,
} from "@/lib/aave-v3/event-provenance";
import {
  baseToUsd,
  beforeAtBlockPrices,
  big,
  borrowableBase,
  bpsPct,
  emodeName,
  groupExact,
  hfLabelV3,
  humanOf,
  interestSincePrevious,
  legChange,
  legHeld,
  priceText,
  rawToUsd,
  wadToNumber,
  type AaveV3AccountSide,
  type InterestPart,
  type AaveV3PositionState,
  type AaveV3PositionStateLeg,
  type AaveV3PositionStateReserve,
} from "@/lib/aave-v3/position-state";

type Side = "supply" | "debt";
type When = "before" | "after";

/** A reserve+side the event touched: the block always draws its row (§52). */
export interface TouchedLeg {
  reserve: string;
  side: Side;
}

const ZERO = BigInt(0);

/** How a receipt names a reserve: the index's symbol, else its address. */
export const reserveSymbol = (r: AaveV3PositionStateReserve): string =>
  r.symbol ?? `${r.reserve.slice(0, 6)}…${r.reserve.slice(-4)}`;

/** The inputs one exact balance's receipt names. */
export function exactLeg(
  leg: AaveV3PositionStateLeg,
  when: When,
  decimals: number,
  blockTimestamp: number,
): V3ExactLeg {
  return {
    raw: when === "before" ? leg.before : leg.after,
    scaled: when === "before" ? leg.scaledBefore : leg.scaledAfter,
    index: leg.index,
    rduBlock: leg.rduBlock,
    rduTxHash: leg.rduTxHash,
    rduTimestamp: leg.rduTimestamp,
    rate: leg.rate,
    blockTimestamp,
    decimals,
  };
}

/** A reserve's exact balance in USD with its receipt, where the at-block read
 *  priced the reserve and the balance is not zero (a $0 chip would restate the
 *  0 beside it). `exact` is the receipt's value key, the same wherever the
 *  figure renders. */
export function exactUsd(
  state: AaveV3PositionState,
  r: AaveV3PositionStateReserve,
  side: Side,
  when: When,
  coords: V3Coords,
): { value: number; prov: Provenance; exact: string } | undefined {
  const leg = side === "supply" ? r.supply : r.debt;
  const raw = when === "before" ? leg.before : leg.after;
  if (r.priceBase == null || r.decimals == null || big(raw) <= ZERO) return undefined;
  const value = rawToUsd(raw, r.priceBase, r.decimals);
  return {
    value,
    exact: formatUsdValue(value),
    prov: positionUsdProv(reserveSymbol(r), side, when, coords, {
      amount: groupExact(humanOf(raw, r.decimals)),
      priceUsd: humanOf(r.priceBase, 8),
      readBlock: state.sources.marketReadBlock,
    }),
  };
}

export interface Figure {
  text: string;
  /** The receipt's value key. */
  value: string;
  prov: Provenance;
}

/** Before → after; one figure where the two agree, unless `always` (the
 *  health factor, which every event states as a pair). */
function BeforeAfter({ before, after, always = false }: { before: Figure; after: Figure; always?: boolean }) {
  return (
    <StateTransition>
      {(always || before.value !== after.value) && (
        <>
          <span className="text-sm font-semibold tabular-nums text-rb-500">
            <Prov info={before.prov} value={before.value}>
              {before.text}
            </Prov>
          </span>
          <TransitionArrow size="sm" />
        </>
      )}
      <span className="text-sm font-semibold tabular-nums">
        <Prov info={after.prov} value={after.value}>
          {after.text}
        </Prov>
      </span>
    </StateTransition>
  );
}

function NotAvailable() {
  return <span className="text-sm text-rb-500">Not available at this block</span>;
}

/** A supplied reserve is placed by its after-state flag (rails-ops
 *  TO-DO-ui-jobs §54, §213): switched on, straight under the Collateral total;
 *  switched off, under "Supplied, not collateral". No per-row icon or words
 *  repeat the flag. */
type CollateralGroup = "on" | "off";
const collateralGroup = (on: boolean): CollateralGroup => (on ? "on" : "off");

/** The muted "was on" / "was off" a row carries only where its flag flipped on
 *  the event — the receipt the icon used to carry (§53), now on this text
 *  (§54). `data-collateral-flip` is the AFTER state, matching the group the
 *  row now sits under. */
function CollateralFlipNote({
  sym,
  flag,
  coords,
}: {
  sym: string;
  flag: { before: boolean; after: boolean };
  coords: V3Coords;
}) {
  const was = flag.before ? "on" : "off";
  return (
    <Prov info={collateralFlagProv(sym, "before", flag.before, coords)} value={was}>
      <span className="text-xs text-rb-500" data-collateral-flip={flag.after ? "on" : "off"}>
        switched {flag.after ? "on" : "off"} here
      </span>
    </Prov>
  );
}

/** A row whose flag did not flip carries no separate flag receipt (§54): the
 *  group heading it sits under already states the after flag, and a
 *  per-heading receipt would misname `collateralFlagProv`'s one reserve when a
 *  group lists several. Instead the flag's receipt rides on this same row's
 *  after-balance receipt, so opening it still proves the flag along with the
 *  balance — no new receipt shape, no new row UI. */
function withFlagNote(prov: Provenance, sym: string, on: boolean, coords: V3Coords): Provenance {
  const flag = collateralFlagProv(sym, "after", on, coords);
  return { ...prov, summary: `${prov.summary} ${flag.summary}` };
}

/** The reserve's after-balance in USD at this side, or null where it isn't
 *  priced at this block. A row with no price is held, not dust (§52). */
function reserveUsdAfter(r: AaveV3PositionStateReserve, side: Side): number | null {
  if (r.priceBase == null || r.decimals == null) return null;
  const leg = side === "supply" ? r.supply : r.debt;
  return rawToUsd(leg.after, r.priceBase, r.decimals);
}

/** Under a cent, priced, whatever the collateral flag (§52): the shared rule
 *  the position cards use (components/shared/dust-reserves.tsx). */
const isDustRow = (r: AaveV3PositionStateReserve, side: Side): boolean => isDustUsd(reserveUsdAfter(r, side));

function ReserveLine({
  state,
  r,
  side,
  coords,
  dust,
}: {
  state: AaveV3PositionState;
  r: AaveV3PositionStateReserve;
  side: Side;
  coords: V3Coords;
  dust?: boolean;
}) {
  const decimals = r.decimals ?? 0;
  const sym = reserveSymbol(r);
  const leg = side === "supply" ? r.supply : r.debt;
  const before = humanOf(leg.before, decimals);
  const after = humanOf(leg.after, decimals);
  const moved = legChange(leg, decimals);
  const sign = moved.sign < 0 ? "−" : "+";
  const flag = side === "supply" ? r.collateral : null;
  const flipped = !!flag && flag.before !== flag.after;
  let afterProv = exactBalanceProv(sym, side, "after", coords, exactLeg(leg, "after", decimals, state.blockTimestamp));
  if (flag && !flipped) afterProv = withFlagNote(afterProv, sym, flag.after, coords);
  return (
    <PositionRow
      symbol={sym}
      address={r.reserve}
      ticker={sym}
      amount={after}
      before={before}
      isChanged={moved.sign !== 0}
      afterProv={afterProv}
      beforeProv={exactBalanceProv(
        sym,
        side,
        "before",
        coords,
        exactLeg(leg, "before", decimals, state.blockTimestamp),
      )}
      deltaProv={exactBalanceChangeProv(sym, side, coords, { before: groupExact(before), after: groupExact(after) })}
      deltaText={`${sign}${fmtPositionAmount(moved.magnitude)}`}
      exact={{ after: groupExact(after), before: groupExact(before), delta: `${sign}${groupExact(moved.magnitude)}` }}
      usd={exactUsd(state, r, side, "after", coords)}
      trailing={flipped && flag ? <CollateralFlipNote sym={sym} flag={flag} coords={coords} /> : null}
      dust={dust}
    />
  );
}

/** One collateral group inside the Collateral cell (§54, §213): the "on"
 *  group has no heading of its own (the cell is the collateral), the "off"
 *  group reads "Supplied, not collateral"; an empty group draws nothing. Dust
 *  rows are the caller's concern — this places whichever rows it is given. */
function CollateralGroupBlock({
  group,
  rows,
  state,
  coords,
  showDust,
  touched,
}: {
  group: CollateralGroup;
  rows: AaveV3PositionStateReserve[];
  state: AaveV3PositionState;
  coords: V3Coords;
  showDust: boolean;
  touched: Set<string>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-collateral-group={group}>
      {group === "off" && <div className="text-[11px] font-semibold text-rb-500">Supplied, not collateral</div>}
      {rows.map((r) => {
        const dust = !touched.has(r.reserve) && isDustRow(r, "supply");
        if (dust && !showDust) return null;
        return <ReserveLine key={r.reserve} state={state} r={r} side="supply" coords={coords} dust={dust} />;
      })}
    </div>
  );
}

function ReserveList({
  state,
  side,
  coords,
  touched,
}: {
  state: AaveV3PositionState;
  side: Side;
  coords: V3Coords;
  touched: Set<string>;
}) {
  const { open: showDust, toggle: toggleDust } = useDustOpen();
  const rows = state.reserves.filter((r) => r.decimals != null && legHeld(side === "supply" ? r.supply : r.debt));
  // The total above already reads $0 where the account holds nothing here.
  if (rows.length === 0) return state.account ? null : <span className="text-sm text-rb-500">None</span>;

  // The touched reserve always draws, dust or not, and never joins the count
  // behind the toggle (§52), which counts across both groups (§54).
  const dustCount = rows.filter((r) => !touched.has(r.reserve) && isDustRow(r, side)).length;

  // A reserve is placed by its AFTER-state flag (§54); grouping needs every
  // held reserve's flag known, which tracks whether the block's own settings
  // read landed (sources.settings). Where it did not, the flat list stands
  // alongside the "Collateral on/off isn't available" note.
  const canGroup = side === "supply" && rows.every((r) => r.collateral != null);

  const body = canGroup ? (
    <div className="flex flex-col gap-2">
      <CollateralGroupBlock
        group="on"
        rows={rows.filter((r) => collateralGroup(r.collateral!.after) === "on")}
        state={state}
        coords={coords}
        showDust={showDust}
        touched={touched}
      />
      <CollateralGroupBlock
        group="off"
        rows={rows.filter((r) => collateralGroup(r.collateral!.after) === "off")}
        state={state}
        coords={coords}
        showDust={showDust}
        touched={touched}
      />
    </div>
  ) : (
    rows.map((r) => {
      const dust = !touched.has(r.reserve) && isDustRow(r, side);
      if (dust && !showDust) return null;
      return <ReserveLine key={r.reserve} state={state} r={r} side={side} coords={coords} dust={dust} />;
    })
  );

  return (
    <div className="mt-2 flex flex-col gap-1" data-position-reserves={side}>
      {body}
      <DustToggle count={dustCount} open={showDust} onToggle={toggleDust} />
    </div>
  );
}

/** A cell's headline: the account's total collateral or total debt in USD,
 *  before → after where it moved. */
function TotalHeadline({
  state,
  what,
  coords,
}: {
  state: AaveV3PositionState;
  what: "collateral" | "debt";
  coords: V3Coords;
}) {
  const { account, sources } = state;
  if (!account) return <NotAvailable />;
  const fig = (a: AaveV3AccountSide, when: When): Figure => {
    const base = what === "collateral" ? a.totalCollateralBase : a.totalDebtBase;
    const usd = baseToUsd(base);
    return {
      text: big(base) === ZERO ? "$0" : fmtPositionUsd(usd),
      value: formatUsdValue(usd),
      prov: accountTotalProv(what, when, coords, { base, poolRevision: sources.poolRevision }),
    };
  };
  return (
    <div data-account-total={what}>
      <BeforeAfter before={fig(account.before, "before")} after={fig(account.after, "after")} />
    </div>
  );
}

/** The Collateral cell: the total, each collateral reserve beneath it, and
 *  the supplied reserves whose switch is off under their own line. */
export function CollateralCellBody({
  state,
  coords,
  touched,
}: {
  state: AaveV3PositionState;
  coords: V3Coords;
  touched: Set<string>;
}) {
  return (
    <>
      <TotalHeadline state={state} what="collateral" coords={coords} />
      <ReserveList state={state} side="supply" coords={coords} touched={touched} />
      {state.sources.settings == null && (
        <div className="mt-1 text-xs text-rb-500">Collateral on/off isn&rsquo;t available at this block.</div>
      )}
    </>
  );
}

/** The Debt cell: the total, each borrowed reserve beneath it. */
export function DebtCellBody({
  state,
  coords,
  touched,
}: {
  state: AaveV3PositionState;
  coords: V3Coords;
  touched: Set<string>;
}) {
  return (
    <>
      <TotalHeadline state={state} what="debt" coords={coords} />
      <ReserveList state={state} side="debt" coords={coords} touched={touched} />
    </>
  );
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

/** The LTV cell: debt ÷ collateral before → after, of the weighted max LTV,
 *  with the liquidation threshold ("37.52% of a 76.71% maximum; liquidation
 *  at 80.47%"), then what the account could still borrow once the transaction
 *  had run. `before` replaces the before figure (a liquidation's, at the
 *  prices the call ran at). */
export function LtvCellBody({
  state,
  coords,
  before: beforeOverride,
}: {
  state: AaveV3PositionState;
  coords: V3Coords;
  before?: Figure;
}) {
  const { account, emode } = state;
  if (!account) return <NotAvailable />;
  const inEmode = !!emode && (emode.before !== 0 || emode.after !== 0);
  const current = (a: AaveV3AccountSide, when: When): Figure => {
    const coll = baseToUsd(a.totalCollateralBase);
    const debt = baseToUsd(a.totalDebtBase);
    const text = coll > 0 ? `${((debt / coll) * 100).toFixed(2)}%` : "—";
    return { text, value: text, prov: currentLtvProv(when, coords, { debtUsd: debt, collateralUsd: coll }) };
  };
  const ratio = (which: "ltv" | "lt", a: AaveV3AccountSide, when: When): Figure => {
    const bps = which === "ltv" ? a.ltvBps : a.liquidationThresholdBps;
    return {
      text: bpsPct(bps),
      value: bpsPct(bps),
      prov: accountRatioProv(which, when, coords, { bps, emode: inEmode }),
    };
  };
  const hasCollateral = big(account.before.totalCollateralBase) > ZERO || big(account.after.totalCollateralBase) > ZERO;
  const room = borrowableBase(account.after);
  const roomUsd = baseToUsd(room.toString());
  return (
    <>
      <BeforeAfter
        before={beforeOverride ?? current(account.before, "before")}
        after={current(account.after, "after")}
      />
      {hasCollateral && (
        <>
          <StatSubline className="mt-1">
            <span data-ltv-limits="">
              of{" "}
              {article(
                bpsPct(account.before.ltvBps !== account.after.ltvBps ? account.before.ltvBps : account.after.ltvBps),
              )}{" "}
              <InlinePair
                before={ratio("ltv", account.before, "before")}
                after={ratio("ltv", account.after, "after")}
              />{" "}
              maximum; liquidation at{" "}
              <InlinePair before={ratio("lt", account.before, "before")} after={ratio("lt", account.after, "after")} />
            </span>
          </StatSubline>
          <StatSubline>
            <span data-ltv-borrowable="">
              Still borrowable:{" "}
              <Prov
                info={borrowableProv(coords, {
                  ltvBps: account.after.ltvBps,
                  collateralUsd: baseToUsd(account.after.totalCollateralBase),
                  debtUsd: baseToUsd(account.after.totalDebtBase),
                  resultUsd: roomUsd,
                })}
                value={formatUsdValue(roomUsd)}
              >
                {room === ZERO ? "$0" : fmtPositionUsd(roomUsd)}
              </Prov>
            </span>
          </StatSubline>
        </>
      )}
    </>
  );
}

/** How the LTV and its limits are figured, for the card's (i): the
 *  explainer draws it where the account read landed. */
export function LtvWeightingNote({ brand }: { brand: string }) {
  return (
    <>
      <span data-ltv-weighting="">
        LTV is the debt divided by the collateral. The maximum and the liquidation threshold are each collateral
        asset&rsquo;s setting averaged by what it is worth, so they move when the mix of collateral changes; {brand}{" "}
        governance changes the settings over time.
      </span>
    </>
  );
}

/** The interest line under the grid, from the two position reads: the debt's
 *  interest since the previous event on each borrowed reserve, and beside it
 *  the supply interest on the collateral over the same stretch. */
export function StateInterestLine({
  here,
  prev,
  coords,
}: {
  here: AaveV3PositionState;
  prev: AaveV3PositionState;
  coords: V3Coords;
}) {
  const since = interestSincePrevious(here, prev);
  if (!since || (since.debt.length === 0 && since.collateral.length === 0)) return null;
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
  return (
    <StatSubline>
      <span data-interest-since="">
        {since.debt.length > 0 && (
          <span data-interest-side="debt">
            Interest on the debt since the previous event: {list(since.debt, "debt")}
          </span>
        )}
        {since.debt.length > 0 && since.collateral.length > 0 && " · "}
        {since.collateral.length > 0 && (
          <span data-interest-side="supply">
            Supply interest on the collateral{since.debt.length > 0 ? "" : " since the previous event"}:{" "}
            {list(since.collateral, "supply")}
          </span>
        )}
      </span>
    </StatSubline>
  );
}

/** The price chip's entries once the position read has landed: every reserve
 *  whose balance the card prices (a dust row hidden behind its count line
 *  aside, unless the event touched it), at the oracle price the read took,
 *  printed to the decimals that reproduce the card's USD figures. */
export function statePricePills(
  state: AaveV3PositionState,
  coords: V3Coords,
  touched: TouchedLeg[],
): AtBlockPricePill[] {
  const isTouched = (r: AaveV3PositionStateReserve) => touched.some((t) => t.reserve === r.reserve);
  return state.reserves.flatMap((r) => {
    if (r.priceBase == null || r.decimals == null) return [];
    const sides = (["supply", "debt"] as const).filter((s) => legHeld(s === "supply" ? r.supply : r.debt));
    if (sides.length === 0) return [];
    if (!isTouched(r) && sides.every((s) => isDustRow(r, s))) return [];
    const decimals = r.decimals;
    const amounts = sides.flatMap((s) => {
      const leg = s === "supply" ? r.supply : r.debt;
      return [
        { raw: leg.before, decimals },
        { raw: leg.after, decimals },
      ];
    });
    const sym = reserveSymbol(r);
    const exact = humanOf(r.priceBase, 8);
    return [
      {
        symbol: sym,
        address: r.reserve,
        priceUsd: Number(exact),
        display: priceText(r.priceBase, amounts),
        priceProv: stateReadPriceProv(sym, coords, { priceUsd: exact, readBlock: state.sources.marketReadBlock }),
      },
    ];
  });
}

/** The at-call health factor's receipt: the balances before the liquidation
 *  valued at the oracle prices of its block. */
function hfAtCallProv(coords: V3Coords, hf: number, endOfPrevious: number | null): Provenance {
  const brand = v3Brand(v3Protocol(coords.pool));
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Health factor at the moment of the liquidation — the account's balances before the call, valued at the ${brand} oracle's prices in the liquidation's block, each collateral counted up to its liquidation threshold, divided by the debt. The liquidation ran at these prices.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, the factor was ${hfLabelV3(endOfPrevious)}.` : ""}`,
    contract: coords.pool ? { name: coords.pool.name, address: coords.pool.address } : undefined,
    via: `Σ collateral before × price at block ${coords.blockNumber ?? "N"} × threshold ÷ Σ debt before × price = ${hf.toFixed(6)}`,
    formula: "collateral × threshold ÷ debt",
  };
}

/** The at-call loan-to-value's receipt. */
function ltvAtCallProv(coords: V3Coords, ltv: number, endOfPrevious: number | null): Provenance {
  const brand = v3Brand(v3Protocol(coords.pool));
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Loan-to-value at the moment of the liquidation — the account's debt before the call divided by its collateral before the call, both valued at the ${brand} oracle's prices in the liquidation's block.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, it was ${(endOfPrevious * 100).toFixed(2)}%.` : ""}`,
    contract: coords.pool ? { name: coords.pool.name, address: coords.pool.address } : undefined,
    via: `Σ debt before × price at block ${coords.blockNumber ?? "N"} ÷ Σ collateral before × price = ${(ltv * 100).toFixed(2)}%`,
    formula: "debt ÷ collateral",
  };
}

export function AaveV3PositionStateBlock({
  state,
  coords,
  touched = [],
  liquidation = false,
}: {
  state: AaveV3PositionState;
  coords: V3Coords;
  /** Reserves the event touched: the grid above gives way to their row for
   *  the same balance (§47), so the dust rule here never hides it (§52). */
  touched?: TouchedLeg[];
  /** The event is a liquidation: a line under the grid states the before
   *  figures at the prices the call ran at (block N), beside the end of N−1. */
  liquidation?: boolean;
}) {
  const { account, emode, sources } = state;
  const touchedOn = (side: Side): Set<string> => new Set(touched.filter((t) => t.side === side).map((t) => t.reserve));
  const atCall = liquidation ? beforeAtBlockPrices(state) : null;

  const inEmode = !!emode && (emode.before !== 0 || emode.after !== 0);

  // A liquidation's before LTV is at the prices the call ran at (block N), the
  // figure the prose states; the note under the grid gives the end of N−1.
  const ltvBefore = (): Figure | undefined => {
    if (!account || atCall?.ltv == null) return undefined;
    const coll = baseToUsd(account.before.totalCollateralBase);
    const debt = baseToUsd(account.before.totalDebtBase);
    const text = `${(atCall.ltv * 100).toFixed(2)}%`;
    return { text, value: text, prov: ltvAtCallProv(coords, atCall.ltv, coll > 0 ? debt / coll : null) };
  };

  const cards: { key: string; label: string; body: ReactNode }[] = [
    {
      key: "collateral",
      label: "Collateral",
      body: <CollateralCellBody state={state} coords={coords} touched={touchedOn("supply")} />,
    },
    {
      key: "debt",
      label: "Debt",
      body: <DebtCellBody state={state} coords={coords} touched={touchedOn("debt")} />,
    },
    {
      key: "health-factor",
      label: "Health factor",
      body: account ? (
        <BeforeAfter
          always={account.before.healthFactor != null && account.after.healthFactor != null}
          before={
            // A liquidation's before is the health factor at the prices the
            // call ran at (block N); the note under the grid gives the end of
            // N−1.
            atCall?.hf != null
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
          }
          after={hfFigure(account.after, "after", coords)}
        />
      ) : (
        <NotAvailable />
      ),
    },
    { key: "ltv", label: "LTV", body: <LtvCellBody state={state} coords={coords} before={ltvBefore()} /> },
    // eMode draws only where the account used a category on either side.
    ...(emode && !inEmode
      ? []
      : [
          {
            key: "emode",
            label: "eMode",
            body: emode ? (
              <BeforeAfter
                before={emodeFigure(state, emode.before, "before", coords)}
                after={emodeFigure(state, emode.after, "after", coords)}
              />
            ) : (
              <NotAvailable />
            ),
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

  return (
    <div className="px-5 py-2" data-position-state="ready" data-position-complete={state.complete ? "true" : "false"}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.key} className="h-full min-w-0" data-position-card={c.key}>
            <StatCard label={c.label}>{c.body}</StatCard>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-rb-500">
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
      </div>
    </div>
  );
}

function hfFigure(a: AaveV3AccountSide, when: When, coords: V3Coords): Figure {
  return {
    text: hfLabelV3(a.healthFactor == null ? null : wadToNumber(a.healthFactor)),
    value: a.healthFactor == null ? "∞" : groupExact(humanOf(a.healthFactor, 18)),
    prov: healthFactorProv(when, coords, {
      wad: a.healthFactor,
      collateralBase: a.totalCollateralBase,
      debtBase: a.totalDebtBase,
      thresholdBps: a.liquidationThresholdBps,
    }),
  };
}

function emodeFigure(state: AaveV3PositionState, id: number, when: When, coords: V3Coords): Figure {
  const name = emodeName(state, id);
  return {
    text: name,
    value: String(id),
    prov: emodeCategoryProv(
      when,
      { id, name, generation: state.emode?.categories[String(id)]?.generation ?? null },
      coords,
    ),
  };
}
