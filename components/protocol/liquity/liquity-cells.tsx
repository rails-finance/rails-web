"use client";

// Liquity V2's T2 (ui-jobs 309 step 4): the card's `cells` slot, typed, and
// its `notes` (the redeemer line). The shell draws the grid
// (components/shared/event-cells.tsx). The figures are the generator's
// (lib/liquity/event-prose.ts `liquityL2`); the receipts are built here.

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { accrualNoun } from "@/lib/liquity/accrual";
import { fillText, wordsAround, type LiquityEventProse } from "@/lib/liquity/event-prose";
import { L2_WORDS } from "@/lib/liquity/event-templates";
import { LinkedAddress } from "@/components/shared/linked-address";
import { usePreferences } from "@/lib/shared/preferences-context";
import { formatRatio, ratioLabel, useLiquityRatioColorClass } from "@/lib/shared/ratio-format";
import { fmtDebt, fmtColl, fmtUsdWhole, fmtAccrued, fmtRateNum } from "@/lib/liquity/figure-format";
import { Prov, type Provenance, type ProvVerify } from "@/components/shared/provenance";
import { usdAt } from "@/components/shared/event-ledger";
import { usdShown } from "@/lib/shared/usd-display";
import { faceUsdProv } from "@/lib/shared/flows-timeline-provenance";
import type { EventCells, EventCellSpec, EventFigure } from "@/components/shared/event-cells";
import {
  streamVia,
  eventInputs,
  originSeg,
  scalingOf,
  collChangeProv,
  rateAfterProv,
  upfrontFeeProv,
  TROVE_MANAGER,
} from "@/lib/liquity/event-provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const tmContractOf = (addr?: string) => ({ name: "TroveManager", address: addr });

// The grid's formats live in lib/liquity/figure-format.ts, shared with the T3
// explanation so an echoed figure reads the same in both.
const toLocaleStringHelper = fmtDebt;
const formatColl = fmtColl;
const formatUsd = fmtUsdWhole;

/** A figure with its receipt, where it has one. */
// Optional-prov wrapper — pass no prov → plain children. `value` threads the
// exact figure into the receipt key so other surfaces can echo it.
const P = ({ info, value, children }: { info?: Provenance; value?: string; children: React.ReactNode }) =>
  info ? (
    <Prov info={info} value={value}>
      {children}
    </Prov>
  ) : (
    <>{children}</>
  );

const fig = (text: EventFigure["text"], info?: Provenance, value?: string, n?: number): EventFigure => ({
  text,
  info,
  value,
  n,
});

/** A rate as the cells write it: "4.12" and a spaced "%". */
const rateText = (r: number) => (
  <>
    {fmtRateNum(r)}
    <span className="ml-0.5">%</span>
  </>
);

/** T2's cells, or why the event has none. */
export function useLiquityCells({
  ctx,
  txHash,
  blockNumber,
  prose,
}: {
  ctx: LiquityContext;
  txHash: string;
  /** Block of the emitting event — threaded into the after-state provenance so
   *  the dock shows the concrete coordinates behind each decoded value. */
  blockNumber?: number;
  prose: LiquityEventProse;
}): EventCells {
  const { prefs } = usePreferences();
  const crColor = useLiquityRatioColorClass();
  const { stateBefore, stateAfter, troveOperation, liquidation } = ctx;
  const l2 = prose.L2;

  if (!stateBefore || !stateAfter || !l2) return { none: "the event carries no Trove state" };
  if (!l2.showGrid) return { none: "the event moves no figure of the Trove" };
  const { accrual, batchFee } = l2;

  // The grid's figures: before rebuilt where the event logs only the after,
  // the ratio before at this event's price (lib/liquity/event-prose.ts `liquityL2`).
  const { isClose, isLiquidation, isRedemption, rateOnly: isBatchManagerOp } = l2;
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
  // Emitted log fields carry a real third-party proof: the tx's event logs.
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
  // (getOraclePricesAtBlock) and applies Liquity's MIN/MAX-of-market-vs-
  // canonical math (calculateLiquityV2Prices). Every leaf is on-chain, so the
  // price — and the USD / ratio derived from it — is chain-derived. (On the
  // live-chain source lane collPrice is 0, so these
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
    // the rate a batched trove accrues at.
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

  // ── Interest rate ──
  const rateAfter = stateAfter.annualInterestRate;
  const rateCell = (closeRow: boolean): EventCellSpec => {
    const yearlyCost = stateAfter.debt && rateAfter > 0 ? stateAfter.debt * (rateAfter / 100) : 0;
    const yearlyFee = stateAfter.debt && batchFee ? stateAfter.debt * (batchFee.fee / 100) : 0;
    const yearlyProv = (what: "interest" | "fee", pct: number): Provenance => ({
      kind: "derived",
      summary:
        what === "interest"
          ? `A year's interest on the debt after this event at this rate (${debtSym}), before any management fee. Interest accrues simply, per second, on the recorded debt.`
          : `A year's batch management fee on the debt after this event (${debtSym}). It accrues the same way as interest, on top of it.`,
      formula: what === "interest" ? "debt after × rate" : "debt after × management fee",
      inputs: [
        {
          label: "debt",
          value: `${toLocaleStringHelper(stateAfter.debt)} ${debtSym}`,
          kind: "chain",
          note: "after",
        },
        { label: what === "interest" ? "rate" : "management fee", value: `${pct}%`, kind: "chain" },
      ],
    });
    const yearlyWords = wordsAround(L2_WORDS.yearly_interest, ["yearly_interest"], { debt_symbol: debtSym });
    const feeWords = wordsAround(L2_WORDS.yearly_fee, ["batch_fee_rate", "yearly_fee"], { debt_symbol: debtSym });
    // An open sets the rate from nothing: changed, with no `before →` to draw.
    const changed = beforeInterestRate !== rateAfter;
    const batched = ctx.isInBatch;
    return {
      kind: "stat",
      key: "rate",
      label: L2_WORDS.interest_rate,
      changed,
      value: {
        before:
          beforeInterestRate > 0 && beforeInterestRate !== rateAfter
            ? fig(rateText(beforeInterestRate), rateBeforeProv)
            : undefined,
        ...(closeRow
          ? { closed: L2_WORDS.closed }
          : rateAfter > 0
            ? { after: fig(rateText(rateAfter), rateP?.info, rateP?.value) }
            : { none: L2_WORDS.not_applicable }),
      },
      // The yearly cost qualifies the rate, so it takes the rate's tone. A
      // batched trove's debt also carries the batch's management fee: the
      // line says whether the figure includes it, and states the fee.
      sub: closeRow
        ? undefined
        : [
            ...(yearlyCost > 0.01
              ? [
                  {
                    changed,
                    content: (
                      <>
                        {yearlyWords[0]}
                        <Prov info={yearlyProv("interest", rateAfter)}>{toLocaleStringHelper(yearlyCost)}</Prov>
                        {yearlyWords[1]}
                        {batched && !batchFee ? L2_WORDS.excl_fee : null}
                      </>
                    ),
                  },
                ]
              : []),
            ...(batched && batchFee && yearlyFee > 0.01
              ? [
                  {
                    changed,
                    content: (
                      <>
                        {feeWords[0]}
                        {batchFeeProv ? (
                          <Prov info={batchFeeProv}>{fmtRateNum(batchFee.fee)}%</Prov>
                        ) : (
                          <>{fmtRateNum(batchFee.fee)}%</>
                        )}
                        {feeWords[1]}
                        <Prov info={yearlyProv("fee", batchFee.fee)}>{toLocaleStringHelper(yearlyFee)}</Prov>
                        {feeWords[2]}
                      </>
                    ),
                  },
                ]
              : []),
          ],
    };
  };
  if (isBatchManagerOp) return [rateCell(false)];

  // ── Collateral ──
  const collAfter = l2.coll.after;
  const collChanged = beforeColl !== collAfter;
  const collShowBefore = isClose ? beforeColl !== collAfter : beforeColl !== 0 && beforeColl !== collAfter;
  const collDelta = collAfter - beforeColl;
  const collDeltaProv: Provenance = {
    kind: "derived",
    summary: `Collateral (${collSym}) change at this event — the collateral after minus the collateral before.`,
    via: "after − before",
    formula: "after collateral − before collateral",
  };
  // The opened card states the collateral's USD value at this event's oracle
  // price where that price is known (lib/shared/usd-display.ts), before →
  // after, both at this event's price, as the cell's ledger totals them.
  const collUsdOn = !isClose && collAfter > 0 && afterCollInUsd > 0 && usdShown(afterCollInUsd);
  const collateral: EventCellSpec = {
    kind: "ledger",
    side: "collateral",
    key: "collateral",
    label: L2_WORDS.collateral,
    changed: collChanged,
    value: {
      before: collShowBefore ? fig(formatColl(beforeColl), collBeforeProv, undefined, beforeColl) : undefined,
      // The arrow toggles to the change, echoing the header's change receipt
      // where the two agree; disabled on a close.
      delta:
        collShowBefore && !isClose
          ? {
              text: formatColl(Math.abs(collDelta)),
              n: Math.abs(collDelta),
              sign: collDelta >= 0 ? "+" : "−",
              ...(collDeltaEcho
                ? { info: collDeltaEcho.info, value: collDeltaEcho.value, echo: { symbol: collDeltaEcho.symbol } }
                : { info: collDeltaProv }),
            }
          : undefined,
      ...(isClose
        ? { closed: L2_WORDS.closed }
        : { after: fig(collAfter === 0 ? "0" : formatColl(collAfter), collAfterProv, undefined, collAfter) }),
      icon: ctx.collateralType,
    },
    usd: collUsdOn
      ? {
          before:
            collShowBefore && beforeCollAtEventUsd > 0 && usdShown(beforeCollAtEventUsd) ? (
              <P info={usdBeforeProv}>{formatUsd(beforeCollAtEventUsd)}</P>
            ) : null,
          after: <P info={usdAfterProv}>{formatUsd(afterCollInUsd)}</P>,
          ...usdAt({
            price: afterCollInUsd / collAfter,
            symbol: ctx.collateralType,
            before: beforeColl,
            after: collAfter,
          }),
        }
      : undefined,
  };

  // ── Debt ──
  // One form (ui-jobs 285): before → after, the accrual since the previous
  // event in the ledger, named under the figures; where the accrual is the
  // whole move, "+8,580.12 interest = 667,073.79".
  const { after: debtAfter, upfrontFee, accrued, accrualMove, accrualShown } = l2.debt;
  const debtChanged = toLocaleStringHelper(beforeDebt) !== toLocaleStringHelper(debtAfter);
  const debtShowBefore = isClose ? debtChanged : beforeDebt !== 0 && debtChanged;
  const noun = accrualNoun(accrual);
  const moveWords = wordsAround(L2_WORDS.accrual_move, ["accrued_total"], { accrual_noun: noun });
  const feeWords = wordsAround(L2_WORDS.fee, ["upfront_fee"]);
  const inLedger = accrued && !accrualMove;
  // The debt's USD at its $1 face, as the cell's ledger counts it.
  const debtUsdOn = !isClose && debtAfter > 0 && usdShown(debtAfter);
  const debt: EventCellSpec = {
    kind: "ledger",
    side: "debt",
    key: "debt",
    label: L2_WORDS.debt,
    changed: debtChanged,
    value: {
      lead: accrualMove ? (
        <>
          {moveWords[0]}
          <P info={accrualProv}>{fmtAccrued(accrualShown)}</P>
          {moveWords[1]}
        </>
      ) : undefined,
      before:
        !accrualMove && debtShowBefore
          ? fig(toLocaleStringHelper(beforeDebt), debtBeforeProv, undefined, beforeDebt)
          : undefined,
      ...(isClose
        ? { closed: L2_WORDS.closed }
        : { after: fig(toLocaleStringHelper(debtAfter), debtAfterProv, undefined, debtAfter) }),
      icon: debtSym,
    },
    usd: debtUsdOn
      ? {
          before:
            debtShowBefore && !accrualMove ? (
              <P info={faceUsdProv(debtSym, toLocaleStringHelper(beforeDebt), "before")}>{formatUsd(beforeDebt)}</P>
            ) : null,
          after: <P info={faceUsdProv(debtSym, toLocaleStringHelper(debtAfter), "after")}>{formatUsd(debtAfter)}</P>,
          price: `At its $1 face, $1 per ${debtSym}`,
        }
      : undefined,
    sub:
      upfrontFee > 0 || inLedger
        ? [
            {
              changed: debtChanged,
              content: (
                <>
                  {upfrontFee > 0 && (
                    <span>
                      {feeWords[0]}
                      <P info={feeP?.info} value={feeP?.value}>
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
                </>
              ),
            },
          ]
        : undefined,
  };

  // ── Collateral ratio, both sides at this event's price ──
  // In the displayed mode's units (percentage points): CR is linear, so its
  // delta is after − before; LTV is 1/CR, so the converted values are diffed.
  const mode = prefs.ratioMode;
  const crChanged = beforeCollRatio !== afterCollRatio;
  const beforeDisp = mode === "ltv" ? 10000 / beforeCollRatio : beforeCollRatio;
  const afterDisp = mode === "ltv" ? 10000 / afterCollRatio : afterCollRatio;
  const ratioDelta = afterDisp - beforeDisp;
  const ratioCanToggle = !isClose && stateAfter.debt !== 0 && isFinite(afterDisp);
  const ratioDeltaProv: Provenance = {
    kind: "derived",
    summary: `${ratioLabel(mode)} change at this event, in percentage points — the ratio after minus the ratio before.`,
    via: "after − before",
    formula: mode === "ltv" ? "(10000 ÷ after) − (10000 ÷ before)" : "after − before",
  };
  const ratio: EventCellSpec = {
    kind: "stat",
    key: "ratio",
    label: ratioLabel(mode),
    changed: crChanged,
    inputs: ["collateral", "debt"],
    value: {
      before: beforeCollRatio !== 0 && crChanged ? fig(formatRatio(beforeCollRatio, mode, 2), crBeforeProv) : undefined,
      delta:
        beforeCollRatio !== 0 && crChanged && ratioCanToggle
          ? fig(`${ratioDelta >= 0 ? "+" : "−"}${Math.abs(ratioDelta).toFixed(2)}%`, ratioDeltaProv)
          : undefined,
      ...(isClose
        ? { closed: L2_WORDS.closed }
        : stateAfter.debt === 0
          ? { none: L2_WORDS.not_applicable }
          : {
              after: fig(formatRatio(afterCollRatio, mode, 2), crAfterProv),
              afterClass: crChanged ? crColor(afterCollRatio, ctx.collateralType) : undefined,
            }),
    },
  };

  return [collateral, debt, ratio, rateCell(isClose)];
}

/** The redemption's redeemer, under the grid. */
export function LiquityRedeemerNote({
  ctx,
  txHash,
  blockNumber,
}: {
  ctx: LiquityContext;
  txHash: string;
  blockNumber?: number;
}) {
  if (ctx.operation !== "redeemCollateral" || !ctx.redeemer) return null;
  const coords = { txHash, blockNumber };
  const addrProv: Provenance = {
    kind: "chain",
    pclass: "emitted",
    verify: txHash
      ? {
          kind: "etherscan",
          href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", txHash),
          text: "Confirm in the tx event logs",
        }
      : undefined,
    summary: "Redeemer — the wallet that made the redemption.",
    contract: tmContractOf(TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()]),
    via: `${streamVia()} · redemption event`,
    inputs: eventInputs(coords),
  };
  return (
    <div className="px-5 py-2">
      <span className="text-xs text-rb-500">
        {L2_WORDS.redeemed_by}{" "}
        <Prov info={addrProv}>
          <LinkedAddress address={ctx.redeemer} />
        </Prov>
      </span>
    </div>
  );
}
