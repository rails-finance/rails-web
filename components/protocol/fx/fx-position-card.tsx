"use client";

// f(x) position card — the tick-tree analog of the MakerDAO vault card,
// through the SAME shared grammar (OpenPositionStats + StatValue) so it lines
// up with the other explorers.
//
// f(x) socializes funding charges, tick rebalances and bad-debt write-offs
// across every position with NO per-position event, so the CURRENT state here
// is the SETTLED lane: the pool's own getPosition / getPositionDebtRatio
// views, swept server-side at a named head block. Settled amounts are
// RATE-NORMALIZED 1e18 units (stETH-equivalent for the wstETH pool) and the
// card labels them with the normalized symbol, never the deposit token's. USD
// is the settled collateral × the pool's own oracle price, and names the
// block that price was read at. Debt is fxUSD — rendered as fxUSD, never
// equated to dollars.
//
// The event-implied debt (Σ of the events' own deltas) rides along ONLY as
// the reconciliation line: implied vs settled, the difference being the
// socialized lane (funding / rebalances / write-offs). It is always surfaced,
// never hidden — e.g. wsteth-285 shows implied 25,178 fxUSD against settled 0.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import {
  settledCollateralProv,
  settledDebtProv,
  settledDebtRatioProv,
  fxPositionUsdProv,
  impliedDebtProv,
  socializedDebtProv,
  lifetimeCollateralDriftProv,
} from "@/lib/fx/event-provenance";
import { FX_POOLS } from "@/lib/fx/asset-catalog";
import { fxPositionContent } from "@/lib/fx/position-content";
import { formatNumber, formatUnitsExact } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import { summariseFxDrift, type FxDriftResult } from "@/lib/sources/api/fx-drift";

const DUST = 1e-9;

/** The card view IS the listing summary — the settled lane, the implied lane
 *  and the activity meta all arrive on one row (no extra chain merge here). */
export type FxPositionView = FxPositionSummary;

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-positive/20 text-positive" },
  closed: { label: "CLOSED", cls: "bg-rb-300 dark:bg-rb-700 text-foreground/70" },
  // Pre-sweep rows: the settled read hasn't landed, so the lifecycle isn't
  // asserted either way.
  unknown: { label: "UNSETTLED", cls: "bg-rb-300 dark:bg-rb-700 text-foreground/70" },
};

const short = (a: string | null): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** THE SOCIALIZED RECONCILIATION LINE — event-implied debt vs settled debt,
 *  the difference being what funding, socialized rebalances and write-offs
 *  moved with no per-position event. Rendered whenever the settled lane
 *  exists (a zero gap is itself the reconciliation holding); pre-sweep it
 *  states the implied figure as implied, with the settled read pending. */
function SocializedLine({ v }: { v: FxPositionView }) {
  const impliedHuman = formatNumber(v.impliedDebt.amount);
  if (v.activity.eventCount === 0) {
    // Chain-only position: the contract minted it via a path that emits no
    // Operate, so there is nothing to reconcile against — say that, rather
    // than presenting a zero implied sum as if events had been replayed.
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        no recorded events — this position was created by a path that logs nothing; only the pool&apos;s own current
        figures describe it
      </div>
    );
  }
  if (v.settled.debts == null) {
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        events imply <Prov info={impliedDebtProv()}>{impliedHuman} fxUSD</Prov> — awaiting the pool&apos;s own figure
      </div>
    );
  }
  const diff = v.socializedDebt ?? v.impliedDebt.amount - v.settled.debts;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
      events imply <Prov info={impliedDebtProv()}>{impliedHuman} fxUSD</Prov>
      {" · "}
      <Prov info={socializedDebtProv(diff >= 0 ? "cleared" : "accrued", v.settled.block)}>
        {formatNumber(diff)} fxUSD
      </Prov>{" "}
      socialized (rebalances, write-offs, bad debt from other positions)
    </div>
  );
}

/** THE COLLATERAL-SIDE RECONCILIATION LINE — funding is charged on collateral
 *  (the pool's collateral index), never on debt, so a funding-only position
 *  shows 0 fxUSD socialized above and its whole funding bill HERE: the sum of
 *  the socialized lane's collateral drift over the position's quiet stretches
 *  (archive getPosition at each of its own event boundaries; the last stretch
 *  ends at the same settled sweep the collateral figure comes from). Rendered
 *  once the intervals have arrived; while a long history is still being read,
 *  the line says how much of the life it covers. */
function CollateralDriftLine({ v, drift }: { v: FxPositionView; drift: FxDriftResult }) {
  if (drift.intervals.length === 0) return null;
  const s = summariseFxDrift(drift);
  const scope = s.complete
    ? "with no event of its own"
    : `over the latest ${s.intervals} stretch${s.intervals === 1 ? "" : "es"} read so far`;
  const prov = lifetimeCollateralDriftProv(v.normalizedSymbol, s.intervals, s.complete, drift.headBlock);
  if (Math.abs(s.collsDrift) <= DUST) {
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        <Prov info={prov}>0 {v.normalizedSymbol}</Prov> of funding or rebalance movement {scope}
      </div>
    );
  }
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
      funding &amp; rebalances {s.collsDrift < 0 ? "took" : "added"}{" "}
      <Prov info={prov}>
        {formatNumber(Math.abs(s.collsDrift))} {v.normalizedSymbol}
      </Prov>{" "}
      {scope}
    </div>
  );
}

/** Oracle-USD footnote for the settled collateral — the pool's own oracle
 *  price per NORMALIZED unit, with the block it was read at named in the
 *  visible caption as well as the receipt. */
function CollateralUsdFootnote({ v }: { v: FxPositionView }) {
  if (v.settled.collUsd == null || v.settled.colls == null || v.oracle.priceUsd == null) return null;
  return (
    <StatFootnote>
      <Prov info={fxPositionUsdProv(v.normalizedSymbol, v.oracle.priceBlock)}>{formatUsd(v.settled.collUsd)}</Prov>
      {v.oracle.priceBlock != null ? <> · oracle @ block {v.oracle.priceBlock}</> : null}
    </StatFootnote>
  );
}

export function FxPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  drift,
}: {
  v: FxPositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The per-interval socialized drift (the position page's own fetch) —
   *  gives the collateral column its reconciliation line. The listing render
   *  passes nothing and the column keeps its USD footnote only. */
  drift?: FxDriftResult | null;
}) {
  const st = STATUS[v.status] ?? STATUS.unknown;
  const poolMeta = FX_POOLS[v.pool];

  const identityLead = (
    <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
      {v.owner ? (
        <WalletPill wallet={v.owner} ensName={null} filterProtocol="fx" bookmarkProtocol="fx" />
      ) : (
        <span className="font-normal tabular-nums text-rb-400">{short(v.owner)}</span>
      )}
      <span>
        {poolMeta.tokenSymbol} pool
        <span className="ml-2 font-normal tabular-nums text-rb-400">Position #{v.positionId}</span>
      </span>
    </span>
  );

  const meta = (
    <PositionCardMeta
      lastActivityAt={v.activity.lastTs}
      // The summary's eventCount is operates + liquidations; the shared pill
      // claims "excludes liquidations", so the liquidations come off here —
      // they have their own badge beside it.
      eventCount={v.activity.eventCount - v.liquidationCount}
      liquidationCount={v.liquidationCount}
    />
  );

  // Closed: the settled lane has emptied, so the columns carry the settled
  // zeros (there is no peak aggregate on the summary) and the debt footnote
  // keeps the reconciliation — a closed position's implied-vs-settled gap is
  // exactly the socialized burn / write-off story. The Explanation pane rides
  // here too: the ended states carry the protocol's richest stories (the
  // write-off), and the reference narrates its closed and liquidated troves.
  // rowExtra deliberately does not ride here — the live risk strip describes
  // the chain NOW and never a past life's card.
  if (v.status === "closed") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={fxPositionContent({
          status: v.everLiquidated ? "liquidated" : "closed",
          pool: poolMeta.tokenSymbol,
        })}
      >
        <ClosedPositionStats
          outcome={v.everLiquidated ? "liquidated" : "closed"}
          leadingIdentity={identityLead}
          identity={meta}
          closedAt={v.activity.lastTs ?? undefined}
          collateralLabel={CARD_VOCAB.finalCollateral}
          debtLabel={CARD_VOCAB.finalDebt}
          collateral={
            v.settled.colls != null ? (
              <StatValue>
                <Prov info={settledCollateralProv(v.normalizedSymbol, v.settled.block)}>
                  <AssetAmount
                    value={v.settled.colls}
                    symbol={v.normalizedSymbol}
                    exact={formatUnitsExact(v.settled.collsRaw, 18)}
                  />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            v.settled.debts != null ? (
              <StatValue>
                <Prov info={settledDebtProv(v.settled.block)}>
                  <AssetAmount
                    value={v.settled.debts}
                    symbol="fxUSD"
                    exact={formatUnitsExact(v.settled.debtsRaw, 18)}
                  />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          collateralFootnote={drift ? <CollateralDriftLine v={v} drift={drift} /> : undefined}
          debtFootnote={<SocializedLine v={v} />}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): a neutral mode-word pill (what the position is
  // doing NOW). The LISTING render keeps the lifecycle pill; the owner wallet
  // pill (facehash + copy + bookmark) renders on both surfaces.
  // Settled lane first; while it is pending the event-implied debt decides —
  // a null settled read must not assert "Collateral only" over an implied debt.
  const modeWord = (v.settled.debts ?? v.impliedDebt.amount) > 0 ? "Borrowing" : "Collateral only";

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={fxPositionContent({ status: "open", pool: poolMeta.tokenSymbol })}
    >
      <OpenPositionStats
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {modeWord}
            </span>
          ) : (
            <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}>{st.label}</span>
          )
        }
        leadingIdentity={identityLead}
        identity={meta}
        columns={[
          {
            // Settled getPosition read — NORMALIZED units, labeled with the
            // normalized symbol (stETH-equivalent on the wstETH pool), never
            // the deposit token's.
            label: CARD_VOCAB.collateral,
            value:
              v.settled.colls != null ? (
                <StatValue>
                  <Prov info={settledCollateralProv(v.normalizedSymbol, v.settled.block)}>
                    <AssetAmount
                      value={v.settled.colls}
                      symbol={v.normalizedSymbol}
                      exact={formatUnitsExact(v.settled.collsRaw, 18)}
                    />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: (
              <>
                <CollateralUsdFootnote v={v} />
                {drift ? <CollateralDriftLine v={v} drift={drift} /> : null}
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            value:
              v.settled.debts != null ? (
                <StatValue>
                  <Prov info={settledDebtProv(v.settled.block)}>
                    <AssetAmount
                      value={v.settled.debts}
                      symbol="fxUSD"
                      exact={formatUnitsExact(v.settled.debtsRaw, 18)}
                    />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: <SocializedLine v={v} />,
          },
          {
            // getPositionDebtRatio, 0–1 scaled to a percentage — the pool's
            // own risk figure, read in the same settled sweep.
            label: "Debt ratio",
            value:
              v.settled.debtRatio != null ? (
                <StatValue>
                  <Prov info={settledDebtRatioProv(v.settled.block)}>{(v.settled.debtRatio * 100).toFixed(1)}%</Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
          },
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row (identity — the summary
 *  already carries the settled + implied lanes the card asserts). */
export function viewFromSummary(s: FxPositionSummary): FxPositionView {
  return s;
}
