"use client";

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { accrualNoun, type BatchFeeAfter, type LiquityAccrual } from "@/lib/liquity/accrual";
import { fillText, wordsAround, type LiquityEventProse, type LiquityL2 } from "@/lib/liquity/event-prose";
import { FOOTER_WORDS, L2_WORDS } from "@/lib/liquity/event-templates";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { LinkedAddress } from "@/components/shared/linked-address";
import { usePreferences } from "@/lib/shared/preferences-context";
import { GAS_UNITS, type GasUnit } from "@/lib/shared/preferences";
import { formatRatio, ratioLabel, useLiquityRatioColorClass } from "@/lib/shared/ratio-format";
import { Fuel } from "lucide-react";
import {
  TransitionArrow,
  DeltaToggle,
  ClosedLabel,
  StatCard,
  StateTransition,
  StatSubline,
  PriceChipShell,
  changeTone,
} from "@/components/shared/state-transition";
import { fmtDebt, fmtColl, fmtUsdWhole, fmtAccrued, fmtRateNum } from "@/lib/liquity/figure-format";
import type { ReactNode } from "react";
import { Prov, type Provenance, type ProvVerify } from "@/components/shared/provenance";
import { ClosedTokens, ClosedUsd, LedgerCell } from "@/components/shared/event-ledger";
import { ledgerFigure, useLedgerDecimals } from "@/components/shared/event-ledger-context";
import { usdShown } from "@/lib/shared/usd-display";
import { faceUsdProv } from "@/lib/shared/flows-timeline-provenance";
import {
  streamVia,
  eventInputs,
  originSeg,
  scalingOf,
  fieldSumSeg,
  collChangeProv,
  rateAfterProv,
  upfrontFeeProv,
  eventPriceProv,
  TROVE_MANAGER,
  type ChangeProv,
  type FigureProv,
} from "@/lib/liquity/event-provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const tmContractOf = (addr?: string) => ({ name: "TroveManager", address: addr });

// Optional-prov wrapper — pass no prov → plain children (keeps metric bodies
// readable). <Prov> is zero-cost when the inspector is off. `value` threads
// the exact figure into the receipt key so other surfaces can echo it.
const P = ({
  info,
  value,
  icon,
  children,
}: {
  info?: Provenance;
  value?: string;
  icon?: ReactNode;
  children: ReactNode;
}) =>
  info ? (
    <Prov info={info} value={value} icon={icon}>
      {children}
    </Prov>
  ) : icon ? (
    <span className="inline-flex items-center gap-1">
      {children}
      {icon}
    </span>
  ) : (
    <>{children}</>
  );

// ── Formatters ──────────────────────────────────────────────────────

// The grid's formats live in lib/liquity/figure-format.ts, shared with the T3
// explanation so an echoed figure reads the same in both.
const toLocaleStringHelper = fmtDebt;
const formatColl = fmtColl;
const formatUsd = fmtUsdWhole;

// ── Metric components ───────────────────────────────────────────────

function DebtMetric({
  debt,
  isClose,
  accrual,
  accrualProv,
  stablecoinSymbol = "BOLD",
  provBefore,
  provAfter,
  feeProv,
}: {
  /** L2's debt (lib/liquity/event-prose.ts `liquityL2`): the before is the
   *  debt recorded at the previous event, the Debt ledger's before. */
  debt: LiquityL2["debt"];
  isClose: boolean;
  accrual: LiquityAccrual;
  /** Receipt for the accrual's figure. */
  accrualProv?: Provenance;
  stablecoinSymbol?: string;
  provBefore?: Provenance;
  provAfter?: Provenance;
  /** Receipt for the "N fee" sub-line — the TroveOperation log's upfront fee. */
  feeProv?: FigureProv;
}) {
  // One form (ui-jobs 285): before → after, the accrual since the previous
  // event in the ledger, named under the figures; where the accrual is the
  // whole move, "+8,580.12 interest = 667,073.79". `showBefore`: draw the
  // `before →` half (never a bare "0 →" on an open).
  const { before, after, upfrontFee, accrued, accrualMove, accrualShown } = debt;
  const dec = useLedgerDecimals("debt");
  const fd = (n: number) => ledgerFigure(n, dec, toLocaleStringHelper(n));
  const showBefore = isClose ? fd(before) !== fd(after) : before !== 0 && fd(before) !== fd(after);
  const changed = fd(before) !== fd(after);
  const noun = accrualNoun(accrual);
  const moveWords = wordsAround(L2_WORDS.accrual_move, ["accrued_total"], { accrual_noun: noun });

  // The debt's USD at its $1 face, as the cell's ledger counts it.
  const debtUsd = !isClose && after > 0 && usdShown(after);
  const feeWords = wordsAround(L2_WORDS.fee, ["upfront_fee"]);
  const inLedger = accrued && !accrualMove;
  return (
    <LedgerCell label={L2_WORDS.debt} side="debt">
      <div>
        <StateTransition>
          <ClosedTokens>
            {accrualMove ? (
              <span className="inline-flex items-center gap-1" data-debt-accrual-move="">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {moveWords[0]}
                  <P info={accrualProv}>{fmtAccrued(accrualShown)}</P>
                  {moveWords[1]}
                </span>
                <span className="text-sm font-semibold text-rb-500">=</span>
              </span>
            ) : (
              showBefore && <DeltaToggle before={<P info={provBefore}>{fd(before)}</P>} delta={null} />
            )}
            {isClose ? (
              <>
                <ClosedLabel text={L2_WORDS.closed} />
                <TokenChipIcon symbol={stablecoinSymbol} size={16} />
              </>
            ) : (
              <P info={provAfter} icon={<TokenChipIcon symbol={stablecoinSymbol} size={16} />}>
                <span className={`text-sm font-semibold ${changeTone(changed)}`}>{fd(after)}</span>
              </P>
            )}
          </ClosedTokens>
          {debtUsd && (
            <ClosedUsd
              before={
                showBefore && !accrualMove ? (
                  <P info={faceUsdProv(stablecoinSymbol, toLocaleStringHelper(before), "before")}>
                    {formatUsd(before)}
                  </P>
                ) : null
              }
              after={
                <P info={faceUsdProv(stablecoinSymbol, toLocaleStringHelper(after), "after")}>{formatUsd(after)}</P>
              }
            />
          )}
        </StateTransition>
        {(upfrontFee > 0 || inLedger) && (
          <StatSubline changed={changed}>
            {upfrontFee > 0 && (
              <span>
                {feeWords[0]}
                <P info={feeProv?.info} value={feeProv?.value}>
                  {toLocaleStringHelper(upfrontFee)}
                </P>
                {feeWords[1]}
              </span>
            )}
            {upfrontFee > 0 && inLedger && <span> · </span>}
            {inLedger && (
              <span className="text-rb-500" data-debt-accrual-in-ledger="">
                {fillText(L2_WORDS.accrual_in_ledger, { accrual_noun: noun })}
              </span>
            )}
          </StatSubline>
        )}
      </div>
    </LedgerCell>
  );
}

function CollateralMetric({
  collateralType,
  before,
  after,
  beforeInUsd,
  afterInUsd,
  isClose,
  provBefore,
  provAfter,
  usdProvBefore,
  usdProvAfter,
  changeEcho,
}: {
  collateralType: string;
  before: number;
  after: number;
  beforeInUsd: number;
  afterInUsd: number;
  isClose: boolean;
  provBefore?: Provenance;
  provAfter?: Provenance;
  usdProvBefore?: Provenance;
  usdProvAfter?: Provenance;
  changeEcho?: ChangeProv;
}) {
  const showBefore = isClose ? before !== after : before !== 0 && before !== after;
  const changed = before !== after;
  // The opened card states the collateral's USD value at this event's oracle
  // price where that price is known (lib/shared/usd-display.ts).
  // Before → after, both at this event's price, as the cell's ledger totals
  // them (`beforeInUsd`: the collateral before × the price at this block).
  const beforeUsdKnown = showBefore && beforeInUsd > 0 && usdShown(beforeInUsd);
  const afterUsdShown = usdShown(afterInUsd);

  // Same arrow-as-toggle as Debt: `before →` ⟷ `+delta =` (delta in collateral
  // units). Disabled on close, where the "after" is the CLOSED label, not a
  // number to diff against. Echoes the header's change receipt when the parent
  // found them indistinguishable (changeEcho); otherwise derived figure →
  // derived provenance.
  const collDelta = after - before;
  const dec = useLedgerDecimals("collateral");
  const fc = (n: number) => ledgerFigure(n, dec, formatColl(n));
  const collDeltaStr = `${collDelta >= 0 ? "+" : "−"}${fc(Math.abs(collDelta))}`;
  const deltaProv: Provenance = {
    kind: "derived",
    summary: `Collateral (${collateralType}) change at this event — the collateral after minus the collateral before.`,
    via: "after − before",
    formula: "after collateral − before collateral",
  };
  const deltaNode = changeEcho ? (
    <Prov echo info={changeEcho.info} value={changeEcho.value} symbol={changeEcho.symbol}>
      {collDeltaStr}
    </Prov>
  ) : (
    <P info={deltaProv}>{collDeltaStr}</P>
  );

  const afterUsd = !isClose && after > 0 && afterInUsd > 0 && afterUsdShown;
  return (
    <LedgerCell label={L2_WORDS.collateral} side="collateral">
      <StateTransition>
        <ClosedTokens>
          {showBefore && (
            <DeltaToggle before={<P info={provBefore}>{fc(before)}</P>} delta={isClose ? null : deltaNode} />
          )}
          {isClose ? (
            <>
              <ClosedLabel text={L2_WORDS.closed} />
              <TokenChipIcon symbol={collateralType} size={16} />
            </>
          ) : (
            <P info={provAfter} icon={<TokenChipIcon symbol={collateralType} size={16} />}>
              <span className={`text-sm font-semibold ${changeTone(changed)}`}>{after === 0 ? "0" : fc(after)}</span>
            </P>
          )}
        </ClosedTokens>
        {afterUsd && (
          // The USD at this event's price, after a thin divider.
          <ClosedUsd
            before={beforeUsdKnown ? <P info={usdProvBefore}>{formatUsd(beforeInUsd)}</P> : null}
            after={<P info={usdProvAfter}>{formatUsd(afterInUsd)}</P>}
          />
        )}
      </StateTransition>
    </LedgerCell>
  );
}

function InterestRateMetric({
  before,
  after,
  isClose,
  afterDebt,
  stablecoinSymbol = "BOLD",
  provBefore,
  provAfter,
  afterExact,
  batched,
  batchFee,
  batchFeeProv,
}: {
  before: number;
  after: number;
  isClose: boolean;
  afterDebt?: number;
  stablecoinSymbol?: string;
  provBefore?: Provenance;
  provAfter?: Provenance;
  /** The trove is in a batch after this event. */
  batched?: boolean;
  /** The batch's annual management fee after this event, where known. */
  batchFee?: BatchFeeAfter | null;
  batchFeeProv?: Provenance;
  /** Exact after-rate for the receipt key — the header's rate pills echo this
   *  receipt, and their display precision differs (the delegate pill is 2dp),
   *  so the key must not lean on the rendered text. */
  afterExact?: string;
}) {
  const hasBeforeValue = before > 0;
  const hasAfterValue = after > 0;
  const hasChange = hasBeforeValue && before !== after;
  // An open sets the rate from nothing: changed, with no `before →` to draw.
  const changed = before !== after;
  // annualInterestRate is in percent units (3.4 = 3.4% APR), so divide by 100
  // to get the fractional rate for the BOLD/year cost.
  const yearlyCost = afterDebt && hasAfterValue ? afterDebt * (after / 100) : 0;
  const yearlyFee = afterDebt && batchFee ? afterDebt * (batchFee.fee / 100) : 0;
  const yearlyProv = (what: "interest" | "fee", pct: number): Provenance => ({
    kind: "derived",
    summary:
      what === "interest"
        ? `A year's interest on the debt after this event at this rate (${stablecoinSymbol}), before any management fee. Interest accrues simply, per second, on the recorded debt.`
        : `A year's batch management fee on the debt after this event (${stablecoinSymbol}). It accrues the same way as interest, on top of it.`,
    formula: what === "interest" ? "debt after × rate" : "debt after × management fee",
    inputs: [
      {
        label: "debt",
        value: `${toLocaleStringHelper(afterDebt ?? 0)} ${stablecoinSymbol}`,
        kind: "chain",
        note: "after",
      },
      { label: what === "interest" ? "rate" : "management fee", value: `${pct}%`, kind: "chain" },
    ],
  });

  const yearlyWords = wordsAround(L2_WORDS.yearly_interest, ["yearly_interest"], { debt_symbol: stablecoinSymbol });
  const feeWords = wordsAround(L2_WORDS.yearly_fee, ["batch_fee_rate", "yearly_fee"], {
    debt_symbol: stablecoinSymbol,
  });
  return (
    <StatCard label={L2_WORDS.interest_rate}>
      <StateTransition>
        {hasChange && (
          <>
            <P info={provBefore}>
              <span className="text-sm font-semibold">
                {fmtRateNum(before)}
                <span className="ml-0.5">%</span>
              </span>
            </P>
            <TransitionArrow />
          </>
        )}
        {isClose ? (
          <ClosedLabel text={L2_WORDS.closed} />
        ) : !hasAfterValue ? (
          <span className="text-sm font-semibold text-rb-500">{L2_WORDS.not_applicable}</span>
        ) : (
          <P info={provAfter} value={afterExact}>
            <span className={`text-sm font-semibold ${changeTone(changed)}`}>
              {fmtRateNum(after)}
              <span className="ml-0.5">%</span>
            </span>
          </P>
        )}
      </StateTransition>
      {!isClose && yearlyCost > 0.01 && (
        // The yearly cost qualifies the rate, so it takes the rate's tone. A
        // batched trove's debt also carries the batch's management fee: the
        // line says whether the figure includes it, and states the fee.
        <StatSubline changed={changed}>
          {yearlyWords[0]}
          <P info={yearlyProv("interest", after)}>{toLocaleStringHelper(yearlyCost)}</P>
          {yearlyWords[1]}
          {batched && !batchFee ? L2_WORDS.excl_fee : null}
        </StatSubline>
      )}
      {!isClose && batched && batchFee && yearlyFee > 0.01 && (
        <StatSubline changed={changed}>
          {feeWords[0]}
          <P info={batchFeeProv}>{fmtRateNum(batchFee.fee)}%</P>
          {feeWords[1]}
          <P info={yearlyProv("fee", batchFee.fee)}>{toLocaleStringHelper(yearlyFee)}</P>
          {feeWords[2]}
        </StatSubline>
      )}
    </StatCard>
  );
}

function CollateralRatioMetric({
  before,
  after,
  afterDebt,
  isClose,
  collateralType,
  provBefore,
  provAfter,
}: {
  before: number;
  after: number;
  afterDebt: number;
  isClose: boolean;
  collateralType: string;
  provBefore?: Provenance;
  provAfter?: Provenance;
}) {
  const { prefs } = usePreferences();
  const mode = prefs.ratioMode;
  const crColor = useLiquityRatioColorClass();
  const hasChange = before !== 0 && before !== after;
  const changed = before !== after;

  // Delta in the displayed mode's own units (percentage points). CR is linear
  // so the delta is just after − before; LTV is 1/CR, so we diff the converted
  // values (`10000/cr`) rather than the raw CR. Disabled on close and when the
  // after side is N/A (debt fully repaid → no meaningful ratio to diff).
  const beforeDisp = mode === "ltv" ? 10000 / before : before;
  const afterDisp = mode === "ltv" ? 10000 / after : after;
  const ratioDelta = afterDisp - beforeDisp;
  const ratioDeltaStr = `${ratioDelta >= 0 ? "+" : "−"}${Math.abs(ratioDelta).toFixed(2)}%`;
  const ratioCanToggle = !isClose && afterDebt !== 0 && isFinite(afterDisp);
  const deltaProv: Provenance = {
    kind: "derived",
    summary: `${ratioLabel(mode)} change at this event, in percentage points — the ratio after minus the ratio before.`,
    via: "after − before",
    formula: mode === "ltv" ? "(10000 ÷ after) − (10000 ÷ before)" : "after − before",
  };

  return (
    <StatCard label={ratioLabel(mode)}>
      <StateTransition>
        {hasChange && (
          <DeltaToggle
            before={<P info={provBefore}>{formatRatio(before, mode, 2)}</P>}
            delta={ratioCanToggle ? <P info={deltaProv}>{ratioDeltaStr}</P> : null}
          />
        )}
        {isClose ? (
          <ClosedLabel text={L2_WORDS.closed} />
        ) : afterDebt === 0 ? (
          <span className="text-sm font-semibold text-rb-500">{L2_WORDS.not_applicable}</span>
        ) : (
          <P info={provAfter}>
            <span
              className={
                changed
                  ? `text-sm font-semibold ${crColor(after, collateralType)}`
                  : "text-sm font-semibold text-rb-500"
              }
            >
              {formatRatio(after, mode, 2)}
            </span>
          </P>
        )}
      </StateTransition>
    </StatCard>
  );
}

/** The gas the owner paid: a fuel-pump icon and one figure, in USD or ETH. A
 *  press switches the unit, kept in the preferences so every card follows
 *  (ui-jobs 289). A cost with no USD figure reads in ETH. */
export function LiquityGas({ footer }: { footer: LiquityEventProse["footer"] }) {
  const { prefs, update } = usePreferences();
  const cost = footer.gasCost;
  if (!cost) return null;
  const units = GAS_UNITS.filter((u) => u !== "usd" || cost.usd > 0);
  const unit: GasUnit = units.includes(prefs.gasUnit) ? prefs.gasUnit : units[0];
  const next = units[(units.indexOf(unit) + 1) % units.length];
  const figure = (u: GasUnit) =>
    u === "usd"
      ? cost.usd < 0.01
        ? "< $0.01"
        : `$${cost.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${cost.eth < 0.001 ? cost.eth.toFixed(6) : cost.eth.toFixed(4)} ETH`;
  const unitWord = (u: GasUnit) => (u === "usd" ? FOOTER_WORDS.gas_unit_usd : FOOTER_WORDS.gas_unit_eth);
  const gasLine =
    footer.gasRun != null
      ? fillText(FOOTER_WORDS.gas_run, { run_count: footer.gasRun, gas: figure(unit) })
      : fillText(FOOTER_WORDS.gas, { gas: figure(unit) });
  const label =
    units.length > 1
      ? fillText(FOOTER_WORDS.gas_press, { gas_line: gasLine, unit: unitWord(unit), next_unit: unitWord(next) })
      : gasLine;
  return (
    <button
      type="button"
      className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md text-xs tabular-nums text-rb-500 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-blue-500"
      aria-label={label}
      title={label}
      data-gas=""
      data-gas-unit={unit}
      onClick={(e) => {
        e.stopPropagation();
        update({ gasUnit: next });
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Fuel size={14} aria-hidden className="shrink-0" />
      <span>{figure(unit)}</span>
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────

export interface LiquityEventDetailProps {
  ctx: LiquityContext;
  txHash: string;
  /** Block of the emitting event — threaded into the after-state provenance so
   *  the dock shows the concrete coordinates behind each decoded value. */
  blockNumber?: number;
  previousEvent?: BaseActivityEvent;
  currentEvent?: BaseActivityEvent;
  /** Live oracle price for this collateral — drives the "today" leg of the
   * redemption P/L shown alongside the historic price pill. */
  currentPrice?: number;
  /** The generator's levels (lib/liquity/event-prose.ts): the grid's figures. */
  prose: LiquityEventProse;
}

export function LiquityEventDetail({
  ctx,
  txHash,
  blockNumber,
  previousEvent,
  currentEvent,
  prose,
}: LiquityEventDetailProps) {
  const { stateBefore, stateAfter, troveOperation, liquidation } = ctx;
  const l2 = prose.L2;

  if (!stateBefore || !stateAfter || !l2) {
    return null;
  }
  const { accrual, batchFee } = l2;

  // The grid's figures: before rebuilt where the event logs only the after,
  // the ratio before at this event's price (lib/liquity/event-prose.ts `liquityL2`).
  const { isClose, isLiquidation, isRedemption, rateOnly: isBatchManagerOp, showGrid } = l2;
  const collPrice = l2.price;
  const beforeDebt = l2.debt.before;
  const beforeColl = l2.coll.before;
  const beforeInterestRate = l2.rate.before;
  const beforeCollRatio = l2.cr.before;
  const afterCollInUsd = l2.coll.afterUsd;
  const beforeCollAtEventUsd = l2.coll.beforeUsd;
  const afterCollRatio = l2.cr.after;

  // ── Provenance ──────────────────────────────────────────────────────────────
  // The AFTER value is what this event records; the BEFORE value is the trove's
  // prior state — carried from the PREVIOUS transaction for a normal adjust, or
  // RECONSTRUCTED for events that only report the post-change state (redemption /
  // liquidation / close). So before and after get distinct provenance.
  const tm = TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()];
  const tmContract = tmContractOf(tm);
  const collSym = ctx.collateralType;
  const debtSym = ctx.assetType ?? "BOLD";
  // Carries the concrete tx / block coordinates into the after-state provenance.
  const coords = { txHash, blockNumber };
  // Emitted log fields carry a real third-party proof: the tx's own event logs.
  // Point the spine's verify at Etherscan (a link-out, never a live read on our
  // side) instead of the generic "rolls up" default the context asset triggers.
  const txVerify: ProvVerify | undefined = txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;
  // The per-event price is the on-chain oracle value at THIS event's block: the
  // indexer reads the Chainlink feeds + LST canonical rates at the event block
  // (getOraclePricesAtBlock) and applies Liquity's own MIN/MAX-of-market-vs-
  // canonical math (calculateLiquityV2Prices). Every leaf is on-chain, so the
  // price — and the USD / ratio derived from it — is chain-derived, not an
  // off-chain quote. (On the live-chain source lane collPrice is 0, so these
  // gate out rather than assert an unpriced figure.)
  const priceInput =
    collPrice > 0
      ? [
          {
            label: "price",
            value: formatUsd(collPrice),
            kind: "chain-derived" as const,
            pclass: "oracle" as const,
            note: "on-chain oracle @ event block",
          },
        ]
      : [];
  const opCollChange = troveOperation ? Math.abs(troveOperation.collChangeFromOperation) : 0;
  const opDebtChange = troveOperation ? Math.abs(troveOperation.debtChangeFromOperation) : 0;
  const isCloseRecon = isClose && !!troveOperation && stateBefore.debt === 0 && stateBefore.coll === 0;

  // The collateral's delta toggle's `after − before` figure usually IS the
  // header's change figure — they part only when a redistribution share
  // wedges between them. When they agree to display precision (4dp), the
  // delta ECHOES the header's change receipt so the locator pulse reaches it;
  // else it keeps its derived after − before receipt. The Debt cell has
  // no toggle (ui-jobs 285).
  const collCp = collChangeProv(ctx, coords);
  const collDeltaEcho =
    collCp && Math.abs(Math.abs(l2.coll.after - beforeColl) - Math.abs(collCp.change)) < 0.00005 ? collCp : undefined;

  const collAfterProv: Provenance = {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify,
    summary: `Collateral (${collSym}) held by the trove after this event — every time a trove changes, the TroveManager contract writes the trove's full ${collSym} balance into its log. This is that balance as it stood after this event.`,
    contract: tmContract,
    via: `${streamVia()} · ${originSeg(stateAfter.origin?.coll, {
      event: "TroveUpdated",
      param: "_coll",
      scale: 18,
      raw: stateAfter.raw?.coll,
    })}`,
    scaling: scalingOf(stateAfter.origin?.coll, { scale: 18, raw: stateAfter.raw?.coll }, { token: collSym }),
    inputs: eventInputs({ ...coords, asset: collSym }),
  };
  // A batched trove's debt is NOT one emitted field: it is shares/total × the
  // batch's recorded debt. The backend's origin{} says so by omission (an
  // envelope section with no debt entry); pre-envelope responses fall back to
  // the batch-shares signal. Either way the receipt drops the fake _debt claim.
  const batchedDebt = stateAfter.origin ? !stateAfter.origin.debt : stateAfter.batchDebtShares != null;
  // Same omission signal one event back: stateBefore.origin arrives only when
  // the MV knows the PREVIOUS event's batchedness (was_batched, mig 083) — an
  // origin section with no debt entry means the previous state was batched and
  // its debt share-derived. No origin at all (first event / pre-083 response)
  // keeps the plain-TroveUpdated fallback.
  const batchedDebtBefore = stateBefore.origin != null && !stateBefore.origin.debt;
  const debtAfterProv: Provenance = batchedDebt
    ? {
        kind: "chain-derived",
        pclass: "indexed",
        verify: txVerify,
        summary: `Trove debt (${debtSym}) after this event — this trove is in a delegate's batch, so the contract logs the trove's share of the batch and the batch's total debt. The trove's debt is that share of the total, including interest and any upfront fee.`,
        contract: tmContract,
        via: `${streamVia()} · BatchedTroveUpdated + BatchUpdated logs · _batchDebtShares ∕ total shares × batch debt · ÷10^18`,
        inputs: eventInputs({ ...coords, asset: debtSym }),
      }
    : {
        kind: "chain",
        pclass: "emitted",
        verify: txVerify,
        summary: `Trove debt (${debtSym}) after this event — every time a trove changes, the TroveManager contract writes the trove's full debt into its log. This is that figure after this event, including the interest built up since the last change and any upfront fee.`,
        contract: tmContract,
        via: `${streamVia()} · ${originSeg(stateAfter.origin?.debt, {
          event: "TroveUpdated",
          param: "_debt",
          scale: 18,
          raw: stateAfter.raw?.debt,
        })}`,
        scaling: scalingOf(stateAfter.origin?.debt, { scale: 18, raw: stateAfter.raw?.debt }, { token: debtSym }),
        inputs: eventInputs({ ...coords, asset: debtSym }),
      };
  // The after-rate, upfront-fee and historic-price receipts come from the
  // shared builders (event-provenance.ts): the header's rate pills echo the
  // rate receipt, so the identity must be built in one place.
  const rateP = rateAfterProv(ctx, coords);
  const feeP = upfrontFeeProv(ctx, coords);
  const priceP = eventPriceProv(ctx, coords);
  const collBeforeProv: Provenance =
    isRedemption && troveOperation
      ? {
          kind: "derived",
          summary:
            "Collateral before this redemption — the collateral left after the redemption plus the collateral redeemed.",
          formula: "collateral after + collateral redeemed",
          inputs: [
            {
              label: "collateral after",
              value: `${formatColl(stateAfter.coll)} ${collSym}`,
              kind: "chain",
              note: "this event",
            },
            {
              label: "collateral redeemed",
              value: `${formatColl(opCollChange)} ${collSym}`,
              kind: "chain",
              note: "operation Δ",
            },
          ],
        }
      : isLiquidation && liquidation
        ? {
            kind: "derived",
            summary:
              "Collateral before liquidation — the sum of where the liquidation sent it: the Stability Pool, other troves, the surplus the owner can claim, and the liquidator's gas compensation.",
            formula: "collSentToSP + collRedistributed + collSurplus + collGasComp",
            contract: tmContract,
            via: "Liquidation event",
          }
        : isCloseRecon
          ? {
              kind: "derived",
              summary:
                "Collateral before close — closing returns all of a trove's collateral, so this is the amount the close moved.",
              formula: "|operation collateral change|",
              contract: tmContract,
              via: "TroveOperation log",
            }
          : {
              kind: "chain",
              summary: `Collateral (${collSym}) before this event — the balance the contract logged at the trove's previous change.`,
              contract: tmContract,
              via: `${streamVia()} · ${originSeg(
                stateBefore.origin?.coll,
                { event: "TroveUpdated", param: "_coll", scale: 18, raw: stateBefore.raw?.coll },
                true,
              )}`,
              scaling: scalingOf(
                stateBefore.origin?.coll,
                { scale: 18, raw: stateBefore.raw?.coll },
                { token: collSym },
              ),
              inputs: [{ label: "asset", value: collSym, kind: "chain" }],
            };
  // The debt before is the one the trove's previous event recorded (L2,
  // ui-jobs 285); a redemption, a liquidation and a close log only the after,
  // so it is the after less this event's move, the accrual included.
  const debtBeforeProv: Provenance =
    (isRedemption && troveOperation) || (isLiquidation && liquidation) || isCloseRecon
      ? {
          kind: "derived",
          summary: `Debt (${debtSym}) before this event — the debt the trove's previous event recorded. This event logs only the debt after, so it is that less this event's move: the operation, any upfront fee and the ${accrualNoun(accrual)} accrued since the previous event.`,
          formula: "debt after − operation − upfront fee − accrual since the previous event",
          inputs: [
            {
              label: "debt after",
              value: `${toLocaleStringHelper(l2.debt.after)} ${debtSym}`,
              kind: "chain",
              note: "this event",
            },
            {
              label: "operation",
              value: `${toLocaleStringHelper(opDebtChange)} ${debtSym}`,
              kind: "chain",
              note: "operation Δ",
            },
            {
              label: "accrual",
              value: `${fmtAccrued(accrual.total)} ${debtSym}`,
              kind: accrual.source === "rate" ? "derived" : "chain",
              note: "since the previous event",
            },
          ],
        }
      : batchedDebtBefore
        ? {
            kind: "chain-derived",
            pclass: "indexed",
            summary: `Debt (${debtSym}) before this event — the trove's share of its delegate batch's total debt, as the contract logged it at the trove's previous change.`,
            contract: tmContract,
            via: `${streamVia()} · previous BatchedTroveUpdated + BatchUpdated logs · _batchDebtShares ∕ total shares × batch debt · ÷10^18`,
            inputs: [{ label: "asset", value: debtSym, kind: "chain" }],
          }
        : {
            kind: "chain",
            summary: `Debt (${debtSym}) before this event — the debt the contract logged at the trove's previous change.`,
            contract: tmContract,
            via: `${streamVia()} · ${originSeg(
              stateBefore.origin?.debt,
              { event: "TroveUpdated", param: "_debt", scale: 18, raw: stateBefore.raw?.debt },
              true,
            )}`,
            scaling: scalingOf(stateBefore.origin?.debt, { scale: 18, raw: stateBefore.raw?.debt }, { token: debtSym }),
            inputs: [{ label: "asset", value: debtSym, kind: "chain" }],
          };
  const rateBeforeProv: Provenance = {
    kind: "chain",
    summary: `Annual interest rate before this event — the rate the contract logged for the trove at its previous change.`,
    contract: tmContract,
    // A batched previous state's envelope names the batch's BatchUpdated —
    // the rate a batched trove actually accrues at.
    via: `${streamVia()} · ${originSeg(
      stateBefore.origin?.annualInterestRate,
      { event: "TroveUpdated", param: "_annualInterestRate", scale: 16, raw: stateBefore.raw?.annualInterestRate },
      true,
    )}`,
    scaling: scalingOf(
      stateBefore.origin?.annualInterestRate,
      { scale: 16, raw: stateBefore.raw?.annualInterestRate },
      "rate",
    ),
  };
  const usdAfterProv: Provenance | undefined =
    collPrice > 0
      ? {
          kind: "chain-derived",
          summary: `Collateral value (after) in USD — the collateral after this event, multiplied by Liquity's price for ${collSym} at this block.`,
          formula: "collateral × price",
          inputs: [
            {
              label: "collateral",
              value: `${toLocaleStringHelper(stateAfter.coll)} ${collSym}`,
              kind: "chain",
              note: "after",
            },
            ...priceInput,
          ],
        }
      : undefined;
  const usdBeforeProv: Provenance | undefined =
    collPrice > 0
      ? {
          kind: "chain-derived",
          summary: `Collateral value (before) in USD — the collateral before this event, multiplied by Liquity's price for ${collSym} at this block.`,
          formula: "collateral × price",
          inputs: [
            {
              label: "collateral",
              value: `${toLocaleStringHelper(beforeColl)} ${collSym}`,
              kind: "chain",
              note: "before",
            },
            ...priceInput,
          ],
        }
      : undefined;
  const crAfterProv: Provenance = {
    kind: "chain-derived",
    summary:
      "Collateral ratio after this event — the collateral's dollar value divided by the debt, at Liquity's price for this block.",
    formula: "collateral × price ÷ debt × 100",
    inputs: [
      {
        label: "collateral",
        value: `${toLocaleStringHelper(stateAfter.coll)} ${collSym}`,
        kind: "chain",
        note: "after",
      },
      ...priceInput,
      { label: "debt", value: `${toLocaleStringHelper(stateAfter.debt)} ${debtSym}`, kind: "chain", note: "after" },
    ],
  };
  const crBeforeProv: Provenance = {
    kind: "chain-derived",
    summary:
      "Collateral ratio before this event — the collateral's dollar value divided by the debt before this event, both at Liquity's price for this event's block, so the change from before to after is the event's alone.",
    formula: "collateral × price ÷ debt × 100",
    inputs: [
      { label: "collateral", value: `${toLocaleStringHelper(beforeColl)} ${collSym}`, kind: "chain", note: "before" },
      ...priceInput,
      { label: "debt", value: `${toLocaleStringHelper(beforeDebt)} ${debtSym}`, kind: "chain", note: "before" },
    ],
  };
  const accrualProv: Provenance =
    accrual.source === "ledger"
      ? {
          kind: "derived",
          summary: `${accrual.batched ? "Interest and batch management fee" : "Interest"} since the previous event — what the debt accrued, as the debt ledger states it: the rest of the debt's move once the operation, any upfront fee and any redistributed debt are taken out${accrual.batched ? ", split by the batch's rate and fee" : ""}.`,
          formula: "debt after − debt before − operation − upfront fee − redistributed debt",
          inputs: [
            { label: "interest", value: `${fmtAccrued(accrual.interest)} ${debtSym}`, kind: "chain" },
            ...(accrual.fee > 0
              ? [{ label: "management fee", value: `${fmtAccrued(accrual.fee)} ${debtSym}`, kind: "chain" as const }]
              : []),
          ],
        }
      : accrual.source === "logs"
        ? {
            kind: "derived",
            summary: `${accrual.batched ? "Interest and batch management fee" : "Interest"} since the previous event — what the debt accrued: the rest of the debt's move once the operation, any upfront fee and any redistributed debt are taken out.`,
            formula: "debt after − debt before − operation − upfront fee − redistributed debt",
            inputs: eventInputs(coords),
          }
        : {
            kind: "derived",
            summary: `${accrual.batched ? "Interest and batch management fee" : "Interest"} since the previous event — worked from the recorded debt and rate: Liquity accrues it simply, per second, over a 365-day year.`,
            formula: "recorded debt × (rate + fee) × seconds ÷ 31,536,000",
          };
  const batchFeeProv: Provenance | undefined = batchFee
    ? batchFee.source === "log"
      ? {
          kind: "chain",
          pclass: "emitted",
          verify: txVerify,
          summary:
            "The batch's annual management fee — charged on top of the interest rate on every trove in the batch, set by its batch manager.",
          contract: tmContract,
          via: `${streamVia()} · BatchUpdated log · _annualManagementFee · ÷10^16`,
          inputs: eventInputs(coords),
        }
      : {
          kind: "derived",
          summary:
            "The batch's annual management fee — charged on top of the interest rate on every trove in the batch. Carried from the batch's last BatchUpdated log, as the debt ledger reads it.",
          formula: "rate in force (rate + fee) − rate",
          via: `${streamVia()} · previous BatchUpdated log · _annualManagementFee · ÷10^16`,
        }
    : undefined;
  const addrProv: Provenance = {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify,
    summary: "Redeemer — the wallet that made the redemption.",
    contract: tmContract,
    via: `${streamVia()} · redemption event`,
    inputs: eventInputs(coords),
  };

  return (
    <>
      {/* 2×2 State Grid — rails-web pattern */}
      {showGrid && (
        <div className="px-5 py-2">
          {isBatchManagerOp ? (
            <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-2">
              <InterestRateMetric
                before={beforeInterestRate}
                after={stateAfter.annualInterestRate}
                isClose={false}
                afterDebt={stateAfter.debt}
                stablecoinSymbol={ctx.assetType}
                provBefore={rateBeforeProv}
                provAfter={rateP?.info}
                afterExact={rateP?.value}
                batched={ctx.isInBatch}
                batchFee={batchFee}
                batchFeeProv={batchFeeProv}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-flow-row-dense sm:auto-rows-fr sm:grid-cols-2 sm:has-[[data-ledger-span]]:auto-rows-auto">
              <CollateralMetric
                collateralType={ctx.collateralType}
                before={beforeColl}
                after={l2.coll.after}
                beforeInUsd={beforeCollAtEventUsd}
                afterInUsd={afterCollInUsd}
                isClose={isClose}
                provBefore={collBeforeProv}
                provAfter={collAfterProv}
                usdProvBefore={usdBeforeProv}
                usdProvAfter={usdAfterProv}
                changeEcho={collDeltaEcho}
              />
              <DebtMetric
                debt={l2.debt}
                isClose={isClose}
                accrual={accrual}
                accrualProv={accrualProv}
                stablecoinSymbol={ctx.assetType}
                provBefore={debtBeforeProv}
                provAfter={debtAfterProv}
                feeProv={feeP}
              />
              <CollateralRatioMetric
                before={beforeCollRatio}
                after={afterCollRatio}
                afterDebt={stateAfter.debt}
                isClose={isClose}
                collateralType={ctx.collateralType}
                provBefore={crBeforeProv}
                provAfter={crAfterProv}
              />
              <InterestRateMetric
                before={beforeInterestRate}
                after={stateAfter.annualInterestRate}
                isClose={isClose}
                afterDebt={stateAfter.debt}
                stablecoinSymbol={ctx.assetType}
                provBefore={rateBeforeProv}
                provAfter={rateP?.info}
                afterExact={rateP?.value}
                batched={ctx.isInBatch}
                batchFee={batchFee}
                batchFeeProv={batchFeeProv}
              />
            </div>
          )}
        </div>
      )}

      {/* Redemption counterparty — claimable + P/L now live inline in the
          header; only the redeemer link remains here (when present). The
          redemption-wide totals and fee detail live in the explainer. */}
      {isRedemption && ctx.redeemer && (
        <div className="px-5 py-2">
          <span className="text-xs text-rb-500">
            {L2_WORDS.redeemed_by}{" "}
            <Prov info={addrProv}>
              <LinkedAddress address={ctx.redeemer} />
            </Prov>
          </span>
        </div>
      )}

      {/* Liquidation breakdown intentionally lives only in the event footnote
          (explainer) now — the per-line detail (debt cleared, collateral
          liquidated, claimable surplus, SP/liquidator splits) is generated
          there by generateLiquidateItems, so it no longer appears in the
          details body. */}

      {/* The price row: the gas the owner paid, the redemption P/L (net
          outcome), the historic collateral price. P/L
          reconciles with the Cleared / Reduced figures in the header: debt
          cleared minus the value of collateral given up, at the
          redemption-time price and (when available) at today's price.
          (Batch membership is conveyed by the "Delegate" treatment on
          interest-rate events, so no standalone "Batched" badge here.) */}
      {collPrice > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2" data-price-row="">
          <LiquityGas footer={prose.footer} />
          {l2.redemption &&
            (() => {
              // P/L reconciles with the header's Cleared / Reduced: debt cleared
              // less the collateral given up, at the redemption's price and,
              // where it reads differently, at today's.
              const { claimable, showPl, plHistoric, plToday } = l2.redemption;
              const plStr = (n: number) => `${n >= 0 ? "+" : "−"}${formatUsd(Math.abs(n))}`;
              const plColor = (n: number) => (n >= 0 ? "text-green-400" : "text-red-400");
              if (claimable == null && !showPl) return null;
              return (
                <div className="inline-flex items-center gap-4 flex-wrap text-xs">
                  {claimable != null && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-bold text-foreground">{claimable.toFixed(4)}</span>
                      <TokenChipIcon symbol={ctx.collateralType} size={14} />
                      <span className="font-semibold text-green-600 dark:text-green-400">{L2_WORDS.claimable}</span>
                    </span>
                  )}
                  {showPl && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-rb-500">{L2_WORDS.pl}</span>
                      <span className={`font-bold ${plColor(plHistoric)}`}>{plStr(plHistoric)}</span>
                      {plToday != null && (
                        <>
                          <span className="text-rb-500">{L2_WORDS.or}</span>
                          <span className={`font-bold ${plColor(plToday)}`}>{plStr(plToday)}</span>
                          <span className="text-rb-500">{L2_WORDS.today}</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })()}
          <PriceChipShell bare title={`${ctx.collateralType} price at the time of this event`}>
            <P info={priceP?.info} value={priceP?.value} icon={<TokenChipIcon symbol={ctx.collateralType} size={14} />}>
              {formatUsd(collPrice)}
            </P>
          </PriceChipShell>
        </div>
      )}
    </>
  );
}
