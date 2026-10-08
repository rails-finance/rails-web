"use client";

// Plain-language, data-driven explanation of an Aave V3 position — the V3
// analogue of aave-v4-position-explanation, built from the chain-state
// response (getUserAccountData @ T + per-asset balances) plus the card's own
// stat captions and activity meta: composition, loan-to-value against the
// borrow cap, the liquidation-threshold basis, the health factor, the drop to
// liquidation, the accrued interest, the borrow rate, remaining borrowing
// power, and the transaction count. Rendered inside the position card's
// Explanation heading-button (the V4/trove grammar) — the page passes it via
// the card's `explanation` prop.
//
// Form and emphasis follow the explanation-copy charter (charter §4: one
// subject-first colon-terminated lead over one bullet per fact; §3 highlight
// rule: bold only chrome-mirrored figures, and every chrome figure appears
// bold somewhere here — reverse-completeness).

import type { AaveV3CountNote } from "@/lib/aave-v3/event-neighbours";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { aaveV3LiquidationRead, type AaveV3CardCaptions } from "@/lib/aave-v3/chain-truth-tower";
import { fmtUsd, fmtLiqPrice } from "@/lib/aave-v4/format";
import { formatUsd } from "@/lib/shared/format-event";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";
import { aaveV3SameAsset } from "@/lib/aave-v3/same-asset";
import type { AaveV3LastBorrowRate } from "@/lib/aave-v3/last-borrow-rate";

/** Oxford-join asset symbols ("wstETH, WBTC and USDC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length === 0) return "";
  if (syms.length === 1) return syms[0];
  if (syms.length === 2) return `${syms[0]} and ${syms[1]}`;
  return `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
}

/** " since 12 Sep 2026", or nothing without a date. */
const sinceWords = (since: number | null | undefined): string => (since != null ? ` since ${formatDate(since)}` : "");

export function AaveV3PositionExplanation({
  chain,
  captions,
  view,
  externalActivity,
  marketName,
  countNote,
  lastBorrowRate,
}: {
  /** The live Pool read. Null until it lands (or when it came back stale):
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: AaveV3PositionChainResponse | null;
  /** The card's stat captions (accrued interest, borrow rate) — the same
   *  computed values the stat footnotes show. Omit to skip those bullets. */
  captions?: AaveV3CardCaptions | null;
  /** The card view — supplies the transaction count (the card's count badge)
   *  and the single-asset liquidation-price anchor. Omit to skip. */
  view?: AaveV3PositionView | null;
  /** Who executed the position's events, reduced over its whole history. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullet. */
  externalActivity?: ExternalActorSummary;
  /** The Ethereum market's name (Core, Prime, EtherFi): the pane says what a
   *  market is. Omitted on the single-Pool deployments. */
  marketName?: string;
  /** Why the timeline lists more events than the count (aaveV3CountSentence). */
  countNote?: AaveV3CountNote | null;
  /** The rate the Pool logged at the newest borrow of the reserve owed now
   *  (lib/aave-v3/last-borrow-rate). Omit to skip the rate-move bullet. */
  lastBorrowRate?: AaveV3LastBorrowRate | null;
}) {
  const brand = v3Brand(v3Protocol(useV3Pool()));
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  // No live read (in flight, failed or stale): the pane still says what the
  // card shows, so a borrowing position never opens on an empty pane.
  if (!chain) {
    if (!view || view.borrows.length === 0) return null;
    return (
      <ProseExplainer
        paragraph={
          <>
            This position borrows {joinSymbols(view.borrows.map((r) => r.symbol))}
            {view.supplies.length > 0 ? <> against {joinSymbols(view.supplies.map((r) => r.symbol))}</> : null}. The
            health factor and the figures built on it come from the Pool&rsquo;s live read, which has not answered.
          </>
        }
      />
    );
  }
  const hasDebt = chain.totalDebtUsd > 0;
  const supplySyms = chain.reserves.filter((r) => r.supplyBalanceRaw !== "0").map((r) => r.symbol);
  const collateralSyms = chain.reserves
    .filter((r) => r.isCollateral && r.supplyBalanceRaw !== "0")
    .map((r) => r.symbol);
  const debtSyms = chain.reserves.filter((r) => r.debtBalanceRaw !== "0").map((r) => r.symbol);

  // "blended" only where several collateral assets are averaged.
  const blended = collateralSyms.length > 1 ? " blended" : "";
  // LT-weighted debt ceiling — the debt the collateral can carry before the
  // position is liquidatable. Σ(collateral × LT) ≈ totalCollateral × blended LT.
  // A prose-only rollup with no chrome twin, so it renders muted.
  const debtCeilingUsd = chain.totalCollateralUsd * chain.avgLiquidationThreshold;
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const liqRead = view ? aaveV3LiquidationRead(view) : null;
  const same = aaveV3SameAsset(chain);
  const supplyInterestUsd = captions?.supplyInterestUsd ?? null;
  const debtInterestUsd = captions?.debtInterestUsd ?? null;

  // Empty position — nothing supplied and nothing borrowed. Nothing to narrate.
  if (supplySyms.length === 0 && !hasDebt) return null;

  // Status lead — the one-sentence verdict, subject-first, colon-terminated:
  // the lead-in to the bullets (charter §4).
  const lead: React.ReactNode = !hasDebt ? (
    <>This position supplies collateral only and carries no debt, so none of it can be liquidated:</>
  ) : hf != null ? (
    <>
      This position borrows against its supplied collateral, held at a <H>{hf >= 100 ? "∞" : hfLabelV3(hf)}</H> health
      factor:
    </>
  ) : (
    <>This position borrows against its supplied collateral:</>
  );

  const bullets: React.ReactNode[] = [];

  if (supplySyms.length > 0) {
    bullets.push(
      <span key="composition">
        The collateral totals <H>{formatUsd(chain.totalCollateralUsd)}</H> across {supplySyms.length} asset
        {supplySyms.length === 1 ? "" : "s"}
        {supplySyms.length <= 4 ? <> ({joinSymbols(supplySyms)})</> : null}.
      </span>,
    );
  }

  if (!hasDebt) {
    if (debtCeilingUsd > 0 && chain.avgLiquidationThreshold > 0) {
      // No debt → the risk row (where the LT gets its bold twin) doesn't
      // render, so both figures stay muted here.
      bullets.push(
        <span key="ceiling-idle">
          Each asset counts as collateral only up to its liquidation threshold ({pct(chain.avgLiquidationThreshold)}
          {blended}), so this collateral could carry up to {fmtUsd(debtCeilingUsd).display} of debt before becoming
          liquidatable.
        </span>,
      );
    }
  } else {
    bullets.push(
      <span key="backs">
        The borrowing totals <H>{formatUsd(chain.totalDebtUsd)}</H>
        {debtSyms.length > 0 ? <> in {joinSymbols(debtSyms)}</> : null}
        {collateralSyms.length > 0 ? <>, collateralised by {joinSymbols(collateralSyms)}</> : null}.
      </span>,
    );
    if (chain.totalCollateralUsd > 0 && chain.ltv > 0) {
      bullets.push(
        <span key="ltv">
          Borrowing stands at <H>{pct(chain.totalDebtUsd / chain.totalCollateralUsd)}</H> loan-to-value, against a{" "}
          <H>{pct(chain.ltv)}</H> borrow cap.
        </span>,
      );
    }
    if (chain.avgLiquidationThreshold > 0 && debtCeilingUsd > 0) {
      bullets.push(
        <span key="ceiling">
          {collateralSyms.length === 1 ? (
            <>{collateralSyms[0]} counts only up to its liquidation threshold (</>
          ) : (
            <>Each asset counts only up to its liquidation threshold (</>
          )}
          <H>{pct(chain.avgLiquidationThreshold)}</H>
          {blended}), so the collateral can carry up to {fmtUsd(debtCeilingUsd).display} of debt before the position is
          liquidatable. The loan-to-value cap and the threshold are today&rsquo;s settings; {brand} governance changes
          them, and each event&rsquo;s details show the values at its block.
        </span>,
      );
    }
    if (hf != null) {
      bullets.push(
        <span key="hf">
          Risk-adjusted collateral covers the debt {hfLabelV3(hf)}× over; at a health factor of 1 the position becomes
          liquidatable.
        </span>,
      );
    }
    if (same) {
      bullets.push(<span key="same-asset">{sameAssetSentence(same)}</span>);
    } else if (liqRead?.single) {
      bullets.push(
        <span key="liq-price">
          Liquidation tracks {liqRead.single.symbol}: the position liquidates at{" "}
          <H>{fmtLiqPrice(liqRead.single.liqPrice)}</H>.
        </span>,
      );
    }
    if (dropPct != null && !same) {
      bullets.push(
        <span key="drop">
          The collateral basket can fall about <H>{dropPct}%</H> before liquidation begins.
        </span>,
      );
    }
    if (chain.availableBorrowsUsd > 0) {
      bullets.push(
        <span key="power">
          About <H>{fmtUsd(chain.availableBorrowsUsd).display}</H> more could be borrowed at current prices.
        </span>,
      );
    }
    if (captions?.borrowRate) {
      bullets.push(
        <span key="rate">
          The debt accrues at a <H>{captions.borrowRate.pct.toFixed(2)}%</H>
          {captions.borrowRate.avg ? " average" : ""} borrow rate.
        </span>,
      );
      const moved = rateMove(chain, captions.borrowRate, lastBorrowRate);
      if (moved) bullets.push(<span key="rate-move">{moved}</span>);
    }
  }

  // The interest inside today's balances — the stat captions' figures ("incl.
  // $X interest since …", hidden there below a cent).
  {
    const s = supplyInterestUsd != null && supplyInterestUsd >= 0.01;
    const d = hasDebt && debtInterestUsd != null && debtInterestUsd >= 0.01;
    if (s || d) {
      bullets.push(
        <span key="interest">
          {s && (
            <>
              <H>{formatUsd(supplyInterestUsd as number)}</H> of the collateral is supply interest added
              {sinceWords(captions?.supplyInterestSince)}
            </>
          )}
          {s && d && <> and </>}
          {d && (
            <>
              <H>{formatUsd(debtInterestUsd as number)}</H> of the debt is borrow interest added
              {sinceWords(captions?.debtInterestSince)}
            </>
          )}
          , counted from when each balance last started from zero; the Lifetime flows panel counts the interest of the
          whole life.
        </span>,
      );
    }
  }

  if (view != null && view.txCount > 0 && countNote && countNote.parts.length > 0) {
    // The rows, one kind per line: the owner's transactions first.
    const by = externalActivity && externalActivity.external > 0 ? "by or for the owner" : "by the owner";
    bullets.push(
      <span key="tx-count">
        The timeline lists <H>{countNote.total}</H> rows:
        <span className="mt-1 block space-y-0.5">
          {[`${countNote.txCount} transaction${countNote.txCount === 1 ? "" : "s"} ${by}`, ...countNote.parts].map(
            (line) => (
              <span key={line} className="block pl-3">
                {line}
              </span>
            ),
          )}
        </span>
      </span>,
    );
  } else if (view != null && view.txCount > 0) {
    const liq = view.liquidationCount;
    bullets.push(
      <span key="tx-count">
        The position records <H>{view.txCount}</H> transaction{view.txCount === 1 ? "" : "s"} by or for its owner
        {liq > 0 ? (
          <>
            ; the <H>{liq}</H> liquidation{liq === 1 ? " was sent by a liquidator" : "s were sent by liquidators"}
            {marketName ? (
              <>, and {liq === 1 ? "its" : "each one’s"} fee to the Aave treasury is a separate row in the timeline</>
            ) : null}
          </>
        ) : null}
        .{countNote ? <> {countNote.text}</> : null}
      </span>,
    );
  }
  if (marketName) {
    bullets.push(
      <span key="market">
        {marketName} is one of the Aave V3 markets on Ethereum; each market is a separate account with a separate health
        factor.
      </span>,
    );
  }

  // Who has been operating the position, across its whole history — the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane can state the PATTERN. The event clause explains a single row;
  // only this can tell a reader the position is run by someone other than its
  // owner, which on a delegated account is the single most important thing
  // about it (charter §5 item 7).
  //
  // Count-first and plurality-safe: an "operated by <name>" template is false
  // wherever several actors share the work, and an address is never spoken in
  // place of a name — the fact holds whether or not anything resolves.
  // The identity stays unbolded: it has no chrome twin on the card, so bolding
  // it would break the pane's reverse-completeness (charter §3).
  //
  // ⚠️ Passes null, so the bullet always carries its own denominator. The
  // tx-count bullet above is a TRANSACTION count off the wire while `ext.total`
  // counts EVENTS, and one transaction routinely emits several — 2,762 against
  // 3,485 reduced rows on the 0x5723…fea9 fixture. Only an EVENT count may ever
  // be offered to `operatorLead`; see its doc comment for why equal numbers do
  // not make two counts the same quantity.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    bullets.push(
      <span key="operators">
        {operatorLead(ext, null, "recorded on this position")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
        the owner&rsquo;s. Anyone may supply or repay into an Aave position without asking, but before another account
        can borrow against someone else&rsquo;s collateral, the owner must have delegated credit to it on the debt token
        — so this is delegated operation.
        {ext.actors.length === 1
          ? leadName
            ? ` All of it ran through ${leadName}.`
            : " A single address accounts for all of it."
          : leadName
            ? ` Most of it — ${ext.actors[0].count.toLocaleString("en-US")} events — ran through ${leadName}, with the remaining ${others.toLocaleString("en-US")} spread across ${ext.actors.length - 1} other address${ext.actors.length === 2 ? "" : "es"}${secondName ? `, one of them ${secondName}` : ""}.`
            : ` The work is spread across ${ext.actors.length} addresses, the most active of them accounting for ${ext.actors[0].count.toLocaleString("en-US")}.`}
      </span>,
    );
  }

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

/** A rate under 0.1% at two significant figures, so it does not read 0.00%. */
const ratePct = (p: number): string =>
  p > 0 && p < 0.1
    ? `${p.toLocaleString("en-US", { maximumSignificantDigits: 2 })}%`
    : `${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** The same-asset account's risk sentence (lib/aave-v3/same-asset): no price
 *  can liquidate it, and the two rates set how fast its health factor moves. */
function sameAssetSentence(same: NonNullable<ReturnType<typeof aaveV3SameAsset>>): React.ReactNode {
  const sym = same.symbol;
  const head = (
    <>
      The collateral and the debt are both {sym}, priced by one oracle feed, so a move in {sym}&rsquo;s price changes
      both sides alike and leaves the health factor where it is. Only interest moves it
    </>
  );
  if (same.supplyApr == null || same.borrowApr == null || same.hfDriftPerYear == null) return <>{head}.</>;
  const drift = Math.abs(same.hfDriftPerYear) * 100;
  const rates = (
    <>
      : the {sym} supply earns {ratePct(same.supplyApr * 100)} a year and the debt accrues{" "}
      {ratePct(same.borrowApr * 100)}
    </>
  );
  if (same.hfDriftPerYear >= 0)
    return (
      <>
        {head}
        {rates}, so the health factor rises by about {ratePct(drift)} a year at today&rsquo;s rates.
      </>
    );
  const years = same.yearsToOne;
  return (
    <>
      {head}
      {rates}, so the health factor falls by about {ratePct(drift)} a year
      {years != null ? (
        <>
          {" "}
          and would take about{" "}
          {years >= 1000
            ? "more than a thousand years"
            : years >= 2
              ? `${Math.round(years).toLocaleString("en-US")} years`
              : `${Math.max(1, Math.round(years * 12))} month${Math.round(years * 12) === 1 ? "" : "s"}`}{" "}
          to reach 1 at today&rsquo;s rates
        </>
      ) : null}
      .
    </>
  );
}

/** The borrow rate now against the rate the Pool logged at the newest borrow
 *  of that reserve, where the two are far apart: the rate follows how much of
 *  the reserve is on loan, and the read gives that share today. */
function rateMove(
  chain: AaveV3PositionChainResponse,
  now: NonNullable<AaveV3CardCaptions["borrowRate"]>,
  then: AaveV3LastBorrowRate | null | undefined,
): React.ReactNode {
  if (!then || now.avg) return null;
  const r = chain.reserves.find((x) => x.address.toLowerCase() === then.address && x.debtBalanceRaw !== "0");
  if (!r) return null;
  const far = Math.abs(now.pct - then.pct) >= 0.5 && (now.pct > then.pct * 2 || now.pct < then.pct / 2);
  if (!far) return null;
  const util = typeof r.utilization === "number" ? r.utilization : null;
  return (
    <>
      The {r.symbol} borrow rate was {ratePct(then.pct)} at the last borrow ({formatDate(then.at)}) and is{" "}
      {now.pct.toFixed(2)}% now. The rate follows how much of the reserve is on loan
      {util != null ? (
        <>
          : {(util * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% of the{" "}
          {r.symbol} reserve is on loan now
        </>
      ) : null}
      .
    </>
  );
}

// ── the terminal pane — a closed or liquidated account narrated from the
// captured record + the timeline already on the page (no chain overlay
// needed; the live Pool read says nothing about an exited account) ───────────

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { AaveV3ReserveAmount } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { MARKET_NAME } from "@/lib/aave-v3/asset-catalog";
import { formatDate } from "@/lib/date";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { newestActivityFolder } from "@/lib/shared/timeline-folder-reductions";
import { isWethGateway } from "@/lib/aave-v3/chain-truth-tower";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { v3Brand, v3Protocol } from "@/lib/aave-v3/protocol-name";

function closureDate(unix: number): string {
  return formatDate(unix);
}

/** Up to three peak reserve figures, bolded, then a count for the rest — the
 *  asset-cluster cap grammar; every line stays on the card face with its own
 *  receipt. */
function peakPhrase(reserves: AaveV3ReserveAmount[]): React.ReactNode {
  const named = reserves.slice(0, 3);
  const more = reserves.length - named.length;
  return (
    <>
      {named.map((r, i) => (
        <span key={r.address}>
          {i > 0 && (i === named.length - 1 && more === 0 ? " and " : ", ")}
          <H>
            <AmountText value={r.amount} /> {r.symbol}
          </H>
        </span>
      ))}
      {more > 0 ? (
        <>
          {" "}
          and {more} more reserve{more === 1 ? "" : "s"}
        </>
      ) : null}
    </>
  );
}

export function AaveV3ClosedPositionExplanation({
  v,
  events,
  folders,
  marketPhrase,
  countNote,
}: {
  v: AaveV3PositionView;
  /** Why the timeline lists more events than the count (aaveV3CountSentence). */
  countNote?: AaveV3CountNote | null;
  /** The account's timeline (Aave V3 Pool events, ascending) — the pane reads
   *  how the record ended from the rows already fetched. */
  events: BaseActivityEvent[];
  /** Every folder the index served, whole and unfiltered — the account's
   *  newest activity can sit inside one, so the closure attribution below
   *  reads it before falling back to the last loaded row. */
  folders?: readonly ServedFolder[] | null;
  /** How the prose names the market — "Core market" by default, resolved from
   *  the view's market key; a single-Pool deployment passes its own ("Base
   *  market", "Seamless market") so the pane never calls a Base Pool "Core". */
  marketPhrase?: string;
}) {
  const protocol = v3Protocol(useV3Pool());
  if (v.status === "open") return null;

  const aave = events.filter(isAaveV3Event);
  const isTransferType = (t: string) => t === "transfer_in" || t === "transfer_out";
  // Transfer rows are position moves, not the account's own Pool activity —
  // the transfer-only lead keys on the POOL record being empty, not the
  // timeline (which since mig 160 shows the transfers themselves).
  const poolEvents = aave.filter((e) => !isTransferType(e.context.data.eventType));
  // The newest activity overall — a served folder's last member when it is
  // newer than every loaded row, the loaded row otherwise.
  const newestFolder = newestActivityFolder(aave, folders);
  const lastRow = newestFolder ? null : aave.length > 0 ? aave[aave.length - 1].context.data : null;
  // A transfer to a WETH gateway is a withdrawal as ETH (the gateway withdraws
  // it in the same transaction), and ends the record as a withdrawal does.
  const lastType =
    lastRow?.eventType === "transfer_out" && isWethGateway(lastRow.counterparty)
      ? "withdraw"
      : (lastRow?.eventType ?? null);
  // How the record actually ended — the truthful closure attribution. The
  // liquidated STATUS only says seizures exist somewhere in the record; the
  // ending is a separate fact (1,438 of 4,369 liquidated-status accounts ended
  // with the seizure; the rest exited by their own hand afterwards). A folder
  // groups one run-spec kind at a time (`liquidation` or `transfer`, never
  // both), so its `kind` alone answers which one ended it, EXCEPT a `transfer`
  // folder can hold both directions — only a folder whose legs are all "Sent"
  // states the ending as a transfer out.
  const endedBySeizure = newestFolder ? newestFolder.kind === "liquidation" : lastType === "liquidation";
  const endedByTransferOut = newestFolder
    ? newestFolder.kind === "transfer" &&
      newestFolder.legs.length > 0 &&
      newestFolder.legs.every((l) => l.verb === "Sent")
    : lastType === "transfer_out";
  const everLiquidated = v.liquidationCount > 0;
  const marketName = marketPhrase ?? `${MARKET_NAME[v.market] ?? "Core"} market`;

  const hasPeakSupply = v.peakSupplies.length > 0;
  const hasPeakBorrow = v.peakBorrows.length > 0;

  const lead =
    poolEvents.length === 0 ? (
      <>
        This account&rsquo;s captured record carries no Pool transaction of its own — its balances arrived and left as
        aToken transfers, the position moves its timeline shows:
      </>
    ) : endedByTransferOut ? (
      <>
        This account&rsquo;s record ended with its supplied balance moving to another account as an aToken transfer —
        custody left, nothing was withdrawn to a wallet:
      </>
    ) : endedBySeizure ? (
      <>
        This account was emptied by liquidation — the final seizure took the last of its collateral to cover its debt:
      </>
    ) : everLiquidated ? (
      <>
        This account ran its course and closed — the remaining balances withdrawn and the debt repaid — with liquidation
        seizures in its record:
      </>
    ) : hasPeakBorrow ? (
      <>This account ran its course and closed — the collateral withdrawn and the debt repaid:</>
    ) : (
      <>This account ran its course and closed — its supplied balances withdrawn, with nothing ever borrowed:</>
    );

  const bullets: React.ReactNode[] = [];

  if (hasPeakSupply || hasPeakBorrow) {
    const single = v.peakSupplies.length + v.peakBorrows.length === 1;
    bullets.push(
      <span key="peaks">
        At its height it held {hasPeakSupply ? <>as much as {peakPhrase(v.peakSupplies)} supplied</> : null}
        {hasPeakSupply && hasPeakBorrow ? <>, and owed as much as </> : null}
        {!hasPeakSupply && hasPeakBorrow ? <>no lasting supply, but owed as much as </> : null}
        {hasPeakBorrow ? peakPhrase(v.peakBorrows) : null}
        {single ? (
          <>
            {" "}
            — its highest recorded balance, valued at the moment it stood, interest to then included; between events the
            balance kept accruing, so the true maximum may have sat slightly higher.
          </>
        ) : (
          <>
            {" "}
            — each figure is that reserve&rsquo;s own highest recorded balance at its own moment, interest to then
            included, so the peaks need not have stood together.
          </>
        )}
      </span>,
    );
  }

  if (hasPeakBorrow) {
    bullets.push(
      <span key="cross">
        It was one cross-collateralised account on the {marketName} Pool — every reserve enabled as collateral backed
        all of the account&rsquo;s borrowing together, under a single health factor.
      </span>,
    );
  }

  if (everLiquidated) {
    bullets.push(
      <span key="seizures">
        Liquidation seized it <H>{v.liquidationCount}</H> time{v.liquidationCount === 1 ? "" : "s"} —{" "}
        {protocol === "Aave V3" ? "an" : "a"} {protocol} liquidation is by parts: a liquidator repays a slice of one
        borrowed reserve and takes collateral from one supplied reserve at that pair&rsquo;s liquidation bonus, so a
        single call need not empty the account.{" "}
        {endedBySeizure
          ? "Here the final seizure emptied it entirely."
          : "The account's own transactions then took out what the seizures left."}{" "}
        Seizures in the record are what mark the outcome Liquidated.
      </span>,
    );
  }

  bullets.push(
    <span key="closure">
      Its record closed on <H>{closureDate(v.lastActivityAt)}</H>
      {v.txCount > 0 ? (
        <>
          , after <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"} of its own
        </>
      ) : aave.length > 0 ? (
        <>; the liquidation calls are its only recorded events, so it counts no transactions of its own</>
      ) : null}
      .{countNote ? <> {countNote.text}</> : null}
    </span>,
  );

  bullets.push(
    <span key="door">
      The wallet-and-market pair is the account&rsquo;s permanent key — a new supply or borrow by the same wallet on the{" "}
      {marketName} reopens this very timeline.
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
