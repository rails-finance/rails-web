"use client";

import { formatExact } from "@/lib/utils/format";
import { ExactTip } from "@/components/shared/amount-text";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { EventTime } from "@/components/shared/event-time";
import { EventNumberPill, useEventHeadChevron } from "@/components/shared/event-number-pill";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { getBatchManagerName } from "@/lib/liquity/batch-managers";
import { liquityL1Label } from "@/lib/liquity/event-prose";
import { L1_WORDS } from "@/lib/liquity/event-templates";
import { useHeaderValueHideClass, fmtHeaderMagnitude } from "@/lib/shared/header-values";
import { WARNING_TONE_TEXT } from "@/components/shared/spine-column";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { useSurplusClaimFor } from "@/components/protocol/liquity-family/coll-surplus-context";
import { formatDate } from "@/lib/date";
import { formatTimestamp, shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  liquityRedistOnAdjust,
  redistArrivalProv,
} from "@/lib/liquity/event-provenance";
// The rate pills live in the shared module now (the two Liquity forks render the
// identical pill through the chain-state row's rate-pill seam). Re-export
// UsersGlyph — the V2 trove page imports it from HERE (page.tsx), and that
// import should not churn.
import { UsersGlyph, RatePill, DelegateRatePill } from "@/components/shared/rate-pill";
export { UsersGlyph };

type OperationStyle = { label: string; color: string; bg: string; badge: boolean };

// The label is the generator's (lib/liquity/event-prose.ts `liquityL1Label`,
// words from content/liquity-v2/event-prose.yaml), so the Copy for LLM line and the
// exports print the header's word; this decides only how it looks.
function getOperationStyle(operation: string, ctx: LiquityContext): OperationStyle {
  const label = liquityL1Label(ctx);
  switch (operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      // Soft-tint pill matching the Aave V4 "Enable" header badge — the two
      // "you opened a position" actions now share one visual grammar, on the
      // semantic `positive` token (color-grammar.md §5: the Open/active green).
      return { label, color: "text-positive", bg: "bg-positive/20", badge: true };
    case "closeTrove":
      return { label, color: "", bg: "bg-rb-500/20 dark:bg-rb-500/20", badge: true };
    case "liquidate":
      return { label, color: "text-foreground", bg: "bg-rb-200 dark:bg-rb-800", badge: true };
    case "applyPendingDebt":
      return { label, color: "text-pink-700 dark:text-pink-400", bg: "bg-pink-500/20", badge: true };
    case "redeemCollateral":
      // A change to the Trove the owner did not make: caution (color-grammar.md §5).
      return { label, color: "text-white", bg: "bg-caution-500", badge: true };
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return { label, color: "text-foreground", bg: "bg-rb-200 dark:bg-rb-800", badge: true };
    default:
      return { label, color: "", bg: "", badge: false };
  }
}

/** The event's kind as the header names it ("Withdraw + Repay", "Redemption").
 *  The phone spine view's caption uses it. */
export function liquityOperationLabel(ctx: LiquityContext): string {
  return liquityL1Label(ctx);
}

// Actor role (owner / redeemer / liquidator / batch_manager) is still threaded
// through ctx.actorRole — the bars provider and other downstream logic depend
// on it — but the trove view no longer renders a pill for it; the row's
// operation badge already conveys whether the wallet is acting on its own
// position or a third-party one.

export interface LiquityEventHeaderProps {
  ctx: LiquityContext;
  timestamp: number;
  protocolId?: string;
  /** Tx + block of the emitting event — threaded into the collateral / debt
   *  provenance so the dock shows the concrete coordinates (copyable tx, block)
   *  behind each moved amount. */
  txHash?: string;
  blockNumber?: number;
  /** 1-based chronological position of this event in the trove timeline.
   * Stable regardless of asc/desc display order — event #1 is always the
   * trove's openTrove. */
  eventNumber?: number;
  /** The event page's card (rails-ops TO-DO-ui-jobs 236): the time slot
   *  states the date, the time and the number whatever the Display menu
   *  says. */
  page?: boolean;
  /** The event page's title (ui-jobs 286): the words and amounts alone, large,
   *  in an h1; the page-mode header then shows the word and the time slot. */
  title?: boolean;
}

/** The event page's time slot: the date, the time and the number. */
function PageMeta({ timestamp, counter }: { timestamp: number; counter: ReactNode }) {
  const time = formatTimestamp(timestamp);
  return (
    <span className="inline-flex items-center gap-2" data-event-page-meta="">
      <span className="text-xs">
        {shortDate(timestamp)} {shortDateYear(timestamp)}
      </span>
      <span className="text-xs text-rb-500" title={`${formatDate(timestamp)} ${time} UTC`}>
        {time}
      </span>
      {counter}
    </span>
  );
}

export function LiquityEventHeader({
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  page,
  title,
}: LiquityEventHeaderProps) {
  const surplusClaim = useSurplusClaimFor(ctx.operation === "liquidate" ? txHash : undefined);
  // The card's chevron, after everything the head states (ui-jobs 302); none on the
  // event page and in the page's title.
  const chev = useEventHeadChevron();
  const style = getOperationStyle(ctx.operation, ctx);
  const { stateBefore, stateAfter, troveOperation } = ctx;

  const groupChip = ctx.blockGrouping?.isGrouped ? (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-sunken text-rb-500"
      title={`This trove had ${ctx.blockGrouping.sameBlockCount} events in the same block; this is event ${ctx.blockGrouping.sameBlockIndex} of ${ctx.blockGrouping.sameBlockCount}, in the order the block recorded them`}
    >
      {ctx.blockGrouping.sameBlockIndex} of {ctx.blockGrouping.sameBlockCount}
    </span>
  ) : null;

  const counter = eventNumber != null ? <EventNumberPill number={eventNumber} /> : null;

  if (!stateAfter || !stateBefore) {
    if (title) {
      return (
        <h1 className="text-2xl font-normal leading-tight text-rb-500" data-event-page-title="">
          {style.label}
        </h1>
      );
    }
    return (
      <div className="flex items-center gap-2">
        {style.badge ? (
          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${style.bg} ${style.color}`}>
            {style.label}
          </span>
        ) : (
          <span className={`text-sm font-medium ${style.color || "text-rb-500"}`}>{style.label}</span>
        )}
        {chev}
        <span className="ml-auto inline-flex items-center gap-2">
          {groupChip}
          {page ? (
            <PageMeta timestamp={timestamp} counter={counter} />
          ) : (
            <>
              <span className="text-xs ">
                {new Date(timestamp * 1000).toLocaleDateString("en-GB", { timeZone: "UTC" })}
              </span>
              {counter}
            </>
          )}
        </span>
      </div>
    );
  }

  // The change receipts are built by the shared builders (event-provenance.ts)
  // so the spine flanking value and the detail's delta toggle can echo into the
  // SAME receipt — one identity, every rendering pulses together.
  const coords = { txHash, blockNumber };
  const collCp = collChangeProv(ctx, coords);
  const debtCp = debtChangeProv(ctx, coords);
  // The rate pills echo the detail grid's after-rate receipt (same builder).
  const rateP = rateAfterProv(ctx, coords);
  const debtChange = debtCp?.change ?? 0;
  const collChange = collCp?.change ?? 0;
  const redist = liquityRedistOnAdjust(ctx);
  const redistDebtCp = redist && redist.debt >= 0.01 ? redistArrivalProv(ctx, "debt", coords) : undefined;
  const redistCollCp = redist && redist.coll > 1e-9 ? redistArrivalProv(ctx, "coll", coords) : undefined;

  const hasDebtChange = Math.abs(debtChange) >= 0.01;
  const hasCollChange = Math.abs(collChange) >= 0.01;
  // The event page has no spine to carry the values, so its title states them.
  // A pending-debt row's spine draws no flank, so its figure stays.
  const spineHide = useHeaderValueHideClass();
  const hideVal = page || title || ctx.operation === "applyPendingDebt" ? "" : spineHide;
  // The title's sizes; the header's otherwise.
  const TXT = title ? "text-2xl" : "text-sm";
  const GAP = title ? "gap-2.5" : "gap-1.5";
  const AMT = title ? "font-normal text-foreground" : "font-bold text-foreground";
  const ICON = title ? 40 : 16;
  const PILL = title ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";

  // ── Provenance threading (zero-cost when the inspector is off) ──────────────
  // Chain deltas point at the branch TroveManager (via the shared builders
  // above).
  const collSym = ctx.collateralType ?? "collateral";
  const debtSym = ctx.assetType ?? "BOLD";
  // The header renders the compact form; the exact figure — every decimal
  // the pipeline delivered, no re-rounding — rides the trace. The ≥sm
  // spine hand-off (hideVal) lands on the Prov wrapper itself: hiding a
  // CHILD would leave the pill box painting an empty lozenge when the
  // receipt opens with timeline values on.
  const wrapColl = (node: ReactNode) =>
    collCp ? (
      <Prov value={collCp.value} symbol={collCp.symbol} info={collCp.info} className={hideVal || undefined}>
        {node}
      </Prov>
    ) : hideVal ? (
      <span className={hideVal}>{node}</span>
    ) : (
      <>{node}</>
    );
  const wrapDebt = (node: ReactNode) =>
    debtCp ? (
      <Prov value={debtCp.value} symbol={debtCp.symbol} info={debtCp.info} className={hideVal || undefined}>
        {node}
      </Prov>
    ) : hideVal ? (
      <span className={hideVal}>{node}</span>
    ) : (
      <>{node}</>
    );
  // An icon follows its amount: it hides with the amount's spine hand-off.
  const icon = (symbol: string) =>
    hideVal ? (
      <span className={`inline-flex items-center ${hideVal}`}>
        <TokenChipIcon symbol={symbol} size={ICON} />
      </span>
    ) : (
      <TokenChipIcon symbol={symbol} size={ICON} />
    );
  const cluster = (
    <>
      {ctx.operation === "setBatchManagerAnnualInterestRate" && stateAfter ? (
        <>
          <span className={`${TXT} text-rb-500`}>{style.label}</span>
          <DelegateRatePill rate={stateAfter.annualInterestRate} prov={rateP} />
          {ctx.batchManager && (
            <span className={`${TXT} font-bold text-pink-500`}>{getBatchManagerName(ctx.batchManager)}</span>
          )}
          {/* The debt's move since the trove's previous event: interest, the
            management fee and any upfront fee, split in the explanation.
            The spine carries no value on a rate change, so the figure
            stays at every width (no hideVal). */}
          {hasDebtChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT}`}>
              <span className="text-rb-500">{L1_WORDS.debt}</span>
              {debtCp ? (
                <Prov value={debtCp.value} symbol={debtCp.symbol} info={debtCp.info}>
                  <span className={AMT}>
                    <ExactTip
                      text={`${debtChange > 0 ? "+" : "−"}${fmtHeaderMagnitude(Math.abs(debtChange), debtSym)}`}
                      exact={formatExact(Math.abs(debtChange))}
                      symbol={debtSym}
                    />
                  </span>
                </Prov>
              ) : null}
              <TokenChipIcon symbol={debtSym} size={ICON} />
            </span>
          )}
        </>
      ) : ctx.operation === "setInterestBatchManager" ? (
        <>
          <span className={`${TXT} text-rb-500`}>{style.label}</span>
          {stateAfter.annualInterestRate > 0 && <DelegateRatePill rate={stateAfter.annualInterestRate} prov={rateP} />}
          {ctx.batchManager && (
            <span className={`${TXT} font-bold text-pink-500`}>{getBatchManagerName(ctx.batchManager)}</span>
          )}
        </>
      ) : ctx.operation === "openTrove" || ctx.operation === "openTroveAndJoinBatch" ? (
        <>
          <span className={`inline-block ${PILL} rounded-full font-bold ${style.bg} ${style.color}`}>
            {style.label}
          </span>
          {hasCollChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT}`}>
              <span className="text-rb-500">{L1_WORDS.supply}</span>
              {wrapColl(
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(Math.abs(collChange), ctx.collateralType)}
                    exact={formatExact(Math.abs(collChange))}
                    symbol={ctx.collateralType}
                  />
                </span>,
              )}
              {icon(ctx.collateralType)}
            </span>
          )}
          {hasDebtChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT}`}>
              <span className="text-rb-500">{L1_WORDS.borrow}</span>
              {wrapDebt(
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(Math.abs(debtChange), ctx.assetType ?? "BOLD")}
                    exact={formatExact(Math.abs(debtChange))}
                    symbol={ctx.assetType ?? "BOLD"}
                  />
                </span>,
              )}
              {icon(ctx.assetType ?? "BOLD")}
            </span>
          )}
          {stateAfter.annualInterestRate > 0 &&
            (ctx.operation === "openTroveAndJoinBatch" ? (
              <DelegateRatePill rate={stateAfter.annualInterestRate} prov={rateP} />
            ) : (
              <RatePill rate={stateAfter.annualInterestRate} prov={rateP} />
            ))}
        </>
      ) : ctx.operation === "redeemCollateral" ? (
        // T1 reads the word in the caution tone; the spine draws the legs as
        // two nodes. With Timeline values off, or below sm with no spine, the
        // legs follow the word with their labels — the debt it cleared, then
        // the collateral it reduced — since the head has no arrows.
        <>
          <span className={`${TXT} ${WARNING_TONE_TEXT.caution}`} data-adverse-word="">
            {style.label}
          </span>
          {hasDebtChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT} ${hideVal}`}>
              <span className="text-rb-500">{L1_WORDS.cleared}</span>
              {wrapDebt(
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(Math.abs(debtChange), ctx.assetType ?? "BOLD")}
                    exact={formatExact(Math.abs(debtChange))}
                    symbol={ctx.assetType ?? "BOLD"}
                  />
                </span>,
              )}
              {icon(ctx.assetType ?? "BOLD")}
            </span>
          )}
          {hasCollChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT} ${hideVal}`}>
              <span className="text-rb-500">{L1_WORDS.reduced}</span>
              {wrapColl(
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(Math.abs(collChange), ctx.collateralType)}
                    exact={formatExact(Math.abs(collChange))}
                    symbol={ctx.collateralType}
                  />
                </span>,
              )}
              {icon(ctx.collateralType)}
            </span>
          )}
        </>
      ) : ctx.operation === "liquidate" ? (
        // The redemption's shape in the critical red: the word, then (values
        // off, or below sm) the collateral liquidated and the debt cleared.
        <>
          <span className={`${TXT} ${WARNING_TONE_TEXT.critical}`} data-adverse-word="">
            {style.label}
          </span>
          {hasCollChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT} ${hideVal}`}>
              <span className="text-rb-500">{L1_WORDS.liquidated}</span>
              {wrapColl(
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(Math.abs(collChange), ctx.collateralType)}
                    exact={formatExact(Math.abs(collChange))}
                    symbol={ctx.collateralType}
                  />
                </span>,
              )}
              {icon(ctx.collateralType)}
            </span>
          )}
          {hasDebtChange && (
            <span className={`inline-flex items-center ${GAP} ${TXT} ${hideVal}`}>
              <span className="text-rb-500">{L1_WORDS.cleared}</span>
              {wrapDebt(
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(Math.abs(debtChange), ctx.assetType ?? "BOLD")}
                    exact={formatExact(Math.abs(debtChange))}
                    symbol={ctx.assetType ?? "BOLD"}
                  />
                </span>,
              )}
              {icon(ctx.assetType ?? "BOLD")}
            </span>
          )}
        </>
      ) : style.badge ? (
        <>
          <span
            className={`inline-block ${PILL} rounded-full font-bold uppercase tracking-wide ${style.bg} ${style.color}`}
          >
            {style.label}
          </span>
        </>
      ) : style.label.includes(" + ") ? (
        // Combined action: "Withdraw + Repay" etc — show with values and token icons
        <>
          {(() => {
            const [collAction, debtAction] = style.label.split(" + ");
            return (
              <span className={`inline-flex items-center ${GAP} ${TXT}`}>
                <span className="text-rb-500">{collAction}</span>
                {hasCollChange &&
                  wrapColl(
                    <span className={AMT}>
                      <ExactTip
                        text={fmtHeaderMagnitude(Math.abs(collChange), ctx.collateralType)}
                        exact={formatExact(Math.abs(collChange))}
                        symbol={ctx.collateralType}
                      />
                    </span>,
                  )}
                {icon(ctx.collateralType)}
                <span className="text-rb-500">{debtAction}</span>
                {hasDebtChange &&
                  wrapDebt(
                    <span className={AMT}>
                      <ExactTip
                        text={fmtHeaderMagnitude(Math.abs(debtChange), ctx.assetType ?? "BOLD")}
                        exact={formatExact(Math.abs(debtChange))}
                        symbol={ctx.assetType ?? "BOLD"}
                      />
                    </span>,
                  )}
                {icon(ctx.assetType ?? "BOLD")}
              </span>
            );
          })()}
        </>
      ) : (
        <>
          <span className={`${TXT} text-rb-500`}>{style.label}</span>
        </>
      )}

      {/* Debt change (skip for open trove, redemption, liquidation, delegate, and combined — shown inline or n/a).
        Also skip rate changes: a rate adjustment moves no principal — the only thing that makes
        `hasDebtChange` true is the fee-inclusive upfront fee, which rides the detail's "incl. … fee"
        line, not the header. The header keeps just the label and the new-rate pill. A batch manager's
        rate update labels its debt move in its own branch above. */}
      {hasDebtChange &&
        !style.label.includes(" + ") &&
        ctx.operation !== "openTrove" &&
        ctx.operation !== "openTroveAndJoinBatch" &&
        ctx.operation !== "redeemCollateral" &&
        ctx.operation !== "liquidate" &&
        ctx.operation !== "adjustTroveInterestRate" &&
        ctx.operation !== "setBatchManagerAnnualInterestRate" &&
        ctx.operation !== "setInterestBatchManager" && (
          <span className={`inline-flex items-center ${GAP} ${TXT} ${hideVal}`}>
            {wrapDebt(
              <span className={AMT}>
                <ExactTip
                  text={fmtHeaderMagnitude(Math.abs(debtChange), ctx.assetType ?? "BOLD")}
                  exact={formatExact(Math.abs(debtChange))}
                  symbol={ctx.assetType ?? "BOLD"}
                />
              </span>,
            )}
            {icon(ctx.assetType ?? "BOLD")}
          </span>
        )}

      {/* Collateral change (skip for open trove, redemption, liquidation, delegate, combined, and rate change) */}
      {hasCollChange &&
        !style.label.includes(" + ") &&
        ctx.operation !== "openTrove" &&
        ctx.operation !== "openTroveAndJoinBatch" &&
        ctx.operation !== "redeemCollateral" &&
        ctx.operation !== "liquidate" &&
        ctx.operation !== "adjustTroveInterestRate" &&
        ctx.operation !== "setBatchManagerAnnualInterestRate" &&
        ctx.operation !== "setInterestBatchManager" && (
          <span className={`inline-flex items-center ${GAP} ${TXT} ${hideVal}`}>
            {wrapColl(
              <span className={AMT}>
                <ExactTip
                  text={fmtHeaderMagnitude(Math.abs(collChange), ctx.collateralType)}
                  exact={formatExact(Math.abs(collChange))}
                  symbol={ctx.collateralType}
                />
              </span>,
            )}
            {icon(ctx.collateralType)}
          </span>
        )}

      {/* A liquidated neighbour's redistribution this adjust applied: its own
        part of the row in the caution tone, so inherited debt never reads
        as part of a repayment or a borrow. No token moved for it. */}
      {redist && (
        <span className={`inline-flex items-center ${GAP} ${TXT}`}>
          <span className="text-caution-600 dark:text-caution-400">{L1_WORDS.from_liquidation}</span>
          {redistDebtCp && (
            <>
              <Prov value={redistDebtCp.value} symbol={redistDebtCp.symbol} info={redistDebtCp.info}>
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(redistDebtCp.change, ctx.assetType ?? "BOLD")}
                    exact={redistDebtCp.value}
                    symbol={ctx.assetType ?? "BOLD"}
                  />
                </span>
              </Prov>
              <TokenChipIcon symbol={ctx.assetType ?? "BOLD"} size={ICON} />
            </>
          )}
          {redistDebtCp && redistCollCp && (
            <span className="text-caution-600 dark:text-caution-400">{L1_WORDS.and}</span>
          )}
          {redistCollCp && (
            <>
              <Prov value={redistCollCp.value} symbol={redistCollCp.symbol} info={redistCollCp.info}>
                <span className={AMT}>
                  <ExactTip
                    text={fmtHeaderMagnitude(redistCollCp.change, ctx.collateralType)}
                    exact={redistCollCp.value}
                    symbol={ctx.collateralType}
                  />
                </span>
              </Prov>
              <TokenChipIcon symbol={ctx.collateralType} size={ICON} />
            </>
          )}
        </span>
      )}

      {/* Claimable collateral surplus — on a liquidation where the trove's
        collateral value exceeded its debt, the remainder is returned to
        the owner and remains claimable. Mirrors the prod liquidation
        header (and the redemption "claimable" treatment in the detail). */}
      {ctx.operation === "liquidate" &&
        ctx.liquidation &&
        ctx.liquidation.collSurplus > 0 &&
        (surplusClaim ? (
          // Claimed since (the head read): the pill keeps what the
          // liquidation left claimable, muted, and says when it was claimed.
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-rb-500/15 text-rb-500"
            title="Claimable at the liquidation; the owner has since claimed it"
          >
            <span>{ctx.liquidation.collSurplus.toFixed(4)}</span>
            <TokenChipIcon symbol={ctx.collateralType} size={16} />
            {L1_WORDS.claimed}
            {surplusClaim.timestamp != null && <> {formatDate(surplusClaim.timestamp)}</>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
            <span>{ctx.liquidation.collSurplus.toFixed(4)}</span>
            <TokenChipIcon symbol={ctx.collateralType} size={16} />
            {L1_WORDS.claimable}
          </span>
        ))}

      {/* Interest rate — single pill. The label already says it's a rate,
        so no second "% APR" is needed in the trailing cluster below. */}
      {(ctx.operation === "adjustTroveInterestRate" || ctx.operation === "removeFromBatch") &&
        stateAfter.annualInterestRate > 0 && <RatePill rate={stateAfter.annualInterestRate} prov={rateP} />}

      {chev}
    </>
  );
  // `evt-meta`: the header's first row below sm (app/globals.css). Its 24px
  // line puts the icon, date, time and number on the card chevron's centre
  // line, and its direct children sit on one middle (ui-jobs 289).
  const meta = (
    <span className="evt-meta ml-auto inline-flex min-h-6 items-center gap-2">
      {ctx.operation === "redeemCollateral" && ctx.isZombieTrove && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold rounded bg-caution-500/15 text-caution-600 dark:text-caution-400"
          title={
            stateAfter.debt === 0
              ? "Zombie trove fully redeemed — debt cleared, collateral now claimable"
              : "Zombie trove — debt below the minimum, redeemable until restored"
          }
        >
          <AlertTriangle className="w-3 h-3" />
          <span className="hidden md:inline">{L1_WORDS.zombie}</span>
        </span>
      )}
      {groupChip}
      {page ? (
        <PageMeta timestamp={timestamp} counter={counter} />
      ) : (
        <>
          {timestamp > 0 && (
            <span className="text-xs [&>*]:align-middle">
              <EventTime ts={timestamp} />
            </span>
          )}
          {counter}
        </>
      )}
    </span>
  );

  // The event page's title (ui-jobs 286): the header's words and amounts,
  // large, as the side column's h1.
  if (title) {
    return (
      <h1
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl font-normal leading-tight"
        data-event-page-title=""
      >
        {cluster}
      </h1>
    );
  }

  // On the event page the amounts sit in the title; the header keeps the word.
  if (page) {
    return (
      <div className="pl-5 pt-4 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap" data-event-page-header="">
          {style.badge ? (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${style.bg} ${style.color}`}
            >
              {style.label}
            </span>
          ) : (
            <span className="text-sm text-rb-500">{style.label}</span>
          )}
          {meta}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pl-5 pt-4 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* The collateral ratio stands in the opened card's grid (ui-jobs 290). */}
          {cluster}
          {meta}
        </div>
      </div>
    </>
  );
}
