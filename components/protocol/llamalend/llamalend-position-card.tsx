"use client";

// LlamaLend position card — one (controller, user) pair, through the SAME
// shared grammar (OpenPositionStats + StatValue) as the other explorers.
//
// THE GRAIN IS THE PAIR: the card is one position in one isolated market,
// never a user — controllers liquidate independently, and one card per user
// would assert a single health across markets that share nothing. The
// identity row carries the user AND the market (collateral / borrowed pair,
// version-tagged), because both halves are the key.
//
// ⇒ SOFT-LIQUIDATION LEADS. When the live overlay says the AMM has already
// converted part of this position's collateral (user_state.stablecoin > 0 —
// a state-only figure no event carries), the card grows a third column:
// the converted amount, traced to the two-contract cross-check. No risk
// color anywhere — the numbers carry the meaning.
//
// ⚠️ USD only where the borrowed token IS crvUSD (~$1): debt is already in
// crvUSD, collateral through the AMM's own price_oracle. The handful of
// markets that borrow WETH / tBTC / ynETH / CRV render in their own tokens —
// the token stack IS the headline there, and no dollar is asserted.
//
// STATUS IS TWO-AXIS. The lifecycle pill says open/closed/liquidated, where
// 'liquidated' names only a CLOSED position; an OPEN survivor stays an OPEN
// card with the meta cluster's count. The detail render swaps the lifecycle
// pill for the mode word.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { positionStateProv, positionIndexProv, llamalendUsdProv } from "@/lib/llamalend/event-provenance";
import { llamalendConvertedProv } from "@/lib/llamalend/live-provenance";
import { llamalendPositionContent } from "@/lib/llamalend/position-content";
import { type LlamalendVersion } from "@/lib/llamalend/asset-catalog";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import type { LlamalendPositionSummary } from "@/lib/sources/api/llamalend-positions";

export interface LlamalendPositionView {
  /** The isolated market's key. */
  controller: string;
  user: string;
  amm: string | null;
  version: LlamalendVersion;
  /** "wstETH / crvUSD" — display; the controller address is the key. */
  marketLabel: string;
  collateralSymbol: string;
  collateralDecimals: number;
  borrowedSymbol: string;
  borrowedDecimals: number;
  borrowedIsCrvusd: boolean;
  status: "open" | "closed" | "liquidated";
  /** The orthogonal hard-liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  liquidationCount: number;
  /** Collateral still held as collateral (collateral-token units).
   *  ⚠️ NULL = the chain did not state it (the deployed controller's
   *  sentinel path, NULLed backend-side) — rendered "unstated", never 0. */
  collateral: number | null;
  collateralRaw: string | null;
  /** Debt (borrowed-token units). */
  debt: number;
  debtRaw: string;
  /** "chain" = live user_state at head; "index" = last emitted absolute. */
  stateBasis: "chain" | "index";
  /** Converted amount (borrowed units) — soft-liq NOW. Null = unknown (the
   *  overlay didn't land), never zero. */
  converted: number | null;
  convertedRaw: string | null;
  inSoftLiq: boolean | null;
  /** Whether the AMM's own statement of `converted` matched the Controller's at
   *  this read. Travels on the LIVE overlay only — the listing summary row
   *  carries no such field, so it is absent there and the converted receipt
   *  (inert without a receipts scope anyway) says the second answer didn't
   *  land. */
  convertedCrossCheckExact?: boolean | null;
  /** AMM.price_oracle at head — borrowed per collateral. */
  priceOracle: number | null;
  collateralUsd: number | null;
  debtUsd: number | null;
  eventCount: number;
  txCount: number;
  lastActivityAt: number;
}

const stateProv = (v: LlamalendPositionView, sym: string, which: "collateral" | "debt") =>
  v.stateBasis === "chain" ? positionStateProv(sym, which, v.controller) : positionIndexProv(sym, which, v.controller);

/** The position + market identity: whose position, in which isolated market. */
function PositionIdentity({ v }: { v: LlamalendPositionView }) {
  return (
    <span className="flex items-center gap-2">
      <WalletPill wallet={v.user} ensName={null} filterProtocol="llamalend" bookmarkProtocol="llamalend" />
      <span className="text-xs text-rb-500">
        {v.marketLabel}
        {v.version === "v2" && <span className="ml-1 rounded-sm bg-rb-300 px-1 text-[10px] dark:bg-rb-700">V2</span>}
      </span>
    </span>
  );
}

export function LlamalendPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  bodyExtra,
  viewHref,
}: {
  v: LlamalendPositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** The band strip — LlamaLend's one protocol-specific CARD-BODY element,
   *  rendered below the stats on an OPEN position only (a closed position's
   *  band is meaningless: the stored ticks go stale there). It sits inside the
   *  shell's children on purpose — that is what puts its <Prov> figures inside
   *  the card's receipts scope. The detail page is the only caller; the listing
   *  row never passes it. */
  bodyExtra?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell` —
   *  the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  // Closed / liquidated: the last emitted absolutes are back at zero, so the
  // card states the outcome and its metadata (no USD: the oracle prices the
  // PRESENT, not history). The LIQUIDATED outcome appears only here: an open
  // survivor never reaches this branch.
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={llamalendPositionContent({ status: v.status })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={<PositionIdentity v={v} />}
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          // The values below are the LAST emitted absolutes (usually zero on
          // an unwound position) — never claim the shared default "Highest
          // recorded": the API carries no peak figures.
          collateralLabel={CARD_VOCAB.finalCollateral}
          debtLabel={CARD_VOCAB.finalDebt}
          collateral={
            v.collateral != null && v.collateral > 0 ? (
              <StatValue>
                <AssetAmount value={v.collateral} symbol={v.collateralSymbol} exact="last emitted absolute" />
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            v.debt > 0 ? (
              <StatValue>
                <AssetAmount value={v.debt} symbol={v.borrowedSymbol} exact="last emitted absolute" />
              </StatValue>
            ) : (
              <StatDash />
            )
          }
        />
      </PositionCardShell>
    );
  }

  const collUsd = v.collateralUsd;
  const debtUsd = v.debtUsd;

  const collateralFootnote =
    collUsd != null && v.collateral != null && v.collateral > 0 ? (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        <Prov info={stateProv(v, v.collateralSymbol, "collateral")}>
          <span title={v.collateralRaw != null ? formatUnitsExact(v.collateralRaw, v.collateralDecimals) : undefined}>
            {formatCompact(v.collateral)} {v.collateralSymbol}
          </span>
        </Prov>
      </div>
    ) : undefined;

  const columns = [
    {
      label: CARD_VOCAB.collateral,
      // The cluster rides the USD headline only: the AssetAmount fallback
      // already carries the ticker as its glyph, and a one-symbol cluster
      // beside it drew the icon twice on every non-crvUSD market.
      assetIcons:
        collUsd != null && v.collateral != null && v.collateral > 0 ? (
          <InlineAssetCluster symbols={[v.collateralSymbol]} />
        ) : undefined,
      value:
        collUsd != null && v.collateral != null && v.collateral > 0 ? (
          <UsdHeadline usd={collUsd} info={llamalendUsdProv("Collateral", v.borrowedSymbol, v.amm ?? undefined)} />
        ) : v.collateral != null && v.collateral > 0 ? (
          // StatValue OUTSIDE, Prov inside (the UsdHeadline nesting) — an
          // inline Prov wrapping the block StatValue grows empty line struts
          // above and below the value (~48px per column).
          <StatValue>
            <Prov info={stateProv(v, v.collateralSymbol, "collateral")}>
              <AssetAmount
                value={v.collateral}
                symbol={v.collateralSymbol}
                exact={v.collateralRaw != null ? formatUnitsExact(v.collateralRaw, v.collateralDecimals) : undefined}
              />
            </Prov>
          </StatValue>
        ) : v.collateral == null ? (
          // ⚠️ The chain did not state this figure (the deployed controller's
          // sentinel path) — unstated, never zero. The live read repairs it.
          <StatValue>
            <span
              className="text-xs text-rb-500"
              title="The last emitted UserState carried the controller's 2^256−1 sentinel here — the chain did not state the figure; the live read on the position page carries the current one."
            >
              unstated
            </span>
          </StatValue>
        ) : v.converted != null && v.converted > 0 ? (
          // Everything is converted — the band is fully crossed; the
          // converted column beside this one carries the whole holding.
          <StatValue>
            <span className="text-xs text-rb-500">fully converted</span>
          </StatValue>
        ) : (
          <StatDash />
        ),
      footnote: collateralFootnote,
    },
    {
      label: CARD_VOCAB.debt,
      assetIcons: debtUsd != null && v.debt > 0 ? <InlineAssetCluster symbols={[v.borrowedSymbol]} /> : undefined,
      value:
        debtUsd != null && v.debt > 0 ? (
          <UsdHeadline usd={debtUsd} info={llamalendUsdProv("Borrowed", v.borrowedSymbol, v.amm ?? undefined)} />
        ) : v.debt > 0 ? (
          <StatValue>
            <Prov info={stateProv(v, v.borrowedSymbol, "debt")}>
              <AssetAmount
                value={v.debt}
                symbol={v.borrowedSymbol}
                exact={formatUnitsExact(v.debtRaw, v.borrowedDecimals)}
              />
            </Prov>
          </StatValue>
        ) : (
          <StatDash />
        ),
      footnote:
        debtUsd != null && v.debt > 0 ? (
          <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
            <Prov info={stateProv(v, v.borrowedSymbol, "debt")}>
              <span title={formatUnitsExact(v.debtRaw, v.borrowedDecimals)}>
                {formatCompact(v.debt)} {v.borrowedSymbol}
              </span>
            </Prov>
          </div>
        ) : undefined,
    },
    // ⇒ The distinctive column — present the moment the live overlay says the
    // AMM has converted anything: the position is in soft-liquidation NOW.
    ...(v.inSoftLiq && v.converted != null
      ? [
          {
            label: "In soft-liquidation",
            value: (
              <StatValue>
                <Prov
                  info={llamalendConvertedProv(
                    v.borrowedSymbol,
                    v.convertedCrossCheckExact ?? null,
                    v.controller,
                    v.amm ?? undefined,
                  )}
                >
                  <AssetAmount
                    value={v.converted}
                    symbol={v.borrowedSymbol}
                    exact={v.convertedRaw != null ? formatUnitsExact(v.convertedRaw, v.borrowedDecimals) : undefined}
                  />
                </Prov>
              </StatValue>
            ),
            footnote: (
              <div className="text-xs mt-0.5 text-rb-500">
                collateral the AMM has already converted — read live, cross-checked
              </div>
            ),
          },
        ]
      : []),
  ];

  // Detail render (receipts): a neutral mode-word pill — what the position is
  // doing NOW. The LISTING render keeps the lifecycle pill.
  const modeWord = v.inSoftLiq ? "In soft-liquidation" : "Borrowing";

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={llamalendPositionContent({ status: v.status, inSoftLiq: v.inSoftLiq ?? undefined })}
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
        leadingIdentity={<PositionIdentity v={v} />}
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            liquidationCount={v.liquidationCount}
          />
        }
        columns={columns}
      />
      {bodyExtra && <div className="mt-3 border-t border-rb-300/40 pt-3 dark:border-rb-700/40">{bodyExtra}</div>}
    </PositionCardShell>
  );
}

/** Build a card view from the LIVE chain read alone — the degrade path while
 *  the index is unavailable (or hasn't caught this position yet): every
 *  figure is a head-block eth_call, so the card renders chain-state-first
 *  with empty history metadata (0 counts, no timestamp — the meta cluster
 *  simply omits them; nothing is fabricated). */
export function viewFromChain(
  c: import("@/lib/api/fetch-llamalend-position").LlamalendChainResponse,
): LlamalendPositionView {
  return {
    controller: c.controller,
    user: c.user,
    amm: c.amm || null,
    version: c.version,
    marketLabel: `${c.collateralSymbol} / ${c.borrowedSymbol}`,
    collateralSymbol: c.collateralSymbol,
    collateralDecimals: c.collateralDecimals,
    borrowedSymbol: c.borrowedSymbol,
    borrowedDecimals: c.borrowedDecimals,
    borrowedIsCrvusd: c.borrowedIsCrvusd,
    status: "open",
    everLiquidated: false,
    liquidationCount: 0,
    collateral: c.collateral ?? 0,
    collateralRaw: c.collateralRaw ?? "0",
    debt: c.debt ?? 0,
    debtRaw: c.debtRaw ?? "0",
    stateBasis: "chain",
    converted: c.converted,
    convertedRaw: c.convertedRaw,
    inSoftLiq: c.inSoftLiq,
    convertedCrossCheckExact: c.convertedCrossCheckExact,
    priceOracle: c.priceOracle,
    collateralUsd:
      c.borrowedIsCrvusd && c.priceOracle != null && c.collateral != null ? c.collateral * c.priceOracle : null,
    debtUsd: c.borrowedIsCrvusd && c.debt != null ? c.debt : null,
    eventCount: 0,
    txCount: 0,
    lastActivityAt: 0,
  };
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: LlamalendPositionSummary): LlamalendPositionView {
  return {
    controller: s.controller,
    user: s.user,
    amm: s.amm,
    version: s.version,
    marketLabel: s.marketLabel,
    collateralSymbol: s.collateralSymbol,
    collateralDecimals: s.collateralDecimals,
    borrowedSymbol: s.borrowedSymbol,
    borrowedDecimals: s.borrowedDecimals,
    borrowedIsCrvusd: s.borrowedIsCrvusd,
    status: s.status,
    everLiquidated: s.everLiquidated,
    liquidationCount: s.liquidationCount,
    collateral: s.collateral,
    collateralRaw: s.collateralRaw,
    debt: s.debt,
    debtRaw: s.debtRaw,
    stateBasis: s.stateBasis,
    converted: s.converted,
    convertedRaw: s.convertedRaw,
    inSoftLiq: s.inSoftLiq,
    priceOracle: s.priceOracle,
    collateralUsd: s.collateralUsd,
    debtUsd: s.debtUsd,
    eventCount: s.eventCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
  };
}
