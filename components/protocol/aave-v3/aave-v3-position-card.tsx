"use client";

// Aave V3 position card — ON-CHAIN VALUES tier. The lean sibling of the bespoke
// interpreted header (PositionHeader in the old detail page): through the SAME
// shared grammar (OpenPositionStats + StatValue + AssetAmount) as Spark / Morpho
// / Maker so the explorers line up.
//
// An Aave V3 account is cross-collateralised: one wallet supplies and borrows
// MANY reserves within one market (Core / Prime / EtherFi is a separate Pool =
// a separate account). Every headline value is read from the chain — each reserve's
// supplied / borrowed balance is the index's scaled-balance reduction
// (0008/0011): the current rebased figure, interest included, equal to the
// aToken / variableDebtToken `balanceOf` at the indexed head. A LISTING card
// carries no health factor (rails-ops decision 0018): a listing exists to find
// a position, and risk is read live on the position page — whose own Pool
// getUserAccountData read is the only HF this card ever shows.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { reserveDataProv, avgBorrowRateProv, type V3PoolLane } from "@/lib/aave-v3/position-provenance";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { aaveV3LiquidationRead, type AaveV3CardCaptions } from "@/lib/aave-v3/chain-truth-tower";
import {
  AaveV3CardDeploymentProvider,
  useAaveV3CardDeployment,
  type AaveV3CardDeployment,
} from "@/lib/aave-v3/card-deployment";
import { aaveV3PositionContent, type AaveV3PositionDeployment } from "@/lib/aave-v3/position-content";
import { formatUsd } from "@/lib/shared/format-event";
import { fmtLiqPrice } from "@/lib/aave-v4/format";
import { CARD_VOCAB, ratioLabel, notRecordedNote } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import type { AaveV3PositionRow, AaveV3ReserveSummary } from "@/lib/api/fetch-aave-v3-positions";

/** One reserve the wallet holds on a given side, scaled to display units. The
 *  `amountRaw` integer wei string backs the exact reveal (the raw chain figure). */
export interface AaveV3ReserveAmount {
  symbol: string;
  address: string;
  decimals: number;
  amount: number;
  amountRaw: string;
}

export interface AaveV3PositionView {
  wallet: string;
  /** core | prime | etherfi — which Pool this cross-collateralised account is on. */
  market: string;
  /** "unread" is a listing row whose account has not been read from the
   *  chain yet — no state recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  supplies: AaveV3ReserveAmount[];
  borrows: AaveV3ReserveAmount[];
  /** Highest recorded per-reserve supply / debt (closed / liquidated cards). */
  peakSupplies: AaveV3ReserveAmount[];
  peakBorrows: AaveV3ReserveAmount[];
  liquidationCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (IAaveOracle, chain-derived) per reserve, keyed by
   *  lowercased token address. Feeds the card's USD footnotes; a reserve the
   *  oracle didn't price is simply absent (the total then omits). */
  priceByAddress?: Record<string, number>;
  atBlock?: number;
  /** The position page's live health factor (the Pool's getUserAccountData,
   *  read on visit). Null = no debt when read; meaningless when
   *  `chainHfStale`. A listing view never carries one (0018). */
  healthFactor?: number | null;
  /** True when no live read stands behind `healthFactor` — every listing
   *  view, and the position page until its chain read lands — so the HF
   *  column is omitted rather than asserted. */
  chainHfStale?: boolean;
}

/** On-chain oracle USD for one reserve; null when this market didn't price it. */
function reserveUsd(v: AaveV3PositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of reserves, with the STRICT guard from Aave's on-chain
 *  USD: null the moment any contributing reserve is unpriced, so a partial total is
 *  never asserted (it degrades to no footnote). */
function totalUsd(v: AaveV3PositionView, reserves: AaveV3ReserveAmount[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of reserves) {
    if (r.amount <= 0) continue;
    const u = reserveUsd(v, r.address, r.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

/** Reserves sorted by oracle-USD value, largest first — so the capped icon
 *  cluster and the detail-page leg lines foreground worth, not naked token
 *  count (76 wstETH outranks 8.5K sDAI). Falls back to the incoming
 *  raw-balance order the moment any leg is unpriced or `priceByAddress` is
 *  absent — a rank the oracle can't back is never asserted. */
function rankByValue(v: AaveV3PositionView, reserves: AaveV3ReserveAmount[]): AaveV3ReserveAmount[] {
  const usd = new Map<string, number>();
  for (const r of reserves) {
    const u = reserveUsd(v, r.address, r.amount);
    if (u == null) return reserves;
    usd.set(r.address, u);
  }
  return [...reserves].sort((a, b) => (usd.get(b.address) ?? 0) - (usd.get(a.address) ?? 0));
}

/** Per-reserve token amounts, demoted beneath the USD headline — still the
 *  strict chain reads (each line traced, exact figure on hover), just no longer
 *  giving dust equal billing with the aggregate. */
function ReserveFootnoteLines({
  reserves,
  side,
  atBlock,
}: {
  reserves: AaveV3ReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
}) {
  const dep = useAaveV3CardDeployment();
  if (reserves.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {reserves.map((r) => {
        const exact = formatUnitsExact(r.amountRaw, r.decimals);
        return (
          <div key={r.address}>
            <Prov info={side === "supply" ? dep.supply(r.symbol, atBlock) : dep.debt(r.symbol, atBlock)}>
              <span title={`${exact} ${r.symbol}`} data-prov-exact={exact} data-prov-symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </span>
            </Prov>
          </div>
        );
      })}
    </div>
  );
}

/** "incl. $X interest" — accrued interest already included in the column's
 *  balance above (it grew it), computed with the strict attribution gates
 *  (computeAaveV3CardCaptions). Hidden below a cent — dust isn't worth a line. */
function InterestCaption({ side, usd }: { side: "supply" | "debt"; usd: number | null | undefined }) {
  const receipt = useAaveV3CardDeployment().interestCaption;
  if (usd == null || usd < 0.01 || !receipt) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      incl. <Prov info={receipt(side)}>{formatUsd(usd)}</Prov> interest
    </div>
  );
}

/** "X% borrow rate" — the live Pool rate on the single borrowed reserve, or the
 *  debt-USD-weighted average across several (computeAaveV3CardCaptions gates). */
function BorrowRateCaption({ rate, pool }: { rate: AaveV3CardCaptions["borrowRate"] | undefined; pool?: string }) {
  // The receipt names the page's own Pool and route when the page declared one
  // (a Base lender); Ethereum's market Pool, resolved from the address the
  // read hit (the page's market Pool when the read names none), otherwise.
  const lane = useV3Pool();
  const laneOrPool: V3PoolLane = lane.positionRoute ? { ...lane, address: pool || lane.address } : pool || lane.address;
  if (!rate) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov
        info={
          rate.avg
            ? avgBorrowRateProv(laneOrPool)
            : reserveDataProv("Variable borrow APR", "currentVariableBorrowRate", rate.symbol, laneOrPool)
        }
      >
        {rate.pct.toFixed(2)}%
      </Prov>{" "}
      {rate.avg ? "avg borrow rate" : "borrow rate"}
    </div>
  );
}

/** Compact liquidation read beneath the Health Factor stat — the V4 spoke-card
 *  treatment: the tangible restatement of HF, not a peer of it. One supplied
 *  reserve carrying ≥99.5% of the oracle-priced collateral anchors a
 *  single-asset liquidation price (oracle price ÷ HF — both legs on-chain, so
 *  it survives the gate); otherwise the 1 − 1/HF combined-collateral drop.
 *  Nothing when there's no debt, HF ≤ 1 (the headline already says
 *  liquidatable), or HF reads ∞. */
function LiquidationFootnote({ v }: { v: AaveV3PositionView }) {
  const dep = useAaveV3CardDeployment();
  const read = aaveV3LiquidationRead(v);
  if (read.single) {
    return (
      <div className="text-xs mt-0.5 text-rb-500 inline-flex items-center gap-1">
        Liquidates at
        <TokenChipIcon symbol={read.single.symbol} size={14} filterable={false} />
        <Prov info={dep.liqPrice(read.single.symbol)}>{fmtLiqPrice(read.single.liqPrice)}</Prov>
      </div>
    );
  }
  if (read.dropPct == null) return null;
  // Multi-collateral: 1 − 1/HF, a pure function of the traced HF above.
  return <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {read.dropPct.toFixed(0)}% drop</div>;
}

/** Neutral HF headline (Rails doesn't color-code risk): "∞" above 100 — the
 *  figure stops meaning anything as a ratio there — else two decimals. */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hf.toFixed(2);
}

function rawBigInt(raw: string | null | undefined): bigint {
  if (raw == null || raw === "") return BigInt(0);
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return BigInt(0);
  }
}

function scaleRaw(raw: string | null | undefined, decimals: number): number {
  return Number(rawBigInt(raw)) / 10 ** decimals;
}

/** A vertical stack of the wallet's reserves on one side, each traced. */
function ReserveStack({
  reserves,
  side,
  atBlock,
}: {
  reserves: AaveV3ReserveAmount[];
  side: "supply" | "debt";
  atBlock?: number;
}) {
  const dep = useAaveV3CardDeployment();
  if (reserves.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {reserves.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? dep.supply(r.symbol, atBlock) : dep.debt(r.symbol, atBlock)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** A vertical stack of per-reserve PEAK amounts (highest recorded), each traced
 *  to its own receipt — the scaled-delta reducer's largest running claim
 *  (aToken transfers included on the supply side), valued at the index of the
 *  moment it stood, interest to then included. No USD: the peaks are maxima at
 *  different moments, so pricing them at one block would assert a portfolio
 *  that never existed. */
function PeakStack({ reserves, side }: { reserves: AaveV3ReserveAmount[]; side: "supply" | "debt" }) {
  const dep = useAaveV3CardDeployment();
  if (reserves.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {reserves.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? dep.peakSupply(r.symbol) : dep.peakDebt(r.symbol)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

export function AaveV3PositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
  deployment,
  peaks = true,
}: {
  v: AaveV3PositionView;
  receipts?: boolean;
  /** Which deployment the row describes — its session, market label and the
   *  receipts behind every figure. Ethereum's indexed lane by default; a Base
   *  lender passes its own (lib/aave-v3/card-deployment.tsx). */
  deployment?: AaveV3CardDeployment;
  /** Whether this lane records "highest recorded" balances at all. A Base
   *  LISTING row has no replay behind it, so its closed cards say so instead
   *  of showing a dash as if nothing was ever held; the position page's
   *  sweep supplies the peaks, so it keeps the default. */
  peaks?: boolean;
  /** Context content riding the shell's heading-button row (the detail page
   *  passes the compact liquidation runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home) —
   *  narration bullets + the risk strips describing the position NOW. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (accrued interest, borrow rate) — computed from
   *  the event stream + live Pool read (computeAaveV3CardCaptions). Listing
   *  cards omit them; the liquidation caption needs neither and always rides. */
  captions?: AaveV3CardCaptions;
}) {
  if (deployment) {
    return (
      <AaveV3CardDeploymentProvider value={deployment}>
        <AaveV3PositionCardBody
          v={v}
          receipts={receipts}
          rowExtra={rowExtra}
          explanation={explanation}
          viewHref={viewHref}
          captions={captions}
          peaks={peaks}
        />
      </AaveV3CardDeploymentProvider>
    );
  }
  return (
    <AaveV3PositionCardBody
      v={v}
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      captions={captions}
      peaks={peaks}
    />
  );
}

function AaveV3PositionCardBody({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
  peaks = true,
}: {
  v: AaveV3PositionView;
  receipts?: boolean;
  rowExtra?: React.ReactNode;
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  captions?: AaveV3CardCaptions;
  peaks?: boolean;
}) {
  const dep = useAaveV3CardDeployment();
  // Only a deployment that reads the HF live for the page carries a receipt
  // for it; a listing deployment has none, and the column stays off.
  const hfProv = dep.healthFactor;
  const marketLabel = dep.marketLabel(v.market);
  const collUsd = totalUsd(v, v.supplies);
  const debtUsd = totalUsd(v, v.borrows);
  // The "?" cell every state panel owns — the same content function serves
  // Aave V3 on Ethereum, Aave V3 on Base, and Seamless; only the deployment
  // named by the card's own session (set via AaveV3CardDeploymentProvider)
  // changes the prose.
  const positionDeployment: AaveV3PositionDeployment =
    dep.session === "aave-v3-base" || dep.session === "seamless" ? dep.session : "aave-v3";

  // Closed / liquidated: the account holds no open reserves, so the headline is
  // what each asset held at its height — highest recorded per-reserve supply +
  // debt (chain-state MAX over the account's life, per asset; no USD).
  if (v.status === "closed" || v.status === "liquidated") {
    const noPeaksNote = peaks ? undefined : (
      <div className="text-xs mt-0.5 text-rb-500">{notRecordedNote("position")}</div>
    );
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={aaveV3PositionContent({ status: v.status, deployment: positionDeployment })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={
            <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
              <WalletPill
                wallet={v.wallet}
                ensName={null}
                filterProtocol={dep.session}
                bookmarkProtocol={dep.session}
              />
              {marketLabel}
            </span>
          }
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          collateral={peaks ? <PeakStack reserves={v.peakSupplies} side="supply" /> : <StatDash />}
          collateralFootnote={noPeaksNote}
          debt={peaks ? <PeakStack reserves={v.peakBorrows} side="debt" /> : <StatDash />}
          debtFootnote={noPeaksNote}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): the V4 spoke-card header grammar — a neutral
  // mode-word pill (what the account is doing NOW: Borrowing / Supply only /
  // Liquidatable, not a lifecycle word). The LISTING render keeps the
  // lifecycle pill: status is the listing's filter axis. The wallet pill
  // (facehash + copyable address + bookmark) renders on both surfaces.
  const modeWord =
    v.borrows.length > 0
      ? v.healthFactor != null && v.healthFactor < 1
        ? "Liquidatable"
        : "Borrowing"
      : "Supply only";

  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it), so it doubles as the surface discriminator: the
  // listing omits the per-leg lines (V4 spoke-card parity — USD headline +
  // capped cluster only), the detail page keeps the full traced list.
  const isDetail = receipts;
  // Value order for the cluster and the leg lines — the three visible icons
  // are the three largest by oracle USD, and the detail legs match.
  const suppliesRanked = rankByValue(v, v.supplies);
  const borrowsRanked = rankByValue(v, v.borrows);

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={aaveV3PositionContent({
        status: v.status,
        deployment: positionDeployment,
        hasDebt: v.borrows.length > 0,
      })}
    >
      <OpenPositionStats
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {modeWord}
            </span>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        // The protocol name is redundant inside the Aave V3 explorer, so the wallet
        // leads and the Pool (Core / Prime / EtherFi — which cross-collateralised
        // account) follows. WalletPill on both surfaces (buttons, not anchors, so it
        // lives safely inside the listing card's <Link>); the bookmark rides the
        // pill — it bookmarks the wallet, so the address row is its accurate home.
        leadingIdentity={
          <span className="flex items-center gap-2">
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol={dep.session} bookmarkProtocol={dep.session} />
            {marketLabel && <span className="text-xs font-semibold text-rb-500">{marketLabel}</span>}
          </span>
        }
        // Right-hand activity-meta cluster: time-ago, transaction count, liquidation.
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            liquidationCount={v.liquidationCount}
          />
        }
        columns={[
          // The V4 spoke-card grammar: ONE oracle-USD figure leads each side
          // (the asset cluster carries the identities), the per-reserve token
          // amounts demote to traced footnote lines. When any contributing
          // reserve is unpriced the token stack stays the headline — a partial
          // USD total is never asserted.
          {
            label: CARD_VOCAB.collateral,
            assetIcons:
              v.supplies.length > 0 ? <InlineAssetCluster symbols={suppliesRanked.map((r) => r.symbol)} /> : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd} info={dep.usd("Collateral")} />
              ) : (
                <ReserveStack reserves={v.supplies} side="supply" atBlock={v.atBlock} />
              ),
            footnote: (
              <>
                {isDetail && collUsd != null && (
                  <ReserveFootnoteLines reserves={suppliesRanked} side="supply" atBlock={v.atBlock} />
                )}
                <InterestCaption side="supply" usd={captions?.supplyInterestUsd} />
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              v.borrows.length > 0 ? <InlineAssetCluster symbols={borrowsRanked.map((r) => r.symbol)} /> : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd} info={dep.usd("Borrowed")} />
              ) : (
                <ReserveStack reserves={v.borrows} side="debt" atBlock={v.atBlock} />
              ),
            footnote: (
              <>
                {isDetail && debtUsd != null && (
                  <ReserveFootnoteLines reserves={borrowsRanked} side="debt" atBlock={v.atBlock} />
                )}
                <BorrowRateCaption rate={captions?.borrowRate} pool={captions?.pool} />
                <InterestCaption side="debt" usd={captions?.debtInterestUsd} />
              </>
            ),
          },
          // The live HF — the position page's own chain read. Omitted (not
          // dashed) on every listing view and until the page's read lands
          // (`chainHfStale`), and on a deployment with no live HF receipt —
          // an unasserted layer, per the chain-state charter. A read wallet
          // with no debt reads "No debt" (HF is undefined, ∞ in protocol terms).
          v.chainHfStale || !hfProv
            ? null
            : {
                label: ratioLabel("pooled"),
                value:
                  v.healthFactor == null ? (
                    <StatValue color="text-rb-400">No debt</StatValue>
                  ) : (
                    <StatValue>
                      <Prov info={hfProv(v.market, v.atBlock)}>{hfLabel(v.healthFactor)}</Prov>
                    </StatValue>
                  ),
                // The liquidation read beneath HF — its tangible restatement
                // (single collateral → oracle liq price, multi → 1 − 1/HF drop).
                footnote: <LiquidationFootnote v={v} />,
              },
        ]}
      />
    </PositionCardShell>
  );
}

function statusOf(hasOpen: boolean, liquidationCount: number): AaveV3PositionView["status"] {
  if (hasOpen) return "open";
  return liquidationCount > 0 ? "liquidated" : "closed";
}

/** Split a set of reserve rows into supplied + borrowed sides, scaled to display
 *  units and ranked by raw balance. Reused for both the OPEN balances (`reserves`)
 *  and the PEAK balances (`peakReserves`, which reuse the same shape — peak supply
 *  in supplyBalanceRaw, peak debt in debtBalanceRaw). Strict chain-state: every
 *  reserve with a non-zero raw balance is shown (no dust floor) — the exact figure
 *  rides the reveal; the compact headline never renders a non-zero as "0". */
function splitSides(reserves: AaveV3ReserveSummary[]): {
  supplies: AaveV3ReserveAmount[];
  borrows: AaveV3ReserveAmount[];
} {
  const supplies: (AaveV3ReserveAmount & { _rank: number })[] = [];
  const borrows: (AaveV3ReserveAmount & { _rank: number })[] = [];
  for (const r of reserves) {
    if (rawBigInt(r.supplyBalanceRaw) > BigInt(0))
      supplies.push({
        symbol: r.symbol,
        address: r.address,
        decimals: r.decimals,
        amount: scaleRaw(r.supplyBalanceRaw, r.decimals),
        amountRaw: r.supplyBalanceRaw,
        _rank: scaleRaw(r.supplyBalanceRaw, r.decimals),
      });
    if (rawBigInt(r.debtBalanceRaw) > BigInt(0))
      borrows.push({
        symbol: r.symbol,
        address: r.address,
        decimals: r.decimals,
        amount: scaleRaw(r.debtBalanceRaw, r.decimals),
        amountRaw: r.debtBalanceRaw,
        _rank: scaleRaw(r.debtBalanceRaw, r.decimals),
      });
  }
  supplies.sort((a, b) => b._rank - a._rank);
  borrows.sort((a, b) => b._rank - a._rank);
  const strip = ({ _rank, ...r }: AaveV3ReserveAmount & { _rank: number }): AaveV3ReserveAmount => {
    void _rank;
    return r;
  };
  return { supplies: supplies.map(strip), borrows: borrows.map(strip) };
}

/** Build a card view from a listing row — split the per-reserve balances (open +
 *  peak) into the supplied + borrowed sides. The view carries no health factor:
 *  the Ethereum position page merges its own live read over this (`chain`);
 *  the Base position pages build their view from the live read directly. */
export function viewFromSummary(row: AaveV3PositionRow): AaveV3PositionView {
  const { supplies, borrows } = splitSides(row.reserves);
  const { supplies: peakSupplies, borrows: peakBorrows } = splitSides(row.peakReserves ?? []);

  // Prefer the route's authoritative lifecycle status (mv_aave_v3_wallets); fall
  // back to deriving it from openness for older route responses.
  const hasOpen = supplies.length > 0 || borrows.length > 0;
  const status =
    row.status === "open" || row.status === "closed" || row.status === "liquidated" || row.status === "unread"
      ? row.status
      : statusOf(hasOpen, row.liquidationCount);
  return {
    wallet: row.wallet,
    market: row.market ?? "core",
    status,
    supplies,
    borrows,
    peakSupplies,
    peakBorrows,
    liquidationCount: row.liquidationCount,
    txCount: row.txCount,
    lastActivityAt: row.lastActivityAt,
    priceByAddress: row.priceByAddress,
    // A Base lender's row names the block its chain figures were read at.
    atBlock: row.chainBlock ?? undefined,
    // A listing view never carries a health factor (0018): the row's snapshot
    // HF is not read, and the position page's own live read is the only one
    // the card shows.
    healthFactor: null,
    chainHfStale: true,
  };
}
