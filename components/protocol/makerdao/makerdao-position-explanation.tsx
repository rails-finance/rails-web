"use client";

// Plain-language explanation of a Maker vault NOW — a SHORT status lead (the
// holding verdict, one sentence) over a bullet list of the independent facts
// (fee, collateral ratio, distance to liquidation, the minimum-debt floor, the
// oracle delay). The position pane is a genuine enumeration, not a causal story
// — prose is reserved for the status verdict; the mechanics stay as bullets.
// Built straight from the live chain overlay (the vault's slots + risk
// parameters read at head): the holding, the fee mechanics, the ratio, the
// distance to liquidation and the ilk's floor.
//
// Every figure here is the same chain-state values shown on the surfaces around it —
// this panel only narrates it. Third person throughout, under the
// explanation-copy charter: what each number MEANS, never how we know it.

import type { MakerVaultView } from "./makerdao-vault-card";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol, MAKER_STATUS_DUST } from "@/lib/makerdao/asset-catalog";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";

export function MakerdaoPositionExplanation({
  v,
  externalActivity,
}: {
  v: MakerVaultView;
  /** Who executed the vault's events, reduced over its whole history with the
   *  same two-fact verdict the event cards render. The page derives it from the
   *  events already on the page; omit to skip the operator bullet. */
  externalActivity?: ExternalActorSummary;
}) {
  // Hooks first — the pane declines below.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  // Narrates the LIVE vault only — the summary can't supply the ilk parameters
  // (liquidation ratio, fee, minimum debt), so without the overlay this panel
  // declines.
  if (v.source !== "chain" || v.status !== "open") return null;

  const hasDebt = v.debtDai != null && v.debtDai > 0;
  // DAI on CdpManager vaults, USDS on LockStake urns (asset-catalog).
  const dsym = ilkDebtSymbol(v.ilk);
  const accruedFee = hasDebt ? Math.max(0, (v.debtDai as number) - v.art) : 0;
  const ratio = hasDebt && v.collateralUsd != null ? v.collateralUsd / (v.debtDai as number) : null;
  const dropPct =
    v.liquidationPriceUsd != null && v.priceUsd != null && v.priceUsd > 0
      ? Math.round((1 - v.liquidationPriceUsd / v.priceUsd) * 100)
      : null;

  // ── status lead ──────────────────────────────────────────────────────────
  // The holding verdict — subject-first, one sentence, two figures, colon-
  // terminated: the lead-in to the bullets (charter §4).
  const lead = (
    <>
      This vault holds{" "}
      <H>
        {formatNumber(v.ink)} {v.collateralSymbol}
      </H>{" "}
      of collateral
      {hasDebt ? (
        <>
          {" "}
          against{" "}
          <H>
            {formatNumber(v.debtDai as number)} {dsym}
          </H>{" "}
          of debt:
        </>
      ) : (
        <> and owes nothing:</>
      )}
    </>
  );

  const bullets: React.ReactNode[] = [];

  if (v.collateralUsd != null && v.priceUsd != null) {
    bullets.push(
      <span key="worth">
        At Maker&rsquo;s own oracle price, that collateral is worth <H>{formatUsd(v.collateralUsd)}</H>.
      </span>,
    );
  }

  if (!hasDebt) {
    bullets.push(
      <span key="no-debt">
        With no debt there is nothing to liquidate — the collateral is safe from liquidation until {dsym} is drawn
        against it.
      </span>,
    );
  } else {
    if (v.stabilityFeeApr != null) {
      bullets.push(
        <span key="fee">
          The debt grows at the {v.ilk} stability fee, currently <H>{(v.stabilityFeeApr * 100).toFixed(2)}%</H> a year
          {accruedFee > 0.005 ? (
            <>
              {" "}
              —{" "}
              <H>
                {formatNumber(accruedFee)} {dsym}
              </H>{" "}
              of fee has built up on the outstanding draw so far
            </>
          ) : null}
          .
        </span>,
      );
    }
    if (ratio != null && v.matRatio != null) {
      bullets.push(
        <span key="ratio">
          Collateral ratio <H>{(ratio * 100).toFixed(0)}%</H> — the collateral is worth {ratio.toFixed(2)}× the debt;
          below {(v.matRatio * 100).toFixed(0)}% the vault becomes liquidatable.
        </span>,
      );
    }
    if (v.liquidationPriceUsd != null && dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          {v.collateralSymbol} can fall about <H>{dropPct}%</H> (to <H>{formatUsd(v.liquidationPriceUsd)}</H>) before
          liquidation.
        </span>,
      );
    }
    if (v.dustDai != null && v.dustDai > 0) {
      bullets.push(
        <span key="dust">
          {v.ilk} enforces a minimum debt of {formatNumber(v.dustDai)} {dsym} per vault — a repayment may not leave a
          smaller remainder (only exactly zero).
        </span>,
      );
    }
  }

  bullets.push(
    <span key="osm">
      Prices reach this vault through an oracle that delays each feed by an hour by design. The vault is judged against
      that delayed price, and that is the price shown here.
    </span>,
  );

  if (v.txCount > 0) {
    bullets.push(
      <span key="event-count">
        The vault has recorded <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"} of its own to date
        {v.everLiquidated ? <>, and its record also carries liquidation seizures</> : null}.
      </span>,
    );
  }

  // Who has been operating the vault, across its whole history — the same
  // verdict each event card renders on its spine, reduced once so the pane can
  // state the PATTERN. The event clause explains one row; only this can tell a
  // reader the vault is run from an address other than the one that owns it
  // (charter §5 item 7).
  //
  // ⚠️ The claim stays inside what Maker's two facts support: signed by someone
  // else AND not entered through the owner's own proxy. It is never described
  // as a contract-level msg.sender — `txTo` is the transaction envelope's `to`.
  //
  // Count-first and plurality-safe (an "operated by <name>" template is false
  // wherever several addresses share the work), and an address is never spoken
  // in place of a name. The identity stays unbolded: it has no chrome twin on
  // the card, so bolding it would break reverse-completeness (charter §3).
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    bullets.push(
      <span key="operators">
        {/* Never the count-chained form: the pane's count bullet speaks in
            distinct transactions while ext.total counts event rows — equal
            numbers would still be different quantities (the Run 10 rule). */}
        {operatorLead(ext, null, "recorded on this vault")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
        the owner&rsquo;s, and did not enter through the owner&rsquo;s own proxy. Another address can add collateral or
        repay debt straight at the Vat, though a vault held through the CDP manager needs the owner&rsquo;s
        authorisation even for that; drawing debt or taking collateral out always needs permission the owner granted
        first and can revoke — so this is authorised operation on the owner&rsquo;s behalf, not interference.
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

// ── Terminal pane ───────────────────────────────────────────────────────────
// A closed or liquidated vault gets its prose too (the terminal-pane grammar:
// lead keyed on HOW the record ended, peaks, the seizure record, closure +
// own-tx count, and the door back). Derived from the replay summary and the
// timeline already on the page — no chain overlay needed, so it renders on
// every terminal vault.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";

function closureDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MakerdaoClosedPositionExplanation({
  v,
  events,
}: {
  v: MakerVaultView;
  /** The vault's timeline (maker events, ascending) — the pane reads how the
   *  record ended and the seizure tally from the rows already fetched. */
  events: BaseActivityEvent[];
}) {
  if (v.status === "open") return null;

  const dsym = ilkDebtSymbol(v.ilk);
  const maker = events.filter(isMakerDAOEvent);
  const grabCount = maker.filter((e) => e.context.data.eventType === "grab").length;
  const lastType = maker.length > 0 ? maker[maker.length - 1].context.data.eventType : null;
  // How the record actually ended — the truthful closure attribution. The
  // liquidated STATUS only says seizures exist somewhere in the record; the
  // ending is a separate fact (1,679 of 4,677 liquidated-status vaults ended
  // with the seizure; the rest closed by their own hand afterwards).
  const endedBySeizure = lastType === "grab";
  const endedByMove = lastType === "fork-out";

  const hasPeakInk = v.peakInk > 0;
  const hasPeakDebt = v.peakDebtDai != null && v.peakDebtDai > 0;

  const lead = endedBySeizure ? (
    <>This vault was emptied by liquidation — the final seizure took the last of its collateral to cover its debt:</>
  ) : endedByMove ? (
    <>
      This vault closed by moving — its remaining collateral and debt transferred to another vault
      {v.everLiquidated ? <>, with liquidation seizures earlier in its record</> : null}:
    </>
  ) : v.everLiquidated ? (
    <>
      This vault ran its course and closed — the remaining collateral withdrawn and the debt repaid — with liquidation
      seizures in its record:
    </>
  ) : (
    <>This vault ran its course and closed — the collateral withdrawn and the debt repaid:</>
  );

  const bullets: React.ReactNode[] = [];

  if (hasPeakInk || hasPeakDebt) {
    bullets.push(
      <span key="peaks">
        At its height it held as much as{" "}
        {hasPeakInk ? (
          <H>
            {formatNumber(v.peakInk)} {v.collateralSymbol}
          </H>
        ) : null}
        {hasPeakInk && hasPeakDebt ? <> of collateral and owed as much as </> : null}
        {hasPeakDebt ? (
          <H>
            {formatNumber(v.peakDebtDai as number)} {dsym}
          </H>
        ) : null}
        {hasPeakInk && hasPeakDebt ? (
          <>
            {" "}
            — each figure is its own highest point over the vault&rsquo;s recorded events, so the two need not have
            stood together.
          </>
        ) : hasPeakInk ? (
          <> of collateral — its highest point over the vault&rsquo;s recorded events; it never drew debt.</>
        ) : (
          <> — its highest recorded debt over the vault&rsquo;s life.</>
        )}
      </span>,
    );
  }

  if (v.everLiquidated) {
    bullets.push(
      <span key="seizures">
        {grabCount > 0 ? (
          <>
            Liquidation seized it {grabCount} time{grabCount === 1 ? "" : "s"} —{" "}
          </>
        ) : (
          <>Liquidation seized it — </>
        )}
        a Maker liquidation is partial by design (each ilk caps how much can be auctioned at once), so a single seizure
        need not empty a vault.{" "}
        {endedBySeizure
          ? "Here the final seizure emptied it entirely."
          : "What remained after the seizures left by the vault's own transactions."}{" "}
        Seizures in the record are what mark the outcome Liquidated rather than Closed.
      </span>,
    );
  }

  if (endedByMove) {
    bullets.push(
      <span key="move">
        The closing move was a Vat fork: collateral and debt shifted urn-to-urn inside Maker in a single operation, and
        the receiving vault&rsquo;s timeline carries the balance onward.
      </span>,
    );
  }

  // A terminal vault can keep a wei-scale trace in its Vat slots — real chain
  // state below the 1e-6 dust line the lifecycle status reads balances
  // against. The lifetime-flows section shows it at true magnitude; this
  // bullet says what the figure is so it doesn't read as a data error.
  const inkResidue = v.ink > 0 && v.ink <= MAKER_STATUS_DUST;
  const artResidue = v.art > 0 && v.art <= MAKER_STATUS_DUST;
  if (inkResidue || artResidue) {
    bullets.push(
      <span key="residue">
        The Vat still records a trace on this urn —{" "}
        {inkResidue ? (
          <H>
            {formatNumber(v.ink)} {v.collateralSymbol}
          </H>
        ) : null}
        {inkResidue && artResidue ? <> of collateral and </> : null}
        {artResidue ? (
          <H>
            {formatNumber(v.art)} {dsym}
          </H>
        ) : null}
        {inkResidue && !artResidue ? <> of collateral</> : artResidue && !inkResidue ? <> of debt</> : null} — the
        wei-scale remainder left in the slot{inkResidue && artResidue ? "s" : ""} when the record emptied. It sits below
        the 0.000001 line the lifecycle status reads balances against, so the record reads as {v.status}; the
        lifetime-flows section shows it at its true magnitude rather than rounding it to a zero.
      </span>,
    );
  }

  bullets.push(
    <span key="closure">
      Its record closed
      {v.lastActivityAt != null ? (
        <>
          {" "}
          on <H>{closureDate(v.lastActivityAt)}</H>
        </>
      ) : null}
      , after <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"} of its own.
    </span>,
  );

  bullets.push(
    <span key="door">
      {v.cdpId != null ? (
        <>
          Vault #{v.cdpId} survives its closing — it stays with its owner, and a new deposit or draw under the same
          vault reopens this very timeline.
        </>
      ) : (
        <>
          The engine urn survives its closing — it stays with its staker, and a new stake or draw under it reopens this
          very timeline.
        </>
      )}
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
