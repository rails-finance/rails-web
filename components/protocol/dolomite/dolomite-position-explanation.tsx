"use client";

// Plain-language, data-driven explanation of a Dolomite account — a short
// status lead plus neutral bullets describing composition, the account's own
// line and where it stands, the drop to liquidation, and how a liquidation
// runs here. Rendered inside the position card's Explanation heading-button
// via the card's `explanation` prop.
//
// Every figure here is the same value shown (and <Prov>-traced) on the cards
// around it — this panel only narrates it, under the explanation-copy charter:
// what the numbers MEAN, never how they were read (the receipts own that).
// Third person throughout; only the mode present is described.

import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";

/** Oxford-join asset symbols ("wstETH and WETH"). */
function joinSymbols(syms: string[]): string {
  if (syms.length === 0) return "";
  if (syms.length === 1) return syms[0];
  if (syms.length === 2) return `${syms[0]} and ${syms[1]}`;
  return `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
}

export function DolomitePositionExplanation({
  chain,
  liquidationCount,
  txCount,
  externalActivity,
}: {
  /** The live chain read. Null until it lands (or for a closed account):
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: DolomiteChainResponse | null;
  /** Replayed liquidation count from the index — lets an open survivor's
   *  narration state the two-axis fact. Omit to skip the bullet. */
  liquidationCount?: number;
  /** The card's transaction count (the count badge). Omit to skip. */
  txCount?: number;
  /** Who executed the account's events, reduced over its whole history. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullet. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  if (!chain) return null;
  const supplied = chain.balances.filter((b) => b.wei > 0);
  const borrowed = chain.balances.filter((b) => b.wei < 0);
  const hasDebt = borrowed.length > 0 && chain.adjBorrowValueUsd > 0;
  const c = chain.collateralization;
  const req = chain.requiredCollateralization;
  const dropPct = c != null && req > 0 && c > req ? Math.round((1 - req / c) * 100) : null;

  // Status lead — subject-first, one sentence, colon-terminated: the lead-in
  // to the bullets (charter §4).
  const lead: React.ReactNode = hasDebt ? (
    <>The account borrows against its own collateral inside a single cross-margined account number:</>
  ) : supplied.length > 0 ? (
    <>The account is lending only — every balance is positive, so nothing in it can be liquidated:</>
  ) : null;

  const bullets: React.ReactNode[] = [];

  if (hasDebt) {
    bullets.push(
      <span key="negative-balance">A negative balance IS the debt here — Dolomite has no separate Borrow action.</span>,
    );
  }

  for (const b of supplied) {
    bullets.push(
      <span key={`supply-${b.marketId}`}>
        The {b.symbol} balance holds{" "}
        <H>
          {formatNumber(b.wei)} {b.symbol}
        </H>
        {b.priceUsd != null ? <> (worth {formatUsd(Math.abs(b.wei) * b.priceUsd)})</> : null}
        {b.supplyAprPct != null ? <>, earning {b.supplyAprPct.toFixed(2)}% APR</> : null}.
      </span>,
    );
  }

  for (const b of borrowed) {
    bullets.push(
      <span key={`borrow-${b.marketId}`}>
        The {b.symbol} balance owes{" "}
        <H>
          {formatNumber(Math.abs(b.wei))} {b.symbol}
        </H>
        {b.priceUsd != null ? <> (worth {formatUsd(Math.abs(b.wei) * b.priceUsd)})</> : null}
        {b.borrowAprPct != null ? <> at {b.borrowAprPct.toFixed(2)}% APR</> : null}.
      </span>,
    );
  }

  if (supplied.length > 0) {
    bullets.push(
      <span key="index">
        {hasDebt ? (
          <>
            Balances move on each market&rsquo;s per-second interest rate, so a supplied balance grows and a borrowed
            one deepens on its own between events.
          </>
        ) : (
          <>Each balance earns the market&rsquo;s per-second supply rate, so it grows on its own between events.</>
        )}
      </span>,
    );
  }

  if (hasDebt) {
    bullets.push(
      <span key="values">
        Dolomite values the account at {formatUsd(chain.supplyValueUsd)} supplied against{" "}
        {formatUsd(chain.borrowValueUsd)} borrowed, and at {formatUsd(chain.adjSupplyValueUsd)} against{" "}
        <H>{formatUsd(chain.adjBorrowValueUsd)}</H> after its own risk adjustments.
      </span>,
    );
    if (req > 0 && chain.adjSupplyValueUsd > 0) {
      // The capacity clusters on the risk row — the same formulas, so the
      // figures twin.
      const capacityUsd = chain.adjSupplyValueUsd / req;
      bullets.push(
        <span key="capacity">
          That adjusted debt sits at <H>{pct(chain.adjBorrowValueUsd / capacityUsd)}</H> of the account&rsquo;s borrow
          capacity — it becomes liquidatable at <H>{formatUsd(capacityUsd)}</H> of adjusted debt.
        </span>,
      );
    }
    if (chain.override.active) {
      // The override's two figures each state a comparison only where one
      // exists at display precision — the categories differ (the LST/ETH
      // override moves the ratio to 111.11%; the BTC one keeps the global
      // ratio and moves only the spread), and "X instead of the global X"
      // reads as an error.
      const reqPct = (req * 100).toFixed(2);
      const globalReqPct = ((1 + chain.marginRatio) * 100).toFixed(2);
      const ovrSpreadPct =
        chain.override.liquidationSpread != null ? `${(chain.override.liquidationSpread * 100).toFixed(0)}%` : null;
      const globalSpreadPct = `${(chain.liquidationSpread * 100).toFixed(0)}%`;
      bullets.push(
        <span key="override">
          The account carries <H>Dolomite&rsquo;s own account-level risk override</H> — an e-mode-like carve-out the
          protocol grants its correlated-pair categories (ETH liquid-staking pairs, BTC pairs):{" "}
          {reqPct === globalReqPct ? (
            <>
              its minimum collateralisation stays at the global <H>{reqPct}%</H>
            </>
          ) : (
            <>
              its minimum collateralisation is <H>{reqPct}%</H> instead of the global {globalReqPct}%
            </>
          )}
          , its liquidation spread is{" "}
          {ovrSpreadPct == null ? (
            <>&mdash;</>
          ) : ovrSpreadPct === globalSpreadPct ? (
            <>the global {ovrSpreadPct}</>
          ) : (
            <>
              {ovrSpreadPct} instead of {globalSpreadPct}
            </>
          )}
          , and the per-market margin premiums are skipped, so the adjusted values equal the raw ones.
        </span>,
      );
    } else if (supplied.some((b) => b.marginPremium > 0) || borrowed.some((b) => b.marginPremium > 0)) {
      const withPremium = chain.balances.filter((b) => b.marginPremium > 0);
      bullets.push(
        <span key="premiums">
          {joinSymbols(withPremium.map((b) => b.symbol))} carr{withPremium.length === 1 ? "ies" : "y"} a margin premium
          ({withPremium.map((b) => `${(b.marginPremium * 100).toFixed(1)}%`).join(", ")}), applied{" "}
          <H>multiplicatively</H>. The gap between the raw and adjusted values above is what the premiums cost this
          account.
        </span>,
      );
    }
    if (c != null) {
      bullets.push(
        <span key="ratio">
          Adjusted collateral stands at <H>{(c * 100).toFixed(2)}%</H> of adjusted debt, against the account&rsquo;s own
          minimum of <H>{(req * 100).toFixed(2)}%</H>.
        </span>,
      );
    }
    if (dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          The collateral basket can fall about <H>{dropPct}%</H> before the account crosses its requirement and becomes
          liquidatable.
        </span>,
      );
    }
    bullets.push(
      <span key="mechanics">
        A liquidation here repays part of the debt and takes collateral worth that repayment plus{" "}
        {chain.override.active && chain.override.liquidationSpread != null
          ? `${(chain.override.liquidationSpread * 100).toFixed(0)}%`
          : `${(chain.liquidationSpread * 100).toFixed(0)}%`}
        . It is partial and repeatable, moving four balances in one event across the borrower&rsquo;s and the
        liquidator&rsquo;s accounts.
      </span>,
    );
  }

  if (chain.accountStatus !== 0) {
    bullets.push(
      <span key="status">
        Dolomite&rsquo;s stored status for this account is <H>{chain.accountStatusLabel}</H>, set by the protocol during
        liquidation flows.
      </span>,
    );
  }

  if (liquidationCount != null && liquidationCount > 0) {
    bullets.push(
      <span key="survivor">
        The account has been liquidated <H>{liquidationCount}</H> time{liquidationCount === 1 ? "" : "s"} and remains
        open. Liquidation here is partial and repeatable — an event in the account&rsquo;s life rather than its end.
      </span>,
    );
  }

  if (txCount != null && txCount > 0) {
    bullets.push(
      <span key="tx-count">
        The account has recorded <H>{txCount}</H> transaction{txCount === 1 ? "" : "s"} to date.
      </span>,
    );
  }

  // Who has been operating the account, across its whole history — the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane can state the PATTERN. The event clause explains a single row;
  // only this can tell a reader the account is run by someone other than its
  // owner, which on an operator-run account is the single most important thing
  // about it (charter §5 item 7).
  //
  // Count-first and plurality-safe: an "operated by <name>" template is false
  // wherever several addresses share the work, and an address is never spoken
  // in place of a name — the fact holds whether or not anything resolves. The
  // identity stays unbolded: it has no chrome twin on the card, so bolding it
  // would break the pane's reverse-completeness (charter §3).
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    bullets.push(
      <span key="operators">
        {operatorLead(ext, null, "recorded on this account")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by a third-party address
        rather than the owner&rsquo;s. Dolomite has one permission for that and it is all-or-nothing: an operator the
        owner registered — or one the protocol&rsquo;s admin approved across every account — may deposit, withdraw,
        transfer and trade the account alike, so nothing here separates an address trusted to top the account up from
        one trusted to empty it.
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

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
