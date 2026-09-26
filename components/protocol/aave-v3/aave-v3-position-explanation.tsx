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

import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { aaveV3LiquidationRead, type AaveV3CardCaptions } from "@/lib/aave-v3/chain-truth-tower";
import { fmtUsd, hfLabel, fmtLiqPrice } from "@/lib/aave-v4/format";
import { formatUsd } from "@/lib/shared/format-event";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";

/** Oxford-join asset symbols ("wstETH, WBTC and USDC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length === 0) return "";
  if (syms.length === 1) return syms[0];
  if (syms.length === 2) return `${syms[0]} and ${syms[1]}`;
  return `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
}

export function AaveV3PositionExplanation({
  chain,
  captions,
  view,
  externalActivity,
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
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  if (!chain) return null;
  const hasDebt = chain.totalDebtUsd > 0;
  const supplySyms = chain.reserves.filter((r) => r.supplyBalanceRaw !== "0").map((r) => r.symbol);
  const collateralSyms = chain.reserves
    .filter((r) => r.isCollateral && r.supplyBalanceRaw !== "0")
    .map((r) => r.symbol);
  const debtSyms = chain.reserves.filter((r) => r.debtBalanceRaw !== "0").map((r) => r.symbol);

  // LT-weighted debt ceiling — the debt the collateral can carry before the
  // position is liquidatable. Σ(collateral × LT) ≈ totalCollateral × blended LT.
  // A prose-only rollup with no chrome twin, so it renders muted.
  const debtCeilingUsd = chain.totalCollateralUsd * chain.avgLiquidationThreshold;
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const liqRead = view ? aaveV3LiquidationRead(view) : null;
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
      This position borrows against its supplied collateral, held at a <H>{hfLabel(hf)}</H> health factor:
    </>
  ) : (
    <>This position borrows against its supplied collateral:</>
  );

  const bullets: React.ReactNode[] = [];

  if (supplySyms.length > 0) {
    bullets.push(
      <span key="composition">
        The collateral totals <H>{fmtUsd(chain.totalCollateralUsd).display}</H> across {supplySyms.length} asset
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
          Each asset counts as collateral only up to its liquidation threshold ({pct(chain.avgLiquidationThreshold)}{" "}
          blended), so this collateral could carry up to {fmtUsd(debtCeilingUsd).display} of debt before becoming
          liquidatable.
        </span>,
      );
    }
  } else {
    bullets.push(
      <span key="backs">
        The borrowing totals <H>{fmtUsd(chain.totalDebtUsd).display}</H>
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
          Each asset counts only up to its liquidation threshold (<H>{pct(chain.avgLiquidationThreshold)}</H> blended),
          so the collateral can carry up to {fmtUsd(debtCeilingUsd).display} of debt before the position is
          liquidatable.
        </span>,
      );
    }
    if (hf != null) {
      bullets.push(
        <span key="hf">
          Risk-adjusted collateral covers the debt {hf.toFixed(2)}× over; at a health factor of 1.00 the position
          becomes liquidatable.
        </span>,
      );
    }
    if (liqRead?.single) {
      bullets.push(
        <span key="liq-price">
          Liquidation tracks {liqRead.single.symbol}: the position liquidates at{" "}
          <H>{fmtLiqPrice(liqRead.single.liqPrice)}</H>.
        </span>,
      );
    }
    if (dropPct != null) {
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
    }
  }

  // Accrued interest — the same aggregates the stat captions show ("incl. $X
  // interest", hidden there below a cent), already included in the balances.
  {
    const s = supplyInterestUsd != null && supplyInterestUsd >= 0.01;
    const d = hasDebt && debtInterestUsd != null && debtInterestUsd >= 0.01;
    if (s || d) {
      bullets.push(
        <span key="interest">
          {s && (
            <>
              <H>{formatUsd(supplyInterestUsd as number)}</H> of the collateral is accrued supply interest
            </>
          )}
          {s && d && <> and </>}
          {d && (
            <>
              <H>{formatUsd(debtInterestUsd as number)}</H> of the debt is accrued borrow interest
            </>
          )}{" "}
          — already included in the figures above.
        </span>,
      );
    }
  }

  if (view != null && view.txCount > 0) {
    bullets.push(
      <span key="tx-count">
        The position has recorded <H>{view.txCount}</H> transaction{view.txCount === 1 ? "" : "s"} to date.
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

// ── the terminal pane — a closed or liquidated account narrated from the
// captured record + the timeline already on the page (no chain overlay
// needed; the live Pool read says nothing about an exited account) ───────────

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { AaveV3ReserveAmount } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { MARKET_NAME } from "@/lib/aave-v3/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

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
            {formatNumber(r.amount)} {r.symbol}
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
  marketPhrase,
}: {
  v: AaveV3PositionView;
  /** The account's timeline (Aave V3 Pool events, ascending) — the pane reads
   *  how the record ended from the rows already fetched. */
  events: BaseActivityEvent[];
  /** How the prose names the market — "Core market" by default, resolved from
   *  the view's market key; a single-Pool deployment passes its own ("Base
   *  market", "Seamless market") so the pane never calls a Base Pool "Core". */
  marketPhrase?: string;
}) {
  if (v.status === "open") return null;

  const aave = events.filter(isAaveV3Event);
  const isTransferType = (t: string) => t === "transfer_in" || t === "transfer_out";
  // Transfer rows are position moves, not the account's own Pool activity —
  // the transfer-only lead keys on the POOL record being empty, not the
  // timeline (which since mig 160 shows the transfers themselves).
  const poolEvents = aave.filter((e) => !isTransferType(e.context.data.eventType));
  const lastType = aave.length > 0 ? aave[aave.length - 1].context.data.eventType : null;
  // How the record actually ended — the truthful closure attribution. The
  // liquidated STATUS only says seizures exist somewhere in the record; the
  // ending is a separate fact (1,438 of 4,369 liquidated-status accounts ended
  // with the seizure; the rest exited by their own hand afterwards).
  const endedBySeizure = lastType === "liquidation";
  const endedByTransferOut = lastType === "transfer_out";
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
        Liquidation seized it <H>{v.liquidationCount}</H> time{v.liquidationCount === 1 ? "" : "s"} — an Aave V3
        liquidation is by parts: a liquidator repays a slice of one borrowed reserve and takes collateral from one
        supplied reserve at that pair&rsquo;s liquidation bonus, so a single call need not empty the account.{" "}
        {endedBySeizure
          ? "Here the final seizure emptied it entirely."
          : "What remained after the seizures left by the account's own transactions."}{" "}
        Seizures in the record are what mark the outcome Liquidated rather than Closed.
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
      .
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
