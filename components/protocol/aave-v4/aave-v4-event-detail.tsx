"use client";

import type { ReactNode } from "react";
import type { AaveV4Context, AaveV4PriceSource } from "@/lib/shared/types/protocols/aave-v4";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { usePreferences } from "@/lib/shared/preferences-context";
import { formatRatio, ratioLabel, ratioColorClass } from "@/lib/shared/ratio-format";
import { StatCard } from "@/components/shared/state-transition";
import { PositionRow, fmtPositionUsd } from "@/components/shared/position-row";
import { resolvePrice } from "@/lib/aave/prices";
import { usePrices } from "@/lib/shared/prices-context";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { borrowRatesByDebt } from "@/lib/aave-v4/borrow-rate";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  heldDebtRateProv,
  snapshotProv,
  deltaProv,
  pricePillProv,
  usdProv,
  type EventProvDetail,
} from "@/lib/aave-v4/position-provenance";

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

/** Per-unit asset-price pill shown in the event-detail footer — one per
 *  distinct asset in the snapshot (collateral + debt), each carrying the
 *  asset's historic USD price at the event's block. The ≈ prefix on
 *  stablecoin sources distinguishes pinned-$1 from market. */
function PricePill({
  symbol,
  usd,
  source,
  block,
  eventBlock,
}: {
  symbol: string;
  usd: number;
  source: AaveV4PriceSource;
  /** The block of the feed row this price was read from (wire `price.block`);
   *  absent on an older payload. */
  block?: number;
  eventBlock?: number;
}) {
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
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold text-rb-500 bg-background px-2 py-1 rounded-md"
      title={
        block != null && eventBlock != null && block !== eventBlock
          ? `${aaveV4DisplaySymbol(symbol)} price from the feed's row at block ${block.toLocaleString("en-US")}, ${(eventBlock - block).toLocaleString("en-US")} blocks before this event (${sourceLabel})`
          : `${aaveV4DisplaySymbol(symbol)} price at this event's block${block != null ? ` ${block.toLocaleString("en-US")}` : ""} (${sourceLabel})`
      }
    >
      <Prov info={pricePillProv(symbol, source, block, eventBlock)} icon={<TokenChipIcon symbol={symbol} size={14} />}>
        {source === "stablecoin" ? "≈" : ""}
        {fmtPositionUsd(usd)}
      </Prov>
    </span>
  );
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
}) {
  // "Balance after" is a running balance, not a single log field — so it gets
  // snapshotProv (replayed-balance framing), scoped to this row's reserve + leg.
  // The delta is chain-derived arithmetic over the two replayed balances, so it
  // is Prov-wrapped (deltaProv) like them.
  const afterN = parseFloat(amount) || 0;
  const afterUsd = priceUsd != null && afterN > 0 ? afterN * priceUsd : undefined;
  return (
    <PositionRow
      symbol={symbol}
      ticker={aaveV4DisplaySymbol(symbol)}
      amount={amount}
      before={before}
      isChanged={isChanged}
      afterProv={snapshotProv("Balance after this event", { ...coord, asset: symbol, raw: rawAfter }, side)}
      beforeProv={snapshotProv("Balance before this event", { ...coord, asset: symbol, raw: rawBefore }, side)}
      deltaProv={deltaProv({ ...coord, asset: symbol })}
      usd={afterUsd != null ? { value: afterUsd, prov: SNAPSHOT_USD_PROV } : undefined}
    />
  );
}

export function AaveV4EventDetail({ ctx, txHash, blockNumber }: AaveV4EventDetailProps) {
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

  // Without prices, totals come out 0 and the ratio panel hides. v1 ships
  // without live pricing — `usePrices()` is a stub returning {}.
  const getPrice = (sym: string) => resolvePrice(sym, prices) ?? 0;
  const totalSupplyUsd = supplies.reduce((s, p) => s + parseFloat(p.amount) * getPrice(p.symbol), 0);
  const totalDebtUsd = debts.reduce((s, p) => s + parseFloat(p.amount) * getPrice(p.symbol), 0);
  const collRatio = totalDebtUsd > 0 ? totalSupplyUsd / totalDebtUsd : 0;
  const showRatio = hasSupplies && hasDebts && totalDebtUsd > 0.01;

  // Footer price pills — one per distinct asset in the snapshot (collateral +
  // debt). Prefer each row's historic price; fall back to the event's primary
  // price (`ctx.price`, or liquidation's `collateralPrice` / `debtPrice`) so
  // the changed asset still shows when its per-row price is absent.
  const rowPrice = (sym: string): { usd: number; source: AaveV4PriceSource; block?: number } | undefined => {
    if (isLiq) {
      if (sym === ctx.collateralSymbol) return ctx.collateralPrice;
      if (sym === token) return ctx.debtPrice;
      return undefined;
    }
    return sym === ctx.reserveSymbol ? ctx.price : undefined;
  };
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

  // Full-position snapshot, assembled as a flat list of equal-size cards.
  // Collateral · Debt · LTV · Borrow Rate each become one StatCard; the grid
  // below balances their widths and heights. Built here (rather than inline)
  // so the trailing-card full-width span can key off the final count.
  const snapshotCards: { key: string; label: string; body: ReactNode }[] = [];
  if (hasSupplies) {
    snapshotCards.push({
      key: "collateral",
      label: "Collateral",
      body: (
        <div className="flex flex-col gap-1">
          {supplies.map((s) => {
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
              />
            );
          })}
        </div>
      ),
    });
  }
  if (hasDebts) {
    snapshotCards.push({
      key: "debt",
      label: "Debt",
      body: (
        <div className="flex flex-col gap-1">
          {debts.map((d) => {
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
              />
            );
          })}
        </div>
      ),
    });
  }
  if (showRatio) {
    snapshotCards.push({
      key: "ratio",
      label: ratioLabel(ratioMode),
      body: (
        <div
          className={`text-sm font-semibold ${ratioColorClass(collRatio * 100, {
            danger: 120,
            warn: 150,
            warnClass: "text-foreground",
            safeClass: "",
          })}`}
        >
          <Prov info={RATIO_PROV}>{formatRatio(collRatio * 100, ratioMode, 0)}</Prov>
        </div>
      ),
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
    snapshotCards.push({
      key: "borrow-rate",
      label: debtRates.length > 1 ? "Borrow Rates" : "Borrow Rate",
      body: (
        <div className="flex flex-col gap-1">
          {debtRates.map((r) => (
            <BorrowRateRow key={r.symbol} symbol={r.symbol} apr={r.apr} coord={coord} />
          ))}
        </div>
      ),
    });
  }

  return (
    <>
      {/* Collateral toggle status */}
      {isToggle && (
        <div className="px-5 py-2 text-sm">
          <span className={`font-bold ${ctx.enabled ? "text-green-400" : ""}`}>
            {ctx.enabled ? "Enabled as collateral" : "Disabled as collateral"}
          </span>
        </div>
      )}

      {/* Full position snapshot — one equal-size card per section (Collateral,
          Debt, LTV, Borrow Rate). Rows size to their own content (no
          `auto-rows-fr`) so the single-line LTV / Borrow-Rate cards don't
          stretch to match the tall multi-asset Collateral / Debt cards; cards
          within a row still align via `h-full`. Mirrors the Liquity V2 detail
          grid that leads its card. */}
      {snapshotCards.length > 0 && (
        <div className="px-5 py-2">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {snapshotCards.map((c) => (
              <StatCard key={c.key} label={c.label}>
                {c.body}
              </StatCard>
            ))}
          </div>
        </div>
      )}

      {/* Asset-price footer pills — one per-unit price per asset in the
          snapshot (collateral + debt), mirroring Liquity V2's `$X,XXX ◊` chip.
          Each pill is source-aware via its tooltip; the ≈ prefix on stablecoin
          sources lets the user tell pinned-$1 apart from market. */}
      {pricePills.length > 0 && (
        <div className="flex items-center justify-end gap-2 px-5 py-2">
          {pricePills.map((p) => (
            <PricePill
              key={p.symbol}
              symbol={p.symbol}
              usd={p.usd}
              source={p.source}
              block={p.block}
              eventBlock={blockNumber}
            />
          ))}
        </div>
      )}
    </>
  );
}
