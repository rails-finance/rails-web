"use client";

import type { EventCellSpec } from "@/components/shared/event-cells";
import type { EventPriceChip } from "@/components/shared/event-price-row";
import type { AaveV4Context, AaveV4PriceSource } from "@/lib/shared/types/protocols/aave-v4";
import type { AaveV4SnapshotItem } from "@/lib/shared/types/event-shape";
import {
  NO_PRICE_HINT,
  UNPRICED_DUST_TOKENS,
  noPriceRatioProv,
  partialLabel,
  partialRatioProv,
  pricesHaveLoaded,
} from "@/lib/aave-v4/unpriced";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { usePreferences } from "@/lib/shared/preferences-context";
import { formatRatio, ratioLabel, ratioColorClass } from "@/lib/shared/ratio-format";
import { StatSubline } from "@/components/shared/state-transition";
import { hfLabelV4, fmtV4Amount, fmtUnitPrice } from "@/lib/aave-v4/format";
import { PositionRow } from "@/components/shared/position-row";
import { resolvePrice } from "@/lib/aave/prices";
import { usePrices } from "@/lib/shared/prices-context";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { borrowRatesByDebt } from "@/lib/aave-v4/borrow-rate";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  healthFactorAtBlockProv,
  heldDebtRateProv,
  snapshotProv,
  chainBalanceProv,
  type AaveV4PremiumAt,
  interestSincePreviousProv,
  deltaProv,
  pricePillProv,
  usdProv,
  type EventProvDetail,
} from "@/lib/aave-v4/position-provenance";
import { ExactTip } from "@/components/shared/amount-text";
import { useHealthFactorAround, hfOf, premiumAt } from "@/lib/aave-v4/use-health-factor-around";

const SNAPSHOT_USD_PROV = usdProv("The after-balance", {
  amountLabel: "balance after event",
  amountKind: "chain",
  amountNote: "event snapshot",
  priceNote: "historic price at this block",
});
const RATIO_PROV: Provenance = {
  kind: "derived",
  summary: "Collateral-to-debt ratio at this event — the snapshot collateral USD divided by the snapshot debt USD.",
  via: "collateral USD ÷ debt USD",
  formula: "Σ(collateral × price) ÷ Σ(debt × price)",
};

/** A price chip's tip: the feed and the block its row was read at. The ≈
 *  prefix on stablecoin sources distinguishes pinned-$1 from market. */
function pricePillTitle(symbol: string, source: AaveV4PriceSource, block?: number, eventBlock?: number): string {
  const sourceLabel =
    source === "chainlink"
      ? "Chainlink feed"
      : source === "chainlink-eth-derived"
        ? "Chainlink asset/ETH × Chainlink ETH/USD"
        : source === "iaave-oracle"
          ? "IAaveOracle"
          : source === "pendle-twap"
            ? "Pendle TWAP × USD feed"
            : source === "stablecoin"
              ? "stablecoin, pinned to $1"
              : "approximation";
  return block != null && eventBlock != null && block !== eventBlock
    ? `${aaveV4DisplaySymbol(symbol)} price from the feed's row at block ${block.toLocaleString("en-US")}, ${(eventBlock - block).toLocaleString("en-US")} blocks before this event (${sourceLabel})`
    : `${aaveV4DisplaySymbol(symbol)} price at this event's block${block != null ? ` ${block.toLocaleString("en-US")}` : ""} (${sourceLabel})`;
}

/** A single held-debt asset's borrow rate — `4.35% [icon] USDC`. Mirrors the
 *  Debt card's `PositionRow` grammar so a multi-debt position reads its rates
 *  the same way it reads its balances: one labelled row per asset. */
function BorrowRateRow({ symbol, apr, coord }: { symbol: string; apr: string; coord: EventProvDetail }) {
  const { showTickerLabels } = useTimelineDisplay();
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="font-semibold">
        <Prov info={heldDebtRateProv({ ...coord, asset: symbol })} icon={<TokenChipIcon symbol={symbol} size={16} />}>
          {(parseFloat(apr) * 100).toFixed(2)}%
        </Prov>
      </span>
      {showTickerLabels && <span className="text-xs">{aaveV4DisplaySymbol(symbol)}</span>}
    </span>
  );
}

export interface AaveV4EventDetailProps {
  ctx: AaveV4Context;
  txHash: string;
  blockNumber?: number;
  wallet: string;
  /** The borrow rate (decimal) the previous event on this spoke recorded for
   *  this event's asset: the Borrow Rate cell is changed where it moved. */
  previousRate?: number;
}

/** Render a single position row — with before→after if this asset changed,
 *  static otherwise. When a per-unit USD price is supplied (the event's
 *  primary asset), the dollar value of the AFTER balance shows as a small
 *  bordered chip between the number and the icon — mirrors Liquity V2's
 *  CollateralMetric pattern (`3.0321 [ $7,062 ] ◊`). The line itself is the
 *  shared PositionRow; this adapter supplies V4's receipts. */
function V4PositionRow({
  symbol,
  amount,
  before,
  isChanged,
  priceUsd,
  coord,
  side,
  rawBefore,
  rawAfter,
  chain,
  interest,
}: {
  symbol: string;
  amount: string;
  before?: string;
  isChanged: boolean;
  priceUsd?: number;
  coord: EventProvDetail;
  /** Which leg's log roster replays this balance — narrows the receipt prose. */
  side: "supply" | "debt";
  /** Raw integer sums behind the changed row's before/after (ctx.raw.*) —
   *  shown on the receipt's via line. Only the changed row has them. */
  rawBefore?: string | null;
  rawAfter?: string | null;
  /** The changed row's balances are chain figures (ctx.balanceBasis): the
   *  shares and hub state behind them ride the receipt. */
  chain?: {
    sharesBefore?: string;
    sharesAfter?: string;
    a?: string;
    b?: string;
    /** The position's premium either side of the block (debt rows). */
    premiumBefore?: AaveV4PremiumAt;
    premiumAfter?: AaveV4PremiumAt;
  };
  /** Interest since the position's previous event on this reserve. */
  interest?: string;
}) {
  // "Balance after" is a running balance, not a single log field — so it gets
  // snapshotProv (replayed-balance framing), scoped to this row's reserve + leg.
  // The delta is chain-derived arithmetic over the two replayed balances, so it
  // is Prov-wrapped (deltaProv) like them.
  const afterN = parseFloat(amount) || 0;
  const afterUsd = priceUsd != null && afterN > 0 ? afterN * priceUsd : undefined;
  const detail = { ...coord, asset: symbol };
  const row = (
    <PositionRow
      symbol={symbol}
      ticker={aaveV4DisplaySymbol(symbol)}
      amount={amount}
      before={before}
      isChanged={isChanged}
      afterProv={
        chain
          ? chainBalanceProv(
              "Balance after this event",
              detail,
              side,
              { value: rawAfter, shares: chain.sharesAfter, a: chain.a, b: chain.b },
              chain.premiumAfter,
            )
          : snapshotProv("Balance after this event", { ...detail, raw: rawAfter }, side)
      }
      beforeProv={
        chain
          ? chainBalanceProv(
              "Balance before this event",
              detail,
              side,
              { value: rawBefore, shares: chain.sharesBefore, a: chain.a, b: chain.b },
              chain.premiumBefore,
            )
          : snapshotProv("Balance before this event", { ...detail, raw: rawBefore }, side)
      }
      deltaProv={deltaProv(detail)}
      usd={afterUsd != null ? { value: afterUsd, prov: SNAPSHOT_USD_PROV } : undefined}
      formatAmount={fmtV4Amount}
    />
  );
  if (!interest) return row;
  return (
    <div className="flex flex-col">
      {row}
      <StatSubline>
        Interest since previous event:{" "}
        <Prov info={interestSincePreviousProv(detail, side)} value={interest} symbol={aaveV4DisplaySymbol(symbol)}>
          <ExactTip text={fmtV4Amount(interest)} exact={interest} symbol={aaveV4DisplaySymbol(symbol)} />
        </Prov>{" "}
        {aaveV4DisplaySymbol(symbol)}
      </StatSubline>
    </div>
  );
}

/** The card's cells and the price row's chips (ui-jobs 309): Collateral and
 *  Debt with a line per reserve, the ratio, the health factor either side and
 *  the borrow rate; one price per asset in the snapshot. */
export function useAaveV4Cells({ ctx, txHash, blockNumber, wallet, previousRate }: AaveV4EventDetailProps): {
  cells: EventCellSpec[];
  prices: EventPriceChip[];
} {
  const { prefs } = usePreferences();
  const ratioMode = prefs.ratioMode;
  const prices = usePrices();
  // Concrete coordinates threaded into each row's balance / rate provenance.
  const coord: EventProvDetail = {
    spokeName: ctx.spokeName,
    spokeAddress: ctx.spokeAddress,
    txHash,
    blockNumber,
  };
  // `token` stays the raw on-chain symbol — it threads through `allSupplies`
  // / `allDebts` rows whose `symbol` field is the chip's icon-lookup key.
  const token = ctx.reserveSymbol ?? "???";
  const isLiq = ctx.eventType === "liquidation";
  const isToggle = ctx.eventType === "collateral_toggle";
  // Every event that moves a balance shows the health factor either side of it,
  // read from the spoke; a collateral toggle moves none.
  const hfAround = useHealthFactorAround(
    !isToggle,
    ctx.spokeAddress,
    ctx.owner ?? wallet,
    blockNumber,
    ctx.reserveSymbol,
  );

  const isSupplySide = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  const isDebtSide = ctx.eventType === "borrow" || ctx.eventType === "repay";

  const supplyBeforeVal = parseFloat(ctx.supplyBefore ?? "0");
  const supplyAfterVal = parseFloat(ctx.supplyAfter ?? "0");
  const debtBeforeVal = parseFloat(ctx.debtBefore ?? "0");
  const debtAfterVal = parseFloat(ctx.debtAfter ?? "0");
  const hasOldSupply = supplyBeforeVal > 0.0001 || supplyAfterVal > 0.0001;
  const hasOldDebt = debtBeforeVal > 0.0001 || debtAfterVal > 0.0001;
  const baseSupplies = ctx.allSupplies?.length
    ? ctx.allSupplies
    : (isSupplySide || isLiq) && hasOldSupply
      ? [{ symbol: isLiq ? (ctx.collateralSymbol ?? token) : token, amount: ctx.supplyAfter ?? "0" }]
      : [];
  const baseDebts = ctx.allDebts?.length
    ? ctx.allDebts
    : (isDebtSide || isLiq) && hasOldDebt
      ? [{ symbol: token, amount: ctx.debtAfter ?? "0" }]
      : [];

  const supplyChangeSym = isLiq ? ctx.collateralSymbol : token;
  const supplyZeroOut =
    (isSupplySide || isLiq) &&
    supplyChangeSym &&
    supplyAfterVal <= 0.0001 &&
    supplyBeforeVal > 0.0001 &&
    !baseSupplies.some((s) => s.symbol === supplyChangeSym);
  const supplies = supplyZeroOut
    ? [...baseSupplies, { symbol: supplyChangeSym!, amount: ctx.supplyAfter ?? "0" }]
    : baseSupplies;

  const debtZeroOut =
    (isDebtSide || isLiq) &&
    debtAfterVal <= 0.0001 &&
    debtBeforeVal > 0.0001 &&
    !baseDebts.some((d) => d.symbol === token);
  const debts = debtZeroOut ? [...baseDebts, { symbol: token, amount: ctx.debtAfter ?? "0" }] : baseDebts;
  const hasSupplies = supplies.length > 0;
  const hasDebts = debts.length > 0;

  const supplyBefore = ctx.supplyBefore;
  const debtBefore = ctx.debtBefore;

  // The event's primary price (`ctx.price`, or liquidation's `collateralPrice`
  // / `debtPrice`) for the changed asset — the fallback the rows and the
  // footer pills use when a row's own historic price is absent.
  const rowPrice = (sym: string): { usd: number; source: AaveV4PriceSource; block?: number } | undefined => {
    if (isLiq) {
      if (sym === ctx.collateralSymbol) return ctx.collateralPrice;
      if (sym === token) return ctx.debtPrice;
      return undefined;
    }
    return sym === ctx.reserveSymbol ? ctx.price : undefined;
  };

  // RULE: Rails never invents a price (lib/aave-v4/unpriced.ts). The ratio
  // values each leg at the price the row above it shows — the row's own
  // historic price, else the event's primary price, else the live map — and a
  // leg none of these covers is left out and named, never counted as zero.
  // Until the live map has answered, a leg with no historic price is pending
  // rather than unpriced, and the card waits.
  const mapAnswered = pricesHaveLoaded(prices);
  const sumLegs = (rows: AaveV4SnapshotItem[]) => {
    let usd = 0;
    const excluded: string[] = [];
    let pending = false;
    for (const r of rows) {
      const amt = parseFloat(r.amount);
      if (!(amt > 0)) continue;
      const price = r.price?.usd ?? rowPrice(r.symbol)?.usd ?? resolvePrice(r.symbol, prices);
      if (price != null) usd += amt * price;
      else if (!mapAnswered) pending = true;
      else if (amt > UNPRICED_DUST_TOKENS) excluded.push(r.symbol);
    }
    return { usd, excluded, pending };
  };
  const supplySum = sumLegs(supplies);
  const debtSum = sumLegs(debts);
  const ratioExcluded = [...supplySum.excluded, ...debtSum.excluded];
  const collRatio = debtSum.usd > 0 ? supplySum.usd / debtSum.usd : 0;
  // A side whose every priced holding is missing has no dollar figure, so the
  // ratio is absent and the card says so rather than showing a zero.
  const collateralAbsent = supplySum.usd <= 0 && supplySum.excluded.length > 0;
  const debtAbsent = debtSum.usd <= 0.01 && debtSum.excluded.length > 0;
  const ratioAbsent = collateralAbsent || debtAbsent;
  const showRatio =
    hasSupplies && hasDebts && !supplySum.pending && !debtSum.pending && (ratioAbsent || debtSum.usd > 0.01);

  // Footer price pills — one per distinct asset in the snapshot (collateral +
  // debt). Prefer each row's historic price; fall back to the event's primary
  // price so the changed asset still shows when its per-row price is absent.
  const pricePills: { symbol: string; usd: number; source: AaveV4PriceSource; block?: number }[] = [];
  const seenPill = new Set<string>();
  for (const row of [...supplies, ...debts]) {
    if (seenPill.has(row.symbol)) continue;
    const p = row.price ?? rowPrice(row.symbol);
    if (p && p.usd > 0) {
      pricePills.push({ symbol: row.symbol, usd: p.usd, source: p.source, block: p.block });
      seenPill.add(row.symbol);
    }
  }

  const cells: EventCellSpec[] = [];
  // A collateral toggle moves no balance: its one figure is whether the
  // reserve counts as collateral.
  if (isToggle)
    cells.push({
      kind: "stat",
      key: "toggle",
      label: "Used as collateral",
      changed: true,
      value: {
        before: { text: ctx.enabled ? "No" : "Yes" },
        after: { text: ctx.enabled ? "Yes" : "No", info: undefined },
        afterClass: ctx.enabled ? "text-green-400" : undefined,
      },
    });
  if (hasSupplies) {
    cells.push({
      kind: "stat",
      key: "collateral",
      label: "Collateral",
      changed: isSupplySide || isLiq,
      value: {
        lines: supplies.map((s) => {
          // The changed asset is the supply side's primary asset for
          // supply/withdraw, or the collateral asset for liquidations.
          const isThisChanged = (isSupplySide || isLiq) && s.symbol === (isLiq ? ctx.collateralSymbol : token);
          // Prefer the per-row price (server enriches every snapshot item with
          // its historic USD price). Fall back to the event's primary price on
          // the changed row so older clients / payloads without per-row prices
          // still render.
          const priceUsd =
            s.price?.usd ?? (!isThisChanged ? undefined : isLiq ? ctx.collateralPrice?.usd : ctx.price?.usd);
          return (
            <V4PositionRow
              key={s.symbol}
              symbol={s.symbol}
              amount={s.amount}
              before={isThisChanged ? supplyBefore : undefined}
              isChanged={isThisChanged}
              priceUsd={priceUsd}
              coord={coord}
              side="supply"
              rawBefore={isThisChanged ? ctx.raw?.supplyBefore : undefined}
              rawAfter={isThisChanged ? ctx.raw?.supplyAfter : undefined}
              chain={
                isThisChanged && ctx.balanceBasis === "chain"
                  ? {
                      sharesBefore: ctx.raw?.supplySharesBefore,
                      sharesAfter: ctx.raw?.supplySharesAfter,
                      a: ctx.raw?.hubAddedAssets,
                      b: ctx.raw?.hubAddedShares,
                    }
                  : undefined
              }
              interest={isThisChanged ? ctx.supplyInterestSincePrevious : undefined}
            />
          );
        }),
      },
    });
  }
  if (hasDebts) {
    cells.push({
      kind: "stat",
      key: "debt",
      label: "Debt",
      changed: isDebtSide || isLiq,
      value: {
        lines: debts.map((d) => {
          const isThisChanged = (isDebtSide || isLiq) && d.symbol === token;
          const priceUsd = d.price?.usd ?? (!isThisChanged ? undefined : isLiq ? ctx.debtPrice?.usd : ctx.price?.usd);
          return (
            <V4PositionRow
              key={d.symbol}
              symbol={d.symbol}
              amount={d.amount}
              before={isThisChanged ? debtBefore : undefined}
              isChanged={isThisChanged}
              priceUsd={priceUsd}
              coord={coord}
              side="debt"
              rawBefore={isThisChanged ? ctx.raw?.debtBefore : undefined}
              rawAfter={isThisChanged ? ctx.raw?.debtAfter : undefined}
              chain={
                isThisChanged && ctx.balanceBasis === "chain"
                  ? {
                      sharesBefore: ctx.raw?.drawnSharesBefore,
                      sharesAfter: ctx.raw?.drawnSharesAfter,
                      a: ctx.raw?.hubDrawnIndex,
                      premiumBefore: premiumAt(hfAround, "before"),
                      premiumAfter: premiumAt(hfAround, "after"),
                    }
                  : undefined
              }
              interest={isThisChanged ? ctx.debtInterestSincePrevious : undefined}
            />
          );
        }),
      },
    });
  }
  if (showRatio && ratioAbsent) {
    const label = ratioLabel(ratioMode);
    const side = collateralAbsent ? "collateral" : "debt";
    const names = collateralAbsent ? supplySum.excluded : debtSum.excluded;
    cells.push({
      kind: "stat",
      key: "ratio",
      label,
      changed: false,
      inputs: ["collateral", "debt"],
      value: {
        after: {
          text: <span data-ratio="no-price">{NO_PRICE_HINT}</span>,
          info: noPriceRatioProv(label, side, names),
        },
      },
    });
  } else if (showRatio) {
    const label = ratioLabel(ratioMode);
    const tone = ratioColorClass(collRatio * 100, {
      danger: 120,
      warn: 150,
      warnClass: "text-foreground",
      safeClass: "",
    });
    cells.push({
      kind: "stat",
      key: "ratio",
      label: partialLabel(label, ratioExcluded),
      // Derived from the collateral and the debt: its heading follows them.
      changed: isSupplySide || isDebtSide || isLiq,
      inputs: ["collateral", "debt"],
      value: {
        after: {
          text: (
            <span data-ratio={ratioExcluded.length > 0 ? "partial" : "whole"}>
              {formatRatio(collRatio * 100, ratioMode, 0)}
            </span>
          ),
          info: partialRatioProv(RATIO_PROV, label, ratioExcluded),
        },
        afterClass: tone || undefined,
      },
    });
  }
  // Health factor before → after: read from the spoke at the end of the block
  // before the event and of its own block, at the precision every health-factor
  // display uses (hfLabel). The cell holds its place while the read is in
  // flight, so the grid does not reflow when it lands; a position with no debt
  // either side has no finite factor to show, and a failed read draws nothing.
  const hfBothInfinite = hfAround.status === "ok" && hfAround.before.wad == null && hfAround.after.wad == null;
  if (hfAround.status === "loading" && hasDebts) {
    cells.push({
      kind: "stat",
      key: "health-factor",
      label: "Health factor",
      changed: false,
      inputs: ["collateral", "debt"],
      value: {
        after: {
          text: (
            <span
              className="inline-block h-[1em] w-24 rounded-md bg-skeleton animate-pulse align-middle"
              aria-hidden="true"
            />
          ),
        },
      },
    });
  } else if (hfAround.status === "ok" && !hfBothInfinite) {
    const before = hfLabelV4(hfOf(hfAround.before.wad));
    const after = hfLabelV4(hfOf(hfAround.after.wad));
    cells.push({
      kind: "stat",
      key: "health-factor",
      label: "Health factor",
      changed: before !== after,
      inputs: ["collateral", "debt"],
      value: {
        before: { text: before, info: healthFactorAtBlockProv("before", coord, hfAround.before) },
        after: { text: after, info: healthFactorAtBlockProv("after", coord, hfAround.after) },
      },
    });
  }
  // Supply rate is intentionally not shown. Aave V4's hub emits no supply-side
  // rate or index (UpdateAsset carries only the drawn/borrow side); a per-event
  // supply APY would have to be inferred from index slope (noisy, same flicker
  // the borrow rate had) or reconstructed from flows (drifts). We only surface
  // rates we can stand behind on-chain — see the borrow rate below.
  //
  // Borrow rate of the debt the position holds — the true per-block on-chain
  // rate. Asset-aware: one row per held-debt asset, since a position carrying
  // both USDC and USDT debt has two distinct rates and a single number would
  // silently switch between them event to event (see borrowRatesByDebt).
  const debtRates = borrowRatesByDebt(ctx);
  if (debtRates.length > 0) {
    const thisRate = debtRates.find((r) => r.symbol === ctx.reserveSymbol);
    const pctOf = (apr: number) => (apr * 100).toFixed(2);
    cells.push({
      kind: "stat",
      key: "borrow-rate",
      label: debtRates.length > 1 ? "Borrow Rates" : "Borrow Rate",
      // Moved where this asset's rate differs, at the two places shown, from
      // the one the previous event on the spoke recorded.
      changed: thisRate != null && previousRate != null && pctOf(parseFloat(thisRate.apr)) !== pctOf(previousRate),
      value: {
        lines: debtRates.map((r) => <BorrowRateRow key={r.symbol} symbol={r.symbol} apr={r.apr} coord={coord} />),
      },
    });
  }

  // The price row's chips: one per distinct asset in the snapshot (collateral
  // + debt), each its historic price at this block. The ≈ prefix on a
  // stablecoin source tells a pinned $1 from a market price, so that figure
  // stands as it is.
  const chips: EventPriceChip[] = pricePills.map((p) => ({
    symbol: p.symbol,
    usd: p.usd,
    format: fmtUnitPrice,
    text: p.source === "stablecoin" ? `≈${fmtUnitPrice(p.usd)}` : undefined,
    info: pricePillProv(p.symbol, p.source, p.block, blockNumber),
    title: pricePillTitle(p.symbol, p.source, p.block, blockNumber),
  }));

  return { cells, prices: chips };
}
