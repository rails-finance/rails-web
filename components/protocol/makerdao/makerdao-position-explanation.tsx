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
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol, MAKER_STATUS_DUST } from "@/lib/makerdao/asset-catalog";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";

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
  // The fee in the debt: the debt less the DAI drawn since the vault last owed
  // nothing (lib/makerdao/vault-history.tsx), the figure the card states.
  const feeInDebt =
    hasDebt && v.drawnDai != null && (v.debtDai as number) - v.drawnDai > 0.005
      ? (v.debtDai as number) - v.drawnDai
      : null;
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
        <AmountText value={v.ink} /> {v.collateralSymbol}
      </H>{" "}
      of collateral
      {hasDebt ? (
        <>
          {" "}
          against{" "}
          <H>
            <AmountText value={v.debtDai as number} /> {dsym}
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
      const yearly = (v.debtDai as number) * v.stabilityFeeApr;
      bullets.push(
        <span key="fee">
          The debt grows at {v.ilk}&rsquo;s stability fee, <H>{(v.stabilityFeeApr * 100).toFixed(2)}%</H> a year, about{" "}
          <AmountText value={yearly} format="compact" /> {dsym} a year on today&rsquo;s debt
          {feeInDebt != null && v.drawnDai != null ? (
            <>
              {": "}
              <H>
                {dai2(feeInDebt)} {dsym}
              </H>{" "}
              of what it owes is fee on the {dai2(v.drawnDai)} {dsym} drawn
              {v.drawnSince != null ? <> since {formatDate(v.drawnSince)}</> : null}
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
          {v.ilk} enforces a minimum debt of <AmountText value={v.dustDai} /> {dsym} per vault — a repayment may not
          leave a smaller remainder (only exactly zero).
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
import { formatDate } from "@/lib/date";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { newestActivityFolder } from "@/lib/shared/timeline-folder-reductions";
import { useMakerVaultHistory } from "@/lib/makerdao/vault-history";
import { makerTxHashOf } from "@/lib/makerdao/market-notes";
import type { MakerAuctionOutcome } from "@/lib/makerdao/chain-history-types";

const dai2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function closureDate(unix: number): string {
  return formatDate(unix);
}

export function MakerdaoClosedPositionExplanation({
  v,
  events,
  folders,
}: {
  v: MakerVaultView;
  /** The vault's timeline (maker events, ascending) — the pane reads how the
   *  record ended and the seizure tally from the rows already fetched. */
  events: BaseActivityEvent[];
  /** Every folder the index served, whole and unfiltered — the vault's newest
   *  activity can sit inside one, so the closure attribution below reads it
   *  before falling back to the last loaded row. */
  folders?: readonly ServedFolder[] | null;
}) {
  // The auctions and their leftovers, read by the page (vault-history.tsx).
  const history = useMakerVaultHistory();
  if (v.status === "open") return null;

  const dsym = ilkDebtSymbol(v.ilk);
  const sym = v.collateralSymbol;
  const maker = events.filter(isMakerDAOEvent);
  const grabs = maker.filter((e) => e.context.data.eventType === "grab");
  const grabCount = grabs.length;
  // The newest activity overall — a served folder's last member when it is
  // newer than every loaded row, the loaded row otherwise. MakerDAO's two
  // folder kinds are `liquidation` (pure grabs) and `owner_run` (frob shapes
  // only — never a fork), so a folder never stands for `fork-out`.
  const newestFolder = newestActivityFolder(maker, folders);
  const lastType = newestFolder ? null : maker.length > 0 ? maker[maker.length - 1].context.data.eventType : null;
  // How the record actually ended — the truthful closure attribution. The
  // liquidated STATUS only says seizures exist somewhere in the record; the
  // ending is a separate fact (1,679 of 4,677 liquidated-status vaults ended
  // with the seizure; the rest closed by their own hand afterwards).
  const endedBySeizure = newestFolder ? newestFolder.kind === "liquidation" : lastType === "grab";
  const endedByMove = !newestFolder && lastType === "fork-out";
  // After the last liquidation, did the owner do anything beyond taking back
  // what the auction returned?
  const lastGrabIdx = maker.map((e) => e.context.data.eventType).lastIndexOf("grab");
  const ownerActedAfter =
    !newestFolder &&
    lastGrabIdx >= 0 &&
    maker.slice(lastGrabIdx + 1).some((e) => !history.leftover.has(e.id) && e.context.data.eventType !== "grab");

  // Every auction the page read for this vault's liquidations.
  const outcomes = grabs
    .map((g) => history.auctions.get(makerTxHashOf(g)))
    .filter((a): a is MakerAuctionOutcome => a?.kind === "clipper" && a.settled);
  const allRead = grabCount > 0 && outcomes.length === grabCount;
  const sum = (f: (a: MakerAuctionOutcome) => string) => outcomes.reduce((t, a) => t + Number(f(a)), 0);
  const sold = sum((a) => a.soldInk);
  const raised = sum((a) => a.raisedDai);
  const due = sum((a) => a.dueDai);
  const penalty = sum((a) => a.penaltyDai);
  const returned = sum((a) => a.leftoverInk);
  const shortfall = sum((a) => a.shortfallDai);
  const firstGrab = grabs[0];
  const minimum = outcomes[0]?.mat ?? null;
  const takenOut = [...history.leftover.values()].filter((l) => l.role === "out").map((l) => l.at);

  const hasPeakInk = v.peakInk > 0;
  const hasPeakDebt = v.peakDebtDai != null && v.peakDebtDai > 0;

  const lead = v.everLiquidated ? (
    <>
      This vault was liquidated
      {firstGrab ? <> on {formatDate(firstGrab.timestamp)}</> : null}
      {minimum != null ? (
        <>
          , when its collateral ratio fell under {v.ilk}&rsquo;s {Number((minimum * 100).toFixed(2))}% minimum
        </>
      ) : null}
      {grabCount > 1 ? (
        <>
          {" "}
          (and {grabCount - 1} more time{grabCount === 2 ? "" : "s"} after)
        </>
      ) : null}
      {endedByMove
        ? ", and later moved its remaining collateral and debt to another vault"
        : ownerActedAfter
          ? ", and its owner emptied it afterwards"
          : ""}
      :
    </>
  ) : endedByMove ? (
    <>This vault closed by moving — its remaining collateral and debt transferred to another vault:</>
  ) : (
    <>This vault ran its course and closed — the collateral withdrawn and the debt repaid:</>
  );

  const bullets: React.ReactNode[] = [];

  if (v.everLiquidated && allRead) {
    bullets.push(
      <span key="lost">
        Lost:{" "}
        <H>
          <AmountText value={sold} /> {sym}
        </H>
        , sold by the auction for {dai2(raised)} {dsym} to cover the {dai2(due)} {dsym} debt and a {dai2(penalty)}{" "}
        {dsym} liquidation penalty
        {shortfall > 0 ? (
          <>
            ; it fell {dai2(shortfall)} {dsym} short, which the protocol absorbed
          </>
        ) : null}
        .
      </span>,
    );
    bullets.push(
      <span key="kept">
        Kept: the {dsym} the vault had drawn, since the liquidation cleared the debt
        {returned > 0 ? (
          <>
            , and{" "}
            <H>
              <AmountText value={returned} /> {sym}
            </H>{" "}
            the auction handed back
            {takenOut.length > 0 ? <>, which the owner took out on {formatDate(Math.max(...takenOut))}</> : null}
          </>
        ) : null}
        .
      </span>,
    );
  } else if (v.everLiquidated) {
    bullets.push(
      <span key="seizures">
        {grabCount > 0 ? (
          <>
            Liquidation seized it {grabCount} time{grabCount === 1 ? "" : "s"}.{" "}
          </>
        ) : (
          <>Liquidation seized it. </>
        )}
        Each seizure sent collateral to an auction that raised the debt plus a penalty and handed any collateral left
        back to the vault.
        {endedBySeizure ? " The final seizure emptied it." : null}
      </span>,
    );
  }

  if (hasPeakInk || hasPeakDebt) {
    bullets.push(
      <span key="peaks">
        At its height it held as much as{" "}
        {hasPeakInk ? (
          <H>
            <AmountText value={v.peakInk} /> {sym}
          </H>
        ) : null}
        {hasPeakInk && hasPeakDebt ? <> of collateral and owed as much as </> : null}
        {hasPeakDebt ? (
          <H>
            <AmountText value={v.peakDebtDai as number} /> {dsym}
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
            <AmountText value={v.ink} /> {sym}
          </H>
        ) : null}
        {inkResidue && artResidue ? <> of collateral and </> : null}
        {artResidue ? (
          <H>
            <AmountText value={v.art} /> {dsym}
          </H>
        ) : null}
        {inkResidue && !artResidue ? <> of collateral</> : artResidue && !inkResidue ? <> of debt</> : null} — the
        wei-scale remainder left in the slot{inkResidue && artResidue ? "s" : ""} when the record emptied. It sits below
        the 0.000001 line the lifecycle status reads balances against, so the record reads as {v.status}; the
        lifetime-flows section shows it at its true magnitude.
      </span>,
    );
  }

  if (v.lastActivityAt != null) {
    bullets.push(
      <span key="closure">
        Its last event was on <H>{closureDate(v.lastActivityAt)}</H>.
      </span>,
    );
  }

  bullets.push(
    <span key="door">
      {v.cdpId != null ? (
        <>Vault #{v.cdpId} still belongs to its owner and could take a new deposit; it has had none since.</>
      ) : (
        <>The engine urn still belongs to its staker and could take a new stake; it has had none since.</>
      )}
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
