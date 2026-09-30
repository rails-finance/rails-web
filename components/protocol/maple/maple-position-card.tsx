"use client";

// Maple position card — the lender-side analog of the Spark / Moonwell
// position cards, through the SAME shared grammar (OpenPositionStats +
// StatValue) so it lines up with the other explorers.
//
// A Maple lender position is one wallet's ERC-4626 pool shares (plus any
// shares escrowed in the withdrawal queue — still the wallet's position, it
// exits at the pool's exit rate when processed). The two columns carry the
// two states a lender's money can be in: the pool claim (shares × the exit
// rate read at head — Maple's own bookkeeping of an off-chain-collateralized
// loan book; the provenance says so) and the withdrawal queue (escrowed
// shares awaiting a FIFO fill). Amounts stay in the pool's own asset — Rails
// never pins a stablecoin to $1.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatExact, formatUnitsExact, formatNumber } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import {
  positionCurrentValueProv,
  positionPrincipalProv,
  positionSharesProv,
  positionEscrowProv,
  interestEarnedProv,
  interestEarnedLifetimeProv,
  poolExitRateProv,
  peakSharesProv,
  peakDepositedProv,
} from "@/lib/maple/event-provenance";
import type { MapleCardCaptions } from "@/lib/maple/economics";
import { mapleExitAssets } from "@/lib/maple/exit-value";
import { maplePositionContent } from "@/lib/maple/position-content";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import {
  useReserveDisclosure,
  ReserveDisclosureToggle,
  ReserveDisclosureList,
} from "@/components/shared/reserve-disclosure";
import type { MaplePositionSummary, MaplePoolAmount, MaplePeakAmount } from "@/lib/sources/api/maple-positions";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { AmountText, ExactSpan } from "@/components/shared/amount-text";
import { RevealTip } from "@/components/shared/reveal-tip";
import { TipLabel } from "@/components/shared/tip-label";

export interface MaplePositionView {
  wallet: string;
  status: "open" | "closed";
  inQueue: boolean;
  pools: MaplePoolAmount[];
  /** Highest recorded per-pool deposited/shares (closed cards). */
  peakPools: MaplePeakAmount[];
  requestCount: number;
  /** Distinct transactions across the wallet's whole captured history —
   *  COUNT(DISTINCT tx_hash) over every event row, requests included. Several
   *  events can settle in one transaction, so this reads below the timeline's
   *  event count. */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** Per-pool chain state (exit/NAV rates + the liquid/deployed split). */
  poolState?: Record<string, MaplePoolState>;
}

/** The figure a claim line asserts: the current redeemable value (exit rate,
 *  interest included) when the chain read landed, the replayed principal
 *  otherwise. */
const claimAmount = (p: MaplePoolAmount): number => p.currentValue ?? p.depositedPrincipal;

const claimProv = (p: MaplePoolAmount) =>
  p.currentValue != null ? positionCurrentValueProv(p.assetSymbol, p.symbol) : positionPrincipalProv(p.assetSymbol);

/** A card figure in full to three decimals with its token named, the rows'
 *  rule (Polaris's CardAmount). The unit and glyph wrap as one piece, so a
 *  nine-figure claim does not push the card past a phone's width. */
function CardAmount({ value, symbol, exact }: { value: number; symbol: string; exact?: string }) {
  const full = exact ?? formatExact(value);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <RevealTip tip={`${full} ${symbol}`} label={`${full} ${symbol}`}>
        <span data-prov-exact={full} data-prov-symbol={symbol}>
          {formatNumber(value)}
        </span>
      </RevealTip>
      <span data-prov-hidden="" className="inline-flex items-center gap-2">
        <span className="text-[0.55em] font-medium text-rb-500">{symbol}</span>
        <span className="inline-flex items-center justify-center rounded-full bg-raised p-0.5">
          <TokenChipIcon symbol={symbol} size={28} filterable={false} />
        </span>
      </span>
    </span>
  );
}

/** A vertical stack of the wallet's pool claims, each traced. */
function ClaimStack({ v }: { v: MaplePositionView }) {
  const live = v.pools.filter((p) => p.shares + p.escrowedShares > 0);
  if (live.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {live.map((p) => (
        <StatValue key={p.pool}>
          <Prov info={claimProv(p)}>
            {/* The tip states the claim in its own token; the shares behind
                it are the line beneath. */}
            <CardAmount
              value={claimAmount(p)}
              symbol={p.assetSymbol}
              exact={p.currentValue != null ? undefined : String(p.depositedPrincipal)}
            />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** Per-pool share amounts, demoted beneath the claim — the exact lanes. */
function ClaimFootnoteLines({ v, asOf = false }: { v: MaplePositionView; asOf?: boolean }) {
  const live = v.pools.filter((p) => p.shares + p.escrowedShares > 0);
  if (live.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {live.map((p) => {
        const exact = formatUnitsExact(p.sharesRaw, 6);
        return (
          <div key={p.pool}>
            <Prov info={positionSharesProv(p.symbol)}>
              <ExactSpan exact={exact} symbol={p.symbol}>
                {formatNumber(p.shares)} {p.symbol}
              </ExactSpan>
            </Prov>
            {p.currentValue != null && v.poolState?.[p.pool] != null && (
              <>
                {" "}
                <Prov info={poolExitRateProv(p.assetSymbol, p.symbol, v.poolState[p.pool].blockNumber)}>
                  <span className="text-rb-500">@ {v.poolState[p.pool].exitRate.toFixed(4)}</span>
                </Prov>
                {/* The claim moves with the exit rate every block: say which. */}
                {asOf && (
                  <span className="text-rb-500">
                    {" "}
                    · as of block {v.poolState[p.pool].blockNumber.toLocaleString("en-US")}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "incl. X interest" — earned interest already included in the claim above —
 *  or, where the claim holds none of it, "all interest withdrawn". */
function InterestCaption({ captions }: { captions?: MapleCardCaptions }) {
  // The claim holds none of what the position earned: the figure lives in
  // Lifetime flows, and the card points there.
  if (captions?.interestWithdrawn)
    return <div className="text-xs mt-0.5 text-rb-500">all interest withdrawn · total in Lifetime flows</div>;
  const it = captions?.interestEarned;
  if (!it || it.amount < 0.01) return null;
  return (
    <>
      <div className="text-xs mt-0.5 text-rb-500">
        incl.{" "}
        <Prov info={interestEarnedProv(it.symbol)}>
          <span>
            <AmountText value={it.amount} format="number" /> {it.symbol}
          </span>
        </Prov>{" "}
        interest earned
      </div>
      {/* A pool the wallet has left: its interest is not in the claim above. */}
      {(captions?.earnedElsewhere ?? []).map((e) => (
        <div key={e.symbol} className="text-xs mt-0.5 text-rb-500">
          <Prov info={interestEarnedLifetimeProv(e.symbol)}>
            <span>
              <AmountText value={e.amount} format="number" /> {e.symbol}
            </span>
          </Prov>{" "}
          earned in the {e.symbol} pool, all withdrawn
        </div>
      ))}
    </>
  );
}

/** The queue column: escrowed shares, valued at the exit rate when read. */
function QueueStack({ v }: { v: MaplePositionView }) {
  const queued = v.pools.filter((p) => p.escrowedShares > 0);
  if (queued.length === 0)
    return (
      <StatValue>
        <span className="text-rb-500">None</span>
      </StatValue>
    );
  return (
    <div className="flex flex-col gap-1">
      {queued.map((p) => {
        const st = v.poolState?.[p.pool];
        const value = st != null ? mapleExitAssets(p.escrowedSharesRaw, st) : null;
        return (
          <StatValue key={p.pool}>
            <Prov info={positionEscrowProv(p.symbol)}>
              <CardAmount
                value={value ?? p.escrowedShares}
                symbol={value != null ? p.assetSymbol : p.symbol}
                exact={value != null ? undefined : formatUnitsExact(p.escrowedSharesRaw, 6)}
              />
            </Prov>
          </StatValue>
        );
      })}
    </div>
  );
}

/** A vertical stack of per-pool PEAK holdings (highest recorded), no USD.
 *  The share peak leads — the position IS shares, and the slot-exact lane
 *  carries every wallet including the transfer-acquired majority, whose
 *  deposited-principal peak is zero. The principal peak rides beneath it as
 *  a footnote when the wallet ever deposited. Valuing the peak at today's
 *  exit rate would price a past holding at a present rate, so no asset
 *  value is asserted. */
function PeakStack({ lines }: { lines: MaplePeakAmount[] }) {
  const held = lines.filter((p) => p.peakShares > 0);
  if (held.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {held.map((p) => (
        <div key={p.pool}>
          <StatValue>
            <Prov info={peakSharesProv(p.symbol)}>
              <CardAmount value={p.peakShares} symbol={p.symbol} exact={String(p.peakShares)} />
            </Prov>
          </StatValue>
          {p.peakDeposited > 0 && (
            <div className="text-xs mt-0.5 text-rb-500">
              <Prov info={peakDepositedProv(p.assetSymbol)}>
                <span>
                  peak deposited <AmountText value={p.peakDeposited} format="number" /> {p.assetSymbol}
                </span>
              </Prov>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function MaplePositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
  cancelledRequests,
}: {
  v: MaplePositionView;
  receipts?: boolean;
  /** Requests the wallet cancelled, where the page holds its whole history:
   *  the queue footnote then says what became of them. */
  cancelledRequests?: number;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (earned interest) — computed from the event
   *  stream + the pool chain read (computeMapleCardCaptions). Listing cards
   *  omit them. */
  captions?: MapleCardCaptions;
}) {
  // The "Pool claim" side's own list of live pools — collapsed by default
  // once it would list two or more (ui-jobs 57). Computed here (not just
  // below) because the hook must run on every render, before the closed
  // early return.
  const liveCount = v.pools.filter((p) => p.shares + p.escrowedShares > 0).length;
  const claimDisclosure = useReserveDisclosure(liveCount);

  // Closed: the wallet holds no shares and no queue position — the headline
  // is what it held at its height (the peak share balance per pool, with the
  // peak deposited principal beneath where one was ever recorded). No debt
  // column: a lender never carries one, and ClosedPositionStats drops the
  // slot for supply-only positions. rowExtra deliberately does not ride here
  // — the live risk strip describes the chain NOW and never a past life.
  if (v.status === "closed") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={maplePositionContent({ status: "closed" })}
      >
        <ClosedPositionStats
          outcome="closed"
          leadingIdentity={
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol="maple" bookmarkProtocol="maple" />
          }
          identity={<PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} />}
          closedAt={v.lastActivityAt}
          collateralLabel="Highest recorded pool shares"
          collateral={<PeakStack lines={v.peakPools} />}
        />
      </PositionCardShell>
    );
  }

  const modeWord = v.inQueue ? "In withdrawal queue" : "Lending";
  const modeTip = v.inQueue
    ? "Some of the wallet's shares wait in the withdrawal queue to be paid out; they earn interest until then."
    : "The wallet's shares are in the pool earning interest, with none waiting in the withdrawal queue.";
  const live = v.pools.filter((p) => p.shares + p.escrowedShares > 0);
  const requestLine = (() => {
    const n = v.requestCount;
    const c = cancelledRequests ?? 0;
    const noun = `request${n === 1 ? "" : "s"}`;
    if (c <= 0 || c > n) return `${n} ${noun} lifetime`;
    if (c === n) return n === 1 ? "1 request, cancelled" : `${n} requests, all cancelled`;
    return `${n} ${noun}, ${c} cancelled`;
  })();

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={maplePositionContent({ status: "open", inQueue: v.inQueue })}
    >
      <OpenPositionStats
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              <TipLabel text={modeWord} tip={modeTip} />
            </span>
          ) : (
            <RevealTip
              tip="Open: the wallet holds pool shares now, or has shares waiting in the withdrawal queue."
              label="Open: the wallet holds pool shares now, or has shares waiting in the withdrawal queue."
              focusable
              className="focus-ring rounded-sm"
            >
              <LifecyclePill status={v.status} />
            </RevealTip>
          )
        }
        leadingIdentity={
          <WalletPill wallet={v.wallet} ensName={null} filterProtocol="maple" bookmarkProtocol="maple" />
        }
        identity={
          <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} countNounVisible={receipts} />
        }
        columns={[
          {
            label: "Pool claim",
            labelTip:
              "What the wallet's shares pay out now: the shares times the pool's exit rate, the amount one share pays on withdrawal.",
            // Beside a single claim the amount carries its own token badge, so
            // the cluster draws only for the collapsed list of several.
            assetIcons: claimDisclosure.collapsible ? (
              <span className="inline-flex items-center gap-1">
                <InlineAssetCluster
                  symbols={v.pools.filter((p) => p.shares + p.escrowedShares > 0).map((p) => p.assetSymbol)}
                />
                <ReserveDisclosureToggle
                  disclosure={claimDisclosure}
                  count={liveCount}
                  // Each pool's claim in its own token, so a closed list still
                  // reads: "5,000.409 USDC · 5,000.459 USDT".
                  closedLabel={live.map((p, i) => (
                    <span key={p.pool}>
                      {i > 0 ? " · " : ""}
                      <AmountText value={claimAmount(p)} format="number" /> {p.assetSymbol}
                    </span>
                  ))}
                />
              </span>
            ) : undefined,
            value: claimDisclosure.collapsible ? null : <ClaimStack v={v} />,
            footnote: (
              <>
                {claimDisclosure.collapsible ? (
                  <ReserveDisclosureList disclosure={claimDisclosure}>
                    <ClaimStack v={v} />
                    <ClaimFootnoteLines v={v} asOf={receipts} />
                  </ReserveDisclosureList>
                ) : (
                  <ClaimFootnoteLines v={v} asOf={receipts} />
                )}
                <InterestCaption captions={captions} />
              </>
            ),
          },
          {
            // This wallet's queued shares; the pool band's "Pool queue" is
            // everyone's.
            label: "Queued by this wallet",
            value: <QueueStack v={v} />,
            footnote: v.requestCount > 0 ? <div className="text-xs mt-0.5 text-rb-500">{requestLine}</div> : undefined,
          },
          // No health-factor column: a lender has no liquidation surface —
          // default risk socializes through the pool's exit rate
          // (unrealizedLosses), and the access band carries that live.
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: MaplePositionSummary): MaplePositionView {
  return {
    wallet: s.wallet,
    status: s.status,
    inQueue: s.inQueue,
    pools: s.pools,
    peakPools: s.peakPools,
    requestCount: s.requestCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
    poolState: s.poolState,
  };
}
