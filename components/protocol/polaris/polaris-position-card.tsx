"use client";

// Polaris CDP card — one (market, cdpId), through the SAME shared grammar
// (OpenPositionStats + StatValue) as the other explorers.
//
// THE GRAIN IS THE CDP NFT: the card is one CDP in one market — the id and
// the market are the identity, the holder a mutable fact shown beside them.
// UNITS ARE NATIVE: pETH collateral, the market's stablecoin as debt. USD
// appears once, as the collateral's value by the protocol's own price feed,
// labelled as a testnet figure.
//
// STATUS IS TWO-AXIS. The lifecycle pill says open / closed / liquidated; the
// liquidation history is the orthogonal axis — on this protocol an id is
// minted once, so a liquidated CDP is always terminal, but the meta cluster
// still carries the count the way every explorer does.
//
// THE RATIO COLUMN STATES ONE FIGURE PER LANE, and says which it is. On the
// chain lane it is the contract's own getICR(id) against the MCR in force
// (defensive-mode MCR when that mode is on) — stated flat. On the index lane
// it is an APPROXIMATION, marked ≈: the row's last emitted collateral and
// debt priced at the market's own feed, from the one market-board read the
// listing makes per page load (never one read per row). Interest since the
// last touch and the PSM's pending share settle only at the next touch, so
// the two can differ — the ≈, the tooltip and the receipt all say so. Without
// the board read the column stays a dash (a pulse while the fetch is in
// flight); it never states a ratio it cannot price.
//
// The card view builds from EITHER lane: `viewFromSummary` (the index row —
// the last CDPUpdated's resulting figures) or `viewFromChain` (the live
// overlay — the cdpManager's own entire figures at head, the primary truth on
// the detail page).

import { useState } from "react";
import { Image as ImageIcon, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { RevealTip } from "@/components/shared/reveal-tip";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash, StatFootnote } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatUnitsExact, formatNumber, formatUsdValue } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { latestStateProv, peakProv } from "@/lib/polaris/event-provenance";
import {
  listingIcrProv,
  listingLiqPriceProv,
  liveEntireProv,
  liveEquityProv,
  liveIcrProv,
  liveMcrProv,
  liveOwnerProv,
  livePendingProv,
  liveRateProv,
  liveUsdValueProv,
} from "@/lib/polaris/live-provenance";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { polarisPositionContent } from "@/lib/polaris/position-content";
import { polarisCdpNftUrl } from "@/lib/polaris/routes";
import type { Provenance } from "@/components/shared/provenance";
import type { PolarisPositionSummary, PolarisPositionStatus } from "@/lib/sources/api/polaris-positions";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
// Type-only — lib/sources/chain/* is server-only, and an `import type` is
// erased before the client bundle is built (the markets view does the same).
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";

export interface PolarisPositionView {
  market: PolarisMarket;
  cdpId: string;
  stableSymbol: string;
  /** The current holder — null once the NFT is burned and no index row names
   *  the last one. */
  owner: string | null;
  status: PolarisPositionStatus;
  liquidated: boolean;
  /** Collateral (pETH) — the entire figure on the chain lane, the last
   *  CDPUpdated's resulting figure on the index lane. */
  coll: number;
  collRaw: string | null;
  debt: number;
  debtRaw: string | null;
  /** Collateral valued by the protocol's own feed — the position read on the
   *  chain lane, the market board's own legs on the index lane. */
  collUsd: number | null;
  /** Chain lane only — entireColl × the feed's pETH-in-debt-unit price, minus
   *  entireDebt. A valuation at the block, not a profit — may be negative. */
  equity: number | null;
  /** The collateral ratio as a fraction; null without debt, or without a
   *  price. On the chain lane it is getICR(id); on the index lane the row's
   *  own coll × the market's feed ÷ its own debt — an approximation, and the
   *  card marks it one. */
  icr: number | null;
  mcr: number | null;
  defensiveMode: boolean;
  /** Index lane only — debt × the MCR in force ÷ coll: the pETH price, in the
   *  market's own unit, at which the row's stated figures reach the floor. */
  liqPrice: number | null;
  /** The market-board read the ratio needs has not answered yet — the ratio
   *  slot holds a pulse rather than a dash. Never true once it has settled,
   *  answered or not. */
  pricePending: boolean;
  /** Chain lane only — the pending legs since the last touch. */
  pendingInterest: number | null;
  pendingStables: number | null;
  pendingReward: number | null;
  /** Chain lane only — the rate in force, fraction. */
  interestRate: number | null;
  /** Terminal-card headlines (lifetime maxima). */
  peakColl: number;
  peakDebt: number;
  lastActivityAt: number | null;
  eventCount: number;
  liqCount: number;
  transferCount: number;
  /** Which lane the figures assert. */
  basis: "chain" | "index";
  blockNumber: number | null;
}

const STATUS: Record<PolarisPositionStatus, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-positive/20 text-positive" },
  closed: { label: "CLOSED", cls: "bg-rb-300 dark:bg-rb-700 text-foreground/70" },
  liquidated: { label: "LIQUIDATED", cls: "bg-red-500/20 text-red-500" },
};

const collProv = (v: PolarisPositionView): Provenance =>
  v.basis === "chain" ? liveEntireProv("coll", v.market) : latestStateProv("coll", v.market);
const debtProv = (v: PolarisPositionView): Provenance =>
  v.basis === "chain" ? liveEntireProv("debt", v.market) : latestStateProv("debt", v.market);

const pct = (f: number): string => `${(f * 100).toFixed(1)}%`;

/** A liquidation price in the market's own unit — never "$": GOLDp's unit is
 *  a troy ounce of gold, and the protocol prices nothing in dollars here.
 *  Magnitude-aware the way the shared formatLiquidationPrice is, minus the
 *  currency sign, because the two markets' prices sit four orders apart
 *  (USDp ~6,000; GOLDp ~1.4). */
/** A pETH price in the market's own stablecoin, at a readable grain: three
 *  decimals under 1, two under 100, whole numbers above (USDp's feed runs in
 *  the thousands, where a compact "5K" would hide the move). Shared with the
 *  "Since its last touch" block, which states the same quantity at both ends
 *  of its window. */
export const formatPethPrice = (p: number): string => {
  if (p < 0.01) return "<0.01";
  if (p < 1) return p.toFixed(3);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

/** What the ≈ on the listing's ratio means, in one sentence. Rides the shared
 *  RevealTip (hover on desktop, first tap on touch) beside the <Prov>
 *  receipt — the tooltip says what the figure IS, the receipt where it came
 *  from. */
const LISTING_ICR_TIP =
  "An estimate: the CDP's last stated collateral and debt, valued at the market's price feed as of the latest read. Interest since the last touch and any PSM share are not in it. The CDP's page states the contract's own ratio.";

/** RevealTip's bubble is sized for a number (nowrap, tabular figures); a
 *  sentence needs its own width and normal prose settings, declared on the
 *  child so they win over the bubble's own. */
const TIP_PROSE = "block w-64 whitespace-normal text-left font-normal normal-nums leading-snug";

/** The CDP-grain identity: market chip · CDP id, then the two things a reader
 *  wants to do with the id — take it away, and look at the NFT it names.
 *
 *  Both are <button>s, never <a>s: on the listing this row renders inside the
 *  driver's row <Link>, and a nested anchor is invalid HTML. So the NFT link
 *  is a button + window.open, and both handlers preventDefault/stopPropagation
 *  so a click copies or opens instead of navigating to the CDP's own page.
 *  Modelled on the V2 trove row (trove-identity-row.tsx), down to the 1.5 s
 *  "Copied" state and the copy/check glyph pair. */
function CdpIdentity({ v }: { v: PolarisPositionView }) {
  const cfg = POLARIS_MARKET_CONFIG[v.market];
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-rb-500 tabular-nums">
      <TokenChipIcon symbol={cfg.stable.symbol} address={cfg.stable.address} size={14} filterable={false} />
      {cfg.stable.symbol}
      <span className="text-rb-400">·</span>
      CDP #{v.cdpId}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // The bare number, not "CDP #8" — what a reader pastes into a search
          // box, a URL or the contract's own getCDP(id).
          navigator.clipboard.writeText(v.cdpId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={copied ? "Copied" : "Copy CDP number"}
        title={copied ? "Copied!" : "Copy"}
        className="text-rb-500 hover:text-foreground cursor-pointer"
      >
        <Icon name={copied ? "check" : "copy"} size={12} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(polarisCdpNftUrl(v.market, v.cdpId), "_blank", "noopener,noreferrer");
        }}
        aria-label="View the CDP NFT on Etherscan"
        title="View the CDP NFT on Etherscan"
        className="inline-flex items-center gap-1 text-rb-500 hover:text-foreground transition-colors cursor-pointer"
      >
        <ImageIcon size={12} />
        <Link2 size={12} className="-rotate-45" />
      </button>
    </span>
  );
}

function MetaCluster({ v }: { v: PolarisPositionView }) {
  return (
    <PositionCardMeta
      lastActivityAt={v.lastActivityAt}
      eventCount={v.eventCount}
      liquidationCount={v.liqCount > 0 ? v.liqCount : null}
    />
  );
}

/** The card's identity lead: the holder's wallet pill (the bookmark keys off
 *  the holder), then the CDP's own identity. */
function IdentityLead({ v }: { v: PolarisPositionView }) {
  if (!v.owner) return <CdpIdentity v={v} />;
  const pill = <WalletPill wallet={v.owner} ensName={null} filterProtocol="polaris" bookmarkProtocol="polaris" />;
  return (
    <span className="flex items-center gap-2">
      {/* On the chain lane the holder is the NFT's own ownerOf at head; the
          index lane's holder is the last Transfer's recipient (its receipt
          rides the transfer rows). */}
      {v.basis === "chain" ? (
        <Prov info={liveOwnerProv(v.market)} value={v.owner}>
          {pill}
        </Prov>
      ) : (
        pill
      )}
      <CdpIdentity v={v} />
    </span>
  );
}

export function PolarisPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  explanationDefaultOpen,
  onExplanationToggle,
  viewHref,
  surface = "detail",
}: {
  v: PolarisPositionView;
  receipts?: boolean;
  rowExtra?: React.ReactNode;
  explanation?: React.ReactNode;
  /** Open the Explanation pane on first mount, and hear about every toggle —
   *  both forwarded straight to the shell. The detail page passes a stored
   *  per-CDP flag through them (hooks/usePolarisUiState.ts); the listing
   *  render passes neither, and the pane keeps its closed default. */
  explanationDefaultOpen?: boolean;
  onExplanationToggle?: (open: boolean) => void;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Listing cards carry the lifecycle pill (green OPEN); the detail page the
   *  neutral mode word. Terminal states keep their pills on both. */
  surface?: "listing" | "detail";
}) {
  const st = STATUS[v.status] ?? STATUS.open;
  const stable = v.stableSymbol;

  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        rowExtra={rowExtra}
        explanation={explanation}
        explanationDefaultOpen={explanationDefaultOpen}
        onExplanationToggle={onExplanationToggle}
        viewHref={viewHref}
        learnMore={polarisPositionContent({ status: v.status })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={<IdentityLead v={v} />}
          identity={<MetaCluster v={v} />}
          closedAt={v.lastActivityAt ?? undefined}
          collateral={
            v.peakColl > 0 ? (
              <StatValue>
                <Prov info={peakProv("coll", v.market)}>
                  <AssetAmount value={v.peakColl} symbol={PETH.symbol} address={PETH.address} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            v.peakDebt > 0 ? (
              <StatValue>
                <Prov info={peakProv("debt", v.market)}>
                  <AssetAmount
                    value={v.peakDebt}
                    symbol={stable}
                    address={POLARIS_MARKET_CONFIG[v.market].stable.address}
                  />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debtLabel={CARD_VOCAB.peakDebt}
        />
      </PositionCardShell>
    );
  }

  const mcrInForce = v.mcr;
  const belowMin = v.icr != null && mcrInForce != null && v.icr < mcrInForce;

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      explanationDefaultOpen={explanationDefaultOpen}
      onExplanationToggle={onExplanationToggle}
      viewHref={viewHref}
      learnMore={polarisPositionContent({ status: "open" })}
    >
      <OpenPositionStats
        statusPill={
          surface === "detail" ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {v.debt > 0 ? "Borrowing" : "Collateral only"}
            </span>
          ) : (
            <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}>{st.label}</span>
          )
        }
        leadingIdentity={<IdentityLead v={v} />}
        identity={<MetaCluster v={v} />}
        columns={[
          {
            label: CARD_VOCAB.collateral,
            value:
              v.coll > 0 ? (
                <StatValue>
                  <Prov info={collProv(v)}>
                    <AssetAmount
                      value={v.coll}
                      symbol={PETH.symbol}
                      address={PETH.address}
                      exact={v.collRaw != null ? formatUnitsExact(v.collRaw, 18) : undefined}
                    />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote:
              v.collUsd != null && v.collUsd > 0 ? (
                <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
                  <Prov info={liveUsdValueProv("Collateral", v.basis === "index")} value={formatUsdValue(v.collUsd)}>
                    <span>{formatUsdValue(v.collUsd)}</span>
                  </Prov>{" "}
                  <span className="text-rb-400">by the protocol&rsquo;s feed · testnet</span>
                </div>
              ) : v.pendingReward != null && v.pendingReward > 0 ? (
                <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
                  <Prov info={livePendingProv("bcTokenGain", v.market)}>
                    <span>{formatNumber(v.pendingReward)} pETH</span>
                  </Prov>{" "}
                  reward pending
                </div>
              ) : v.pricePending && v.coll > 0 ? (
                // The USD value needs the same price read the ratio does, so
                // it holds a pulse rather than nothing while that is in
                // flight — otherwise the footnote appears from nowhere a
                // second after the collateral figure.
                <div className="text-xs mt-0.5">
                  <span className="inline-block h-3 w-32 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
                </div>
              ) : undefined,
          },
          {
            label: CARD_VOCAB.debt,
            value:
              v.debt > 0 ? (
                <StatValue>
                  <Prov info={debtProv(v)}>
                    <AssetAmount
                      value={v.debt}
                      symbol={stable}
                      address={POLARIS_MARKET_CONFIG[v.market].stable.address}
                      exact={v.debtRaw != null ? formatUnitsExact(v.debtRaw, 18) : undefined}
                    />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: (
              <>
                {v.pendingInterest != null && v.pendingInterest > 0 && (
                  <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
                    <Prov info={livePendingProv("accruedInterest", v.market)}>
                      <span>
                        {formatNumber(v.pendingInterest)} {stable}
                      </span>
                    </Prov>{" "}
                    interest pending
                  </div>
                )}
                {v.interestRate != null ? (
                  <div className="text-xs mt-0.5 text-rb-500">
                    <Prov info={liveRateProv("combined", v.market, v.basis === "index")}>
                      <span>{(v.interestRate * 100).toFixed(2)}%</span>
                    </Prov>{" "}
                    per year, set by the market
                  </div>
                ) : v.pricePending && v.debt > 0 ? (
                  // The rate comes off the same read; a debt column that
                  // states no rate at all for a second reads as a market that
                  // charges none.
                  <div className="text-xs mt-0.5">
                    <span className="inline-block h-3 w-36 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
                  </div>
                ) : null}
              </>
            ),
          },
          {
            label: ratioLabel("cdp"),
            value:
              v.icr != null ? (
                <StatValue figure="collateral-ratio">
                  {v.basis === "index" ? (
                    // The index lane's ratio is an approximation and wears the
                    // ≈: the receipt says where the two legs come from, the
                    // tooltip what the figure is and is not.
                    <Prov info={listingIcrProv(v.market)} value={`≈ ${pct(v.icr)}`}>
                      <RevealTip tip={<span className={TIP_PROSE}>{LISTING_ICR_TIP}</span>}>
                        <span className={belowMin ? "text-red-500" : undefined}>
                          {"≈"}&nbsp;{pct(v.icr)}
                        </span>
                      </RevealTip>
                    </Prov>
                  ) : (
                    <Prov info={liveIcrProv(v.market)} value={pct(v.icr)}>
                      <span className={belowMin ? "text-red-500" : undefined}>{pct(v.icr)}</span>
                    </Prov>
                  )}
                </StatValue>
              ) : v.pricePending && v.debt > 0 ? (
                <div className="h-9 w-20 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse mt-2" />
              ) : (
                <StatDash />
              ),
            footnote:
              mcrInForce != null ? (
                <StatFootnote>
                  <span className="inline-flex flex-wrap items-center gap-x-1">
                    <span>
                      <Prov info={liveMcrProv(v.defensiveMode, v.market, v.basis === "index")} value={pct(mcrInForce)}>
                        <span>min {pct(mcrInForce)}</span>
                      </Prov>
                      {v.defensiveMode ? " · defensive mode" : ""}
                    </span>
                    {v.liqPrice != null && (
                      // The ratio's tangible restatement — the price at which
                      // the stated figures reach the floor, in the market's
                      // own unit (USDp or a troy ounce of gold), never "$".
                      <span className="inline-flex items-center gap-1">
                        <span className="text-rb-400">·</span> Liquidates at
                        <TokenChipIcon symbol={PETH.symbol} address={PETH.address} size={14} filterable={false} />
                        <Prov
                          info={listingLiqPriceProv(v.defensiveMode, v.market)}
                          value={formatPethPrice(v.liqPrice)}
                          symbol={stable}
                        >
                          <span className="tabular-nums">
                            {formatPethPrice(v.liqPrice)} {stable}
                          </span>
                        </Prov>
                      </span>
                    )}
                  </span>
                </StatFootnote>
              ) : v.pricePending && v.debt > 0 ? (
                <div className="text-xs mt-0.5">
                  <span className="inline-block h-3 w-24 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
                </div>
              ) : undefined,
          },
          // A genuinely 4th column, only for the chain lane's open CDPs with a
          // feed price — an array of 3 (never a null-padded 4th slot) so a
          // card without it keeps the exact 3-column layout it always had,
          // mobile spanning included.
          ...(v.basis === "chain" && v.equity != null && v.coll > 0
            ? [
                {
                  label: "Equity at the feed",
                  value: (
                    <StatValue>
                      <Prov info={liveEquityProv(v.market)}>
                        <AssetAmount
                          value={v.equity}
                          symbol={stable}
                          address={POLARIS_MARKET_CONFIG[v.market].stable.address}
                          signed
                        />
                      </Prov>
                    </StatValue>
                  ),
                  footnote: <div className="text-xs mt-0.5 text-rb-500">by the protocol&rsquo;s feed · testnet</div>,
                },
              ]
            : []),
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row (the index).
 *
 *  `markets` is the listing's ONE market-board read for the whole page (the
 *  Liquity V2 pattern: side-fetched once on mount, never per row). Given it,
 *  the row can state a ratio, the floor in force, the price that floor is
 *  reached at, the rate the market charges and the collateral's value — all
 *  on the row's own last emitted figures, so all approximate, and the card
 *  marks the ratio as such. `pending` says the read is still in flight, which
 *  is a pulse rather than a dash. */
export function viewFromSummary(
  s: PolarisPositionSummary,
  markets?: PolarisMarketsChainResponse | null,
  pending = false,
): PolarisPositionView {
  const board = markets && !markets.chainStale ? markets.markets.find((m) => m.market === s.market) : undefined;
  const mcrInForce = board ? (board.defensiveMode ? board.defensiveMcr : board.mcr) : null;
  const priced = board != null && s.coll > 0 && s.debt > 0;
  return {
    market: s.market,
    cdpId: s.cdpId,
    stableSymbol: s.stableSymbol,
    // A timeline-derived summary of a never-transferred, burned CDP has no
    // holder to name — null, never an empty pill.
    owner: s.owner || null,
    status: s.status,
    liquidated: s.liquidated,
    coll: s.coll,
    collRaw: s.collRaw,
    debt: s.debt,
    debtRaw: s.debtRaw,
    collUsd: board && s.coll > 0 ? s.coll * board.price.pethUsd : null,
    equity: null,
    icr: priced && board ? (s.coll * board.price.pethInDebt) / s.debt : null,
    mcr: mcrInForce,
    defensiveMode: board?.defensiveMode ?? false,
    liqPrice: priced && mcrInForce != null ? (s.debt * mcrInForce) / s.coll : null,
    pricePending: pending,
    pendingInterest: null,
    pendingStables: null,
    pendingReward: null,
    interestRate: board?.interestRate ?? null,
    peakColl: s.peakColl,
    peakDebt: s.peakDebt,
    lastActivityAt: s.lastTs,
    eventCount: s.eventCount,
    liqCount: s.liqCount,
    transferCount: s.transferCount,
    basis: "index",
    blockNumber: s.lastBlock,
  };
}

/** Build a card view from the live overlay — the detail page's primary
 *  truth. The lifecycle can only say what head state shows: an open CDP, or a
 *  burned one (closed or liquidated — which of the two is an indexed fact and
 *  arrives by merge; alone, the burn reads "closed"). */
export function viewFromChain(c: PolarisChainResponse): PolarisPositionView {
  return {
    market: c.market,
    cdpId: c.cdpId,
    stableSymbol: POLARIS_MARKET_CONFIG[c.market].stable.symbol,
    owner: c.owner,
    status: c.isOpen ? "open" : "closed",
    liquidated: false,
    coll: c.entireColl,
    collRaw: c.entireCollRaw,
    debt: c.entireDebt,
    debtRaw: c.entireDebtRaw,
    collUsd: c.price ? c.entireColl * c.price.pethUsd : null,
    equity: c.price ? c.entireColl * c.price.pethInDebt - c.entireDebt : null,
    icr: c.icr,
    mcr: c.defensiveMode ? c.defensiveMcr : c.mcr,
    defensiveMode: c.defensiveMode,
    // The chain lane states the contract's own ratio against the floor; the
    // liquidation price is the LISTING's restatement of an approximation, and
    // does not follow the figure it is derived from onto this lane.
    liqPrice: null,
    pricePending: false,
    pendingInterest: c.accruedInterest,
    pendingStables: c.accruedStables,
    pendingReward: c.bcTokenGain,
    interestRate: c.interestRate,
    peakColl: 0,
    peakDebt: 0,
    lastActivityAt: c.lastTouchTime > 0 ? c.lastTouchTime : null,
    eventCount: 0,
    liqCount: 0,
    transferCount: 0,
    basis: "chain",
    blockNumber: c.blockNumber,
  };
}

/** Merge the indexed summary into a chain-first view: the chain keeps every
 *  head figure; the index contributes what head state cannot say — which
 *  terminal state a burned CDP reached, the peaks, the counts, the last
 *  holder. Apart from the terminal word, the chain's lifecycle wins. */
export function mergeChainAndSummary(chain: PolarisPositionView, summary: PolarisPositionSummary): PolarisPositionView {
  return {
    ...chain,
    owner: chain.owner ?? (summary.owner || null),
    status: chain.status === "open" ? "open" : summary.status === "liquidated" ? "liquidated" : "closed",
    liquidated: summary.liquidated,
    peakColl: summary.peakColl,
    peakDebt: summary.peakDebt,
    lastActivityAt: summary.lastTs || chain.lastActivityAt,
    eventCount: summary.eventCount,
    liqCount: summary.liqCount,
    transferCount: summary.transferCount,
  };
}
