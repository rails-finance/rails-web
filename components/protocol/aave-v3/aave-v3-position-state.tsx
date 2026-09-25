"use client";

// The open Aave V3 Ethereum card's position block: the account as it stood
// immediately before the event's transaction and once it had run (rails-ops
// TO-DO-ui-jobs §19). Laid out after Aave V4's event detail, one StatCard per
// section: every supplied and borrowed reserve (before → after, USD, collateral
// on/off), total collateral, total debt, health factor, LTV, liquidation
// threshold and eMode.
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
// RULE (§54): the Supplied panel lists its reserves under two sub-headings,
// "Collateral on" then "Collateral off", by each reserve's AFTER-state flag; an
// empty group draws no heading. A row whose flag flipped on the event carries a
// short muted "was on" / "was off" holding the receipt the icon used to carry
// (collateralFlagProv). A row that did not flip has no per-row flag icon or
// words; its flag receipt rides on the row's own after-balance receipt instead
// (see `withFlagNote` below) rather than a new per-heading receipt, since
// `collateralFlagProv` names one reserve and a heading can list several.

import { useState, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatCard, StateTransition, TransitionArrow } from "@/components/shared/state-transition";
import { PositionRow, fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import { hfLabel } from "@/lib/aave-v4/format";
import { formatUsdValue } from "@/lib/utils/format";
import {
  accountRatioProv,
  accountTotalProv,
  collateralFlagProv,
  emodeCategoryProv,
  exactBalanceChangeProv,
  exactBalanceProv,
  healthFactorProv,
  positionUsdProv,
  type V3Coords,
  type V3ExactLeg,
} from "@/lib/aave-v3/event-provenance";
import {
  baseToUsd,
  big,
  bpsPct,
  emodeName,
  groupExact,
  humanOf,
  legChange,
  legHeld,
  rawToUsd,
  wadToNumber,
  type AaveV3AccountSide,
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

interface Figure {
  text: string;
  /** The receipt's value key. */
  value: string;
  prov: Provenance;
}

/** before → after, or the after alone where nothing changed. */
function BeforeAfter({ before, after }: { before: Figure; after: Figure }) {
  return (
    <StateTransition>
      {before.value !== after.value && (
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

/** A supplied reserve is placed under its after-state group heading (rails-ops
 *  TO-DO-ui-jobs §54), so the group itself states the after flag; no per-row
 *  icon or words repeat it. */
type CollateralGroup = "on" | "off";
const collateralGroup = (on: boolean): CollateralGroup => (on ? "on" : "off");
const COLLATERAL_GROUP_LABEL: Record<CollateralGroup, string> = { on: "Collateral on", off: "Collateral off" };

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
        was {was}
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

/** Under a cent, priced, whatever the collateral flag (§52). */
const isDustRow = (r: AaveV3PositionStateReserve, side: Side): boolean => {
  const usd = reserveUsdAfter(r, side);
  return usd != null && usd < 0.01;
};

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

/** One "Collateral on" / "Collateral off" group inside the Supplied panel
 *  (§54): an empty group draws no heading. Dust rows are the caller's
 *  concern — this just places whichever rows it is given. */
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
      <div className="text-[11px] font-semibold text-rb-500">{COLLATERAL_GROUP_LABEL[group]}</div>
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
  const [showDust, setShowDust] = useState(false);
  const rows = state.reserves.filter((r) => r.decimals != null && legHeld(side === "supply" ? r.supply : r.debt));
  if (rows.length === 0) return <span className="text-sm text-rb-500">None</span>;

  // The touched reserve always draws, dust or not, and never joins the count
  // behind the toggle (§52), which counts across both groups (§54).
  const dustCount = rows.filter((r) => !touched.has(r.reserve) && isDustRow(r, side)).length;

  // A reserve is placed by its AFTER-state flag (§54); grouping needs every
  // held reserve's flag known, which tracks whether the block's own settings
  // read landed (sources.settings). Where it did not, the flat list stands, as
  // it always has, alongside the "Collateral on/off isn't available" note.
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
    <div className="flex flex-col gap-1" data-position-reserves={side}>
      {body}
      {dustCount > 0 && (
        <button
          type="button"
          className="self-start text-left text-xs text-rb-500 underline decoration-dotted underline-offset-2 hover:text-rb-700"
          data-dust-hidden={dustCount}
          onClick={() => setShowDust((v) => !v)}
        >
          {showDust ? "Hide dust" : `${dustCount} dust reserve${dustCount === 1 ? "" : "s"} hidden`}
        </button>
      )}
    </div>
  );
}

export function AaveV3PositionStateBlock({
  state,
  coords,
  touched = [],
}: {
  state: AaveV3PositionState;
  coords: V3Coords;
  /** Reserves the event touched: the grid above gives way to their row for
   *  the same balance (§47), so the dust rule here never hides it (§52). */
  touched?: TouchedLeg[];
}) {
  const { account, emode, sources } = state;
  const touchedOn = (side: Side): Set<string> => new Set(touched.filter((t) => t.side === side).map((t) => t.reserve));

  const accountCard = (figure: (side: AaveV3AccountSide, when: When) => Figure) =>
    account ? (
      <BeforeAfter before={figure(account.before, "before")} after={figure(account.after, "after")} />
    ) : (
      <NotAvailable />
    );

  const total = (what: "collateral" | "debt") =>
    accountCard((a, when) => {
      const base = what === "collateral" ? a.totalCollateralBase : a.totalDebtBase;
      const usd = baseToUsd(base);
      return {
        text: big(base) === ZERO ? "$0" : fmtPositionUsd(usd),
        value: formatUsdValue(usd),
        prov: accountTotalProv(what, when, coords, { base, poolRevision: sources.poolRevision }),
      };
    });

  const inEmode = !!emode && (emode.before !== 0 || emode.after !== 0);
  const ratio = (which: "ltv" | "lt") =>
    accountCard((a, when) => {
      const bps = which === "ltv" ? a.ltvBps : a.liquidationThresholdBps;
      return {
        text: bpsPct(bps),
        value: bpsPct(bps),
        prov: accountRatioProv(which, when, coords, { bps, emode: inEmode }),
      };
    });

  const cards: { key: string; label: string; body: ReactNode }[] = [
    {
      key: "supplied",
      label: "Supplied",
      body: (
        <>
          <ReserveList state={state} side="supply" coords={coords} touched={touchedOn("supply")} />
          {sources.settings == null && (
            <div className="mt-1 text-xs text-rb-500">Collateral on/off isn&rsquo;t available at this block.</div>
          )}
        </>
      ),
    },
    {
      key: "borrowed",
      label: "Borrowed",
      body: <ReserveList state={state} side="debt" coords={coords} touched={touchedOn("debt")} />,
    },
    { key: "total-collateral", label: "Total collateral", body: total("collateral") },
    { key: "total-debt", label: "Total debt", body: total("debt") },
    {
      key: "health-factor",
      label: "Health factor",
      body: accountCard((a, when) => ({
        text: hfLabel(a.healthFactor == null ? null : wadToNumber(a.healthFactor)),
        value: a.healthFactor == null ? "∞" : groupExact(humanOf(a.healthFactor, 18)),
        prov: healthFactorProv(when, coords, {
          wad: a.healthFactor,
          collateralBase: a.totalCollateralBase,
          debtBase: a.totalDebtBase,
          thresholdBps: a.liquidationThresholdBps,
        }),
      })),
    },
    { key: "ltv", label: "LTV", body: ratio("ltv") },
    { key: "liquidation-threshold", label: "Liquidation threshold", body: ratio("lt") },
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
          <div key={c.key} className="h-full" data-position-card={c.key}>
            <StatCard label={c.label}>{c.body}</StatCard>
          </div>
        ))}
      </div>
      {(missing || clamped) && (
        <div className="mt-2 space-y-0.5 text-xs text-rb-500">
          {missing && <p>{missing}</p>}
          {clamped && <p>A balance whose recorded changes sum below zero is shown as 0.</p>}
        </div>
      )}
    </div>
  );
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
