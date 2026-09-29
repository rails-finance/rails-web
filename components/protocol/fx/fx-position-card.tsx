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
  anchorPriceProv,
  oracleMinPriceProv,
  poolLineProv,
  triggerPriceProv,
  oracleLegAtProv,
  anchorUsdProv,
  minRatioProv,
  minTriggerPriceProv,
  rebalanceClearedProv,
  otherDebtMovesProv,
  socializedCollTakenProv,
  fundingTakenProv,
} from "@/lib/fx/event-provenance";
import { useFxPoolTerms, useFxPricesAt, type FxPoolTerms } from "@/lib/fx/use-event-state";
import { fxBlocksChange } from "@/lib/fx/socialized-reads";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import { formatDate } from "@/lib/date";
import { FX_POOLS } from "@/lib/fx/asset-catalog";
import { fxPositionContent } from "@/lib/fx/position-content";
import { formatNumber, formatUnitsExact } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import { summariseFxDrift, type FxDriftResult } from "@/lib/sources/api/fx-drift";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";

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

/** The socialized rows a detail page holds (rebalances and pool-wide
 *  liquidations), with the position read at each of their blocks
 *  (lib/fx/socialized-reads.tsx), for the card's split. */
export interface FxRebalanceRows {
  blocks: number[];
  firstTs: number;
  lastTs: number;
  /** How many of the rows are pool-wide liquidations, and redemptions. */
  liquidations?: number;
  redemptions?: number;
  /** Blocks that also carry one of the position's own events: a block read
   *  there mixes the two, so the split is not stated. */
  ownEventBlocks: number[];
  reads?: Record<string, FxStateAt> | null;
}

/** What the socialized rows took from the position: Σ over their blocks of
 *  getPosition at block − 1 less at the block, collateral and debt. Null until
 *  every block has read, or where a block also holds an own event. */
function socializedTaken(rows?: FxRebalanceRows): { coll: number; debt: number } | null {
  if (!rows || rows.blocks.length === 0 || !rows.reads) return null;
  if (rows.blocks.some((b) => rows.ownEventBlocks.includes(b))) return null;
  const c = fxBlocksChange(rows.reads, rows.blocks);
  return c ? { coll: -c.coll, debt: -c.debt } : null;
}

/** "rebalances", "liquidations" or "rebalances and liquidations". */
function rowsNoun(rows: FxRebalanceRows): string {
  const liq = rows.liquidations ?? 0;
  const red = rows.redemptions ?? 0;
  const reb = rows.blocks.length - liq - red;
  const parts = [reb > 0 ? "rebalances" : null, liq > 0 ? "liquidations" : null, red > 0 ? "redemptions" : null].filter(
    (p): p is string => p != null,
  );
  return parts.length <= 1 ? (parts[0] ?? "rebalances") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const dateSpan = (a: number, b: number): string =>
  formatDate(a) === formatDate(b) ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`;

/** THE DEBT RECONCILIATION LINE — the debt the position's transactions add up
 *  to, and what moved it without the owner's transaction: on a detail page,
 *  what the rebalance rows cleared (read per row) and the rest, which is other
 *  positions' bad debt added through the debt index; on the listing, the net. */
function SocializedLine({ v, rows }: { v: FxPositionView; rows?: FxRebalanceRows }) {
  const taken = socializedTaken(rows);
  const cleared = taken?.debt ?? null;
  const impliedHuman = formatNumber(v.impliedDebt.amount);
  if (v.activity.eventCount === 0) {
    // Chain-only position: the contract minted it via a path that emits no
    // Operate, so there is nothing to reconcile against.
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
        its transactions add up to <Prov info={impliedDebtProv()}>{impliedHuman} fxUSD</Prov> — awaiting the pool&apos;s
        own figure
      </div>
    );
  }
  const diff = v.socializedDebt ?? v.impliedDebt.amount - v.settled.debts;
  if (Math.abs(diff) <= 1e-9) {
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        its transactions add up to <Prov info={impliedDebtProv()}>{impliedHuman} fxUSD</Prov>
      </div>
    );
  }
  const n = rows ? new Set(rows.blocks).size : 0;
  if (cleared != null && rows && cleared > 0) {
    // settled = implied − cleared + other  →  other = cleared − diff
    const other = cleared - diff;
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        its transactions add up to <Prov info={impliedDebtProv()}>{impliedHuman} fxUSD</Prov>
        {" · "}
        <Prov info={rebalanceClearedProv(n)}>
          <AmountText value={cleared} /> fxUSD
        </Prov>{" "}
        cleared by {rowsNoun(rows)} without the owner&apos;s transaction ({dateSpan(rows.firstTs, rows.lastTs)})
        {Math.abs(other) > 0.005 ? (
          <>
            {" · "}
            <Prov info={otherDebtMovesProv()}>
              {other > 0 ? "+" : "−"}
              <AmountText value={Math.abs(other)} /> fxUSD
            </Prov>{" "}
            {other > 0
              ? "of other positions' bad debt"
              : v.everLiquidated
                ? "left unpaid at liquidation and spread over other positions, net"
                : "by other pool-wide changes"}
          </>
        ) : null}
      </div>
    );
  }
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
      its transactions add up to <Prov info={impliedDebtProv()}>{impliedHuman} fxUSD</Prov>
      {" · "}
      <Prov info={socializedDebtProv(diff >= 0 ? "cleared" : "accrued", v.settled.block)}>
        {diff >= 0 ? "" : "+"}
        <AmountText value={Math.abs(diff)} /> fxUSD
      </Prov>{" "}
      {diff >= 0
        ? "of debt cleared without the owner's transaction, by rebalances net of other positions' bad debt"
        : "of debt added without the owner's transaction, by other positions' bad debt"}
    </div>
  );
}

/** Beside the debt ratio: the anchor price it is read at, the min price the
 *  pool's lines are judged at (both read at the settled block), the lines, and
 *  the min price at which this position reaches each. */
function RatioFootnote({
  v,
  terms,
  px,
}: {
  v: FxPositionView;
  terms: FxPoolTerms | null;
  px: { anchor: number; min: number; block: number } | null;
}) {
  const { colls, debts, debtRatio } = v.settled;
  if (colls == null || debts == null || debtRatio == null || colls <= 0 || debtRatio <= 0) return null;
  const anchor = px?.anchor ?? debts / (colls * debtRatio);
  const sym = v.normalizedSymbol;
  const pctLine = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;
  const fall = (p: number, from: number) => `−${((1 - p / from) * 100).toFixed(1)}%`;
  const minRatio = px ? debts / (colls * px.min) : null;
  return (
    <>
      <StatFootnote>
        at the anchor price{" "}
        <Prov info={px ? oracleLegAtProv("anchor", sym, px.block) : anchorPriceProv(sym, v.settled.block)}>
          {formatUsd(anchor)}
        </Prov>{" "}
        per {sym}
        {v.settled.block != null ? (
          <>
            {" "}
            · settled @ <BlockRef block={v.settled.block} />
          </>
        ) : null}
      </StatFootnote>
      {px && minRatio != null ? (
        <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
          <Prov info={minRatioProv(px.block)}>{(minRatio * 100).toFixed(1)}%</Prov> at the min price{" "}
          <Prov info={oracleLegAtProv("min", sym, px.block)}>{formatUsd(px.min)}</Prov>, the price the pool&apos;s lines
          are judged at
        </div>
      ) : null}
      {terms ? (
        <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
          rebalancing from <Prov info={poolLineProv("rebalance", terms.block)}>{pctLine(terms.rebalanceRatio)}</Prov>,
          liquidation from <Prov info={poolLineProv("liquidate", terms.block)}>{pctLine(terms.liquidateRatio)}</Prov>
        </div>
      ) : null}
      {terms && px && minRatio != null ? (
        <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
          {minRatio >= terms.rebalanceRatio ? (
            <>at or past the rebalance line now</>
          ) : (
            <>
              {pctLine(terms.rebalanceRatio)} if the min price falls to{" "}
              <Prov info={minTriggerPriceProv(pctLine(terms.rebalanceRatio), sym)}>
                {formatUsd(debts / (colls * terms.rebalanceRatio))}
              </Prov>{" "}
              ({fall(debts / (colls * terms.rebalanceRatio), px.min)}), {pctLine(terms.liquidateRatio)} at{" "}
              <Prov info={minTriggerPriceProv(pctLine(terms.liquidateRatio), sym)}>
                {formatUsd(debts / (colls * terms.liquidateRatio))}
              </Prov>{" "}
              ({fall(debts / (colls * terms.liquidateRatio), px.min)})
            </>
          )}
        </div>
      ) : terms ? (
        <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
          {debtRatio >= terms.rebalanceRatio ? (
            <>at or past the rebalance line now</>
          ) : (
            <>
              reaches {pctLine(terms.rebalanceRatio)} if the anchor price falls to{" "}
              <Prov info={triggerPriceProv(pctLine(terms.rebalanceRatio), sym)}>
                {formatUsd(anchor * (debtRatio / terms.rebalanceRatio))}
              </Prov>{" "}
              ({fall(anchor * (debtRatio / terms.rebalanceRatio), anchor)})
            </>
          )}
        </div>
      ) : null}
    </>
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
function CollateralDriftLine({ v, drift, rows }: { v: FxPositionView; drift: FxDriftResult; rows?: FxRebalanceRows }) {
  if (drift.intervals.length === 0) return null;
  const s = summariseFxDrift(drift);
  const taken = s.complete ? socializedTaken(rows) : null;
  const funding = taken ? -s.collsDrift - taken.coll : null;
  // Funding and the rows apart: the rows' blocks read one by one, funding the
  // remainder of the drift (never below zero; if it is, the line keeps the
  // two together).
  if (taken && rows && funding != null && funding >= -DUST && Math.abs(s.collsDrift) > DUST) {
    const n = rows.blocks.length;
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        without the owner&apos;s transaction, {rowsNoun(rows)} took{" "}
        <Prov info={socializedCollTakenProv(v.normalizedSymbol, n)}>
          <AmountText value={Math.abs(taken.coll)} /> {v.normalizedSymbol}
        </Prov>{" "}
        and funding took{" "}
        <Prov info={fundingTakenProv(v.normalizedSymbol)}>
          <AmountText value={Math.abs(funding)} /> {v.normalizedSymbol}
        </Prov>
      </div>
    );
  }
  const scope = s.complete
    ? "without the owner's transaction"
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
        <AmountText value={Math.abs(s.collsDrift)} /> {v.normalizedSymbol}
      </Prov>{" "}
      {scope}
    </div>
  );
}

/** The settled collateral in USD. On the detail page it is valued at the
 *  anchor price of the settled block (read with the min leg beside it), so
 *  the debt divided by it is the debt ratio; the listing keeps the sweep's
 *  stored min-price reading and names its block. */
function CollateralUsdFootnote({ v, px }: { v: FxPositionView; px?: { anchor: number; block: number } | null }) {
  if (px && v.settled.colls != null) {
    return (
      <StatFootnote>
        <Prov info={anchorUsdProv(v.normalizedSymbol, px.block)}>{formatUsd(v.settled.colls * px.anchor)}</Prov> at the
        anchor price
      </StatFootnote>
    );
  }
  if (v.settled.collUsd == null || v.settled.colls == null || v.oracle.priceUsd == null) return null;
  return (
    <StatFootnote>
      <Prov info={fxPositionUsdProv(v.normalizedSymbol, v.oracle.priceBlock)}>{formatUsd(v.settled.collUsd)}</Prov> at
      the min price{" "}
      <Prov info={oracleMinPriceProv(v.normalizedSymbol, v.oracle.priceBlock)}>{formatUsd(v.oracle.priceUsd)}</Prov>
      {v.oracle.priceBlock != null ? (
        <>
          {" "}
          · oracle @ <BlockRef block={v.oracle.priceBlock} />
        </>
      ) : null}
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
  rebalanceRows,
  bodyExtra,
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
  /** The detail page's rebalance rows — the debt line splits what they
   *  cleared from the rest. */
  rebalanceRows?: FxRebalanceRows;
  /** Lines under the card's figures (the loans this NFT has carried). */
  bodyExtra?: React.ReactNode;
}) {
  const st = STATUS[v.status] ?? STATUS.unknown;
  const poolMeta = FX_POOLS[v.pool];
  const terms = useFxPoolTerms(receipts ? v.pool : null);
  // The oracle's anchor and min legs at the settled block (detail page only).
  const pxRead = useFxPricesAt(v.pool, v.positionId, receipts && v.status === "open" ? v.settled.block : null);
  const px =
    pxRead?.anchorPrice != null && pxRead.minPrice != null && v.settled.block != null
      ? { anchor: Number(pxRead.anchorPrice) / 1e18, min: Number(pxRead.minPrice) / 1e18, block: v.settled.block }
      : null;

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
          terms,
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
          collateralFootnote={drift ? <CollateralDriftLine v={v} drift={drift} rows={rebalanceRows} /> : undefined}
          debtFootnote={<SocializedLine v={v} rows={rebalanceRows} />}
        />
        {bodyExtra && <div className="mt-3 border-t border-rb-300/40 pt-3 dark:border-rb-700/40">{bodyExtra}</div>}
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
      learnMore={fxPositionContent({
        status: "open",
        pool: poolMeta.tokenSymbol,
        terms,
        colls: v.settled.colls,
        normalizedSymbol: v.normalizedSymbol,
      })}
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
                <CollateralUsdFootnote v={v} px={px} />
                {drift ? <CollateralDriftLine v={v} drift={drift} rows={rebalanceRows} /> : null}
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
            footnote: <SocializedLine v={v} rows={rebalanceRows} />,
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
            footnote: receipts ? <RatioFootnote v={v} terms={terms} px={px} /> : undefined,
          },
        ]}
      />
      {bodyExtra && <div className="mt-3 border-t border-rb-300/40 pt-3 dark:border-rb-700/40">{bodyExtra}</div>}
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row (identity — the summary
 *  already carries the settled + implied lanes the card asserts). */
export function viewFromSummary(s: FxPositionSummary): FxPositionView {
  return s;
}
