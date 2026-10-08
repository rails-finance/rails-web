"use client";

import { ExactTip } from "@/components/shared/amount-text";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatExact } from "@/lib/utils/format";
import { useHeaderValueHideClass, fmtHeaderMagnitude } from "@/lib/shared/header-values";
import { usePublishSpineLegs, WARNING_TONE_TEXT } from "@/components/shared/spine-column";
import { EventTime } from "@/components/shared/event-time";
import { EventNumberPill, useEventHeadChevron } from "@/components/shared/event-number-pill";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { effectiveBorrowAPR, borrowRatesByDebt } from "@/lib/aave-v4/borrow-rate";
import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ExternalActorChip } from "@/components/shared/external-actor-chip";
import { eventLogProv, heldDebtRateProv, externalActorProv } from "@/lib/aave-v4/position-provenance";

/** 1-based position + total within a shared tx_hash. `count > 1` triggers
 * the "X OF Y" group chip on the left of the header. */
export interface AaveV4TxGroup {
  index: number;
  count: number;
}

// USD value lives in the expanded detail (next to the after-balance and as
// a single asset-price pill in the footer), not in the header. Mirrors the
// Liquity V2 card structure — the header stays as "action · amount · icon"
// and the dollar number surfaces alongside the state transition where the
// context (before, after, ratio) explains what the value actually represents.

type OperationStyle = { label: string; color: string; bg: string; badge: boolean };

const STYLES: Record<string, OperationStyle> = {
  supply: { label: "Supply", color: "", bg: "", badge: false },
  withdraw: { label: "Withdraw", color: "", bg: "", badge: false },
  borrow: { label: "Borrow", color: "", bg: "", badge: false },
  repay: { label: "Repay", color: "", bg: "", badge: false },
  liquidation: { label: "Liquidation", color: "text-red-400", bg: "bg-red-500/20", badge: true },
  collateral_toggle: { label: "Collateral Toggle", color: "", bg: "", badge: false },
};

// The emitted log + Solidity field each moved amount is read from — surfaced
// in the receipt's via line so the number ties to the actual on-chain anatomy.
// Field names match the spoke ABI (Repay emits repaidAmount; the premiumDelta
// leg is stored separately and is not part of this figure).
const AMOUNT_FIELD: Record<string, string> = {
  supply: "suppliedAmount",
  withdraw: "withdrawnAmount",
  borrow: "drawnAmount",
  repay: "repaidAmount",
};
const AMOUNT_LOG: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};
// Receipt-bar name clause per event type — short, since it IS the row label.
const AMOUNT_LABEL: Record<string, string> = {
  supply: "Amount supplied",
  withdraw: "Amount withdrawn",
  borrow: "Amount borrowed",
  repay: "Amount repaid",
};

/** Tx/spoke coordinates the amount receipt is stamped with. */
export interface AaveV4AmountCoord {
  spokeName?: string;
  spokeAddress?: string;
  txHash?: string;
  blockNumber?: number;
}

/** The amount receipt for a non-liquidation row, which the header registers.
 *
 *  Note the value is UNSIGNED here, and deliberately so: V4's `ctx.amount` is a
 *  magnitude whose direction is carried by `eventType`, not a signed delta.
 *  Routing it through `chainTruthDeltaValue` — the helper the ChainTruthRow
 *  protocols use — would prepend a sign the header never registers and recreate
 *  the very drift this shared builder exists to prevent. V4 does not use
 *  ChainTruthRow; match the header, not the family. */
export function aaveV4AmountProv(
  ctx: AaveV4Context,
  coord: AaveV4AmountCoord,
): { info: Provenance; value: string; symbol?: string } {
  const amount = parseFloat(ctx.amount ?? "0") || 0;
  const style = STYLES[ctx.eventType] ?? { label: ctx.eventType, color: "", bg: "", badge: false };
  const label = ctx.eventType === "collateral_toggle" ? (ctx.enabled ? "Enable" : "Disable") : style.label;
  return {
    value: formatExact(amount),
    symbol: ctx.reserveSymbol,
    info: eventLogProv(
      AMOUNT_LABEL[ctx.eventType] ?? `Amount ${label.toLowerCase()}`,
      AMOUNT_FIELD[ctx.eventType] ?? style.label,
      { ...coord, asset: ctx.reserveSymbol, raw: ctx.raw?.amount, origin: ctx.origin?.amount },
      AMOUNT_LOG[ctx.eventType],
    ),
  };
}

export interface AaveV4EventHeaderProps {
  ctx: AaveV4Context;
  timestamp: number;
  /** Tx + block of the emitting event — threaded into the amount provenance so
   *  the dock shows the concrete coordinates (copyable tx, block, spoke). */
  txHash?: string;
  blockNumber?: number;
  /** Composite-tx grouping — when count > 1, the "X OF Y" chip renders. */
  txGroup?: AaveV4TxGroup;
  /** 1-based chronological position within the spoke's event list. Stable
   * across asc/desc display order. */
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt (owner / tx sender / spoke caller). */
  externalBy?: string;
}

/** The word T1 states for the row, which the phone spine view's caption
 *  repeats: "Enable Supply" where the supply also enabled the collateral. */
export function aaveV4Label(ctx: AaveV4Context): string {
  const style = STYLES[ctx.eventType] ?? { label: ctx.eventType };
  if (ctx.alsoToggledCollateral) return "Enable Supply";
  return ctx.eventType === "collateral_toggle" ? (ctx.enabled ? "Enable" : "Disable") : style.label;
}

export function AaveV4EventHeader({
  ctx,
  timestamp,
  txHash,
  blockNumber,
  txGroup,
  eventNumber,
  externalBy,
}: AaveV4EventHeaderProps) {
  const style = STYLES[ctx.eventType] ?? { label: ctx.eventType, color: "", bg: "", badge: false };
  const amount = parseFloat(ctx.amount ?? "0") || 0;
  // A third-party action is NOT passive: the spine badges the token flow rather
  // than replacing it (SpineColumn `externalParty`), so the amount hands off to
  // the flank exactly as an owner-acted row's does. See chain-truth-event.tsx.
  const hideVal = useHeaderValueHideClass();
  const { showInterestRates, showTickerLabels } = useTimelineDisplay();
  // The symbol beside each icon, under the Display menu's ticker-label toggle
  // (the same switch the opened card's rows follow).
  const ticker = (sym?: string | null) =>
    showTickerLabels && sym ? <span className="text-xs text-rb-500">{aaveV4DisplaySymbol(sym)}</span> : null;
  // Concrete coordinates for the amount provenance. `asset` is filled per-Prov
  // below (liquidation's two legs concern different reserves).
  const coord = { spokeName: ctx.spokeName, spokeAddress: ctx.spokeAddress, txHash, blockNumber };

  // A liquidation's two legs — the collateral seized, the debt repaid — each
  // with its receipt; the spine draws them as nodes.
  const isLiq = ctx.eventType === "liquidation";
  const seized =
    isLiq && ctx.liquidatedCollateralAmount && ctx.collateralSymbol
      ? {
          n: Number(ctx.liquidatedCollateralAmount),
          symbol: ctx.collateralSymbol,
          info: eventLogProv(
            "Collateral seized in the liquidation",
            "collateralAmountRemoved",
            {
              ...coord,
              asset: ctx.collateralSymbol,
              raw: ctx.raw?.liquidatedCollateralAmount,
              origin: ctx.origin?.liquidatedCollateralAmount,
            },
            "LiquidationCall",
          ),
        }
      : null;
  const repaid =
    isLiq && ctx.debtToCover
      ? {
          n: Number(ctx.debtToCover),
          symbol: ctx.reserveSymbol ?? "???",
          info: eventLogProv(
            "Debt repaid by the liquidation",
            "debtAmountRestored",
            { ...coord, asset: ctx.reserveSymbol, raw: ctx.raw?.amount, origin: ctx.origin?.amount },
            "LiquidationCall",
          ),
        }
      : null;
  usePublishSpineLegs(
    isLiq
      ? [
          ...(seized
            ? [
                {
                  label: "Seized",
                  value: seized.n,
                  symbol: seized.symbol,
                },
              ]
            : []),
          ...(repaid
            ? [
                {
                  label: "Repaid",
                  value: repaid.n,
                  symbol: repaid.symbol,
                },
              ]
            : []),
        ]
      : null,
  );

  // For collateral toggle, show enable/disable
  const label = ctx.eventType === "collateral_toggle" ? (ctx.enabled ? "Enable" : "Disable") : style.label;

  const groupChip =
    txGroup && txGroup.count > 1 ? (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-sunken text-rb-500"
        title={`Operation ${txGroup.index} of ${txGroup.count} in this transaction`}
      >
        {txGroup.index} of {txGroup.count}
      </span>
    ) : null;

  const counter = eventNumber != null ? <EventNumberPill number={eventNumber} /> : null;
  // The card's chevron, after everything the head states (ui-jobs 302).
  const chev = useEventHeadChevron();

  return (
    <div className="pl-5 pt-4 pb-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {groupChip}
        {ctx.alsoToggledCollateral ? (
          <>
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-positive/20 text-positive">
              Enable
            </span>
            <span className="text-sm text-rb-500">Supply</span>
          </>
        ) : isLiq ? (
          // T1 reads the word in the critical red; the spine draws the legs.
          <span className={`text-sm ${WARNING_TONE_TEXT.critical}`} data-adverse-word="">
            {label}
          </span>
        ) : (
          <span className="text-sm text-rb-500">{label}</span>
        )}
        {ctx.eventType === "liquidation" ? (
          // Liquidation header: the two facts that matter, collateral seized
          // and debt repaid, each as value + token icon: "Seized X ◊ Repaid Y ⬡".
          // The verbs are the Aave V3 liquidation run's (lib/aave-v3/timeline-runs.tsx),
          // and neither reuses "cleared", which the card's prose keeps for the debt.
          <>
            {seized && (
              <span className={`inline-flex items-center gap-1.5 text-sm ${hideVal}`}>
                <span className="text-rb-500">Seized</span>
                <span className="font-bold text-foreground">
                  <Prov value={formatExact(seized.n)} symbol={seized.symbol} info={seized.info}>
                    <ExactTip
                      text={fmtHeaderMagnitude(seized.n, seized.symbol)}
                      exact={formatExact(seized.n)}
                      symbol={seized.symbol}
                    />
                  </Prov>
                </span>
                <TokenChipIcon symbol={seized.symbol} size={16} />
                {ticker(seized.symbol)}
              </span>
            )}
            {repaid && (
              <span className={`inline-flex items-center gap-1.5 text-sm ${hideVal}`}>
                <span className="text-rb-500">Repaid</span>
                <span className="font-bold text-foreground">
                  <Prov value={formatExact(repaid.n)} symbol={ctx.reserveSymbol} info={repaid.info}>
                    <ExactTip
                      text={fmtHeaderMagnitude(repaid.n, ctx.reserveSymbol)}
                      exact={formatExact(repaid.n)}
                      symbol={ctx.reserveSymbol ?? undefined}
                    />
                  </Prov>
                </span>
                <TokenChipIcon symbol={repaid.symbol} size={16} />
                {ticker(ctx.reserveSymbol)}
              </span>
            )}
          </>
        ) : (
          <>
            {amount > 0 && (
              // The icon and ticker follow the amount: they hand off with it.
              <span className={`inline-flex items-center gap-1.5 text-sm ${hideVal}`}>
                <span className="font-bold text-foreground">
                  <Prov {...aaveV4AmountProv(ctx, coord)}>
                    <ExactTip
                      text={fmtHeaderMagnitude(amount, ctx.reserveSymbol)}
                      exact={formatExact(amount)}
                      symbol={ctx.reserveSymbol ?? undefined}
                    />
                  </Prov>
                </span>
                <TokenChipIcon symbol={ctx.reserveSymbol ?? "???"} size={16} />
                {ticker(ctx.reserveSymbol)}
              </span>
            )}
            {ctx.eventType === "collateral_toggle" && ctx.reserveSymbol && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <TokenChipIcon symbol={ctx.reserveSymbol} size={16} />
                <span className="">{aaveV4DisplaySymbol(ctx.reserveSymbol)}</span>
              </span>
            )}
            {/* Rate pill only on borrow/repay — there it sits right after the
                moved asset's icon, so the number is unambiguously that asset's
                rate. On supply/withdraw it would float free as a held-debt rate
                with no asset context (the confusing case); the expanded card's
                asset-labelled Borrow Rate rows carry that instead. */}
            {showInterestRates &&
              (ctx.eventType === "borrow" || ctx.eventType === "repay") &&
              effectiveBorrowAPR(ctx) && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-rb-300/60 dark:bg-rb-800/60 ">
                  {/* An echo of the detail's Borrow Rate row (same rate, same
                      rendering) — a locator-pulse target, never its own receipt. */}
                  <Prov
                    echo
                    info={heldDebtRateProv({ ...coord, asset: borrowRatesByDebt(ctx)[0]?.symbol ?? ctx.reserveSymbol })}
                  >
                    {(parseFloat(effectiveBorrowAPR(ctx) ?? "0") * 100).toFixed(2)}%
                  </Prov>
                </span>
              )}
            {externalBy && ctx.owner && ctx.txFrom && ctx.caller && (
              // The acting party in the external-party pink — the receipt traces
              // the tx sender + spoke caller against the owner. THE SAME chip
              // ChainTruthRow renders (it used to be a hand-rolled copy here,
              // which is how the two drifted); V4 keeps its own header, so it
              // supplies the receipt itself rather than going via a row spec.
              <ExternalActorChip
                address={externalBy}
                prov={externalActorProv(
                  { eventType: ctx.eventType, owner: ctx.owner, txFrom: ctx.txFrom, caller: ctx.caller },
                  { ...coord, asset: ctx.reserveSymbol },
                )}
              />
            )}
          </>
        )}
        {chev}
        {/* `evt-meta`: the header's own first row below sm (app/globals.css). */}
        <span className="evt-meta ml-auto inline-flex items-center gap-2">
          {timestamp > 0 && (
            <span className="text-xs ">
              <EventTime ts={timestamp} />
            </span>
          )}
          {counter}
        </span>
      </div>
    </div>
  );
}
