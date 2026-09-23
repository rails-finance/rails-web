"use client";

// Fluid position card — the NFT-keyed analog of the MakerDAO vault card,
// rendered through the SAME shared grammar (OpenPositionStats + StatValue) so
// it lines up with the other explorers.
//
// A Fluid position is a factory-minted ERC721 living in ONE vault (one
// collateral/debt pair), so the card carries exactly two figures — and TWO
// deliberately distinguishable lanes behind them. The settled overlay (the
// vault resolver's own math at a stamped block: liquidations + accrued
// interest applied) is the primary figure when present; the Σ replay lane
// (operate deltas + liquidation attributions, interest-blind between events)
// is the fallback, and each lane's provenance names its basis. Smart-vault
// legs have no ERC20 symbol (the "token" is a Fluid DEX pool) — they render
// as shares; no USD is asserted at this depth.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { settledNowProv, positionSigmaProv, peakLegProv } from "@/lib/fluid/event-provenance";
import { fluidLegHolds } from "@/lib/fluid/explainer-clauses";
import { liveSettledProv } from "@/lib/fluid/live-provenance";
import { fluidPositionContent } from "@/lib/fluid/position-content";
import { pairLabel, poolShareLabel, vaultKindLabel, shortAddress } from "@/lib/fluid/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";

export interface FluidPositionView {
  nftId: string;
  /** The vault contract (the collateral/debt pair this position lives in). */
  vault: string;
  /** Display pair, e.g. "wstETH / USDC" (smart legs read "DEX shares"). */
  pair: string;
  vaultKindLabel: string;
  supplySymbol: string | null;
  borrowSymbol: string | null;
  /** A smart leg's DEX pool composition from the indexed roster — names the
   *  shares on listing rows, where no chain read runs. */
  supplyPoolPair: [string, string] | null;
  borrowPoolPair: [string, string] | null;
  status: "open" | "closed";
  wasLiquidated: boolean;
  /** The engine itself emptied the position (vs sweeps in the record that the
   *  owner later closed out) — keys the terminal pane's closure attribution. */
  fullyLiquidated: boolean;
  /** Σ replay lane (operate deltas + liquidation attributions), human-readable. */
  colNet: string;
  debtNet: string;
  /** Settled overlay at the stamped block (resolver truth: liquidations +
   *  accrued interest applied) — null when the worker hasn't refreshed it. */
  settled: { supply: string; borrow: string; updatedBlock: number | null } | null;
  owner: string | null;
  eventCount: number;
  /** Distinct transactions of the position's own (sweeps excluded) — what the
   *  meta's title asserts; eventCount includes the sweeps done TO it. */
  txCount: number;
  liquidationCount: number;
  /** Highest recorded per-leg amounts (closed cards). */
  peakCol: string;
  peakDebt: string;
  lastActivityAt: number | null;
}

/** A leg's display name, by lane: the API symbol, else the pool pair the
 *  chain read names (a smart leg's shares said as what they are shares OF),
 *  else the indexed roster's pool pair — the listing lane, where no chain
 *  read runs — else bare shares. */
export function fluidLegName(
  v: FluidPositionView,
  side: "supply" | "borrow",
  chain?: FluidPositionChainResponse | null,
): string {
  const sym = side === "supply" ? v.supplySymbol : v.borrowSymbol;
  // The chain read names a TOKEN leg the index left blank too (its ERC-20
  // meta rides the same resolver call), not only the smart legs' pools.
  const chainSym = chain && chain.found ? (side === "supply" ? chain.supplySymbol : chain.borrowSymbol) : null;
  const pool = chain && chain.found ? (side === "supply" ? chain.supplyPoolPair : chain.borrowPoolPair) : null;
  const rosterPool = side === "supply" ? v.supplyPoolPair : v.borrowPoolPair;
  return sym ?? chainSym ?? poolShareLabel(pool) ?? poolShareLabel(rosterPool) ?? "DEX shares";
}

/** The pair as the detail surfaces say it — pool-named smart legs included. */
export function fluidPairText(v: FluidPositionView, chain?: FluidPositionChainResponse | null): string {
  return `${fluidLegName(v, "supply", chain)} / ${fluidLegName(v, "borrow", chain)}`;
}

/** One leg's figure, by lane strength: the page's LIVE resolver read at head
 *  when it landed, the worker's stamped settled overlay next, the Σ replay
 *  last — each wrapped in the provenance that names its basis. */
function LegValue({
  v,
  side,
  chain,
}: {
  v: FluidPositionView;
  side: "supply" | "borrow";
  chain?: FluidPositionChainResponse | null;
}) {
  const sym = fluidLegName(v, side, chain);
  const sigma = side === "supply" ? v.colNet : v.debtNet;
  const settled = v.settled ? (side === "supply" ? v.settled.supply : v.settled.borrow) : null;
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  const exact = live != null ? (side === "supply" ? live.supplyExact : live.borrowExact) : (settled ?? sigma);
  const amount = Number(exact);
  if (!Number.isFinite(amount) || amount <= 0) return <StatDash />;
  const prov =
    live != null
      ? liveSettledProv(side, sym, live.blockNumber)
      : settled != null
        ? settledNowProv(side, sym, v.settled?.updatedBlock)
        : positionSigmaProv(side, sym);
  return (
    <StatValue>
      <Prov info={prov}>
        <AssetAmount value={amount} symbol={sym} exact={exact} />
      </Prov>
    </StatValue>
  );
}

/** Beneath a settled figure, the Σ replay rides as a traced footnote — the
 *  gap between the two lanes is the accrued interest (and any sweep) the
 *  replay deliberately excludes. */
function SigmaFootnote({
  v,
  side,
  chain,
}: {
  v: FluidPositionView;
  side: "supply" | "borrow";
  chain?: FluidPositionChainResponse | null;
}) {
  if (!v.settled && !(chain && chain.found && !chain.chainStale)) return null;
  const sym = fluidLegName(v, side, chain);
  const sigma = side === "supply" ? v.colNet : v.debtNet;
  const n = Number(sigma);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (
    <StatFootnote>
      events add up to{" "}
      <Prov info={positionSigmaProv(side, sym)}>
        {formatNumber(n)} {sym}
      </Prov>
    </StatFootnote>
  );
}

export function FluidPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  chain,
}: {
  v: FluidPositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The live resolver read (detail page) — upgrades the leg figures from the
   *  worker's stamped overlay to the head-block settled state. */
  chain?: FluidPositionChainResponse | null;
}) {
  const pairText = fluidPairText(v, chain);
  const identityMeta = (
    <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} liquidationCount={v.liquidationCount} />
  );

  // The owner pill (facehash + copy + bookmark) leads; the pair rides
  // alongside with the NFT id + vault kind, on both surfaces (buttons, not
  // anchors, so it lives safely inside the listing card's <Link>).
  const leadingIdentity = (
    <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
      {v.owner ? (
        <WalletPill wallet={v.owner} ensName={null} filterProtocol="fluid" bookmarkProtocol="fluid" />
      ) : (
        <span className="font-normal tabular-nums text-rb-400">—</span>
      )}
      <span>
        {pairText}
        <span className="ml-2 font-normal tabular-nums text-rb-400">
          #{v.nftId} · {v.vaultKindLabel}
        </span>
      </span>
    </span>
  );

  // Closed: the settled figures have gone to zero, so the headline is what
  // each leg held at its height — the replayed per-leg MAX (no USD). The
  // Explanation threads through: a terminal position narrates from the index
  // alone, and its pane is the peaks/record/closure story.
  if (v.status === "closed") {
    const peakCol = Number(v.peakCol);
    const peakDebt = Number(v.peakDebt);
    const colName = fluidLegName(v, "supply", chain);
    const debtName = fluidLegName(v, "borrow", chain);
    const peakCoords = { vault: v.vault, pairLabel: pairText, nftId: v.nftId };
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={fluidPositionContent({ status: "closed", wasLiquidated: v.wasLiquidated })}
      >
        <ClosedPositionStats
          outcome={v.wasLiquidated ? "liquidated" : "closed"}
          leadingIdentity={leadingIdentity}
          identity={identityMeta}
          closedAt={v.lastActivityAt ?? undefined}
          collateral={
            Number.isFinite(peakCol) && peakCol > 0 ? (
              <StatValue>
                <Prov info={peakLegProv("supply", colName, peakCoords)}>
                  <AssetAmount value={peakCol} symbol={colName} exact={v.peakCol} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            Number.isFinite(peakDebt) && peakDebt > 0 ? (
              <StatValue>
                <Prov info={peakLegProv("borrow", debtName, peakCoords)}>
                  <AssetAmount value={peakDebt} symbol={debtName} exact={v.peakDebt} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): a neutral mode-word pill (what the position is
  // doing NOW); the LISTING render keeps the lifecycle pill. The liquidated
  // badge is orthogonal history (two-axis model) and rides both.
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  // One rule with the pane below (fluidLegHolds): ε on the Σ replay, `> 0` on a
  // chain figure, so the pill and the prose can never disagree about the debt.
  const hasDebt =
    live != null
      ? fluidLegHolds(live.borrow, "chain")
      : fluidLegHolds(v.settled?.borrow ?? v.debtNet, v.settled ? "chain" : "flows");

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={fluidPositionContent({ status: "open", hasDebt })}
    >
      <OpenPositionStats
        statusPill={
          <span className="flex items-center gap-1.5">
            {receipts ? (
              <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
                {hasDebt ? "Borrowing" : "Collateral only"}
              </span>
            ) : (
              <LifecyclePill status={v.status} />
            )}
          </span>
        }
        leadingIdentity={leadingIdentity}
        identity={identityMeta}
        columns={[
          {
            label: "Collateral",
            value: <LegValue v={v} side="supply" chain={chain} />,
            footnote: <SigmaFootnote v={v} side="supply" chain={chain} />,
          },
          {
            label: "Debt",
            value: <LegValue v={v} side="borrow" chain={chain} />,
            footnote: <SigmaFootnote v={v} side="borrow" chain={chain} />,
          },
          // No health/ratio COLUMN even with the live read: the ratio gets its
          // own strip (FluidRiskCard) + the runway on the heading row — the
          // two-figure card stays two figures.
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: FluidPositionSummary): FluidPositionView {
  return {
    nftId: s.nftId,
    vault: s.vault,
    pair: pairLabel(s.supplySymbol, s.borrowSymbol, s.supplyPoolPair, s.borrowPoolPair),
    vaultKindLabel: vaultKindLabel(s.vaultType),
    supplySymbol: s.supplySymbol,
    borrowSymbol: s.borrowSymbol,
    supplyPoolPair: s.supplyPoolPair ?? null,
    borrowPoolPair: s.borrowPoolPair ?? null,
    status: s.status,
    wasLiquidated: s.wasLiquidated,
    fullyLiquidated: s.fullyLiquidated,
    colNet: s.colNet,
    debtNet: s.debtNet,
    settled: s.settled,
    owner: s.owner,
    eventCount: s.eventCount,
    txCount: s.txCount,
    liquidationCount: s.liquidationCount,
    peakCol: s.peakCol,
    peakDebt: s.peakDebt,
    lastActivityAt: s.lastActivityAt,
  };
}
