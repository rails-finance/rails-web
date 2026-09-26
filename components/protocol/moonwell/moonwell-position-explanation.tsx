"use client";

// Plain-language, data-driven explanation of a Moonwell position — the
// Compound-v2 analogue of the Comet position explanation, built straight from
// the live chain response (per-market balances, entered-market membership, the
// Comptroller's oracle prices and collateral factors, and the Comptroller's
// OWN getAccountLiquidity verdict): a few neutral bullets describing
// composition, what actually backs the debt, the health factor, the drop to
// liquidation, the remaining borrowing power, and how a v2 liquidation runs
// (close factor + incentive). Rendered inside the position card's Explanation
// heading-button (the V4/trove grammar) via the card's `explanation` prop.
//
// Every figure here is the same chain-state values shown (and <Prov>-traced) on the
// cards around it — this panel only narrates it. USD throughout: the
// Comptroller's own oracle prices every market.

import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import type { MoonwellPositionView } from "@/components/protocol/moonwell/moonwell-position-card";
import type { MoonwellCardCaptions } from "@/lib/moonwell/economics";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { capacityShare } from "@/lib/shared/capacity-share";
import { formatDate } from "@/lib/date";

/** Oxford-join asset symbols ("WETH, USDC and cbBTC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length === 0) return "";
  if (syms.length === 1) return syms[0];
  if (syms.length === 2) return `${syms[0]} and ${syms[1]}`;
  return `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
}

export function MoonwellPositionExplanation({
  chain,
  captions,
  txCount,
  liquidationCount,
  externalActivity,
}: {
  /** The live chain read. Null until it lands:
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: MoonwellChainResponse | null;
  /** The card's stat captions (accrued interest, borrow rate) — the same
   *  computed values the stat footnotes show. Omit to skip those bullets. */
  captions?: MoonwellCardCaptions | null;
  /** The card's transaction count (the count badge). Omit to skip. */
  txCount?: number;
  /** Replayed liquidation count from the index (the card's marker). */
  liquidationCount?: number;
  /** Who executed the account's events, reduced over its whole timeline. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullet. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  if (!chain) return null;
  const supplied = chain.markets.filter((m) => m.supplyUnderlying > 0);
  const entered = supplied.filter((m) => m.entered);
  const unentered = supplied.filter((m) => !m.entered);
  const borrowed = chain.markets.filter((m) => m.borrowUnderlying > 0);
  const hasDebt = borrowed.length > 0;
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;

  const bullets: React.ReactNode[] = [];

  // The card's own USD headlines (strict guard: stated only when every
  // contributing market is priced — the card degrades identically).
  const sideUsd = (ms: typeof supplied, amount: (m: (typeof ms)[number]) => number): number | null => {
    let sum = 0;
    for (const m of ms) {
      if (m.priceUsd == null) return null;
      sum += amount(m) * m.priceUsd;
    }
    return ms.length > 0 ? sum : null;
  };
  const suppliedUsd = sideUsd(supplied, (m) => m.supplyUnderlying);
  const borrowedUsd = sideUsd(borrowed, (m) => m.borrowUnderlying);
  if (suppliedUsd != null || borrowedUsd != null) {
    bullets.push(
      <span key="totals">
        At the Comptroller&rsquo;s own oracle prices{" "}
        {suppliedUsd != null && (
          <>
            the supplied markets are worth <H>{formatUsd(suppliedUsd)}</H>
          </>
        )}
        {suppliedUsd != null && borrowedUsd != null && <> and </>}
        {borrowedUsd != null && (
          <>
            the borrowed markets <H>{formatUsd(borrowedUsd)}</H>
          </>
        )}
        .
      </span>,
    );
  }

  for (const m of supplied) {
    bullets.push(
      <span key={`supply-${m.market}`}>
        The{" "}
        <H>
          {formatNumber(m.supplyUnderlying)} {m.symbol}
        </H>{" "}
        supply{m.priceUsd != null ? <> (worth {formatUsd(m.supplyUnderlying * m.priceUsd)})</> : null} earns the market
        rate ({m.supplyApr != null ? (m.supplyApr * 100).toFixed(2) : "—"}% APR).
      </span>,
    );
  }

  if (unentered.length > 0) {
    bullets.push(
      <span key="unentered">
        The {joinSymbols(unentered.map((m) => m.symbol))} supply is <H>not entered as collateral</H> — minting alone
        doesn&rsquo;t enter a market, so it backs no borrowing and can&rsquo;t be seized. It only earns.
      </span>,
    );
  }

  if (hasDebt) {
    bullets.push(
      <span key="borrows">
        The account borrows{" "}
        {borrowed.map((m, i) => (
          <span key={m.market}>
            {i > 0 ? " and " : ""}
            <H>
              {formatNumber(m.borrowUnderlying)} {m.symbol}
            </H>
            {m.borrowApr != null ? <> at {(m.borrowApr * 100).toFixed(2)}% APR</> : null}
          </span>
        ))}
        {entered.length > 0 ? (
          <>
            {" "}
            against {joinSymbols(entered.map((m) => m.symbol))} collateral counted at{" "}
            {formatUsd(chain.collateralValueUsd)} by the Comptroller&rsquo;s own risk check
          </>
        ) : null}
        .
      </span>,
    );
    bullets.push(
      <span key="verdict">
        The Comptroller reports{" "}
        {chain.shortfallUsd > 0 ? (
          <>
            a {formatUsd(chain.shortfallUsd)} <H>shortfall</H>, so the account can be liquidated now
          </>
        ) : (
          <>
            <H>{formatUsd(chain.liquidityUsd)}</H> of borrowing power still unused
          </>
        )}
        .
      </span>,
    );
    if (chain.debtValueUsd > 0 && chain.collateralCapacityUsd > 0) {
      const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
      bullets.push(
        <span key="capacity-line">
          The debt stands at <H>{share.text}</H> {share.ofThe} liquidation line. That line sits at{" "}
          <H>{formatUsd(chain.collateralCapacityUsd)}</H> of debt at current prices.
        </span>,
      );
    }
    if (hf != null) {
      bullets.push(
        <span key="hf">
          Health factor {hf.toFixed(2)} — collateral capacity (each entered market counts up to its collateral factor)
          is {hf.toFixed(2)}× the debt; at 1.0 the shortfall begins.
        </span>,
      );
    }
    if (dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          The collateral basket can fall about <H>{dropPct}%</H> before the account is liquidatable.
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
    bullets.push(
      <span key="mechanics">
        A liquidation here repays at most {Math.round(chain.closeFactor * 100)}% of one borrowed market per seizure (the
        close factor) and the liquidator takes collateral worth that repayment plus{" "}
        {Math.round(Math.max(0, chain.liquidationIncentive - 1) * 100)}% — a partial nudge back over the line, not a
        full absorb.
      </span>,
    );
  } else if (entered.length > 0) {
    bullets.push(
      <span key="idle-capacity">
        Nothing is borrowed. At current oracle prices the entered collateral could back up to{" "}
        {formatUsd(chain.liquidityUsd)} of borrowing, the figure the Comptroller reports.
      </span>,
    );
  }

  // Accrued interest — the same aggregates the stat captions show ("incl. $X
  // interest", hidden there below a cent), already included in the balances.
  {
    const s = captions?.supplyInterestUsd != null && captions.supplyInterestUsd >= 0.01;
    const d = hasDebt && captions?.debtInterestUsd != null && captions.debtInterestUsd >= 0.01;
    if (s || d) {
      bullets.push(
        <span key="interest">
          {s && (
            <>
              <H>{formatUsd(captions!.supplyInterestUsd as number)}</H> of the supplied value is accrued supply interest
            </>
          )}
          {s && d && <> and </>}
          {d && (
            <>
              <H>{formatUsd(captions!.debtInterestUsd as number)}</H> of the debt is accrued borrow interest
            </>
          )}{" "}
          — already included in the figures above:
          {s && <> supply interest accrues into the exchange rate, growing the mToken claim itself</>}
          {s && d && <>;</>}
          {d && <> borrow interest accrues onto the debt between its own events</>}.
        </span>,
      );
    }
  }

  if (liquidationCount != null && liquidationCount > 0) {
    bullets.push(
      <span key="survivor">
        The account has been liquidated <H>{liquidationCount}</H> time{liquidationCount === 1 ? "" : "s"} and remains
        open — liquidation here is partial by design.
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

  // Who has been operating the account, across its whole timeline — the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane can state the PATTERN rather than one row at a time (charter
  // §5 item 7).
  //
  // Count-first and plurality-safe: an "operated by <name>" template is false
  // wherever several actors share the work, and an address is never spoken in
  // place of a name — the fact holds whether or not anything resolves. The
  // identity stays unbolded: it has no chrome twin on the card, so bolding it
  // would break the pane's reverse-completeness (charter §3).
  //
  // The mechanic is Compound V2's, DELIBERATELY shared: Moonwell's mToken is
  // that code, with the same entry points and no mintTo / borrowBehalf /
  // borrowFor. Its one addition, mintWithPermit, is an EIP-2612 gas convenience
  // for the caller's OWN mint, not a way to act for anyone else. The WETH
  // Router sentence is the local wrinkle: a routed mint or redeem emits the
  // router as minter/redeemer, and only the two-fact test (the owner still
  // signed) keeps those rows out of this count.
  {
    const ext = externalActivity;
    if (ext && ext.external > 0) {
      const others = ext.external - (ext.actors[0]?.count ?? 0);
      bullets.push(
        <span key="operators">
          {operatorLead(ext, null, "on this account’s timeline")}
          {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
          the owner&rsquo;s. Moonwell runs Compound V2&rsquo;s lending code and inherits its strictness: the one thing a
          third party can do for an account unasked is repay its borrowing. Supplying, borrowing and redeeming all act
          on whoever calls them, and there is no way to authorise another address to act for the account — so an outside
          row here is always someone paying down this debt, or mTokens arriving from another wallet. The count treats
          mints and redemptions that went through the WETH Router as the owner&rsquo;s own: the owner signed those, the
          router only carried them.
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
  }

  if (bullets.length === 0) return null;

  // Subject-first status lead (charter §4): a one-sentence verdict, colon-
  // terminated — the lead-in to the bullets. Keyed on the resulting state.
  const lead = hasDebt
    ? chain.shortfallUsd > 0
      ? "This position is undercollateralized — the Comptroller reports a shortfall, so it can be liquidated now:"
      : "This position borrows against its supplied collateral and is within its borrowing limit:"
    : entered.length > 0
      ? "This position supplies collateral to Moonwell and holds no debt:"
      : "This position supplies to Moonwell to earn, with nothing entered as collateral:";

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

/** Closed mood — narration from the index alone (a terminal account has no
 *  live state to read): the peaks, the closure, the door back in. Figures
 *  bold only where the card's chrome shows the same figure (the peaks, the
 *  closure date, the counts). */
export function MoonwellClosedPositionExplanation({ v }: { v: MoonwellPositionView }) {
  const peakText = (rs: { amount: number; symbol: string }[]) =>
    rs.map((r, i) => (
      <span key={r.symbol + i}>
        {i > 0 ? (i === rs.length - 1 ? " and " : ", ") : ""}
        <H>
          {formatNumber(r.amount)} {r.symbol}
        </H>
      </span>
    ));
  const closedDate = formatDate(v.lastActivityAt);

  const lead = <>This account ran its course and closed — nothing remains supplied or borrowed:</>;

  const list: React.ReactNode[] = [];
  if (v.peakSupplies.length > 0 || v.peakBorrows.length > 0) {
    list.push(
      <>
        At its height the account
        {v.peakSupplies.length > 0 && <> supplied as much as {peakText(v.peakSupplies)}</>}
        {v.peakSupplies.length > 0 && v.peakBorrows.length > 0 && <> and</>}
        {v.peakBorrows.length > 0 && <> owed as much as {peakText(v.peakBorrows)}</>} — each market&rsquo;s own highest
        point across the account&rsquo;s life.
      </>,
    );
  }
  if (v.liquidationCount > 0) {
    list.push(
      <>
        The account was liquidated <H>{v.liquidationCount}</H> time{v.liquidationCount === 1 ? "" : "s"} — a liquidator
        repaid part of what it owed and took collateral in exchange.
      </>,
    );
  }
  list.push(
    <>
      Its last activity landed on <H>{closedDate}</H>, after <H>{v.txCount}</H> transaction
      {v.txCount === 1 ? "" : "s"}.
    </>,
  );
  list.push(
    <>The wallet can come back at any time — a new supply or borrow reopens this same account&rsquo;s timeline.</>,
  );

  return <ProseExplainer paragraph={lead} items={list} />;
}
