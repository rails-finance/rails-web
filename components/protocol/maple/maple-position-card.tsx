"use client";

// Maple position card, the lender-side analog of the Spark / Moonwell position
// cards. A slot builder (rails-ops TO-DO-position-card 322, 323): `mapleCardSlots`
// turns the wallet's view into one `PositionCardSlots` object and the shared
// `PositionCard` (components/shared/position-card.tsx) draws it.
//
// A Maple lender position is one wallet's ERC-4626 pool shares (plus any
// shares escrowed in the withdrawal queue, still the wallet's position, it
// exits at the pool's exit rate when processed). The two headlines carry the
// two states a lender's money can be in: the pool claim (shares x the exit
// rate read at head, Maple's bookkeeping of an off-chain-collateralized
// loan book; the provenance says so) and the withdrawal queue (escrowed
// shares awaiting a FIFO fill). The panel holds the claim's parts: shares and
// exit rate per pool, the interest earned, the requests and the queued
// shares. Amounts stay in the pool's asset; Rails never pins a stablecoin
// to $1, so no headline carries a USD line.

import type { ReactNode } from "react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { AssetAmount } from "@/components/shared/asset-amount";
import { TokenFigure } from "@/components/shared/token-figure";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { Prov } from "@/components/shared/provenance";
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
import type { MaplePositionSummary, MaplePoolAmount, MaplePeakAmount } from "@/lib/sources/api/maple-positions";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { AmountText, ExactSpan } from "@/components/shared/amount-text";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { MapleMenuRows } from "./maple-menu-rows";

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

/** A pool key's share token (the ERC-4626 pool), the address its icon keys on. */
const shareAddress = (key: string): string | undefined => MAPLE_POOLS.find((m) => m.key === key)?.pool;

const heldIn = (p: MaplePoolAmount): boolean => p.shares + p.escrowedShares > 0;

/** A headline figure: compact, with its token's icon in place of the ticker
 *  (the exact amount in the asset panel and the receipt). */
function CardAmount({
  value,
  symbol,
  exact,
  address,
}: {
  value: number;
  symbol: string;
  exact?: string;
  address?: string;
}) {
  return <AssetAmount value={value} symbol={symbol} exact={exact} address={address} />;
}

/** A panel figure: compact, with its token's 16 px icon in place of the
 *  ticker; `children` is the traced figure. */
function PanelAmount({
  symbol,
  address,
  exact,
  children,
}: {
  symbol: string;
  address?: string;
  exact: string;
  children: ReactNode;
}) {
  return (
    <TokenFigure symbol={symbol} address={address} figure={`${exact} ${symbol}`}>
      {children}
    </TokenFigure>
  );
}

/** The claim headline: each live pool's claim in its token, traced. */
function ClaimLines({ v }: { v: MaplePositionView }) {
  const live = v.pools.filter(heldIn);
  if (live.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {live.map((p) => (
        <div key={p.pool}>
          <Prov info={claimProv(p)}>
            {/* The tip states the claim in its own token; the shares behind
                it are a panel row. */}
            <CardAmount
              value={claimAmount(p)}
              symbol={p.assetSymbol}
              address={p.assetAddress}
              exact={p.currentValue != null ? undefined : String(p.depositedPrincipal)}
            />
          </Prov>
        </div>
      ))}
    </div>
  );
}

/** The queue headline: escrowed shares, valued at the exit rate when read. */
function QueueLines({ v }: { v: MaplePositionView }) {
  const queued = v.pools.filter((p) => p.escrowedShares > 0);
  if (queued.length === 0) return <span className="text-rb-500">None</span>;
  return (
    <div className="flex flex-col gap-1">
      {queued.map((p) => {
        const st = v.poolState?.[p.pool];
        const value = st != null ? mapleExitAssets(p.escrowedSharesRaw, st) : null;
        return (
          <div key={p.pool}>
            <Prov info={positionEscrowProv(p.symbol)}>
              <CardAmount
                value={value ?? p.escrowedShares}
                symbol={value != null ? p.assetSymbol : p.symbol}
                address={value != null ? p.assetAddress : shareAddress(p.pool)}
                exact={value != null ? undefined : formatUnitsExact(p.escrowedSharesRaw, 6)}
              />
            </Prov>
          </div>
        );
      })}
    </div>
  );
}

/** A closed card's peak: the highest share balance per pool. The share peak
 *  leads, since the position IS shares and the slot-exact lane carries every
 *  wallet including the transfer-acquired majority, whose deposited-principal
 *  peak is zero. Valuing the peak at today's exit rate would price a past
 *  holding at a present rate, so no asset value is asserted. */
function PeakLines({ lines }: { lines: MaplePeakAmount[] }) {
  const held = lines.filter((p) => p.peakShares > 0);
  if (held.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {held.map((p) => (
        <div key={p.pool}>
          <Prov info={peakSharesProv(p.symbol)}>
            <CardAmount
              value={p.peakShares}
              symbol={p.symbol}
              exact={String(p.peakShares)}
              address={shareAddress(p.pool)}
            />
          </Prov>
        </div>
      ))}
    </div>
  );
}

/** The principal peak beneath the share peak, for each pool that ever recorded one. */
function PeakDepositedLines({ lines }: { lines: MaplePeakAmount[] }) {
  const deposited = lines.filter((p) => p.peakShares > 0 && p.peakDeposited > 0);
  if (deposited.length === 0) return null;
  return (
    <>
      {deposited.map((p) => (
        <div key={p.pool}>
          <Prov info={peakDepositedProv(p.assetSymbol)}>
            <span>
              peak deposited <AmountText value={p.peakDeposited} format="compact" /> {p.assetSymbol}
            </span>
          </Prov>
        </div>
      ))}
    </>
  );
}

/** The panel rows for the interest the claim holds: "all withdrawn" where the
 *  claim holds none of it, the amount otherwise, and one row per pool the
 *  wallet has left. */
function interestRows(captions?: MapleCardCaptions): PositionPanelRow[] {
  // The claim holds none of what the position earned: the figure lives in
  // Lifetime flows, and the card points there.
  if (captions?.interestWithdrawn)
    return [
      {
        id: "interest-earned",
        label: "Interest earned",
        value: "All withdrawn, total in Lifetime flows",
        tip: "The claim holds none of the interest the position earned; the total is in the Lifetime flows panel.",
      },
    ];
  const it = captions?.interestEarned;
  if (!it || it.amount < 0.01) return [];
  return [
    {
      id: "interest-earned",
      label: "Interest earned",
      value: (
        <Prov info={interestEarnedProv(it.symbol)}>
          <span>
            <AmountText value={it.amount} format="compact" />
          </span>
        </Prov>
      ),
      asset: { symbol: it.symbol, figure: `${formatExact(it.amount)} ${it.symbol}` },
      tip: "What the claim holds beyond the principal the wallet put in, replayed from the wallet's events and the exit rate at head.",
    },
    // A pool the wallet has left: its interest is not in the claim.
    ...(captions?.earnedElsewhere ?? []).map((e) => ({
      id: `interest-${e.symbol}`,
      label: `Interest earned, ${e.symbol} pool`,
      value: (
        <>
          <PanelAmount symbol={e.symbol} exact={formatExact(e.amount)}>
            <Prov info={interestEarnedLifetimeProv(e.symbol)}>
              <span>
                <AmountText value={e.amount} format="compact" />
              </span>
            </Prov>
          </PanelAmount>
          , all withdrawn
        </>
      ),
      tip: `Interest the wallet earned in the ${e.symbol} pool, which it has left; none of it is in the claim.`,
    })),
  ];
}

/** How many withdrawal requests the wallet made, and what became of them. */
function requestValue(requestCount: number, cancelledRequests?: number): string {
  const n = requestCount;
  const c = cancelledRequests ?? 0;
  if (c <= 0 || c > n) return String(n);
  if (c === n) return n === 1 ? "1, cancelled" : `${n}, all cancelled`;
  return `${n}, ${c} cancelled`;
}

export interface MaplePositionCardProps {
  v: MaplePositionView;
  /** `detail` on the wallet's page (receipts, panel, (i)); `listing` in a row. */
  surface: "detail" | "listing";
  /** Requests the wallet cancelled, where the page holds its whole history:
   *  the requests row then says what became of them. */
  cancelledRequests?: number;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: ReactNode;
  /** Copy-this-view control: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (earned interest), computed from the event
   *  stream and the pool chain read (computeMapleCardCaptions). */
  captions?: MapleCardCaptions;
  /** The ⋮'s export shapes. `null`: the ⋮ holds the wallet's rows and the
   *  provenance row alone. */
  exports?: PositionCardExports | null;
}

/** The Maple lender's slots for the shared position card. */
export function mapleCardSlots({
  v,
  surface,
  cancelledRequests,
  explanation,
  viewHref,
  captions,
  exports,
}: MaplePositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const closed = v.status === "closed";
  const live = v.pools.filter(heldIn);

  // The wallet is on the page's wallet row above a detail card.
  const identity = detail ? undefined : (
    <WalletPill wallet={v.wallet} ensName={null} filterProtocol="maple" bookmarkProtocol="maple" />
  );
  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    // The foot strip reads transactions, warnings, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const, countNounVisible: !closed } : {}),
  };
  // Closed, or some shares wait in the withdrawal queue: the wallet still
  // earns on them until the request fills.
  const status: PositionCardStatus | null = closed
    ? {
        word: "Closed",
        tone: "muted",
        tip: "The wallet holds no pool shares and nothing waits in the withdrawal queue.",
      }
    : v.inQueue
      ? {
          word: "In withdrawal queue",
          tone: "caution",
          tip: "Some of the wallet's shares wait in the withdrawal queue to be paid out; they earn interest until then.",
        }
      : null;
  const common = { status, identity, counters };

  const menuLeading = () => (
    <MapleMenuRows address={v.wallet} pagePath={`/ethereum/maple/${v.wallet}`} noun="position" idLabel="Wallet" />
  );

  if (closed) {
    // Nothing held now: the headline is the wallet's height, the peak share
    // balance per pool, with the peak deposited principal beneath where one
    // was ever recorded.
    const heads: PositionCardHead[] = [
      {
        id: "peak-shares",
        label: "Highest recorded pool shares",
        value: <PeakLines lines={v.peakPools} />,
        sub: <PeakDepositedLines lines={v.peakPools} />,
      },
    ];
    const outcome = { word: "Closed", dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined };
    if (!detail) return { ...common, heads, outcome, surface: "listing", menu: null };
    return {
      ...common,
      heads,
      outcome,
      surface: "detail",
      explainer: { body: explanation ?? null, viewHref },
      learnMore: maplePositionContent({ status: "closed" }),
      menu: { leading: menuLeading, exports: exports ?? null },
    };
  }

  const heads: PositionCardHead[] = [
    {
      id: "pool-claim",
      label: "Pool claim",
      labelTip:
        "What the wallet's shares pay out now: the shares times the pool's exit rate, the amount one share pays on withdrawal.",
      value: live.length > 0 ? <ClaimLines v={v} /> : null,
    },
    {
      // This wallet's queued shares; the pool band's "Pool queue" is everyone's.
      id: "queued",
      label: "Queued by this wallet",
      value: <QueueLines v={v} />,
    },
  ];
  if (!detail) return { ...common, heads, surface: "listing", menu: null };

  const shareRows: PositionPanelRow[] = live
    .filter((p) => p.shares > 0)
    .map((p) => ({
      id: `shares-${p.pool}`,
      label: `${p.symbol} held`,
      value: (
        <span className="tabular-nums">
          <PanelAmount symbol={p.symbol} address={shareAddress(p.pool)} exact={formatUnitsExact(p.sharesRaw, 6)}>
            <Prov info={positionSharesProv(p.symbol)}>
              <ExactSpan exact={formatUnitsExact(p.sharesRaw, 6)} symbol={p.symbol}>
                {formatCompact(p.shares)}
              </ExactSpan>
            </Prov>
          </PanelAmount>
          {p.currentValue != null && v.poolState?.[p.pool] != null && (
            <>
              {" "}
              <Prov info={poolExitRateProv(p.assetSymbol, p.symbol, v.poolState[p.pool].blockNumber)}>
                <span className="text-rb-500">@ {v.poolState[p.pool].exitRate.toFixed(4)}</span>
              </Prov>
            </>
          )}
        </span>
      ),
      tip: `${p.symbol} the wallet holds in the pool now, read from the share token's balance, and the rate one share pays on withdrawal. Shares waiting in the withdrawal queue are counted in the claim and listed apart.`,
    }));
  const queueRows: PositionPanelRow[] = [
    ...(v.requestCount > 0
      ? [
          {
            id: "requests",
            label: "Withdrawal requests",
            value: requestValue(v.requestCount, cancelledRequests),
            tip: "Withdrawal requests the wallet has made across the pools, over its whole recorded history, and how many it cancelled.",
          },
        ]
      : []),
    ...v.pools
      .filter((p) => p.escrowedShares > 0)
      .map((p) => ({
        id: `queued-${p.pool}`,
        label: `${p.symbol} in the queue`,
        value: (
          <Prov info={positionEscrowProv(p.symbol)}>
            <ExactSpan exact={formatUnitsExact(p.escrowedSharesRaw, 6)} symbol={p.symbol}>
              {formatCompact(p.escrowedShares)}
            </ExactSpan>
          </Prov>
        ),
        asset: {
          symbol: p.symbol,
          address: shareAddress(p.pool),
          figure: `${formatUnitsExact(p.escrowedSharesRaw, 6)} ${p.symbol}`,
        },
        tip: `${p.symbol} the wallet has escrowed in the withdrawal queue, read from the queue contract. They earn interest until the request fills, at the pool's exit rate.`,
      })),
  ];

  // No health factor or liquidation row: a lender has no liquidation surface;
  // default risk socializes through the pool's exit rate (unrealizedLosses),
  // and the pool band carries that live.
  return {
    ...common,
    heads,
    surface: "detail",
    explainer: { body: explanation ?? null, viewHref },
    learnMore: maplePositionContent({ status: "open", inQueue: v.inQueue }),
    menu: { leading: menuLeading, exports: exports ?? null },
    panel: [[...shareRows, ...interestRows(captions)], queueRows],
  };
}

/** The Maple lender card: its slots, drawn by the shared card. */
export function MaplePositionCard(props: MaplePositionCardProps) {
  return <PositionCard slots={mapleCardSlots(props)} />;
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
