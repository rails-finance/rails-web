// The Alchemist's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330), from
// the `getCDP` reading at the event's block and the reading at the previous
// event on the timeline (lib/alchemix/readings-before): the figures the cells
// state (alchemix-state-at-block.tsx), laid out as the shared sheet
// (components/shared/event-sheet.tsx).
//
// Collateral is the vault shares, valued in the asset underneath at the share
// price read with each reading; on a dollar line the underlying's price now,
// the one dollar price the page holds, puts it in dollars. Debt is the
// synthetic, at its $1 face on a dollar line. The carry layer: each side's
// figure at the previous event, the vault's yield on the shares since then,
// and the figure before this event. Debt moves only at the position's
// events and the line's redemptions, each an event on this timeline, so the
// self-repayment is a redemption card's debt row and the debt carries no
// interest row. Risk: the LTV and how far the collateral's worth can fall
// before the liquidation ratio. Limits: what can still be minted; the max LTV
// and the liquidation ratio, read at the page's latest block, as parameters.
//
// A block with no stated reading has no sheet (the cells draw the reading in
// force, or say why there is none). With no reading before, only the log's
// amounts on deposit, withdraw, mint and burn make the event's rows.

import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { formatUnitsExact } from "@/lib/utils/format";
import type { AlchemixStateAtBlockFromReading } from "@/lib/shared/types/event-shape";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import {
  emittedAmountProv,
  lineRatioProv,
  readingChangeProv,
  readingCollateralisationProv,
  stateAtBlockFromReadingProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";
import {
  readingCollateralisationRaw,
  type AlchemixLineRatios,
  type AlchemixReading,
  type AlchemixUnderlyingUnit,
} from "@/lib/alchemix/readings-before";
import { SELF_LIQUIDATION_LABEL } from "./alchemix-event-header";

const WORDS = {
  ltv: "LTV",
  fall: "Collateral can fall",
  fall_caption: "Before liquidation, if the debt’s value holds.",
  borrowable: "Still borrowable",
  max_ltv: "Max LTV",
  liq_ratio: "Liquidation ratio",
  set_aside: "Set aside for repayment",
  block_events: "This block’s events",
  no_debt: "No debt",
  closed: "Closed",
  liquidatable: "At or below the liquidation ratio",
  no_price: "No share price at this block",
  unread: "Not read on this page",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  coll_event:
    "The vault shares this event added or took: the Alchemist's reading of the position at this block less its reading at the previous event, valued at the share price read at this block.",
  coll_redemption:
    "The vault shares the line's redemption took from this position to pay the debt it cleared, the line's fee included: the reading at the previous event less the reading at this block.",
  coll_log: "The vault shares the log states this transaction deposited or withdrew.",
  debt_event: (sym: string, face: boolean) =>
    `The ${sym} this event added or cleared: the Alchemist's reading of the position at this block less its reading at the previous event${face ? `, at the ${sym}'s $1 face` : ""}.`,
  debt_redemption:
    "The debt the line's redemption cleared from this position, the Alchemist's self-repayment, paid with the position's vault shares: the reading at the previous event less the reading at this block.",
  debt_log: (sym: string) => `The ${sym} the log states this transaction minted or burned.`,
  block: (n: number) =>
    `This block holds ${n} of this position's events and one reading covers them all, so the figure is their change together.`,
  last_coll:
    "The vault shares held once the previous event on this timeline had run, valued at the share price read at that block.",
  yield: (under: string) =>
    `What the vault earned on those shares since the previous event, in ${under}: the shares times the rise in the share price between the two readings.`,
  before_coll:
    "The vault shares held just before this event, from the reading at the previous event, valued at the share price read at this block.",
  last_debt: "The debt once the previous event on this timeline had run, read from the Alchemist at that block.",
  before_debt:
    "The debt just before this event: debt moves only at the position's events and the line's redemptions, each an event on this timeline, so it is the reading at the previous event.",
  set_aside:
    "The part of the debt earmarked for the line's redemptions, read from the Alchemist at this block; a redemption pays it down.",
  coll_total: (under: string, usd: boolean) =>
    `The vault shares held after this event, valued in ${under} at the share price read at this block${usd ? `, then at ${under}'s price now` : ""}.`,
  debt_total: (sym: string, face: boolean) =>
    `The debt after this event, read from the Alchemist at this block${face ? `, at the ${sym}'s $1 face` : ""}.`,
  ltv: (under: string) =>
    `The debt as a share of the collateral's worth after this event, both counted in ${under} at the share price read at this block.`,
  fall: "How far the collateral's worth can fall, the debt held, before the position reaches the liquidation ratio: one less the liquidation ratio over the collateralisation.",
  borrowable:
    "What the position could still mint after this event before it reaches its max LTV: the collateral's worth over the line's minimum collateralisation, less the debt.",
  max_ltv:
    "The most the position may borrow against its collateral's worth: one over the line's minimum collateralisation, read from the Alchemist.",
  liq_ratio:
    "The collateralisation, the collateral's worth over the debt, at or below which anyone may liquidate the position, read from the Alchemist.",
};

const ONE_WEI = BigInt(1);
const ZERO = BigInt(0);
const DECIMALS = 18;

const units = (raw: string | bigint) => Number(raw) / 10 ** DECIMALS;
const abs = (v: bigint) => (v < ZERO ? -v : v);
const signedAmount = (v: bigint) => `${v < ZERO ? "−" : ""}${fmtPositionAmount(units(abs(v)))}`;
const signedExact = (v: bigint) => `${v < ZERO ? "−" : "+"}${formatUnitsExact(abs(v).toString(), DECIMALS)}`;
const pct2 = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pts = (a: number) => `${a.toFixed(2)} pts`;
const fallText = (n: number) => `${n < 10 ? n.toFixed(1) : n.toFixed(0)}%`;

/** What a figure became since the previous event: after less after then. */
const sinceProv = (what: string): Provenance => ({
  kind: "derived",
  summary: `${what} since the previous event — the figure at this event's reading, less the figure at the previous event's reading.`,
  formula: "after − after the previous event",
});

/** A synthetic amount at its $1 face. */
const faceProv = (what: string, sym: string, amount: string): Provenance => ({
  kind: "chain-derived",
  summary: `${what}, in US dollars — the ${sym} at its $1 face.`,
  formula: `${sym} × $1`,
  inputs: [{ label: "amount", value: `${amount} ${sym}`, kind: "chain" }],
});

/** Shares valued in the underlying at a reading's share price, then at the
 *  underlying's price now. */
const nowUsdProv = (
  what: string,
  shares: string,
  mytSymbol: string,
  sharePrice: number,
  atBlock: number,
  unit: AlchemixUnderlyingUnit,
): Provenance => ({
  kind: "offchain",
  pclass: "offchain",
  summary: `${what}, in US dollars — the ${mytSymbol} valued in ${unit.symbol} at the share price read at block ${atBlock}, then at ${unit.symbol}'s price now, the one dollar price the page holds.`,
  formula: "shares × share price × price now",
  via: unit.usd ? `${unit.usd.priceSource} · ${unit.usd.pricedAt}` : undefined,
  verify: { kind: "none", text: "An off-chain price, with no on-chain anchor" },
  inputs: [
    { label: "shares", value: `${shares} ${mytSymbol}`, kind: "chain" },
    {
      label: "share price",
      value: `${sharePrice} ${unit.symbol}`,
      kind: "chain",
      note: `convertToAssets(1e18) at block ${atBlock}`,
    },
    ...(unit.usd
      ? [
          {
            label: "price per unit",
            value: String(unit.usd.pricePerUnit),
            kind: "offchain" as const,
            note: unit.usd.priceSource,
          },
          { label: "priced at", value: unit.usd.pricedAt, kind: "offchain" as const, note: "the price now" },
        ]
      : []),
  ],
});

/** The vault's yield on the shares held between two readings. */
const yieldProv = (
  shares: string,
  mytSymbol: string,
  from: { block: number; price: number },
  at: { block: number; price: number },
  under: string,
  coords: AlchemixCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Yield since the previous event — the ${mytSymbol} held at the previous event times the rise in the share price between block ${from.block} and block ${at.block}, in ${under}.`,
  contract: { name: "Alchemist V3", address: coords.emitter },
  via: `getCDP(${coords.tokenId}) and convertToAssets(1e18) at blocks ${from.block} and ${at.block}`,
  formula: "shares × (share price now − share price then)",
  verify: { kind: "recompute", text: "Recompute it from the shares and the two share prices" },
  source: { block: at.block },
  inputs: [
    { label: "shares", value: `${shares} ${mytSymbol}`, kind: "chain", note: `read at block ${from.block}` },
    { label: "share price then", value: `${from.price} ${under}`, kind: "chain", note: `block ${from.block}` },
    { label: "share price now", value: `${at.price} ${under}`, kind: "chain", note: `block ${at.block}` },
  ],
});

/** A figure from this reading and the line's ratio read at the page's block. */
const ratioDerivedProv = (
  what: string,
  formula: string,
  atBlock: number,
  ratioRaw: string,
  ratios: AlchemixLineRatios,
  getter: "minimumCollateralization" | "collateralizationLowerBound",
  coords: AlchemixCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${what} — this position's collateralisation at block ${atBlock} against the line's ${getter === "minimumCollateralization" ? "minimum collateralisation" : "liquidation ratio"} read at block ${ratios.asOfBlock}.`,
  contract: { name: "Alchemist V3", address: coords.emitter },
  via: `getCDP(${coords.tokenId}) and the share price at block ${atBlock}; ${getter}() at block ${ratios.asOfBlock}`,
  formula,
  verify: { kind: "recompute", text: "Recompute it from the collateralisation and the line's ratio" },
  source: { block: atBlock },
  inputs: [
    { label: "collateralisation", value: ratioRaw, kind: "chain-derived", note: "1e18 is 100%" },
    {
      label: getter,
      value: getter === "minimumCollateralization" ? ratios.minimumRaw : ratios.lowerBoundRaw,
      kind: "chain",
      note: `read at block ${ratios.asOfBlock}; 1e18 is 100%`,
    },
  ],
});

const COLL_TYPES = new Set([
  "deposit",
  "withdraw",
  "repay",
  "force_repay",
  "self_liquidated",
  "liquidated",
  "redemption",
  "batch_liquidated",
  "repayment_fee",
  "fee_shortfall",
]);
const DEBT_TYPES = new Set([
  "mint",
  "burn",
  "repay",
  "force_repay",
  "self_liquidated",
  "liquidated",
  "redemption",
  "batch_liquidated",
]);
/** The kinds whose log alone states the event's rows, with no reading before. */
const LOG_TYPES = new Set(["deposit", "withdraw", "mint", "burn", "transfer"]);

const legWord = (leg: AlchemistEvent) =>
  leg.context.data.eventType === "self_liquidated" ? SELF_LIQUIDATION_LABEL : leg.actionLabel;

/** The event's word for one side's row: every leg that moves that side. */
function sideWord(legs: AlchemistEvent[], types: Set<string>): string {
  const words = [...new Set(legs.filter((l) => types.has(l.context.data.eventType)).map(legWord))];
  return words.length > 0 ? words.join(" · ") : WORDS.block_events;
}

export interface AlchemixSheetArgs {
  legs: AlchemistEvent[];
  state: AlchemixStateAtBlockFromReading | undefined;
  before: AlchemixReading | null;
  mytSymbol: string;
  syntheticSymbol: string;
  /** The synthetic's contract, where a leg's flows carry it. */
  syntheticAddress?: string;
  unit: AlchemixUnderlyingUnit | null;
  ratios: AlchemixLineRatios | null;
  coords: AlchemixCoords;
}

/** The sheet, or undefined where the block has no stated reading. */
export function alchemixSheet({
  legs,
  state,
  before,
  mytSymbol,
  syntheticSymbol: sym,
  syntheticAddress,
  unit,
  ratios,
  coords,
}: AlchemixSheetArgs): EventSheet | undefined {
  if (
    !state ||
    state.status !== "stated" ||
    state.blockNumber == null ||
    state.collateralRaw == null ||
    state.debtRaw == null
  )
    return undefined;
  if (!before && !legs.every((l) => LOG_TYPES.has(l.context.data.eventType))) return undefined;

  const atBlock = state.blockNumber;
  const legCount = legs.length;
  const beyond = state.positionEventsInBlock > legCount;
  const collAfter = BigInt(state.collateralRaw);
  const debtAfter = BigInt(state.debtRaw);
  const under = unit?.symbol ?? "the asset underneath";
  const dec = unit?.decimals ?? null;
  const spOf = (raw: string | null | undefined) => (raw != null && dec != null ? Number(raw) / 10 ** dec : null);
  const sp = spOf(state.sharePriceRaw);
  // A dollar line's synthetic stands at its $1 face, and the underlying's price
  // now puts the shares' worth in dollars; another line states its units.
  const face = /^alusd/i.test(sym);
  const usdNow = face && unit?.usd ? unit.usd.pricePerUnit : null;
  const isRedemption = legs.some((l) => l.context.data.eventType === "redemption");
  const reading = (label: string, symbol: string, raw: string) =>
    stateAtBlockFromReadingProv(label, symbol, raw, atBlock, state.positionEventsInBlock, coords, DECIMALS);
  const spNote =
    sp != null ? `1 ${mytSymbol} = ${sp.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${under}` : undefined;
  const sharesUsd = (what: string, sharesRaw: bigint, price: number | null, block: number) => {
    if (price == null || usdNow == null || !unit) return undefined;
    // Signed: a move that took shares reads "−$…".
    const v = (sharesRaw < ZERO ? -1 : 1) * units(abs(sharesRaw)) * price * usdNow;
    return {
      text: sheetUsd(v),
      info: nowUsdProv(what, formatUnitsExact(abs(sharesRaw).toString(), DECIMALS), mytSymbol, price, block, unit),
    };
  };
  const faceUsd = (what: string, raw: bigint) =>
    face
      ? { text: sheetUsd(units(raw)), info: faceProv(what, sym, formatUnitsExact(raw.toString(), DECIMALS)) }
      : undefined;

  // ── The event's rows ──
  const collRows: SheetRow[] = [];
  const debtRows: SheetRow[] = [];
  if (before && before.collateralRaw != null && before.debtRaw != null) {
    const dColl = collAfter - BigInt(before.collateralRaw);
    const dDebt = debtAfter - BigInt(before.debtRaw);
    // One wei either way is getCDP's rounding.
    if (abs(dColl) > ONE_WEI)
      collRows.push({
        key: "event",
        label: sideWord(legs, COLL_TYPES),
        note: spNote,
        amount: {
          text: signedAmount(dColl),
          symbol: mytSymbol,
          info: readingChangeProv("Collateral", mytSymbol, before.blockNumber, atBlock, coords),
          value: signedExact(dColl),
        },
        usd: sharesUsd("The vault shares this event moved", dColl, sp, atBlock),
        tip: beyond ? TIPS.block(state.positionEventsInBlock) : isRedemption ? TIPS.coll_redemption : TIPS.coll_event,
      });
    if (abs(dDebt) > ONE_WEI)
      debtRows.push({
        key: "event",
        label: sideWord(legs, DEBT_TYPES),
        amount: {
          text: signedAmount(dDebt),
          symbol: sym,
          address: syntheticAddress,
          info: readingChangeProv("Debt", sym, before.blockNumber, atBlock, coords),
          value: signedExact(dDebt),
        },
        usd: face
          ? {
              text: sheetUsd(units(dDebt)),
              info: faceProv("The debt this event moved", sym, formatUnitsExact(abs(dDebt).toString(), DECIMALS)),
            }
          : undefined,
        tip: beyond
          ? TIPS.block(state.positionEventsInBlock)
          : isRedemption
            ? TIPS.debt_redemption
            : TIPS.debt_event(sym, face),
      });
  } else {
    // No reading before: the log's amounts.
    for (const leg of legs) {
      const ctx = leg.context.data;
      const raw = ctx.raw.amount;
      if (raw == null || !/^\d+$/.test(raw) || BigInt(raw) === ZERO) continue;
      const v = BigInt(raw);
      const legCoords = { ...coords, txHash: leg.txHash, blockNumber: leg.blockNumber };
      if (ctx.eventType === "deposit" || ctx.eventType === "withdraw") {
        const signed = ctx.eventType === "withdraw" ? -v : v;
        collRows.push({
          key: `event-${collRows.length}`,
          label: legWord(leg),
          note: spNote,
          amount: {
            text: signedAmount(signed),
            symbol: mytSymbol,
            info: emittedAmountProv("amount", mytSymbol, raw, legCoords),
            value: signedExact(signed),
          },
          usd: sharesUsd("The vault shares the log states", signed, sp, atBlock),
          tip: TIPS.coll_log,
        });
      } else if (ctx.eventType === "mint" || ctx.eventType === "burn") {
        const signed = ctx.eventType === "burn" ? -v : v;
        debtRows.push({
          key: `event-${debtRows.length}`,
          label: legWord(leg),
          amount: {
            text: signedAmount(signed),
            symbol: sym,
            address: syntheticAddress,
            info: emittedAmountProv("amount", sym, raw, legCoords),
            value: signedExact(signed),
          },
          usd: face
            ? {
                text: sheetUsd(units(signed)),
                info: faceProv("The synthetic the log states", sym, formatUnitsExact(raw, DECIMALS)),
              }
            : undefined,
          tip: TIPS.debt_log(sym),
        });
      }
    }
  }

  // ── The carry layer, from the reading at the previous event ──
  const collCarry: SheetSide["carry"] = [];
  let collBefore: SheetRow | undefined;
  const debtCarry: SheetSide["carry"] = [];
  let debtBefore: SheetRow | undefined;
  if (before && before.collateralRaw != null && before.debtRaw != null) {
    const prevColl = BigInt(before.collateralRaw);
    const prevDebt = BigInt(before.debtRaw);
    const spThen = spOf(before.sharePriceRaw);
    const prevShares = formatUnitsExact(prevColl.toString(), DECIMALS);
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: fmtPositionAmount(units(prevColl)),
        symbol: mytSymbol,
        info: stateAtBlockFromReadingProv("Collateral", mytSymbol, before.collateralRaw, before.blockNumber, 0, coords),
        value: prevShares,
      },
      usd: sharesUsd("Collateral at the previous event", prevColl, spThen, before.blockNumber),
      tip: TIPS.last_coll,
    });
    const earned = spThen != null && sp != null && prevColl > ZERO ? units(prevColl) * (sp - spThen) : null;
    // Left out where the share price did not move between the two readings.
    if (earned != null && spThen != null && sp != null && earned !== 0 && unit) {
      collCarry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        amount: {
          text: fmtPositionAmount(earned),
          symbol: unit.symbol,
          info: yieldProv(
            prevShares,
            mytSymbol,
            { block: before.blockNumber, price: spThen },
            { block: atBlock, price: sp },
            unit.symbol,
            coords,
          ),
        },
        usd:
          usdNow != null
            ? {
                text: sheetUsd(earned * usdNow),
                info: {
                  kind: "offchain",
                  pclass: "offchain",
                  summary: `The yield since the previous event, in US dollars — the yield in ${unit.symbol} at ${unit.symbol}'s price now, the one dollar price the page holds.`,
                  formula: "yield × price now",
                  via: unit.usd ? `${unit.usd.priceSource} · ${unit.usd.pricedAt}` : undefined,
                  verify: { kind: "none", text: "An off-chain price, with no on-chain anchor" },
                },
              }
            : undefined,
        tip: TIPS.yield(unit.symbol),
      });
    }
    collBefore = {
      key: "before",
      label: SHEET_WORDS.before,
      note: spNote,
      amount: {
        text: fmtPositionAmount(units(prevColl)),
        symbol: mytSymbol,
        info: stateAtBlockFromReadingProv("Collateral", mytSymbol, before.collateralRaw, before.blockNumber, 0, coords),
        value: prevShares,
      },
      usd: sharesUsd("Collateral before this event", prevColl, sp, atBlock),
      tip: TIPS.before_coll,
    };
    const prevDebtExact = formatUnitsExact(prevDebt.toString(), DECIMALS);
    const prevDebtProv = stateAtBlockFromReadingProv("Debt", sym, before.debtRaw, before.blockNumber, 0, coords);
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: fmtPositionAmount(units(prevDebt)),
        symbol: sym,
        address: syntheticAddress,
        info: prevDebtProv,
        value: prevDebtExact,
      },
      usd: faceUsd("Debt at the previous event", prevDebt),
      tip: TIPS.last_debt,
    });
    debtBefore = {
      key: "before",
      label: SHEET_WORDS.before,
      amount: {
        text: fmtPositionAmount(units(prevDebt)),
        symbol: sym,
        address: syntheticAddress,
        info: prevDebtProv,
        value: prevDebtExact,
      },
      usd: faceUsd("Debt before this event", prevDebt),
      tip: TIPS.before_debt,
    };
  }

  // ── Totals ──
  const collTotal: SheetSide["total"] =
    collAfter === ZERO
      ? { text: face ? "$0" : `0 ${mytSymbol}`, info: reading("Collateral", mytSymbol, state.collateralRaw) }
      : sp == null
        ? { none: WORDS.no_price }
        : usdNow != null && unit
          ? (sharesUsd("Collateral after this event", collAfter, sp, atBlock) as { text: string; info: Provenance })
          : {
              text: `${fmtPositionAmount(units(collAfter) * sp)} ${under}`,
              info: readingCollateralisationProv(
                state.collateralRaw,
                state.sharePriceRaw!,
                state.debtRaw,
                atBlock,
                dec!,
                mytSymbol,
                under,
                coords,
              ),
            };
  const debtTotal: SheetSide["total"] =
    debtAfter === ZERO
      ? { text: face ? "$0" : `0 ${sym}`, info: reading("Debt", sym, state.debtRaw) }
      : face
        ? {
            text: sheetUsd(units(debtAfter)),
            info: faceProv("Debt after this event", sym, formatUnitsExact(state.debtRaw, DECIMALS)),
          }
        : { text: `${fmtPositionAmount(units(debtAfter))} ${sym}`, info: reading("Debt", sym, state.debtRaw) };

  // Set-aside: part of the debt, stated at this block alone (decisions/0032).
  const setAside: SheetRow[] =
    state.earmarkedRaw != null && BigInt(state.earmarkedRaw) > ZERO
      ? [
          {
            key: "set-aside",
            label: WORDS.set_aside,
            amount: {
              text: fmtPositionAmount(units(state.earmarkedRaw)),
              symbol: sym,
              address: syntheticAddress,
              info: reading(WORDS.set_aside, sym, state.earmarkedRaw),
              value: formatUnitsExact(state.earmarkedRaw, DECIMALS),
            },
            usd: faceUsd("Set aside for repayment", BigInt(state.earmarkedRaw)),
            tip: TIPS.set_aside,
          },
        ]
      : [];

  const sides: SheetSide[] = [
    {
      side: "collateral",
      icons: collAfter > ZERO || collRows.length > 0 ? [mytSymbol] : [],
      carry: collCarry,
      before: collCarry.length > 0 ? collBefore : undefined,
      rows: collRows,
      total: collTotal,
      totalTip: TIPS.coll_total(under, usdNow != null),
    },
    {
      side: "debt",
      icons: debtAfter > ZERO || debtRows.length > 0 ? [sym] : [],
      carry: debtCarry,
      before: debtCarry.length > 0 ? debtBefore : undefined,
      rows: debtRows,
      assets: setAside,
      total: debtTotal,
      totalTip: TIPS.debt_total(sym, face),
    },
  ];

  // ── Risk and Limits ──
  const ratioAfter = readingCollateralisationRaw(
    { collateralRaw: state.collateralRaw, debtRaw: state.debtRaw, sharePriceRaw: state.sharePriceRaw ?? null },
    dec,
  );
  const ratioBefore = before ? readingCollateralisationRaw(before, dec) : null;
  const closed = collAfter === ZERO && debtAfter === ZERO;
  const noDebt = debtAfter === ZERO;
  const ltvOf = (r: string | null) => (r != null && Number(r) > 0 ? (1e18 / Number(r)) * 100 : null);
  const ltv = ltvOf(ratioAfter);
  const ltvPrev = ltvOf(ratioBefore);
  const ratioProv =
    ratioAfter != null && unit
      ? readingCollateralisationProv(
          state.collateralRaw,
          state.sharePriceRaw!,
          state.debtRaw,
          atBlock,
          unit.decimals,
          mytSymbol,
          under,
          coords,
        )
      : null;
  const noneWhy = closed ? WORDS.closed : noDebt ? WORDS.no_debt : WORDS.no_price;

  const fallOf = (r: string | null) =>
    r != null && ratios && Number(r) > 0 ? (1 - Number(ratios.lowerBoundRaw) / Number(r)) * 100 : null;
  const fall = fallOf(ratioAfter);
  const fallPrev = fallOf(ratioBefore);

  const risk: SheetStat[] = [
    {
      key: "ltv",
      label: WORDS.ltv,
      tip: TIPS.ltv(under),
      value:
        ltv != null && ratioProv
          ? {
              text: pct2(ltv),
              value: pct2(ltv),
              info: {
                ...ratioProv,
                summary: `LTV at block ${atBlock} — the debt over the ${mytSymbol} held valued in ${under} at the share price read with it, one debt unit counted as one ${under}`,
                formula: "debt ÷ (collateral × share price)",
              },
            }
          : { none: noneWhy },
      change:
        ltv != null && ltvPrev != null
          ? { text: changeText(ltv - ltvPrev, pts), info: sinceProv("LTV change, in percentage points") }
          : null,
    },
    {
      key: "collateral-can-fall",
      label: WORDS.fall,
      tip: TIPS.fall,
      value:
        ratioAfter == null
          ? { none: noneWhy }
          : !ratios
            ? { none: WORDS.unread }
            : fall != null && fall > 0
              ? {
                  text: fallText(fall),
                  info: ratioDerivedProv(
                    "Collateral can fall",
                    "1 − liquidation ratio ÷ collateralisation",
                    atBlock,
                    ratioAfter,
                    ratios,
                    "collateralizationLowerBound",
                    coords,
                  ),
                }
              : { none: WORDS.liquidatable },
      change:
        fall != null && fall > 0 && fallPrev != null && fallPrev > 0
          ? { text: changeText(fall - fallPrev, pts), info: sinceProv("The fall's change, in percentage points") }
          : null,
    },
  ];

  const roomOf = (collRaw: string | null, spRaw: string | null | undefined, debtRaw: string | null) => {
    const price = spOf(spRaw);
    if (!ratios || collRaw == null || debtRaw == null || price == null) return null;
    const min = Number(ratios.minimumRaw) / 1e18;
    return min > 0 ? Math.max(0, (units(collRaw) * price) / min - units(debtRaw)) : null;
  };
  const room = closed ? null : roomOf(state.collateralRaw, state.sharePriceRaw, state.debtRaw);
  const roomPrev = before ? roomOf(before.collateralRaw, before.sharePriceRaw, before.debtRaw) : null;
  const limits: SheetStat[] = [
    {
      key: "borrowable",
      label: WORDS.borrowable,
      tip: TIPS.borrowable,
      value: closed
        ? { none: WORDS.closed }
        : !ratios
          ? { none: WORDS.unread }
          : room != null
            ? {
                text: `${fmtPositionAmount(room)} ${sym}`,
                info: {
                  kind: "chain-derived",
                  pclass: "state",
                  summary: `Still borrowable at block ${atBlock} — the ${mytSymbol} held valued in ${under} at the share price read with it, over the line's minimum collateralisation read at block ${ratios.asOfBlock}, less the debt, one debt unit counted as one ${under}.`,
                  contract: { name: "Alchemist V3", address: coords.emitter },
                  via: `getCDP(${coords.tokenId}) and the share price at block ${atBlock}; minimumCollateralization() at block ${ratios.asOfBlock}`,
                  formula: "collateral × share price ÷ minimum collateralisation − debt",
                  verify: { kind: "recompute", text: "Recompute it from the reading and the line's minimum" },
                  source: { block: atBlock },
                  inputs: [
                    {
                      label: "collateral",
                      value: state.collateralRaw,
                      kind: "chain",
                      note: `${mytSymbol} shares, 18 decimals`,
                    },
                    {
                      label: "share price",
                      value: state.sharePriceRaw ?? "",
                      kind: "chain",
                      note: `${under}, ${dec} decimals`,
                    },
                    { label: "debt", value: state.debtRaw, kind: "chain", note: `${sym}, 18 decimals` },
                    {
                      label: "minimumCollateralization",
                      value: ratios.minimumRaw,
                      kind: "chain",
                      note: "1e18 is 100%",
                    },
                  ],
                },
              }
            : { none: WORDS.no_price },
      change:
        room != null && roomPrev != null
          ? {
              text: changeText(room - roomPrev, (x) => `${fmtPositionAmount(x)} ${sym}`),
              info: sinceProv("Still borrowable change"),
            }
          : null,
    },
  ];
  const ratioPct = (raw: string) => pct2(Number(raw) / 1e16);
  const params: SheetStat[] = [
    {
      key: "max-ltv",
      label: WORDS.max_ltv,
      tip: TIPS.max_ltv,
      value: ratios
        ? {
            text: pct2((1e18 / Number(ratios.minimumRaw)) * 100),
            info: {
              ...lineRatioProv("minimumCollateralization", ratios.minimumRaw, ratios.asOfBlock, coords),
              kind: "chain-derived",
              summary: `Max LTV — one over the line's minimum collateralisation, read at block ${ratios.asOfBlock}; a mint or a withdrawal must leave the position below it`,
              formula: "1 ÷ minimum collateralisation",
              scaling: undefined,
            },
          }
        : { none: WORDS.unread },
    },
    {
      key: "liquidation-ratio",
      label: WORDS.liq_ratio,
      tip: TIPS.liq_ratio,
      value: ratios
        ? {
            text: ratioPct(ratios.lowerBoundRaw),
            info: lineRatioProv("collateralizationLowerBound", ratios.lowerBoundRaw, ratios.asOfBlock, coords),
          }
        : { none: WORDS.unread },
    },
  ];

  return {
    sides,
    panels: [
      { panel: "risk", rows: risk, caption: fall != null && fall > 0 ? WORDS.fall_caption : undefined },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
