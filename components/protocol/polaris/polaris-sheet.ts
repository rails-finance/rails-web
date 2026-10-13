// Polaris on the event card's balance sheet (rails-ops TO-DO-ui-jobs 330): the
// `sheet` slot filled for an open, an adjust and a close. Liquity V2's sheet
// (components/protocol/liquity/liquity-cells.tsx) is the template: Collateral
// then Debt, each with a carry layer, the event's rows and the side's total in
// dollars; then Risk and Limits with the protocol's parameters beneath.
//
// The page holds the previous event's resulting figures (`collBefore`,
// `debtBefore`) and this block's feed but no price for the previous event, so the
// carry layer holds "Last event" in tokens, the interest since it and "Before
// this event"; the Market move row and the previous event's dollars need that
// price and stand out. A liquidation and a transfer keep their cells.
//
// Dollars: pETH at the market's feed price in its stablecoin times the
// stablecoin's price; a USDp is $1 in the feed (it prices pETH as the bonding
// curve's rate times ETH/USD), a GOLDp is one ounce, priced by XAU/USD.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { SHEET_WORDS, sheetUsd, type EventSheet, type SheetRow, type SheetStat } from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import {
  ledgerFieldProv,
  beforeProv,
  rateInForceProv,
  liqPenaltyConstantProv,
  crChangeAtEventProv,
  type PolarisCoords,
  type PolarisLedgerField,
} from "@/lib/polaris/event-provenance";
import { crPct1, polarisCrAtEvent, polarisCrReceipt, POLARIS_NORMAL_MCR_PCT } from "@/lib/polaris/cr-at-event";
import { PETH, POLARIS_CORE, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";
import { POLARIS_LIQ_CONSTANTS, polarisValueFormat } from "./polaris-liquidation-forensics";
import { formatExact, formatNumber } from "@/lib/utils/format";

const W = POLARIS_WORDS;

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};
const signed = (n: number, text: string) => (n < 0 ? `−${text}` : text);
const amountText = (n: number) => signed(n, formatNumber(Math.abs(n)));

/** The stablecoin's price in dollars at the event's block, with the receipt
 *  input that states where it comes from. */
interface UnitPrice {
  usd: number;
  input: ProvInput;
  words: string;
}

function unitPriceOf(ctx: PolarisContext): UnitPrice | null {
  const pa = ctx.priceAtBlock;
  if (!pa) return null;
  const stable = ctx.stableSymbol;
  if (ctx.market === "usdp")
    return {
      usd: 1,
      input: {
        label: `${stable} in USD`,
        value: "$1.00",
        kind: "chain-derived",
        pclass: "oracle",
        note: "the feed prices pETH as the bonding curve's rate times ETH/USD, so a USDp is $1 in it",
      },
      words: "$1.00 in the feed",
    };
  if (pa.xauUsd == null) return null;
  return {
    usd: pa.xauUsd,
    input: {
      label: `${stable} in USD`,
      value: sheetUsd(pa.xauUsd),
      kind: "chain",
      pclass: "oracle",
      note: "the XAU/USD medianiser at this block; the feed counts a GOLDp as one ounce of gold",
      contract: { name: "Polaris XAU/USD Medianiser", address: POLARIS_CORE.xauUsdMedianiser },
    },
    words: "XAU/USD",
  };
}

/** Polaris's sheet, or undefined for the events it cannot state (a
 *  liquidation, a transfer). */
export function polarisSheet(ctx: PolarisContext, coords: PolarisCoords): EventSheet | undefined {
  if (ctx.eventType !== "open" && ctx.eventType !== "adjust" && ctx.eventType !== "close") return undefined;
  if (ctx.newColl == null || ctx.newDebt == null) return undefined;

  const cfg = POLARIS_MARKET_CONFIG[ctx.market];
  const stable = ctx.stableSymbol;
  const stableAddr = cfg.stable.address;
  const manager = { name: `Polaris ${stable} CDPManager`, address: cfg.cdpManager };
  const isClose = ctx.eventType === "close";
  const fmtUnit = polarisValueFormat(ctx.market);

  const collAfter = num(ctx.newColl);
  const debtAfter = num(ctx.newDebt);
  const collBefore = num(ctx.collBefore);
  const debtBefore = num(ctx.debtBefore);
  const interest = num(ctx.accruedInterest);

  const pa = ctx.priceAtBlock;
  const unit = unitPriceOf(ctx);
  const pethUsd = pa && unit ? pa.pethInDebt * unit.usd : null;
  const pethPriceInput: ProvInput | null = pa
    ? {
        label: `pETH price in ${stable}`,
        value: `${formatExact(pa.pethInDebt)} ${stable}`,
        kind: "chain",
        pclass: "oracle",
        note: "the market's price feed, previewPrice() at this block",
        contract: { name: `Polaris ${stable} price feed`, address: cfg.priceFeed },
      }
    : null;

  /** A token amount in dollars at this block's price. */
  const usdProv = (what: string, token: "coll" | "debt", amount: number): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    summary:
      token === "coll"
        ? `${what} in US dollars — the pETH times the market's feed price for pETH in ${stable}, times ${stable}'s price in dollars (${unit?.words}), at this block.`
        : `${what} in US dollars — the ${stable} times its price in dollars (${unit?.words}) at this block.`,
    formula: token === "coll" ? `pETH × pETH price in ${stable} × ${stable} in USD` : `${stable} × ${stable} in USD`,
    via: "polaris_oracle_at_block",
    inputs: [
      { label: token === "coll" ? "pETH" : stable, value: `${formatExact(Math.abs(amount))}`, kind: "chain" },
      ...(token === "coll" && pethPriceInput ? [pethPriceInput] : []),
      ...(unit ? [unit.input] : []),
    ],
  });
  const usdOf = (what: string, token: "coll" | "debt", n: number): SheetRow["usd"] => {
    const price = token === "coll" ? pethUsd : unit?.usd;
    return price != null ? { text: sheetUsd(n * price), info: usdProv(what, token, n) } : undefined;
  };

  // The event's word on each side.
  const collWord = isClose
    ? W.sheet_close
    : ctx.eventType === "open"
      ? W.sheet_open
      : num(ctx.collChange) >= 0
        ? W.sheet_add
        : W.sheet_withdraw;
  const debtWord = isClose
    ? W.sheet_close
    : ctx.eventType === "open"
      ? W.sheet_open
      : num(ctx.debtChange) >= 0
        ? W.sheet_borrow
        : W.sheet_repay;

  /** One of the log's legs as a row. `lowers`: the log states a magnitude that
   *  comes off the side. */
  const leg = (
    field: PolarisLedgerField,
    key: string,
    label: string,
    token: "coll" | "debt",
    tip: string,
    opts: { lowers?: boolean; keyed?: boolean } = {},
  ): SheetRow | null => {
    const v = ctx[field];
    if (v == null || num(v) === 0) return null;
    const n = opts.lowers ? -Math.abs(num(v)) : num(v);
    return {
      key,
      label,
      amount: {
        text: amountText(n),
        symbol: token === "coll" ? PETH.symbol : stable,
        address: token === "coll" ? PETH.address : stableAddr,
        info: ledgerFieldProv(field, coords, ctx.raw?.[field]),
        value: opts.keyed ? formatNumber(Math.abs(num(v))) : undefined,
      },
      usd: usdOf(label, token, n),
      tip,
    };
  };

  // ── Collateral ──
  const collRows = [
    leg("collChange", "event", collWord, "coll", W.tip_coll_event),
    leg("bcTokenGain", "reward", W.sheet_reward, "coll", W.tip_coll_reward, { keyed: true }),
    leg("mintRedeemCollGain", "psm", W.sheet_psm, "coll", W.tip_coll_psm, { keyed: true }),
  ].filter((r): r is SheetRow => r != null);

  const collCarry: EventSheet["sides"][number]["carry"] = [];
  if (collBefore > 0)
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: formatNumber(collBefore),
        symbol: PETH.symbol,
        address: PETH.address,
        info: beforeProv("coll", coords, ctx.raw?.collBefore),
      },
      tip: W.tip_coll_last,
    });
  const collSide: EventSheet["sides"][number] = {
    side: "collateral",
    icons: [PETH.symbol],
    carry: collCarry,
    before:
      collCarry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: formatNumber(collBefore),
              symbol: PETH.symbol,
              address: PETH.address,
              info: beforeProv("coll", coords, ctx.raw?.collBefore),
            },
            usd: usdOf(SHEET_WORDS.before, "coll", collBefore),
            tip: W.tip_coll_before,
          }
        : undefined,
    rows: collRows,
    total:
      collAfter === 0
        ? { text: "$0", info: ledgerFieldProv("newColl", coords, ctx.raw?.newColl) }
        : pethUsd != null
          ? { text: sheetUsd(collAfter * pethUsd), info: usdProv("The collateral after this event", "coll", collAfter) }
          : { none: W.sheet_no_price },
    totalTip: W.tip_coll_total,
  };

  // ── Debt ──
  const debtRows = [
    leg("debtChange", "event", debtWord, "debt", W.tip_debt_event),
    leg("stableGain", "stability-gain", W.sheet_stability_gain, "debt", W.tip_debt_gain, { lowers: true, keyed: true }),
    leg("mintRedeemDebtGain", "psm", W.sheet_psm, "debt", W.tip_debt_psm, { keyed: true }),
    leg("stablesMintedToEnsureZeroDebt", "settled", W.sheet_settled, "debt", W.tip_debt_settled, { keyed: true }),
  ].filter((r): r is SheetRow => r != null);

  const debtBeforeEvent = debtBefore + interest;
  const debtBeforeEventProv: Provenance = {
    kind: "derived",
    pclass: "indexed",
    summary: `${stable} owed immediately before this event — the debt the previous event recorded plus the interest charged into it at this event.`,
    formula: "debt at the previous event + interest charged",
    contract: manager,
    inputs: [
      { label: "debt at the previous event", value: `${formatExact(debtBefore)} ${stable}`, kind: "chain" },
      { label: "interest charged", value: `${formatExact(interest)} ${stable}`, kind: "chain", pclass: "emitted" },
    ],
  };
  const debtCarry: EventSheet["sides"][number]["carry"] = [];
  if (debtBefore > 0) {
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: formatNumber(debtBefore),
        symbol: stable,
        address: stableAddr,
        info: beforeProv("debt", coords, ctx.raw?.debtBefore),
      },
      // A USDp is $1 in the feed at any block; a GOLDp's price at the previous event is not on the page.
      usd:
        ctx.market === "usdp" && unit
          ? { text: sheetUsd(debtBefore * unit.usd), info: usdProv(SHEET_WORDS.last, "debt", debtBefore) }
          : undefined,
      tip: W.tip_debt_last,
    });
    if (interest > 0) {
      const interestUsd = usdOf(SHEET_WORDS.interest, "debt", interest);
      debtCarry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        usd: interestUsd,
        tip: W.tip_debt_interest,
        sub: [
          {
            key: `interest-${stable}`,
            label: stable,
            note: unit ? sheetUsd(unit.usd) : undefined,
            amount: {
              text: formatNumber(interest),
              symbol: stable,
              address: stableAddr,
              info: ledgerFieldProv("accruedInterest", coords, ctx.raw?.accruedInterest),
              value: formatNumber(interest),
            },
            usd: interestUsd,
            tip: W.tip_debt_interest_asset,
          },
        ],
      });
    }
  }
  const debtSide: EventSheet["sides"][number] = {
    side: "debt",
    icons: [stable],
    carry: debtCarry,
    before:
      debtCarry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: formatNumber(debtBeforeEvent),
              symbol: stable,
              address: stableAddr,
              info: debtBeforeEventProv,
            },
            usd: unit
              ? {
                  text: sheetUsd(debtBeforeEvent * unit.usd),
                  info: usdProv(SHEET_WORDS.before, "debt", debtBeforeEvent),
                }
              : undefined,
            tip: W.tip_debt_before,
          }
        : undefined,
    rows: debtRows,
    total:
      debtAfter === 0
        ? { text: "$0", info: ledgerFieldProv("newDebt", coords, ctx.raw?.newDebt) }
        : unit
          ? { text: sheetUsd(debtAfter * unit.usd), info: usdProv("The debt after this event", "debt", debtAfter) }
          : { none: W.sheet_no_price },
    totalTip: W.tip_debt_total,
  };

  // ── Risk ──
  const cr = polarisCrAtEvent(ctx);
  const pts = (a: number) => `${a.toFixed(2)} pts`;
  const mcr = POLARIS_LIQ_CONSTANTS.mcr;
  const open = !isClose && debtAfter > 0 && collAfter > 0;
  const crReceipt = cr ? polarisCrReceipt(ctx, coords, cr) : null;
  const crChange =
    cr && crReceipt && cr.source === "formula" && cr.beforePct != null
      ? {
          text: changeText(cr.pct - cr.beforePct, pts),
          info: crChangeAtEventProv(coords),
        }
      : null;
  const liqPrice = open ? (debtAfter * mcr.fraction) / collAfter : null;
  const liqBefore =
    open && ctx.eventType !== "open" && collBefore > 0 && debtBefore > 0
      ? (debtBefore * mcr.fraction) / collBefore
      : null;
  const unitText = (n: number) => `${fmtUnit(n)} ${stable}`;
  const liqProv = (what: string, coll: number, debt: number): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    summary: `${what} — the price of pETH, in ${stable}, at which this CDP's collateral ratio meets the market's normal-mode minimum, ${mcr.label}: the debt times the minimum ratio, divided by the collateral. A defensive-mode minimum (150%) in force at a past block is not indexed.`,
    formula: "debt × minimum ratio ÷ collateral",
    contract: manager,
    inputs: [
      { label: "debt", value: `${formatExact(debt)} ${stable}`, kind: "chain", pclass: "emitted" },
      { label: "collateral", value: `${formatExact(coll)} ${PETH.symbol}`, kind: "chain", pclass: "emitted" },
      { label: "minimum ratio", value: mcr.label, kind: "chain", pclass: "state" },
    ],
  });
  const risk: SheetStat[] = [
    {
      key: "ratio",
      label: W.collateral_ratio,
      value:
        cr && crReceipt
          ? { text: crPct1(cr.pct), info: crReceipt.info, value: crReceipt.value }
          : { none: isClose ? W.sheet_closed : debtAfter === 0 ? W.sheet_no_debt : W.sheet_no_price },
      tone: cr?.belowMin ? "text-red-500" : undefined,
      tip: W.tip_cr,
      change: crChange,
    },
    {
      key: "liquidates-at",
      label: W.liquidates_at,
      tip: W.tip_liquidates_at,
      value:
        liqPrice != null
          ? { text: unitText(liqPrice), info: liqProv("Liquidation price", collAfter, debtAfter) }
          : { none: isClose ? W.sheet_closed : W.sheet_no_debt },
      change:
        liqPrice != null && liqBefore != null
          ? {
              text: changeText(liqPrice - liqBefore, unitText),
              info: {
                kind: "derived",
                summary:
                  "Liquidation price change at this event — the price after this event less the price on the figures before it.",
                formula: "price after − price before",
              },
            }
          : null,
    },
  ];

  // ── Limits ──
  const rateText = ctx.primaryRate != null ? `${(ctx.primaryRate * 100).toFixed(2)}%` : null;
  const limits: SheetStat[] = [
    {
      key: "primary-rate",
      label: W.primary_rate,
      tip: W.tip_primary_rate,
      value:
        rateText != null
          ? { text: rateText, info: rateInForceProv(coords, ctx.raw?.primaryRate), value: rateText }
          : { none: W.sheet_no_rate },
    },
    {
      key: "reserve-to-debt",
      label: W.reserve_to_debt,
      tip: W.tip_reserve_to_debt,
      value: { none: W.sheet_not_read },
    },
  ];
  const mcrProv: Provenance = {
    kind: "chain",
    pclass: "state",
    verify: { kind: "recompute", text: `Re-run ${mcr.fn} on the cdpManager — it returns ${mcr.raw} (1e18 = 100%).` },
    summary: `The market's minimum collateral ratio in normal mode — the cdpManager's \`${mcr.fn}\`, ${mcr.label}. A constant of the deployment; a defensive-mode minimum (150%) in force at a past block is not indexed, so every row compares against this one.`,
    contract: manager,
    via: `${mcr.fn} ÷ 1e18 (read at block ${POLARIS_LIQ_CONSTANTS.readAtBlock}, identical on both markets)`,
  };
  const sp = POLARIS_LIQ_CONSTANTS.sp;
  const params: SheetStat[] = [
    {
      key: "minimum-ratio",
      label: W.minimum_ratio,
      tip: W.tip_minimum_ratio,
      value: { text: `${POLARIS_NORMAL_MCR_PCT}%`, info: mcrProv },
    },
    {
      key: "liquidation-penalty",
      label: W.liquidation_penalty,
      tip: W.tip_liquidation_penalty,
      value: {
        text: sp.label,
        info: liqPenaltyConstantProv(coords, "sp", {
          fn: sp.fn,
          value: sp.label,
          raw: sp.raw,
          readAtBlock: POLARIS_LIQ_CONSTANTS.readAtBlock,
        }),
      },
    },
  ];

  return {
    sides: [collSide, debtSide],
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
