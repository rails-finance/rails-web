"use client";

// The Aave V3 family's account around an event's transaction, as it stood
// immediately before the transaction and once it had run (rails-ops
// TO-DO-ui-jobs §19, §213, §141): the figures and receipts the event card's
// cells state (aave-family-cells.tsx). How the weighted limits move is the
// position and borrow modals' (content/aave-v3/event-prose.yaml).
//
// Balances are exact, interest included. USD is each balance at the oracle price
// read at the block, behind the USD toggle. The account figures are Aave's own
// arithmetic over them, as rails-server computed it. Where the collateral
// switches, eMode or the at-block read are not known, a card says so rather than
// guess.
//
// RULE (§52): a reserve whose priced after-balance is under a cent is dust,
// whatever its collateral flag; a reserve with no price is held, not dust. A
// closed cell draws no icon for a dust reserve the event did not touch.
//
// RULE (§54): a supply whose collateral flag flipped on the event carries a
// short muted "enabled as collateral here" / "disabled as collateral here"
// holding the flag's receipt (collateralFlagProv). One that did not flip has
// no flag words; its flag receipt rides on its after-balance receipt instead
// (see `withFlagNote` below).

import { isDustUsd } from "@/components/shared/dust-reserves";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { AtBlockPricePill } from "@/components/shared/liquidation-forensics";
import { formatUsdValue } from "@/lib/utils/format";
import { v3Brand, v3Protocol } from "@/lib/aave-v3/protocol-name";
import {
  collateralFlagProv,
  emodeCategoryProv,
  healthFactorProv,
  positionUsdProv,
  stateReadPriceProv,
  type V3Coords,
  type V3ExactLeg,
} from "@/lib/aave-v3/event-provenance";
import {
  big,
  emodeName,
  groupExact,
  hfLabelV3,
  humanOf,
  legHeld,
  priceText,
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

export interface Figure {
  text: string;
  /** The receipt's value key. */
  value: string;
  prov: Provenance;
}

/** The muted "was on" / "was off" a row carries only where its flag flipped on
 *  the event — the receipt the icon used to carry (§53), now on this text
 *  (§54). `data-collateral-flip` is the AFTER state, matching the group the
 *  row now sits under. */
export function CollateralFlipNote({
  sym,
  flag,
  coords,
  named = false,
}: {
  sym: string;
  flag: { before: boolean; after: boolean };
  coords: V3Coords;
  /** Name the asset (a cell that states several). */
  named?: boolean;
}) {
  const was = flag.before ? "on" : "off";
  return (
    <Prov info={collateralFlagProv(sym, "before", flag.before, coords)} value={was}>
      <span className="text-xs text-rb-500" data-collateral-flip={flag.after ? "on" : "off"}>
        {named ? `${sym} ` : ""}
        {flag.after ? "enabled" : "disabled"} as collateral here
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
export function withFlagNote(prov: Provenance, sym: string, on: boolean, coords: V3Coords): Provenance {
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
export const isDustRow = (r: AaveV3PositionStateReserve, side: Side): boolean => isDustUsd(reserveUsdAfter(r, side));

/** The price chip's entries once the position read has landed: every reserve
 *  whose balance the card prices (a dust row hidden behind its count line
 *  aside, unless the event touched it), at the oracle price the read took,
 *  printed to the decimals that reproduce the card's USD figures. The
 *  reserves the event touched lead. */
export function statePricePills(
  state: AaveV3PositionState,
  coords: V3Coords,
  touched: TouchedLeg[],
): AtBlockPricePill[] {
  const isTouched = (r: AaveV3PositionStateReserve) => touched.some((t) => t.reserve === r.reserve);
  const ordered = [...state.reserves.filter(isTouched), ...state.reserves.filter((r) => !isTouched(r))];
  return ordered.flatMap((r) => {
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
export function hfAtCallProv(coords: V3Coords, hf: number, endOfPrevious: number | null): Provenance {
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
export function ltvAtCallProv(coords: V3Coords, ltv: number, endOfPrevious: number | null): Provenance {
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

export function hfFigure(a: AaveV3AccountSide, when: When, coords: V3Coords): Figure {
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

export function emodeFigure(state: AaveV3PositionState, id: number, when: When, coords: V3Coords): Figure {
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
