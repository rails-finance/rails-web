"use client";

// Plain-language explanation of a Compound V2 position NOW — a SHORT status lead
// (the verdict, one-two sentences) over a bullet list of the independent facts
// (per-market composition, entered/unentered collateral, fixed-priced markets,
// the risk figure, the margin as a ratio, the drop to liquidation, how a V2
// liquidation runs). The position pane is an enumeration, not a causal story:
// prose is reserved for the verdict; the facts stay as bullets (the charter's
// position grammar). Built straight from the live account read (per-market
// balances, entered-market membership, the protocol's oracle prices and
// collateral factors, and its own liquidity/shortfall check).
//
// Every figure here is the same chain-state values shown on the cards around it — this
// panel only narrates it, under the explanation-copy charter: what each number
// MEANS, never how it was read.

import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import type { CompoundV2PositionView } from "@/components/protocol/compound-v2/compound-v2-position-card";
import type { CompoundV2CardCaptions } from "@/lib/compound-v2/economics";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { capacityShare } from "@/lib/shared/capacity-share";
import { formatDate } from "@/lib/date";

/** Oxford-join asset symbols ("ETH, USDC and WBTC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length === 0) return "";
  if (syms.length === 1) return syms[0];
  if (syms.length === 2) return `${syms[0]} and ${syms[1]}`;
  return `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
}

export function CompoundV2PositionExplanation({
  chain,
  liquidationCount,
  captions,
  txCount,
  externalActivity,
}: {
  /** The live chain read. Null until it lands:
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: CompoundV2ChainResponse | null;
  /** Replayed liquidation count from the index — lets an open survivor's
   *  narration state the two-axis fact. Omit to skip the bullet. */
  liquidationCount?: number;
  /** The card's stat captions (accrued interest) — the same computed values
   *  the stat footnotes show. Omit to skip that bullet. */
  captions?: CompoundV2CardCaptions | null;
  /** The card's transaction count (the count badge). Omit to skip. */
  txCount?: number;
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
  const disabledColl = supplied.filter((m) => m.entered && m.collateralDisabled);
  const fixedPriced = chain.markets.filter((m) => !m.priceHasFeed && m.priceUsd != null);
  const borrowed = chain.markets.filter((m) => m.borrowUnderlying > 0);
  const hasDebt = borrowed.length > 0;
  const shortfall = chain.shortfallUsd > 0;
  const hf = chain.healthReplica;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;

  // ── the status lead (the verdict) — subject-first, one sentence, colon-
  // terminated: the lead-in to the bullets (charter §4) ──────────────────────
  const lead: React.ReactNode | null =
    hasDebt && shortfall ? (
      <>This position is liquidatable now — its borrowing has outgrown what its collateral covers:</>
    ) : hasDebt ? (
      <>This position borrows against its Compound V2 collateral and is currently healthy:</>
    ) : entered.length > 0 ? (
      <>This position supplies collateral and is debt-free, so its collateral is safe from liquidation:</>
    ) : supplied.length > 0 ? (
      <>This position only supplies — nothing is entered as collateral, so it backs no borrowing:</>
    ) : null;

  // ── the facts, as bullets ─────────────────────────────────────────────────
  const list: React.ReactNode[] = [];

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
    list.push(
      <>
        At Compound&rsquo;s own oracle prices{" "}
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
      </>,
    );
  }

  for (const m of supplied) {
    list.push(
      <>
        Supplies{" "}
        <H>
          {formatNumber(m.supplyUnderlying)} {m.symbol}
        </H>
        {m.priceUsd != null ? <> (worth {formatUsd(m.supplyUnderlying * m.priceUsd)})</> : null}, earning the
        market&rsquo;s supply rate ({m.supplyApr != null ? (m.supplyApr * 100).toFixed(2) : "—"}% APR).
      </>,
    );
  }

  if (unentered.length > 0) {
    list.push(
      <>
        The {joinSymbols(unentered.map((m) => m.symbol))} supply is <H>not entered as collateral</H> — supplying alone
        doesn&rsquo;t enter a market, so it backs no borrowing and can&rsquo;t be seized. It only earns.
      </>,
    );
  }

  if (disabledColl.length > 0) {
    list.push(
      <>
        The {joinSymbols(disabledColl.map((m) => m.symbol))} market is <H>disabled as collateral</H> — its collateral
        factor is zero (governance turned it off), so the supply earns but backs nothing even though the market is
        entered.
      </>,
    );
  }

  if (fixedPriced.length > 0) {
    list.push(
      <>
        {joinSymbols(fixedPriced.map((m) => m.symbol))} {fixedPriced.length === 1 ? "is" : "are"} priced by a{" "}
        <H>constant stored in the oracle, with no price feed behind it</H> — the number Compound itself uses
        {fixedPriced.length === 1 && fixedPriced[0].priceUsd != null ? (
          <> ({formatUsd(fixedPriced[0].priceUsd)})</>
        ) : null}
        , but nothing updates it.
      </>,
    );
  }

  if (hasDebt) {
    list.push(
      <>
        Borrows{" "}
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
            {formatUsd(chain.collateralValueUsd)} by Compound&rsquo;s own risk check
          </>
        ) : null}
        .
      </>,
    );
    list.push(
      <>
        Compound&rsquo;s own risk check reports{" "}
        {shortfall ? (
          <>
            a {formatUsd(chain.shortfallUsd)} <H>shortfall</H> — the account is liquidatable now
          </>
        ) : (
          <>
            <H>{formatUsd(chain.liquidityUsd)}</H> of borrowing power still unused
          </>
        )}
        .
      </>,
    );
    if (chain.debtValueUsd > 0 && chain.collateralCapacityUsd > 0) {
      const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
      list.push(
        <>
          The debt stands at <H>{share.text}</H> {share.ofThe} liquidation line — each market&rsquo;s collateral factor
          sets both the borrowing limit and that line, one threshold — and the line sits at{" "}
          <H>{formatUsd(chain.collateralCapacityUsd)}</H> of debt at current prices.
        </>,
      );
    }
    if (hf != null) {
      list.push(
        <>
          Compound states that margin as a liquidity-or-shortfall figure rather than a single ratio; expressed as one,
          the collateral covers {hf.toFixed(2)}× the debt, where 1.0× is the shortfall line.
        </>,
      );
    }
    if (captions?.borrowRate) {
      list.push(
        <>
          The debt accrues at a <H>{captions.borrowRate.pct.toFixed(2)}%</H>
          {captions.borrowRate.avg ? " average" : ""} borrow rate.
        </>,
      );
    }
    if (dropPct != null && dropPct > 0) {
      list.push(
        <>
          The collateral basket can fall about <H>{dropPct}%</H> before the account is liquidatable.
        </>,
      );
    }
    list.push(
      <>
        A liquidation here repays at most {Math.round(chain.closeFactor * 100)}% of one borrowed market per seizure (the
        close factor) and the liquidator takes collateral worth that repayment plus{" "}
        {Math.round(Math.max(0, chain.liquidationIncentive - 1) * 100)}% — a partial nudge back over the line, not a
        full absorb. The protocol keeps its own burned share of every seizure.
      </>,
    );
  } else if (entered.length > 0) {
    list.push(
      <>
        Nothing is borrowed. At current oracle prices the entered collateral could back up to{" "}
        {formatUsd(chain.liquidityUsd)} of borrowing — Compound&rsquo;s own liquidity figure.
      </>,
    );
  }

  // Accrued interest — the same aggregates the stat captions show ("incl. $X
  // interest", hidden there below a cent), already included in the balances.
  {
    const s = captions?.supplyInterestUsd != null && captions.supplyInterestUsd >= 0.01;
    const d = hasDebt && captions?.debtInterestUsd != null && captions.debtInterestUsd >= 0.01;
    if (s || d) {
      list.push(
        <>
          {s && (
            <>
              <H>{formatUsd(captions!.supplyInterestUsd as number)}</H> of the collateral is accrued supply interest
            </>
          )}
          {s && d && <> and </>}
          {d && (
            <>
              <H>{formatUsd(captions!.debtInterestUsd as number)}</H> of the debt is accrued borrow interest
            </>
          )}{" "}
          — already included in the figures above:
          {s && <> supply interest accrues into the exchange rate, growing the cToken claim itself</>}
          {s && d && <>;</>}
          {d && <> borrow interest accrues onto the debt between its own events</>}.
        </>,
      );
    }
  }

  if (liquidationCount != null && liquidationCount > 0) {
    list.push(
      <>
        The account has been liquidated <H>{liquidationCount}</H> time{liquidationCount === 1 ? "" : "s"} and remains
        open — V2 liquidations are partial by design, and borrowers commonly continue after them.
      </>,
    );
  }

  if (txCount != null && txCount > 0) {
    list.push(
      <>
        The account has recorded <H>{txCount}</H> transaction{txCount === 1 ? "" : "s"} to date.
      </>,
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
  // The mechanic is V2's own and is the strictest in the roster: repayBorrowBehalf
  // is the ONLY entry point that names another account. mint, borrow, redeem and
  // redeemUnderlying all act on msg.sender alone, so the remaining way value
  // reaches an account from outside is an ordinary cToken transfer.
  {
    const ext = externalActivity;
    if (ext && ext.external > 0) {
      const others = ext.external - (ext.actors[0]?.count ?? 0);
      list.push(
        <>
          {operatorLead(ext, null, "on this account’s timeline")}
          {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
          the owner&rsquo;s. Compound V2 admits exactly one action a third party can take for an account unasked:
          repaying its borrowing. Supplying, borrowing and redeeming all act on whoever calls them, and V2 has no way to
          authorise anyone to act for the account — so an outside row here is always someone paying down this debt, or
          cTokens arriving from another wallet.
          {ext.actors.length === 1
            ? leadName
              ? ` All of it ran through ${leadName}.`
              : " A single address accounts for all of it."
            : leadName
              ? ` Most of it — ${ext.actors[0].count.toLocaleString("en-US")} events — ran through ${leadName}, with the remaining ${others.toLocaleString("en-US")} spread across ${ext.actors.length - 1} other address${ext.actors.length === 2 ? "" : "es"}${secondName ? `, one of them ${secondName}` : ""}.`
              : ` The work is spread across ${ext.actors.length} addresses, the most active of them accounting for ${ext.actors[0].count.toLocaleString("en-US")}.`}
        </>,
      );
    }
  }

  if (lead == null && list.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={list.length > 0 ? list : undefined} />;
}

/** Closed/liquidated mood — narration from the index alone (a terminal
 *  account has no live state to read): the peaks, the closure, the
 *  liquidation record, the door back in. Figures bold only where the card's
 *  chrome shows the same figure (the peaks, the closure date, the counts). */
export function CompoundV2ClosedPositionExplanation({ v }: { v: CompoundV2PositionView }) {
  const liquidated = v.status === "liquidated";
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

  const lead = liquidated ? (
    <>This account closed with liquidation in its record — nothing remains supplied or borrowed:</>
  ) : (
    <>This account ran its course and closed — nothing remains supplied or borrowed:</>
  );

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
        {liquidated && <> Closing with that in its record is what marks the outcome Liquidated rather than Closed.</>}
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
