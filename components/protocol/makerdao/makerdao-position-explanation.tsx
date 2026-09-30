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

import { usdPrice } from "@/lib/makerdao/price-format";
import type { MakerVaultView } from "./makerdao-vault-card";
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol, MAKER_ADDRESSES, MAKER_STATUS_DUST } from "@/lib/makerdao/asset-catalog";
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
  const history = useMakerVaultHistory();
  // The minimum at the vault's newest row, and the governance change since it
  // when today's differs (the Spotter's file logs, read by chain call).
  const newestRead = [...history.ilkAt.values()].reduce<{ block: number; mat: number | null } | null>(
    (m, r) => (m == null || r.block > m.block ? { block: r.block, mat: r.mat } : m),
    null,
  );
  const matMoved =
    newestRead?.mat != null && v.matRatio != null && Math.abs(newestRead.mat - v.matRatio) > 1e-9 && v.atBlock != null;
  const matSpan = useMemo(
    () => (matMoved && newestRead && v.atBlock != null ? [{ from: newestRead.block, to: v.atBlock }] : []),
    [matMoved, newestRead?.block, v.atBlock],
  );
  const matRead = useMakerMatChanges(matMoved ? v.ilk : null, matSpan);
  const matChange = matSpan.length ? matRead.get(`${matSpan[0].from}-${matSpan[0].to}`)?.changes.at(-1) : undefined;
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

  // LockStake's feed is capped: the Vat values SKY at the lower of the cap
  // and the OSM (lib/sources/chain/makerdao-lse-oracle.ts).
  const cap = v.priceCap ?? null;
  const capBinds = cap != null && cap.oracleUsd != null && cap.oracleUsd > cap.capUsd;
  if (v.collateralUsd != null && v.priceUsd != null) {
    bullets.push(
      cap ? (
        <span key="worth">
          At Maker&rsquo;s price for {v.collateralSymbol}, that collateral is worth <H>{formatUsd(v.collateralUsd)}</H>.
          Governance caps the price Maker uses for {v.ilk} at <H>{usdPrice(cap.capUsd)}</H>
          {cap.oracleUsd != null ? (
            <>
              ; the oracle reads {v.collateralSymbol} at {usdPrice(cap.oracleUsd)}
              {capBinds
                ? ", so the vault is valued at the cap"
                : ", under the cap, so the vault is valued at the oracle price"}
            </>
          ) : null}
          .
        </span>
      ) : (
        <span key="worth">
          At Maker&rsquo;s oracle price, that collateral is worth <H>{formatUsd(v.collateralUsd)}</H>.
        </span>
      ),
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
          <AmountText value={yearly} format="compact" /> {dsym} a year on today&rsquo;s debt.
          {feeInDebt != null && v.drawnDai != null ? (
            <>
              {" "}
              Of the {dai2(v.debtDai as number)} {dsym} owed, {dai2(v.drawnDai)} {dsym} is principal (drawn less repaid)
              and{" "}
              <H>
                {dai2(feeInDebt)} {dsym}
              </H>{" "}
              is fee. Maker keeps one debt figure; the page splits it as fee = debt − principal, so a repayment counts
              against principal first and against fee only once principal reaches zero.
            </>
          ) : null}
        </span>,
      );
    }
    if (ratio != null && v.matRatio != null) {
      bullets.push(
        <span key="ratio">
          Collateral ratio <H>{(ratio * 100).toFixed(0)}%</H> — the collateral is worth {ratio.toFixed(2)}× the debt;
          below {(v.matRatio * 100).toFixed(0)}% the vault becomes liquidatable
          {matMoved && newestRead?.mat != null ? (
            <>
              {" "}
              ({v.ilk}&rsquo;s minimum is {Number((v.matRatio * 100).toFixed(2))}%
              {matChange ? <> since {formatDate(matChange.timestamp)}</> : null};{" "}
              {Number((newestRead.mat * 100).toFixed(2))}% at the vault&rsquo;s last event)
            </>
          ) : null}
          .
        </span>,
      );
    }
    if (v.liquidationPriceUsd != null && dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          {capBinds ? <>Maker&rsquo;s price for {v.collateralSymbol}</> : v.collateralSymbol} can fall{" "}
          <H>{dropText(1 - v.liquidationPriceUsd / (v.priceUsd as number))}</H> (to{" "}
          <H>{usdPrice(v.liquidationPriceUsd, formatUsd)}</H>) before liquidation
          {capBinds && cap?.oracleUsd != null ? (
            <>
              . With the cap in place that takes the oracle price falling{" "}
              {dropText(1 - v.liquidationPriceUsd / cap.oracleUsd)}, from {usdPrice(cap.oracleUsd)}
            </>
          ) : null}
          .
        </span>,
      );
    }
    if (v.auction != null) {
      const penalty = Math.round((v.auction.chop - 1) * 100);
      bullets.push(
        <span key="auctions">
          Below the minimum, anyone can start an auction that sells the collateral to cover the debt plus a {penalty}%
          penalty
          {v.lse ? <>; the engine first takes the SKY out of the farm and back from the delegate</> : null}.
          {v.auction.stopped > 0 ? (
            <>
              {" "}
              Governance has switched these auctions off for {v.ilk}: its auction contract refuses new auctions
              {v.auction.stopped >= 3 ? " and bids" : ""}, so for now a vault under the minimum is not sold.
            </>
          ) : null}
        </span>,
      );
    }
    if (v.dustDai != null && v.dustDai > 0) {
      bullets.push(
        <span key="dust">
          {v.ilk} enforces a minimum debt of <AmountText value={v.dustDai} /> {dsym} per vault — a repayment may not
          leave a smaller remainder (zero is allowed).
        </span>,
      );
    }
    if (v.lineDai != null && v.lineDai > 0 && v.ilkDebtDai != null) {
      bullets.push(
        <span key="ceiling">
          {v.ilk}&rsquo;s debt ceiling, <AmountText value={v.lineDai} format="compact" /> {dsym}, is the most all{" "}
          {v.ilk} vaults together may owe; they owe <AmountText value={v.ilkDebtDai} format="compact" /> {dsym} now. At
          the ceiling no {v.ilk} vault can draw more until it is raised; repaying and adding collateral still work.
        </span>,
      );
    }
  }

  bullets.push(
    <span key="osm">
      Maker prices the collateral through its Oracle Security Module (OSM), which passes each price on an hour late by
      design. The vault is judged against that delayed price
      {cap ? <>, or the cap when it is lower,</> : null} and that is the price shown here.
    </span>,
  );

  if (v.lse) {
    const ls = v.lockstake ?? null;
    bullets.push(
      <span key="lockstake">
        This is a LockStake urn. Its owner, {v.owner ? shortAddr(v.owner) : "the owner"}, works it through Sky&rsquo;s
        LockStake Engine ({shortAddr(MAKER_ADDRESSES.LOCKSTAKE_ENGINE)}), which made the urn {shortAddr(v.urn)} for it:
        the urn is the address the Vat records the SKY and the debt under. The engine stakes the locked SKY in a rewards
        farm the owner picks and passes its voting power to a delegate the owner picks
        {ls ? (
          <>
            {" "}
            (now farm {ls.farm ? shortAddr(ls.farm) : "none"}, delegate{" "}
            {ls.voteDelegate ? shortAddr(ls.voteDelegate) : "none"})
          </>
        ) : null}
        ; the owner claims the farm&rsquo;s rewards.
        {ls ? (
          ls.exitFee > 0 ? (
            <> SKY taken out pays an exit fee of {(ls.exitFee * 100).toFixed(2)}%.</>
          ) : (
            <> Taking SKY out has no exit fee now.</>
          )
        ) : null}{" "}
        Picking a farm or a delegate and claiming rewards are engine events this page does not show.
      </span>,
      <span key="usds">
        USDS and DAI are exchangeable one for one, both ways, through Sky&rsquo;s DAI–USDS converter (
        {shortAddr(MAKER_ADDRESSES.DAI_USDS)}).
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

  bullets.push(...ownershipBullets(history, v.txCount, ext?.external ?? 0, v.owner));

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

/** Who has owned the vault, and who acted on it, by kind with counts: the
 *  owners over the loaded history (lib/makerdao/vault-history.tsx), the
 *  transactions the owner signed or sent through its own proxy, and the
 *  ownership transfers another contract made inside them. Nothing where the
 *  vault never changed hands. */
function ownershipBullets(
  history: MakerVaultHistory,
  txCount: number,
  external: number,
  owner?: string | null,
): React.ReactNode[] {
  const owners = history.owners;
  if (owners.length < 2) {
    // One owner over the loaded history: say so, with the proxy it acts through
    // and how many of its transactions it sent, where the page read them.
    if (!owner || history.ownership.size > 0) return [];
    const who = owner.toLowerCase();
    const ctxs = [...history.txContext.values()];
    const proxy = ctxs
      .map((c) => (c.to ? c.parties[c.to] : undefined))
      .find((p) => p?.kind === "dsproxy" && p.owner === who)?.address;
    const sent = ctxs.filter((c) => c.from === who).length;
    return [
      <span key="owners">
        It has had one owner since it opened: {shortAddr(who)}
        {proxy ? <>, through its DSProxy {shortAddr(proxy)} (a contract wallet the owner acts through)</> : null}.
        {ctxs.length === txCount && txCount > 0 ? (
          sent === txCount ? (
            <> The owner sent all {txCount.toLocaleString("en-US")} of its transactions.</>
          ) : (
            <>
              {" "}
              The owner sent {sent.toLocaleString("en-US")} of its {txCount.toLocaleString("en-US")} transactions.
            </>
          )
        ) : null}
      </span>,
    ];
  }
  // The transaction read that names each owner's holder.
  const allCtx = [...history.txContext.values()];
  const partyCtx = (ref: MakerOwnerRef) => allCtx.find((c) => (ref.holder ? c.parties[ref.holder] : undefined));
  // The current owner's stretch reaches back over any transaction-long
  // interlude that handed the vault straight back.
  const key = (r: MakerOwnerRef) => r.holder ?? r.owner;
  const current = owners[owners.length - 1];
  let start = owners.length - 1;
  while (start >= 2 && owners[start - 1].withinTx && key(owners[start - 2].ref) === key(current.ref)) start -= 2;
  const since = owners[start].since;
  const earlier = owners.slice(0, start);
  const interludes = owners.slice(start).filter((o) => o.withinTx);
  const creator = earlier[0];
  const creatorKnown = creator ? knownContract(creator.ref.holder) : undefined;
  const ownerBullet = (
    <span key="owners">
      Owned by {describeOwner(current.ref, partyCtx(current.ref), false)} since <H>{formatDate(since)}</H>
      {creatorKnown && earlier.length === 1 ? (
        <>, when {creatorKnown.name} created the vault and handed it over</>
      ) : earlier.length === 1 &&
        earlier[0].until === since &&
        partyCtx(creator.ref)?.parties[creator.ref.holder ?? ""]?.kind === "contract" ? (
        <>, when the contract {shortAddr(creator.ref.holder)} opened it and handed it over in the same transaction</>
      ) : earlier.length > 0 ? (
        <>
          ; before that by{" "}
          {earlier.map((o, i) => (
            <span key={i}>
              {i > 0 ? ", then " : ""}
              {describeOwner(o.ref, partyCtx(o.ref), false)}
            </span>
          ))}
        </>
      ) : null}
      .
      {interludes.map((o, i) => (
        <span key={i}>
          {" "}
          On {formatDate(o.since)} {describeOwner(o.ref, partyCtx(o.ref), false)} held it inside one transaction and
          handed it back.
        </span>
      ))}
    </span>
  );
  // Transfers made by a contract other than the owner's own holder.
  const byKind = new Map<string, number>();
  let transfers = 0;
  for (const [id, step] of history.ownership) {
    transfers += 1;
    const c = history.txContext.get(id.split(":")[1]?.toLowerCase() ?? "");
    const known = knownContract(step.caller);
    const party = step.caller ? c?.parties[step.caller] : undefined;
    // The owner's own wallet or DSProxy is the owner acting.
    if (!known && (party?.kind === "dsproxy" || step.caller === step.before.owner)) continue;
    const label = known
      ? known.name
      : party?.kind === "instadapp-account"
        ? "the Instadapp account"
        : step.caller
          ? `${step.caller.slice(0, 6)}…${step.caller.slice(-4)}`
          : null;
    if (!label) continue;
    byKind.set(label, (byKind.get(label) ?? 0) + 1);
  }
  const others = [...byKind.entries()];
  const own = Math.max(0, txCount - external);
  const actorsBullet = (
    <span key="actors">
      {own > 0 ? (
        <>
          {own === txCount ? (
            <>All {txCount.toLocaleString("en-US")} of its transactions were</>
          ) : (
            <>
              {own.toLocaleString("en-US")} of its {txCount.toLocaleString("en-US")} transactions were
            </>
          )}{" "}
          signed by the owner or sent through the owner&rsquo;s own proxy.
        </>
      ) : null}
      {others.length > 0 ? (
        <>
          {" "}
          Inside them, other contracts made {others.reduce((t, [, n]) => t + n, 0)} of the vault&rsquo;s {transfers}{" "}
          ownership transfers:{" "}
          {others.map(([label, n], i) => (
            <span key={label}>
              {i > 0 ? (i === others.length - 1 ? " and " : ", ") : ""}
              {label} ({n})
            </span>
          ))}
          .
        </>
      ) : null}
    </span>
  );
  return [ownerBullet, actorsBullet];
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
import { useMakerVaultHistory, type MakerOwnerRef, type MakerVaultHistory } from "@/lib/makerdao/vault-history";
import { knownContract } from "@/lib/makerdao/known-contracts";
import { describeOwner, shortAddr } from "@/lib/makerdao/ownership-prose";
import { useMakerMatChanges } from "@/lib/makerdao/use-chain-history";
import { useMemo } from "react";
import { dropText } from "@/lib/makerdao/explainer-clauses";
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
        A trace under 0.000001 {inkResidue ? sym : dsym}
        {inkResidue && artResidue ? <> and under 0.000001 {dsym}</> : null} remains in the vault, below the line the
        page counts balances from, so the vault reads as {v.status}.
      </span>,
    );
  }

  // Who owned it; the actors line needs the external verdict the open pane has.
  bullets.push(...ownershipBullets(history, v.txCount, 0).slice(0, 1));

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
